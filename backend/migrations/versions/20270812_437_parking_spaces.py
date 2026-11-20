# ruff: noqa: E501
"""Parking step 1: parking spaces, vehicles and space holds in the database (DL-253).

Owner decision of 19 Nov 2026 (thread "Move parking into the rental app"): parking moves into
this app; the old parking app was never used. The owner agreed the plan on 20 Nov 2026.

1. A parking space is a Unit with `unit_kind = 'PARKING'` (every other Unit is `HOME`). It sits
   under a building like a room, and its Unit Type comes from the new Parking Types list
   (`unit_setup_items.list_kind = 'PARKING_TYPE'`): Covered, Uncovered, Motorbike and
   Tuk-Tuk/Food Cart, seeded for every Property. The kind never changes after the Unit is made.
   - `parking_capacity`: how many vehicles the space takes at once (1 for a numbered space; the
     shared Motorbike area takes 20). Only a parking space has it.
   - `kept_for_short_stay_guests`: the space is kept free for short-stay guests and is not
     rented (owner answer Q9).
2. A parking space never takes a short stay, a Reservation, a Joint Inspection, a meter, a
   cleaning rate, a cleaning task, a booking-site calendar, a pet or a short-stay Lease offer
   (refused with SQLSTATE 55000, HINT `PARKING_SPACE`). `app.unit_takes_short_stays` is false
   for it, so the short-stay Calendar leaves it out.
3. `app.vehicles` (ported from the old parking app): a vehicle under a Customer with its type
   (CAR, MOTORBIKE, TUK_TUK, FOOD_CART), plate as typed, colour, brand and sticker number. The
   plate match key ignores spaces, dashes, dots and case. Never deleted. Written only by
   `app.create_vehicle` and `app.update_vehicle`, with audit rows for the Customer's History.
4. `app.parking_space_holds`: one table for both ways of renting a space.
   - `ROOM_LEASE` (Way A): the parking Service on a room Lease, billed on the same Rent Invoice
     (DL-097); the hold names the Lease's Service term, whose Service Type needs a space.
   - `PARKING_AGREEMENT` (Way B): a Lease on the parking space itself (number like P01L0001).
   A space is never held by more vehicles on one day than its capacity (a numbered space: one).
   The vehicle must fit the Parking Type and belong to someone on the Lease. A hold is never
   deleted; a wrong one is voided with a reason.
5. `app.parking_vehicle_changes`: append-only list of vehicle changes on a hold. The vehicle of a
   hold changes only together with such a row (the Change vehicle step comes later).
6. `service_types.needs_parking_space`: a Service of this type needs a parking space (step 3).

Technical choices by Claude under the owner's 2026-10-23 22:30 rule (no money rule changes).
Additive, forward-only.
"""

from collections.abc import Sequence

from alembic import op

revision: str = "20270812_437"
down_revision: str | None = "20270811_434"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

UNITS = r"""
ALTER TABLE app.unit_setup_items
    DROP CONSTRAINT unit_setup_items_kind_supported,
    ADD CONSTRAINT unit_setup_items_kind_supported CHECK (
        list_kind IN (
            'FLOOR', 'UNIT_TYPE', 'VIEW', 'KITCHEN', 'ROOM_FEATURE',
            'FEATURE_TYPE', 'UNIT_FEATURE', 'ITEM_TYPE', 'PARKING_TYPE'
        )
    );

ALTER TABLE app.units
    ADD COLUMN unit_kind text NOT NULL DEFAULT 'HOME'
        CONSTRAINT units_unit_kind_supported CHECK (unit_kind IN ('HOME', 'PARKING')),
    ADD COLUMN parking_capacity integer
        CONSTRAINT units_parking_capacity_range CHECK (parking_capacity BETWEEN 1 AND 500),
    ADD COLUMN kept_for_short_stay_guests boolean NOT NULL DEFAULT false,
    ADD CONSTRAINT units_parking_capacity_only_on_parking
        CHECK ((unit_kind = 'PARKING') = (parking_capacity IS NOT NULL)),
    ADD CONSTRAINT units_kept_for_guests_only_on_parking
        CHECK (NOT kept_for_short_stay_guests OR unit_kind = 'PARKING');
CREATE INDEX units_parking_idx ON app.units(property_id, unit_number) WHERE unit_kind = 'PARKING';
COMMENT ON COLUMN app.units.unit_kind IS
    'HOME: a room or apartment. PARKING: a parking space (DL-253); never changes';
COMMENT ON COLUMN app.units.parking_capacity IS
    'Vehicles a parking space takes at once: 1 for a numbered space, more for a shared area';
COMMENT ON COLUMN app.units.kept_for_short_stay_guests IS
    'A parking space kept free for short-stay guests; it is not rented (owner answer Q9)';

ALTER TABLE app.service_types
    ADD COLUMN needs_parking_space boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN app.service_types.needs_parking_space IS
    'A Service of this type on a room Lease holds a parking space (DL-253)';
"""

SEED = r"""
CREATE FUNCTION app.seed_parking_types(p_property_id uuid, p_actor_id uuid) RETURNS void
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE
    v_item app.unit_setup_items%ROWTYPE;
BEGIN
    FOR v_item IN
    INSERT INTO app.unit_setup_items (
        id, property_id, list_kind, code, name_en, name_km, sort_order, created_by, updated_by
    )
    SELECT gen_random_uuid(), p_property_id, 'PARKING_TYPE', defaults.code,
           defaults.name_en, defaults.name_km, defaults.sort_order, p_actor_id, p_actor_id
    FROM (VALUES
        ('COVERED', 'Covered', 'ចំណតមានដំបូល', 10),
        ('UNCOVERED', 'Uncovered', 'ចំណតគ្មានដំបូល', 20),
        ('MOTORBIKE', 'Motorbike', 'ម៉ូតូ', 30),
        ('TUK_TUK_FOOD_CART', 'Tuk-Tuk/Food Cart', 'តុកតុក/រទេះលក់ម្ហូប', 40)
    ) AS defaults(code, name_en, name_km, sort_order)
    ON CONFLICT (property_id, list_kind, code) DO NOTHING
    RETURNING *
    LOOP
        PERFORM app.audit_unit_setup_item(
            'unit_setup_item.created', p_actor_id, NULL::app.unit_setup_items, v_item
        );
    END LOOP;
END $$;
REVOKE ALL ON FUNCTION app.seed_parking_types(uuid, uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION app.seed_unit_setup_items_for_property() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
    PERFORM app.seed_unit_setup_items(NEW.id, NEW.created_by);
    PERFORM app.seed_parking_types(NEW.id, NEW.created_by);
    RETURN NULL;
END $$;

SELECT app.seed_parking_types(property.id, property.created_by) FROM app.properties AS property;
"""

# A parking space's Unit Type is a Parking Type; a room's is a Unit Type. The body is the one of
# migration 20270308_227 with the list chosen by the Unit's kind, and the kind kept.
UNIT_REFERENCES = r"""
CREATE OR REPLACE FUNCTION app.check_unit_setup_references() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE
    v_item_id uuid;
    v_kind text := CASE NEW.unit_kind WHEN 'PARKING' THEN 'PARKING_TYPE' ELSE 'UNIT_TYPE' END;
BEGIN
    IF TG_OP = 'UPDATE' AND NEW.unit_number IS DISTINCT FROM OLD.unit_number THEN
        RAISE EXCEPTION 'The Unit number cannot change after the Unit is created'
            USING ERRCODE = '55000';
    END IF;
    IF TG_OP = 'UPDATE' AND NEW.unit_kind IS DISTINCT FROM OLD.unit_kind THEN
        RAISE EXCEPTION 'A Unit never changes between a room and a parking space'
            USING ERRCODE = '55000', HINT = 'PARKING_SPACE';
    END IF;
    -- The earlier update_unit writes Floor text only: a Floor that no longer matches the
    -- linked item's name drops the link, so the text and the link never disagree.
    IF TG_OP = 'UPDATE' AND NEW.floor_item_id IS NOT NULL
        AND NEW.floor_item_id IS NOT DISTINCT FROM OLD.floor_item_id
        AND NEW.floor IS DISTINCT FROM OLD.floor
        AND NEW.floor IS DISTINCT FROM (
            SELECT item.name_en FROM app.unit_setup_items AS item
            WHERE item.id = NEW.floor_item_id
        )
    THEN
        NEW.floor_item_id := NULL;
    END IF;
    IF TG_OP = 'INSERT' OR NEW.unit_type IS DISTINCT FROM OLD.unit_type THEN
        SELECT item.id INTO v_item_id FROM app.unit_setup_items AS item
        WHERE item.property_id = NEW.property_id AND item.list_kind = v_kind
          AND item.code = NEW.unit_type;
        IF v_item_id IS NULL THEN
            IF v_kind = 'PARKING_TYPE' THEN
                RAISE EXCEPTION 'Parking Type is not in the Parking Types list'
                    USING ERRCODE = '22023';
            END IF;
            RAISE EXCEPTION 'Unit Type is not in the Unit Types list'
                USING ERRCODE = '22023';
        END IF;
        PERFORM app.assert_unit_setup_item(NEW.property_id, v_kind, v_item_id);
    END IF;
    IF NEW.floor_item_id IS NOT NULL AND (
        TG_OP = 'INSERT' OR NEW.floor_item_id IS DISTINCT FROM OLD.floor_item_id
    ) THEN
        PERFORM app.assert_unit_setup_item(NEW.property_id, 'FLOOR', NEW.floor_item_id);
    END IF;
    IF NEW.view_item_id IS NOT NULL AND (
        TG_OP = 'INSERT' OR NEW.view_item_id IS DISTINCT FROM OLD.view_item_id
    ) THEN
        PERFORM app.assert_unit_setup_item(NEW.property_id, 'VIEW', NEW.view_item_id);
    END IF;
    IF NEW.kitchen_item_id IS NOT NULL AND (
        TG_OP = 'INSERT' OR NEW.kitchen_item_id IS DISTINCT FROM OLD.kitchen_item_id
    ) THEN
        PERFORM app.assert_unit_setup_item(NEW.property_id, 'KITCHEN', NEW.kitchen_item_id);
    END IF;
    RETURN NEW;
END $$;

-- A Unit Type in use counts rooms only; a Parking Type in use counts parking spaces only.
CREATE OR REPLACE FUNCTION app.unit_setup_item_in_use(p_item app.unit_setup_items) RETURNS boolean
LANGUAGE sql SET search_path = pg_catalog AS $$
    SELECT CASE p_item.list_kind
        WHEN 'UNIT_TYPE' THEN EXISTS (
            SELECT 1 FROM app.units AS unit
            WHERE unit.property_id = p_item.property_id AND unit.unit_type = p_item.code
              AND unit.unit_kind = 'HOME'
        )
        WHEN 'PARKING_TYPE' THEN EXISTS (
            SELECT 1 FROM app.units AS unit
            WHERE unit.property_id = p_item.property_id AND unit.unit_type = p_item.code
              AND unit.unit_kind = 'PARKING'
        )
        WHEN 'FLOOR' THEN EXISTS (
            SELECT 1 FROM app.units AS unit WHERE unit.floor_item_id = p_item.id
        )
        WHEN 'VIEW' THEN EXISTS (
            SELECT 1 FROM app.units AS unit WHERE unit.view_item_id = p_item.id
        )
        WHEN 'KITCHEN' THEN EXISTS (
            SELECT 1 FROM app.units AS unit WHERE unit.kitchen_item_id = p_item.id
        )
        WHEN 'ROOM_FEATURE' THEN EXISTS (
            SELECT 1 FROM app.unit_room_features AS feature
            WHERE feature.item_id = p_item.id
        )
        WHEN 'FEATURE_TYPE' THEN EXISTS (
            SELECT 1 FROM app.unit_setup_items AS feature
            WHERE feature.feature_type_item_id = p_item.id
              AND feature.removed_at IS NULL
        )
        WHEN 'UNIT_FEATURE' THEN EXISTS (
            SELECT 1 FROM app.unit_features AS feature WHERE feature.item_id = p_item.id
        )
        -- An Item type in a Unit's current inventory (its latest record).
        WHEN 'ITEM_TYPE' THEN EXISTS (
            SELECT 1 FROM app.unit_inventory_items AS line
            JOIN app.unit_inventory_records AS record ON record.id = line.record_id
            WHERE line.item_type_item_id = p_item.id
              AND record.record_number = (
                SELECT max(latest.record_number) FROM app.unit_inventory_records AS latest
                WHERE latest.unit_id = record.unit_id
              )
        )
        ELSE false
    END
$$;

-- A parking space never takes the cleaning rate of a Unit Type.
DROP TRIGGER units_take_type_cleaning_rate ON app.units;
CREATE TRIGGER units_take_type_cleaning_rate AFTER INSERT OR UPDATE OF unit_type ON app.units
    FOR EACH ROW WHEN (NEW.unit_kind = 'HOME')
    EXECUTE FUNCTION app.unit_takes_type_cleaning_rate();

-- A parking space never takes a short stay, so the short-stay Calendar leaves it out.
CREATE OR REPLACE FUNCTION app.unit_takes_short_stays(p_unit uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
    SELECT COALESCE((SELECT building.takes_short_stays AND unit.unit_kind = 'HOME'
        FROM app.units AS unit
        JOIN app.buildings AS building ON building.id = unit.building_id
        WHERE unit.id = p_unit), false)
$$;
"""

GUARDS = r"""
CREATE FUNCTION app.unit_is_parking(p_unit uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
    SELECT EXISTS (SELECT 1 FROM app.units WHERE id = p_unit AND unit_kind = 'PARKING')
$$;
REVOKE ALL ON FUNCTION app.unit_is_parking(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.unit_is_parking(uuid) TO prm_runtime;

-- TG_ARGV[0]: 'unit' (the row has unit_id) or 'lease' (the row has lease_id).
-- TG_ARGV[1]: the refusal shown to staff.
CREATE FUNCTION app.refuse_parking_space() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
    v_row jsonb := to_jsonb(NEW);
    v_unit uuid;
BEGIN
    IF TG_ARGV[0] = 'lease' THEN
        SELECT lease.unit_id INTO v_unit FROM app.leases AS lease
        WHERE lease.id = (v_row ->> 'lease_id')::uuid;
    ELSE
        v_unit := (v_row ->> 'unit_id')::uuid;
    END IF;
    IF v_unit IS NOT NULL AND app.unit_is_parking(v_unit) THEN
        RAISE EXCEPTION '%', TG_ARGV[1] USING ERRCODE = '55000', HINT = 'PARKING_SPACE';
    END IF;
    RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION app.refuse_parking_space() FROM PUBLIC;

CREATE TRIGGER reservations_not_parking BEFORE INSERT OR UPDATE OF unit_id ON app.reservations
    FOR EACH ROW EXECUTE FUNCTION app.refuse_parking_space('unit', 'A parking space takes no Reservation');
CREATE TRIGGER joint_inspections_not_parking BEFORE INSERT OR UPDATE OF unit_id ON app.joint_inspections
    FOR EACH ROW EXECUTE FUNCTION app.refuse_parking_space('unit', 'A parking space takes no Joint Inspection');
CREATE TRIGGER utility_meters_not_parking BEFORE INSERT OR UPDATE OF unit_id ON app.utility_meters
    FOR EACH ROW EXECUTE FUNCTION app.refuse_parking_space('unit', 'A parking space has no meter');
CREATE TRIGGER unit_cleaning_rates_not_parking BEFORE INSERT ON app.unit_cleaning_rates
    FOR EACH ROW EXECUTE FUNCTION app.refuse_parking_space('unit', 'A parking space has no cleaning rate');
CREATE TRIGGER housekeeping_tasks_not_parking BEFORE INSERT OR UPDATE OF unit_id ON app.housekeeping_tasks
    FOR EACH ROW EXECUTE FUNCTION app.refuse_parking_space('unit', 'A parking space is not cleaned');
CREATE TRIGGER booking_site_calendars_not_parking BEFORE INSERT OR UPDATE OF unit_id ON app.booking_site_calendars
    FOR EACH ROW EXECUTE FUNCTION app.refuse_parking_space('unit', 'A parking space takes no short stay');
CREATE TRIGGER lease_pet_approvals_not_parking BEFORE INSERT ON app.lease_pet_approvals
    FOR EACH ROW EXECUTE FUNCTION app.refuse_parking_space('lease', 'A parking space takes no pet');
CREATE TRIGGER short_stay_lease_offers_not_parking BEFORE INSERT ON app.short_stay_lease_offers
    FOR EACH ROW EXECUTE FUNCTION app.refuse_parking_space('lease', 'A parking space takes no short stay');
"""

VEHICLES = r"""
CREATE TABLE app.vehicles (
    id uuid PRIMARY KEY CHECK (id <> '00000000-0000-0000-0000-000000000000'::uuid),
    property_id uuid NOT NULL REFERENCES app.properties(id) ON DELETE RESTRICT,
    customer_id uuid NOT NULL REFERENCES app.customers(id) ON DELETE RESTRICT,
    vehicle_type text NOT NULL
        CHECK (vehicle_type IN ('CAR', 'MOTORBIKE', 'TUK_TUK', 'FOOD_CART')),
    plate_text text NOT NULL
        CHECK (plate_text = btrim(plate_text) AND length(plate_text) BETWEEN 1 AND 32),
    plate_match_key text NOT NULL GENERATED ALWAYS AS (
        upper(regexp_replace(plate_text, '[[:space:].-]', '', 'g'))
    ) STORED,
    colour text CHECK (colour = btrim(colour) AND length(colour) BETWEEN 1 AND 50),
    brand_model text CHECK (brand_model = btrim(brand_model) AND length(brand_model) BETWEEN 1 AND 100),
    sticker_number text
        CHECK (sticker_number = btrim(sticker_number) AND length(sticker_number) BETWEEN 1 AND 32),
    version integer NOT NULL DEFAULT 1 CHECK (version > 0),
    created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
    created_by uuid NOT NULL REFERENCES app.user_accounts(actor_id),
    updated_at timestamptz NOT NULL DEFAULT statement_timestamp(),
    updated_by uuid NOT NULL REFERENCES app.user_accounts(actor_id)
);
CREATE INDEX vehicles_customer_idx ON app.vehicles(customer_id, created_at, id);
CREATE INDEX vehicles_plate_match_idx ON app.vehicles(property_id, plate_match_key);
COMMENT ON TABLE app.vehicles IS
    'Parking (DL-253): a vehicle under a Customer; plate as typed, matched without spaces, dashes, dots and case; never deleted';

CREATE FUNCTION app.reject_vehicle_delete() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
    RAISE EXCEPTION 'A vehicle is corrected, never deleted' USING ERRCODE = '55000';
END $$;
REVOKE ALL ON FUNCTION app.reject_vehicle_delete() FROM PUBLIC;
CREATE TRIGGER vehicles_reject_delete BEFORE DELETE ON app.vehicles
    FOR EACH ROW EXECUTE FUNCTION app.reject_vehicle_delete();
CREATE TRIGGER vehicles_reject_truncate BEFORE TRUNCATE ON app.vehicles
    FOR EACH STATEMENT EXECUTE FUNCTION app.reject_vehicle_delete();

-- Each vehicle type parks only in its own Parking Type, matched by the code (Settings cannot
-- change a code): Car: Covered or Uncovered; Motorbike: Motorbike; Tuk-tuk and food cart:
-- Tuk-Tuk/Food Cart. A Parking Type added later in Settings takes no vehicle until it is added here.
CREATE FUNCTION app.vehicle_type_allowed(p_vehicle_type text, p_parking_type text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $$
    SELECT CASE p_parking_type
        WHEN 'COVERED' THEN p_vehicle_type = 'CAR'
        WHEN 'UNCOVERED' THEN p_vehicle_type = 'CAR'
        WHEN 'MOTORBIKE' THEN p_vehicle_type = 'MOTORBIKE'
        WHEN 'TUK_TUK_FOOD_CART' THEN p_vehicle_type IN ('TUK_TUK', 'FOOD_CART')
        ELSE false END
$$;
GRANT EXECUTE ON FUNCTION app.vehicle_type_allowed(text, text) TO prm_runtime;

CREATE FUNCTION app.vehicle_json(p_vehicle app.vehicles) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = pg_catalog AS $$
    SELECT jsonb_build_object('vehicle_id', p_vehicle.id, 'customer_id', p_vehicle.customer_id,
        'customer_name', (SELECT legal_name FROM app.customers WHERE id = p_vehicle.customer_id),
        'vehicle_type', p_vehicle.vehicle_type, 'plate_text', p_vehicle.plate_text,
        'plate_match_key', p_vehicle.plate_match_key, 'colour', p_vehicle.colour,
        'brand_model', p_vehicle.brand_model, 'sticker_number', p_vehicle.sticker_number,
        'version', p_vehicle.version)
$$;
REVOKE ALL ON FUNCTION app.vehicle_json(app.vehicles) FROM PUBLIC;

CREATE FUNCTION app.audit_vehicle(p_action text, p_actor_id uuid, p_previous app.vehicles,
    p_vehicle app.vehicles) RETURNS void LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE v_timezone text;
BEGIN
    SELECT timezone_name INTO STRICT v_timezone FROM app.properties WHERE id = p_vehicle.property_id;
    INSERT INTO app.audit_events(id, occurred_at, business_date, actor_id, action, entity_type,
        entity_id, reason, authorization_reference, property_id, previous_state, resulting_state,
        correlation_id, source, outcome, authorization_evidence, customer_id)
    VALUES (gen_random_uuid(), statement_timestamp(),
        timezone(v_timezone, statement_timestamp())::date, p_actor_id, p_action,
        'vehicle', p_vehicle.id,
        CASE p_action WHEN 'vehicle.created' THEN 'Vehicle added' ELSE 'Vehicle corrected' END,
        'customers.manage', p_vehicle.property_id,
        CASE WHEN p_previous.id IS NULL THEN NULL ELSE app.vehicle_json(p_previous) END,
        app.vehicle_json(p_vehicle), gen_random_uuid(), 'API', 'SUCCEEDED',
        jsonb_build_object('capability', 'customers.manage'), p_vehicle.customer_id);
END $$;
REVOKE ALL ON FUNCTION app.audit_vehicle(text, uuid, app.vehicles, app.vehicles) FROM PUBLIC;

CREATE FUNCTION app.vehicle_text_ok(p_text text, p_max integer) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $$
    SELECT p_text IS NULL OR (p_text = btrim(p_text) AND length(p_text) BETWEEN 1 AND p_max)
$$;
REVOKE ALL ON FUNCTION app.vehicle_text_ok(text, integer) FROM PUBLIC;

CREATE FUNCTION app.create_vehicle(p_vehicle_id uuid, p_property_id uuid, p_customer_id uuid,
    p_vehicle_type text, p_plate_text text, p_colour text, p_brand_model text,
    p_sticker_number text, p_actor_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_vehicle app.vehicles%ROWTYPE;
BEGIN
    IF p_vehicle_id IS NULL OR p_property_id IS NULL OR p_customer_id IS NULL OR p_actor_id IS NULL
        OR p_vehicle_type IS NULL OR p_vehicle_type NOT IN ('CAR', 'MOTORBIKE', 'TUK_TUK', 'FOOD_CART')
        OR p_plate_text IS NULL OR NOT app.vehicle_text_ok(p_plate_text, 32)
        OR NOT app.vehicle_text_ok(p_colour, 50) OR NOT app.vehicle_text_ok(p_brand_model, 100)
        OR NOT app.vehicle_text_ok(p_sticker_number, 32)
    THEN RAISE EXCEPTION 'Vehicle evidence is invalid' USING ERRCODE = '22023'; END IF;
    IF NOT EXISTS (SELECT 1 FROM app.properties WHERE id = p_property_id)
    THEN RAISE EXCEPTION 'Property was not found' USING ERRCODE = 'P0002'; END IF;
    IF NOT EXISTS (SELECT 1 FROM app.customers WHERE id = p_customer_id AND deactivated_at IS NULL)
    THEN RAISE EXCEPTION 'Customer was not found' USING ERRCODE = 'P0002'; END IF;
    SELECT * INTO v_vehicle FROM app.vehicles WHERE id = p_vehicle_id;
    IF FOUND THEN
        -- The same vehicle sent again (a retry) is answered again; another one is refused.
        IF v_vehicle.customer_id <> p_customer_id OR v_vehicle.vehicle_type <> p_vehicle_type
            OR v_vehicle.plate_text <> p_plate_text
            OR v_vehicle.colour IS DISTINCT FROM p_colour
            OR v_vehicle.brand_model IS DISTINCT FROM p_brand_model
            OR v_vehicle.sticker_number IS DISTINCT FROM p_sticker_number
        THEN RAISE EXCEPTION 'Vehicle identity was reused' USING ERRCODE = '23505'; END IF;
        RETURN app.vehicle_json(v_vehicle);
    END IF;
    INSERT INTO app.vehicles(id, property_id, customer_id, vehicle_type, plate_text, colour,
        brand_model, sticker_number, created_by, updated_by)
    VALUES (p_vehicle_id, p_property_id, p_customer_id, p_vehicle_type, p_plate_text, p_colour,
        p_brand_model, p_sticker_number, p_actor_id, p_actor_id)
    RETURNING * INTO v_vehicle;
    PERFORM app.audit_vehicle('vehicle.created', p_actor_id, NULL::app.vehicles, v_vehicle);
    RETURN app.vehicle_json(v_vehicle);
END $$;

CREATE FUNCTION app.update_vehicle(p_vehicle_id uuid, p_expected_version integer,
    p_vehicle_type text, p_plate_text text, p_colour text, p_brand_model text,
    p_sticker_number text, p_actor_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_prior app.vehicles%ROWTYPE; v_vehicle app.vehicles%ROWTYPE;
BEGIN
    IF p_vehicle_id IS NULL OR p_actor_id IS NULL OR p_expected_version IS NULL
        OR p_vehicle_type IS NULL OR p_vehicle_type NOT IN ('CAR', 'MOTORBIKE', 'TUK_TUK', 'FOOD_CART')
        OR p_plate_text IS NULL OR NOT app.vehicle_text_ok(p_plate_text, 32)
        OR NOT app.vehicle_text_ok(p_colour, 50) OR NOT app.vehicle_text_ok(p_brand_model, 100)
        OR NOT app.vehicle_text_ok(p_sticker_number, 32)
    THEN RAISE EXCEPTION 'Vehicle evidence is invalid' USING ERRCODE = '22023'; END IF;
    SELECT * INTO v_prior FROM app.vehicles WHERE id = p_vehicle_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Vehicle was not found' USING ERRCODE = 'P0002'; END IF;
    IF v_prior.version <> p_expected_version THEN
        RAISE EXCEPTION 'Vehicle version is stale' USING ERRCODE = '40001'; END IF;
    IF v_prior.vehicle_type = p_vehicle_type AND v_prior.plate_text = p_plate_text
        AND v_prior.colour IS NOT DISTINCT FROM p_colour
        AND v_prior.brand_model IS NOT DISTINCT FROM p_brand_model
        AND v_prior.sticker_number IS NOT DISTINCT FROM p_sticker_number
    THEN RETURN app.vehicle_json(v_prior); END IF;
    -- A vehicle on a running hold keeps a type that fits its space.
    IF p_vehicle_type <> v_prior.vehicle_type AND EXISTS (
        SELECT 1 FROM app.parking_space_holds AS hold
        JOIN app.units AS space ON space.id = hold.space_unit_id
        WHERE hold.vehicle_id = p_vehicle_id AND hold.voided_at IS NULL
          AND (hold.held_until IS NULL OR hold.held_until >= timezone(
              (SELECT timezone_name FROM app.properties WHERE id = v_prior.property_id),
              statement_timestamp())::date)
          AND NOT app.vehicle_type_allowed(p_vehicle_type, space.unit_type)
    ) THEN
        RAISE EXCEPTION 'This vehicle type cannot park in this Parking Type'
            USING ERRCODE = '23514', HINT = 'VEHICLE_TYPE';
    END IF;
    UPDATE app.vehicles SET vehicle_type = p_vehicle_type, plate_text = p_plate_text,
        colour = p_colour, brand_model = p_brand_model, sticker_number = p_sticker_number,
        version = version + 1, updated_at = statement_timestamp(), updated_by = p_actor_id
    WHERE id = p_vehicle_id RETURNING * INTO v_vehicle;
    PERFORM app.audit_vehicle('vehicle.updated', p_actor_id, v_prior, v_vehicle);
    RETURN app.vehicle_json(v_vehicle);
END $$;
"""

HOLDS = r"""
CREATE TABLE app.parking_space_holds (
    id uuid PRIMARY KEY CHECK (id <> '00000000-0000-0000-0000-000000000000'::uuid),
    property_id uuid NOT NULL REFERENCES app.properties(id) ON DELETE RESTRICT,
    space_unit_id uuid NOT NULL REFERENCES app.units(id) ON DELETE RESTRICT,
    hold_kind text NOT NULL CHECK (hold_kind IN ('ROOM_LEASE', 'PARKING_AGREEMENT')),
    lease_id uuid NOT NULL REFERENCES app.leases(id) ON DELETE RESTRICT,
    lease_service_term_id uuid UNIQUE REFERENCES app.lease_service_terms(id) ON DELETE RESTRICT,
    vehicle_id uuid REFERENCES app.vehicles(id) ON DELETE RESTRICT,
    held_from date NOT NULL CHECK (isfinite(held_from)),
    held_until date CHECK (isfinite(held_until)),
    end_reason text CHECK (end_reason = btrim(end_reason) AND length(end_reason) BETWEEN 1 AND 500),
    voided_at timestamptz,
    voided_by uuid REFERENCES app.user_accounts(actor_id),
    void_reason text CHECK (void_reason = btrim(void_reason) AND length(void_reason) BETWEEN 1 AND 500),
    version integer NOT NULL DEFAULT 1 CHECK (version > 0),
    created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
    created_by uuid NOT NULL REFERENCES app.user_accounts(actor_id),
    updated_at timestamptz NOT NULL DEFAULT statement_timestamp(),
    updated_by uuid NOT NULL REFERENCES app.user_accounts(actor_id),
    CONSTRAINT parking_space_holds_dates CHECK (held_until IS NULL OR held_until >= held_from),
    CONSTRAINT parking_space_holds_way CHECK (
        (hold_kind = 'ROOM_LEASE') = (lease_service_term_id IS NOT NULL)),
    CONSTRAINT parking_space_holds_end_reason CHECK (end_reason IS NULL OR held_until IS NOT NULL),
    CONSTRAINT parking_space_holds_void_trio CHECK (
        (voided_at IS NULL) = (voided_by IS NULL) AND (voided_at IS NULL) = (void_reason IS NULL))
);
CREATE INDEX parking_space_holds_space_idx ON app.parking_space_holds(space_unit_id, held_from)
    WHERE voided_at IS NULL;
CREATE INDEX parking_space_holds_lease_idx ON app.parking_space_holds(lease_id, held_from, id);
CREATE INDEX parking_space_holds_vehicle_idx ON app.parking_space_holds(vehicle_id)
    WHERE vehicle_id IS NOT NULL;
COMMENT ON TABLE app.parking_space_holds IS
    'Parking (DL-253): a parking space held from a day (to a day) by a room Lease Service (Way A) or a Parking agreement (Way B); never deleted';

CREATE TABLE app.parking_vehicle_changes (
    id uuid PRIMARY KEY CHECK (id <> '00000000-0000-0000-0000-000000000000'::uuid),
    property_id uuid NOT NULL REFERENCES app.properties(id) ON DELETE RESTRICT,
    hold_id uuid NOT NULL REFERENCES app.parking_space_holds(id) ON DELETE RESTRICT,
    old_vehicle_id uuid REFERENCES app.vehicles(id) ON DELETE RESTRICT,
    new_vehicle_id uuid NOT NULL REFERENCES app.vehicles(id) ON DELETE RESTRICT,
    change_date date NOT NULL CHECK (isfinite(change_date)),
    reason text NOT NULL CHECK (reason = btrim(reason) AND length(reason) BETWEEN 1 AND 500),
    actor_id uuid NOT NULL REFERENCES app.user_accounts(actor_id) ON DELETE RESTRICT,
    occurred_at timestamptz NOT NULL DEFAULT statement_timestamp() CHECK (isfinite(occurred_at)),
    CONSTRAINT parking_vehicle_changes_differ CHECK (old_vehicle_id IS DISTINCT FROM new_vehicle_id)
);
CREATE INDEX parking_vehicle_changes_hold_idx
    ON app.parking_vehicle_changes(hold_id, occurred_at, id);
COMMENT ON TABLE app.parking_vehicle_changes IS
    'Parking (DL-253): the vehicle of a space hold changed on a day, with the reason; append-only';

CREATE FUNCTION app.reject_parking_append_only() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
    RAISE EXCEPTION '% rows are never changed or deleted', TG_TABLE_NAME USING ERRCODE = '55000';
END $$;
REVOKE ALL ON FUNCTION app.reject_parking_append_only() FROM PUBLIC;
CREATE TRIGGER parking_vehicle_changes_append_only BEFORE UPDATE OR DELETE ON app.parking_vehicle_changes
    FOR EACH ROW EXECUTE FUNCTION app.reject_parking_append_only();
CREATE TRIGGER parking_vehicle_changes_reject_truncate BEFORE TRUNCATE ON app.parking_vehicle_changes
    FOR EACH STATEMENT EXECUTE FUNCTION app.reject_parking_append_only();
CREATE TRIGGER parking_space_holds_reject_delete BEFORE DELETE ON app.parking_space_holds
    FOR EACH ROW EXECUTE FUNCTION app.reject_parking_append_only();
CREATE TRIGGER parking_space_holds_reject_truncate BEFORE TRUNCATE ON app.parking_space_holds
    FOR EACH STATEMENT EXECUTE FUNCTION app.reject_parking_append_only();

-- The most vehicles holding the space on any one day from p_from to p_until (NULL: no end),
-- leaving out p_skip. The peak of inclusive day ranges falls on a hold's first day.
CREATE FUNCTION app.parking_space_peak(p_space uuid, p_from date, p_until date, p_skip uuid)
RETURNS integer LANGUAGE sql STABLE SET search_path = pg_catalog AS $$
    SELECT COALESCE(max((
        SELECT count(*) FROM app.parking_space_holds AS hold
        WHERE hold.space_unit_id = p_space AND hold.voided_at IS NULL
          AND hold.id IS DISTINCT FROM p_skip
          AND hold.held_from <= day.day
          AND (hold.held_until IS NULL OR hold.held_until >= day.day)
    )), 0)::integer
    FROM (
        SELECT p_from AS day
        UNION
        SELECT other.held_from FROM app.parking_space_holds AS other
        WHERE other.space_unit_id = p_space AND other.voided_at IS NULL
          AND other.id IS DISTINCT FROM p_skip
          AND other.held_from > p_from AND (p_until IS NULL OR other.held_from <= p_until)
    ) AS day
$$;
REVOKE ALL ON FUNCTION app.parking_space_peak(uuid, date, date, uuid) FROM PUBLIC;

CREATE FUNCTION app.check_parking_space_hold() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
    v_space app.units%ROWTYPE;
    v_lease app.leases%ROWTYPE;
    v_home app.units%ROWTYPE;
    v_vehicle app.vehicles%ROWTYPE;
    v_counts boolean;
BEGIN
    IF TG_OP = 'UPDATE' AND (NEW.id IS DISTINCT FROM OLD.id
        OR NEW.property_id IS DISTINCT FROM OLD.property_id
        OR NEW.space_unit_id IS DISTINCT FROM OLD.space_unit_id
        OR NEW.hold_kind IS DISTINCT FROM OLD.hold_kind
        OR NEW.lease_id IS DISTINCT FROM OLD.lease_id
        OR NEW.lease_service_term_id IS DISTINCT FROM OLD.lease_service_term_id
        OR NEW.held_from IS DISTINCT FROM OLD.held_from
        OR NEW.created_at IS DISTINCT FROM OLD.created_at
        OR NEW.created_by IS DISTINCT FROM OLD.created_by
        OR OLD.voided_at IS NOT NULL
        OR NEW.version <> OLD.version + 1)
    THEN
        RAISE EXCEPTION 'A space hold keeps its space, Lease and first day; a voided hold never changes'
            USING ERRCODE = '55000';
    END IF;
    IF TG_OP = 'UPDATE' AND NEW.vehicle_id IS DISTINCT FROM OLD.vehicle_id
        AND OLD.vehicle_id IS NOT NULL
        AND current_setting('app.parking_vehicle_change', true) IS DISTINCT FROM 'on'
    THEN
        RAISE EXCEPTION 'The vehicle of a space hold changes only by Change vehicle'
            USING ERRCODE = '55000', HINT = 'VEHICLE_CHANGE';
    END IF;
    -- One space at a time: holds of a space wait for each other.
    PERFORM pg_advisory_xact_lock(hashtextextended('parking-space:' || NEW.space_unit_id::text, 0));
    SELECT * INTO v_space FROM app.units WHERE id = NEW.space_unit_id;
    IF NOT FOUND OR v_space.unit_kind <> 'PARKING' OR v_space.property_id <> NEW.property_id THEN
        RAISE EXCEPTION 'A space hold needs a parking space' USING ERRCODE = '23514', HINT = 'PARKING_NOT_SPACE';
    END IF;
    SELECT * INTO STRICT v_lease FROM app.leases WHERE id = NEW.lease_id;
    IF TG_OP = 'INSERT' THEN
        IF v_space.kept_for_short_stay_guests THEN
            RAISE EXCEPTION 'This space is kept for short-stay guests'
                USING ERRCODE = '23514', HINT = 'PARKING_KEPT_FOR_GUESTS';
        END IF;
        IF NEW.hold_kind = 'PARKING_AGREEMENT' THEN
            IF v_lease.unit_id <> NEW.space_unit_id THEN
                RAISE EXCEPTION 'A Parking agreement holds its own space'
                    USING ERRCODE = '23514', HINT = 'PARKING_WAY';
            END IF;
        ELSE
            SELECT * INTO STRICT v_home FROM app.units WHERE id = v_lease.unit_id;
            IF v_home.unit_kind <> 'HOME' OR NOT EXISTS (
                SELECT 1 FROM app.lease_service_terms AS term
                JOIN app.property_services AS service ON service.id = term.property_service_id
                JOIN app.service_types AS kind ON kind.id = service.service_type_id
                WHERE term.id = NEW.lease_service_term_id AND term.lease_id = NEW.lease_id
                  AND kind.needs_parking_space
            ) THEN
                RAISE EXCEPTION 'A room Lease holds a space through its parking Service'
                    USING ERRCODE = '23514', HINT = 'PARKING_WAY';
            END IF;
        END IF;
    END IF;
    IF NEW.vehicle_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.vehicle_id IS DISTINCT FROM OLD.vehicle_id) THEN
        SELECT * INTO v_vehicle FROM app.vehicles WHERE id = NEW.vehicle_id;
        IF NOT FOUND OR NOT EXISTS (SELECT 1 FROM app.lease_signers AS signer
            WHERE signer.lease_id = NEW.lease_id AND signer.customer_id = v_vehicle.customer_id)
        THEN
            RAISE EXCEPTION 'The vehicle belongs to nobody on this Lease'
                USING ERRCODE = '23514', HINT = 'VEHICLE_NOT_OF_LEASE';
        END IF;
        IF NOT app.vehicle_type_allowed(v_vehicle.vehicle_type, v_space.unit_type) THEN
            RAISE EXCEPTION 'This vehicle type cannot park in this Parking Type'
                USING ERRCODE = '23514', HINT = 'VEHICLE_TYPE';
        END IF;
    END IF;
    v_counts := NEW.voided_at IS NULL AND (TG_OP = 'INSERT'
        OR NEW.held_until IS NULL AND OLD.held_until IS NOT NULL
        OR NEW.held_until > OLD.held_until);
    IF v_counts AND app.parking_space_peak(NEW.space_unit_id, NEW.held_from, NEW.held_until, NEW.id) + 1
        > v_space.parking_capacity
    THEN
        RAISE EXCEPTION 'This parking space is already held on these days'
            USING ERRCODE = '23P01', HINT = 'PARKING_SPACE_TAKEN';
    END IF;
    RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION app.check_parking_space_hold() FROM PUBLIC;
CREATE TRIGGER parking_space_holds_check BEFORE INSERT OR UPDATE ON app.parking_space_holds
    FOR EACH ROW EXECUTE FUNCTION app.check_parking_space_hold();

-- A parking space keeps room for its holds and a type that fits their vehicles.
CREATE FUNCTION app.check_parking_space_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
    IF NEW.unit_kind <> 'PARKING' THEN RETURN NEW; END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended('parking-space:' || NEW.id::text, 0));
    IF NEW.parking_capacity < OLD.parking_capacity
        AND app.parking_space_peak(NEW.id, '-infinity'::date, NULL, NULL) > NEW.parking_capacity
    THEN
        RAISE EXCEPTION 'More vehicles hold this space than the new number of places'
            USING ERRCODE = '23514', HINT = 'PARKING_CAPACITY';
    END IF;
    IF NEW.unit_type IS DISTINCT FROM OLD.unit_type AND EXISTS (
        SELECT 1 FROM app.parking_space_holds AS hold
        JOIN app.vehicles AS vehicle ON vehicle.id = hold.vehicle_id
        WHERE hold.space_unit_id = NEW.id AND hold.voided_at IS NULL
          AND NOT app.vehicle_type_allowed(vehicle.vehicle_type, NEW.unit_type)
    ) THEN
        RAISE EXCEPTION 'A vehicle holding this space does not fit the new Parking Type'
            USING ERRCODE = '23514', HINT = 'VEHICLE_TYPE';
    END IF;
    IF NEW.kept_for_short_stay_guests AND NOT OLD.kept_for_short_stay_guests AND EXISTS (
        SELECT 1 FROM app.parking_space_holds AS hold
        WHERE hold.space_unit_id = NEW.id AND hold.voided_at IS NULL
          AND (hold.held_until IS NULL OR hold.held_until >= timezone(
              (SELECT timezone_name FROM app.properties WHERE id = NEW.property_id),
              statement_timestamp())::date)
    ) THEN
        RAISE EXCEPTION 'This space is held; it can be kept for guests when it is free'
            USING ERRCODE = '23514', HINT = 'PARKING_KEPT_FOR_GUESTS';
    END IF;
    RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION app.check_parking_space_change() FROM PUBLIC;
CREATE TRIGGER units_check_parking_space BEFORE UPDATE OF parking_capacity, unit_type, kept_for_short_stay_guests
    ON app.units FOR EACH ROW EXECUTE FUNCTION app.check_parking_space_change();
"""

GRANTS = r"""
REVOKE ALL ON TABLE app.vehicles, app.parking_space_holds, app.parking_vehicle_changes
    FROM PUBLIC, prm_runtime, prm_bootstrap;
GRANT SELECT ON TABLE app.vehicles, app.parking_space_holds, app.parking_vehicle_changes
    TO prm_runtime;
REVOKE ALL ON FUNCTION
    app.create_vehicle(uuid, uuid, uuid, text, text, text, text, text, uuid),
    app.update_vehicle(uuid, integer, text, text, text, text, text, uuid)
    FROM PUBLIC;
GRANT EXECUTE ON FUNCTION
    app.create_vehicle(uuid, uuid, uuid, text, text, text, text, text, uuid),
    app.update_vehicle(uuid, integer, text, text, text, text, text, uuid)
    TO prm_runtime;
"""


def upgrade() -> None:
    op.execute(UNITS)
    op.execute(SEED)
    op.execute(UNIT_REFERENCES)
    op.execute(GUARDS)
    op.execute(VEHICLES)
    op.execute(HOLDS)
    op.execute(GRANTS)


def downgrade() -> None:
    raise RuntimeError("Parking spaces migration 20270812_437 is forward-only")
