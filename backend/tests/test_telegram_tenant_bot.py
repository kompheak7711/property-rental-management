"""The Tenant bot conversation (DL-126, bots plan step 2a): Start, language and linking."""

from __future__ import annotations

from typing import Any

from property_rental.telegram_send_job import run_send
from property_rental.telegram_tenant_bot import handle_tenant_update
from test_telegram_jobs import FakeStore

USER = 777


def say(store: FakeStore, text: str | None = None, **message: Any) -> list[dict[str, Any]]:
    before = len(store.replies)
    body: dict[str, Any] = {
        "from": {"id": USER},
        "chat": {"id": USER, "type": message.pop("chat_type", "private")},
        **message,
    }
    if text is not None:
        body["text"] = text
    plain = {"telegram_user_id": USER, "chat_id": USER, "payload": {"message": body}}
    handle_tenant_update("TENANT", plain, {"saved": True}, store)
    return store.replies[before:]


def codes(replies: list[dict[str, Any]]) -> list[tuple[str, str | None]]:
    return [(reply["text_code"], reply.get("keyboard")) for reply in replies]


def test_start_asks_for_the_language_then_offers_only_linking() -> None:
    store = FakeStore()
    assert codes(say(store, "/start")) == [("tenant.welcome", "tenant.language")]
    # Anything before a language is chosen asks again.
    assert codes(say(store, "hello")) == [("tenant.welcome", "tenant.language")]
    answer = say(store, "English")
    assert codes(answer) == [("tenant.hello", "tenant.start")]
    assert answer[0]["language"] == "en" and store.languages[USER] == "en"
    assert codes(say(store, "My requests")) == [("tenant.link_first", "tenant.start")]
    khmer = say(store, "ភាសាខ្មែរ")
    assert khmer[0]["language"] == "km"


def test_linking_asks_for_the_own_phone_then_name_then_unit() -> None:
    store = FakeStore()
    store.languages[USER] = "en"
    assert codes(say(store, "Link my Lease")) == [("tenant.ask_phone", "tenant.share_phone")]
    # Typing a number, or sharing someone else's contact, does not count.
    assert codes(say(store, "012345678")) == [("tenant.ask_phone_again", "tenant.share_phone")]
    other = {"user_id": 999, "phone_number": "85512345678"}
    assert codes(say(store, contact=other)) == [("tenant.ask_phone_again", "tenant.share_phone")]
    store.phones.add(USER)
    own = {"user_id": USER, "phone_number": "85512345678"}
    assert codes(say(store, contact=own)) == [("tenant.ask_name", "remove")]
    assert codes(say(store, "Kim Dara")) == [("tenant.ask_unit", None)]
    store.link_answers.append({"result": "NO_MATCH", "tries_left": 4})
    wrong = say(store, "306")
    assert codes(wrong) == [("tenant.no_match", "tenant.reject")]
    assert wrong[0]["details"] == {"tries_left": 4}
    assert store.link_tries == [(USER, "Kim Dara", "306")]

    say(store, "Link my Lease")
    say(store, contact=own)
    say(store, "Kim Dara")
    store.link_answers.append({"result": "LINKED", "name": "Dara Kim", "unit_number": "305"})
    linked = say(store, "305")
    assert codes(linked) == [("tenant.linked", "tenant.menu")]
    assert linked[0]["details"] == {"name": "Dara Kim", "unit": "305"}
    assert codes(say(store, "Problem report")) == [("tenant.soon", "tenant.menu")]
    assert codes(say(store, "anything")) == [("tenant.menu", "tenant.menu")]


def test_the_fifth_wrong_try_says_linking_is_blocked() -> None:
    store = FakeStore()
    store.languages[USER] = "km"
    store.phones.add(USER)
    store.steps[USER] = ("link.unit", {"name": "Dara"})
    store.link_answers.append({"result": "NO_MATCH", "tries_left": 0})
    assert codes(say(store, "305")) == [("tenant.blocked", "tenant.reject")]


def test_groups_other_bots_and_the_test_message_are_left_alone() -> None:
    store = FakeStore()
    assert say(store, "/start", chat_type="group") == []
    assert say(store, "ping") == []
    plain = {"telegram_user_id": USER, "chat_id": USER, "payload": {"message": {}}}
    handle_tenant_update("STAFF", plain, {"saved": True}, store)
    assert store.replies == []


def test_the_send_job_shows_the_keyboard_in_the_persons_language() -> None:
    store = FakeStore()
    store.due = [
        {
            "id": "m1",
            "bot": "TENANT",
            "chat_id": USER,
            "text_code": "tenant.ask_phone",
            "language": "en",
            "details": {},
            "keyboard": "tenant.share_phone",
        },
        {
            "id": "m2",
            "bot": "TENANT",
            "chat_id": USER,
            "text_code": "tenant.ask_name",
            "language": "km",
            "details": {},
            "keyboard": "remove",
        },
        {
            "id": "m3",
            "bot": "TENANT",
            "chat_id": USER,
            "text_code": "tenant.menu",
            "language": "km",
            "details": {},
            "keyboard": "no.such_keyboard",
        },
    ]
    sent: list[dict[str, Any]] = []

    def post(address: str, body: dict[str, Any]) -> tuple[int, bytes]:
        sent.append(body)
        return 200, b'{"ok": true, "result": {"message_id": 5}}'

    result = run_send(
        store=store,
        api_host="api.telegram.org",
        tokens={"TENANT": "1:x"},
        post_json=post,
        log=lambda line: None,
    )
    assert result.sent == 2
    assert sent[0]["reply_markup"] == {
        "keyboard": [[{"text": "Share my phone number", "request_contact": True}]],
        "resize_keyboard": True,
    }
    assert sent[1]["reply_markup"] == {"remove_keyboard": True}
    assert store.attempts[-1] == ("m3", "FAILED", "text_unknown", None)
