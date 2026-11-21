"""PostgreSQL tests for parking on Home and in the ledger (migration 20270819_444, DL-256).

Home counts rooms apart from parking spaces and shows how many vehicle places are taken today.
Parking money posts to its own income account, 4110 Parking.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any, cast
from uuid import UUID, uuid4
from zoneinfo import ZoneInfo

import psycopg
import pytest
from alembic.config import Config
from alembic.script import ScriptDirectory

from test_invoice_migration import runtime_database_url
from test_lease_migration import create_draft, sign_lease
from test_parking_agreement_migration import PICK
from test_parking_spaces_migration import add_vehicle, insert_space, setup
from test_room_lease_parking_migration import _hold, _initial_invoice, _parking_lease
from test_room_lease_parking_migration import migrated_database_url as migrated_database_url

REVISION = "20270819_444"


def _cards(actor: UUID, prop: UUID) -> dict[str, Any]:
    with psycopg.connect(runtime_database_url()) as connection:
        row = connection.execute(
            "SELECT app.home_page(%s,%s,%s::uuid[],%s::text[])", (actor, prop, [prop], ["units"])
        ).fetchone()
    assert row is not None
    return cast(dict[str, Any], row[0]["cards"])


def test_migration_is_the_single_head_and_forward_only() -> None:
    scripts = ScriptDirectory.from_config(Config(str(Path(__file__).parents[1] / "alembic.ini")))
    assert scripts.get_heads() == ["20270822_447"]  # step 5b follows 444
    revision = scripts.get_revision(REVISION)
    assert revision is not None and revision.down_revision == "20270818_443"
    with pytest.raises(RuntimeError, match="forward-only"):
        revision.module.downgrade()


def test_home_counts_rooms_apart_and_the_vehicle_places_taken_today(
    migrated_database_url: str,
) -> None:
    today = datetime.now(ZoneInfo("Asia/Phnom_Penh")).date()
    with psycopg.connect(migrated_database_url) as connection:
        actor, prop = setup(connection)
        connection.commit()
    before = _cards(actor, prop)
    with psycopg.connect(migrated_database_url) as connection:
        # A Motorbike area of 3 places with one agreement on it today, and a space kept for
        # short-stay guests, which is not rented out.
        area = insert_space(connection, actor, prop, parking_type="MOTORBIKE", capacity=3)
        insert_space(connection, actor, prop, kept=True)
        customer = connection.execute(
            "SELECT id FROM app.customers ORDER BY created_at LIMIT 1"
        ).fetchone()
        assert customer is not None
        bike = add_vehicle(
            connection, actor, prop, customer[0], "MOTORBIKE", f"1B-{uuid4().hex[:4]}"
        )
        lease = create_draft(
            connection,
            actor_id=actor,
            unit_id=area,
            primary_tenant_id=customer[0],
            start_date=today - timedelta(days=1),
            end_date=today + timedelta(days=30),
        )
        connection.execute(PICK, (uuid4(), lease, bike, actor))
        connection.commit()
    after = _cards(actor, prop)
    # Parking spaces are not rooms.
    assert after["units_occupied"] == before["units_occupied"]
    taken = before.get("parking_taken", {"taken": 0, "total": 0})
    assert after["parking_taken"] == {"taken": taken["taken"] + 1, "total": taken["total"] + 3}


def test_parking_money_posts_to_4110(migrated_database_url: str) -> None:
    case = _parking_lease(migrated_database_url)
    _hold(case)
    with psycopg.connect(migrated_database_url) as connection:
        sign_lease(connection, case["lease"], case["actor"])
    invoice = _initial_invoice(case)
    with psycopg.connect(migrated_database_url) as connection:
        kinds: dict[str, bool] = dict(
            connection.execute(
                "SELECT line.category, app.gl_line_is_parking(line.id) "
                "FROM app.invoice_lines AS line WHERE line.invoice_id = %s",
                (invoice,),
            ).fetchall()
        )
        # The room's Rent is not parking; its parking Service is.
        assert kinds == {"RENT": False, "SERVICE_CHARGES": True}
        row = connection.execute(
            "SELECT event.lines FROM app.gl_app_record_events(%s, %s, %s) AS event "
            "WHERE event.posting_key = %s",
            (case["prop"], date(2026, 1, 1), date(2028, 12, 31), f"invoice:{invoice}:issue"),
        ).fetchone()
        assert row is not None
        credits = {
            line["account"]: line["credit_cents"]
            for line in cast(list[dict[str, Any]], row[0])
            if "credit_cents" in line
        }
        assert credits["4110"] == 3500
        assert "4020" not in credits
        # Parking Rent income goes to 4110; Rent waiting for its month stays in 2050.
        assert connection.execute(
            "SELECT app.gl_parking_rent_account('4010', true), "
            "app.gl_parking_rent_account('2050', true), app.gl_parking_rent_account('4010', false)"
        ).fetchone() == ("4110", "2050", "4010")
        assert connection.execute(
            "SELECT name_en, account_type FROM app.gl_chart_template WHERE code = '4110'"
        ).fetchone() == ("Parking", "INCOME")
