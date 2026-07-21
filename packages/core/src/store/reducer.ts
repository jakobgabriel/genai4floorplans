import type { CostConfig, CycleBreakdown, Demand, Flow, Group, Model, NoGoZone, RatingWeights, Station, VariantMode, WorkElement } from "../model/types";
import { DEFAULT_SHIFT_HOURS } from "../model/types";
import { normalizeFlow, STATION_DEFAULTS, syncCycleTime } from "../model/defaults";
import { clampToGrid } from "../engine/geometry";
import { applyForm, type CellForm } from "../engine/templates";
import { applyProposalItems, type ProposalItem } from "../engine/proposal";

export type ModelAction =
  | { type: "SET_MODEL"; model: Model }
  | { type: "SET_NAME"; name: string }
  | { type: "SET_GRID"; gridW: number; gridH: number }
  | { type: "SET_SHIFT_HOURS"; shiftHours: number }
  | { type: "SET_WEIGHTS"; weights: RatingWeights | undefined }
  | { type: "SET_LOSS_FACTOR"; lossFactor: number | undefined }
  | { type: "SET_DEMAND"; demand: Demand | undefined }
  | { type: "SET_COST_CONFIG"; patch: Partial<CostConfig> }
  | { type: "ADD_STATION"; station: Station }
  | { type: "UPDATE_STATION"; id: string; patch: Partial<Station> }
  /** Set or clear a station's cycle decomposition (undefined = back to opaque). */
  | { type: "SET_CYCLE_BREAKDOWN"; id: string; cycle: CycleBreakdown | undefined }
  /** Edit one component; seeds the breakdown from cycleTimeSec if absent. */
  | { type: "PATCH_CYCLE_BREAKDOWN"; id: string; patch: Partial<CycleBreakdown> }
  | { type: "MOVE_STATION"; id: string; x: number; y: number }
  | { type: "RENAME_STATION"; oldId: string; newId: string }
  | { type: "DELETE_STATION"; id: string }
  | { type: "ADD_FLOW"; from: string; to: string }
  | { type: "UPDATE_FLOW"; from: string; to: string; patch: Partial<Flow> }
  | { type: "REMOVE_FLOW"; from: string; to: string }
  | { type: "ADD_NOGO"; zone: NoGoZone }
  | { type: "UPDATE_NOGO"; index: number; patch: Partial<NoGoZone> }
  | { type: "REMOVE_NOGO"; index: number }
  | { type: "ADD_GROUP"; group: Group }
  | { type: "UPDATE_GROUP"; id: string; patch: Partial<Group> }
  | { type: "REMOVE_GROUP"; id: string }
  | { type: "APPLY_TEMPLATE"; form: CellForm }
  // ---- Workload (spec §11). The product-free input: what must be done, ----
  // ---- independent of what is made. `analyseWorkload` has consumed these ----
  // ---- since schema v8; until now nothing could write them. ----
  /** Replace the whole set in one commit — one undo step for "derive from stations". */
  | { type: "SET_WORK_ELEMENTS"; elements: WorkElement[] }
  | { type: "ADD_WORK_ELEMENT"; element: WorkElement }
  | { type: "UPDATE_WORK_ELEMENT"; id: string; patch: Partial<WorkElement> }
  | { type: "DELETE_WORK_ELEMENT"; id: string }
  | { type: "ADD_VARIANT_MODE"; mode: VariantMode }
  | { type: "UPDATE_VARIANT_MODE"; id: string; patch: Partial<VariantMode> }
  | { type: "DELETE_VARIANT_MODE"; id: string }
  /**
   * Accept some or all items of a solver proposal (spec §4). Replaces the old
   * ADOPT_STATIONS, which took a finished station array and overwrote the
   * user's placements wholesale.
   */
  | { type: "ACCEPT_PROPOSAL"; items: ProposalItem[]; itemIds: string[] }
  /**
   * Insert a grouped/subflow element (node-RED subflow): its member stations and
   * internal flows are re-id'd, offset to the drop point and appended. Nothing
   * existing is touched, and ids never collide because each member gets a fresh
   * id. `stations` carry positions normalised to the group's own (0,0) corner.
   */
  | { type: "INSERT_SUBFLOW"; stations: Station[]; flows: Flow[]; x: number; y: number };

function clampStations(model: Model): Station[] {
  return model.stations.map((s) => {
    const { x, y } = clampToGrid(s, s.x, s.y, model.gridW, model.gridH);
    return x === s.x && y === s.y ? s : { ...s, x, y };
  });
}

// Pure model reducer. History (undo/redo) is layered on top in store/history.ts.
export function modelReducer(model: Model, action: ModelAction): Model {
  switch (action.type) {
    case "SET_MODEL":
      return action.model;

    case "SET_NAME":
      return { ...model, name: action.name };

    case "SET_GRID": {
      const gridW = Math.max(4, Math.min(80, Math.round(action.gridW)));
      const gridH = Math.max(4, Math.min(80, Math.round(action.gridH)));
      const next = { ...model, gridW, gridH };
      return { ...next, stations: clampStations(next) };
    }

    case "SET_SHIFT_HOURS":
      return { ...model, shiftHours: Math.max(0.5, action.shiftHours || DEFAULT_SHIFT_HOURS) };

    case "SET_WEIGHTS":
      return { ...model, weights: action.weights };

    case "SET_LOSS_FACTOR":
      return { ...model, lossFactor: action.lossFactor };

    case "SET_DEMAND":
      return { ...model, demand: action.demand };

    case "SET_COST_CONFIG":
      return { ...model, costConfig: { ...(model.costConfig ?? {}), ...action.patch } };

    case "ADD_STATION":
      return { ...model, stations: model.stations.concat([action.station]) };

    case "UPDATE_STATION":
      return {
        ...model,
        // syncCycleTime keeps cycleTimeSec equal to the breakdown's sum whenever
        // a decomposition is present, so the two can never drift apart.
        stations: model.stations.map((s) => (s.id === action.id ? syncCycleTime({ ...s, ...action.patch }) : s)),
      };

    case "SET_CYCLE_BREAKDOWN":
      return {
        ...model,
        stations: model.stations.map((s) =>
          s.id === action.id
            ? syncCycleTime({ ...s, cycle: action.cycle ? { ...action.cycle } : undefined })
            : s,
        ),
      };

    case "PATCH_CYCLE_BREAKDOWN":
      return {
        ...model,
        stations: model.stations.map((s) => {
          if (s.id !== action.id) return s;
          const base = s.cycle ?? { valueAddSec: s.cycleTimeSec, handlingSec: 0, walkSec: 0, waitSec: 0, setupSec: 0 };
          return syncCycleTime({ ...s, cycle: { ...base, ...action.patch } });
        }),
      };

    case "MOVE_STATION": {
      const s = model.stations.find((x) => x.id === action.id);
      if (!s) return model;
      const { x, y } = clampToGrid(s, action.x, action.y, model.gridW, model.gridH);
      return {
        ...model,
        stations: model.stations.map((st) => (st.id === action.id ? { ...st, x, y } : st)),
      };
    }

    case "RENAME_STATION": {
      const newId = action.newId.trim();
      if (!newId || newId === action.oldId) return model;
      if (model.stations.some((s) => s.id === newId)) return model; // collision — ignore
      return {
        ...model,
        stations: model.stations.map((s) => (s.id === action.oldId ? { ...s, id: newId } : s)),
        flows: model.flows.map((f) => ({
          ...f,
          from: f.from === action.oldId ? newId : f.from,
          to: f.to === action.oldId ? newId : f.to,
        })),
      };
    }

    case "DELETE_STATION":
      return {
        ...model,
        stations: model.stations.filter((s) => s.id !== action.id),
        flows: model.flows.filter((f) => f.from !== action.id && f.to !== action.id),
      };

    case "ADD_FLOW": {
      if (action.from === action.to) return model;
      const flows = model.flows
        .filter((f) => !(f.from === action.from && f.to === action.to))
        .concat([normalizeFlow({ from: action.from, to: action.to })]);
      return { ...model, flows };
    }

    case "UPDATE_FLOW":
      return {
        ...model,
        flows: model.flows.map((f) =>
          f.from === action.from && f.to === action.to ? { ...f, ...action.patch } : f,
        ),
      };

    case "REMOVE_FLOW":
      return {
        ...model,
        flows: model.flows.filter((f) => !(f.from === action.from && f.to === action.to)),
      };

    case "ADD_NOGO":
      return { ...model, noGoZones: model.noGoZones.concat([action.zone]) };

    case "UPDATE_NOGO":
      return {
        ...model,
        noGoZones: model.noGoZones.map((z, i) => (i === action.index ? { ...z, ...action.patch } : z)),
      };

    case "REMOVE_NOGO":
      return { ...model, noGoZones: model.noGoZones.filter((_, i) => i !== action.index) };

    case "ADD_GROUP":
      return { ...model, groups: (model.groups ?? []).concat([action.group]) };

    case "UPDATE_GROUP":
      return {
        ...model,
        groups: (model.groups ?? []).map((g) => (g.id === action.id ? { ...g, ...action.patch } : g)),
      };

    case "REMOVE_GROUP":
      return { ...model, groups: (model.groups ?? []).filter((g) => g.id !== action.id) };

    case "APPLY_TEMPLATE":
      // Movable I/O reshape with the form (see applyForm); pinned areas stay put.
      return { ...model, stations: applyForm(model, action.form) };

    // Spec §4 — the only path from a solver result into the model. Accepting a
    // subset is the point: `itemIds` is what the user ticked, never "all of it
    // because the solver said so". Pinned stations are filtered in
    // applyProposalItems, not here.
    case "ACCEPT_PROPOSAL":
      return { ...model, stations: applyProposalItems(model, action.items, action.itemIds) };

    case "INSERT_SUBFLOW": {
      const idMap: Record<string, string> = {};
      // Thread a growing model so newStationId never re-issues an id within the batch.
      let acc: Model = model;
      const added: Station[] = [];
      action.stations.forEach((s) => {
        const id = newStationId(acc, "sub");
        idMap[s.id] = id;
        const { x, y } = clampToGrid(s, s.x + action.x, s.y + action.y, model.gridW, model.gridH);
        const ns: Station = { ...s, id, x, y };
        added.push(ns);
        acc = { ...acc, stations: acc.stations.concat([ns]) };
      });
      const newFlows = action.flows
        .filter((f) => idMap[f.from] && idMap[f.to])
        .map((f) => normalizeFlow({ ...f, from: idMap[f.from], to: idMap[f.to] }));
      return { ...model, stations: model.stations.concat(added), flows: model.flows.concat(newFlows) };
    }

    case "SET_WORK_ELEMENTS":
      return { ...model, workElements: action.elements };

    case "ADD_WORK_ELEMENT":
      return { ...model, workElements: [...(model.workElements ?? []), action.element] };

    case "UPDATE_WORK_ELEMENT":
      return {
        ...model,
        workElements: (model.workElements ?? []).map((e) => (e.id === action.id ? { ...e, ...action.patch } : e)),
      };

    // Deleting an element must delete every reference to it too. A dangling
    // predecessor makes precedenceOrder return null (read as "cycle") and a
    // dangling zoning constraint silently over-constrains the balancer — both
    // present as the balancer being broken rather than the model being stale.
    case "DELETE_WORK_ELEMENT": {
      const drop = (ids: string[] | undefined) => (ids ? ids.filter((x) => x !== action.id) : ids);
      return {
        ...model,
        workElements: (model.workElements ?? [])
          .filter((e) => e.id !== action.id)
          .map((e) => ({
            ...e,
            predecessors: e.predecessors.filter((p) => p !== action.id),
            mustBeSameStationAs: drop(e.mustBeSameStationAs),
            mustNotBeSameStationAs: drop(e.mustNotBeSameStationAs),
          })),
        variantModes: model.variantModes?.map((m) => {
          if (!(action.id in m.elementOverrides)) return m;
          const { [action.id]: _gone, ...rest } = m.elementOverrides;
          return { ...m, elementOverrides: rest };
        }),
      };
    }

    case "ADD_VARIANT_MODE":
      return { ...model, variantModes: [...(model.variantModes ?? []), action.mode] };

    case "UPDATE_VARIANT_MODE":
      return {
        ...model,
        variantModes: (model.variantModes ?? []).map((m) => (m.id === action.id ? { ...m, ...action.patch } : m)),
      };

    case "DELETE_VARIANT_MODE":
      return { ...model, variantModes: (model.variantModes ?? []).filter((m) => m.id !== action.id) };

    default:
      return model;
  }
}

let counter = 0;

/** A fresh station id that is unique within the model. */
export function newStationId(model: Model, base = "step"): string {
  let id: string;
  do {
    counter++;
    id = base + (model.stations.length + 1) + "_" + counter.toString(36);
  } while (model.stations.some((s) => s.id === id));
  return id;
}

export function makeStation(model: Model): Station {
  return {
    ...STATION_DEFAULTS,
    id: newStationId(model),
    x: Math.floor(model.gridW / 2 - 1),
    y: Math.floor(model.gridH / 2 - 1),
  };
}

/** Clone a station with a new id, nudged one cell down-right (clamped). */
export function cloneStation(model: Model, src: Station): Station {
  const { x, y } = clampToGrid(src, src.x + 1, src.y + 1, model.gridW, model.gridH);
  return { ...src, id: newStationId(model, "copy"), name: src.name + " (copy)", x, y };
}
