"""PostgreSQL tests for Change vehicle and the end of a space hold (migration 20270818_443, DL-255).

On a signed Lease staff change the vehicle that parks in a held space from a day. When a Lease
ends, its space holds end on its last day and the space is free again; a cancelled draft lets
its space go.
"""

from __future__ import annotations

from datetime import date
from pathlib import Path
from typing import Any, cast
from uuid import UUID, uuid4

import pytest
from alembic.config import Config
from alembic.script import ScriptDirectory

from test_customer_migration import insert_customer
from test_lease_migration import create_draft
from test_parking_agreement_migration import PICK, _agreement, _sign
from test_parking_spaces_migration import (
    Db,
    add_vehicle,
    connection,
    insert_space,
    migrated_database_url,
    refusal,
    setup,
)

__all__ = ["connection", "migrated_database_url"]

REVISION = "20270818_443"
CHANGE = "SELECT app.change_parking_vehicle(%s, %s, %s, %s, %s, %s)"


def _hold_of(connection: Db, lease_id: UUID) -> UUID:
    row = connection.execute(
        "SELECT id FROM app.parking_space_holds WHERE lease_id = %s AND voided_at IS NULL",
        (lease_id,),
    ).fetchone()
    assert row is not None
    return UUID(str(row[0]))


def _end(connection: Db, lease_id: UUID, actor_id: UUID, status: str, last: date | None) -> None:
    connection.execute(
        "UPDATE app.leases SET status = %s, terminated_at = CASE WHEN %s = 'TERMINATED' "
        "THEN statement_timestamp() END, actual_termination_date = %s, "
        "termination_reason = CASE WHEN %s = 'TERMINATED' THEN 'Ended by notice' END, "
        "version = version + 1, updated_at = statement_timestamp(), updated_by = %s "
        "WHERE id = %s",
        (status, status, last, status, actor_id, lease_id),
    )


def test_migration_is_the_single_head_and_forward_only() -> None:
    scripts = ScriptDirectory.from_config(Config(str(Path(__file__).parents[1] / "alembic.ini")))
    assert scripts.get_heads() == [REVISION]
    revision = scripts.get_revision(REVISION)
    assert revision is not None and revision.down_revision == "20270817_442"
    with pytest.raises(RuntimeError, match="forward-only"):
        revision.module.downgrade()


def test_a_signed_lease_changes_its_vehicle_from_a_day_with_a_reason(connection: Db) -> None:
    actor_id, property_id = setup(connection)
    space_id = insert_space(connection, actor_id, property_id)
    customer_id, car, lease_id = _agreement(connection, actor_id, space_id, plate="2A-4301")
    other = add_vehicle(connection, actor_id, property_id, customer_id, "CAR", "2A-4302")
    connection.execute(PICK, (uuid4(), lease_id, car, actor_id))
    hold_id = _hold_of(connection, lease_id)
    reason = "Sold the old car"
    # A draft picks again instead.
    assert refusal(
        connection, CHANGE, (uuid4(), hold_id, other, date(2027, 3, 1), reason, actor_id)
    ) == ("55000", "LEASE_CLOSED")
    assert _sign(connection, property_id, lease_id, actor_id) == ("signed",)

    assert refusal(
        connection, CHANGE, (uuid4(), hold_id, car, date(2027, 3, 1), reason, actor_id)
    ) == ("23514", "VEHICLE_SAME")
    assert refusal(
        connection, CHANGE, (uuid4(), hold_id, other, date(2026, 12, 31), reason, actor_id)
    ) == ("23514", "CHANGE_DATE")
    assert refusal(
        connection, CHANGE, (uuid4(), hold_id, other, date(2027, 3, 1), " ", actor_id)
    ) == ("23514", "CHANGE_REASON")

    change_id = uuid4()
    values = (change_id, hold_id, other, date(2027, 3, 1), reason, actor_id)
    changed = connection.execute(CHANGE, values).fetchone()
    assert changed is not None
    assert cast(dict[str, Any], changed[0])["vehicle_id"] == str(other)
    # A retry answers the same and records nothing more.
    assert connection.execute(CHANGE, values).fetchone() == changed
    assert connection.execute(
        "SELECT old_vehicle_id, new_vehicle_id, change_date, reason "
        "FROM app.parking_vehicle_changes WHERE hold_id = %s",
        (hold_id,),
    ).fetchall() == [(car, other, date(2027, 3, 1), reason)]
    assert connection.execute(
        "SELECT count(*) FROM app.audit_events WHERE action = 'parking.vehicle_changed' "
        "AND entity_id = %s",
        (lease_id,),
    ).fetchone() == (1,)
    # A plain update still cannot change the vehicle.
    assert refusal(
        connection,
        "UPDATE app.parking_space_holds SET vehicle_id = %s, version = version + 1 WHERE id = %s",
        (car, hold_id),
    ) == ("55000", "VEHICLE_CHANGE")


def test_an_ended_lease_frees_its_space_and_a_cancelled_draft_lets_it_go(connection: Db) -> None:
    actor_id, property_id = setup(connection)
    space_id = insert_space(connection, actor_id, property_id)
    _, car, lease_id = _agreement(connection, actor_id, space_id, plate="2A-4401")
    connection.execute(PICK, (uuid4(), lease_id, car, actor_id))
    assert _sign(connection, property_id, lease_id, actor_id) == ("signed",)
    hold_id = _hold_of(connection, lease_id)

    # The next customer cannot have the space while the agreement holds it.
    nextcomer = insert_customer(connection, actor_id, legal_name="Parker after")
    next_car = add_vehicle(connection, actor_id, property_id, nextcomer, "CAR", "2A-4402")
    following = create_draft(
        connection,
        actor_id=actor_id,
        unit_id=space_id,
        primary_tenant_id=nextcomer,
        start_date=date(2027, 4, 1),
        end_date=date(2027, 12, 31),
    )
    assert refusal(connection, PICK, (uuid4(), following, next_car, actor_id)) == (
        "23P01",
        "PARKING_SPACE_TAKEN",
    )

    _end(connection, lease_id, actor_id, "TERMINATED", date(2027, 3, 31))
    assert connection.execute(
        "SELECT held_until, end_reason, voided_at FROM app.parking_space_holds WHERE id = %s",
        (hold_id,),
    ).fetchone() == (date(2027, 3, 31), "The Lease ended", None)
    connection.execute(PICK, (uuid4(), following, next_car, actor_id))

    # Cancelling the following draft lets its space go too.
    _end(connection, following, actor_id, "CANCELLED", None)
    assert connection.execute(
        "SELECT count(*) FROM app.parking_space_holds WHERE lease_id = %s AND voided_at IS NULL",
        (following,),
    ).fetchone() == (0,)
    assert connection.execute(
        "SELECT void_reason FROM app.parking_space_holds WHERE lease_id = %s",
        (following,),
    ).fetchone() == ("The Lease draft was cancelled",)


def test_the_app_changes_the_vehicle_only_through_the_function(connection: Db) -> None:
    row = connection.execute(
        "SELECT has_function_privilege('prm_runtime', "
        "'app.change_parking_vehicle(uuid, uuid, uuid, date, text, uuid)', 'EXECUTE'), "
        "has_table_privilege('prm_runtime', 'app.parking_vehicle_changes', 'INSERT')"
    ).fetchone()
    assert row == (True, False)
