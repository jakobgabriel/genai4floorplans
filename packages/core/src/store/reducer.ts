import type { CostConfig, Flow, Model, NoGoZone, RatingWeights, Station } from "../model/types";
import { DEFAULT_SHIFT_HOURS } from "../model/types";
import { normalizeFlow, STATION_DEFAULTS } from "../model/defaults";
import { clampToGrid } from "../engine/geometry";
import { cellTemplate, type CellForm } from "../engine/templates";

export type ModelAction =
  | { type: "SET_MODEL"; model: Model }
  | { type: "SET_NAME"; name: string }
  | { type: "SET_GRID"; gridW: number; gridH: number }
  | { type: "SET_SHIFT_HOURS"; shiftHours: number }
  | { type: "SET_WEIGHTS"; weights: RatingWeights | undefined }
  | { type: "SET_COST_CONFIG"; patch: Partial<CostConfig> }
  | { type: "ADD_STATION"; station: Station }
  | { type: "UPDATE_STATION"; id: string; patch: Partial<Station> }
  | { type: "MOVE_STATION"; id: string; x: number; y: number }
  | { type: "RENAME_STATION"; oldId: string; newId: string }
  | { type: "DELETE_STATION"; id: string }
  | { type: "ADD_FLOW"; from: string; to: string }
  | { type: "UPDATE_FLOW"; from: string; to: string; patch: Partial<Flow> }
  | { type: "REMOVE_FLOW"; from: string; to: string }
  | { type: "ADD_NOGO"; zone: NoGoZone }
  | { type: "UPDATE_NOGO"; index: number; patch: Partial<NoGoZone> }
  | { type: "REMOVE_NOGO"; index: number }
  | { type: "APPLY_TEMPLATE"; form: CellForm }
  | { type: "ADOPT_STATIONS"; stations: Station[] };

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

    case "SET_COST_CONFIG":
      return { ...model, costConfig: { ...(model.costConfig ?? {}), ...action.patch } };

    case "ADD_STATION":
      return { ...model, stations: model.stations.concat([action.station]) };

    case "UPDATE_STATION":
      return {
        ...model,
        stations: model.stations.map((s) => (s.id === action.id ? { ...s, ...action.patch } : s)),
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

    case "APPLY_TEMPLATE": {
      const movable = model.stations.filter((s) => s.role === "process" && !s.fixed);
      const slots = cellTemplate(action.form, movable.length, model);
      let k = 0;
      return {
        ...model,
        stations: model.stations.map((s) => {
          if (s.role === "process" && !s.fixed) {
            const sl = slots[k++];
            if (sl) {
              const { x, y } = clampToGrid(s, sl.x, sl.y, model.gridW, model.gridH);
              return { ...s, x, y };
            }
          }
          return s;
        }),
      };
    }

    case "ADOPT_STATIONS":
      return { ...model, stations: action.stations.map((s) => ({ ...s })) };

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
