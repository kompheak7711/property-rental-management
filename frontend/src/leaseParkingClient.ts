// DL-253 (parking step 3b): parking on a room Lease. A Lease that holds a parking Service picks
// a space (and a vehicle of someone on the Lease). The owner's rule of 20 Nov 2026: the tenant
// pays the price of the space picked; it is copied when the space is picked and never changes.

import { VEHICLE_TYPES, type VehicleType } from "./vehiclesClient";

export interface LeaseParkingHold {
  hold_id: string;
  space_number: string;
  parking_type: string | null;
  plate_text: string | null;
  held_from: string;
  held_until: string | null;
  monthly_price_usd_cents: number | null;
}

export interface FreeSpace {
  unit_id: string;
  unit_number: string;
  parking_type: string;
  area: string | null;
  monthly_price_usd_cents: number;
}

export interface LeaseParkingTerm {
  lease_service_term_id: string;
  service_name: string;
  service_name_km: string | null;
  held_from: string;
  held_until: string | null;
  hold: LeaseParkingHold | null;
  free_spaces: FreeSpace[];
}

export interface LeaseParkingVehicle {
  vehicle_id: string;
  vehicle_type: VehicleType;
  plate_text: string;
  customer_name: string | null;
}

// DL-254 (parking step 4b): a Parking agreement is a Lease on the space itself.
export interface AgreementSpace {
  unit_id: string;
  unit_number: string;
  parking_type: string | null;
  area: string | null;
}

export interface AgreementHold {
  hold_id: string;
  vehicle_id: string | null;
  plate_text: string | null;
  held_from: string;
  held_until: string | null;
}

export interface LeaseParking {
  lease_status: string;
  terms: LeaseParkingTerm[];
  vehicles: LeaseParkingVehicle[];
  can_pick: boolean;
  on_parking_space: boolean;
  month_to_month: boolean;
  space: AgreementSpace | null;
  agreement_hold: AgreementHold | null;
}

export interface LeaseParkingPick {
  lease_service_term_id: string;
  space_unit_id: string;
  vehicle_id: string | null;
}

export interface LeaseParkingApi {
  read: (leaseId: string) => Promise<LeaseParking>;
  pick: (leaseId: string, pick: LeaseParkingPick) => Promise<LeaseParkingHold>;
  pickVehicle: (leaseId: string, vehicleId: string) => Promise<AgreementHold>;
}

export type LeaseParkingRefusal =
  | "PARKING_ALREADY_HELD"
  | "PARKING_SPACE_TAKEN"
  | "VEHICLE_TYPE"
  | "VEHICLE_NOT_OF_LEASE"
  | "PARKING_KEPT_FOR_GUESTS"
  | "TYPE_HAS_NO_PRICE"
  | "LEASE_CLOSED"
  | "AGREEMENT_DATES_MISSING"
  | "UNAVAILABLE"
  | "FAILED";

const KNOWN: readonly LeaseParkingRefusal[] = [
  "PARKING_ALREADY_HELD",
  "PARKING_SPACE_TAKEN",
  "VEHICLE_TYPE",
  "VEHICLE_NOT_OF_LEASE",
  "PARKING_KEPT_FOR_GUESTS",
  "TYPE_HAS_NO_PRICE",
  "LEASE_CLOSED",
  "AGREEMENT_DATES_MISSING",
];

export class LeaseParkingError extends Error {
  readonly code: LeaseParkingRefusal;
  constructor(code: LeaseParkingRefusal) {
    super(`The parking request was refused: ${code}`);
    this.name = "LeaseParkingError";
    this.code = code;
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function text(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function cents(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

function csrfToken(): string | null {
  const prefix = "__Host-prm_csrf=";
  const entry = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));
  return entry === undefined
    ? null
    : decodeURIComponent(entry.slice(prefix.length));
}

async function request(
  path: string,
  init: RequestInit,
): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await fetch(path, { credentials: "include", ...init });
  } catch {
    throw new LeaseParkingError("FAILED");
  }
  if ([401, 403, 404].includes(response.status)) {
    throw new LeaseParkingError("UNAVAILABLE");
  }
  if (response.status === 409) {
    let code: unknown = null;
    try {
      const payload: unknown = await response.json();
      if (isObject(payload) && isObject(payload.error))
        code = payload.error.code;
    } catch {
      // No coded answer.
    }
    throw new LeaseParkingError(
      KNOWN.find((item) => item === code) ?? "FAILED",
    );
  }
  if (!response.ok) throw new LeaseParkingError("FAILED");
  try {
    const payload: unknown = await response.json();
    if (!isObject(payload) || !isObject(payload.data)) {
      throw new LeaseParkingError("FAILED");
    }
    return payload.data;
  } catch {
    throw new LeaseParkingError("FAILED");
  }
}

function hold(value: unknown): LeaseParkingHold {
  if (
    !isObject(value) ||
    typeof value.hold_id !== "string" ||
    typeof value.space_number !== "string" ||
    typeof value.held_from !== "string"
  ) {
    throw new LeaseParkingError("FAILED");
  }
  return {
    hold_id: value.hold_id,
    space_number: value.space_number,
    parking_type: text(value.parking_type),
    plate_text: text(value.plate_text),
    held_from: value.held_from,
    held_until: text(value.held_until),
    monthly_price_usd_cents: cents(value.monthly_price_usd_cents),
  };
}

function freeSpace(value: unknown): FreeSpace {
  if (
    !isObject(value) ||
    typeof value.unit_id !== "string" ||
    typeof value.unit_number !== "string" ||
    typeof value.parking_type !== "string" ||
    typeof value.monthly_price_usd_cents !== "number"
  ) {
    throw new LeaseParkingError("FAILED");
  }
  return {
    unit_id: value.unit_id,
    unit_number: value.unit_number,
    parking_type: value.parking_type,
    area: text(value.area),
    monthly_price_usd_cents: value.monthly_price_usd_cents,
  };
}

function term(value: unknown): LeaseParkingTerm {
  if (
    !isObject(value) ||
    typeof value.lease_service_term_id !== "string" ||
    typeof value.service_name !== "string" ||
    typeof value.held_from !== "string"
  ) {
    throw new LeaseParkingError("FAILED");
  }
  return {
    lease_service_term_id: value.lease_service_term_id,
    service_name: value.service_name,
    service_name_km: text(value.service_name_km),
    held_from: value.held_from,
    held_until: text(value.held_until),
    hold:
      value.hold === null || value.hold === undefined ? null : hold(value.hold),
    free_spaces: Array.isArray(value.free_spaces)
      ? value.free_spaces.map(freeSpace)
      : [],
  };
}

function vehicle(value: unknown): LeaseParkingVehicle {
  const type = isObject(value)
    ? VEHICLE_TYPES.find((item) => item === value.vehicle_type)
    : undefined;
  if (
    !isObject(value) ||
    type === undefined ||
    typeof value.vehicle_id !== "string" ||
    typeof value.plate_text !== "string"
  ) {
    throw new LeaseParkingError("FAILED");
  }
  return {
    vehicle_id: value.vehicle_id,
    vehicle_type: type,
    plate_text: value.plate_text,
    customer_name: text(value.customer_name),
  };
}

function agreementSpace(value: unknown): AgreementSpace | null {
  if (!isObject(value)) return null;
  if (
    typeof value.unit_id !== "string" ||
    typeof value.unit_number !== "string"
  ) {
    throw new LeaseParkingError("FAILED");
  }
  return {
    unit_id: value.unit_id,
    unit_number: value.unit_number,
    parking_type: text(value.parking_type),
    area: text(value.area),
  };
}

function agreementHold(value: unknown): AgreementHold {
  if (
    !isObject(value) ||
    typeof value.hold_id !== "string" ||
    typeof value.held_from !== "string"
  ) {
    throw new LeaseParkingError("FAILED");
  }
  return {
    hold_id: value.hold_id,
    vehicle_id: text(value.vehicle_id),
    plate_text: text(value.plate_text),
    held_from: value.held_from,
    held_until: text(value.held_until),
  };
}

async function read(leaseId: string): Promise<LeaseParking> {
  const data = await request(`/leases/${encodeURIComponent(leaseId)}/parking`, {
    method: "GET",
  });
  if (
    typeof data.lease_status !== "string" ||
    !Array.isArray(data.terms) ||
    typeof data.can_pick !== "boolean"
  ) {
    throw new LeaseParkingError("FAILED");
  }
  return {
    lease_status: data.lease_status,
    terms: data.terms.map(term),
    vehicles: Array.isArray(data.vehicles) ? data.vehicles.map(vehicle) : [],
    can_pick: data.can_pick,
    on_parking_space: data.on_parking_space === true,
    month_to_month: data.month_to_month === true,
    space: agreementSpace(data.space),
    agreement_hold: isObject(data.agreement_hold)
      ? agreementHold(data.agreement_hold)
      : null,
  };
}

async function pick(
  leaseId: string,
  choice: LeaseParkingPick,
): Promise<LeaseParkingHold> {
  const token = csrfToken();
  if (token === null || token.length === 0) {
    throw new LeaseParkingError("FAILED");
  }
  return hold(
    await request(`/leases/${encodeURIComponent(leaseId)}/parking-holds`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CSRF-Token": token },
      body: JSON.stringify(choice),
    }),
  );
}

async function pickVehicle(
  leaseId: string,
  vehicleId: string,
): Promise<AgreementHold> {
  const token = csrfToken();
  if (token === null || token.length === 0) {
    throw new LeaseParkingError("FAILED");
  }
  return agreementHold(
    await request(`/leases/${encodeURIComponent(leaseId)}/agreement-vehicle`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CSRF-Token": token },
      body: JSON.stringify({ vehicle_id: vehicleId }),
    }),
  );
}

export const leaseParkingApi: LeaseParkingApi = { read, pick, pickVehicle };
