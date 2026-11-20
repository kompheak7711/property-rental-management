// DL-253 (parking step 3a): the Vehicles card of the Customer page. It lists the Customer's
// vehicles with the space each one holds today. Add vehicle and Edit vehicle need Customers
// manage access, and only an active Customer takes a new vehicle.

import { type FormEvent, useCallback, useEffect, useState } from "react";

import { type ParkingTextKey, pt } from "../parking/text";
import { Icon } from "../shell/icons";
import { Chip, Dialog } from "../shell/ui";
import type { Language } from "../signInText";
import {
  VEHICLE_TYPES,
  type Vehicle,
  type VehicleApi,
  VehicleError,
  type VehicleType,
  vehicleApi as defaultVehicleApi,
} from "../vehiclesClient";

function Problem({ message }: { message: string | null }) {
  if (message === null) return null;
  return (
    <p className="ui-error" role="alert">
      <Icon name="alert" small />
      <span>{message}</span>
    </p>
  );
}

function optional(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function VehicleDialog({
  api,
  customerId,
  language,
  vehicle,
  onClose,
  onSaved,
  onChanged,
}: {
  api: VehicleApi;
  customerId: string;
  language: Language;
  vehicle: Vehicle | null;
  onClose: () => void;
  onSaved: (vehicle: Vehicle, added: boolean) => void;
  onChanged: () => void;
}) {
  const [type, setType] = useState<VehicleType>(vehicle?.vehicle_type ?? "CAR");
  const [plate, setPlate] = useState(vehicle?.plate_text ?? "");
  const [colour, setColour] = useState(vehicle?.colour ?? "");
  const [brand, setBrand] = useState(vehicle?.brand_model ?? "");
  const [sticker, setSticker] = useState(vehicle?.sticker_number ?? "");
  const [missingPlate, setMissingPlate] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (plate.trim() === "") {
      setMissingPlate(true);
      return;
    }
    setMissingPlate(false);
    const source = {
      vehicle_type: type,
      plate_text: plate.trim(),
      colour: optional(colour),
      brand_model: optional(brand),
      sticker_number: optional(sticker),
    };
    setBusy(true);
    setProblem(null);
    const work =
      vehicle === null
        ? api.create(customerId, source)
        : api.update(vehicle, source);
    void work
      .then((saved) => {
        onSaved(saved, vehicle === null);
      })
      .catch((error: unknown) => {
        setBusy(false);
        const code = error instanceof VehicleError ? error.code : "FAILED";
        if (code === "CHANGED" && vehicle !== null) {
          onChanged();
          return;
        }
        setProblem(pt(language, `v_r_${code}`));
      });
  }

  const text = (
    id: string,
    label: ParkingTextKey,
    value: string,
    set: (value: string) => void,
    max: number,
  ) => (
    <div className="ui-field">
      <label htmlFor={id}>
        {pt(language, label)}
        <span className="req">{pt(language, "v_optional")}</span>
      </label>
      <input
        autoComplete="off"
        id={id}
        maxLength={max}
        onChange={(event) => {
          set(event.currentTarget.value);
        }}
        value={value}
      />
    </div>
  );

  return (
    <Dialog
      busy={busy}
      closeLabel={pt(language, "cancel")}
      onClose={onClose}
      onSubmit={submit}
      submitLabel={pt(language, "save")}
      title={
        vehicle === null
          ? pt(language, "v_add")
          : pt(language, "v_edit_plate", vehicle.plate_text)
      }
    >
      <div className="ui-row2">
        <div className="ui-field">
          <label htmlFor="vehicle-type">
            {pt(language, "v_type")}
            <span className="req">{pt(language, "required")}</span>
          </label>
          <select
            id="vehicle-type"
            onChange={(event) => {
              const found = VEHICLE_TYPES.find(
                (item) => item === event.currentTarget.value,
              );
              if (found !== undefined) setType(found);
            }}
            value={type}
          >
            {VEHICLE_TYPES.map((item) => (
              <option key={item} value={item}>
                {pt(language, `v_${item}`)}
              </option>
            ))}
          </select>
        </div>
        <div className="ui-field">
          <label htmlFor="vehicle-plate">
            {pt(language, "v_plate")}
            <span className="req">{pt(language, "required")}</span>
          </label>
          <input
            aria-invalid={missingPlate}
            autoComplete="off"
            className="ui-num"
            id="vehicle-plate"
            maxLength={32}
            onChange={(event) => {
              setPlate(event.currentTarget.value);
            }}
            placeholder="2A-1234"
            value={plate}
          />
          <p className="help">{pt(language, "v_plate_help")}</p>
          {missingPlate && <Problem message={pt(language, "v_e_plate")} />}
        </div>
      </div>
      <div className="ui-row2">
        {text("vehicle-colour", "v_colour", colour, setColour, 50)}
        {text("vehicle-brand", "v_brand", brand, setBrand, 100)}
      </div>
      {text("vehicle-sticker", "v_sticker", sticker, setSticker, 32)}
      <Problem message={problem} />
    </Dialog>
  );
}

function details(language: Language, vehicle: Vehicle): string {
  return [
    pt(language, `v_${vehicle.vehicle_type}`),
    vehicle.colour,
    vehicle.brand_model,
    vehicle.sticker_number === null
      ? null
      : pt(language, "v_sticker_line", vehicle.sticker_number),
  ]
    .filter((part): part is string => part !== null)
    .join(" · ");
}

export function VehiclesCard({
  customerId,
  language,
  active,
  api = defaultVehicleApi,
}: {
  customerId: string;
  language: Language;
  /** A deactivated Customer takes no new vehicle. */
  active: boolean;
  api?: VehicleApi;
}) {
  const [vehicles, setVehicles] = useState<Vehicle[] | null | undefined>(
    undefined,
  );
  const [canManage, setCanManage] = useState(false);
  const [dialog, setDialog] = useState<Vehicle | "new" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  const load = useCallback(() => {
    let current = true;
    api.list(customerId).then(
      (found) => {
        if (!current) return;
        setVehicles(found.items);
        setCanManage(found.can_manage);
      },
      () => {
        if (current) setVehicles(null);
      },
    );
    return () => {
      current = false;
    };
  }, [api, customerId]);

  useEffect(() => load(), [load]);

  return (
    <section aria-labelledby="customer-vehicles" className="ui-card">
      <div className="ui-hrow">
        <h2 id="customer-vehicles">{pt(language, "v_title")}</h2>
        {canManage && active && (
          <button
            className="ui-btn"
            onClick={() => {
              setNotice(null);
              setWarning(null);
              setDialog("new");
            }}
            type="button"
          >
            <Icon name="plus" />
            {pt(language, "v_add")}
          </button>
        )}
      </div>
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
      {vehicles === undefined ? (
        <p className="ui-small ui-muted" role="status">
          {pt(language, "v_loading")}
        </p>
      ) : vehicles === null ? (
        <p className="ui-small ui-muted">{pt(language, "v_failed")}</p>
      ) : vehicles.length === 0 ? (
        <p className="ui-small ui-muted">{pt(language, "v_none")}</p>
      ) : (
        <ul className="ui-apps" aria-label={pt(language, "v_title")}>
          {vehicles.map((vehicle) => (
            <li key={vehicle.vehicle_id}>
              <span>
                <b className="ui-num">{vehicle.plate_text}</b>
                <small>{details(language, vehicle)}</small>
              </span>
              <span className="ui-hrow">
                {vehicle.holds.length === 0 ? (
                  <Chip tone="neutral">{pt(language, "v_no_space")}</Chip>
                ) : (
                  vehicle.holds.map((hold) => (
                    <Chip icon="car" key={hold.hold_id} tone="ok">
                      {hold.lease_number === null
                        ? pt(language, "v_parks", hold.space_number)
                        : pt(
                            language,
                            "v_parks_lease",
                            hold.space_number,
                            hold.lease_number,
                          )}
                    </Chip>
                  ))
                )}
                {canManage && (
                  <button
                    aria-label={pt(
                      language,
                      "v_edit_plate",
                      vehicle.plate_text,
                    )}
                    className="ui-btn"
                    onClick={() => {
                      setNotice(null);
                      setWarning(null);
                      setDialog(vehicle);
                    }}
                    type="button"
                  >
                    {pt(language, "v_edit")}
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="ui-small ui-muted">{pt(language, "v_note")}</p>
      {dialog !== null && (
        <VehicleDialog
          api={api}
          customerId={customerId}
          language={language}
          onChanged={() => {
            setDialog(null);
            setWarning(pt(language, "v_r_CHANGED"));
            load();
          }}
          onClose={() => {
            setDialog(null);
          }}
          onSaved={(saved, added) => {
            setDialog(null);
            setNotice(
              pt(language, added ? "v_saved_new" : "v_saved", saved.plate_text),
            );
            load();
          }}
          vehicle={dialog === "new" ? null : dialog}
        />
      )}
    </section>
  );
}
