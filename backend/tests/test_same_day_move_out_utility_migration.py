"""A hand-back on the Lease's first day needs no final Utility Invoice (migration 20270809_432).

Full test of 17/11/2026 (finding 2, DL-247): same day, no Utility charge. The Final Settlement
preview and Home's "Refund due by" to-do treat such a Lease like a Unit with no Meter.
"""

from __future__ import annotations

import psycopg
import pytest
from alembic.config import Config
from alembic.script import ScriptDirectory

from test_move_in_migration import migrated_database_url as migrated_database_url

REVISION = "20270809_432"
SOURCE = "SELECT pg_get_functiondef(CAST(%s AS regprocedure))"


def test_migration_432_is_the_head_and_is_forward_only() -> None:
    scripts = ScriptDirectory.from_config(Config("alembic.ini"))
    migration = scripts.get_revision(REVISION)
    assert migration is not None and migration.down_revision == "20270808_431"
    assert scripts.get_heads() == ["20270822_447"]  # parking step 3b 440 follows 439
    with pytest.raises(RuntimeError, match="forward-only"):
        migration.module.downgrade()


def test_the_preview_and_home_skip_the_final_utility_invoice_for_a_same_day_hand_back(
    migrated_database_url: str,
) -> None:
    with psycopg.connect(migrated_database_url) as connection:
        preview = connection.execute(
            SOURCE, ("app.final_settlement_preview(uuid,uuid,uuid,text[])",)
        ).fetchone()
        home = connection.execute(SOURCE, ("app.home_page(uuid,uuid,uuid[],text[])",)).fetchone()
    assert preview is not None and home is not None
    # The same-day rule comes first, before the no-Meter rule of migration 238.
    assert "IF v_move_out.actual_move_out_date<=v_lease.start_date THEN" in preview[0]
    assert preview[0].index("DL-247") < preview[0].index("V1-058 R7b-7")
    assert "AND move_out.actual_move_out_date<=lease.start_date)" in home[0]
