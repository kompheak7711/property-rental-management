"""Owner's choice of 14 Nov 2026, DL-236: a Housekeeping task is given to one person.

The owner asked who a cleaning task is for, and chose "Yes, assign to a person": each task may
be given to one member of staff, the housekeeper can show only the tasks given to them, and a
finished task names the person who finished it.

What this migration adds:

- ``app.protect_short_stay_step`` (the guard that lets a task move forward once) also lets a task
  still to do change its assignment, and nothing else, with its version.
- ``app.housekeeping_tasks`` gets ``assigned_to``, ``assigned_at`` and ``assigned_by`` (empty
  for every task made before; nothing is filled in for them). A task is given to a person who
  may tick Housekeeping tasks (``short_stays.housekeeping``) at the task's Property and whose
  account is active.
- ``app.short_stay_cleaners``: the people a task may be given to, by name.
- ``app.short_stay_housekeeping`` (the list of a day) also gives each task ``assigned_to``,
  ``assigned_name``, ``mine`` (given to the person reading) and ``done_by_name``, and the list
  gives ``cleaners``.
- ``app.assign_housekeeping_task``: the front desk (``short_stays.desk``) gives a task that is
  still to do to a person, to another person, or to nobody. The History (audit) keeps the
  person before and after.

Anyone with ``short_stays.housekeeping`` may still finish any task (a colleague covers a
day off); the task then names who finished it. No money, Invoice or Unit status changes.

Forward-only.

Revision ID: 20270725_410
Revises: 20270724_401
"""

from collections.abc import Sequence

from alembic import op

revision: str = "20270725_410"
down_revision: str | None = "20270724_401"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

TABLE = r"""
ALTER TABLE app.housekeeping_tasks
    ADD COLUMN assigned_to uuid REFERENCES app.actor_identities (actor_id) ON DELETE RESTRICT,
    ADD COLUMN assigned_at timestamptz,
    ADD COLUMN assigned_by uuid REFERENCES app.actor_identities (actor_id) ON DELETE RESTRICT,
    -- A task given to a person says when and by whom; a task never given to anyone says neither.
    ADD CONSTRAINT housekeeping_tasks_assign_shape CHECK (
        (assigned_at IS NULL) = (assigned_by IS NULL)
        AND (assigned_to IS NULL OR assigned_at IS NOT NULL));
CREATE INDEX housekeeping_tasks_assigned_idx ON app.housekeeping_tasks (assigned_to)
    WHERE assigned_to IS NOT NULL;
"""

FUNCTIONS = r"""
-- The step guard of migration 20270602_312, unchanged except that a Housekeeping task still to
-- do may also be given to a person (only its assignment and version change).
CREATE OR REPLACE FUNCTION app.protect_short_stay_step() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE
    v_old jsonb := to_jsonb(OLD);
    v_new jsonb := to_jsonb(NEW);
    v_open text := CASE TG_TABLE_NAME
        WHEN 'short_stay_deposits' THEN 'HELD'
        WHEN 'housekeeping_tasks' THEN 'TO_DO'
        ELSE 'WAITING' END;
    v_free text[] := CASE TG_TABLE_NAME
        WHEN 'short_stay_deposits' THEN ARRAY['status', 'kept_usd_cents', 'ended_at', 'ended_by',
            'end_note', 'version']
        WHEN 'housekeeping_tasks' THEN ARRAY['status', 'note', 'done_at', 'done_by', 'version']
        ELSE ARRAY['status', 'decided_at', 'decided_by', 'decision_note', 'version',
            'from_deposit_usd_cents', 'invoice_id'] END;
    v_assign text[] := ARRAY['assigned_to', 'assigned_at', 'assigned_by', 'version'];
BEGIN
    IF TG_OP = 'UPDATE' AND TG_TABLE_NAME = 'housekeeping_tasks'
        AND OLD.status = 'TO_DO' AND NEW.status = 'TO_DO'
        AND (v_new ->> 'version')::integer = (v_old ->> 'version')::integer + 1
        AND (v_old - v_assign) = (v_new - v_assign)
    THEN
        RETURN NEW;
    END IF;
    IF TG_OP <> 'UPDATE' OR OLD.status <> v_open OR NEW.status = v_open
        OR (v_new ->> 'version')::integer <> (v_old ->> 'version')::integer + 1
        OR (v_old - v_free) <> (v_new - v_free)
    THEN
        RAISE EXCEPTION '% rows move forward once and are never removed', TG_TABLE_NAME
            USING ERRCODE = '55000';
    END IF;
    RETURN NEW;
END $$;

-- The people a Housekeeping task may be given to: an active account that may tick housekeeping
-- tasks at this Property.
CREATE FUNCTION app.short_stay_cleaners(p_property uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
    SELECT COALESCE(jsonb_agg(jsonb_build_object('actor_id', account.actor_id,
            'name', account.display_name) ORDER BY lower(account.display_name), account.actor_id),
        '[]'::jsonb)
    FROM app.user_accounts AS account
    WHERE account.lifecycle_state = 'active'
      AND EXISTS (SELECT 1 FROM app.actor_capability_grants(account.actor_id) AS held
          WHERE held.capability_id = 'short_stays.housekeeping'
            AND held.property_id = p_property)
$$;
REVOKE ALL ON FUNCTION app.short_stay_cleaners(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION app.short_stay_housekeeping(p_property uuid, p_day date, p_actor uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_today date := app.require_product_right(p_actor, 'short_stays.read', p_property);
BEGIN
    IF p_day IS NULL THEN
        RAISE EXCEPTION 'The day is invalid' USING ERRCODE = '22023';
    END IF;
    RETURN jsonb_build_object('day', p_day, 'today', v_today,
        'cleaners', app.short_stay_cleaners(p_property),
        'tasks', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('task_id', task.id, 'kind', task.kind,
            'task_on', task.task_on, 'status', task.status, 'note', task.note,
            'done_at', task.done_at, 'done_by_name', done.display_name,
            'assigned_to', task.assigned_to, 'assigned_name', given.display_name,
            'mine', task.assigned_to IS NOT DISTINCT FROM p_actor,
            'unit_id', task.unit_id, 'unit_number', unit.unit_number,
            'booking_id', booking.id, 'booking_number', booking.booking_number,
            'guest_name', customer.legal_name, 'late', task.task_on < p_day,
            'version', task.version)
            ORDER BY task.status <> 'TO_DO', unit.unit_number, task.kind, task.task_on)
        FROM app.housekeeping_tasks AS task
        JOIN app.units AS unit ON unit.id = task.unit_id
        LEFT JOIN app.short_stay_bookings AS booking ON booking.id = task.booking_id
        LEFT JOIN app.customers AS customer ON customer.id = booking.customer_id
        LEFT JOIN app.user_accounts AS done ON done.actor_id = task.done_by
        LEFT JOIN app.user_accounts AS given ON given.actor_id = task.assigned_to
        WHERE task.property_id = p_property
          AND (task.task_on = p_day
               OR (p_day = v_today AND task.task_on < p_day AND task.status = 'TO_DO'))),
        '[]'::jsonb));
END $$;

-- The front desk gives a task still to do to one person, to another, or to nobody
-- ({"actor_id": null} or no actor_id). Answers with the list of the task's day.
CREATE FUNCTION app.assign_housekeeping_task(p_property uuid, p_task uuid, p_assign jsonb,
    p_actor uuid, p_correlation uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
    v_today date := app.require_product_right(p_actor, 'short_stays.desk', p_property);
    v_task app.housekeeping_tasks;
    v_person uuid;
BEGIN
    IF p_assign IS NULL OR jsonb_typeof(p_assign) <> 'object'
       OR EXISTS (SELECT 1 FROM jsonb_object_keys(p_assign) AS key WHERE key <> 'actor_id')
       OR jsonb_typeof(p_assign -> 'actor_id') NOT IN ('string', 'null') THEN
        RAISE EXCEPTION 'The task answer is invalid' USING ERRCODE = '22023';
    END IF;
    BEGIN
        v_person := (p_assign ->> 'actor_id')::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
        RAISE EXCEPTION 'The task answer is invalid' USING ERRCODE = '22023';
    END;
    SELECT task.* INTO v_task FROM app.housekeeping_tasks AS task
    WHERE task.id = p_task AND task.property_id = p_property FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'the task does not exist' USING ERRCODE = '22023';
    END IF;
    IF v_task.status <> 'TO_DO' THEN
        RAISE EXCEPTION 'This task is already done' USING ERRCODE = '55000';
    END IF;
    IF v_person IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(app.short_stay_cleaners(p_property)) AS person
        WHERE (person ->> 'actor_id')::uuid = v_person) THEN
        RAISE EXCEPTION 'This person may not do housekeeping here' USING ERRCODE = '22023';
    END IF;
    IF v_person IS NOT DISTINCT FROM v_task.assigned_to THEN
        RETURN app.short_stay_housekeeping(p_property, v_task.task_on, p_actor);
    END IF;
    UPDATE app.housekeeping_tasks AS task
    SET assigned_to = v_person, assigned_at = statement_timestamp(), assigned_by = p_actor,
        version = task.version + 1
    WHERE task.id = v_task.id;
    PERFORM app.product_audit(p_property, p_actor, v_today, 'short_stay.task_assigned',
        'housekeeping_task', v_task.id,
        CASE WHEN v_person IS NULL THEN 'Housekeeping task given to nobody'
            ELSE 'Housekeeping task given to a person' END,
        'short_stays.desk',
        jsonb_build_object('assigned_to', v_task.assigned_to),
        jsonb_build_object('assigned_to', v_person), p_correlation);
    RETURN app.short_stay_housekeeping(p_property, v_task.task_on, p_actor);
END $$;
"""

ACTIONS = ("app.assign_housekeeping_task(uuid, uuid, jsonb, uuid, uuid)",)


def upgrade() -> None:
    op.execute(TABLE)
    op.execute(FUNCTIONS)
    for signature in ACTIONS:
        op.execute(f"REVOKE ALL ON FUNCTION {signature} FROM PUBLIC")
        op.execute(f"GRANT EXECUTE ON FUNCTION {signature} TO prm_runtime")


def downgrade() -> None:
    raise RuntimeError("forward-only migration")
