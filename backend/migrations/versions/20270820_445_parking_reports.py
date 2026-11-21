# ruff: noqa: E501
"""Parking step 5b: Reports show parking money on its own and leave spaces out of room counts (DL-257).

1. Total Income: the Rent of a Parking agreement and the parking Service of a room Lease are a
   part of their own, "Parking" (kind `PARKING_CHARGES`), instead of counting with Rent and
   Services. A missed amount keeps its line's kind.
2. Unit occupancy: a parking space is not a room, so it is left out, as on Home (DL-256).

Technical shape by Claude under the owner's 2026-10-23 22:30 rule; the owner agreed that parking
money shows on its own line in reports (parking plan, phase 2). Additive, forward-only.
"""

from collections.abc import Sequence

from alembic import op
from sqlalchemy import text

revision: str = "20270820_445"
down_revision: str | None = "20270819_444"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

INCOME = "app.report_income_facts(uuid,uuid,uuid[])"
OCCUPANCY = "app.report_unit_occupancy(uuid,uuid,uuid[])"

INCOME_PATCH = (
    (
        """            SELECT i.id, i.invoice_date, i.billing_period_start, i.primary_category, i.missed_on_invoice_line_id, i.late_payment_decision_id,
                   lease_unit.id AS unit_id
""",
        """            SELECT i.id, i.invoice_date, i.billing_period_start, i.primary_category, i.missed_on_invoice_line_id, i.late_payment_decision_id,
                   lease_unit.id AS unit_id, COALESCE(l.on_parking_space, false) AS on_parking_space
""",
    ),
    (
        """                   CASE WHEN invoice.late_payment_decision_id IS NOT NULL THEN 'LATE_PAYMENT_CHARGES' WHEN EXISTS(""",
        """                   CASE WHEN invoice.late_payment_decision_id IS NOT NULL THEN 'LATE_PAYMENT_CHARGES'
                   -- DL-257: parking money is a part of its own.
                   WHEN (COALESCE(missed.category, line.category)='RENT' AND invoice.on_parking_space)
                       OR (COALESCE(missed.category, line.category)='SERVICE_CHARGES' AND EXISTS(
                           SELECT 1 FROM app.parking_space_holds hold
                           WHERE hold.lease_service_term_id=COALESCE(missed.lease_service_term_id, line.lease_service_term_id)))
                       THEN 'PARKING_CHARGES'
                   WHEN EXISTS(""",
    ),
)

OCCUPANCY_PATCH = (
    (
        """          AND unit.for_rent
        ORDER BY unit.unit_number, unit.id;""",
        """          AND unit.for_rent
          -- DL-257: a parking space is not a room.
          AND unit.unit_kind<>'PARKING'
        ORDER BY unit.unit_number, unit.id;""",
    ),
)


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
    _patch(INCOME, INCOME_PATCH)
    _patch(OCCUPANCY, OCCUPANCY_PATCH)


def downgrade() -> None:
    raise RuntimeError("Parking reports migration 20270820_445 is forward-only")
