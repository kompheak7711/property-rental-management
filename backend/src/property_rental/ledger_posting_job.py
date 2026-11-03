"""General Ledger automatic posting job (phase 6 step 2; owner plan of 03/11/2026).

The billing worker runs this after the day's billing and late-payment charges, under its lock.
Each batch calls `app.gl_post_app_records` with the money login and commits; a record posts once,
by its posting key. A record that cannot post yet stays in "Needs check"
(`app.gl_posting_problems`) and is tried again on every pass.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Protocol
from uuid import UUID

import psycopg

BATCH = 500
MAX_BATCHES = 20


@dataclass(frozen=True, slots=True)
class LedgerPostingResult:
    posted: int
    needs_check: int


class LedgerPostingError(RuntimeError):
    """The posting pass failed as a whole; nothing of the failed batch was kept."""


class LedgerPass(Protocol):
    def run(self, *, until: date) -> LedgerPostingResult: ...


class LedgerPostingJob:
    def __init__(
        self,
        financial_database_url: str,
        *,
        property_id: UUID,
        actor_id: UUID,
        batch: int = BATCH,
        max_batches: int = MAX_BATCHES,
    ) -> None:
        if not 1 <= batch <= 5000:
            raise ValueError("batch must be between 1 and 5000")
        if not 1 <= max_batches <= 100:
            raise ValueError("max_batches must be between 1 and 100")
        self._url = financial_database_url
        self._property_id = property_id
        self._actor_id = actor_id
        self._batch = batch
        self._max_batches = max_batches

    def run(self, *, until: date) -> LedgerPostingResult:
        """Post every record dated up to `until`, in batches, until a batch posts nothing new."""
        posted = 0
        needs_check = 0
        try:
            with psycopg.connect(self._url) as connection:
                for _ in range(self._max_batches):
                    row = connection.execute(
                        "SELECT posted, needs_check FROM app.gl_post_app_records(%s,%s,%s,%s)",
                        (self._property_id, self._actor_id, until, self._batch),
                    ).fetchone()
                    connection.commit()
                    if row is None:
                        raise LedgerPostingError("The posting pass returned no result")
                    batch_posted, batch_needs_check = int(row[0]), int(row[1])
                    posted += batch_posted
                    needs_check = batch_needs_check
                    if batch_posted == 0 or batch_posted + batch_needs_check < self._batch:
                        break
        except psycopg.Error as exc:
            raise LedgerPostingError(getattr(exc, "sqlstate", None) or type(exc).__name__) from exc
        return LedgerPostingResult(posted, needs_check)
