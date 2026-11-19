# ruff: noqa: E501
"""Buildings: a Property can hold more than one building (DL-250).

Owner decisions of 18 and 19 Nov 2026 (thread "Add more buildings to the app"): the business can
add a building later, from Settings, with no new code. A building has its own name and address;
money, numbers and rules stay those of the one business (the one-Property lock stays). Unit
numbers stay unique across the business (the existing UNIQUE (property_id, unit_number)).

1. `app.buildings`: name (English, optional Khmer), address, description, "takes short stays",
   order, removed, version, who and when. A building is never deleted; it can be removed only
   while no Unit is in it. Every change is written to the audit history.
2. Building 1 is made for every Property: from the Business name and address, with short stays
   on. A Property made later gets it too (trigger).
3. `app.units.building_id`: every existing Unit goes into building 1, then the column is required.
   A new Unit with no building gets the first building, so the existing create functions and test
   inserts keep working unchanged. Adding the column does not change a Unit, so the Units' version
   and history are left as they are (the history trigger is paused for that one UPDATE only).
4. `app.move_unit_to_building`: only for a Unit that never had a Lease, Reservation or short-stay
   booking (so reports for past months never move from one building to another), with a reason,
   written to the audit history.

Technical choices by Claude under the owner's 2026-10-23 22:30 rule (no money rule changes).
Additive, forward-only.
"""

from collections.abc import Sequence

from alembic import op

revision: str = "20270810_433"
down_revision: str | None = "20270809_432"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

TRIM = (
    r"U&'\0009\000A\000B\000C\000D\001C\001D\001E\001F\0020\0085\00A0\1680\2000\2001\2002"
    r"\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000'"
)

BUILDING_RESULT = """RETURNS TABLE (
            id uuid,
            property_id uuid,
            name_en text,
            name_km text,
            address_text text,
            description text,
            takes_short_stays boolean,
            sort_order integer,
            removed_at timestamptz,
            version integer
        )"""

RETURN_BUILDING = """RETURN QUERY SELECT v_building.id, v_building.property_id,
                v_building.name_en, v_building.name_km, v_building.address_text,
                v_building.description, v_building.takes_short_stays, v_building.sort_order,
                v_building.removed_at, v_building.version;"""

SIGNATURES = (
    "app.create_building(uuid, uuid, text, text, text, text, boolean, integer, uuid)",
    "app.update_building(uuid, text, text, text, text, boolean, integer, integer, uuid)",
    "app.remove_building(uuid, integer, uuid)",
    "app.move_unit_to_building(uuid, uuid, integer, text, uuid)",
)


def upgrade() -> None:
    op.execute(
        rf"""
        CREATE TABLE app.buildings (
            id uuid PRIMARY KEY CHECK (id <> '00000000-0000-0000-0000-000000000000'::uuid),
            property_id uuid NOT NULL REFERENCES app.properties(id) ON DELETE RESTRICT,
            name_en text NOT NULL,
            name_km text,
            address_text text,
            description text,
            takes_short_stays boolean NOT NULL DEFAULT false,
            sort_order integer NOT NULL DEFAULT 0,
            removed_at timestamptz,
            removed_by uuid REFERENCES app.user_accounts(actor_id),
            version integer NOT NULL DEFAULT 1 CHECK (version > 0),
            created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
            created_by uuid REFERENCES app.user_accounts(actor_id),
            updated_at timestamptz NOT NULL DEFAULT statement_timestamp(),
            updated_by uuid REFERENCES app.user_accounts(actor_id),
            CONSTRAINT buildings_id_property_unique UNIQUE (id, property_id),
            CONSTRAINT buildings_name_en_normalized CHECK (
                name_en = btrim(name_en, {TRIM}) AND length(name_en) BETWEEN 1 AND 100
            ),
            CONSTRAINT buildings_name_km_normalized CHECK (
                name_km IS NULL
                OR (name_km = btrim(name_km, {TRIM}) AND length(name_km) BETWEEN 1 AND 100)
            ),
            CONSTRAINT buildings_address_normalized CHECK (
                address_text IS NULL
                OR (address_text = btrim(address_text, {TRIM})
                    AND length(address_text) BETWEEN 1 AND 2000)
            ),
            CONSTRAINT buildings_description_normalized CHECK (
                description IS NULL
                OR (description = btrim(description, {TRIM})
                    AND length(description) BETWEEN 1 AND 2000)
            ),
            CONSTRAINT buildings_sort_order_range CHECK (sort_order BETWEEN 0 AND 9999),
            CONSTRAINT buildings_removed_complete CHECK (
                (removed_at IS NULL) = (removed_by IS NULL)
            )
        );
        CREATE UNIQUE INDEX buildings_property_name_unique
            ON app.buildings (property_id, lower(name_en)) WHERE removed_at IS NULL;
        REVOKE ALL ON TABLE app.buildings FROM PUBLIC, prm_runtime, prm_bootstrap;
        GRANT SELECT ON TABLE app.buildings TO prm_runtime;
        """
    )
    op.execute(
        """
        CREATE FUNCTION app.building_in_use(p_building_id uuid) RETURNS boolean
        LANGUAGE plpgsql
        STABLE
        SET search_path = pg_catalog
        AS $$
        BEGIN
            RETURN EXISTS (
                SELECT 1 FROM app.units AS unit WHERE unit.building_id = p_building_id
            );
        END;
        $$;
        REVOKE ALL ON FUNCTION app.building_in_use(uuid) FROM PUBLIC;
        GRANT EXECUTE ON FUNCTION app.building_in_use(uuid) TO prm_runtime;

        CREATE FUNCTION app.protect_building() RETURNS trigger
        LANGUAGE plpgsql
        SET search_path = pg_catalog
        AS $$
        BEGIN
            IF TG_OP <> 'UPDATE'
                OR NEW.id IS DISTINCT FROM OLD.id
                OR NEW.property_id IS DISTINCT FROM OLD.property_id
                OR NEW.created_at IS DISTINCT FROM OLD.created_at
                OR NEW.created_by IS DISTINCT FROM OLD.created_by
                OR NEW.version <> OLD.version + 1
                OR NEW.updated_at < OLD.updated_at
                OR (OLD.removed_at IS NOT NULL AND (
                    NEW.removed_at IS DISTINCT FROM OLD.removed_at
                    OR NEW.removed_by IS DISTINCT FROM OLD.removed_by
                ))
            THEN
                RAISE EXCEPTION 'Building identity and history are protected'
                    USING ERRCODE = '55000';
            END IF;
            IF OLD.removed_at IS NULL AND NEW.removed_at IS NOT NULL
                AND app.building_in_use(NEW.id)
            THEN
                RAISE EXCEPTION 'A building that has Units cannot be removed'
                    USING ERRCODE = '55000';
            END IF;
            RETURN NEW;
        END;
        $$;
        REVOKE ALL ON FUNCTION app.protect_building() FROM PUBLIC;
        CREATE TRIGGER buildings_protect
        BEFORE UPDATE OR DELETE ON app.buildings
        FOR EACH ROW EXECUTE FUNCTION app.protect_building();
        CREATE TRIGGER buildings_reject_truncate
        BEFORE TRUNCATE ON app.buildings
        FOR EACH STATEMENT EXECUTE FUNCTION app.protect_building();

        CREATE FUNCTION app.building_state(p_building app.buildings) RETURNS jsonb
        LANGUAGE sql
        IMMUTABLE
        SET search_path = pg_catalog
        AS $$
            SELECT jsonb_build_object(
                'building_id', p_building.id,
                'name_en', p_building.name_en,
                'name_km', p_building.name_km,
                'address_text', p_building.address_text,
                'description', p_building.description,
                'takes_short_stays', p_building.takes_short_stays,
                'sort_order', p_building.sort_order,
                'removed', p_building.removed_at IS NOT NULL,
                'version', p_building.version
            )
        $$;
        REVOKE ALL ON FUNCTION app.building_state(app.buildings) FROM PUBLIC;

        CREATE FUNCTION app.audit_building(
            p_action text,
            p_actor_id uuid,
            p_reason text,
            p_previous app.buildings,
            p_building app.buildings
        ) RETURNS void
        LANGUAGE plpgsql
        SET search_path = pg_catalog
        AS $$
        DECLARE
            v_event_id uuid := gen_random_uuid();
        BEGIN
            INSERT INTO app.audit_events (
                id, occurred_at, business_date, actor_id, action, entity_type, entity_id,
                reason, property_id, previous_state, resulting_state, correlation_id, source,
                outcome
            ) VALUES (
                v_event_id, statement_timestamp(),
                timezone('Asia/Phnom_Penh', statement_timestamp())::date,
                p_actor_id, p_action, 'building', p_building.id, p_reason,
                p_building.property_id,
                CASE WHEN p_previous.id IS NULL THEN NULL
                     ELSE app.building_state(p_previous) END,
                app.building_state(p_building),
                v_event_id, 'API', 'SUCCEEDED'
            );
        END;
        $$;
        REVOKE ALL ON FUNCTION
            app.audit_building(text, uuid, text, app.buildings, app.buildings) FROM PUBLIC;
        """
    )
    # Building 1 for every Property: the Property that exists now, and any made later.
    op.execute(
        """
        CREATE FUNCTION app.make_first_building(p_property_id uuid) RETURNS uuid
        LANGUAGE plpgsql
        SET search_path = pg_catalog
        AS $$
        DECLARE
            v_property app.properties%ROWTYPE;
            v_building app.buildings%ROWTYPE;
            v_none app.buildings%ROWTYPE;
        BEGIN
            SELECT property.* INTO v_property FROM app.properties AS property
            WHERE property.id = p_property_id;
            IF NOT FOUND THEN
                RETURN NULL;
            END IF;
            SELECT building.* INTO v_building FROM app.buildings AS building
            WHERE building.property_id = p_property_id
            ORDER BY building.sort_order, building.created_at, building.id
            LIMIT 1;
            IF FOUND THEN
                RETURN v_building.id;
            END IF;
            INSERT INTO app.buildings AS building (
                id, property_id, name_en, address_text, takes_short_stays, sort_order,
                created_by, updated_by
            ) VALUES (
                gen_random_uuid(), p_property_id,
                left(coalesce(nullif(btrim(v_property.name), ''), 'Building 1'), 100),
                nullif(btrim(v_property.address_text), ''),
                true, 0, v_property.created_by, v_property.created_by
            ) RETURNING building.* INTO v_building;
            IF v_property.created_by IS NOT NULL THEN
                PERFORM app.audit_building(
                    'building.created', v_property.created_by,
                    'Building 1 made from the Business name and address', v_none, v_building
                );
            END IF;
            RETURN v_building.id;
        END;
        $$;
        REVOKE ALL ON FUNCTION app.make_first_building(uuid) FROM PUBLIC;

        CREATE FUNCTION app.make_first_building_for_property() RETURNS trigger
        LANGUAGE plpgsql
        SET search_path = pg_catalog
        AS $$
        BEGIN
            PERFORM app.make_first_building(NEW.id);
            RETURN NULL;
        END;
        $$;
        REVOKE ALL ON FUNCTION app.make_first_building_for_property() FROM PUBLIC;
        CREATE TRIGGER properties_make_first_building
        AFTER INSERT ON app.properties
        FOR EACH ROW EXECUTE FUNCTION app.make_first_building_for_property();

        SELECT app.make_first_building(property.id) FROM app.properties AS property;
        """
    )
    # Every Unit in a building. Adding the column is not a change to the Unit.
    op.execute(
        """
        ALTER TABLE app.units ADD COLUMN building_id uuid;
        ALTER TABLE app.units DISABLE TRIGGER units_protect_history;
        UPDATE app.units AS unit
        SET building_id = app.make_first_building(unit.property_id);
        ALTER TABLE app.units ENABLE TRIGGER units_protect_history;
        ALTER TABLE app.units ALTER COLUMN building_id SET NOT NULL;
        ALTER TABLE app.units ADD CONSTRAINT units_building_same_property
            FOREIGN KEY (building_id, property_id) REFERENCES app.buildings (id, property_id)
            ON DELETE RESTRICT;
        CREATE INDEX units_building_idx ON app.units (building_id);

        CREATE FUNCTION app.unit_default_building() RETURNS trigger
        LANGUAGE plpgsql
        SET search_path = pg_catalog
        AS $$
        BEGIN
            IF NEW.building_id IS NULL THEN
                SELECT building.id INTO NEW.building_id FROM app.buildings AS building
                WHERE building.property_id = NEW.property_id AND building.removed_at IS NULL
                ORDER BY building.sort_order, building.created_at, building.id
                LIMIT 1;
            ELSIF TG_OP = 'INSERT' AND EXISTS (
                SELECT 1 FROM app.buildings AS building
                WHERE building.id = NEW.building_id AND building.removed_at IS NOT NULL
            ) THEN
                RAISE EXCEPTION 'A removed building cannot take a new Unit'
                    USING ERRCODE = '22023';
            END IF;
            RETURN NEW;
        END;
        $$;
        REVOKE ALL ON FUNCTION app.unit_default_building() FROM PUBLIC;
        CREATE TRIGGER units_default_building
        BEFORE INSERT ON app.units
        FOR EACH ROW EXECUTE FUNCTION app.unit_default_building();
        """
    )
    op.execute(
        rf"""
        CREATE FUNCTION app.create_building(
            p_id uuid,
            p_property_id uuid,
            p_name_en text,
            p_name_km text,
            p_address_text text,
            p_description text,
            p_takes_short_stays boolean,
            p_sort_order integer,
            p_actor_id uuid
        ) {BUILDING_RESULT}
        LANGUAGE plpgsql
        SECURITY DEFINER
        SET search_path = pg_catalog
        AS $$
        DECLARE
            v_building app.buildings%ROWTYPE;
            v_none app.buildings%ROWTYPE;
        BEGIN
            IF p_actor_id IS NULL THEN
                RAISE EXCEPTION 'A building needs the person who adds it' USING ERRCODE = '22023';
            END IF;
            PERFORM pg_advisory_xact_lock(hashtextextended('buildings:' || p_property_id::text, 0));
            INSERT INTO app.buildings AS building (
                id, property_id, name_en, name_km, address_text, description,
                takes_short_stays, sort_order, created_by, updated_by
            ) VALUES (
                p_id, p_property_id, btrim(p_name_en, {TRIM}),
                nullif(btrim(p_name_km, {TRIM}), ''),
                nullif(btrim(p_address_text, {TRIM}), ''),
                nullif(btrim(p_description, {TRIM}), ''),
                coalesce(p_takes_short_stays, false), coalesce(p_sort_order, 0),
                p_actor_id, p_actor_id
            ) RETURNING building.* INTO v_building;
            PERFORM app.audit_building(
                'building.created', p_actor_id, 'Building added in Settings', v_none, v_building
            );
            {RETURN_BUILDING}
        END;
        $$;

        CREATE FUNCTION app.update_building(
            p_id uuid,
            p_name_en text,
            p_name_km text,
            p_address_text text,
            p_description text,
            p_takes_short_stays boolean,
            p_sort_order integer,
            p_expected_version integer,
            p_actor_id uuid
        ) {BUILDING_RESULT}
        LANGUAGE plpgsql
        SECURITY DEFINER
        SET search_path = pg_catalog
        AS $$
        DECLARE
            v_previous app.buildings%ROWTYPE;
            v_building app.buildings%ROWTYPE;
        BEGIN
            SELECT building.* INTO v_previous FROM app.buildings AS building
            WHERE building.id = p_id FOR UPDATE;
            IF NOT FOUND OR v_previous.version <> p_expected_version THEN
                RETURN;
            END IF;
            IF v_previous.removed_at IS NOT NULL THEN
                RAISE EXCEPTION 'A removed building cannot be changed' USING ERRCODE = '22023';
            END IF;
            UPDATE app.buildings AS building
            SET name_en = btrim(p_name_en, {TRIM}),
                name_km = nullif(btrim(p_name_km, {TRIM}), ''),
                address_text = nullif(btrim(p_address_text, {TRIM}), ''),
                description = nullif(btrim(p_description, {TRIM}), ''),
                takes_short_stays = coalesce(p_takes_short_stays, false),
                sort_order = coalesce(p_sort_order, 0),
                version = building.version + 1,
                updated_at = statement_timestamp(),
                updated_by = p_actor_id
            WHERE building.id = p_id
            RETURNING building.* INTO v_building;
            PERFORM app.audit_building(
                'building.updated', p_actor_id, 'Building changed in Settings', v_previous,
                v_building
            );
            {RETURN_BUILDING}
        END;
        $$;

        CREATE FUNCTION app.remove_building(
            p_id uuid,
            p_expected_version integer,
            p_actor_id uuid
        ) {BUILDING_RESULT}
        LANGUAGE plpgsql
        SECURITY DEFINER
        SET search_path = pg_catalog
        AS $$
        DECLARE
            v_previous app.buildings%ROWTYPE;
            v_building app.buildings%ROWTYPE;
        BEGIN
            SELECT building.* INTO v_previous FROM app.buildings AS building
            WHERE building.id = p_id FOR UPDATE;
            IF NOT FOUND OR v_previous.version <> p_expected_version THEN
                RETURN;
            END IF;
            IF v_previous.removed_at IS NOT NULL THEN
                RAISE EXCEPTION 'The building is already removed' USING ERRCODE = '22023';
            END IF;
            UPDATE app.buildings AS building
            SET removed_at = statement_timestamp(),
                removed_by = p_actor_id,
                version = building.version + 1,
                updated_at = statement_timestamp(),
                updated_by = p_actor_id
            WHERE building.id = p_id
            RETURNING building.* INTO v_building;
            PERFORM app.audit_building(
                'building.removed', p_actor_id, 'Building removed in Settings', v_previous,
                v_building
            );
            {RETURN_BUILDING}
        END;
        $$;

        -- Only a Unit with no renting history moves, so reports of past months never change
        -- building. Returns the Unit's new version, or nothing when the version is stale.
        CREATE FUNCTION app.move_unit_to_building(
            p_unit_id uuid,
            p_building_id uuid,
            p_expected_version integer,
            p_reason text,
            p_actor_id uuid
        ) RETURNS integer
        LANGUAGE plpgsql
        SECURITY DEFINER
        SET search_path = pg_catalog
        AS $$
        DECLARE
            v_unit app.units%ROWTYPE;
            v_building app.buildings%ROWTYPE;
            v_reason text := btrim(p_reason, {TRIM});
            v_event_id uuid := gen_random_uuid();
            v_version integer;
        BEGIN
            IF p_actor_id IS NULL OR v_reason IS NULL OR length(v_reason) = 0
                OR length(v_reason) > 500
            THEN
                RAISE EXCEPTION 'Moving a Unit needs the person and a reason'
                    USING ERRCODE = '22023';
            END IF;
            SELECT unit.* INTO v_unit FROM app.units AS unit WHERE unit.id = p_unit_id FOR UPDATE;
            IF NOT FOUND OR v_unit.version <> p_expected_version THEN
                RETURN NULL;
            END IF;
            SELECT building.* INTO v_building FROM app.buildings AS building
            WHERE building.id = p_building_id;
            IF NOT FOUND OR v_building.property_id <> v_unit.property_id
                OR v_building.removed_at IS NOT NULL
            THEN
                RAISE EXCEPTION 'The building is not one this Unit can move to'
                    USING ERRCODE = '22023';
            END IF;
            IF v_building.id = v_unit.building_id THEN
                RAISE EXCEPTION 'The Unit is already in this building' USING ERRCODE = '22023';
            END IF;
            IF EXISTS (SELECT 1 FROM app.leases AS lease WHERE lease.unit_id = p_unit_id)
                OR EXISTS (SELECT 1 FROM app.reservations AS reservation
                           WHERE reservation.unit_id = p_unit_id)
                OR EXISTS (SELECT 1 FROM app.short_stay_bookings AS booking
                           WHERE booking.unit_id = p_unit_id)
            THEN
                RAISE EXCEPTION 'A Unit that has had a Lease, Reservation or booking cannot move to another building'
                    USING ERRCODE = '55000';
            END IF;
            UPDATE app.units AS unit
            SET building_id = v_building.id,
                version = unit.version + 1,
                updated_at = greatest(statement_timestamp(), unit.updated_at),
                updated_by = p_actor_id
            WHERE unit.id = p_unit_id
            RETURNING unit.version INTO v_version;
            INSERT INTO app.audit_events (
                id, occurred_at, business_date, actor_id, action, entity_type, entity_id,
                reason, property_id, previous_state, resulting_state, correlation_id, source,
                outcome, unit_id
            ) VALUES (
                v_event_id, statement_timestamp(),
                timezone('Asia/Phnom_Penh', statement_timestamp())::date,
                p_actor_id, 'unit.building_changed', 'unit', p_unit_id, v_reason,
                v_unit.property_id,
                jsonb_build_object('building_id', v_unit.building_id, 'version', v_unit.version),
                jsonb_build_object('building_id', v_building.id, 'version', v_version),
                v_event_id, 'API', 'SUCCEEDED', p_unit_id
            );
            RETURN v_version;
        END;
        $$;
        """
    )
    for signature in SIGNATURES:
        op.execute(f"REVOKE ALL ON FUNCTION {signature} FROM PUBLIC")
        op.execute(f"GRANT EXECUTE ON FUNCTION {signature} TO prm_runtime")


def downgrade() -> None:
    raise RuntimeError("The buildings migration is forward-only")
