# ruff: noqa: E501
"""When the books were last updated (full test of 17/11/2026, finding 1; owner approval).

The billing worker posts the money records to the books on every pass. Until now nothing kept
when that last happened, so "Needs check" said "Every money record is in the ledger" even when no
pass had run for hours.

1. ``app.gl_posting_status`` holds one row per Property: when the last posting pass finished,
   how many records it posted and how many wait in Needs check. Each pass replaces the row. It is
   a status, not a money record: no amount is kept here.
2. ``app.gl_record_posting_pass`` is called by the worker after each pass (money login, the
   Property's billing service principal).
3. ``prm_runtime`` reads the row for the Needs check page and Home.

Adds one table and one function. Changes no existing data. Forward-only.
"""

from collections.abc import Sequence

from alembic import op

revision: str = "20270808_431"
down_revision: str | None = "20270807_424"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

UPGRADE = """
    CREATE TABLE app.gl_posting_status (
        property_id uuid PRIMARY KEY REFERENCES app.properties (id) ON DELETE RESTRICT,
        last_pass_at timestamptz NOT NULL,
        posted integer NOT NULL CHECK (posted >= 0),
        needs_check integer NOT NULL CHECK (needs_check >= 0)
    );
    COMMENT ON TABLE app.gl_posting_status IS
        'When the last ledger posting pass of each Property finished (finding 1 of the 17/11/2026 full test).';
    REVOKE ALL ON TABLE app.gl_posting_status FROM PUBLIC;
    GRANT SELECT ON TABLE app.gl_posting_status TO prm_runtime;

    CREATE FUNCTION app.gl_record_posting_pass(
        p_property uuid, p_actor uuid, p_posted integer, p_needs_check integer
    ) RETURNS timestamptz
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
        DECLARE v_at timestamptz := clock_timestamp();
        BEGIN
            IF p_property IS NULL OR p_posted IS NULL OR p_needs_check IS NULL
                OR p_posted < 0 OR p_needs_check < 0
            THEN RAISE EXCEPTION 'Invalid posting pass' USING ERRCODE = '22023'; END IF;
            PERFORM app.assert_active_financial_actor(p_actor, p_property);
            INSERT INTO app.gl_posting_status AS status
                (property_id, last_pass_at, posted, needs_check)
            VALUES (p_property, v_at, p_posted, p_needs_check)
            ON CONFLICT (property_id) DO UPDATE
                SET last_pass_at = EXCLUDED.last_pass_at,
                    posted = EXCLUDED.posted,
                    needs_check = EXCLUDED.needs_check;
            RETURN v_at;
        END
    $$;
    REVOKE ALL ON FUNCTION app.gl_record_posting_pass(uuid, uuid, integer, integer) FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION app.gl_record_posting_pass(uuid, uuid, integer, integer) TO prm_financial;
"""


def upgrade() -> None:
    op.execute(UPGRADE)


def downgrade() -> None:
    raise RuntimeError("the ledger posting status migration is forward-only")
