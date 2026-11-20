# ruff: noqa: E501
"""Parking step 4b: the Parking agreement on the Lease form and page (DL-254).

1. `leases.month_to_month`: a Parking agreement with no end date (owner answer Q6: it runs month
   by month until someone ends it). The Lease keeps the End Date 31 Dec 2099 so every Lease rule
   still has a date; this column says so, and the screens show "Month to month" instead.
2. `app.lease_parking(lease)` also answers whether the Lease is a Parking agreement, whether it
   runs month to month, its space, and the vehicle picked for it.

Technical shape by Claude under the owner's 2026-10-23 22:30 rule. Additive, forward-only.
"""

from collections.abc import Sequence

from alembic import op
from sqlalchemy import text

revision: str = "20270817_442"
down_revision: str | None = "20270816_441"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

COLUMNS = r"""
ALTER TABLE app.leases ADD COLUMN month_to_month boolean
    GENERATED ALWAYS AS (on_parking_space AND end_date = DATE '2099-12-31') STORED;
COMMENT ON COLUMN app.leases.month_to_month IS
    'Parking (DL-254): a Parking agreement with no end date; its End Date is 31 Dec 2099';
"""

READ = "app.lease_parking(uuid)"
READ_PATCH = (
    (
        """        'lease_status', (SELECT status FROM lease),
""",
        """        'lease_status', (SELECT status FROM lease),
        -- DL-254: a Parking agreement holds its own space with a vehicle.
        'on_parking_space', (SELECT unit_kind = 'PARKING' FROM lease),
        'month_to_month', (SELECT month_to_month FROM lease),
        'space', (SELECT jsonb_build_object('unit_id', space.id, 'unit_number', space.unit_number,
                'parking_type', space.unit_type, 'area', space.floor,
                'parking_capacity', space.parking_capacity)
            FROM lease JOIN app.units AS space ON space.id = lease.unit_id
            WHERE lease.unit_kind = 'PARKING'),
        'agreement_hold', (SELECT app.parking_hold_json(hold) FROM app.parking_space_holds AS hold
            WHERE hold.lease_id = p_lease_id AND hold.hold_kind = 'PARKING_AGREEMENT'
              AND hold.voided_at IS NULL
            ORDER BY hold.created_at DESC LIMIT 1),
""",
    ),
)


def _patch(signature: str, replacements: tuple[tuple[str, str], ...]) -> None:
    definition = (
        op.get_bind()
        .execute(
            text("SELECT pg_catalog.pg_get_functiondef(CAST(:signature AS regprocedure))"),
            {"signature": signature},
        )
        .scalar_one()
    )
    for before, after in replacements:
        if definition.count(before) != 1:
            raise RuntimeError(f"{signature} source contract changed")
        definition = definition.replace(before, after)
    # CREATE OR REPLACE keeps the function identity, owner and privileges.
    op.execute(definition)


def upgrade() -> None:
    op.execute(COLUMNS)
    _patch(READ, READ_PATCH)


def downgrade() -> None:
    raise RuntimeError("Parking agreement page migration 20270817_442 is forward-only")
