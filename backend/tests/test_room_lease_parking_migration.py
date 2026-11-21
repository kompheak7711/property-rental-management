"""PostgreSQL tests for parking on a room Lease (migration 20270815_440, DL-253 step 3b).

Owner decision of 20 Nov 2026: a room tenant pays the price of the space picked, on the same Rent
Invoice. The price is copied when the space is picked and never changes after. A second owner
decision the same day: such a Lease cannot be signed until its space is picked.
"""

from __future__ import annotations

import hashlib
from datetime import date
from pathlib import Path
from typing import Any, cast
from uuid import UUID, uuid4

import psycopg
import pytest
from alembic.config import Config
from alembic.script import ScriptDirectory

from test_invoice_migration import financial_database_url, runtime_database_url
from test_invoice_migration import migrated_database_url as migrated_database_url
from test_lease_migration import create_draft, setup_sources, sign_lease

REVISION = "20270815_440"
HOLD = "SELECT app.hold_room_parking_space(%s, %s, %s, %s, %s, %s)"
START, END = date(2027, 1, 1), date(2027, 12, 31)


def _one(url: str, query: str, *values: object) -> tuple[Any, ...]:
    with psycopg.connect(url) as connection:
        row = connection.execute(query, values).fetchone()
    assert row is not None
    return row


def _refusal(url: str, query: str, *values: object) -> tuple[str, str]:
    with psycopg.connect(url) as connection:
        try:
            connection.execute(query, values)
        except psycopg.Error as error:
            return str(error.sqlstate), str(error.diag.message_hint or "")
    raise AssertionError("the statement was not refused")


def _parking_lease(url: str, *, space_price: int = 3500, rate: int = 2000) -> dict[str, Any]:
    """A drafted room Lease with a parking Service (Settings rate `rate`) and a free space."""
    with psycopg.connect(url) as connection:
        actor, prop, room, customer, _ = setup_sources(connection)
        type_id, service_id, approval_id, term_id = uuid4(), uuid4(), uuid4(), uuid4()
        connection.execute(
            "INSERT INTO app.service_types(id, property_id, name_en, one_per_lease, "
            "needs_parking_space, created_by, updated_by) VALUES (%s, %s, %s, false, true, %s, %s)",
            (type_id, prop, f"Parking {type_id.hex[:8]}", actor, actor),
        )
        connection.execute(
            "INSERT INTO app.property_services(id, property_id, service_code, display_name, "
            "service_type_id, configured_by, created_by, updated_by) "
            "VALUES (%s, %s, %s, 'Car parking', %s, %s, %s, %s)",
            (service_id, prop, f"PARK_{type_id.hex[:8].upper()}", type_id, actor, actor, actor),
        )
        connection.execute(
            "INSERT INTO app.service_rates(id, property_service_id, monthly_rate_usd_cents, "
            "effective_date, actor_id, occurred_at) "
            "VALUES (%s, %s, %s, DATE '2026-01-01', %s, statement_timestamp())",
            (uuid4(), service_id, rate, actor),
        )
        connection.execute(
            "INSERT INTO app.property_service_approval_periods(id, property_service_id, "
            "effective_from, effective_through, approval_reference, approved_at, approved_by, "
            "reason) VALUES (%s, %s, DATE '2026-01-01', DATE '2028-12-31', 'OWNER-PARK', "
            "statement_timestamp(), %s, 'Approved parking')",
            (approval_id, service_id, actor),
        )
        lease = create_draft(
            connection,
            actor_id=actor,
            unit_id=room,
            primary_tenant_id=customer,
            start_date=START,
            end_date=END,
        )
        connection.execute(
            "INSERT INTO app.lease_service_terms(id, lease_id, property_service_id, "
            "applicable_from, applicable_through, service_approval_period_id, terms_reference, "
            "recorded_at, recorded_by) VALUES (%s, %s, %s, %s, NULL, %s, 'LEASE-PARK', "
            "statement_timestamp(), %s)",
            (term_id, lease, service_id, START, approval_id, actor),
        )
        space = uuid4()
        connection.execute(
            "INSERT INTO app.units(id, property_id, unit_number, floor, unit_type, status, "
            "unit_kind, parking_capacity, default_monthly_rent_usd_cents, created_by, updated_by) "
            "VALUES (%s, %s, %s, 'G', 'COVERED', 'VACANT', 'PARKING', 1, %s, %s, %s)",
            (space, prop, f"P{space.hex[:8].upper()}", space_price, actor, actor),
        )
        car = uuid4()
        connection.execute(
            "SELECT app.create_vehicle(%s, %s, %s, 'CAR', %s, NULL, NULL, NULL, %s)",
            (car, prop, customer, f"2A-{car.hex[:4]}", actor),
        )
    return {
        "url": url,
        "actor": actor,
        "prop": prop,
        "customer": customer,
        "lease": lease,
        "term": term_id,
        "space": space,
        "car": car,
    }


def _hold(case: dict[str, Any], hold_id: UUID | None = None, **changes: Any) -> dict[str, Any]:
    values = {"space": case["space"], "car": case["car"], **changes}
    with psycopg.connect(runtime_database_url()) as connection:
        row = connection.execute(
            HOLD,
            (
                hold_id or uuid4(),
                case["lease"],
                case["term"],
                values["space"],
                values["car"],
                case["actor"],
            ),
        ).fetchone()
    assert row is not None
    return cast(dict[str, Any], row[0])


def _initial_invoice(case: dict[str, Any]) -> UUID:
    invoice = uuid4()
    with psycopg.connect(financial_database_url()) as connection:
        connection.execute(
            "SELECT app.generate_rent_service_invoice"
            "(%s,%s,%s,%s,%s,%s,NULL,'INITIAL',%s,clock_timestamp(),%s,NULL)",
            (
                case["prop"],
                uuid4(),
                hashlib.sha256(invoice.bytes).hexdigest(),
                invoice,
                f"RENT-I-PARK-{invoice.hex[:12]}",
                case["lease"],
                START,
                case["actor"],
            ),
        )
    return invoice


def _parking_lines(url: str, invoice: UUID) -> list[tuple[Any, ...]]:
    with psycopg.connect(url) as connection:
        return connection.execute(
            "SELECT line.amount_usd_cents, line.contractual_monthly_usd_cents, "
            "line.service_rate_id, component.service_rate_id, "
            "component.service_monthly_rate_usd_cents, invoice.status "
            "FROM app.invoice_lines AS line "
            "JOIN app.invoices AS invoice ON invoice.id = line.invoice_id "
            "JOIN app.invoice_line_calculation_components AS component "
            "  ON component.invoice_line_id = line.id "
            "WHERE line.invoice_id = %s AND line.category = 'SERVICE_CHARGES' "
            "ORDER BY line.line_sequence",
            (invoice,),
        ).fetchall()


def test_migration_is_the_single_head_and_forward_only() -> None:
    scripts = ScriptDirectory.from_config(Config(str(Path(__file__).parents[1] / "alembic.ini")))
    assert scripts.get_heads() == ["20270822_447"]  # parking step 4b is the head
    revision = scripts.get_revision(REVISION)
    assert revision is not None and revision.down_revision == "20270814_439"
    with pytest.raises(RuntimeError, match="forward-only"):
        revision.module.downgrade()


def test_a_picked_space_is_billed_at_its_price_on_the_rent_invoice(
    migrated_database_url: str,
) -> None:
    case = _parking_lease(migrated_database_url)
    url = case["url"]
    parking = cast(
        dict[str, Any],
        _one(url, "SELECT app.lease_parking(%s)", case["lease"])[0],
    )
    (term,) = parking["terms"]
    assert term["hold"] is None
    assert str(case["space"]) in {space["unit_id"] for space in term["free_spaces"]}
    assert [vehicle["vehicle_id"] for vehicle in parking["vehicles"]] == [str(case["car"])]

    hold_id = uuid4()
    held = _hold(case, hold_id)
    assert (held["monthly_price_usd_cents"], held["held_from"], held["held_until"]) == (
        3500,
        "2027-01-01",
        "2027-12-31",
    )
    assert _hold(case, hold_id) == held  # a retry answers the same
    assert _refusal(
        runtime_database_url(),
        HOLD,
        uuid4(),
        case["lease"],
        case["term"],
        case["space"],
        case["car"],
        case["actor"],
    ) == ("23505", "PARKING_ALREADY_HELD")
    # The space's price changes later; the hold keeps the price it was picked at.
    with psycopg.connect(url) as connection:
        connection.execute(
            "UPDATE app.units SET default_monthly_rent_usd_cents = 9000, version = version + 1 "
            "WHERE id = %s",
            (case["space"],),
        )
    assert (
        _refusal(
            url,
            "UPDATE app.parking_space_holds SET monthly_price_usd_cents = 1, version = version + 1 "
            "WHERE id = %s",
            hold_id,
        )[0]
        == "55000"
    )
    taken = cast(dict[str, Any], _one(url, "SELECT app.lease_parking(%s)", case["lease"])[0])
    assert taken["terms"][0]["hold"]["space_number"] == held["space_number"]
    assert str(case["space"]) not in {s["unit_id"] for s in taken["terms"][0]["free_spaces"]}
    assert _one(
        url,
        "SELECT action FROM app.audit_events "
        "WHERE entity_id = %s AND action = 'parking.space_held'",
        case["lease"],
    ) == ("parking.space_held",)

    preview = cast(
        dict[str, Any],
        _one(url, "SELECT app.lease_signing_preview(%s, %s)", case["prop"], case["lease"])[0],
    )
    assert [line["amount_usd_cents"] for line in preview["initial"]["service_lines"]] == [3500]

    with psycopg.connect(url) as connection:
        sign_lease(connection, case["lease"], case["actor"])
    invoice = _initial_invoice(case)
    # One full month of parking at the space's price, with no Settings rate on the line.
    assert _parking_lines(url, invoice) == [(3500, 3500, None, None, 3500, "UNPAID")]


def test_a_lease_with_parking_is_signed_only_after_its_space_is_picked(
    migrated_database_url: str,
) -> None:
    case = _parking_lease(migrated_database_url, rate=2000)
    url = case["url"]

    def sign() -> tuple[str, str]:
        version = _one(url, "SELECT version FROM app.leases WHERE id = %s", case["lease"])[0]
        with psycopg.connect(url) as connection:
            try:
                connection.execute(
                    "SELECT app.sign_lease(%s, %s, %s, %s, %s, %s, statement_timestamp(), "
                    "'Signed', %s)",
                    (
                        case["prop"],
                        uuid4(),
                        hashlib.sha256(uuid4().bytes).hexdigest(),
                        uuid4(),
                        case["lease"],
                        version,
                        case["actor"],
                    ),
                )
            except psycopg.Error as error:
                return str(error.sqlstate), str(error.diag.message_hint or "")
        return "signed", ""

    assert sign() == ("23514", "PARKING_SPACE_NOT_PICKED")
    _hold(case)
    assert sign() == ("signed", "")
    assert _one(url, "SELECT status FROM app.leases WHERE id = %s", case["lease"]) == ("SIGNED",)


def test_a_space_is_picked_only_for_an_open_room_lease_with_a_priced_space(
    migrated_database_url: str,
) -> None:
    case = _parking_lease(migrated_database_url, space_price=3500)
    url = case["url"]
    with psycopg.connect(url) as connection:
        unpriced = uuid4()
        connection.execute(
            "INSERT INTO app.units(id, property_id, unit_number, floor, unit_type, status, "
            "unit_kind, parking_capacity, created_by, updated_by) "
            "VALUES (%s, %s, %s, 'G', 'COVERED', 'VACANT', 'PARKING', 1, %s, %s)",
            (unpriced, case["prop"], f"P{unpriced.hex[:8].upper()}", case["actor"], case["actor"]),
        )
        motorbike = uuid4()
        connection.execute(
            "SELECT app.create_vehicle(%s, %s, %s, 'MOTORBIKE', %s, NULL, NULL, NULL, %s)",
            (motorbike, case["prop"], case["customer"], f"1B-{motorbike.hex[:4]}", case["actor"]),
        )
    runtime = runtime_database_url()
    base = (case["lease"], case["term"])
    assert _refusal(runtime, HOLD, uuid4(), *base, unpriced, None, case["actor"]) == (
        "23514",
        "TYPE_HAS_NO_PRICE",
    )
    assert _refusal(runtime, HOLD, uuid4(), *base, case["space"], motorbike, case["actor"]) == (
        "23514",
        "VEHICLE_TYPE",
    )
    assert (
        _refusal(
            runtime, HOLD, uuid4(), case["lease"], uuid4(), case["space"], None, case["actor"]
        )[0]
        == "P0002"
    )
    # No vehicle yet is fine: the space is held and billed.
    assert _hold(case, car=None)["vehicle_id"] is None


def test_the_app_runs_the_new_functions_only(migrated_database_url: str) -> None:
    del migrated_database_url
    with psycopg.connect(runtime_database_url()) as connection:
        row = connection.execute(
            "SELECT has_function_privilege('prm_runtime', "
            "'app.hold_room_parking_space(uuid, uuid, uuid, uuid, uuid, uuid)', 'EXECUTE'), "
            "has_function_privilege('prm_runtime', 'app.lease_parking(uuid)', 'EXECUTE'), "
            "has_function_privilege('prm_runtime', "
            "'app.parking_hold_json(app.parking_space_holds)', 'EXECUTE'), "
            "has_table_privilege('prm_runtime', 'app.parking_space_holds', 'INSERT')"
        ).fetchone()
    assert row == (True, True, False, False)
