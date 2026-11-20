"""Parking on a room Lease (DL-253, parking step 3b).

A room Lease that holds a parking Service picks a parking space (and a vehicle of someone on the
Lease). The owner's rule of 20 Nov 2026: the tenant pays the price of the space picked, on the same
Rent Invoice; the price is copied when the space is picked and never changes after.

A Parking agreement (DL-254, parking step 4b) is a Lease on the parking space itself; on its
draft staff pick the vehicle that parks there.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Final, Protocol, TypeVar
from uuid import UUID, uuid4

import psycopg
from fastapi import APIRouter, HTTPException, Request, Response, status
from pydantic import BaseModel, ConfigDict

from property_rental.api_refusals import Refusal, RefusedRequest
from property_rental.browser_security import require_browser_mutation
from property_rental.identity import (
    ActorResolver,
    AuthenticatedActor,
    AuthorizationRequirement,
    is_authorized,
)
from property_rental.settings import Settings

LEASE_READ_CAPABILITY: Final = "leases.read"
LEASE_DRAFT_CAPABILITY: Final = "leases.draft"
_T = TypeVar("_T")
_MESSAGES: Final = {
    "PARKING_ALREADY_HELD": "This parking already has a space.",
    "PARKING_SPACE_TAKEN": "Another vehicle holds this space on these days.",
    "VEHICLE_TYPE": "This vehicle cannot park in this Parking Type.",
    "VEHICLE_NOT_OF_LEASE": "The vehicle belongs to nobody on this Lease.",
    "PARKING_KEPT_FOR_GUESTS": "This space is kept for short-stay guests.",
    "TYPE_HAS_NO_PRICE": "This space has no price. Set the Parking Type price first.",
    "LEASE_CLOSED": "Only a drafted or signed Lease takes a parking space.",
    "AGREEMENT_DATES_MISSING": "Add the start date first (Edit draft).",
}


class LeaseParkingNotFound(LookupError):
    """The Lease or its parking Service is not there."""


class LeaseParkingUnavailable(RuntimeError):
    """Parking persistence cannot be reached."""


class LeaseParkingConflict(RuntimeError):
    """The space cannot be picked; `code` names the refusal the screen explains."""

    def __init__(self, message: str, code: str) -> None:
        super().__init__(message)
        self.code = code


class LeaseParkingFlow(Protocol):
    def lease_property(self, lease_id: UUID) -> UUID: ...

    def read(self, lease_id: UUID) -> dict[str, object]: ...

    def hold(
        self,
        lease_id: UUID,
        *,
        term_id: UUID,
        space_unit_id: UUID,
        vehicle_id: UUID | None,
        actor_id: str,
    ) -> dict[str, object]: ...

    def pick_vehicle(
        self, lease_id: UUID, *, vehicle_id: UUID, actor_id: str
    ) -> dict[str, object]: ...


class UnavailableLeaseParkingFlow:
    """Used when the app has no database."""

    def lease_property(self, lease_id: UUID) -> UUID:
        del lease_id
        raise LeaseParkingUnavailable("Parking persistence is not configured")

    def read(self, lease_id: UUID) -> dict[str, object]:
        del lease_id
        raise LeaseParkingUnavailable("Parking persistence is not configured")

    def hold(self, lease_id: UUID, **_: object) -> dict[str, object]:
        del lease_id
        raise LeaseParkingUnavailable("Parking persistence is not configured")

    def pick_vehicle(self, lease_id: UUID, **_: object) -> dict[str, object]:
        del lease_id
        raise LeaseParkingUnavailable("Parking persistence is not configured")


class PostgresLeaseParkingFlow:
    """Runs `app.lease_parking`, `app.hold_room_parking_space` (migration 440) and
    `app.hold_parking_agreement_space` (migration 441)."""

    def __init__(self, database_url: str) -> None:
        self._database_url = database_url

    def lease_property(self, lease_id: UUID) -> UUID:
        try:
            with psycopg.connect(self._database_url) as connection:
                row = connection.execute(
                    "SELECT unit.property_id FROM app.leases AS lease "
                    "JOIN app.units AS unit ON unit.id = lease.unit_id WHERE lease.id = %s",
                    (lease_id,),
                ).fetchone()
        except psycopg.Error as exc:
            raise LeaseParkingUnavailable("Leases are unavailable") from exc
        if row is None:
            raise LeaseParkingNotFound("Lease was not found")
        return UUID(str(row[0]))

    def read(self, lease_id: UUID) -> dict[str, object]:
        try:
            with psycopg.connect(self._database_url) as connection:
                row = connection.execute("SELECT app.lease_parking(%s)", (lease_id,)).fetchone()
        except psycopg.Error as exc:
            raise LeaseParkingUnavailable("Parking is unavailable") from exc
        if row is None or not isinstance(row[0], dict):
            raise LeaseParkingNotFound("Lease was not found")
        return row[0]

    def hold(
        self,
        lease_id: UUID,
        *,
        term_id: UUID,
        space_unit_id: UUID,
        vehicle_id: UUID | None,
        actor_id: str,
    ) -> dict[str, object]:
        try:
            with psycopg.connect(self._database_url) as connection:
                row = connection.execute(
                    "SELECT app.hold_room_parking_space(%s, %s, %s, %s, %s, %s)",
                    (uuid4(), lease_id, term_id, space_unit_id, vehicle_id, UUID(actor_id)),
                ).fetchone()
        except psycopg.errors.NoDataFound as exc:
            raise LeaseParkingNotFound("Lease or parking Service was not found") from exc
        except psycopg.Error as exc:
            hint = exc.diag.message_hint
            if hint:
                raise LeaseParkingConflict("The space cannot be picked", str(hint)) from exc
            raise LeaseParkingUnavailable("Parking is unavailable") from exc
        if row is None or not isinstance(row[0], dict):
            raise LeaseParkingUnavailable("Parking is unavailable")
        return row[0]

    def pick_vehicle(self, lease_id: UUID, *, vehicle_id: UUID, actor_id: str) -> dict[str, object]:
        try:
            with psycopg.connect(self._database_url) as connection:
                row = connection.execute(
                    "SELECT app.hold_parking_agreement_space(%s, %s, %s, %s)",
                    (uuid4(), lease_id, vehicle_id, UUID(actor_id)),
                ).fetchone()
        except psycopg.errors.NoDataFound as exc:
            raise LeaseParkingNotFound("Parking agreement was not found") from exc
        except psycopg.Error as exc:
            hint = exc.diag.message_hint
            if hint:
                raise LeaseParkingConflict("The vehicle cannot be picked", str(hint)) from exc
            raise LeaseParkingUnavailable("Parking is unavailable") from exc
        if row is None or not isinstance(row[0], dict):
            raise LeaseParkingUnavailable("Parking is unavailable")
        return row[0]


class HoldBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    lease_service_term_id: UUID
    space_unit_id: UUID
    vehicle_id: UUID | None = None


class VehicleBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    vehicle_id: UUID


def _allowed(actor: AuthenticatedActor, capability: str, property_id: UUID) -> bool:
    return is_authorized(
        actor, AuthorizationRequirement(capability=capability, property_id=str(property_id))
    )


def create_lease_parking_router(
    resolver: ActorResolver, flow: LeaseParkingFlow, settings: Settings
) -> APIRouter:
    """The Parking card of a Lease: read it and pick a space."""
    router = APIRouter(tags=["parking"])

    def actor_of(request: Request) -> AuthenticatedActor:
        actor = resolver(request)
        if actor is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)
        return actor

    def run(call: Callable[[], _T]) -> _T:
        try:
            return call()
        except LeaseParkingNotFound as exc:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND) from exc
        except LeaseParkingConflict as exc:
            raise RefusedRequest(
                Refusal(
                    status.HTTP_409_CONFLICT,
                    exc.code,
                    _MESSAGES.get(exc.code, "The parking space cannot be picked."),
                    ("DL-253",),
                )
            ) from exc
        except LeaseParkingUnavailable as exc:
            raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE) from exc

    def can_pick(actor: AuthenticatedActor, property_id: UUID) -> bool:
        return _allowed(actor, LEASE_DRAFT_CAPABILITY, property_id)

    def readable(actor: AuthenticatedActor, lease_id: UUID) -> UUID:
        property_id = run(lambda: flow.lease_property(lease_id))
        if not (
            can_pick(actor, property_id) or _allowed(actor, LEASE_READ_CAPABILITY, property_id)
        ):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
        return property_id

    @router.get("/leases/{lease_id}/parking")
    def read_parking(lease_id: UUID, request: Request, response: Response) -> dict[str, object]:
        actor = actor_of(request)
        property_id = readable(actor, lease_id)
        parking = run(lambda: flow.read(lease_id))
        response.headers["Cache-Control"] = "private, no-store"
        return {
            "data": {**parking, "can_pick": can_pick(actor, property_id)},
            "meta": {"request_id": request.state.request_id},
        }

    @router.post("/leases/{lease_id}/parking-holds", status_code=status.HTTP_201_CREATED)
    def pick_space(
        lease_id: UUID, body: HoldBody, request: Request, response: Response
    ) -> dict[str, object]:
        """Pick the space (and vehicle) for a parking Service of the Lease. The space's price
        is copied and never changes after."""
        actor = actor_of(request)
        property_id = readable(actor, lease_id)
        if not can_pick(actor, property_id):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN)
        require_browser_mutation(request, settings)
        hold = run(
            lambda: flow.hold(
                lease_id,
                term_id=body.lease_service_term_id,
                space_unit_id=body.space_unit_id,
                vehicle_id=body.vehicle_id,
                actor_id=actor.actor_id,
            )
        )
        response.headers["Cache-Control"] = "private, no-store"
        return {"data": hold, "meta": {"request_id": request.state.request_id}}

    @router.post("/leases/{lease_id}/agreement-vehicle", status_code=status.HTTP_201_CREATED)
    def pick_vehicle(
        lease_id: UUID, body: VehicleBody, request: Request, response: Response
    ) -> dict[str, object]:
        """DL-254: pick the vehicle that parks in the space of a drafted Parking agreement.
        Picking again replaces the earlier pick."""
        actor = actor_of(request)
        property_id = readable(actor, lease_id)
        if not can_pick(actor, property_id):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN)
        require_browser_mutation(request, settings)
        hold = run(
            lambda: flow.pick_vehicle(lease_id, vehicle_id=body.vehicle_id, actor_id=actor.actor_id)
        )
        response.headers["Cache-Control"] = "private, no-store"
        return {"data": hold, "meta": {"request_id": request.state.request_id}}

    return router
