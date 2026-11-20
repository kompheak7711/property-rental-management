"""HTTP tests for the vehicles of a Customer (DL-253 step 3), in-memory flow."""

from __future__ import annotations

from uuid import UUID, uuid4

from fastapi.testclient import TestClient

from property_rental.app import create_app
from property_rental.unit_api import UnitVersionConflict
from property_rental.vehicles_api import (
    VehicleConflict,
    VehicleFields,
    VehicleNotFound,
    VehicleRecord,
)
from test_unit_api import BROWSER, actor_with


class InMemoryVehicleFlow:
    def __init__(self, property_id: UUID, customer_id: UUID) -> None:
        self.property_id = property_id
        self.customer_id = customer_id
        self.vehicles: dict[UUID, dict[str, object]] = {}
        self.held: set[UUID] = set()

    def customer_property(self, customer_id: UUID) -> UUID:
        if customer_id != self.customer_id:
            raise VehicleNotFound(str(customer_id))
        return self.property_id

    def list(self, customer_id: UUID) -> list[dict[str, object]]:
        return [v for v in self.vehicles.values() if v["customer_id"] == str(customer_id)]

    def vehicle(self, vehicle_id: UUID) -> VehicleRecord:
        if vehicle_id not in self.vehicles:
            raise VehicleNotFound(str(vehicle_id))
        version = int(str(self.vehicles[vehicle_id]["version"]))
        return VehicleRecord(vehicle_id, self.property_id, self.customer_id, version)

    def create(
        self, property_id: UUID, customer_id: UUID, fields: VehicleFields, *, actor_id: str
    ) -> dict[str, object]:
        del property_id, actor_id
        vehicle_id = uuid4()
        self.vehicles[vehicle_id] = {
            "vehicle_id": str(vehicle_id),
            "customer_id": str(customer_id),
            "vehicle_type": fields.vehicle_type,
            "plate_text": fields.plate_text,
            "colour": fields.colour,
            "brand_model": fields.brand_model,
            "sticker_number": fields.sticker_number,
            "version": 1,
            "holds": [],
        }
        return self.vehicles[vehicle_id]

    def update(
        self, vehicle_id: UUID, fields: VehicleFields, *, expected_version: int, actor_id: str
    ) -> dict[str, object]:
        del actor_id
        vehicle = self.vehicles[vehicle_id]
        if expected_version != vehicle["version"]:
            raise UnitVersionConflict(int(str(vehicle["version"])))
        if vehicle_id in self.held and fields.vehicle_type != vehicle["vehicle_type"]:
            raise VehicleConflict("held", "VEHICLE_TYPE")
        vehicle.update(
            vehicle_type=fields.vehicle_type,
            plate_text=fields.plate_text,
            colour=fields.colour,
            brand_model=fields.brand_model,
            sticker_number=fields.sticker_number,
            version=expected_version + 1,
        )
        return vehicle


def clients(property_id: UUID, flow: InMemoryVehicleFlow) -> tuple[TestClient, ...]:
    def client(*capabilities: str, other: bool = False) -> TestClient:
        target = uuid4() if other else property_id
        return TestClient(
            create_app(
                actor_resolver=lambda _: actor_with(target, *capabilities),
                vehicle_flow=flow,
            )
        )

    return (
        client("customers.manage"),
        client("customers.read"),
        client("customers.manage", other=True),
    )


def test_vehicles_are_read_with_customers_read_and_added_with_customers_manage() -> None:
    property_id, customer_id = uuid4(), uuid4()
    flow = InMemoryVehicleFlow(property_id, customer_id)
    manager, reader, stranger = clients(property_id, flow)
    url = f"/customers/{customer_id}/vehicles"
    body = {"vehicle_type": "CAR", "plate_text": " 2A-1234 ", "colour": " ", "brand_model": "Lexus"}

    read = reader.get(url)
    assert read.json()["data"] == {"items": [], "can_manage": False}
    assert read.headers["Cache-Control"] == "private, no-store"
    assert stranger.get(url).status_code == 404
    assert manager.get(f"/customers/{uuid4()}/vehicles").status_code == 404
    assert reader.post(url, headers=BROWSER, json=body).status_code == 403
    assert manager.post(url, json=body).status_code == 403  # no browser proof
    added = manager.post(url, headers=BROWSER, json=body)
    assert added.status_code == 201 and added.headers["ETag"] == '"1"'
    vehicle = added.json()["data"]
    # The plate is trimmed; an empty colour is no colour.
    assert (vehicle["plate_text"], vehicle["colour"], vehicle["brand_model"]) == (
        "2A-1234",
        None,
        "Lexus",
    )
    for wrong in (
        {**body, "vehicle_type": "BUS"},
        {**body, "plate_text": "  "},
        {**body, "plate_text": "P" * 33},
        {**body, "sticker_number": "S" * 33},
        {**body, "owner": "x"},
    ):
        assert manager.post(url, headers=BROWSER, json=wrong).status_code == 422
    listed = manager.get(url).json()["data"]
    assert listed["can_manage"] is True
    assert [item["plate_text"] for item in listed["items"]] == ["2A-1234"]


def test_a_vehicle_is_corrected_whole_with_its_version() -> None:
    property_id, customer_id = uuid4(), uuid4()
    flow = InMemoryVehicleFlow(property_id, customer_id)
    manager, reader, stranger = clients(property_id, flow)
    vehicle = manager.post(
        f"/customers/{customer_id}/vehicles",
        headers=BROWSER,
        json={"vehicle_type": "MOTORBIKE", "plate_text": "1B-777"},
    ).json()["data"]
    url = f"/vehicles/{vehicle['vehicle_id']}"
    body = {"vehicle_type": "MOTORBIKE", "plate_text": "1B-778", "sticker_number": "S-12"}

    assert reader.put(url, headers={**BROWSER, "If-Match": '"1"'}, json=body).status_code == 403
    assert stranger.put(url, headers={**BROWSER, "If-Match": '"1"'}, json=body).status_code == 404
    assert manager.put(url, headers={**BROWSER, "If-Match": '"3"'}, json=body).status_code == 412
    changed = manager.put(url, headers={**BROWSER, "If-Match": '"1"'}, json=body)
    assert changed.status_code == 200 and changed.headers["ETag"] == '"2"'
    assert changed.json()["data"]["sticker_number"] == "S-12"
    # A vehicle that holds a space keeps a type that fits it.
    flow.held.add(UUID(vehicle["vehicle_id"]))
    refused = manager.put(
        url, headers={**BROWSER, "If-Match": '"2"'}, json={**body, "vehicle_type": "CAR"}
    )
    assert refused.status_code == 409 and refused.json()["error"]["code"] == "VEHICLE_TYPE"
    missing = manager.put(f"/vehicles/{uuid4()}", headers={**BROWSER, "If-Match": '"1"'}, json=body)
    assert missing.status_code == 404
