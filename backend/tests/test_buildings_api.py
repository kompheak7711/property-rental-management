"""HTTP tests for the buildings routes (DL-250), with an in-memory flow."""

from __future__ import annotations

from dataclasses import replace
from uuid import UUID, uuid4

from fastapi.testclient import TestClient

from property_rental.app import create_app
from property_rental.buildings_api import (
    Building,
    BuildingInUse,
    BuildingNameTaken,
    BuildingNotFound,
    BuildingVersionConflict,
    UnavailableBuildingFlow,
    UnitPlace,
)
from property_rental.unit_api import UnitVersionConflict
from test_unit_api import BROWSER, actor_with


class InMemoryBuildingFlow:
    def __init__(self, property_id: UUID) -> None:
        first = Building(
            uuid4(), property_id, "CHETANA Residence", None, "Street 1", None, True, 0, False, 1, 1
        )
        self.buildings: dict[UUID, Building] = {first.building_id: first}
        self.unit = UnitPlace(uuid4(), property_id, first.building_id, 3)
        self.unit_has_history = False

    def list(self, property_id: UUID, *, include_removed: bool) -> tuple[Building, ...]:
        return tuple(
            item
            for item in self.buildings.values()
            if item.property_id == property_id and (include_removed or not item.removed)
        )

    def get(self, building_id: UUID) -> Building:
        if building_id not in self.buildings:
            raise BuildingNotFound(str(building_id))
        return self.buildings[building_id]

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
        del actor_id
        if any(item.name_en.lower() == name_en.lower() for item in self.buildings.values()):
            raise BuildingNameTaken(name_en)
        building = Building(
            uuid4(),
            property_id,
            name_en,
            name_km,
            address_text,
            description,
            takes_short_stays,
            sort_order,
            False,
            1,
        )
        self.buildings[building.building_id] = building
        return building

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
        del actor_id
        current = self.get(building_id)
        if expected_version != current.version:
            raise BuildingVersionConflict(current.version)
        updated = replace(
            current,
            name_en=name_en,
            name_km=name_km,
            address_text=address_text,
            description=description,
            takes_short_stays=takes_short_stays,
            sort_order=sort_order,
            version=current.version + 1,
        )
        self.buildings[building_id] = updated
        return updated

    def remove(self, building_id: UUID, *, expected_version: int, actor_id: str) -> Building:
        del actor_id
        current = self.get(building_id)
        if current.unit_count:
            raise BuildingInUse(str(building_id))
        removed = replace(current, removed=True, version=expected_version + 1)
        self.buildings[building_id] = removed
        return removed

    def unit_place(self, unit_id: UUID) -> UnitPlace:
        if unit_id != self.unit.unit_id:
            raise BuildingNotFound(str(unit_id))
        return self.unit

    def move_unit(
        self,
        unit_id: UUID,
        *,
        building_id: UUID,
        expected_version: int,
        reason: str,
        actor_id: str,
    ) -> UnitPlace:
        del reason, actor_id
        if self.unit_has_history:
            raise BuildingInUse(str(unit_id))
        if expected_version != self.unit.version:
            raise UnitVersionConflict(self.unit.version)
        self.unit = replace(self.unit, building_id=building_id, version=self.unit.version + 1)
        return self.unit


def clients(property_id: UUID, flow: InMemoryBuildingFlow) -> tuple[TestClient, ...]:
    def client(*capabilities: str, other: bool = False) -> TestClient:
        target = uuid4() if other else property_id
        return TestClient(
            create_app(
                actor_resolver=lambda _: actor_with(target, *capabilities),
                building_flow=flow,
            )
        )

    return (
        client("settings.manage"),
        client("units.read", "property.manage"),
        client("settings.manage", "units.read", other=True),
    )


def test_buildings_are_read_with_units_read_and_changed_only_with_settings_access() -> None:
    property_id = uuid4()
    flow = InMemoryBuildingFlow(property_id)
    owner, reader, stranger = clients(property_id, flow)
    url = f"/properties/{property_id}/buildings"

    listed = reader.get(url)
    assert listed.status_code == 200
    assert listed.json()["data"]["can_manage"] is False
    assert [item["name_en"] for item in listed.json()["data"]["items"]] == ["CHETANA Residence"]
    assert stranger.get(url).status_code == 403
    assert reader.post(url, headers=BROWSER, json={"name_en": "Two"}).status_code == 403
    assert owner.post(url, json={"name_en": "Two"}).status_code == 403  # no browser proof

    created = owner.post(
        url, headers=BROWSER, json={"name_en": " Building Two ", "address_text": "Street 2"}
    )
    assert created.status_code == 201
    building = created.json()["data"]
    assert (building["name_en"], building["takes_short_stays"], building["removed"]) == (
        "Building Two",
        False,
        False,
    )
    assert created.headers["ETag"] == '"1"'
    assert owner.post(url, headers=BROWSER, json={"name_en": "building two"}).status_code == 409
    assert owner.post(url, headers=BROWSER, json={"name_en": ""}).status_code == 422
    assert owner.get(url).json()["data"]["can_manage"] is True

    building_url = f"/buildings/{building['building_id']}"
    stale = owner.patch(
        building_url, headers={**BROWSER, "If-Match": '"9"'}, json={"name_en": "Opposite"}
    )
    assert stale.status_code == 412
    assert (
        owner.patch(
            building_url, headers={**BROWSER, "If-Match": '"1"'}, json={"name_en": None}
        ).status_code
        == 422
    )
    changed = owner.patch(
        building_url,
        headers={**BROWSER, "If-Match": '"1"'},
        json={"name_en": "Opposite", "takes_short_stays": True},
    )
    assert changed.status_code == 200
    assert (changed.json()["data"]["name_en"], changed.json()["data"]["version"]) == (
        "Opposite",
        2,
    )
    assert changed.json()["data"]["address_text"] == "Street 2"
    assert (
        reader.patch(
            building_url, headers={**BROWSER, "If-Match": '"2"'}, json={"name_en": "X"}
        ).status_code
        == 403
    )

    removed = owner.post(f"{building_url}/remove", headers={**BROWSER, "If-Match": '"2"'})
    assert removed.status_code == 200 and removed.json()["data"]["removed"] is True
    assert [item["name_en"] for item in owner.get(url).json()["data"]["items"]] == [
        "CHETANA Residence"
    ]
    with_removed = owner.get(f"{url}?include_removed=true").json()["data"]["items"]
    assert len(with_removed) == 2
    first = next(iter(flow.buildings))
    assert (
        owner.post(f"/buildings/{first}/remove", headers={**BROWSER, "If-Match": '"1"'}).status_code
        == 409
    )
    assert (
        owner.patch(
            f"/buildings/{uuid4()}", headers={**BROWSER, "If-Match": '"1"'}, json={"name_en": "X"}
        ).status_code
        == 404
    )


def test_only_a_unit_without_history_moves_and_it_needs_a_reason() -> None:
    property_id = uuid4()
    flow = InMemoryBuildingFlow(property_id)
    owner, reader, _ = clients(property_id, flow)
    target = owner.post(
        f"/properties/{property_id}/buildings", headers=BROWSER, json={"name_en": "Two"}
    ).json()["data"]["building_id"]
    url = f"/units/{flow.unit.unit_id}/building"
    body = {"building_id": target, "reason": "Built in the new building"}

    assert reader.post(url, headers={**BROWSER, "If-Match": '"3"'}, json=body).status_code == 403
    assert (
        owner.post(
            url, headers={**BROWSER, "If-Match": '"3"'}, json={**body, "reason": "  "}
        ).status_code
        == 422
    )
    assert owner.post(url, headers={**BROWSER, "If-Match": '"2"'}, json=body).status_code == 412
    flow.unit_has_history = True
    assert owner.post(url, headers={**BROWSER, "If-Match": '"3"'}, json=body).status_code == 409
    flow.unit_has_history = False
    moved = owner.post(url, headers={**BROWSER, "If-Match": '"3"'}, json=body)
    assert moved.status_code == 200
    assert moved.json()["data"] == {
        "unit_id": str(flow.unit.unit_id),
        "building_id": target,
        "version": 4,
    }
    assert moved.headers["ETag"] == '"4"'
    assert (
        owner.post(
            f"/units/{uuid4()}/building", headers={**BROWSER, "If-Match": '"1"'}, json=body
        ).status_code
        == 404
    )


def test_without_a_database_buildings_are_unavailable() -> None:
    property_id = uuid4()
    client = TestClient(
        create_app(
            actor_resolver=lambda _: actor_with(property_id, "settings.manage"),
            building_flow=UnavailableBuildingFlow(),
        )
    )
    assert client.get(f"/properties/{property_id}/buildings").status_code == 503
