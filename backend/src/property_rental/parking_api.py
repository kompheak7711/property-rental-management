"""Parking spaces (DL-253, parking step 2).

A parking space is a Unit of kind PARKING with a Parking Type, an area, a number of places and a
price: its own, or the price of its Parking Type in Settings. The Parking list shows who holds each
space today.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from datetime import date
from typing import Annotated, Final, Protocol, TypeVar
from uuid import UUID, uuid4

import psycopg
from fastapi import APIRouter, Header, HTTPException, Query, Request, Response, status
from pydantic import BaseModel, ConfigDict, Field, field_validator

from property_rental.access_control import SETTINGS_MANAGE_CAPABILITY, UNITS_READ_CAPABILITY
from property_rental.api_refusals import Refusal, RefusedRequest
from property_rental.browser_security import require_browser_mutation
from property_rental.identity import (
    ActorResolver,
    AuthenticatedActor,
    AuthorizationRequirement,
    is_authorized,
)
from property_rental.settings import Settings
from property_rental.unit import UNIT_SETUP_CODE
from property_rental.unit_api import UNIT_MANAGE_CAPABILITY, UnitVersionConflict

PARKING_NUMBER_MAX_LENGTH: Final = 20
PARKING_AREA_MAX_LENGTH: Final = 100
PARKING_MAX_CAPACITY: Final = 500
PARKING_MAX_PRICE_USD_CENTS: Final = 100_000_000
_T = TypeVar("_T")
_MESSAGES: Final = {
    "NUMBER_TAKEN": "Another Unit or parking space already has this number.",
    "TYPE_HAS_NO_PRICE": "Set a price for this type in Settings, or give the space its own price.",
    "PARKING_CAPACITY": "More vehicles hold this space than the new number of places.",
    "VEHICLE_TYPE": "A vehicle holding this space does not fit the new Parking Type.",
    "PARKING_KEPT_FOR_GUESTS": "This space is held. Keep it for guests when it is free.",
}


class ParkingNotFound(LookupError):
    """The parking space is not there."""


class ParkingUnavailable(RuntimeError):
    """Parking persistence cannot be reached."""


class ParkingInvalid(ValueError):
    """The fields break the rules; `code` names a refusal the screen explains."""

    def __init__(self, message: str, code: str | None = None) -> None:
        super().__init__(message)
        self.code = code


class ParkingConflict(RuntimeError):
    """The number is taken, or the change does not fit the space's holds."""

    def __init__(self, message: str, code: str | None = None) -> None:
        super().__init__(message)
        self.code = code


@dataclass(frozen=True, slots=True)
class ParkingSpace:
    unit_id: UUID
    property_id: UUID
    version: int


@dataclass(frozen=True, slots=True)
class TypeItem:
    item_id: UUID
    property_id: UUID
    version: int
    default_monthly_rent_usd_cents: int | None


class ParkingFlow(Protocol):
    def type_item(self, item_id: UUID) -> TypeItem: ...

    def set_type_price(
        self, item_id: UUID, *, expected_version: int, price_usd_cents: int | None, actor_id: str
    ) -> TypeItem: ...

    def list(self, property_id: UUID, *, day: date | None) -> list[dict[str, object]]: ...

    def space(self, unit_id: UUID) -> ParkingSpace: ...

    def create(
        self,
        property_id: UUID,
        *,
        building_id: UUID | None,
        unit_number: str,
        parking_type: str,
        area: str,
        parking_capacity: int,
        kept_for_short_stay_guests: bool,
        price_usd_cents: int | None,
        actor_id: str,
    ) -> dict[str, object]: ...

    def update(
        self,
        unit_id: UUID,
        *,
        expected_version: int,
        parking_type: str,
        area: str,
        parking_capacity: int,
        kept_for_short_stay_guests: bool,
        price_usd_cents: int | None,
        actor_id: str,
    ) -> dict[str, object]: ...


class UnavailableParkingFlow:
    """Used when the app has no database."""

    def _fail(self) -> ParkingUnavailable:
        return ParkingUnavailable("Parking persistence is not configured")

    def list(self, property_id: UUID, *, day: date | None) -> list[dict[str, object]]:
        del property_id, day
        raise self._fail()

    def space(self, unit_id: UUID) -> ParkingSpace:
        del unit_id
        raise self._fail()

    def type_item(self, item_id: UUID) -> TypeItem:
        del item_id
        raise self._fail()

    def set_type_price(self, item_id: UUID, **_: object) -> TypeItem:
        del item_id
        raise self._fail()

    def create(self, property_id: UUID, **_: object) -> dict[str, object]:
        del property_id
        raise self._fail()

    def update(self, unit_id: UUID, **_: object) -> dict[str, object]:
        del unit_id
        raise self._fail()


def _hint(error: psycopg.Error) -> str | None:
    return None if error.diag.message_hint is None else str(error.diag.message_hint)


_TODAY: Final = (
    "SELECT timezone(property.timezone_name, statement_timestamp())::date "
    "FROM app.properties AS property WHERE property.id = %s"
)


class PostgresParkingFlow:
    """Parking commands run through the audited database functions of migration 438."""

    def __init__(self, database_url: str) -> None:
        self._database_url = database_url

    def _one(
        self, connection: psycopg.Connection[tuple[object, ...]], property_id: UUID, unit_id: UUID
    ) -> dict[str, object]:
        row = connection.execute(
            f"SELECT space FROM jsonb_array_elements(app.parking_spaces(%s, ({_TODAY}))) "
            "AS space WHERE space ->> 'unit_id' = %s",
            (property_id, property_id, str(unit_id)),
        ).fetchone()
        if row is None or not isinstance(row[0], dict):
            raise ParkingNotFound("Parking space was not found")
        return row[0]

    def list(self, property_id: UUID, *, day: date | None) -> list[dict[str, object]]:
        try:
            with psycopg.connect(self._database_url) as connection:
                row = connection.execute(
                    f"SELECT app.parking_spaces(%s, coalesce(%s::date, ({_TODAY})))",
                    (property_id, day, property_id),
                ).fetchone()
        except psycopg.Error as exc:
            raise ParkingUnavailable("Parking is unavailable") from exc
        value = None if row is None else row[0]
        return [item for item in value if isinstance(item, dict)] if isinstance(value, list) else []

    def space(self, unit_id: UUID) -> ParkingSpace:
        try:
            with psycopg.connect(self._database_url) as connection:
                row = connection.execute(
                    "SELECT id, property_id, version FROM app.units "
                    "WHERE id = %s AND unit_kind = 'PARKING'",
                    (unit_id,),
                ).fetchone()
        except psycopg.Error as exc:
            raise ParkingUnavailable("Parking is unavailable") from exc
        if row is None:
            raise ParkingNotFound("Parking space was not found")
        return ParkingSpace(UUID(str(row[0])), UUID(str(row[1])), int(str(row[2])))

    def type_item(self, item_id: UUID) -> TypeItem:
        try:
            with psycopg.connect(self._database_url) as connection:
                row = connection.execute(
                    "SELECT id, property_id, version, default_monthly_rent_usd_cents "
                    "FROM app.unit_setup_items WHERE id = %s "
                    "AND list_kind IN ('UNIT_TYPE', 'PARKING_TYPE')",
                    (item_id,),
                ).fetchone()
        except psycopg.Error as exc:
            raise ParkingUnavailable("Unit setup lists are unavailable") from exc
        if row is None:
            raise ParkingNotFound("Unit Type or Parking Type was not found")
        return TypeItem(
            UUID(str(row[0])),
            UUID(str(row[1])),
            int(str(row[2])),
            None if row[3] is None else int(str(row[3])),
        )

    def set_type_price(
        self, item_id: UUID, *, expected_version: int, price_usd_cents: int | None, actor_id: str
    ) -> TypeItem:
        try:
            with psycopg.connect(self._database_url) as connection:
                row = connection.execute(
                    "SELECT app.set_type_price(%s, %s, %s, %s)",
                    (item_id, expected_version, price_usd_cents, UUID(actor_id)),
                ).fetchone()
        except psycopg.Error as exc:
            raise self._refused(exc) from exc
        if row is None or row[0] is None:
            raise UnitVersionConflict(self.type_item(item_id).version)
        return self.type_item(item_id)

    @staticmethod
    def _refused(error: psycopg.Error) -> Exception:
        if isinstance(error, psycopg.errors.UniqueViolation):
            return ParkingConflict("Another Unit has this number", "NUMBER_TAKEN")
        if isinstance(error, psycopg.errors.CheckViolation) and _hint(error) is not None:
            return ParkingConflict("The change does not fit the space's holds", _hint(error))
        if isinstance(
            error,
            psycopg.errors.CheckViolation
            | psycopg.errors.InvalidParameterValue
            | psycopg.errors.ForeignKeyViolation
            | psycopg.errors.NotNullViolation
            | psycopg.errors.ObjectNotInPrerequisiteState,
        ):
            return ParkingInvalid("Parking space fields are invalid", _hint(error))
        if isinstance(error, psycopg.errors.NoDataFound):
            return ParkingNotFound("Parking space was not found")
        return ParkingUnavailable("Parking is unavailable")

    def create(
        self,
        property_id: UUID,
        *,
        building_id: UUID | None,
        unit_number: str,
        parking_type: str,
        area: str,
        parking_capacity: int,
        kept_for_short_stay_guests: bool,
        price_usd_cents: int | None,
        actor_id: str,
    ) -> dict[str, object]:
        unit_id = uuid4()
        try:
            with psycopg.connect(self._database_url) as connection:
                connection.execute(
                    "SELECT app.create_parking_space(%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
                    (
                        unit_id,
                        property_id,
                        building_id,
                        unit_number,
                        parking_type,
                        area,
                        parking_capacity,
                        kept_for_short_stay_guests,
                        price_usd_cents,
                        UUID(actor_id),
                    ),
                )
                return self._one(connection, property_id, unit_id)
        except psycopg.Error as exc:
            raise self._refused(exc) from exc

    def update(
        self,
        unit_id: UUID,
        *,
        expected_version: int,
        parking_type: str,
        area: str,
        parking_capacity: int,
        kept_for_short_stay_guests: bool,
        price_usd_cents: int | None,
        actor_id: str,
    ) -> dict[str, object]:
        try:
            with psycopg.connect(self._database_url) as connection:
                row = connection.execute(
                    "SELECT version, property_id, default_monthly_rent_usd_cents, rent_from_type "
                    "FROM app.update_parking_space(%s, %s, %s, %s, %s, %s, %s)",
                    (
                        unit_id,
                        expected_version,
                        parking_type,
                        area,
                        parking_capacity,
                        kept_for_short_stay_guests,
                        UUID(actor_id),
                    ),
                ).fetchone()
                if row is None or row[0] is None:
                    connection.rollback()
                    raise UnitVersionConflict(self.space(unit_id).version)
                version, property_id = int(str(row[0])), UUID(str(row[1]))
                uses_type = price_usd_cents is None
                if uses_type != bool(row[3]) or (not uses_type and price_usd_cents != row[2]):
                    connection.execute(
                        "SELECT app.set_unit_rent_terms_with_type(%s, %s, %s, %s::uuid[], %s, %s)",
                        (unit_id, version, price_usd_cents, [], uses_type, UUID(actor_id)),
                    )
                return self._one(connection, property_id, unit_id)
        except UnitVersionConflict:
            raise
        except psycopg.Error as exc:
            raise self._refused(exc) from exc


def _trim(value: object) -> object:
    return value.strip() if isinstance(value, str) else value


class ParkingSpaceFields(BaseModel):
    model_config = ConfigDict(extra="forbid")

    parking_type: str = Field(pattern=f"^{UNIT_SETUP_CODE.pattern}$")
    area: str = Field(min_length=1, max_length=PARKING_AREA_MAX_LENGTH)
    parking_capacity: int = Field(default=1, ge=1, le=PARKING_MAX_CAPACITY, strict=True)
    kept_for_short_stay_guests: bool = Field(default=False, strict=True)
    # Empty: the space uses the price of its Parking Type.
    price_usd_cents: int | None = Field(
        default=None, gt=0, le=PARKING_MAX_PRICE_USD_CENTS, strict=True
    )

    @field_validator("area", "parking_type", mode="before")
    @classmethod
    def trim(cls, value: object) -> object:
        del cls
        return _trim(value)


class ParkingSpaceCreate(ParkingSpaceFields):
    unit_number: str = Field(min_length=1, max_length=PARKING_NUMBER_MAX_LENGTH)
    building_id: UUID | None = None

    @field_validator("unit_number", mode="before")
    @classmethod
    def trim_number(cls, value: object) -> object:
        del cls
        return _trim(value)


class TypePrice(BaseModel):
    model_config = ConfigDict(extra="forbid")

    # Empty: the type has no price; the Units that used it keep their last price.
    default_monthly_rent_usd_cents: int | None = Field(
        gt=0, le=PARKING_MAX_PRICE_USD_CENTS, strict=True
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


def create_parking_router(
    resolver: ActorResolver, flow: ParkingFlow, settings: Settings
) -> APIRouter:
    """The Parking list, New space and Edit space."""
    router = APIRouter(tags=["parking"])

    def actor_of(request: Request) -> AuthenticatedActor:
        actor = resolver(request)
        if actor is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)
        return actor

    def meta(request: Request) -> dict[str, object]:
        return {"request_id": request.state.request_id}

    def run(call: Callable[[], _T]) -> _T:
        try:
            return call()
        except ParkingNotFound as exc:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND) from exc
        except ParkingConflict as exc:
            raise RefusedRequest(
                Refusal(
                    status.HTTP_409_CONFLICT,
                    exc.code or "PARKING_CONFLICT",
                    _MESSAGES.get(exc.code or "", "The parking space cannot change like this."),
                    ("DL-253",),
                )
            ) from exc
        except ParkingInvalid as exc:
            raise RefusedRequest(
                Refusal(
                    status.HTTP_422_UNPROCESSABLE_CONTENT,
                    exc.code or "PARKING_INVALID",
                    _MESSAGES.get(exc.code or "", "The parking space fields are not valid."),
                    ("DL-253",),
                )
            ) from exc
        except ParkingUnavailable as exc:
            raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE) from exc

    @router.get("/properties/{property_id}/parking-spaces")
    def list_spaces(
        property_id: UUID,
        request: Request,
        on: Annotated[date | None, Query()] = None,
    ) -> dict[str, object]:
        actor = actor_of(request)
        can_manage = _allowed(actor, UNIT_MANAGE_CAPABILITY, property_id)
        if not can_manage and not _allowed(actor, UNITS_READ_CAPABILITY, property_id):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN)
        items = run(lambda: flow.list(property_id, day=on))
        return {"data": {"items": items, "can_manage": can_manage}, "meta": meta(request)}

    @router.post("/properties/{property_id}/parking-spaces", status_code=status.HTTP_201_CREATED)
    def create_space(
        property_id: UUID, fields: ParkingSpaceCreate, request: Request, response: Response
    ) -> dict[str, object]:
        actor = actor_of(request)
        if not _allowed(actor, UNIT_MANAGE_CAPABILITY, property_id):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN)
        require_browser_mutation(request, settings)
        space = run(
            lambda: flow.create(
                property_id,
                building_id=fields.building_id,
                unit_number=fields.unit_number,
                parking_type=fields.parking_type,
                area=fields.area,
                parking_capacity=fields.parking_capacity,
                kept_for_short_stay_guests=fields.kept_for_short_stay_guests,
                price_usd_cents=fields.price_usd_cents,
                actor_id=actor.actor_id,
            )
        )
        response.headers["ETag"] = f'"{space["version"]}"'
        return {"data": space, "meta": meta(request)}

    @router.put("/parking-spaces/{unit_id}")
    def update_space(
        unit_id: UUID,
        fields: ParkingSpaceFields,
        request: Request,
        response: Response,
        if_match: str | None = Header(default=None, alias="If-Match"),
    ) -> dict[str, object]:
        """The whole space: Parking Type, area, places, Kept for guests and price."""
        actor = actor_of(request)
        current = run(lambda: flow.space(unit_id))
        if not _allowed(actor, UNIT_MANAGE_CAPABILITY, current.property_id):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN)
        require_browser_mutation(request, settings)
        expected = _expected_version(if_match, current.version)
        space = run(
            lambda: flow.update(
                unit_id,
                expected_version=expected,
                parking_type=fields.parking_type,
                area=fields.area,
                parking_capacity=fields.parking_capacity,
                kept_for_short_stay_guests=fields.kept_for_short_stay_guests,
                price_usd_cents=fields.price_usd_cents,
                actor_id=actor.actor_id,
            )
        )
        response.headers["ETag"] = f'"{space["version"]}"'
        return {"data": space, "meta": meta(request)}

    @router.put("/unit-setup/items/{item_id}/price")
    def set_type_price(
        item_id: UUID,
        price: TypePrice,
        request: Request,
        response: Response,
        if_match: str | None = Header(default=None, alias="If-Match"),
    ) -> dict[str, object]:
        """The default price of a Unit Type or Parking Type (Settings access).

        The Units that use the type price move with it; an existing Lease never changes."""
        actor = actor_of(request)
        current = run(lambda: flow.type_item(item_id))
        if not _allowed(actor, SETTINGS_MANAGE_CAPABILITY, current.property_id):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN)
        require_browser_mutation(request, settings)
        expected = _expected_version(if_match, current.version)
        item = run(
            lambda: flow.set_type_price(
                item_id,
                expected_version=expected,
                price_usd_cents=price.default_monthly_rent_usd_cents,
                actor_id=actor.actor_id,
            )
        )
        response.headers["ETag"] = f'"{item.version}"'
        return {
            "data": {
                "item_id": str(item.item_id),
                "version": item.version,
                "default_monthly_rent_usd_cents": item.default_monthly_rent_usd_cents,
            },
            "meta": meta(request),
        }

    return router
