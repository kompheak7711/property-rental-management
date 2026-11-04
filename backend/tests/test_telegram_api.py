"""Telegram app pages API (bots step 2c, DL-128, API-TG-001).

Reading the Linked tenants and Telegram health pages needs `telegram.read`; Remove link and Retry
need `telegram.operate` and the browser mutation checks. The database refusals map to 404 and 409.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from uuid import UUID, uuid4

from fastapi.testclient import TestClient

from property_rental.app import create_app
from property_rental.identity import AuthenticatedActor, CapabilityGrant
from property_rental.products_api import Json, ProductConflict, ProductNotFound

HEADERS = {
    "Origin": "https://localhost",
    "Cookie": "__Host-prm_csrf=telegram-token",
    "X-CSRF-Token": "telegram-token",
}


@dataclass
class InMemoryTelegram:
    property_id: UUID = field(default_factory=uuid4)
    link_id: UUID = field(default_factory=uuid4)
    message_id: UUID = field(default_factory=uuid4)
    removed: list[tuple[UUID, str]] = field(default_factory=list)
    retried: list[UUID] = field(default_factory=list)

    def _check(self, property_id: UUID) -> None:
        if property_id != self.property_id:
            raise ProductNotFound("the Property does not exist")

    def links(self, property_id: UUID, *, actor_id: str) -> Json:
        self._check(property_id)
        linked = [] if self.removed else [{"id": str(self.link_id), "name": "Sao Rina"}]
        return {"linked": linked, "tries": [], "ended": [], "rules": {"tries": 5}}

    def remove_link(self, property_id: UUID, link_id: UUID, reason: str, *, actor_id: str) -> None:
        self._check(property_id)
        if link_id != self.link_id:
            raise ProductNotFound("the link was not found")
        if self.removed:
            raise ProductConflict("the link has already ended")
        self.removed.append((link_id, reason))

    def health(self, property_id: UUID, *, actor_id: str) -> Json:
        self._check(property_id)
        return {"outbox_waiting": 0, "bots": [], "outbox": [], "pulls": []}

    def retry(self, property_id: UUID, message_id: UUID, *, actor_id: str) -> UUID:
        self._check(property_id)
        if message_id in self.retried:
            raise ProductConflict("This message was already sent again")
        self.retried.append(message_id)
        return uuid4()


def client(flow: InMemoryTelegram, *capabilities: str) -> TestClient:
    who = AuthenticatedActor(
        actor_id=str(uuid4()),
        capability_grants=frozenset(
            CapabilityGrant(capability=name, property_ids=frozenset({str(flow.property_id)}))
            for name in capabilities
        ),
    )
    return TestClient(create_app(actor_resolver=lambda _: who, telegram_page_flow=flow))


def base(flow: InMemoryTelegram) -> str:
    return f"/api/v1/properties/{flow.property_id}/telegram"


def test_the_telegram_pages_need_telegram_read() -> None:
    flow = InMemoryTelegram()
    for url in (f"{base(flow)}/links", f"{base(flow)}/health"):
        assert client(flow).get(url).status_code == 403
        answer = client(flow, "telegram.read").get(url)
        assert answer.status_code == 200
        assert answer.headers["Cache-Control"] == "private, no-store"
    other = InMemoryTelegram()
    wrong = client(flow, "telegram.read").get(
        f"/api/v1/properties/{other.property_id}/telegram/links"
    )
    assert wrong.status_code == 403


def test_remove_link_needs_operate_a_reason_and_the_browser_checks() -> None:
    flow = InMemoryTelegram()
    url = f"{base(flow)}/links/{flow.link_id}/remove"
    body = {"reason": "  Lost phone "}
    reader = client(flow, "telegram.read")
    assert reader.post(url, json=body, headers=HEADERS).status_code == 403
    manager = client(flow, "telegram.read", "telegram.operate")
    assert manager.post(url, json=body).status_code == 403  # no browser mutation checks
    assert manager.post(url, json={"reason": " "}, headers=HEADERS).status_code == 422
    done = manager.post(url, json=body, headers=HEADERS)
    assert done.status_code == 200 and done.json()["data"]["linked"] == []
    assert flow.removed == [(flow.link_id, "Lost phone")]
    assert manager.post(url, json=body, headers=HEADERS).status_code == 409
    missing = manager.post(f"{base(flow)}/links/{uuid4()}/remove", json=body, headers=HEADERS)
    assert missing.status_code == 404


def test_retry_sends_a_given_up_message_once() -> None:
    flow = InMemoryTelegram()
    url = f"{base(flow)}/outbox/{flow.message_id}/retry"
    assert client(flow, "telegram.read").post(url, headers=HEADERS).status_code == 403
    manager = client(flow, "telegram.read", "telegram.operate")
    sent = manager.post(url, headers=HEADERS)
    assert sent.status_code == 201 and "health" in sent.json()["data"]
    assert manager.post(url, headers=HEADERS).status_code == 409
