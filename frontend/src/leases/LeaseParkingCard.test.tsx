// DL-253 (parking step 3b): the Parking card of a room Lease. TEST-FE-2343 and TEST-FE-2344.

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  type LeaseParking,
  type LeaseParkingApi,
  LeaseParkingError,
  type LeaseParkingHold,
  type LeaseParkingTerm,
} from "../leaseParkingClient";
import { LeaseParkingCard } from "./LeaseParkingCard";

afterEach(() => {
  cleanup();
});

const TERM: LeaseParkingTerm = {
  lease_service_term_id: "term-1",
  service_name: "Car parking",
  service_name_km: "ចំណតឡាន",
  held_from: "2027-01-01",
  held_until: "2027-12-31",
  hold: null,
  free_spaces: [
    {
      unit_id: "space-1",
      unit_number: "P01",
      parking_type: "COVERED",
      area: "Ground floor",
      monthly_price_usd_cents: 3500,
    },
    {
      unit_id: "space-2",
      unit_number: "P02",
      parking_type: "UNCOVERED",
      area: "Back yard",
      monthly_price_usd_cents: 2500,
    },
  ],
};

const HOLD: LeaseParkingHold = {
  hold_id: "hold-1",
  space_number: "P02",
  parking_type: "UNCOVERED",
  plate_text: "2A-1234",
  held_from: "2027-01-01",
  held_until: "2027-12-31",
  monthly_price_usd_cents: 2500,
};

const OPEN: LeaseParking = {
  lease_status: "SIGNED",
  can_pick: true,
  terms: [TERM],
  vehicles: [
    {
      vehicle_id: "car-1",
      vehicle_type: "CAR",
      plate_text: "2A-1234",
      customer_name: "Sok Dara",
    },
  ],
};

const HELD: LeaseParking = { ...OPEN, terms: [{ ...TERM, hold: HOLD }] };

function apiOf(overrides: Partial<LeaseParkingApi> = {}): LeaseParkingApi {
  return {
    read: vi
      .fn<LeaseParkingApi["read"]>()
      .mockResolvedValueOnce(OPEN)
      .mockResolvedValue(HELD),
    pick: vi.fn<LeaseParkingApi["pick"]>(() => Promise.resolve(HOLD)),
    ...overrides,
  };
}

describe("Lease Parking card (DL-253)", () => {
  it("TEST-FE-2343 picks a free space and a vehicle for the parking Service, then shows the space at its fixed price", async () => {
    const api = apiOf();
    render(<LeaseParkingCard api={api} language="en" leaseId="lease-1" />);
    expect(
      await screen.findByText(
        "No space picked yet. Until a space is picked, the parking is billed at the Service rate in Settings.",
      ),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Pick space" }));
    const dialog = await screen.findByRole("dialog");
    const spaces = within(dialog).getByLabelText(/^Parking space/);
    expect(
      within(spaces)
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual([
      "P01 · Covered · $35.00 a month",
      "P02 · Uncovered · $25.00 a month",
    ]);
    fireEvent.change(spaces, { target: { value: "space-2" } });
    fireEvent.change(within(dialog).getByLabelText(/^Vehicle/), {
      target: { value: "car-1" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => {
      expect(api.pick).toHaveBeenCalledWith("lease-1", {
        lease_service_term_id: "term-1",
        space_unit_id: "space-2",
        vehicle_id: "car-1",
      });
    });
    expect(
      await screen.findByText("Space P02 was picked."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Uncovered · 2A-1234 · $25.00 a month, fixed"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Pick space" })).toBeNull();
  });

  it("TEST-FE-2344 a taken space keeps the form open with the reason; no parking Service shows no card; a reader cannot pick", async () => {
    const api = apiOf({
      read: vi.fn(() => Promise.resolve(OPEN)),
      pick: vi.fn(() =>
        Promise.reject(new LeaseParkingError("PARKING_SPACE_TAKEN")),
      ),
    });
    render(<LeaseParkingCard api={api} language="en" leaseId="lease-1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Pick space" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Another vehicle holds this space on these days. Pick another space.",
    );
    cleanup();

    const { container } = render(
      <LeaseParkingCard
        api={apiOf({
          read: vi.fn(() => Promise.resolve({ ...OPEN, terms: [] })),
        })}
        language="en"
        leaseId="lease-2"
      />,
    );
    await waitFor(() => {
      expect(container).toBeEmptyDOMElement();
    });
    cleanup();

    render(
      <LeaseParkingCard
        api={apiOf({
          read: vi.fn(() => Promise.resolve({ ...OPEN, can_pick: false })),
        })}
        language="km"
        leaseId="lease-3"
      />,
    );
    expect(await screen.findByText("ចំណតឡាន")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });
});
