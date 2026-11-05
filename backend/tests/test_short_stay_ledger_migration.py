"""Daily and weekly rent: short-stay money in the General Ledger (migration 319).

A stay's Invoice is rent (4010) on the booking's Unit, a damage Invoice is damage recovered
(4070), a cash deposit goes through the USD cash account and 2100, and a card hold kept for
damage comes to the bank. The books check keeps 2100 equal to the deposits held.
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
    run,
    short_stay_database,
)
from test_short_stay_check_in_migration import (
    BILL,
    CHECK_IN,
    CHECK_OUT,
    DECIDE,
    DEPOSIT,
    END_DEPOSIT,
    ROOM,
    TICKS,
    guest_with_id,
    pay,
    read,
)

REVISION = "20270609_319"
APPROVE = json.dumps({"approve": True, "note": "Photo on file"})


@pytest.fixture(scope="module")
def stay_database(migrated_database_url: str) -> Iterator[BookingDatabase]:
    assert migrated_database_url
    with short_stay_database("prm_short_stay_ledger") as database:
        yield database


def a_stay_with_damage(
    db: BookingDatabase, unit: uuid.UUID, start: int, deposit: dict[str, str], damage: int
) -> tuple[str, dict[str, Any]]:
    """A guest who paid, stayed 2 nights, left damage the Manager approved; the deposit ended."""
    guest = guest_with_id(db)
    made = run(
        db.runtime_url,
        BOOK,
        db.property_id,
        booking(db, unit, start, 2, customer_id=str(guest)),
        db.staff,
    )
    run(db.runtime_url, DEPOSIT, db.property_id, made, json.dumps(deposit), db.staff)
    billed = run(db.runtime_url, BILL, db.property_id, made, read(db, made)["version"], db.staff)
    pay(db, guest, billed["invoice"]["invoice_id"], billed["invoice"]["due_usd_cents"])
    inside = run(
        db.runtime_url, CHECK_IN, db.property_id, made, TICKS, read(db, made)["version"], db.staff
    )
    run(db.runtime_url, CHECK_OUT, db.property_id, made, inside["version"], db.staff)
    checked = run(
        db.runtime_url,
        ROOM,
        db.property_id,
        made,
        json.dumps({"damage": "Broken lamp", "damage_usd_cents": damage}),
        db.staff,
    )
    run(
        db.runtime_url,
        DECIDE,
        db.property_id,
        checked["damages"][0]["damage_id"],
        APPROVE,
        db.manager,
    )
    return made, run(db.runtime_url, END_DEPOSIT, db.property_id, made, db.staff)


def lines(connection: psycopg.Connection[Any], key: str) -> list[tuple[str, int, int]]:
    rows = connection.execute(
        "SELECT account.code, line.debit_cents, line.credit_cents "
        "FROM app.gl_journal_entries AS entry "
        "JOIN app.gl_journal_lines AS line ON line.entry_id = entry.id "
        "JOIN app.gl_accounts AS account ON account.id = line.account_id "
        "WHERE entry.posting_key = %s ORDER BY account.code, line.debit_cents",
        (key,),
    ).fetchall()
    return [(str(row[0]), int(row[1]), int(row[2])) for row in rows]


def test_migration_319_follows_step_5c() -> None:
    config = Config(str(Path(__file__).parents[1] / "alembic.ini"))
    scripts = ScriptDirectory.from_config(config)
    revision = scripts.get_revision(REVISION)
    assert revision is not None and revision.down_revision == "20270608_318"
    with pytest.raises(RuntimeError, match="forward-only"):
        revision.module.downgrade()


def test_short_stay_money_posts_to_rent_damage_cash_and_bank(
    stay_database: BookingDatabase,
) -> None:
    db = stay_database
    # A $50 cash deposit keeps $50 of $80 damage; the rest ($30) is a damage Invoice.
    cash_stay, cash_end = a_stay_with_damage(db, db.studio, 0, {"kind": "CASH"}, 8000)
    assert cash_end["deposit"]["kept_usd_cents"] == 5000
    stay = read(db, cash_stay)
    # A card hold keeps $20 of damage.
    card_stay, card_end = a_stay_with_damage(
        db, db.one_bedroom, 0, {"kind": "CARD_HOLD", "hold_reference": "HOLD-7781"}, 2000
    )
    assert card_end["deposit"]["kept_usd_cents"] == 2000
    # A cash deposit still held.
    held = run(
        db.runtime_url,
        BOOK,
        db.property_id,
        booking(db, db.two_bedroom, 3, 2, customer_id=str(guest_with_id(db))),
        db.staff,
    )
    run(db.runtime_url, DEPOSIT, db.property_id, held, json.dumps({"kind": "CASH"}), db.staff)

    with psycopg.connect(db.owner_url) as connection:
        connection.execute(
            "SELECT app.gl_start_ledger(%s, %s::smallint, %s)",
            (db.property_id, db.today.year, db.manager),
        )
        posted = connection.execute(
            "SELECT posted, needs_check FROM app.gl_post_app_records(%s, %s, %s, 5000)",
            (db.property_id, db.manager, db.today),
        ).fetchone()
        assert posted is not None and posted[0] > 0
        connection.execute("SET CONSTRAINTS app.gl_journal_entries_balanced IMMEDIATE")
        problems = connection.execute(
            "SELECT posting_key, problem FROM app.gl_posting_problems "
            "WHERE source_type IN ('INVOICE', 'SHORT_STAY_DEPOSIT')"
        ).fetchall()
        assert problems == []

        # The stay's Invoice is rent on the booking's Unit.
        invoice = stay["invoice"]
        rent = connection.execute(
            "SELECT account.code, line.credit_cents, line.unit_id "
            "FROM app.gl_journal_entries AS entry "
            "JOIN app.gl_journal_lines AS line ON line.entry_id = entry.id "
            "JOIN app.gl_accounts AS account ON account.id = line.account_id "
            "WHERE entry.posting_key = %s AND line.credit_cents > 0",
            (f"invoice:{invoice['invoice_id']}:issue",),
        ).fetchall()
        assert {row[0] for row in rent} == {"4010"}
        assert sum(int(row[1]) for row in rent) == invoice["total_usd_cents"]
        assert {row[2] for row in rent} == {db.studio}
        # The rest of the damage is an Invoice to 4070.
        damage_invoice = connection.execute(
            "SELECT damage.invoice_id FROM app.short_stay_damages AS damage "
            "WHERE damage.booking_id = %s",
            (cash_stay,),
        ).fetchone()
        assert damage_invoice is not None
        assert lines(connection, f"invoice:{damage_invoice[0]}:issue") == [
            ("1100", 3000, 0),
            ("4070", 0, 3000),
        ]

        def deposit_key(made: str, side: str) -> str:
            found = connection.execute(
                "SELECT id FROM app.short_stay_deposits WHERE booking_id = %s", (made,)
            ).fetchone()
            assert found is not None
            return f"short_stay_deposit:{found[0]}:{side}"

        # The cash deposit: in through the cash drawer, kept for damage at the end.
        assert lines(connection, deposit_key(cash_stay, "taken")) == [
            ("1010", 5000, 0),
            ("2100", 0, 5000),
        ]
        assert lines(connection, deposit_key(cash_stay, "ended")) == [
            ("2100", 5000, 0),
            ("4070", 0, 5000),
        ]
        # The card hold: no money until damage keeps it, then the bank.
        assert lines(connection, deposit_key(card_stay, "taken")) == []
        assert lines(connection, deposit_key(card_stay, "card_kept")) == [
            ("1020", 2000, 0),
            ("4070", 0, 2000),
        ]
        assert lines(connection, deposit_key(held, "taken")) == [
            ("1010", 5000, 0),
            ("2100", 0, 5000),
        ]
        assert lines(connection, deposit_key(held, "ended")) == []
        # 2100 in the books equals the cash deposits held.
        check = connection.execute(
            "SELECT in_books, in_list, ok FROM app.gl_books_check(%s) "
            "WHERE check_code = 'SECURITY_DEPOSITS'",
            (db.property_id,),
        ).fetchone()
        assert check == (5000, 5000, True)
        connection.rollback()
