"""The Tenant bot conversation: Start, language and linking (step 2a, DL-126), and the Problem
report form (step 2b, DL-127).

Owner rules (2 and 3 Nov 2026, tenant mock-up v15): Start greets the person and asks for Khmer or
English. A person who is not linked sees only "Link my Lease". Linking asks for the person's own
Telegram phone number (Telegram's share button), then the full name, then the Unit; the database
decides the match (migration 20270520_282). A linked tenant sees the menu: Problem report, My
requests, FAQ and Contact office. Problem report opens the Unit Problem or Building problem
form (a Mini App on the relay); the database saves the report (migration 20270521_283) and the
bot answers with its number. My requests, FAQ and Contact office come in step 2d.

Each answer is one database call that saves the person's next step and queues the messages
together, so a reply is never sent for a step that was not saved.
"""

from __future__ import annotations

from typing import Any, Final

from property_rental.telegram_store import TelegramStore
from property_rental.telegram_texts import button_tapped

BOT: Final = "TENANT"
MAX_NAME: Final = 120
MAX_UNIT: Final = 20
LANGUAGE_BUTTONS: Final = {"button.khmer": "km", "button.english": "en"}
# The chat steps this bot saves (telegram_chat_steps.step).
TENANT_STEPS: Final = frozenset({"language", "menu", "link.phone", "link.name", "link.unit"})
LATER_PARTS: Final = frozenset({"button.my_requests", "button.faq", "button.contact"})


def _message(plain: dict[str, Any]) -> dict[str, Any] | None:
    payload = plain.get("payload")
    message = payload.get("message") if isinstance(payload, dict) else None
    if not isinstance(message, dict):
        return None
    chat = message.get("chat")
    # The Tenant bot talks only in private chats with the person.
    if not isinstance(chat, dict) or chat.get("type") != "private":
        return None
    return message


def _own_contact(message: dict[str, Any]) -> bool:
    contact = message.get("contact")
    sender = message.get("from")
    return (
        isinstance(contact, dict)
        and isinstance(sender, dict)
        and contact.get("user_id") == sender.get("id")
    )


def _say(code: str, keyboard: str | None = None, **details: object) -> dict[str, Any]:
    message: dict[str, Any] = {"text_code": code, "details": details}
    if keyboard is not None:
        message["keyboard"] = keyboard
    return message


def handle_tenant_update(
    bot: str, plain: dict[str, Any], saved: dict[str, Any], store: TelegramStore
) -> None:
    if bot != BOT:
        return
    message = _message(plain)
    user = plain.get("telegram_user_id")
    chat = plain.get("chat_id")
    if message is None or not isinstance(user, int) or not isinstance(chat, int) or user <= 0:
        return
    text = message.get("text")
    typed = text.strip() if isinstance(text, str) else ""
    if typed.lower() in {"ping", "/ping"}:
        return  # the shared base answers the test message
    tapped = button_tapped(typed) if typed else None
    state = store.bot_state(BOT, user)
    language = state.get("language")

    def reply(
        step: str | None,
        *messages: dict[str, Any],
        data: dict[str, Any] | None = None,
        speak: str | None = None,
    ) -> None:
        store.bot_reply(BOT, user, chat, step, data, speak or language or "km", list(messages))

    if typed.startswith("/start") or (language is None and tapped not in LANGUAGE_BUTTONS):
        reply("language", _say("tenant.welcome", "tenant.language"))
        return
    if tapped in LANGUAGE_BUTTONS:
        chosen = LANGUAGE_BUTTONS[tapped]
        store.choose_language(BOT, user, chosen)
        reply("menu", _hello(state), speak=chosen)
        return
    link = state.get("link")
    step = state.get("step") or "menu"
    if tapped == "button.link":
        if state.get("blocked_until"):
            reply("menu", _say("tenant.blocked", "tenant.reject"))
        else:
            reply("link.phone", _say("tenant.ask_phone", "tenant.share_phone"))
        return
    if step == "link.phone":
        if _own_contact(message) and state.get("has_phone"):
            reply("link.name", _say("tenant.ask_name", "remove"))
        else:
            reply("link.phone", _say("tenant.ask_phone_again", "tenant.share_phone"))
        return
    if step == "link.name" and typed and tapped is None:
        reply("link.unit", _say("tenant.ask_unit"), data={"name": typed[:MAX_NAME]})
        return
    if step == "link.unit" and typed and tapped is None:
        name = str((state.get("data") or {}).get("name") or "")
        if not name:
            reply("link.name", _say("tenant.ask_name", "remove"))
            return
        reply("menu", *_link_answer(store.tenant_link(user, name, typed[:MAX_UNIT])))
        return
    if link is None:
        reply("menu", _say("tenant.link_first", "tenant.start"))
        return
    if tapped == "button.problem":
        reply("menu", _say("tenant.report_kind", "tenant.report_kind"))
        return
    if tapped in LATER_PARTS:
        reply("menu", _say("tenant.soon", "tenant.menu"))
        return
    reply("menu", _say("tenant.menu", "tenant.menu"))


def _hello(state: dict[str, Any]) -> dict[str, Any]:
    link = state.get("link")
    if isinstance(link, dict):
        return _say(
            "tenant.hello_linked", "tenant.menu", name=link["name"], unit=link["unit_number"]
        )
    return _say("tenant.hello", "tenant.start")


def _link_answer(result: dict[str, Any]) -> list[dict[str, Any]]:
    outcome = result.get("result")
    if outcome == "LINKED":
        return [
            _say("tenant.linked", "tenant.menu", name=result["name"], unit=result["unit_number"])
        ]
    if outcome == "NO_PHONE":
        return [_say("tenant.ask_phone", "tenant.share_phone")]
    tries_left = int(result.get("tries_left") or 0)
    if outcome == "BLOCKED" or tries_left == 0:
        return [_say("tenant.blocked", "tenant.reject")]
    return [_say("tenant.no_match", "tenant.reject", tries_left=tries_left)]


def handle_tenant_form(
    bot: str, plain: dict[str, Any], saved: dict[str, Any], store: TelegramStore
) -> None:
    """A Problem report form sent from the Mini App: save it, then answer with its number."""
    if bot != BOT:
        return
    user = plain.get("telegram_user_id")
    chat = plain.get("chat_id")
    inbound = saved.get("inbound_id")
    payload = plain.get("payload")
    if not isinstance(user, int) or not isinstance(chat, int) or user <= 0:
        return
    if not isinstance(inbound, str) or not isinstance(payload, dict):
        return
    form = payload.get("form")
    media = saved.get("media_ids")
    result = store.tenant_problem_report(
        inbound,
        form if isinstance(form, dict) else {},
        [str(media_id) for media_id in media] if isinstance(media, list) else [],
    )
    if result.get("repeated") is True:
        return
    language = store.bot_state(BOT, user).get("language") or "km"
    store.bot_reply(BOT, user, chat, "menu", None, language, [_report_answer(result)])


def _report_answer(result: dict[str, Any]) -> dict[str, Any]:
    outcome = result.get("result")
    if outcome == "NOT_LINKED":
        return _say("tenant.report_not_linked", "tenant.start")
    if outcome != "ADDED":
        return _say("tenant.report_invalid", "tenant.menu")
    number = str(result.get("report_number") or "")
    if result.get("joined_to"):
        return _say("tenant.report_joined", "tenant.menu", number=number, main=result["joined_to"])
    urgent = result.get("urgent") is True
    if result.get("kind") == "BUILDING":
        code = "tenant.report_building_urgent" if urgent else "tenant.report_building"
        return _say(code, "tenant.menu", number=number)
    if urgent:
        hours = int(result.get("urgent_hours") or 1)
        code = "tenant.report_urgent" if hours == 1 else "tenant.report_urgent_hours"
        return _say(code, "tenant.menu", number=number, hours=hours)
    days = int(result.get("plan_workdays") or 1)
    code = "tenant.report_received" if days == 1 else "tenant.report_received_days"
    return _say(code, "tenant.menu", number=number, days=days)
