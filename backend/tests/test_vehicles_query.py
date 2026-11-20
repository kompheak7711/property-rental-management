"""PostgreSQL test of `app.customer_vehicles` (migration 20270814_439, DL-253 step 3).

Each vehicle is read with the spaces it holds today: a hold that ended or starts later, or was
voided, is left out.
"""

from __future__ import annotations

from datetime import date, timedelta
from pathlib import Path
from uuid import uuid4

import pytest
from alembic.config import Config
from alembic.script import ScriptDirectory

from test_customer_migration import insert_customer
from test_parking_spaces_migration import (
    HOLD,
    Db,
    add_vehicle,
    agreement,
    connection,
    hold,
    insert_space,
    migrated_database_url,
    setup,
)

__all__ = ["connection", "migrated_database_url"]


def test_a_vehicle_is_read_with_the_spaces_it_holds_today(connection: Db) -> None:
    actor_id, property_id = setup(connection)
    customer_id = insert_customer(connection, actor_id, legal_name="Chan Vibol")
    car = add_vehicle(connection, actor_id, property_id, customer_id, plate="2A-9999")
    other = add_vehicle(connection, actor_id, property_id, customer_id, plate="2B-1")
    row = connection.execute(
        "SELECT timezone(timezone_name, statement_timestamp())::date FROM app.properties "
        "WHERE id = %s",
        (property_id,),
    ).fetchone()
    assert row is not None
    today = row[0]
    assert isinstance(today, date)
    held_space = insert_space(connection, actor_id, property_id)
    connection.execute(
        HOLD,
        hold(
            connection,
            actor_id,
            property_id,
            held_space,
            agreement(connection, actor_id, held_space, customer_id),
            car,
            today - timedelta(days=3),
        ),
    )
    ended_space = insert_space(connection, actor_id, property_id)
    connection.execute(
        HOLD,
        hold(
            connection,
            actor_id,
            property_id,
            ended_space,
            agreement(connection, actor_id, ended_space, customer_id),
            other,
            today - timedelta(days=40),
            today - timedelta(days=1),
        ),
    )
    row = connection.execute("SELECT app.customer_vehicles(%s, NULL)", (customer_id,)).fetchone()
    assert row is not None and isinstance(row[0], list)
    vehicles = {str(item["plate_text"]): item for item in row[0]}
    assert set(vehicles) == {"2A-9999", "2B-1"}
    assert vehicles["2B-1"]["holds"] == []
    holds = vehicles["2A-9999"]["holds"]
    assert isinstance(holds, list) and len(holds) == 1
    space_number = connection.execute(
        "SELECT unit_number FROM app.units WHERE id = %s", (held_space,)
    ).fetchone()
    assert space_number is not None
    assert holds[0]["space_number"] == space_number[0]
    assert holds[0]["hold_kind"] == "PARKING_AGREEMENT"
    assert holds[0]["held_until"] is None
    assert vehicles["2A-9999"]["customer_name"] == "Chan Vibol"


def test_migration_is_the_single_head_and_forward_only() -> None:
    scripts = ScriptDirectory.from_config(Config(str(Path(__file__).parents[1] / "alembic.ini")))
    assert scripts.get_heads() == ["20270817_442"]  # parking step 4b 442 is the head
    revision = scripts.get_revision("20270814_439")
    assert revision is not None and revision.down_revision == "20270813_438"
    with pytest.raises(RuntimeError, match="forward-only"):
        revision.module.downgrade()


def test_the_app_reads_vehicles_through_the_function(connection: Db) -> None:
    row = connection.execute(
        "SELECT has_function_privilege('prm_runtime', 'app.customer_vehicles(uuid, uuid)', "
        "'EXECUTE'), has_function_privilege('prm_runtime', 'app.vehicle_json(app.vehicles)', "
        "'EXECUTE')"
    ).fetchone()
    assert row == (True, False)
    # Neither Customer nor vehicle: nothing is listed.
    assert connection.execute("SELECT app.customer_vehicles(NULL, NULL)").fetchone() == ([],)
    assert connection.execute("SELECT app.customer_vehicles(%s, NULL)", (uuid4(),)).fetchone() == (
        [],
    )
