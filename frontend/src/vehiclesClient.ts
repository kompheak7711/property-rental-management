// DL-253 (parking step 3a): the vehicles of a Customer. The Customer page lists them with the
// space each one holds today; Add vehicle and Edit vehicle need Customers manage access. A
// vehicle is corrected, never deleted.

export type VehicleType = "CAR" | "MOTORBIKE" | "TUK_TUK" | "FOOD_CART";

export const VEHICLE_TYPES: readonly VehicleType[] = [
  "CAR",
  "MOTORBIKE",
  "TUK_TUK",
  "FOOD_CART",
];

export interface VehicleHold {
  hold_id: string;
  hold_kind: "ROOM_LEASE" | "PARKING_AGREEMENT";
  space_number: string;
  lease_id: string;
  lease_number: string | null;
  held_from: string;
  held_until: string | null;
}

export interface Vehicle {
  vehicle_id: string;
  vehicle_type: VehicleType;
  plate_text: string;
  colour: string | null;
  brand_model: string | null;
  sticker_number: string | null;
  version: number;
  holds: VehicleHold[];
}

export interface VehicleList {
  items: Vehicle[];
  can_manage: boolean;
}

export interface VehicleSource {
  vehicle_type: VehicleType;
  plate_text: string;
  colour: string | null;
  brand_model: string | null;
  sticker_number: string | null;
}

export interface VehicleApi {
  list: (customerId: string) => Promise<VehicleList>;
  create: (customerId: string, source: VehicleSource) => Promise<Vehicle>;
  update: (current: Vehicle, source: VehicleSource) => Promise<Vehicle>;
}

export type VehicleRefusal =
  | "VEHICLE_TYPE"
  | "CHANGED"
  | "INVALID"
  | "UNAVAILABLE"
  | "FAILED";

export class VehicleError extends Error {
  readonly code: VehicleRefusal;
  constructor(code: VehicleRefusal) {
    super(`The vehicle request was refused: ${code}`);
    this.name = "VehicleError";
    this.code = code;
  }
}

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
  if (token === null || token.length === 0) throw new VehicleError("FAILED");
  return {
    "Content-Type": "application/json",
    "X-CSRF-Token": token,
    ...(version === undefined ? {} : { "If-Match": `"${String(version)}"` }),
  };
}

async function request(
  path: string,
  init: RequestInit,
): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await fetch(path, { credentials: "include", ...init });
  } catch {
    throw new VehicleError("FAILED");
  }
  if (
    response.status === 401 ||
    response.status === 403 ||
    response.status === 404
  ) {
    throw new VehicleError("UNAVAILABLE");
  }
  if (response.status === 412) throw new VehicleError("CHANGED");
  if (response.status === 409) {
    let code: unknown = null;
    try {
      const payload: unknown = await response.json();
      if (isObject(payload) && isObject(payload.error))
        code = payload.error.code;
    } catch {
      // No coded answer.
    }
    throw new VehicleError(
      code === "VEHICLE_TYPE" ? "VEHICLE_TYPE" : "CHANGED",
    );
  }
  if (response.status === 422) throw new VehicleError("INVALID");
  if (!response.ok) throw new VehicleError("FAILED");
  try {
    const payload: unknown = await response.json();
    if (!isObject(payload) || !isObject(payload.data)) {
      throw new VehicleError("FAILED");
    }
    return payload.data;
  } catch {
    throw new VehicleError("FAILED");
  }
}

function text(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function hold(value: unknown): VehicleHold {
  if (
    !isObject(value) ||
    typeof value.hold_id !== "string" ||
    (value.hold_kind !== "ROOM_LEASE" &&
      value.hold_kind !== "PARKING_AGREEMENT") ||
    typeof value.space_number !== "string" ||
    typeof value.lease_id !== "string" ||
    typeof value.held_from !== "string"
  ) {
    throw new VehicleError("FAILED");
  }
  return {
    hold_id: value.hold_id,
    hold_kind: value.hold_kind,
    space_number: value.space_number,
    lease_id: value.lease_id,
    lease_number: text(value.lease_number),
    held_from: value.held_from,
    held_until: text(value.held_until),
  };
}

export function vehicle(value: unknown): Vehicle {
  const type = isObject(value)
    ? VEHICLE_TYPES.find((item) => item === value.vehicle_type)
    : undefined;
  if (
    !isObject(value) ||
    type === undefined ||
    typeof value.vehicle_id !== "string" ||
    typeof value.plate_text !== "string" ||
    typeof value.version !== "number"
  ) {
    throw new VehicleError("FAILED");
  }
  return {
    vehicle_id: value.vehicle_id,
    vehicle_type: type,
    plate_text: value.plate_text,
    colour: text(value.colour),
    brand_model: text(value.brand_model),
    sticker_number: text(value.sticker_number),
    version: value.version,
    holds: Array.isArray(value.holds) ? value.holds.map(hold) : [],
  };
}

async function list(customerId: string): Promise<VehicleList> {
  const data = await request(
    `/customers/${encodeURIComponent(customerId)}/vehicles`,
    { method: "GET" },
  );
  if (!Array.isArray(data.items) || typeof data.can_manage !== "boolean") {
    throw new VehicleError("FAILED");
  }
  return { items: data.items.map(vehicle), can_manage: data.can_manage };
}

async function create(
  customerId: string,
  source: VehicleSource,
): Promise<Vehicle> {
  return vehicle(
    await request(`/customers/${encodeURIComponent(customerId)}/vehicles`, {
      method: "POST",
      headers: mutationHeaders(),
      body: JSON.stringify(source),
    }),
  );
}

async function update(
  current: Vehicle,
  source: VehicleSource,
): Promise<Vehicle> {
  return vehicle(
    await request(`/vehicles/${encodeURIComponent(current.vehicle_id)}`, {
      method: "PUT",
      headers: mutationHeaders(current.version),
      body: JSON.stringify(source),
    }),
  );
}

export const vehicleApi: VehicleApi = { list, create, update };
