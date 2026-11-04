import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  type CustomerApi,
  type CustomerDetail,
  CustomerConflictError,
} from "../customerClient";
import { ShortStaysPage } from "./ShortStaysPage";
import {
  type Booking,
  type NewBooking,
  type PriceLine,
  type ShortStaysApi,
  ShortStaysError,
  type StayCalendar,
  type StayPrice,
} from "./shortStaysClient";

const NOW = new Date("2026-11-04T03:00:00Z"); // 10:00 in Phnom Penh

beforeEach(() => {
  window.location.hash = "#/shortstays";
});

afterEach(() => {
  cleanup();
  window.location.hash = "";
});

function calendar(from: string, days: number): StayCalendar {
  return {
    from,
    days,
    today: "2026-11-04",
    units: [
      {
        unit_id: "u-501",
        unit_number: "U501",
        unit_type: "STUDIO",
        status: "VACANT",
        for_rent: true,
        monthly_rent_usd_cents: 29900,
        bookings: [
          {
            booking_id: "b-1",
            booking_number: "ST260001",
            guest_name: "Lim Dara",
            status: "BOOKED",
            source: "WALK_IN",
            check_in_on: "2026-11-05",
            check_out_on: "2026-11-08",
            paid: false,
          },
        ],
        leases: [],
        reserved: false,
      },
      {
        unit_id: "u-503",
        unit_number: "U503",
        unit_type: "ONE_BEDROOM",
        status: "VACANT",
        for_rent: true,
        monthly_rent_usd_cents: 26900,
        bookings: [],
        leases: [
          { lease_id: "l-1", start_date: "2026-11-10", end_date: "2027-05-09" },
        ],
        reserved: false,
      },
    ],
  };
}

const LINE: PriceLine = {
  position: 1,
  kind: "NIGHTS",
  quantity: 3,
  unit_price_usd_cents: 2600,
  discount_basis_points: 3000,
  amount_usd_cents: 5460,
};
const LINES = [LINE];

function price0(extra: Partial<StayPrice> = {}): StayPrice {
  return {
    unit_id: "u-503",
    unit_number: "U503",
    unit_type: "ONE_BEDROOM",
    check_in_on: "2026-11-06",
    check_out_on: "2026-11-07",
    nights: 1,
    night_usd_cents: 2600,
    week_usd_cents: 12500,
    total_usd_cents: 2600,
    charged_as_whole_weeks: false,
    lines: [
      {
        ...LINE,
        quantity: 1,
        discount_basis_points: 0,
        amount_usd_cents: 2600,
      },
    ],
    month_only_usd_cents: 40500,
    suggest_month: false,
    blockers: [],
    ...extra,
  };
}

const BOOKING: Booking = {
  booking_id: "b-1",
  booking_number: "ST260001",
  unit_id: "u-501",
  unit_number: "U501",
  unit_type: "STUDIO",
  customer_id: "c-1",
  guest_name: "Lim Dara",
  guest_phone: "010 333 444",
  guest_count: 2,
  check_in_on: "2026-11-05",
  check_out_on: "2026-11-08",
  nights: 3,
  source: "WALK_IN",
  site_name: null,
  site_reference: null,
  note: "Late arrival",
  status: "BOOKED",
  total_usd_cents: 6090,
  version: 1,
  created_at: "2026-11-04T02:00:00Z",
  lines: [{ ...LINE, unit_price_usd_cents: 2900, amount_usd_cents: 6090 }],
  history: [
    { kind: "BOOKED", occurred_at: "2026-11-04T02:00:00Z", note: null },
  ],
  unit_status: "VACANT",
  guest_has_id: true,
  payment: "NOT_BILLED",
  invoice: null,
  deposit: null,
  room_check: null,
  damages: [],
  extra_invoices: [],
  early_check_in: false,
  late_check_out: false,
  fee_usd_cents: 500,
  check_in_time: 840,
  check_out_time: 720,
  late_check_out_until: 1080,
  cleans: [],
  free_cancel_until: "2026-11-03",
  cancel_reason: null,
  paid_usd_cents: 0,
  cancellation: null,
  credit: null,
};

/** Booking b-1 checks in today (04/11) for 3 nights. */
const TODAY_STAY: Booking = {
  ...BOOKING,
  check_in_on: "2026-11-04",
  check_out_on: "2026-11-07",
};

const INVOICE = {
  invoice_id: "i-1",
  invoice_number: "INV-000123",
  status: "ISSUED",
  total_usd_cents: 6090,
};

const DEPOSIT: NonNullable<Booking["deposit"]> = {
  deposit_id: "d-1",
  kind: "CASH",
  amount_usd_cents: 5000,
  hold_reference: null,
  card_last4: null,
  status: "HELD",
  kept_usd_cents: 0,
  taken_at: "2026-11-04T03:00:00Z",
  ended_at: null,
};

function fakeApi(overrides: Partial<ShortStaysApi> = {}): ShortStaysApi {
  return {
    calendar: vi.fn((_: string, from: string, days: number) =>
      Promise.resolve(calendar(from, days)),
    ),
    price: vi.fn(() => Promise.resolve(price0())),
    list: vi.fn(() => Promise.resolve([BOOKING])),
    get: vi.fn(() => Promise.resolve(BOOKING)),
    book: vi.fn((_: string, body: NewBooking) =>
      Promise.resolve({
        ...BOOKING,
        booking_id: "b-2",
        booking_number: "ST260002",
        unit_id: body.unit_id,
      }),
    ),
    step: vi.fn(() => Promise.resolve(BOOKING)),
    decide: vi.fn(() => Promise.resolve(BOOKING)),
    cleaning: vi.fn((_: string, day: string) =>
      Promise.resolve({ day, today: "2026-11-04", tasks: [] }),
    ),
    finishTask: vi.fn(() =>
      Promise.resolve({ day: "2026-11-04", today: "2026-11-04", tasks: [] }),
    ),
    ...overrides,
  };
}

function customer(extra: Partial<CustomerDetail> = {}): CustomerDetail {
  return {
    customer_id: "c-new",
    legal_name: "Meas Rina",
    phone_number: "012 555 666",
    email_address: null,
    contact_address: null,
    memo: null,
    id_document_number: "N123456",
    date_of_birth: null,
    gender: null,
    nationality: null,
    version: 1,
    active: true,
    deactivated_at: null,
    deactivation_reason: null,
    relationships: {
      reservations: [],
      primary_tenant_leases: [],
      signer_leases: [],
      occupancies: [],
      invoices: [],
      payments: [],
      customer_credit: [],
      refunds: [],
    },
    audit_history: [],
    audit_history_next_cursor: null,
    can_manage: true,
    can_deactivate: false,
    can_view_audit: false,
    audit_history_available: false,
    ...extra,
  };
}

function fakeCustomers(overrides: Partial<CustomerApi> = {}): CustomerApi {
  return {
    list: vi.fn(() =>
      Promise.resolve({
        items: [
          {
            customer_id: "c-1",
            legal_name: "Lim Dara",
            phone_number: "010 333 444",
            active: true,
            relationship_indicators: [],
          },
        ],
        next_cursor: null,
        can_manage: true,
      }),
    ),
    create: vi.fn(() => Promise.resolve(customer())),
    ...overrides,
  } as unknown as CustomerApi;
}

const DESK = new Set(["short_stays.read", "short_stays.desk"]);

function show(
  props: {
    api?: ShortStaysApi;
    customerApi?: CustomerApi;
    capabilities?: ReadonlySet<string> | null;
    language?: "en" | "km";
  } = {},
) {
  const api = props.api ?? fakeApi();
  const customerApi = props.customerApi ?? fakeCustomers();
  render(
    <ShortStaysPage
      active
      api={api}
      capabilities={
        props.capabilities === undefined ? DESK : props.capabilities
      }
      customerApi={customerApi}
      language={props.language ?? "en"}
      now={NOW}
      propertyId="p-1"
    />,
  );
  return { api, customerApi };
}

function go(hash: string) {
  window.location.hash = hash;
  window.dispatchEvent(new HashChangeEvent("hashchange"));
}

describe("Daily and weekly rent: Short stays", () => {
  it("TEST-FE-1600 shows one row per Unit and one square per night, each with a word", async () => {
    const { api } = show();
    const table = await screen.findByRole("table");
    expect(api.calendar).toHaveBeenCalledWith("p-1", "2026-11-04", 14);
    const u501 = within(table).getByRole("row", { name: /U501/ });
    // The first night shows the guest, the next nights the status; each opens the booking.
    expect(
      within(u501).getByRole("link", { name: /Lim Dara/ }),
    ).toHaveAttribute("href", "#/shortstays/st%3Ab-1");
    // Not paid yet: the next nights say so.
    expect(
      within(u501).getAllByRole("link", { name: /Not paid/ }),
    ).toHaveLength(2);
    // Today is free: the square opens New booking for that Unit and night.
    expect(
      within(u501).getByRole("link", {
        name: "New booking: U501, night of 04/11/2026",
      }),
    ).toHaveAttribute("href", "#/shortstays/new%3Au-501%3A2026-11-04");
    const u503 = within(table).getByRole("row", { name: /U503/ });
    expect(within(u503).getByText("1 bedroom")).toBeInTheDocument();
    expect(within(u503).getAllByText("Lease")).toHaveLength(8);
    fireEvent.click(screen.getByRole("button", { name: /Later/ }));
    await waitFor(() => {
      expect(api.calendar).toHaveBeenLastCalledWith("p-1", "2026-11-11", 14);
    });
    expect(
      await screen.findByText("11/11/2026 to 24/11/2026"),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Today" }));
    await waitFor(() => {
      expect(api.calendar).toHaveBeenLastCalledWith("p-1", "2026-11-04", 14);
    });
  });

  it("TEST-FE-1601 lists bookings and opens one with its price lines and history", async () => {
    const { api } = show();
    fireEvent.click(await screen.findByRole("button", { name: "Bookings" }));
    const row = await screen.findByRole("row", { name: /ST260001/ });
    expect(within(row).getByText("$60.90")).toBeInTheDocument();
    expect(within(row).getByText("3 nights")).toBeInTheDocument();
    expect(within(row).getByText("Walk-in")).toBeInTheDocument();
    expect(screen.getByText("1 booking")).toBeInTheDocument();
    fireEvent.click(within(row).getByRole("link", { name: "ST260001" }));
    expect(
      await screen.findByRole("heading", { name: "ST260001" }),
    ).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith("p-1", "b-1");
    expect(screen.getByText("3 × night $29.00")).toBeInTheDocument();
    expect(screen.getByText("(30% off)")).toBeInTheDocument();
    expect(screen.getByText("Late arrival")).toBeInTheDocument();
    expect(screen.getByText("05/11/2026 to 08/11/2026")).toBeInTheDocument();
  });

  it("TEST-FE-1602 books a free night for a guest who is a Customer, at the server's price", async () => {
    go("#/shortstays/new:u-503:2026-11-06");
    const api = fakeApi({
      price: vi.fn(() =>
        Promise.resolve(
          price0({
            nights: 3,
            check_out_on: "2026-11-09",
            lines: LINES,
            total_usd_cents: 5460,
          }),
        ),
      ),
    });
    const { customerApi } = show({ api });
    const nights = await screen.findByLabelText(/^Nights/);
    fireEvent.change(nights, { target: { value: "3" } });
    await waitFor(() => {
      expect(api.price).toHaveBeenLastCalledWith(
        "p-1",
        "u-503",
        "2026-11-06",
        "2026-11-09",
      );
    });
    expect(await screen.findByText("3 × night $26.00")).toBeInTheDocument();
    expect(screen.getAllByText("$54.60")).toHaveLength(2);
    expect(screen.getByLabelText(/^Unit/)).toHaveValue("u-503");
    fireEvent.change(screen.getByLabelText("Find a guest by name or phone"), {
      target: { value: "010" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Find" }));
    fireEvent.click(await screen.findByRole("button", { name: "Choose" }));
    expect(customerApi.list).toHaveBeenCalledWith("p-1", {
      query: "010",
      active: true,
    });
    fireEvent.change(screen.getByLabelText(/^Note/), {
      target: { value: " Late arrival " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Book" }));
    expect(
      await screen.findByText("Booking ST260002 made."),
    ).toBeInTheDocument();
    expect(api.book).toHaveBeenCalledWith("p-1", {
      unit_id: "u-503",
      customer_id: "c-1",
      guest_count: 1,
      check_in_on: "2026-11-06",
      check_out_on: "2026-11-09",
      source: "WALK_IN",
      note: "Late arrival",
    });
    expect(window.location.hash).toBe("#/shortstays/st%3Ab-2");
  });

  it("TEST-FE-1603 says what is missing, why a Unit cannot be booked, and offers the monthly Lease", async () => {
    go("#/shortstays/new:u-501:2026-11-06");
    const api = fakeApi({
      price: vi.fn(() =>
        Promise.resolve(
          price0({
            unit_id: "u-501",
            unit_number: "U501",
            suggest_month: true,
            blockers: ["BOOKED"],
          }),
        ),
      ),
    });
    show({ api, capabilities: DESK });
    expect(
      await screen.findByText("Another guest has booked one of these nights."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "This stay costs more than the 1-month-only rent of $405.00. Offer the monthly Lease.",
      ),
    ).toBeInTheDocument();
    // U501 is booked on the 6th, so it is marked not free; U503 is free.
    expect(
      screen.getByRole("option", { name: "U501 · Studio · not free" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "U503 · 1 bedroom" }),
    ).not.toBeDisabled();
    // Without customers.manage the desk cannot add a guest here.
    expect(
      screen.getByText(/Your account may not add Customers/),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/^Booked by/), {
      target: { value: "BOOKING_SITE" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Book" }));
    const summary = await screen.findByRole("alert");
    expect(
      within(summary).getByText("3 things need fixing:"),
    ).toBeInTheDocument();
    expect(
      within(summary).getByText("Choose the guest or add a new one."),
    ).toBeInTheDocument();
    expect(
      within(summary).getByText("Name the booking site."),
    ).toBeInTheDocument();
    expect(
      within(summary).getByText("These nights cannot be booked in this Unit."),
    ).toBeInTheDocument();
    expect(api.book).not.toHaveBeenCalled();
  });

  it("TEST-FE-1604 adds a new guest as a Customer once, even when the booking is tried again", async () => {
    go("#/shortstays/new:u-503:2026-11-06");
    const book = vi
      .fn<ShortStaysApi["book"]>()
      .mockRejectedValueOnce(
        new ShortStaysError(
          409,
          "The Unit is already booked on one of these nights",
        ),
      )
      .mockResolvedValueOnce({
        ...BOOKING,
        booking_id: "b-3",
        booking_number: "ST260003",
      });
    const api = fakeApi({ book });
    const create = vi
      .fn<CustomerApi["create"]>()
      .mockRejectedValueOnce(
        new CustomerConflictError([
          {
            customer_id: "c-9",
            legal_name: "Meas Rina",
            active: true,
            relationship_indicators: [],
          },
        ]),
      )
      .mockResolvedValue(customer());
    const { customerApi } = show({
      api,
      customerApi: fakeCustomers({ create }),
      capabilities: new Set([...DESK, "customers.manage"]),
    });
    fireEvent.click(
      await screen.findByRole("button", { name: "Add a new guest" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Book" }));
    expect(
      await screen.findAllByText("Type the guest's full name."),
    ).toHaveLength(2);
    fireEvent.change(screen.getByLabelText(/^Full name/), {
      target: { value: "Meas Rina" },
    });
    fireEvent.change(screen.getByLabelText(/^ID or passport number/), {
      target: { value: "N123456" },
    });
    fireEvent.change(screen.getByLabelText(/^Phone/), {
      target: { value: "012 555 666" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Book" }));
    // The same name is already a Customer: the desk says it is another person.
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Another person: add the new guest",
      }),
    );
    expect(
      await screen.findByText(/Someone has just booked one of these nights/),
    ).toBeInTheDocument();
    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls[1]?.[2]).toEqual({
      legal_name: "Meas Rina",
      id_document_number: "N123456",
      phone_number: "012 555 666",
      confirmed_distinct: true,
    });
    // The guest is now a Customer; the next try books without adding them again.
    expect(screen.getByText("Meas Rina")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Book" }));
    expect(
      await screen.findByText("Booking ST260003 made."),
    ).toBeInTheDocument();
    expect(customerApi.create).toHaveBeenCalledTimes(2);
    expect(book.mock.calls[1]?.[1].customer_id).toBe("c-new");
  });

  it("TEST-FE-1606 makes the Invoice, then sends the desk to Receive payment", async () => {
    const step = vi.fn(() =>
      Promise.resolve({
        ...TODAY_STAY,
        payment: "UNPAID" as const,
        invoice: INVOICE,
        version: 2,
      }),
    );
    show({
      api: fakeApi({ get: vi.fn(() => Promise.resolve(TODAY_STAY)), step }),
      capabilities: new Set([...DESK, "payments.record"]),
    });
    go("#/shortstays/st:b-1");
    expect(await screen.findByText("Not billed yet")).toBeInTheDocument();
    // A walk-in cannot be marked paid on a booking site.
    expect(
      screen.queryByRole("button", { name: "Paid on the booking site" }),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Make the Invoice" }));
    expect(step).toHaveBeenCalledWith("p-1", "b-1", "bill", { version: 1 });
    expect(
      await screen.findByRole("link", { name: "Open Invoice INV-000123" }),
    ).toHaveAttribute("href", "#/invoices/inv%3Ai-1");
    expect(
      screen.getByRole("link", { name: /Receive payment/ }),
    ).toHaveAttribute("href", "#/payments/receive%3Ac-1");
    expect(screen.getByText("Not paid")).toBeInTheDocument();
  });

  it("TEST-FE-1607 takes a card hold without the card number, then checks in when all is ready", async () => {
    let now: Booking = { ...TODAY_STAY, payment: "PAID", invoice: INVOICE };
    const step = vi.fn(
      (_: string, __: string, which: string, body: unknown) => {
        if (which === "deposit")
          now = {
            ...now,
            deposit: {
              ...DEPOSIT,
              kind: "CARD_HOLD",
              hold_reference: "HOLD-7781",
              card_last4: "1234",
            },
          };
        if (which === "check-in") {
          expect(body).toEqual({
            version: 1,
            id_copy_made: true,
            house_rules_signed: true,
          });
          now = { ...now, status: "CHECKED_IN", version: 2 };
        }
        return Promise.resolve(now);
      },
    );
    show({ api: fakeApi({ get: vi.fn(() => Promise.resolve(now)), step }) });
    go("#/shortstays/st:b-1");
    const checkIn = within(
      await screen.findByRole("region", { name: "Check-in" }),
    );
    const button = checkIn.getByRole("button", { name: "Check in" });
    expect(button).toBeDisabled();
    expect(checkIn.getByText("The deposit is taken").closest("li")).toHaveClass(
      "ss-todo",
    );
    fireEvent.click(screen.getByLabelText("Card hold"));
    const take = screen.getByRole("button", { name: "Take the deposit" });
    expect(take).toBeDisabled();
    expect(screen.getByText("Never type the card number.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Hold reference/), {
      target: { value: " HOLD-7781 " },
    });
    fireEvent.change(screen.getByLabelText(/last 4 digits/), {
      target: { value: "1234" },
    });
    fireEvent.click(take);
    expect(step).toHaveBeenCalledWith("p-1", "b-1", "deposit", {
      kind: "CARD_HOLD",
      hold_reference: "HOLD-7781",
      card_last4: "1234",
    });
    expect(await screen.findByText(/•••• 1234/)).toBeInTheDocument();
    const ready = within(screen.getByRole("region", { name: "Check-in" }));
    expect(ready.getByText("The deposit is taken").closest("li")).toHaveClass(
      "ss-ok",
    );
    fireEvent.click(
      ready.getByLabelText("I made a copy of the ID or passport"),
    );
    expect(ready.getByRole("button", { name: "Check in" })).toBeDisabled();
    fireEvent.click(ready.getByLabelText("The guest signed the house rules"));
    fireEvent.click(ready.getByRole("button", { name: "Check in" }));
    expect(await screen.findByText("Checked in")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Check-in" })).toBeNull();
    expect(
      screen.getByRole("button", { name: /Check out/ }),
    ).toBeInTheDocument();
  });

  it("TEST-FE-1608 shows a stale screen as it is now and says why", async () => {
    const get = vi.fn(() =>
      Promise.resolve({
        ...TODAY_STAY,
        payment: "UNPAID" as const,
        invoice: INVOICE,
      }),
    );
    show({
      api: fakeApi({
        get: vi.fn().mockResolvedValueOnce(TODAY_STAY).mockImplementation(get),
        step: vi.fn(() => Promise.reject(new ShortStaysError(412))),
      }),
    });
    go("#/shortstays/st:b-1");
    fireEvent.click(
      await screen.findByRole("button", { name: "Make the Invoice" }),
    );
    expect(
      await screen.findByText(
        "This booking changed meanwhile. It is shown as it is now.",
      ),
    ).toBeInTheDocument();
    expect(await screen.findByText("Not paid")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Make the Invoice" }),
    ).toBeNull();
  });

  it("TEST-FE-1609 records the room check with damage and lets only the Manager decide", async () => {
    const out: Booking = {
      ...TODAY_STAY,
      status: "CHECKED_OUT",
      payment: "PAID",
      invoice: INVOICE,
      deposit: DEPOSIT,
      room_check: {
        task_id: "t-1",
        task_on: "2026-11-04",
        status: "TO_DO",
        note: null,
        done_at: null,
      },
    };
    const waiting: Booking = {
      ...out,
      room_check: {
        ...(out.room_check ?? { task_id: "", task_on: "" }),
        status: "DONE",
        done_at: "2026-11-04T04:00:00Z",
        note: null,
      },
      damages: [
        {
          damage_id: "g-1",
          description: "Broken lamp",
          amount_usd_cents: 8000,
          status: "WAITING",
          decided_at: null,
          decision_note: null,
          from_deposit_usd_cents: 0,
          invoice_id: null,
          invoice_number: null,
        },
      ],
    };
    const step = vi.fn(() => Promise.resolve(waiting));
    show({
      api: fakeApi({ get: vi.fn(() => Promise.resolve(out)), step }),
      capabilities: new Set([...DESK, "short_stays.housekeeping"]),
    });
    go("#/shortstays/st:b-1");
    fireEvent.click(await screen.findByLabelText("Damage found"));
    fireEvent.change(screen.getByLabelText(/What is damaged/), {
      target: { value: "Broken lamp" },
    });
    fireEvent.change(screen.getByLabelText(/Cost to fix/), {
      target: { value: "80,5" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Room check done/ }));
    expect(
      screen.getByText("Type the cost in dollars, for example 80 or 80.50."),
    ).toBeInTheDocument();
    expect(step).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText(/Cost to fix/), {
      target: { value: "80" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Room check done/ }));
    expect(step).toHaveBeenCalledWith("p-1", "b-1", "room-check", {
      damage: "Broken lamp",
      damage_usd_cents: 8000,
    });
    expect(
      await screen.findByText("Waits for the Manager"),
    ).toBeInTheDocument();
    // Without the approve right there is nothing to press; the deposit waits.
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: /Return the deposit/ }),
    ).toBeNull();
  });

  it("TEST-FE-1610 approves damage from the deposit, then keeps it", async () => {
    const damage = {
      damage_id: "g-1",
      description: "Broken lamp",
      amount_usd_cents: 8000,
      status: "WAITING" as const,
      decided_at: null,
      decision_note: null,
      from_deposit_usd_cents: 0,
      invoice_id: null,
      invoice_number: null,
    };
    const checked: Booking = {
      ...TODAY_STAY,
      status: "CHECKED_OUT",
      payment: "PAID",
      invoice: INVOICE,
      deposit: DEPOSIT,
      room_check: {
        task_id: "t-1",
        task_on: "2026-11-04",
        status: "DONE",
        note: null,
        done_at: "2026-11-04T04:00:00Z",
      },
      damages: [damage],
    };
    const approved: Booking = {
      ...checked,
      damages: [
        {
          ...damage,
          status: "APPROVED",
          decision_note: "Photo on file",
          from_deposit_usd_cents: 5000,
          invoice_id: "i-2",
          invoice_number: "INV-000124",
        },
      ],
    };
    const decide = vi.fn(() => Promise.resolve(approved));
    const step = vi.fn(() =>
      Promise.resolve({
        ...approved,
        deposit: { ...DEPOSIT, status: "KEPT" as const, kept_usd_cents: 5000 },
      }),
    );
    show({
      api: fakeApi({
        get: vi.fn(() => Promise.resolve(checked)),
        decide,
        step,
      }),
      capabilities: new Set([...DESK, "short_stays.approve"]),
    });
    go("#/shortstays/st:b-1");
    // A refusal needs a reason.
    fireEvent.click(await screen.findByRole("button", { name: "Refuse" }));
    expect(screen.getByText("A refusal says why.")).toBeInTheDocument();
    expect(decide).not.toHaveBeenCalled();
    fireEvent.change(screen.getByPlaceholderText("Reason"), {
      target: { value: "Photo on file" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    expect(decide).toHaveBeenCalledWith("p-1", "g-1", {
      approve: true,
      note: "Photo on file",
    });
    expect(
      await screen.findByText(/\$50\.00 from the deposit/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Invoice INV-000124 for the rest" }),
    ).toHaveAttribute("href", "#/invoices/inv%3Ai-2");
    fireEvent.click(
      screen.getByRole("button", {
        name: "Keep $50.00 for damage, return $0.00",
      }),
    );
    expect(step).toHaveBeenCalledWith("p-1", "b-1", "deposit/end", null);
    expect(await screen.findByText(/Kept \$50\.00/)).toBeInTheDocument();
  });

  it("TEST-FE-1611 adds a late check-out and shows its own Invoice once the stay is billed", async () => {
    const billed: Booking = {
      ...TODAY_STAY,
      payment: "PAID",
      invoice: INVOICE,
    };
    const step = vi.fn(() =>
      Promise.resolve({
        ...billed,
        payment: "UNPAID" as const,
        late_check_out: true,
        version: 2,
        extra_invoices: [
          {
            invoice_id: "i-3",
            invoice_number: "INV-000125",
            status: "UNPAID",
            kind: "LATE_CHECK_OUT" as const,
            total_usd_cents: 500,
          },
        ],
      }),
    );
    show({
      api: fakeApi({ get: vi.fn(() => Promise.resolve(billed)), step }),
    });
    go("#/shortstays/st:b-1");
    expect(
      await screen.findByText("Check-in from 14:00, check-out by 12:00"),
    ).toBeInTheDocument();
    expect(screen.getByText("$5.00 each for this stay.")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Add late check-out (until 18:00)" }),
    );
    expect(step).toHaveBeenCalledWith("p-1", "b-1", "fee", {
      version: 1,
      kind: "LATE_CHECK_OUT",
    });
    expect(
      await screen.findByRole("link", {
        name: "Late check-out: Invoice INV-000125",
      }),
    ).toHaveAttribute("href", "#/invoices/inv%3Ai-3");
    expect(
      screen.getByText("Late check-out added (until 18:00)"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Add late check-out/ }),
    ).toBeNull();
    // Still one early check-in to offer before the guest is in.
    expect(
      screen.getByRole("button", { name: "Add early check-in" }),
    ).toBeInTheDocument();
  });

  it("TEST-FE-1612 prices an extension before the desk extends the stay", async () => {
    const price = vi.fn(() =>
      Promise.resolve({ ...price0(), total_usd_cents: 12180 }),
    );
    const step = vi.fn(() =>
      Promise.resolve({
        ...TODAY_STAY,
        check_out_on: "2026-11-10",
        nights: 6,
        total_usd_cents: 12180,
        version: 2,
      }),
    );
    show({
      api: fakeApi({
        get: vi.fn(() => Promise.resolve(TODAY_STAY)),
        price,
        step,
      }),
    });
    go("#/shortstays/st:b-1");
    const card = within(
      await screen.findByRole("region", { name: "Extend the stay" }),
    );
    // The first day offered is the day after the check-out day.
    await waitFor(() => {
      expect(price).toHaveBeenCalledWith(
        "p-1",
        "u-501",
        "2026-11-04",
        "2026-11-08",
      );
    });
    fireEvent.change(card.getByLabelText("New check-out day"), {
      target: { value: "2026-11-10" },
    });
    await waitFor(() => {
      expect(price).toHaveBeenLastCalledWith(
        "p-1",
        "u-501",
        "2026-11-04",
        "2026-11-10",
      );
    });
    expect(
      await card.findByText("New total $121.80: $60.90 more."),
    ).toBeInTheDocument();
    fireEvent.click(card.getByRole("button", { name: /Extend/ }));
    expect(step).toHaveBeenCalledWith("p-1", "b-1", "extend", {
      version: 1,
      check_out_on: "2026-11-10",
    });
    expect(await screen.findByText("6 nights")).toBeInTheDocument();
  });

  it("TEST-FE-1613 lists the day's cleans and skips one only with a reason", async () => {
    const day = {
      day: "2026-11-04",
      today: "2026-11-04",
      tasks: [
        {
          task_id: "t-1",
          kind: "DAILY_CLEAN" as const,
          task_on: "2026-11-04",
          status: "TO_DO" as const,
          note: null,
          done_at: null,
          unit_id: "u-501",
          unit_number: "U501",
          booking_id: "b-1",
          booking_number: "ST260001",
          guest_name: "Lim Dara",
          late: false,
        },
        {
          task_id: "t-2",
          kind: "ROOM_CHECK" as const,
          task_on: "2026-11-03",
          status: "TO_DO" as const,
          note: null,
          done_at: null,
          unit_id: "u-503",
          unit_number: "U503",
          booking_id: "b-9",
          booking_number: "ST260009",
          guest_name: "Meas Rina",
          late: true,
        },
      ],
    };
    const cleaning = vi.fn(() => Promise.resolve(day));
    const finishTask = vi.fn(() => Promise.resolve(day));
    show({
      api: fakeApi({ cleaning, finishTask }),
      capabilities: new Set([...DESK, "short_stays.housekeeping"]),
    });
    fireEvent.click(await screen.findByRole("button", { name: "Cleaning" }));
    expect(await screen.findByText("Daily clean")).toBeInTheDocument();
    expect(cleaning).toHaveBeenCalledWith("p-1", "2026-11-04");
    expect(screen.getByText("2 to do")).toBeInTheDocument();
    expect(screen.getByText("Due 03/11/2026")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Do the room check" }),
    ).toHaveAttribute("href", "#/shortstays/st%3Ab-9");
    fireEvent.click(screen.getByRole("button", { name: "Skip" }));
    fireEvent.click(screen.getByRole("button", { name: "Skip" }));
    expect(
      await screen.findByText("A skipped clean says why."),
    ).toBeInTheDocument();
    expect(finishTask).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText(/Why it is skipped/), {
      target: { value: "Do not disturb" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Skip" }));
    await waitFor(() => {
      expect(finishTask).toHaveBeenCalledWith("p-1", "t-1", {
        skip: true,
        note: "Do not disturb",
      });
    });
    fireEvent.click(screen.getByRole("button", { name: /Next day/ }));
    await waitFor(() => {
      expect(cleaning).toHaveBeenLastCalledWith("p-1", "2026-11-05");
    });
  });

  it("TEST-FE-1614 cancels with a reason and says the money comes back as credit", async () => {
    const early: Booking = {
      ...BOOKING,
      check_in_on: "2026-11-10",
      check_out_on: "2026-11-12",
      free_cancel_until: "2026-11-08",
      payment: "PAID",
      invoice: INVOICE,
    };
    const step = vi.fn(() =>
      Promise.resolve({
        ...early,
        status: "CANCELLED" as const,
        cancel_reason: "Flight changed",
        version: 2,
        cancellation: {
          kind: "CANCELLED" as const,
          free: true,
          paid_usd_cents: 6090,
          back_usd_cents: 6090,
          kept_usd_cents: 0,
        },
      }),
    );
    show({
      api: fakeApi({ get: vi.fn(() => Promise.resolve(early)), step }),
      capabilities: new Set([...DESK, "customers.read"]),
    });
    go("#/shortstays/st:b-1");
    const card = within(await screen.findByRole("region", { name: "Cancel" }));
    expect(
      card.getByText(
        "Free cancel until 08/11/2026 at 23:59: the money paid comes back.",
      ),
    ).toBeInTheDocument();
    // Not the check-in day yet: no "did not come".
    expect(
      card.queryByRole("button", { name: "The guest did not come" }),
    ).toBeNull();
    fireEvent.click(card.getByRole("button", { name: "Cancel the booking" }));
    expect(card.getByText("Say why.")).toBeInTheDocument();
    expect(step).not.toHaveBeenCalled();
    fireEvent.change(card.getByLabelText(/Why/), {
      target: { value: "Flight changed" },
    });
    fireEvent.click(card.getByRole("button", { name: "Cancel the booking" }));
    expect(step).toHaveBeenCalledWith("p-1", "b-1", "cancel", {
      version: 1,
      reason: "Flight changed",
    });
    expect(
      await screen.findByText(
        "$60.90 is now Customer Credit of the guest. Pay it back on Refund of Credit.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Cancel" })).toBeNull();
    expect(
      screen.getByRole("link", { name: "Open the guest's credit" }),
    ).toHaveAttribute("href", "#/customers/c-1");
  });

  it("TEST-FE-1615 gives credit after a late cancel, up to the money kept", async () => {
    const late: Booking = {
      ...BOOKING,
      status: "NO_SHOW",
      cancel_reason: "Did not come",
      payment: "PAID",
      invoice: INVOICE,
      cancellation: {
        kind: "NO_SHOW",
        free: false,
        paid_usd_cents: 6090,
        back_usd_cents: 0,
        kept_usd_cents: 6090,
      },
    };
    const step = vi.fn(() =>
      Promise.resolve({
        ...late,
        credit: { amount_usd_cents: 2000, use_by: "2027-05-04", note: "Sick" },
      }),
    );
    show({
      api: fakeApi({ get: vi.fn(() => Promise.resolve(late)), step }),
      capabilities: new Set([...DESK, "short_stays.credit"]),
    });
    go("#/shortstays/st:b-1");
    expect(await screen.findByText("$60.90 is kept.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Credit \(US\$\)/), {
      target: { value: "70" },
    });
    fireEvent.change(screen.getByLabelText(/^Why/), {
      target: { value: "Sick" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Give credit" }));
    expect(
      screen.getByText("Type an amount up to $60.90."),
    ).toBeInTheDocument();
    expect(step).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText(/Credit \(US\$\)/), {
      target: { value: "20" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Give credit" }));
    expect(step).toHaveBeenCalledWith("p-1", "b-1", "credit", {
      amount_usd_cents: 2000,
      note: "Sick",
    });
    expect(
      await screen.findByText("$20.00 credit, to use by 04/05/2027."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Give credit" })).toBeNull();
  });

  it("TEST-FE-1605 speaks Khmer and hides New booking without the front-desk right", async () => {
    show({ capabilities: new Set(["short_stays.read"]), language: "km" });
    expect(await screen.findByRole("table")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "ប្រតិទិន" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /ការកក់ថ្មី/ })).toBeNull();
    expect(screen.getAllByText("ទំនេរ").length).toBeGreaterThan(0);
  });
});
