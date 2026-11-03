"""General Ledger close API (phase 6 step 4 part 1).

The route checks the main right for the Property and the browser mutation checks; the checked
database function decides the rest (nobody approves their own adjusting entry; Close works only
when every check is green; months close in order).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any
from uuid import UUID, uuid4

from fastapi.testclient import TestClient

from property_rental.app import create_app
from property_rental.identity import AuthenticatedActor, CapabilityGrant
from property_rental.ledger_close_api import ACTIONS
from property_rental.ledger_money_api import (
    LedgerMoneyConflict,
    LedgerMoneyNotFound,
    LedgerMoneyRefused,
)

HEADERS = {
    "Origin": "https://localhost",
    "Cookie": "__Host-prm_csrf=ledger-token",
    "X-CSRF-Token": "ledger-token",
}
ENTRY = {
    "entry_date": "2027-01-31",
    "reason": "Repair not billed yet",
    "lines": [
        {"account_code": "6050", "debit_cents": 2500},
        {"account_code": "2010", "credit_cents": 2500, "memo": "Dara Plumbing"},
    ],
}


@dataclass
class InMemoryClose:
    property_id: UUID = field(default_factory=uuid4)
    writes: list[tuple[str, dict[str, Any], UUID | None]] = field(default_factory=list)
    refuse: Exception | None = None
    answer: Any = None

    def write(
        self,
        action: str,
        property_id: UUID,
        actor_id: str,
        values: dict[str, Any],
        target_id: UUID | None = None,
    ) -> Any:
        del actor_id
        if property_id != self.property_id:
            raise LedgerMoneyNotFound
        if self.refuse is not None:
            raise self.refuse
        assert set(values) <= set(ACTIONS[action].fields)
        self.writes.append((action, values, target_id))
        return self.answer if self.answer is not None else uuid4()

    def rows(
        self, view: str, property_id: UUID, target_id: UUID | None = None
    ) -> tuple[dict[str, Any], ...]:
        assert property_id == self.property_id
        return ({"view": view, "target": None if target_id is None else str(target_id)},)


def client(flow: InMemoryClose, *capabilities: str) -> TestClient:
    who = AuthenticatedActor(
        actor_id=str(uuid4()),
        capability_grants=frozenset(
            CapabilityGrant(capability=name, property_ids=frozenset({str(flow.property_id)}))
            for name in capabilities
        ),
    )
    return TestClient(create_app(actor_resolver=lambda _: who, ledger_close_flow=flow))


def test_each_close_change_needs_its_right_and_the_browser_checks() -> None:
    flow = InMemoryClose()
    base = f"/api/v1/properties/{flow.property_id}/ledger"
    target = uuid4()
    for method, path, right, body in (
        ("post", "/adjusting-entries", "ledger.adjustments.prepare", ENTRY),
        (
            "post",
            f"/adjusting-entries/{target}/decision",
            "ledger.adjustments.approve",
            {"approve": False, "note": "Already billed"},
        ),
        (
            "post",
            f"/adjusting-entries/{target}/void",
            "ledger.adjustments.prepare",
            {"reason": "x"},
        ),
        ("post", "/opening-balances", "ledger.opening_balances", {"first_year": 2027}),
        (
            "put",
            "/opening-balances/lines",
            "ledger.opening_balances",
            {"lines": [{"account_code": "1010", "debit_cents": 100}]},
        ),
        ("post", "/opening-balances/post", "ledger.opening_balances", {}),
        ("post", f"/periods/{target}/close", "ledger.close", {}),
        ("post", f"/fiscal-years/{target}/close", "ledger.close", {}),
    ):
        reader = client(flow, "ledger.read")
        assert reader.request(method, base + path, json=body, headers=HEADERS).status_code == 403
        holder = client(flow, right)
        assert holder.request(method, base + path, json=body).status_code == 403
        answer = holder.request(method, base + path, json=body, headers=HEADERS)
        assert answer.status_code in (200, 201), (path, answer.text)
    assert [write[0] for write in flow.writes] == [
        "prepare_adjustment",
        "decide_adjustment",
        "void_adjustment",
        "begin_ledger",
        "set_opening_lines",
        "post_opening",
        "close_month",
        "close_year",
    ]
    # Lines reach the database by account code, one side each.
    assert [
        {key: value for key, value in line.items() if value is not None}
        for line in flow.writes[0][1]["lines"]
    ] == [
        {"account": "6050", "debit_cents": 2500},
        {"account": "2010", "memo": "Dara Plumbing", "credit_cents": 2500},
    ]
    assert flow.writes[1][2] == target
    # An approver may void an entry too.
    voided = client(flow, "ledger.adjustments.approve").post(
        f"{base}/adjusting-entries/{target}/void", json={"reason": "Typed twice"}, headers=HEADERS
    )
    assert voided.status_code == 200


def test_bodies_are_strict_and_a_red_close_answers_with_its_checks() -> None:
    flow = InMemoryClose()
    base = f"/api/v1/properties/{flow.property_id}/ledger"
    owner = client(flow, "ledger.adjustments.prepare", "ledger.opening_balances", "ledger.close")
    one_line = {**ENTRY, "lines": ENTRY["lines"][:1]}
    both_sides = {
        **ENTRY,
        "lines": [{"account_code": "6050", "debit_cents": 1, "credit_cents": 1}] * 2,
    }
    for bad in (
        {**ENTRY, "extra": 1},
        {**ENTRY, "reason": ""},
        {**ENTRY, "entry_date": "31/01/2027"},
        one_line,
        both_sides,
        {**ENTRY, "lines": [{"account_code": "60", "debit_cents": 1}] * 2},
    ):
        assert owner.post(f"{base}/adjusting-entries", json=bad, headers=HEADERS).status_code == 422
    assert (
        owner.post(
            f"{base}/opening-balances", json={"first_year": 1990}, headers=HEADERS
        ).status_code
        == 422
    )
    flow.answer = {"closed": False, "checks": {"cash_counted": False, "books_check": True}}
    red = owner.post(f"{base}/periods/{uuid4()}/close", json={}, headers=HEADERS)
    assert red.status_code == 200 and red.json()["data"]["closed"] is False
    flow.answer = None
    for error, code in (
        (LedgerMoneyRefused("Nobody approves their own adjusting entry"), 403),
        (LedgerMoneyConflict("Months close in order: close the oldest open month first"), 409),
        (LedgerMoneyNotFound(), 404),
    ):
        flow.refuse = error
        answer = owner.post(f"{base}/periods/{uuid4()}/close", json={}, headers=HEADERS)
        assert answer.status_code == code
        if code != 404:
            assert answer.json()["error"]["message"] == str(error)
    flow.refuse = None


def test_reads_need_the_ledger_right_and_are_not_cached() -> None:
    flow = InMemoryClose()
    base = f"/api/v1/properties/{flow.property_id}/ledger"
    period = uuid4()
    reader = client(flow, "ledger.read")
    for path, view in (
        ("/adjusting-entries", "adjusting-entries"),
        ("/opening-balances", "opening-balances"),
        ("/books-check", "books-check"),
        ("/periods", "periods"),
        (f"/periods/{period}/close-checks", "close-checks"),
    ):
        answer = reader.get(base + path)
        assert answer.status_code == 200 and answer.headers["Cache-Control"] == "private, no-store"
        assert answer.json()["data"][0]["view"] == view
        assert client(flow, "expenses.request").get(base + path).status_code == 403
    assert reader.get(f"{base}/periods/{period}/close-checks").json()["data"][0]["target"] == str(
        period
    )
