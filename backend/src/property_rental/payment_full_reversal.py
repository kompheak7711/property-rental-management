"""Reverse a Payment completely in one step (owner decision of 17/11/2026, full test round 1).

Before this, a person reversed a Payment in three separate commands: each Allocation, then the
Customer Credit made from the money, then the Payment itself. This service runs the same three
existing database commands, in that order, inside one database transaction: either everything
is reversed or nothing is.

It reverses only Allocations and unused Customer Credit. A Payment that also paid a Security
Deposit, whose Credit was already used, or that was refunded is refused before anything is
written; those are undone first through their own screens.

Each inner command gets its own idempotency key, derived from the request's key, the step and
the record, so sending the same request again replays the same records and never reverses
twice.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from uuid import UUID, uuid5

import psycopg

from property_rental.identity import AuthenticatedActor, AuthorizationRequirement, is_authorized
from property_rental.payment_allocation import (
    AllocationAuthorizationError,
    AllocationConflictError,
    AllocationIdempotencyKeyReused,
    AllocationInvalidError,
    AllocationNotFoundError,
    AllocationUnavailableError,
    ReversePaymentCommand,
    _exact_json,
    _uuid,
)
from property_rental.payment_read import (
    PaymentReadAuthorizationError,
    PaymentReadInvalidError,
    PaymentReadNotFoundError,
    PaymentReadUnavailableError,
)
from property_rental.payment_reversal_context import (
    PaymentReversalContextChanged,
    PaymentReversalContextService,
    ReversalContextPage,
)

#: The three rights the three inner commands need.
CAPABILITIES = ("payments.reverse", "payments.allocations.reverse", "credits.reverse")
#: What this command undoes itself. Anything else linked to the Payment refuses it.
HANDLED_KINDS = frozenset({"ALLOCATION", "ALLOCATION_LINE", "CREDIT"})
MAX_CONTEXT_PAGES = 20


class PaymentReversalBlockedError(RuntimeError):
    """The Payment has links this command does not undo; nothing was written."""

    def __init__(self, kinds: tuple[str, ...]) -> None:
        super().__init__("Payment has links that are reversed separately: " + ", ".join(kinds))
        self.kinds = kinds


def _digest(action: str, property_id: UUID, target_id: UUID, payload: str) -> str:
    # The same digest PaymentAllocationService uses for the same command.
    return hashlib.sha256(f"{action}:{property_id}:{target_id}:{payload}".encode()).hexdigest()


def step_key(request_key: UUID, step: str, target: UUID) -> UUID:
    """The idempotency key of one inner command, the same on every replay of the request."""
    return uuid5(request_key, f"full-reversal:{step}:{target}")


def _mapped(exc: psycopg.Error) -> Exception:
    state = exc.sqlstate
    if state in {"P4901", "P0002", "P5101", "P4501"}:
        return AllocationNotFoundError("Payment resource was not found")
    if state in {"P4905", "P5105"}:
        return AllocationIdempotencyKeyReused("Payment idempotency key was reused")
    if state in {"P4506", "42501"}:
        return AllocationAuthorizationError("Payment actor is not authorized")
    if state in {"P4904", "P5104", "P5S01"}:
        return AllocationConflictError("Payment state changed; inspect the current state")
    if state in {"P4902", "P5102"}:
        return AllocationInvalidError("Payment command is invalid")
    # Serialization, timeout and connection failures cannot prove that an earlier transmission
    # of this key did not commit.
    return AllocationUnavailableError("Payment outcome unresolved; replay the same command")


@dataclass(frozen=True, slots=True)
class PaymentFullReversalService:
    database_url: str
    financial_database_url: str

    @staticmethod
    def _authorize(actor: AuthenticatedActor, property_id: UUID) -> UUID:
        _uuid(property_id)
        for capability in CAPABILITIES:
            if not is_authorized(actor, AuthorizationRequirement(capability, str(property_id))):
                raise AllocationAuthorizationError("Payment capability is not authorized")
        try:
            actor_id = UUID(actor.actor_id)
            _uuid(actor_id)
        except (ValueError, TypeError, AttributeError) as exc:
            raise AllocationAuthorizationError("Payment actor identity is invalid") from exc
        return actor_id

    def _links(
        self, property_id: UUID, payment_id: UUID, actor: AuthenticatedActor
    ) -> tuple[list[UUID], list[UUID], tuple[str, ...]]:
        """The active Allocations and Credits of the Payment, and any other kinds linked."""
        reader = PaymentReversalContextService(self.database_url)
        allocations: list[UUID] = []
        credits: list[UUID] = []
        others: set[str] = set()
        cursor: str | None = None
        for _ in range(MAX_CONTEXT_PAGES):
            try:
                page = reader.get(
                    property_id, payment_id, ReversalContextPage("impact", 50, cursor), actor=actor
                )
            except PaymentReadAuthorizationError as exc:
                raise AllocationAuthorizationError("Payment actor is not authorized") from exc
            except PaymentReadNotFoundError as exc:
                raise AllocationNotFoundError("Payment resource was not found") from exc
            except PaymentReadInvalidError as exc:
                raise AllocationInvalidError("Payment command is invalid") from exc
            except PaymentReversalContextChanged as exc:
                raise AllocationConflictError("Payment changed while it was read") from exc
            except PaymentReadUnavailableError as exc:
                raise AllocationUnavailableError("Payment links could not be read") from exc
            data = page["data"]
            items = data.get("items") if isinstance(data, dict) else None
            if not isinstance(items, list):
                raise AllocationUnavailableError("Payment links could not be read")
            for item in items:
                kind = str(item["kind"])
                if kind == "ALLOCATION":
                    allocations.append(UUID(str(item["id"])))
                elif kind == "CREDIT":
                    credits.append(UUID(str(item["id"])))
                elif kind not in HANDLED_KINDS:
                    others.add(kind)
            next_cursor = page["next_cursor"]
            if next_cursor is None:
                return allocations, credits, tuple(sorted(others))
            cursor = str(next_cursor)
        raise AllocationUnavailableError("Payment has too many linked records to list")

    def reverse(
        self,
        property_id: UUID,
        payment_id: UUID,
        command: ReversePaymentCommand,
        *,
        actor: AuthenticatedActor,
    ) -> dict[str, object]:
        actor_id = self._authorize(actor, property_id)
        _uuid(payment_id)
        command = ReversePaymentCommand(
            command.idempotency_key, command.reason, command.expected_status
        )
        allocations, credits, others = self._links(property_id, payment_id, actor)
        if others:
            raise PaymentReversalBlockedError(others)
        reason_json = _exact_json({"reason": command.reason})
        try:
            # One connection, one transaction: it commits only when every command succeeded.
            with psycopg.connect(self.financial_database_url, connect_timeout=3) as connection:
                connection.execute("SET LOCAL lock_timeout='3000ms'")
                connection.execute("SET LOCAL statement_timeout='15000ms'")
                for allocation_id in allocations:
                    connection.execute(
                        "SELECT app.reverse_payment_allocation_command(%s,%s,%s,%s,%s,%s)",
                        (
                            property_id,
                            allocation_id,
                            actor_id,
                            step_key(command.idempotency_key, "allocation", allocation_id),
                            _digest("REVERSE_ALLOCATION", property_id, allocation_id, reason_json),
                            command.reason,
                        ),
                    )
                for credit_id in credits:
                    connection.execute(
                        "SELECT app.reverse_customer_credit(%s,%s,%s,%s,%s)",
                        (
                            property_id,
                            credit_id,
                            actor_id,
                            step_key(command.idempotency_key, "credit", credit_id),
                            command.reason,
                        ),
                    )
                row = connection.execute(
                    "SELECT app.reverse_payment_command(%s,%s,%s,%s,%s,%s,%s)",
                    (
                        property_id,
                        payment_id,
                        actor_id,
                        step_key(command.idempotency_key, "payment", payment_id),
                        _digest(
                            "REVERSE_PAYMENT",
                            property_id,
                            payment_id,
                            _exact_json(
                                {
                                    "reason": command.reason,
                                    "expected_status": command.expected_status,
                                }
                            ),
                        ),
                        command.expected_status,
                        command.reason,
                    ),
                ).fetchone()
        except psycopg.Error as exc:
            raise _mapped(exc) from exc
        if row is None or not isinstance(row[0], dict):
            raise AllocationNotFoundError("Payment resource was not found")
        return {
            "payment_reversal": row[0],
            "reversed_allocation_ids": [str(value) for value in allocations],
            "reversed_credit_ids": [str(value) for value in credits],
        }
