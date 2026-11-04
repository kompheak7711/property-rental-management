"""Daily and weekly rent API (phase 6 step 2).

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
