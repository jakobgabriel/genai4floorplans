import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { Model } from "@flowplan/core/model/types";
import type { ModelAction } from "@flowplan/core/store/reducer";
import { historyReducer, initHistory } from "./history";
import { buildRating } from "@flowplan/core/engine/rating";
import { validateFlow } from "@flowplan/core/engine/validate";
import { chainRating } from "@flowplan/core/engine/automation";
import { blankModel } from "@flowplan/core/model/sample";
import {
  loadWorkspace,
  makeCell,
  makeConcept,
  makeFolder,
  isDescendant,
  subtreeFolderIds,
  saveWorkspace,
  type Cell,
  type Concept,
  type Folder,
  type Workspace,
} from "./workspace";

export interface CellRef {
  id: string;
  name: string;
  folderId: string | null;
  conceptId: string | null;
}

export interface FlowPlanApi {
  model: Model;
  canUndo: boolean;
  canRedo: boolean;
  rating: ReturnType<typeof buildRating>;
  validation: ReturnType<typeof validateFlow>;
  chain: ReturnType<typeof chainRating>;
  commit: (action: ModelAction) => void;
  live: (action: ModelAction) => void;
  checkpoint: () => void;
  reset: (model: Model) => void;
  undo: () => void;
  redo: () => void;
  // ---- layouts (Cells) within concepts ----
  cells: CellRef[];
  activeId: string;
  /** The concept the active layout belongs to. */
  activeConceptId: string | null;
  switchCell: (id: string) => void;
  /** Add a layout to a concept (defaults to the active concept). */
  addCell: (model?: Model, name?: string, conceptId?: string | null) => void;
  duplicateCell: () => void;
  renameCell: (id: string, name: string) => void;
  deleteCell: (id: string) => void;
  /** Move a layout into another concept. */
  moveCell: (id: string, conceptId: string | null) => void;
  /** All (non-archived) cells with the active one's live model — for the site rollup. */
  snapshotCells: () => Cell[];
  // ---- concepts (the workspace item: a concept holds several layouts) ----
  concepts: Concept[];
  /** Create a concept in a folder, with an initial layout, and open it. */
  createConcept: (name: string, folderId?: string | null, model?: Model) => string;
  renameConcept: (id: string, name: string) => void;
  /** Move a concept (and its layouts) into another folder. */
  moveConcept: (id: string, folderId: string | null) => void;
  // ---- folders (arbitrarily nested) ----
  folders: Folder[];
  createFolder: (name: string, parentId?: string | null) => void;
  renameFolder: (id: string, name: string) => void;
  /** Move a folder under a new parent; ignored if it would create a cycle. */
  moveFolder: (id: string, parentId: string | null) => void;
  // ---- archive (soft delete, recoverable) ----
  /** Archive a layout (hidden from the tree, recoverable). */
  archiveCell: (id: string) => void;
  /** Archive a concept AND its layouts. */
  archiveConcept: (id: string) => void;
  /** Archive a folder AND all its contents (sub-folders + concepts + layouts). */
  archiveFolder: (id: string) => void;
  restoreCell: (id: string) => void;
  restoreConcept: (id: string) => void;
  restoreFolder: (id: string) => void;
  /** Permanently delete an archived layout. */
  purgeCell: (id: string) => void;
  /** Permanently delete an archived concept and its layouts. */
  purgeConcept: (id: string) => void;
  /** Permanently delete an archived folder and its contents. */
  purgeFolder: (id: string) => void;
  archivedCells: CellRef[];
  archivedConcepts: Concept[];
  archivedFolders: Folder[];
}

export function useFlowPlan(): FlowPlanApi {
  const [ws, setWs] = useState<Workspace>(() => loadWorkspace());
  const activeCell =
    ws.cells.find((c) => c.id === ws.activeId && !c.archived) ?? ws.cells.find((c) => !c.archived) ?? ws.cells[0];
  const [state, dispatch] = useReducer(historyReducer, undefined, () => initHistory(activeCell.model));
  const model = state.present;

  // Persist the active cell's model into the workspace (debounced).
  const saveTimer = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      setWs((prev) => {
        const cells = prev.cells.map((c) => (c.id === prev.activeId ? { ...c, name: model.name || c.name, model } : c));
        const next = { ...prev, cells };
        saveWorkspace(next);
        return next;
      });
    }, 400);
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

  // Snapshot the current active model back into the cell list.
  const persistActive = useCallback(
    (prev: Workspace): Cell[] => prev.cells.map((c) => (c.id === prev.activeId ? { ...c, model } : c)),
    [model],
  );

  const activeConceptId = ws.cells.find((c) => c.id === ws.activeId)?.conceptId ?? null;

  const switchCell = useCallback(
    (id: string) => {
      if (id === ws.activeId) return;
      const cells = persistActive(ws);
      const target = cells.find((c) => c.id === id);
      if (!target) return;
      const next: Workspace = { ...ws, cells, activeId: id };
      setWs(next);
      saveWorkspace(next);
      dispatch({ kind: "reset", model: target.model });
    },
    [ws, persistActive],
  );

  // Add a layout to a concept (defaults to the active concept). The layout
  // inherits the concept's folder so folder rollups stay consistent.
  const addCell = useCallback(
    (m?: Model, name?: string, conceptId: string | null = null) => {
      const cid = conceptId ?? activeConceptId;
      const concept = ws.concepts.find((c) => c.id === cid) ?? null;
      const count = ws.cells.filter((c) => c.conceptId === cid).length;
      const cell = makeCell(name ?? "Layout " + (count + 1), m ?? blankModel(), concept?.folderId ?? null, cid);
      const next: Workspace = { ...ws, cells: persistActive(ws).concat([cell]), activeId: cell.id };
      setWs(next);
      saveWorkspace(next);
      dispatch({ kind: "reset", model: cell.model });
    },
    [ws, persistActive, activeConceptId],
  );

  const duplicateCell = useCallback(() => {
    const active = ws.cells.find((c) => c.id === ws.activeId);
    const cell = makeCell((model.name || "Layout") + " (copy)", model, active?.folderId ?? null, active?.conceptId ?? null);
    const next: Workspace = { ...ws, cells: persistActive(ws).concat([cell]), activeId: cell.id };
    setWs(next);
    saveWorkspace(next);
    dispatch({ kind: "reset", model: cell.model });
  }, [ws, model, persistActive]);

  const renameCell = useCallback(
    (id: string, name: string) => {
      setWs((prev) => {
        const cells = prev.cells.map((c) => (c.id === id ? { ...c, name, model: { ...c.model, name } } : c));
        const next = { ...prev, cells };
        saveWorkspace(next);
        return next;
      });
      if (id === ws.activeId) dispatch({ kind: "live", action: { type: "SET_NAME", name } });
    },
    [ws.activeId],
  );

  const deleteCell = useCallback(
    (id: string) => {
      const remaining = ws.cells.filter((c) => c.id !== id);
      let concepts = ws.concepts;
      let seeded: Cell[] = remaining;
      if (remaining.length === 0) {
        const concept = makeConcept("Concept A", null, 0);
        concepts = ws.concepts.concat([concept]);
        seeded = [makeCell("Layout A", blankModel(), null, concept.id)];
      }
      const wasActive = id === ws.activeId;
      const activeId = wasActive ? seeded[0].id : ws.activeId;
      const persisted = seeded.map((c) => (c.id === ws.activeId && !wasActive ? { ...c, model } : c));
      const next: Workspace = { ...ws, cells: persisted, concepts, activeId };
      setWs(next);
      saveWorkspace(next);
      if (wasActive) dispatch({ kind: "reset", model: next.cells.find((c) => c.id === activeId)!.model });
    },
    [ws, model],
  );

  // Move a layout into another concept; it inherits that concept's folder.
  const moveCell = useCallback(
    (id: string, conceptId: string | null) => {
      setWs((prev) => {
        const folderId = prev.concepts.find((c) => c.id === conceptId)?.folderId ?? null;
        const cells = persistActive(prev).map((c) => (c.id === id ? { ...c, conceptId, folderId } : c));
        const next = { ...prev, cells };
        saveWorkspace(next);
        return next;
      });
    },
    [persistActive],
  );

  // ---- concepts -----------------------------------------------------------
  const createConcept = useCallback((name: string, folderId: string | null = null, m?: Model): string => {
    const position = ws.concepts.filter((c) => c.folderId === folderId).length;
    const concept = makeConcept(name, folderId, position);
    const cell = makeCell("Layout 1", m ?? blankModel(), folderId, concept.id);
    setWs((prev) => {
      const next: Workspace = {
        ...prev,
        cells: persistActive(prev).concat([cell]),
        concepts: prev.concepts.concat([concept]),
        activeId: cell.id,
      };
      saveWorkspace(next);
      return next;
    });
    dispatch({ kind: "reset", model: cell.model });
    return cell.id;
  }, [ws, persistActive]);

  const renameConcept = useCallback((id: string, name: string) => {
    setWs((prev) => {
      const concepts = prev.concepts.map((c) => (c.id === id ? { ...c, name } : c));
      const next = { ...prev, cells: persistActive(prev), concepts };
      saveWorkspace(next);
      return next;
    });
  }, [persistActive]);

  // Move a concept (and every layout inside it) into another folder.
  const moveConcept = useCallback((id: string, folderId: string | null) => {
    setWs((prev) => {
      const concepts = prev.concepts.map((c) => (c.id === id ? { ...c, folderId } : c));
      const cells = persistActive(prev).map((c) => (c.conceptId === id ? { ...c, folderId } : c));
      const next = { ...prev, concepts, cells };
      saveWorkspace(next);
      return next;
    });
  }, [persistActive]);

  const createFolder = useCallback((name: string, parentId: string | null = null) => {
    setWs((prev) => {
      const siblings = prev.folders.filter((f) => f.parentId === parentId).length;
      const folder = makeFolder(name, parentId, siblings);
      const next = { ...prev, cells: persistActive(prev), folders: prev.folders.concat([folder]) };
      saveWorkspace(next);
      return next;
    });
  }, [persistActive]);

  const renameFolder = useCallback((id: string, name: string) => {
    setWs((prev) => {
      const folders = prev.folders.map((f) => (f.id === id ? { ...f, name } : f));
      const next = { ...prev, cells: persistActive(prev), folders };
      saveWorkspace(next);
      return next;
    });
  }, [persistActive]);

  const moveFolder = useCallback((id: string, parentId: string | null) => {
    setWs((prev) => {
      // Reject cycles: a folder can't become its own descendant (or its own parent).
      if (parentId === id || isDescendant(prev.folders, id, parentId)) return prev;
      const folders = prev.folders.map((f) => (f.id === id ? { ...f, parentId } : f));
      const next = { ...prev, cells: persistActive(prev), folders };
      saveWorkspace(next);
      return next;
    });
  }, [persistActive]);

  // Pick a non-archived cell to land on after the active one is archived; seed a
  // fresh concept + blank layout if nothing visible remains.
  function fallbackActive(cells: Cell[], concepts: Concept[]): { cells: Cell[]; concepts: Concept[]; activeId: string; model: Model } {
    const next = cells.find((c) => !c.archived);
    if (next) return { cells, concepts, activeId: next.id, model: next.model };
    const concept = makeConcept("Concept A", null, 0);
    const blank = makeCell("Layout A", blankModel(), null, concept.id);
    return { cells: cells.concat([blank]), concepts: concepts.concat([concept]), activeId: blank.id, model: blank.model };
  }

  const archiveCell = useCallback((id: string) => {
    let cells = persistActive(ws).map((c) => (c.id === id ? { ...c, archived: true } : c));
    let concepts = ws.concepts;
    const wasActive = id === ws.activeId;
    let activeId = ws.activeId;
    let resetModel: Model | null = null;
    if (wasActive) { const r = fallbackActive(cells, concepts); cells = r.cells; concepts = r.concepts; activeId = r.activeId; resetModel = r.model; }
    const next: Workspace = { ...ws, cells, concepts, activeId };
    setWs(next);
    saveWorkspace(next);
    if (resetModel) dispatch({ kind: "reset", model: resetModel });
  }, [ws, persistActive]);

  // Archive a concept AND all its layouts.
  const archiveConcept = useCallback((id: string) => {
    let concepts = ws.concepts.map((c) => (c.id === id ? { ...c, archived: true } : c));
    let cells = persistActive(ws).map((c) => (c.conceptId === id ? { ...c, archived: true } : c));
    const activeArchived = cells.find((c) => c.id === ws.activeId)?.archived;
    let activeId = ws.activeId;
    let resetModel: Model | null = null;
    if (activeArchived) { const r = fallbackActive(cells, concepts); cells = r.cells; concepts = r.concepts; activeId = r.activeId; resetModel = r.model; }
    const next: Workspace = { ...ws, concepts, cells, activeId };
    setWs(next);
    saveWorkspace(next);
    if (resetModel) dispatch({ kind: "reset", model: resetModel });
  }, [ws, persistActive]);

  // Archive a folder AND everything inside it (sub-folders + concepts + layouts).
  const archiveFolder = useCallback((id: string) => {
    const ids = subtreeFolderIds(ws.folders, id);
    const folders = ws.folders.map((f) => (ids.has(f.id) ? { ...f, archived: true } : f));
    let concepts = ws.concepts.map((c) => (c.folderId && ids.has(c.folderId) ? { ...c, archived: true } : c));
    const archivedConceptIds = new Set(concepts.filter((c) => c.archived).map((c) => c.id));
    let cells = persistActive(ws).map((c) => ((c.folderId && ids.has(c.folderId)) || (c.conceptId && archivedConceptIds.has(c.conceptId)) ? { ...c, archived: true } : c));
    const activeArchived = cells.find((c) => c.id === ws.activeId)?.archived;
    let activeId = ws.activeId;
    let resetModel: Model | null = null;
    if (activeArchived) { const r = fallbackActive(cells, concepts); cells = r.cells; concepts = r.concepts; activeId = r.activeId; resetModel = r.model; }
    const next: Workspace = { ...ws, folders, concepts, cells, activeId };
    setWs(next);
    saveWorkspace(next);
    if (resetModel) dispatch({ kind: "reset", model: resetModel });
  }, [ws, persistActive]);

  const restoreCell = useCallback((id: string) => {
    setWs((prev) => {
      const cell = prev.cells.find((c) => c.id === id);
      const cells = prev.cells.map((c) => (c.id === id ? { ...c, archived: false } : c));
      // A layout is only visible inside a live concept, so restore its concept too.
      const concepts = cell?.conceptId
        ? prev.concepts.map((k) => {
            if (k.id !== cell.conceptId) return k;
            const folderArchived = k.folderId ? prev.folders.find((f) => f.id === k.folderId)?.archived : false;
            return { ...k, archived: false, folderId: folderArchived ? null : k.folderId };
          })
        : prev.concepts;
      const next = { ...prev, cells, concepts };
      saveWorkspace(next);
      return next;
    });
  }, []);

  const restoreConcept = useCallback((id: string) => {
    setWs((prev) => {
      const concepts = prev.concepts.map((c) => {
        if (c.id !== id) return c;
        const folderArchived = c.folderId ? prev.folders.find((f) => f.id === c.folderId)?.archived : false;
        return { ...c, archived: false, folderId: folderArchived ? null : c.folderId };
      });
      // Un-archive the concept's layouts too, moving them to the concept's folder.
      const folderId = concepts.find((c) => c.id === id)?.folderId ?? null;
      const cells = prev.cells.map((c) => (c.conceptId === id ? { ...c, archived: false, folderId } : c));
      const next = { ...prev, concepts, cells };
      saveWorkspace(next);
      return next;
    });
  }, []);

  const restoreFolder = useCallback((id: string) => {
    setWs((prev) => {
      const folders = prev.folders.map((f) => {
        if (f.id !== id) return f;
        const parentArchived = f.parentId ? prev.folders.find((p) => p.id === f.parentId)?.archived : false;
        return { ...f, archived: false, parentId: parentArchived ? null : f.parentId };
      });
      const next = { ...prev, folders };
      saveWorkspace(next);
      return next;
    });
  }, []);

  const purgeCell = useCallback((id: string) => {
    setWs((prev) => {
      const next = { ...prev, cells: prev.cells.filter((c) => c.id !== id) };
      saveWorkspace(next);
      return next;
    });
  }, []);

  const purgeConcept = useCallback((id: string) => {
    setWs((prev) => {
      const next = {
        ...prev,
        concepts: prev.concepts.filter((c) => c.id !== id),
        cells: prev.cells.filter((c) => c.conceptId !== id),
      };
      saveWorkspace(next);
      return next;
    });
  }, []);

  const purgeFolder = useCallback((id: string) => {
    setWs((prev) => {
      const ids = subtreeFolderIds(prev.folders, id);
      const deadConcepts = new Set(prev.concepts.filter((c) => c.folderId && ids.has(c.folderId)).map((c) => c.id));
      const next = {
        ...prev,
        folders: prev.folders.filter((f) => !ids.has(f.id)),
        concepts: prev.concepts.filter((c) => !(c.folderId && ids.has(c.folderId))),
        cells: prev.cells.filter((c) => !((c.folderId && ids.has(c.folderId)) || (c.conceptId && deadConcepts.has(c.conceptId)))),
      };
      saveWorkspace(next);
      return next;
    });
  }, []);

  const snapshotCells = useCallback((): Cell[] => persistActive(ws).filter((c) => !c.archived), [ws, persistActive]);

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
    cells: ws.cells
      .filter((c) => !c.archived)
      .map((c) => ({ id: c.id, name: c.id === ws.activeId ? model.name || c.name : c.name, folderId: c.folderId, conceptId: c.conceptId })),
    activeId: ws.activeId,
    activeConceptId,
    switchCell,
    addCell,
    duplicateCell,
    renameCell,
    deleteCell,
    moveCell,
    snapshotCells,
    concepts: ws.concepts.filter((c) => !c.archived),
    createConcept,
    renameConcept,
    moveConcept,
    folders: ws.folders.filter((f) => !f.archived),
    createFolder,
    renameFolder,
    moveFolder,
    archiveCell,
    archiveConcept,
    archiveFolder,
    restoreCell,
    restoreConcept,
    restoreFolder,
    purgeCell,
    purgeConcept,
    purgeFolder,
    archivedCells: ws.cells.filter((c) => c.archived).map((c) => ({ id: c.id, name: c.name, folderId: c.folderId, conceptId: c.conceptId })),
    archivedConcepts: ws.concepts.filter((c) => c.archived),
    archivedFolders: ws.folders.filter((f) => f.archived),
  };
}
