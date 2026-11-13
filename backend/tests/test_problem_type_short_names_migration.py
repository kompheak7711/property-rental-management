"""Migration 20270725_411 (owner 14/11/2026): two short Problem type names, and Furniture/appliance
next to Safety so the two longest names share one row of tiles on the New Problem report form."""

from __future__ import annotations

from pathlib import Path

import psycopg
import pytest
from alembic.config import Config
from alembic.script import ScriptDirectory

from test_lease_api_migration import migrated_database_url as migrated_database_url

REVISION = "20270725_411"
PREVIOUS = "20270724_401"


def test_migration_411_follows_401_is_the_head_and_is_forward_only() -> None:
    config = Config(str(Path(__file__).parents[1] / "alembic.ini"))
    scripts = ScriptDirectory.from_config(config)
    revision = scripts.get_revision(REVISION)
    assert revision is not None and revision.down_revision == PREVIOUS
    assert scripts.get_heads() == [REVISION]
    with pytest.raises(NotImplementedError, match="forward-only"):
        revision.module.downgrade()


def test_the_types_have_the_short_names_and_the_new_order(migrated_database_url: str) -> None:
    with psycopg.connect(migrated_database_url) as connection:
        rows = connection.execute(
            "SELECT sort_order, code, name_en, name_kh, always_urgent "
            "FROM app.problem_types ORDER BY sort_order"
        ).fetchall()
    assert [(order, code, name) for order, code, name, _, _ in rows] == [
        (1, "WATER", "Water"),
        (2, "ELECTRICITY", "Electricity"),
        (3, "AIR_CONDITIONER", "Air conditioner"),
        (4, "DOOR_LOCK", "Door/Lock"),
        (5, "FURNITURE", "Furniture/appliance"),
        (6, "SAFETY", "Safety (fire, gas, smoke)"),
        (7, "WINDOW", "Window"),
        (8, "INTERNET", "Internet"),
        (9, "PESTS", "Pests"),
        (10, "CLEANING", "Cleaning"),
        (11, "NOISE", "Noise"),
        (12, "OTHER", "Other"),
    ]
    # The Khmer names and Safety's "always urgent" stay as they were.
    khmer = {code: name_kh for _, code, _, name_kh, _ in rows}
    assert khmer["DOOR_LOCK"] == "ទ្វារ និងសោ"
    assert khmer["FURNITURE"] == "គ្រឿងសង្ហារឹម ឬឧបករណ៍"
    assert [code for _, code, _, _, urgent in rows if urgent] == ["SAFETY"]
