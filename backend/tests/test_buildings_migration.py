"""PostgreSQL tests for buildings under the one Property (DL-250).

The owner may add a second building later. Building 1 is made from the Business name and
address, every Unit sits in a building, and a Unit with renting history never changes building.
"""

from __future__ import annotations

import os
from collections.abc import Iterator
from pathlib import Path
from uuid import UUID, uuid4

import psycopg
import pytest
from alembic import command
from alembic.config import Config
from alembic.script import ScriptDirectory
from psycopg import Connection, Error

from property_rental.reports import REPORT_UNITS_SELECT
from property_rental.unit import unit_from_row
from property_rental.unit_api import UNIT_SELECT, _body
from test_migrations import _temporary_migration_database
from test_unit_migration import insert_actor, insert_property, insert_unit

REVISION = "20270810_433"
CREATE = "SELECT * FROM app.create_building(%s, %s, %s, %s, %s, %s, %s, %s, %s)"
UPDATE = "SELECT * FROM app.update_building(%s, %s, %s, %s, %s, %s, %s, %s, %s)"
REMOVE = "SELECT * FROM app.remove_building(%s, %s, %s)"
MOVE = "SELECT app.move_unit_to_building(%s, %s, %s, %s, %s)"


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
def connection(migrated_database_url: str) -> Iterator[Connection[tuple[object, ...]]]:
    with psycopg.connect(migrated_database_url) as database_connection:
        yield database_connection
        database_connection.rollback()


def property_for(connection: Connection[tuple[object, ...]], actor_id: UUID) -> UUID:
    """The one Property: other suites may already have committed it."""
    existing = connection.execute("SELECT id FROM app.properties").fetchone()
    if existing is None:
        return insert_property(connection, actor_id)
    return UUID(str(existing[0]))


def first_building(connection: Connection[tuple[object, ...]], property_id: UUID) -> UUID:
    row = connection.execute(
        "SELECT id FROM app.buildings WHERE property_id = %s "
        "ORDER BY sort_order, created_at, id LIMIT 1",
        (property_id,),
    ).fetchone()
    assert row is not None
    return UUID(str(row[0]))


def add_building(
    connection: Connection[tuple[object, ...]],
    property_id: UUID,
    actor_id: UUID,
    name: str = "Building Two",
) -> tuple[object, ...]:
    row = connection.execute(
        CREATE,
        (uuid4(), property_id, f"  {name} ", None, "Street 2", None, None, 5, actor_id),
    ).fetchone()
    assert row is not None
    return row


def unit_number() -> str:
    return f"T{uuid4().hex[:6]}"


def sqlstate_of(
    connection: Connection[tuple[object, ...]], statement: str, parameters: tuple[object, ...]
) -> str | None:
    connection.execute("SAVEPOINT expected_refusal")
    try:
        connection.execute(statement, parameters)
    except Error as error:
        connection.execute("ROLLBACK TO SAVEPOINT expected_refusal")
        return error.sqlstate
    connection.execute("RELEASE SAVEPOINT expected_refusal")
    return None


def audit_actions(connection: Connection[tuple[object, ...]], entity_id: UUID) -> list[str]:
    return [
        str(row[0])
        for row in connection.execute(
            "SELECT action FROM app.audit_events WHERE entity_id = %s ORDER BY occurred_at, action",
            (entity_id,),
        ).fetchall()
    ]


def test_migration_is_the_single_head() -> None:
    scripts = ScriptDirectory.from_config(_config())
    # The building short-stay guard 434 follows 433; parking step 2 438 follows 437.
    assert scripts.get_heads() == ["20270818_443"]
    assert scripts.get_revision("20270811_434").down_revision == REVISION


def test_downgrade_is_refused() -> None:
    scripts = ScriptDirectory.from_config(_config())
    revision = scripts.get_revision(REVISION)
    assert revision is not None
    with pytest.raises(RuntimeError, match="forward-only"):
        revision.module.downgrade()


def test_existing_units_go_into_building_one_without_a_new_version() -> None:
    config = _config()
    with _temporary_migration_database("buildings_backfill") as temporary:
        command.upgrade(config, "20270809_432")
        url = temporary.replace("postgresql+psycopg://", "postgresql://", 1)
        with psycopg.connect(url) as setup:
            actor_id = insert_actor(setup)
            property_id = insert_property(setup, actor_id)
            setup.execute(
                "UPDATE app.properties SET address_text = 'Street 1, Phnom Penh', "
                "version = version + 1 WHERE id = %s",
                (property_id,),
            )
            unit_id = insert_unit(setup, actor_id=actor_id, property_id=property_id)
            setup.commit()
        command.upgrade(config, REVISION)
        with psycopg.connect(url) as check:
            building = check.execute(
                "SELECT id, name_en, address_text, takes_short_stays FROM app.buildings"
            ).fetchall()
            assert len(building) == 1
            assert building[0][1:] == ("Unit Test Property", "Street 1, Phnom Penh", True)
            unit = check.execute(
                "SELECT building_id, version FROM app.units WHERE id = %s", (unit_id,)
            ).fetchone()
            assert unit == (building[0][0], 1)
            assert audit_actions(check, UUID(str(building[0][0]))) == ["building.created"]


def test_a_new_property_gets_building_one_and_new_units_go_into_it(
    connection: Connection[tuple[object, ...]],
) -> None:
    actor_id = insert_actor(connection)
    property_id = property_for(connection, actor_id)
    building_id = first_building(connection, property_id)
    unit_id = insert_unit(
        connection, actor_id=actor_id, property_id=property_id, unit_number=unit_number()
    )
    row = connection.execute(
        "SELECT building_id FROM app.units WHERE id = %s", (unit_id,)
    ).fetchone()
    assert row == (building_id,)


def test_building_name_is_unique_and_trimmed(
    connection: Connection[tuple[object, ...]],
) -> None:
    actor_id = insert_actor(connection)
    property_id = property_for(connection, actor_id)
    row = add_building(connection, property_id, actor_id)
    assert row[2] == "Building Two"
    assert row[6] is False
    assert row[9] == 1
    assert audit_actions(connection, UUID(str(row[0]))) == ["building.created"]
    assert (
        sqlstate_of(
            connection,
            CREATE,
            (uuid4(), property_id, "building two", None, None, None, None, 0, actor_id),
        )
        == "23505"
    )


def test_update_needs_the_current_version_and_writes_audit(
    connection: Connection[tuple[object, ...]],
) -> None:
    actor_id = insert_actor(connection)
    property_id = property_for(connection, actor_id)
    building_id = UUID(str(add_building(connection, property_id, actor_id)[0]))
    stale = connection.execute(
        UPDATE, (building_id, "New name", None, None, None, True, 1, 9, actor_id)
    ).fetchall()
    assert stale == []
    row = connection.execute(
        UPDATE, (building_id, "New name", "ឈ្មោះ", " Street 3 ", None, True, 1, 1, actor_id)
    ).fetchone()
    assert row is not None
    assert row[2:7] == ("New name", "ឈ្មោះ", "Street 3", None, True)
    assert row[9] == 2
    assert audit_actions(connection, building_id) == ["building.created", "building.updated"]


def test_a_building_with_units_cannot_be_removed(
    connection: Connection[tuple[object, ...]],
) -> None:
    actor_id = insert_actor(connection)
    property_id = property_for(connection, actor_id)
    building_id = UUID(str(add_building(connection, property_id, actor_id)[0]))
    unit_id = insert_unit(
        connection, actor_id=actor_id, property_id=property_id, unit_number=unit_number()
    )
    new_version = connection.execute(
        MOVE, (unit_id, building_id, 1, "Unit is in the new building", actor_id)
    ).fetchone()
    assert new_version == (2,)
    assert sqlstate_of(connection, REMOVE, (building_id, 1, actor_id)) == "55000"
    assert audit_actions(connection, unit_id)[-1] == "unit.building_changed"


def test_an_empty_building_is_removed_and_takes_no_new_units(
    connection: Connection[tuple[object, ...]],
) -> None:
    actor_id = insert_actor(connection)
    property_id = property_for(connection, actor_id)
    building_id = UUID(str(add_building(connection, property_id, actor_id)[0]))
    row = connection.execute(REMOVE, (building_id, 1, actor_id)).fetchone()
    assert row is not None
    assert row[8] is not None
    assert row[9] == 2
    assert sqlstate_of(connection, REMOVE, (building_id, 2, actor_id)) == "22023"
    assert (
        sqlstate_of(
            connection,
            UPDATE,
            (building_id, "Again", None, None, None, False, 0, 2, actor_id),
        )
        == "22023"
    )
    assert (
        sqlstate_of(
            connection,
            "INSERT INTO app.units (id, property_id, building_id, unit_number, floor, "
            "unit_type, status, created_by, updated_by) "
            "VALUES (%s, %s, %s, %s, '1', 'STUDIO', 'VACANT', %s, %s)",
            (uuid4(), property_id, building_id, unit_number(), actor_id, actor_id),
        )
        == "22023"
    )
    unit_id = insert_unit(
        connection, actor_id=actor_id, property_id=property_id, unit_number=unit_number()
    )
    assert sqlstate_of(connection, MOVE, (unit_id, building_id, 1, "Move it", actor_id)) == "22023"


def test_move_needs_a_reason_and_the_current_version(
    connection: Connection[tuple[object, ...]],
) -> None:
    actor_id = insert_actor(connection)
    property_id = property_for(connection, actor_id)
    building_id = UUID(str(add_building(connection, property_id, actor_id)[0]))
    unit_id = insert_unit(
        connection, actor_id=actor_id, property_id=property_id, unit_number=unit_number()
    )
    assert sqlstate_of(connection, MOVE, (unit_id, building_id, 1, "  ", actor_id)) == "22023"
    assert connection.execute(
        MOVE, (unit_id, building_id, 7, "Wrong version", actor_id)
    ).fetchone() == (None,)
    home = first_building(connection, property_id)
    assert sqlstate_of(connection, MOVE, (unit_id, home, 1, "Same", actor_id)) == "22023"


def test_unit_number_stays_unique_across_buildings(
    connection: Connection[tuple[object, ...]],
) -> None:
    actor_id = insert_actor(connection)
    property_id = property_for(connection, actor_id)
    building_id = UUID(str(add_building(connection, property_id, actor_id)[0]))
    number = unit_number()
    insert_unit(connection, actor_id=actor_id, property_id=property_id, unit_number=number)
    assert (
        sqlstate_of(
            connection,
            "INSERT INTO app.units (id, property_id, building_id, unit_number, floor, "
            "unit_type, status, created_by, updated_by) "
            "VALUES (%s, %s, %s, %s, '1', 'STUDIO', 'VACANT', %s, %s)",
            (uuid4(), property_id, building_id, number, actor_id, actor_id),
        )
        == "23505"
    )


def test_runtime_role_reads_buildings_and_writes_only_through_functions(
    migrated_database_url: str,
) -> None:
    runtime_url = os.environ.get("APP_DATABASE_URL")
    if runtime_url is None:
        pytest.skip("APP_DATABASE_URL is required for runtime-role migration tests")
    runtime_url = runtime_url.replace("postgresql+psycopg://", "postgresql://", 1)
    with psycopg.connect(runtime_url) as runtime:
        privileges = runtime.execute(
            "SELECT has_table_privilege('app.buildings', 'SELECT'), "
            "has_table_privilege('app.buildings', 'INSERT'), "
            "has_table_privilege('app.buildings', 'UPDATE'), "
            "has_table_privilege('app.buildings', 'DELETE'), "
            "has_function_privilege('app.move_unit_to_building("
            "uuid, uuid, integer, text, uuid)', 'EXECUTE'), "
            "has_function_privilege('app.make_first_building(uuid)', 'EXECUTE')"
        ).fetchone()
        assert privileges == (True, False, False, False, True, False)
        runtime.rollback()


def test_unit_answer_names_its_building(
    connection: Connection[tuple[object, ...]],
) -> None:
    """Step 2: the Unit answer carries building_id, so New Unit and the Unit page can show it."""
    actor_id = insert_actor(connection)
    property_id = property_for(connection, actor_id)
    home = first_building(connection, property_id)
    building_id = UUID(str(add_building(connection, property_id, actor_id)[0]))
    unit_id = insert_unit(
        connection, actor_id=actor_id, property_id=property_id, unit_number=unit_number()
    )
    row = connection.execute(UNIT_SELECT, (unit_id,)).fetchone()
    assert row is not None
    assert unit_from_row(row).building_id == home
    connection.execute(MOVE, (unit_id, building_id, 1, "Chosen on New Unit", actor_id))
    moved = connection.execute(UNIT_SELECT, (unit_id,)).fetchone()
    assert moved is not None
    unit = unit_from_row(moved)
    assert unit.building_id == building_id
    assert unit.version == 2
    assert _body(unit)["building_id"] == str(building_id)


def test_report_units_name_their_building(
    connection: Connection[tuple[object, ...]],
) -> None:
    """Step 4: the reports read each Unit's building and its name, for the Building filter."""
    actor_id = insert_actor(connection)
    property_id = property_for(connection, actor_id)
    home = first_building(connection, property_id)
    unit_id = insert_unit(
        connection, actor_id=actor_id, property_id=property_id, unit_number=unit_number()
    )
    cursor = connection.execute(REPORT_UNITS_SELECT, (property_id,))
    names = [column.name for column in cursor.description or ()]
    rows = [dict(zip(names, row, strict=True)) for row in cursor.fetchall()]
    mine = next(row for row in rows if row["id"] == unit_id)
    assert mine["building_id"] == home
    assert isinstance(mine["building_name"], str) and mine["building_name"] != ""
