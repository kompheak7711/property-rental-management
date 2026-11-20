# ruff: noqa: E501
"""Buildings step 5: the "Takes short stays" switch of a building is kept (DL-250).

Owner decision of 19 Nov 2026 (thread "Add more buildings to the app"): each building has a
"Takes short stays" switch; a new building starts with it off. Migration `20270810_433` stored
the switch; this one makes the app keep it.

1. A short-stay booking or quote cannot be made for, or moved to, a Unit whose building does not
   take short stays (trigger on `app.short_stay_bookings` and `app.short_stay_quotes`, refused
   with SQLSTATE 55000). A booking already made stays as it is: it can still be checked in, paid,
   extended, cancelled and so on.
2. `app.short_stay_calendar_open`: the short-stay Calendar without the Units of such a building.
   A Unit that still has a booking (booked or checked in) on the shown nights stays on it, so a
   booking made before the switch was turned off is never hidden.
3. `app.unit_building_heading`: the name and address of a Unit's building, only while the
   business has two or more buildings (one building: nothing, so every paper stays as before).
   `app.aba_invoice_for_outbox` adds it as `building`, so the Invoice PDF sent on Telegram shows
   it under the business name (the old function is kept as `aba_invoice_for_outbox_main`).

Technical choices by Claude under the owner's 2026-10-23 22:30 rule (no money rule changes).
Additive, forward-only.
"""

from collections.abc import Sequence

from alembic import op

revision: str = "20270811_434"
down_revision: str | None = "20270810_433"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

FUNCTIONS = r"""
CREATE FUNCTION app.unit_takes_short_stays(p_unit uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
    SELECT COALESCE((SELECT building.takes_short_stays
        FROM app.units AS unit
        JOIN app.buildings AS building ON building.id = unit.building_id
        WHERE unit.id = p_unit), false)
$$;
REVOKE ALL ON FUNCTION app.unit_takes_short_stays(uuid) FROM PUBLIC;

CREATE FUNCTION app.guard_short_stay_building() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
    IF NEW.unit_id IS NOT NULL
        AND (TG_OP = 'INSERT' OR NEW.unit_id IS DISTINCT FROM OLD.unit_id)
        AND NOT app.unit_takes_short_stays(NEW.unit_id)
    THEN
        RAISE EXCEPTION 'This building does not take short stays' USING ERRCODE = '55000';
    END IF;
    RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION app.guard_short_stay_building() FROM PUBLIC;

CREATE TRIGGER short_stay_bookings_building BEFORE INSERT OR UPDATE OF unit_id
    ON app.short_stay_bookings FOR EACH ROW EXECUTE FUNCTION app.guard_short_stay_building();
CREATE TRIGGER short_stay_quotes_building BEFORE INSERT OR UPDATE OF unit_id
    ON app.short_stay_quotes FOR EACH ROW EXECUTE FUNCTION app.guard_short_stay_building();

CREATE FUNCTION app.short_stay_calendar_open(p_property uuid, p_from date, p_days integer,
    p_actor uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
    v_calendar jsonb := app.short_stay_calendar(p_property, p_from, p_days, p_actor);
BEGIN
    RETURN v_calendar || jsonb_build_object('units', COALESCE((
        SELECT jsonb_agg(unit_row ORDER BY position)
        FROM jsonb_array_elements(v_calendar -> 'units') WITH ORDINALITY AS unit_list(unit_row, position)
        WHERE app.unit_takes_short_stays((unit_row ->> 'unit_id')::uuid)
           OR EXISTS (SELECT 1 FROM app.short_stay_bookings AS booking
               WHERE booking.unit_id = (unit_row ->> 'unit_id')::uuid
                 AND booking.status IN ('BOOKED', 'CHECKED_IN')
                 AND booking.check_in_on < p_from + p_days
                 AND booking.check_out_on > p_from)), '[]'::jsonb));
END $$;
REVOKE ALL ON FUNCTION app.short_stay_calendar_open(uuid, date, integer, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.short_stay_calendar_open(uuid, date, integer, uuid) TO prm_runtime;

CREATE FUNCTION app.unit_building_heading(p_unit uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
    SELECT jsonb_build_object('building_id', building.id, 'name', building.name_en,
        'name_km', building.name_km, 'address', building.address_text)
    FROM app.units AS unit
    JOIN app.buildings AS building ON building.id = unit.building_id
    WHERE unit.id = p_unit
      AND (SELECT count(*) FROM app.buildings AS other
           WHERE other.property_id = unit.property_id AND other.removed_at IS NULL) >= 2
$$;
REVOKE ALL ON FUNCTION app.unit_building_heading(uuid) FROM PUBLIC;

ALTER FUNCTION app.aba_invoice_for_outbox(uuid, uuid, uuid) RENAME TO aba_invoice_for_outbox_main;
REVOKE ALL ON FUNCTION app.aba_invoice_for_outbox_main(uuid, uuid, uuid) FROM PUBLIC, prm_runtime;
CREATE FUNCTION app.aba_invoice_for_outbox(p_property uuid, p_outbox uuid, p_actor uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
    v_found jsonb := app.aba_invoice_for_outbox_main(p_property, p_outbox, p_actor);
BEGIN
    IF v_found IS NULL THEN
        RETURN NULL;
    END IF;
    RETURN v_found || jsonb_build_object('building', (
        SELECT app.unit_building_heading(lease.unit_id)
        FROM app.invoices AS invoice
        JOIN app.leases AS lease ON lease.id = invoice.lease_id
        WHERE invoice.id = (v_found ->> 'invoice_id')::uuid));
END $$;
REVOKE ALL ON FUNCTION app.aba_invoice_for_outbox(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.aba_invoice_for_outbox(uuid, uuid, uuid) TO prm_runtime;
"""


def upgrade() -> None:
    op.execute(FUNCTIONS)


def downgrade() -> None:
    raise RuntimeError("The building short-stay guard migration is forward-only")
