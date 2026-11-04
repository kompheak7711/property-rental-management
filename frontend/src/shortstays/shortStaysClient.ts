// Daily and weekly rent, phase 6 step 2: Tenants › Short stays. The calendar, the price box and
// bookings. The server prices every stay from the owner's rules and checks every right; this
// client only reads and sends.

export type BookingStatus =
  | "BOOKED"
  | "CHECKED_IN"
  | "CHECKED_OUT"
  | "CANCELLED"
  | "NO_SHOW";
export type BookingSource =
  | "WALK_IN"
  | "PHONE"
  | "TELEGRAM"
  | "WEBSITE"
  | "BOOKING_SITE";
export type PriceKind =
  | "NIGHTS"
  | "WEEKS"
  | "EARLY_CHECK_IN"
  | "LATE_CHECK_OUT"
  | "RETURNING_GUEST"
  | "EXTRA_DISCOUNT";

export const SOURCES: readonly BookingSource[] = [
  "WALK_IN",
  "PHONE",
  "TELEGRAM",
  "WEBSITE",
  "BOOKING_SITE",
];
const STATUSES: readonly BookingStatus[] = [
  "BOOKED",
  "CHECKED_IN",
  "CHECKED_OUT",
  "CANCELLED",
  "NO_SHOW",
];
const KINDS: readonly PriceKind[] = [
  "NIGHTS",
  "WEEKS",
  "EARLY_CHECK_IN",
  "LATE_CHECK_OUT",
  "RETURNING_GUEST",
  "EXTRA_DISCOUNT",
];

export interface PriceLine {
  position: number;
  kind: PriceKind;
  quantity: number;
  unit_price_usd_cents: number;
  discount_basis_points: number;
  amount_usd_cents: number;
}

export interface StayPrice {
  unit_id: string;
  unit_number: string;
  unit_type: string;
  check_in_on: string;
  check_out_on: string;
  nights: number;
  night_usd_cents: number;
  week_usd_cents: number;
  total_usd_cents: number;
  charged_as_whole_weeks: boolean;
  lines: PriceLine[];
  month_only_usd_cents: number | null;
  suggest_month: boolean;
  /** Why the Unit cannot be booked for these nights: PAST, BOOKED, LEASE, RESERVED … */
  blockers: string[];
}

export interface CalendarBooking {
  booking_id: string;
  booking_number: string;
  guest_name: string;
  status: BookingStatus;
  source: BookingSource;
  check_in_on: string;
  check_out_on: string;
}

export interface CalendarUnit {
  unit_id: string;
  unit_number: string;
  unit_type: string;
  status: string;
  for_rent: boolean;
  monthly_rent_usd_cents: number | null;
  bookings: CalendarBooking[];
  leases: { lease_id: string; start_date: string; end_date: string }[];
  reserved: boolean;
}

export interface StayCalendar {
  from: string;
  days: number;
  today: string;
  units: CalendarUnit[];
}

export interface BookingHistoryEntry {
  kind: string;
  occurred_at: string;
  note: string | null;
}

export interface Booking {
  booking_id: string;
  booking_number: string;
  unit_id: string;
  unit_number: string;
  unit_type: string;
  customer_id: string;
  guest_name: string;
  guest_phone: string | null;
  guest_count: number;
  check_in_on: string;
  check_out_on: string;
  nights: number;
  source: BookingSource;
  site_name: string | null;
  site_reference: string | null;
  note: string | null;
  status: BookingStatus;
  total_usd_cents: number;
  version: number;
  created_at: string;
  lines: PriceLine[];
  history: BookingHistoryEntry[];
}

export interface NewBooking {
  unit_id: string;
  customer_id: string;
  guest_count: number;
  check_in_on: string;
  check_out_on: string;
  source: BookingSource;
  site_name?: string;
  site_reference?: string;
  note?: string;
}

export interface ShortStaysApi {
  calendar: (
    propertyId: string,
    from: string,
    days: number,
  ) => Promise<StayCalendar>;
  price: (
    propertyId: string,
    unitId: string,
    checkIn: string,
    checkOut: string,
  ) => Promise<StayPrice>;
  list: (propertyId: string) => Promise<Booking[]>;
  get: (propertyId: string, bookingId: string) => Promise<Booking>;
  book: (propertyId: string, booking: NewBooking) => Promise<Booking>;
}

export class ShortStaysError extends Error {
  /** The HTTP status when the server answered: 403 no right, 404, 409 taken or not bookable,
   * 422 refused. */
  constructor(
    readonly status: number | null = null,
    readonly detail: string | null = null,
  ) {
    super("The short-stay command was not completed.");
    this.name = "ShortStaysError";
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function csrfToken(): string {
  const prefix = "__Host-prm_csrf=";
  const entry = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));
  if (entry === undefined) throw new ShortStaysError();
  const token = decodeURIComponent(entry.slice(prefix.length));
  if (token === "") throw new ShortStaysError();
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
    throw new ShortStaysError();
  }
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok) {
    const detail =
      isObject(payload) && typeof payload.detail === "string"
        ? payload.detail
        : null;
    throw new ShortStaysError(response.status, detail);
  }
  if (!isObject(payload) || !("data" in payload)) throw new ShortStaysError();
  return payload.data;
}

function text(value: unknown): string {
  if (typeof value !== "string") throw new ShortStaysError();
  return value;
}

function maybeText(value: unknown): string | null {
  return value === null || value === undefined ? null : text(value);
}

function whole(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value))
    throw new ShortStaysError();
  return value;
}

function maybeWhole(value: unknown): number | null {
  return value === null || value === undefined ? null : whole(value);
}

function record(value: unknown): Record<string, unknown> {
  if (!isObject(value)) throw new ShortStaysError();
  return value;
}

function list(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new ShortStaysError();
  return value;
}

function oneOf<T extends string>(values: readonly T[], value: unknown): T {
  const found = values.find((entry) => entry === value);
  if (found === undefined) throw new ShortStaysError();
  return found;
}

function lineOf(value: unknown): PriceLine {
  const row = record(value);
  return {
    position: whole(row.position),
    kind: oneOf(KINDS, row.kind),
    quantity: whole(row.quantity),
    unit_price_usd_cents: whole(row.unit_price_usd_cents),
    discount_basis_points: whole(row.discount_basis_points),
    amount_usd_cents: whole(row.amount_usd_cents),
  };
}

export function priceOf(value: unknown): StayPrice {
  const row = record(value);
  return {
    unit_id: text(row.unit_id),
    unit_number: text(row.unit_number),
    unit_type: text(row.unit_type),
    check_in_on: text(row.check_in_on),
    check_out_on: text(row.check_out_on),
    nights: whole(row.nights),
    night_usd_cents: whole(row.night_usd_cents),
    week_usd_cents: whole(row.week_usd_cents),
    total_usd_cents: whole(row.total_usd_cents),
    charged_as_whole_weeks: row.charged_as_whole_weeks === true,
    lines: list(row.lines).map(lineOf),
    month_only_usd_cents: maybeWhole(row.month_only_usd_cents),
    suggest_month: row.suggest_month === true,
    blockers: list(row.blockers).map(text),
  };
}

export function calendarOf(value: unknown): StayCalendar {
  const row = record(value);
  return {
    from: text(row.from),
    days: whole(row.days),
    today: text(row.today),
    units: list(row.units).map((entry) => {
      const unit = record(entry);
      return {
        unit_id: text(unit.unit_id),
        unit_number: text(unit.unit_number),
        unit_type: text(unit.unit_type),
        status: text(unit.status),
        for_rent: unit.for_rent !== false,
        monthly_rent_usd_cents: maybeWhole(unit.monthly_rent_usd_cents),
        bookings: list(unit.bookings).map((item) => {
          const booking = record(item);
          return {
            booking_id: text(booking.booking_id),
            booking_number: text(booking.booking_number),
            guest_name: text(booking.guest_name),
            status: oneOf(STATUSES, booking.status),
            source: oneOf(SOURCES, booking.source),
            check_in_on: text(booking.check_in_on),
            check_out_on: text(booking.check_out_on),
          };
        }),
        leases: list(unit.leases).map((item) => {
          const lease = record(item);
          return {
            lease_id: text(lease.lease_id),
            start_date: text(lease.start_date),
            end_date: text(lease.end_date),
          };
        }),
        reserved: unit.reserved === true,
      };
    }),
  };
}

export function bookingOf(value: unknown): Booking {
  const row = record(value);
  return {
    booking_id: text(row.booking_id),
    booking_number: text(row.booking_number),
    unit_id: text(row.unit_id),
    unit_number: text(row.unit_number),
    unit_type: text(row.unit_type),
    customer_id: text(row.customer_id),
    guest_name: text(row.guest_name),
    guest_phone: maybeText(row.guest_phone),
    guest_count: whole(row.guest_count),
    check_in_on: text(row.check_in_on),
    check_out_on: text(row.check_out_on),
    nights: whole(row.nights),
    source: oneOf(SOURCES, row.source),
    site_name: maybeText(row.site_name),
    site_reference: maybeText(row.site_reference),
    note: maybeText(row.note),
    status: oneOf(STATUSES, row.status),
    total_usd_cents: whole(row.total_usd_cents),
    version: whole(row.version),
    created_at: text(row.created_at),
    lines: list(row.lines).map(lineOf),
    history: list(row.history).map((entry) => {
      const event = record(entry);
      return {
        kind: text(event.kind),
        occurred_at: text(event.occurred_at),
        note: maybeText(event.note),
      };
    }),
  };
}

function base(propertyId: string): string {
  return `/api/v1/properties/${encodeURIComponent(propertyId)}/short-stays`;
}

export const shortStaysApi: ShortStaysApi = {
  calendar: async (propertyId, from, days) =>
    calendarOf(
      await request(
        `${base(propertyId)}/calendar?from=${encodeURIComponent(from)}&days=${String(days)}`,
      ),
    ),
  price: async (propertyId, unitId, checkIn, checkOut) =>
    priceOf(
      await request(
        `${base(propertyId)}/price?unit_id=${encodeURIComponent(unitId)}` +
          `&check_in_on=${encodeURIComponent(checkIn)}` +
          `&check_out_on=${encodeURIComponent(checkOut)}`,
      ),
    ),
  list: async (propertyId) =>
    list(await request(`${base(propertyId)}/bookings`)).map(bookingOf),
  get: async (propertyId, bookingId) =>
    bookingOf(
      await request(
        `${base(propertyId)}/bookings/${encodeURIComponent(bookingId)}`,
      ),
    ),
  book: async (propertyId, booking) =>
    bookingOf(
      await request(`${base(propertyId)}/bookings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken(),
        },
        body: JSON.stringify(booking),
      }),
    ),
};

/** Adds days to an ISO day ("2026-11-04" + 3 → "2026-11-07"), in UTC so no clock shifts it. */
export function addDays(day: string, days: number): string {
  const moment = new Date(`${day}T00:00:00Z`);
  moment.setUTCDate(moment.getUTCDate() + days);
  return moment.toISOString().slice(0, 10);
}

/** Whole days from one ISO day to another. */
export function daysBetween(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
      86400000,
  );
}
