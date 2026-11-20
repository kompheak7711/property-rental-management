// DL-253 (parking step 3a): the Vehicles card of the Customer page. TEST-FE-2339 and TEST-FE-2340.

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
  type Vehicle,
  type VehicleApi,
  VehicleError,
  type VehicleSource,
} from "../vehiclesClient";
import { VehiclesCard } from "./VehiclesCard";

afterEach(() => {
  cleanup();
});

const CAR: Vehicle = {
  vehicle_id: "car-1",
  vehicle_type: "CAR",
  plate_text: "2A-1234",
  colour: "White",
  brand_model: "Toyota Prius",
  sticker_number: null,
  version: 1,
  holds: [
    {
      hold_id: "hold-1",
      hold_kind: "ROOM_LEASE",
      space_number: "P01",
      lease_id: "lease-1",
      lease_number: "U101L0026",
      held_from: "2026-11-01",
      held_until: null,
    },
  ],
};

const BIKE: Vehicle = {
  vehicle_id: "bike-1",
  vehicle_type: "MOTORBIKE",
  plate_text: "1B-777",
  colour: null,
  brand_model: null,
  sticker_number: "S-12",
  version: 3,
  holds: [],
};

function apiOf(overrides: Partial<VehicleApi> = {}): VehicleApi {
  return {
    list: vi.fn(() =>
      Promise.resolve({ items: [CAR, BIKE], can_manage: true }),
    ),
    create: vi.fn((_: string, source: VehicleSource) =>
      Promise.resolve({ ...BIKE, ...source, vehicle_id: "new", version: 1 }),
    ),
    update: vi.fn((current: Vehicle, source: VehicleSource) =>
      Promise.resolve({ ...current, ...source, version: current.version + 1 }),
    ),
    ...overrides,
  };
}

describe("Vehicles card (DL-253)", () => {
  it("TEST-FE-2339 lists each vehicle with the space it holds today, and adds one with only the type and plate needed", async () => {
    const api = apiOf();
    render(
      <VehiclesCard active api={api} customerId="customer-1" language="en" />,
    );
    const list = await screen.findByRole("list", { name: "Vehicles" });
    const rows = within(list).getAllByRole("listitem");
    expect(rows[0]).toHaveTextContent("2A-1234");
    expect(rows[0]).toHaveTextContent("Car · White · Toyota Prius");
    expect(rows[0]).toHaveTextContent("Parks in P01 · U101L0026");
    expect(rows[1]).toHaveTextContent("Motorbike · Sticker S-12");
    expect(rows[1]).toHaveTextContent("No space today");
    expect(api.list).toHaveBeenCalledWith("customer-1");

    fireEvent.click(screen.getByRole("button", { name: "Add vehicle" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(
      await within(dialog).findByText("Enter the plate number."),
    ).toBeInTheDocument();
    expect(api.create).not.toHaveBeenCalled();
    fireEvent.change(within(dialog).getByLabelText(/^Vehicle type/), {
      target: { value: "TUK_TUK" },
    });
    fireEvent.change(within(dialog).getByLabelText(/^Plate number/), {
      target: { value: " 3C-0001 " },
    });
    fireEvent.change(within(dialog).getByLabelText(/^Colour/), {
      target: { value: "  " },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => {
      expect(api.create).toHaveBeenCalledWith("customer-1", {
        vehicle_type: "TUK_TUK",
        plate_text: "3C-0001",
        colour: null,
        brand_model: null,
        sticker_number: null,
      });
    });
    expect(
      await screen.findByText("Vehicle 3C-0001 was added."),
    ).toBeInTheDocument();
    expect(api.list).toHaveBeenCalledTimes(2);
  });

  it("TEST-FE-2340 Edit keeps the form open with the reason when refused; a reader and a deactivated Customer get no Add", async () => {
    const api = apiOf({
      update: vi.fn(() => Promise.reject(new VehicleError("VEHICLE_TYPE"))),
    });
    render(
      <VehiclesCard active api={api} customerId="customer-1" language="en" />,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Edit 2A-1234" }),
    );
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByLabelText(/^Brand and model/)).toHaveValue(
      "Toyota Prius",
    );
    fireEvent.change(within(dialog).getByLabelText(/^Vehicle type/), {
      target: { value: "MOTORBIKE" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "This vehicle holds a space of another Parking Type today, so its type cannot change now.",
    );
    expect(api.update).toHaveBeenCalledWith(CAR, {
      vehicle_type: "MOTORBIKE",
      plate_text: "2A-1234",
      colour: "White",
      brand_model: "Toyota Prius",
      sticker_number: null,
    });
    cleanup();

    render(
      <VehiclesCard
        active
        api={apiOf({
          list: vi.fn(() =>
            Promise.resolve({ items: [CAR], can_manage: false }),
          ),
        })}
        customerId="customer-1"
        language="km"
      />,
    );
    expect(await screen.findByText("ចតនៅ P01 · U101L0026")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
    cleanup();

    render(
      <VehiclesCard
        active={false}
        api={apiOf()}
        customerId="customer-1"
        language="en"
      />,
    );
    expect(
      await screen.findByRole("button", { name: "Edit 2A-1234" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add vehicle" })).toBeNull();
    cleanup();

    render(
      <VehiclesCard
        active
        api={apiOf({ list: vi.fn(() => Promise.reject(new Error("down"))) })}
        customerId="customer-1"
        language="en"
      />,
    );
    expect(
      await screen.findByText("The vehicles could not be loaded."),
    ).toBeInTheDocument();
  });
});
