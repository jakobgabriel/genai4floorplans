import { useMemo, useState } from "react";
import type { FlowPlanApi } from "../store/useFlowPlan";
import type { Folder } from "../store/workspace";
import { blankModel } from "@flowplan/core/model/sample";
import { Menu } from "./Menu";
import { TEAL, TEXTD } from "./colors";

// Left drawer presenting the workspace as a nested folder tree of layouts. Folders
// nest arbitrarily; layouts (cells) live in a folder or at the root. Clicking a
// layout switches to it; row menus create/rename/delete folders and move layouts.
export function Explorer({ api, onClose }: { api: FlowPlanApi; onClose: () => void }) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const childFolders = (parentId: string | null): Folder[] =>
    api.folders.filter((f) => f.parentId === parentId).sort((a, b) => a.position - b.position);
  const cellsIn = (folderId: string | null) => api.cells.filter((c) => c.folderId === folderId);

  // Targets for the "Move to…" picker: Root + every folder.
  const moveTargets = useMemo(
    () => [{ id: "__root", name: "Workspace (root)" }, ...api.folders.map((f) => ({ id: f.id, name: f.name }))],
    [api.folders],
  );

  function newFolder(parentId: string | null) {
    const name = window.prompt("New folder name", "Folder");
    if (name && name.trim()) api.createFolder(name.trim(), parentId);
  }
  function rename(f: Folder) {
    const name = window.prompt("Rename folder", f.name);
    if (name && name.trim()) api.renameFolder(f.id, name.trim());
  }
  function remove(f: Folder) {
    if (window.confirm(`Delete folder “${f.name}”? Its layouts and sub-folders move up one level.`)) {
      api.deleteFolder(f.id);
    }
  }

  function CellRow({ id, name, depth }: { id: string; name: string; depth: number }) {
    const active = id === api.activeId;
    return (
      <div className="tree-row" style={{ paddingLeft: 8 + depth * 16 }}>
        <button
          className="tree-leaf"
          onClick={() => { api.switchCell(id); }}
          style={{ color: active ? TEAL : undefined, fontWeight: active ? 600 : 400 }}
          title="Open layout"
        >
          ▦ {name}
        </button>
        <select
          className="tree-move"
          value={api.cells.find((c) => c.id === id)?.folderId ?? "__root"}
          onChange={(e) => api.moveCell(id, e.target.value === "__root" ? null : e.target.value)}
          title="Move layout to…"
        >
          {moveTargets.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </div>
    );
  }

  function FolderNode({ folder, depth }: { folder: Folder; depth: number }) {
    const isCollapsed = collapsed.has(folder.id);
    const toggle = () =>
      setCollapsed((prev) => {
        const next = new Set(prev);
        next.has(folder.id) ? next.delete(folder.id) : next.add(folder.id);
        return next;
      });
    return (
      <div>
        <div className="tree-row" style={{ paddingLeft: 8 + depth * 16 }}>
          <button className="tree-leaf" onClick={toggle} title={isCollapsed ? "Expand" : "Collapse"}>
            {isCollapsed ? "▸" : "▾"} 🗀 {folder.name}
          </button>
          <Menu
            label="⋯"
            title="Folder actions"
            items={[
              { label: "New sub-folder", onClick: () => newFolder(folder.id) },
              { label: "New layout here", onClick: () => api.addCell(blankModel(), undefined, folder.id) },
              { label: "Rename", onClick: () => rename(folder) },
              { label: "Delete", danger: true, onClick: () => remove(folder) },
            ]}
          />
        </div>
        {!isCollapsed ? (
          <div>
            {childFolders(folder.id).map((f) => (
              <FolderNode key={f.id} folder={f} depth={depth + 1} />
            ))}
            {cellsIn(folder.id).map((c) => (
              <CellRow key={c.id} id={c.id} name={c.name} depth={depth + 1} />
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="explorer" onClick={(e) => e.stopPropagation()}>
        <div className="explorer-head">
          <h2 style={{ margin: 0, fontSize: 14 }}>Workspace</h2>
          <button className="btn sm" onClick={onClose} title="Close">✕</button>
        </div>
        <div className="explorer-actions">
          <button className="btn sm" onClick={() => newFolder(null)}>＋ Folder</button>
          <button className="btn sm" onClick={() => api.addCell(blankModel(), undefined, null)}>＋ Layout</button>
        </div>
        <div className="explorer-tree">
          {childFolders(null).map((f) => (
            <FolderNode key={f.id} folder={f} depth={0} />
          ))}
          {cellsIn(null).map((c) => (
            <CellRow key={c.id} id={c.id} name={c.name} depth={0} />
          ))}
        </div>
        <div style={{ fontSize: 10.5, color: TEXTD, marginTop: 8 }}>
          Folders organize layouts; deleting a folder keeps its contents (moved up one level).
        </div>
      </div>
    </div>
  );
}
