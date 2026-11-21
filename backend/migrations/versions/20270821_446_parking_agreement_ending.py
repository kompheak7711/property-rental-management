# ruff: noqa: E501
"""Parking step 5c: End a month-to-month Parking agreement by notice (DL-258).

Owner answers (parking plan Q15, Q16; deposit card of 21 Nov 2026):

- The customer tells before the 25th of a month: the agreement ends on the last day of that month;
  told on the 25th or later, it ends on the last day of the next month (Q15).
- The owner ends it with a letter: it ends 30 days after the day the letter is given (Q16).
- The agreement then ends on its own End Date, so it is not an early ending: the Security Deposit
  goes back, less money owed, in the Final Settlement (owner, 21 Nov 2026).

1. `app.parking_agreement_endings` (append-only): who told (CUSTOMER or OWNER), the day told, the
   new last day, the End Date before, a note, who recorded it.
2. `app.parking_agreement_end_day(told_by, told_on)`: the last day by the rules above.
3. `app.end_parking_agreement(ending, lease, told_by, told_on, note, actor)`: on a signed
   month-to-month Parking agreement, the End Date moves from 31 Dec 2099 to the last day; never
   before a month already billed on an issued Invoice. The space hold ends on the same day.
   Audited as `parking.agreement_ending`.
4. `app.protect_lease_history`: a signed Lease's End Date still never changes, except this one
   move, only inside the function above.
5. `app.lease_parking`: adds `ending` (who told, the day told, the last day).

Technical shape by Claude under the owner's 2026-10-23 22:30 rule. Additive, forward-only.
"""

from collections.abc import Sequence

from alembic import op
from sqlalchemy import text

revision: str = "20270821_446"
down_revision: str | None = "20270820_445"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

PROTECT = "app.protect_lease_history()"
LEASE_PARKING = "app.lease_parking(uuid)"

PROTECT_PATCH = (
    (
        """                    OR NEW.end_date IS DISTINCT FROM OLD.end_date
""",
        """                    -- DL-258: only app.end_parking_agreement moves the End Date of a signed
                    -- month-to-month Parking agreement to an earlier day.
                    OR (NEW.end_date IS DISTINCT FROM OLD.end_date AND NOT (
                        OLD.status = 'SIGNED' AND NEW.status = 'SIGNED' AND OLD.on_parking_space
                        AND OLD.end_date = DATE '2099-12-31' AND NEW.end_date < OLD.end_date
                        AND NEW.end_date > NEW.start_date
                        AND COALESCE(current_setting('app.parking_agreement_ending', true), '') = 'on'))
""",
    ),
)

LEASE_PARKING_PATCH = (
    (
        """        'month_to_month', (SELECT month_to_month FROM lease),
""",
        """        'month_to_month', (SELECT month_to_month FROM lease),
        -- DL-258: a month-to-month agreement ended by notice.
        'ending', (SELECT jsonb_build_object('told_by', ending.told_by, 'told_on', ending.told_on,
                'ends_on', ending.ends_on, 'note', ending.note)
            FROM app.parking_agreement_endings AS ending WHERE ending.lease_id = p_lease_id),
""",
    ),
)

SQL = r"""
CREATE TABLE app.parking_agreement_endings (
    id uuid PRIMARY KEY CHECK (id <> '00000000-0000-0000-0000-000000000000'::uuid),
    property_id uuid NOT NULL REFERENCES app.properties(id) ON DELETE RESTRICT,
    lease_id uuid NOT NULL UNIQUE REFERENCES app.leases(id) ON DELETE RESTRICT,
    told_by text NOT NULL CHECK (told_by IN ('CUSTOMER', 'OWNER')),
    told_on date NOT NULL CHECK (isfinite(told_on)),
    ends_on date NOT NULL CHECK (isfinite(ends_on)),
    previous_end_date date NOT NULL CHECK (isfinite(previous_end_date)),
    note text CHECK (note IS NULL OR (note = btrim(note) AND length(note) BETWEEN 1 AND 500)),
    actor_id uuid NOT NULL REFERENCES app.user_accounts(actor_id) ON DELETE RESTRICT,
    recorded_at timestamptz NOT NULL DEFAULT statement_timestamp() CHECK (isfinite(recorded_at)),
    CONSTRAINT parking_agreement_endings_earlier CHECK (ends_on < previous_end_date)
);
COMMENT ON TABLE app.parking_agreement_endings IS
    'Parking (DL-258): a month-to-month Parking agreement ended by notice; append-only';
CREATE TRIGGER parking_agreement_endings_append_only BEFORE UPDATE OR DELETE ON app.parking_agreement_endings
    FOR EACH ROW EXECUTE FUNCTION app.reject_parking_append_only();
CREATE TRIGGER parking_agreement_endings_reject_truncate BEFORE TRUNCATE ON app.parking_agreement_endings
    FOR EACH STATEMENT EXECUTE FUNCTION app.reject_parking_append_only();
REVOKE ALL ON TABLE app.parking_agreement_endings FROM PUBLIC, prm_runtime, prm_bootstrap;
GRANT SELECT ON TABLE app.parking_agreement_endings TO prm_runtime;

CREATE FUNCTION app.parking_agreement_end_day(p_told_by text, p_told_on date) RETURNS date
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $$
    SELECT CASE
        -- Q15: told before the 25th, the end of this month; else the end of next month.
        WHEN p_told_by = 'CUSTOMER' AND extract(day FROM p_told_on) < 25
            THEN (date_trunc('month', p_told_on) + interval '1 month - 1 day')::date
        WHEN p_told_by = 'CUSTOMER'
            THEN (date_trunc('month', p_told_on) + interval '2 months - 1 day')::date
        -- Q16: the owner's letter, 30 days after it is given.
        WHEN p_told_by = 'OWNER' THEN p_told_on + 30
    END
$$;
REVOKE ALL ON FUNCTION app.parking_agreement_end_day(text, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.parking_agreement_end_day(text, date) TO prm_runtime;
COMMENT ON FUNCTION app.parking_agreement_end_day(text, date) IS
    'Parking (DL-258): the last day of a month-to-month Parking agreement ended by notice (Q15, Q16)';

CREATE FUNCTION app.end_parking_agreement(p_ending_id uuid, p_lease_id uuid, p_told_by text,
    p_told_on date, p_note text, p_actor_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
    v_ending app.parking_agreement_endings%ROWTYPE;
    v_lease app.leases%ROWTYPE;
    v_property uuid;
    v_timezone text;
    v_today date;
    v_billed date;
    v_ends date;
BEGIN
    IF p_ending_id IS NULL OR p_lease_id IS NULL OR p_told_on IS NULL OR p_actor_id IS NULL
        OR NOT isfinite(p_told_on) OR p_told_by IS NULL OR p_told_by NOT IN ('CUSTOMER', 'OWNER')
        OR (p_note IS NOT NULL AND NOT app.vehicle_text_ok(p_note, 500))
    THEN RAISE EXCEPTION 'Agreement ending evidence is invalid' USING ERRCODE = '22023'; END IF;
    SELECT * INTO v_ending FROM app.parking_agreement_endings WHERE id = p_ending_id;
    IF FOUND THEN
        -- The same ending sent again (a retry) is answered again; another one is refused.
        IF v_ending.lease_id <> p_lease_id OR v_ending.told_by <> p_told_by
            OR v_ending.told_on <> p_told_on
        THEN RAISE EXCEPTION 'Agreement ending identity was reused' USING ERRCODE = '23505'; END IF;
        RETURN app.lease_parking(p_lease_id);
    END IF;
    SELECT * INTO v_lease FROM app.leases WHERE id = p_lease_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Lease was not found' USING ERRCODE = 'P0002'; END IF;
    IF EXISTS (SELECT 1 FROM app.parking_agreement_endings WHERE lease_id = p_lease_id) THEN
        RAISE EXCEPTION 'This agreement already has its last day'
            USING ERRCODE = '23505', HINT = 'ENDING_ALREADY_SET';
    END IF;
    IF v_lease.status <> 'SIGNED' OR NOT v_lease.on_parking_space OR NOT v_lease.month_to_month THEN
        RAISE EXCEPTION 'Only a signed month-to-month Parking agreement ends by notice'
            USING ERRCODE = '55000', HINT = 'LEASE_NOT_MONTH_TO_MONTH';
    END IF;
    SELECT unit.property_id, property.timezone_name INTO STRICT v_property, v_timezone
    FROM app.units AS unit JOIN app.properties AS property ON property.id = unit.property_id
    WHERE unit.id = v_lease.unit_id;
    v_today := timezone(v_timezone, statement_timestamp())::date;
    IF p_told_on > v_today OR p_told_on < v_lease.start_date THEN
        RAISE EXCEPTION 'The day told is from the Start Date to today'
            USING ERRCODE = '23514', HINT = 'TOLD_DATE';
    END IF;
    -- A month billed on an issued Invoice is never cut: the agreement runs to its end.
    SELECT max(line.period_end) INTO v_billed
    FROM app.invoices AS invoice JOIN app.invoice_lines AS line ON line.invoice_id = invoice.id
    WHERE invoice.lease_id = p_lease_id AND invoice.status NOT IN ('DRAFT', 'VOID');
    v_ends := greatest(app.parking_agreement_end_day(p_told_by, p_told_on), v_billed,
        v_lease.start_date + 1);
    IF EXISTS (SELECT 1 FROM app.invoices AS invoice
        JOIN app.invoice_lines AS line ON line.invoice_id = invoice.id
        WHERE invoice.lease_id = p_lease_id AND invoice.status = 'DRAFT'
          AND line.period_start > v_ends)
    THEN
        RAISE EXCEPTION 'A draft Invoice bills a day after the last day'
            USING ERRCODE = '55000', HINT = 'DRAFT_AFTER_END';
    END IF;
    PERFORM set_config('app.parking_agreement_ending', 'on', true);
    UPDATE app.leases SET end_date = v_ends, version = version + 1,
        updated_at = statement_timestamp(), updated_by = p_actor_id
    WHERE id = p_lease_id;
    PERFORM set_config('app.parking_agreement_ending', 'off', true);
    -- The space is free again after the last day.
    UPDATE app.parking_space_holds SET voided_at = statement_timestamp(), voided_by = p_actor_id,
        void_reason = 'The Parking agreement ends before this space was used',
        version = version + 1, updated_at = statement_timestamp(), updated_by = p_actor_id
    WHERE lease_id = p_lease_id AND voided_at IS NULL AND held_from > v_ends;
    UPDATE app.parking_space_holds SET held_until = v_ends,
        end_reason = 'The Parking agreement ends by notice', version = version + 1,
        updated_at = statement_timestamp(), updated_by = p_actor_id
    WHERE lease_id = p_lease_id AND voided_at IS NULL
      AND (held_until IS NULL OR held_until > v_ends);
    INSERT INTO app.parking_agreement_endings(id, property_id, lease_id, told_by, told_on, ends_on,
        previous_end_date, note, actor_id)
    VALUES (p_ending_id, v_property, p_lease_id, p_told_by, p_told_on, v_ends, v_lease.end_date,
        p_note, p_actor_id);
    INSERT INTO app.audit_events(id, occurred_at, business_date, actor_id, action, entity_type,
        entity_id, reason, authorization_reference, property_id, previous_state, resulting_state,
        correlation_id, source, outcome, authorization_evidence, customer_id)
    VALUES (gen_random_uuid(), statement_timestamp(), v_today, p_actor_id,
        'parking.agreement_ending', 'lease', p_lease_id,
        CASE p_told_by WHEN 'CUSTOMER' THEN 'The customer gave notice'
            ELSE 'The owner gave a 30-day letter' END,
        'leases.terminate', v_property, jsonb_build_object('end_date', v_lease.end_date),
        jsonb_build_object('end_date', v_ends, 'told_by', p_told_by, 'told_on', p_told_on,
            'note', p_note),
        gen_random_uuid(), 'API', 'SUCCEEDED', jsonb_build_object('capability', 'leases.terminate'),
        v_lease.primary_tenant_id);
    RETURN app.lease_parking(p_lease_id);
END $$;
REVOKE ALL ON FUNCTION app.end_parking_agreement(uuid, uuid, text, date, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.end_parking_agreement(uuid, uuid, text, date, text, uuid) TO prm_runtime;
COMMENT ON FUNCTION app.end_parking_agreement(uuid, uuid, text, date, text, uuid) IS
    'Parking (DL-258): a signed month-to-month Parking agreement ends by notice on its new End Date';
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
    op.execute(SQL)
    _patch(PROTECT, PROTECT_PATCH)
    _patch(LEASE_PARKING, LEASE_PARKING_PATCH)


def downgrade() -> None:
    raise RuntimeError("Parking agreement ending migration 20270821_446 is forward-only")
