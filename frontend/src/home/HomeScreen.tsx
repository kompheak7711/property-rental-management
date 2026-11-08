// V1-058 R6: Home (DESIGN.md "Home layout", mock-up v43): the page head with "Receive payment"
// and "Enter meter readings", up to eight cards, and the "What to do" list. The numbers come
// from the V1-057 Home read; a card or a to-do kind the person may not read is missing from
// the answer, so it is not shown.

import "../shell/screens.css";

import {
  Fragment,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  type HomeCards,
  type HomePage,
  ReportsNotAllowedError,
  type TodoGroup,
  type TodoItem,
} from "../reportsClient";
import { dayText, momentText, usdFromCents } from "../shell/format";
import { Icon, type ShellIcon } from "../shell/icons";
import {
  type PageId,
  hashForPage,
  pageName,
  queryFromHash,
} from "../shell/navigation";
import { CardGrid, PageHeader } from "../shell/layouts";
import type { Language } from "../signInText";
import { monthText } from "../utilities/text";
import {
  type ProblemSummary,
  type ProblemsApi,
  problemsApi as defaultProblemsApi,
} from "../problems/problemsClient";
import { costText } from "../problems/RepairCost";
import { type HomeTextKey, hmt } from "./text";
import { type HrApi, hrApi as defaultHrApi } from "../hr/hrClient";
import {
  type LedgerApi,
  ledgerApi as defaultLedgerApi,
} from "../ledger/ledgerClient";
import { AttendanceCard, OwnerMoney } from "./OwnerMoney";
import {
  type TelegramApi,
  telegramApi as defaultTelegramApi,
} from "../telegram/telegramClient";

export interface HomeApi {
  home: (propertyId: string) => Promise<HomePage>;
}

export interface HomeScreenProps {
  language: Language;
  propertyId: string;
  /** Home reads again each time it is opened. */
  active: boolean;
  homeApi: HomeApi;
  capabilities: ReadonlySet<string> | null;
  /** DL-131: the Problem reports card, read only by a person who may see Problem reports. */
  problemsApi?: Pick<ProblemsApi, "summary">;
  /** UI v81: the Owner money box (ledger.owner_money and ledger.read). */
  ledgerApi?: Pick<LedgerApi, "report">;
  /** UI v81: the Attendance card (hr.attendance.read). */
  attendanceApi?: Pick<HrApi, "day">;
  /** UI v81 round 2: the Viewing requests waiting card (visit_requests.read). */
  visitsApi?: Pick<TelegramApi, "visitRequests">;
}

/** The Viewing requests card: new requests nobody took yet, how many are late, visits this week. */
export interface VisitsWaiting {
  waiting: number;
  late: number;
  visitsThisWeek: number;
}

/** Monday to Sunday of the week that holds `today` ("yyyy-mm-dd"), as a "yyyy-mm-dd" pair. */
function weekOf(today: string): [string, string] {
  const start = new Date(`${today.slice(0, 10)}T00:00:00Z`);
  const shift = (start.getUTCDay() + 6) % 7;
  start.setUTCDate(start.getUTCDate() - shift);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  return [start.toISOString().slice(0, 10), end.toISOString().slice(0, 10)];
}

export function visitsWaitingOf(
  requests: readonly {
    status: string;
    late: boolean;
    visit_local: string | null;
  }[],
  today: string,
): VisitsWaiting {
  const [from, to] = weekOf(today);
  return {
    waiting: requests.filter((item) => item.status === "NEW").length,
    late: requests.filter((item) => item.status === "NEW" && item.late).length,
    visitsThisWeek: requests.filter((item) => {
      const day = item.visit_local?.slice(0, 10) ?? "";
      return day >= from && day <= to;
    }).length,
  };
}

type Tone = "err" | "warn" | "info" | "neutral" | "ok" | "brand";

/** Whole days from `from` to `to`, both "yyyy-mm-dd". */
function daysBetween(from: string, to: string): number {
  const start = Date.parse(`${from.slice(0, 10)}T00:00:00Z`);
  const end = Date.parse(`${to.slice(0, 10)}T00:00:00Z`);
  return Math.round((end - start) / 86_400_000);
}

// Kinds whose date is a deadline: a past date is "late". The others record when something
// started waiting, so a past date is "ago".
const DEADLINE_KINDS = new Set<TodoItem["kind"]>([
  "overdue_initial_rent",
  "lease_ending",
  "reservation_expiring",
  "readings_missing",
  "letter_day_20",
  "letter_day_30",
  "refund_due",
]);

function relativeText(language: Language, item: TodoItem, today: string) {
  const days = daysBetween(today, item.date);
  if (days === 0) return hmt(language, "rel_today");
  if (days === 1) return hmt(language, "rel_tomorrow");
  if (days > 1) return hmt(language, "rel_in", days);
  if (DEADLINE_KINDS.has(item.kind)) {
    return days === -1
      ? hmt(language, "rel_late1")
      : hmt(language, "rel_late", -days);
  }
  return days === -1
    ? hmt(language, "rel_yesterday")
    : hmt(language, "rel_ago", -days);
}

const DRAFT_KINDS = new Set([
  "REFUND",
  "DEPOSIT_FORFEITURE",
  "PAYMENT_MOVE",
  "FINAL_SETTLEMENT",
  "SETTLEMENT_CORRECTION",
]);

interface Row {
  icon: ShellIcon;
  title: string;
  detail: string;
  href: string;
  tip: string;
}

function rowOf(language: Language, item: TodoItem): Row | null {
  const unit = item.unit_number ?? "";
  const customer = item.customer_name ?? "";
  const join = (...parts: string[]) => parts.filter(Boolean).join(" · ");
  switch (item.kind) {
    case "overdue_initial_rent":
      return {
        icon: "alert",
        title: hmt(
          language,
          "r_over",
          item.invoice_number ?? "",
          usdFromCents(item.balance_usd_cents ?? 0),
        ),
        detail: hmt(language, "r_over_d", customer, unit),
        href: hashForPage("invoices", `inv:${item.invoice_id ?? ""}`),
        tip: hmt(language, "tip_inv"),
      };
    case "lease_ending":
      return {
        icon: "lease",
        title: hmt(language, "r_lease", unit),
        detail: hmt(language, "r_lease_d", customer),
        href: hashForPage("leases", item.lease_id ?? ""),
        tip: hmt(language, "tip_lease"),
      };
    case "reservation_expiring":
      return {
        icon: "calendar",
        title: hmt(language, "r_resv", unit),
        detail: customer,
        href: hashForPage("reservations", item.reservation_id ?? ""),
        tip: hmt(language, "tip_resv"),
      };
    case "draft_waiting": {
      const kind =
        item.draft_kind !== undefined && DRAFT_KINDS.has(item.draft_kind)
          ? (`dk_${item.draft_kind}` as HomeTextKey)
          : "dk_other";
      return {
        icon: "check",
        title: hmt(language, "r_appr", hmt(language, kind)),
        detail: hmt(language, "r_appr_d", dayText(item.date)),
        href: hashForPage("approvals"),
        tip: hmt(language, "tip_appr"),
      };
    }
    case "deposit_decision":
      return {
        icon: "calendar",
        title: hmt(language, "r_depdec", unit),
        detail: customer,
        href: hashForPage("reservations", item.reservation_id ?? ""),
        tip: hmt(language, "tip_resv"),
      };
    case "readings_missing":
      return {
        icon: "meter",
        title: hmt(language, "r_read"),
        detail: hmt(language, "r_read_d", item.count ?? 0),
        href: hashForPage("utilities"),
        tip: hmt(language, "tip_read"),
      };
    case "letter_day_20":
    case "letter_day_30":
      return {
        icon: "list",
        title: hmt(
          language,
          "r_letter",
          hmt(language, item.kind === "letter_day_20" ? "day20" : "day30"),
          unit,
        ),
        detail: join(customer, item.invoice_number ?? ""),
        href: hashForPage("letters"),
        tip: hmt(language, "tip_letter"),
      };
    case "settlement_open":
      return {
        icon: "moveout",
        title: hmt(language, "r_settle", unit),
        detail: customer,
        href: hashForPage("leases", item.lease_id ?? ""),
        tip: hmt(language, "tip_lease"),
      };
    case "refund_due":
      return {
        icon: "payments",
        title: hmt(language, "r_refund", unit),
        detail: hmt(
          language,
          "r_refund_d",
          customer,
          usdFromCents(item.held_usd_cents ?? 0),
        ),
        href: hashForPage("leases", item.lease_id ?? ""),
        tip: hmt(language, "tip_lease"),
      };
    default:
      // A kind added on the server later is left out until Home knows its words.
      return null;
  }
}

/**
 * The group a row shows in. The server groups by date, but for things that wait for a
 * person (a draft, a Deposit decision, an open Final Settlement) the date is when the wait
 * began, so a past date means "do it today", as in the mock-up, not "overdue".
 */
function groupOf(item: TodoItem, today: string): TodoGroup {
  if (!DEADLINE_KINDS.has(item.kind) && item.date.slice(0, 10) <= today) {
    return "today";
  }
  return item.group;
}

function Card({
  icon,
  tone,
  label,
  value,
  note,
  page,
  tab,
  meter,
  empty,
}: {
  icon: ShellIcon;
  tone: Tone;
  label: string;
  value: string;
  note: string;
  page: PageId;
  /** UI v81 round 4: the sub-tab of that page the card opens ("?tab="). */
  tab?: string;
  /** 0 to 100 for the bar under the note; none when the card has no bar. */
  /** "blank" keeps the room of a bar, so the values of the first row stay level. */
  meter?: number | "blank";
  empty: boolean;
}) {
  return (
    <a
      className={`ui-kpi ui-home-kpi ${empty ? "none" : tone}`}
      href={
        tab === undefined
          ? hashForPage(page)
          : `${hashForPage(page)}?tab=${encodeURIComponent(tab)}`
      }
    >
      <span className="ui-kpi-label">
        <span className="ui-kpi-icon">
          <Icon name={icon} small />
        </span>
        {label}
      </span>
      <span className="ui-kpi-value ui-num">{value}</span>
      <span className="ui-kpi-note">{note}</span>
      {meter === "blank" && (
        <span aria-hidden="true" className="ui-home-meter blank" />
      )}
      {typeof meter === "number" && (
        <span aria-hidden="true" className="ui-home-meter">
          <span
            style={{ width: `${String(Math.max(0, Math.min(100, meter)))}%` }}
          />
        </span>
      )}
    </a>
  );
}

function Cards({
  language,
  cards,
  today,
  extra,
}: {
  language: Language;
  cards: HomeCards;
  today: string;
  /** Cards from other reads: Viewing requests waiting, then Problem reports (design order). */
  extra?: ReactNode;
}) {
  const shown: ReactNode[] = [];
  const units = cards.units_occupied;
  if (units !== undefined) {
    shown.push(
      <Card
        empty={units.total === 0}
        icon="units"
        key="units"
        label={hmt(language, "k_occ")}
        meter={units.total > 0 ? (units.occupied * 100) / units.total : 0}
        note={hmt(language, "k_occ_s", units.reserved, units.vacant)}
        page="units"
        tone="brand"
        value={`${String(units.occupied)} / ${String(units.total)}`}
      />,
    );
  }
  const pending = cards.pending_payment;
  if (pending !== undefined) {
    shown.push(
      <Card
        empty={pending.amount_usd_cents === 0}
        icon="invoice"
        key="pending"
        label={hmt(language, "k_pend")}
        meter="blank"
        note={hmt(
          language,
          pending.invoice_count === 1 ? "k_pend_s1" : "k_pend_s",
          pending.invoice_count,
        )}
        page="invoices"
        tone="warn"
        value={usdFromCents(pending.amount_usd_cents)}
      />,
    );
  }
  const paid = cards.paid_this_month;
  if (paid !== undefined) {
    const label = hmt(language, "k_paid");
    const month = monthText(language, today).split(" ")[0] ?? "";
    if (paid.billed_usd_cents !== undefined) {
      const billed = paid.billed_usd_cents;
      const settled = paid.billed_paid_usd_cents ?? 0;
      const percent = billed > 0 ? Math.floor((settled * 100) / billed) : 0;
      shown.push(
        <Card
          empty={settled === 0}
          icon="payments"
          key="paid"
          label={label}
          meter={percent}
          note={
            billed > 0
              ? hmt(language, "k_paid_s", percent, usdFromCents(billed), month)
              : hmt(language, "k_paid_none")
          }
          page="invoices"
          tone="ok"
          value={usdFromCents(settled)}
        />,
      );
    } else if (paid.received_usd_cents !== undefined) {
      shown.push(
        <Card
          empty={paid.received_usd_cents === 0}
          icon="payments"
          key="paid"
          label={label}
          meter="blank"
          note={hmt(
            language,
            paid.payment_count === 1 ? "k_paid_recv1" : "k_paid_recv",
            paid.payment_count ?? 0,
          )}
          page="payments"
          tone="ok"
          value={usdFromCents(paid.received_usd_cents)}
        />,
      );
    }
  }
  const overdue = cards.overdue;
  if (overdue !== undefined) {
    shown.push(
      <Card
        empty={overdue.amount_usd_cents === 0}
        icon="alert"
        key="overdue"
        label={hmt(language, "k_over")}
        meter="blank"
        note={hmt(
          language,
          overdue.invoice_count === 1 ? "k_over_s1" : "k_over_s",
          overdue.invoice_count,
        )}
        page="invoices"
        tone="err"
        value={usdFromCents(overdue.amount_usd_cents)}
      />,
    );
  }
  const renewal = cards.lease_renewal;
  if (renewal !== undefined) {
    shown.push(
      <Card
        empty={renewal.count === 0}
        icon="lease"
        key="renewal"
        label={hmt(language, "n_lease")}
        note={hmt(language, "n_lease_s", dayText(renewal.end_on_or_before))}
        page="leases"
        tone="info"
        value={String(renewal.count)}
      />,
    );
  }
  const waiting = cards.waiting_for_approval;
  if (waiting !== undefined) {
    shown.push(
      <Card
        empty={waiting.count === 0}
        icon="check"
        key="waiting"
        label={hmt(language, "n_appr")}
        note={
          waiting.money_out_count > 0
            ? hmt(
                language,
                "n_appr_s",
                waiting.count,
                usdFromCents(waiting.money_out_usd_cents),
              )
            : hmt(language, "n_appr_c", waiting.count)
        }
        page="approvals"
        tone="warn"
        value={String(waiting.count)}
      />,
    );
  }
  const readings = cards.meter_readings_missing;
  if (readings !== undefined) {
    shown.push(
      <Card
        empty={readings.count === 0}
        icon="meter"
        key="readings"
        label={hmt(language, "n_read")}
        note={hmt(language, "n_read_s", dayText(readings.reading_date))}
        page="utilities"
        tone="info"
        value={String(readings.count)}
      />,
    );
  }
  const letters = cards.letters_due;
  if (letters !== undefined) {
    shown.push(
      <Card
        empty={letters.count === 0}
        icon="list"
        key="letters"
        label={hmt(language, "n_letters")}
        note={hmt(language, "n_letters_s")}
        page="letters"
        tone="err"
        value={String(letters.count)}
      />,
    );
  }
  if (extra !== null && extra !== undefined)
    shown.push(<Fragment key="problems">{extra}</Fragment>);
  // UI v81 round 4 (owner 08/11/2026): Birthdays and Paid on time, last, as in the design.
  const birthdays = cards.birthdays;
  if (birthdays !== undefined) {
    shown.push(
      <Card
        empty={birthdays.count === 0}
        icon="customers"
        key="birthdays"
        label={hmt(language, "n_bday")}
        note={hmt(language, "n_week_s", dayText(birthdays.to))}
        page="customers"
        tone="info"
        value={String(birthdays.count)}
      />,
    );
  }
  const onTime = cards.paid_on_time;
  if (onTime !== undefined) {
    const percent =
      onTime.invoice_count > 0
        ? Math.floor((onTime.on_time * 100) / onTime.invoice_count)
        : null;
    shown.push(
      <Card
        empty={percent === null}
        icon="check"
        key="ontime"
        label={hmt(language, "n_ontime")}
        meter={percent ?? "blank"}
        note={
          percent === null
            ? hmt(language, "n_ontime_none")
            : hmt(language, "n_ontime_s", onTime.on_time, onTime.invoice_count)
        }
        page="customers"
        tone="ok"
        value={percent === null ? "—" : `${String(percent)}%`}
      />,
    );
  }
  if (shown.length === 0) return null;
  return <CardGrid className="ui-home-kpis">{shown}</CardGrid>;
}

function ProblemsCard({
  language,
  summary,
}: {
  language: Language;
  summary: ProblemSummary;
}) {
  return (
    <Card
      empty={summary.open === 0}
      icon="wrench"
      label={hmt(language, "n_problems")}
      note={hmt(language, "n_problems_s", summary.urgent, summary.late)}
      page="problems"
      tone={summary.urgent > 0 || summary.late > 0 ? "err" : "info"}
      value={String(summary.open)}
    />
  );
}

function VisitsCard({
  language,
  visits,
}: {
  language: Language;
  visits: VisitsWaiting;
}) {
  return (
    <Card
      empty={visits.waiting === 0}
      icon="door"
      label={hmt(language, "n_vr")}
      note={hmt(language, "n_vr_s", visits.late, visits.visitsThisWeek)}
      page="visitreqs"
      tone={visits.late > 0 ? "err" : "brand"}
      value={String(visits.waiting)}
    />
  );
}

/** Home lists each repair cost still waiting for a Manager's check (mock-up round 32 A5). */
function CostsToCheck({
  language,
  summary,
}: {
  language: Language;
  summary: ProblemSummary;
}) {
  if (summary.costs_to_check.length === 0) return null;
  return (
    <section aria-labelledby="home-costs" className="ui-card">
      <h2 id="home-costs">{hmt(language, "n_costs")}</h2>
      <ul className="ui-plain">
        {summary.costs_to_check.map((item) => (
          <li key={item.report_id}>
            <a
              className="ui-num"
              href={hashForPage("problems", `pr:${item.report_id}`)}
            >
              {item.report_number}
            </a>{" "}
            ·{" "}
            {item.unit_number ??
              (language === "km" ? item.place_kh : null) ??
              item.place_en ??
              ""}{" "}
            ·{" "}
            {item.totals
              .map((total) => costText(total.currency, total.amount_minor))
              .join(" + ")}
          </li>
        ))}
      </ul>
    </section>
  );
}

// UI v81 round 3 (owner 07/11/2026 17:30): the Tasks are four cards in one row (two by two on a
// phone): Overdue, Today, This week, Later. Each shows its count and one short line; the chosen
// card's list opens under the cards, one list at a time, and the chosen card is kept in the
// address ("#/home?tasks=overdue") so Back returns to it. On open, Overdue is open when it has
// items; otherwise no list is open.
const TASK_CARDS: readonly {
  group: TodoGroup;
  tone: Tone;
  icon: ShellIcon;
  /** The word kept in the address. */
  word: string;
}[] = [
  { group: "overdue", tone: "err", icon: "alert", word: "overdue" },
  { group: "today", tone: "warn", icon: "check", word: "today" },
  { group: "this_week", tone: "info", icon: "calendar", word: "week" },
  { group: "later", tone: "neutral", icon: "list", word: "later" },
];

/** The Tasks card named in the address ("#/home?tasks=week"), or null. */
export function tasksFromHash(hash: string): TodoGroup | null {
  const word = queryFromHash(hash, "tasks");
  const card = TASK_CARDS.find((candidate) => candidate.word === word);
  return card === undefined ? null : card.group;
}

function tasksHash(group: TodoGroup | null): string {
  const home = hashForPage("home");
  if (group === null) return home;
  const card = TASK_CARDS.find((candidate) => candidate.group === group);
  return card === undefined ? home : `${home}?tasks=${card.word}`;
}

function TodoList({ language, page }: { language: Language; page: HomePage }) {
  const known = page.todo.filter((item) => rowOf(language, item) !== null);
  const inGroup = (group: TodoGroup) =>
    known.filter((item) => groupOf(item, page.business_date) === group);
  const counts = {
    overdue: inGroup("overdue").length,
    today: inGroup("today").length,
    this_week: inGroup("this_week").length,
  };
  const [chosen, setChosen] = useState<TodoGroup | null>(
    () =>
      tasksFromHash(window.location.hash) ??
      (counts.overdue > 0 ? "overdue" : null),
  );
  function choose(group: TodoGroup) {
    const next = chosen === group ? null : group;
    setChosen(next);
    window.history.replaceState(null, "", tasksHash(next));
  }
  // The earliest item of a group names its line: "Oldest: 29 days late", "Next: in 2 days".
  const earliest = (items: TodoItem[]) =>
    items.reduce((first, item) => (item.date < first.date ? item : first));
  const lineOf = (group: TodoGroup, items: TodoItem[]) => {
    if (items.length === 0)
      return hmt(language, group === "overdue" ? "tk_over_none" : "tk_none");
    if (group === "today") return hmt(language, "tk_today_s");
    const when = relativeText(language, earliest(items), page.business_date);
    return hmt(language, group === "overdue" ? "tk_oldest" : "tk_next", when);
  };
  const open = TASK_CARDS.find((card) => card.group === chosen);
  const openItems = open === undefined ? [] : inGroup(open.group);
  return (
    <section aria-labelledby="home-todo" className="ui-card ui-todo-card">
      {/* UI v81 round 4 (owner 08/11/2026): no summary line; the four cards say it. */}
      <header>
        <h2 id="home-todo">{hmt(language, "todo_t")}</h2>
      </header>
      <CardGrid label={hmt(language, "todo_t")} tasks>
        {TASK_CARDS.map(({ group, tone, icon }) => {
          const items = inGroup(group);
          return (
            <button
              aria-controls="home-tasks-list"
              aria-pressed={chosen === group}
              className={`ui-kpi ${items.length === 0 ? "none" : tone}`}
              key={group}
              onClick={() => {
                choose(group);
              }}
              type="button"
            >
              <span className="ui-kpi-label">
                <span className="ui-kpi-icon">
                  <Icon name={icon} small />
                </span>
                <span>{hmt(language, `g_${group}`)}</span>
              </span>
              <span className="ui-kpi-value ui-num">{items.length}</span>
              <span className="ui-kpi-note">{lineOf(group, items)}</span>
            </button>
          );
        })}
      </CardGrid>
      <div
        className="ui-tasks-list"
        hidden={open === undefined || openItems.length === 0}
        id="home-tasks-list"
      >
        {open !== undefined && openItems.length > 0 && (
          <>
            <h3>
              <span className={`ui-dot ${open.tone}`} />
              {hmt(language, `g_${open.group}`)}
              <span className="ui-count ui-num">{openItems.length}</span>
            </h3>
            <ul className="ui-todos">
              {openItems.map((item, index) => {
                const row = rowOf(language, item);
                if (row === null) return null;
                return (
                  <li
                    className={`ui-todo ${open.tone}`}
                    key={`${item.kind}:${item.date}:${String(index)}`}
                  >
                    <span aria-hidden="true" className="ui-todo-icon">
                      <Icon name={row.icon} />
                    </span>
                    <span className="ui-todo-body">
                      <b>{row.title}</b>
                      {row.detail !== "" && <span>{row.detail}</span>}
                    </span>
                    <span className="ui-when ui-num">
                      {dayText(item.date)}
                      <small>
                        {relativeText(language, item, page.business_date)}
                      </small>
                    </span>
                    <a
                      aria-label={`${row.tip}: ${row.title}`}
                      className="ui-iconbtn ui-todo-go"
                      href={row.href}
                      title={row.tip}
                    >
                      <Icon name="forward" />
                    </a>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
      <p className="ui-muted ui-small ui-tasks-hint">
        {hmt(language, "tk_hint")}
      </p>
    </section>
  );
}

/** The line under the list that confirms the last automatic jobs (owner, 12/10/2026). */
function JobsLine({ language, page }: { language: Language; page: HomePage }) {
  const { last_billing_at, rate_updated_at, next_billing_date } = page.jobs;
  const parts = [
    last_billing_at === null
      ? hmt(language, "job_bill_none")
      : last_billing_at !== undefined
        ? hmt(language, "job_bill", momentText(last_billing_at))
        : "",
    rate_updated_at === null
      ? hmt(language, "job_rate_none")
      : rate_updated_at !== undefined
        ? hmt(language, "job_rate", momentText(rate_updated_at))
        : "",
    next_billing_date !== undefined
      ? hmt(language, "job_next", dayText(next_billing_date))
      : "",
  ].filter(Boolean);
  if (parts.length === 0) return null;
  const quiet = last_billing_at === null || rate_updated_at === null;
  return (
    <p className={quiet ? "ui-addup ui-warnv" : "ui-addup"}>
      <Icon name={quiet ? "alert" : "check"} small />
      <span>{parts.join(" · ")}</span>
    </p>
  );
}

export function HomeScreen({
  language,
  propertyId,
  active,
  homeApi,
  capabilities,
  problemsApi = defaultProblemsApi,
  ledgerApi = defaultLedgerApi,
  attendanceApi = defaultHrApi,
  visitsApi = defaultTelegramApi,
}: HomeScreenProps) {
  const may = (capability: string) =>
    capabilities === null || capabilities.has(capability);
  const [page, setPage] = useState<HomePage | null>(null);
  const [failure, setFailure] = useState<"failed" | "not_allowed" | null>(null);
  const [problems, setProblems] = useState<ProblemSummary | null>(null);
  const [visits, setVisits] = useState<VisitsWaiting | null>(null);
  const sequence = useRef(0);
  const seesVisits = capabilities?.has("visit_requests.read") === true;
  // Only a person known to see Problem reports reads the card.
  const seesProblems = capabilities?.has("problem_reports.read") === true;
  const checksCosts = capabilities?.has("problem_reports.costs") === true;

  const load = useCallback(() => {
    if (propertyId === "") return;
    const operation = ++sequence.current;
    setFailure(null);
    homeApi
      .home(propertyId)
      .then((loaded) => {
        if (operation === sequence.current) setPage(loaded);
      })
      .catch((error: unknown) => {
        if (operation !== sequence.current) return;
        // An old page would show numbers that may be wrong now.
        setPage(null);
        setFailure(
          error instanceof ReportsNotAllowedError ? "not_allowed" : "failed",
        );
      });
    if (seesProblems)
      problemsApi
        .summary(propertyId)
        .then((loaded) => {
          if (operation === sequence.current) setProblems(loaded);
        })
        .catch(() => {
          // The card is left out; the rest of Home still shows.
          if (operation === sequence.current) setProblems(null);
        });
    if (seesVisits)
      visitsApi
        .visitRequests(propertyId)
        .then((loaded) => {
          if (operation === sequence.current)
            setVisits(visitsWaitingOf(loaded.requests, loaded.today));
        })
        .catch(() => {
          if (operation === sequence.current) setVisits(null);
        });
  }, [homeApi, problemsApi, propertyId, seesProblems, seesVisits, visitsApi]);

  // Another Property never shows the numbers of the one before.
  useEffect(() => {
    sequence.current++;
    setPage(null);
    setProblems(null);
    setVisits(null);
  }, [propertyId]);

  useEffect(() => {
    if (active) load();
  }, [active, load]);

  const actions = (may("payments.record") ||
    may("utility_readings.record")) && (
    <>
      {may("payments.record") && (
        <a className="ui-btn primary" href={hashForPage("payments", "receive")}>
          <Icon name="payments" />
          {hmt(language, "qa_record")}
        </a>
      )}
      {may("utility_readings.record") && (
        <a className="ui-btn" href={hashForPage("utilities")}>
          <Icon name="meter" />
          {hmt(language, "qa_readings")}
        </a>
      )}
    </>
  );

  if (propertyId === "") return null;

  // UI v81 round 4 (owner 08/11/2026): no line under the title; only the two buttons beside it.
  // Home batch (owner 08/11/2026 08:14): drawn with the shared PageHeader.
  const head = (
    <PageHeader actions={actions} title={pageName("home", language)} />
  );

  if (failure !== null) {
    return (
      <>
        {head}
        <div className="ui-notice warn" role="status">
          <Icon name="alert" />
          <p>{hmt(language, failure)}</p>
          {failure === "failed" && (
            <button className="ui-btn" onClick={load} type="button">
              {hmt(language, "retry")}
            </button>
          )}
        </div>
      </>
    );
  }
  if (page === null) {
    return (
      <>
        {head}
        <p className="ui-muted" role="status">
          {hmt(language, "loading")}
        </p>
      </>
    );
  }
  // UI v81: shown only to a person known to hold the rights (the server checks again).
  const seesOwnerMoney =
    capabilities?.has("ledger.owner_money") === true &&
    capabilities.has("ledger.read");
  const seesAttendance = capabilities?.has("hr.attendance.read") === true;
  return (
    <>
      {head}
      {seesOwnerMoney && (
        <OwnerMoney
          active={active}
          api={ledgerApi}
          language={language}
          propertyId={propertyId}
          today={page.business_date}
        />
      )}
      {seesAttendance && (
        <AttendanceCard
          active={active}
          api={attendanceApi}
          language={language}
          propertyId={propertyId}
        />
      )}
      <Cards
        cards={page.cards}
        extra={
          visits === null && problems === null ? null : (
            <>
              {visits !== null && (
                <VisitsCard language={language} visits={visits} />
              )}
              {problems !== null && (
                <ProblemsCard language={language} summary={problems} />
              )}
            </>
          )
        }
        language={language}
        today={page.business_date}
      />
      {problems !== null && checksCosts && (
        <CostsToCheck language={language} summary={problems} />
      )}
      <TodoList language={language} page={page} />
      <JobsLine language={language} page={page} />
    </>
  );
}
