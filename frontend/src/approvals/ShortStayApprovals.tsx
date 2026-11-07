// UI v81 (B4, design v81 Approvals): the Short-stay approvals tab. Display only: it lists the
// damage charges that wait for a decision, from the same booking list the Short stays page
// reads, and opens the booking, where the person with short_stays.approve decides as before.

import { useEffect, useState } from "react";

import { dayText, usdFromCents } from "../shell/format";
import { Icon } from "../shell/icons";
import { hashForPage } from "../shell/navigation";
import type { Booking, ShortStaysApi } from "../shortstays/shortStaysClient";
import type { Language } from "../signInText";
import { apt } from "./text";

export const SHORT_STAYS_APPROVE = "short_stays.approve";

export interface WaitingDamage {
  booking: Booking;
  damageId: string;
  description: string;
  amount: number;
}

/** The damage charges that wait for a decision, oldest booking first. */
export function waitingDamages(bookings: readonly Booking[]): WaitingDamage[] {
  return bookings
    .flatMap((booking) =>
      booking.damages
        .filter((damage) => damage.status === "WAITING")
        .map((damage) => ({
          booking,
          damageId: damage.damage_id,
          description: damage.description,
          amount: damage.amount_usd_cents,
        })),
    )
    .sort((a, b) => a.booking.check_in_on.localeCompare(b.booking.check_in_on));
}

/** Reads the waiting damage charges while `active`; null until read, "failed" when not read. */
export function useWaitingDamages(
  api: Pick<ShortStaysApi, "list"> | undefined,
  propertyId: string,
  active: boolean,
): WaitingDamage[] | "failed" | null {
  const [found, setFound] = useState<WaitingDamage[] | "failed" | null>(null);
  useEffect(() => {
    setFound(null);
  }, [propertyId]);
  useEffect(() => {
    if (api === undefined || !active || propertyId === "") return;
    let current = true;
    api.list(propertyId).then(
      (bookings) => {
        if (current) setFound(waitingDamages(bookings));
      },
      () => {
        if (current) setFound("failed");
      },
    );
    return () => {
      current = false;
    };
  }, [api, active, propertyId]);
  return found;
}

export function ShortStayApprovals({
  language,
  found,
}: {
  language: Language;
  found: WaitingDamage[] | "failed" | null;
}) {
  if (found === null)
    return (
      <p className="ui-muted" role="status">
        {apt(language, "ss_loading")}
      </p>
    );
  if (found === "failed")
    return (
      <div className="ui-notice warn" role="status">
        <Icon name="alert" />
        <p>{apt(language, "ss_failed")}</p>
      </div>
    );
  return (
    <>
      <p className="ui-small ui-muted">{apt(language, "ss_sub")}</p>
      {found.length === 0 ? (
        <p className="ui-muted">{apt(language, "ss_none")}</p>
      ) : (
        <div className="ui-tablewrap">
          <table className="ui-table">
            <thead>
              <tr>
                <th scope="col">{apt(language, "ss_booking")}</th>
                <th scope="col">{apt(language, "ss_unit")}</th>
                <th scope="col">{apt(language, "ss_guest")}</th>
                <th scope="col">{apt(language, "ss_what")}</th>
                <th className="r" scope="col">
                  {apt(language, "ss_amount")}
                </th>
              </tr>
            </thead>
            <tbody>
              {found.map((entry) => (
                <tr key={entry.damageId}>
                  <td>
                    <a
                      className="ui-no ui-num"
                      href={hashForPage(
                        "shortstays",
                        `st:${entry.booking.booking_id}`,
                      )}
                    >
                      {entry.booking.booking_number}
                    </a>
                    <span className="ui-sub2 ui-num">
                      {dayText(entry.booking.check_in_on)} –{" "}
                      {dayText(entry.booking.check_out_on)}
                    </span>
                  </td>
                  <td className="ui-num">{entry.booking.unit_number}</td>
                  <td>{entry.booking.guest_name}</td>
                  <td>{entry.description}</td>
                  <td className="r ui-num">{usdFromCents(entry.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
