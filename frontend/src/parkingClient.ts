// DL-253 (parking step 2): parking spaces are Units of kind PARKING. The Parking page lists them
// with who holds each one today; New space and Edit space need Units manage access. A type price
// (Unit Type or Parking Type) is set in Settings › Unit setup.

export type HoldKind = "ROOM_LEASE" | "PARKING_AGREEMENT";

export interface ParkingHold {
  hold_id: string;
  hold_kind: HoldKind;
  lease_id: string;
  lease_number: string | null;
  customer_name: string | null;
  room_unit_number: string | null;
  plate_text: string | null;
  vehicle_type: string | null;
  held_from: string;
  held_until: string | null;
}

export interface ParkingSpace {
  unit_id: string;
  unit_number: string;
  building_id: string | null;
  parking_type: string;
  area: string;
  parking_capacity: number;
  kept_for_short_stay_guests: boolean;
  default_monthly_rent_usd_cents: number | null;
  /** The space uses the price of its Parking Type and moves with it. */
  rent_from_type: boolean;
  version: number;
  holds: ParkingHold[];
}

export interface ParkingList {
  items: ParkingSpace[];
  can_manage: boolean;
}

export interface ParkingSpaceSource {
  parking_type: string;
  area: string;
  parking_capacity: number;
  kept_for_short_stay_guests: boolean;
  /** null: the space uses its Parking Type price. */
  price_usd_cents: number | null;
}

export interface ParkingSpaceCreate extends ParkingSpaceSource {
  unit_number: string;
  building_id: string | null;
}

export interface TypePrice {
  item_id: string;
  version: number;
  default_monthly_rent_usd_cents: number | null;
}

export interface ParkingApi {
  list: (propertyId: string) => Promise<ParkingList>;
  create: (
    propertyId: string,
    source: ParkingSpaceCreate,
  ) => Promise<ParkingSpace>;
  update: (
    current: ParkingSpace,
    source: ParkingSpaceSource,
  ) => Promise<ParkingSpace>;
  /** Settings: the price of a Unit Type or Parking Type (null clears it). */
  setTypePrice: (
    item: { item_id: string; version: number },
    cents: number | null,
  ) => Promise<TypePrice>;
}

export type ParkingRefusal =
  | "NUMBER_TAKEN"
  | "TYPE_HAS_NO_PRICE"
  | "PARKING_CAPACITY"
  | "VEHICLE_TYPE"
  | "PARKING_KEPT_FOR_GUESTS"
  | "CHANGED"
  | "INVALID"
  | "UNAVAILABLE"
  | "FAILED";

export class ParkingError extends Error {
  readonly code: ParkingRefusal;
  constructor(code: ParkingRefusal) {
    super(`The parking request was refused: ${code}`);
    this.name = "ParkingError";
    this.code = code;
  }
}

const KNOWN: readonly ParkingRefusal[] = [
  "NUMBER_TAKEN",
  "TYPE_HAS_NO_PRICE",
  "PARKING_CAPACITY",
  "VEHICLE_TYPE",
  "PARKING_KEPT_FOR_GUESTS",
];

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
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

function mutationHeaders(version?: number): HeadersInit {
  const token = csrfToken();
  if (token === null || token.length === 0) throw new ParkingError("FAILED");
  return {
    "Content-Type": "application/json",
    "X-CSRF-Token": token,
    ...(version === undefined ? {} : { "If-Match": `"${String(version)}"` }),
  };
}

async function refusalOf(response: Response): Promise<ParkingRefusal | null> {
  try {
    const payload: unknown = await response.json();
    if (isObject(payload) && isObject(payload.error)) {
      const code = payload.error.code;
      const known = KNOWN.find((item) => item === code);
      if (known !== undefined) return known;
    }
  } catch {
    // No coded answer: the status decides below.
  }
  return null;
}

async function request(
  path: string,
  init: RequestInit,
): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await fetch(path, { credentials: "include", ...init });
  } catch {
    throw new ParkingError("FAILED");
  }
  if (response.status === 401 || response.status === 403) {
    throw new ParkingError("UNAVAILABLE");
  }
  if (response.status === 412) throw new ParkingError("CHANGED");
  if (response.status === 409 || response.status === 422) {
    const code = await refusalOf(response);
    throw new ParkingError(
      code ?? (response.status === 409 ? "CHANGED" : "INVALID"),
    );
  }
  if (!response.ok) throw new ParkingError("FAILED");
  try {
    const payload: unknown = await response.json();
    if (!isObject(payload) || !isObject(payload.data)) {
      throw new ParkingError("FAILED");
    }
    return payload.data;
  } catch {
    throw new ParkingError("FAILED");
  }
}

function text(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function hold(value: unknown): ParkingHold {
  if (
    !isObject(value) ||
    typeof value.hold_id !== "string" ||
    (value.hold_kind !== "ROOM_LEASE" &&
      value.hold_kind !== "PARKING_AGREEMENT") ||
    typeof value.lease_id !== "string" ||
    typeof value.held_from !== "string"
  ) {
    throw new ParkingError("FAILED");
  }
  return {
    hold_id: value.hold_id,
    hold_kind: value.hold_kind,
    lease_id: value.lease_id,
    lease_number: text(value.lease_number),
    customer_name: text(value.customer_name),
    room_unit_number: text(value.room_unit_number),
    plate_text: text(value.plate_text),
    vehicle_type: text(value.vehicle_type),
    held_from: value.held_from,
    held_until: text(value.held_until),
  };
}

export function parkingSpace(value: unknown): ParkingSpace {
  if (
    !isObject(value) ||
    typeof value.unit_id !== "string" ||
    typeof value.unit_number !== "string" ||
    typeof value.parking_type !== "string" ||
    typeof value.area !== "string" ||
    typeof value.parking_capacity !== "number" ||
    typeof value.kept_for_short_stay_guests !== "boolean" ||
    typeof value.rent_from_type !== "boolean" ||
    typeof value.version !== "number"
  ) {
    throw new ParkingError("FAILED");
  }
  return {
    unit_id: value.unit_id,
    unit_number: value.unit_number,
    building_id: text(value.building_id),
    parking_type: value.parking_type,
    area: value.area,
    parking_capacity: value.parking_capacity,
    kept_for_short_stay_guests: value.kept_for_short_stay_guests,
    default_monthly_rent_usd_cents:
      typeof value.default_monthly_rent_usd_cents === "number"
        ? value.default_monthly_rent_usd_cents
        : null,
    rent_from_type: value.rent_from_type,
    version: value.version,
    holds: Array.isArray(value.holds) ? value.holds.map(hold) : [],
  };
}

async function list(propertyId: string): Promise<ParkingList> {
  const data = await request(
    `/properties/${encodeURIComponent(propertyId)}/parking-spaces`,
    { method: "GET" },
  );
  if (!Array.isArray(data.items) || typeof data.can_manage !== "boolean") {
    throw new ParkingError("FAILED");
  }
  return { items: data.items.map(parkingSpace), can_manage: data.can_manage };
}

async function create(
  propertyId: string,
  source: ParkingSpaceCreate,
): Promise<ParkingSpace> {
  return parkingSpace(
    await request(
      `/properties/${encodeURIComponent(propertyId)}/parking-spaces`,
      {
        method: "POST",
        headers: mutationHeaders(),
        body: JSON.stringify(source),
      },
    ),
  );
}

async function update(
  current: ParkingSpace,
  source: ParkingSpaceSource,
): Promise<ParkingSpace> {
  return parkingSpace(
    await request(`/parking-spaces/${encodeURIComponent(current.unit_id)}`, {
      method: "PUT",
      headers: mutationHeaders(current.version),
      body: JSON.stringify(source),
    }),
  );
}

async function setTypePrice(
  item: { item_id: string; version: number },
  cents: number | null,
): Promise<TypePrice> {
  const data = await request(
    `/unit-setup/items/${encodeURIComponent(item.item_id)}/price`,
    {
      method: "PUT",
      headers: mutationHeaders(item.version),
      body: JSON.stringify({ default_monthly_rent_usd_cents: cents }),
    },
  );
  if (typeof data.item_id !== "string" || typeof data.version !== "number") {
    throw new ParkingError("FAILED");
  }
  return {
    item_id: data.item_id,
    version: data.version,
    default_monthly_rent_usd_cents:
      typeof data.default_monthly_rent_usd_cents === "number"
        ? data.default_monthly_rent_usd_cents
        : null,
  };
}

export const parkingApi: ParkingApi = { list, create, update, setTypePrice };
