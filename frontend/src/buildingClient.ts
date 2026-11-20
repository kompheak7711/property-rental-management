// DL-250: buildings under the one business. The owner can add a second building later in
// Settings › Unit setup › Buildings; building names show in the app only with two or more.

export interface Building {
  building_id: string;
  property_id: string;
  name_en: string;
  name_km: string | null;
  address_text: string | null;
  description: string | null;
  takes_short_stays: boolean;
  sort_order: number;
  removed: boolean;
  unit_count: number;
  version: number;
}

export interface BuildingList {
  items: Building[];
  can_manage: boolean;
}

export interface BuildingSource {
  name_en: string;
  name_km: string | null;
  address_text: string | null;
  description: string | null;
  takes_short_stays: boolean;
}

export interface UnitPlace {
  unit_id: string;
  building_id: string;
  version: number;
}

export interface BuildingApi {
  list: (
    propertyId: string,
    options?: { includeRemoved?: boolean },
  ) => Promise<BuildingList>;
  create: (propertyId: string, source: BuildingSource) => Promise<Building>;
  update: (
    current: Building,
    source: Partial<BuildingSource>,
  ) => Promise<Building>;
  remove: (current: Building) => Promise<Building>;
  /** Only a Unit that has never had a Lease, Reservation or booking can move. */
  moveUnit: (
    unit: { unit_id: string; version: number },
    buildingId: string,
    reason: string,
  ) => Promise<UnitPlace>;
}

export class BuildingUnavailableError extends Error {
  constructor() {
    super("Buildings are unavailable for this session.");
    this.name = "BuildingUnavailableError";
  }
}

/** 409: the name is used by another building, the building still has Units, or the Unit has
 * renting history and cannot move. */
export class BuildingRefusedError extends Error {
  constructor() {
    super("The building change was refused.");
    this.name = "BuildingRefusedError";
  }
}

/** 412: someone changed the building or the Unit first. */
export class BuildingChangedError extends Error {
  constructor() {
    super("The building changed. Read it again before retrying.");
    this.name = "BuildingChangedError";
  }
}

export class BuildingInvalidError extends Error {
  constructor() {
    super("Check the building details.");
    this.name = "BuildingInvalidError";
  }
}

export class BuildingRequestError extends Error {
  constructor() {
    super("The building request was not completed.");
    this.name = "BuildingRequestError";
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function optionalText(value: unknown): value is string | null | undefined {
  return value === undefined || value === null || typeof value === "string";
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
  if (token === null || token.length === 0) throw new BuildingRequestError();
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
    throw new BuildingRequestError();
  }
  if (response.status === 401 || response.status === 403) {
    throw new BuildingUnavailableError();
  }
  if (response.status === 409) throw new BuildingRefusedError();
  if (response.status === 412) throw new BuildingChangedError();
  if (response.status === 422) throw new BuildingInvalidError();
  if (!response.ok) throw new BuildingRequestError();
  try {
    const payload: unknown = await response.json();
    if (!isObject(payload) || !isObject(payload.data)) {
      throw new BuildingRequestError();
    }
    return payload.data;
  } catch (error) {
    if (error instanceof BuildingRequestError) throw error;
    throw new BuildingRequestError();
  }
}

export function building(value: unknown): Building {
  if (
    !isObject(value) ||
    typeof value.building_id !== "string" ||
    typeof value.property_id !== "string" ||
    typeof value.name_en !== "string" ||
    !optionalText(value.name_km) ||
    !optionalText(value.address_text) ||
    !optionalText(value.description) ||
    typeof value.takes_short_stays !== "boolean" ||
    typeof value.sort_order !== "number" ||
    typeof value.removed !== "boolean" ||
    typeof value.version !== "number"
  ) {
    throw new BuildingRequestError();
  }
  return {
    building_id: value.building_id,
    property_id: value.property_id,
    name_en: value.name_en,
    name_km: value.name_km ?? null,
    address_text: value.address_text ?? null,
    description: value.description ?? null,
    takes_short_stays: value.takes_short_stays,
    sort_order: value.sort_order,
    removed: value.removed,
    unit_count: typeof value.unit_count === "number" ? value.unit_count : 0,
    version: value.version,
  };
}

async function list(
  propertyId: string,
  options: { includeRemoved?: boolean } = {},
): Promise<BuildingList> {
  const suffix = options.includeRemoved === true ? "?include_removed=true" : "";
  const data = await request(
    `/properties/${encodeURIComponent(propertyId)}/buildings${suffix}`,
    { method: "GET" },
  );
  if (!Array.isArray(data.items) || typeof data.can_manage !== "boolean") {
    throw new BuildingRequestError();
  }
  return { items: data.items.map(building), can_manage: data.can_manage };
}

async function create(
  propertyId: string,
  source: BuildingSource,
): Promise<Building> {
  return building(
    await request(`/properties/${encodeURIComponent(propertyId)}/buildings`, {
      method: "POST",
      headers: mutationHeaders(),
      body: JSON.stringify(source),
    }),
  );
}

async function update(
  current: Building,
  source: Partial<BuildingSource>,
): Promise<Building> {
  return building(
    await request(`/buildings/${encodeURIComponent(current.building_id)}`, {
      method: "PATCH",
      headers: mutationHeaders(current.version),
      body: JSON.stringify(source),
    }),
  );
}

async function remove(current: Building): Promise<Building> {
  return building(
    await request(
      `/buildings/${encodeURIComponent(current.building_id)}/remove`,
      { method: "POST", headers: mutationHeaders(current.version) },
    ),
  );
}

async function moveUnit(
  unit: { unit_id: string; version: number },
  buildingId: string,
  reason: string,
): Promise<UnitPlace> {
  const data = await request(
    `/units/${encodeURIComponent(unit.unit_id)}/building`,
    {
      method: "POST",
      headers: mutationHeaders(unit.version),
      body: JSON.stringify({ building_id: buildingId, reason }),
    },
  );
  if (
    typeof data.unit_id !== "string" ||
    typeof data.building_id !== "string" ||
    typeof data.version !== "number"
  ) {
    throw new BuildingRequestError();
  }
  return {
    unit_id: data.unit_id,
    building_id: data.building_id,
    version: data.version,
  };
}

export const buildingApi: BuildingApi = {
  list,
  create,
  update,
  remove,
  moveUnit,
};

/** The building's name in the chosen language. */
export function buildingName(language: "en" | "km", item: Building): string {
  return language === "km" && item.name_km !== null && item.name_km !== ""
    ? item.name_km
    : item.name_en;
}

/** Buildings that are not removed; names and the Building box show only with two or more. */
export function activeBuildings(items: Building[]): Building[] {
  return items.filter((item) => !item.removed);
}
