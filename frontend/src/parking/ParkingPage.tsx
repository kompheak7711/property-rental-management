// DL-253 (parking step 2, mock-up of 20/11/2026): Property › Parking. The parking spaces with
// who holds each one today, four count cards that filter the table, a Parking Type filter, and
// New space and Edit space for whoever may manage Units. A space uses its Parking Type price
// (set in Settings › Unit setup) unless it has its own price.

import {
  type FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import "../shell/screens.css";
import { centsOf } from "../payments/depositMoney";
import {
  type ParkingApi,
  ParkingError,
  type ParkingSpace,
  parkingApi as defaultParkingApi,
} from "../parkingClient";
import { useBuildingChoice } from "../shell/buildingChoice";
import { hashForPage } from "../shell/navigation";
import { usdFromCents } from "../shell/format";
import { Icon, type ShellIcon } from "../shell/icons";
import { PageHead } from "../shell/pageHead";
import { Chip, CountCard, Dialog, type Tone } from "../shell/ui";
import type { Language } from "../signInText";
import type { UnitApi, UnitSetupItem } from "../unitClient";
import { type ParkingTextKey, pt } from "./text";

type Card = "all" | "free" | "used" | "guests";

const CARDS: readonly [Exclude<Card, "all">, ShellIcon, Tone][] = [
  ["free", "check", "ok"],
  ["used", "car", "info"],
  ["guests", "calendar", "warn"],
];

function cardOf(space: ParkingSpace): Exclude<Card, "all"> {
  if (space.kept_for_short_stay_guests) return "guests";
  return space.holds.length === 0 ? "free" : "used";
}

function typeLabel(
  language: Language,
  types: UnitSetupItem[] | null,
  code: string,
): string {
  const item = types?.find((entry) => entry.code === code);
  if (item === undefined) return code;
  return language === "km" && item.name_km !== null
    ? item.name_km
    : item.name_en;
}

function priceText(language: Language, space: ParkingSpace): string {
  const cents = space.default_monthly_rent_usd_cents;
  if (cents === null) return pt(language, "no_price");
  return space.rent_from_type
    ? pt(language, "from_type", usdFromCents(cents))
    : usdFromCents(cents);
}

function heldText(language: Language, space: ParkingSpace): string[] {
  return space.holds.map((hold) => {
    const who =
      hold.customer_name ?? hold.lease_number ?? pt(language, "agreement");
    const named =
      hold.room_unit_number === null
        ? who
        : pt(language, "with_room", who, hold.room_unit_number);
    return hold.plate_text === null ? named : `${named} · ${hold.plate_text}`;
  });
}

export interface ParkingPageProps {
  language: Language;
  propertyId: string;
  /** Only the page that is shown loads; a hidden page waits until it is opened. */
  active: boolean;
  /** The Parking Types come from the Settings lists. */
  unitApi: Pick<UnitApi, "setupLists">;
  /** The real server when not given. */
  api?: ParkingApi;
  /** DL-254: the person may draft Leases, so a space offers New Parking agreement. */
  canDraftLeases?: boolean;
}

export function ParkingPage({
  language,
  propertyId,
  active,
  unitApi,
  api = defaultParkingApi,
  canDraftLeases = false,
}: ParkingPageProps) {
  const choice = useBuildingChoice();
  const [spaces, setSpaces] = useState<ParkingSpace[] | null>(null);
  const [canManage, setCanManage] = useState(false);
  // null when the Settings lists could not be read; then spaces cannot be added or changed.
  const [types, setTypes] = useState<UnitSetupItem[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [card, setCard] = useState<Card>("all");
  const [type, setType] = useState("all");
  const [editing, setEditing] = useState<ParkingSpace | "new" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const sequence = useRef(0);

  const load = useCallback(() => {
    if (propertyId === "") return;
    const operation = ++sequence.current;
    setFailed(false);
    void api
      .list(propertyId)
      .then((found) => {
        if (operation !== sequence.current) return;
        setSpaces(found.items);
        setCanManage(found.can_manage);
      })
      .catch(() => {
        if (operation === sequence.current) setFailed(true);
      });
    void unitApi
      .setupLists(propertyId)
      .then((lists) => lists.lists.PARKING_TYPE)
      .catch(() => null)
      .then((found) => {
        if (operation === sequence.current) setTypes(found);
      });
  }, [api, propertyId, unitApi]);

  // Read again each time the page is opened, so it shows what others changed meanwhile.
  useEffect(() => {
    if (active) load();
  }, [active, load]);

  if (propertyId === "") {
    return (
      <div className="ui-notice warn" role="status">
        <Icon name="alert" />
        <p>{pt(language, "no_property")}</p>
      </div>
    );
  }
  if (failed && spaces === null) {
    return (
      <div className="ui-notice warn" role="status">
        <Icon name="alert" />
        <p>{pt(language, "failed")}</p>
        <button className="ui-btn" onClick={load} type="button">
          {pt(language, "retry")}
        </button>
      </div>
    );
  }
  if (spaces === null) {
    return (
      <p className="ui-muted" role="status">
        {pt(language, "loading")}
      </p>
    );
  }

  // DL-250: the list shows the building chosen in the side menu.
  const chosen = choice.chosen;
  const inBuilding = spaces.filter(
    (space) =>
      chosen === null ||
      space.building_id === null ||
      space.building_id === chosen.building_id,
  );
  const codes = [...new Set(inBuilding.map((space) => space.parking_type))];
  const base = inBuilding.filter(
    (space) => type === "all" || space.parking_type === type,
  );
  const shown = base.filter(
    (space) => card === "all" || cardOf(space) === card,
  );
  const dash = <span className="ui-muted">—</span>;
  const canEdit = canManage && types !== null;
  const actions = canEdit || canDraftLeases;

  return (
    <>
      <PageHead active={active}>
        <p>{pt(language, "sub", inBuilding.length)}</p>
        {canEdit && (
          <div className="ui-actions">
            <button
              className="ui-btn primary"
              onClick={() => {
                setNotice(null);
                setEditing("new");
              }}
              type="button"
            >
              <Icon name="plus" />
              {pt(language, "new_space")}
            </button>
          </div>
        )}
      </PageHead>
      {notice !== null && (
        <div className="ui-notice ok" role="status">
          <Icon name="check" />
          <p>{notice}</p>
        </div>
      )}
      {canManage && types === null && (
        <div className="ui-notice warn">
          <Icon name="alert" />
          <p>{pt(language, "types_failed")}</p>
        </div>
      )}
      <div className="ui-filters">
        <label className="ui-sr" htmlFor="parking-type">
          {pt(language, "type")}
        </label>
        <select
          className="ui-sel"
          id="parking-type"
          onChange={(event) => {
            setType(event.currentTarget.value);
          }}
          value={type}
        >
          <option value="all">{pt(language, "all_types")}</option>
          {codes.map((code) => (
            <option key={code} value={code}>
              {typeLabel(language, types, code)}
            </option>
          ))}
        </select>
      </div>
      <div className="ui-kpis ui-kpis-row">
        <CountCard
          icon="car"
          label={pt(language, "c_all")}
          onPress={() => {
            setCard("all");
          }}
          pressed={card === "all"}
          tone="brand"
          value={base.length}
        />
        {CARDS.map(([value, icon, tone]) => (
          <CountCard
            icon={icon}
            key={value}
            label={pt(language, `c_${value}`)}
            onPress={() => {
              setCard(card === value ? "all" : value);
            }}
            pressed={card === value}
            tone={tone}
            value={base.filter((space) => cardOf(space) === value).length}
          />
        ))}
      </div>
      <div className="ui-card pad0">
        {card !== "all" && (
          <div className="ui-listbar">
            {pt(language, "showing", pt(language, `c_${card}`))}
            <button
              className="ui-btn link"
              onClick={() => {
                setCard("all");
              }}
              type="button"
            >
              {pt(language, "show_all")}
            </button>
          </div>
        )}
        {shown.length === 0 ? (
          <p className="ui-empty">{pt(language, "none")}</p>
        ) : (
          <div className="ui-tablewrap">
            <table className="ui-table ui-pcards" data-testid="parking-list">
              <thead>
                <tr>
                  <th scope="col">{pt(language, "col_space")}</th>
                  <th scope="col">{pt(language, "type")}</th>
                  <th scope="col">{pt(language, "col_area")}</th>
                  <th className="num" scope="col">
                    {pt(language, "col_places")}
                  </th>
                  <th className="num" scope="col">
                    {pt(language, "col_price")}
                  </th>
                  <th scope="col">{pt(language, "col_held")}</th>
                  {actions && (
                    <th scope="col">
                      <span className="ui-sr">
                        {pt(language, "col_actions")}
                      </span>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {shown.map((space) => {
                  const held = heldText(language, space);
                  return (
                    <tr key={space.unit_id}>
                      <td className="ui-num">
                        <strong>{space.unit_number}</strong>
                      </td>
                      <td className="pc-small">
                        {typeLabel(language, types, space.parking_type)}
                      </td>
                      <td className="pc-small">{space.area}</td>
                      <td className="ui-num num pc-small">
                        {pt(
                          language,
                          "places_of",
                          space.holds.length,
                          space.parking_capacity,
                        )}
                      </td>
                      <td className="ui-num num pc-small">
                        {priceText(language, space)}
                      </td>
                      <td className="pc-end">
                        {space.kept_for_short_stay_guests ? (
                          <Chip icon="calendar" tone="warn">
                            {pt(language, "guests_chip")}
                          </Chip>
                        ) : held.length === 0 ? (
                          dash
                        ) : (
                          held.map((line) => <div key={line}>{line}</div>)
                        )}
                      </td>
                      {actions && (
                        <td>
                          {canDraftLeases &&
                            !space.kept_for_short_stay_guests && (
                              <a
                                aria-label={`${pt(language, "pa_new")}: ${space.unit_number}`}
                                className="ui-btn link"
                                href={hashForPage(
                                  "leases",
                                  `space:${space.unit_id}`,
                                )}
                              >
                                {pt(language, "pa_new")}
                              </a>
                            )}
                          {canEdit && (
                            <button
                              aria-label={`${pt(language, "edit_space")}: ${space.unit_number}`}
                              className="ui-btn link"
                              onClick={() => {
                                setNotice(null);
                                setEditing(space);
                              }}
                              type="button"
                            >
                              {pt(language, "edit_space")}
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <p className="ui-small ui-muted">{pt(language, "note")}</p>
      {editing !== null && types !== null && (
        <SpaceDialog
          api={api}
          buildingId={chosen?.building_id ?? null}
          language={language}
          onChanged={() => {
            setEditing(null);
            load();
          }}
          onClose={() => {
            setEditing(null);
          }}
          onSaved={(saved, added) => {
            setEditing(null);
            setNotice(
              pt(language, added ? "saved_new" : "saved", saved.unit_number),
            );
            setSpaces((current) =>
              current === null
                ? current
                : added
                  ? [...current, saved]
                  : current.map((entry) =>
                      entry.unit_id === saved.unit_id ? saved : entry,
                    ),
            );
            load();
          }}
          propertyId={propertyId}
          space={editing === "new" ? null : editing}
          types={types}
        />
      )}
    </>
  );
}

function Problem({ message }: { message: string | null }) {
  if (message === null) return null;
  return (
    <p className="ui-error" role="alert">
      <Icon name="alert" small />
      <span>{message}</span>
    </p>
  );
}

/** New space (space null) or Edit space. The number and building cannot change later. */
function SpaceDialog({
  api,
  language,
  propertyId,
  buildingId,
  space,
  types,
  onClose,
  onSaved,
  onChanged,
}: {
  api: ParkingApi;
  language: Language;
  propertyId: string;
  buildingId: string | null;
  space: ParkingSpace | null;
  types: UnitSetupItem[];
  onClose: () => void;
  onSaved: (space: ParkingSpace, added: boolean) => void;
  /** Someone changed the space meanwhile: the form closes and the list is read again. */
  onChanged: () => void;
}) {
  const choosable = types.filter(
    (item) => !item.removed || item.code === space?.parking_type,
  );
  const [number, setNumber] = useState("");
  const [type, setType] = useState(
    space?.parking_type ?? choosable[0]?.code ?? "",
  );
  const [area, setArea] = useState(space?.area ?? "");
  const [capacity, setCapacity] = useState(
    String(space?.parking_capacity ?? 1),
  );
  const [kept, setKept] = useState(space?.kept_for_short_stay_guests ?? false);
  const [fromType, setFromType] = useState(space?.rent_from_type ?? true);
  const own =
    space?.rent_from_type === false
      ? space.default_monthly_rent_usd_cents
      : null;
  const [price, setPrice] = useState(
    own === null ? "" : (own / 100).toFixed(2),
  );
  const [missing, setMissing] = useState<
    Partial<Record<string, ParkingTextKey>>
  >({});
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const typePrice =
    types.find((item) => item.code === type)?.default_monthly_rent_usd_cents ??
    null;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const found: Partial<Record<string, ParkingTextKey>> = {};
    if (space === null && number.trim() === "") found.number = "e_number";
    if (type === "") found.type = "e_type";
    if (area.trim() === "") found.area = "e_area";
    const places = Number(capacity.trim());
    if (!/^\d{1,3}$/.test(capacity.trim()) || places < 1 || places > 500)
      found.capacity = "e_capacity";
    const cents = fromType ? null : centsOf(price);
    if (!fromType && cents === null) found.price = "e_price";
    setMissing(found);
    if (Object.keys(found).length > 0) return;
    const source = {
      parking_type: type,
      area: area.trim(),
      parking_capacity: places,
      kept_for_short_stay_guests: kept,
      price_usd_cents: cents,
    };
    setBusy(true);
    setProblem(null);
    const work =
      space === null
        ? api.create(propertyId, {
            ...source,
            unit_number: number.trim(),
            building_id: buildingId,
          })
        : api.update(space, source);
    void work
      .then((saved) => {
        onSaved(saved, space === null);
      })
      .catch((error: unknown) => {
        setBusy(false);
        const code = error instanceof ParkingError ? error.code : "FAILED";
        if (code === "CHANGED" && space !== null) {
          onChanged();
          return;
        }
        setProblem(pt(language, `r_${code}`));
      });
  }

  const field = (name: string) => {
    const key = missing[name];
    return key === undefined ? null : <Problem message={pt(language, key)} />;
  };

  return (
    <Dialog
      busy={busy}
      closeLabel={pt(language, "cancel")}
      onClose={onClose}
      onSubmit={submit}
      submitLabel={pt(language, "save")}
      title={
        space === null
          ? pt(language, "new_space")
          : `${pt(language, "edit_space")} · ${space.unit_number}`
      }
    >
      <div className="ui-row2">
        {space === null && (
          <div className="ui-field">
            <label htmlFor="parking-number">
              {pt(language, "number")}
              <span className="req">{pt(language, "required")}</span>
            </label>
            <input
              aria-invalid={missing.number !== undefined}
              autoComplete="off"
              className="ui-num"
              id="parking-number"
              maxLength={20}
              onChange={(event) => {
                setNumber(event.currentTarget.value);
              }}
              placeholder="P01"
              value={number}
            />
            {field("number")}
          </div>
        )}
        <div className="ui-field">
          <label htmlFor="parking-space-type">
            {pt(language, "type")}
            <span className="req">{pt(language, "required")}</span>
          </label>
          <select
            aria-invalid={missing.type !== undefined}
            id="parking-space-type"
            onChange={(event) => {
              setType(event.currentTarget.value);
            }}
            value={type}
          >
            {choosable.map((item) => (
              <option key={item.item_id} value={item.code}>
                {language === "km" && item.name_km !== null
                  ? item.name_km
                  : item.name_en}
              </option>
            ))}
          </select>
          {field("type")}
        </div>
      </div>
      <div className="ui-field">
        <label htmlFor="parking-area">
          {pt(language, "area")}
          <span className="req">{pt(language, "required")}</span>
        </label>
        <input
          aria-invalid={missing.area !== undefined}
          autoComplete="off"
          id="parking-area"
          maxLength={100}
          onChange={(event) => {
            setArea(event.currentTarget.value);
          }}
          value={area}
        />
        <p className="help">{pt(language, "area_help")}</p>
        {field("area")}
      </div>
      <div className="ui-field">
        <label htmlFor="parking-capacity">{pt(language, "capacity")}</label>
        <input
          aria-invalid={missing.capacity !== undefined}
          className="ui-num"
          id="parking-capacity"
          inputMode="numeric"
          maxLength={3}
          onChange={(event) => {
            setCapacity(event.currentTarget.value);
          }}
          value={capacity}
        />
        <p className="help">{pt(language, "capacity_help")}</p>
        {field("capacity")}
      </div>
      <label className="ui-chk">
        <input
          checked={kept}
          onChange={(event) => {
            setKept(event.currentTarget.checked);
          }}
          type="checkbox"
        />
        <span>{pt(language, "kept")}</span>
      </label>
      <p className="ui-small ui-muted">{pt(language, "kept_help")}</p>
      <label className="ui-chk">
        <input
          checked={fromType}
          onChange={(event) => {
            setFromType(event.currentTarget.checked);
          }}
          type="checkbox"
        />
        <span>{pt(language, "use_type")}</span>
      </label>
      {fromType ? (
        <p className="ui-small ui-muted" data-testid="parking-type-price">
          {typePrice === null
            ? pt(language, "type_no_price")
            : pt(language, "type_price", usdFromCents(typePrice))}
        </p>
      ) : (
        <div className="ui-field">
          <label htmlFor="parking-price">{pt(language, "price")}</label>
          <input
            aria-invalid={missing.price !== undefined}
            className="ui-num"
            id="parking-price"
            inputMode="decimal"
            onChange={(event) => {
              setPrice(event.currentTarget.value);
            }}
            value={price}
          />
          {field("price")}
        </div>
      )}
      <p className="ui-small ui-muted">{pt(language, "price_help")}</p>
      <Problem message={problem} />
    </Dialog>
  );
}
