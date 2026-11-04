// What one night of one Unit holds on the calendar, read the same way as the database's blockers
// (migration 20270601_311 app.short_stay_blockers): a booking covers [check-in, check-out), a
// Lease covers [start, end]. Display only: the server checks every night again.

import type { CalendarBooking, CalendarUnit } from "./shortStaysClient";

export type Night =
  | { kind: "FREE" }
  | { kind: "BOOKING"; booking: CalendarBooking; first: boolean }
  | { kind: "LEASE" }
  | { kind: "RESERVED" }
  | { kind: "NOT_FOR_RENT" }
  | { kind: "CLOSED" };

const CLOSED_STATUSES = ["UNDER_MAINTENANCE", "OUT_OF_SERVICE"];

/** A booking that still holds its nights (a guest who left keeps the square, shown done). */
function holds(booking: CalendarBooking, day: string): boolean {
  return booking.check_in_on <= day && day < booking.check_out_on;
}

export function nightOf(unit: CalendarUnit, day: string): Night {
  const booking = unit.bookings.find((entry) => holds(entry, day));
  if (booking !== undefined)
    return { kind: "BOOKING", booking, first: booking.check_in_on === day };
  if (
    unit.leases.some(
      (lease) => lease.start_date <= day && day <= lease.end_date,
    )
  )
    return { kind: "LEASE" };
  if (!unit.for_rent) return { kind: "NOT_FOR_RENT" };
  if (CLOSED_STATUSES.includes(unit.status)) return { kind: "CLOSED" };
  if (unit.reserved) return { kind: "RESERVED" };
  return { kind: "FREE" };
}

/** May this Unit be booked for every night from check-in to check-out? */
export function freeForStay(
  unit: CalendarUnit,
  checkIn: string,
  checkOut: string,
): boolean {
  if (!unit.for_rent || unit.reserved || CLOSED_STATUSES.includes(unit.status))
    return false;
  const taken = unit.bookings.some(
    (booking) =>
      (booking.status === "BOOKED" || booking.status === "CHECKED_IN") &&
      booking.check_in_on < checkOut &&
      checkIn < booking.check_out_on,
  );
  const leased = unit.leases.some(
    (lease) => lease.start_date < checkOut && checkIn <= lease.end_date,
  );
  return !taken && !leased;
}
