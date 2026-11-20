"""HTTP tests for the parking space and type price routes (DL-253 step 2), in-memory flow."""

from __future__ import annotations

from dataclasses import replace
from datetime import date
from uuid import UUID, uuid4

from fastapi.testclient import TestClient

from property_rental.app import create_app
from property_rental.parking_api import (
    ParkingConflict,
    ParkingInvalid,
    ParkingNotFound,
    ParkingSpace,
    TypeItem,
)
from property_rental.unit_api import UnitVersionConflict
from test_unit_api import BROWSER, actor_with


class InMemoryParkingFlow:
    def __init__(self, property_id: UUID) -> None:
        self.property_id = property_id
        self.spaces: dict[UUID, dict[str, object]] = {}
        self.covered = TypeItem(uuid4(), property_id, 1, None)
        self.days: list[date | None] = []

    def list(self, property_id: UUID, *, day: date | None) -> list[dict[str, object]]:
        self.days.append(day)
        return [space for space in self.spaces.values() if property_id == self.property_id]

    def space(self, unit_id: UUID) -> ParkingSpace:
        if unit_id not in self.spaces:
            raise ParkingNotFound(str(unit_id))
        return ParkingSpace(unit_id, self.property_id, int(str(self.spaces[unit_id]["version"])))

    def type_item(self, item_id: UUID) -> TypeItem:
        if item_id != self.covered.item_id:
            raise ParkingNotFound(str(item_id))
        return self.covered

    def set_type_price(
        self, item_id: UUID, *, expected_version: int, price_usd_cents: int | None, actor_id: str
    ) -> TypeItem:
        del actor_id
        if expected_version != self.covered.version:
            raise UnitVersionConflict(self.covered.version)
        self.covered = replace(
            self.type_item(item_id),
            version=self.covered.version + 1,
            default_monthly_rent_usd_cents=price_usd_cents,
        )
        return self.covered

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
        del building_id, actor_id
        if any(space["unit_number"] == unit_number for space in self.spaces.values()):
            raise ParkingConflict("taken", "NUMBER_TAKEN")
        if price_usd_cents is None and self.covered.default_monthly_rent_usd_cents is None:
            raise ParkingInvalid("no price", "TYPE_HAS_NO_PRICE")
        unit_id = uuid4()
        self.spaces[unit_id] = {
            "unit_id": str(unit_id),
            "property_id": str(property_id),
            "unit_number": unit_number,
            "parking_type": parking_type,
            "area": area,
            "parking_capacity": parking_capacity,
            "kept_for_short_stay_guests": kept_for_short_stay_guests,
            "default_monthly_rent_usd_cents": price_usd_cents
            or self.covered.default_monthly_rent_usd_cents,
            "rent_from_type": price_usd_cents is None,
            "version": 1,
            "holds": [],
        }
        return self.spaces[unit_id]

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
        del actor_id
        space = self.spaces[unit_id]
        if expected_version != space["version"]:
            raise UnitVersionConflict(int(str(space["version"])))
        space.update(
            parking_type=parking_type,
            area=area,
            parking_capacity=parking_capacity,
            kept_for_short_stay_guests=kept_for_short_stay_guests,
            rent_from_type=price_usd_cents is None,
            version=expected_version + 1,
        )
        return space


def clients(property_id: UUID, flow: InMemoryParkingFlow) -> tuple[TestClient, ...]:
    def client(*capabilities: str, other: bool = False) -> TestClient:
        target = uuid4() if other else property_id
        return TestClient(
            create_app(
                actor_resolver=lambda _: actor_with(target, *capabilities),
                parking_flow=flow,
            )
        )

    return (
        client("units.read", "property.manage"),
        client("units.read"),
        client("settings.manage"),
        client("units.read", "property.manage", other=True),
    )


def test_spaces_are_read_with_units_read_and_added_by_a_manager() -> None:
    property_id = uuid4()
    flow = InMemoryParkingFlow(property_id)
    manager, reader, _, stranger = clients(property_id, flow)
    url = f"/properties/{property_id}/parking-spaces"
    body = {"unit_number": " P01 ", "parking_type": "COVERED", "area": "Ground floor"}

    assert reader.get(url).json()["data"] == {"items": [], "can_manage": False}
    assert stranger.get(url).status_code == 403
    assert reader.post(url, headers=BROWSER, json=body).status_code == 403
    assert manager.post(url, json=body).status_code == 403  # no browser proof
    # No own price and no Parking Type price: the screen says to set the type price.
    refused = manager.post(url, headers=BROWSER, json=body)
    assert refused.status_code == 422
    assert refused.json()["error"]["code"] == "TYPE_HAS_NO_PRICE"
    created = manager.post(url, headers=BROWSER, json={**body, "price_usd_cents": 3000})
    assert created.status_code == 201
    space = created.json()["data"]
    assert (space["unit_number"], space["parking_capacity"], space["rent_from_type"]) == (
        "P01",
        1,
        False,
    )
    assert created.headers["ETag"] == '"1"'
    taken = manager.post(url, headers=BROWSER, json={**body, "price_usd_cents": 3000})
    assert taken.status_code == 409 and taken.json()["error"]["code"] == "NUMBER_TAKEN"
    for wrong in (
        {**body, "parking_type": "covered"},
        {**body, "area": " "},
        {**body, "parking_capacity": 0},
        {**body, "price_usd_cents": 0},
        {**body, "unit_number": "P" * 21},
    ):
        assert manager.post(url, headers=BROWSER, json=wrong).status_code == 422
    listed = manager.get(f"{url}?on=2026-11-20")
    assert [item["unit_number"] for item in listed.json()["data"]["items"]] == ["P01"]
    assert flow.days[-1] == date(2026, 11, 20)


def test_a_space_is_changed_whole_with_its_version() -> None:
    property_id = uuid4()
    flow = InMemoryParkingFlow(property_id)
    manager, reader, _, _ = clients(property_id, flow)
    created = manager.post(
        f"/properties/{property_id}/parking-spaces",
        headers=BROWSER,
        json={
            "unit_number": "MOTO",
            "parking_type": "MOTORBIKE",
            "area": "Back yard",
            "parking_capacity": 20,
            "price_usd_cents": 500,
        },
    ).json()["data"]
    url = f"/parking-spaces/{created['unit_id']}"
    body = {"parking_type": "MOTORBIKE", "area": "Back yard", "parking_capacity": 25}
    assert reader.put(url, headers={**BROWSER, "If-Match": '"1"'}, json=body).status_code == 403
    assert manager.put(url, headers={**BROWSER, "If-Match": '"7"'}, json=body).status_code == 412
    changed = manager.put(url, headers={**BROWSER, "If-Match": '"1"'}, json=body)
    assert changed.status_code == 200
    assert (changed.json()["data"]["parking_capacity"], changed.headers["ETag"]) == (25, '"2"')
    assert changed.json()["data"]["rent_from_type"] is True
    assert (
        manager.put(
            f"/parking-spaces/{uuid4()}", headers={**BROWSER, "If-Match": '"1"'}, json=body
        ).status_code
        == 404
    )


def test_a_type_price_is_set_with_settings_access() -> None:
    property_id = uuid4()
    flow = InMemoryParkingFlow(property_id)
    manager, _, settings, _ = clients(property_id, flow)
    url = f"/unit-setup/items/{flow.covered.item_id}/price"
    body = {"default_monthly_rent_usd_cents": 3500}
    assert manager.put(url, headers={**BROWSER, "If-Match": '"1"'}, json=body).status_code == 403
    assert settings.put(url, headers={**BROWSER, "If-Match": '"2"'}, json=body).status_code == 412
    assert (
        settings.put(
            url, headers={**BROWSER, "If-Match": '"1"'}, json={"default_monthly_rent_usd_cents": -1}
        ).status_code
        == 422
    )
    priced = settings.put(url, headers={**BROWSER, "If-Match": '"1"'}, json=body)
    assert priced.status_code == 200
    assert priced.json()["data"]["default_monthly_rent_usd_cents"] == 3500
    cleared = settings.put(
        url, headers={**BROWSER, "If-Match": '"2"'}, json={"default_monthly_rent_usd_cents": None}
    )
    assert cleared.json()["data"] == {
        "item_id": str(flow.covered.item_id),
        "version": 3,
        "default_monthly_rent_usd_cents": None,
    }
    assert (
        settings.put(
            f"/unit-setup/items/{uuid4()}/price", headers={**BROWSER, "If-Match": '"1"'}, json=body
        ).status_code
        == 404
    )
