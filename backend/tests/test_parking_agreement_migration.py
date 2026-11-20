"""PostgreSQL tests for Parking agreements (migration 20270816_441, DL-254, parking step 4a).

A Parking agreement is a Lease on the parking space. It holds the space with a vehicle for its
dates; the space holds, not the Lease dates, decide how many agreements a space takes at once.
"""

from __future__ import annotations

import hashlib
from datetime import date
from pathlib import Path
from typing import Any, cast
from uuid import UUID, uuid4

import pytest
from alembic.config import Config
from alembic.script import ScriptDirectory

from test_customer_migration import insert_customer
from test_lease_migration import create_draft
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

REVISION = "20270816_441"
PICK = "SELECT app.hold_parking_agreement_space(%s, %s, %s, %s)"
SIGN = (
    "SELECT app.sign_lease(%s, %s, %s, %s, %s, "
    "(SELECT version FROM app.leases WHERE id = %s), statement_timestamp(), 'Signed', %s)"
)


def _agreement(
    connection: Db, actor_id: UUID, space_id: UUID, *, plate: str, vehicle_type: str = "CAR"
) -> tuple[UUID, UUID, UUID]:
    property_id = connection.execute(
        "SELECT property_id FROM app.units WHERE id = %s", (space_id,)
    ).fetchone()
    assert property_id is not None
    customer_id = insert_customer(connection, actor_id, legal_name=f"Parker {plate}")
    vehicle_id = add_vehicle(
        connection, actor_id, UUID(str(property_id[0])), customer_id, vehicle_type, plate
    )
    lease_id = create_draft(
        connection,
        actor_id=actor_id,
        unit_id=space_id,
        primary_tenant_id=customer_id,
        start_date=date(2027, 1, 1),
        end_date=date(2027, 12, 31),
    )
    return customer_id, vehicle_id, lease_id


def _sign(connection: Db, property_id: UUID, lease_id: UUID, actor_id: UUID) -> tuple[str, ...]:
    values = (
        property_id,
        uuid4(),
        hashlib.sha256(uuid4().bytes).hexdigest(),
        uuid4(),
        lease_id,
        lease_id,
        actor_id,
    )
    return _try(connection, values)


def _try(connection: Db, values: tuple[object, ...]) -> tuple[str, ...]:
    connection.execute("SAVEPOINT sign_try")
    try:
        connection.execute(SIGN, values)
    except Exception as error:
        connection.execute("ROLLBACK TO SAVEPOINT sign_try")
        state = getattr(error, "sqlstate", None)
        hint = getattr(getattr(error, "diag", None), "message_hint", None)
        return (str(state), str(hint or ""))
    connection.execute("RELEASE SAVEPOINT sign_try")
    return ("signed",)


def test_migration_is_the_single_head_and_forward_only() -> None:
    scripts = ScriptDirectory.from_config(Config(str(Path(__file__).parents[1] / "alembic.ini")))
    assert scripts.get_heads() == [REVISION]
    revision = scripts.get_revision(REVISION)
    assert revision is not None and revision.down_revision == "20270815_440"
    with pytest.raises(RuntimeError, match="forward-only"):
        revision.module.downgrade()


def test_a_parking_agreement_is_signed_once_its_vehicle_is_picked(connection: Db) -> None:
    actor_id, property_id = setup(connection)
    space_id = insert_space(connection, actor_id, property_id)
    customer_id, car, lease_id = _agreement(connection, actor_id, space_id, plate="2A-4001")
    assert connection.execute(
        "SELECT on_parking_space FROM app.leases WHERE id = %s", (lease_id,)
    ).fetchone() == (True,)
    assert _sign(connection, property_id, lease_id, actor_id) == (
        "23514",
        "AGREEMENT_VEHICLE_NOT_PICKED",
    )

    first = uuid4()
    held = connection.execute(PICK, (first, lease_id, car, actor_id)).fetchone()
    assert held is not None
    picked = cast(dict[str, Any], held[0])
    assert (picked["held_from"], picked["held_until"]) == ("2027-01-01", "2027-12-31")
    # A retry answers the same; picking again replaces the draft's earlier pick.
    assert connection.execute(PICK, (first, lease_id, car, actor_id)).fetchone() == held
    connection.execute(PICK, (uuid4(), lease_id, car, actor_id))
    assert connection.execute(
        "SELECT count(*) FILTER (WHERE voided_at IS NULL), count(*) "
        "FROM app.parking_space_holds WHERE lease_id = %s",
        (lease_id,),
    ).fetchone() == (1, 2)

    assert _sign(connection, property_id, lease_id, actor_id) == ("signed",)
    assert connection.execute(
        "SELECT status FROM app.leases WHERE id = %s", (lease_id,)
    ).fetchone() == ("SIGNED",)
    # A signed agreement keeps its pick; people never move into a parking space.
    assert refusal(connection, PICK, (uuid4(), lease_id, car, actor_id)) == (
        "55000",
        "LEASE_CLOSED",
    )
    assert refusal(
        connection,
        "INSERT INTO app.occupancies(id, lease_id, customer_id, move_in_date, created_by, "
        "updated_by) VALUES (%s, %s, %s, DATE '2027-01-01', %s, %s)",
        (uuid4(), lease_id, customer_id, actor_id, actor_id),
    ) == ("55000", "PARKING_SPACE")


def test_the_motorbike_area_takes_as_many_agreements_as_its_places(connection: Db) -> None:
    actor_id, property_id = setup(connection)
    area_id = insert_space(connection, actor_id, property_id, parking_type="MOTORBIKE", capacity=2)
    for index in range(2):
        _, bike, lease_id = _agreement(
            connection, actor_id, area_id, plate=f"1A-41{index}", vehicle_type="MOTORBIKE"
        )
        connection.execute(PICK, (uuid4(), lease_id, bike, actor_id))
        assert _sign(connection, property_id, lease_id, actor_id) == ("signed",)
    _, bike, third = _agreement(
        connection, actor_id, area_id, plate="1A-419", vehicle_type="MOTORBIKE"
    )
    assert refusal(connection, PICK, (uuid4(), third, bike, actor_id)) == (
        "23P01",
        "PARKING_SPACE_TAKEN",
    )

    # A numbered space still takes one agreement at a time.
    space_id = insert_space(connection, actor_id, property_id)
    _, car, lease_id = _agreement(connection, actor_id, space_id, plate="2A-4101")
    connection.execute(PICK, (uuid4(), lease_id, car, actor_id))
    _, other_car, other = _agreement(connection, actor_id, space_id, plate="2A-4102")
    assert refusal(connection, PICK, (uuid4(), other, other_car, actor_id)) == (
        "23P01",
        "PARKING_SPACE_TAKEN",
    )


def test_the_app_picks_the_vehicle_only_through_the_function(connection: Db) -> None:
    row = connection.execute(
        "SELECT has_function_privilege('prm_runtime', "
        "'app.hold_parking_agreement_space(uuid, uuid, uuid, uuid)', 'EXECUTE'), "
        "has_table_privilege('prm_runtime', 'app.parking_space_holds', 'INSERT')"
    ).fetchone()
    assert row == (True, False)
