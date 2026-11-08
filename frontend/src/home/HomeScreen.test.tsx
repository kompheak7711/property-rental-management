import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  type HomePage,
  ReportsNotAllowedError,
  ReportsUnavailableError,
  type TodoItem,
} from "../reportsClient";
import { hashForPage } from "../shell/navigation";
import { HomeScreen } from "./HomeScreen";

afterEach(() => {
  cleanup();
});

const PAGE: HomePage = {
  as_of: "2026-11-03T03:30:00Z",
  business_date: "2026-11-03",
  timezone: "Asia/Phnom_Penh",
  sections: [
    "units",
    "invoices",
    "payments",
    "leases",
    "approvals",
    "readings",
    "letters",
  ],
  cards: {
    units_occupied: { occupied: 21, reserved: 1, vacant: 1, total: 23 },
    pending_payment: { amount_usd_cents: 609_125, invoice_count: 33 },
    overdue: { amount_usd_cents: 65_120, invoice_count: 3 },
    paid_this_month: {
      billed_usd_cents: 911_125,
      billed_paid_usd_cents: 371_620,
      invoice_count: 41,
      received_usd_cents: 400_000,
      payment_count: 12,
    },
    lease_renewal: { count: 2, end_on_or_before: "2027-01-02" },
    waiting_for_approval: {
      count: 1,
      money_out_usd_cents: 500,
      money_out_count: 1,
    },
    meter_readings_missing: { count: 15, reading_date: "2026-11-24" },
    letters_due: { count: 1, day_20: 1, day_30: 0 },
    // UI v81 round 4
    birthdays: { count: 3, from: "2026-11-03", to: "2026-11-10" },
    paid_on_time: { on_time: 95, invoice_count: 120 },
  },
  todo: [
    {
      kind: "overdue_initial_rent",
      date: "2026-10-05",
      group: "overdue",
      invoice_id: "inv-6",
      invoice_number: "INV260006",
      unit_number: "U201",
      customer_name: "Ouk Chanthy",
      balance_usd_cents: 21_000,
    },
    {
      kind: "letter_day_20",
      date: "2026-10-20",
      group: "overdue",
      invoice_number: "INV260006",
      unit_number: "U201",
      customer_name: "Ouk Chanthy",
    },
    {
      kind: "draft_waiting",
      date: "2026-11-02",
      group: "overdue",
      draft_id: "d-1",
      draft_kind: "REFUND",
    },
    {
      kind: "deposit_decision",
      date: "2026-11-01",
      group: "overdue",
      reservation_id: "res-305",
      unit_number: "U305",
      customer_name: "Long Sreyneang",
    },
    {
      kind: "reservation_expiring",
      date: "2026-11-05",
      group: "this_week",
      reservation_id: "res-406",
      unit_number: "U406",
      customer_name: "Tep Sreymom",
    },
    {
      kind: "lease_ending",
      date: "2026-12-31",
      group: "later",
      lease_id: "lease-204",
      unit_number: "U204",
      customer_name: "Lim Dara",
    },
    {
      kind: "refund_due",
      date: "2027-01-07",
      group: "later",
      lease_id: "lease-110",
      unit_number: "U110",
      customer_name: "Sok Mean",
      held_usd_cents: 40_000,
    },
  ],
  todo_counts: { overdue: 4, today: 0, this_week: 1, later: 2 },
  jobs: {
    last_billing_at: "2026-10-24T23:00:00Z",
    rate_updated_at: "2026-11-03T01:00:00Z",
    next_billing_date: "2026-11-25",
  },
};

function show(
  home: () => Promise<HomePage>,
  {
    capabilities = null as ReadonlySet<string> | null,
    language = "en" as "en" | "km",
  } = {},
) {
  const api = { home: vi.fn(home) };
  const view = render(
    <HomeScreen
      active
      capabilities={capabilities}
      homeApi={api}
      language={language}
      propertyId="property-1"
    />,
  );
  return { api, view };
}

const card = (name: RegExp) => {
  const link = screen
    .getAllByRole("link")
    .find((element) => name.test(element.textContent));
  if (link === undefined) throw new Error(`no card ${String(name)}`);
  return link;
};

describe("Home", () => {
  it("TEST-FE-928 shows the eight cards in the design order with their notes and links, and the head line and buttons", async () => {
    const { api } = show(() => Promise.resolve(PAGE));
    expect(await screen.findByText("21 / 23")).toBeTruthy();
    expect(api.home).toHaveBeenCalledWith("property-1");
    // UI v81 round 4 (owner 08/11/2026): no line under the title any more.
    expect(screen.queryByText(/As of 10:30/)).toBeNull();

    const labels = Array.from(
      document.querySelectorAll(".ui-home-kpi .ui-kpi-label"),
    ).map((element) => element.textContent);
    expect(labels).toEqual([
      "Occupancy",
      "Pending payment",
      "Paid this month",
      "Overdue",
      "Leases ending soon",
      "Approvals",
      "Meter readings missing",
      "Notices due",
      "Birthdays",
      "Paid on time",
    ]);
    expect(card(/Birthdays/).textContent).toContain("3Today to 10/11/2026");
    // The Customers page Birthdays tab comes with the Customers batch; until then the card opens
    // the Customers list.
    expect(card(/Birthdays/).getAttribute("href")).toBe("#/customers");
    expect(card(/Paid on time/).textContent).toContain(
      "79%95 of 120 Invoices, last 12 months",
    );
    expect(card(/Occupancy/).textContent).toContain("1 reserved · 1 vacant");
    expect(card(/Approvals/).textContent).toContain(
      "1 to confirm · Refunds pending $5.00",
    );
    expect(card(/Pending payment/).textContent).toContain(
      "$6,091.2533 Invoices not fully paid",
    );
    // Paid this month counts Invoices due this month: 371,620 of 911,125 is 40.8%.
    expect(card(/Paid this month/).textContent).toContain(
      "$3,716.2040% of $9,111.25 due in November",
    );
    expect(card(/Overdue/).getAttribute("href")).toBe("#/invoices");
    expect(card(/Leases ending soon/).textContent).toContain(
      "End before 02/01/2027",
    );
    expect(card(/Approvals/).getAttribute("href")).toBe("#/approvals");
    expect(card(/Meter readings missing/).textContent).toContain(
      "Reading day 24/11/2026",
    );
    expect(card(/Notices due/).getAttribute("href")).toBe("#/letters");
    expect(
      screen.getByText(
        "Rent and Utility Invoices made on 25/10/2026 06:00 · ABA exchange rate updated on 03/11/2026 08:00 · Next Invoices: 25/11/2026",
      ),
    ).toBeTruthy();

    expect(
      screen
        .getByRole("link", { name: "Receive payment" })
        .getAttribute("href"),
    ).toBe("#/payments/receive");
    expect(
      screen
        .getByRole("link", { name: "Enter meter readings" })
        .getAttribute("href"),
    ).toBe("#/utilities");
  });

  it("TEST-FE-1912 (UI v81 round 2) adds the Viewing requests waiting card before Problem reports, in the design's order, for a person who may read them", async () => {
    const problemsApi = {
      summary: vi.fn().mockResolvedValue({
        open: 4,
        urgent: 1,
        late: 0,
        costs_to_check: [],
      }),
    };
    const visitsApi = {
      visitRequests: vi.fn().mockResolvedValue({
        today: "2026-11-03",
        requests: [
          { status: "NEW", late: true, visit_local: null },
          { status: "NEW", late: false, visit_local: "2026-11-05T10:00" },
          { status: "CONTACTED", late: false, visit_local: "2026-11-07T15:00" },
          { status: "CLOSED", late: false, visit_local: "2026-10-20T15:00" },
        ],
      }),
    };
    render(
      <HomeScreen
        active
        capabilities={
          new Set([
            "reports.home",
            "problem_reports.read",
            "visit_requests.read",
          ])
        }
        homeApi={{ home: vi.fn(() => Promise.resolve(PAGE)) }}
        language="en"
        problemsApi={problemsApi as never}
        propertyId="property-1"
        visitsApi={visitsApi}
      />,
    );
    expect(await screen.findByText("Viewing requests waiting")).toBeTruthy();
    expect(visitsApi.visitRequests).toHaveBeenCalledWith("property-1");
    const labels = Array.from(
      document.querySelectorAll(".ui-home-kpi .ui-kpi-label"),
    ).map((element) => element.textContent);
    // UI v81 round 4: Birthdays and Paid on time come last.
    expect(labels.slice(-4)).toEqual([
      "Viewing requests waiting",
      "Problem reports",
      "Birthdays",
      "Paid on time",
    ]);
    const visits = card(/Viewing requests waiting/);
    expect(visits.textContent).toContain("21 late · 2 visits this week");
    expect(visits.getAttribute("href")).toBe("#/visitreqs");
    expect(visits.className).toContain("err");
  });

  it("TEST-FE-929 shows the Tasks as four cards with a count and a line each, Overdue open at first (red when above 0), one list at a time (a wait that began earlier is for today; dates, late or ago words and a named link per row), and keeps the chosen card in the address", async () => {
    window.history.replaceState(null, "", "#/home");
    show(() => Promise.resolve(PAGE));
    const list = await screen.findByRole("region", { name: "Tasks" });
    // UI v81 round 4 (owner 08/11/2026): no summary line under "Tasks".
    expect(within(list).queryByText(/Do them from the top down/)).toBeNull();
    const taskCard = (name: RegExp) =>
      within(list).getByRole("button", { name });
    const titles = () =>
      within(list)
        .queryAllByRole("listitem")
        .map((row) => row.querySelector("b")?.textContent);

    expect(taskCard(/^Overdue/).textContent).toBe(
      "Overdue2Oldest: 29 days late",
    );
    expect(taskCard(/^Today/).textContent).toBe("Today2Do them today");
    expect(taskCard(/^This week/).textContent).toBe(
      "This week1Next: in 2 days",
    );
    expect(taskCard(/^Later/).textContent).toBe("Later2Next: in 58 days");
    expect(taskCard(/^Overdue/).className).toContain("err");
    expect(taskCard(/^Overdue/).getAttribute("aria-pressed")).toBe("true");
    expect(taskCard(/^Today/).getAttribute("aria-pressed")).toBe("false");

    // Overdue is open: its two rows, oldest first, each with a named link.
    const rows = within(list).getAllByRole("listitem");
    expect(titles()).toEqual([
      "INV260006: $210.00 not paid",
      "Day 20 letter due: U201",
    ]);
    expect(rows[0]?.textContent).toContain("Ouk Chanthy · U201 · Initial Rent");
    expect(rows[0]?.textContent).toContain("05/10/202629 days late");
    expect(
      within(list)
        .getByRole("link", {
          name: "Open Invoice: INV260006: $210.00 not paid",
        })
        .getAttribute("href"),
    ).toBe(hashForPage("invoices", "inv:inv-6"));
    expect(
      within(list)
        .getByRole("link", { name: "Open Notices: Day 20 letter due: U201" })
        .getAttribute("href"),
    ).toBe("#/letters");

    fireEvent.click(taskCard(/^Today/));
    expect(window.location.hash).toBe("#/home?tasks=today");
    expect(taskCard(/^Today/).getAttribute("aria-pressed")).toBe("true");
    expect(taskCard(/^Overdue/).getAttribute("aria-pressed")).toBe("false");
    expect(titles()).toEqual([
      "Refund pending approval",
      "Deposit pending a decision: U305",
    ]);
    const today = within(list).getAllByRole("listitem");
    expect(today[0]?.textContent).toContain("yesterday");
    expect(today[1]?.textContent).toContain("2 days ago");
    expect(
      within(list)
        .getByRole("link", {
          name: "Open Reservation: Deposit pending a decision: U305",
        })
        .getAttribute("href"),
    ).toBe("#/reservations/res-305");

    fireEvent.click(taskCard(/^This week/));
    expect(window.location.hash).toBe("#/home?tasks=week");
    expect(titles()).toEqual(["Reservation for U406 ends"]);
    expect(within(list).getByRole("listitem").textContent).toContain(
      "in 2 days",
    );

    fireEvent.click(taskCard(/^Later/));
    expect(window.location.hash).toBe("#/home?tasks=later");
    expect(titles()).toEqual([
      "Lease for U204 ends",
      "Deposit refund due: U110",
    ]);
    expect(within(list).getAllByRole("listitem")[1]?.textContent).toContain(
      "Sok Mean · $400.00 held",
    );
    expect(
      within(list)
        .getByRole("link", { name: "Open Lease: Lease for U204 ends" })
        .getAttribute("href"),
    ).toBe("#/leases/lease-204");

    // The same card again closes the list.
    fireEvent.click(taskCard(/^Later/));
    expect(window.location.hash).toBe("#/home");
    expect(taskCard(/^Later/).getAttribute("aria-pressed")).toBe("false");
    expect(titles()).toEqual([]);
    expect(
      within(list).getByText(
        "Tap a card to see its list. Tap it again to close the list.",
      ),
    ).toBeTruthy();
  });

  it("TEST-FE-1915 the Tasks card named in the address opens at once (#/home?tasks=later); with nothing overdue no list is open and the Overdue count is not red", async () => {
    window.history.replaceState(null, "", "#/home?tasks=later");
    show(() => Promise.resolve(PAGE));
    const list = await screen.findByRole("region", { name: "Tasks" });
    expect(
      within(list)
        .getByRole("button", { name: /^Later/ })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      within(list)
        .getAllByRole("listitem")
        .map((row) => row.querySelector("b")?.textContent),
    ).toEqual(["Lease for U204 ends", "Deposit refund due: U110"]);
    cleanup();

    window.history.replaceState(null, "", "#/home");
    show(() =>
      Promise.resolve({
        ...PAGE,
        todo: PAGE.todo.filter((item) => item.group !== "overdue"),
      }),
    );
    const quiet = await screen.findByRole("region", { name: "Tasks" });
    const overdue = within(quiet).getByRole("button", { name: /^Overdue/ });
    expect(overdue.textContent).toBe("Overdue0Nothing overdue");
    expect(overdue.className).not.toContain("err");
    expect(overdue.getAttribute("aria-pressed")).toBe("false");
    expect(
      within(quiet).getByRole("button", { name: /^Today/ }).textContent,
    ).toBe("Today0Nothing here");
    expect(within(quiet).queryAllByRole("listitem")).toHaveLength(0);
    expect(window.location.hash).toBe("#/home");
  });

  it("TEST-FE-930 shows only the cards the answer holds, leaves out unknown to-do kinds, empty groups say so, the jobs line says when no billing ran, and the head buttons follow the rights", async () => {
    show(
      () =>
        Promise.resolve({
          ...PAGE,
          sections: ["units", "readings"],
          cards: {
            units_occupied: { occupied: 0, reserved: 0, vacant: 0, total: 0 },
            meter_readings_missing: { count: 0, reading_date: "2026-11-24" },
          },
          // A kind this screen does not know yet is left out, not shown broken.
          todo: [
            {
              kind: "something_new" as TodoItem["kind"],
              date: "2026-11-03",
              group: "today",
            },
          ],
          todo_counts: { overdue: 0, today: 1, this_week: 0, later: 0 },
          jobs: { last_billing_at: null, next_billing_date: "2026-11-25" },
        }),
      { capabilities: new Set(["units.read", "utility.read"]) },
    );
    expect(await screen.findByText("0 / 0")).toBeTruthy();
    expect(document.querySelectorAll(".ui-home-kpi")).toHaveLength(2);
    expect(screen.queryByText("Pending payment")).toBeNull();
    expect(screen.getByText("Nothing overdue")).toBeTruthy();
    expect(screen.getAllByText("Nothing here")).toHaveLength(3);
    expect(screen.queryByText(/Do them from the top down/)).toBeNull();
    expect(
      screen.getByText(
        "No billing run has finished yet · Next Invoices: 25/11/2026",
      ),
    ).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Receive payment" })).toBeNull();
    expect(
      screen.queryByRole("link", { name: "Enter meter readings" }),
    ).toBeNull();
  });

  it("TEST-FE-931 a failed read offers Retry and shows no old numbers; no right to read says so; Khmer words come from the mock-up", async () => {
    let fail = true;
    const { api } = show(() =>
      fail
        ? Promise.reject(new ReportsUnavailableError())
        : Promise.resolve(PAGE),
    );
    expect(
      await screen.findByText(
        "Home could not be loaded. Check the connection and try again.",
      ),
    ).toBeTruthy();
    fail = false;
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("21 / 23")).toBeTruthy();
    expect(api.home).toHaveBeenCalledTimes(2);
    cleanup();

    show(() => Promise.reject(new ReportsNotAllowedError()));
    expect(
      await screen.findByText(
        "Your account cannot see the Home numbers. Use the menu to open your work.",
      ),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
    cleanup();

    show(() => Promise.resolve(PAGE), { language: "km" });
    expect(await screen.findByText("អត្រាស្នាក់នៅ")).toBeTruthy();
    expect(screen.getByText("ការងារត្រូវធ្វើ")).toBeTruthy();
    // "Paid this month" names the month in the note: "{0}% of {1} due in វិច្ឆិកា".
    await waitFor(() => {
      expect(screen.getByText("បានបង់ខែនេះ")).toBeTruthy();
    });
    expect(screen.getByText(/ដល់កំណត់ក្នុង វិច្ឆិកា/)).toBeTruthy();
  });

  it("TEST-FE-1294 the Problem reports card shows open, urgent and late to a person who may read them; a Manager who checks repair costs sees each cost still waiting with a link; a person without the right reads nothing", async () => {
    const summary = vi.fn(() =>
      Promise.resolve({
        open: 4,
        urgent: 1,
        late: 2,
        costs_to_check: [
          {
            report_id: "r-7",
            report_number: "UP260007",
            kind: "UNIT" as const,
            unit_number: "U101",
            place_en: null,
            place_kh: null,
            entered_at: "2026-11-04T02:40:00Z",
            totals: [
              { currency: "USD" as const, amount_minor: 1400 },
              { currency: "KHR" as const, amount_minor: 40000 },
            ],
          },
        ],
      }),
    );
    const showWith = (capabilities: ReadonlySet<string>) =>
      render(
        <HomeScreen
          active
          capabilities={capabilities}
          homeApi={{ home: vi.fn(() => Promise.resolve(PAGE)) }}
          language="en"
          problemsApi={{ summary }}
          propertyId="property-1"
        />,
      );

    showWith(new Set(["reports.read"]));
    expect(await screen.findByText("21 / 23")).toBeTruthy();
    expect(summary).not.toHaveBeenCalled();
    expect(screen.queryByText("Problem reports")).toBeNull();
    cleanup();

    showWith(new Set(["reports.read", "problem_reports.read"]));
    expect(await screen.findByText("1 urgent · 2 late")).toBeTruthy();
    expect(summary).toHaveBeenCalledWith("property-1");
    expect(card(/Problem reports/).getAttribute("href")).toBe(
      hashForPage("problems"),
    );
    expect(screen.queryByText("Repair costs to check")).toBeNull();
    cleanup();

    showWith(
      new Set([
        "reports.read",
        "problem_reports.read",
        "problem_reports.costs",
      ]),
    );
    const costs = await screen.findByRole("region", {
      name: "Repair costs to check",
    });
    expect(
      within(costs)
        .getByRole("link", { name: "UP260007" })
        .getAttribute("href"),
    ).toBe(hashForPage("problems", "pr:r-7"));
    expect(within(costs).getByText(/U101 · \$14\.00 \+ 40,000 ៛/)).toBeTruthy();
  });
});
