"""DL-236 (owner 14 Nov 2026): a Housekeeping task is given to one person (migration 410).

The front desk gives a task still to do to a person who may tick housekeeping tasks, to another,
or to nobody; the day's list names the person given each task and the person who finished it,
and lists the people a task may be given to. Anyone with the housekeeping right still finishes
any task.
"""

from __future__ import annotations

import json
import uuid
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import psycopg
import pytest
from alembic.config import Config
from alembic.script import ScriptDirectory

from test_move_in_migration import migrated_database_url as migrated_database_url
from test_short_stay_booking_migration import (
    BOOK,
    BookingDatabase,
    booking,
    refused,
    run,
    short_stay_database,
)

REVISION = "20270725_410"
LIST = "SELECT app.short_stay_housekeeping(%s, %s, %s)"
FINISH = "SELECT app.finish_housekeeping_task(%s, %s, %s::jsonb, %s, NULL)"
ASSIGN = "SELECT app.assign_housekeeping_task(%s, %s, %s::jsonb, %s, NULL)"


@pytest.fixture(scope="module")
def stay_database(migrated_database_url: str) -> Iterator[BookingDatabase]:
    assert migrated_database_url
    with short_stay_database("prm_housekeeping_assign") as database:
        yield database


def name_of(db: BookingDatabase, actor: uuid.UUID) -> str:
    with psycopg.connect(db.owner_url) as connection:
        row = connection.execute(
            "SELECT display_name FROM app.user_accounts WHERE actor_id = %s", (actor,)
        ).fetchone()
    assert row is not None
    return str(row[0])


def only(found: dict[str, Any]) -> dict[str, Any]:
    tasks = found["tasks"]
    assert len(tasks) == 1
    return dict(tasks[0])


def test_migration_410_follows_the_riel_rate_join() -> None:
    config = Config(str(Path(__file__).parents[1] / "alembic.ini"))
    scripts = ScriptDirectory.from_config(config)
    revision = scripts.get_revision(REVISION)
    assert revision is not None and revision.down_revision == "20270724_401"
    with pytest.raises(RuntimeError, match="forward-only"):
        revision.module.downgrade()


def test_a_task_is_given_to_one_person_and_names_who_finished_it(
    stay_database: BookingDatabase,
) -> None:
    db = stay_database
    made = run(db.runtime_url, BOOK, db.property_id, booking(db, db.studio, 0, 3), db.staff)
    with psycopg.connect(db.owner_url) as connection:
        connection.execute(
            "INSERT INTO app.housekeeping_tasks (property_id, unit_id, booking_id, task_on, kind, "
            "created_by) VALUES (%s, %s, %s, %s, 'DAILY_CLEAN', %s)",
            (db.property_id, db.studio, made, db.today, db.staff),
        )
    day = run(db.runtime_url, LIST, db.property_id, db.today, db.staff)
    task = only(day)
    assert (task["assigned_to"], task["assigned_name"], task["done_by_name"]) == (None, None, None)
    # The people a task may be given to: the active accounts with the housekeeping right.
    cleaners = {person["actor_id"]: person["name"] for person in day["cleaners"]}
    assert cleaners[str(db.staff)] == name_of(db, db.staff)
    assert cleaners[str(db.manager)] == name_of(db, db.manager)

    given = only(
        run(
            db.runtime_url,
            ASSIGN,
            db.property_id,
            task["task_id"],
            json.dumps({"actor_id": str(db.staff)}),
            db.manager,
        )
    )
    assert (given["assigned_to"], given["assigned_name"]) == (
        str(db.staff),
        name_of(db, db.staff),
    )
    assert given["version"] == task["version"] + 1
    assert given["mine"] is False  # the Manager gave it; it is the staff member's
    assert only(run(db.runtime_url, LIST, db.property_id, db.today, db.staff))["mine"] is True
    # Someone who may not do housekeeping here, and an unknown answer, are refused.
    assert "may not do housekeeping" in refused(
        db.runtime_url,
        "22023",
        ASSIGN,
        db.property_id,
        task["task_id"],
        json.dumps({"actor_id": str(uuid.uuid4())}),
        db.manager,
    )
    refused(
        db.runtime_url,
        "22023",
        ASSIGN,
        db.property_id,
        task["task_id"],
        json.dumps({"actor_id": str(db.staff), "note": "x"}),
        db.manager,
    )
    refused(
        db.runtime_url,
        "22023",
        ASSIGN,
        db.property_id,
        task["task_id"],
        json.dumps({"actor_id": "not a person"}),
        db.manager,
    )
    # To another person, then to nobody; the History keeps each change.
    moved = only(
        run(
            db.runtime_url,
            ASSIGN,
            db.property_id,
            task["task_id"],
            json.dumps({"actor_id": str(db.manager)}),
            db.staff,
        )
    )
    assert moved["assigned_to"] == str(db.manager)
    nobody = only(
        run(
            db.runtime_url,
            ASSIGN,
            db.property_id,
            task["task_id"],
            json.dumps({"actor_id": None}),
            db.staff,
        )
    )
    assert (nobody["assigned_to"], nobody["assigned_name"]) == (None, None)
    with psycopg.connect(db.owner_url) as connection:
        changes = connection.execute(
            "SELECT previous_state ->> 'assigned_to', resulting_state ->> 'assigned_to' "
            "FROM app.audit_events WHERE action = 'short_stay.task_assigned' "
            "AND entity_id = %s ORDER BY occurred_at",
            (task["task_id"],),
        ).fetchall()
    assert changes == [
        (None, str(db.staff)),
        (str(db.staff), str(db.manager)),
        (str(db.manager), None),
    ]

    # Anyone with the housekeeping right finishes it; the list names who did.
    run(
        db.runtime_url,
        ASSIGN,
        db.property_id,
        task["task_id"],
        json.dumps({"actor_id": str(db.manager)}),
        db.staff,
    )
    done = only(run(db.runtime_url, FINISH, db.property_id, task["task_id"], "{}", db.staff))
    assert (done["status"], done["done_by_name"], done["assigned_name"]) == (
        "DONE",
        name_of(db, db.staff),
        name_of(db, db.manager),
    )
    # A finished task is not given to anyone any more.
    assert "already done" in refused(
        db.runtime_url,
        "55000",
        ASSIGN,
        db.property_id,
        task["task_id"],
        json.dumps({"actor_id": str(db.staff)}),
        db.manager,
    )
