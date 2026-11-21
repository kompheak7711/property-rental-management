"""PostgreSQL tests for parking in Reports (migration 20270820_445, DL-257).

Total Income shows parking money as a part of its own, and Unit occupancy leaves parking
spaces out. A Parking agreement customer may link to the Tenant bot like a room tenant.
"""

from __future__ import annotations

from datetime import date
from pathlib import Path
from typing import Any
from uuid import UUID, uuid4

import psycopg
import pytest
from alembic.config import Config
from alembic.script import ScriptDirectory

from test_invoice_migration import runtime_database_url
from test_lease_migration import create_draft, sign_lease
from test_parking_agreement_migration import PICK
from test_room_lease_parking_migration import _hold, _initial_invoice, _parking_lease
from test_room_lease_parking_migration import migrated_database_url as migrated_database_url

REVISION = "20270820_445"


def _rows(read: str, actor: UUID, prop: UUID) -> list[Any]:
    with psycopg.connect(runtime_database_url()) as connection:
        return connection.execute(
            f"SELECT * FROM app.{read}(%s,%s,%s::uuid[])", (actor, prop, [prop])
        ).fetchall()


def test_migration_is_the_single_head_and_forward_only() -> None:
    scripts = ScriptDirectory.from_config(Config(str(Path(__file__).parents[1] / "alembic.ini")))
    assert scripts.get_heads() == ["20270821_446"]  # step 5c follows 445
    revision = scripts.get_revision(REVISION)
    assert revision is not None and revision.down_revision == "20270819_444"
    with pytest.raises(RuntimeError, match="forward-only"):
        revision.module.downgrade()


def test_parking_money_is_its_own_income_part_and_spaces_are_not_rooms(
    migrated_database_url: str,
) -> None:
    case = _parking_lease(migrated_database_url)
    _hold(case)
    with psycopg.connect(migrated_database_url) as connection:
        sign_lease(connection, case["lease"], case["actor"])
        room = connection.execute(
            "SELECT unit_id FROM app.leases WHERE id = %s", (case["lease"],)
        ).fetchone()
    assert room is not None
    invoice = _initial_invoice(case)
    assert invoice is not None
    income: dict[str, int] = {}
    for unit_id, month, kind, amount in _rows("report_income_facts", case["actor"], case["prop"]):
        if unit_id == room[0] and month == date(2027, 1, 1):
            income[kind] = income.get(kind, 0) + int(amount)
    # The parking Service is Parking; the room's Rent stays Rent.
    assert income.get("PARKING_CHARGES") == 3500
    assert "SERVICE_CHARGES" not in income
    assert income.get("RENT", 0) > 0

    occupancy = {row[0] for row in _rows("report_unit_occupancy", case["actor"], case["prop"])}
    assert room[0] in occupancy
    assert case["space"] not in occupancy


def test_a_parking_agreement_customer_may_link_to_the_tenant_bot(
    migrated_database_url: str,
) -> None:
    # The Tenant bot names the main tenant of every signed Lease not yet over, and a Parking
    # agreement is a Lease on its space, so its customer links with the space number.
    case = _parking_lease(migrated_database_url)
    with psycopg.connect(migrated_database_url) as connection:
        lease = create_draft(
            connection,
            actor_id=case["actor"],
            unit_id=case["space"],
            primary_tenant_id=case["customer"],
            start_date=date(2027, 1, 1),
            end_date=date(2027, 12, 31),
        )
        connection.execute(PICK, (uuid4(), lease, case["car"], case["actor"]))
        sign_lease(connection, lease, case["actor"])
        people = connection.execute(
            "SELECT customer_id, unit_id FROM app.tenant_link_people(%s, %s) WHERE lease_id = %s",
            (case["prop"], date(2027, 2, 1), lease),
        ).fetchall()
    assert people == [(case["customer"], case["space"])]
