"""PostgreSQL tests for parking spaces, vehicles and space holds (migration 20270812_437, DL-253).

A parking space is a Unit of kind PARKING with a Parking Type. It takes no short stay,
Reservation, Joint Inspection, meter, cleaning or pet. A space is held by a room Lease's parking
Service (Way A) or by a Parking agreement on the space (Way B), never by more vehicles on one day
than its places, and only by a vehicle that fits its Parking Type.
"""

from __future__ import annotations

import os
from collections.abc import Iterator
from datetime import date
from pathlib import Path
from uuid import UUID, uuid4

import psycopg
import pytest
from alembic import command
from alembic.config import Config
from alembic.script import ScriptDirectory
from psycopg import Connection, Error

from test_customer_migration import insert_customer
from test_lease_migration import create_draft
from test_unit_migration import insert_actor, insert_property, insert_unit

REVISION = "20270812_437"
CREATE_VEHICLE = "SELECT app.create_vehicle(%s, %s, %s, %s, %s, %s, %s, %s, %s)"
UPDATE_VEHICLE = "SELECT app.update_vehicle(%s, %s, %s, %s, %s, %s, %s, %s)"
HOLD = (
    "INSERT INTO app.parking_space_holds(id, property_id, space_unit_id, hold_kind, lease_id, "
    "lease_service_term_id, vehicle_id, held_from, held_until, created_by, updated_by, "
    "monthly_price_usd_cents) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)"
)

Db = Connection[tuple[object, ...]]


def _config() -> Config:
    return Config(str(Path(__file__).parents[1] / "alembic.ini"))


@pytest.fixture(scope="session")
def migrated_database_url() -> str:
    database_url = os.environ.get("MIGRATION_DATABASE_URL")
    if database_url is None:
        pytest.skip("MIGRATION_DATABASE_URL is required for migration tests")
    command.upgrade(_config(), "head")
    return database_url.replace("postgresql+psycopg://", "postgresql://", 1)


@pytest.fixture
def connection(migrated_database_url: str) -> Iterator[Db]:
    with psycopg.connect(migrated_database_url) as database_connection:
        yield database_connection
        database_connection.rollback()


def refusal(connection: Db, statement: str, parameters: tuple[object, ...]) -> tuple[str, str]:
    """The SQLSTATE and HINT of a refused statement (the transaction goes on)."""
    connection.execute("SAVEPOINT expected_refusal")
    try:
        connection.execute(statement, parameters)
    except Error as error:
        connection.execute("ROLLBACK TO SAVEPOINT expected_refusal")
        return str(error.sqlstate), str(error.diag.message_hint or "")
    connection.execute("RELEASE SAVEPOINT expected_refusal")
    raise AssertionError("the statement was not refused")


def setup(connection: Db) -> tuple[UUID, UUID]:
    actor_id = insert_actor(connection)
    existing = connection.execute("SELECT id FROM app.properties").fetchone()
    property_id = (
        insert_property(connection, actor_id) if existing is None else UUID(str(existing[0]))
    )
    return actor_id, property_id


def number(prefix: str = "P") -> str:
    return f"{prefix}{uuid4().hex[:6].upper()}"


def insert_space(
    connection: Db,
    actor_id: UUID,
    property_id: UUID,
    *,
    parking_type: str = "COVERED",
    capacity: int = 1,
    kept: bool = False,
) -> UUID:
    space_id = uuid4()
    connection.execute(
        "INSERT INTO app.units(id, property_id, unit_number, floor, unit_type, status, "
        "unit_kind, parking_capacity, kept_for_short_stay_guests, created_by, updated_by) "
        "VALUES (%s, %s, %s, 'G', %s, 'VACANT', 'PARKING', %s, %s, %s, %s)",
        (space_id, property_id, number(), parking_type, capacity, kept, actor_id, actor_id),
    )
    return space_id


def add_vehicle(
    connection: Db,
    actor_id: UUID,
    property_id: UUID,
    customer_id: UUID,
    vehicle_type: str = "CAR",
    plate: str = "2A-1234",
) -> UUID:
    vehicle_id = uuid4()
    connection.execute(
        CREATE_VEHICLE,
        (vehicle_id, property_id, customer_id, vehicle_type, plate, None, None, None, actor_id),
    )
    return vehicle_id


def agreement(connection: Db, actor_id: UUID, space_id: UUID, customer_id: UUID) -> UUID:
    return create_draft(
        connection,
        actor_id=actor_id,
        unit_id=space_id,
        primary_tenant_id=customer_id,
        signed=False,
    )


def hold(
    connection: Db,
    actor_id: UUID,
    property_id: UUID,
    space_id: UUID,
    lease_id: UUID,
    vehicle_id: UUID | None,
    held_from: date,
    held_until: date | None = None,
    *,
    kind: str = "PARKING_AGREEMENT",
    term_id: UUID | None = None,
) -> tuple[object, ...]:
    hold_id = uuid4()
    return (
        hold_id,
        property_id,
        space_id,
        kind,
        lease_id,
        term_id,
        vehicle_id,
        held_from,
        held_until,
        actor_id,
        actor_id,
        # Migration 440: a room Lease's hold keeps the space's price.
        3500 if kind == "ROOM_LEASE" else None,
    )


def test_migration_is_the_single_head_and_forward_only() -> None:
    scripts = ScriptDirectory.from_config(_config())
    assert scripts.get_heads() == ["20270820_445"]  # parking step 3b 440 follows 439
    revision = scripts.get_revision(REVISION)
    assert revision is not None and revision.down_revision == "20270811_434"
    with pytest.raises(RuntimeError, match="forward-only"):
        revision.module.downgrade()


def test_every_property_has_the_four_parking_types_in_english_and_khmer(connection: Db) -> None:
    _, property_id = setup(connection)
    rows = connection.execute(
        "SELECT code, name_en, name_km FROM app.unit_setup_items "
        "WHERE property_id = %s AND list_kind = 'PARKING_TYPE' ORDER BY sort_order",
        (property_id,),
    ).fetchall()
    assert rows == [
        ("COVERED", "Covered", "ចំណតមានដំបូល"),
        ("UNCOVERED", "Uncovered", "ចំណតគ្មានដំបូល"),
        ("MOTORBIKE", "Motorbike", "ម៉ូតូ"),
        ("TUK_TUK_FOOD_CART", "Tuk-Tuk/Food Cart", "តុកតុក/រទេះលក់ម្ហូប"),
    ]
    actor_id = insert_actor(connection)
    new_property = uuid4()
    connection.execute("SAVEPOINT second_property")
    try:
        connection.execute(
            "INSERT INTO app.properties(id, name, created_by, updated_by) "
            "VALUES (%s, 'Second', %s, %s)",
            (new_property, actor_id, actor_id),
        )
    except Error:
        # The one-Property lock: the seed on insert is proved by the trigger function.
        connection.execute("ROLLBACK TO SAVEPOINT second_property")
        source = connection.execute(
            "SELECT prosrc FROM pg_proc WHERE proname = 'seed_unit_setup_items_for_property'"
        ).fetchone()
        assert source is not None and "seed_parking_types" in str(source[0])
        return
    count = connection.execute(
        "SELECT count(*) FROM app.unit_setup_items "
        "WHERE property_id = %s AND list_kind = 'PARKING_TYPE'",
        (new_property,),
    ).fetchone()
    assert count == (4,)


def test_a_space_takes_a_parking_type_and_places_and_never_becomes_a_room(connection: Db) -> None:
    actor_id, property_id = setup(connection)
    space_id = insert_space(
        connection, actor_id, property_id, parking_type="MOTORBIKE", capacity=20
    )
    row = connection.execute(
        "SELECT unit_kind, parking_capacity, kept_for_short_stay_guests FROM app.units "
        "WHERE id = %s",
        (space_id,),
    ).fetchone()
    assert row == ("PARKING", 20, False)

    # A room cannot take a Parking Type, a space cannot take a Unit Type.
    state, _ = refusal(
        connection,
        "INSERT INTO app.units(id, property_id, unit_number, floor, unit_type, status, "
        "created_by, updated_by) VALUES (%s, %s, %s, '1', 'COVERED', 'VACANT', %s, %s)",
        (uuid4(), property_id, number("U"), actor_id, actor_id),
    )
    assert state == "22023"
    state, _ = refusal(
        connection,
        "INSERT INTO app.units(id, property_id, unit_number, floor, unit_type, status, "
        "unit_kind, parking_capacity, created_by, updated_by) "
        "VALUES (%s, %s, %s, 'G', 'STUDIO', 'VACANT', 'PARKING', 1, %s, %s)",
        (uuid4(), property_id, number(), actor_id, actor_id),
    )
    assert state == "22023"
    # Places only on a space, a space always has them; kept for guests only on a space.
    room_id = insert_unit(
        connection, actor_id=actor_id, property_id=property_id, unit_number=number("U")
    )
    for column, value in (("parking_capacity", 1), ("kept_for_short_stay_guests", True)):
        state, _ = refusal(
            connection,
            f"UPDATE app.units SET {column} = %s, version = version + 1 WHERE id = %s",
            (value, room_id),
        )
        assert state == "23514"
    state, _ = refusal(
        connection,
        "UPDATE app.units SET parking_capacity = NULL, version = version + 1 WHERE id = %s",
        (space_id,),
    )
    assert state == "23514"
    state, hint = refusal(
        connection,
        "UPDATE app.units SET unit_kind = 'HOME', parking_capacity = NULL, unit_type = 'STUDIO', "
        "version = version + 1 WHERE id = %s",
        (space_id,),
    )
    assert (state, hint) == ("55000", "PARKING_SPACE")


def test_a_parking_type_in_use_counts_spaces_and_a_unit_type_counts_rooms(connection: Db) -> None:
    actor_id, property_id = setup(connection)
    insert_space(connection, actor_id, property_id, parking_type="TUK_TUK_FOOD_CART")
    in_use = connection.execute(
        "SELECT item.list_kind, app.unit_setup_item_in_use(item) FROM app.unit_setup_items AS item "
        "WHERE item.property_id = %s AND item.code = 'TUK_TUK_FOOD_CART'",
        (property_id,),
    ).fetchall()
    assert in_use == [("PARKING_TYPE", True)]


def test_a_parking_space_takes_no_short_stay_meter_cleaning_pet_or_reservation(
    connection: Db,
) -> None:
    actor_id, property_id = setup(connection)
    space_id = insert_space(connection, actor_id, property_id)
    takes = connection.execute("SELECT app.unit_takes_short_stays(%s)", (space_id,)).fetchone()
    assert takes == (False,)
    state, hint = refusal(
        connection,
        "INSERT INTO app.utility_meters(id, unit_id, serial_number, utility_type, "
        "measurement_unit_code, installed_date, created_by, updated_by) "
        "VALUES (%s, %s, %s, 'ELECTRICITY', 'KWH', DATE '2026-11-01', %s, %s)",
        (uuid4(), space_id, number("M"), actor_id, actor_id),
    )
    assert (state, hint) == ("55000", "PARKING_SPACE")
    customer_id = insert_customer(connection, actor_id)
    lease_id = agreement(connection, actor_id, space_id, customer_id)
    state, hint = refusal(
        connection,
        "INSERT INTO app.lease_pet_approvals(id, lease_id, approved_date, "
        "deposit_required_by_signed_terms, pet_description, approved_by) "
        "VALUES (%s, %s, DATE '2026-11-01', false, 'Cat', %s)",
        (uuid4(), lease_id, actor_id),
    )
    assert (state, hint) == ("55000", "PARKING_SPACE")
    guarded = {
        str(row[0])
        for row in connection.execute(
            "SELECT tgrelid::regclass::text FROM pg_trigger "
            "WHERE tgfoid = 'app.refuse_parking_space()'::regprocedure"
        ).fetchall()
    }
    assert guarded == {
        "app.occupancies",  # migration 441 (DL-254)
        "app.reservations",
        "app.joint_inspections",
        "app.utility_meters",
        "app.unit_cleaning_rates",
        "app.housekeeping_tasks",
        "app.booking_site_calendars",
        "app.lease_pet_approvals",
        "app.short_stay_lease_offers",
    }
    cleaning = connection.execute(
        "SELECT pg_get_triggerdef(oid) FROM pg_trigger "
        "WHERE tgname = 'units_take_type_cleaning_rate'"
    ).fetchone()
    assert cleaning is not None and "unit_kind = 'HOME'" in str(cleaning[0])


def test_vehicles_are_added_corrected_audited_and_never_deleted(connection: Db) -> None:
    actor_id, property_id = setup(connection)
    customer_id = insert_customer(connection, actor_id)
    vehicle_id = uuid4()
    arguments = (vehicle_id, property_id, customer_id, "CAR", "2B 5678", "White", "Toyota", None)
    first = connection.execute(CREATE_VEHICLE, (*arguments, actor_id)).fetchone()
    assert first is not None
    vehicle = first[0]
    assert isinstance(vehicle, dict)
    assert vehicle["plate_match_key"] == "2B5678"
    assert vehicle["brand_model"] == "Toyota" and vehicle["version"] == 1
    # A retry is answered again; another vehicle under the same id is refused.
    again = connection.execute(CREATE_VEHICLE, (*arguments, actor_id)).fetchone()
    assert again == first
    state, _ = refusal(
        connection,
        CREATE_VEHICLE,
        (vehicle_id, property_id, customer_id, "CAR", "2B-9999", None, None, None, actor_id),
    )
    assert state == "23505"
    state, _ = refusal(
        connection,
        CREATE_VEHICLE,
        (uuid4(), property_id, customer_id, "BUS", "2B-1", None, None, None, actor_id),
    )
    assert state == "22023"
    updated = connection.execute(
        UPDATE_VEHICLE, (vehicle_id, 1, "CAR", "2B-5678", "Grey", "Toyota", "S-01", actor_id)
    ).fetchone()
    assert updated is not None
    assert isinstance(updated[0], dict) and updated[0]["version"] == 2
    assert updated[0]["plate_match_key"] == "2B5678" and updated[0]["sticker_number"] == "S-01"
    state, _ = refusal(
        connection,
        UPDATE_VEHICLE,
        (vehicle_id, 1, "CAR", "2B-5678", None, None, None, actor_id),
    )
    assert state == "40001"
    actions = connection.execute(
        "SELECT action, customer_id FROM app.audit_events WHERE entity_id = %s "
        "ORDER BY occurred_at, action",
        (vehicle_id,),
    ).fetchall()
    assert actions == [("vehicle.created", customer_id), ("vehicle.updated", customer_id)]
    state, _ = refusal(connection, "DELETE FROM app.vehicles WHERE id = %s", (vehicle_id,))
    assert state == "55000"


def test_a_numbered_space_is_held_by_one_vehicle_a_day(connection: Db) -> None:
    actor_id, property_id = setup(connection)
    space_id = insert_space(connection, actor_id, property_id)
    first_customer = insert_customer(connection, actor_id, legal_name="Chan Vibol")
    car = add_vehicle(connection, actor_id, property_id, first_customer)
    lease_id = agreement(connection, actor_id, space_id, first_customer)
    connection.execute(
        HOLD,
        hold(
            connection,
            actor_id,
            property_id,
            space_id,
            lease_id,
            car,
            date(2026, 11, 1),
            date(2026, 11, 30),
        ),
    )
    second_customer = insert_customer(connection, actor_id, legal_name="Sok Dara")
    second_car = add_vehicle(connection, actor_id, property_id, second_customer, plate="2C-1")
    other_lease = agreement(connection, actor_id, space_id, second_customer)
    state, hint = refusal(
        connection,
        HOLD,
        hold(
            connection, actor_id, property_id, space_id, other_lease, second_car, date(2026, 11, 30)
        ),
    )
    assert (state, hint) == ("23P01", "PARKING_SPACE_TAKEN")
    connection.execute(
        HOLD,
        hold(
            connection, actor_id, property_id, space_id, other_lease, second_car, date(2026, 12, 1)
        ),
    )
    # The first hold cannot grow into the second one.
    state, hint = refusal(
        connection,
        "UPDATE app.parking_space_holds SET held_until = NULL, version = version + 1 "
        "WHERE lease_id = %s",
        (lease_id,),
    )
    assert (state, hint) == ("23P01", "PARKING_SPACE_TAKEN")


def test_the_shared_motorbike_area_takes_as_many_as_its_places(connection: Db) -> None:
    actor_id, property_id = setup(connection)
    area_id = insert_space(connection, actor_id, property_id, parking_type="MOTORBIKE", capacity=2)
    holds = []
    for index in range(3):
        customer_id = insert_customer(connection, actor_id, legal_name=f"Rider {index}")
        bike = add_vehicle(
            connection, actor_id, property_id, customer_id, "MOTORBIKE", f"1A-{index}"
        )
        holds.append((customer_id, bike))
    lease_id = agreement(connection, actor_id, area_id, holds[0][0])
    for customer_id, _ in holds[1:]:
        connection.execute(
            "INSERT INTO app.lease_signers(id, lease_id, customer_id, signed_at, added_by) "
            "VALUES (%s, %s, %s, NULL, %s)",
            (uuid4(), lease_id, customer_id, actor_id),
        )
    connection.execute(
        HOLD,
        hold(
            connection,
            actor_id,
            property_id,
            area_id,
            lease_id,
            holds[0][1],
            date(2026, 11, 1),
            date(2026, 11, 10),
        ),
    )
    connection.execute(
        HOLD,
        hold(connection, actor_id, property_id, area_id, lease_id, holds[1][1], date(2026, 11, 5)),
    )
    state, hint = refusal(
        connection,
        HOLD,
        hold(connection, actor_id, property_id, area_id, lease_id, holds[2][1], date(2026, 11, 8)),
    )
    assert (state, hint) == ("23P01", "PARKING_SPACE_TAKEN")
    connection.execute(
        HOLD,
        hold(connection, actor_id, property_id, area_id, lease_id, holds[2][1], date(2026, 11, 11)),
    )
    state, hint = refusal(
        connection,
        "UPDATE app.units SET parking_capacity = 1, version = version + 1 WHERE id = %s",
        (area_id,),
    )
    assert (state, hint) == ("23514", "PARKING_CAPACITY")


def test_a_hold_needs_a_fitting_vehicle_of_the_lease_and_a_space_not_kept_for_guests(
    connection: Db,
) -> None:
    actor_id, property_id = setup(connection)
    space_id = insert_space(connection, actor_id, property_id)
    customer_id = insert_customer(connection, actor_id)
    bike = add_vehicle(connection, actor_id, property_id, customer_id, "MOTORBIKE", "1B-1")
    lease_id = agreement(connection, actor_id, space_id, customer_id)
    state, hint = refusal(
        connection,
        HOLD,
        hold(connection, actor_id, property_id, space_id, lease_id, bike, date(2026, 11, 1)),
    )
    assert (state, hint) == ("23514", "VEHICLE_TYPE")
    stranger = insert_customer(connection, actor_id, legal_name="Not on the Lease")
    car = add_vehicle(connection, actor_id, property_id, stranger, plate="2D-7788")
    state, hint = refusal(
        connection,
        HOLD,
        hold(connection, actor_id, property_id, space_id, lease_id, car, date(2026, 11, 1)),
    )
    assert (state, hint) == ("23514", "VEHICLE_NOT_OF_LEASE")
    kept_id = insert_space(connection, actor_id, property_id, kept=True)
    kept_lease = agreement(connection, actor_id, kept_id, customer_id)
    state, hint = refusal(
        connection,
        HOLD,
        hold(connection, actor_id, property_id, kept_id, kept_lease, None, date(2026, 11, 1)),
    )
    assert (state, hint) == ("23514", "PARKING_KEPT_FOR_GUESTS")
    # A Parking agreement holds its own space only.
    other_space = insert_space(connection, actor_id, property_id)
    state, hint = refusal(
        connection,
        HOLD,
        hold(connection, actor_id, property_id, other_space, lease_id, None, date(2026, 11, 1)),
    )
    assert (state, hint) == ("23514", "PARKING_WAY")


def test_a_room_lease_holds_a_space_only_through_a_service_that_needs_one(connection: Db) -> None:
    actor_id, property_id = setup(connection)
    space_id = insert_space(connection, actor_id, property_id, parking_type="UNCOVERED")
    room_id = insert_unit(
        connection, actor_id=actor_id, property_id=property_id, unit_number=number("U")
    )
    customer_id = insert_customer(connection, actor_id)
    car = add_vehicle(connection, actor_id, property_id, customer_id)
    lease_id = create_draft(
        connection, actor_id=actor_id, unit_id=room_id, primary_tenant_id=customer_id, signed=False
    )
    type_id, service_id, approval_id, term_id = uuid4(), uuid4(), uuid4(), uuid4()
    connection.execute(
        "INSERT INTO app.service_types(id, property_id, name_en, one_per_lease, created_by, "
        "updated_by) VALUES (%s, %s, %s, false, %s, %s)",
        (type_id, property_id, f"Parking {type_id.hex[:6]}", actor_id, actor_id),
    )
    connection.execute(
        "INSERT INTO app.property_services(id, property_id, service_code, display_name, "
        "service_type_id, configured_by, created_by, updated_by) "
        "VALUES (%s, %s, %s, 'Car parking', %s, %s, %s, %s)",
        (
            service_id,
            property_id,
            f"PARK_{type_id.hex[:6].upper()}",
            type_id,
            actor_id,
            actor_id,
            actor_id,
        ),
    )
    connection.execute(
        "INSERT INTO app.property_service_approval_periods(id, property_service_id, "
        "effective_from, effective_through, approval_reference, approved_at, approved_by, reason) "
        "VALUES (%s, %s, DATE '2026-01-01', DATE '2028-12-31', 'OWNER-PARK', "
        "statement_timestamp(), %s, 'Approved parking')",
        (approval_id, service_id, actor_id),
    )
    connection.execute(
        "INSERT INTO app.lease_service_terms(id, lease_id, property_service_id, applicable_from, "
        "applicable_through, service_approval_period_id, terms_reference, recorded_at, "
        "recorded_by) VALUES (%s, %s, %s, DATE '2027-01-01', DATE '2027-12-31', %s, "
        "'LEASE-PARK', statement_timestamp(), %s)",
        (term_id, lease_id, service_id, approval_id, actor_id),
    )
    values = hold(
        connection,
        actor_id,
        property_id,
        space_id,
        lease_id,
        car,
        date(2027, 1, 1),
        date(2027, 12, 31),
        kind="ROOM_LEASE",
        term_id=term_id,
    )
    state, hint = refusal(connection, HOLD, values)
    assert (state, hint) == ("23514", "PARKING_WAY")
    connection.execute(
        "UPDATE app.service_types SET needs_parking_space = true, version = version + 1 "
        "WHERE id = %s",
        (type_id,),
    )
    connection.execute(HOLD, values)
    hold_id = values[0]
    # The vehicle changes only through Change vehicle; a hold and a change are never deleted.
    other_car = add_vehicle(connection, actor_id, property_id, customer_id, plate="2E-1")
    state, hint = refusal(
        connection,
        "UPDATE app.parking_space_holds SET vehicle_id = %s, version = version + 1 WHERE id = %s",
        (other_car, hold_id),
    )
    assert (state, hint) == ("55000", "VEHICLE_CHANGE")
    connection.execute("SELECT set_config('app.parking_vehicle_change', 'on', true)")
    connection.execute(
        "UPDATE app.parking_space_holds SET vehicle_id = %s, version = version + 1 WHERE id = %s",
        (other_car, hold_id),
    )
    connection.execute(
        "INSERT INTO app.parking_vehicle_changes(id, property_id, hold_id, old_vehicle_id, "
        "new_vehicle_id, change_date, reason, actor_id) "
        "VALUES (%s, %s, %s, %s, %s, DATE '2027-02-01', 'Customer sold the old car', %s)",
        (uuid4(), property_id, hold_id, car, other_car, actor_id),
    )
    for statement in (
        "DELETE FROM app.parking_space_holds WHERE id = %s",
        "DELETE FROM app.parking_vehicle_changes WHERE hold_id = %s",
        "UPDATE app.parking_vehicle_changes SET reason = 'Other' WHERE hold_id = %s",
    ):
        state, _ = refusal(connection, statement, (hold_id,))
        assert state == "55000"


def test_the_app_reads_parking_but_writes_vehicles_only_through_functions(
    migrated_database_url: str,
) -> None:
    with psycopg.connect(migrated_database_url) as connection:
        rows = connection.execute(
            "SELECT table_name, has_table_privilege('prm_runtime', 'app.' || table_name, "
            "'SELECT'), has_table_privilege('prm_runtime', 'app.' || table_name, 'INSERT') "
            "FROM unnest(ARRAY['vehicles', 'parking_space_holds', 'parking_vehicle_changes']) "
            "AS table_name ORDER BY 1"
        ).fetchall()
        assert rows == [
            ("parking_space_holds", True, False),
            ("parking_vehicle_changes", True, False),
            ("vehicles", True, False),
        ]
        functions = connection.execute(
            "SELECT has_function_privilege('prm_runtime', "
            "'app.create_vehicle(uuid, uuid, uuid, text, text, text, text, text, uuid)', "
            "'EXECUTE'), has_function_privilege('prm_runtime', "
            "'app.check_parking_space_hold()', 'EXECUTE')"
        ).fetchone()
        assert functions == (True, False)
