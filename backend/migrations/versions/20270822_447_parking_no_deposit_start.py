# ruff: noqa: E501
"""Parking step 5d: a customer from before the app starts with no deposit (DL-259).

Owner answer (parking plan Q5 and Q17, agreed 20 Nov 2026): new parking customers pay a deposit
of one month; customers who parked before the app paid none. A Manager or the Owner may start
such a customer's Parking agreement with no deposit, with the reason "Customer from before the
app".

1. `app.lease_no_deposit_starts` (append-only; one per Lease): the drafted Parking agreement that
   is signed with no Security Deposit, the reason, who decided it and when.
2. `app.start_lease_without_deposit(start, lease, actor)`: records it on a drafted Parking
   agreement (not one from a Booking). Audited as `lease.no_deposit_start`. A retry with the same
   id answers again.
3. `app.lease_no_deposit_start(lease)`: the record, or NULL.
4. `app.sign_lease_with_payment`: such a draft is signed with no Security Deposit; the customer
   pays only the Initial Rent Invoice. The draft's typed amount is not used, and the final check
   that a new Lease holds exactly one Security Deposit leaves it out.

Technical shape by Claude under the owner's 2026-10-23 22:30 rule. Additive, forward-only.
"""

from collections.abc import Sequence

from alembic import op
from sqlalchemy import text

revision: str = "20270822_447"
down_revision: str | None = "20270821_446"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SIGN = "app.sign_lease_with_payment(uuid,uuid,uuid,text,uuid,integer,uuid[],text,jsonb,boolean)"
REASON = "Customer from before the app"

SIGN_PATCH = (
    (
        """            ELSE
                IF v_planned IS NULL THEN
""",
        """            ELSIF EXISTS (SELECT 1 FROM app.lease_no_deposit_starts AS no_deposit
                WHERE no_deposit.lease_id = p_lease_id) THEN
                -- DL-259 (Q17): a parking customer from before the app starts with no deposit.
                v_deposit := 0;
            ELSE
                IF v_planned IS NULL THEN
""",
    ),
    (
        """            IF v_lease.predecessor_lease_id IS NULL AND (
                SELECT count(*) <> 1 OR coalesce(bool_or(""",
        """            IF v_lease.predecessor_lease_id IS NULL AND NOT EXISTS (
                SELECT 1 FROM app.lease_no_deposit_starts AS no_deposit
                WHERE no_deposit.lease_id = p_lease_id) AND (
                SELECT count(*) <> 1 OR coalesce(bool_or(""",
    ),
)

SQL = rf"""
CREATE TABLE app.lease_no_deposit_starts (
    id uuid PRIMARY KEY CHECK (id <> '00000000-0000-0000-0000-000000000000'::uuid),
    property_id uuid NOT NULL REFERENCES app.properties(id) ON DELETE RESTRICT,
    lease_id uuid NOT NULL UNIQUE REFERENCES app.leases(id) ON DELETE RESTRICT,
    reason text NOT NULL CHECK (reason = '{REASON}'),
    actor_id uuid NOT NULL REFERENCES app.user_accounts(actor_id) ON DELETE RESTRICT,
    recorded_at timestamptz NOT NULL DEFAULT statement_timestamp() CHECK (isfinite(recorded_at))
);
COMMENT ON TABLE app.lease_no_deposit_starts IS
    'Parking (DL-259): a Parking agreement of a customer from before the app, signed with no Security Deposit; append-only';
CREATE TRIGGER lease_no_deposit_starts_append_only BEFORE UPDATE OR DELETE ON app.lease_no_deposit_starts
    FOR EACH ROW EXECUTE FUNCTION app.reject_parking_append_only();
CREATE TRIGGER lease_no_deposit_starts_reject_truncate BEFORE TRUNCATE ON app.lease_no_deposit_starts
    FOR EACH STATEMENT EXECUTE FUNCTION app.reject_parking_append_only();
REVOKE ALL ON TABLE app.lease_no_deposit_starts FROM PUBLIC, prm_runtime, prm_bootstrap;
GRANT SELECT ON TABLE app.lease_no_deposit_starts TO prm_runtime;

CREATE FUNCTION app.lease_no_deposit_start(p_lease_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
    SELECT jsonb_build_object('reason', start.reason, 'actor_id', start.actor_id,
        'recorded_at', start.recorded_at)
    FROM app.lease_no_deposit_starts AS start WHERE start.lease_id = p_lease_id
$$;
REVOKE ALL ON FUNCTION app.lease_no_deposit_start(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.lease_no_deposit_start(uuid) TO prm_runtime;

CREATE FUNCTION app.start_lease_without_deposit(p_start_id uuid, p_lease_id uuid, p_actor_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
    v_start app.lease_no_deposit_starts%ROWTYPE;
    v_lease app.leases%ROWTYPE;
    v_property uuid;
    v_timezone text;
BEGIN
    IF p_start_id IS NULL OR p_lease_id IS NULL OR p_actor_id IS NULL THEN
        RAISE EXCEPTION 'No-deposit start evidence is invalid' USING ERRCODE = '22023';
    END IF;
    SELECT * INTO v_start FROM app.lease_no_deposit_starts WHERE id = p_start_id;
    IF FOUND THEN
        IF v_start.lease_id <> p_lease_id THEN
            RAISE EXCEPTION 'No-deposit start identity was reused' USING ERRCODE = '23505';
        END IF;
        RETURN app.lease_no_deposit_start(p_lease_id);
    END IF;
    SELECT * INTO v_lease FROM app.leases WHERE id = p_lease_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Lease was not found' USING ERRCODE = 'P0002'; END IF;
    IF EXISTS (SELECT 1 FROM app.lease_no_deposit_starts WHERE lease_id = p_lease_id) THEN
        RAISE EXCEPTION 'This agreement already starts with no deposit'
            USING ERRCODE = '23505', HINT = 'NO_DEPOSIT_ALREADY_SET';
    END IF;
    IF v_lease.status <> 'DRAFTED' OR NOT v_lease.on_parking_space THEN
        RAISE EXCEPTION 'Only a drafted Parking agreement starts with no deposit'
            USING ERRCODE = '55000', HINT = 'NOT_A_PARKING_DRAFT';
    END IF;
    -- A draft from a Booking (or a renewal) already carries a Security Deposit.
    IF v_lease.predecessor_lease_id IS NOT NULL
        OR app.lease_held_security_deposit_id(p_lease_id) IS NOT NULL
        OR EXISTS (SELECT 1 FROM app.reservations AS reservation
            WHERE reservation.unit_id = v_lease.unit_id
              AND reservation.customer_id = v_lease.primary_tenant_id
              AND reservation.status = 'ACTIVE')
    THEN
        RAISE EXCEPTION 'This draft already carries a Security Deposit'
            USING ERRCODE = '55000', HINT = 'DEPOSIT_ALREADY_HELD';
    END IF;
    SELECT unit.property_id, property.timezone_name INTO STRICT v_property, v_timezone
    FROM app.units AS unit JOIN app.properties AS property ON property.id = unit.property_id
    WHERE unit.id = v_lease.unit_id;
    INSERT INTO app.lease_no_deposit_starts(id, property_id, lease_id, reason, actor_id)
    VALUES (p_start_id, v_property, p_lease_id, '{REASON}', p_actor_id);
    INSERT INTO app.audit_events(id, occurred_at, business_date, actor_id, action, entity_type,
        entity_id, reason, authorization_reference, property_id, previous_state, resulting_state,
        correlation_id, source, outcome, authorization_evidence, customer_id)
    VALUES (gen_random_uuid(), statement_timestamp(),
        timezone(v_timezone, statement_timestamp())::date, p_actor_id, 'lease.no_deposit_start',
        'lease', p_lease_id, '{REASON}', 'deposits.manage', v_property,
        jsonb_build_object('planned_security_deposit_usd_cents',
            app.lease_planned_security_deposit(p_lease_id)),
        jsonb_build_object('security_deposit', 'NONE', 'reason', '{REASON}'),
        gen_random_uuid(), 'API', 'SUCCEEDED', jsonb_build_object('capability', 'deposits.manage'),
        v_lease.primary_tenant_id);
    RETURN app.lease_no_deposit_start(p_lease_id);
END $$;
REVOKE ALL ON FUNCTION app.start_lease_without_deposit(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.start_lease_without_deposit(uuid, uuid, uuid) TO prm_runtime;
COMMENT ON FUNCTION app.start_lease_without_deposit(uuid, uuid, uuid) IS
    'Parking (DL-259, Q17): a drafted Parking agreement of a customer from before the app is signed with no Security Deposit';
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
    # CREATE OR REPLACE keeps the function identity, owner and privileges. The body holds "%"
    # (LIKE patterns), so it goes to the driver with no parameters to format.
    driver = op.get_bind().connection.driver_connection
    assert driver is not None
    driver.execute(definition)


def upgrade() -> None:
    op.execute(SQL)
    _patch(SIGN, SIGN_PATCH)


def downgrade() -> None:
    raise RuntimeError("Parking no-deposit start migration 20270822_447 is forward-only")
