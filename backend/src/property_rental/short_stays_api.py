"""Daily and weekly rent: calendar, price and bookings (phase 6 step 2).

`GET .../short-stays/calendar` shows every Unit with its bookings, Leases and Reservation for
1 to 62 days, `GET .../short-stays/price` prices a stay in one Unit (with the monthly hint and why
the Unit cannot be booked), and `GET .../short-stays/bookings` and `.../bookings/{id}` read
bookings (`short_stays.read`). `POST .../short-stays/bookings` makes a booking for a guest who is a
Customer (`short_stays.desk`). The database functions check the rights again, price the stay from
the owner's rules and keep one booking per Unit and night.
"""

from __future__ import annotations

from datetime import date
from typing import Annotated, Literal, Protocol
from uuid import UUID, uuid4

import psycopg
from fastapi import APIRouter, Query, Request, Response, status
from psycopg.types.json import Jsonb
from pydantic import BaseModel, ConfigDict, Field, StringConstraints

from property_rental.browser_security import require_browser_mutation
from property_rental.identity import ActorResolver
from property_rental.products_api import (
    REFUSED,
    Id,
    Json,
    ProductConflict,
    ProductUnavailable,
    _http,
    _refusal,
    _require,
)
from property_rental.settings import Settings

SHORT_STAYS_READ = "short_stays.read"
SHORT_STAYS_DESK = "short_stays.desk"
SiteText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)]
Note = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=500)]
Day = Annotated[date, Field(strict=False)]


class ShortStayFlow(Protocol):
    def calendar(self, property_id: UUID, start: date, days: int, *, actor_id: str) -> Json: ...

    def price(
        self, property_id: UUID, unit_id: UUID, check_in: date, check_out: date, *, actor_id: str
    ) -> Json: ...

    def bookings(self, property_id: UUID, *, actor_id: str) -> list[Json]: ...

    def booking(self, property_id: UUID, booking_id: UUID, *, actor_id: str) -> Json: ...

    def book(self, property_id: UUID, booking: Json, *, actor_id: str) -> UUID: ...


class UnavailableShortStayFlow:
    def calendar(self, property_id: UUID, start: date, days: int, **_: object) -> Json:
        raise ProductUnavailable

    def price(
        self, property_id: UUID, unit_id: UUID, check_in: date, check_out: date, **_: object
    ) -> Json:
        raise ProductUnavailable

    def bookings(self, property_id: UUID, **_: object) -> list[Json]:
        raise ProductUnavailable

    def booking(self, property_id: UUID, booking_id: UUID, **_: object) -> Json:
        raise ProductUnavailable

    def book(self, property_id: UUID, booking: Json, **_: object) -> UUID:
        raise ProductUnavailable


def _json(value: object) -> Json:
    if not isinstance(value, dict):
        raise ProductUnavailable("Short-stay persistence is unavailable")
    return {str(key): item for key, item in value.items()}


class PostgresShortStayFlow:
    def __init__(self, database_url: str) -> None:
        self._database_url = database_url

    def _one(self, query: str, parameters: tuple[object, ...]) -> object:
        try:
            with psycopg.connect(self._database_url) as connection:
                row = connection.execute(query, parameters).fetchone()
        except psycopg.Error as exc:
            # Two people booking the same night at once: the database keeps one.
            if exc.sqlstate == "23P01":
                raise ProductConflict("The Unit is already booked on one of these nights") from exc
            raise _refusal(exc) from exc
        return None if row is None else row[0]

    def calendar(self, property_id: UUID, start: date, days: int, *, actor_id: str) -> Json:
        return _json(
            self._one(
                "SELECT app.short_stay_calendar(%s, %s, %s, %s)",
                (property_id, start, days, UUID(actor_id)),
            )
        )

    def price(
        self, property_id: UUID, unit_id: UUID, check_in: date, check_out: date, *, actor_id: str
    ) -> Json:
        return _json(
            self._one(
                "SELECT app.short_stay_price_read(%s, %s, %s, %s, %s)",
                (property_id, unit_id, check_in, check_out, UUID(actor_id)),
            )
        )

    def bookings(self, property_id: UUID, *, actor_id: str) -> list[Json]:
        found = self._one(
            "SELECT app.short_stay_bookings_read(%s, %s)", (property_id, UUID(actor_id))
        )
        if not isinstance(found, list):
            raise ProductUnavailable("Short-stay persistence is unavailable")
        return [_json(item) for item in found]

    def booking(self, property_id: UUID, booking_id: UUID, *, actor_id: str) -> Json:
        return _json(
            self._one(
                "SELECT app.short_stay_booking_read(%s, %s, %s)",
                (property_id, booking_id, UUID(actor_id)),
            )
        )

    def book(self, property_id: UUID, booking: Json, *, actor_id: str) -> UUID:
        made = self._one(
            "SELECT app.make_short_stay_booking(%s, %s, %s, %s)",
            (property_id, Jsonb(booking), UUID(actor_id), uuid4()),
        )
        return UUID(str(made))


class NewBooking(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    unit_id: Id
    customer_id: Id
    guest_count: Annotated[int, Field(ge=1, le=10)]
    check_in_on: Day
    check_out_on: Day
    source: Literal["WALK_IN", "PHONE", "TELEGRAM", "WEBSITE", "BOOKING_SITE"]
    site_name: SiteText | None = None
    site_reference: SiteText | None = None
    note: Note | None = None


def create_short_stays_router(
    resolver: ActorResolver, flow: ShortStayFlow, settings: Settings
) -> APIRouter:
    router = APIRouter(prefix="/api/v1/properties/{property_id}/short-stays", tags=["short stays"])

    def envelope(request: Request, data: object) -> Json:
        return {"data": data, "meta": {"request_id": request.state.request_id}}

    def one(property_id: UUID, booking_id: UUID, actor_id: str, request: Request) -> Json:
        try:
            return envelope(request, flow.booking(property_id, booking_id, actor_id=actor_id))
        except REFUSED as exc:
            raise _http(exc) from exc

    @router.get("/calendar")
    def short_stay_calendar(
        property_id: UUID,
        request: Request,
        response: Response,
        start: Annotated[date, Query(alias="from")],
        days: Annotated[int, Query(ge=1, le=62)] = 14,
    ) -> Json:
        actor = _require(request, resolver, SHORT_STAYS_READ, property_id)
        response.headers["Cache-Control"] = "private, no-store"
        try:
            return envelope(
                request, flow.calendar(property_id, start, days, actor_id=actor.actor_id)
            )
        except REFUSED as exc:
            raise _http(exc) from exc

    @router.get("/price")
    def short_stay_price(
        property_id: UUID,
        request: Request,
        response: Response,
        unit_id: UUID,
        check_in_on: date,
        check_out_on: date,
    ) -> Json:
        actor = _require(request, resolver, SHORT_STAYS_READ, property_id)
        response.headers["Cache-Control"] = "private, no-store"
        try:
            return envelope(
                request,
                flow.price(
                    property_id, unit_id, check_in_on, check_out_on, actor_id=actor.actor_id
                ),
            )
        except REFUSED as exc:
            raise _http(exc) from exc

    @router.get("/bookings")
    def list_short_stay_bookings(property_id: UUID, request: Request, response: Response) -> Json:
        actor = _require(request, resolver, SHORT_STAYS_READ, property_id)
        response.headers["Cache-Control"] = "private, no-store"
        try:
            return envelope(request, flow.bookings(property_id, actor_id=actor.actor_id))
        except REFUSED as exc:
            raise _http(exc) from exc

    @router.get("/bookings/{booking_id}")
    def read_short_stay_booking(
        property_id: UUID, booking_id: UUID, request: Request, response: Response
    ) -> Json:
        actor = _require(request, resolver, SHORT_STAYS_READ, property_id)
        response.headers["Cache-Control"] = "private, no-store"
        return one(property_id, booking_id, actor.actor_id, request)

    @router.post("/bookings", status_code=status.HTTP_201_CREATED)
    def make_short_stay_booking(property_id: UUID, booking: NewBooking, request: Request) -> Json:
        actor = _require(request, resolver, SHORT_STAYS_DESK, property_id)
        require_browser_mutation(request, settings)
        body: Json = booking.model_dump(mode="json", exclude_none=True)
        try:
            made = flow.book(property_id, body, actor_id=actor.actor_id)
        except REFUSED as exc:
            raise _http(exc) from exc
        return one(property_id, made, actor.actor_id, request)

    return router


__all__ = [
    "NewBooking",
    "PostgresShortStayFlow",
    "ShortStayFlow",
    "UnavailableShortStayFlow",
    "create_short_stays_router",
]
