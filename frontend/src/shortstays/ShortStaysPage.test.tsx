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

function price(extra: Partial<StayPrice> = {}): StayPrice {
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
};

function fakeApi(overrides: Partial<ShortStaysApi> = {}): ShortStaysApi {
  return {
    calendar: vi.fn((_: string, from: string, days: number) =>
      Promise.resolve(calendar(from, days)),
    ),
    price: vi.fn(() => Promise.resolve(price())),
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
    expect(within(u501).getAllByRole("link", { name: /Booked/ })).toHaveLength(
      2,
    );
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
          price({
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
          price({
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
