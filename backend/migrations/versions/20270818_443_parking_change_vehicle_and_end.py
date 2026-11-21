# ruff: noqa: E501
"""Parking step 4c: Change vehicle, and a space hold ends with its Lease (DL-255).

1. When a Lease is terminated, its space holds end on the Lease's last day (a hold that would
   start after that day is voided); when a Lease draft is cancelled, its holds are voided. The
   space is then free again for the next vehicle. Both ways of parking (a room Lease Service and a
   Parking agreement) are covered.
2. `app.change_parking_vehicle(change, hold, vehicle, day, reason, actor)`: on a signed Lease
   staff change the vehicle that parks in a held space from a day, with a reason. The change is
   kept in `app.parking_vehicle_changes` (append-only) and audited as `parking.vehicle_changed`.

Technical shape by Claude under the owner's 2026-10-23 22:30 rule. Additive, forward-only.
"""

from collections.abc import Sequence

from alembic import op

revision: str = "20270818_443"
down_revision: str | None = "20270817_442"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SQL = r"""
CREATE FUNCTION app.end_lease_parking_holds() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
    IF NEW.status = 'TERMINATED' AND NEW.actual_termination_date IS NOT NULL THEN
        -- A hold that would only start after the last day never parks a vehicle.
        UPDATE app.parking_space_holds SET voided_at = statement_timestamp(),
            voided_by = NEW.updated_by, void_reason = 'The Lease ended before this space was used',
            version = version + 1, updated_at = statement_timestamp(), updated_by = NEW.updated_by
        WHERE lease_id = NEW.id AND voided_at IS NULL AND held_from > NEW.actual_termination_date;
        UPDATE app.parking_space_holds SET held_until = NEW.actual_termination_date,
            end_reason = 'The Lease ended', version = version + 1,
            updated_at = statement_timestamp(), updated_by = NEW.updated_by
        WHERE lease_id = NEW.id AND voided_at IS NULL
          AND (held_until IS NULL OR held_until > NEW.actual_termination_date);
    ELSIF NEW.status = 'CANCELLED' THEN
        UPDATE app.parking_space_holds SET voided_at = statement_timestamp(),
            voided_by = NEW.updated_by, void_reason = 'The Lease draft was cancelled',
            version = version + 1, updated_at = statement_timestamp(), updated_by = NEW.updated_by
        WHERE lease_id = NEW.id AND voided_at IS NULL;
    END IF;
    RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION app.end_lease_parking_holds() FROM PUBLIC;
CREATE TRIGGER leases_end_parking_holds AFTER UPDATE OF status ON app.leases
    FOR EACH ROW WHEN (NEW.status IN ('TERMINATED', 'CANCELLED') AND OLD.status IS DISTINCT FROM NEW.status)
    EXECUTE FUNCTION app.end_lease_parking_holds();
COMMENT ON FUNCTION app.end_lease_parking_holds() IS
    'Parking (DL-255): a terminated Lease ends its space holds on its last day; a cancelled draft voids them';

-- Ends left open by Leases terminated or cancelled before this migration.
UPDATE app.parking_space_holds AS hold SET voided_at = statement_timestamp(),
    voided_by = lease.updated_by, void_reason = 'The Lease draft was cancelled',
    version = hold.version + 1, updated_at = statement_timestamp(), updated_by = lease.updated_by
FROM app.leases AS lease
WHERE lease.id = hold.lease_id AND hold.voided_at IS NULL AND lease.status = 'CANCELLED';
UPDATE app.parking_space_holds AS hold SET voided_at = statement_timestamp(),
    voided_by = lease.updated_by, void_reason = 'The Lease ended before this space was used',
    version = hold.version + 1, updated_at = statement_timestamp(), updated_by = lease.updated_by
FROM app.leases AS lease
WHERE lease.id = hold.lease_id AND hold.voided_at IS NULL AND lease.status = 'TERMINATED'
  AND hold.held_from > lease.actual_termination_date;
UPDATE app.parking_space_holds AS hold SET held_until = lease.actual_termination_date,
    end_reason = 'The Lease ended', version = hold.version + 1,
    updated_at = statement_timestamp(), updated_by = lease.updated_by
FROM app.leases AS lease
WHERE lease.id = hold.lease_id AND hold.voided_at IS NULL AND lease.status = 'TERMINATED'
  AND (hold.held_until IS NULL OR hold.held_until > lease.actual_termination_date);

CREATE FUNCTION app.change_parking_vehicle(p_change_id uuid, p_hold_id uuid, p_vehicle_id uuid,
    p_change_date date, p_reason text, p_actor_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
    v_hold app.parking_space_holds%ROWTYPE;
    v_before jsonb;
    v_change app.parking_vehicle_changes%ROWTYPE;
    v_lease app.leases%ROWTYPE;
    v_timezone text;
BEGIN
    IF p_change_id IS NULL OR p_hold_id IS NULL OR p_vehicle_id IS NULL OR p_change_date IS NULL
        OR p_actor_id IS NULL OR NOT isfinite(p_change_date)
    THEN RAISE EXCEPTION 'Vehicle change evidence is invalid' USING ERRCODE = '22023'; END IF;
    IF p_reason IS NULL OR NOT app.vehicle_text_ok(p_reason, 500) THEN
        RAISE EXCEPTION 'Give a short reason for the change'
            USING ERRCODE = '23514', HINT = 'CHANGE_REASON';
    END IF;
    SELECT * INTO v_change FROM app.parking_vehicle_changes WHERE id = p_change_id;
    IF FOUND THEN
        -- The same change sent again (a retry) is answered again; another one is refused.
        IF v_change.hold_id <> p_hold_id OR v_change.new_vehicle_id <> p_vehicle_id
            OR v_change.change_date <> p_change_date
        THEN RAISE EXCEPTION 'Vehicle change identity was reused' USING ERRCODE = '23505'; END IF;
        SELECT * INTO STRICT v_hold FROM app.parking_space_holds WHERE id = p_hold_id;
        RETURN app.parking_hold_json(v_hold);
    END IF;
    SELECT * INTO v_hold FROM app.parking_space_holds WHERE id = p_hold_id FOR UPDATE;
    IF NOT FOUND OR v_hold.voided_at IS NOT NULL THEN
        RAISE EXCEPTION 'Space hold was not found' USING ERRCODE = 'P0002';
    END IF;
    SELECT * INTO STRICT v_lease FROM app.leases WHERE id = v_hold.lease_id;
    IF v_lease.status <> 'SIGNED' THEN
        RAISE EXCEPTION 'Only a signed Lease changes its vehicle here'
            USING ERRCODE = '55000', HINT = 'LEASE_CLOSED';
    END IF;
    IF p_change_date < v_hold.held_from
        OR (v_hold.held_until IS NOT NULL AND p_change_date > v_hold.held_until)
    THEN
        RAISE EXCEPTION 'The change day is outside the days this space is held'
            USING ERRCODE = '23514', HINT = 'CHANGE_DATE';
    END IF;
    IF v_hold.vehicle_id IS NOT DISTINCT FROM p_vehicle_id THEN
        RAISE EXCEPTION 'This vehicle already parks here' USING ERRCODE = '23514', HINT = 'VEHICLE_SAME';
    END IF;
    v_before := app.parking_hold_json(v_hold);
    PERFORM set_config('app.parking_vehicle_change', 'on', true);
    UPDATE app.parking_space_holds SET vehicle_id = p_vehicle_id, version = version + 1,
        updated_at = statement_timestamp(), updated_by = p_actor_id
    WHERE id = p_hold_id RETURNING * INTO v_hold;
    PERFORM set_config('app.parking_vehicle_change', 'off', true);
    INSERT INTO app.parking_vehicle_changes(id, property_id, hold_id, old_vehicle_id,
        new_vehicle_id, change_date, reason, actor_id)
    VALUES (p_change_id, v_hold.property_id, p_hold_id, (v_before->>'vehicle_id')::uuid,
        p_vehicle_id, p_change_date, p_reason, p_actor_id);
    SELECT timezone_name INTO STRICT v_timezone FROM app.properties WHERE id = v_hold.property_id;
    INSERT INTO app.audit_events(id, occurred_at, business_date, actor_id, action, entity_type,
        entity_id, reason, authorization_reference, property_id, previous_state, resulting_state,
        correlation_id, source, outcome, authorization_evidence, customer_id)
    VALUES (gen_random_uuid(), statement_timestamp(),
        timezone(v_timezone, statement_timestamp())::date, p_actor_id, 'parking.vehicle_changed',
        'lease', v_hold.lease_id, p_reason, 'leases.draft', v_hold.property_id, v_before,
        app.parking_hold_json(v_hold) || jsonb_build_object('change_date', p_change_date),
        gen_random_uuid(), 'API', 'SUCCEEDED', jsonb_build_object('capability', 'leases.draft'),
        v_lease.primary_tenant_id);
    RETURN app.parking_hold_json(v_hold);
END $$;
REVOKE ALL ON FUNCTION app.change_parking_vehicle(uuid, uuid, uuid, date, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.change_parking_vehicle(uuid, uuid, uuid, date, text, uuid) TO prm_runtime;
COMMENT ON FUNCTION app.change_parking_vehicle(uuid, uuid, uuid, date, text, uuid) IS
    'Parking (DL-255): on a signed Lease, the vehicle of a held space changes from a day, with a reason';
"""


def upgrade() -> None:
    op.execute(SQL)


def downgrade() -> None:
    raise RuntimeError("Parking change vehicle migration 20270818_443 is forward-only")
