# ruff: noqa: E501
"""Parking step 3b: a parking space on a room Lease, billed at the space's price (DL-253).

Owner decision of 20 Nov 2026 (decision card, option "The space's price"): a room tenant who has
parking on the Lease pays the price of the space picked (its Parking Type price or its own price)
on the same Rent Invoice. The price is copied when the space is picked and never changes after.
Owner decision of 20 Nov 2026 (decision card, option "Pick a space before signing"): a room Lease
with parking cannot be signed until each parking Service on it has a space picked.

1. `parking_space_holds.monthly_price_usd_cents`: the price a month copied from the space when a
   room Lease picks it (Way A; required there). It never changes.
2. `app.room_parking_price(term, cutoff)`: the price of the space a Lease Service term holds, as
   recorded at the cutoff (null: no space picked).
3. `app.hold_room_parking_space(...)`: pick a space (and a vehicle of someone on the Lease) for a
   parking Service term of a drafted or signed room Lease. Audited as `parking.space_held`.
4. `app.lease_parking(lease)`: the Lease's parking Service terms with the space each holds, the
   free spaces that fit, and the vehicles of the people on the Lease.
5. The Rent Invoice generator, the issue checks and the signing preview bill a term that holds a
   space at the space's price (no Service rate on that line).
6. `app.sign_lease` refuses a room Lease whose parking Service has no space picked.

Technical shape by Claude under the owner's 2026-10-23 22:30 rule. Additive, forward-only. The
generator, issue checks and preview are patched in place, as migration 237 did.
"""

from collections.abc import Sequence

from alembic import op
from sqlalchemy import text

revision: str = "20270815_440"
down_revision: str | None = "20270814_439"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

COLUMNS = r"""
ALTER TABLE app.parking_space_holds
    ADD COLUMN monthly_price_usd_cents bigint
        CONSTRAINT parking_space_holds_price_positive CHECK (monthly_price_usd_cents > 0);
-- Holds of a room Lease made before this step take the space's price of today.
ALTER TABLE app.parking_space_holds DISABLE TRIGGER parking_space_holds_check;
UPDATE app.parking_space_holds AS hold
SET monthly_price_usd_cents = space.default_monthly_rent_usd_cents
FROM app.units AS space
WHERE space.id = hold.space_unit_id AND hold.hold_kind = 'ROOM_LEASE'
  AND hold.monthly_price_usd_cents IS NULL AND space.default_monthly_rent_usd_cents > 0;
ALTER TABLE app.parking_space_holds ENABLE TRIGGER parking_space_holds_check;
ALTER TABLE app.parking_space_holds ADD CONSTRAINT parking_space_holds_room_price CHECK (
    hold_kind <> 'ROOM_LEASE' OR monthly_price_usd_cents IS NOT NULL) NOT VALID;

CREATE FUNCTION app.keep_parking_hold_price() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
    IF NEW.monthly_price_usd_cents IS DISTINCT FROM OLD.monthly_price_usd_cents THEN
        RAISE EXCEPTION 'The price of a space hold never changes' USING ERRCODE = '55000';
    END IF;
    RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION app.keep_parking_hold_price() FROM PUBLIC;
CREATE TRIGGER parking_space_holds_keep_price BEFORE UPDATE OF monthly_price_usd_cents
    ON app.parking_space_holds FOR EACH ROW EXECUTE FUNCTION app.keep_parking_hold_price();
"""

FUNCTIONS = r"""
CREATE FUNCTION app.room_parking_price(p_term_id uuid, p_cutoff timestamptz) RETURNS bigint
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
    SELECT hold.monthly_price_usd_cents FROM app.parking_space_holds AS hold
    WHERE hold.lease_service_term_id = p_term_id AND hold.hold_kind = 'ROOM_LEASE'
      AND hold.created_at <= p_cutoff
      AND (hold.voided_at IS NULL OR hold.voided_at > p_cutoff)
    ORDER BY hold.created_at DESC, hold.id DESC LIMIT 1
$$;
REVOKE ALL ON FUNCTION app.room_parking_price(uuid, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.room_parking_price(uuid, timestamptz) TO prm_runtime;
COMMENT ON FUNCTION app.room_parking_price(uuid, timestamptz) IS
    'Parking (DL-253): the price a month of the space a Lease Service term holds at the cutoff; null when no space is picked';

CREATE FUNCTION app.parking_hold_json(p_hold app.parking_space_holds) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = pg_catalog AS $$
    SELECT jsonb_build_object('hold_id', p_hold.id, 'hold_kind', p_hold.hold_kind,
        'lease_id', p_hold.lease_id, 'lease_service_term_id', p_hold.lease_service_term_id,
        'space_unit_id', p_hold.space_unit_id,
        'space_number', (SELECT unit_number FROM app.units WHERE id = p_hold.space_unit_id),
        'parking_type', (SELECT unit_type FROM app.units WHERE id = p_hold.space_unit_id),
        'vehicle_id', p_hold.vehicle_id,
        'plate_text', (SELECT plate_text FROM app.vehicles WHERE id = p_hold.vehicle_id),
        'vehicle_type', (SELECT vehicle_type FROM app.vehicles WHERE id = p_hold.vehicle_id),
        'held_from', p_hold.held_from, 'held_until', p_hold.held_until,
        'monthly_price_usd_cents', p_hold.monthly_price_usd_cents, 'version', p_hold.version)
$$;
REVOKE ALL ON FUNCTION app.parking_hold_json(app.parking_space_holds) FROM PUBLIC;

CREATE FUNCTION app.hold_room_parking_space(p_hold_id uuid, p_lease_id uuid, p_term_id uuid,
    p_space_unit_id uuid, p_vehicle_id uuid, p_actor_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
    v_lease app.leases%ROWTYPE;
    v_term app.lease_service_terms%ROWTYPE;
    v_space app.units%ROWTYPE;
    v_hold app.parking_space_holds%ROWTYPE;
    v_timezone text;
BEGIN
    IF p_hold_id IS NULL OR p_lease_id IS NULL OR p_term_id IS NULL OR p_space_unit_id IS NULL
        OR p_actor_id IS NULL
    THEN RAISE EXCEPTION 'Space hold evidence is invalid' USING ERRCODE = '22023'; END IF;
    SELECT * INTO v_hold FROM app.parking_space_holds WHERE id = p_hold_id;
    IF FOUND THEN
        -- The same pick sent again (a retry) is answered again; another one is refused.
        IF v_hold.lease_id <> p_lease_id OR v_hold.lease_service_term_id IS DISTINCT FROM p_term_id
            OR v_hold.space_unit_id <> p_space_unit_id
            OR v_hold.vehicle_id IS DISTINCT FROM p_vehicle_id
        THEN RAISE EXCEPTION 'Space hold identity was reused' USING ERRCODE = '23505'; END IF;
        RETURN app.parking_hold_json(v_hold);
    END IF;
    SELECT * INTO v_lease FROM app.leases WHERE id = p_lease_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Lease was not found' USING ERRCODE = 'P0002'; END IF;
    IF v_lease.status NOT IN ('DRAFTED', 'SIGNED') THEN
        RAISE EXCEPTION 'Only a drafted or signed Lease takes a parking space'
            USING ERRCODE = '55000', HINT = 'LEASE_CLOSED';
    END IF;
    SELECT * INTO v_term FROM app.lease_service_terms
    WHERE id = p_term_id AND lease_id = p_lease_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'The Service is not on this Lease' USING ERRCODE = 'P0002';
    END IF;
    IF EXISTS (SELECT 1 FROM app.parking_space_holds WHERE lease_service_term_id = p_term_id) THEN
        RAISE EXCEPTION 'This parking already has a space'
            USING ERRCODE = '23505', HINT = 'PARKING_ALREADY_HELD';
    END IF;
    SELECT * INTO v_space FROM app.units WHERE id = p_space_unit_id;
    IF NOT FOUND OR v_space.unit_kind <> 'PARKING' THEN
        RAISE EXCEPTION 'A space hold needs a parking space'
            USING ERRCODE = '23514', HINT = 'PARKING_NOT_SPACE';
    END IF;
    IF v_space.default_monthly_rent_usd_cents IS NULL OR v_space.default_monthly_rent_usd_cents <= 0 THEN
        RAISE EXCEPTION 'This space has no price'
            USING ERRCODE = '23514', HINT = 'TYPE_HAS_NO_PRICE';
    END IF;
    INSERT INTO app.parking_space_holds(id, property_id, space_unit_id, hold_kind, lease_id,
        lease_service_term_id, vehicle_id, held_from, held_until, monthly_price_usd_cents,
        created_by, updated_by)
    VALUES (p_hold_id, v_space.property_id, p_space_unit_id, 'ROOM_LEASE', p_lease_id, p_term_id,
        p_vehicle_id, greatest(v_term.applicable_from, v_lease.start_date),
        least(COALESCE(v_term.applicable_through, v_lease.end_date), v_lease.end_date),
        v_space.default_monthly_rent_usd_cents, p_actor_id, p_actor_id)
    RETURNING * INTO v_hold;
    SELECT timezone_name INTO STRICT v_timezone FROM app.properties WHERE id = v_space.property_id;
    INSERT INTO app.audit_events(id, occurred_at, business_date, actor_id, action, entity_type,
        entity_id, reason, authorization_reference, property_id, previous_state, resulting_state,
        correlation_id, source, outcome, authorization_evidence, customer_id)
    VALUES (gen_random_uuid(), statement_timestamp(),
        timezone(v_timezone, statement_timestamp())::date, p_actor_id, 'parking.space_held',
        'lease', p_lease_id, 'Parking space picked', 'leases.draft', v_space.property_id, NULL,
        app.parking_hold_json(v_hold), gen_random_uuid(), 'API', 'SUCCEEDED',
        jsonb_build_object('capability', 'leases.draft'), v_lease.primary_tenant_id);
    RETURN app.parking_hold_json(v_hold);
END $$;
REVOKE ALL ON FUNCTION app.hold_room_parking_space(uuid, uuid, uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.hold_room_parking_space(uuid, uuid, uuid, uuid, uuid, uuid) TO prm_runtime;

CREATE FUNCTION app.lease_parking(p_lease_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
    WITH lease AS (
        SELECT lease.*, unit.property_id, unit.unit_kind
        FROM app.leases AS lease JOIN app.units AS unit ON unit.id = lease.unit_id
        WHERE lease.id = p_lease_id
    ), terms AS (
        SELECT term.id, term.applicable_from, term.applicable_through, service.display_name,
            service.display_name_km,
            greatest(term.applicable_from, lease.start_date) AS day_from,
            least(COALESCE(term.applicable_through, lease.end_date), lease.end_date) AS day_until
        FROM lease
        JOIN app.lease_service_terms AS term ON term.lease_id = lease.id
        JOIN app.property_services AS service ON service.id = term.property_service_id
        JOIN app.service_types AS kind ON kind.id = service.service_type_id
        WHERE kind.needs_parking_space AND lease.unit_kind = 'HOME'
    )
    SELECT jsonb_build_object(
        'lease_id', p_lease_id,
        'lease_status', (SELECT status FROM lease),
        'terms', COALESCE((SELECT jsonb_agg(jsonb_build_object(
            'lease_service_term_id', terms.id, 'service_name', terms.display_name,
            'service_name_km', terms.display_name_km,
            'held_from', terms.day_from, 'held_until', terms.day_until,
            'hold', (SELECT app.parking_hold_json(hold) FROM app.parking_space_holds AS hold
                WHERE hold.lease_service_term_id = terms.id AND hold.voided_at IS NULL
                ORDER BY hold.created_at DESC LIMIT 1),
            'free_spaces', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                    'unit_id', space.id, 'unit_number', space.unit_number,
                    'parking_type', space.unit_type, 'area', space.floor,
                    'monthly_price_usd_cents', space.default_monthly_rent_usd_cents)
                    ORDER BY space.unit_number COLLATE "C", space.id)
                FROM app.units AS space
                WHERE space.property_id = (SELECT property_id FROM lease)
                  AND space.unit_kind = 'PARKING' AND NOT space.kept_for_short_stay_guests
                  AND space.default_monthly_rent_usd_cents > 0
                  AND app.parking_space_peak(space.id, terms.day_from, terms.day_until, NULL)
                      < space.parking_capacity), '[]'::jsonb))
            ORDER BY terms.applicable_from, terms.id) FROM terms), '[]'::jsonb),
        'vehicles', COALESCE((SELECT jsonb_agg(app.vehicle_json(vehicle)
                ORDER BY vehicle.created_at, vehicle.id)
            FROM app.vehicles AS vehicle
            WHERE vehicle.customer_id IN (
                SELECT signer.customer_id FROM app.lease_signers AS signer
                WHERE signer.lease_id = p_lease_id)), '[]'::jsonb))
    WHERE EXISTS (SELECT 1 FROM lease)
$$;
REVOKE ALL ON FUNCTION app.lease_parking(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.lease_parking(uuid) TO prm_runtime;
COMMENT ON FUNCTION app.lease_parking(uuid) IS
    'Parking (DL-253): the parking Service terms of a room Lease with their spaces, the free spaces that fit and the vehicles of the people on the Lease';
"""

GENERATOR = (
    "app.generate_rent_service_invoice(uuid,uuid,text,uuid,text,uuid,uuid,text,date,"
    "timestamp with time zone,uuid,uuid)"
)
GENERATOR_RATE = """                SELECT rate.id,rate.monthly_rate_usd_cents INTO v_other_rate_id,v_other_rate
                FROM app.service_rates AS rate
                WHERE rate.property_service_id=v_other.service_id
                  AND rate.effective_date<=v_other.month_start
                  AND rate.occurred_at<=v_source_selection_cutoff
                ORDER BY rate.effective_date DESC,rate.id DESC LIMIT 1;
                IF NOT FOUND THEN RAISE EXCEPTION 'Applicable Service rate is missing'
                    USING ERRCODE='55000'; END IF;
"""
GENERATOR_PATCH = (
    (
        GENERATOR_RATE,
        """                -- DL-253: parking with a space picked is billed at the space's price.
                v_other_rate_id:=NULL;
                v_other_rate:=app.room_parking_price(v_other_term_id,v_source_selection_cutoff);
                IF v_other_rate IS NULL THEN
"""
        + GENERATOR_RATE
        + "                END IF;\n",
    ),
)

ISSUE = "app.validate_invoice_issuance_lines()"
ISSUE_PATCH = (
    (
        """                            component.service_rate_id IS NULL
                            OR component.contractual_monthly_usd_cents IS NOT NULL
""",
        """                            (component.service_rate_id IS NULL
                                AND app.room_parking_price(v_line.lease_service_term_id,
                                    v_invoice.issued_at)
                                    IS DISTINCT FROM component.service_monthly_rate_usd_cents)
                            OR component.contractual_monthly_usd_cents IS NOT NULL
""",
    ),
    (
        """                            OR NOT EXISTS (
                                SELECT 1 FROM app.service_rates AS rate
                                WHERE rate.id=component.service_rate_id
""",
        """                            OR component.service_rate_id IS NOT NULL AND NOT EXISTS (
                                SELECT 1 FROM app.service_rates AS rate
                                WHERE rate.id=component.service_rate_id
""",
    ),
)

PREVIEW = "app.lease_signing_preview(uuid,uuid)"
PREVIEW_RATE = """                    SELECT rate.monthly_rate_usd_cents INTO v_rate FROM app.service_rates AS rate
                    WHERE rate.property_service_id = v_service.id
                      AND rate.effective_date <= v_month.month_start
                    ORDER BY rate.effective_date DESC, rate.id DESC LIMIT 1;
                    IF NOT FOUND THEN
                        v_problem := coalesce(v_problem, 'NO_RATE:' || v_service.display_name);
                        CONTINUE;
                    END IF;
"""
PREVIEW_PATCH = (
    (
        PREVIEW_RATE,
        """                    -- DL-253: parking with a space picked shows the space's price.
                    SELECT app.room_parking_price(term.id, statement_timestamp()) INTO v_rate
                    FROM app.lease_service_terms AS term
                    WHERE term.lease_id = p_lease_id AND term.property_service_id = v_service.id
                      AND app.room_parking_price(term.id, statement_timestamp()) IS NOT NULL
                    ORDER BY term.applicable_from DESC, term.id DESC LIMIT 1;
                    IF v_rate IS NULL THEN
"""
        + "\n".join(
            "    " + line if line else line for line in PREVIEW_RATE.rstrip("\n").split("\n")
        )
        + "\n                    END IF;\n",
    ),
)


SIGN = "app.sign_lease(uuid,uuid,text,uuid,uuid,integer,timestamptz,text,uuid)"
SIGN_TERMS = """            THEN RAISE EXCEPTION 'Lease terms are incomplete' USING ERRCODE = '23514'; END IF;
"""
SIGN_PATCH = (
    (
        SIGN_TERMS,
        SIGN_TERMS
        + """            -- DL-253 (owner 20 Nov 2026): parking on a room Lease needs its space first.
            IF EXISTS (
                SELECT 1 FROM app.lease_service_terms AS term
                JOIN app.property_services AS service ON service.id = term.property_service_id
                JOIN app.service_types AS kind ON kind.id = service.service_type_id
                JOIN app.units AS unit ON unit.id = v_lease.unit_id
                WHERE term.lease_id = p_lease_id AND kind.needs_parking_space
                  AND unit.unit_kind = 'HOME'
                  AND NOT EXISTS (SELECT 1 FROM app.parking_space_holds AS hold
                      WHERE hold.lease_service_term_id = term.id AND hold.voided_at IS NULL)
            ) THEN
                RAISE EXCEPTION 'Pick a parking space before signing'
                    USING ERRCODE = '23514', HINT = 'PARKING_SPACE_NOT_PICKED';
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
    _patch(GENERATOR, GENERATOR_PATCH)
    _patch(ISSUE, ISSUE_PATCH)
    _patch(PREVIEW, PREVIEW_PATCH)
    _patch(SIGN, SIGN_PATCH)


def downgrade() -> None:
    raise RuntimeError("Room Lease parking migration 20270815_440 is forward-only")
