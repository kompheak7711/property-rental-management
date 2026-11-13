// Leasing batch (owner 13/11/2026, design FINAL): beside the Calendar, the quick numbers (full
// tonight, arriving, leaving, not paid, booking sites) and the Today panel. Each guest who
// arrives or leaves today has one button: Check in or Check out, or the step still missing
// before a check-in (Take payment, Take deposit, Add ID number, Room not ready), which opens the
// booking where that step is done. The checks are the database's (migration 20270602_312):
// paid, the deposit held, the guest's ID number, the room ready; the two ticks are asked here.
// Display only: the server checks every step again.

import { useCallback, useEffect, useRef, useState } from "react";

import { dayText, momentText } from "../shell/format";
import { Icon } from "../shell/icons";
import { hashForPage } from "../shell/navigation";
import { Dialog } from "../shell/ui";
import type { Language } from "../signInText";
import { stepProblem } from "./BookingDetail";
import { nightOf } from "./nights";
import {
  addDays,
  type Booking,
  type CalendarBooking,
  type ShortStaysApi,
  type SiteCalendar,
  type StayCalendar,
} from "./shortStaysClient";
import { timeText } from "./StaySteps";
import { st, type StaysTextKey } from "./text";

/** The days the quick numbers look ahead for bookings not paid yet. */
const AHEAD = 14;

type NextStep = "pay" | "deposit" | "id" | "room" | "in";

/** What an arriving guest still needs before the check-in, in the order the desk does it. */
export function nextStep(booking: Booking): NextStep {
  if (booking.payment !== "PAID" && booking.payment !== "PAID_ON_SITE")
    return "pay";
  if (booking.deposit?.status !== "HELD") return "deposit";
  if (!booking.guest_has_id) return "id";
  if (booking.unit_status !== "VACANT") return "room";
  return "in";
}

interface TodayData {
  calendar: StayCalendar;
  arriving: Booking[];
  leaving: Booking[];
  sites: SiteCalendar[] | null;
}

function stays(calendar: StayCalendar): (CalendarBooking & {
  unit_number: string;
})[] {
  return calendar.units.flatMap((unit) =>
    unit.bookings.map((booking) => ({
      ...booking,
      unit_number: unit.unit_number,
    })),
  );
}

export function TodayPanel({
  language,
  propertyId,
  api,
  may,
  today,
  reloadKey,
  onChanged,
}: {
  language: Language;
  propertyId: string;
  api: ShortStaysApi;
  may: (capability: string) => boolean;
  today: string;
  /** Goes up each time the Calendar is read, so the panel reads again too (0: not yet). */
  reloadKey: number;
  /** A check-in or check-out was made: the Calendar reads again. */
  onChanged: () => void;
}) {
  const [data, setData] = useState<TodayData | null>(null);
  const [failed, setFailed] = useState(false);
  const [asking, setAsking] = useState<{
    kind: "in" | "out";
    booking: Booking;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<StaysTextKey | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [copy, setCopy] = useState(false);
  const [rules, setRules] = useState(false);
  const sequence = useRef(0);
  const maySites = may("short_stays.approve");

  const load = useCallback(() => {
    const operation = ++sequence.current;
    setFailed(false);
    void (async () => {
      const calendar = await api.calendar(propertyId, today, AHEAD);
      const all = stays(calendar);
      const arrivingIds = all
        .filter((b) => b.status === "BOOKED" && b.check_in_on === today)
        .map((b) => b.booking_id);
      const leavingIds = all
        .filter((b) => b.status === "CHECKED_IN" && b.check_out_on === today)
        .map((b) => b.booking_id);
      const [arriving, leaving, sites] = await Promise.all([
        Promise.all(arrivingIds.map((id) => api.get(propertyId, id))),
        Promise.all(leavingIds.map((id) => api.get(propertyId, id))),
        maySites
          ? api.siteCalendars(propertyId).catch(() => null)
          : Promise.resolve(null),
      ]);
      if (operation === sequence.current)
        setData({ calendar, arriving, leaving, sites });
    })().catch(() => {
      if (operation === sequence.current) setFailed(true);
    });
  }, [api, propertyId, today, maySites]);

  // The panel reads after the Calendar has (reloadKey 1 and up), so it is read once per change.
  useEffect(() => {
    if (reloadKey > 0) load();
  }, [load, reloadKey]);

  if (failed)
    return (
      <div className="ui-notice warn" role="status">
        <Icon name="alert" />
        <p>{st(language, "failed")}</p>
        <button className="ui-btn" onClick={load} type="button">
          {st(language, "retry")}
        </button>
      </div>
    );
  if (data === null)
    return (
      <p className="ui-muted" role="status">
        {st(language, "loading")}
      </p>
    );

  const { calendar, arriving, leaving, sites } = data;
  const forRent = calendar.units.filter((unit) => unit.for_rent);
  const freeTonight = forRent.filter(
    (unit) => nightOf(unit, today).kind === "FREE",
  ).length;
  const all = stays(calendar);
  const staying = all.filter((b) => b.status === "CHECKED_IN").length;
  const unpaid = all
    .filter(
      (b) =>
        b.status === "BOOKED" &&
        !b.paid &&
        b.check_in_on < addDays(today, AHEAD),
    )
    .sort((a, b) => a.check_in_on.localeCompare(b.check_in_on));
  const toClean = calendar.units.filter((unit) => unit.status === "CLEANING");
  const activeSites = (sites ?? []).filter((site) => site.active);
  const badSites = activeSites.filter((site) => site.last_read_ok === false);
  const mayDesk = may("short_stays.desk");

  const open = (booking: Booking) =>
    hashForPage("shortstays", `st:${booking.booking_id}`);

  const run = () => {
    if (asking === null) return;
    const { kind, booking } = asking;
    if (kind === "in" && !(copy && rules)) {
      setProblem("td_ticks");
      return;
    }
    setBusy(true);
    setProblem(null);
    void api
      .step(
        propertyId,
        booking.booking_id,
        kind === "in" ? "check-in" : "check-out",
        kind === "in"
          ? {
              version: booking.version,
              id_copy_made: true,
              house_rules_signed: true,
            }
          : { version: booking.version },
      )
      .then(() => {
        setAsking(null);
        setDone(
          st(
            language,
            kind === "in" ? "td_done_in" : "td_done_out",
            booking.guest_name,
          ),
        );
        onChanged();
      })
      .catch((error: unknown) => {
        setProblem(stepProblem(error));
      })
      .finally(() => {
        setBusy(false);
      });
  };

  const stepButton = (booking: Booking) => {
    const step = nextStep(booking);
    if (step === "in")
      return (
        <button
          className="ui-btn primary"
          disabled={!mayDesk}
          onClick={() => {
            setCopy(false);
            setRules(false);
            setProblem(null);
            setAsking({ kind: "in", booking });
          }}
          type="button"
        >
          <Icon name="door" small />
          {st(language, "in_b")}
        </button>
      );
    if (step === "room")
      return (
        <a
          className="ui-btn ss-step"
          href={`${hashForPage("shortstays")}?tab=clean`}
        >
          {st(language, "td_room")}
        </a>
      );
    return (
      <a className="ui-btn ss-step" href={open(booking)}>
        {st(
          language,
          step === "pay"
            ? "td_pay"
            : step === "deposit"
              ? "td_deposit"
              : "td_id",
        )}
      </a>
    );
  };

  const arriveNote = (booking: Booking): { text: string; warn: boolean } => {
    const step = nextStep(booking);
    if (step === "pay")
      return { text: st(language, "td_not_paid"), warn: true };
    if (step === "deposit")
      return { text: st(language, "td_no_deposit"), warn: true };
    return {
      text: `${st(language, "td_paid")} · ${timeText(booking.check_in_time)}`,
      warn: false,
    };
  };

  return (
    <>
      <div className="ss-kpis">
        <a className="ss-kpi" href={`${hashForPage("shortstays")}?tab=cal`}>
          <span>{st(language, "kp_full")}</span>
          <b className="ui-num">
            {st(
              language,
              "kp_full_v",
              forRent.length - freeTonight,
              forRent.length,
            )}
          </b>
          <span>{st(language, "kp_full_s", freeTonight)}</span>
        </a>
        <a className="ss-kpi" href="#ss-today">
          <span>{st(language, "kp_arrive")}</span>
          <b className="ui-num">{arriving.length}</b>
          <span>{arriving.map((b) => b.guest_name).join(", ")}</span>
        </a>
        <a className="ss-kpi" href="#ss-today">
          <span>{st(language, "kp_leave")}</span>
          <b className="ui-num">{leaving.length}</b>
          <span>{leaving.map((b) => b.guest_name).join(", ")}</span>
        </a>
        <a
          className={`ss-kpi${unpaid.length > 0 ? " warn" : ""}`}
          href={`${hashForPage("shortstays")}?show=booked&tab=list`}
        >
          <span>{st(language, "kp_unpaid")}</span>
          <b className="ui-num">{unpaid.length}</b>
          <span>{st(language, "kp_unpaid_s")}</span>
        </a>
        {maySites && (
          <a
            className={`ss-kpi${badSites.length > 0 ? " warn" : ""}`}
            href={`${hashForPage("shortstays")}?tab=sites`}
          >
            <span>{st(language, "kp_sites")}</span>
            {activeSites.length === 0 ? (
              <span>{st(language, "kp_sites_none")}</span>
            ) : badSites.length === 0 ? (
              <span className="ok">
                {st(language, "kp_sites_ok")}
                {activeSites[0]?.last_read_at != null &&
                  ` · ${momentText(activeSites[0].last_read_at)}`}
              </span>
            ) : (
              badSites.slice(0, 2).map((site) => (
                <span className="bad" key={site.calendar_id}>
                  {st(
                    language,
                    "kp_sites_bad",
                    `${site.site_name} (${site.unit_number})`,
                  )}
                </span>
              ))
            )}
          </a>
        )}
      </div>
      <aside aria-labelledby="ss-today-h" className="ss-today" id="ss-today">
        {done !== null && (
          <div className="ui-notice ok" role="status">
            <Icon name="check" />
            <p>{done}</p>
          </div>
        )}
        <section className="ui-card">
          <h2 id="ss-today-h">
            {st(language, "td_title", dayText(today))}
            <span className="ui-muted">
              {st(language, "td_staying", staying)}
            </span>
          </h2>
          <h3>
            {st(language, "td_arrive")} · {arriving.length}
          </h3>
          {arriving.length === 0 ? (
            <p className="ui-small ui-muted">{st(language, "td_none_in")}</p>
          ) : (
            <ul className="ui-plain ss-guests">
              {arriving.map((booking) => {
                const note = arriveNote(booking);
                return (
                  <li key={booking.booking_id}>
                    <a href={open(booking)}>
                      <b>{booking.guest_name}</b> ·{" "}
                      <span className="ui-num">{booking.unit_number}</span>
                      <span className={`ui-sub2${note.warn ? " ss-warn" : ""}`}>
                        {note.text}
                      </span>
                    </a>
                    {mayDesk && stepButton(booking)}
                  </li>
                );
              })}
            </ul>
          )}
          <h3>
            {st(language, "td_leave")} · {leaving.length}
          </h3>
          {leaving.length === 0 ? (
            <p className="ui-small ui-muted">{st(language, "td_none_out")}</p>
          ) : (
            <ul className="ui-plain ss-guests">
              {leaving.map((booking) => (
                <li key={booking.booking_id}>
                  <a href={open(booking)}>
                    <b>{booking.guest_name}</b> ·{" "}
                    <span className="ui-num">{booking.unit_number}</span>
                    <span className="ui-sub2">
                      {st(language, "td_by", timeText(booking.check_out_time))}
                    </span>
                  </a>
                  {mayDesk && (
                    <button
                      className="ui-btn"
                      onClick={() => {
                        setProblem(null);
                        setAsking({ kind: "out", booking });
                      }}
                      type="button"
                    >
                      {st(language, "out_b")}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="ui-card">
          <h2>{st(language, "td_clean")}</h2>
          <p className="ui-small">
            {toClean.length === 0
              ? st(language, "td_clean_none")
              : toClean.map((unit) => unit.unit_number).join(" · ")}
          </p>
          <a
            className="ss-link44"
            href={`${hashForPage("shortstays")}?tab=clean`}
          >
            {st(language, "td_clean_open")}
          </a>
        </section>
        {unpaid.length > 0 && (
          <section className="ui-card ss-unpaid-card">
            <h2>{st(language, "td_unpaid")}</h2>
            <ul className="ui-plain">
              {unpaid.slice(0, 5).map((booking) => (
                <li key={booking.booking_id}>
                  <a
                    className="ss-link44"
                    href={hashForPage("shortstays", `st:${booking.booking_id}`)}
                  >
                    {st(
                      language,
                      "td_unpaid_row",
                      booking.guest_name,
                      booking.unit_number,
                      dayText(booking.check_in_on),
                    )}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}
      </aside>
      {asking !== null && (
        <Dialog
          busy={busy}
          closeLabel={st(language, "td_close")}
          onClose={() => {
            if (!busy) setAsking(null);
          }}
          onSubmit={(event) => {
            event.preventDefault();
            run();
          }}
          submitLabel={st(language, asking.kind === "in" ? "in_b" : "out_b")}
          title={st(
            language,
            asking.kind === "in" ? "td_in_t" : "td_out_t",
            asking.booking.guest_name,
          )}
        >
          {problem !== null && (
            <div className="ui-notice warn" role="alert">
              <Icon name="alert" />
              <p>{st(language, problem)}</p>
            </div>
          )}
          {asking.kind === "in" ? (
            <>
              <p>
                {st(
                  language,
                  "td_in_s",
                  asking.booking.unit_number,
                  asking.booking.booking_number,
                )}
              </p>
              <label className="ui-chk">
                <input
                  checked={copy}
                  disabled={busy}
                  onChange={(event) => {
                    setCopy(event.currentTarget.checked);
                  }}
                  type="checkbox"
                />
                {st(language, "in_copy")}
              </label>
              <label className="ui-chk">
                <input
                  checked={rules}
                  disabled={busy}
                  onChange={(event) => {
                    setRules(event.currentTarget.checked);
                  }}
                  type="checkbox"
                />
                {st(language, "in_rules")}
              </label>
            </>
          ) : (
            <p>
              {st(
                language,
                "td_out_s",
                asking.booking.guest_name,
                asking.booking.unit_number,
              )}
            </p>
          )}
        </Dialog>
      )}
    </>
  );
}
