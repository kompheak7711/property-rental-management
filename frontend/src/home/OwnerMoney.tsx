// UI v81 (B4, design v81 Home): the Owner money box and the Attendance card on Home.
// Display only: the numbers come from the Ledger reports and the Attendance day sheet the app
// already reads; nothing here works out money of its own beyond adding report lines.

import { useEffect, useState } from "react";

import type { AttendanceDay, HrApi } from "../hr/hrClient";
import type { LedgerApi, Report } from "../ledger/ledgerClient";
import { usdFromCents } from "../shell/format";
import { Icon, type ShellIcon } from "../shell/icons";
import { type PageId, hashForPage } from "../shell/navigation";
import { Chip } from "../shell/ui";
import type { Language } from "../signInText";
import { hmt } from "./text";

/** The five Owner money numbers, in cents; null when that report could not be read. */
export interface OwnerMoneyNumbers {
  cash: number | null;
  owe: number | null;
  over30: number | null;
  spent: number | null;
  budget: number | null;
  profit: number | null;
  year: string;
}

function cents(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/** Cash and bank: the asset lines 1000 to 1099 of the Balance sheet. */
export function cashOf(report: Report): number {
  return report.rows
    .filter(
      (row) =>
        row.line === "account" &&
        typeof row.code === "string" &&
        /^10\d\d$/.test(row.code),
    )
    .reduce((sum, row) => sum + cents(row.amount), 0);
}

/** Customers owe (the Total line) and the part more than 30 days late. */
export function owedOf(report: Report): { owe: number; over30: number } {
  const total = report.rows.find((row) => row.line === "total");
  if (total === undefined) return { owe: 0, over30: 0 };
  return {
    owe: cents(total.total),
    over30:
      cents(total.days_31_60) + cents(total.days_61_90) + cents(total.over_90),
  };
}

/** Profit this year: the "Profit (or loss)" line, year to date. */
export function profitOf(report: Report): number {
  const line = report.rows.find(
    (row) => row.line === "total" && row.name === "Profit (or loss)",
  );
  return cents(line?.year_to_date);
}

/** Spent this month and its budget: the expense lines (5000 to 6999) of Budget vs actual. */
export function spentOf(report: Report): { spent: number; budget: number } {
  const lines = report.rows.filter(
    (row) =>
      row.line === "account" &&
      typeof row.code === "string" &&
      /^[56]\d{3}$/.test(row.code),
  );
  return {
    spent: lines.reduce((sum, row) => sum + cents(row.actual_month), 0),
    budget: lines.reduce((sum, row) => sum + cents(row.budget_month), 0),
  };
}

function MoneyCard({
  icon,
  tone,
  label,
  value,
  note,
  page,
}: {
  icon: ShellIcon;
  tone: string;
  label: string;
  value: number | null;
  note: string;
  page: PageId;
}) {
  return (
    <a
      className={`ui-kpi ui-home-kpi ${value === null ? "none" : tone}`}
      href={hashForPage(page)}
    >
      <span className="ui-kpi-label">
        <span className="ui-kpi-icon">
          <Icon name={icon} small />
        </span>
        {label}
      </span>
      <span className="ui-kpi-value ui-num">
        {value === null ? "—" : usdFromCents(value)}
      </span>
      <span className="ui-kpi-note">{note}</span>
    </a>
  );
}

/** Owner money on Home: five cards, for the Owner (ledger.owner_money with ledger.read). */
export function OwnerMoney({
  language,
  propertyId,
  active,
  api,
  today,
}: {
  language: Language;
  propertyId: string;
  active: boolean;
  api: Pick<LedgerApi, "report">;
  today: string;
}) {
  const [numbers, setNumbers] = useState<OwnerMoneyNumbers | null>(null);
  useEffect(() => {
    if (!active || propertyId === "") return;
    let current = true;
    const month = `${today.slice(0, 7)}-01`;
    const read = <T,>(
      name: Parameters<LedgerApi["report"]>[1],
      query: Parameters<LedgerApi["report"]>[2],
      pick: (report: Report) => T,
    ): Promise<T | null> =>
      api.report(propertyId, name, query).then(pick, () => null);
    void Promise.all([
      read("balance-sheet", { as_of: today }, cashOf),
      read("customer-aging", {}, owedOf),
      read("budget", { month }, spentOf),
      read("profit-and-loss", { month }, profitOf),
    ]).then(([cash, owed, spent, profit]) => {
      if (!current) return;
      setNumbers({
        cash,
        owe: owed?.owe ?? null,
        over30: owed?.over30 ?? null,
        spent: spent?.spent ?? null,
        budget: spent?.budget ?? null,
        profit,
        year: today.slice(0, 4),
      });
    });
    return () => {
      current = false;
    };
  }, [active, api, propertyId, today]);
  if (numbers === null) return null;
  const over = (numbers.spent ?? 0) > (numbers.budget ?? 0);
  return (
    <section aria-labelledby="home-owner-money" className="ui-card">
      <div className="ui-chead">
        <h2 id="home-owner-money">{hmt(language, "om_t")}</h2>
        <Chip icon="lock" tone="neutral">
          {hmt(language, "om_only")}
        </Chip>
      </div>
      <div className="ui-kpis ui-home-kpis">
        <MoneyCard
          icon="payments"
          label={hmt(language, "om_cash")}
          note={hmt(language, "om_cash_s")}
          page="statements"
          tone="brand"
          value={numbers.cash}
        />
        <MoneyCard
          icon="customers"
          label={hmt(language, "om_owe")}
          note={hmt(language, "om_owe_s")}
          page="statements"
          tone={(numbers.owe ?? 0) > 0 ? "warn" : "ok"}
          value={numbers.owe}
        />
        <MoneyCard
          icon="history"
          label={hmt(language, "om_over")}
          note={hmt(language, "om_owe_s")}
          page="statements"
          tone={(numbers.over30 ?? 0) > 0 ? "err" : "ok"}
          value={numbers.over30}
        />
        <MoneyCard
          icon="list"
          label={hmt(language, "om_spent")}
          note={
            (numbers.budget ?? 0) > 0
              ? hmt(language, "om_spent_s", usdFromCents(numbers.budget ?? 0))
              : hmt(language, "om_nobudget")
          }
          page="budget"
          tone={(numbers.budget ?? 0) > 0 && over ? "err" : "info"}
          value={numbers.spent}
        />
        <MoneyCard
          icon="reports"
          label={hmt(language, "om_profit")}
          note={hmt(language, "om_profit_s", numbers.year)}
          page="statements"
          tone={(numbers.profit ?? 0) >= 0 ? "ok" : "err"}
          value={numbers.profit}
        />
      </div>
    </section>
  );
}

/** Attendance lines that need a look today: scans to check and people with no check-out. */
export function attendanceToCheck(day: AttendanceDay): {
  total: number;
  scans: number;
  noOut: number;
} {
  const scans = day.people.filter((line) =>
    line.scans.some((scan) => scan.needs_check && !scan.accepted),
  ).length;
  const noOut = day.people.filter((line) => line.no_check_out === true).length;
  const total = day.people.filter(
    (line) =>
      line.no_check_out === true ||
      line.scans.some((scan) => scan.needs_check && !scan.accepted),
  ).length;
  return { total, scans, noOut };
}

/** The Attendance card on Home (hr.attendance.read): what needs a look on today's sheet. */
export function AttendanceCard({
  language,
  propertyId,
  active,
  api,
}: {
  language: Language;
  propertyId: string;
  active: boolean;
  api: Pick<HrApi, "day">;
}) {
  const [found, setFound] = useState<ReturnType<
    typeof attendanceToCheck
  > | null>(null);
  useEffect(() => {
    if (!active || propertyId === "") return;
    let current = true;
    api.day(propertyId, null).then(
      (day) => {
        if (current) setFound(attendanceToCheck(day));
      },
      () => {
        if (current) setFound(null);
      },
    );
    return () => {
      current = false;
    };
  }, [active, api, propertyId]);
  if (found === null) return null;
  return (
    // UI v81 round 2: one row as in the design (app31 .hm31r): the icon, the words, the button.
    <section aria-labelledby="home-attendance" className="ui-card">
      <div className="ui-attrow">
        <span
          aria-hidden="true"
          className={found.total > 0 ? "ui-attic warn" : "ui-attic ok"}
        >
          <Icon name={found.total > 0 ? "alert" : "check"} />
        </span>
        <div>
          <h2 id="home-attendance">
            {hmt(language, "at_t")}:{" "}
            <span className="ui-num">{found.total}</span>
          </h2>
          <p className="ui-small">
            {found.total > 0
              ? hmt(language, "at_n", found.total, found.scans, found.noOut)
              : hmt(language, "at_0")}
          </p>
        </div>
        <a className="ui-btn" href={hashForPage("attendance")}>
          {hmt(language, "at_open")}
          <Icon name="forward" small />
        </a>
      </div>
    </section>
  );
}
