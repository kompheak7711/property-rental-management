# ruff: noqa: E501
"""Parking step 5a: Home counts parking apart, and parking money has its own ledger line (DL-256).

1. Home: "Units occupied" counts rooms only (a parking space is not a room). A new card
   `parking_taken` gives the vehicle places held today and all places on the spaces staff rent
   out (spaces kept for short-stay guests are left out). The shared Motorbike area counts each
   of its places.
2. General Ledger: a new income account 4110 "Parking" in the chart template and in every chart
   already started. Rent of a Parking agreement (a Lease on a parking space) and the parking
   Service of a room Lease (a Service term that holds a space) post to 4110 instead of 4010
   Rent and 4020 Services. Rent still waits in 2050 until its month starts, as before.
   Records already posted stay as they are (the ledger is append-only).

Technical shape by Claude under the owner's 2026-10-23 22:30 rule; the owner agreed that parking
money shows on its own line (parking plan, phase 2). Additive, forward-only.
"""

from collections.abc import Sequence

from alembic import op
from sqlalchemy import text

revision: str = "20270819_444"
down_revision: str | None = "20270818_443"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

HOME = "app.home_page(uuid,uuid,uuid[],text[])"
LEDGER = "app.gl_app_record_events(uuid,date,date)"

HOME_PATCH = (
    (
        """                FROM app.units u) unit WHERE unit.property_id=p_property
              -- V1.1 (owner 2026-10-31): a Unit not for rent is not counted.
              AND unit.for_rent;
            v_cards := v_cards || jsonb_build_object('units_occupied', v_part);
""",
        """                FROM app.units u WHERE u.unit_kind <> 'PARKING') unit WHERE unit.property_id=p_property
              -- V1.1 (owner 2026-10-31): a Unit not for rent is not counted.
              AND unit.for_rent;
            v_cards := v_cards || jsonb_build_object('units_occupied', v_part);
            -- DL-256: parking spaces have their own count, in vehicle places.
            IF EXISTS(SELECT 1 FROM app.units space WHERE space.property_id=p_property
                AND space.unit_kind='PARKING') THEN
                SELECT jsonb_build_object(
                    'taken', COALESCE(sum(LEAST(space.parking_capacity, (SELECT count(*)
                        FROM app.parking_space_holds hold WHERE hold.space_unit_id=space.id
                          AND hold.voided_at IS NULL AND hold.held_from<=v_today
                          AND (hold.held_until IS NULL OR hold.held_until>=v_today)))), 0),
                    'total', COALESCE(sum(space.parking_capacity), 0)) INTO v_part
                FROM app.units space
                WHERE space.property_id=p_property AND space.unit_kind='PARKING'
                  AND space.for_rent AND NOT space.kept_for_short_stay_guests;
                v_cards := v_cards || jsonb_build_object('parking_taken', v_part);
            END IF;
""",
    ),
)

LEDGER_PATCH = (
    # Each line knows whether it is parking money: the Rent of a Lease on a parking space, or a
    # Service line whose Lease Service term holds a space. A missed amount keeps its line's kind.
    (
        """        i.primary_category, i.billing_period_start,
        coalesce(CASE WHEN i.late_payment_decision_id IS NOT NULL THEN '4050' END, stay.code, missed_stay.code, CASE missed.category
            WHEN 'RENT' THEN '4010'
""",
        """        i.primary_category, i.billing_period_start,
        app.gl_line_is_parking(coalesce(missed.id, l.id)) AS parking,
        coalesce(CASE WHEN i.late_payment_decision_id IS NOT NULL THEN '4050' END, stay.code, missed_stay.code,
            CASE WHEN app.gl_line_is_parking(coalesce(missed.id, l.id)) THEN '4110' END, CASE missed.category
            WHEN 'RENT' THEN '4010'
""",
    ),
    (
        """            CASE WHEN l.category = 'RENT'
                THEN app.gl_rent_account(l.rent_month, timezone(zone.tz, l.issued_at)::date)
                ELSE l.other_code END,
            'credit_cents', l.amount,""",
        """            CASE WHEN l.category = 'RENT'
                THEN app.gl_parking_rent_account(app.gl_rent_account(l.rent_month, timezone(zone.tz, l.issued_at)::date), l.parking)
                ELSE l.other_code END,
            'credit_cents', l.amount,""",
    ),
    (
        """    SELECT l.line_id, l.invoice_number, l.customer_id, l.lease_id, l.unit_id, l.rent_month,
        l.amount
""",
        """    SELECT l.line_id, l.invoice_number, l.customer_id, l.lease_id, l.unit_id, l.rent_month,
        l.parking, l.amount
""",
    ),
    (
        """            CASE WHEN l.category = 'RENT'
                THEN app.gl_rent_account(l.rent_month, timezone(zone.tz, v.occurred_at)::date)
                ELSE l.other_code END,""",
        """            CASE WHEN l.category = 'RENT'
                THEN app.gl_parking_rent_account(app.gl_rent_account(l.rent_month, timezone(zone.tz, v.occurred_at)::date), l.parking)
                ELSE l.other_code END,""",
    ),
    (
        """            jsonb_build_object('account', '4010', 'credit_cents', m.amount_left, 'memo', m.invoice_number,""",
        """            jsonb_build_object('account', app.gl_parking_rent_account('4010', m.parking), 'credit_cents', m.amount_left, 'memo', m.invoice_number,""",
    ),
    (
        """        coalesce(l.period_start, i.billing_period_start) AS period_start,
        coalesce(lc.other_code,""",
        """        coalesce(l.period_start, i.billing_period_start) AS period_start,
        coalesce(lc.parking, false) AS parking,
        coalesce(lc.other_code,""",
    ),
    (
        """                    THEN app.gl_rent_account(a.period_start, timezone(zone.tz, side.at)::date)
                    ELSE a.other_code END,""",
        """                    THEN app.gl_parking_rent_account(app.gl_rent_account(a.period_start, timezone(zone.tz, side.at)::date), a.parking)
                    ELSE a.other_code END,""",
    ),
)

HELPERS = r"""
CREATE FUNCTION app.gl_line_is_parking(p_line uuid) RETURNS boolean
LANGUAGE sql STABLE SET search_path = pg_catalog AS $$
    SELECT EXISTS (SELECT 1 FROM app.invoice_lines AS line
        JOIN app.invoices AS invoice ON invoice.id = line.invoice_id
        LEFT JOIN app.leases AS lease ON lease.id = invoice.lease_id
        WHERE line.id = p_line AND (
            (line.category = 'RENT' AND lease.on_parking_space)
            OR (line.category = 'SERVICE_CHARGES' AND line.lease_service_term_id IS NOT NULL
                AND EXISTS (SELECT 1 FROM app.parking_space_holds AS hold
                    WHERE hold.lease_service_term_id = line.lease_service_term_id))))
$$;
REVOKE ALL ON FUNCTION app.gl_line_is_parking(uuid) FROM PUBLIC;
COMMENT ON FUNCTION app.gl_line_is_parking(uuid) IS
    'Parking (DL-256): the line is parking money (Rent of a Parking agreement or a parking Service of a room Lease)';

CREATE FUNCTION app.gl_parking_rent_account(p_account text, p_parking boolean) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $$
    SELECT CASE WHEN p_account = '4010' AND p_parking THEN '4110' ELSE p_account END
$$;
REVOKE ALL ON FUNCTION app.gl_parking_rent_account(text, boolean) FROM PUBLIC;
COMMENT ON FUNCTION app.gl_parking_rent_account(text, boolean) IS
    'Parking (DL-256): Rent income of parking goes to 4110 Parking; Rent waiting for its month stays in 2050';

INSERT INTO app.gl_chart_template (code, name_en, name_km, account_type, is_contra,
    control_source, is_tax_locked, is_retained_earnings, allows_unit, bs_section, cash_kind,
    cash_flow_group)
SELECT '4110', 'Parking', 'ចំណត', template.account_type, template.is_contra,
    template.control_source, template.is_tax_locked, template.is_retained_earnings,
    template.allows_unit, template.bs_section, template.cash_kind, template.cash_flow_group
FROM app.gl_chart_template AS template WHERE template.code = '4010';

-- Every chart already started gets 4110, written by whoever started its Rent account.
INSERT INTO app.gl_accounts (id, property_id, code, name_en, name_km, account_type, is_contra,
    control_source, is_tax_locked, is_retained_earnings, allows_unit, bs_section, cash_kind,
    cash_flow_group, created_by)
SELECT gen_random_uuid(), rent.property_id, template.code, template.name_en, template.name_km,
    template.account_type, template.is_contra, template.control_source, template.is_tax_locked,
    template.is_retained_earnings, template.allows_unit, template.bs_section, template.cash_kind,
    template.cash_flow_group, rent.created_by
FROM app.gl_accounts AS rent
JOIN app.gl_chart_template AS template ON template.code = '4110'
WHERE rent.code = '4010'
  AND NOT EXISTS (SELECT 1 FROM app.gl_accounts AS taken
                  WHERE taken.property_id = rent.property_id AND taken.code = '4110');
"""


def _patch(signature: str, pairs: tuple[tuple[str, str], ...]) -> None:
    definition = str(
        op.get_bind()
        .execute(
            text("SELECT pg_catalog.pg_get_functiondef(CAST(:signature AS regprocedure))"),
            {"signature": signature},
        )
        .scalar_one()
    )
    for before, after in pairs:
        if definition.count(before) != 1:
            raise RuntimeError(f"{signature} source contract changed")
        definition = definition.replace(before, after)
    # CREATE OR REPLACE keeps the function identity, owner and privileges.
    op.get_bind().exec_driver_sql(definition)


def upgrade() -> None:
    op.execute(HELPERS)
    _patch(HOME, HOME_PATCH)
    _patch(LEDGER, LEDGER_PATCH)


def downgrade() -> None:
    raise RuntimeError("Parking Home and ledger migration 20270819_444 is forward-only")
