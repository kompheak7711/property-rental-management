# ruff: noqa: E501
"""Parking step 3a: the vehicles of a Customer with the spaces they hold today (DL-253).

The Customer page lists each vehicle (type, plate, colour, brand and model, sticker number) with
the parking spaces it holds today, through a room Lease's parking or a Parking agreement.

1. `app.customer_vehicles(customer, vehicle)`: the vehicles of a Customer (or one vehicle), each
   with its holds of today in the Property's time zone. Voided holds, holds that ended and holds
   that start later are left out.

Technical choice by Claude under the owner's 2026-10-23 22:30 rule. Additive, forward-only.
"""

from collections.abc import Sequence

from alembic import op

revision: str = "20270814_439"
down_revision: str | None = "20270813_438"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

FUNCTIONS = r"""
CREATE FUNCTION app.customer_vehicles(p_customer_id uuid, p_vehicle_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
    SELECT COALESCE(jsonb_agg(app.vehicle_json(vehicle) || jsonb_build_object('holds', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
            'hold_id', hold.id, 'hold_kind', hold.hold_kind, 'space_unit_id', space.id,
            'space_number', space.unit_number, 'lease_id', hold.lease_id,
            'lease_number', (SELECT number.lease_number FROM app.lease_numbers AS number
                WHERE number.lease_id = hold.lease_id),
            'held_from', hold.held_from, 'held_until', hold.held_until)
            ORDER BY hold.held_from, hold.id)
        FROM app.parking_space_holds AS hold
        JOIN app.units AS space ON space.id = hold.space_unit_id
        WHERE hold.vehicle_id = vehicle.id AND hold.voided_at IS NULL
          AND hold.held_from <= today.day
          AND (hold.held_until IS NULL OR hold.held_until >= today.day)
    ), '[]'::jsonb)) ORDER BY vehicle.created_at, vehicle.id), '[]'::jsonb)
    FROM app.vehicles AS vehicle
    JOIN app.properties AS property ON property.id = vehicle.property_id
    CROSS JOIN LATERAL (
        SELECT timezone(property.timezone_name, statement_timestamp())::date AS day
    ) AS today
    WHERE (p_customer_id IS NULL OR vehicle.customer_id = p_customer_id)
      AND (p_vehicle_id IS NULL OR vehicle.id = p_vehicle_id)
      AND (p_customer_id IS NOT NULL OR p_vehicle_id IS NOT NULL)
$$;
COMMENT ON FUNCTION app.customer_vehicles(uuid, uuid) IS
    'Parking (DL-253): the vehicles of a Customer, or one vehicle, with the spaces each holds today';
REVOKE ALL ON FUNCTION app.customer_vehicles(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.customer_vehicles(uuid, uuid) TO prm_runtime;
"""


def upgrade() -> None:
    op.execute(FUNCTIONS)


def downgrade() -> None:
    raise RuntimeError("Customer vehicles migration 20270814_439 is forward-only")
