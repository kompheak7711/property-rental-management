"""Telegram app pages API (bots step 2c, DL-128, API-TG-001; step 2d part 2, DL-170).

Reading the Linked tenants and Telegram health pages needs `telegram.read`; Remove link and Retry
need `telegram.operate` and the browser mutation checks. Contact office needs `telegram.contact`;
the FAQ is read with `telegram.faq` or `telegram.contact` and changed with `telegram.faq`. The
database refusals map to 403, 404 and 409.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from uuid import UUID, uuid4

from fastapi.testclient import TestClient

from property_rental.app import create_app
from property_rental.identity import AuthenticatedActor, CapabilityGrant
from property_rental.products_api import (
    Json,
    ProductConflict,
    ProductForbidden,
    ProductNotFound,
)

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
    answers: list[tuple[UUID, str, str]] = field(default_factory=list)
    saved: list[Json] = field(default_factory=list)
    approved: list[UUID] = field(default_factory=list)
    owner: bool = False

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

    def contact(self, property_id: UUID, *, actor_id: str) -> Json:
        self._check(property_id)
        waiting = [] if self.answers else [{"id": str(self.message_id), "message": "Hello"}]
        return {"waiting": waiting, "answered": [{"id": str(m)} for m, _, _ in self.answers]}

    def answer(
        self, property_id: UUID, message_id: UUID, how: str, text: str, *, actor_id: str
    ) -> None:
        self._check(property_id)
        if message_id != self.message_id:
            raise ProductNotFound("the message does not exist")
        if self.answers:
            raise ProductConflict("This message was already answered")
        self.answers.append((message_id, how, text))

    def faq(self, property_id: UUID, *, actor_id: str) -> Json:
        self._check(property_id)
        return {"questions": [], "owner": self.owner, "can_edit": True}

    def save_faq(self, property_id: UUID, version: Json, *, actor_id: str) -> Json:
        self._check(property_id)
        self.saved.append(version)
        return {"number": len(self.saved), "approved": self.owner}

    def approve_faq(self, property_id: UUID, version_id: UUID, *, actor_id: str) -> Json:
        self._check(property_id)
        if not self.owner:
            raise ProductForbidden("Only the Owner approves a FAQ answer")
        self.approved.append(version_id)
        return {"number": 1, "version_number": 1}


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


def test_contact_office_needs_its_right_and_answers_once() -> None:
    flow = InMemoryTelegram()
    url = f"{base(flow)}/contact"
    assert client(flow, "telegram.read").get(url).status_code == 403
    staff = client(flow, "telegram.contact")
    page = staff.get(url)
    assert page.status_code == 200 and page.headers["Cache-Control"] == "private, no-store"
    answer = f"{url}/{flow.message_id}/answer"
    body = {"how": "TELEGRAM", "answer": "  We will call you at 10:00. "}
    assert staff.post(answer, json=body).status_code == 403  # no browser mutation checks
    assert staff.post(answer, json=body | {"how": "EMAIL"}, headers=HEADERS).status_code == 422
    assert staff.post(answer, json=body | {"answer": " "}, headers=HEADERS).status_code == 422
    assert staff.post(answer, json=body | {"answer": "x" * 601}, headers=HEADERS).status_code == 422
    done = staff.post(answer, json=body, headers=HEADERS)
    assert done.status_code == 200 and done.json()["data"]["waiting"] == []
    assert flow.answers == [(flow.message_id, "TELEGRAM", "We will call you at 10:00.")]
    assert staff.post(answer, json=body, headers=HEADERS).status_code == 409
    missing = staff.post(f"{url}/{uuid4()}/answer", json=body, headers=HEADERS)
    assert missing.status_code == 404


def test_the_faq_is_read_by_contact_staff_and_changed_with_its_right() -> None:
    flow = InMemoryTelegram()
    url = f"{base(flow)}/faq"
    assert client(flow, "telegram.read").get(url).status_code == 403
    assert client(flow, "telegram.contact").get(url).status_code == 200
    body = {
        "for_bots": "BOTH",
        "question_en": " Office hours? ",
        "answer_en": "07:00 to 17:00",
        "question_km": "ម៉ោងធ្វើការ?",
        "answer_km": "០៧:០០ ដល់ ១៧:០០",
    }
    staff = client(flow, "telegram.contact")
    assert staff.post(url, json=body, headers=HEADERS).status_code == 403
    manager = client(flow, "telegram.faq")
    assert manager.post(url, json=body | {"for_bots": "ALL"}, headers=HEADERS).status_code == 422
    assert manager.post(url, json=body | {"answer_km": ""}, headers=HEADERS).status_code == 422
    saved = manager.post(url, json=body, headers=HEADERS)
    assert saved.status_code == 200 and saved.json()["data"]["saved"]["approved"] is False
    assert flow.saved[0]["question_id"] is None and flow.saved[0]["question_en"] == "Office hours?"
    version = uuid4()
    approve = f"{url}/versions/{version}/approve"
    assert manager.post(approve, headers=HEADERS).status_code == 403
    flow.owner = True
    approved = manager.post(approve, headers=HEADERS)
    assert approved.status_code == 200 and flow.approved == [version]
