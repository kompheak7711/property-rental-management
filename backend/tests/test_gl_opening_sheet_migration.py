"""Opening balances read for the ledger screen on the real database (phase 6 step 6, lopen).

Before the books start, the read answers the ledger's first year and the accounts the Owner may
type; once started, the typed lines with their notes and the control lines the app works out;
once posted, the entry's lines, who posted it and when. Read with the runtime login's rights.
"""

from __future__ import annotations

from collections.abc import Iterator
from uuid import uuid4

import psycopg
import pytest
from psycopg.types.json import Jsonb

from property_rental.ledger_money_api import LedgerMoneyNotFound
from property_rental.ledger_opening_api import (
    ACCOUNTS,
    FIRST_YEAR,
    NEEDS_CHECK,
    OPENING,
    POSTED,
    TYPED,
    WORKED_OUT,
    PostgresLedgerOpening,
)
from test_gl_close_migration import capital, worked_out_net
from test_gl_money_records_migration import Books, Borrowed
from test_move_in_migration import migrated_database_url as migrated_database_url
from test_move_in_migration import runtime_database_url
from test_unit_migration import insert_actor, insert_property


@pytest.fixture
def fresh(migrated_database_url: str, monkeypatch: pytest.MonkeyPatch) -> Iterator[Books]:
    """A new Property with no ledger yet, lent to the read inside a savepoint."""
    with psycopg.connect(migrated_database_url) as connection:
        property_id = insert_property(connection, insert_actor(connection))
        books = Books(connection, property_id, start=False)
        monkeypatch.setattr(psycopg, "connect", lambda *_a, **_k: Borrowed(connection))
        yield books
        connection.rollback()


def test_the_opening_sheet_follows_the_books_from_start_to_posted(fresh: Books) -> None:
    flow = PostgresLedgerOpening("postgresql://unused")
    before = flow.sheet(fresh.property_id)
    assert before["today"] == fresh.today.isoformat()
    assert before["first_year"] is None and before["opening"] is None
    assert before["typed"] == [] and before["worked_out"] == [] and before["posted"] == []

    # The books start next year, so no app record falls after their first day.
    year = fresh.today.year + 1
    fresh.call("gl_begin_ledger", fresh.property_id, fresh.owner, year)
    started = flow.sheet(fresh.property_id)
    assert started["first_year"] == year
    assert started["opening"]["status"] == "DRAFT"
    assert started["opening"]["start_date"] == f"{year}-01-01"
    assert started["opening"]["entry_number"] is None
    codes = {account["code"] for account in started["accounts"]}
    # Control accounts are worked out by the app; tax accounts take no postings.
    assert {"1010", "1520", "3000"} <= codes
    assert not {"1100", "2200"} & codes
    assert all(account["normal_side"] in {"DEBIT", "CREDIT"} for account in started["accounts"])

    worked = worked_out_net(fresh)
    typed = [{"account": "1010", "debit_cents": 50_000, "memo": "Office cash"}]
    typed += [
        {"account": code, "debit_cents": debit or None, "credit_cents": credit or None}
        for code, debit, credit in capital(50_000 + worked)
    ]
    fresh.call("gl_set_opening_lines", fresh.property_id, fresh.owner, Jsonb(typed))
    draft = flow.sheet(fresh.property_id)
    cash = draft["typed"][0]
    assert cash["account_code"] == "1010" and cash["account_name"]
    assert cash["debit_cents"] == 50_000 and cash["credit_cents"] == 0
    assert cash["memo"] == "Office cash"
    assert all(type(line["debit_cents"]) is int for line in draft["typed"])
    assert all("memo" not in line for line in draft["worked_out"])
    net = sum(line["debit_cents"] - line["credit_cents"] for line in draft["worked_out"])
    assert net == worked

    fresh.call("gl_post_opening_balances", fresh.property_id, fresh.owner)
    posted = flow.sheet(fresh.property_id)
    assert posted["opening"]["status"] == "POSTED"
    assert posted["opening"]["entry_number"]
    assert posted["opening"]["posted_at"] is not None
    assert posted["typed"] == [] and posted["worked_out"] == []
    assert sum(line["debit_cents"] for line in posted["posted"]) == sum(
        line["credit_cents"] for line in posted["posted"]
    )
    assert any(
        line["account_code"] == "1010" and line["debit_cents"] == 50_000
        for line in posted["posted"]
    )
    assert posted["needs_check"] == 0


def test_the_runtime_login_can_run_the_opening_read(migrated_database_url: str) -> None:
    assert migrated_database_url
    with pytest.raises(LedgerMoneyNotFound):
        PostgresLedgerOpening(runtime_database_url()).sheet(uuid4())
    with psycopg.connect(runtime_database_url()) as connection:
        key = {"prop": uuid4(), "opening": uuid4(), "entry": uuid4()}
        for query in (FIRST_YEAR, OPENING, ACCOUNTS, TYPED, WORKED_OUT, POSTED, NEEDS_CHECK):
            connection.execute(query, key)
