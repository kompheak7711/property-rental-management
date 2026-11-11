// UI v81 (B4, design v81 Approvals): the Approvals tabs. TEST-FE-1911, TEST-FE-1933.
import { readFileSync } from "node:fs";

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

  it("TEST-FE-1933 (owner 12/11/2026) the Approvals tabs are square, not round pills, with the count a plain number; the panel under them is a stack, so the number cards, the list, the note and Processed today keep the normal space between them", async () => {
    show(new Set(["financial.approve", "short_stays.approve"]));
    const tab = await screen.findByRole("tab", {
      name: /Short-stay approvals/,
    });
    const row = screen.getByRole("tablist");
    expect(row).toHaveClass("ui-subtabs");
    expect(
      within(row)
        .getAllByRole("tab")
        .map((each) => each.textContent),
    ).toEqual(["Financial approvals", "Short-stay approvals1"]);
    expect(within(tab).getByText("1")).toHaveClass("ui-subtab-count", "ui-num");

    // Financial approvals: each part is the panel's own child, so the stack spaces them (with
    // no shell around it, the page's head is drawn in place, first).
    let panel = screen.getByRole("tabpanel");
    expect(panel).toHaveClass("ui-stack");
    expect(
      Array.from(panel.children)
        .filter((part) => part.textContent !== "")
        .map((part) => part.className),
    ).toEqual([
      "ui-head",
      "ui-kpis",
      "ui-card pad0",
      "ui-notice info",
      "ui-card",
    ]);
    fireEvent.click(tab);
    panel = screen.getByRole("tabpanel");
    expect(panel).toHaveClass("ui-stack");

    // The look comes from the stylesheet: a tab has square corners inside one joined box with
    // 8px corners (the Payments filter row), the chosen tab is tinted and underlined, never a
    // filled pill, and on a page the page's own space follows the tabs and spaces the panel.
    const css = readFileSync("src/shell/screens.css", "utf8");
    const rule = (selector: string) => {
      const start = css.indexOf(`\n${selector} {`);
      if (start < 0) throw new Error(`No rule ${selector}`);
      return css.slice(css.indexOf("{", start) + 1, css.indexOf("}", start));
    };
    const box = rule('.ui-subtabs[role="tablist"]');
    expect(box).toContain("border-radius: 8px;");
    expect(box).toContain("border: 1px solid var(--btn-edge);");
    const one = rule('.ui-subtabs [role="tab"]');
    expect(one).toContain("border-radius: 0;");
    expect(one).toContain("min-height: 44px;");
    const chosen = rule('.ui-subtabs [role="tab"][aria-selected="true"]');
    expect(chosen).toContain("background: var(--selected);");
    expect(chosen).toContain("inset 0 -3px 0 var(--primary)");
    expect(chosen).not.toContain("var(--on-primary)");
    expect(rule(".ui-subtab-count")).not.toContain("border-radius");
    expect(css).not.toMatch(/\.ui-subtab[^{]*\{[^}]*999px/);
    expect(rule('.shell-page > .ui-subtabs[role="tablist"]')).toContain(
      "margin-bottom: 0;",
    );
    expect(rule('.shell-page > .ui-stack[role="tabpanel"]')).toContain(
      "gap: inherit;",
    );
    expect(rule(".ui-stack")).toContain("gap: 16px;");
  });
});
