"""Buildings step 5: the "Takes short stays" switch of a building is kept (migration 20270811_434).

A short-stay booking or quote cannot be made for, or moved to, a Unit whose building does not
take short stays; a booking made before stays. The Calendar leaves out such Units unless they
still have a booking on the shown nights (DL-250).
"""

from __future__ import annotations

import uuid
from collections.abc import Iterator
from pathlib import Path

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

REVISION = "20270811_434"
CREATE = "SELECT * FROM app.create_building(%s, %s, %s, %s, %s, %s, %s, %s, %s)"
MOVE = "SELECT app.move_unit_to_building(%s, %s, %s, %s, %s)"
UPDATE = "SELECT * FROM app.update_building(%s, %s, %s, %s, %s, %s, %s, %s, %s)"
OPEN = "SELECT app.short_stay_calendar_open(%s, %s, 30, %s)"
ALL = "SELECT app.short_stay_calendar(%s, %s, 30, %s)"


def _config() -> Config:
    return Config(str(Path(__file__).parents[1] / "alembic.ini"))


@pytest.fixture(scope="module")
def guard_database(migrated_database_url: str) -> Iterator[BookingDatabase]:
    assert migrated_database_url
    with short_stay_database("prm_building_short_stays") as database:
        yield database


def switch_first_building(db: BookingDatabase, on: bool) -> None:
    with psycopg.connect(db.owner_url) as owner:
        first = owner.execute(
            "SELECT id, name_en, name_km, address_text, description, sort_order, version, "
            "(SELECT created_by FROM app.units WHERE id = %s) FROM app.buildings "
            "WHERE property_id = %s ORDER BY sort_order, created_at, id LIMIT 1",
            (db.studio, db.property_id),
        ).fetchone()
        assert first is not None
        identity, english, khmer, address, description, order, version, actor = first
        owner.execute(
            UPDATE, (identity, english, khmer, address, description, on, order, version, actor)
        )
        owner.commit()


def numbers(db: BookingDatabase, sql: str) -> set[str]:
    calendar = run(db.runtime_url, sql, db.property_id, db.today, db.staff)
    return {unit["unit_number"] for unit in calendar["units"]}


def test_migration_is_the_single_head_and_forward_only() -> None:
    scripts = ScriptDirectory.from_config(_config())
    assert scripts.get_heads() == ["20270819_444"]  # parking step 3b 440 follows 439
    assert scripts.get_revision("20270812_437").down_revision == REVISION
    revision = scripts.get_revision(REVISION)
    assert revision is not None
    with pytest.raises(RuntimeError, match="forward-only"):
        revision.module.downgrade()


def test_papers_name_the_building_only_with_two_buildings(
    guard_database: BookingDatabase,
) -> None:
    db = guard_database
    with psycopg.connect(db.owner_url) as owner:
        heading = "SELECT app.unit_building_heading(%s)"
        one = owner.execute(heading, (db.studio,)).fetchone()
        assert one == (None,)
        actor = owner.execute(
            "SELECT created_by FROM app.units WHERE id = %s", (db.studio,)
        ).fetchone()
        assert actor is not None
        owner.execute(
            CREATE,
            (uuid.uuid4(), db.property_id, "Annex", None, "Street 9", None, False, 9, actor[0]),
        )
        two = owner.execute(heading, (db.studio,)).fetchone()
        assert two is not None and two[0]["name"] != "Annex"
        assert set(two[0]) == {"building_id", "name", "name_km", "address"}
        owner.rollback()
        wrapper = owner.execute(
            "SELECT pg_get_functiondef("
            "'app.aba_invoice_for_outbox(uuid, uuid, uuid)'::regprocedure)"
        ).fetchone()
        assert wrapper is not None and "unit_building_heading" in str(wrapper[0])
    with psycopg.connect(db.runtime_url) as runtime:
        privileges = runtime.execute(
            "SELECT has_function_privilege('app.aba_invoice_for_outbox(uuid, uuid, uuid)', "
            "'EXECUTE'), has_function_privilege("
            "'app.aba_invoice_for_outbox_main(uuid, uuid, uuid)', 'EXECUTE'), "
            "has_function_privilege('app.unit_building_heading(uuid)', 'EXECUTE')"
        ).fetchone()
        assert privileges == (True, False, False)


def test_a_building_without_short_stays_refuses_bookings_and_leaves_the_calendar(
    guard_database: BookingDatabase,
) -> None:
    db = guard_database
    run(db.runtime_url, BOOK, db.property_id, booking(db, db.studio, 3, 2), db.staff)
    with psycopg.connect(db.owner_url) as owner:
        actor = owner.execute(
            "SELECT created_by FROM app.units WHERE id = %s", (db.studio,)
        ).fetchone()
        assert actor is not None
        added = owner.execute(
            CREATE,
            (uuid.uuid4(), db.property_id, "Building Two", None, None, None, False, 5, actor[0]),
        ).fetchone()
        assert added is not None
        owner.execute(MOVE, (db.one_bedroom, added[0], 1, "Second building", actor[0]))
        owner.commit()
    message = refused(
        db.runtime_url,
        "55000",
        BOOK,
        db.property_id,
        booking(db, db.one_bedroom, 3, 2),
        db.staff,
    )
    assert "does not take short stays" in message
    assert "U503" not in numbers(db, OPEN)
    assert {"U501", "U505"} <= numbers(db, OPEN)
    # The Calendar of before still lists every Unit.
    assert "U503" in numbers(db, ALL)

    # Building 1 turns its switch off: the Unit with a booking stays on the Calendar and the
    # booking stays; a new booking and a booking moved there are refused.
    switch_first_building(db, False)
    shown = numbers(db, OPEN)
    assert "U501" in shown
    assert "U505" not in shown
    refused(
        db.runtime_url,
        "55000",
        BOOK,
        db.property_id,
        booking(db, db.two_bedroom, 10, 2),
        db.staff,
    )
    with psycopg.connect(db.owner_url) as owner:
        with pytest.raises(psycopg.Error) as caught:
            owner.execute(
                "UPDATE app.short_stay_bookings SET unit_id = %s WHERE unit_id = %s",
                (db.two_bedroom, db.studio),
            )
        assert caught.value.sqlstate == "55000"
        owner.rollback()
    switch_first_building(db, True)


def test_runtime_reads_the_open_calendar_only_through_the_function(
    guard_database: BookingDatabase,
) -> None:
    with psycopg.connect(guard_database.runtime_url) as runtime:
        privileges = runtime.execute(
            "SELECT has_function_privilege('app.short_stay_calendar_open("
            "uuid, date, integer, uuid)', 'EXECUTE'), "
            "has_function_privilege('app.guard_short_stay_building()', 'EXECUTE')"
        ).fetchone()
        assert privileges == (True, False)
