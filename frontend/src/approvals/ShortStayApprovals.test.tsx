// UI v81 (B4, design v81 Approvals): the Approvals tabs. TEST-FE-1911.
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Booking } from "../shortstays/shortStaysClient";
import { ApprovalsPage } from "./ApprovalsPage";

afterEach(() => {
  cleanup();
  window.location.hash = "";
});

function booking(id: string, damages: Booking["damages"]): Booking {
  return {
    booking_id: id,
    booking_number: `ST26000${id}`,
    unit_number: "U503",
    guest_name: "Chan Sopheap",
    check_in_on: "2026-11-01",
    check_out_on: "2026-11-05",
    damages,
  } as unknown as Booking;
}

function damage(
  id: string,
  status: "WAITING" | "APPROVED" | "REFUSED",
): Booking["damages"][number] {
  return {
    damage_id: id,
    description: `Broken lamp ${id}`,
    amount_usd_cents: 2500,
    status,
    decided_at: null,
    decision_note: null,
    from_deposit_usd_cents: 0,
    invoice_id: null,
    invoice_number: null,
  };
}

function show(capabilities: ReadonlySet<string> | null) {
  const list = vi.fn(() =>
    Promise.resolve([
      booking("1", [damage("a", "WAITING"), damage("b", "APPROVED")]),
      booking("2", [damage("c", "REFUSED")]),
    ]),
  );
  render(
    <ApprovalsPage
      active
      actorId="actor-owner"
      approvalsApi={{
        waiting: vi.fn(() =>
          Promise.resolve({
            business_date: "2026-11-07",
            waiting: [],
            decided_today: [],
          }),
        ),
      }}
      capabilities={capabilities}
      decisionApi={{
        confirmDraft: vi.fn(),
        rejectDraft: vi.fn(),
        withdrawDraft: vi.fn(),
      }}
      language="en"
      propertyId="property-1"
      shortStaysApi={{ list }}
    />,
  );
  return list;
}

describe("Approvals tabs (UI v81)", () => {
  it("TEST-FE-1911 Short-stay approvals lists the damage charges that wait and opens the booking; without short_stays.approve there are no tabs", async () => {
    const list = show(new Set(["financial.approve", "short_stays.approve"]));
    const tab = await screen.findByRole("tab", {
      name: /Short-stay approvals/,
    });
    expect(within(tab).getByText("1")).toBeTruthy();
    fireEvent.click(tab);
    const rows = screen.getAllByRole("row");
    expect(rows).toHaveLength(2);
    expect(rows[1]?.textContent).toContain("Broken lamp a");
    expect(
      screen.getByRole("link", { name: "ST260001" }).getAttribute("href"),
    ).toBe("#/shortstays/st%3A1");
    expect(list).toHaveBeenCalledWith("property-1");
    cleanup();

    const again = show(new Set(["financial.approve"]));
    expect(await screen.findByText(/Nothing waits|confirm/i)).toBeTruthy();
    expect(screen.queryByRole("tab")).toBeNull();
    expect(again).not.toHaveBeenCalled();
  });
});
