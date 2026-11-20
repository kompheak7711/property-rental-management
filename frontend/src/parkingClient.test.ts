// DL-253 (parking step 2): the parking client. TEST-FE-2337 and TEST-FE-2338.

import { afterEach, describe, expect, it, vi } from "vitest";

import { ParkingError, parkingApi } from "./parkingClient";

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

const SPACE = {
  unit_id: "space-1",
  unit_number: "P01",
  building_id: null,
  parking_type: "COVERED",
  area: "Ground floor",
  parking_capacity: 1,
  kept_for_short_stay_guests: false,
  default_monthly_rent_usd_cents: 3500,
  rent_from_type: true,
  version: 2,
  holds: [
    {
      hold_id: "hold-1",
      hold_kind: "ROOM_LEASE",
      lease_id: "lease-1",
      lease_number: "U101L0026",
      customer_name: "Sok Dara",
      room_unit_number: "U101",
      plate_text: "2A-1234",
      vehicle_type: "COVERED",
      held_from: "2026-11-01",
      held_until: null,
    },
  ],
};

describe("parking client (DL-253)", () => {
  it("TEST-FE-2337 reads the spaces with their holds, and sends a change with the browser proof and the version", async () => {
    Object.defineProperty(document, "cookie", {
      configurable: true,
      value: "__Host-prm_csrf=token-1",
    });
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        answer(200, { data: { items: [SPACE], can_manage: true } }),
      )
      .mockResolvedValueOnce(answer(200, { data: { ...SPACE, version: 3 } }))
      .mockResolvedValueOnce(
        answer(200, {
          data: {
            item_id: "type-1",
            version: 4,
            default_monthly_rent_usd_cents: null,
          },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const found = await parkingApi.list("property 1");
    expect(found.can_manage).toBe(true);
    expect(found.items[0]?.holds[0]?.plate_text).toBe("2A-1234");
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "/properties/property%201/parking-spaces",
    );

    const space = found.items[0];
    if (space === undefined) throw new Error("no space");
    const source = {
      parking_type: "COVERED",
      area: "Ground floor",
      parking_capacity: 1,
      kept_for_short_stay_guests: false,
      price_usd_cents: null,
    };
    expect((await parkingApi.update(space, source)).version).toBe(3);
    const [path, init] = fetchMock.mock.calls[1] ?? [];
    expect(path).toBe("/parking-spaces/space-1");
    expect(init?.method).toBe("PUT");
    expect(init?.headers).toMatchObject({
      "X-CSRF-Token": "token-1",
      "If-Match": '"2"',
    });
    expect(JSON.parse(init?.body as string)).toEqual(source);

    expect(
      await parkingApi.setTypePrice({ item_id: "type-1", version: 3 }, null),
    ).toEqual({
      item_id: "type-1",
      version: 4,
      default_monthly_rent_usd_cents: null,
    });
    expect(fetchMock.mock.calls[2]?.[0]).toBe("/unit-setup/items/type-1/price");
  });

  it("TEST-FE-2338 a refusal keeps its code; a stale version is Changed; no browser proof sends nothing", async () => {
    Object.defineProperty(document, "cookie", {
      configurable: true,
      value: "__Host-prm_csrf=token-1",
    });
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        answer(422, { error: { code: "TYPE_HAS_NO_PRICE" } }),
      )
      .mockResolvedValueOnce(answer(409, { error: { code: "NUMBER_TAKEN" } }))
      .mockResolvedValueOnce(answer(412, { error: { code: "X" } }))
      .mockResolvedValueOnce(answer(403, {}));
    vi.stubGlobal("fetch", fetchMock);
    const source = {
      unit_number: "P01",
      building_id: null,
      parking_type: "COVERED",
      area: "Ground floor",
      parking_capacity: 1,
      kept_for_short_stay_guests: false,
      price_usd_cents: null,
    };
    const code = (work: Promise<unknown>) =>
      work.then(
        () => "saved",
        (error: unknown) =>
          error instanceof ParkingError ? error.code : "other",
      );
    expect(await code(parkingApi.create("property-1", source))).toBe(
      "TYPE_HAS_NO_PRICE",
    );
    expect(await code(parkingApi.create("property-1", source))).toBe(
      "NUMBER_TAKEN",
    );
    expect(
      await code(parkingApi.update({ ...SPACE, holds: [] } as never, source)),
    ).toBe("CHANGED");
    expect(await code(parkingApi.list("property-1"))).toBe("UNAVAILABLE");

    Object.defineProperty(document, "cookie", {
      configurable: true,
      value: "",
    });
    expect(await code(parkingApi.create("property-1", source))).toBe("FAILED");
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});
