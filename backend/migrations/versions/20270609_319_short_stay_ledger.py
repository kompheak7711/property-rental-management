# ruff: noqa: E501
"""Daily and weekly rent, phase 6 step 5d: short-stay money in the General Ledger.

The tech plan (03/11/2026): "Each booking gets an Invoice and a Receipt, so money reports and the
General Ledger see it". The ledger job already posts every Invoice, Payment, Customer Credit and
Refund. This step makes the short-stay records post to the right accounts and adds the money the
ledger did not see yet:

1. A short-stay Invoice (the stay, an extension, an early check-in or late check-out fee) is rent:
   its lines go to 4010 Rent instead of 4080 Other income, and each line carries the booking's
   Unit. A damage Invoice goes to 4070 Damage recovered. A discount or a cancel credit (credit
   adjustments of those lines) takes off the same account.
2. A cash deposit: taken, DR the USD cash account, CR 2100 Security Deposits held; at the end,
   DR 2100, CR cash for what goes back and CR 4070 Damage recovered for what approved damage kept.
   2100's list in the books check counts the cash deposits held, so the check stays green.
3. A card hold moves no money. When approved damage keeps it, the card is charged: DR the bank
   account, CR 4070 Damage recovered.
4. A booking paid on the booking site has no Invoice: the site pays the hotel later, net of its
   share. Nothing posts until the site payouts are set up (the owner has not connected the sites;
   their fees start at 0%, owner 05/11/2026).

A record the job cannot post (no USD cash account or no bank account in the ledger) waits in
"Needs check" like other records and posts by itself once the account exists. Account choices by
Claude under the owner's 2026-10-23 22:30 rule (non-money: which existing account a record uses).
Forward-only and additive.
"""

import re
from collections.abc import Sequence

from alembic import op
from sqlalchemy import text

revision: str = "20270609_319"
down_revision: str | None = "20270608_318"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

FUNCTIONS = r"""
-- Each short-stay Invoice with its booking's Unit and the income account of its lines.
CREATE VIEW app.short_stay_invoice_accounts AS
    SELECT booking.invoice_id, booking.id AS booking_id, booking.unit_id, '4010'::text AS code
    FROM app.short_stay_bookings AS booking WHERE booking.invoice_id IS NOT NULL
    UNION ALL
    SELECT extra.invoice_id, booking.id, booking.unit_id, '4010'
    FROM app.short_stay_extra_invoices AS extra
    JOIN app.short_stay_bookings AS booking ON booking.id = extra.booking_id
    UNION ALL
    SELECT damage.invoice_id, booking.id, booking.unit_id, '4070'
    FROM app.short_stay_damages AS damage
    JOIN app.short_stay_bookings AS booking ON booking.id = damage.booking_id
    WHERE damage.invoice_id IS NOT NULL;
REVOKE ALL ON app.short_stay_invoice_accounts FROM PUBLIC;

-- The cash deposits the front desk holds now (2100's list in the books check).
CREATE FUNCTION app.short_stay_cash_deposits_held(p_property uuid) RETURNS bigint
LANGUAGE sql STABLE SET search_path = pg_catalog AS $$
    SELECT coalesce(sum(deposit.amount_usd_cents), 0)::bigint
    FROM app.short_stay_deposits AS deposit
    JOIN app.short_stay_bookings AS booking ON booking.id = deposit.booking_id
    WHERE booking.property_id = p_property AND deposit.kind = 'CASH' AND deposit.status = 'HELD'
$$;
REVOKE ALL ON FUNCTION app.short_stay_cash_deposits_held(uuid) FROM PUBLIC;

-- The ledger entries of the short-stay deposits, in the shape of app.gl_app_record_events.
CREATE FUNCTION app.gl_short_stay_deposit_events(p_property uuid)
RETURNS TABLE (source_type text, source_id uuid, posting_key text, event_date date,
    event_at timestamptz, entry_kind text, description text, problem text, lines jsonb)
LANGUAGE sql STABLE SET search_path = pg_catalog AS $$
WITH zone AS (
    SELECT property.timezone_name AS tz FROM app.properties AS property WHERE property.id = p_property
),
cash AS (
    SELECT (SELECT account.code FROM app.gl_accounts AS account
            WHERE account.property_id = p_property AND account.cash_kind = 'CASH_USD'
              AND account.is_active AND account.is_postable
            ORDER BY account.code LIMIT 1) AS code,
        (SELECT account.code FROM app.gl_accounts AS account
            WHERE account.property_id = p_property AND account.cash_kind = 'BANK'
              AND account.is_active AND account.is_postable
            ORDER BY account.code LIMIT 1) AS bank
),
deposit AS (
    SELECT d.id, d.kind, d.amount_usd_cents AS amount, d.kept_usd_cents AS kept, d.status,
        d.taken_at, d.ended_at, booking.booking_number, booking.customer_id, booking.unit_id
    FROM app.short_stay_deposits AS d
    JOIN app.short_stay_bookings AS booking ON booking.id = d.booking_id
    WHERE booking.property_id = p_property
)
-- A cash deposit taken.
SELECT 'SHORT_STAY_DEPOSIT', d.id, 'short_stay_deposit:' || d.id || ':taken',
    timezone(zone.tz, d.taken_at)::date, d.taken_at, 'AUTO',
    'Short-stay deposit taken for ' || d.booking_number,
    CASE WHEN cash.code IS NULL THEN 'No USD cash account is in the ledger' END,
    jsonb_build_array(
        jsonb_build_object('account', cash.code, 'debit_cents', d.amount, 'memo', d.booking_number,
            'customer_id', d.customer_id, 'lease_id', NULL, 'unit_id', d.unit_id),
        jsonb_build_object('account', '2100', 'credit_cents', d.amount, 'memo', d.booking_number,
            'customer_id', d.customer_id, 'lease_id', NULL, 'unit_id', d.unit_id))
FROM deposit AS d CROSS JOIN zone CROSS JOIN cash
WHERE d.kind = 'CASH'
UNION ALL
-- A cash deposit ended: what goes back to the guest and what approved damage kept.
SELECT 'SHORT_STAY_DEPOSIT', d.id, 'short_stay_deposit:' || d.id || ':ended',
    timezone(zone.tz, d.ended_at)::date, d.ended_at, 'AUTO',
    'Short-stay deposit ' || CASE WHEN d.kept > 0 THEN 'kept for damage' ELSE 'returned' END
        || ' for ' || d.booking_number,
    CASE WHEN cash.code IS NULL AND d.kept < d.amount THEN 'No USD cash account is in the ledger' END,
    jsonb_build_array(
        jsonb_build_object('account', '2100', 'debit_cents', d.amount, 'memo', d.booking_number,
            'customer_id', d.customer_id, 'lease_id', NULL, 'unit_id', d.unit_id),
        jsonb_build_object('account', cash.code, 'credit_cents', d.amount - d.kept,
            'memo', d.booking_number, 'customer_id', d.customer_id, 'lease_id', NULL,
            'unit_id', d.unit_id),
        jsonb_build_object('account', '4070', 'credit_cents', d.kept, 'memo', d.booking_number,
            'customer_id', d.customer_id, 'lease_id', NULL, 'unit_id', d.unit_id))
FROM deposit AS d CROSS JOIN zone CROSS JOIN cash
WHERE d.kind = 'CASH' AND d.status <> 'HELD'
UNION ALL
-- A card hold kept for approved damage: the card is charged and the money comes to the bank.
SELECT 'SHORT_STAY_DEPOSIT', d.id, 'short_stay_deposit:' || d.id || ':card_kept',
    timezone(zone.tz, d.ended_at)::date, d.ended_at, 'AUTO',
    'Short-stay card hold kept for damage for ' || d.booking_number,
    CASE WHEN cash.bank IS NULL THEN 'No bank account is in the ledger' END,
    jsonb_build_array(
        jsonb_build_object('account', cash.bank, 'debit_cents', d.kept, 'memo', d.booking_number,
            'customer_id', d.customer_id, 'lease_id', NULL, 'unit_id', d.unit_id),
        jsonb_build_object('account', '4070', 'credit_cents', d.kept, 'memo', d.booking_number,
            'customer_id', d.customer_id, 'lease_id', NULL, 'unit_id', d.unit_id))
FROM deposit AS d CROSS JOIN zone CROSS JOIN cash
WHERE d.kind = 'CARD_HOLD' AND d.status = 'KEPT'
$$;
REVOKE ALL ON FUNCTION app.gl_short_stay_deposit_events(uuid) FROM PUBLIC;
"""

# function signature -> ((old text, new text), ...); each old text must appear exactly once.
PATCHES: dict[str, tuple[tuple[str, str], ...]] = {
    "app.gl_app_record_events(uuid, date, date)": (
        # 1. Short-stay Invoice lines: their Unit and their income account.
        (
            "        i.invoice_number, i.customer_id, i.lease_id, lease.unit_id, i.issued_at,\n",
            "        i.invoice_number, i.customer_id, i.lease_id,\n"
            "        coalesce(lease.unit_id, stay.unit_id) AS unit_id, i.issued_at,\n",
        ),
        ("        CASE l.category\n", "        coalesce(stay.code, CASE l.category\n"),
        ("        END AS other_code\n", "        END) AS other_code\n"),
        (
            "    LEFT JOIN app.unit_cleaning_charges AS cleaning ON cleaning.obligation_id = l.authorized_obligation_id\n",
            "    LEFT JOIN app.unit_cleaning_charges AS cleaning ON cleaning.obligation_id = l.authorized_obligation_id\n"
            "    LEFT JOIN app.short_stay_invoice_accounts AS stay ON stay.invoice_id = i.id\n",
        ),
        (
            "        i.invoice_number, i.customer_id, i.lease_id, lease.unit_id,\n"
            "        coalesce(l.category, i.primary_category) AS category,\n",
            "        i.invoice_number, i.customer_id, i.lease_id,\n"
            "        coalesce(lease.unit_id, lc.unit_id) AS unit_id,\n"
            "        coalesce(l.category, i.primary_category) AS category,\n",
        ),
        # 2 and 3. The short-stay deposits.
        (
            "\n)\nSELECT raw.source_type, raw.source_id,",
            "\n    UNION ALL\n"
            "    -- Daily and weekly rent: cash deposits and card holds kept for damage.\n"
            "    SELECT * FROM app.gl_short_stay_deposit_events(p_property)\n"
            ")\nSELECT raw.source_type, raw.source_id,",
        ),
    ),
    "app.gl_control_lists(uuid)": (
        (
            "UNION ALL SELECT '2100', coalesce(sum(balance_usd_cents) FILTER (WHERE balance_kind = 'SECURITY_DEPOSIT'), 0)::bigint FROM sources\n",
            "UNION ALL SELECT '2100', coalesce(sum(balance_usd_cents) FILTER (WHERE balance_kind = 'SECURITY_DEPOSIT'), 0)::bigint\n"
            "        + app.short_stay_cash_deposits_held(p_property) FROM sources\n",
        ),
    ),
}


def _literal_colons(sql: str) -> str:
    """Keep ``'invoice:...:issue'`` text from reading as a SQLAlchemy bind parameter."""
    return re.sub(r"(?<![:\w\\]):(?=\w)", r"\\:", sql)


def _patch(signature: str, changes: tuple[tuple[str, str], ...]) -> None:
    definition = str(
        op.get_bind()
        .execute(
            text("SELECT pg_catalog.pg_get_functiondef(CAST(:signature AS regprocedure))"),
            {"signature": signature},
        )
        .scalar_one()
    )
    for old, new in changes:
        if definition.count(old) != 1:
            raise RuntimeError(f"{signature} changed: expected one {old!r}")
        definition = definition.replace(old, new)
    # CREATE OR REPLACE keeps the function identity, owner, settings and privileges.
    op.execute(_literal_colons(definition))


def upgrade() -> None:
    op.execute(_literal_colons(FUNCTIONS))
    for signature, changes in PATCHES.items():
        _patch(signature, changes)


def downgrade() -> None:
    raise RuntimeError("The short-stay ledger migration is forward-only")
