"""Telegram bots step 4: join the Telegram and HR migration lines (no change to the database).

The Staff bot needs both the Telegram tables (migrations 20270430_281 to 20270527_289) and the
HR tables and bot functions (20270430_300 to 20270503_303). Both lines grew from the same main
head, so this revision has both as its parents and every later Staff bot migration follows it.
Technical choice by Claude under the owner's 2026-10-23 22:30 rule.
"""

from collections.abc import Sequence

revision: str = "20270619_330"
down_revision: str | Sequence[str] | None = ("20270527_289", "20270503_303")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Nothing to change: the two lines are joined."""


def downgrade() -> None:
    raise RuntimeError("forward-only migration")
