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
  /** Paid in full (or on the booking site); an unpaid booking shows a dashed square. */
  paid: boolean;
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

/** Step 3: how the stay is paid. */
export type PaymentState =
  | "NOT_BILLED"
  | "UNPAID"
  | "PARTIALLY_PAID"
  | "PAID"
  | "PAID_ON_SITE";
const PAYMENTS: readonly PaymentState[] = [
  "NOT_BILLED",
  "UNPAID",
  "PARTIALLY_PAID",
  "PAID",
  "PAID_ON_SITE",
];

export interface StayDeposit {
  deposit_id: string;
  kind: "CASH" | "CARD_HOLD";
  amount_usd_cents: number;
  hold_reference: string | null;
  card_last4: string | null;
  status: "HELD" | "RETURNED" | "KEPT";
  kept_usd_cents: number;
  taken_at: string;
  ended_at: string | null;
}

export interface RoomCheck {
  task_id: string;
  task_on: string;
  status: "TO_DO" | "DONE" | "SKIPPED";
  note: string | null;
  done_at: string | null;
}

export interface StayDamage {
  damage_id: string;
  description: string;
  amount_usd_cents: number;
  status: "WAITING" | "APPROVED" | "REFUSED";
  decided_at: string | null;
  decision_note: string | null;
  from_deposit_usd_cents: number;
  invoice_id: string | null;
  invoice_number: string | null;
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
  unit_status: string;
  guest_has_id: boolean;
  payment: PaymentState;
  invoice: {
    invoice_id: string;
    invoice_number: string;
    status: string;
    total_usd_cents: number;
  } | null;
  deposit: StayDeposit | null;
  room_check: RoomCheck | null;
  damages: StayDamage[];
  extra_invoices: ExtraInvoice[];
  early_check_in: boolean;
  late_check_out: boolean;
  /** What an early check-in or a late check-out costs this stay; 0 from 7 nights. */
  fee_usd_cents: number;
  /** Minutes after midnight. */
  check_in_time: number;
  check_out_time: number;
  late_check_out_until: number;
  cleans: DailyClean[];
  /** The last day of free cancel (until 23:59). */
  free_cancel_until: string;
  cancel_reason: string | null;
  paid_usd_cents: number;
  cancellation: StayCancellation | null;
  credit: StayCredit | null;
}

/** Step 3: the actions on one booking; each answers with the booking as it is now. */
export type StayStep =
  | "bill"
  | "paid-on-site"
  | "deposit"
  | "deposit/end"
  | "check-in"
  | "check-out"
  | "room-check"
  | "fee"
  | "extend"
  | "cancel"
  | "credit";

/** Step 4b: how a cancelled booking ended. */
export interface StayCancellation {
  kind: "CANCELLED" | "NO_SHOW";
  free: boolean;
  paid_usd_cents: number;
  /** Made Customer Credit, to pay back on Refund of Credit (free cancel). */
  back_usd_cents: number;
  /** Kept as income (late cancel or no-show). */
  kept_usd_cents: number;
}

export interface StayCredit {
  amount_usd_cents: number;
  use_by: string;
  note: string;
}

/** Step 4a: an Invoice for a fee or an extension, made after the stay was billed. */
export interface ExtraInvoice {
  invoice_id: string;
  invoice_number: string;
  status: string;
  kind: "EXTEND" | "EARLY_CHECK_IN" | "LATE_CHECK_OUT";
  total_usd_cents: number;
}

export interface DailyClean {
  task_id: string;
  task_on: string;
  status: "TO_DO" | "DONE" | "SKIPPED";
  note: string | null;
}

/** Step 4a: one task on the cleaning list of a day. */
export interface CleaningTask {
  task_id: string;
  kind: "DAILY_CLEAN" | "CHANGE_OVER" | "ROOM_CHECK";
  task_on: string;
  status: "TO_DO" | "DONE" | "SKIPPED";
  note: string | null;
  done_at: string | null;
  unit_id: string;
  unit_number: string;
  booking_id: string | null;
  booking_number: string | null;
  guest_name: string | null;
  /** Due on an earlier day and not done yet (shown today). */
  late: boolean;
}

export interface CleaningDay {
  day: string;
  today: string;
  tasks: CleaningTask[];
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
  step: (
    propertyId: string,
    bookingId: string,
    step: StayStep,
    body: Record<string, unknown> | null,
  ) => Promise<Booking>;
  decide: (
    propertyId: string,
    damageId: string,
    decision: { approve: boolean; note?: string },
  ) => Promise<Booking>;
  cleaning: (propertyId: string, day: string) => Promise<CleaningDay>;
  finishTask: (
    propertyId: string,
    taskId: string,
    finish: { skip: boolean; note?: string },
  ) => Promise<CleaningDay>;
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
            paid: booking.paid === true,
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

function depositOf(value: unknown): StayDeposit | null {
  if (value === null || value === undefined) return null;
  const row = record(value);
  return {
    deposit_id: text(row.deposit_id),
    kind: oneOf(["CASH", "CARD_HOLD"] as const, row.kind),
    amount_usd_cents: whole(row.amount_usd_cents),
    hold_reference: maybeText(row.hold_reference),
    card_last4: maybeText(row.card_last4),
    status: oneOf(["HELD", "RETURNED", "KEPT"] as const, row.status),
    kept_usd_cents: whole(row.kept_usd_cents),
    taken_at: text(row.taken_at),
    ended_at: maybeText(row.ended_at),
  };
}

function roomCheckOf(value: unknown): RoomCheck | null {
  if (value === null || value === undefined) return null;
  const row = record(value);
  return {
    task_id: text(row.task_id),
    task_on: text(row.task_on),
    status: oneOf(["TO_DO", "DONE", "SKIPPED"] as const, row.status),
    note: maybeText(row.note),
    done_at: maybeText(row.done_at),
  };
}

function damageOf(value: unknown): StayDamage {
  const row = record(value);
  return {
    damage_id: text(row.damage_id),
    description: text(row.description),
    amount_usd_cents: whole(row.amount_usd_cents),
    status: oneOf(["WAITING", "APPROVED", "REFUSED"] as const, row.status),
    decided_at: maybeText(row.decided_at),
    decision_note: maybeText(row.decision_note),
    from_deposit_usd_cents: whole(row.from_deposit_usd_cents),
    invoice_id: maybeText(row.invoice_id),
    invoice_number: maybeText(row.invoice_number),
  };
}

export function bookingOf(value: unknown): Booking {
  const row = record(value);
  const invoice =
    row.invoice === null || row.invoice === undefined
      ? null
      : record(row.invoice);
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
    unit_status: text(row.unit_status),
    guest_has_id: row.guest_has_id === true,
    payment: oneOf(PAYMENTS, row.payment),
    invoice:
      invoice === null
        ? null
        : {
            invoice_id: text(invoice.invoice_id),
            invoice_number: text(invoice.invoice_number),
            status: text(invoice.status),
            total_usd_cents: whole(invoice.total_usd_cents),
          },
    deposit: depositOf(row.deposit),
    room_check: roomCheckOf(row.room_check),
    damages: list(row.damages).map(damageOf),
    extra_invoices: list(row.extra_invoices).map((entry) => {
      const extra = record(entry);
      return {
        invoice_id: text(extra.invoice_id),
        invoice_number: text(extra.invoice_number),
        status: text(extra.status),
        kind: oneOf(EXTRA_KINDS, extra.kind),
        total_usd_cents: whole(extra.total_usd_cents),
      };
    }),
    early_check_in: row.early_check_in === true,
    late_check_out: row.late_check_out === true,
    fee_usd_cents: whole(row.fee_usd_cents),
    check_in_time: whole(row.check_in_time),
    check_out_time: whole(row.check_out_time),
    late_check_out_until: whole(row.late_check_out_until),
    cleans: list(row.cleans).map((entry) => {
      const clean = record(entry);
      return {
        task_id: text(clean.task_id),
        task_on: text(clean.task_on),
        status: oneOf(TASK_STATUSES, clean.status),
        note: maybeText(clean.note),
      };
    }),
    free_cancel_until: text(row.free_cancel_until),
    cancel_reason: maybeText(row.cancel_reason),
    paid_usd_cents: whole(row.paid_usd_cents),
    cancellation:
      row.cancellation === null || row.cancellation === undefined
        ? null
        : cancellationOf(record(row.cancellation)),
    credit:
      row.credit === null || row.credit === undefined
        ? null
        : creditOf(record(row.credit)),
  };
}

function cancellationOf(row: Record<string, unknown>): StayCancellation {
  return {
    kind: oneOf(["CANCELLED", "NO_SHOW"] as const, row.kind),
    free: row.free === true,
    paid_usd_cents: whole(row.paid_usd_cents),
    back_usd_cents: whole(row.back_usd_cents),
    kept_usd_cents: whole(row.kept_usd_cents),
  };
}

function creditOf(row: Record<string, unknown>): StayCredit {
  return {
    amount_usd_cents: whole(row.amount_usd_cents),
    use_by: text(row.use_by),
    note: text(row.note),
  };
}

const EXTRA_KINDS = ["EXTEND", "EARLY_CHECK_IN", "LATE_CHECK_OUT"] as const;
const TASK_STATUSES = ["TO_DO", "DONE", "SKIPPED"] as const;
const TASK_KINDS = ["DAILY_CLEAN", "CHANGE_OVER", "ROOM_CHECK"] as const;

export function cleaningOf(value: unknown): CleaningDay {
  const row = record(value);
  return {
    day: text(row.day),
    today: text(row.today),
    tasks: list(row.tasks).map((entry) => {
      const task = record(entry);
      return {
        task_id: text(task.task_id),
        kind: oneOf(TASK_KINDS, task.kind),
        task_on: text(task.task_on),
        status: oneOf(TASK_STATUSES, task.status),
        note: maybeText(task.note),
        done_at: maybeText(task.done_at),
        unit_id: text(task.unit_id),
        unit_number: text(task.unit_number),
        booking_id: maybeText(task.booking_id),
        booking_number: maybeText(task.booking_number),
        guest_name: maybeText(task.guest_name),
        late: task.late === true,
      };
    }),
  };
}

function base(propertyId: string): string {
  return `/api/v1/properties/${encodeURIComponent(propertyId)}/short-stays`;
}

function post(body: unknown): RequestInit {
  return {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-Token": csrfToken(),
    },
    ...(body === null ? {} : { body: JSON.stringify(body) }),
  };
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
    bookingOf(await request(`${base(propertyId)}/bookings`, post(booking))),
  step: async (propertyId, bookingId, step, body) =>
    bookingOf(
      await request(
        `${base(propertyId)}/bookings/${encodeURIComponent(bookingId)}/${step}`,
        post(body),
      ),
    ),
  decide: async (propertyId, damageId, decision) =>
    bookingOf(
      await request(
        `${base(propertyId)}/damages/${encodeURIComponent(damageId)}/decision`,
        post(decision),
      ),
    ),
  cleaning: async (propertyId, day) =>
    cleaningOf(
      await request(
        `${base(propertyId)}/housekeeping?day=${encodeURIComponent(day)}`,
      ),
    ),
  finishTask: async (propertyId, taskId, finish) =>
    cleaningOf(
      await request(
        `${base(propertyId)}/housekeeping/${encodeURIComponent(taskId)}`,
        post(finish),
      ),
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
