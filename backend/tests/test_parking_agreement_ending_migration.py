"""PostgreSQL tests for ending a month-to-month Parking agreement (migration 20270821_446, DL-258).

The customer tells before the 25th: the agreement ends at the end of that month, else at the end of
the next month. The owner's letter ends it 30 days later. Its End Date moves to that day, the space
is free after it, and the Lease then ends on its End Date (not early), so its deposit goes back.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any, cast
from uuid import UUID, uuid4
from zoneinfo import ZoneInfo

import pytest
from alembic.config import Config
from alembic.script import ScriptDirectory

from property_rental.lease_termination import TerminationBasis
from termination_test_support import terminate_test_lease
from test_customer_migration import insert_customer
from test_lease_migration import create_draft
from test_parking_agreement_migration import PICK, _sign
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

REVISION = "20270821_446"
END = "SELECT app.end_parking_agreement(%s, %s, %s, %s, %s, %s)"
END_DAY = "SELECT app.parking_agreement_end_day(%s, %s)"


def _today() -> date:
    return datetime.now(ZoneInfo("Asia/Phnom_Penh")).date()


def _monthly(connection: Db, start: date, plate: str) -> tuple[UUID, UUID, UUID, UUID]:
    """A signed month-to-month Parking agreement from `start`: (actor, property, lease, hold)."""
    actor_id, property_id = setup(connection)
    space_id = insert_space(connection, actor_id, property_id)
    customer_id = insert_customer(connection, actor_id, legal_name=f"Parker {plate}")
    car = add_vehicle(connection, actor_id, property_id, customer_id, "CAR", plate)
    lease_id = create_draft(
        connection,
        actor_id=actor_id,
        unit_id=space_id,
        primary_tenant_id=customer_id,
        start_date=start,
        end_date=date(2099, 12, 31),
    )
    connection.execute(PICK, (uuid4(), lease_id, car, actor_id))
    assert _sign(connection, property_id, lease_id, actor_id) == ("signed",)
    hold = connection.execute(
        "SELECT id FROM app.parking_space_holds WHERE lease_id = %s AND voided_at IS NULL",
        (lease_id,),
    ).fetchone()
    assert hold is not None
    return actor_id, property_id, lease_id, UUID(str(hold[0]))


def test_migration_is_the_single_head_and_forward_only() -> None:
    scripts = ScriptDirectory.from_config(Config(str(Path(__file__).parents[1] / "alembic.ini")))
    assert scripts.get_heads() == [REVISION]
    revision = scripts.get_revision(REVISION)
    assert revision is not None and revision.down_revision == "20270820_445"
    with pytest.raises(RuntimeError, match="forward-only"):
        revision.module.downgrade()


def test_the_last_day_follows_the_owner_rules(connection: Db) -> None:
    def day(told_by: str, told_on: date) -> date:
        row = connection.execute(END_DAY, (told_by, told_on)).fetchone()
        assert row is not None
        return cast(date, row[0])

    # Q15: before the 25th, the end of this month; from the 25th, the end of next month.
    assert day("CUSTOMER", date(2027, 3, 24)) == date(2027, 3, 31)
    assert day("CUSTOMER", date(2027, 3, 25)) == date(2027, 4, 30)
    assert day("CUSTOMER", date(2027, 12, 31)) == date(2028, 1, 31)
    assert day("CUSTOMER", date(2028, 1, 30)) == date(2028, 2, 29)
    # Q16: the owner's letter, 30 days after it is given.
    assert day("OWNER", date(2027, 3, 10)) == date(2027, 4, 9)


def test_a_customer_notice_ends_the_agreement_and_frees_the_space(connection: Db) -> None:
    today = _today()
    start = (today.replace(day=1) - timedelta(days=70)).replace(day=1)
    actor_id, property_id, lease_id, hold_id = _monthly(connection, start, "2A-4601")
    told = start + timedelta(days=9)  # the 10th: before the 25th
    last = (start.replace(day=28) + timedelta(days=4)).replace(day=1) - timedelta(days=1)

    # A day told in the future, or before the Start Date, is refused.
    assert refusal(
        connection, END, (uuid4(), lease_id, "CUSTOMER", today + timedelta(days=1), None, actor_id)
    ) == ("23514", "TOLD_DATE")
    assert refusal(
        connection, END, (uuid4(), lease_id, "CUSTOMER", start - timedelta(days=1), None, actor_id)
    ) == ("23514", "TOLD_DATE")

    ending_id = uuid4()
    row = connection.execute(
        END, (ending_id, lease_id, "CUSTOMER", told, "Moving away", actor_id)
    ).fetchone()
    assert row is not None
    parking = cast(dict[str, Any], row[0])
    assert parking["month_to_month"] is False
    assert parking["ending"] == {
        "told_by": "CUSTOMER",
        "told_on": told.isoformat(),
        "ends_on": last.isoformat(),
        "note": "Moving away",
    }
    assert connection.execute(
        "SELECT end_date, status FROM app.leases WHERE id = %s", (lease_id,)
    ).fetchone() == (last, "SIGNED")
    assert connection.execute(
        "SELECT held_until, end_reason FROM app.parking_space_holds WHERE id = %s", (hold_id,)
    ).fetchone() == (last, "The Parking agreement ends by notice")
    assert connection.execute(
        "SELECT action, resulting_state->>'told_by' FROM app.audit_events "
        "WHERE entity_id = %s AND action = 'parking.agreement_ending'",
        (lease_id,),
    ).fetchone() == ("parking.agreement_ending", "CUSTOMER")

    # The same ending sent again is answered again; a second ending is refused.
    again = connection.execute(
        END, (ending_id, lease_id, "CUSTOMER", told, "Moving away", actor_id)
    ).fetchone()
    assert again is not None
    assert cast(dict[str, Any], again[0])["ending"]["ends_on"] == last.isoformat()
    assert refusal(connection, END, (uuid4(), lease_id, "OWNER", told, None, actor_id)) == (
        "23505",
        "ENDING_ALREADY_SET",
    )

    # On its End Date the Lease ends as signed (not early), so its deposit is not kept.
    terminate_test_lease(
        connection,
        property_id=property_id,
        actor_id=actor_id,
        lease_id=lease_id,
        governing="BR-LEASE-023",
        reason="The Parking agreement ended on its End Date",
        basis=TerminationBasis.SIGNED_LEASE_OTHER,
        actual_date=last,
    )
    assert connection.execute(
        "SELECT status, actual_termination_date FROM app.leases WHERE id = %s", (lease_id,)
    ).fetchone() == ("TERMINATED", last)


def test_only_a_signed_month_to_month_agreement_ends_this_way(connection: Db) -> None:
    today = _today()
    start = (today.replace(day=1) - timedelta(days=40)).replace(day=1)
    actor_id, property_id = setup(connection)
    space_id = insert_space(connection, actor_id, property_id)
    customer_id = insert_customer(connection, actor_id, legal_name="Parker fixed")
    car = add_vehicle(connection, actor_id, property_id, customer_id, "CAR", "2A-4602")
    fixed = create_draft(
        connection,
        actor_id=actor_id,
        unit_id=space_id,
        primary_tenant_id=customer_id,
        start_date=start,
        end_date=date(today.year + 1, 12, 31),
    )
    connection.execute(PICK, (uuid4(), fixed, car, actor_id))
    # A draft, and an agreement with its own End Date, are refused.
    assert refusal(connection, END, (uuid4(), fixed, "OWNER", today, None, actor_id)) == (
        "55000",
        "LEASE_NOT_MONTH_TO_MONTH",
    )
    assert _sign(connection, property_id, fixed, actor_id) == ("signed",)
    assert refusal(connection, END, (uuid4(), fixed, "OWNER", today, None, actor_id)) == (
        "55000",
        "LEASE_NOT_MONTH_TO_MONTH",
    )
    # The End Date of a signed Lease is still never changed directly.
    assert refusal(
        connection,
        "UPDATE app.leases SET end_date = %s WHERE id = %s",
        (date(today.year + 1, 6, 30), fixed),
    )[0] in {"55000", "23514", "P0001"}


def test_an_owner_letter_ends_it_30_days_later_but_never_cuts_a_billed_month(
    connection: Db,
) -> None:
    today = _today()
    start = today.replace(day=1)
    actor_id, _, lease_id, _ = _monthly(connection, start, "2A-4603")
    billed = connection.execute(
        "SELECT max(line.period_end) FROM app.invoices AS invoice "
        "JOIN app.invoice_lines AS line ON line.invoice_id = invoice.id "
        "WHERE invoice.lease_id = %s AND invoice.status NOT IN ('DRAFT', 'VOID')",
        (lease_id,),
    ).fetchone()
    assert billed is not None
    row = connection.execute(END, (uuid4(), lease_id, "OWNER", today, None, actor_id)).fetchone()
    assert row is not None
    last_billed = cast(date | None, billed[0]) or today
    expected = max(today + timedelta(days=30), last_billed, start + timedelta(days=1))
    assert cast(dict[str, Any], row[0])["ending"]["ends_on"] == expected.isoformat()


def test_the_app_ends_an_agreement_only_through_the_function(connection: Db) -> None:
    row = connection.execute(
        "SELECT has_function_privilege('prm_runtime', "
        "'app.end_parking_agreement(uuid, uuid, text, date, text, uuid)', 'EXECUTE'), "
        "has_table_privilege('prm_runtime', 'app.parking_agreement_endings', 'INSERT'), "
        "has_table_privilege('prm_runtime', 'app.parking_agreement_endings', 'SELECT')"
    ).fetchone()
    assert row == (True, False, True)
