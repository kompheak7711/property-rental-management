// DL-253 (parking step 3b): the Lease parking client. TEST-FE-2345.

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
});
