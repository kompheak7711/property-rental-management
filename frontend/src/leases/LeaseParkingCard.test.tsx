// DL-253 (parking step 3b): the Parking card of a room Lease. TEST-FE-2343 and TEST-FE-2344.
// DL-254 (parking step 4b): the Parking agreement card. TEST-FE-2346.
// DL-255 (parking step 4c): Change vehicle on a signed agreement. TEST-FE-2350.
// DL-258 (parking step 5c): End agreement and Close agreement. TEST-FE-2354 and TEST-FE-2355.

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { LeaseApi, LeaseResource } from "../leaseClient";
import {
  type LeaseParking,
  type LeaseParkingApi,
  LeaseParkingError,
  type LeaseParkingHold,
  type LeaseParkingTerm,
} from "../leaseParkingClient";
import { endDay, LeaseParkingCard } from "./LeaseParkingCard";

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
  can_end: false,
  ending: null,
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
    changeVehicle: vi.fn<LeaseParkingApi["changeVehicle"]>(() =>
      Promise.resolve({
        hold_id: "hold-9",
        vehicle_id: "car-2",
        plate_text: "2A-5678",
        held_from: "2027-01-01",
        held_until: "2099-12-31",
      }),
    ),
    endAgreement: vi.fn<LeaseParkingApi["endAgreement"]>(() =>
      Promise.resolve({
        ...OPEN,
        ending: {
          told_by: "CUSTOMER",
          told_on: "2026-11-10",
          ends_on: "2026-11-30",
          note: null,
        },
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
            Promise.resolve({
              ...picked,
              lease_status: "SIGNED",
              can_pick: false,
            }),
          ),
        })}
        language="en"
        leaseId="lease-9"
      />,
    );
    expect(await screen.findAllByText("2A-1234")).toHaveLength(2);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("TEST-FE-2350 a signed agreement changes its vehicle from a day with a reason, and a missing reason is refused on the form", async () => {
    const signed: LeaseParking = {
      ...OPEN,
      lease_status: "SIGNED",
      terms: [],
      on_parking_space: true,
      month_to_month: true,
      vehicles: [
        ...OPEN.vehicles,
        {
          vehicle_id: "car-2",
          vehicle_type: "CAR",
          plate_text: "2A-5678",
          customer_name: "Sok Dara",
        },
      ],
      space: {
        unit_id: "space-1",
        unit_number: "P01",
        parking_type: "COVERED",
        area: "Ground floor",
      },
      agreement_hold: {
        hold_id: "hold-9",
        vehicle_id: "car-1",
        plate_text: "2A-1234",
        held_from: "2027-01-01",
        held_until: "2099-12-31",
      },
    };
    const api = apiOf({ read: vi.fn(() => Promise.resolve(signed)) });
    render(<LeaseParkingCard api={api} language="en" leaseId="lease-9" />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Change vehicle" }),
    );
    const dialog = await screen.findByRole("dialog");
    expect(
      within(within(dialog).getByLabelText(/^New vehicle/))
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual(["2A-5678 · Car"]);
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Give a short reason for the change.",
    );
    expect(api.changeVehicle).not.toHaveBeenCalled();
    fireEvent.change(within(dialog).getByLabelText(/^Reason/), {
      target: { value: "  Sold the old car " },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => {
      expect(api.changeVehicle).toHaveBeenCalledWith(
        "lease-9",
        "hold-9",
        expect.objectContaining({
          vehicle_id: "car-2",
          reason: "Sold the old car",
        }),
      );
    });
    expect(
      await screen.findByText("The vehicle is now 2A-5678."),
    ).toBeInTheDocument();
  });

  it("TEST-FE-2354 a Manager ends a month-to-month agreement by notice: the last day follows the owner's rules, and the card shows it", async () => {
    // Q15: before the 25th, the end of this month; from the 25th, the end of next month.
    expect(endDay("CUSTOMER", "2027-03-24")).toBe("2027-03-31");
    expect(endDay("CUSTOMER", "2027-03-25")).toBe("2027-04-30");
    expect(endDay("CUSTOMER", "2027-12-31")).toBe("2028-01-31");
    // Q16: the owner's letter, 30 days after it is given.
    expect(endDay("OWNER", "2027-03-10")).toBe("2027-04-09");

    const monthly: LeaseParking = {
      ...OPEN,
      terms: [],
      can_pick: false,
      can_end: true,
      on_parking_space: true,
      month_to_month: true,
      space: {
        unit_id: "space-1",
        unit_number: "P01",
        parking_type: "COVERED",
        area: null,
      },
      agreement_hold: {
        hold_id: "hold-9",
        vehicle_id: "car-1",
        plate_text: "2A-1234",
        held_from: "2026-09-01",
        held_until: null,
      },
    };
    const ended: LeaseParking = {
      ...monthly,
      month_to_month: false,
      ending: {
        told_by: "CUSTOMER",
        told_on: "2026-11-10",
        ends_on: "2026-11-30",
        note: null,
      },
    };
    const changed = vi.fn();
    const api = apiOf({
      read: vi
        .fn<LeaseParkingApi["read"]>()
        .mockResolvedValueOnce(monthly)
        .mockResolvedValue(ended),
      endAgreement: vi.fn(() => Promise.resolve(ended)),
    });
    render(
      <LeaseParkingCard
        api={api}
        language="en"
        leaseId="lease-9"
        onLeaseChanged={changed}
      />,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "End agreement" }),
    );
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(
      within(dialog).getByLabelText("The owner gives a 30-day letter"),
    );
    expect(
      within(dialog).getByLabelText(/^Day the letter is given/),
    ).toBeInTheDocument();
    fireEvent.click(within(dialog).getByLabelText("The customer told us"));
    fireEvent.change(within(dialog).getByLabelText(/^Note/), {
      target: { value: " Moving away " },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "End agreement" }),
    );
    await waitFor(() => {
      expect(api.endAgreement).toHaveBeenCalledWith(
        "lease-9",
        expect.objectContaining({ told_by: "CUSTOMER", note: "Moving away" }),
      );
    });
    expect(
      await screen.findByText("The agreement ends on 30/11/2026."),
    ).toBeInTheDocument();
    expect(
      await screen.findByText(
        "Ends on 30/11/2026 · notice given on 10/11/2026",
      ),
    ).toBeInTheDocument();
    expect(changed).toHaveBeenCalled();
    // Once it has a last day it is not ended again.
    expect(screen.queryByRole("button", { name: "End agreement" })).toBeNull();
  });

  it("TEST-FE-2355 on or after its End Date the agreement is closed on that day as signed, then the Final Settlement opens from the card", async () => {
    const due: LeaseParking = {
      ...OPEN,
      terms: [],
      can_pick: false,
      can_end: true,
      on_parking_space: true,
      month_to_month: false,
      space: {
        unit_id: "space-1",
        unit_number: "P01",
        parking_type: "COVERED",
        area: null,
      },
      agreement_hold: {
        hold_id: "hold-9",
        vehicle_id: "car-1",
        plate_text: "2A-1234",
        held_from: "2026-01-01",
        held_until: "2026-10-31",
      },
      ending: {
        told_by: "OWNER",
        told_on: "2026-10-01",
        ends_on: "2026-10-31",
        note: null,
      },
    };
    const lease = {
      lease_id: "lease-9",
      status: "SIGNED",
      version: 4,
      end_date: "2026-10-31",
      actual_termination_date: null,
    } as unknown as LeaseResource;
    const terminate = vi.fn<LeaseApi["terminate"]>(() =>
      Promise.resolve({
        ...lease,
        status: "TERMINATED",
        actual_termination_date: "2026-10-31",
      } as LeaseResource),
    );
    const api = apiOf({
      read: vi
        .fn<LeaseParkingApi["read"]>()
        .mockResolvedValueOnce(due)
        .mockResolvedValue({ ...due, lease_status: "TERMINATED" }),
    });
    render(
      <LeaseParkingCard
        api={api}
        language="en"
        lease={lease}
        leaseApi={{ terminate }}
        leaseId="lease-9"
      />,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Close agreement" }),
    );
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("not an early ending");
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Close agreement" }),
    );
    await waitFor(() => {
      expect(terminate).toHaveBeenCalled();
    });
    const [sentLease, source] = terminate.mock.calls[0] ?? [];
    expect(sentLease).toBe(lease);
    expect(source?.actual_termination_date).toBe("2026-10-31");
    expect(source?.governing_event_reference).toBe("BR-LEASE-023");
    expect(source?.context?.basis).toBe("SIGNED_LEASE_OTHER");
    expect(
      await screen.findByText("The agreement was closed on 31/10/2026."),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("link", { name: "Open the Final Settlement" }),
    ).toHaveAttribute("href", "#/moveout/lease-9");
  });
});
