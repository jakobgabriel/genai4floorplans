import { useEffect, useRef, useState } from "react";
import { Button } from "@carbon/react";
import { Add, Archive, Categories, ChevronDown, ChevronRight, Checkmark, Close, DocumentBlank, Draggable, Folder as FolderIcon, SidePanelClose } from "@carbon/icons-react";
import type { FlowPlanApi } from "../store/useFlowPlan";
import type { Concept, Folder } from "../store/workspace";
import { blankModel } from "@flowplan/core/model/sample";
import { navigate } from "../store/useHashRoute";
import { Menu } from "./Menu";
import { TEAL, TEXTD } from "./colors";

// Left drawer presenting the workspace as Folder > Concept > Layout. A Concept
// is the workspace item (one manufacturing concept); a Layout is an alternative
// arrangement inside it. All editing is in-app (inline inputs + inline confirm).
// Folders, concepts and layouts are reorganized by drag-and-drop.
type Edit =
  | { kind: "newFolder"; parentId: string | null }
  | { kind: "newConcept"; folderId: string | null }
  | { kind: "rename"; target: "folder" | "concept"; id: string; name: string }
  | null;
type Drag = { type: "cell" | "concept" | "folder"; id: string } | null;
const ROOT = "__root";

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
  startNewFolder: (parentId: string | null) => void;
  startNewConcept: (folderId: string | null) => void;
  setDrag: (d: Drag) => void;
  /** Drop the current drag onto a folder (or root when null). */
  dropIntoFolder: (folderId: string | null) => void;
  /** Drop a dragged layout onto a concept. */
  dropIntoConcept: (conceptId: string) => void;
  childFolders: (parentId: string | null) => Folder[];
  conceptsIn: (folderId: string | null) => Concept[];
  layoutsIn: (conceptId: string) => FlowPlanApi["cells"];
  onOpenCell?: () => void;
}

// An autofocused inline editor: commits on Enter/blur, cancels on Escape.
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
      onDragStart={(e) => { e.stopPropagation(); ctx.setDrag({ type: "cell", id }); }}
      onDragEnd={() => { ctx.setDrag(null); ctx.setDropTarget(null); }}
    >
      <span className="tree-grip" title="Drag to move into a concept"><Draggable size={16} /></span>
      <button
        className="tree-leaf"
        onClick={() => { ctx.api.switchCell(id); ctx.onOpenCell?.(); }}
        style={{ color: active ? TEAL : undefined, fontWeight: active ? 600 : 400 }}
        title="Open layout"
      >
        <DocumentBlank size={16} /> {name}
      </button>
      <button className="tree-archive" title="Archive layout" onClick={() => ctx.api.archiveCell(id)}><Archive size={16} /></button>
    </div>
  );
}

function ConceptNode({ ctx, concept, depth }: { ctx: Ctx; concept: Concept; depth: number }) {
  const isCollapsed = ctx.collapsed.has(concept.id);
  const renaming = ctx.edit?.kind === "rename" && ctx.edit.target === "concept" && ctx.edit.id === concept.id;
  const isDrop = ctx.dropTarget === concept.id;
  const layouts = ctx.layoutsIn(concept.id);
  return (
    <div>
      <div
        className={"tree-row" + (isDrop ? " drop" : "")}
        style={{ paddingLeft: 8 + depth * 16 }}
        draggable={!renaming}
        onDragStart={(e) => { e.stopPropagation(); ctx.setDrag({ type: "concept", id: concept.id }); }}
        onDragEnd={() => { ctx.setDrag(null); ctx.setDropTarget(null); }}
        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); if (ctx.dropTarget !== concept.id) ctx.setDropTarget(concept.id); }}
        onDragLeave={() => { if (ctx.dropTarget === concept.id) ctx.setDropTarget(null); }}
        onDrop={(e) => { e.preventDefault(); e.stopPropagation(); ctx.dropIntoConcept(concept.id); }}
      >
        <button className="tree-twisty" onClick={() => ctx.toggle(concept.id)} title={isCollapsed ? "Expand" : "Collapse"}>
          {isCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
        </button>
        {renaming ? (
          <InlineInput initial={concept.name} onCommit={(n) => { ctx.api.renameConcept(concept.id, n); ctx.setEdit(null); }} onCancel={() => ctx.setEdit(null)} />
        ) : (
          <button className="tree-leaf" onClick={() => ctx.toggle(concept.id)} title="Concept — a workspace item with one or more layouts">
            <Categories size={16} /> {concept.name} <span style={{ color: TEXTD, fontSize: "0.75rem" }}>({layouts.length})</span>
          </button>
        )}
        {ctx.confirmId === concept.id ? (
          <span className="tree-confirm">
            Archive&nbsp;concept?
            <button className="btn sm danger" title="Confirm archive" onClick={() => { ctx.api.archiveConcept(concept.id); ctx.setConfirmId(null); }}><Checkmark size={16} /></button>
            <button className="btn sm" title="Cancel" onClick={() => ctx.setConfirmId(null)}><Close size={16} /></button>
          </span>
        ) : (
          <Menu
            label="⋯"
            title="Concept actions"
            items={[
              { label: "New layout", onClick: () => ctx.api.addCell(blankModel(), undefined, concept.id) },
              { label: "Rename", onClick: () => { ctx.setConfirmId(null); ctx.setEdit({ kind: "rename", target: "concept", id: concept.id, name: concept.name }); } },
              { label: "Archive (with layouts)", danger: true, onClick: () => { ctx.setEdit(null); ctx.setConfirmId(concept.id); } },
            ]}
          />
        )}
      </div>
      {!isCollapsed ? (
        <div>
          {layouts.map((c) => (
            <CellRow key={c.id} ctx={ctx} id={c.id} name={c.name} depth={depth + 1} />
          ))}
          {layouts.length === 0 ? (
            <div className="tree-row" style={{ paddingLeft: 8 + (depth + 1) * 16, color: TEXTD, fontSize: "0.75rem" }}>
              <span className="tree-twisty" /> no layouts — add one from ⋯
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function FolderNode({ ctx, folder, depth }: { ctx: Ctx; folder: Folder; depth: number }) {
  const isCollapsed = ctx.collapsed.has(folder.id);
  const renaming = ctx.edit?.kind === "rename" && ctx.edit.target === "folder" && ctx.edit.id === folder.id;
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
        onDrop={(e) => { e.preventDefault(); e.stopPropagation(); ctx.dropIntoFolder(folder.id); }}
      >
        <button className="tree-twisty" onClick={() => ctx.toggle(folder.id)} title={isCollapsed ? "Expand" : "Collapse"}>
          {isCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
        </button>
        {renaming ? (
          <InlineInput initial={folder.name} onCommit={(n) => { ctx.api.renameFolder(folder.id, n); ctx.setEdit(null); }} onCancel={() => ctx.setEdit(null)} />
        ) : (
          <button className="tree-leaf" onClick={() => ctx.toggle(folder.id)} title="Folder"><FolderIcon size={16} /> {folder.name}</button>
        )}
        {ctx.confirmId === folder.id ? (
          <span className="tree-confirm">
            Archive&nbsp;+&nbsp;contents?
            <button className="btn sm danger" title="Confirm archive" onClick={() => { ctx.api.archiveFolder(folder.id); ctx.setConfirmId(null); }}><Checkmark size={16} /></button>
            <button className="btn sm" title="Cancel" onClick={() => ctx.setConfirmId(null)}><Close size={16} /></button>
          </span>
        ) : (
          <Menu
            label="⋯"
            title="Folder actions"
            items={[
              { label: "New sub-folder", onClick: () => ctx.startNewFolder(folder.id) },
              { label: "New concept here", onClick: () => ctx.startNewConcept(folder.id) },
              { label: "Rename", onClick: () => { ctx.setConfirmId(null); ctx.setEdit({ kind: "rename", target: "folder", id: folder.id, name: folder.name }); } },
              { label: "Archive (with contents)", danger: true, onClick: () => { ctx.setEdit(null); ctx.setConfirmId(folder.id); } },
            ]}
          />
        )}
      </div>
      {!isCollapsed ? (
        <div>
          {ctx.edit?.kind === "newFolder" && ctx.edit.parentId === folder.id ? (
            <div className="tree-row" style={{ paddingLeft: 8 + (depth + 1) * 16 }}>
              <span className="tree-twisty" /> <FolderIcon size={16} />{" "}
              <InlineInput initial="" placeholder="Folder name" onCommit={(n) => { ctx.api.createFolder(n, folder.id); ctx.setEdit(null); }} onCancel={() => ctx.setEdit(null)} />
            </div>
          ) : null}
          {ctx.edit?.kind === "newConcept" && ctx.edit.folderId === folder.id ? (
            <div className="tree-row" style={{ paddingLeft: 8 + (depth + 1) * 16 }}>
              <span className="tree-twisty" /> <Categories size={16} />{" "}
              <InlineInput initial="" placeholder="Concept name" onCommit={(n) => { ctx.api.createConcept(n, folder.id); ctx.setEdit(null); ctx.onOpenCell?.(); }} onCancel={() => ctx.setEdit(null)} />
            </div>
          ) : null}
          {ctx.childFolders(folder.id).map((f) => (
            <FolderNode key={f.id} ctx={ctx} folder={f} depth={depth + 1} />
          ))}
          {ctx.conceptsIn(folder.id).map((c) => (
            <ConceptNode key={c.id} ctx={ctx} concept={c} depth={depth + 1} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function Explorer({ api, onCollapse, onOpenCell }: { api: FlowPlanApi; onCollapse?: () => void; onOpenCell?: () => void }) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [edit, setEdit] = useState<Edit>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
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
    startNewFolder: (parentId) => {
      if (parentId) setCollapsed((prev) => { const n = new Set(prev); n.delete(parentId); return n; });
      setConfirmId(null);
      setEdit({ kind: "newFolder", parentId });
    },
    startNewConcept: (folderId) => {
      if (folderId) setCollapsed((prev) => { const n = new Set(prev); n.delete(folderId); return n; });
      setConfirmId(null);
      setEdit({ kind: "newConcept", folderId });
    },
    setDrag: (d) => { dragRef.current = d; },
    dropIntoFolder: (folderId) => {
      const d = dragRef.current;
      if (d?.type === "concept") api.moveConcept(d.id, folderId);
      else if (d?.type === "folder") api.moveFolder(d.id, folderId); // api guards cycles
      // A layout dropped on a folder is ignored — layouts live inside concepts.
      dragRef.current = null;
      setDropTarget(null);
    },
    dropIntoConcept: (conceptId) => {
      const d = dragRef.current;
      if (d?.type === "cell") api.moveCell(d.id, conceptId);
      dragRef.current = null;
      setDropTarget(null);
    },
    childFolders: (parentId) => api.folders.filter((f) => f.parentId === parentId).sort((a, b) => a.position - b.position),
    conceptsIn: (folderId) => api.concepts.filter((c) => c.folderId === folderId).sort((a, b) => a.position - b.position),
    layoutsIn: (conceptId) => api.cells.filter((c) => c.conceptId === conceptId),
    onOpenCell,
  };

  return (
    <div className="explorer">
      <div className="explorer-head">
        <h2 style={{ margin: 0, fontSize: "0.875rem" }}>Workspace</h2>
        {onCollapse ? (
          <Button kind="ghost" size="sm" hasIconOnly renderIcon={SidePanelClose} iconDescription="Close" onClick={onCollapse} />
        ) : null}
      </div>
      <div className="explorer-actions">
        <Button kind="tertiary" size="sm" renderIcon={Add} onClick={() => ctx.startNewFolder(null)}>Folder</Button>
        <Button kind="tertiary" size="sm" renderIcon={Add} onClick={() => ctx.startNewConcept(null)}>Concept</Button>
        <Button kind="ghost" size="sm" renderIcon={Archive} onClick={() => navigate("/archive")} title="Archived concepts, layouts & folders">
          {api.archivedCells.length + api.archivedConcepts.length + api.archivedFolders.length || ""}
        </Button>
      </div>
      <div
        className={"explorer-tree" + (dropTarget === ROOT ? " drop" : "")}
        onDragOver={(e) => { e.preventDefault(); if (dropTarget !== ROOT) setDropTarget(ROOT); }}
        onDragLeave={() => { if (dropTarget === ROOT) setDropTarget(null); }}
        onDrop={(e) => { e.preventDefault(); ctx.dropIntoFolder(null); }}
      >
        {edit?.kind === "newFolder" && edit.parentId === null ? (
          <div className="tree-row">
            <span className="tree-twisty" /> <FolderIcon size={16} />{" "}
            <InlineInput initial="" placeholder="Folder name" onCommit={(n) => { api.createFolder(n, null); setEdit(null); }} onCancel={() => setEdit(null)} />
          </div>
        ) : null}
        {edit?.kind === "newConcept" && edit.folderId === null ? (
          <div className="tree-row">
            <span className="tree-twisty" /> <Categories size={16} />{" "}
            <InlineInput initial="" placeholder="Concept name" onCommit={(n) => { api.createConcept(n, null); setEdit(null); onOpenCell?.(); }} onCancel={() => setEdit(null)} />
          </div>
        ) : null}
        {ctx.childFolders(null).map((f) => (
          <FolderNode key={f.id} ctx={ctx} folder={f} depth={0} />
        ))}
        {ctx.conceptsIn(null).map((c) => (
          <ConceptNode key={c.id} ctx={ctx} concept={c} depth={0} />
        ))}
      </div>
      <div style={{ fontSize: "0.75rem", color: TEXTD, marginTop: 8 }}>
        A <strong>concept</strong> is a workspace item holding one or more <strong>layouts</strong>. Drag a
        layout onto a concept, or a concept/folder onto a folder (or empty space for the root). Archiving is
        recoverable from the Archive.
      </div>
    </div>
  );
}
