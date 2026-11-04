// Daily and weekly rent, phase 6 step 3: the steps of a stay on the booking page (migration
// 20270602_312). Payment (the booking's Invoice, paid on Receive payment, or paid on the booking
// site), the deposit (cash or a card hold, never a card number), check-in, check-out, the room
// check with any damage, the Manager's decision on damage and the end of the deposit. Each button
// shows only to a person who holds its right; the server checks every step again.

import { type FormEvent, useState } from "react";

import { dayText, momentText, usdFromCents } from "../shell/format";
import { Icon } from "../shell/icons";
import { hashForPage } from "../shell/navigation";
import { Chip, type Tone } from "../shell/ui";
import type { Language } from "../signInText";
import type { Booking, PaymentState, StayStep } from "./shortStaysClient";
import { st } from "./text";

export interface StepsProps {
  language: Language;
  booking: Booking;
  today: string;
  may: (capability: string) => boolean;
  busy: boolean;
  /** Runs one step; the page shows the booking the server answers with. */
  onStep: (step: StayStep, body: Record<string, unknown> | null) => void;
  onDecide: (damageId: string, approve: boolean, note: string) => void;
}

const PAY_TONES: Record<PaymentState, Tone> = {
  NOT_BILLED: "warn",
  UNPAID: "warn",
  PARTIALLY_PAID: "warn",
  PAID: "ok",
  PAID_ON_SITE: "ok",
};

function isPaid(booking: Booking): boolean {
  return booking.payment === "PAID" || booking.payment === "PAID_ON_SITE";
}

/** "80" or "80.50" dollars as cents; null when it is not a money amount. */
export function centsOf(text: string): number | null {
  const match = /^(\d{1,7})(?:\.(\d{1,2}))?$/.exec(text.trim());
  if (match === null) return null;
  const cents =
    Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  return cents > 0 ? cents : null;
}

function Done({ ok, text }: { ok: boolean; text: string }) {
  return (
    <li className={ok ? "ss-ok" : "ss-todo"}>
      <Icon name={ok ? "check" : "x"} small />
      <span>{text}</span>
    </li>
  );
}

export function PaymentCard({
  language,
  booking,
  may,
  busy,
  onStep,
}: StepsProps) {
  const open = booking.status === "BOOKED" && booking.payment === "NOT_BILLED";
  return (
    <section aria-labelledby="ss-pay" className="ui-card">
      <div className="ui-hrow">
        <h2 id="ss-pay">{st(language, "pay_t")}</h2>
        <Chip tone={PAY_TONES[booking.payment]}>
          {st(language, `pay_${booking.payment}`)}
        </Chip>
      </div>
      {booking.invoice !== null && booking.payment !== "NOT_BILLED" && (
        <p>
          <a
            className="ui-num"
            href={hashForPage("invoices", `inv:${booking.invoice.invoice_id}`)}
          >
            {st(language, "open_inv", booking.invoice.invoice_number)}
          </a>{" "}
          ·{" "}
          <span className="ui-num">
            {usdFromCents(booking.invoice.total_usd_cents)}
          </span>
        </p>
      )}
      {open && <p className="ui-small ui-muted">{st(language, "bill_s")}</p>}
      <div className="ui-actions">
        {open && may("short_stays.desk") && (
          <button
            className="ui-btn primary"
            disabled={busy}
            onClick={() => {
              onStep("bill", { version: booking.version });
            }}
            type="button"
          >
            <Icon name="invoice" small />
            {st(language, "bill")}
          </button>
        )}
        {open &&
          booking.source === "BOOKING_SITE" &&
          may("short_stays.desk") && (
            <button
              className="ui-btn"
              disabled={busy}
              onClick={() => {
                onStep("paid-on-site", { version: booking.version });
              }}
              title={st(language, "on_site_s", booking.site_name ?? "")}
              type="button"
            >
              {st(language, "on_site")}
            </button>
          )}
        {(booking.payment === "UNPAID" ||
          booking.payment === "PARTIALLY_PAID") &&
          may("payments.record") && (
            <a
              className="ui-btn primary"
              href={hashForPage("payments", `receive:${booking.customer_id}`)}
            >
              <Icon name="payments" small />
              {st(language, "receive")}
            </a>
          )}
      </div>
    </section>
  );
}

export function DepositCard({
  language,
  booking,
  may,
  busy,
  onStep,
}: StepsProps) {
  const [kind, setKind] = useState<"CASH" | "CARD_HOLD">("CASH");
  const [reference, setReference] = useState("");
  const [last4, setLast4] = useState("");
  const deposit = booking.deposit;
  const mayTake =
    deposit === null &&
    (booking.status === "BOOKED" || booking.status === "CHECKED_IN") &&
    may("short_stays.desk");
  const kept = booking.damages
    .filter((damage) => damage.status === "APPROVED")
    .reduce((sum, damage) => sum + damage.from_deposit_usd_cents, 0);
  const endReady =
    deposit?.status === "HELD" &&
    booking.status === "CHECKED_OUT" &&
    booking.room_check?.status === "DONE" &&
    !booking.damages.some((damage) => damage.status === "WAITING");
  const mayEnd = endReady && may("short_stays.desk");
  const referenceOk = kind === "CASH" || reference.trim() !== "";
  const last4Ok = kind === "CASH" || last4 === "" || /^\d{4}$/.test(last4);
  const take = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!referenceOk || !last4Ok) return;
    onStep("deposit", {
      kind,
      ...(kind === "CARD_HOLD" ? { hold_reference: reference.trim() } : {}),
      ...(kind === "CARD_HOLD" && last4 !== "" ? { card_last4: last4 } : {}),
    });
  };
  return (
    <section aria-labelledby="ss-dep" className="ui-card">
      <h2 id="ss-dep">{st(language, "dep_t")}</h2>
      {deposit === null ? (
        <p className="ui-muted">{st(language, "dep_none")}</p>
      ) : (
        <p>
          {st(language, `dep_${deposit.kind}`)} ·{" "}
          <b className="ui-num">{usdFromCents(deposit.amount_usd_cents)}</b> ·{" "}
          {deposit.status === "KEPT"
            ? st(language, "dep_KEPT", usdFromCents(deposit.kept_usd_cents))
            : st(language, `dep_${deposit.status}`)}
          {deposit.hold_reference !== null && (
            <span className="ui-sub2 ui-num">
              {deposit.hold_reference}
              {deposit.card_last4 !== null && ` · •••• ${deposit.card_last4}`}
            </span>
          )}
        </p>
      )}
      {mayTake && (
        <form className="ui-form" noValidate onSubmit={take}>
          <fieldset className="ui-radios">
            <legend className="ui-sr">{st(language, "dep_t")}</legend>
            {(["CASH", "CARD_HOLD"] as const).map((value) => (
              <label className="ui-chk" key={value}>
                <input
                  checked={kind === value}
                  disabled={busy}
                  name="ss-dep-kind"
                  onChange={() => {
                    setKind(value);
                  }}
                  type="radio"
                />
                {st(language, `dep_${value}`)}
              </label>
            ))}
          </fieldset>
          {kind === "CARD_HOLD" && (
            <div className="ui-row2">
              <div className="ui-field">
                <label htmlFor="ss-dep-ref">
                  {st(language, "dep_ref")}
                  <span className="req">{st(language, "required")}</span>
                </label>
                <input
                  aria-describedby="ss-dep-never"
                  autoComplete="off"
                  disabled={busy}
                  id="ss-dep-ref"
                  maxLength={60}
                  onChange={(event) => {
                    setReference(event.currentTarget.value);
                  }}
                  value={reference}
                />
                <p className="ui-small ui-muted" id="ss-dep-never">
                  {st(language, "dep_never")}
                </p>
              </div>
              <div className="ui-field">
                <label htmlFor="ss-dep-last4">
                  {st(language, "dep_last4")}
                </label>
                <input
                  aria-invalid={!last4Ok}
                  autoComplete="off"
                  disabled={busy}
                  id="ss-dep-last4"
                  inputMode="numeric"
                  maxLength={4}
                  onChange={(event) => {
                    setLast4(event.currentTarget.value);
                  }}
                  value={last4}
                />
              </div>
            </div>
          )}
          <div className="ui-actions">
            <button
              className="ui-btn primary"
              disabled={busy || !referenceOk || !last4Ok}
              type="submit"
            >
              {st(language, "dep_take")}
            </button>
          </div>
        </form>
      )}
      {deposit?.status === "HELD" &&
        booking.status === "CHECKED_OUT" &&
        !endReady && (
          <p className="ui-small ui-muted">{st(language, "dep_wait")}</p>
        )}
      {mayEnd && (
        <div className="ui-actions">
          <button
            className="ui-btn primary"
            disabled={busy}
            onClick={() => {
              onStep("deposit/end", null);
            }}
            type="button"
          >
            {kept > 0
              ? st(
                  language,
                  "dep_end_keep",
                  usdFromCents(kept),
                  usdFromCents(deposit.amount_usd_cents - kept),
                )
              : st(language, "dep_end")}
          </button>
        </div>
      )}
    </section>
  );
}

export function CheckInCard({
  language,
  booking,
  today,
  may,
  busy,
  onStep,
}: StepsProps) {
  const [copy, setCopy] = useState(false);
  const [rules, setRules] = useState(false);
  if (booking.status !== "BOOKED") return null;
  const day = today >= booking.check_in_on && today < booking.check_out_on;
  const ready = {
    paid: isPaid(booking),
    deposit: booking.deposit?.status === "HELD",
    id: booking.guest_has_id,
    day,
    room: booking.unit_status === "VACANT",
  };
  const all = Object.values(ready).every(Boolean) && copy && rules;
  return (
    <section aria-labelledby="ss-in" className="ui-card">
      <h2 id="ss-in">{st(language, "in_t")}</h2>
      <ul className="ui-plain ss-ready">
        <Done ok={ready.paid} text={st(language, "in_paid")} />
        <Done ok={ready.deposit} text={st(language, "in_deposit")} />
        <Done ok={ready.id} text={st(language, "in_id")} />
        <Done
          ok={ready.day}
          text={st(language, "in_day", dayText(booking.check_in_on))}
        />
        <Done ok={ready.room} text={st(language, "in_room")} />
      </ul>
      {may("short_stays.desk") && (
        <>
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
          <div className="ui-actions">
            <button
              className="ui-btn primary"
              disabled={busy || !all}
              onClick={() => {
                onStep("check-in", {
                  version: booking.version,
                  id_copy_made: true,
                  house_rules_signed: true,
                });
              }}
              type="button"
            >
              <Icon name="door" small />
              {st(language, "in_b")}
            </button>
          </div>
        </>
      )}
    </section>
  );
}

export function CheckOutCard({
  language,
  booking,
  may,
  busy,
  onStep,
}: StepsProps) {
  if (booking.status !== "CHECKED_IN") return null;
  return (
    <section aria-labelledby="ss-out" className="ui-card">
      <h2 id="ss-out">{st(language, "out_t")}</h2>
      <p className="ui-small ui-muted">{st(language, "out_s")}</p>
      {may("short_stays.desk") && (
        <div className="ui-actions">
          <button
            className="ui-btn primary"
            disabled={busy}
            onClick={() => {
              onStep("check-out", { version: booking.version });
            }}
            type="button"
          >
            <Icon name="moveout" small />
            {st(language, "out_b")}
          </button>
        </div>
      )}
    </section>
  );
}

export function RoomCheckCard({
  language,
  booking,
  may,
  busy,
  onStep,
}: StepsProps) {
  const [note, setNote] = useState("");
  const [damaged, setDamaged] = useState(false);
  const [what, setWhat] = useState("");
  const [cost, setCost] = useState("");
  const [checked, setChecked] = useState(false);
  const task = booking.room_check;
  if (task === null) return null;
  if (task.status !== "TO_DO")
    return (
      <section aria-labelledby="ss-room" className="ui-card">
        <h2 id="ss-room">{st(language, "room_t")}</h2>
        <p>
          {st(language, "room_done", momentText(task.done_at))}
          {task.note !== null && <span className="ui-sub2">{task.note}</span>}
        </p>
      </section>
    );
  const cents = centsOf(cost);
  const wrongWhat = damaged && what.trim() === "";
  const wrongCost = damaged && cents === null;
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setChecked(true);
    if (wrongWhat || wrongCost) return;
    onStep("room-check", {
      ...(note.trim() === "" ? {} : { note: note.trim() }),
      ...(damaged ? { damage: what.trim(), damage_usd_cents: cents } : {}),
    });
  };
  return (
    <section aria-labelledby="ss-room" className="ui-card">
      <h2 id="ss-room">{st(language, "room_t")}</h2>
      <p className="ui-small ui-muted">
        {st(language, "room_due", dayText(task.task_on))}
      </p>
      {may("short_stays.housekeeping") && (
        <form className="ui-form" noValidate onSubmit={submit}>
          <label className="ui-chk">
            <input
              checked={damaged}
              disabled={busy}
              onChange={(event) => {
                setDamaged(event.currentTarget.checked);
              }}
              type="checkbox"
            />
            {st(language, "room_damage")}
          </label>
          {damaged && (
            <div className="ui-row2">
              <div className="ui-field">
                <label htmlFor="ss-room-what">
                  {st(language, "room_what")}
                  <span className="req">{st(language, "required")}</span>
                </label>
                <input
                  aria-invalid={checked && wrongWhat}
                  autoComplete="off"
                  disabled={busy}
                  id="ss-room-what"
                  maxLength={500}
                  onChange={(event) => {
                    setWhat(event.currentTarget.value);
                  }}
                  value={what}
                />
                {checked && wrongWhat && (
                  <p className="ui-error">
                    <Icon name="alert" small />
                    <span>{st(language, "e_what")}</span>
                  </p>
                )}
              </div>
              <div className="ui-field">
                <label htmlFor="ss-room-cost">
                  {st(language, "room_cost")}
                  <span className="req">{st(language, "required")}</span>
                </label>
                <input
                  aria-invalid={checked && wrongCost}
                  autoComplete="off"
                  disabled={busy}
                  id="ss-room-cost"
                  inputMode="decimal"
                  maxLength={10}
                  onChange={(event) => {
                    setCost(event.currentTarget.value);
                  }}
                  value={cost}
                />
                {checked && wrongCost && (
                  <p className="ui-error">
                    <Icon name="alert" small />
                    <span>{st(language, "e_cost")}</span>
                  </p>
                )}
              </div>
            </div>
          )}
          <div className="ui-field">
            <label htmlFor="ss-room-note">{st(language, "room_note")}</label>
            <input
              autoComplete="off"
              disabled={busy}
              id="ss-room-note"
              maxLength={500}
              onChange={(event) => {
                setNote(event.currentTarget.value);
              }}
              value={note}
            />
          </div>
          <div className="ui-actions">
            <button className="ui-btn primary" disabled={busy} type="submit">
              <Icon name="check" small />
              {st(language, "room_b")}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

const DAMAGE_TONES = {
  WAITING: "warn",
  APPROVED: "err",
  REFUSED: "neutral",
} as const;

export function DamagesCard({
  language,
  booking,
  may,
  busy,
  onDecide,
}: StepsProps) {
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [missing, setMissing] = useState<string | null>(null);
  if (booking.damages.length === 0) return null;
  return (
    <section aria-labelledby="ss-dmg" className="ui-card">
      <h2 id="ss-dmg">{st(language, "dmg_t")}</h2>
      <ul className="ui-plain ss-found">
        {booking.damages.map((damage) => {
          const note = notes[damage.damage_id] ?? "";
          return (
            <li className="ss-damage" key={damage.damage_id}>
              <div>
                <b>{damage.description}</b> ·{" "}
                <span className="ui-num">
                  {usdFromCents(damage.amount_usd_cents)}
                </span>{" "}
                <Chip tone={DAMAGE_TONES[damage.status]}>
                  {st(language, `dmg_${damage.status}`)}
                </Chip>
                {damage.status === "APPROVED" && (
                  <span className="ui-sub2">
                    {damage.from_deposit_usd_cents > 0 &&
                      st(
                        language,
                        "dmg_from",
                        usdFromCents(damage.from_deposit_usd_cents),
                      )}
                    {damage.from_deposit_usd_cents > 0 &&
                      damage.invoice_number !== null &&
                      " · "}
                    {damage.invoice_id !== null &&
                      damage.invoice_number !== null && (
                        <a
                          href={hashForPage(
                            "invoices",
                            `inv:${damage.invoice_id}`,
                          )}
                        >
                          {st(language, "dmg_inv", damage.invoice_number)}
                        </a>
                      )}
                  </span>
                )}
                {damage.decision_note !== null && (
                  <span className="ui-sub2">{damage.decision_note}</span>
                )}
              </div>
              {damage.status === "WAITING" && may("short_stays.approve") && (
                <div className="ui-stack">
                  <label
                    className="ui-sr"
                    htmlFor={`ss-dmg-${damage.damage_id}`}
                  >
                    {st(language, "dmg_note")}
                  </label>
                  <input
                    autoComplete="off"
                    disabled={busy}
                    id={`ss-dmg-${damage.damage_id}`}
                    maxLength={500}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      setNotes((before) => ({
                        ...before,
                        [damage.damage_id]: value,
                      }));
                    }}
                    placeholder={st(language, "dmg_note")}
                    value={note}
                  />
                  {missing === damage.damage_id && (
                    <p className="ui-error">
                      <Icon name="alert" small />
                      <span>{st(language, "e_reason")}</span>
                    </p>
                  )}
                  <div className="ui-actions">
                    <button
                      className="ui-btn primary"
                      disabled={busy}
                      onClick={() => {
                        onDecide(damage.damage_id, true, note.trim());
                      }}
                      type="button"
                    >
                      {st(language, "dmg_ok")}
                    </button>
                    <button
                      className="ui-btn"
                      disabled={busy}
                      onClick={() => {
                        if (note.trim() === "") {
                          setMissing(damage.damage_id);
                          return;
                        }
                        setMissing(null);
                        onDecide(damage.damage_id, false, note.trim());
                      }}
                      type="button"
                    >
                      {st(language, "dmg_no")}
                    </button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
