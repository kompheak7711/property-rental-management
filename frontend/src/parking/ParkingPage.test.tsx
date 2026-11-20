// DL-253 (parking step 2): the Parking page. TEST-FE-2331 to TEST-FE-2334.
// DL-254 (parking step 4b): New Parking agreement from a space. TEST-FE-2348.

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
  type ParkingApi,
  ParkingError,
  type ParkingSpace,
  type ParkingSpaceCreate,
  type ParkingSpaceSource,
} from "../parkingClient";
import type { UnitSetupItem, UnitSetupLists } from "../unitClient";
import { ParkingPage } from "./ParkingPage";

afterEach(() => {
  cleanup();
});

function type(
  code: string,
  name: string,
  cents: number | null,
  extra: Partial<UnitSetupItem> = {},
): UnitSetupItem {
  return {
    item_id: `PARKING_TYPE-${code}`,
    list_kind: "PARKING_TYPE",
    code,
    name_en: name,
    name_km: null,
    sort_order: 0,
    removed: false,
    in_use: false,
    version: 1,
    feature_type_item_id: null,
    default_monthly_rent_usd_cents: cents,
    ...extra,
  };
}

const TYPES = [
  type("COVERED", "Covered car", 3500),
  type("MOTORBIKE", "Motorbike area", null),
];

function lists(): UnitSetupLists {
  return {
    lists: {
      FLOOR: [],
      UNIT_TYPE: [],
      VIEW: [],
      KITCHEN: [],
      ROOM_FEATURE: [],
      FEATURE_TYPE: [],
      UNIT_FEATURE: [],
      ITEM_TYPE: [],
      PARKING_TYPE: TYPES,
    },
    can_manage: true,
  };
}

function space(
  number: string,
  extra: Partial<ParkingSpace> = {},
): ParkingSpace {
  return {
    unit_id: `space-${number}`,
    unit_number: number,
    building_id: null,
    parking_type: "COVERED",
    area: "Ground floor",
    parking_capacity: 1,
    kept_for_short_stay_guests: false,
    default_monthly_rent_usd_cents: 3500,
    rent_from_type: true,
    version: 1,
    holds: [],
    ...extra,
  };
}

const HELD = space("P02", {
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
});

const SPACES = [
  space("P01"),
  HELD,
  space("P03", { kept_for_short_stay_guests: true }),
  space("MOTO", {
    parking_type: "MOTORBIKE",
    area: "Back yard",
    parking_capacity: 20,
    default_monthly_rent_usd_cents: 500,
    rent_from_type: false,
  }),
];

function apiOf(
  overrides: Partial<ParkingApi> = {},
  canManage = true,
): ParkingApi & Record<keyof ParkingApi, ReturnType<typeof vi.fn>> {
  return {
    list: vi.fn(() =>
      Promise.resolve({ items: SPACES, can_manage: canManage }),
    ),
    create: vi.fn((_property: string, source: ParkingSpaceCreate) =>
      Promise.resolve(
        space(source.unit_number, {
          ...source,
          default_monthly_rent_usd_cents: source.price_usd_cents ?? 3500,
          rent_from_type: source.price_usd_cents === null,
        }),
      ),
    ),
    update: vi.fn((current: ParkingSpace, source: ParkingSpaceSource) =>
      Promise.resolve({ ...current, ...source, version: current.version + 1 }),
    ),
    setTypePrice: vi.fn(),
    ...overrides,
  } as ParkingApi & Record<keyof ParkingApi, ReturnType<typeof vi.fn>>;
}

function show(
  api = apiOf(),
  setupLists = vi.fn(() => Promise.resolve(lists())),
) {
  render(
    <ParkingPage
      active
      api={api}
      language="en"
      propertyId="property-1"
      unitApi={{ setupLists }}
    />,
  );
  return api;
}

function rows(): HTMLTableRowElement[] {
  return within(screen.getByTestId("parking-list"))
    .getAllByRole<HTMLTableRowElement>("row")
    .slice(1);
}

describe("Parking page (DL-253)", () => {
  it("TEST-FE-2331 lists each space with its Parking Type, places used, price and who holds it; the count cards and the type filter narrow the table", async () => {
    const api = show();
    expect(await screen.findByText("4 parking spaces")).toBeInTheDocument();
    expect(api.list).toHaveBeenCalledWith("property-1");
    const table = rows();
    expect(table).toHaveLength(4);
    expect(table[0]).toHaveTextContent("P01");
    expect(table[0]).toHaveTextContent("Covered car");
    expect(table[0]).toHaveTextContent("0 of 1");
    expect(table[0]).toHaveTextContent("$35.00 (type price)");
    expect(table[1]).toHaveTextContent("1 of 1");
    expect(table[1]).toHaveTextContent("Sok Dara, room U101 · 2A-1234");
    expect(table[2]).toHaveTextContent("Short-stay guests");
    expect(table[3]).toHaveTextContent("Motorbike area");
    expect(table[3]).toHaveTextContent("0 of 20");
    expect(table[3]?.cells[4]).toHaveTextContent(/^\$5\.00$/);

    fireEvent.click(screen.getByRole("button", { name: /^Free/ }));
    expect(rows().map((row) => row.cells[0]?.textContent)).toEqual([
      "P01",
      "MOTO",
    ]);
    fireEvent.click(screen.getByRole("button", { name: /^In use/ }));
    expect(rows().map((row) => row.cells[0]?.textContent)).toEqual(["P02"]);
    fireEvent.click(screen.getByRole("button", { name: "Show all" }));
    fireEvent.change(screen.getByLabelText("Parking Type"), {
      target: { value: "MOTORBIKE" },
    });
    expect(rows().map((row) => row.cells[0]?.textContent)).toEqual(["MOTO"]);
  });

  it("TEST-FE-2332 New space checks its boxes, then saves with the Parking Type price or its own price; a person who may only read sees no New space or Edit", async () => {
    const api = show();
    fireEvent.click(await screen.findByRole("button", { name: "New space" }));
    let dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText(/^Number of places/), {
      target: { value: "0" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(
      await within(dialog).findByText("Enter the space number."),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText("Enter where the space is."),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText("Enter a whole number from 1 to 500."),
    ).toBeInTheDocument();
    expect(api.create).not.toHaveBeenCalled();
    // The type price shows while the space uses it.
    expect(within(dialog).getByTestId("parking-type-price")).toHaveTextContent(
      "Parking Type price: $35.00 a month",
    );
    fireEvent.change(within(dialog).getByLabelText(/^Space number/), {
      target: { value: " P05 " },
    });
    fireEvent.change(within(dialog).getByLabelText(/^Area/), {
      target: { value: "Ground floor" },
    });
    fireEvent.change(within(dialog).getByLabelText(/^Number of places/), {
      target: { value: "1" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => {
      expect(api.create).toHaveBeenCalledWith("property-1", {
        unit_number: "P05",
        building_id: null,
        parking_type: "COVERED",
        area: "Ground floor",
        parking_capacity: 1,
        kept_for_short_stay_guests: false,
        price_usd_cents: null,
      });
    });
    expect(await screen.findByText("Space P05 was added.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "New space" }));
    dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText(/^Space number/), {
      target: { value: "MOTO2" },
    });
    fireEvent.change(within(dialog).getByLabelText(/^Parking Type/), {
      target: { value: "MOTORBIKE" },
    });
    expect(within(dialog).getByTestId("parking-type-price")).toHaveTextContent(
      "This Parking Type has no price yet.",
    );
    fireEvent.change(within(dialog).getByLabelText(/^Area/), {
      target: { value: "Back yard" },
    });
    fireEvent.change(within(dialog).getByLabelText(/^Number of places/), {
      target: { value: "25" },
    });
    fireEvent.click(
      within(dialog).getByLabelText("Use the Parking Type price"),
    );
    fireEvent.change(within(dialog).getByLabelText("Price a month (USD)"), {
      target: { value: "5x" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(
      await within(dialog).findByText("Enter an amount, such as 35.00."),
    ).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText("Price a month (USD)"), {
      target: { value: "5" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => {
      expect(api.create).toHaveBeenLastCalledWith(
        "property-1",
        expect.objectContaining({
          unit_number: "MOTO2",
          parking_type: "MOTORBIKE",
          parking_capacity: 25,
          price_usd_cents: 500,
        }),
      );
    });
    cleanup();

    show(apiOf({}, false));
    expect(await screen.findByText("4 parking spaces")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "New space" })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Edit space/ })).toBeNull();
  });

  it("TEST-FE-2333 a refused New space says why and keeps the form open; Edit space saves the whole space with the type price", async () => {
    const api = show(
      apiOf({
        create: vi.fn(() =>
          Promise.reject(new ParkingError("TYPE_HAS_NO_PRICE")),
        ),
      }),
    );
    fireEvent.click(await screen.findByRole("button", { name: "New space" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText(/^Space number/), {
      target: { value: "P09" },
    });
    fireEvent.change(within(dialog).getByLabelText(/^Area/), {
      target: { value: "Ground floor" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "This Parking Type has no price yet. Set it in Settings › Unit setup › Parking Types, or type a price for this space.",
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

    fireEvent.click(
      await screen.findByRole("button", { name: "Edit space: MOTO" }),
    );
    const edit = await screen.findByRole("dialog");
    expect(within(edit).queryByLabelText(/^Space number/)).toBeNull();
    expect(within(edit).getByLabelText("Price a month (USD)")).toHaveValue(
      "5.00",
    );
    fireEvent.change(within(edit).getByLabelText(/^Number of places/), {
      target: { value: "30" },
    });
    fireEvent.click(within(edit).getByRole("button", { name: "Save" }));
    await waitFor(() => {
      expect(api.update).toHaveBeenCalledWith(SPACES[3], {
        parking_type: "MOTORBIKE",
        area: "Back yard",
        parking_capacity: 30,
        kept_for_short_stay_guests: false,
        price_usd_cents: 500,
      });
    });
    expect(
      await screen.findByText("Space MOTO was saved."),
    ).toBeInTheDocument();
  });

  it("TEST-FE-2334 an Edit refused because the space changed closes and reads the list again; a held space refused for fewer places says so; a failed read offers Retry", async () => {
    const update = vi
      .fn()
      .mockRejectedValueOnce(new ParkingError("PARKING_CAPACITY"))
      .mockRejectedValueOnce(new ParkingError("CHANGED"));
    const api = show(apiOf({ update }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Edit space: P02" }),
    );
    const edit = await screen.findByRole("dialog");
    fireEvent.click(within(edit).getByRole("button", { name: "Save" }));
    expect(await within(edit).findByRole("alert")).toHaveTextContent(
      "More vehicles hold this space than the new number of places.",
    );
    expect(api.list).toHaveBeenCalledTimes(1);
    fireEvent.click(within(edit).getByRole("button", { name: "Save" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
    await waitFor(() => {
      expect(api.list).toHaveBeenCalledTimes(2);
    });
    cleanup();

    const list = vi
      .fn()
      .mockRejectedValueOnce(new ParkingError("FAILED"))
      .mockResolvedValue({ items: SPACES, can_manage: true });
    show(apiOf({ list }));
    fireEvent.click(await screen.findByRole("button", { name: "Retry" }));
    expect(await screen.findByText("4 parking spaces")).toBeInTheDocument();
  });

  it("TEST-FE-2348 a person who may draft Leases gets New Parking agreement on each space not kept for guests; it opens the form for that space (DL-254)", async () => {
    render(
      <ParkingPage
        active
        api={apiOf({}, false)}
        canDraftLeases
        language="en"
        propertyId="property-1"
        unitApi={{ setupLists: vi.fn(() => Promise.resolve(lists())) }}
      />,
    );
    expect(await screen.findByText("4 parking spaces")).toBeInTheDocument();
    const links = screen.getAllByRole("link", {
      name: /^New Parking agreement: /,
    });
    expect(links.map((link) => link.getAttribute("aria-label"))).toEqual([
      "New Parking agreement: P01",
      "New Parking agreement: P02",
      "New Parking agreement: MOTO",
    ]);
    expect(links[0]).toHaveAttribute("href", "#/leases/space%3Aspace-P01");
    expect(screen.queryByRole("button", { name: /^Edit space/ })).toBeNull();
  });
});
