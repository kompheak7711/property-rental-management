"""PostgreSQL tests for type prices and parking spaces (migration 20270813_438, DL-253 step 2).

Settings keeps a default price per Unit Type and Parking Type. A Unit uses the type price unless
it has its own; when the type price changes, the Units that use it move with it. A parking space
is added with its number, Parking Type, area, places and price, and the Parking list shows who
holds each space on a day.
"""

from __future__ import annotations

import inspect
from collections.abc import Iterator
from datetime import date
from uuid import UUID, uuid4

import psycopg
import pytest
from alembic.script import ScriptDirectory
from psycopg import Connection, Error

from property_rental.unit_api import PostgresUnitResourceFlow
from test_customer_migration import insert_customer
from test_lease_migration import create_draft
from test_parking_spaces_migration import _config, add_vehicle, migrated_database_url, setup
from test_unit_migration import insert_unit

REVISION = "20270813_438"
CREATE = "SELECT * FROM app.create_parking_space(%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)"
UPDATE = "SELECT * FROM app.update_parking_space(%s, %s, %s, %s, %s, %s, %s)"
PRICE = "SELECT app.set_type_price(%s, %s, %s, %s)"
TERMS = "SELECT app.set_unit_rent_terms_with_type(%s, %s, %s, %s::uuid[], %s, %s)"

Db = Connection[tuple[object, ...]]
__all__ = ["migrated_database_url"]


@pytest.fixture
def connection(migrated_database_url: str) -> Iterator[Db]:
    with psycopg.connect(migrated_database_url) as database_connection:
        yield database_connection
        database_connection.rollback()


def refusal(connection: Db, statement: str, parameters: tuple[object, ...]) -> tuple[str, str]:
    connection.execute("SAVEPOINT expected_refusal")
    try:
        connection.execute(statement, parameters)
    except Error as error:
        connection.execute("ROLLBACK TO SAVEPOINT expected_refusal")
        return str(error.sqlstate), str(error.diag.message_hint or "")
    connection.execute("RELEASE SAVEPOINT expected_refusal")
    raise AssertionError("the statement was not refused")


def type_item(connection: Db, property_id: UUID, kind: str, code: str) -> tuple[UUID, int]:
    row = connection.execute(
        "SELECT id, version FROM app.unit_setup_items "
        "WHERE property_id = %s AND list_kind = %s AND code = %s",
        (property_id, kind, code),
    ).fetchone()
    assert row is not None
    return UUID(str(row[0])), int(str(row[1]))


def price_type(connection: Db, actor_id: UUID, item: tuple[UUID, int], cents: int | None) -> int:
    row = connection.execute(PRICE, (item[0], item[1], cents, actor_id)).fetchone()
    assert row is not None and row[0] is not None
    return int(str(row[0]))


def unit_price(connection: Db, unit_id: UUID) -> tuple[object, ...]:
    row = connection.execute(
        "SELECT default_monthly_rent_usd_cents, rent_from_type, version FROM app.units "
        "WHERE id = %s",
        (unit_id,),
    ).fetchone()
    assert row is not None
    return tuple(row)


def number(prefix: str = "P") -> str:
    return f"{prefix}{uuid4().hex[:6].upper()}"


def space(
    connection: Db,
    actor_id: UUID,
    property_id: UUID,
    *,
    parking_type: str = "COVERED",
    capacity: int = 1,
    price: int | None = None,
) -> UUID:
    space_id = uuid4()
    connection.execute(
        CREATE,
        (
            space_id,
            property_id,
            None,
            number(),
            parking_type,
            "Ground floor",
            capacity,
            False,
            price,
            actor_id,
        ),
    )
    return space_id


def test_migration_is_the_single_head_and_forward_only() -> None:
    scripts = ScriptDirectory.from_config(_config())
    assert scripts.get_heads() == ["20270821_446"]  # parking step 3b 440 follows 439
    revision = scripts.get_revision(REVISION)
    assert revision is not None and revision.down_revision == "20270812_437"
    with pytest.raises(RuntimeError, match="forward-only"):
        revision.module.downgrade()


def test_a_type_price_moves_only_the_units_that_use_it(connection: Db) -> None:
    actor_id, property_id = setup(connection)
    studio = type_item(connection, property_id, "UNIT_TYPE", "STUDIO")
    following = insert_unit(
        connection, actor_id=actor_id, property_id=property_id, unit_number=number("U")
    )
    own = insert_unit(
        connection, actor_id=actor_id, property_id=property_id, unit_number=number("U")
    )
    # A Unit cannot use a type price that is not there yet.
    state, hint = refusal(connection, TERMS, (following, 1, None, [], True, actor_id))
    assert (state, hint) == ("22023", "TYPE_HAS_NO_PRICE")
    version = price_type(connection, actor_id, studio, 40000)
    assert version == studio[1] + 1
    connection.execute(TERMS, (following, 1, None, [], True, actor_id))
    connection.execute(TERMS, (own, 1, 45000, [], False, actor_id))
    assert unit_price(connection, following) == (40000, True, 2)
    assert unit_price(connection, own) == (45000, False, 2)

    version = price_type(connection, actor_id, (studio[0], version), 42000)
    assert unit_price(connection, following) == (42000, True, 3)
    assert unit_price(connection, own) == (45000, False, 2)
    reasons = connection.execute(
        "SELECT reason, resulting_state ->> 'default_monthly_rent_usd_cents' "
        "FROM app.audit_events WHERE entity_id = %s AND action = 'unit.rent_terms_changed' "
        "ORDER BY occurred_at",
        (following,),
    ).fetchall()
    assert reasons[-1] == ("The type price changed in Settings", "42000")
    state_row = connection.execute(
        "SELECT resulting_state ->> 'default_monthly_rent_usd_cents' FROM app.audit_events "
        "WHERE entity_id = %s AND action = 'unit_setup_item.updated' "
        "ORDER BY occurred_at DESC LIMIT 1",
        (studio[0],),
    ).fetchone()
    assert state_row == ("42000",)
    # A stale version answers nothing; clearing the price leaves the Unit on its own last price.
    assert connection.execute(PRICE, (studio[0], 1, 1, actor_id)).fetchone() == (None,)
    price_type(connection, actor_id, (studio[0], version), None)
    assert unit_price(connection, following) == (42000, False, 4)
    # Only a Unit Type or Parking Type has a price.
    floor = connection.execute(
        "SELECT id, version FROM app.unit_setup_items WHERE property_id = %s "
        "AND list_kind = 'FEATURE_TYPE' LIMIT 1",
        (property_id,),
    ).fetchone()
    assert floor is not None
    state, _ = refusal(connection, PRICE, (floor[0], floor[1], 100, actor_id))
    assert state == "22023"


def test_a_parking_space_takes_its_own_price_or_the_parking_type_price(connection: Db) -> None:
    actor_id, property_id = setup(connection)
    covered = type_item(connection, property_id, "PARKING_TYPE", "COVERED")
    state, hint = refusal(
        connection,
        CREATE,
        (uuid4(), property_id, None, number(), "COVERED", "Ground floor", 1, False, None, actor_id),
    )
    assert (state, hint) == ("22023", "TYPE_HAS_NO_PRICE")
    own = space(connection, actor_id, property_id, price=5000)
    price_type(connection, actor_id, covered, 3000)
    typed = space(connection, actor_id, property_id)
    assert unit_price(connection, own) == (5000, False, 1)
    assert unit_price(connection, typed) == (3000, True, 1)
    row = connection.execute(
        "SELECT unit_kind, floor, parking_capacity, building_id IS NOT NULL FROM app.units "
        "WHERE id = %s",
        (typed,),
    ).fetchone()
    assert row == ("PARKING", "Ground floor", 1, True)
    actions = connection.execute(
        "SELECT action, reason FROM app.audit_events WHERE entity_id = %s", (typed,)
    ).fetchall()
    assert actions == [("unit.created", "Parking space added")]
    # A retry of the same space answers again; another one under the id is refused.
    retried = connection.execute(
        "SELECT unit_number FROM app.units WHERE id = %s", (typed,)
    ).fetchone()
    assert retried is not None
    again = connection.execute(
        CREATE,
        (typed, property_id, None, retried[0], "COVERED", "Ground floor", 1, False, None, actor_id),
    ).fetchone()
    assert again is not None and again[0] == typed
    state, _ = refusal(
        connection,
        CREATE,
        (typed, property_id, None, number(), "COVERED", "Ground floor", 1, False, None, actor_id),
    )
    assert state == "23505"
    # The number is unique among rooms and spaces.
    state, _ = refusal(
        connection,
        CREATE,
        (uuid4(), property_id, None, retried[0], "COVERED", "Yard", 1, False, 100, actor_id),
    )
    assert state == "23505"
    # A space has no required Services.
    service = connection.execute(
        "SELECT id FROM app.property_services WHERE property_id = %s LIMIT 1", (property_id,)
    ).fetchone()
    if service is not None:
        state, _ = refusal(connection, TERMS, (own, 1, 5000, [service[0]], False, actor_id))
        assert state == "22023"


def test_a_space_changes_type_area_and_places_and_follows_its_new_type_price(
    connection: Db,
) -> None:
    actor_id, property_id = setup(connection)
    price_type(
        connection, actor_id, type_item(connection, property_id, "PARKING_TYPE", "COVERED"), 3000
    )
    uncovered = type_item(connection, property_id, "PARKING_TYPE", "UNCOVERED")
    typed = space(connection, actor_id, property_id)
    state, hint = refusal(
        connection, UPDATE, (typed, 1, "UNCOVERED", "Front yard", 1, False, actor_id)
    )
    assert (state, hint) == ("22023", "TYPE_HAS_NO_PRICE")
    price_type(connection, actor_id, uncovered, 2000)
    changed = connection.execute(
        UPDATE, (typed, 1, "UNCOVERED", "Front yard", 2, True, actor_id)
    ).fetchone()
    assert changed is not None
    assert unit_price(connection, typed) == (2000, True, 3)
    row = connection.execute(
        "SELECT unit_type, floor, parking_capacity, kept_for_short_stay_guests FROM app.units "
        "WHERE id = %s",
        (typed,),
    ).fetchone()
    assert row == ("UNCOVERED", "Front yard", 2, True)
    assert connection.execute(
        UPDATE, (typed, 1, "UNCOVERED", "Front yard", 2, True, actor_id)
    ).fetchone() == (None,) * len(changed)
    room = insert_unit(
        connection, actor_id=actor_id, property_id=property_id, unit_number=number("U")
    )
    state, _ = refusal(connection, UPDATE, (room, 1, "COVERED", "Yard", 1, False, actor_id))
    assert state == "P0002"


def test_the_parking_list_shows_who_holds_each_space_and_the_units_list_leaves_spaces_out(
    connection: Db,
) -> None:
    actor_id, property_id = setup(connection)
    held = space(connection, actor_id, property_id, price=3000)
    free = space(
        connection, actor_id, property_id, parking_type="MOTORBIKE", capacity=20, price=500
    )
    customer_id = insert_customer(connection, actor_id, legal_name="Chan Vibol")
    car = add_vehicle(connection, actor_id, property_id, customer_id, plate="2B-5678")
    lease_id = create_draft(
        connection, actor_id=actor_id, unit_id=held, primary_tenant_id=customer_id, signed=False
    )
    connection.execute(
        "INSERT INTO app.parking_space_holds(id, property_id, space_unit_id, hold_kind, "
        "lease_id, vehicle_id, held_from, created_by, updated_by) "
        "VALUES (%s, %s, %s, 'PARKING_AGREEMENT', %s, %s, DATE '2026-11-01', %s, %s)",
        (uuid4(), property_id, held, lease_id, car, actor_id, actor_id),
    )
    listed = connection.execute(
        "SELECT app.parking_spaces(%s, %s)", (property_id, date(2026, 11, 20))
    ).fetchone()
    assert listed is not None and isinstance(listed[0], list)
    spaces = {item["unit_id"]: item for item in listed[0]}
    holds = spaces[str(held)]["holds"]
    assert [(hold["customer_name"], hold["plate_text"], hold["hold_kind"]) for hold in holds] == [
        ("Chan Vibol", "2B-5678", "PARKING_AGREEMENT")
    ]
    assert spaces[str(free)]["holds"] == []
    assert spaces[str(free)]["parking_capacity"] == 20
    before = connection.execute(
        "SELECT app.parking_spaces(%s, %s)", (property_id, date(2026, 10, 31))
    ).fetchone()
    assert before is not None and isinstance(before[0], list)
    assert {item["unit_id"]: item for item in before[0]}[str(held)]["holds"] == []
    # The Units list reads rooms only (its query runs on its own connection).
    source = inspect.getsource(PostgresUnitResourceFlow.list)
    assert "unit.unit_kind = 'HOME'" in source


def test_the_app_runs_the_new_functions_only(migrated_database_url: str) -> None:
    with psycopg.connect(migrated_database_url) as connection:
        row = connection.execute(
            "SELECT has_function_privilege('prm_runtime', "
            "'app.create_parking_space(uuid, uuid, uuid, text, text, text, integer, boolean, "
            "bigint, uuid)', 'EXECUTE'), has_function_privilege('prm_runtime', "
            "'app.set_type_price(uuid, integer, bigint, uuid)', 'EXECUTE'), "
            "has_function_privilege('prm_runtime', "
            "'app.audit_unit_price(app.units, app.units, uuid, text, text)', 'EXECUTE')"
        ).fetchone()
        assert row == (True, True, False)
