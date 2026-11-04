"""Daily and weekly rent: calendar, price and bookings (phase 6 step 2).

`GET .../short-stays/calendar` shows every Unit with its bookings, Leases and Reservation for
1 to 62 days, `GET .../short-stays/price` prices a stay in one Unit (with the monthly hint and why
the Unit cannot be booked), and `GET .../short-stays/bookings` and `.../bookings/{id}` read
bookings (`short_stays.read`). `POST .../short-stays/bookings` makes a booking for a guest who is a
Customer (`short_stays.desk`). Step 3 adds the booking's actions: bill, paid on the site,
deposit, check-in, check-out and ending the deposit (`short_stays.desk`), the room check
(`short_stays.housekeeping`) and the decision on damage (`short_stays.approve`). The database
functions check the rights again, price the stay from the owner's rules and keep one booking per
Unit and night.
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
SHORT_STAYS_HOUSEKEEPING = "short_stays.housekeeping"
SHORT_STAYS_APPROVE = "short_stays.approve"
SiteText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)]
Note = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=500)]
Day = Annotated[date, Field(strict=False)]
Action = Literal[
    "bill",
    "paid_on_site",
    "deposit",
    "check_in",
    "check_out",
    "room_check",
    "decide",
    "end_deposit",
]
# Step 3 (migration 20270602_312): each action is one database function that checks the right
# again. "version" is the booking version the screen read (refused with 412 when it changed).
ACTION_SQL: dict[str, str] = {
    "bill": "SELECT app.bill_short_stay(%(p)s, %(t)s, %(v)s, %(a)s, %(c)s)",
    "paid_on_site": "SELECT app.mark_short_stay_paid_on_site(%(p)s, %(t)s, %(v)s, %(a)s, %(c)s)",
    "deposit": "SELECT app.take_short_stay_deposit(%(p)s, %(t)s, %(b)s, %(a)s, %(c)s)",
    "check_in": "SELECT app.check_in_short_stay(%(p)s, %(t)s, %(b)s, %(v)s, %(a)s, %(c)s)",
    "check_out": "SELECT app.check_out_short_stay(%(p)s, %(t)s, %(v)s, %(a)s, %(c)s)",
    "room_check": "SELECT app.check_short_stay_room(%(p)s, %(t)s, %(b)s, %(a)s, %(c)s)",
    "decide": "SELECT app.decide_short_stay_damage(%(p)s, %(t)s, %(b)s, %(a)s, %(c)s)",
    "end_deposit": "SELECT app.end_short_stay_deposit(%(p)s, %(t)s, %(a)s, %(c)s)",
}


class ShortStayFlow(Protocol):
    def calendar(self, property_id: UUID, start: date, days: int, *, actor_id: str) -> Json: ...

    def price(
        self, property_id: UUID, unit_id: UUID, check_in: date, check_out: date, *, actor_id: str
    ) -> Json: ...

    def bookings(self, property_id: UUID, *, actor_id: str) -> list[Json]: ...

    def booking(self, property_id: UUID, booking_id: UUID, *, actor_id: str) -> Json: ...

    def book(self, property_id: UUID, booking: Json, *, actor_id: str) -> UUID: ...

    def act(
        self, property_id: UUID, action: Action, target: UUID, body: Json, *, actor_id: str
    ) -> Json: ...


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

    def act(self, property_id: UUID, action: Action, target: UUID, body: Json, **_: object) -> Json:
        raise ProductUnavailable


def _json(value: object) -> Json:
    if not isinstance(value, dict):
        raise ProductUnavailable("Short-stay persistence is unavailable")
    return {str(key): item for key, item in value.items()}


class PostgresShortStayFlow:
    def __init__(self, database_url: str) -> None:
        self._database_url = database_url

    def _one(self, query: str, parameters: tuple[object, ...] | dict[str, object]) -> object:
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

    def act(
        self, property_id: UUID, action: Action, target: UUID, body: Json, *, actor_id: str
    ) -> Json:
        version = body.pop("version", None)
        return _json(
            self._one(
                ACTION_SQL[action],
                {
                    "p": property_id,
                    "t": target,
                    "v": version,
                    "b": Jsonb(body),
                    "a": UUID(actor_id),
                    "c": uuid4(),
                },
            )
        )


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


class Version(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    version: Annotated[int, Field(ge=1)]


class CheckIn(Version):
    id_copy_made: bool
    house_rules_signed: bool


class Deposit(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    kind: Literal["CASH", "CARD_HOLD"]
    # Only the card machine's hold reference; a card number is refused by the database.
    hold_reference: (
        Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=60)] | None
    ) = None
    card_last4: Annotated[str, StringConstraints(pattern=r"^[0-9]{4}$")] | None = None


class RoomCheck(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    note: Note | None = None
    damage: Note | None = None
    damage_usd_cents: Annotated[int, Field(ge=1, le=100_000_000)] | None = None


class Decision(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    approve: bool
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

    def act(
        request: Request,
        property_id: UUID,
        right: str,
        action: Action,
        target: UUID,
        body: BaseModel | None,
    ) -> Json:
        actor = _require(request, resolver, right, property_id)
        require_browser_mutation(request, settings)
        sent: Json = {} if body is None else body.model_dump(mode="json", exclude_none=True)
        try:
            return envelope(
                request, flow.act(property_id, action, target, sent, actor_id=actor.actor_id)
            )
        except REFUSED as exc:
            raise _http(exc) from exc

    @router.post("/bookings/{booking_id}/bill")
    def bill_short_stay(
        property_id: UUID, booking_id: UUID, body: Version, request: Request
    ) -> Json:
        return act(request, property_id, SHORT_STAYS_DESK, "bill", booking_id, body)

    @router.post("/bookings/{booking_id}/paid-on-site")
    def short_stay_paid_on_site(
        property_id: UUID, booking_id: UUID, body: Version, request: Request
    ) -> Json:
        return act(request, property_id, SHORT_STAYS_DESK, "paid_on_site", booking_id, body)

    @router.post("/bookings/{booking_id}/deposit")
    def take_short_stay_deposit(
        property_id: UUID, booking_id: UUID, body: Deposit, request: Request
    ) -> Json:
        return act(request, property_id, SHORT_STAYS_DESK, "deposit", booking_id, body)

    @router.post("/bookings/{booking_id}/deposit/end")
    def end_short_stay_deposit(property_id: UUID, booking_id: UUID, request: Request) -> Json:
        return act(request, property_id, SHORT_STAYS_DESK, "end_deposit", booking_id, None)

    @router.post("/bookings/{booking_id}/check-in")
    def check_in_short_stay(
        property_id: UUID, booking_id: UUID, body: CheckIn, request: Request
    ) -> Json:
        return act(request, property_id, SHORT_STAYS_DESK, "check_in", booking_id, body)

    @router.post("/bookings/{booking_id}/check-out")
    def check_out_short_stay(
        property_id: UUID, booking_id: UUID, body: Version, request: Request
    ) -> Json:
        return act(request, property_id, SHORT_STAYS_DESK, "check_out", booking_id, body)

    @router.post("/bookings/{booking_id}/room-check")
    def check_short_stay_room(
        property_id: UUID, booking_id: UUID, body: RoomCheck, request: Request
    ) -> Json:
        return act(request, property_id, SHORT_STAYS_HOUSEKEEPING, "room_check", booking_id, body)

    @router.post("/damages/{damage_id}/decision")
    def decide_short_stay_damage(
        property_id: UUID, damage_id: UUID, body: Decision, request: Request
    ) -> Json:
        return act(request, property_id, SHORT_STAYS_APPROVE, "decide", damage_id, body)

    return router


__all__ = [
    "NewBooking",
    "PostgresShortStayFlow",
    "ShortStayFlow",
    "UnavailableShortStayFlow",
    "create_short_stays_router",
]
