"""HTTP tests for parking on a Lease (DL-253, DL-254, DL-255, DL-258), in-memory flow."""

from __future__ import annotations

from datetime import date
from uuid import UUID, uuid4

from fastapi.testclient import TestClient

from property_rental.app import create_app
from property_rental.lease_parking_api import LeaseParkingConflict, LeaseParkingNotFound
from test_unit_api import BROWSER, actor_with


class InMemoryLeaseParkingFlow:
    def __init__(self, property_id: UUID, lease_id: UUID) -> None:
        self.property_id = property_id
        self.lease_id = lease_id
        self.term_id = uuid4()
        self.space_id = uuid4()
        self.hold_record: dict[str, object] | None = None

    def lease_property(self, lease_id: UUID) -> UUID:
        if lease_id != self.lease_id:
            raise LeaseParkingNotFound(str(lease_id))
        return self.property_id

    def read(self, lease_id: UUID) -> dict[str, object]:
        return {
            "lease_id": str(lease_id),
            "lease_status": "DRAFTED",
            "terms": [
                {
                    "lease_service_term_id": str(self.term_id),
                    "service_name": "Car parking",
                    "hold": self.hold_record,
                    "free_spaces": [],
                }
            ],
            "vehicles": [],
        }

    def hold(
        self,
        lease_id: UUID,
        *,
        term_id: UUID,
        space_unit_id: UUID,
        vehicle_id: UUID | None,
        actor_id: str,
    ) -> dict[str, object]:
        del lease_id, actor_id
        if term_id != self.term_id:
            raise LeaseParkingNotFound(str(term_id))
        if self.hold_record is not None:
            raise LeaseParkingConflict("held", "PARKING_ALREADY_HELD")
        if space_unit_id != self.space_id:
            raise LeaseParkingConflict("taken", "PARKING_SPACE_TAKEN")
        self.hold_record = {
            "space_unit_id": str(space_unit_id),
            "vehicle_id": None if vehicle_id is None else str(vehicle_id),
            "monthly_price_usd_cents": 3500,
        }
        return self.hold_record

    def pick_vehicle(self, lease_id: UUID, *, vehicle_id: UUID, actor_id: str) -> dict[str, object]:
        del actor_id
        if lease_id != self.lease_id:
            raise LeaseParkingNotFound(str(lease_id))
        if vehicle_id == self.space_id:  # stands for a vehicle that does not fit the space
            raise LeaseParkingConflict("type", "VEHICLE_TYPE")
        self.hold_record = {"hold_kind": "PARKING_AGREEMENT", "vehicle_id": str(vehicle_id)}
        return self.hold_record

    def change_vehicle(
        self,
        lease_id: UUID,
        *,
        hold_id: UUID,
        vehicle_id: UUID,
        change_date: date,
        reason: str,
        actor_id: str,
    ) -> dict[str, object]:
        del lease_id, actor_id
        if hold_id != self.space_id:  # the space id stands for the one hold here
            raise LeaseParkingNotFound(str(hold_id))
        if change_date < date(2027, 1, 1):
            raise LeaseParkingConflict("day", "CHANGE_DATE")
        self.hold_record = {"vehicle_id": str(vehicle_id), "reason": reason}
        return self.hold_record

    def end_agreement(
        self,
        lease_id: UUID,
        *,
        told_by: str,
        told_on: date,
        note: str | None,
        actor_id: str,
    ) -> dict[str, object]:
        del actor_id
        if told_on > date(2027, 3, 31):
            raise LeaseParkingConflict("day", "TOLD_DATE")
        return {
            "lease_id": str(lease_id),
            "ending": {"told_by": told_by, "told_on": told_on.isoformat(), "note": note},
        }


def clients(property_id: UUID, flow: InMemoryLeaseParkingFlow) -> tuple[TestClient, ...]:
    def client(*capabilities: str, other: bool = False) -> TestClient:
        target = uuid4() if other else property_id
        return TestClient(
            create_app(
                actor_resolver=lambda _: actor_with(target, *capabilities),
                lease_parking_flow=flow,
            )
        )

    return client("leases.draft"), client("leases.read"), client("leases.draft", other=True)


def test_a_drafter_picks_the_space_of_a_lease_parking_service_once() -> None:
    property_id, lease_id = uuid4(), uuid4()
    flow = InMemoryLeaseParkingFlow(property_id, lease_id)
    drafter, reader, stranger = clients(property_id, flow)
    url = f"/leases/{lease_id}/parking"
    body = {"lease_service_term_id": str(flow.term_id), "space_unit_id": str(flow.space_id)}

    read = reader.get(url)
    assert read.status_code == 200 and read.json()["data"]["can_pick"] is False
    assert read.headers["Cache-Control"] == "private, no-store"
    assert drafter.get(url).json()["data"]["can_pick"] is True
    assert stranger.get(url).status_code == 404
    assert drafter.get(f"/leases/{uuid4()}/parking").status_code == 404

    holds = f"/leases/{lease_id}/parking-holds"
    assert reader.post(holds, headers=BROWSER, json=body).status_code == 403
    assert drafter.post(holds, json=body).status_code == 403  # no browser proof
    assert drafter.post(holds, headers=BROWSER, json={**body, "extra": 1}).status_code == 422
    taken = drafter.post(holds, headers=BROWSER, json={**body, "space_unit_id": str(uuid4())})
    assert taken.status_code == 409 and taken.json()["error"]["code"] == "PARKING_SPACE_TAKEN"
    picked = drafter.post(holds, headers=BROWSER, json=body)
    assert picked.status_code == 201
    assert picked.json()["data"]["monthly_price_usd_cents"] == 3500
    again = drafter.post(holds, headers=BROWSER, json=body)
    assert again.status_code == 409 and again.json()["error"]["code"] == "PARKING_ALREADY_HELD"
    missing = drafter.post(
        holds, headers=BROWSER, json={**body, "lease_service_term_id": str(uuid4())}
    )
    assert missing.status_code == 404


def test_a_drafter_picks_the_vehicle_of_a_parking_agreement() -> None:
    property_id, lease_id = uuid4(), uuid4()
    flow = InMemoryLeaseParkingFlow(property_id, lease_id)
    drafter, reader, stranger = clients(property_id, flow)
    url = f"/leases/{lease_id}/agreement-vehicle"
    car = str(uuid4())

    assert reader.post(url, headers=BROWSER, json={"vehicle_id": car}).status_code == 403
    assert stranger.post(url, headers=BROWSER, json={"vehicle_id": car}).status_code == 404
    assert drafter.post(url, json={"vehicle_id": car}).status_code == 403  # no browser proof
    assert drafter.post(url, headers=BROWSER, json={}).status_code == 422
    unfit = drafter.post(url, headers=BROWSER, json={"vehicle_id": str(flow.space_id)})
    assert unfit.status_code == 409 and unfit.json()["error"]["code"] == "VEHICLE_TYPE"
    picked = drafter.post(url, headers=BROWSER, json={"vehicle_id": car})
    assert picked.status_code == 201 and picked.json()["data"]["vehicle_id"] == car


def test_a_drafter_changes_the_vehicle_of_a_held_space_from_a_day() -> None:
    property_id, lease_id = uuid4(), uuid4()
    flow = InMemoryLeaseParkingFlow(property_id, lease_id)
    drafter, reader, stranger = clients(property_id, flow)
    url = f"/leases/{lease_id}/parking-holds/{flow.space_id}/vehicle-changes"
    car = str(uuid4())
    body = {"vehicle_id": car, "change_date": "2027-03-01", "reason": " Sold the old car "}

    assert reader.post(url, headers=BROWSER, json=body).status_code == 403
    assert stranger.post(url, headers=BROWSER, json=body).status_code == 404
    assert drafter.post(url, json=body).status_code == 403  # no browser proof
    assert drafter.post(url, headers=BROWSER, json={**body, "reason": ""}).status_code == 422
    early = drafter.post(url, headers=BROWSER, json={**body, "change_date": "2026-12-31"})
    assert early.status_code == 409 and early.json()["error"]["code"] == "CHANGE_DATE"
    other_hold = f"/leases/{lease_id}/parking-holds/{uuid4()}/vehicle-changes"
    assert drafter.post(other_hold, headers=BROWSER, json=body).status_code == 404
    changed = drafter.post(url, headers=BROWSER, json=body)
    assert changed.status_code == 201
    assert changed.json()["data"] == {"vehicle_id": car, "reason": "Sold the old car"}


def test_a_manager_ends_a_month_to_month_agreement_by_notice() -> None:
    property_id, lease_id = uuid4(), uuid4()
    flow = InMemoryLeaseParkingFlow(property_id, lease_id)
    drafter, reader, _ = clients(property_id, flow)
    manager = TestClient(
        create_app(
            actor_resolver=lambda _: actor_with(property_id, "leases.terminate"),
            lease_parking_flow=flow,
        )
    )
    url = f"/leases/{lease_id}/agreement-ending"
    body = {"told_by": "CUSTOMER", "told_on": "2027-03-10", "note": " Moving away "}

    # Only a Manager or the Owner (leases.terminate) ends it; they also read the card.
    assert drafter.get(f"/leases/{lease_id}/parking").json()["data"]["can_end"] is False
    assert manager.get(f"/leases/{lease_id}/parking").json()["data"]["can_end"] is True
    assert drafter.post(url, headers=BROWSER, json=body).status_code == 403
    assert reader.post(url, headers=BROWSER, json=body).status_code == 403
    assert manager.post(url, json=body).status_code == 403  # no browser proof
    assert manager.post(url, headers=BROWSER, json={**body, "told_by": "AGENT"}).status_code == 422
    late = manager.post(url, headers=BROWSER, json={**body, "told_on": "2027-04-01"})
    assert late.status_code == 409 and late.json()["error"]["code"] == "TOLD_DATE"
    ended = manager.post(url, headers=BROWSER, json=body)
    assert ended.status_code == 201
    data = ended.json()["data"]
    assert data["ending"] == {"told_by": "CUSTOMER", "told_on": "2027-03-10", "note": "Moving away"}
    assert data["can_end"] is True
    blank = manager.post(url, headers=BROWSER, json={**body, "note": "  "})
    assert blank.json()["data"]["ending"]["note"] is None
