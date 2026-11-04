"""Daily and weekly rent API (phase 6 steps 2 and 3).

Reading the calendar, a price and bookings needs `short_stays.read`; a new booking needs
`short_stays.desk` and the browser mutation checks. The database refusals map to 404, 409 and
422, and a night taken at the same moment by someone else is a 409.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from uuid import UUID, uuid4

from fastapi.testclient import TestClient

from property_rental.app import create_app
from property_rental.identity import AuthenticatedActor, CapabilityGrant
from property_rental.products_api import Json, ProductConflict, ProductNotFound
from property_rental.short_stays_api import Action

HEADERS = {
    "Origin": "https://localhost",
    "Cookie": "__Host-prm_csrf=stays-token",
    "X-CSRF-Token": "stays-token",
}


@dataclass
class InMemoryStays:
    property_id: UUID = field(default_factory=uuid4)
    booking_id: UUID = field(default_factory=uuid4)
    taken: bool = False
    calls: list[tuple[str, object]] = field(default_factory=list)

    def _check(self, property_id: UUID, booking_id: UUID | None = None) -> None:
        if property_id != self.property_id or booking_id not in (None, self.booking_id):
            raise ProductNotFound("the booking does not exist")

    def calendar(self, property_id: UUID, start: date, days: int, *, actor_id: str) -> Json:
        self._check(property_id)
        self.calls.append(("calendar", (start, days)))
        return {"from": str(start), "days": days, "units": []}

    def price(
        self, property_id: UUID, unit_id: UUID, check_in: date, check_out: date, *, actor_id: str
    ) -> Json:
        self._check(property_id)
        return {"total_usd_cents": 2900 * (check_out - check_in).days, "blockers": []}

    def bookings(self, property_id: UUID, *, actor_id: str) -> list[Json]:
        self._check(property_id)
        return [{"booking_id": str(self.booking_id)}]

    def booking(self, property_id: UUID, booking_id: UUID, *, actor_id: str) -> Json:
        self._check(property_id, booking_id)
        return {"booking_id": str(self.booking_id), "booking_number": "ST260001"}

    def book(self, property_id: UUID, booking: Json, *, actor_id: str) -> UUID:
        self._check(property_id)
        if self.taken:
            raise ProductConflict("The Unit is already booked on one of these nights")
        self.calls.append(("book", booking))
        return self.booking_id

    def housekeeping(self, property_id: UUID, day: date, *, actor_id: str) -> Json:
        self._check(property_id)
        return {"day": str(day), "tasks": []}

    def act(
        self, property_id: UUID, action: Action, target: UUID, body: Json, *, actor_id: str
    ) -> Json:
        self._check(property_id)
        self.calls.append((action, (target, body)))
        return {"booking_id": str(target), "status": "BOOKED"}


def client(flow: InMemoryStays, *capabilities: str) -> TestClient:
    who = AuthenticatedActor(
        actor_id=str(uuid4()),
        capability_grants=frozenset(
            CapabilityGrant(capability=name, property_ids=frozenset({str(flow.property_id)}))
            for name in capabilities
        ),
    )
    return TestClient(create_app(actor_resolver=lambda _: who, short_stay_flow=flow))


def base(flow: InMemoryStays) -> str:
    return f"/api/v1/properties/{flow.property_id}/short-stays"


def test_reading_needs_short_stays_read() -> None:
    flow = InMemoryStays()
    unit = uuid4()
    for url in (
        f"{base(flow)}/calendar?from=2026-11-10&days=14",
        f"{base(flow)}/price?unit_id={unit}&check_in_on=2026-11-10&check_out_on=2026-11-12",
        f"{base(flow)}/bookings",
        f"{base(flow)}/bookings/{flow.booking_id}",
    ):
        assert client(flow).get(url).status_code == 403
        answer = client(flow, "short_stays.read").get(url)
        assert answer.status_code == 200, url
        assert answer.headers["Cache-Control"] == "private, no-store"
    reader = client(flow, "short_stays.read")
    assert reader.get(f"{base(flow)}/calendar?from=2026-11-10&days=90").status_code == 422
    assert reader.get(f"{base(flow)}/bookings/{uuid4()}").status_code == 404
    price = reader.get(
        f"{base(flow)}/price?unit_id={unit}&check_in_on=2026-11-10&check_out_on=2026-11-13"
    )
    assert price.json()["data"]["total_usd_cents"] == 8700


def test_a_booking_needs_the_desk_right_and_a_valid_form() -> None:
    flow = InMemoryStays()
    body = {
        "unit_id": str(uuid4()),
        "customer_id": str(uuid4()),
        "guest_count": 2,
        "check_in_on": "2026-11-10",
        "check_out_on": "2026-11-12",
        "source": "WALK_IN",
        "note": " Late arrival ",
    }
    url = f"{base(flow)}/bookings"
    assert client(flow, "short_stays.read").post(url, json=body, headers=HEADERS).status_code == 403
    desk = client(flow, "short_stays.read", "short_stays.desk")
    assert desk.post(url, json=body).status_code == 403  # no browser mutation checks
    assert desk.post(url, json=body | {"source": "EMAIL"}, headers=HEADERS).status_code == 422
    assert desk.post(url, json=body | {"guest_count": 11}, headers=HEADERS).status_code == 422
    made = desk.post(url, json=body, headers=HEADERS)
    assert made.status_code == 201 and made.json()["data"]["booking_number"] == "ST260001"
    sent = flow.calls[-1][1]
    assert isinstance(sent, dict)
    assert sent["note"] == "Late arrival" and "site_name" not in sent
    flow.taken = True
    assert desk.post(url, json=body, headers=HEADERS).status_code == 409


def test_each_step_of_a_stay_needs_its_own_right() -> None:
    flow = InMemoryStays()
    booking = f"{base(flow)}/bookings/{flow.booking_id}"
    damage = f"{base(flow)}/damages/{uuid4()}/decision"
    steps = (
        (f"{booking}/bill", {"version": 1}, "short_stays.desk"),
        (f"{booking}/paid-on-site", {"version": 2}, "short_stays.desk"),
        (
            f"{booking}/deposit",
            {"kind": "CARD_HOLD", "hold_reference": "HOLD-1"},
            "short_stays.desk",
        ),
        (
            f"{booking}/check-in",
            {"version": 3, "id_copy_made": True, "house_rules_signed": True},
            "short_stays.desk",
        ),
        (f"{booking}/check-out", {"version": 4}, "short_stays.desk"),
        (
            f"{booking}/room-check",
            {"damage": "Broken lamp", "damage_usd_cents": 8000},
            "short_stays.housekeeping",
        ),
        (damage, {"approve": True}, "short_stays.approve"),
        (f"{booking}/deposit/end", None, "short_stays.desk"),
        (f"{booking}/fee", {"version": 5, "kind": "LATE_CHECK_OUT"}, "short_stays.desk"),
        (f"{booking}/extend", {"version": 6, "check_out_on": "2026-11-12"}, "short_stays.desk"),
        (
            f"{base(flow)}/housekeeping/{uuid4()}",
            {"skip": True, "note": "Do not disturb"},
            "short_stays.housekeeping",
        ),
        (f"{booking}/cancel", {"version": 7, "reason": "Flight changed"}, "short_stays.desk"),
        (f"{booking}/credit", {"amount_usd_cents": 2000, "note": "Sick"}, "short_stays.credit"),
        (f"{booking}/lease", {"lease_id": str(uuid4())}, "short_stays.desk"),
    )
    for url, body, right in steps:
        others = {
            "short_stays.read",
            "short_stays.desk",
            "short_stays.housekeeping",
            "short_stays.approve",
            "short_stays.credit",
        } - {right}
        assert client(flow, *others).post(url, json=body, headers=HEADERS).status_code == 403, url
        answer = client(flow, right).post(url, json=body, headers=HEADERS)
        assert answer.status_code == 200, url
        assert client(flow, right).post(url, json=body).status_code == 403  # no CSRF
    actions = [call[0] for call in flow.calls]
    assert actions == [
        "bill",
        "paid_on_site",
        "deposit",
        "check_in",
        "check_out",
        "room_check",
        "decide",
        "end_deposit",
        "fee",
        "extend",
        "finish_task",
        "cancel",
        "credit",
        "link_lease",
    ]
    desk = client(flow, "short_stays.desk")
    # A card number never reaches the database as last 4 digits; unknown fields are refused.
    for wrong in (
        {"kind": "CARD_HOLD", "card_last4": "41111"},
        {"kind": "CHEQUE"},
        {"kind": "CASH", "card_number": "4111"},
    ):
        assert desk.post(f"{booking}/deposit", json=wrong, headers=HEADERS).status_code == 422
    assert desk.post(f"{booking}/check-in", json={"version": 3}, headers=HEADERS).status_code == 422
    assert desk.post(f"{booking}/cancel", json={"version": 7}, headers=HEADERS).status_code == 422
    for wrong_fee in ({"version": 5, "kind": "PARKING"}, {"kind": "LATE_CHECK_OUT"}):
        assert desk.post(f"{booking}/fee", json=wrong_fee, headers=HEADERS).status_code == 422
    assert (
        desk.post(
            f"{booking}/extend", json={"version": 6, "check_out_on": "soon"}, headers=HEADERS
        ).status_code
        == 422
    )


def test_the_cleaning_list_of_a_day_needs_the_read_right() -> None:
    flow = InMemoryStays()
    url = f"{base(flow)}/housekeeping?day=2026-11-05"
    assert client(flow, "short_stays.housekeeping").get(url).status_code == 403
    answer = client(flow, "short_stays.read").get(url)
    assert answer.status_code == 200
    assert answer.json()["data"] == {"day": "2026-11-05", "tasks": []}
    assert answer.headers["Cache-Control"] == "private, no-store"
