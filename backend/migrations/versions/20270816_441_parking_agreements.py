# ruff: noqa: E501
"""Parking step 4a: a Parking agreement holds its space with a vehicle (DL-254).

A Parking agreement (Way B, DL-253) is a Lease on the parking space itself, numbered like
P01L0001. It moves in a vehicle (a space hold), not people.

1. `leases.on_parking_space`: the Lease is on a parking space. The database sets it from the
   Unit; nobody writes it.
2. `leases_signed_period_exclusive` leaves out Leases on a parking space: the space holds count
   the vehicles there instead, so the shared Motorbike area takes as many agreements as it has
   places, and a numbered space still takes one at a time.
3. `app.unit_lease_held` answers false for a parking space for the same reason.
4. An Occupancy (people living in a Unit) is refused on a parking space.
5. `app.hold_parking_agreement_space(hold, lease, vehicle, actor)`: a drafted Parking agreement
   picks the vehicle that parks there, for the agreement's dates. Picking again replaces the
   draft's earlier pick. Audited as `parking.space_held`.
6. `app.sign_lease` refuses a Parking agreement until a vehicle is picked for its dates.

Technical shape by Claude under the owner's 2026-10-23 22:30 rule. Additive, forward-only.
"""

from collections.abc import Sequence

from alembic import op
from sqlalchemy import text

revision: str = "20270816_441"
down_revision: str | None = "20270815_440"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

COLUMNS = r"""
ALTER TABLE app.leases ADD COLUMN on_parking_space boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN app.leases.on_parking_space IS
    'Parking (DL-254): the Lease is a Parking agreement on a parking space; set from the Unit';

CREATE FUNCTION app.set_lease_on_parking_space() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
    NEW.on_parking_space := COALESCE(
        (SELECT unit.unit_kind = 'PARKING' FROM app.units AS unit WHERE unit.id = NEW.unit_id),
        false);
    RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION app.set_lease_on_parking_space() FROM PUBLIC;
-- Named to run before the other row triggers of leases, which then see the right value.
CREATE TRIGGER a_leases_on_parking_space BEFORE INSERT OR UPDATE ON app.leases
    FOR EACH ROW EXECUTE FUNCTION app.set_lease_on_parking_space();

ALTER TABLE app.leases DISABLE TRIGGER USER;
UPDATE app.leases AS lease SET on_parking_space = true
FROM app.units AS unit WHERE unit.id = lease.unit_id AND unit.unit_kind = 'PARKING';
ALTER TABLE app.leases ENABLE TRIGGER USER;

ALTER TABLE app.leases DROP CONSTRAINT leases_signed_period_exclusive;
ALTER TABLE app.leases ADD CONSTRAINT leases_signed_period_exclusive
    EXCLUDE USING gist (
        unit_id WITH =,
        daterange(
            start_date,
            CASE WHEN status = 'TERMINATED' THEN actual_termination_date ELSE end_date END,
            '[]'
        ) WITH &&
    ) WHERE (status IN ('SIGNED', 'TERMINATED') AND NOT on_parking_space)
    DEFERRABLE INITIALLY IMMEDIATE;

CREATE TRIGGER occupancies_not_parking BEFORE INSERT OR UPDATE OF lease_id ON app.occupancies
    FOR EACH ROW EXECUTE FUNCTION app.refuse_parking_space(
        'lease', 'A parking space has no Occupancy: its Parking agreement holds a vehicle');
"""

FUNCTIONS = r"""
CREATE OR REPLACE FUNCTION app.unit_lease_held(p_unit uuid, p_except_lease uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
    -- DL-254: a parking space is held by its vehicles (app.parking_space_holds), not here.
    SELECT NOT app.unit_is_parking(p_unit) AND (EXISTS (
            SELECT 1 FROM app.leases AS lease
            WHERE lease.unit_id = p_unit AND lease.status = 'SIGNED'
              AND lease.id IS DISTINCT FROM p_except_lease)
        OR EXISTS (
            SELECT 1 FROM app.occupancies AS occupancy
            JOIN app.leases AS lease ON lease.id = occupancy.lease_id
            WHERE lease.unit_id = p_unit AND occupancy.move_out_date IS NULL
              AND lease.id IS DISTINCT FROM p_except_lease))
$function$;

CREATE FUNCTION app.hold_parking_agreement_space(p_hold_id uuid, p_lease_id uuid,
    p_vehicle_id uuid, p_actor_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
    v_lease app.leases%ROWTYPE;
    v_hold app.parking_space_holds%ROWTYPE;
    v_before jsonb;
    v_timezone text;
BEGIN
    IF p_hold_id IS NULL OR p_lease_id IS NULL OR p_vehicle_id IS NULL OR p_actor_id IS NULL
    THEN RAISE EXCEPTION 'Space hold evidence is invalid' USING ERRCODE = '22023'; END IF;
    SELECT * INTO v_hold FROM app.parking_space_holds WHERE id = p_hold_id;
    IF FOUND THEN
        -- The same pick sent again (a retry) is answered again; another one is refused.
        IF v_hold.lease_id <> p_lease_id OR v_hold.vehicle_id IS DISTINCT FROM p_vehicle_id
            OR v_hold.hold_kind <> 'PARKING_AGREEMENT'
        THEN RAISE EXCEPTION 'Space hold identity was reused' USING ERRCODE = '23505'; END IF;
        RETURN app.parking_hold_json(v_hold);
    END IF;
    SELECT * INTO v_lease FROM app.leases WHERE id = p_lease_id FOR UPDATE;
    IF NOT FOUND OR NOT v_lease.on_parking_space THEN
        RAISE EXCEPTION 'Parking agreement was not found' USING ERRCODE = 'P0002';
    END IF;
    IF v_lease.status <> 'DRAFTED' THEN
        RAISE EXCEPTION 'Only a drafted Parking agreement picks its vehicle here'
            USING ERRCODE = '55000', HINT = 'LEASE_CLOSED';
    END IF;
    IF v_lease.start_date IS NULL OR v_lease.end_date IS NULL THEN
        RAISE EXCEPTION 'Add the start and end dates first'
            USING ERRCODE = '23514', HINT = 'AGREEMENT_DATES_MISSING';
    END IF;
    -- Picking again replaces the draft's earlier pick.
    SELECT app.parking_hold_json(hold) INTO v_before FROM app.parking_space_holds AS hold
    WHERE hold.lease_id = p_lease_id AND hold.voided_at IS NULL;
    UPDATE app.parking_space_holds SET voided_at = statement_timestamp(), voided_by = p_actor_id,
        void_reason = 'Picked again on the draft', version = version + 1,
        updated_at = statement_timestamp(), updated_by = p_actor_id
    WHERE lease_id = p_lease_id AND voided_at IS NULL;
    INSERT INTO app.parking_space_holds(id, property_id, space_unit_id, hold_kind, lease_id,
        vehicle_id, held_from, held_until, created_by, updated_by)
    SELECT p_hold_id, unit.property_id, unit.id, 'PARKING_AGREEMENT', p_lease_id, p_vehicle_id,
        v_lease.start_date, v_lease.end_date, p_actor_id, p_actor_id
    FROM app.units AS unit WHERE unit.id = v_lease.unit_id
    RETURNING * INTO v_hold;
    SELECT timezone_name INTO STRICT v_timezone FROM app.properties WHERE id = v_hold.property_id;
    INSERT INTO app.audit_events(id, occurred_at, business_date, actor_id, action, entity_type,
        entity_id, reason, authorization_reference, property_id, previous_state, resulting_state,
        correlation_id, source, outcome, authorization_evidence, customer_id)
    VALUES (gen_random_uuid(), statement_timestamp(),
        timezone(v_timezone, statement_timestamp())::date, p_actor_id, 'parking.space_held',
        'lease', p_lease_id, 'Vehicle picked for the Parking agreement', 'leases.draft',
        v_hold.property_id, v_before, app.parking_hold_json(v_hold), gen_random_uuid(), 'API',
        'SUCCEEDED', jsonb_build_object('capability', 'leases.draft'), v_lease.primary_tenant_id);
    RETURN app.parking_hold_json(v_hold);
END $$;
REVOKE ALL ON FUNCTION app.hold_parking_agreement_space(uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.hold_parking_agreement_space(uuid, uuid, uuid, uuid) TO prm_runtime;
COMMENT ON FUNCTION app.hold_parking_agreement_space(uuid, uuid, uuid, uuid) IS
    'Parking (DL-254): a drafted Parking agreement picks the vehicle that parks in its space';
"""

SIGN = "app.sign_lease(uuid,uuid,text,uuid,uuid,integer,timestamptz,text,uuid)"
SIGN_TERMS = """            THEN RAISE EXCEPTION 'Lease terms are incomplete' USING ERRCODE = '23514'; END IF;
"""
SIGN_PATCH = (
    (
        SIGN_TERMS,
        SIGN_TERMS
        + """            -- DL-254: a Parking agreement holds its space with a vehicle for its dates.
            IF v_lease.on_parking_space AND NOT EXISTS (
                SELECT 1 FROM app.parking_space_holds AS hold
                WHERE hold.lease_id = p_lease_id AND hold.voided_at IS NULL
                  AND hold.hold_kind = 'PARKING_AGREEMENT' AND hold.vehicle_id IS NOT NULL
                  AND hold.held_from = v_lease.start_date
                  AND hold.held_until IS NOT DISTINCT FROM v_lease.end_date
            ) THEN
                RAISE EXCEPTION 'Pick the vehicle for these dates before signing'
                    USING ERRCODE = '23514', HINT = 'AGREEMENT_VEHICLE_NOT_PICKED';
            END IF;
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
    op.execute(FUNCTIONS)
    _patch(SIGN, SIGN_PATCH)


def downgrade() -> None:
    raise RuntimeError("Parking agreement migration 20270816_441 is forward-only")
