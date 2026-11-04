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
    # Step 2a: the Tenant bot, Start, language and linking (owner rules of 2 and 3 Nov 2026;
    # tenant mock-up v15). The Khmer waits for the native-speaker check.
    "tenant.welcome": {
        "km": (
            "សូមស្វាគមន៍មកកាន់ CHETANA Residence support។\n"
            "Welcome to CHETANA Residence support.\n\n"
            "សូមជ្រើសរើសភាសា។ Please choose your language."
        ),
        "en": (
            "សូមស្វាគមន៍មកកាន់ CHETANA Residence support។\n"
            "Welcome to CHETANA Residence support.\n\n"
            "សូមជ្រើសរើសភាសា។ Please choose your language."
        ),
    },
    "tenant.hello": {
        "km": (
            "សង្ឃឹមថាលោកអ្នកសុខសប្បាយជាទេ។\nតើយើងអាចជួយអ្វីលោកអ្នកបានថ្ងៃនេះ?\n"
            "សូមភ្ជាប់កិច្ចសន្យាជួលរបស់លោកអ្នកជាមុនសិន។"
        ),
        "en": (
            "I hope you are doing well.\nHow can we help you today?\nPlease link your Lease first."
        ),
    },
    "tenant.hello_linked": {
        "km": "សូមស្វាគមន៍ {name}។ លោកអ្នកបានភ្ជាប់ជាមួយបន្ទប់ {unit}។ តើលោកអ្នកត្រូវការអ្វី?",
        "en": "Welcome, {name}. You are linked to Unit {unit}. What do you need?",
    },
    "tenant.ask_phone": {
        "km": ("សូមចុច «ចែករំលែកលេខទូរស័ព្ទ» ខាងក្រោម។ បន្ទាប់មក សូមសរសេរឈ្មោះ និងលេខបន្ទប់របស់លោកអ្នក។"),
        "en": ("Please tap “Share my phone number” below. Then type your name and your Unit."),
    },
    "tenant.ask_phone_again": {
        "km": "សូមចុច «ចែករំលែកលេខទូរស័ព្ទ» ខាងក្រោម។ មានតែលេខរបស់លោកអ្នកផ្ទាល់ទេ ដែលអាចភ្ជាប់បាន។",
        "en": "Please tap “Share my phone number” below. Only your own number can link.",
    },
    "tenant.ask_name": {
        "km": "សូមអរគុណ។ សូមសរសេរឈ្មោះពេញរបស់លោកអ្នក ដូចក្នុងកិច្ចសន្យាជួល។",
        "en": "Thank you. Please type your full name as written on your Lease.",
    },
    "tenant.ask_unit": {
        "km": "សូមអរគុណ។ សូមសរសេរលេខបន្ទប់របស់លោកអ្នក ឧទាហរណ៍ 305។",
        "en": "Thank you. Please type your Unit number, for example 305.",
    },
    "tenant.linked": {
        "km": (
            "សូមស្វាគមន៍ {name}។ លោកអ្នកបានភ្ជាប់ជាមួយបន្ទប់ {unit}។ តើលោកអ្នកត្រូវការអ្វី?\n\n"
            "យើងប្រើលេខទូរស័ព្ទ ឈ្មោះ និងលេខបន្ទប់របស់លោកអ្នក "
            "តែដើម្បីស្វែងរកកិច្ចសន្យាជួល និងឆ្លើយតបសំណើរបស់លោកអ្នកប៉ុណ្ណោះ។"
        ),
        "en": (
            "Welcome, {name}. You are linked to Unit {unit}. What do you need?\n\n"
            "We use your phone, name and Unit only to find your Lease and answer your requests."
        ),
    },
    "tenant.no_match": {
        "km": (
            "យើងរកមិនឃើញអ្នកជួលដែលមានលេខទូរស័ព្ទ ឈ្មោះ និងបន្ទប់នេះទេ។ សូមពិនិត្យ៖\n"
            "• ឈ្មោះពេញរបស់លោកអ្នក ដូចក្នុងកិច្ចសន្យាជួល (លំដាប់ណាក៏បាន)\n"
            "• លេខបន្ទប់របស់លោកអ្នក ឧទាហរណ៍ 305\n"
            "លោកអ្នកនៅសល់ {tries_left} ដងទៀត។"
        ),
        "en": (
            "We cannot find a tenant with this phone, name and Unit. Please check:\n"
            "• Your full name as written on your Lease (any order is fine)\n"
            "• Your Unit number, for example 305\n"
            "You have {tries_left} tries left."
        ),
    },
    "tenant.blocked": {
        "km": ("ការភ្ជាប់ត្រូវបានបិទ 24 ម៉ោង បន្ទាប់ពីព្យាយាមខុស 5 ដង។ សូមទាក់ទងការិយាល័យ។"),
        "en": ("Linking is blocked for 24 hours after 5 failed tries. Please contact the office."),
    },
    "tenant.link_first": {
        "km": "សូមភ្ជាប់កិច្ចសន្យាជួលរបស់លោកអ្នកជាមុនសិន។",
        "en": "Please link your Lease first.",
    },
    "tenant.menu": {
        "km": "តើយើងអាចជួយអ្វីលោកអ្នកបាន?",
        "en": "How can we help you?",
    },
    "tenant.soon": {
        "km": "ផ្នែកនេះនឹងបើកឆាប់ៗនេះ។ បើមានរឿងបន្ទាន់ សូមទូរស័ព្ទមកការិយាល័យ។",
        "en": "This part opens soon. For anything urgent, please call the office.",
    },
    # Step 2b: Problem report (owner rules of 3 Nov 2026, Problem report Part B; tenant
    # mock-up v15). The form itself is the Mini App page in relay/src/tenant_app.ts.
    "tenant.report_kind": {
        "km": (
            "តើជាបញ្ហាប្រភេទណា?\n"
            "• បញ្ហាក្នុងបន្ទប់៖ អ្វីមួយនៅក្នុងបន្ទប់របស់លោកអ្នក។ លោកអ្នកអាចសម្គាល់ថាបន្ទាន់។\n"
            "• បញ្ហាអគារ៖ កន្លែងរួម ឧទាហរណ៍ ជណ្ដើរ ចំណតយានយន្ត ជណ្ដើរយន្ត ឬទ្វារធំ។\n"
            "ភ្លើងឆេះ ឬគ្រោះថ្នាក់ឥឡូវនេះ៖ សូមទូរស័ព្ទ 118 (ពន្លត់អគ្គិភ័យ) ឬ 117 (ប៉ូលិស) ជាមុនសិន។"
        ),
        "en": (
            "What kind of problem?\n"
            "• Unit Problem: something inside your Unit. You can mark it urgent.\n"
            "• Building problem: a shared place, for example stairs, parking, lift or gate.\n"
            "Fire or danger now: call 118 (fire) or 117 (police) first."
        ),
    },
    "tenant.report_received": {
        "km": "យើងបានទទួលរបាយការណ៍ {number} របស់លោកអ្នក។ ស្ថានភាព៖ បានទទួល។\n"
        "យើងនឹងរៀបចំការមកពិនិត្យក្នុងរយៈពេល 1 ថ្ងៃធ្វើការ។",
        "en": "We got your report {number}. Status: Received.\n"
        "We will plan a visit within 1 working day.",
    },
    "tenant.report_received_days": {
        "km": "យើងបានទទួលរបាយការណ៍ {number} របស់លោកអ្នក។ ស្ថានភាព៖ បានទទួល។\n"
        "យើងនឹងរៀបចំការមកពិនិត្យក្នុងរយៈពេល {days} ថ្ងៃធ្វើការ។",
        "en": "We got your report {number}. Status: Received.\n"
        "We will plan a visit within {days} working days.",
    },
    "tenant.report_urgent": {
        "km": "យើងបានទទួលរបាយការណ៍ {number} របស់លោកអ្នក។ ស្ថានភាព៖ បានទទួល។\n"
        "នេះជារឿងបន្ទាន់៖ ក្រុមការងាររបស់យើងនឹងទាក់ទងលោកអ្នកក្នុងរយៈពេល 1 ម៉ោង។",
        "en": "We got your report {number}. Status: Received.\n"
        "This is urgent: our team will contact you within 1 hour.",
    },
    "tenant.report_urgent_hours": {
        "km": "យើងបានទទួលរបាយការណ៍ {number} របស់លោកអ្នក។ ស្ថានភាព៖ បានទទួល។\n"
        "នេះជារឿងបន្ទាន់៖ ក្រុមការងាររបស់យើងនឹងទាក់ទងលោកអ្នកក្នុងរយៈពេល {hours} ម៉ោង។",
        "en": "We got your report {number}. Status: Received.\n"
        "This is urgent: our team will contact you within {hours} hours.",
    },
    "tenant.report_building": {
        "km": "សូមអរគុណ។ យើងបានទទួលរបាយការណ៍ {number} របស់លោកអ្នក។ អ្នកគ្រប់គ្រងនឹងពិនិត្យវា។",
        "en": "Thank you. We got your report {number}. The Manager will check it.",
    },
    "tenant.report_building_urgent": {
        "km": "សូមអរគុណ។ យើងបានទទួលរបាយការណ៍ {number} របស់លោកអ្នក។ "
        "នេះជារឿងបន្ទាន់៖ អ្នកថែទាំដែលកំពុងប្រចាំការនឹងមក។",
        "en": "Thank you. We got your report {number}. "
        "This is urgent: the caretaker on shift is coming.",
    },
    "tenant.report_joined": {
        "km": "សូមអរគុណ។ យើងបានទទួលរបាយការណ៍ {number} របស់លោកអ្នក។ "
        "វាជាបញ្ហាដូចគ្នានឹង {main} ដែលយើងកំពុងដោះស្រាយរួចហើយ។",
        "en": "Thank you. We got your report {number}. "
        "It is the same problem as {main}, which we are already working on.",
    },
    "tenant.report_not_linked": {
        "km": "កិច្ចសន្យាជួលរបស់លោកអ្នកមិនបានភ្ជាប់ទៀតទេ ដូច្នេះយើងមិនអាចរក្សាទុករបាយការណ៍នេះបានទេ។ "
        "សូមភ្ជាប់ម្ដងទៀត ឬទូរស័ព្ទមកការិយាល័យ។",
        "en": "Your Lease is not linked any more, so we could not save this report. "
        "Please link again, or call the office.",
    },
    "tenant.report_invalid": {
        "km": "យើងមិនអាចរក្សាទុករបាយការណ៍នេះបានទេ។ សូមបើកទម្រង់ម្ដងទៀត ហើយព្យាយាមម្ដងទៀត។",
        "en": "We could not save this report. Please open the form and try again.",
    },
    # Button labels (no fields). The bot reads a tap as the label's text in either language.
    "button.link": {"km": "ភ្ជាប់កិច្ចសន្យាជួល", "en": "Link my Lease"},
    "button.share_phone": {"km": "ចែករំលែកលេខទូរស័ព្ទ", "en": "Share my phone number"},
    "button.problem": {"km": "រាយការណ៍បញ្ហា", "en": "Problem report"},
    "button.my_requests": {"km": "សំណើរបស់ខ្ញុំ", "en": "My requests"},
    "button.faq": {"km": "សំណួរញឹកញាប់", "en": "FAQ"},
    "button.contact": {"km": "ទាក់ទងការិយាល័យ", "en": "Contact office"},
    "button.unit_problem": {"km": "បញ្ហាក្នុងបន្ទប់", "en": "Unit Problem"},
    "button.building_problem": {"km": "បញ្ហាអគារ", "en": "Building problem"},
    "button.khmer": {"km": "ភាសាខ្មែរ", "en": "ភាសាខ្មែរ"},
    "button.english": {"km": "English", "en": "English"},
}

# The keyboards a message can show under the chat. Each button is a label code above; a
# button that asks for the person's own phone number is marked.
KEYBOARDS: Final[dict[str, list[list[str]]]] = {
    "tenant.language": [["button.khmer", "button.english"]],
    "tenant.start": [["button.link"]],
    "tenant.share_phone": [["button.share_phone"]],
    "tenant.menu": [["button.problem", "button.my_requests"], ["button.faq", "button.contact"]],
    "tenant.reject": [["button.link", "button.contact"]],
}
CONTACT_BUTTONS: Final = frozenset({"button.share_phone"})
# Buttons on the message itself that open a Mini App form on the relay
# (https://<relay>/app/<bot>?form=<form>&lang=<language>). Telegram signs who opens it.
APP_KEYBOARDS: Final[dict[str, tuple[str, list[list[tuple[str, str]]]]]] = {
    "tenant.report_kind": (
        "tenant",
        [[("button.unit_problem", "unit")], [("button.building_problem", "building")]],
    ),
}
REMOVE_KEYBOARD: Final = "remove"


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


def keyboard_markup(
    code: str | None, language: str, app_host: str | None = None
) -> dict[str, object] | None:
    """Telegram's reply_markup for a keyboard code, or None when the message has none."""
    if code is None:
        return None
    if code == REMOVE_KEYBOARD:
        return {"remove_keyboard": True}
    if code in APP_KEYBOARDS:
        if not app_host:
            raise TextError(f"keyboard.{code}.no_app_host")
        page, app_rows = APP_KEYBOARDS[code]
        return {
            "inline_keyboard": [
                [
                    {
                        "text": render(label, language, {}),
                        "web_app": {
                            "url": f"https://{app_host}/app/{page}?form={form}&lang={language}"
                        },
                    }
                    for label, form in row
                ]
                for row in app_rows
            ]
        }
    rows = KEYBOARDS.get(code)
    if rows is None:
        raise TextError(f"keyboard.{code}")
    keyboard = [
        [
            {"text": render(label, language, {}), "request_contact": True}
            if label in CONTACT_BUTTONS
            else {"text": render(label, language, {})}
            for label in row
        ]
        for row in rows
    ]
    return {"keyboard": keyboard, "resize_keyboard": True}


def button_tapped(text: str) -> str | None:
    """The label code a typed text is, in either language, or None."""
    typed = text.strip()
    for code, texts in TEXTS.items():
        if code.startswith("button.") and typed in texts.values():
            return code
    return None
