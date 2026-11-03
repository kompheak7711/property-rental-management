"""General Ledger close API (phase 6 step 4, part 1).

Owner decisions: the round 22 screens of DESIGN.md (Adjusting entries, Opening balances,
Month-end close, Year-end close), gap G2 (the Books check) and the phase 6 plan L3.

Every change goes through one checked database function (migration `20270417_267`), which checks
the actor's right for the Property again. The route checks the main right first.

Reads (`ledger.read`, `private, no-store`): adjusting entries, the opening balances with the
entry they would post, the Books check, the months, and one month's close checks.

Changes (browser mutation checks): prepare, approve or refuse, and void an adjusting entry;
start the ledger, type the opening balances and post them; close a month; close a year. A month
whose checks are not all green answers `closed: false` with the checks, and the try is kept.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Annotated, Any, Protocol
from uuid import UUID, uuid4

import psycopg
from fastapi import APIRouter, HTTPException, Request, Response, status
from psycopg.types.json import Jsonb
from pydantic import Field, model_validator

from property_rental.browser_security import require_browser_mutation
from property_rental.identity import ActorResolver
from property_rental.ledger_money_api import (
    FLOW_ERRORS,
    Body,
    Code,
    Id,
    IsoDate,
    LedgerMoneyNotFound,
    LedgerMoneyUnavailable,
    Note,
    Words,
    _holds,
    _http,
    _json,
    _refusal,
    _require,
)
from property_rental.settings import Settings

LEDGER_READ = "ledger.read"
PREPARE = "ledger.adjustments.prepare"
APPROVE = "ledger.adjustments.approve"
OPENING = "ledger.opening_balances"
CLOSE = "ledger.close"

LineCents = Annotated[int, Field(ge=0, le=9 * 10**15)]


class Line(Body):
    account_code: Code
    debit_cents: LineCents = 0
    credit_cents: LineCents = 0
    memo: Note | None = None

    @model_validator(mode="after")
    def one_side(self) -> Line:
        if (self.debit_cents > 0) == (self.credit_cents > 0):
            raise ValueError("A line is a debit or a credit, more than zero")
        return self

    def as_json(self) -> dict[str, Any]:
        line: dict[str, Any] = {"account": self.account_code, "memo": self.memo}
        if self.debit_cents:
            line["debit_cents"] = self.debit_cents
        if self.credit_cents:
            line["credit_cents"] = self.credit_cents
        return line


class AdjustingLine(Line):
    unit_id: Id | None = None
    customer_id: Id | None = None
    supplier_id: Id | None = None

    def as_json(self) -> dict[str, Any]:
        return {
            **super().as_json(),
            "unit_id": None if self.unit_id is None else str(self.unit_id),
            "customer_id": None if self.customer_id is None else str(self.customer_id),
            "supplier_id": None if self.supplier_id is None else str(self.supplier_id),
        }


class AdjustingEntryBody(Body):
    entry_date: IsoDate
    reason: Words
    lines: Annotated[list[AdjustingLine], Field(min_length=2, max_length=500)]
    own_note: Note | None = None


class DecisionBody(Body):
    approve: bool
    note: Note | None = None


class ReasonBody(Body):
    reason: Words


class StartBody(Body):
    first_year: Annotated[int, Field(ge=2000, le=2100)]


class OpeningLinesBody(Body):
    lines: Annotated[list[Line], Field(max_length=500)]


class NoBody(Body):
    pass


@dataclass(frozen=True, slots=True)
class Action:
    function: str
    target: str | None
    fields: tuple[str, ...]
    year_field: str | None = None


ACTIONS: dict[str, Action] = {
    "prepare_adjustment": Action(
        "gl_prepare_adjusting_entry", None, ("entry_date", "reason", "lines", "own_note")
    ),
    "decide_adjustment": Action(
        "gl_decide_adjusting_entry", "gl_adjusting_entries", ("approve", "note")
    ),
    "void_adjustment": Action("gl_void_adjusting_entry", "gl_adjusting_entries", ("reason",)),
    "begin_ledger": Action("gl_begin_ledger", None, ("first_year",), year_field="first_year"),
    "set_opening_lines": Action("gl_set_opening_lines", None, ("lines",)),
    "post_opening": Action("gl_post_opening_balances", None, ()),
    "close_month": Action("gl_close_month", "gl_periods", ()),
    "close_year": Action("gl_close_fiscal_year", "gl_fiscal_years", ()),
}


class LedgerCloseFlow(Protocol):
    def write(
        self,
        action: str,
        property_id: UUID,
        actor_id: str,
        values: dict[str, Any],
        target_id: UUID | None = None,
    ) -> Any: ...

    def rows(
        self, view: str, property_id: UUID, target_id: UUID | None = None
    ) -> tuple[dict[str, Any], ...]: ...


class UnavailableLedgerCloseFlow:
    def write(self, action: str, property_id: UUID, *_: object, **__: object) -> Any:
        del action, property_id
        raise LedgerMoneyUnavailable

    def rows(self, view: str, property_id: UUID, *_: object) -> tuple[dict[str, Any], ...]:
        del view, property_id
        raise LedgerMoneyUnavailable


VIEWS = {
    "adjusting-entries": """
        SELECT adjustment.id, adjustment.adjustment_number, adjustment.entry_date,
            adjustment.reason, adjustment.status, adjustment.prepared_by, adjustment.decided_by,
            adjustment.decided_at, adjustment.decision_note, adjustment.own_entry_note,
            adjustment.entry_id, adjustment.created_at,
            (SELECT json_agg(json_build_object('account_code', account.code,
                    'account_name', account.name_en, 'debit_cents', line.debit_cents,
                    'credit_cents', line.credit_cents, 'memo', line.memo,
                    'unit_id', line.unit_id, 'customer_id', line.customer_id,
                    'supplier_id', line.supplier_id) ORDER BY line.line_no)
             FROM app.gl_adjusting_entry_lines AS line
             JOIN app.gl_accounts AS account ON account.id = line.account_id
             WHERE line.adjusting_entry_id = adjustment.id) AS lines
        FROM app.gl_adjusting_entries AS adjustment
        WHERE adjustment.property_id = %(prop)s
        ORDER BY adjustment.entry_date DESC, adjustment.adjustment_number DESC
        LIMIT 500
    """,
    "opening-balances": """
        SELECT opening.id, opening.start_date, opening.status, opening.entry_id,
            opening.posted_by, opening.posted_at,
            (SELECT json_agg(json_build_object('account_code', preview.code,
                    'debit_cents', preview.debit_cents, 'credit_cents', preview.credit_cents,
                    'worked_out', preview.worked_out) ORDER BY preview.code)
             FROM app.gl_opening_preview(%(prop)s) AS preview) AS lines,
            (SELECT coalesce(sum(preview.debit_cents - preview.credit_cents), 0)
             FROM app.gl_opening_preview(%(prop)s) AS preview) AS difference_cents
        FROM app.gl_opening_balances AS opening
        WHERE opening.property_id = %(prop)s
    """,
    "books-check": """
        SELECT check_code, accounts, in_books, in_list, ok
        FROM app.gl_books_check(%(prop)s)
    """,
    "periods": """
        SELECT period.id, year.id AS fiscal_year_id, year.fiscal_year, year.status AS year_status,
            period.period_no, period.starts_on, period.ends_on, period.status,
            period.closed_at, period.closed_by
        FROM app.gl_periods AS period
        JOIN app.gl_fiscal_years AS year ON year.id = period.fiscal_year_id
        WHERE period.property_id = %(prop)s AND period.period_no <= 12
        ORDER BY period.starts_on
    """,
    "close-checks": """
        SELECT item.check_code, item.ok, item.open_items
        FROM app.gl_periods AS period
        CROSS JOIN LATERAL app.gl_month_close_checks(period.id) AS item
        WHERE period.id = %(target)s AND period.property_id = %(prop)s
    """,
}


class PostgresLedgerCloseFlow:
    def __init__(self, database_url: str) -> None:
        self._database_url = database_url

    @staticmethod
    def _property(connection: psycopg.Connection[Any], property_id: UUID) -> None:
        found = connection.execute(
            "SELECT 1 FROM app.properties WHERE id = %s", (property_id,)
        ).fetchone()
        if found is None:
            raise LedgerMoneyNotFound

    def write(
        self,
        action: str,
        property_id: UUID,
        actor_id: str,
        values: dict[str, Any],
        target_id: UUID | None = None,
    ) -> Any:
        step = ACTIONS[action]
        arguments: list[Any] = []
        for name in step.fields:
            value = values.get(name)
            if name == "lines":
                value = Jsonb(value)
            arguments.append(value)
        marks = ["%s"] * (len(arguments) + 3)
        if step.year_field is not None:
            marks[2 + step.fields.index(step.year_field)] = "%s::smallint"
        try:
            with psycopg.connect(self._database_url) as connection:
                self._property(connection, property_id)
                if step.target is None:
                    leading: list[Any] = [property_id, UUID(actor_id)]
                else:
                    owner = connection.execute(
                        f"SELECT property_id FROM app.{step.target} WHERE id = %s",
                        (target_id,),
                    ).fetchone()
                    if owner is None or owner[0] != property_id:
                        raise LedgerMoneyNotFound
                    leading = [target_id, UUID(actor_id)]
                row = connection.execute(
                    f"SELECT app.{step.function}({', '.join(marks)})",
                    [*leading, *arguments, uuid4()],
                ).fetchone()
        except psycopg.Error as exc:
            raise _refusal(exc) from exc
        return None if row is None else row[0]

    def rows(
        self, view: str, property_id: UUID, target_id: UUID | None = None
    ) -> tuple[dict[str, Any], ...]:
        try:
            with psycopg.connect(self._database_url) as connection:
                self._property(connection, property_id)
                cursor = connection.execute(VIEWS[view], {"prop": property_id, "target": target_id})
                names = [column.name for column in cursor.description or ()]
                return tuple(
                    {name: _json(value) for name, value in zip(names, row, strict=True)}
                    for row in cursor.fetchall()
                )
        except psycopg.Error as exc:
            raise _refusal(exc) from exc


def create_ledger_close_router(
    resolver: ActorResolver, flow: LedgerCloseFlow, settings: Settings
) -> APIRouter:
    router = APIRouter(prefix="/api/v1/properties/{property_id}/ledger", tags=["ledger"])

    def change(
        request: Request,
        property_id: UUID,
        capabilities: tuple[str, ...],
        action: str,
        values: dict[str, Any],
        target_id: UUID | None = None,
    ) -> Any:
        actor = resolver(request)
        if actor is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)
        if not any(_holds(actor, capability, property_id) for capability in capabilities):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN)
        require_browser_mutation(request, settings)
        try:
            return flow.write(action, property_id, actor.actor_id, values, target_id)
        except FLOW_ERRORS as exc:
            raise _http(exc) from exc

    def answer(request: Request, data: object) -> dict[str, object]:
        return {"data": data, "meta": {"request_id": request.state.request_id}}

    def read(
        request: Request,
        response: Response,
        property_id: UUID,
        view: str,
        target_id: UUID | None = None,
    ) -> dict[str, object]:
        _require(request, resolver, LEDGER_READ, property_id)
        response.headers["Cache-Control"] = "private, no-store"
        try:
            rows = flow.rows(view, property_id, target_id)
        except FLOW_ERRORS as exc:
            raise _http(exc) from exc
        return {
            "data": list(rows),
            "meta": {"request_id": request.state.request_id, "count": len(rows)},
        }

    @router.get("/adjusting-entries")
    def list_adjusting_entries(
        property_id: UUID, request: Request, response: Response
    ) -> dict[str, object]:
        return read(request, response, property_id, "adjusting-entries")

    @router.post("/adjusting-entries", status_code=status.HTTP_201_CREATED)
    def prepare_adjusting_entry(
        property_id: UUID, body: AdjustingEntryBody, request: Request
    ) -> dict[str, object]:
        values = body.model_dump()
        values["lines"] = [line.as_json() for line in body.lines]
        made = change(request, property_id, (PREPARE,), "prepare_adjustment", values)
        return answer(request, {"id": str(made)})

    @router.post("/adjusting-entries/{adjustment_id}/decision")
    def decide_adjusting_entry(
        property_id: UUID, adjustment_id: UUID, body: DecisionBody, request: Request
    ) -> dict[str, object]:
        change(
            request, property_id, (APPROVE,), "decide_adjustment", body.model_dump(), adjustment_id
        )
        return answer(request, {"id": str(adjustment_id)})

    @router.post("/adjusting-entries/{adjustment_id}/void")
    def void_adjusting_entry(
        property_id: UUID, adjustment_id: UUID, body: ReasonBody, request: Request
    ) -> dict[str, object]:
        # The one who prepared it, or an approver; the database tells them apart.
        change(
            request,
            property_id,
            (PREPARE, APPROVE),
            "void_adjustment",
            body.model_dump(),
            adjustment_id,
        )
        return answer(request, {"id": str(adjustment_id)})

    @router.get("/opening-balances")
    def read_opening_balances(
        property_id: UUID, request: Request, response: Response
    ) -> dict[str, object]:
        return read(request, response, property_id, "opening-balances")

    @router.post("/opening-balances", status_code=status.HTTP_201_CREATED)
    def start_ledger(property_id: UUID, body: StartBody, request: Request) -> dict[str, object]:
        made = change(request, property_id, (OPENING,), "begin_ledger", body.model_dump())
        return answer(request, {"id": str(made)})

    @router.put("/opening-balances/lines")
    def set_opening_lines(
        property_id: UUID, body: OpeningLinesBody, request: Request
    ) -> dict[str, object]:
        values = {"lines": [line.as_json() for line in body.lines]}
        change(request, property_id, (OPENING,), "set_opening_lines", values)
        return answer(request, {"lines": len(body.lines)})

    @router.post("/opening-balances/post", status_code=status.HTTP_201_CREATED)
    def post_opening_balances(
        property_id: UUID, body: NoBody, request: Request
    ) -> dict[str, object]:
        del body
        entry = change(request, property_id, (OPENING,), "post_opening", {})
        return answer(request, {"entry_id": str(entry)})

    @router.get("/books-check")
    def books_check(property_id: UUID, request: Request, response: Response) -> dict[str, object]:
        return read(request, response, property_id, "books-check")

    @router.get("/periods")
    def list_periods(property_id: UUID, request: Request, response: Response) -> dict[str, object]:
        return read(request, response, property_id, "periods")

    @router.get("/periods/{period_id}/close-checks")
    def close_checks(
        property_id: UUID, period_id: UUID, request: Request, response: Response
    ) -> dict[str, object]:
        found = read(request, response, property_id, "close-checks", period_id)
        if not found["data"]:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
        return found

    @router.post("/periods/{period_id}/close")
    def close_month(
        property_id: UUID, period_id: UUID, body: NoBody, request: Request
    ) -> dict[str, object]:
        del body
        result = change(request, property_id, (CLOSE,), "close_month", {}, period_id)
        return answer(request, result)

    @router.post("/fiscal-years/{year_id}/close")
    def close_year(
        property_id: UUID, year_id: UUID, body: NoBody, request: Request
    ) -> dict[str, object]:
        del body
        entry = change(request, property_id, (CLOSE,), "close_year", {}, year_id)
        return answer(request, {"entry_id": None if entry is None else str(entry)})

    return router
