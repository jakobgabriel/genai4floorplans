import type { Model } from "@flowplan/core/model/types";
import { modelReducer, type ModelAction } from "@flowplan/core/store/reducer";

// Generic undo/redo history wrapped around the model reducer.
//
// To keep the undo stack user-friendly we separate "commit" actions (each
// creates one undo entry) from "live" actions (drags, keystrokes) that replace
// the present without flooding history. A CHECKPOINT pushes the current present
// onto the past once at the start of a live interaction.

export interface HistoryState {
  past: Model[];
  present: Model;
  future: Model[];
}

const LIMIT = 100;

export type HistoryAction =
  | { kind: "commit"; action: ModelAction }
  | { kind: "live"; action: ModelAction }
  | { kind: "checkpoint" }
  | { kind: "reset"; model: Model } // replace everything, clear history (import/scenario)
  | { kind: "undo" }
  | { kind: "redo" };

export function initHistory(model: Model): HistoryState {
  return { past: [], present: model, future: [] };
}

export function historyReducer(state: HistoryState, ha: HistoryAction): HistoryState {
  switch (ha.kind) {
    case "reset":
      return { past: [], present: ha.model, future: [] };

    case "commit": {
      const present = modelReducer(state.present, ha.action);
      if (present === state.present) return state;
      const past = state.past.concat([state.present]).slice(-LIMIT);
      return { past, present, future: [] };
    }

    case "live": {
      const present = modelReducer(state.present, ha.action);
      if (present === state.present) return state;
      return { ...state, present, future: [] };
    }

    case "checkpoint": {
      const past = state.past.concat([state.present]).slice(-LIMIT);
      return { ...state, past, future: [] };
    }

    case "undo": {
      if (state.past.length === 0) return state;
      const present = state.past[state.past.length - 1];
      return {
        past: state.past.slice(0, -1),
        present,
        future: [state.present].concat(state.future),
      };
    }

    case "redo": {
      if (state.future.length === 0) return state;
      const present = state.future[0];
      return {
        past: state.past.concat([state.present]),
        present,
        future: state.future.slice(1),
      };
    }

    default:
      return state;
  }
}
