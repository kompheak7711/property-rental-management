"""The database calls of the Telegram jobs (migrations 20270430_281 and 20270520_282). Each call
is one SQL function that checks the job's account holds the right on the Property."""

from __future__ import annotations

import json
from typing import Any, Protocol
from uuid import UUID

import psycopg


class TelegramStore(Protocol):
    def record_item(self, item: dict[str, Any]) -> dict[str, Any]: ...

    def record_run(self, run: dict[str, Any]) -> None: ...

    def queue(self, message: dict[str, Any]) -> None: ...

    def remove_old_payloads(self) -> int: ...

    def outbox_due(self, limit: int) -> list[dict[str, Any]]: ...

    def record_attempt(
        self, outbox_id: str, outcome: str, error_code: str | None, message_id: int | None
    ) -> str: ...

    def health(self) -> dict[str, Any]: ...

    def bot_state(self, bot: str, user: int) -> dict[str, Any]: ...

    def bot_reply(
        self,
        bot: str,
        user: int,
        chat: int,
        step: str | None,
        data: dict[str, Any] | None,
        language: str,
        messages: list[dict[str, Any]],
    ) -> None: ...

    def choose_language(self, bot: str, user: int, language: str) -> None: ...

    def tenant_link(self, user: int, name: str, unit: str) -> dict[str, Any]: ...

    def tenant_end_finished_links(self) -> int: ...

    def remove_old_link_attempts(self) -> int: ...


class PostgresTelegramStore:
    def __init__(self, database_url: str, *, property_id: UUID, actor_id: UUID) -> None:
        self._url = database_url
        self._property = property_id
        self._actor = actor_id

    def __repr__(self) -> str:
        return f"PostgresTelegramStore(property={self._property})"

    def _one(self, query: str, *values: object) -> Any:
        with psycopg.connect(self._url, autocommit=True) as connection:
            row = connection.execute(query, values).fetchone()
        assert row is not None
        return row[0]

    def record_item(self, item: dict[str, Any]) -> dict[str, Any]:
        result = self._one(
            "SELECT app.telegram_record_pulled_item(%s, %s::jsonb, %s)",
            self._property,
            json.dumps(item),
            self._actor,
        )
        assert isinstance(result, dict)
        return result

    def record_run(self, run: dict[str, Any]) -> None:
        self._one(
            "SELECT app.telegram_record_pull_run(%s, %s::jsonb, %s)",
            self._property,
            json.dumps(run),
            self._actor,
        )

    def queue(self, message: dict[str, Any]) -> None:
        self._one(
            "SELECT app.telegram_queue_message(%s, %s::jsonb, %s)",
            self._property,
            json.dumps(message),
            self._actor,
        )

    def remove_old_payloads(self) -> int:
        return int(
            self._one(
                "SELECT app.telegram_remove_old_payloads(%s, %s)", self._property, self._actor
            )
        )

    def outbox_due(self, limit: int) -> list[dict[str, Any]]:
        result = self._one(
            "SELECT app.telegram_outbox_due(%s, %s, %s)", self._property, limit, self._actor
        )
        assert isinstance(result, list)
        return result

    def record_attempt(
        self, outbox_id: str, outcome: str, error_code: str | None, message_id: int | None
    ) -> str:
        return str(
            self._one(
                "SELECT app.telegram_record_send_attempt(%s, %s, %s, %s, %s, %s)",
                self._property,
                outbox_id,
                outcome,
                error_code,
                message_id,
                self._actor,
            )
        )

    def health(self) -> dict[str, Any]:
        result = self._one("SELECT app.telegram_health(%s, %s)", self._property, self._actor)
        assert isinstance(result, dict)
        return result

    def bot_state(self, bot: str, user: int) -> dict[str, Any]:
        result = self._one(
            "SELECT app.telegram_bot_state(%s, %s, %s, %s)", self._property, bot, user, self._actor
        )
        assert isinstance(result, dict)
        return result

    def bot_reply(
        self,
        bot: str,
        user: int,
        chat: int,
        step: str | None,
        data: dict[str, Any] | None,
        language: str,
        messages: list[dict[str, Any]],
    ) -> None:
        self._one(
            "SELECT app.telegram_bot_reply(%s, %s, %s, %s, %s, %s::jsonb, %s, %s::jsonb, %s)",
            self._property,
            bot,
            user,
            chat,
            step,
            None if data is None else json.dumps(data),
            language,
            json.dumps(messages),
            self._actor,
        )

    def choose_language(self, bot: str, user: int, language: str) -> None:
        self._one(
            "SELECT app.telegram_choose_language(%s, %s, %s, %s, %s) IS NULL",
            self._property,
            bot,
            user,
            language,
            self._actor,
        )

    def tenant_link(self, user: int, name: str, unit: str) -> dict[str, Any]:
        result = self._one(
            "SELECT app.telegram_tenant_link(%s, %s, %s, %s, %s)",
            self._property,
            user,
            name,
            unit,
            self._actor,
        )
        assert isinstance(result, dict)
        return result

    def tenant_end_finished_links(self) -> int:
        return int(
            self._one(
                "SELECT app.telegram_tenant_end_finished_links(%s, %s)",
                self._property,
                self._actor,
            )
        )

    def remove_old_link_attempts(self) -> int:
        return int(
            self._one(
                "SELECT app.telegram_remove_old_link_attempts(%s, %s)",
                self._property,
                self._actor,
            )
        )
