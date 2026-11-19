"""Buildings under the one Property (DL-250).

The owner may add a second building later in Settings, with no new code. Every Unit sits in a
building; a Unit that has had a Lease, Reservation or booking never moves to another building, so
reports of past months stay the same.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from typing import Annotated, Final, Protocol, TypeVar
from uuid import UUID, uuid4

import psycopg
from fastapi import APIRouter, Header, HTTPException, Query, Request, Response, status
from pydantic import BaseModel, ConfigDict, Field, field_validator

from property_rental.access_control import SETTINGS_MANAGE_CAPABILITY, UNITS_READ_CAPABILITY
from property_rental.browser_security import require_browser_mutation
from property_rental.identity import (
    ActorResolver,
    AuthenticatedActor,
    AuthorizationRequirement,
    is_authorized,
)
from property_rental.settings import Settings
from property_rental.unit_api import UnitVersionConflict

BUILDING_MANAGE_CAPABILITY: Final = SETTINGS_MANAGE_CAPABILITY
BUILDING_NAME_MAX_LENGTH: Final = 100
BUILDING_TEXT_MAX_LENGTH: Final = 2000
MOVE_REASON_MAX_LENGTH: Final = 500
_T = TypeVar("_T")


class BuildingNotFound(LookupError):
    """Raised when a building or Unit is not there."""


class BuildingUnavailable(RuntimeError):
    """Raised when building persistence cannot be reached."""


class BuildingInvalid(ValueError):
    """Raised when building fields break the approved rules."""


class BuildingNameTaken(RuntimeError):
    """Raised when another building of the Property already has the name."""


class BuildingInUse(RuntimeError):
    """A building with Units cannot be removed; a Unit with history cannot move."""


class BuildingVersionConflict(UnitVersionConflict):
    """Raised when a building change does not target the current version (HTTP 412)."""


@dataclass(frozen=True, slots=True)
class Building:
    building_id: UUID
    property_id: UUID
    name_en: str
    name_km: str | None
    address_text: str | None
    description: str | None
    takes_short_stays: bool
    sort_order: int
    removed: bool
    version: int
    unit_count: int = 0


@dataclass(frozen=True, slots=True)
class UnitPlace:
    unit_id: UUID
    property_id: UUID
    building_id: UUID
    version: int


class BuildingFlow(Protocol):
    def list(self, property_id: UUID, *, include_removed: bool) -> tuple[Building, ...]: ...

    def get(self, building_id: UUID) -> Building: ...

    def create(
        self,
        property_id: UUID,
        *,
        name_en: str,
        name_km: str | None,
        address_text: str | None,
        description: str | None,
        takes_short_stays: bool,
        sort_order: int,
        actor_id: str,
    ) -> Building: ...

    def update(
        self,
        building_id: UUID,
        *,
        name_en: str,
        name_km: str | None,
        address_text: str | None,
        description: str | None,
        takes_short_stays: bool,
        sort_order: int,
        expected_version: int,
        actor_id: str,
    ) -> Building: ...

    def remove(self, building_id: UUID, *, expected_version: int, actor_id: str) -> Building: ...

    def unit_place(self, unit_id: UUID) -> UnitPlace: ...

    def move_unit(
        self,
        unit_id: UUID,
        *,
        building_id: UUID,
        expected_version: int,
        reason: str,
        actor_id: str,
    ) -> UnitPlace: ...


class UnavailableBuildingFlow:
    """Used when the app has no database: every call says the service is unavailable."""

    def _fail(self) -> BuildingUnavailable:
        return BuildingUnavailable("Building persistence is not configured")

    def list(self, property_id: UUID, *, include_removed: bool) -> tuple[Building, ...]:
        del property_id, include_removed
        raise self._fail()

    def get(self, building_id: UUID) -> Building:
        del building_id
        raise self._fail()

    def create(self, property_id: UUID, **_: object) -> Building:
        del property_id
        raise self._fail()

    def update(self, building_id: UUID, **_: object) -> Building:
        del building_id
        raise self._fail()

    def remove(self, building_id: UUID, *, expected_version: int, actor_id: str) -> Building:
        del building_id, expected_version, actor_id
        raise self._fail()

    def unit_place(self, unit_id: UUID) -> UnitPlace:
        del unit_id
        raise self._fail()

    def move_unit(self, unit_id: UUID, **_: object) -> UnitPlace:
        del unit_id
        raise self._fail()


_COLUMNS: Final = (
    "building.id, building.property_id, building.name_en, building.name_km, "
    "building.address_text, building.description, building.takes_short_stays, "
    "building.sort_order, building.removed_at, building.version"
)
_UNIT_COUNT: Final = "(SELECT count(*) FROM app.units AS unit WHERE unit.building_id = building.id)"


def _building(row: tuple[object, ...], unit_count: int = 0) -> Building:
    return Building(
        building_id=UUID(str(row[0])),
        property_id=UUID(str(row[1])),
        name_en=str(row[2]),
        name_km=None if row[3] is None else str(row[3]),
        address_text=None if row[4] is None else str(row[4]),
        description=None if row[5] is None else str(row[5]),
        takes_short_stays=bool(row[6]),
        sort_order=int(str(row[7])),
        removed=row[8] is not None,
        version=int(str(row[9])),
        unit_count=unit_count,
    )


class PostgresBuildingFlow:
    """Building commands run through the audited database functions of migration 433."""

    def __init__(self, database_url: str) -> None:
        self._database_url = database_url

    def list(self, property_id: UUID, *, include_removed: bool) -> tuple[Building, ...]:
        try:
            with psycopg.connect(self._database_url) as connection:
                rows = connection.execute(
                    f"SELECT {_COLUMNS}, {_UNIT_COUNT} FROM app.buildings AS building "
                    "WHERE building.property_id = %s "
                    + ("" if include_removed else "AND building.removed_at IS NULL ")
                    + "ORDER BY building.sort_order, building.name_en, building.id",
                    (property_id,),
                ).fetchall()
        except psycopg.Error as exc:
            raise BuildingUnavailable("Buildings are unavailable") from exc
        return tuple(_building(row, int(str(row[10]))) for row in rows)

    def get(self, building_id: UUID) -> Building:
        try:
            with psycopg.connect(self._database_url) as connection:
                row = connection.execute(
                    f"SELECT {_COLUMNS}, {_UNIT_COUNT} FROM app.buildings AS building "
                    "WHERE building.id = %s",
                    (building_id,),
                ).fetchone()
        except psycopg.Error as exc:
            raise BuildingUnavailable("Buildings are unavailable") from exc
        if row is None:
            raise BuildingNotFound("Building was not found")
        return _building(row, int(str(row[10])))

    def _command(self, sql: str, parameters: tuple[object, ...]) -> tuple[object, ...] | None:
        try:
            with psycopg.connect(self._database_url) as connection:
                return connection.execute(sql, parameters).fetchone()
        except psycopg.errors.UniqueViolation as exc:
            raise BuildingNameTaken("Another building has this name") from exc
        except psycopg.errors.ObjectNotInPrerequisiteState as exc:
            raise BuildingInUse("The building or Unit cannot change") from exc
        except (
            psycopg.errors.CheckViolation,
            psycopg.errors.InvalidParameterValue,
            psycopg.errors.ForeignKeyViolation,
            psycopg.errors.NotNullViolation,
        ) as exc:
            raise BuildingInvalid("Building fields are invalid") from exc
        except psycopg.Error as exc:
            raise BuildingUnavailable("Buildings are unavailable") from exc

    def _versioned(self, building_id: UUID, row: tuple[object, ...] | None) -> Building:
        if row is None or row[0] is None:
            raise BuildingVersionConflict(self.get(building_id).version)
        return self.get(building_id)

    def create(
        self,
        property_id: UUID,
        *,
        name_en: str,
        name_km: str | None,
        address_text: str | None,
        description: str | None,
        takes_short_stays: bool,
        sort_order: int,
        actor_id: str,
    ) -> Building:
        row = self._command(
            "SELECT * FROM app.create_building(%s, %s, %s, %s, %s, %s, %s, %s, %s)",
            (
                uuid4(),
                property_id,
                name_en,
                name_km,
                address_text,
                description,
                takes_short_stays,
                sort_order,
                UUID(actor_id),
            ),
        )
        if row is None:
            raise BuildingUnavailable("Building creation returned no result")
        return _building(row)

    def update(
        self,
        building_id: UUID,
        *,
        name_en: str,
        name_km: str | None,
        address_text: str | None,
        description: str | None,
        takes_short_stays: bool,
        sort_order: int,
        expected_version: int,
        actor_id: str,
    ) -> Building:
        return self._versioned(
            building_id,
            self._command(
                "SELECT * FROM app.update_building(%s, %s, %s, %s, %s, %s, %s, %s, %s)",
                (
                    building_id,
                    name_en,
                    name_km,
                    address_text,
                    description,
                    takes_short_stays,
                    sort_order,
                    expected_version,
                    UUID(actor_id),
                ),
            ),
        )

    def remove(self, building_id: UUID, *, expected_version: int, actor_id: str) -> Building:
        return self._versioned(
            building_id,
            self._command(
                "SELECT * FROM app.remove_building(%s, %s, %s)",
                (building_id, expected_version, UUID(actor_id)),
            ),
        )

    def unit_place(self, unit_id: UUID) -> UnitPlace:
        try:
            with psycopg.connect(self._database_url) as connection:
                row = connection.execute(
                    "SELECT unit.id, unit.property_id, unit.building_id, unit.version "
                    "FROM app.units AS unit WHERE unit.id = %s",
                    (unit_id,),
                ).fetchone()
        except psycopg.Error as exc:
            raise BuildingUnavailable("Units are unavailable") from exc
        if row is None:
            raise BuildingNotFound("Unit was not found")
        return UnitPlace(UUID(str(row[0])), UUID(str(row[1])), UUID(str(row[2])), int(str(row[3])))

    def move_unit(
        self,
        unit_id: UUID,
        *,
        building_id: UUID,
        expected_version: int,
        reason: str,
        actor_id: str,
    ) -> UnitPlace:
        row = self._command(
            "SELECT app.move_unit_to_building(%s, %s, %s, %s, %s)",
            (unit_id, building_id, expected_version, reason, UUID(actor_id)),
        )
        if row is None or row[0] is None:
            raise UnitVersionConflict(self.unit_place(unit_id).version)
        return self.unit_place(unit_id)


class BuildingFields(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name_en: str = Field(min_length=1, max_length=BUILDING_NAME_MAX_LENGTH)
    name_km: str | None = Field(default=None, max_length=BUILDING_NAME_MAX_LENGTH)
    address_text: str | None = Field(default=None, max_length=BUILDING_TEXT_MAX_LENGTH)
    description: str | None = Field(default=None, max_length=BUILDING_TEXT_MAX_LENGTH)
    takes_short_stays: bool = Field(default=False, strict=True)
    sort_order: int = Field(default=0, ge=0, le=9999, strict=True)

    @field_validator("name_en", "name_km", "address_text", "description", mode="before")
    @classmethod
    def trim(cls, value: object) -> object:
        del cls
        return value.strip() if isinstance(value, str) else value


class BuildingPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name_en: str | None = Field(default=None, min_length=1, max_length=BUILDING_NAME_MAX_LENGTH)
    name_km: str | None = Field(default=None, max_length=BUILDING_NAME_MAX_LENGTH)
    address_text: str | None = Field(default=None, max_length=BUILDING_TEXT_MAX_LENGTH)
    description: str | None = Field(default=None, max_length=BUILDING_TEXT_MAX_LENGTH)
    takes_short_stays: bool | None = Field(default=None, strict=True)
    sort_order: int | None = Field(default=None, ge=0, le=9999, strict=True)

    @field_validator("name_en", "name_km", "address_text", "description", mode="before")
    @classmethod
    def trim(cls, value: object) -> object:
        del cls
        return value.strip() if isinstance(value, str) else value


class UnitBuildingMove(BaseModel):
    model_config = ConfigDict(extra="forbid")

    building_id: UUID
    reason: str = Field(min_length=1, max_length=MOVE_REASON_MAX_LENGTH)

    @field_validator("reason", mode="before")
    @classmethod
    def trim(cls, value: object) -> object:
        del cls
        return value.strip() if isinstance(value, str) else value


def _allowed(actor: AuthenticatedActor, capability: str, property_id: UUID) -> bool:
    return is_authorized(
        actor, AuthorizationRequirement(capability=capability, property_id=str(property_id))
    )


def _expected_version(value: str | None, current: int, conflict: type[UnitVersionConflict]) -> int:
    candidate = (value or "").strip()
    if len(candidate) >= 2 and candidate[0] == candidate[-1] == '"':
        candidate = candidate[1:-1]
    if not candidate.isdigit() or int(candidate) != current:
        raise conflict(current)
    return current


def _body(building: Building) -> dict[str, object]:
    return {
        "building_id": str(building.building_id),
        "property_id": str(building.property_id),
        "name_en": building.name_en,
        "name_km": building.name_km,
        "address_text": building.address_text,
        "description": building.description,
        "takes_short_stays": building.takes_short_stays,
        "sort_order": building.sort_order,
        "removed": building.removed,
        "unit_count": building.unit_count,
        "version": building.version,
    }


def create_buildings_router(
    resolver: ActorResolver, flow: BuildingFlow, settings: Settings
) -> APIRouter:
    """Buildings list for Settings > Unit setup, and moving a new Unit to another building."""
    router = APIRouter(tags=["buildings"])

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
        except BuildingNotFound as exc:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND) from exc
        except (BuildingNameTaken, BuildingInUse) as exc:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT) from exc
        except BuildingInvalid as exc:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT) from exc
        except BuildingUnavailable as exc:
            raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE) from exc

    @router.get("/properties/{property_id}/buildings")
    def list_buildings(
        property_id: UUID,
        request: Request,
        include_removed: Annotated[bool, Query()] = False,
    ) -> dict[str, object]:
        actor = actor_of(request)
        can_manage = _allowed(actor, BUILDING_MANAGE_CAPABILITY, property_id)
        if not can_manage and not _allowed(actor, UNITS_READ_CAPABILITY, property_id):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN)
        buildings = run(
            lambda: flow.list(property_id, include_removed=include_removed and can_manage)
        )
        return {
            "data": {"items": [_body(item) for item in buildings], "can_manage": can_manage},
            "meta": meta(request),
        }

    @router.post("/properties/{property_id}/buildings", status_code=status.HTTP_201_CREATED)
    def create_building(
        property_id: UUID, fields: BuildingFields, request: Request, response: Response
    ) -> dict[str, object]:
        actor = actor_of(request)
        if not _allowed(actor, BUILDING_MANAGE_CAPABILITY, property_id):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN)
        require_browser_mutation(request, settings)
        building = run(
            lambda: flow.create(
                property_id,
                name_en=fields.name_en,
                name_km=fields.name_km or None,
                address_text=fields.address_text or None,
                description=fields.description or None,
                takes_short_stays=fields.takes_short_stays,
                sort_order=fields.sort_order,
                actor_id=actor.actor_id,
            )
        )
        response.headers["ETag"] = f'"{building.version}"'
        return {"data": _body(building), "meta": meta(request)}

    def building_for_change(request: Request, building_id: UUID) -> tuple[str, Building]:
        actor = actor_of(request)
        current = run(lambda: flow.get(building_id))
        if not _allowed(actor, BUILDING_MANAGE_CAPABILITY, current.property_id):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN)
        require_browser_mutation(request, settings)
        return actor.actor_id, current

    @router.patch("/buildings/{building_id}")
    def update_building(
        building_id: UUID,
        patch: BuildingPatch,
        request: Request,
        response: Response,
        if_match: str | None = Header(default=None, alias="If-Match"),
    ) -> dict[str, object]:
        actor_id, current = building_for_change(request, building_id)
        given = patch.model_fields_set
        if not given or any(
            getattr(patch, name) is None
            for name in given & {"name_en", "takes_short_stays", "sort_order"}
        ):
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT)
        expected = _expected_version(if_match, current.version, BuildingVersionConflict)

        def kept(name: str, current_value: str | None) -> str | None:
            return (getattr(patch, name) or None) if name in given else current_value

        building = run(
            lambda: flow.update(
                building_id,
                name_en=patch.name_en if patch.name_en is not None else current.name_en,
                name_km=kept("name_km", current.name_km),
                address_text=kept("address_text", current.address_text),
                description=kept("description", current.description),
                takes_short_stays=(
                    patch.takes_short_stays
                    if patch.takes_short_stays is not None
                    else current.takes_short_stays
                ),
                sort_order=patch.sort_order if patch.sort_order is not None else current.sort_order,
                expected_version=expected,
                actor_id=actor_id,
            )
        )
        response.headers["ETag"] = f'"{building.version}"'
        return {"data": _body(building), "meta": meta(request)}

    @router.post("/buildings/{building_id}/remove")
    def remove_building(
        building_id: UUID,
        request: Request,
        response: Response,
        if_match: str | None = Header(default=None, alias="If-Match"),
    ) -> dict[str, object]:
        """A building that still has Units cannot be removed (409)."""
        actor_id, current = building_for_change(request, building_id)
        expected = _expected_version(if_match, current.version, BuildingVersionConflict)
        building = run(
            lambda: flow.remove(building_id, expected_version=expected, actor_id=actor_id)
        )
        response.headers["ETag"] = f'"{building.version}"'
        return {"data": _body(building), "meta": meta(request)}

    @router.post("/units/{unit_id}/building")
    def move_unit_to_building(
        unit_id: UUID,
        move: UnitBuildingMove,
        request: Request,
        response: Response,
        if_match: str | None = Header(default=None, alias="If-Match"),
    ) -> dict[str, object]:
        """Only a Unit with no Lease, Reservation or booking yet can move (409 otherwise)."""
        actor = actor_of(request)
        place = run(lambda: flow.unit_place(unit_id))
        if not _allowed(actor, BUILDING_MANAGE_CAPABILITY, place.property_id):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN)
        require_browser_mutation(request, settings)
        expected = _expected_version(if_match, place.version, UnitVersionConflict)
        moved = run(
            lambda: flow.move_unit(
                unit_id,
                building_id=move.building_id,
                expected_version=expected,
                reason=move.reason,
                actor_id=actor.actor_id,
            )
        )
        response.headers["ETag"] = f'"{moved.version}"'
        return {
            "data": {
                "unit_id": str(moved.unit_id),
                "building_id": str(moved.building_id),
                "version": moved.version,
            },
            "meta": meta(request),
        }

    return router
