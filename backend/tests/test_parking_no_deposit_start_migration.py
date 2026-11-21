"""PostgreSQL tests for a parking customer from before the app (migration 20270822_447, DL-259).

Owner answers Q5 and Q17: new parking customers pay a one-month deposit; a customer who parked
before the app paid none, so a Manager or the Owner may sign their Parking agreement with no
deposit and the reason "Customer from before the app".
"""

from __future__ import annotations

from datetime import date, timedelta
from pathlib import Path
from typing import Any, cast
from uuid import UUID, uuid4

import psycopg
import pytest
from alembic.config import Config
from alembic.script import ScriptDirectory

from payment_test_support import database_instant, seed_method
from property_rental.billing import month_end
from property_rental.lease_signing_api import PostgresLeaseSigningFlow, SignWithPaymentCommand
from test_customer_migration import insert_customer
from test_invoice_migration import financial_database_url, runtime_database_url
from test_lease_migration import create_draft
from test_parking_agreement_migration import PICK
from test_parking_spaces_migration import (
    add_vehicle,
    insert_space,
    migrated_database_url,
    setup,
)

__all__ = ["migrated_database_url"]

REVISION = "20270822_447"
START = "SELECT app.start_lease_without_deposit(%s, %s, %s)"
PLAN = "SELECT app.set_lease_planned_security_deposit(%s,%s,%s,%s,%s,%s,%s)"


def _refusal(url: str, statement: str, values: tuple[object, ...]) -> tuple[str, str]:
    with psycopg.connect(url) as connection:
        try:
            connection.execute(statement, values)
        except psycopg.Error as error:
            return str(error.sqlstate), str(error.diag.message_hint or "")
    raise AssertionError("the statement was not refused")


def _agreement(url: str, plate: str) -> dict[str, Any]:
    """A drafted Parking agreement from today with its vehicle and a one-month deposit typed."""
    with psycopg.connect(url) as connection:
        actor, prop = setup(connection)
        space = insert_space(connection, actor, prop)
        customer = insert_customer(connection, actor, legal_name=f"Parker {plate}")
        car = add_vehicle(connection, actor, prop, customer, "CAR", plate)
        row = connection.execute(
            "SELECT timezone(timezone_name, clock_timestamp())::date FROM app.properties "
            "WHERE id = %s",
            (prop,),
        ).fetchone()
        assert row is not None
        today = cast(date, row[0])
        lease = create_draft(
            connection,
            actor_id=actor,
            unit_id=space,
            primary_tenant_id=customer,
            start_date=today,
            end_date=month_end(today + timedelta(days=200)),
        )
        connection.execute(PICK, (uuid4(), lease, car, actor))
        method = seed_method(connection, actor)
    with psycopg.connect(runtime_database_url()) as connection:
        connection.execute(PLAN, (prop, lease, uuid4(), actor, 3500, "One month", "leases.draft"))
    return {
        "url": url,
        "actor": actor,
        "prop": prop,
        "lease": lease,
        "customer": customer,
        "method": method,
    }


def _flow() -> PostgresLeaseSigningFlow:
    return PostgresLeaseSigningFlow(runtime_database_url(), financial_database_url())


def _sign(case: dict[str, Any], amount: int) -> dict[str, Any]:
    with psycopg.connect(case["url"]) as connection:
        at = database_instant(connection) - timedelta(seconds=1)
        version = connection.execute(
            "SELECT version FROM app.leases WHERE id = %s", (case["lease"],)
        ).fetchone()
        signers = connection.execute(
            "SELECT id FROM app.lease_signers WHERE lease_id = %s AND signed_at IS NULL",
            (case["lease"],),
        ).fetchall()
    assert version is not None
    command = SignWithPaymentCommand(
        idempotency_key=uuid4(),
        expected_version=int(version[0]),
        signer_ids=tuple(UUID(str(row[0])) for row in signers),
        reason="Every Signer signed the paper agreement",
        payment_method_id=case["method"],
        received_amount_minor=amount,
        received_at=at,
        evidence_reference="Cash received, Cash",
        payer_intent_memo="Money received at signing the agreement",
    )
    return cast(
        dict[str, Any],
        _flow().sign_with_payment(case["prop"], case["lease"], command, case["actor"], True),
    )


def test_migration_is_the_single_head_and_forward_only() -> None:
    scripts = ScriptDirectory.from_config(Config(str(Path(__file__).parents[1] / "alembic.ini")))
    assert scripts.get_heads() == [REVISION]
    revision = scripts.get_revision(REVISION)
    assert revision is not None and revision.down_revision == "20270821_446"
    with pytest.raises(RuntimeError, match="forward-only"):
        revision.module.downgrade()


def test_a_customer_from_before_the_app_signs_with_no_deposit(migrated_database_url: str) -> None:
    case = _agreement(migrated_database_url, "2A-4701")
    preview = _flow().preview(case["prop"], case["lease"])
    assert preview["no_deposit_start"] is None
    start_id = uuid4()
    with psycopg.connect(runtime_database_url()) as connection:
        row = connection.execute(START, (start_id, case["lease"], case["actor"])).fetchone()
        # The same press again answers the same.
        again = connection.execute(START, (start_id, case["lease"], case["actor"])).fetchone()
    assert row is not None and again is not None
    assert cast(dict[str, Any], row[0])["reason"] == "Customer from before the app"
    assert again[0] == row[0]
    assert _refusal(runtime_database_url(), START, (uuid4(), case["lease"], case["actor"])) == (
        "23505",
        "NO_DEPOSIT_ALREADY_SET",
    )
    preview = _flow().preview(case["prop"], case["lease"])
    assert cast(dict[str, Any], preview["no_deposit_start"])["reason"] == (
        "Customer from before the app"
    )

    rent = int(cast(dict[str, Any], preview["initial"])["total_usd_cents"])
    result = _sign(case, rent)
    # Only the Initial Rent is paid; no Security Deposit is made.
    assert (result["rent_usd_cents"], result["deposit_usd_cents"]) == (rent, 0)
    assert result["deposit_id"] is None
    with psycopg.connect(case["url"]) as connection:
        assert connection.execute(
            "SELECT count(*) FROM app.deposits WHERE lease_id = %s", (case["lease"],)
        ).fetchone() == (0,)
        assert connection.execute(
            "SELECT status FROM app.leases WHERE id = %s", (case["lease"],)
        ).fetchone() == ("SIGNED",)
        assert connection.execute(
            "SELECT reason FROM app.audit_events WHERE entity_id = %s "
            "AND action = 'lease.no_deposit_start'",
            (case["lease"],),
        ).fetchone() == ("Customer from before the app",)
    # Once signed it is not changed any more.
    assert _refusal(runtime_database_url(), START, (uuid4(), case["lease"], case["actor"])) == (
        "23505",
        "NO_DEPOSIT_ALREADY_SET",
    )


def test_a_new_customer_still_pays_the_deposit_and_rooms_never_skip_it(
    migrated_database_url: str,
) -> None:
    case = _agreement(migrated_database_url, "2A-4702")
    preview = _flow().preview(case["prop"], case["lease"])
    rent = int(cast(dict[str, Any], preview["initial"])["total_usd_cents"])
    result = _sign(case, rent + 3500)
    assert result["deposit_usd_cents"] == 3500
    # A signed agreement, and a room Lease, cannot start with no deposit.
    assert _refusal(runtime_database_url(), START, (uuid4(), case["lease"], case["actor"])) == (
        "55000",
        "NOT_A_PARKING_DRAFT",
    )
    with psycopg.connect(case["url"]) as connection:
        room = connection.execute(
            "SELECT id FROM app.leases WHERE NOT on_parking_space AND status = 'DRAFTED' LIMIT 1"
        ).fetchone()
    if room is not None:
        assert _refusal(runtime_database_url(), START, (uuid4(), room[0], case["actor"])) == (
            "55000",
            "NOT_A_PARKING_DRAFT",
        )


def test_the_app_starts_with_no_deposit_only_through_the_function(
    migrated_database_url: str,
) -> None:
    with psycopg.connect(migrated_database_url) as connection:
        row = connection.execute(
            "SELECT has_function_privilege('prm_runtime', "
            "'app.start_lease_without_deposit(uuid, uuid, uuid)', 'EXECUTE'), "
            "has_table_privilege('prm_runtime', 'app.lease_no_deposit_starts', 'INSERT')"
        ).fetchone()
    assert row == (True, False)
