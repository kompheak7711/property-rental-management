// DL-253 (parking step 3b): the Parking card of a room Lease. TEST-FE-2343 and TEST-FE-2344.
// DL-254 (parking step 4b): the Parking agreement card. TEST-FE-2346.

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
  on_parking_space: false,
  month_to_month: false,
  space: null,
  agreement_hold: null,
};

const HELD: LeaseParking = { ...OPEN, terms: [{ ...TERM, hold: HOLD }] };

function apiOf(overrides: Partial<LeaseParkingApi> = {}): LeaseParkingApi {
  return {
    read: vi
      .fn<LeaseParkingApi["read"]>()
      .mockResolvedValueOnce(OPEN)
      .mockResolvedValue(HELD),
    pick: vi.fn<LeaseParkingApi["pick"]>(() => Promise.resolve(HOLD)),
    pickVehicle: vi.fn<LeaseParkingApi["pickVehicle"]>(() =>
      Promise.resolve({
        hold_id: "hold-9",
        vehicle_id: "car-1",
        plate_text: "2A-1234",
        held_from: "2027-01-01",
        held_until: "2099-12-31",
      }),
    ),
    ...overrides,
  };
}

describe("Lease Parking card (DL-253)", () => {
  it("TEST-FE-2343 picks a free space and a vehicle for the parking Service, then shows the space at its fixed price", async () => {
    const api = apiOf();
    render(<LeaseParkingCard api={api} language="en" leaseId="lease-1" />);
    expect(
      await screen.findByText(
        "No space picked yet. Pick a space before you sign the Lease.",
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

  it("TEST-FE-2346 a Parking agreement shows its space and Month to month, picks the customer's vehicle on the draft, and a signed one shows the plate only", async () => {
    const draft: LeaseParking = {
      ...OPEN,
      lease_status: "DRAFTED",
      terms: [],
      on_parking_space: true,
      month_to_month: true,
      space: {
        unit_id: "space-1",
        unit_number: "P01",
        parking_type: "COVERED",
        area: "Ground floor",
      },
      agreement_hold: null,
    };
    const picked: LeaseParking = {
      ...draft,
      agreement_hold: {
        hold_id: "hold-9",
        vehicle_id: "car-1",
        plate_text: "2A-1234",
        held_from: "2027-01-01",
        held_until: "2099-12-31",
      },
    };
    const api = apiOf({
      read: vi
        .fn<LeaseParkingApi["read"]>()
        .mockResolvedValueOnce(draft)
        .mockResolvedValue(picked),
    });
    render(<LeaseParkingCard api={api} language="en" leaseId="lease-9" />);
    expect(
      await screen.findByRole("heading", { name: "Parking agreement" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Space P01 · Covered")).toBeInTheDocument();
    expect(
      screen.getByText(
        "No vehicle picked yet. Pick the vehicle before you sign.",
      ),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Pick vehicle" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => {
      expect(api.pickVehicle).toHaveBeenCalledWith("lease-9", "car-1");
    });
    expect(
      await screen.findByText("Vehicle 2A-1234 was picked."),
    ).toBeInTheDocument();
    expect(
      await screen.findByText("Month to month, from 01/01/2027"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Change vehicle" }),
    ).toBeInTheDocument();
    cleanup();

    render(
      <LeaseParkingCard
        api={apiOf({
          read: vi.fn(() =>
            Promise.resolve({ ...picked, lease_status: "SIGNED" }),
          ),
        })}
        language="en"
        leaseId="lease-9"
      />,
    );
    expect(await screen.findAllByText("2A-1234")).toHaveLength(2);
    expect(screen.queryByRole("button")).toBeNull();
  });
});
