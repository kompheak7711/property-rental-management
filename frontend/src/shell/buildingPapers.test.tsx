import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Building } from "../buildingClient";
import type { InvoiceResource } from "../invoiceClient";
import { InvoiceDocument } from "../invoices/InvoiceDocument";
import type { ReceiptView } from "../payments/paymentsClient";
import { ReceiptDocument } from "../payments/ReceiptDocument";
import { bookingRefusal } from "../shortstays/NewBooking";
import { ShortStaysError } from "../shortstays/shortStaysClient";
import type { UnitListPage } from "../unitClient";
import { BuildingChoiceProvider, useBuildingChoice } from "./buildingChoice";

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  window.localStorage.clear();
});

function building(id: string, name: string, order: number): Building {
  return {
    building_id: id,
    property_id: "property-1",
    name_en: name,
    name_km: order === 1 ? "អគារ ២" : null,
    address_text: order === 1 ? "Street 2, Phnom Penh" : null,
    description: null,
    takes_short_stays: order === 0,
    sort_order: order,
    removed: false,
    unit_count: 1,
    version: 1,
  };
}

const TWO = building("building-2", "Building Two", 1);

const money = (cents: number) => ({
  amount: (cents / 100).toFixed(2),
  currency: "USD",
  minor_units: cents,
});

const INVOICE = {
  id: "inv-1",
  property_id: "property-1",
  customer_id: "cust-1",
  lease_id: "lease-1",
  invoice_number: "INV260001",
  category: "RENT",
  status: "UNPAID",
  invoice_date: "2026-11-01",
  due_date: "2026-11-05",
  billing_period: null,
  version: 1,
  original_total: money(30000),
  adjusted_total: money(30000),
  active_application_total: money(0),
  outstanding_balance: money(30000),
  lines: [],
  adjustments: [],
  void_event: null,
  evidence: { issued_at: "2026-11-01T00:00:00Z" },
} as unknown as InvoiceResource;

const RECEIPT: ReceiptView = {
  paymentId: "p-1",
  receiptId: "r-1",
  receiptNumber: "RCP260045",
  status: "RECEIVED",
  customerId: "cust-1",
  receivedAt: "2026-11-02T07:42:00+00:00",
  currency: "USD",
  receivedMinor: 30_000,
  usdCents: 30_000,
  rate: null,
  methodName: "Cash",
  methodCode: "CASH",
  reference: null,
  payerNote: null,
  receivedBy: "Chan Sophea",
  left: 0,
  lines: [],
  reprints: [],
  reprintCount: 0,
};

function bizText(): string {
  return document.querySelector(".biz")?.textContent ?? "";
}

describe("Building on the papers (DL-250 step 5)", () => {
  it("TEST-FE-2321 the Invoice names the Unit's building, its Khmer name and address under the business name; with one building only the business name shows", () => {
    render(
      <InvoiceDocument
        invoice={INVOICE}
        name="Sok Dara"
        phone={null}
        unit="B101"
      />,
    );
    expect(bizText()).toBe("CHETANA Residence");
    cleanup();
    render(
      <InvoiceDocument
        building={TWO}
        invoice={INVOICE}
        name="Sok Dara"
        phone={null}
        unit="B101"
      />,
    );
    expect(bizText()).toBe(
      "CHETANA ResidenceBuilding Twoអគារ ២Street 2, Phnom Penh",
    );
  });

  it("TEST-FE-2322 the Receipt names the Unit's building under the business name; with one building only the business name shows", () => {
    render(
      <ReceiptDocument
        name="Sok Dara"
        receipt={RECEIPT}
        reprint={null}
        unit="B101"
      />,
    );
    expect(bizText()).toBe("CHETANA Residence");
    cleanup();
    render(
      <ReceiptDocument
        building={building("building-1", "CHETANA Residence", 0)}
        name="Sok Dara"
        receipt={RECEIPT}
        reprint={null}
        unit="U101"
      />,
    );
    expect(document.querySelectorAll(".biz .bld")).toHaveLength(1);
  });

  it('TEST-FE-2323 the papers find a building by Unit number (also written "Unit B101") only with two or more buildings', async () => {
    function Probe() {
      const { buildingOfUnitNumber } = useBuildingChoice();
      return (
        <p data-testid="probe">
          {buildingOfUnitNumber("B101")?.name_en ?? "-"}:
          {buildingOfUnitNumber("Unit B101")?.name_en ?? "-"}:
          {buildingOfUnitNumber("X1")?.name_en ?? "-"}
        </p>
      );
    }
    const show = (items: Building[]) => {
      render(
        <BuildingChoiceProvider
          buildingApi={{
            list: vi.fn(() => Promise.resolve({ items, can_manage: true })),
          }}
          propertyId="property-1"
          refreshKey="invoices"
          unitApi={{
            list: vi.fn(
              (): Promise<UnitListPage> =>
                Promise.resolve({
                  items: [
                    {
                      unit_id: "unit-B101",
                      unit_number: "B101",
                      building_id: "building-2",
                    },
                  ],
                  next_cursor: null,
                } as UnitListPage),
            ),
          }}
        >
          <Probe />
        </BuildingChoiceProvider>,
      );
    };
    show([building("building-1", "CHETANA Residence", 0), TWO]);
    await waitFor(() => {
      expect(screen.getByTestId("probe")).toHaveTextContent(
        "Building Two:Building Two:-",
      );
    });
    cleanup();
    show([building("building-1", "CHETANA Residence", 0)]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.getByTestId("probe")).toHaveTextContent("-:-:-");
  });

  it("TEST-FE-2324 a booking refused because the building does not take short stays says how to fix it", () => {
    expect(
      bookingRefusal(
        "en",
        new ShortStaysError(409, "This building does not take short stays"),
      ),
    ).toBe(
      "This Unit's building does not take short stays. Turn on Takes short stays in Settings › Unit setup › Buildings, or choose another Unit.",
    );
    expect(
      bookingRefusal(
        "km",
        new ShortStaysError(409, "This building does not take short stays"),
      ),
    ).toContain("អគាររបស់បន្ទប់នេះមិនទទួលការស្នាក់នៅខ្លីទេ");
  });
});
