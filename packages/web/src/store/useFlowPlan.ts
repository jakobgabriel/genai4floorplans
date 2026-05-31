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
  makeFolder,
  isDescendant,
  subtreeFolderIds,
  saveWorkspace,
  type Cell,
  type Folder,
  type Workspace,
} from "./workspace";

export interface CellRef {
  id: string;
  name: string;
  folderId: string | null;
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
  // ---- multi-cell workspace ----
  cells: CellRef[];
  activeId: string;
  switchCell: (id: string) => void;
  addCell: (model?: Model, name?: string, folderId?: string | null) => void;
  duplicateCell: () => void;
  renameCell: (id: string, name: string) => void;
  deleteCell: (id: string) => void;
  moveCell: (id: string, folderId: string | null) => void;
  /** All (non-archived) cells with the active one's live model — for the site rollup. */
  snapshotCells: () => Cell[];
  // ---- folders (arbitrarily nested) ----
  folders: Folder[];
  createFolder: (name: string, parentId?: string | null) => void;
  renameFolder: (id: string, name: string) => void;
  /** Move a folder under a new parent; ignored if it would create a cycle. */
  moveFolder: (id: string, parentId: string | null) => void;
  // ---- archive (soft delete, recoverable) ----
  /** Archive a layout (hidden from the tree, recoverable). */
  archiveCell: (id: string) => void;
  /** Archive a folder AND all its contents (sub-folders + layouts), recursively. */
  archiveFolder: (id: string) => void;
  restoreCell: (id: string) => void;
  restoreFolder: (id: string) => void;
  /** Permanently delete an archived layout. */
  purgeCell: (id: string) => void;
  /** Permanently delete an archived folder and its contents. */
  purgeFolder: (id: string) => void;
  archivedCells: CellRef[];
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

  const switchCell = useCallback(
    (id: string) => {
      if (id === ws.activeId) return;
      const cells = persistActive(ws);
      const target = cells.find((c) => c.id === id);
      if (!target) return;
      const next: Workspace = { cells, folders: ws.folders, activeId: id };
      setWs(next);
      saveWorkspace(next);
      dispatch({ kind: "reset", model: target.model });
    },
    [ws, persistActive],
  );

  const addCell = useCallback(
    (m?: Model, name?: string, folderId: string | null = null) => {
      const cell = makeCell(name ?? "Cell " + (ws.cells.length + 1), m ?? blankModel(), folderId);
      const next: Workspace = { cells: persistActive(ws).concat([cell]), folders: ws.folders, activeId: cell.id };
      setWs(next);
      saveWorkspace(next);
      dispatch({ kind: "reset", model: cell.model });
    },
    [ws, persistActive],
  );

  const duplicateCell = useCallback(() => {
    const active = ws.cells.find((c) => c.id === ws.activeId);
    const cell = makeCell((model.name || "Cell") + " (copy)", model, active?.folderId ?? null);
    const next: Workspace = { cells: persistActive(ws).concat([cell]), folders: ws.folders, activeId: cell.id };
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
      const cells = remaining.length ? remaining : [makeCell("Cell A", blankModel())];
      const wasActive = id === ws.activeId;
      const activeId = wasActive ? cells[0].id : ws.activeId;
      // keep the active cell's live model if it wasn't the one deleted
      const persisted = cells.map((c) => (c.id === ws.activeId && !wasActive ? { ...c, model } : c));
      const next: Workspace = { cells: persisted, folders: ws.folders, activeId };
      setWs(next);
      saveWorkspace(next);
      if (wasActive) dispatch({ kind: "reset", model: next.cells.find((c) => c.id === activeId)!.model });
    },
    [ws, model],
  );

  const moveCell = useCallback(
    (id: string, folderId: string | null) => {
      setWs((prev) => {
        const cells = persistActive(prev).map((c) => (c.id === id ? { ...c, folderId } : c));
        const next = { ...prev, cells };
        saveWorkspace(next);
        return next;
      });
    },
    [persistActive],
  );

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
  // blank if the workspace would otherwise have no visible layout.
  function fallbackActive(cells: Cell[]): { cells: Cell[]; activeId: string; model: Model } {
    const next = cells.find((c) => !c.archived);
    if (next) return { cells, activeId: next.id, model: next.model };
    const blank = makeCell("Cell A", blankModel());
    return { cells: cells.concat([blank]), activeId: blank.id, model: blank.model };
  }

  const archiveCell = useCallback((id: string) => {
    let cells = persistActive(ws).map((c) => (c.id === id ? { ...c, archived: true } : c));
    const wasActive = id === ws.activeId;
    let activeId = ws.activeId;
    let resetModel: Model | null = null;
    if (wasActive) { const r = fallbackActive(cells); cells = r.cells; activeId = r.activeId; resetModel = r.model; }
    const next: Workspace = { ...ws, cells, activeId };
    setWs(next);
    saveWorkspace(next);
    if (resetModel) dispatch({ kind: "reset", model: resetModel });
  }, [ws, persistActive]);

  // Archive a folder AND everything inside it (sub-folders + their layouts).
  const archiveFolder = useCallback((id: string) => {
    const ids = subtreeFolderIds(ws.folders, id);
    const folders = ws.folders.map((f) => (ids.has(f.id) ? { ...f, archived: true } : f));
    let cells = persistActive(ws).map((c) => (c.folderId && ids.has(c.folderId) ? { ...c, archived: true } : c));
    const activeArchived = cells.find((c) => c.id === ws.activeId)?.archived;
    let activeId = ws.activeId;
    let resetModel: Model | null = null;
    if (activeArchived) { const r = fallbackActive(cells); cells = r.cells; activeId = r.activeId; resetModel = r.model; }
    const next: Workspace = { ...ws, folders, cells, activeId };
    setWs(next);
    saveWorkspace(next);
    if (resetModel) dispatch({ kind: "reset", model: resetModel });
  }, [ws, persistActive]);

  const restoreCell = useCallback((id: string) => {
    setWs((prev) => {
      const cells = prev.cells.map((c) => {
        if (c.id !== id) return c;
        // if the owning folder is still archived, lift the layout to the root so it's visible
        const folderArchived = c.folderId ? prev.folders.find((f) => f.id === c.folderId)?.archived : false;
        return { ...c, archived: false, folderId: folderArchived ? null : c.folderId };
      });
      const next = { ...prev, cells };
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

  const purgeFolder = useCallback((id: string) => {
    setWs((prev) => {
      const ids = subtreeFolderIds(prev.folders, id);
      const next = {
        ...prev,
        folders: prev.folders.filter((f) => !ids.has(f.id)),
        cells: prev.cells.filter((c) => !(c.folderId && ids.has(c.folderId))),
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
      .map((c) => ({ id: c.id, name: c.id === ws.activeId ? model.name || c.name : c.name, folderId: c.folderId })),
    activeId: ws.activeId,
    switchCell,
    addCell,
    duplicateCell,
    renameCell,
    deleteCell,
    moveCell,
    snapshotCells,
    folders: ws.folders.filter((f) => !f.archived),
    createFolder,
    renameFolder,
    moveFolder,
    archiveCell,
    archiveFolder,
    restoreCell,
    restoreFolder,
    purgeCell,
    purgeFolder,
    archivedCells: ws.cells.filter((c) => c.archived).map((c) => ({ id: c.id, name: c.name, folderId: c.folderId })),
    archivedFolders: ws.folders.filter((f) => f.archived),
  };
}
