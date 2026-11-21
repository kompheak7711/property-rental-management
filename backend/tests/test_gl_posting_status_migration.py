"""When the books were last updated (migration 20270808_431; full test 17/11/2026, finding 1).

The billing worker records each ledger posting pass: one row per Property, replaced by the next
pass. The runtime login reads it for Needs check and Home; only the money login records it.
"""

from __future__ import annotations

import psycopg
import pytest
from alembic.config import Config
from alembic.script import ScriptDirectory

from test_move_in_migration import migrated_database_url as migrated_database_url
from test_problem_reports_migration import ProblemDatabase, refused
from test_problem_reports_migration import problem_database as problem_database

REVISION = "20270808_431"
RECORD = "SELECT app.gl_record_posting_pass(%s, %s, %s, %s)"
STATUS = "SELECT posted, needs_check FROM app.gl_posting_status WHERE property_id = %s"


def test_migration_431_follows_the_head_and_is_forward_only() -> None:
    scripts = ScriptDirectory.from_config(Config("alembic.ini"))
    migration = scripts.get_revision(REVISION)
    assert migration is not None and migration.down_revision == "20270807_424"
    # The same-day move-out (DL-247) follows it.
    assert scripts.get_heads() == ["20270820_445"]
    with pytest.raises(RuntimeError, match="forward-only"):
        migration.module.downgrade()


def test_each_pass_replaces_the_one_status_row_and_only_the_money_login_records_it(
    problem_database: ProblemDatabase,
) -> None:
    db = problem_database
    with psycopg.connect(db.financial_url) as connection:
        first = connection.execute(RECORD, (db.property_id, db.owner, 107, 0)).fetchone()
        second = connection.execute(RECORD, (db.property_id, db.owner, 0, 2)).fetchone()
    assert first is not None and second is not None and second[0] >= first[0]
    with psycopg.connect(db.runtime_url) as connection:
        rows = connection.execute(STATUS, (db.property_id,)).fetchall()
    assert [tuple(row) for row in rows] == [(0, 2)]
    # The runtime login reads the status but cannot record a pass.
    refused(db.runtime_url, "42501", RECORD, db.property_id, db.owner, 1, 0)
    # A negative count is refused.
    refused(db.financial_url, "22023", RECORD, db.property_id, db.owner, -1, 0)
