import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import type { Model } from "../model/types";
import type { ModelAction } from "./reducer";
import { historyReducer, initHistory } from "./history";
import { buildRating } from "../engine/rating";
import { validateFlow } from "../engine/validate";
import { chainRating } from "../engine/automation";
import { loadAutosave, saveAutosave } from "./scenarios";
import { SAMPLE } from "../model/sample";

export interface FlowPlanApi {
  model: Model;
  canUndo: boolean;
  canRedo: boolean;
  rating: ReturnType<typeof buildRating>;
  validation: ReturnType<typeof validateFlow>;
  chain: ReturnType<typeof chainRating>;
  /** One undo entry per call — for discrete actions (add, delete, flow edits). */
  commit: (action: ModelAction) => void;
  /** No history entry — for drags / typing after a checkpoint. */
  live: (action: ModelAction) => void;
  /** Push the current state once at the start of a live interaction. */
  checkpoint: () => void;
  /** Replace the whole model and clear history (import / scenario load / reset). */
  reset: (model: Model) => void;
  undo: () => void;
  redo: () => void;
}

/** Initial model: last autosave if present, otherwise the demo sample. */
function initialModel(): Model {
  return loadAutosave() ?? SAMPLE;
}

export function useFlowPlan(): FlowPlanApi {
  const [state, dispatch] = useReducer(historyReducer, undefined, () => initHistory(initialModel()));
  const model = state.present;

  // Debounced autosave of the working model.
  const saveTimer = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => saveAutosave(model), 400);
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
  }, [model]);

  const rating = useMemo(() => buildRating(model), [model]);
  const validation = useMemo(() => validateFlow(model.stations, model.flows), [model]);
  const chain = useMemo(() => chainRating(model.stations, model.flows), [model]);

  const commit = useCallback((action: ModelAction) => dispatch({ kind: "commit", action }), []);
  const live = useCallback((action: ModelAction) => dispatch({ kind: "live", action }), []);
  const checkpoint = useCallback(() => dispatch({ kind: "checkpoint" }), []);
  const reset = useCallback((m: Model) => dispatch({ kind: "reset", model: m }), []);
  const undo = useCallback(() => dispatch({ kind: "undo" }), []);
  const redo = useCallback(() => dispatch({ kind: "redo" }), []);

  return {
    model,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    rating,
    validation,
    chain,
    commit,
    live,
    checkpoint,
    reset,
    undo,
    redo,
  };
}
