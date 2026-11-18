"""Reverse a Payment completely in one step (owner decision of 17/11/2026, full test round 1).

Non-database tests: the rights it needs, the refusal of links it does not undo, the order of the
three existing commands on one connection, the keys that make a replay safe, and that a failed
step commits nothing. The commands themselves are covered by their own migration tests.
"""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager
from typing import Any
from uuid import UUID, uuid4

import psycopg
import pytest

from property_rental import payment_full_reversal as module
from property_rental.identity import AuthenticatedActor, CapabilityGrant
from property_rental.payment_allocation import (
    AllocationAuthorizationError,
    AllocationConflictError,
    ReversePaymentCommand,
)
from property_rental.payment_full_reversal import (
    CAPABILITIES,
    PaymentFullReversalService,
    PaymentReversalBlockedError,
    step_key,
)


def actor(prop: UUID, capabilities: tuple[str, ...] = CAPABILITIES) -> AuthenticatedActor:
    return AuthenticatedActor(
        str(uuid4()),
        frozenset({CapabilityGrant(name, frozenset({str(prop)})) for name in capabilities}),
    )


class Links:
    """Stands in for the reversal context: pages of (kind, id)."""

    def __init__(self, pages: list[list[tuple[str, UUID]]]) -> None:
        self.pages = pages
        self.calls = 0

    def get(self, *_args: Any, **_kwargs: Any) -> dict[str, object]:
        items = [{"kind": kind, "id": str(identity)} for kind, identity in self.pages[self.calls]]
        self.calls += 1
        last = self.calls == len(self.pages)
        cursor = f"{'a' * 64}:1:{uuid4()}"
        return {"data": {"items": items}, "next_cursor": None if last else cursor}


class StateChanged(psycopg.Error):
    sqlstate = "P4904"


class Connection:
    def __init__(self, fail_on: str | None) -> None:
        self.statements: list[tuple[str, tuple[object, ...]]] = []
        self.fail_on = fail_on
        self.committed = False

    def execute(self, query: str, parameters: tuple[object, ...] = ()) -> Connection:
        self.statements.append((query, parameters))
        if self.fail_on is not None and self.fail_on in query:
            raise StateChanged("Payment state changed")
        return self

    def fetchone(self) -> tuple[object, ...]:
        return ({"payment_id": "p", "status": "REVERSED"},)


def install(
    monkeypatch: pytest.MonkeyPatch, links: Links, fail_on: str | None = None
) -> Connection:
    connection = Connection(fail_on)
    monkeypatch.setattr(module, "PaymentReversalContextService", lambda _url: links)

    @contextmanager
    def connect(*_args: Any, **_kwargs: Any) -> Iterator[Connection]:
        yield connection  # an exception here leaves the transaction uncommitted
        connection.committed = True

    monkeypatch.setattr(psycopg, "connect", connect)
    return connection


@pytest.mark.parametrize("missing", CAPABILITIES)
def test_full_reversal_needs_all_three_rights(missing: str) -> None:
    prop = uuid4()
    who = actor(prop, tuple(name for name in CAPABILITIES if name != missing))
    with pytest.raises(AllocationAuthorizationError):
        PaymentFullReversalService("unused", "unused").reverse(
            prop, uuid4(), ReversePaymentCommand(uuid4(), "Wrong payment method"), actor=who
        )


def test_full_reversal_reverses_allocations_then_credit_then_payment_in_one_transaction(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    prop, payment, allocation, credit = uuid4(), uuid4(), uuid4(), uuid4()
    links = Links(
        [[("ALLOCATION", allocation), ("ALLOCATION_LINE", uuid4())], [("CREDIT", credit)]]
    )
    connection = install(monkeypatch, links)
    key = uuid4()
    result = PaymentFullReversalService("runtime", "financial").reverse(
        prop, payment, ReversePaymentCommand(key, "Wrong payment method"), actor=actor(prop)
    )
    commands = [query for query, _ in connection.statements if "app.reverse" in query]
    assert [command.split("(")[0] for command in commands] == [
        "SELECT app.reverse_payment_allocation_command",
        "SELECT app.reverse_customer_credit",
        "SELECT app.reverse_payment_command",
    ]
    keys = [parameters[3] for query, parameters in connection.statements if "app.reverse" in query]
    assert keys == [
        step_key(key, "allocation", allocation),
        step_key(key, "credit", credit),
        step_key(key, "payment", payment),
    ]
    assert links.calls == 2
    assert connection.committed
    assert result["reversed_allocation_ids"] == [str(allocation)]
    assert result["reversed_credit_ids"] == [str(credit)]


def test_the_same_request_key_gives_the_same_inner_keys() -> None:
    key, target = uuid4(), uuid4()
    assert step_key(key, "allocation", target) == step_key(key, "allocation", target)
    assert step_key(key, "allocation", target) != step_key(key, "credit", target)
    assert step_key(key, "allocation", target) != step_key(uuid4(), "allocation", target)


@pytest.mark.parametrize(
    "kind", ["CREDIT_APPLICATION", "DEPOSIT_RECEIPT", "DEPOSIT_DISPOSITION", "REFUND"]
)
def test_links_it_does_not_undo_refuse_before_anything_is_written(
    monkeypatch: pytest.MonkeyPatch, kind: str
) -> None:
    prop = uuid4()
    connection = install(monkeypatch, Links([[("ALLOCATION", uuid4()), (kind, uuid4())]]))
    with pytest.raises(PaymentReversalBlockedError) as refused:
        PaymentFullReversalService("runtime", "financial").reverse(
            prop, uuid4(), ReversePaymentCommand(uuid4(), "Wrong payment method"), actor=actor(prop)
        )
    assert refused.value.kinds == (kind,)
    assert connection.statements == []


def test_a_failed_step_commits_nothing(monkeypatch: pytest.MonkeyPatch) -> None:
    prop = uuid4()
    connection = install(
        monkeypatch,
        Links([[("ALLOCATION", uuid4()), ("CREDIT", uuid4())]]),
        fail_on="app.reverse_payment_command",
    )
    with pytest.raises(AllocationConflictError):
        PaymentFullReversalService("runtime", "financial").reverse(
            prop, uuid4(), ReversePaymentCommand(uuid4(), "Wrong payment method"), actor=actor(prop)
        )
    assert not connection.committed


def test_a_payment_it_may_not_read_is_not_found(monkeypatch: pytest.MonkeyPatch) -> None:
    from property_rental.payment_allocation import AllocationNotFoundError
    from property_rental.payment_read import PaymentReadNotFoundError

    class Missing:
        def get(self, *_args: Any, **_kwargs: Any) -> dict[str, object]:
            raise PaymentReadNotFoundError("Payment was not found")

    connection = install(monkeypatch, Links([[]]))
    monkeypatch.setattr(module, "PaymentReversalContextService", lambda _url: Missing())
    prop = uuid4()
    with pytest.raises(AllocationNotFoundError):
        PaymentFullReversalService("runtime", "financial").reverse(
            prop, uuid4(), ReversePaymentCommand(uuid4(), "Wrong payment method"), actor=actor(prop)
        )
    assert connection.statements == []
