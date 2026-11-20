// DL-250 (More buildings step 2, mock-up board 1): Settings › Unit setup › Buildings, the first
// list of the tab. Every Unit is in a building; the owner can add a second building later. A
// building with Units cannot be removed, and the only building always stays.

import {
  type FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  type Building,
  type BuildingApi,
  BuildingChangedError,
  BuildingInvalidError,
  BuildingRefusedError,
  type BuildingSource,
  activeBuildings,
  buildingName,
} from "../buildingClient";
import { Icon } from "../shell/icons";
import { Dialog } from "../shell/ui";
import type { Language } from "../signInText";
import { sst } from "./text";

export type BuildingsSetupApi = Pick<
  BuildingApi,
  "list" | "create" | "update" | "remove"
>;

function BuildingDialog({
  language,
  building,
  others,
  busy,
  problem,
  onClose,
  onSave,
}: {
  language: Language;
  building: Building | null;
  others: Building[];
  busy: boolean;
  problem: string | null;
  onClose: () => void;
  onSave: (source: BuildingSource) => void;
}) {
  const [english, setEnglish] = useState(building?.name_en ?? "");
  const [khmer, setKhmer] = useState(building?.name_km ?? "");
  const [address, setAddress] = useState(building?.address_text ?? "");
  const [description, setDescription] = useState(building?.description ?? "");
  const [shortStays, setShortStays] = useState(
    building?.takes_short_stays ?? false,
  );
  const [error, setError] = useState<string | null>(null);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = english.trim();
    if (name === "") {
      setError(sst(language, "se_e_name"));
      return;
    }
    if (
      others.some(
        (other) =>
          other.building_id !== building?.building_id &&
          other.name_en.trim().toLowerCase() === name.toLowerCase(),
      )
    ) {
      setError(sst(language, "bl_taken"));
      return;
    }
    onSave({
      name_en: name,
      name_km: khmer.trim() || null,
      address_text: address.trim() || null,
      description: description.trim() || null,
      takes_short_stays: shortStays,
    });
  }

  return (
    <Dialog
      busy={busy}
      closeLabel={sst(language, "cancel")}
      onClose={onClose}
      onSubmit={submit}
      submitLabel={sst(language, "save")}
      title={`${sst(language, building === null ? "cf_add" : "cf_edit")} · ${
        building === null
          ? sst(language, "bl_one")
          : buildingName(language, building)
      }`}
    >
      <div className="ui-row2">
        <div className="ui-field">
          <label htmlFor="bl-en">
            {sst(language, "cf_en")}
            <span className="req">{sst(language, "required")}</span>
          </label>
          <input
            aria-describedby={error === null ? undefined : "bl-error"}
            aria-invalid={error !== null}
            autoComplete="off"
            id="bl-en"
            maxLength={100}
            onChange={(event) => {
              setEnglish(event.currentTarget.value);
              setError(null);
            }}
            value={english}
          />
        </div>
        <div className="ui-field">
          <label htmlFor="bl-km">{sst(language, "cf_kh")}</label>
          <input
            autoComplete="off"
            id="bl-km"
            lang="km"
            maxLength={100}
            onChange={(event) => {
              setKhmer(event.currentTarget.value);
            }}
            value={khmer}
          />
        </div>
      </div>
      {error !== null && (
        <p className="ui-error" id="bl-error" role="alert">
          <Icon name="alert" small />
          <span>{error}</span>
        </p>
      )}
      <div className="ui-field">
        <label htmlFor="bl-address">{sst(language, "address")}</label>
        <textarea
          id="bl-address"
          maxLength={2000}
          onChange={(event) => {
            setAddress(event.currentTarget.value);
          }}
          rows={3}
          value={address}
        />
      </div>
      <div className="ui-field">
        <label htmlFor="bl-desc">{sst(language, "se20_desc")}</label>
        <textarea
          id="bl-desc"
          maxLength={500}
          onChange={(event) => {
            setDescription(event.currentTarget.value);
          }}
          rows={2}
          value={description}
        />
      </div>
      <label className="ui-chk">
        <input
          checked={shortStays}
          id="bl-short"
          onChange={(event) => {
            setShortStays(event.currentTarget.checked);
          }}
          type="checkbox"
        />
        <span>{sst(language, "bl_short_on")}</span>
      </label>
      {problem !== null && (
        <div className="ui-notice warn" role="alert">
          <Icon name="alert" />
          <p>{problem}</p>
        </div>
      )}
    </Dialog>
  );
}

export function BuildingsCard({
  language,
  propertyId,
  api,
}: {
  language: Language;
  propertyId: string;
  api: BuildingsSetupApi;
}) {
  const [items, setItems] = useState<Building[] | null>(null);
  const [manage, setManage] = useState(false);
  const [failed, setFailed] = useState(false);
  const [editing, setEditing] = useState<{ building: Building | null } | null>(
    null,
  );
  const [removing, setRemoving] = useState<Building | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(
    null,
  );
  const shownProperty = useRef(propertyId);
  const sequence = useRef(0);

  const load = useCallback(() => {
    if (propertyId === "") return;
    const operation = ++sequence.current;
    setFailed(false);
    api
      .list(propertyId)
      .then((found) => {
        if (operation !== sequence.current) return;
        setItems(activeBuildings(found.items));
        setManage(found.can_manage);
      })
      .catch(() => {
        if (operation !== sequence.current) return;
        setItems(null);
        setFailed(true);
      });
  }, [api, propertyId]);

  useEffect(() => {
    shownProperty.current = propertyId;
    setItems(null);
    setEditing(null);
    setRemoving(null);
    setToast(null);
    load();
  }, [load, propertyId]);

  function run(work: () => Promise<unknown>, done: string, removal: boolean) {
    const asked = propertyId;
    setBusy(true);
    setProblem(null);
    work()
      .then(() => {
        if (shownProperty.current !== asked) return;
        setEditing(null);
        setRemoving(null);
        setToast({ ok: true, text: done });
        load();
      })
      .catch((error: unknown) => {
        if (shownProperty.current !== asked) return;
        if (error instanceof BuildingChangedError) {
          // The open form holds the old version, so it closes; the buildings are read again.
          setEditing(null);
          setRemoving(null);
          setToast({ ok: false, text: sst(language, "bl_changed") });
          load();
        } else if (error instanceof BuildingRefusedError) {
          setProblem(sst(language, removal ? "bl_has_units" : "bl_taken"));
        } else if (error instanceof BuildingInvalidError) {
          setProblem(sst(language, "bl_invalid"));
        } else {
          setProblem(sst(language, "unknown"));
          load();
        }
      })
      .finally(() => {
        setBusy(false);
      });
  }

  if (failed) {
    return (
      <div className="ui-notice warn" role="status">
        <Icon name="alert" />
        <p>{sst(language, "bl_failed")}</p>
        <button className="ui-btn" onClick={load} type="button">
          {sst(language, "retry")}
        </button>
      </div>
    );
  }
  if (items === null) {
    return (
      <p className="ui-muted" role="status">
        {sst(language, "bl_loading")}
      </p>
    );
  }

  return (
    <>
      <div aria-live="polite" role="status">
        {toast !== null && (
          <div className={toast.ok ? "ui-notice ok" : "ui-notice warn"}>
            <Icon name={toast.ok ? "check" : "alert"} />
            <p>{toast.text}</p>
          </div>
        )}
      </div>
      {!manage && (
        <div className="ui-notice info" role="note">
          <Icon name="lock" />
          <p>{sst(language, "bl_read_only")}</p>
        </div>
      )}
      <section aria-labelledby="setup-BUILDING" className="ui-card pad0">
        <header className="ui-chead pad">
          <div>
            <h2 id="setup-BUILDING">{sst(language, "bl_tab")}</h2>
            <p className="ui-small ui-muted">{sst(language, "bl_sub")}</p>
          </div>
          {manage && (
            <button
              aria-label={`${sst(language, "cf_add")}: ${sst(language, "bl_one")}`}
              className="ui-btn"
              onClick={() => {
                setProblem(null);
                setToast(null);
                setEditing({ building: null });
              }}
              type="button"
            >
              <Icon name="plus" small />
              {sst(language, "cf_add")}
            </button>
          )}
        </header>
        <div className="ui-tablewrap">
          <table className="ui-table">
            <thead>
              <tr>
                <th scope="col">{sst(language, "uf20_name")}</th>
                <th scope="col">{sst(language, "uf20_khmer")}</th>
                <th scope="col">{sst(language, "address")}</th>
                <th scope="col">{sst(language, "bl_short")}</th>
                <th className="num" scope="col">
                  {sst(language, "uf20_used")}
                </th>
                {manage && (
                  <th scope="col">
                    <span className="ui-sr">{sst(language, "cf_edit")}</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {items.map((building) => {
                const name = building.name_en;
                const removable = items.length > 1 && building.unit_count === 0;
                return (
                  <tr key={building.building_id}>
                    <td>{name}</td>
                    <td lang="km">{building.name_km ?? ""}</td>
                    <td>
                      {building.address_text ?? (
                        <span className="ui-muted">
                          {sst(language, "no_address")}
                        </span>
                      )}
                    </td>
                    <td>
                      {sst(language, building.takes_short_stays ? "yes" : "no")}
                    </td>
                    <td className="ui-num num">{building.unit_count}</td>
                    {manage && (
                      <td>
                        <span className="ui-actions">
                          <button
                            aria-label={`${sst(language, "cf_edit")}: ${name}`}
                            className="ui-btn link"
                            onClick={() => {
                              setProblem(null);
                              setToast(null);
                              setEditing({ building });
                            }}
                            type="button"
                          >
                            {sst(language, "cf_edit")}
                          </button>
                          {removable && (
                            <button
                              aria-label={`${sst(language, "set_remove")}: ${name}`}
                              className="ui-btn link"
                              onClick={() => {
                                setProblem(null);
                                setToast(null);
                                setRemoving(building);
                              }}
                              type="button"
                            >
                              {sst(language, "set_remove")}
                            </button>
                          )}
                        </span>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="ui-small ui-muted pad">{sst(language, "bl_note")}</p>
      </section>

      {editing !== null && (
        <BuildingDialog
          building={editing.building}
          busy={busy}
          language={language}
          onClose={() => {
            if (!busy) setEditing(null);
          }}
          onSave={(source) => {
            const current = editing.building;
            run(
              () =>
                current === null
                  ? api.create(propertyId, source)
                  : api.update(current, source),
              sst(language, "cf_saved"),
              false,
            );
          }}
          others={items}
          problem={problem}
        />
      )}
      {removing !== null && (
        <Dialog
          actions={
            <button
              className="ui-btn danger"
              disabled={busy}
              onClick={() => {
                run(
                  () => api.remove(removing),
                  sst(
                    language,
                    "set_removed",
                    buildingName(language, removing),
                  ),
                  true,
                );
              }}
              type="button"
            >
              {sst(language, "set_remove")}
            </button>
          }
          busy={busy}
          closeLabel={sst(language, "cancel")}
          onClose={() => {
            if (!busy) setRemoving(null);
          }}
          title={`${sst(language, "set_remove")} · ${buildingName(language, removing)}`}
        >
          <p>
            {sst(language, "set_remove_q", buildingName(language, removing))}
          </p>
          {problem !== null && (
            <div className="ui-notice warn" role="alert">
              <Icon name="alert" />
              <p>{problem}</p>
            </div>
          )}
        </Dialog>
      )}
    </>
  );
}
