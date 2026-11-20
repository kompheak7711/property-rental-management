import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Building } from "../buildingClient";
import type { InvoiceResource } from "../invoiceClient";
import {
  type InvoicesData,
  invoicesInBuilding,
} from "../invoices/invoicesData";
import type { LeaseResource } from "../leaseClient";
import type { UnitListPage, UnitResource } from "../unitClient";
import { AppShell } from "./AppShell";
import {
  AllBuildingsNote,
  BUILDING_KEY,
  BuildingChoiceProvider,
  useBuildingChoice,
} from "./buildingChoice";

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  window.localStorage.clear();
});

function building(id: string, name: string, removed = false): Building {
  return {
    building_id: id,
    property_id: "property-1",
    name_en: name,
    name_km: id === "building-2" ? "អគារ ២" : null,
    address_text: null,
    description: null,
    takes_short_stays: id === "building-1",
    sort_order: id === "building-1" ? 0 : 1,
    removed,
    unit_count: 1,
    version: 1,
  };
}

const ONE = building("building-1", "CHETANA Residence");
const TWO = building("building-2", "Building Two");

function unit(no: string, buildingId: string): UnitResource {
  return {
    unit_id: `unit-${no}`,
    building_id: buildingId,
  } as UnitResource;
}

function apis(items: Building[]) {
  return {
    buildingApi: {
      list: vi.fn(() => Promise.resolve({ items, can_manage: true })),
    },
    unitApi: {
      list: vi.fn(
        (): Promise<UnitListPage> =>
          Promise.resolve({
            items: [unit("U101", "building-1"), unit("B101", "building-2")],
            next_cursor: null,
          } as UnitListPage),
      ),
    },
  };
}

/** What a list sees: the Units it would show under the chosen building. */
function Probe() {
  const choice = useBuildingChoice();
  const shown = ["unit-U101", "unit-B101", "unit-none"].filter((id) =>
    choice.showsUnit(id),
  );
  return (
    <p data-testid="probe">
      {choice.chosen?.name_en ?? "All"}:{shown.join(",")}:
      {choice.buildingOfUnit("unit-B101")?.name_en ?? "-"}
    </p>
  );
}

function show(items: Building[], language: "en" | "km" = "en") {
  const fakes = apis(items);
  render(
    <BuildingChoiceProvider
      buildingApi={fakes.buildingApi}
      propertyId="property-1"
      refreshKey="units"
      unitApi={fakes.unitApi}
    >
      <AppShell
        buildId="test-build"
        capabilities={null}
        displayName="Sokha Chan"
        environment="development"
        language={language}
        notice={null}
        now={() => Date.parse("2026-11-20T03:00:00Z")}
        onLanguageChange={() => undefined}
        onSignOut={() => undefined}
        page="units"
        signOutDisabled={false}
      >
        <Probe />
      </AppShell>
    </BuildingChoiceProvider>,
  );
  return fakes;
}

describe("Building switch (DL-250 step 3)", () => {
  it("TEST-FE-2314 with one building there is no Building switch, the Units are not read and every record shows", async () => {
    const fakes = show([ONE, building("building-9", "Old", true)]);
    await waitFor(() => {
      expect(fakes.buildingApi.list).toHaveBeenCalledWith("property-1");
    });
    expect(screen.queryByLabelText("Building")).toBeNull();
    expect(fakes.unitApi.list).not.toHaveBeenCalled();
    expect(screen.getByTestId("probe")).toHaveTextContent(
      "All:unit-U101,unit-B101,unit-none:-",
    );
    cleanup();

    // A saved choice from before does not hide anything while there is one building.
    window.localStorage.setItem(BUILDING_KEY, "building-1");
    show([ONE]);
    await waitFor(() => {
      expect(screen.getByTestId("probe")).toHaveTextContent(
        "All:unit-U101,unit-B101,unit-none",
      );
    });
  });

  it("TEST-FE-2315 with two buildings the side menu shows the Building switch with All buildings first; a choice filters the lists and is kept on the device (DL-250)", async () => {
    show([ONE, TWO]);
    const box = await screen.findByLabelText("Building");
    const nav = document.getElementById("shell-nav");
    expect(nav?.contains(box)).toBe(true);
    expect(
      within(box)
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual(["All buildings", "CHETANA Residence", "Building Two"]);
    expect(box).toHaveValue("");
    await waitFor(() => {
      expect(screen.getByTestId("probe")).toHaveTextContent(
        "All:unit-U101,unit-B101,unit-none:Building Two",
      );
    });
    fireEvent.change(box, { target: { value: "building-2" } });
    // A record with no known Unit shows under every building.
    expect(screen.getByTestId("probe")).toHaveTextContent(
      "Building Two:unit-B101,unit-none",
    );
    expect(window.localStorage.getItem(BUILDING_KEY)).toBe("building-2");
    cleanup();

    // The device keeps the choice for the next visit.
    show([ONE, TWO]);
    expect(await screen.findByLabelText("Building")).toHaveValue("building-2");
    fireEvent.change(screen.getByLabelText("Building"), {
      target: { value: "" },
    });
    expect(window.localStorage.getItem(BUILDING_KEY)).toBeNull();
    cleanup();

    // A building that was removed falls back to All buildings; Khmer shows Khmer names.
    window.localStorage.setItem(BUILDING_KEY, "building-3");
    show([ONE, TWO], "km");
    const khmer = await screen.findByLabelText("អគារ");
    expect(khmer).toHaveValue("");
    expect(
      within(khmer)
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual(["អគារទាំងអស់", "CHETANA Residence", "អគារ ២"]);
  });

  it("TEST-FE-2316 Invoices follow the Unit of their Lease, else of the Customer's newest signed Lease; one with neither shows under every building (DL-250)", () => {
    const invoice = (id: string, leaseId: string | null, customerId: string) =>
      ({
        id,
        lease_id: leaseId,
        customer_id: customerId,
      }) as InvoiceResource;
    const lease = (id: string, unitId: string) =>
      ({ lease_id: id, unit_id: unitId }) as LeaseResource;
    const data = {
      invoices: [
        invoice("inv-a", "lease-a", "c-a"),
        invoice("inv-b", "lease-b", "c-b"),
        invoice("inv-c", null, "c-b"),
        invoice("inv-guest", null, "c-guest"),
      ],
      leases: [lease("lease-a", "unit-U101"), lease("lease-b", "unit-B101")],
      customerLeases: new Map([["c-b", "lease-b"]]),
    } as unknown as InvoicesData;
    const inTwo = (unitId: string | null | undefined) =>
      unitId == null || unitId === "unit-B101";
    expect(
      invoicesInBuilding(data, inTwo).invoices.map((item) => item.id),
    ).toEqual(["inv-b", "inv-c", "inv-guest"]);
  });

  it("TEST-FE-2320 Home and Payments count all buildings: with one building chosen they say so, with All buildings or one building they say nothing (DL-250 step 4)", async () => {
    const note = (items: Building[], language: "en" | "km" = "en") => {
      const fakes = apis(items);
      render(
        <BuildingChoiceProvider
          buildingApi={fakes.buildingApi}
          propertyId="property-1"
          refreshKey="home"
          unitApi={fakes.unitApi}
        >
          <AllBuildingsNote language={language} />
        </BuildingChoiceProvider>,
      );
      return fakes;
    };
    const one = note([ONE]);
    await waitFor(() => {
      expect(one.buildingApi.list).toHaveBeenCalled();
    });
    expect(screen.queryByRole("note")).toBeNull();
    cleanup();

    const all = note([ONE, TWO]);
    await waitFor(() => {
      expect(all.buildingApi.list).toHaveBeenCalled();
    });
    expect(screen.queryByRole("note")).toBeNull();
    cleanup();

    window.localStorage.setItem(BUILDING_KEY, "building-2");
    note([ONE, TWO]);
    expect(await screen.findByRole("note")).toHaveTextContent(
      "These figures are for all buildings. Reports show one building.",
    );
    cleanup();
    note([ONE, TWO], "km");
    expect(await screen.findByRole("note")).toHaveTextContent(
      "តួលេខទាំងនេះសម្រាប់អគារទាំងអស់។",
    );
  });
});
