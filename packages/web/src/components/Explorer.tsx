import { useEffect, useRef, useState } from "react";
import type { FlowPlanApi } from "../store/useFlowPlan";
import type { Folder } from "../store/workspace";
import { blankModel } from "@flowplan/core/model/sample";
import { navigate } from "../store/useHashRoute";
import { Menu } from "./Menu";
import { TEAL, TEXTD } from "./colors";

// Left drawer presenting the workspace as a nested folder tree of layouts. All
// editing is in-app (inline inputs + inline confirm — no browser prompt/confirm).
// Layouts and folders are reorganized by drag-and-drop onto a folder (or the root).
type Edit = { kind: "new"; parentId: string | null } | { kind: "rename"; id: string; name: string } | null;
type Drag = { type: "cell" | "folder"; id: string } | null;
const ROOT = "__root";

// Shared context handed to the (module-level) tree rows. Defining the row
// components at module scope keeps their identity stable across renders, so a
// drag interaction (which re-renders for the drop highlight) doesn't remount/
// detach the dragged elements.
interface Ctx {
  api: FlowPlanApi;
  collapsed: Set<string>;
  toggle: (id: string) => void;
  edit: Edit;
  setEdit: (e: Edit) => void;
  confirmId: string | null;
  setConfirmId: (id: string | null) => void;
  dropTarget: string | null;
  setDropTarget: (t: string | null) => void;
  startNew: (parentId: string | null) => void;
  setDrag: (d: Drag) => void;
  dropInto: (folderId: string | null) => void;
  childFolders: (parentId: string | null) => Folder[];
  cellsIn: (folderId: string | null) => FlowPlanApi["cells"];
}

// An autofocused inline editor: commits on Enter/blur, cancels on Escape. Empty
// input cancels (so a stray "＋" never creates a blank folder).
function InlineInput({ initial, placeholder, onCommit, onCancel }: { initial: string; placeholder?: string; onCommit: (v: string) => void; onCancel: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const done = useRef(false);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  const commit = () => {
    if (done.current) return;
    done.current = true;
    const v = ref.current?.value.trim() ?? "";
    v ? onCommit(v) : onCancel();
  };
  return (
    <input
      ref={ref}
      className="tree-input"
      defaultValue={initial}
      placeholder={placeholder}
      aria-label={placeholder ?? "name"}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        else if (e.key === "Escape") { done.current = true; onCancel(); }
      }}
      onBlur={commit}
    />
  );
}

function CellRow({ ctx, id, name, depth }: { ctx: Ctx; id: string; name: string; depth: number }) {
  const active = id === ctx.api.activeId;
  return (
    <div
      className="tree-row"
      style={{ paddingLeft: 8 + depth * 16 }}
      draggable
      onDragStart={() => ctx.setDrag({ type: "cell", id })}
      onDragEnd={() => { ctx.setDrag(null); ctx.setDropTarget(null); }}
    >
      <span className="tree-grip" title="Drag to move into a folder">⠿</span>
      <button
        className="tree-leaf"
        onClick={() => ctx.api.switchCell(id)}
        style={{ color: active ? TEAL : undefined, fontWeight: active ? 600 : 400 }}
        title="Open layout"
      >
        ▦ {name}
      </button>
      <button className="tree-archive" title="Archive layout" onClick={() => ctx.api.archiveCell(id)}>🗄</button>
    </div>
  );
}

function FolderNode({ ctx, folder, depth }: { ctx: Ctx; folder: Folder; depth: number }) {
  const isCollapsed = ctx.collapsed.has(folder.id);
  const renaming = ctx.edit?.kind === "rename" && ctx.edit.id === folder.id;
  const isDrop = ctx.dropTarget === folder.id;
  return (
    <div>
      <div
        className={"tree-row" + (isDrop ? " drop" : "")}
        style={{ paddingLeft: 8 + depth * 16 }}
        draggable={!renaming}
        onDragStart={(e) => { e.stopPropagation(); ctx.setDrag({ type: "folder", id: folder.id }); }}
        onDragEnd={() => { ctx.setDrag(null); ctx.setDropTarget(null); }}
        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); if (ctx.dropTarget !== folder.id) ctx.setDropTarget(folder.id); }}
        onDragLeave={() => { if (ctx.dropTarget === folder.id) ctx.setDropTarget(null); }}
        onDrop={(e) => { e.preventDefault(); e.stopPropagation(); ctx.dropInto(folder.id); }}
      >
        <button className="tree-twisty" onClick={() => ctx.toggle(folder.id)} title={isCollapsed ? "Expand" : "Collapse"}>
          {isCollapsed ? "▸" : "▾"}
        </button>
        {renaming ? (
          <InlineInput initial={folder.name} onCommit={(n) => { ctx.api.renameFolder(folder.id, n); ctx.setEdit(null); }} onCancel={() => ctx.setEdit(null)} />
        ) : (
          <button className="tree-leaf" onClick={() => ctx.toggle(folder.id)} title="Folder">🗀 {folder.name}</button>
        )}
        {ctx.confirmId === folder.id ? (
          <span className="tree-confirm">
            Archive&nbsp;+&nbsp;contents?
            <button className="btn sm danger" title="Confirm archive" onClick={() => { ctx.api.archiveFolder(folder.id); ctx.setConfirmId(null); }}>✓</button>
            <button className="btn sm" title="Cancel" onClick={() => ctx.setConfirmId(null)}>✗</button>
          </span>
        ) : (
          <Menu
            label="⋯"
            title="Folder actions"
            items={[
              { label: "New sub-folder", onClick: () => ctx.startNew(folder.id) },
              { label: "New layout here", onClick: () => ctx.api.addCell(blankModel(), undefined, folder.id) },
              { label: "Rename", onClick: () => { ctx.setConfirmId(null); ctx.setEdit({ kind: "rename", id: folder.id, name: folder.name }); } },
              { label: "Archive (with contents)", danger: true, onClick: () => { ctx.setEdit(null); ctx.setConfirmId(folder.id); } },
            ]}
          />
        )}
      </div>
      {!isCollapsed ? (
        <div>
          {ctx.edit?.kind === "new" && ctx.edit.parentId === folder.id ? (
            <div className="tree-row" style={{ paddingLeft: 8 + (depth + 1) * 16 }}>
              <span className="tree-twisty" /> 🗀{" "}
              <InlineInput initial="" placeholder="Folder name" onCommit={(n) => { ctx.api.createFolder(n, folder.id); ctx.setEdit(null); }} onCancel={() => ctx.setEdit(null)} />
            </div>
          ) : null}
          {ctx.childFolders(folder.id).map((f) => (
            <FolderNode key={f.id} ctx={ctx} folder={f} depth={depth + 1} />
          ))}
          {ctx.cellsIn(folder.id).map((c) => (
            <CellRow key={c.id} ctx={ctx} id={c.id} name={c.name} depth={depth + 1} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function Explorer({ api, onCollapse }: { api: FlowPlanApi; onCollapse: () => void }) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [edit, setEdit] = useState<Edit>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null); // folder id or ROOT
  // The drag payload lives in a ref so it's readable at drop time regardless of
  // re-renders triggered by the drop-target highlight.
  const dragRef = useRef<Drag>(null);

  const ctx: Ctx = {
    api,
    collapsed,
    toggle: (id) => setCollapsed((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; }),
    edit,
    setEdit,
    confirmId,
    setConfirmId,
    dropTarget,
    setDropTarget,
    startNew: (parentId) => {
      if (parentId) setCollapsed((prev) => { const n = new Set(prev); n.delete(parentId); return n; });
      setConfirmId(null);
      setEdit({ kind: "new", parentId });
    },
    setDrag: (d) => { dragRef.current = d; },
    dropInto: (folderId) => {
      const d = dragRef.current;
      if (d?.type === "cell") api.moveCell(d.id, folderId);
      else if (d?.type === "folder") api.moveFolder(d.id, folderId); // api guards cycles
      dragRef.current = null;
      setDropTarget(null);
    },
    childFolders: (parentId) => api.folders.filter((f) => f.parentId === parentId).sort((a, b) => a.position - b.position),
    cellsIn: (folderId) => api.cells.filter((c) => c.folderId === folderId),
  };

  return (
    <div className="explorer">
        <div className="explorer-head">
          <h2 style={{ margin: 0, fontSize: 14 }}>Workspace</h2>
          <button className="btn sm" onClick={onCollapse} title="Collapse sidebar">◀</button>
        </div>
        <div className="explorer-actions">
          <button className="btn sm" onClick={() => ctx.startNew(null)}>＋ Folder</button>
          <button className="btn sm" onClick={() => api.addCell(blankModel(), undefined, null)}>＋ Layout</button>
          <button className="btn sm" onClick={() => navigate("/archive")} title="Archived layouts & folders">
            🗄 {api.archivedCells.length + api.archivedFolders.length || ""}
          </button>
        </div>
        <div
          className={"explorer-tree" + (dropTarget === ROOT ? " drop" : "")}
          onDragOver={(e) => { e.preventDefault(); if (dropTarget !== ROOT) setDropTarget(ROOT); }}
          onDragLeave={() => { if (dropTarget === ROOT) setDropTarget(null); }}
          onDrop={(e) => { e.preventDefault(); ctx.dropInto(null); }}
        >
          {edit?.kind === "new" && edit.parentId === null ? (
            <div className="tree-row">
              <span className="tree-twisty" /> 🗀{" "}
              <InlineInput initial="" placeholder="Folder name" onCommit={(n) => { api.createFolder(n, null); setEdit(null); }} onCancel={() => setEdit(null)} />
            </div>
          ) : null}
          {ctx.childFolders(null).map((f) => (
            <FolderNode key={f.id} ctx={ctx} folder={f} depth={0} />
          ))}
          {ctx.cellsIn(null).map((c) => (
            <CellRow key={c.id} ctx={ctx} id={c.id} name={c.name} depth={0} />
          ))}
        </div>
        <div style={{ fontSize: 10.5, color: TEXTD, marginTop: 8 }}>
          Drag a layout or folder onto a folder to move it (or onto empty space for the root). Archiving a
          folder archives its contents too — restore them from the Archive (🗄).
        </div>
    </div>
  );
}
