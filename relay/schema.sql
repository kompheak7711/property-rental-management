-- The relay's waiting list (Cloudflare D1). It holds sealed items only until the office pulls
-- them, then deletes them; nothing waits longer than 7 days. No names, no phone numbers: only
-- sealed bytes, Telegram account numbers and roles.
CREATE TABLE IF NOT EXISTS items (
  id TEXT PRIMARY KEY,
  bot TEXT NOT NULL,
  kind TEXT NOT NULL,
  received_at TEXT NOT NULL,
  sealed TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS items_received ON items (received_at);

-- Photos, videos and voice notes of an item; the sealed bytes are in R2 under "m/<id>".
CREATE TABLE IF NOT EXISTS media (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL,
  position INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS media_item ON media (item_id);

-- Who may send forms, sent by the office app (linked tenants, approved staff and their roles).
CREATE TABLE IF NOT EXISTS access (
  bot TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  role TEXT NOT NULL,
  PRIMARY KEY (bot, user_id)
);

-- Items removed after 7 days without a pull, per day, for the health page.
CREATE TABLE IF NOT EXISTS dropped (
  day TEXT PRIMARY KEY,
  count INTEGER NOT NULL
);

-- Messages per person per minute (at most 30).
CREATE TABLE IF NOT EXISTS rate (
  user_id INTEGER NOT NULL,
  minute INTEGER NOT NULL,
  count INTEGER NOT NULL,
  PRIMARY KEY (user_id, minute)
);
