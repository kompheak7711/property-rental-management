"""Telegram app pages (bots step 2c, DL-128, API-TG-001).

`GET .../telegram/links` answers the Linked tenants page: the links in force, the link tries that
did not match in the last 24 hours and the links that ended (`telegram.read`).
`POST .../telegram/links/{link_id}/remove` removes a link with a reason (`telegram.operate`).
`GET .../telegram/health` answers the Telegram health page: the relay pulls, the messages not
sent with their last error and each bot's last message in and out (`telegram.read`).
`POST .../telegram/outbox/{message_id}/retry` sends again, once, a message the app gave up on
(`telegram.operate`). No bot key is ever read or shown here.

The database functions check the rights again.
"""

from __future__ import annotations

from typing import Annotated, Protocol
from uuid import UUID

import psycopg
from fastapi import APIRouter, Request, Response, status
from pydantic import BaseModel, ConfigDict, StringConstraints

from property_rental.browser_security import require_browser_mutation
from property_rental.identity import ActorResolver
from property_rental.products_api import (
    REFUSED,
    Json,
    ProductUnavailable,
    _http,
    _refusal,
    _require,
)
from property_rental.settings import Settings

TELEGRAM_READ = "telegram.read"
TELEGRAM_OPERATE = "telegram.operate"
Reason = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=300)]


class TelegramPageFlow(Protocol):
    def links(self, property_id: UUID, *, actor_id: str) -> Json: ...

    def remove_link(
        self, property_id: UUID, link_id: UUID, reason: str, *, actor_id: str
    ) -> None: ...

    def health(self, property_id: UUID, *, actor_id: str) -> Json: ...

    def retry(self, property_id: UUID, message_id: UUID, *, actor_id: str) -> UUID: ...


class UnavailableTelegramPageFlow:
    def links(self, property_id: UUID, **_: object) -> Json:
        raise ProductUnavailable

    def remove_link(self, property_id: UUID, link_id: UUID, reason: str, **_: object) -> None:
        raise ProductUnavailable

    def health(self, property_id: UUID, **_: object) -> Json:
        raise ProductUnavailable

    def retry(self, property_id: UUID, message_id: UUID, **_: object) -> UUID:
        raise ProductUnavailable


def _json(value: object) -> Json:
    if not isinstance(value, dict):
        raise ProductUnavailable("Telegram persistence is unavailable")
    return {str(key): item for key, item in value.items()}


class PostgresTelegramPageFlow:
    def __init__(self, database_url: str) -> None:
        self._database_url = database_url

    def _one(self, query: str, parameters: tuple[object, ...]) -> object:
        try:
            with psycopg.connect(self._database_url) as connection:
                row = connection.execute(query, parameters).fetchone()
        except psycopg.Error as exc:
            raise _refusal(exc) from exc
        return None if row is None else row[0]

    def links(self, property_id: UUID, *, actor_id: str) -> Json:
        return _json(
            self._one("SELECT app.telegram_links_page(%s, %s)", (property_id, UUID(actor_id)))
        )

    def remove_link(self, property_id: UUID, link_id: UUID, reason: str, *, actor_id: str) -> None:
        self._one(
            "SELECT app.telegram_tenant_link_remove(%s, %s, %s, %s)::text",
            (property_id, link_id, reason, UUID(actor_id)),
        )

    def health(self, property_id: UUID, *, actor_id: str) -> Json:
        return _json(
            self._one("SELECT app.telegram_health_page(%s, %s)", (property_id, UUID(actor_id)))
        )

    def retry(self, property_id: UUID, message_id: UUID, *, actor_id: str) -> UUID:
        made = self._one(
            "SELECT app.telegram_outbox_retry(%s, %s, %s)",
            (property_id, message_id, UUID(actor_id)),
        )
        return UUID(str(made))


class RemoveLink(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    reason: Reason


def create_telegram_router(
    resolver: ActorResolver, flow: TelegramPageFlow, settings: Settings
) -> APIRouter:
    router = APIRouter(prefix="/api/v1/properties/{property_id}/telegram", tags=["telegram"])

    def envelope(request: Request, data: object) -> Json:
        return {"data": data, "meta": {"request_id": request.state.request_id}}

    @router.get("/links")
    def telegram_links(property_id: UUID, request: Request, response: Response) -> Json:
        actor = _require(request, resolver, TELEGRAM_READ, property_id)
        response.headers["Cache-Control"] = "private, no-store"
        try:
            return envelope(request, flow.links(property_id, actor_id=actor.actor_id))
        except REFUSED as exc:
            raise _http(exc) from exc

    @router.post("/links/{link_id}/remove")
    def remove_telegram_link(
        property_id: UUID, link_id: UUID, body: RemoveLink, request: Request
    ) -> Json:
        actor = _require(request, resolver, TELEGRAM_OPERATE, property_id)
        require_browser_mutation(request, settings)
        try:
            flow.remove_link(property_id, link_id, body.reason, actor_id=actor.actor_id)
            return envelope(request, flow.links(property_id, actor_id=actor.actor_id))
        except REFUSED as exc:
            raise _http(exc) from exc

    @router.get("/health")
    def telegram_health(property_id: UUID, request: Request, response: Response) -> Json:
        actor = _require(request, resolver, TELEGRAM_READ, property_id)
        response.headers["Cache-Control"] = "private, no-store"
        try:
            return envelope(request, flow.health(property_id, actor_id=actor.actor_id))
        except REFUSED as exc:
            raise _http(exc) from exc

    @router.post("/outbox/{message_id}/retry", status_code=status.HTTP_201_CREATED)
    def retry_telegram_message(property_id: UUID, message_id: UUID, request: Request) -> Json:
        actor = _require(request, resolver, TELEGRAM_OPERATE, property_id)
        require_browser_mutation(request, settings)
        try:
            made = flow.retry(property_id, message_id, actor_id=actor.actor_id)
            return envelope(
                request,
                {
                    "message_id": str(made),
                    "health": flow.health(property_id, actor_id=actor.actor_id),
                },
            )
        except REFUSED as exc:
            raise _http(exc) from exc

    return router
