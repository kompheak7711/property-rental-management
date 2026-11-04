"""The fixed texts the bots send, in Khmer and English (bots plan: "The bot replies ... are fixed
texts"). A message in the outbox names a text code and its details; the send job puts them
together here. Only the named fields of a text are filled in; nothing else from the details is
ever sent. Staff texts are Khmer only (owner rule); for them the English is the same Khmer text.
"""

from __future__ import annotations

import string
from collections.abc import Mapping
from typing import Final

MAX_FIELD_CHARACTERS: Final = 300
MAX_MESSAGE_CHARACTERS: Final = 4000

TEXTS: Final[dict[str, dict[str, str]]] = {
    # Step 1: the test the owner runs after setup ("a test message goes from a test bot into
    # the app and back").
    "base.ping_reply": {
        "km": "✅ ប្រព័ន្ធបានទទួលសាររបស់អ្នក ({bot})។ ការភ្ជាប់ដំណើរការល្អ។",
        "en": "✅ The office app got your message ({bot}). The connection works.",
    },
}


class TextError(KeyError):
    """The text code is unknown, or a field it needs is missing."""


def text_fields(code: str) -> set[str]:
    template = TEXTS[code]["en"]
    return {name for _, name, _, _ in string.Formatter().parse(template) if name}


def render(code: str, language: str, details: Mapping[str, object]) -> str:
    """The message text for one outbox row."""
    texts = TEXTS.get(code)
    if texts is None:
        raise TextError(code)
    template = texts.get(language) or texts["km"]
    values: dict[str, str] = {}
    for name in text_fields(code):
        value = details.get(name)
        if value is None or isinstance(value, dict | list):
            raise TextError(f"{code}.{name}")
        values[name] = str(value)[:MAX_FIELD_CHARACTERS]
    return template.format_map(values)[:MAX_MESSAGE_CHARACTERS]
