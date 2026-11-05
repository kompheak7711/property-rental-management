// Telegram bots step 2c (DL-128, mock-up round 29): Office › Telegram with the tabs Linked
// tenants ("#/tglinks") and Telegram health ("#/tghealth"). Reading needs telegram.read;
// Remove link and Retry show only to a person with telegram.operate. Step 2d part 2 (DL-170):
// the tabs Contact office ("#/tgcontact", telegram.contact) and FAQ ("#/tgfaq", read with
// telegram.contact, changed with telegram.faq; only the Owner approves). The server checks every
// right again. No bot key is ever shown.

import "../shell/screens.css";

import {
  type FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { momentText } from "../shell/format";
import { Icon } from "../shell/icons";
import { Chip, Dialog } from "../shell/ui";
import type { Language } from "../signInText";
import {
  type ContactMessage,
  type ContactPage,
  FAQ_BOTS,
  type FaqBots,
  type FaqPage,
  type FaqQuestion,
  type FaqWords,
  type HealthPage,
  type LinkedTenant,
  type LinksPage,
  type TelegramApi,
  TelegramError,
  telegramApi as defaultTelegramApi,
} from "./telegramClient";
import { hasText, tt } from "./text";

export interface TelegramPageProps {
  language: Language;
  propertyId: string;
  /** Only the page that is shown loads; a hidden page waits until it is opened. */
  active: boolean;
  capabilities: ReadonlySet<string> | null;
  api?: TelegramApi;
}

const OPERATE = "telegram.operate";
const CONTACT = "telegram.contact";
const FAQ = "telegram.faq";

function holds(
  capabilities: ReadonlySet<string> | null,
  capability: string,
): boolean {
  return capabilities === null || capabilities.has(capability);
}

function mayOperate(capabilities: ReadonlySet<string> | null): boolean {
  return capabilities === null || capabilities.has(OPERATE);
}

/** Reads one page each time it is opened; another Property never shows the one before. */
function usePage<T>(
  propertyId: string,
  active: boolean,
  read: (propertyId: string) => Promise<T>,
): {
  data: T | null;
  failed: boolean;
  load: () => void;
  set: (value: T) => void;
} {
  const [data, setData] = useState<T | null>(null);
  const [failed, setFailed] = useState(false);
  const sequence = useRef(0);
  const load = useCallback(() => {
    if (propertyId === "") return;
    const operation = ++sequence.current;
    setFailed(false);
    void read(propertyId)
      .then((found) => {
        if (operation === sequence.current) setData(found);
      })
      .catch(() => {
        if (operation === sequence.current) setFailed(true);
      });
  }, [propertyId, read]);
  useEffect(() => {
    sequence.current++;
    setData(null);
  }, [propertyId]);
  useEffect(() => {
    if (active) load();
  }, [active, load]);
  const set = useCallback((value: T) => {
    sequence.current++;
    setData(value);
  }, []);
  return { data, failed, load, set };
}

function Waiting({
  language,
  failed,
  onRetry,
}: {
  language: Language;
  failed: boolean;
  onRetry: () => void;
}) {
  if (!failed)
    return (
      <p className="ui-muted" role="status">
        {tt(language, "loading")}
      </p>
    );
  return (
    <div className="ui-notice warn" role="status">
      <Icon name="alert" />
      <p>{tt(language, "failed")}</p>
      <button className="ui-btn" onClick={onRetry} type="button">
        {tt(language, "retry_read")}
      </button>
    </div>
  );
}

function NoProperty({ language }: { language: Language }) {
  return (
    <div className="ui-notice warn" role="status">
      <Icon name="alert" />
      <p>{tt(language, "no_property")}</p>
    </div>
  );
}

function Done({ text }: { text: string | null }) {
  if (text === null) return null;
  return (
    <div className="ui-notice ok" role="status">
      <Icon name="check" />
      <p>{text}</p>
    </div>
  );
}

function errorText(language: Language, code: string | null): string {
  if (code === null) return "";
  const key = `err_${code}`;
  return hasText(key) ? tt(language, key) : code;
}

function when(value: string | null, language: Language): string {
  return value === null ? tt(language, "never") : momentText(value);
}

function person(name: string | null, fallback: string): string {
  return name === null || name === "" ? fallback : name;
}

// ---------------------------------------------------------------- Linked tenants

export function LinkedTenantsPage({
  language,
  propertyId,
  active,
  capabilities,
  api = defaultTelegramApi,
}: TelegramPageProps) {
  const page = usePage<LinksPage>(propertyId, active, api.links);
  const [removing, setRemoving] = useState<LinkedTenant | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const operate = mayOperate(capabilities);

  if (propertyId === "") return <NoProperty language={language} />;

  const head = (
    <div className="ui-head">
      <p>{tt(language, "links_sub")}</p>
    </div>
  );
  if (page.data === null)
    return (
      <>
        {head}
        <Waiting failed={page.failed} language={language} onRetry={page.load} />
      </>
    );
  const { linked, tries, ended, rules } = page.data;
  const block = tt(language, "hours", rules.block_hours);

  return (
    <>
      {head}
      <Done text={done} />
      {stale && (
        <div className="ui-notice warn" role="status">
          <Icon name="alert" />
          <p>{tt(language, "e_rm_409")}</p>
        </div>
      )}
      {tries.length > 0 && (
        <div className="ui-notice warn" role="status">
          <Icon name="alert" />
          <p>{tt(language, "tries_t", tries.length)}</p>
        </div>
      )}
      <section aria-labelledby="tg-linked" className="ui-card pad0">
        <div className="ui-listbar">
          <h2 id="tg-linked">{tt(language, "linked_now")}</h2>
        </div>
        {linked.length === 0 ? (
          <p className="ui-empty">{tt(language, "none_linked")}</p>
        ) : (
          <div className="ui-tablewrap">
            <table className="ui-table">
              <thead>
                <tr>
                  <th scope="col">{tt(language, "c_acc")}</th>
                  <th scope="col">{tt(language, "c_cust")}</th>
                  <th scope="col">{tt(language, "c_unit")}</th>
                  <th className="ui-wide" scope="col">
                    {tt(language, "c_lease_end")}
                  </th>
                  <th className="ui-wide" scope="col">
                    {tt(language, "c_on")}
                  </th>
                  <th className="ui-wide" scope="col">
                    {tt(language, "c_how")}
                  </th>
                  {operate && (
                    <th scope="col">
                      <span className="ui-sr">{tt(language, "remove")}</span>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {linked.map((link) => (
                  <tr key={link.id}>
                    <td className="ui-num">
                      {link.phone ?? ""}
                      <span className="ui-sub2">
                        {String(link.telegram_user_id)}
                      </span>
                    </td>
                    <td>{person(link.name, "")}</td>
                    <td>{link.unit_number ?? ""}</td>
                    <td className="ui-wide ui-num">
                      {link.lease_end_date === null
                        ? ""
                        : link.lease_end_date.split("-").reverse().join("/")}
                    </td>
                    <td className="ui-wide ui-num">
                      {momentText(link.linked_at)}
                    </td>
                    <td className="ui-wide">{tt(language, "how")}</td>
                    {operate && (
                      <td>
                        <button
                          className="ui-btn"
                          onClick={() => {
                            setDone(null);
                            setStale(false);
                            setRemoving(link);
                          }}
                          type="button"
                        >
                          {tt(language, "remove")}
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="ui-tfoot">{tt(language, "links_n")}</p>
      </section>
      <section aria-labelledby="tg-tries" className="ui-card pad0">
        <div className="ui-listbar">
          <h2 id="tg-tries">{tt(language, "tries_h")}</h2>
        </div>
        {tries.length === 0 ? (
          <p className="ui-empty">{tt(language, "none_tries")}</p>
        ) : (
          <div className="ui-tablewrap">
            <table className="ui-table">
              <thead>
                <tr>
                  <th scope="col">{tt(language, "c_phone")}</th>
                  <th scope="col">{tt(language, "c_name")}</th>
                  <th scope="col">{tt(language, "c_unit_t")}</th>
                  <th scope="col">{tt(language, "c_tries")}</th>
                  <th className="ui-wide" scope="col">
                    {tt(language, "c_last")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {tries.map((row) => (
                  <tr key={row.telegram_user_id}>
                    <td className="ui-num">
                      {row.phone ?? ""}
                      <span className="ui-sub2">
                        {String(row.telegram_user_id)}
                      </span>
                    </td>
                    <td>{row.typed_name ?? ""}</td>
                    <td>{row.typed_unit ?? ""}</td>
                    <td>
                      <span className="ui-num">{row.tries}</span>{" "}
                      {row.blocked_until === null ? (
                        <Chip tone="warn">
                          {tt(language, "left", row.tries_left)}
                        </Chip>
                      ) : (
                        <Chip tone="err">
                          {tt(
                            language,
                            "blocked",
                            momentText(row.blocked_until),
                          )}
                        </Chip>
                      )}
                    </td>
                    <td className="ui-wide ui-num">
                      {momentText(row.last_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="ui-tfoot">
          {tt(language, "tries_n", rules.tries, block)}
        </p>
      </section>
      <section aria-labelledby="tg-ended" className="ui-card pad0">
        <div className="ui-listbar">
          <h2 id="tg-ended">{tt(language, "ended")}</h2>
          <span className="ui-muted">
            {tt(language, "ended_sub", rules.keep_days)}
          </span>
        </div>
        {ended.length === 0 ? (
          <p className="ui-empty">{tt(language, "none_ended")}</p>
        ) : (
          <div className="ui-tablewrap">
            <table className="ui-table">
              <thead>
                <tr>
                  <th scope="col">{tt(language, "c_cust")}</th>
                  <th scope="col">{tt(language, "c_unit")}</th>
                  <th className="ui-wide" scope="col">
                    {tt(language, "c_on")}
                  </th>
                  <th scope="col">{tt(language, "c_end")}</th>
                  <th scope="col">{tt(language, "c_why")}</th>
                </tr>
              </thead>
              <tbody>
                {ended.map((row) => {
                  const reason = `end_${row.reason}`;
                  return (
                    <tr key={`${row.id}:${row.ended_at}`}>
                      <td>
                        {person(row.name, "")}
                        <span className="ui-sub2 ui-num">
                          {String(row.telegram_user_id)}
                        </span>
                      </td>
                      <td>{row.unit_number ?? ""}</td>
                      <td className="ui-wide ui-num">
                        {momentText(row.linked_at)}
                      </td>
                      <td className="ui-num">{momentText(row.ended_at)}</td>
                      <td>
                        {hasText(reason) ? tt(language, reason) : row.reason}
                        {row.note !== null && (
                          <span className="ui-sub2">{row.note}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {removing !== null && (
        <RemoveLinkDialog
          api={api}
          language={language}
          link={removing}
          onClose={() => {
            setRemoving(null);
          }}
          onDone={(next) => {
            page.set(next);
            setDone(
              tt(
                language,
                "rm_done",
                person(removing.name, removing.phone ?? ""),
              ),
            );
            setRemoving(null);
          }}
          onStale={() => {
            setRemoving(null);
            setStale(true);
            page.load();
          }}
          propertyId={propertyId}
        />
      )}
    </>
  );
}

function RemoveLinkDialog({
  language,
  propertyId,
  link,
  api,
  onClose,
  onDone,
  onStale,
}: {
  language: Language;
  propertyId: string;
  link: LinkedTenant;
  api: TelegramApi;
  onClose: () => void;
  onDone: (next: LinksPage) => void;
  onStale: () => void;
}) {
  const [reason, setReason] = useState("");
  const [shown, setShown] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const missing = reason.trim() === "";

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setShown(true);
    if (missing || busy) return;
    setBusy(true);
    setFailure(null);
    api.removeLink(propertyId, link.id, reason.trim()).then(
      (next) => {
        setBusy(false);
        onDone(next);
      },
      (error: unknown) => {
        setBusy(false);
        const status = error instanceof TelegramError ? error.status : null;
        if (status === 404 || status === 409) {
          onStale();
          return;
        }
        setFailure(tt(language, status === 403 ? "e_403" : "e_save"));
      },
    );
  };

  return (
    <Dialog
      busy={busy}
      closeLabel={tt(language, "cancel")}
      onClose={onClose}
      onSubmit={submit}
      submitLabel={tt(language, "remove")}
      title={tt(language, "rm_t")}
    >
      <p>
        {tt(
          language,
          "rm_q",
          person(link.name, ""),
          link.unit_number ?? "",
          link.phone ?? String(link.telegram_user_id),
        )}
      </p>
      <div className="ui-field">
        <label htmlFor="tg-rm-reason">
          {tt(language, "rm_reason")}
          <span className="req">{"*"}</span>
        </label>
        <textarea
          aria-describedby={shown && missing ? "tg-rm-reason-err" : undefined}
          aria-invalid={shown && missing}
          disabled={busy}
          id="tg-rm-reason"
          maxLength={300}
          onChange={(event) => {
            setReason(event.currentTarget.value);
          }}
          placeholder={tt(language, "rm_ph")}
          rows={2}
          value={reason}
        />
        <p className="help">{tt(language, "rm_n")}</p>
        {shown && missing && (
          <p className="ui-error" id="tg-rm-reason-err">
            {tt(language, "e_reason")}
          </p>
        )}
      </div>
      {failure !== null && (
        <p className="ui-error" role="alert">
          {failure}
        </p>
      )}
    </Dialog>
  );
}

// ---------------------------------------------------------------- Telegram health

export function TelegramHealthPage({
  language,
  propertyId,
  active,
  capabilities,
  api = defaultTelegramApi,
}: TelegramPageProps) {
  const page = usePage<HealthPage>(propertyId, active, api.health);
  const [done, setDone] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const operate = mayOperate(capabilities);

  if (propertyId === "") return <NoProperty language={language} />;

  const head = (
    <div className="ui-head">
      <p>{tt(language, "h_sub")}</p>
      <span className="ui-muted">
        <Icon name="lock" small /> {tt(language, "h_lock")}
      </span>
    </div>
  );
  if (page.data === null)
    return (
      <>
        {head}
        <Waiting failed={page.failed} language={language} onRetry={page.load} />
      </>
    );
  const health = page.data;
  const lastPull = health.pulls[0];

  const retry = (messageId: string, to: string) => {
    if (busy !== null) return;
    setBusy(messageId);
    setDone(null);
    setFailure(null);
    api.retry(propertyId, messageId).then(
      (next) => {
        setBusy(null);
        page.set(next);
        setDone(tt(language, "retry_done", to));
      },
      (error: unknown) => {
        setBusy(null);
        const status = error instanceof TelegramError ? error.status : null;
        if (status === 404 || status === 409) {
          setFailure(tt(language, "e_retry_409"));
          page.load();
          return;
        }
        setFailure(tt(language, status === 403 ? "e_403" : "e_save"));
      },
    );
  };

  const kpis: [string, string, string, boolean][] = [
    [
      tt(language, "k_pull"),
      health.last_pull_at === null
        ? tt(language, "k_pull_none")
        : momentText(health.last_pull_at),
      lastPull === undefined
        ? ""
        : tt(language, "k_pull_s", lastPull.items_saved),
      health.last_pull_outcome === "FAILED" || health.last_pull_at === null,
    ],
    [
      tt(language, "k_wait"),
      String(health.outbox_waiting),
      tt(language, "k_wait_s"),
      false,
    ],
    [
      tt(language, "k_bad"),
      String(health.outbox_failing_12h),
      tt(language, "k_bad_s"),
      health.outbox_failing_12h > 0,
    ],
    [
      tt(language, "k_old"),
      String(health.relay_dropped),
      tt(language, "k_old_s"),
      health.relay_dropped > 0,
    ],
  ];

  return (
    <>
      {head}
      <Done text={done} />
      {failure !== null && (
        <p className="ui-error" role="alert">
          {failure}
        </p>
      )}
      <div className="ui-kpis" role="list">
        {kpis.map(([label, value, note, bad]) => (
          <div
            className={`ui-kpi ${bad ? "err" : "ok"}`}
            key={label}
            role="listitem"
          >
            <span className="ui-kpi-label">{label}</span>
            <span className="ui-kpi-value ui-num">{value}</span>
            <span className="ui-kpi-note">{note}</span>
          </div>
        ))}
      </div>
      {health.last_pull_outcome === "FAILED" &&
        health.last_pull_at !== null && (
          <div className="ui-notice warn" role="status">
            <Icon name="alert" />
            <p>
              {tt(
                language,
                "last_err",
                momentText(health.last_pull_at),
                errorText(language, health.last_pull_error),
              )}
            </p>
          </div>
        )}
      <section aria-labelledby="tg-bots" className="ui-card pad0">
        <div className="ui-listbar">
          <h2 id="tg-bots">{tt(language, "bots")}</h2>
        </div>
        <div className="ui-tablewrap">
          <table className="ui-table">
            <thead>
              <tr>
                <th scope="col">{tt(language, "c_bot")}</th>
                <th scope="col">{tt(language, "c_state")}</th>
                <th scope="col">{tt(language, "c_in")}</th>
                <th scope="col">{tt(language, "c_out")}</th>
              </tr>
            </thead>
            <tbody>
              {health.bots.map((bot) => {
                const name = `bot_${bot.code}`;
                return (
                  <tr key={bot.code}>
                    <td>{hasText(name) ? tt(language, name) : bot.name}</td>
                    <td>
                      {bot.failing ? (
                        <Chip icon="alert" tone="err">
                          {tt(language, "problem")}
                        </Chip>
                      ) : (
                        <Chip tone="ok">{tt(language, "working")}</Chip>
                      )}
                    </td>
                    <td className="ui-num">{when(bot.last_in, language)}</td>
                    <td className="ui-num">{when(bot.last_out, language)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="ui-tfoot">{tt(language, "keys")}</p>
      </section>
      <section aria-labelledby="tg-outbox" className="ui-card pad0">
        <div className="ui-listbar">
          <h2 id="tg-outbox">{tt(language, "outbox")}</h2>
        </div>
        {health.outbox.length === 0 ? (
          <p className="ui-empty">{tt(language, "none_outbox")}</p>
        ) : (
          <div className="ui-tablewrap">
            <table className="ui-table">
              <thead>
                <tr>
                  <th scope="col">{tt(language, "c_to")}</th>
                  <th scope="col">{tt(language, "c_since")}</th>
                  <th className="ui-wide" scope="col">
                    {tt(language, "c_tries")}
                  </th>
                  <th scope="col">{tt(language, "c_err")}</th>
                  <th scope="col">{tt(language, "c_state")}</th>
                </tr>
              </thead>
              <tbody>
                {health.outbox.map((message) => {
                  const bot = `bot_${message.bot}`;
                  const to =
                    message.to === null
                      ? tt(language, "to_chat")
                      : [message.to.name, message.to.unit_number]
                          .filter(Boolean)
                          .join(", ");
                  return (
                    <tr key={message.id}>
                      <td>
                        {to}
                        <span className="ui-sub2">
                          {hasText(bot) ? tt(language, bot) : message.bot}
                          {" · "}
                          {message.text_code}
                        </span>
                      </td>
                      <td className="ui-num">
                        {momentText(message.created_at)}
                      </td>
                      <td className="ui-wide ui-num">{message.tries}</td>
                      <td>
                        {errorText(language, message.last_error)}
                        {message.last_try_at !== null && (
                          <span className="ui-sub2 ui-num">
                            {momentText(message.last_try_at)}
                          </span>
                        )}
                      </td>
                      <td>
                        {message.retried ? (
                          <Chip tone="neutral">{tt(language, "retried")}</Chip>
                        ) : (
                          <Chip
                            tone={message.status === "GAVE_UP" ? "err" : "warn"}
                          >
                            {tt(language, `st_${message.status}`)}
                          </Chip>
                        )}
                        {operate &&
                          message.status === "GAVE_UP" &&
                          !message.retried && (
                            <>
                              {" "}
                              <button
                                className="ui-btn"
                                disabled={busy !== null}
                                onClick={() => {
                                  retry(message.id, to);
                                }}
                                type="button"
                              >
                                {tt(language, "retry")}
                              </button>
                            </>
                          )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="ui-tfoot">{tt(language, "outbox_n")}</p>
      </section>
      <section aria-labelledby="tg-pulls" className="ui-card pad0">
        <div className="ui-listbar">
          <h2 id="tg-pulls">{tt(language, "pulls")}</h2>
        </div>
        {health.pulls.length === 0 ? (
          <p className="ui-empty">{tt(language, "none_pulls")}</p>
        ) : (
          <div className="ui-tablewrap">
            <table className="ui-table">
              <thead>
                <tr>
                  <th scope="col">{tt(language, "c_at")}</th>
                  <th scope="col">{tt(language, "c_items")}</th>
                  <th scope="col">{tt(language, "c_res")}</th>
                </tr>
              </thead>
              <tbody>
                {health.pulls.map((run) => {
                  const outcome = `pull_${run.outcome}`;
                  return (
                    <tr key={run.started_at}>
                      <td className="ui-num">{momentText(run.started_at)}</td>
                      <td className="ui-num">{run.items_saved}</td>
                      <td>
                        {run.outcome === "OK" ? (
                          <Chip tone="ok">{tt(language, "pull_OK")}</Chip>
                        ) : (
                          <Chip tone="err">
                            {hasText(outcome)
                              ? tt(language, outcome)
                              : run.outcome}
                          </Chip>
                        )}
                        {run.error_code !== null && (
                          <span className="ui-sub2">
                            {errorText(language, run.error_code)}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

// ---------------------------------------------------------------- Contact office

function botName(language: Language, bot: string): string {
  const key = `bot_${bot}`;
  return hasText(key) ? tt(language, key) : bot;
}

export function ContactOfficePage({
  language,
  propertyId,
  active,
  capabilities,
  api = defaultTelegramApi,
}: TelegramPageProps) {
  const page = usePage<ContactPage>(propertyId, active, api.contact);
  const [tab, setTab] = useState<"NEW" | "DONE">("NEW");
  const [answering, setAnswering] = useState<{
    message: ContactMessage;
    how: "TELEGRAM" | "PHONE";
  } | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const answer = holds(capabilities, CONTACT);

  if (propertyId === "") return <NoProperty language={language} />;

  const head = (
    <div className="ui-head">
      <p>{tt(language, "contact_sub")}</p>
    </div>
  );
  if (page.data === null)
    return (
      <>
        {head}
        <Waiting failed={page.failed} language={language} onRetry={page.load} />
      </>
    );
  const { waiting, answered } = page.data;
  const shown = tab === "NEW" ? waiting : answered;

  return (
    <>
      {head}
      <Done text={done} />
      {stale && (
        <div className="ui-notice warn" role="status">
          <Icon name="alert" />
          <p>{tt(language, "e_answered")}</p>
        </div>
      )}
      <section aria-labelledby="tg-contact" className="ui-card pad0">
        <div className="ui-listbar">
          <h2 className="ui-sr" id="tg-contact">
            {pageTitle(language, "contact")}
          </h2>
          <div
            aria-label={pageTitle(language, "contact")}
            className="ui-seg"
            role="group"
          >
            {(["NEW", "DONE"] as const).map((value) => (
              <button
                aria-pressed={tab === value}
                key={value}
                onClick={() => {
                  setTab(value);
                }}
                type="button"
              >
                {tt(language, `ib_${value}`)}{" "}
                <span className="ui-num">
                  {value === "NEW" ? waiting.length : answered.length}
                </span>
              </button>
            ))}
          </div>
        </div>
        {shown.length === 0 ? (
          <p className="ui-empty">
            {tt(language, tab === "NEW" ? "none_waiting" : "none_answered")}
          </p>
        ) : (
          <div className="ui-tablewrap">
            <table className="ui-table">
              <thead>
                <tr>
                  <th scope="col">{tt(language, "c_from")}</th>
                  <th className="ui-wide" scope="col">
                    {tt(language, "c_phone")}
                  </th>
                  <th scope="col">{tt(language, "c_msg")}</th>
                  <th className="ui-wide" scope="col">
                    {tt(language, "c_at")}
                  </th>
                  {tab === "NEW" && answer && (
                    <th scope="col">
                      <span className="ui-sr">{tt(language, "reply")}</span>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {shown.map((message) => (
                  <tr key={message.id}>
                    <td>
                      {person(message.name, "")}
                      <span className="ui-sub2">
                        <Chip
                          tone={message.bot === "TENANT" ? "info" : "neutral"}
                        >
                          {botName(language, message.bot)}
                        </Chip>
                      </span>
                      {message.unit_number !== null && (
                        <span className="ui-sub2 ui-num">
                          {message.unit_number}
                        </span>
                      )}
                    </td>
                    <td className="ui-wide ui-num">{message.phone ?? ""}</td>
                    <td>
                      {message.message}
                      {message.answer !== null && (
                        <span className="ui-sub2">
                          {tt(
                            language,
                            `ans_${message.answer.how}`,
                            message.answer.by ?? "",
                            momentText(message.answer.at),
                          )}
                          {": "}
                          {message.answer.text}
                        </span>
                      )}
                    </td>
                    <td className="ui-wide ui-num">
                      {momentText(message.received_at)}
                    </td>
                    {tab === "NEW" && answer && (
                      <td>
                        <div className="ui-actions">
                          <button
                            className="ui-btn primary"
                            onClick={() => {
                              setDone(null);
                              setStale(false);
                              setAnswering({ message, how: "TELEGRAM" });
                            }}
                            type="button"
                          >
                            {tt(language, "reply")}
                          </button>
                          <button
                            className="ui-btn"
                            onClick={() => {
                              setDone(null);
                              setStale(false);
                              setAnswering({ message, how: "PHONE" });
                            }}
                            type="button"
                          >
                            {tt(language, "called")}
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="ui-tfoot">{tt(language, "contact_n")}</p>
      </section>
      {answering !== null && (
        <AnswerDialog
          api={api}
          how={answering.how}
          language={language}
          message={answering.message}
          onClose={() => {
            setAnswering(null);
          }}
          onDone={(next) => {
            page.set(next);
            const who = person(answering.message.name, "");
            setDone(
              tt(
                language,
                answering.how === "TELEGRAM" ? "rep_done" : "call_done",
                who,
              ),
            );
            setAnswering(null);
          }}
          onStale={() => {
            setAnswering(null);
            setStale(true);
            page.load();
          }}
          propertyId={propertyId}
        />
      )}
    </>
  );
}

function pageTitle(language: Language, which: "contact" | "faq"): string {
  return which === "contact"
    ? language === "km"
      ? "ទាក់ទងការិយាល័យ"
      : "Contact office"
    : language === "km"
      ? "សំណួរញឹកញាប់"
      : "FAQ";
}

function AnswerDialog({
  language,
  propertyId,
  message,
  how,
  api,
  onClose,
  onDone,
  onStale,
}: {
  language: Language;
  propertyId: string;
  message: ContactMessage;
  how: "TELEGRAM" | "PHONE";
  api: TelegramApi;
  onClose: () => void;
  onDone: (next: ContactPage) => void;
  onStale: () => void;
}) {
  const [words, setWords] = useState("");
  const [shown, setShown] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const missing = words.trim() === "";
  const reply = how === "TELEGRAM";

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setShown(true);
    if (missing || busy) return;
    setBusy(true);
    setFailure(null);
    api.answer(propertyId, message.id, how, words.trim()).then(
      (next) => {
        setBusy(false);
        onDone(next);
      },
      (error: unknown) => {
        setBusy(false);
        const status = error instanceof TelegramError ? error.status : null;
        if (status === 404 || status === 409) {
          onStale();
          return;
        }
        setFailure(tt(language, status === 403 ? "e_403" : "e_save"));
      },
    );
  };

  return (
    <Dialog
      busy={busy}
      closeLabel={tt(language, "cancel")}
      onClose={onClose}
      onSubmit={submit}
      submitLabel={tt(language, reply ? "send" : "save")}
      title={`${tt(language, reply ? "reply" : "called")} · ${person(message.name, "")}`}
    >
      <p className="ui-muted">{message.message}</p>
      <div className="ui-field">
        <label htmlFor="tg-answer">
          {tt(language, reply ? "rep_l" : "call_l")}
          <span className="req">{"*"}</span>
        </label>
        <textarea
          aria-describedby={shown && missing ? "tg-answer-err" : undefined}
          aria-invalid={shown && missing}
          disabled={busy}
          id="tg-answer"
          maxLength={600}
          onChange={(event) => {
            setWords(event.currentTarget.value);
          }}
          rows={3}
          value={words}
        />
        <p className="help">
          {reply
            ? tt(language, "rep_n", botName(language, message.bot))
            : tt(language, "call_n")}
        </p>
        {shown && missing && (
          <p className="ui-error" id="tg-answer-err">
            {tt(language, "e_text")}
          </p>
        )}
      </div>
      {failure !== null && (
        <p className="ui-error" role="alert">
          {failure}
        </p>
      )}
    </Dialog>
  );
}

// ---------------------------------------------------------------- FAQ

const NO_WORDS: FaqWords = {
  for_bots: "BOTH",
  question_en: "",
  answer_en: "",
  question_km: "",
  answer_km: "",
};

function wordsOf(question: FaqQuestion | null): FaqWords {
  const from = question?.pending ?? question?.current ?? null;
  if (from === null) return NO_WORDS;
  return {
    for_bots: from.for_bots,
    question_en: from.question_en,
    answer_en: from.answer_en,
    question_km: from.question_km,
    answer_km: from.answer_km,
  };
}

export function FaqPageView({
  language,
  propertyId,
  active,
  capabilities,
  api = defaultTelegramApi,
}: TelegramPageProps) {
  const page = usePage<FaqPage>(propertyId, active, api.faq);
  const [editing, setEditing] = useState<FaqQuestion | "new" | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (propertyId === "") return <NoProperty language={language} />;
  const edit = holds(capabilities, FAQ) && page.data?.can_edit === true;
  const head = (
    <div className="ui-head">
      <p>{tt(language, "faq_sub")}</p>
      {edit && (
        <button
          className="ui-btn primary"
          onClick={() => {
            setDone(null);
            setFailure(null);
            setEditing("new");
          }}
          type="button"
        >
          <Icon name="plus" small /> {tt(language, "faq_new")}
        </button>
      )}
    </div>
  );
  if (page.data === null)
    return (
      <>
        {head}
        <Waiting failed={page.failed} language={language} onRetry={page.load} />
      </>
    );
  const { questions, owner } = page.data;
  const km = language === "km";

  const approve = (question: FaqQuestion, versionId: string) => {
    if (busy) return;
    setBusy(true);
    setDone(null);
    setFailure(null);
    api.approveFaq(propertyId, versionId).then(
      (next) => {
        setBusy(false);
        page.set(next);
        setDone(tt(language, "faq_done_ok", question.number));
      },
      (error: unknown) => {
        setBusy(false);
        const status = error instanceof TelegramError ? error.status : null;
        if (status === 404 || status === 409) {
          setFailure(tt(language, "e_faq_stale"));
          page.load();
          return;
        }
        setFailure(tt(language, status === 403 ? "e_403" : "e_save"));
      },
    );
  };

  return (
    <>
      {head}
      <Done text={done} />
      {failure !== null && (
        <div className="ui-notice warn" role="alert">
          <Icon name="alert" />
          <p>{failure}</p>
        </div>
      )}
      <section aria-labelledby="tg-faq" className="ui-card pad0">
        <h2 className="ui-sr" id="tg-faq">
          {pageTitle(language, "faq")}
        </h2>
        {questions.length === 0 ? (
          <p className="ui-empty">{tt(language, "none_faq")}</p>
        ) : (
          <div className="ui-tablewrap">
            <table className="ui-table">
              <thead>
                <tr>
                  <th scope="col">{tt(language, "c_no")}</th>
                  <th scope="col">{tt(language, "c_q")}</th>
                  <th className="ui-wide" scope="col">
                    {tt(language, "c_who")}
                  </th>
                  <th className="ui-wide" scope="col">
                    {tt(language, "c_ver")}
                  </th>
                  <th scope="col">
                    <span className="ui-sr">{tt(language, "edit")}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {questions.map((question) => {
                  const words = question.current ?? question.pending;
                  const pending = question.pending;
                  return (
                    <tr key={question.id}>
                      <td className="ui-num">{question.number}</td>
                      <td>
                        {words === null
                          ? ""
                          : km
                            ? words.question_km
                            : words.question_en}
                        {words !== null && (
                          <span className="ui-sub2">
                            {km ? words.question_en : words.question_km}
                          </span>
                        )}
                        {pending !== null && (
                          <span className="ui-sub2">
                            <Chip icon="clock" tone="warn">
                              {tt(
                                language,
                                "faq_pend",
                                pending.proposed_by ?? "",
                              )}
                            </Chip>
                          </span>
                        )}
                      </td>
                      <td className="ui-wide">
                        {words !== null && (
                          <Chip
                            tone={
                              words.for_bots === "HIDDEN"
                                ? "neutral"
                                : words.for_bots === "BOTH"
                                  ? "info"
                                  : "ok"
                            }
                          >
                            {tt(language, `who_${words.for_bots}`)}
                          </Chip>
                        )}
                      </td>
                      <td className="ui-wide">
                        {question.current === null ? (
                          tt(language, "not_yet")
                        ) : (
                          <>
                            <span className="ui-num">
                              {tt(
                                language,
                                "ver",
                                question.current.version_number,
                              )}
                            </span>
                            <span className="ui-sub2">
                              {tt(
                                language,
                                "ok_by",
                                question.current.approved_by ?? "",
                                momentText(question.current.approved_at),
                              )}
                            </span>
                          </>
                        )}
                      </td>
                      <td>
                        <div className="ui-actions">
                          {pending !== null && owner && edit && (
                            <button
                              className="ui-btn primary"
                              disabled={busy}
                              onClick={() => {
                                approve(question, pending.version_id);
                              }}
                              type="button"
                            >
                              {tt(language, "faq_ok")}
                            </button>
                          )}
                          {edit && (
                            <button
                              className="ui-btn"
                              onClick={() => {
                                setDone(null);
                                setFailure(null);
                                setEditing(question);
                              }}
                              type="button"
                            >
                              {tt(
                                language,
                                pending !== null ? "faq_see" : "edit",
                              )}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="ui-tfoot">
          <Icon name="lock" small /> {tt(language, "faq_n")}
          {!edit && <> {tt(language, "faq_read_only")}</>}
        </p>
      </section>
      {editing !== null && (
        <FaqDialog
          api={api}
          language={language}
          onClose={() => {
            setEditing(null);
          }}
          onDone={(saved) => {
            page.set(saved.page);
            setDone(
              tt(
                language,
                saved.approved ? "faq_done_ok" : "faq_done",
                saved.number,
              ),
            );
            setEditing(null);
          }}
          onStale={() => {
            setEditing(null);
            setFailure(tt(language, "e_faq_stale"));
            page.load();
          }}
          owner={owner}
          propertyId={propertyId}
          question={editing === "new" ? null : editing}
        />
      )}
    </>
  );
}

const FAQ_FIELDS = [
  ["question_en", "q_en", 160],
  ["answer_en", "a_en", 800],
  ["question_km", "q_km", 160],
  ["answer_km", "a_km", 800],
] as const;

function FaqDialog({
  language,
  propertyId,
  question,
  owner,
  api,
  onClose,
  onDone,
  onStale,
}: {
  language: Language;
  propertyId: string;
  question: FaqQuestion | null;
  owner: boolean;
  api: TelegramApi;
  onClose: () => void;
  onDone: (saved: Awaited<ReturnType<TelegramApi["saveFaq"]>>) => void;
  onStale: () => void;
}) {
  const [words, setWords] = useState<FaqWords>(() => wordsOf(question));
  const [shown, setShown] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const missing = FAQ_FIELDS.some(([field]) => words[field].trim() === "");

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setShown(true);
    if (missing || busy) return;
    setBusy(true);
    setFailure(null);
    const trimmed: FaqWords = {
      for_bots: words.for_bots,
      question_en: words.question_en.trim(),
      answer_en: words.answer_en.trim(),
      question_km: words.question_km.trim(),
      answer_km: words.answer_km.trim(),
    };
    api.saveFaq(propertyId, question?.id ?? null, trimmed).then(
      (saved) => {
        setBusy(false);
        onDone(saved);
      },
      (error: unknown) => {
        setBusy(false);
        const status = error instanceof TelegramError ? error.status : null;
        if (status === 404 || status === 409) {
          onStale();
          return;
        }
        setFailure(tt(language, status === 403 ? "e_403" : "e_save"));
      },
    );
  };

  return (
    <Dialog
      busy={busy}
      closeLabel={tt(language, "cancel")}
      onClose={onClose}
      onSubmit={submit}
      submitLabel={tt(language, owner ? "faq_save_ok" : "faq_save")}
      title={
        question === null
          ? tt(language, "faq_new")
          : tt(language, "faq_ed", question.number)
      }
      wide
    >
      <div className="ui-field">
        <label htmlFor="tg-faq-who">{tt(language, "c_who")}</label>
        <select
          className="ui-sel"
          disabled={busy}
          id="tg-faq-who"
          onChange={(event) => {
            const value = event.currentTarget.value;
            const found = FAQ_BOTS.find((code) => code === value);
            if (found !== undefined)
              setWords((before) => ({ ...before, for_bots: found }));
          }}
          value={words.for_bots}
        >
          {FAQ_BOTS.map((code: FaqBots) => (
            <option key={code} value={code}>
              {tt(language, `who_${code}`)}
            </option>
          ))}
        </select>
      </div>
      {FAQ_FIELDS.map(([field, label, most]) => {
        const empty = shown && words[field].trim() === "";
        const id = `tg-faq-${field}`;
        const change = (value: string) => {
          setWords((before) => ({ ...before, [field]: value }));
        };
        return (
          <div className="ui-field" key={field}>
            <label htmlFor={id}>
              {tt(language, label)}
              <span className="req">{"*"}</span>
            </label>
            {most === 160 ? (
              <input
                aria-describedby={empty ? `${id}-err` : undefined}
                aria-invalid={empty}
                autoComplete="off"
                disabled={busy}
                id={id}
                maxLength={most}
                onChange={(event) => {
                  change(event.currentTarget.value);
                }}
                value={words[field]}
              />
            ) : (
              <textarea
                aria-describedby={empty ? `${id}-err` : undefined}
                aria-invalid={empty}
                disabled={busy}
                id={id}
                maxLength={most}
                onChange={(event) => {
                  change(event.currentTarget.value);
                }}
                rows={3}
                value={words[field]}
              />
            )}
            {empty && (
              <p className="ui-error" id={`${id}-err`}>
                {tt(language, "e_text")}
              </p>
            )}
          </div>
        );
      })}
      <p className="help">{tt(language, owner ? "faq_own_n" : "faq_mgr_n")}</p>
      {failure !== null && (
        <p className="ui-error" role="alert">
          {failure}
        </p>
      )}
    </Dialog>
  );
}
