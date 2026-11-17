# ruff: noqa: E501
"""A hand-back on the Lease's first day needs no final Utility Invoice (DL-247).

Full test of 17/11/2026 (finding 2): a Customer who moves in and hands the Unit back on the Lease
Start Date has no day of electricity or water to bill (a Utility period starts the day after its
start reading). The final Utility Invoice command refused with UTILITY_START_READING_MISSING, and
the Final Settlement preview kept FINAL_UTILITY_NOT_ISSUED, so the Settlement could never close.
Owner decision of 17/11/2026: same day, no Utility charge.

1. The Final Settlement preview skips FINAL_UTILITY_NOT_ISSUED when the hand-back day is on or
   before the Lease Start Date, as it does for a Unit with no Meter (migration 238). The earlier
   Utility periods check (UTILITY_PERIOD_NOT_BILLED) is unchanged.
2. Home's "Refund due by" to-do (migration 222) counts such a Lease as billed, as it does for a
   Unit with no Meter.

Both functions are patched in place, as migrations 168, 174, 206 and 238 did: CREATE OR REPLACE
keeps their identity, owner and privileges. No data changes. Forward-only.
"""

from collections.abc import Sequence

from alembic import op
from sqlalchemy import text

revision: str = "20270809_432"
down_revision: str | None = "20270808_431"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

PREVIEW = "app.final_settlement_preview(uuid,uuid,uuid,text[])"
HOME = "app.home_page(uuid,uuid,uuid[],text[])"

BEFORE = """                    IF v_final.id IS NULL AND NOT EXISTS(SELECT 1
                        FROM app.utility_meters meter WHERE meter.unit_id=v_move_out.unit_id
                          AND meter.installed_date<=v_move_out.actual_move_out_date
                          AND (meter.deactivated_date IS NULL
                            OR meter.deactivated_date>=v_move_out.actual_move_out_date)) THEN
                        -- V1-058 R7b-7: no Meter on the hand-back day, nothing to read or bill.
                        NULL;
"""
AFTER = """                    IF v_move_out.actual_move_out_date<=v_lease.start_date THEN
                        -- DL-247: handed back on the Lease's first day, no day to bill.
                        NULL;
                    ELSIF v_final.id IS NULL AND NOT EXISTS(SELECT 1
                        FROM app.utility_meters meter WHERE meter.unit_id=v_move_out.unit_id
                          AND meter.installed_date<=v_move_out.actual_move_out_date
                          AND (meter.deactivated_date IS NULL
                            OR meter.deactivated_date>=v_move_out.actual_move_out_date)) THEN
                        -- V1-058 R7b-7: no Meter on the hand-back day, nothing to read or bill.
                        NULL;
"""

HOME_BEFORE = """                    -- V1-058 R7b-7: no Meter at all on the hand-back day, nothing to bill.
                    OR EXISTS(SELECT 1 FROM app.physical_move_out_events move_out
                        WHERE move_out.lease_id=lease.id AND NOT EXISTS(
                            SELECT 1 FROM app.physical_move_out_events later
                            WHERE later.supersedes_event_id=move_out.id)
                          AND NOT EXISTS(SELECT 1 FROM app.utility_meters meter
"""
HOME_AFTER = """                    -- DL-247: handed back on the Lease's first day, no day to bill.
                    OR EXISTS(SELECT 1 FROM app.physical_move_out_events move_out
                        WHERE move_out.lease_id=lease.id AND NOT EXISTS(
                            SELECT 1 FROM app.physical_move_out_events later
                            WHERE later.supersedes_event_id=move_out.id)
                          AND move_out.actual_move_out_date<=lease.start_date)
                    -- V1-058 R7b-7: no Meter at all on the hand-back day, nothing to bill.
                    OR EXISTS(SELECT 1 FROM app.physical_move_out_events move_out
                        WHERE move_out.lease_id=lease.id AND NOT EXISTS(
                            SELECT 1 FROM app.physical_move_out_events later
                            WHERE later.supersedes_event_id=move_out.id)
                          AND NOT EXISTS(SELECT 1 FROM app.utility_meters meter
"""


def _patch(signature: str, before: str, after: str) -> None:
    definition = (
        op.get_bind()
        .execute(
            text("SELECT pg_catalog.pg_get_functiondef(CAST(:signature AS regprocedure))"),
            {"signature": signature},
        )
        .scalar_one()
    )
    if definition.count(before) != 1:
        raise RuntimeError(f"{signature} source contract changed")
    # CREATE OR REPLACE keeps the function identity, owner and privileges.
    op.execute(definition.replace(before, after))


def upgrade() -> None:
    _patch(PREVIEW, BEFORE, AFTER)
    _patch(HOME, HOME_BEFORE, HOME_AFTER)


def downgrade() -> None:
    raise RuntimeError("the same-day move-out Utility migration is forward-only")
