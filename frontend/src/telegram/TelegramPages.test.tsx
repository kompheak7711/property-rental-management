import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LinkedTenantsPage, TelegramHealthPage } from "./TelegramPages";
import {
  type HealthPage,
  type LinksPage,
  type TelegramApi,
  TelegramError,
  healthPageOf,
  linksPageOf,
} from "./telegramClient";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const LINKS: LinksPage = {
  linked: [
    {
      id: "link-1",
      telegram_user_id: 920001,
      phone: "+85512300400",
      name: "Sao Rina",
      unit_number: "601",
      lease_end_date: "2027-06-30",
      linked_at: "2026-11-03T02:40:00Z",
    },
  ],
  tries: [
    {
      telegram_user_id: 920002,
      phone: "+85599000111",
      typed_name: "Somebody",
      typed_unit: "601",
      tries: 2,
      tries_left: 3,
      blocked_until: null,
      last_at: "2026-11-04T01:00:00Z",
    },
    {
      telegram_user_id: 920005,
      phone: "+85599000222",
      typed_name: "Other",
      typed_unit: "102",
      tries: 5,
      tries_left: 0,
      blocked_until: "2026-11-05T01:00:00Z",
      last_at: "2026-11-04T01:00:00Z",
    },
  ],
  ended: [
    {
      id: "link-0",
      telegram_user_id: 920009,
      name: "Keo Vannak",
      unit_number: "101",
      linked_at: "2026-09-01T02:00:00Z",
      ended_at: "2026-10-31T17:00:00Z",
      reason: "LEASE_ENDED",
      note: null,
    },
  ],
  rules: { tries: 5, block_hours: 24, keep_days: 90 },
};

const HEALTH: HealthPage = {
  last_pull_at: "2026-11-04T03:00:00Z",
  last_pull_outcome: "OK",
  last_pull_error: null,
  outbox_waiting: 1,
  outbox_failing_12h: 0,
  relay_dropped: 0,
  bots: [
    {
      code: "CUSTOMER",
      name: "Customer bot",
      last_in: null,
      last_out: null,
      failing: false,
    },
    {
      code: "TENANT",
      name: "Tenant bot",
      last_in: "2026-11-04T02:59:00Z",
      last_out: "2026-11-04T02:58:00Z",
      failing: true,
    },
    {
      code: "STAFF",
      name: "Staff bot",
      last_in: null,
      last_out: null,
      failing: false,
    },
  ],
  outbox: [
    {
      id: "msg-wait",
      bot: "TENANT",
      text_code: "tenant.menu",
      created_at: "2026-11-04T02:00:00Z",
      tries: 1,
      last_error: "telegram_too_many",
      last_try_at: "2026-11-04T02:01:00Z",
      status: "WAITING",
      retried: false,
      to: { name: "Sao Rina", unit_number: "601" },
    },
    {
      id: "msg-old",
      bot: "TENANT",
      text_code: "tenant.report_received",
      created_at: "2026-10-27T02:00:00Z",
      tries: 3,
      last_error: "telegram_blocked_by_person",
      last_try_at: "2026-11-03T02:00:00Z",
      status: "GAVE_UP",
      retried: false,
      to: { name: "Keo Vannak", unit_number: "101" },
    },
  ],
  pulls: [
    {
      started_at: "2026-11-04T03:00:00Z",
      outcome: "OK",
      error_code: null,
      items_saved: 4,
    },
    {
      started_at: "2026-11-04T02:59:00Z",
      outcome: "FAILED",
      error_code: "relay_unreachable",
      items_saved: 0,
    },
  ],
};

function fakeApi(extra: Partial<TelegramApi> = {}): TelegramApi {
  return {
    links: vi.fn(() => Promise.resolve(LINKS)),
    removeLink: vi.fn(() => Promise.resolve({ ...LINKS, linked: [] })),
    health: vi.fn(() => Promise.resolve(HEALTH)),
    retry: vi.fn(() =>
      Promise.resolve({
        ...HEALTH,
        outbox: HEALTH.outbox.map((message) =>
          message.id === "msg-old" ? { ...message, retried: true } : message,
        ),
      }),
    ),
    ...extra,
  };
}

const MANAGER = new Set(["telegram.read", "telegram.operate"]);
const READER = new Set(["telegram.read"]);

describe("Office › Telegram", () => {
  it("TEST-FE-1299 Linked tenants lists the links in force, the link tries that did not match with tries left or blocked until, and the ended links with why", async () => {
    const api = fakeApi();
    render(
      <LinkedTenantsPage
        active
        api={api}
        capabilities={MANAGER}
        language="en"
        propertyId="prop-1"
      />,
    );
    const linked = await screen.findByRole("region", { name: "Linked now" });
    const row = within(linked).getByRole("row", { name: /Sao Rina/ });
    expect(row.textContent).toContain("+85512300400");
    expect(row.textContent).toContain("601");
    expect(row.textContent).toContain("30/06/2027");
    expect(
      screen.getByText("Link tries that did not match: 2 Telegram accounts."),
    ).toBeTruthy();
    const tries = screen.getByRole("region", {
      name: "Link tries that did not match",
    });
    expect(within(tries).getByText("3 tries left")).toBeTruthy();
    expect(within(tries).getByText(/^Blocked until 05\/11\/2026/)).toBeTruthy();
    expect(tries.textContent).toContain(
      "5 failed tries block linking for 24 hours",
    );
    const ended = screen.getByRole("region", { name: "Ended links" });
    expect(within(ended).getByText("The Lease ended")).toBeTruthy();
    expect(within(ended).getByText("The last 90 days.")).toBeTruthy();
    expect(api.links).toHaveBeenCalledWith("prop-1");
  });

  it("TEST-FE-1300 Remove link needs a reason, sends it and shows the list the server answers; an ended link reads the list again; a person without telegram.operate gets no button", async () => {
    const api = fakeApi();
    render(
      <LinkedTenantsPage
        active
        api={api}
        capabilities={MANAGER}
        language="en"
        propertyId="prop-1"
      />,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Remove link" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog.textContent).toContain(
      "Remove the Telegram link of Sao Rina (601, +85512300400)?",
    );
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Remove link" }),
    );
    expect(within(dialog).getByText("Type a reason.")).toBeTruthy();
    expect(api.removeLink).not.toHaveBeenCalled();
    fireEvent.change(within(dialog).getByLabelText(/Reason/), {
      target: { value: "  Lost phone " },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Remove link" }),
    );
    await screen.findByText("Link of Sao Rina removed.");
    expect(api.removeLink).toHaveBeenCalledWith(
      "prop-1",
      "link-1",
      "Lost phone",
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByText("No tenant is linked yet.")).toBeTruthy();
    cleanup();

    const late = fakeApi({
      removeLink: vi.fn(() => Promise.reject(new TelegramError(409))),
    });
    render(
      <LinkedTenantsPage
        active
        api={late}
        capabilities={MANAGER}
        language="en"
        propertyId="prop-1"
      />,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Remove link" }));
    fireEvent.change(screen.getByLabelText(/Reason/), {
      target: { value: "Wrong person" },
    });
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Remove link",
      }),
    );
    await screen.findByText(
      "This link has already ended. The list is read again.",
    );
    await waitFor(() => {
      expect(late.links).toHaveBeenCalledTimes(2);
    });
    cleanup();

    render(
      <LinkedTenantsPage
        active
        api={fakeApi()}
        capabilities={READER}
        language="en"
        propertyId="prop-1"
      />,
    );
    await screen.findByRole("region", { name: "Linked now" });
    expect(screen.queryByRole("button", { name: "Remove link" })).toBeNull();
  });

  it("TEST-FE-1301 Telegram health shows the last relay pull, the waiting count, each bot's state and last message in and out, the messages not sent with their last error, and the last pulls; no bot key is shown", async () => {
    render(
      <TelegramHealthPage
        active
        api={fakeApi()}
        capabilities={MANAGER}
        language="en"
        propertyId="prop-1"
      />,
    );
    const bots = await screen.findByRole("region", { name: "Bots" });
    const tenant = within(bots).getByRole("row", { name: /Tenant bot/ });
    expect(within(tenant).getByText("Problem")).toBeTruthy();
    expect(within(bots).getAllByText("Working")).toHaveLength(2);
    expect(within(bots).getAllByText("Never").length).toBeGreaterThan(0);
    expect(screen.getByText("4 items saved")).toBeTruthy();
    const cards = screen.getAllByRole("listitem");
    expect(cards.map((card) => card.textContent)).toEqual([
      expect.stringContaining("Last relay pull") as string,
      "Waiting to send1The app tries again by itself",
      "Failed to send0Failing for 12 hours or more",
      "Not pulled after 7 days0The relay deletes them; check if above 0",
    ]);
    const outbox = screen.getByRole("region", {
      name: "Messages not sent yet",
    });
    const waiting = within(outbox).getByRole("row", { name: /Sao Rina, 601/ });
    expect(waiting.textContent).toContain(
      "Telegram asked the app to slow down",
    );
    expect(waiting.textContent).toContain("The app tries again");
    const old = within(outbox).getByRole("row", { name: /Keo Vannak, 101/ });
    expect(old.textContent).toContain("The person blocked the bot");
    expect(old.textContent).toContain("Stopped after 7 days");
    const pulls = screen.getByRole("region", { name: "Last relay pulls" });
    expect(
      within(pulls).getByText(
        "The relay did not answer; tried again next minute",
      ),
    ).toBeTruthy();
    expect(screen.getByText(/No bot keys are ever shown here/)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/\d{6,}:[A-Za-z0-9_-]{20,}/);
  });

  it("TEST-FE-1302 Retry shows only on a message the app gave up on, to a person with telegram.operate; it sends once and shows Sent again; a second Retry the server refuses reads the page again", async () => {
    const api = fakeApi();
    render(
      <TelegramHealthPage
        active
        api={api}
        capabilities={MANAGER}
        language="en"
        propertyId="prop-1"
      />,
    );
    const outbox = await screen.findByRole("region", {
      name: "Messages not sent yet",
    });
    expect(
      within(outbox).getAllByRole("button", { name: "Retry" }),
    ).toHaveLength(1);
    fireEvent.click(within(outbox).getByRole("button", { name: "Retry" }));
    await screen.findByText(
      "Keo Vannak, 101: the message waits to be sent again. It goes out within a minute.",
    );
    expect(api.retry).toHaveBeenCalledWith("prop-1", "msg-old");
    expect(within(outbox).getByText("Sent again")).toBeTruthy();
    expect(within(outbox).queryByRole("button", { name: "Retry" })).toBeNull();
    cleanup();

    const refused = fakeApi({
      retry: vi.fn(() => Promise.reject(new TelegramError(409))),
    });
    render(
      <TelegramHealthPage
        active
        api={refused}
        capabilities={MANAGER}
        language="en"
        propertyId="prop-1"
      />,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Retry" }));
    await screen.findByText(/This message was already sent again/);
    await waitFor(() => {
      expect(refused.health).toHaveBeenCalledTimes(2);
    });
    cleanup();

    render(
      <TelegramHealthPage
        active
        api={fakeApi()}
        capabilities={READER}
        language="en"
        propertyId="prop-1"
      />,
    );
    await screen.findByRole("region", { name: "Messages not sent yet" });
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
  });

  it("TEST-FE-1303 the client reads the pages, sends Remove link and Retry with the browser token, and refuses an answer of the wrong shape", async () => {
    Object.defineProperty(document, "cookie", {
      configurable: true,
      value: "__Host-prm_csrf=tg-token",
      writable: true,
    });
    const calls: [string, RequestInit | undefined][] = [];
    const answer = (data: unknown) =>
      Promise.resolve(
        new Response(JSON.stringify({ data, meta: {} }), { status: 200 }),
      );
    vi.stubGlobal(
      "fetch",
      vi.fn((path: string, init?: RequestInit) => {
        calls.push([path, init]);
        if (path.endsWith("/retry"))
          return answer({ message_id: "new", health: HEALTH });
        if (path.endsWith("/health")) return answer(HEALTH);
        return answer(LINKS);
      }),
    );
    const { telegramApi } = await import("./telegramClient");
    expect(await telegramApi.links("p 1")).toEqual(LINKS);
    expect(await telegramApi.removeLink("p 1", "link-1", "Lost")).toEqual(
      LINKS,
    );
    expect(await telegramApi.health("p 1")).toEqual(HEALTH);
    expect(await telegramApi.retry("p 1", "msg-old")).toEqual(HEALTH);
    expect(calls.map(([path]) => path)).toEqual([
      "/api/v1/properties/p%201/telegram/links",
      "/api/v1/properties/p%201/telegram/links/link-1/remove",
      "/api/v1/properties/p%201/telegram/health",
      "/api/v1/properties/p%201/telegram/outbox/msg-old/retry",
    ]);
    const remove = calls[1]?.[1];
    expect(remove?.method).toBe("POST");
    expect(remove?.body).toBe(JSON.stringify({ reason: "Lost" }));
    expect((remove?.headers as Record<string, string>)["X-CSRF-Token"]).toBe(
      "tg-token",
    );
    expect(() => linksPageOf({ linked: "no" })).toThrow(TelegramError);
    expect(() => healthPageOf({ bots: [] })).toThrow(TelegramError);
    expect(linksPageOf(LINKS)).toEqual(LINKS);
  });

  it("TEST-FE-1304 the pages show in Khmer and say to choose a Property first when none is chosen", async () => {
    render(
      <LinkedTenantsPage
        active
        api={fakeApi()}
        capabilities={MANAGER}
        language="km"
        propertyId="prop-1"
      />,
    );
    expect(
      await screen.findByRole("region", { name: "កំពុងភ្ជាប់" }),
    ).toBeTruthy();
    cleanup();
    const api = fakeApi();
    render(
      <TelegramHealthPage
        active
        api={api}
        capabilities={MANAGER}
        language="en"
        propertyId=""
      />,
    );
    expect(screen.getByText("Choose a Property first.")).toBeTruthy();
    expect(api.health).not.toHaveBeenCalled();
  });
});
