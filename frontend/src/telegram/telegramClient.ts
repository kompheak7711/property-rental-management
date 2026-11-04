// Telegram bots step 2c (DL-128, API-TG-001): Office › Telegram, the tabs Linked tenants and
// Telegram health. The server checks every right again; this client only reads and sends.
// No bot key is ever read or shown.

export class TelegramError extends Error {
  /** The HTTP status, or null when the server could not be reached or answered badly:
   * 403 no right, 404 not found, 409 already done, 422 refused. */
  constructor(readonly status: number | null = null) {
    super("The Telegram page could not be read or saved.");
    this.name = "TelegramError";
  }
}

export interface LinkedTenant {
  id: string;
  telegram_user_id: number;
  phone: string | null;
  name: string | null;
  unit_number: string | null;
  lease_end_date: string | null;
  linked_at: string;
}

export interface LinkTry {
  telegram_user_id: number;
  phone: string | null;
  typed_name: string | null;
  typed_unit: string | null;
  tries: number;
  tries_left: number;
  blocked_until: string | null;
  last_at: string;
}

export interface EndedLink {
  id: string;
  telegram_user_id: number;
  name: string | null;
  unit_number: string | null;
  linked_at: string;
  ended_at: string;
  /** LEASE_ENDED, REMOVED or another code from the server. */
  reason: string;
  note: string | null;
}

export interface LinksPage {
  linked: LinkedTenant[];
  tries: LinkTry[];
  ended: EndedLink[];
  rules: { tries: number; block_hours: number; keep_days: number };
}

export interface BotHealth {
  code: string;
  name: string;
  last_in: string | null;
  last_out: string | null;
  failing: boolean;
}

export interface WaitingMessage {
  id: string;
  bot: string;
  text_code: string;
  created_at: string;
  tries: number;
  last_error: string | null;
  last_try_at: string | null;
  status: "WAITING" | "GAVE_UP";
  retried: boolean;
  /** The tenant and Unit of a Tenant bot chat; null for anyone else. */
  to: { name: string | null; unit_number: string | null } | null;
}

export interface PullRun {
  started_at: string;
  outcome: string;
  error_code: string | null;
  items_saved: number;
}

export interface HealthPage {
  last_pull_at: string | null;
  last_pull_outcome: string | null;
  last_pull_error: string | null;
  outbox_waiting: number;
  outbox_failing_12h: number;
  relay_dropped: number;
  bots: BotHealth[];
  outbox: WaitingMessage[];
  pulls: PullRun[];
}

export interface TelegramApi {
  links: (propertyId: string) => Promise<LinksPage>;
  /** Removes a link with a reason and answers the page again. */
  removeLink: (
    propertyId: string,
    linkId: string,
    reason: string,
  ) => Promise<LinksPage>;
  health: (propertyId: string) => Promise<HealthPage>;
  /** Sends a message the app gave up on once more and answers the page again. */
  retry: (propertyId: string, messageId: string) => Promise<HealthPage>;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function record(value: unknown): Record<string, unknown> {
  if (!isObject(value)) throw new TelegramError();
  return value;
}

function list(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new TelegramError();
  return value;
}

function text(value: unknown): string {
  if (typeof value !== "string") throw new TelegramError();
  return value;
}

function maybeText(value: unknown): string | null {
  return value === null || value === undefined ? null : text(value);
}

function whole(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value))
    throw new TelegramError();
  return value;
}

function csrfToken(): string {
  const prefix = "__Host-prm_csrf=";
  const entry = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));
  if (entry === undefined) throw new TelegramError();
  const token = decodeURIComponent(entry.slice(prefix.length));
  if (token === "") throw new TelegramError();
  return token;
}

async function request(
  path: string,
  init: RequestInit = { method: "GET" },
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(path, { credentials: "include", ...init });
  } catch {
    throw new TelegramError();
  }
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok) throw new TelegramError(response.status);
  if (!isObject(payload) || !("data" in payload)) throw new TelegramError();
  return payload.data;
}

function post(body?: unknown): RequestInit {
  return {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-Token": csrfToken(),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  };
}

function root(propertyId: string): string {
  return `/api/v1/properties/${encodeURIComponent(propertyId)}/telegram`;
}

export function linksPageOf(value: unknown): LinksPage {
  const page = record(value);
  const rules = record(page.rules);
  return {
    linked: list(page.linked).map((item) => {
      const row = record(item);
      return {
        id: text(row.id),
        telegram_user_id: whole(row.telegram_user_id),
        phone: maybeText(row.phone),
        name: maybeText(row.name),
        unit_number: maybeText(row.unit_number),
        lease_end_date: maybeText(row.lease_end_date),
        linked_at: text(row.linked_at),
      };
    }),
    tries: list(page.tries).map((item) => {
      const row = record(item);
      return {
        telegram_user_id: whole(row.telegram_user_id),
        phone: maybeText(row.phone),
        typed_name: maybeText(row.typed_name),
        typed_unit: maybeText(row.typed_unit),
        tries: whole(row.tries),
        tries_left: whole(row.tries_left),
        blocked_until: maybeText(row.blocked_until),
        last_at: text(row.last_at),
      };
    }),
    ended: list(page.ended).map((item) => {
      const row = record(item);
      return {
        id: text(row.id),
        telegram_user_id: whole(row.telegram_user_id),
        name: maybeText(row.name),
        unit_number: maybeText(row.unit_number),
        linked_at: text(row.linked_at),
        ended_at: text(row.ended_at),
        reason: text(row.reason),
        note: maybeText(row.note),
      };
    }),
    rules: {
      tries: whole(rules.tries),
      block_hours: whole(rules.block_hours),
      keep_days: whole(rules.keep_days),
    },
  };
}

export function healthPageOf(value: unknown): HealthPage {
  const page = record(value);
  return {
    last_pull_at: maybeText(page.last_pull_at),
    last_pull_outcome: maybeText(page.last_pull_outcome),
    last_pull_error: maybeText(page.last_pull_error),
    outbox_waiting: whole(page.outbox_waiting),
    outbox_failing_12h: whole(page.outbox_failing_12h ?? 0),
    relay_dropped: whole(page.relay_dropped ?? 0),
    bots: list(page.bots).map((item) => {
      const row = record(item);
      return {
        code: text(row.code),
        name: text(row.name),
        last_in: maybeText(row.last_in),
        last_out: maybeText(row.last_out),
        failing: row.failing === true,
      };
    }),
    outbox: list(page.outbox).map((item) => {
      const row = record(item);
      const to =
        row.to === null || row.to === undefined ? null : record(row.to);
      return {
        id: text(row.id),
        bot: text(row.bot),
        text_code: text(row.text_code),
        created_at: text(row.created_at),
        tries: whole(row.tries ?? 0),
        last_error: maybeText(row.last_error),
        last_try_at: maybeText(row.last_try_at),
        status: row.status === "GAVE_UP" ? "GAVE_UP" : "WAITING",
        retried: row.retried === true,
        to:
          to === null
            ? null
            : {
                name: maybeText(to.name),
                unit_number: maybeText(to.unit_number),
              },
      };
    }),
    pulls: list(page.pulls).map((item) => {
      const row = record(item);
      return {
        started_at: text(row.started_at),
        outcome: text(row.outcome),
        error_code: maybeText(row.error_code),
        items_saved: whole(row.items_saved ?? 0),
      };
    }),
  };
}

export const telegramApi: TelegramApi = {
  async links(propertyId) {
    return linksPageOf(await request(`${root(propertyId)}/links`));
  },
  async removeLink(propertyId, linkId, reason) {
    return linksPageOf(
      await request(
        `${root(propertyId)}/links/${encodeURIComponent(linkId)}/remove`,
        post({ reason }),
      ),
    );
  },
  async health(propertyId) {
    return healthPageOf(await request(`${root(propertyId)}/health`));
  },
  async retry(propertyId, messageId) {
    const answer = record(
      await request(
        `${root(propertyId)}/outbox/${encodeURIComponent(messageId)}/retry`,
        post(),
      ),
    );
    return healthPageOf(answer.health);
  },
};
