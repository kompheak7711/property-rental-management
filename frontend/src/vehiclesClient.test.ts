// DL-253 (parking step 3a): the vehicles client. TEST-FE-2341 and TEST-FE-2342.

import { afterEach, describe, expect, it, vi } from "vitest";

import { VehicleError, vehicleApi } from "./vehiclesClient";

afterEach(() => {
  vi.unstubAllGlobals();
  Object.defineProperty(document, "cookie", { configurable: true, value: "" });
});

function answer(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const CAR = {
  vehicle_id: "car-1",
  customer_id: "customer 1",
  customer_name: "Sok Dara",
  vehicle_type: "CAR",
  plate_text: "2A-1234",
  plate_match_key: "2A1234",
  colour: null,
  brand_model: "Lexus",
  sticker_number: null,
  version: 2,
  holds: [
    {
      hold_id: "hold-1",
      hold_kind: "PARKING_AGREEMENT",
      space_unit_id: "space-1",
      space_number: "P01",
      lease_id: "lease-1",
      lease_number: "P01L0001",
      held_from: "2026-11-01",
      held_until: null,
    },
  ],
};

const SOURCE = {
  vehicle_type: "CAR" as const,
  plate_text: "2A-1234",
  colour: "Black",
  brand_model: "Lexus",
  sticker_number: null,
};

describe("vehicles client (DL-253)", () => {
  it("TEST-FE-2341 reads a Customer's vehicles with their spaces, and sends a change with the browser proof and the version", async () => {
    Object.defineProperty(document, "cookie", {
      configurable: true,
      value: "__Host-prm_csrf=token-1",
    });
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        answer(200, { data: { items: [CAR], can_manage: true } }),
      )
      .mockResolvedValueOnce(answer(201, { data: { ...CAR, version: 1 } }))
      .mockResolvedValueOnce(answer(200, { data: { ...CAR, version: 3 } }));
    vi.stubGlobal("fetch", fetchMock);

    const found = await vehicleApi.list("customer 1");
    expect(found.can_manage).toBe(true);
    expect(found.items[0]?.holds[0]?.space_number).toBe("P01");
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "/customers/customer%201/vehicles",
    );

    expect((await vehicleApi.create("customer 1", SOURCE)).version).toBe(1);
    const [addPath, addInit] = fetchMock.mock.calls[1] ?? [];
    expect(addPath).toBe("/customers/customer%201/vehicles");
    expect(addInit?.method).toBe("POST");
    expect(addInit?.headers).toMatchObject({ "X-CSRF-Token": "token-1" });
    expect(JSON.parse(addInit?.body as string)).toEqual(SOURCE);

    const car = found.items[0];
    if (car === undefined) throw new Error("no vehicle");
    expect((await vehicleApi.update(car, SOURCE)).version).toBe(3);
    const [path, init] = fetchMock.mock.calls[2] ?? [];
    expect(path).toBe("/vehicles/car-1");
    expect(init?.method).toBe("PUT");
    expect(init?.headers).toMatchObject({
      "X-CSRF-Token": "token-1",
      "If-Match": '"2"',
    });
  });

  it("TEST-FE-2342 a type that does not fit the space keeps its code; a stale version is Changed; no browser proof sends nothing", async () => {
    Object.defineProperty(document, "cookie", {
      configurable: true,
      value: "__Host-prm_csrf=token-1",
    });
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(answer(409, { error: { code: "VEHICLE_TYPE" } }))
      .mockResolvedValueOnce(answer(412, { error: { code: "X" } }))
      .mockResolvedValueOnce(answer(422, {}))
      .mockResolvedValueOnce(answer(404, {}))
      .mockResolvedValueOnce(
        answer(200, { data: { items: [{ bad: 1 }], can_manage: true } }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const code = (work: Promise<unknown>) =>
      work.then(
        () => "saved",
        (error: unknown) =>
          error instanceof VehicleError ? error.code : "other",
      );
    const car = { ...CAR, vehicle_type: "CAR" as const, holds: [] };
    expect(await code(vehicleApi.update(car, SOURCE))).toBe("VEHICLE_TYPE");
    expect(await code(vehicleApi.update(car, SOURCE))).toBe("CHANGED");
    expect(await code(vehicleApi.create("customer-1", SOURCE))).toBe("INVALID");
    expect(await code(vehicleApi.list("customer-1"))).toBe("UNAVAILABLE");
    expect(await code(vehicleApi.list("customer-1"))).toBe("FAILED");

    Object.defineProperty(document, "cookie", {
      configurable: true,
      value: "",
    });
    expect(await code(vehicleApi.create("customer-1", SOURCE))).toBe("FAILED");
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });
});
