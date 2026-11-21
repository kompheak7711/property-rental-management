// DL-253 (parking step 3b): the Lease parking client. TEST-FE-2345.
// DL-254 (parking step 4b): a Parking agreement and its vehicle. TEST-FE-2349.
// DL-255 (parking step 4c): Change vehicle. TEST-FE-2351.

import { afterEach, describe, expect, it, vi } from "vitest";

import { LeaseParkingError, leaseParkingApi } from "./leaseParkingClient";

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

const HOLD = {
  hold_id: "hold-1",
  space_number: "P01",
  parking_type: "COVERED",
  plate_text: null,
  held_from: "2027-01-01",
  held_until: "2027-12-31",
  monthly_price_usd_cents: 3500,
};

describe("Lease parking client (DL-253)", () => {
  it("TEST-FE-2345 reads the parking of a Lease, picks with the browser proof, and keeps refusal codes", async () => {
    Object.defineProperty(document, "cookie", {
      configurable: true,
      value: "__Host-prm_csrf=token-1",
    });
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        answer(200, {
          data: {
            lease_id: "lease 1",
            lease_status: "DRAFTED",
            can_pick: true,
            terms: [
              {
                lease_service_term_id: "term-1",
                service_name: "Car parking",
                service_name_km: null,
                held_from: "2027-01-01",
                held_until: null,
                hold: HOLD,
                free_spaces: [],
              },
            ],
            vehicles: [],
          },
        }),
      )
      .mockResolvedValueOnce(answer(201, { data: HOLD }))
      .mockResolvedValueOnce(
        answer(409, { error: { code: "PARKING_SPACE_TAKEN" } }),
      )
      .mockResolvedValueOnce(answer(404, {}));
    vi.stubGlobal("fetch", fetchMock);

    const parking = await leaseParkingApi.read("lease 1");
    expect(parking.terms[0]?.hold?.monthly_price_usd_cents).toBe(3500);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/leases/lease%201/parking");

    const pick = {
      lease_service_term_id: "term-1",
      space_unit_id: "space-1",
      vehicle_id: null,
    };
    expect((await leaseParkingApi.pick("lease 1", pick)).space_number).toBe(
      "P01",
    );
    const [path, init] = fetchMock.mock.calls[1] ?? [];
    expect(path).toBe("/leases/lease%201/parking-holds");
    expect(init?.method).toBe("POST");
    expect(init?.headers).toMatchObject({ "X-CSRF-Token": "token-1" });
    expect(JSON.parse(init?.body as string)).toEqual(pick);

    const code = (work: Promise<unknown>) =>
      work.then(
        () => "saved",
        (error: unknown) =>
          error instanceof LeaseParkingError ? error.code : "other",
      );
    expect(await code(leaseParkingApi.pick("lease 1", pick))).toBe(
      "PARKING_SPACE_TAKEN",
    );
    expect(await code(leaseParkingApi.read("lease 1"))).toBe("UNAVAILABLE");
    Object.defineProperty(document, "cookie", {
      configurable: true,
      value: "",
    });
    expect(await code(leaseParkingApi.pick("lease 1", pick))).toBe("FAILED");
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("TEST-FE-2349 reads a Parking agreement's space and vehicle, and picks the vehicle with the browser proof", async () => {
    Object.defineProperty(document, "cookie", {
      configurable: true,
      value: "__Host-prm_csrf=token-2",
    });
    const picked = {
      hold_id: "hold-9",
      hold_kind: "PARKING_AGREEMENT",
      vehicle_id: "car-1",
      plate_text: "2A-1234",
      held_from: "2027-01-01",
      held_until: "2099-12-31",
    };
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        answer(200, {
          data: {
            lease_status: "DRAFTED",
            can_pick: true,
            terms: [],
            vehicles: [],
            on_parking_space: true,
            month_to_month: true,
            space: {
              unit_id: "space-1",
              unit_number: "P01",
              parking_type: "COVERED",
              area: "Ground floor",
              parking_capacity: 1,
            },
            agreement_hold: picked,
          },
        }),
      )
      .mockResolvedValueOnce(answer(201, { data: picked }))
      .mockResolvedValueOnce(
        answer(409, { error: { code: "AGREEMENT_DATES_MISSING" } }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const parking = await leaseParkingApi.read("lease-9");
    expect(parking).toMatchObject({
      on_parking_space: true,
      month_to_month: true,
      space: { unit_number: "P01", parking_type: "COVERED" },
      agreement_hold: { vehicle_id: "car-1", plate_text: "2A-1234" },
    });
    expect(
      (await leaseParkingApi.pickVehicle("lease-9", "car-1")).hold_id,
    ).toBe("hold-9");
    const [path, init] = fetchMock.mock.calls[1] ?? [];
    expect(path).toBe("/leases/lease-9/agreement-vehicle");
    expect(init?.method).toBe("POST");
    expect(new Headers(init?.headers).get("X-CSRF-Token")).toBe("token-2");
    expect(init?.body).toBe(JSON.stringify({ vehicle_id: "car-1" }));
    await expect(
      leaseParkingApi.pickVehicle("lease-9", "car-1"),
    ).rejects.toMatchObject({ code: "AGREEMENT_DATES_MISSING" });
  });

  it("TEST-FE-2351 changes the vehicle of a held space with the day and reason, and reads a refusal", async () => {
    Object.defineProperty(document, "cookie", {
      configurable: true,
      value: "__Host-prm_csrf=token-3",
    });
    const changed = {
      hold_id: "hold-9",
      vehicle_id: "car-2",
      plate_text: "2A-5678",
      held_from: "2027-01-01",
      held_until: "2099-12-31",
    };
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(answer(201, { data: changed }))
      .mockResolvedValueOnce(answer(409, { error: { code: "CHANGE_DATE" } }));
    vi.stubGlobal("fetch", fetchMock);
    const change = {
      vehicle_id: "car-2",
      change_date: "2027-03-01",
      reason: "Sold the old car",
    };
    expect(
      (await leaseParkingApi.changeVehicle("lease-9", "hold-9", change))
        .plate_text,
    ).toBe("2A-5678");
    const [path, init] = fetchMock.mock.calls[0] ?? [];
    expect(path).toBe("/leases/lease-9/parking-holds/hold-9/vehicle-changes");
    expect(init?.method).toBe("POST");
    expect(new Headers(init?.headers).get("X-CSRF-Token")).toBe("token-3");
    expect(init?.body).toBe(JSON.stringify(change));
    await expect(
      leaseParkingApi.changeVehicle("lease-9", "hold-9", change),
    ).rejects.toMatchObject({ code: "CHANGE_DATE" });
  });
});
