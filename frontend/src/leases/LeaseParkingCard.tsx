// DL-253 (parking step 3b): the Parking card of a room Lease. Each parking Service of the Lease
// shows the space it holds, or Pick space. The owner's rule of 20 Nov 2026: the tenant pays the
// price of the space picked, kept from the day it is picked. The card is left out when the Lease
// has no parking Service.
//
// DL-254 (parking step 4b): on a Parking agreement (a Lease on the space itself) the card shows
// the space, its dates (or Month to month) and the vehicle that parks there, with Pick vehicle
// while the agreement is a draft.
//
// DL-255 (parking step 4c): on a signed Lease, Change vehicle moves a held space to another
// vehicle from a day, with a reason.
//
// DL-258 (parking step 5c): a Manager or the Owner records the notice that ends a month-to-month
// agreement (End agreement); the server moves its End Date to the last day. On or after the End
// Date, Close agreement ends the Lease on that day as signed (not early), so the Final Settlement
// gives the deposit back, less money owed.

import { type FormEvent, useCallback, useEffect, useState } from "react";

import type { LeaseApi, LeaseResource } from "../leaseClient";
import {
  type LeaseParking,
  type LeaseParkingApi,
  LeaseParkingError,
  type LeaseParkingTerm,
  type ToldBy,
  leaseParkingApi as defaultLeaseParkingApi,
} from "../leaseParkingClient";
import { pt } from "../parking/text";
import { DateInput, isDay } from "../shell/DateInput";
import { dayText, todayInPhnomPenh, usdFromCents } from "../shell/format";
import { Icon } from "../shell/icons";
import { hashForPage } from "../shell/navigation";
import { Chip, Dialog } from "../shell/ui";
import type { Language } from "../signInText";
import { useValuesIdentity } from "./LeaseDialogs";

// What the termination record keeps, in English like every stored record (as Record hand-back).
const CLOSE_SOURCE = {
  governing_event_reference: "BR-LEASE-023",
  reason: "Parking agreement ended on its End Date",
  context: {
    basis: "SIGNED_LEASE_OTHER" as const,
    signed_lease_provision:
      "Signed Lease: the Lease ends on its End Date (BR-LEASE-023)",
    approved_grounds:
      "The Parking agreement reached its End Date after notice (DL-258)",
    management_authorization_reference:
      "Approved in the app by the signed-in Owner or Manager (leases.terminate)",
    evidence_reference: "Closed in the app on or after the End Date",
    notice_required: false,
    notice_exception_reason:
      "No landlord notice: the Parking agreement ended on its End Date",
  },
};

function monthEnd(year: number, month: number): string {
  // Day 0 of the month after is the last day of this month (months count from 0).
  return new Date(Date.UTC(year, month + 1, 0)).toISOString().slice(0, 10);
}

/** DL-258: the last day by the owner's rules (Q15, Q16). The server also never cuts a billed
 * month, so the saved day can be later. */
export function endDay(toldBy: ToldBy, toldOn: string): string {
  const year = Number(toldOn.slice(0, 4));
  const month = Number(toldOn.slice(5, 7));
  const day = Number(toldOn.slice(8, 10));
  if (toldBy === "OWNER") {
    const date = new Date(Date.UTC(year, month - 1, day + 30));
    return date.toISOString().slice(0, 10);
  }
  return monthEnd(year, day < 25 ? month - 1 : month);
}

const KNOWN_TYPES = [
  "COVERED",
  "UNCOVERED",
  "MOTORBIKE",
  "TUK_TUK_FOOD_CART",
] as const;

function typeName(language: Language, code: string | null): string {
  const known = KNOWN_TYPES.find((item) => item === code);
  return known === undefined ? (code ?? "") : pt(language, `ptype_${known}`);
}

function serviceName(language: Language, term: LeaseParkingTerm): string {
  return language === "km" && term.service_name_km !== null
    ? term.service_name_km
    : term.service_name;
}

function PickDialog({
  api,
  language,
  leaseId,
  parking,
  term,
  onClose,
  onPicked,
  onStale,
}: {
  api: LeaseParkingApi;
  language: Language;
  leaseId: string;
  parking: LeaseParking;
  term: LeaseParkingTerm;
  onClose: () => void;
  onPicked: (spaceNumber: string) => void;
  onStale: (message: string) => void;
}) {
  const [space, setSpace] = useState(term.free_spaces[0]?.unit_id ?? "");
  const [vehicle, setVehicle] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || space === "") return;
    setBusy(true);
    setProblem(null);
    void api
      .pick(leaseId, {
        lease_service_term_id: term.lease_service_term_id,
        space_unit_id: space,
        vehicle_id: vehicle === "" ? null : vehicle,
      })
      .then((hold) => {
        onPicked(hold.space_number);
      })
      .catch((error: unknown) => {
        setBusy(false);
        const code = error instanceof LeaseParkingError ? error.code : "FAILED";
        if (code === "PARKING_ALREADY_HELD") {
          onStale(pt(language, "lp_r_PARKING_ALREADY_HELD"));
          return;
        }
        setProblem(pt(language, `lp_r_${code}`));
      });
  }

  return (
    <Dialog
      busy={busy}
      closeLabel={pt(language, "cancel")}
      onClose={onClose}
      onSubmit={term.free_spaces.length === 0 ? undefined : submit}
      submitLabel={pt(language, "save")}
      title={pt(language, "lp_pick_title", serviceName(language, term))}
    >
      {term.free_spaces.length === 0 ? (
        <p className="ui-muted">{pt(language, "lp_no_free")}</p>
      ) : (
        <>
          <div className="ui-field">
            <label htmlFor="lease-parking-space">
              {pt(language, "lp_space_field")}
              <span className="req">{pt(language, "required")}</span>
            </label>
            <select
              id="lease-parking-space"
              onChange={(event) => {
                setSpace(event.currentTarget.value);
              }}
              value={space}
            >
              {term.free_spaces.map((item) => (
                <option key={item.unit_id} value={item.unit_id}>
                  {pt(
                    language,
                    "lp_space_option",
                    item.unit_number,
                    typeName(language, item.parking_type),
                    usdFromCents(item.monthly_price_usd_cents),
                  )}
                </option>
              ))}
            </select>
          </div>
          <div className="ui-field">
            <label htmlFor="lease-parking-vehicle">
              {pt(language, "lp_vehicle_field")}
              <span className="req">{pt(language, "v_optional")}</span>
            </label>
            <select
              id="lease-parking-vehicle"
              onChange={(event) => {
                setVehicle(event.currentTarget.value);
              }}
              value={vehicle}
            >
              <option value="">{pt(language, "lp_no_vehicle")}</option>
              {parking.vehicles.map((item) => (
                <option key={item.vehicle_id} value={item.vehicle_id}>
                  {item.plate_text} · {pt(language, `v_${item.vehicle_type}`)}
                </option>
              ))}
            </select>
            <p className="help">{pt(language, "lp_vehicle_help")}</p>
          </div>
          <p className="ui-small ui-muted">{pt(language, "lp_fixed_note")}</p>
        </>
      )}
      {problem !== null && (
        <p className="ui-error" role="alert">
          <Icon name="alert" small />
          <span>{problem}</span>
        </p>
      )}
    </Dialog>
  );
}

function VehicleDialog({
  api,
  language,
  leaseId,
  parking,
  spaceNumber,
  onClose,
  onPicked,
}: {
  api: LeaseParkingApi;
  language: Language;
  leaseId: string;
  parking: LeaseParking;
  spaceNumber: string;
  onClose: () => void;
  onPicked: (plate: string) => void;
}) {
  const [vehicle, setVehicle] = useState(
    parking.agreement_hold?.vehicle_id ?? parking.vehicles[0]?.vehicle_id ?? "",
  );
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || vehicle === "") return;
    setBusy(true);
    setProblem(null);
    void api
      .pickVehicle(leaseId, vehicle)
      .then((hold) => {
        onPicked(hold.plate_text ?? "");
      })
      .catch((error: unknown) => {
        setBusy(false);
        const code = error instanceof LeaseParkingError ? error.code : "FAILED";
        setProblem(pt(language, `lp_r_${code}`));
      });
  }

  return (
    <Dialog
      busy={busy}
      closeLabel={pt(language, "cancel")}
      onClose={onClose}
      onSubmit={parking.vehicles.length === 0 ? undefined : submit}
      submitLabel={pt(language, "save")}
      title={pt(language, "pa_vehicle_title", spaceNumber)}
    >
      {parking.vehicles.length === 0 ? (
        <p className="ui-muted">{pt(language, "pa_no_vehicles")}</p>
      ) : (
        <div className="ui-field">
          <label htmlFor="agreement-vehicle">
            {pt(language, "lp_vehicle_field")}
            <span className="req">{pt(language, "required")}</span>
          </label>
          <select
            id="agreement-vehicle"
            onChange={(event) => {
              setVehicle(event.currentTarget.value);
            }}
            value={vehicle}
          >
            {parking.vehicles.map((item) => (
              <option key={item.vehicle_id} value={item.vehicle_id}>
                {item.plate_text} · {pt(language, `v_${item.vehicle_type}`)}
              </option>
            ))}
          </select>
          <p className="help">{pt(language, "pa_vehicle_help")}</p>
        </div>
      )}
      {problem !== null && (
        <p className="ui-error" role="alert">
          <Icon name="alert" small />
          <span>{problem}</span>
        </p>
      )}
    </Dialog>
  );
}

function ChangeVehicleDialog({
  api,
  language,
  leaseId,
  holdId,
  currentVehicleId,
  parking,
  spaceNumber,
  onClose,
  onChanged,
}: {
  api: LeaseParkingApi;
  language: Language;
  leaseId: string;
  holdId: string;
  currentVehicleId: string | null;
  parking: LeaseParking;
  spaceNumber: string;
  onClose: () => void;
  onChanged: (plate: string) => void;
}) {
  const others = parking.vehicles.filter(
    (item) => item.vehicle_id !== currentVehicleId,
  );
  const [vehicle, setVehicle] = useState(others[0]?.vehicle_id ?? "");
  const [day, setDay] = useState(todayInPhnomPenh());
  const [reason, setReason] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || vehicle === "") return;
    if (!isDay(day)) {
      setProblem(pt(language, "lp_r_CHANGE_DATE"));
      return;
    }
    if (reason.trim() === "") {
      setProblem(pt(language, "lp_r_CHANGE_REASON"));
      return;
    }
    setBusy(true);
    setProblem(null);
    void api
      .changeVehicle(leaseId, holdId, {
        vehicle_id: vehicle,
        change_date: day,
        reason: reason.trim(),
      })
      .then((hold) => {
        onChanged(hold.plate_text ?? "");
      })
      .catch((error: unknown) => {
        setBusy(false);
        const code = error instanceof LeaseParkingError ? error.code : "FAILED";
        setProblem(pt(language, `lp_r_${code}`));
      });
  }

  return (
    <Dialog
      busy={busy}
      closeLabel={pt(language, "cancel")}
      onClose={onClose}
      onSubmit={others.length === 0 ? undefined : submit}
      submitLabel={pt(language, "save")}
      title={pt(language, "pc_title", spaceNumber)}
    >
      {others.length === 0 ? (
        <p className="ui-muted">{pt(language, "pc_no_other")}</p>
      ) : (
        <>
          <div className="ui-field">
            <label htmlFor="change-vehicle">
              {pt(language, "pc_new_vehicle")}
              <span className="req">{pt(language, "required")}</span>
            </label>
            <select
              id="change-vehicle"
              onChange={(event) => {
                setVehicle(event.currentTarget.value);
              }}
              value={vehicle}
            >
              {others.map((item) => (
                <option key={item.vehicle_id} value={item.vehicle_id}>
                  {item.plate_text} · {pt(language, `v_${item.vehicle_type}`)}
                </option>
              ))}
            </select>
          </div>
          <div className="ui-field">
            <label htmlFor="change-vehicle-day">
              {pt(language, "pc_day")}
              <span className="req">{pt(language, "required")}</span>
            </label>
            <DateInput
              id="change-vehicle-day"
              language={language}
              onChange={setDay}
              value={day}
            />
          </div>
          <div className="ui-field">
            <label htmlFor="change-vehicle-reason">
              {pt(language, "pc_reason")}
              <span className="req">{pt(language, "required")}</span>
            </label>
            <input
              id="change-vehicle-reason"
              maxLength={500}
              onChange={(event) => {
                setReason(event.currentTarget.value);
              }}
              value={reason}
            />
          </div>
        </>
      )}
      {problem !== null && (
        <p className="ui-error" role="alert">
          <Icon name="alert" small />
          <span>{problem}</span>
        </p>
      )}
    </Dialog>
  );
}

function EndAgreementDialog({
  api,
  language,
  leaseId,
  spaceNumber,
  onClose,
  onEnded,
}: {
  api: LeaseParkingApi;
  language: Language;
  leaseId: string;
  spaceNumber: string;
  onClose: () => void;
  onEnded: (endsOn: string) => void;
}) {
  const [toldBy, setToldBy] = useState<ToldBy>("CUSTOMER");
  const [day, setDay] = useState(todayInPhnomPenh());
  const [note, setNote] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const today = todayInPhnomPenh();
  const valid = isDay(day) && day <= today;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (!valid) {
      setProblem(pt(language, "lp_r_TOLD_DATE"));
      return;
    }
    setBusy(true);
    setProblem(null);
    void api
      .endAgreement(leaseId, {
        told_by: toldBy,
        told_on: day,
        note: note.trim() === "" ? null : note.trim(),
      })
      .then((saved) => {
        onEnded(saved.ending?.ends_on ?? endDay(toldBy, day));
      })
      .catch((error: unknown) => {
        setBusy(false);
        const code = error instanceof LeaseParkingError ? error.code : "FAILED";
        setProblem(pt(language, `lp_r_${code}`));
      });
  }

  return (
    <Dialog
      busy={busy}
      closeLabel={pt(language, "cancel")}
      onClose={onClose}
      onSubmit={submit}
      submitLabel={pt(language, "pe_end")}
      title={pt(language, "pe_title", spaceNumber)}
    >
      <fieldset className="ui-field">
        <legend>{pt(language, "pe_who")}</legend>
        {(["CUSTOMER", "OWNER"] as const).map((who) => (
          <label key={who}>
            <input
              checked={toldBy === who}
              name="ending-told-by"
              onChange={() => {
                setToldBy(who);
              }}
              type="radio"
              value={who}
            />{" "}
            {pt(language, who === "CUSTOMER" ? "pe_customer" : "pe_owner")}
          </label>
        ))}
      </fieldset>
      <div className="ui-field">
        <label htmlFor="ending-day">
          {pt(
            language,
            toldBy === "CUSTOMER" ? "pe_day_customer" : "pe_day_owner",
          )}
          <span className="req">{pt(language, "required")}</span>
        </label>
        <DateInput
          id="ending-day"
          language={language}
          onChange={setDay}
          value={day}
        />
        <p className="help">
          {pt(
            language,
            toldBy === "CUSTOMER" ? "pe_rule_customer" : "pe_rule_owner",
          )}
        </p>
      </div>
      <div className="ui-field">
        <label htmlFor="ending-note">
          {pt(language, "pe_note")}
          <span className="req">{pt(language, "v_optional")}</span>
        </label>
        <input
          id="ending-note"
          maxLength={500}
          onChange={(event) => {
            setNote(event.currentTarget.value);
          }}
          value={note}
        />
      </div>
      {valid && (
        <p className="ui-num">
          <b>{pt(language, "pe_last", dayText(endDay(toldBy, day)))}</b>
        </p>
      )}
      <p className="ui-small ui-muted">{pt(language, "pe_rule_money")}</p>
      {problem !== null && (
        <p className="ui-error" role="alert">
          <Icon name="alert" small />
          <span>{problem}</span>
        </p>
      )}
    </Dialog>
  );
}

function CloseAgreementDialog({
  language,
  lease,
  leaseApi,
  spaceNumber,
  onClose,
  onClosed,
}: {
  language: Language;
  lease: LeaseResource;
  leaseApi: Pick<LeaseApi, "terminate">;
  spaceNumber: string;
  onClose: () => void;
  onClosed: (saved: LeaseResource) => void;
}) {
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const identity = useValuesIdentity();
  const last = lease.end_date ?? todayInPhnomPenh();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const source = { actual_termination_date: last, ...CLOSE_SOURCE };
    // Kept while the values stay the same, so Try again sends the very same request.
    const chosen = identity(JSON.stringify([lease.version, source]));
    setBusy(true);
    setProblem(null);
    leaseApi
      .terminate(lease, { event_id: chosen.id, ...source }, chosen.key)
      .then(
        (saved) => {
          onClosed(saved);
        },
        () => {
          setBusy(false);
          setProblem(pt(language, "pe_close_failed"));
        },
      );
  }

  return (
    <Dialog
      busy={busy}
      closeLabel={pt(language, "cancel")}
      onClose={onClose}
      onSubmit={submit}
      submitLabel={pt(language, "pe_close")}
      title={pt(language, "pe_close_title", spaceNumber)}
    >
      <p>{pt(language, "pe_close_text", dayText(last))}</p>
      {problem !== null && (
        <p className="ui-error" role="alert">
          <Icon name="alert" small />
          <span>{problem}</span>
        </p>
      )}
    </Dialog>
  );
}

function AgreementCard({
  api,
  language,
  leaseId,
  parking,
  reload,
  lease,
  leaseApi,
  onLeaseChanged,
}: {
  api: LeaseParkingApi;
  language: Language;
  leaseId: string;
  parking: LeaseParking;
  reload: () => void;
  lease?: LeaseResource;
  leaseApi?: Pick<LeaseApi, "terminate">;
  /** The Lease changed here (its End Date or status): the page reads it again. */
  onLeaseChanged?: () => void;
}) {
  const [picking, setPicking] = useState(false);
  const [changing, setChanging] = useState(false);
  const [ending, setEnding] = useState(false);
  const [closing, setClosing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const space = parking.space;
  const hold = parking.agreement_hold;
  const spaceNumber = space?.unit_number ?? "";
  const open = parking.can_pick && parking.lease_status === "DRAFTED";
  const changeable =
    parking.can_pick && parking.lease_status === "SIGNED" && hold !== null;
  const plate = (hold?.vehicle_id ?? null) === null ? null : hold?.plate_text;
  const today = todayInPhnomPenh();
  const signed = parking.lease_status === "SIGNED";
  const mayEnd = parking.can_end && signed && parking.month_to_month;
  // On or after its End Date a signed agreement is closed on that day.
  const mayClose =
    parking.can_end &&
    signed &&
    !parking.month_to_month &&
    lease !== undefined &&
    leaseApi !== undefined &&
    lease.status === "SIGNED" &&
    lease.end_date !== null &&
    lease.end_date <= today;
  const terminated = parking.lease_status === "TERMINATED";

  return (
    <section aria-labelledby="lease-parking" className="ui-card">
      <h2 id="lease-parking">{pt(language, "pa_title")}</h2>
      {notice !== null && (
        <div className="ui-notice ok" role="status">
          <Icon name="check" />
          <p>{notice}</p>
        </div>
      )}
      <ul className="ui-apps" aria-label={pt(language, "pa_title")}>
        <li>
          <span>
            <b>
              {pt(
                language,
                "pa_space",
                spaceNumber,
                typeName(language, space?.parking_type ?? null),
              )}
            </b>
            {hold !== null && (
              <small className="ui-num">
                {parking.month_to_month || hold.held_until === null
                  ? pt(language, "pa_month_to_month", dayText(hold.held_from))
                  : pt(
                      language,
                      "lp_period",
                      dayText(hold.held_from),
                      dayText(hold.held_until),
                    )}
              </small>
            )}
            <small>{plate ?? pt(language, "pa_vehicle_none")}</small>
            {parking.ending !== null && (
              <small className="ui-num">
                {pt(
                  language,
                  "pe_ends",
                  dayText(parking.ending.ends_on),
                  dayText(parking.ending.told_on),
                )}
              </small>
            )}
          </span>
          {open ? (
            <button
              className="ui-btn"
              onClick={() => {
                setNotice(null);
                setPicking(true);
              }}
              type="button"
            >
              <Icon name="car" />
              {pt(
                language,
                plate === null ? "pa_vehicle_pick" : "pa_vehicle_change",
              )}
            </button>
          ) : changeable ? (
            <button
              className="ui-btn"
              onClick={() => {
                setNotice(null);
                setChanging(true);
              }}
              type="button"
            >
              <Icon name="car" />
              {pt(language, "pa_vehicle_change")}
            </button>
          ) : plate !== null ? (
            <Chip icon="car" tone="ok">
              {plate}
            </Chip>
          ) : (
            <Chip tone="warn">{pt(language, "pa_vehicle_pick")}</Chip>
          )}
        </li>
      </ul>
      {(mayEnd || mayClose || terminated) && (
        <div className="ui-actions">
          {mayEnd && (
            <button
              className="ui-btn"
              onClick={() => {
                setNotice(null);
                setEnding(true);
              }}
              type="button"
            >
              <Icon name="x" />
              {pt(language, "pe_end")}
            </button>
          )}
          {mayClose && (
            <button
              className="ui-btn primary"
              onClick={() => {
                setNotice(null);
                setClosing(true);
              }}
              type="button"
            >
              <Icon name="check" />
              {pt(language, "pe_close")}
            </button>
          )}
          {terminated && (
            <a className="ui-btn" href={hashForPage("moveout", leaseId)}>
              <Icon name="moveout" />
              {pt(language, "pe_settlement")}
            </a>
          )}
        </div>
      )}
      {ending && (
        <EndAgreementDialog
          api={api}
          language={language}
          leaseId={leaseId}
          onClose={() => {
            setEnding(false);
          }}
          onEnded={(endsOn) => {
            setEnding(false);
            setNotice(pt(language, "pe_saved", dayText(endsOn)));
            reload();
            onLeaseChanged?.();
          }}
          spaceNumber={spaceNumber}
        />
      )}
      {closing && lease !== undefined && leaseApi !== undefined && (
        <CloseAgreementDialog
          language={language}
          lease={lease}
          leaseApi={leaseApi}
          onClose={() => {
            setClosing(false);
          }}
          onClosed={(saved) => {
            setClosing(false);
            setNotice(
              pt(
                language,
                "pe_closed",
                dayText(saved.actual_termination_date ?? lease.end_date),
              ),
            );
            reload();
            onLeaseChanged?.();
          }}
          spaceNumber={spaceNumber}
        />
      )}
      {picking && (
        <VehicleDialog
          api={api}
          language={language}
          leaseId={leaseId}
          onClose={() => {
            setPicking(false);
          }}
          onPicked={(picked) => {
            setPicking(false);
            setNotice(pt(language, "pa_vehicle_saved", picked));
            reload();
          }}
          parking={parking}
          spaceNumber={spaceNumber}
        />
      )}
      {changing && hold !== null && (
        <ChangeVehicleDialog
          api={api}
          currentVehicleId={hold.vehicle_id}
          holdId={hold.hold_id}
          language={language}
          leaseId={leaseId}
          onChanged={(changed) => {
            setChanging(false);
            setNotice(pt(language, "pc_saved", changed));
            reload();
          }}
          onClose={() => {
            setChanging(false);
          }}
          parking={parking}
          spaceNumber={spaceNumber}
        />
      )}
    </section>
  );
}

export function LeaseParkingCard({
  leaseId,
  language,
  api = defaultLeaseParkingApi,
  lease,
  leaseApi,
  onLeaseChanged,
}: {
  leaseId: string;
  language: Language;
  api?: LeaseParkingApi;
  /** DL-258: the Lease, to close a Parking agreement on its End Date. */
  lease?: LeaseResource;
  leaseApi?: Pick<LeaseApi, "terminate">;
  /** The Lease changed here (its End Date or status): the page reads it again. */
  onLeaseChanged?: () => void;
}) {
  const [parking, setParking] = useState<LeaseParking | null | undefined>(
    undefined,
  );
  const [picking, setPicking] = useState<LeaseParkingTerm | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  const load = useCallback(() => {
    let current = true;
    api.read(leaseId).then(
      (found) => {
        if (current) setParking(found);
      },
      () => {
        if (current) setParking(null);
      },
    );
    return () => {
      current = false;
    };
  }, [api, leaseId]);

  useEffect(() => load(), [load]);

  // Most Leases have no parking Service: nothing to show while it loads or when there is none.
  if (parking === undefined) return null;
  if (parking?.on_parking_space === true) {
    return (
      <AgreementCard
        api={api}
        language={language}
        lease={lease}
        leaseApi={leaseApi}
        leaseId={leaseId}
        onLeaseChanged={onLeaseChanged}
        parking={parking}
        reload={load}
      />
    );
  }
  if (parking !== null && parking.terms.length === 0) return null;
  const open =
    parking !== null &&
    parking.can_pick &&
    (parking.lease_status === "DRAFTED" || parking.lease_status === "SIGNED");

  return (
    <section aria-labelledby="lease-parking" className="ui-card">
      <h2 id="lease-parking">{pt(language, "lp_title")}</h2>
      {notice !== null && (
        <div className="ui-notice ok" role="status">
          <Icon name="check" />
          <p>{notice}</p>
        </div>
      )}
      {warning !== null && (
        <div className="ui-notice warn" role="alert">
          <Icon name="alert" />
          <p>{warning}</p>
        </div>
      )}
      {parking === null ? (
        <p className="ui-small ui-muted">{pt(language, "lp_failed")}</p>
      ) : (
        <ul className="ui-apps" aria-label={pt(language, "lp_title")}>
          {parking.terms.map((term) => (
            <li key={term.lease_service_term_id}>
              <span>
                <b>{serviceName(language, term)}</b>
                <small className="ui-num">
                  {term.held_until === null
                    ? pt(language, "lp_period_open", dayText(term.held_from))
                    : pt(
                        language,
                        "lp_period",
                        dayText(term.held_from),
                        dayText(term.held_until),
                      )}
                </small>
                {term.hold === null ? (
                  <small>{pt(language, "lp_none")}</small>
                ) : (
                  <small>
                    {[
                      typeName(language, term.hold.parking_type),
                      term.hold.plate_text ?? pt(language, "lp_no_vehicle"),
                      term.hold.monthly_price_usd_cents === null
                        ? null
                        : pt(
                            language,
                            "lp_price",
                            usdFromCents(term.hold.monthly_price_usd_cents),
                          ),
                    ]
                      .filter((part): part is string => part !== null)
                      .join(" · ")}
                  </small>
                )}
              </span>
              {term.hold !== null ? (
                <Chip icon="car" tone="ok">
                  {pt(language, "lp_space", term.hold.space_number)}
                </Chip>
              ) : open ? (
                <button
                  className="ui-btn"
                  onClick={() => {
                    setNotice(null);
                    setWarning(null);
                    setPicking(term);
                  }}
                  type="button"
                >
                  <Icon name="car" />
                  {pt(language, "lp_pick")}
                </button>
              ) : (
                <Chip tone="warn">{pt(language, "lp_pick")}</Chip>
              )}
            </li>
          ))}
        </ul>
      )}
      {picking !== null && parking !== null && (
        <PickDialog
          api={api}
          language={language}
          leaseId={leaseId}
          onClose={() => {
            setPicking(null);
          }}
          onPicked={(spaceNumber) => {
            setPicking(null);
            setNotice(pt(language, "lp_saved", spaceNumber));
            load();
          }}
          onStale={(message) => {
            setPicking(null);
            setWarning(message);
            load();
          }}
          parking={parking}
          term={picking}
        />
      )}
    </section>
  );
}
