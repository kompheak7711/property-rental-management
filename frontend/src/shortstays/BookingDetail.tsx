// Daily and weekly rent, phase 6 step 2: one booking (Tenants › Short stays › ST…). It shows the
// stay, the guest, the price lines kept at booking time and the history. Payment, check-in and
// check-out come in step 3.

import { useCallback, useEffect, useRef, useState } from "react";

import { dayText, momentText, usdFromCents } from "../shell/format";
import { Icon } from "../shell/icons";
import { hashForPage } from "../shell/navigation";
import { openPageInAddress } from "../shell/useHashPage";
import type { Language } from "../signInText";
import { PriceLines } from "./NewBooking";
import { BookingChip, nightsText, unitTypeText } from "./ShortStaysPage";
import {
  type Booking,
  type ShortStaysApi,
  ShortStaysError,
} from "./shortStaysClient";
import { hasText, st } from "./text";

export function BookingDetail({
  language,
  propertyId,
  bookingId,
  api,
  may,
  flash,
  onFlashShown,
}: {
  language: Language;
  propertyId: string;
  bookingId: string;
  api: ShortStaysApi;
  may: (capability: string) => boolean;
  /** "Booking ST… made." after New booking, shown once. */
  flash: string | null;
  onFlashShown: () => void;
}) {
  const [booking, setBooking] = useState<Booking | null>(null);
  const [problem, setProblem] = useState<"missing" | "failed" | null>(null);
  const [notice] = useState<string | null>(flash);
  const sequence = useRef(0);

  useEffect(() => {
    if (flash !== null) onFlashShown();
  }, [flash, onFlashShown]);

  const load = useCallback(() => {
    const operation = ++sequence.current;
    setProblem(null);
    void api
      .get(propertyId, bookingId)
      .then((found) => {
        if (operation === sequence.current) setBooking(found);
      })
      .catch((error: unknown) => {
        if (operation !== sequence.current) return;
        setProblem(
          error instanceof ShortStaysError && error.status === 404
            ? "missing"
            : "failed",
        );
      });
  }, [api, propertyId, bookingId]);

  useEffect(() => {
    load();
  }, [load]);

  const back = (
    <button
      className="ui-crumb"
      onClick={() => {
        openPageInAddress("shortstays");
      }}
      type="button"
    >
      <Icon name="back" small />
      {st(language, "back")}
    </button>
  );

  if (booking === null)
    return (
      <>
        {back}
        {problem === null ? (
          <p className="ui-muted" role="status">
            {st(language, "loading")}
          </p>
        ) : (
          <div className="ui-notice warn" role="status">
            <Icon name="alert" />
            <p>
              {st(language, problem === "missing" ? "not_found" : "failed")}
            </p>
            {problem === "failed" && (
              <button className="ui-btn" onClick={load} type="button">
                {st(language, "retry")}
              </button>
            )}
          </div>
        )}
      </>
    );

  const source =
    booking.source === "BOOKING_SITE" && booking.site_name !== null
      ? booking.site_name
      : st(language, `src_${booking.source}`);

  return (
    <>
      {back}
      <div className="ui-head">
        <div>
          <div className="ui-hrow">
            <h2 className="ui-num">{booking.booking_number}</h2>
            <BookingChip language={language} status={booking.status} />
          </div>
          <p>
            {booking.guest_name} · {booking.unit_number} ·{" "}
            {nightsText(language, booking.nights)}
          </p>
        </div>
      </div>
      {notice !== null && (
        <div className="ui-notice ok" role="status">
          <Icon name="check" />
          <p>{notice}</p>
        </div>
      )}
      <div className="ui-split">
        <div className="ui-stack">
          <section aria-labelledby="ss-stay" className="ui-card">
            <h2 id="ss-stay">{st(language, "d_stay")}</h2>
            <dl className="ui-kv">
              <dt>{st(language, "d_unit")}</dt>
              <dd>
                <span className="ui-num">{booking.unit_number}</span> ·{" "}
                {unitTypeText(language, booking.unit_type)}
              </dd>
              <dt>{st(language, "d_stay")}</dt>
              <dd className="ui-num">
                {st(
                  language,
                  "d_dates",
                  dayText(booking.check_in_on),
                  dayText(booking.check_out_on),
                )}
              </dd>
              <dt>{st(language, "d_nights")}</dt>
              <dd>{nightsText(language, booking.nights)}</dd>
              <dt>{st(language, "d_guests")}</dt>
              <dd className="ui-num">{booking.guest_count}</dd>
              <dt>{st(language, "d_source")}</dt>
              <dd>
                {source}
                {booking.site_reference !== null && (
                  <span className="ui-sub2 ui-num">
                    {booking.site_reference}
                  </span>
                )}
              </dd>
              {booking.note !== null && (
                <>
                  <dt>{st(language, "d_note")}</dt>
                  <dd className="note">{booking.note}</dd>
                </>
              )}
            </dl>
          </section>
          <section aria-labelledby="ss-price" className="ui-card">
            <h2 id="ss-price">{st(language, "d_price")}</h2>
            <PriceLines language={language} lines={booking.lines} />
            <p className="ss-total">
              <span>{st(language, "total")}</span>
              <b className="ui-num">{usdFromCents(booking.total_usd_cents)}</b>
            </p>
          </section>
        </div>
        <div className="ui-stack">
          <section aria-labelledby="ss-guest" className="ui-card">
            <h2 id="ss-guest">{st(language, "d_guest")}</h2>
            <p>
              <b>{booking.guest_name}</b>
              {booking.guest_phone !== null && (
                <span className="ui-sub2 ui-num">{booking.guest_phone}</span>
              )}
            </p>
            {may("customers.read") && (
              <div className="ui-actions">
                <a
                  className="ui-btn"
                  href={hashForPage("customers", booking.customer_id)}
                >
                  {st(language, "d_open_customer")}
                </a>
              </div>
            )}
          </section>
          <section aria-labelledby="ss-hist" className="ui-card">
            <h2 id="ss-hist">{st(language, "d_hist")}</h2>
            <ol className="ui-timeline">
              {booking.history.map((event, index) => {
                const key = `ev_${event.kind}`;
                return (
                  <li key={index}>
                    <div>
                      {hasText(key) ? st(language, key) : event.kind}
                      {event.note !== null && (
                        <span className="ui-sub2">{event.note}</span>
                      )}
                      <small className="ui-num">
                        {momentText(event.occurred_at)}
                      </small>
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>
        </div>
      </div>
    </>
  );
}
