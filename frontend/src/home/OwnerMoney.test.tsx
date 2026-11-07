// UI v81 (design v81 Home): Owner money and the Attendance card. TEST-FE-1907, TEST-FE-1908.
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AttendanceDay } from "../hr/hrClient";
import type { Report, ReportName } from "../ledger/ledgerClient";
import { AttendanceCard, OwnerMoney } from "./OwnerMoney";

afterEach(() => {
  cleanup();
});

function report(name: ReportName, rows: Report["rows"]): Report {
  return {
    report: name,
    title: name,
    period: "",
    state: "",
    columns: [],
    rows,
    check: { ok: true, text: "" },
  };
}

const REPORTS: Partial<Record<ReportName, Report>> = {
  "balance-sheet": report("balance-sheet", [
    { line: "heading", code: null, name: "Assets" },
    { line: "account", code: "1010", name: "Cash", amount: 120000 },
    { line: "account", code: "1020", name: "ABA USD", amount: 350000 },
    {
      line: "account",
      code: "1100",
      name: "Accounts receivable",
      amount: 90000,
    },
    { line: "total", code: null, name: "Total assets", amount: 560000 },
  ]),
  "customer-aging": report("customer-aging", [
    { line: "account", customer_name: "Kong Heng", total: 90000 },
    {
      line: "total",
      customer_name: "Total",
      not_due: 20000,
      days_1_30: 30000,
      days_31_60: 25000,
      days_61_90: 0,
      over_90: 15000,
      total: 90000,
    },
  ]),
  budget: report("budget", [
    {
      line: "account",
      code: "4000",
      name: "Rent",
      actual_month: 999999,
      budget_month: 1,
    },
    {
      line: "account",
      code: "6010",
      name: "Repairs",
      actual_month: 30000,
      budget_month: 50000,
    },
    {
      line: "account",
      code: "6020",
      name: "Power",
      actual_month: 12000,
      budget_month: 10000,
    },
  ]),
  "profit-and-loss": report("profit-and-loss", [
    { line: "total", code: null, name: "Total income", year_to_date: 900000 },
    {
      line: "total",
      code: null,
      name: "Profit (or loss)",
      year_to_date: 412500,
    },
  ]),
};

describe("Home Owner money and Attendance (UI v81)", () => {
  it("TEST-FE-1907 Owner money shows cash and bank, what customers owe, the part over 30 days, spent against budget and profit this year", async () => {
    const api = {
      report: vi.fn((_: string, name: ReportName) =>
        REPORTS[name] === undefined
          ? Promise.reject(new Error("not read"))
          : Promise.resolve(REPORTS[name]),
      ),
    };
    render(
      <OwnerMoney
        active
        api={api}
        language="en"
        propertyId="property-1"
        today="2026-11-07"
      />,
    );
    const box = await screen.findByRole("region", { name: "Owner money" });
    const cards = within(box)
      .getAllByRole("link")
      .map((card) => card.textContent);
    expect(cards).toEqual([
      "Cash and bank today$4,700.00Opens the Balance sheet",
      "Customers owe$900.00Opens Accounts receivable aging",
      "Owed over 30 days$400.00Opens Accounts receivable aging",
      "Spent this month$420.00Budget $600.00",
      "Profit this year$4,125.002026 so far",
    ]);
    expect(api.report).toHaveBeenCalledWith("property-1", "budget", {
      month: "2026-11-01",
    });
  });

  it("TEST-FE-1908 the Attendance card counts scans to check and people with no check-out", async () => {
    const day = {
      people: [
        { no_check_out: true, scans: [] },
        {
          no_check_out: false,
          scans: [{ needs_check: true, accepted: false }],
        },
        { no_check_out: true, scans: [{ needs_check: true, accepted: false }] },
        { no_check_out: false, scans: [{ needs_check: true, accepted: true }] },
      ],
    } as unknown as AttendanceDay;
    render(
      <AttendanceCard
        active
        api={{ day: vi.fn().mockResolvedValue(day) }}
        language="en"
        propertyId="property-1"
      />,
    );
    expect(
      await screen.findByRole("heading", {
        name: "Attendance needs attention: 3",
      }),
    ).toBeTruthy();
    expect(
      screen.getByText("3 to check: Needs check 2, No check-out 2."),
    ).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Open the daily sheet" }),
    ).toHaveAttribute("href", "#/attendance");
  });
});
