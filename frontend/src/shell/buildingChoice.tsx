// DL-250 (More buildings step 3, mock-up board 2): ONE Building switch at the top of the side
// menu. It shows only with two or more buildings; the lists (Units, Leases, Invoices, Utilities,
// Move-outs) follow the chosen building. The choice is kept on the device. With one building
// nothing is read and every list stays as it was.

import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  type Building,
  type BuildingApi,
  activeBuildings,
  buildingName,
} from "../buildingClient";
import type { Language } from "../signInText";
import type { UnitApi } from "../unitClient";

/** The device key of the chosen building (the same style as the menu keys). */
export const BUILDING_KEY = "prm.building";

export interface BuildingChoice {
  /** The buildings not removed; the switch shows only with two or more. */
  buildings: Building[];
  /** The chosen building, or null for All buildings (and always null with one building). */
  chosen: Building | null;
  choose: (buildingId: string | null) => void;
  /** True when a record of this Unit shows under the chosen building. */
  showsUnit: (unitId: string | null | undefined) => boolean;
  /** The building of a Unit, when two or more buildings exist and it is known. */
  buildingOfUnit: (unitId: string | null | undefined) => Building | null;
}

const ALL: BuildingChoice = {
  buildings: [],
  chosen: null,
  choose: () => undefined,
  showsUnit: () => true,
  buildingOfUnit: () => null,
};

const Context = createContext<BuildingChoice>(ALL);

/** The building choice; outside a provider every record shows (one building). */
export function useBuildingChoice(): BuildingChoice {
  return useContext(Context);
}

function readSaved(): string | null {
  try {
    return window.localStorage.getItem(BUILDING_KEY);
  } catch {
    return null;
  }
}

function save(buildingId: string | null) {
  try {
    if (buildingId === null) window.localStorage.removeItem(BUILDING_KEY);
    else window.localStorage.setItem(BUILDING_KEY, buildingId);
  } catch {
    // The device keeps nothing; the choice lasts until the page is reloaded.
  }
}

export function BuildingChoiceProvider({
  propertyId,
  buildingApi,
  unitApi,
  refreshKey,
  children,
}: {
  propertyId: string;
  buildingApi: Pick<BuildingApi, "list">;
  unitApi: Pick<UnitApi, "list">;
  /** The buildings are read again when this changes (the open page). */
  refreshKey: string;
  children: ReactNode;
}) {
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [unitBuilding, setUnitBuilding] = useState<ReadonlyMap<
    string,
    string
  > | null>(null);
  const [chosenId, setChosenId] = useState<string | null>(readSaved);
  const sequence = useRef(0);

  useEffect(() => {
    if (propertyId === "") return;
    const operation = ++sequence.current;
    void (async () => {
      let found: Building[];
      try {
        found = activeBuildings((await buildingApi.list(propertyId)).items);
      } catch {
        // Not readable (no right, or the server is away): every record shows.
        found = [];
      }
      if (operation !== sequence.current) return;
      setBuildings(found);
      if (found.length < 2) {
        setUnitBuilding(null);
        return;
      }
      try {
        const map = new Map<string, string>();
        let cursor: string | undefined;
        for (let page = 0; page < 100; page++) {
          const read = await unitApi.list(
            propertyId,
            cursor === undefined ? {} : { cursor },
          );
          for (const unit of read.items) {
            if (unit.building_id != null)
              map.set(unit.unit_id, unit.building_id);
          }
          if (read.next_cursor === null) break;
          cursor = read.next_cursor;
        }
        if (operation === sequence.current) setUnitBuilding(map);
      } catch {
        if (operation === sequence.current) setUnitBuilding(null);
      }
    })();
  }, [buildingApi, propertyId, refreshKey, unitApi]);

  const choose = useCallback((buildingId: string | null) => {
    setChosenId(buildingId);
    save(buildingId);
  }, []);

  const value = useMemo<BuildingChoice>(() => {
    if (buildings.length < 2) return ALL;
    // A building removed, or one from another device, falls back to All buildings.
    const chosen =
      buildings.find((item) => item.building_id === chosenId) ?? null;
    const byId = new Map(buildings.map((item) => [item.building_id, item]));
    const buildingOfUnit = (unitId: string | null | undefined) => {
      if (unitId == null || unitBuilding === null) return null;
      const id = unitBuilding.get(unitId);
      return id === undefined ? null : (byId.get(id) ?? null);
    };
    return {
      buildings,
      chosen,
      choose,
      buildingOfUnit,
      showsUnit: (unitId) => {
        if (chosen === null) return true;
        // Until the Units are read, or for a record with no Unit, nothing is hidden.
        if (unitId == null || unitBuilding === null) return true;
        const id = unitBuilding.get(unitId);
        return id === undefined || id === chosen.building_id;
      },
    };
  }, [buildings, chosenId, choose, unitBuilding]);

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

const TEXT = {
  label: ["Building", "អគារ"],
  all: ["All buildings", "អគារទាំងអស់"],
} as const;

/** The switch at the top of the side menu; nothing with one building. */
export function BuildingSwitch({ language }: { language: Language }) {
  const { buildings, chosen, choose } = useBuildingChoice();
  if (buildings.length < 2) return null;
  const word = (key: keyof typeof TEXT) => TEXT[key][language === "km" ? 1 : 0];
  return (
    <label className="shell-building">
      <span className="ui-sr">{word("label")}</span>
      <select
        aria-label={word("label")}
        onChange={(event) => {
          const next = event.currentTarget.value;
          choose(next === "" ? null : next);
        }}
        value={chosen?.building_id ?? ""}
      >
        <option value="">{word("all")}</option>
        {buildings.map((item) => (
          <option key={item.building_id} value={item.building_id}>
            {buildingName(language, item)}
          </option>
        ))}
      </select>
    </label>
  );
}

/** The words of the Building column, shown on lists only when All buildings is chosen. */
export function buildingColumnName(language: Language): string {
  return TEXT.label[language === "km" ? 1 : 0];
}
