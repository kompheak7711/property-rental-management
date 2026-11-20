# ruff: noqa: E501
"""Parking step 2: default price per Unit Type and Parking Type, and parking spaces (DL-253).

Owner answer Q4 of 20 Nov 2026: Settings keeps one default price per Parking Type, and each space
may have its own price, like a Unit; the owner wants the same for Unit Types. Claude's rule,
agreed by the owner: a Unit "uses the type price" unless it has its own price; when the type
price changes, the Units that use it move with it; an existing Lease never changes.

1. `unit_setup_items.default_monthly_rent_usd_cents`: the type price (Unit Types and Parking
   Types only; empty means no type price). Set by `app.set_type_price`, audited as a setup item
   change; the Units that use the type price take the new price, each with a new version and a
   `unit.rent_terms_changed` audit row. Clearing the price leaves those Units on their last price
   with their own price.
2. `units.rent_from_type`: the Unit uses its type price. `app.set_unit_rent_terms_with_type`
   sets the Unit's price, or (with the switch on) takes the type price; it replaces
   `app.set_unit_rent_terms` for the API.
3. `app.create_parking_space` and `app.update_parking_space`: a parking space with its number,
   building, Parking Type, area (kept in `units.floor`), places, Kept for short-stay guests and
   price (its own, or the type price), audited as `unit.created` and `unit.updated`.
4. `app.parking_spaces(property, day)`: the Parking list with who holds each space on that day.

Technical choices by Claude under the owner's 2026-10-23 22:30 rule. Additive, forward-only.
"""

from collections.abc import Sequence

from alembic import op

revision: str = "20270813_438"
down_revision: str | None = "20270812_437"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

TRIM = r"U&'\0009\000A\000B\000C\000D\001C\001D\001E\001F\0020\0085\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000'"

COLUMNS = r"""
ALTER TABLE app.unit_setup_items
    ADD COLUMN default_monthly_rent_usd_cents bigint
        CONSTRAINT unit_setup_items_type_price_positive CHECK (default_monthly_rent_usd_cents > 0),
    ADD CONSTRAINT unit_setup_items_type_price_only_on_types CHECK (
        default_monthly_rent_usd_cents IS NULL OR list_kind IN ('UNIT_TYPE', 'PARKING_TYPE'));
COMMENT ON COLUMN app.unit_setup_items.default_monthly_rent_usd_cents IS
    'Default monthly price of a Unit Type or Parking Type in US cents (DL-253)';

ALTER TABLE app.units ADD COLUMN rent_from_type boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN app.units.rent_from_type IS
    'The Unit uses the price of its Unit Type or Parking Type and moves with it (DL-253)';

CREATE OR REPLACE FUNCTION app.unit_setup_item_state(p_item app.unit_setup_items) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $$
    SELECT jsonb_build_object(
        'item_id', p_item.id,
        'list_kind', p_item.list_kind,
        'code', p_item.code,
        'name_en', p_item.name_en,
        'name_km', p_item.name_km,
        'sort_order', p_item.sort_order,
        'removed', p_item.removed_at IS NOT NULL,
        'version', p_item.version
    ) || CASE WHEN p_item.feature_type_item_id IS NULL THEN '{}'::jsonb
              ELSE jsonb_build_object('feature_type_item_id', p_item.feature_type_item_id)
         END
      || CASE WHEN p_item.list_kind NOT IN ('UNIT_TYPE', 'PARKING_TYPE') THEN '{}'::jsonb
              ELSE jsonb_build_object('default_monthly_rent_usd_cents',
                  p_item.default_monthly_rent_usd_cents)
         END
$$;
"""

FUNCTIONS = r"""
CREATE FUNCTION app.unit_type_item(p_unit app.units) RETURNS app.unit_setup_items
LANGUAGE sql STABLE SET search_path = pg_catalog AS $$
    SELECT item.* FROM app.unit_setup_items AS item
    WHERE item.property_id = p_unit.property_id
      AND item.list_kind = CASE p_unit.unit_kind WHEN 'PARKING' THEN 'PARKING_TYPE' ELSE 'UNIT_TYPE' END
      AND item.code = p_unit.unit_type
$$;
REVOKE ALL ON FUNCTION app.unit_type_item(app.units) FROM PUBLIC;

CREATE FUNCTION app.audit_unit_price(p_unit app.units, p_previous app.units, p_actor uuid,
    p_action text, p_reason text) RETURNS void
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE v_event uuid := gen_random_uuid();
BEGIN
    INSERT INTO app.audit_events(id, occurred_at, business_date, actor_id, action, entity_type,
        entity_id, reason, property_id, previous_state, resulting_state, correlation_id, source,
        outcome, unit_id)
    VALUES (v_event, statement_timestamp(), timezone('Asia/Phnom_Penh', statement_timestamp())::date,
        p_actor, p_action, 'unit', p_unit.id, p_reason, p_unit.property_id,
        CASE WHEN p_previous.id IS NULL THEN NULL ELSE app.unit_price_state(p_previous) END,
        app.unit_price_state(p_unit), v_event, 'API', 'SUCCEEDED', p_unit.id);
END $$;

CREATE FUNCTION app.unit_price_state(p_unit app.units) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = pg_catalog AS $$
    SELECT jsonb_build_object('unit_id', p_unit.id, 'unit_number', p_unit.unit_number,
        'unit_kind', p_unit.unit_kind, 'unit_type', p_unit.unit_type, 'floor', p_unit.floor,
        'building_id', p_unit.building_id, 'parking_capacity', p_unit.parking_capacity,
        'kept_for_short_stay_guests', p_unit.kept_for_short_stay_guests,
        'default_monthly_rent_usd_cents', p_unit.default_monthly_rent_usd_cents,
        'rent_from_type', p_unit.rent_from_type, 'version', p_unit.version)
$$;
REVOKE ALL ON FUNCTION app.unit_price_state(app.units) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.audit_unit_price(app.units, app.units, uuid, text, text) FROM PUBLIC;

-- The type price; the Units that use it move with it. NULL when the version is stale.
CREATE FUNCTION app.set_type_price(p_item_id uuid, p_expected_version integer,
    p_price_usd_cents bigint, p_actor_id uuid) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
    v_previous app.unit_setup_items%ROWTYPE;
    v_item app.unit_setup_items%ROWTYPE;
    v_unit app.units%ROWTYPE;
    v_before app.units%ROWTYPE;
BEGIN
    IF p_item_id IS NULL OR p_actor_id IS NULL OR p_expected_version IS NULL
        OR (p_price_usd_cents IS NOT NULL AND p_price_usd_cents <= 0)
    THEN RAISE EXCEPTION 'Type price is invalid' USING ERRCODE = '22023'; END IF;
    SELECT * INTO v_previous FROM app.unit_setup_items WHERE id = p_item_id FOR UPDATE;
    IF NOT FOUND OR v_previous.version <> p_expected_version THEN RETURN NULL; END IF;
    IF v_previous.list_kind NOT IN ('UNIT_TYPE', 'PARKING_TYPE') OR v_previous.removed_at IS NOT NULL
    THEN RAISE EXCEPTION 'Only a Unit Type or Parking Type in use has a price' USING ERRCODE = '22023'; END IF;
    IF v_previous.default_monthly_rent_usd_cents IS NOT DISTINCT FROM p_price_usd_cents THEN
        RETURN v_previous.version;
    END IF;
    UPDATE app.unit_setup_items SET default_monthly_rent_usd_cents = p_price_usd_cents,
        version = version + 1, updated_at = statement_timestamp(), updated_by = p_actor_id
    WHERE id = p_item_id RETURNING * INTO v_item;
    PERFORM app.audit_unit_setup_item('unit_setup_item.updated', p_actor_id, v_previous, v_item);
    FOR v_before IN
        SELECT unit.* FROM app.units AS unit
        WHERE unit.property_id = v_item.property_id AND unit.unit_type = v_item.code
          AND unit.rent_from_type
          AND unit.unit_kind = CASE v_item.list_kind WHEN 'PARKING_TYPE' THEN 'PARKING' ELSE 'HOME' END
        ORDER BY unit.unit_number FOR UPDATE
    LOOP
        UPDATE app.units SET
            default_monthly_rent_usd_cents = coalesce(p_price_usd_cents, v_before.default_monthly_rent_usd_cents),
            rent_from_type = p_price_usd_cents IS NOT NULL,
            version = version + 1, updated_at = statement_timestamp(), updated_by = p_actor_id
        WHERE id = v_before.id RETURNING * INTO v_unit;
        PERFORM app.audit_unit_price(v_unit, v_before, p_actor_id, 'unit.rent_terms_changed',
            CASE WHEN p_price_usd_cents IS NULL
                THEN 'The type price was cleared in Settings; the Unit keeps its last price'
                ELSE 'The type price changed in Settings' END);
    END LOOP;
    RETURN v_item.version;
END $$;

-- The Unit's Rent terms, with "Use the type price" (the body of `app.set_unit_rent_terms` of
-- migration 20270401_251 with the switch). NULL when the version is stale.
CREATE FUNCTION app.set_unit_rent_terms_with_type(p_unit_id uuid, p_expected_version integer,
    p_default_monthly_rent_usd_cents bigint, p_required_service_ids uuid[],
    p_rent_from_type boolean, p_actor_id uuid) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
    v_unit app.units%ROWTYPE;
    v_type app.unit_setup_items%ROWTYPE;
    v_price bigint := p_default_monthly_rent_usd_cents;
BEGIN
    IF p_rent_from_type IS NULL OR p_required_service_ids IS NULL
        OR array_position(p_required_service_ids, NULL) IS NOT NULL
        OR cardinality(p_required_service_ids) > 20
        OR cardinality(p_required_service_ids) <> (
            SELECT count(DISTINCT value) FROM unnest(p_required_service_ids) AS value)
        OR (p_default_monthly_rent_usd_cents IS NOT NULL AND p_default_monthly_rent_usd_cents <= 0)
    THEN
        RAISE EXCEPTION 'Unit Rent terms are invalid' USING ERRCODE = '22023';
    END IF;
    SELECT * INTO v_unit FROM app.units WHERE id = p_unit_id FOR UPDATE;
    IF NOT FOUND OR v_unit.version <> p_expected_version THEN RETURN NULL; END IF;
    IF p_rent_from_type THEN
        v_type := app.unit_type_item(v_unit);
        IF v_type.default_monthly_rent_usd_cents IS NULL THEN
            RAISE EXCEPTION 'The type has no price in Settings'
                USING ERRCODE = '22023', HINT = 'TYPE_HAS_NO_PRICE';
        END IF;
        v_price := v_type.default_monthly_rent_usd_cents;
    END IF;
    IF v_unit.unit_kind = 'PARKING' AND (v_price IS NULL OR cardinality(p_required_service_ids) > 0)
    THEN
        RAISE EXCEPTION 'A parking space has a price and no required Services'
            USING ERRCODE = '22023';
    END IF;
    IF EXISTS (
        SELECT 1 FROM unnest(p_required_service_ids) AS wanted(id)
        LEFT JOIN app.property_services AS service
          ON service.id = wanted.id AND service.property_id = v_unit.property_id
        WHERE service.id IS NULL
    ) THEN
        RAISE EXCEPTION 'Required Service was not found in Property scope' USING ERRCODE = '22023';
    END IF;
    UPDATE app.units SET default_monthly_rent_usd_cents = v_price, rent_from_type = p_rent_from_type,
        version = version + 1, updated_at = statement_timestamp(), updated_by = p_actor_id
    WHERE id = p_unit_id;
    DELETE FROM app.unit_required_services AS required
    WHERE required.unit_id = p_unit_id
      AND NOT required.property_service_id = ANY(p_required_service_ids);
    INSERT INTO app.unit_required_services(unit_id, property_service_id, added_by)
    SELECT p_unit_id, wanted.id, p_actor_id FROM unnest(p_required_service_ids) AS wanted(id)
    ON CONFLICT DO NOTHING;
    RETURN v_unit.version + 1;
END $$;
"""

SPACES = rf"""
CREATE FUNCTION app.parking_space_text_ok(p_text text, p_max integer) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $$
    SELECT p_text IS NOT NULL AND p_text = btrim(p_text, {TRIM}) AND length(p_text) BETWEEN 1 AND p_max
$$;
REVOKE ALL ON FUNCTION app.parking_space_text_ok(text, integer) FROM PUBLIC;

CREATE FUNCTION app.create_parking_space(p_id uuid, p_property_id uuid, p_building_id uuid,
    p_unit_number text, p_parking_type text, p_area text, p_capacity integer,
    p_kept_for_guests boolean, p_price_usd_cents bigint, p_actor_id uuid) RETURNS app.units
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
    v_unit app.units%ROWTYPE;
    v_type app.unit_setup_items%ROWTYPE;
BEGIN
    IF p_id IS NULL OR p_property_id IS NULL OR p_actor_id IS NULL
        OR NOT app.parking_space_text_ok(p_unit_number, 20) OR NOT app.parking_space_text_ok(p_area, 100)
        OR p_parking_type IS NULL OR p_capacity IS NULL OR p_capacity NOT BETWEEN 1 AND 500
        OR p_kept_for_guests IS NULL OR (p_price_usd_cents IS NOT NULL AND p_price_usd_cents <= 0)
    THEN RAISE EXCEPTION 'Parking space evidence is invalid' USING ERRCODE = '22023'; END IF;
    SELECT * INTO v_unit FROM app.units WHERE id = p_id;
    IF FOUND THEN
        -- A retry of the same space is answered again; another one under the id is refused.
        IF v_unit.unit_kind <> 'PARKING' OR v_unit.unit_number <> p_unit_number
            OR v_unit.unit_type <> p_parking_type
        THEN RAISE EXCEPTION 'Parking space identity was reused' USING ERRCODE = '23505'; END IF;
        RETURN v_unit;
    END IF;
    SELECT item.* INTO v_type FROM app.unit_setup_items AS item
    WHERE item.property_id = p_property_id AND item.list_kind = 'PARKING_TYPE'
      AND item.code = p_parking_type AND item.removed_at IS NULL;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Parking Type is not in the Parking Types list' USING ERRCODE = '22023';
    END IF;
    IF p_price_usd_cents IS NULL AND v_type.default_monthly_rent_usd_cents IS NULL THEN
        RAISE EXCEPTION 'The Parking Type has no price in Settings'
            USING ERRCODE = '22023', HINT = 'TYPE_HAS_NO_PRICE';
    END IF;
    INSERT INTO app.units(id, property_id, building_id, unit_number, floor, unit_type, status,
        unit_kind, parking_capacity, kept_for_short_stay_guests, default_monthly_rent_usd_cents,
        rent_from_type, created_by, updated_by)
    VALUES (p_id, p_property_id, p_building_id, p_unit_number, p_area, p_parking_type, 'VACANT',
        'PARKING', p_capacity, p_kept_for_guests,
        coalesce(p_price_usd_cents, v_type.default_monthly_rent_usd_cents),
        p_price_usd_cents IS NULL, p_actor_id, p_actor_id)
    RETURNING * INTO v_unit;
    PERFORM app.audit_unit_price(v_unit, NULL::app.units, p_actor_id, 'unit.created',
        'Parking space added');
    RETURN v_unit;
END $$;

-- NULL when the version is stale. The number and the building do not change here.
CREATE FUNCTION app.update_parking_space(p_id uuid, p_expected_version integer,
    p_parking_type text, p_area text, p_capacity integer, p_kept_for_guests boolean,
    p_actor_id uuid) RETURNS app.units
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
    v_before app.units%ROWTYPE;
    v_unit app.units%ROWTYPE;
    v_type app.unit_setup_items%ROWTYPE;
BEGIN
    IF p_id IS NULL OR p_expected_version IS NULL OR p_actor_id IS NULL
        OR p_parking_type IS NULL OR NOT app.parking_space_text_ok(p_area, 100)
        OR p_capacity IS NULL OR p_capacity NOT BETWEEN 1 AND 500 OR p_kept_for_guests IS NULL
    THEN RAISE EXCEPTION 'Parking space evidence is invalid' USING ERRCODE = '22023'; END IF;
    SELECT * INTO v_before FROM app.units WHERE id = p_id FOR UPDATE;
    IF NOT FOUND OR v_before.unit_kind <> 'PARKING' THEN
        RAISE EXCEPTION 'Parking space was not found' USING ERRCODE = 'P0002';
    END IF;
    IF v_before.version <> p_expected_version THEN RETURN NULL; END IF;
    IF v_before.unit_type = p_parking_type AND v_before.floor = p_area
        AND v_before.parking_capacity = p_capacity
        AND v_before.kept_for_short_stay_guests = p_kept_for_guests
    THEN RETURN v_before; END IF;
    UPDATE app.units SET unit_type = p_parking_type, floor = p_area, parking_capacity = p_capacity,
        kept_for_short_stay_guests = p_kept_for_guests, version = version + 1,
        updated_at = statement_timestamp(), updated_by = p_actor_id
    WHERE id = p_id RETURNING * INTO v_unit;
    -- A new Parking Type: a space that uses the type price takes the new type's price.
    IF v_unit.rent_from_type AND v_unit.unit_type <> v_before.unit_type THEN
        v_type := app.unit_type_item(v_unit);
        IF v_type.default_monthly_rent_usd_cents IS NULL THEN
            RAISE EXCEPTION 'The Parking Type has no price in Settings'
                USING ERRCODE = '22023', HINT = 'TYPE_HAS_NO_PRICE';
        END IF;
        UPDATE app.units SET default_monthly_rent_usd_cents = v_type.default_monthly_rent_usd_cents,
            version = version + 1, updated_at = statement_timestamp()
        WHERE id = p_id RETURNING * INTO v_unit;
    END IF;
    PERFORM app.audit_unit_price(v_unit, v_before, p_actor_id, 'unit.updated',
        'Parking space changed');
    RETURN v_unit;
END $$;

-- The Parking list: every space with who holds it on the day.
CREATE FUNCTION app.parking_spaces(p_property_id uuid, p_day date) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'unit_id', space.id, 'unit_number', space.unit_number, 'building_id', space.building_id,
        'parking_type', space.unit_type, 'area', space.floor,
        'parking_capacity', space.parking_capacity,
        'kept_for_short_stay_guests', space.kept_for_short_stay_guests,
        'default_monthly_rent_usd_cents', space.default_monthly_rent_usd_cents,
        'rent_from_type', space.rent_from_type, 'version', space.version,
        'holds', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'hold_id', hold.id, 'hold_kind', hold.hold_kind, 'lease_id', hold.lease_id,
                'lease_number', (SELECT number.lease_number FROM app.lease_numbers AS number
                    WHERE number.lease_id = hold.lease_id),
                'customer_name', (SELECT customer.legal_name FROM app.customers AS customer
                    WHERE customer.id = lease.primary_tenant_id),
                'room_unit_number', CASE WHEN hold.hold_kind = 'ROOM_LEASE' THEN room.unit_number END,
                'plate_text', vehicle.plate_text, 'vehicle_type', vehicle.vehicle_type,
                'held_from', hold.held_from, 'held_until', hold.held_until)
                ORDER BY hold.held_from, hold.id)
            FROM app.parking_space_holds AS hold
            JOIN app.leases AS lease ON lease.id = hold.lease_id
            JOIN app.units AS room ON room.id = lease.unit_id
            LEFT JOIN app.vehicles AS vehicle ON vehicle.id = hold.vehicle_id
            WHERE hold.space_unit_id = space.id AND hold.voided_at IS NULL
              AND hold.held_from <= p_day
              AND (hold.held_until IS NULL OR hold.held_until >= p_day)), '[]'::jsonb))
        ORDER BY space.unit_number, space.id), '[]'::jsonb)
    FROM app.units AS space
    WHERE space.property_id = p_property_id AND space.unit_kind = 'PARKING'
$$;
"""

GRANTS = r"""
REVOKE ALL ON FUNCTION
    app.set_type_price(uuid, integer, bigint, uuid),
    app.set_unit_rent_terms_with_type(uuid, integer, bigint, uuid[], boolean, uuid),
    app.create_parking_space(uuid, uuid, uuid, text, text, text, integer, boolean, bigint, uuid),
    app.update_parking_space(uuid, integer, text, text, integer, boolean, uuid),
    app.parking_spaces(uuid, date)
    FROM PUBLIC;
GRANT EXECUTE ON FUNCTION
    app.set_type_price(uuid, integer, bigint, uuid),
    app.set_unit_rent_terms_with_type(uuid, integer, bigint, uuid[], boolean, uuid),
    app.create_parking_space(uuid, uuid, uuid, text, text, text, integer, boolean, bigint, uuid),
    app.update_parking_space(uuid, integer, text, text, integer, boolean, uuid),
    app.parking_spaces(uuid, date)
    TO prm_runtime;
"""


def upgrade() -> None:
    op.execute(COLUMNS)
    op.execute(FUNCTIONS)
    op.execute(SPACES)
    op.execute(GRANTS)


def downgrade() -> None:
    raise RuntimeError("Type prices and parking spaces migration 20270813_438 is forward-only")
