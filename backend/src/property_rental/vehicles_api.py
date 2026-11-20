"""Vehicles of a Customer (DL-253, parking step 3).

A vehicle is kept under a Customer: its type, plate as typed, colour, brand and model, and an
optional sticker number. It is corrected, never deleted. The Customer page lists the vehicles with
the space each one holds today; Add and Edit need Customers manage access.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from enum import StrEnum
from typing import Final, Protocol, TypeVar
from uuid import UUID, uuid4

import psycopg
from fastapi import APIRouter, Header, HTTPException, Request, Response, status
from pydantic import BaseModel, ConfigDict, Field, field_validator

from property_rental.api_refusals import Refusal, RefusedRequest
from property_rental.browser_security import require_browser_mutation
from property_rental.customer_api import CUSTOMER_MANAGE_CAPABILITY, CUSTOMER_READ_CAPABILITY
from property_rental.identity import (
    ActorResolver,
    AuthenticatedActor,
    AuthorizationRequirement,
    is_authorized,
)
from property_rental.settings import Settings
from property_rental.unit_api import UnitVersionConflict

_T = TypeVar("_T")
_MESSAGES: Final = {
    "VEHICLE_TYPE": "This vehicle holds a space of another Parking Type. End that parking first.",
}


class VehicleType(StrEnum):
    CAR = "CAR"
    MOTORBIKE = "MOTORBIKE"
    TUK_TUK = "TUK_TUK"
    FOOD_CART = "FOOD_CART"


class VehicleNotFound(LookupError):
    """The Customer or the vehicle is not there."""


class VehicleUnavailable(RuntimeError):
    """Vehicle persistence cannot be reached."""


class VehicleConflict(RuntimeError):
    """The change does not fit the space the vehicle holds; `code` names the refusal."""

    def __init__(self, message: str, code: str) -> None:
        super().__init__(message)
        self.code = code


@dataclass(frozen=True, slots=True)
class VehicleRecord:
    vehicle_id: UUID
    property_id: UUID
    customer_id: UUID
    version: int


@dataclass(frozen=True, slots=True)
class VehicleFields:
    vehicle_type: str
    plate_text: str
    colour: str | None
    brand_model: str | None
    sticker_number: str | None


class VehicleFlow(Protocol):
    def customer_property(self, customer_id: UUID) -> UUID: ...

    def list(self, customer_id: UUID) -> list[dict[str, object]]: ...

    def vehicle(self, vehicle_id: UUID) -> VehicleRecord: ...

    def create(
        self, property_id: UUID, customer_id: UUID, fields: VehicleFields, *, actor_id: str
    ) -> dict[str, object]: ...

    def update(
        self, vehicle_id: UUID, fields: VehicleFields, *, expected_version: int, actor_id: str
    ) -> dict[str, object]: ...


class UnavailableVehicleFlow:
    """Used when the app has no database."""

    def _fail(self) -> VehicleUnavailable:
        return VehicleUnavailable("Vehicle persistence is not configured")

    def customer_property(self, customer_id: UUID) -> UUID:
        del customer_id
        raise self._fail()

    def list(self, customer_id: UUID) -> list[dict[str, object]]:
        del customer_id
        raise self._fail()

    def vehicle(self, vehicle_id: UUID) -> VehicleRecord:
        del vehicle_id
        raise self._fail()

    def create(
        self, property_id: UUID, customer_id: UUID, *_: object, **__: object
    ) -> dict[str, object]:
        del property_id, customer_id
        raise self._fail()

    def update(self, vehicle_id: UUID, *_: object, **__: object) -> dict[str, object]:
        del vehicle_id
        raise self._fail()


class PostgresVehicleFlow:
    """Vehicle commands run through the audited database functions of migration 437; the list
    is `app.customer_vehicles` of migration 439."""

    def __init__(self, database_url: str) -> None:
        self._database_url = database_url

    def customer_property(self, customer_id: UUID) -> UUID:
        try:
            with psycopg.connect(self._database_url) as connection:
                row = connection.execute(
                    "SELECT property.id FROM app.customers AS customer "
                    "CROSS JOIN app.properties AS property WHERE customer.id = %s "
                    "ORDER BY property.created_at, property.id LIMIT 1",
                    (customer_id,),
                ).fetchone()
        except psycopg.Error as exc:
            raise VehicleUnavailable("Customers are unavailable") from exc
        if row is None:
            raise VehicleNotFound("Customer was not found")
        return UUID(str(row[0]))

    def _one(
        self, connection: psycopg.Connection[tuple[object, ...]], vehicle_id: UUID
    ) -> dict[str, object]:
        row = connection.execute("SELECT app.customer_vehicles(NULL, %s)", (vehicle_id,)).fetchone()
        found = None if row is None else row[0]
        if not isinstance(found, list) or not found or not isinstance(found[0], dict):
            raise VehicleNotFound("Vehicle was not found")
        return found[0]

    def list(self, customer_id: UUID) -> list[dict[str, object]]:
        try:
            with psycopg.connect(self._database_url) as connection:
                row = connection.execute(
                    "SELECT app.customer_vehicles(%s, NULL)", (customer_id,)
                ).fetchone()
        except psycopg.Error as exc:
            raise VehicleUnavailable("Vehicles are unavailable") from exc
        found = None if row is None else row[0]
        return [item for item in found if isinstance(item, dict)] if isinstance(found, list) else []

    def vehicle(self, vehicle_id: UUID) -> VehicleRecord:
        try:
            with psycopg.connect(self._database_url) as connection:
                row = connection.execute(
                    "SELECT id, property_id, customer_id, version FROM app.vehicles WHERE id = %s",
                    (vehicle_id,),
                ).fetchone()
        except psycopg.Error as exc:
            raise VehicleUnavailable("Vehicles are unavailable") from exc
        if row is None:
            raise VehicleNotFound("Vehicle was not found")
        return VehicleRecord(
            UUID(str(row[0])), UUID(str(row[1])), UUID(str(row[2])), int(str(row[3]))
        )

    @staticmethod
    def _refused(error: psycopg.Error) -> Exception:
        if isinstance(error, psycopg.errors.CheckViolation) and error.diag.message_hint:
            return VehicleConflict("The vehicle holds a space", str(error.diag.message_hint))
        if isinstance(error, psycopg.errors.NoDataFound):
            return VehicleNotFound("Customer or vehicle was not found")
        return VehicleUnavailable("Vehicles are unavailable")

    def create(
        self, property_id: UUID, customer_id: UUID, fields: VehicleFields, *, actor_id: str
    ) -> dict[str, object]:
        vehicle_id = uuid4()
        try:
            with psycopg.connect(self._database_url) as connection:
                connection.execute(
                    "SELECT app.create_vehicle(%s, %s, %s, %s, %s, %s, %s, %s, %s)",
                    (
                        vehicle_id,
                        property_id,
                        customer_id,
                        fields.vehicle_type,
                        fields.plate_text,
                        fields.colour,
                        fields.brand_model,
                        fields.sticker_number,
                        UUID(actor_id),
                    ),
                )
                return self._one(connection, vehicle_id)
        except psycopg.Error as exc:
            raise self._refused(exc) from exc

    def update(
        self, vehicle_id: UUID, fields: VehicleFields, *, expected_version: int, actor_id: str
    ) -> dict[str, object]:
        try:
            with psycopg.connect(self._database_url) as connection:
                connection.execute(
                    "SELECT app.update_vehicle(%s, %s, %s, %s, %s, %s, %s, %s)",
                    (
                        vehicle_id,
                        expected_version,
                        fields.vehicle_type,
                        fields.plate_text,
                        fields.colour,
                        fields.brand_model,
                        fields.sticker_number,
                        UUID(actor_id),
                    ),
                )
                return self._one(connection, vehicle_id)
        except psycopg.errors.SerializationFailure as exc:
            raise UnitVersionConflict(self.vehicle(vehicle_id).version) from exc
        except psycopg.Error as exc:
            raise self._refused(exc) from exc


def _optional(value: object) -> object:
    if isinstance(value, str):
        value = value.strip()
        return value or None
    return value


class VehicleBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    vehicle_type: VehicleType
    plate_text: str = Field(min_length=1, max_length=32)
    colour: str | None = Field(default=None, max_length=50)
    brand_model: str | None = Field(default=None, max_length=100)
    sticker_number: str | None = Field(default=None, max_length=32)

    @field_validator("plate_text", mode="before")
    @classmethod
    def trim_plate(cls, value: object) -> object:
        del cls
        return value.strip() if isinstance(value, str) else value

    @field_validator("colour", "brand_model", "sticker_number", mode="before")
    @classmethod
    def trim_optional(cls, value: object) -> object:
        del cls
        return _optional(value)

    def fields(self) -> VehicleFields:
        return VehicleFields(
            self.vehicle_type.value,
            self.plate_text,
            self.colour,
            self.brand_model,
            self.sticker_number,
        )


def _allowed(actor: AuthenticatedActor, capability: str, property_id: UUID) -> bool:
    return is_authorized(
        actor, AuthorizationRequirement(capability=capability, property_id=str(property_id))
    )


def _expected_version(value: str | None, current: int) -> int:
    candidate = (value or "").strip()
    if len(candidate) >= 2 and candidate[0] == candidate[-1] == '"':
        candidate = candidate[1:-1]
    if not candidate.isdigit() or int(candidate) != current:
        raise UnitVersionConflict(current)
    return current


def create_vehicle_router(
    resolver: ActorResolver, flow: VehicleFlow, settings: Settings
) -> APIRouter:
    """The vehicles of a Customer: list, Add vehicle and Edit vehicle."""
    router = APIRouter(tags=["parking"])

    def actor_of(request: Request) -> AuthenticatedActor:
        actor = resolver(request)
        if actor is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)
        return actor

    def meta(request: Request) -> dict[str, object]:
        return {"request_id": request.state.request_id}

    def private(response: Response) -> None:
        response.headers["Cache-Control"] = "private, no-store"
        response.headers["Vary"] = "Cookie"

    def run(call: Callable[[], _T]) -> _T:
        try:
            return call()
        except VehicleNotFound as exc:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND) from exc
        except VehicleConflict as exc:
            raise RefusedRequest(
                Refusal(
                    status.HTTP_409_CONFLICT,
                    exc.code,
                    _MESSAGES.get(exc.code, "The vehicle cannot change like this."),
                    ("DL-253",),
                )
            ) from exc
        except VehicleUnavailable as exc:
            raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE) from exc

    def can_manage(actor: AuthenticatedActor, property_id: UUID) -> bool:
        return _allowed(actor, CUSTOMER_MANAGE_CAPABILITY, property_id)

    def can_read(actor: AuthenticatedActor, property_id: UUID) -> bool:
        return can_manage(actor, property_id) or _allowed(
            actor, CUSTOMER_READ_CAPABILITY, property_id
        )

    @router.get("/customers/{customer_id}/vehicles")
    def list_vehicles(customer_id: UUID, request: Request, response: Response) -> dict[str, object]:
        actor = actor_of(request)
        property_id = run(lambda: flow.customer_property(customer_id))
        if not can_read(actor, property_id):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
        items = run(lambda: flow.list(customer_id))
        private(response)
        return {
            "data": {"items": items, "can_manage": can_manage(actor, property_id)},
            "meta": meta(request),
        }

    @router.post("/customers/{customer_id}/vehicles", status_code=status.HTTP_201_CREATED)
    def add_vehicle(
        customer_id: UUID, body: VehicleBody, request: Request, response: Response
    ) -> dict[str, object]:
        actor = actor_of(request)
        property_id = run(lambda: flow.customer_property(customer_id))
        if not can_read(actor, property_id):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
        if not can_manage(actor, property_id):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN)
        require_browser_mutation(request, settings)
        vehicle = run(
            lambda: flow.create(property_id, customer_id, body.fields(), actor_id=actor.actor_id)
        )
        response.headers["ETag"] = f'"{vehicle["version"]}"'
        private(response)
        return {"data": vehicle, "meta": meta(request)}

    @router.put("/vehicles/{vehicle_id}")
    def edit_vehicle(
        vehicle_id: UUID,
        body: VehicleBody,
        request: Request,
        response: Response,
        if_match: str | None = Header(default=None, alias="If-Match"),
    ) -> dict[str, object]:
        """The whole vehicle: type, plate, colour, brand and model, sticker number."""
        actor = actor_of(request)
        current = run(lambda: flow.vehicle(vehicle_id))
        if not can_read(actor, current.property_id):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
        if not can_manage(actor, current.property_id):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN)
        require_browser_mutation(request, settings)
        expected = _expected_version(if_match, current.version)
        vehicle = run(
            lambda: flow.update(
                vehicle_id, body.fields(), expected_version=expected, actor_id=actor.actor_id
            )
        )
        response.headers["ETag"] = f'"{vehicle["version"]}"'
        private(response)
        return {"data": vehicle, "meta": meta(request)}

    return router
