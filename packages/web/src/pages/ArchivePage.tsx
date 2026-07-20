import { useMemo } from "react";
import { Button } from "@carbon/react";
import { ArrowLeft } from "@carbon/icons-react";
import type { FlowPlanApi } from "../store/useFlowPlan";
import { navigate } from "../store/useHashRoute";
import { ConfirmableButton } from "../components/ConfirmableButton";
import { TEXTD } from "../components/colors";

// Dedicated page listing archived layouts and folders, with restore and
// permanent-delete. Archiving is recoverable; permanent delete is confirmed.
export function ArchivePage({ api }: { api: FlowPlanApi }) {
  const folderName = useMemo(() => {
    const all = [...api.folders, ...api.archivedFolders];
    const byId = new Map(all.map((f) => [f.id, f]));
    return (id: string | null): string => {
      const parts: string[] = [];
      let cur = id;
      while (cur) { const f = byId.get(cur); if (!f) break; parts.unshift(f.name); cur = f.parentId; }
      return parts.join(" / ");
    };
  }, [api.folders, api.archivedFolders]);

  const empty = api.archivedCells.length === 0 && api.archivedFolders.length === 0 && api.archivedConcepts.length === 0;

  return (
    <div className="page">
      <div className="page-head">
        <Button size="sm" kind="ghost" renderIcon={ArrowLeft} onClick={() => navigate("/")}>Editor</Button>
        <h1 className="page-title">Archive</h1>
      </div>

      {empty ? (
        <p style={{ color: TEXTD }}>Nothing archived. Archive a layout or folder from the workspace sidebar to recover it here later.</p>
      ) : (
        <>
          {api.archivedFolders.length > 0 ? (
            <div className="chart-card">
              <div className="layoutTitle">Archived folders</div>
              <table className="schemaTbl">
                <thead><tr><th>Folder</th><th>Location</th><th></th></tr></thead>
                <tbody>
                  {api.archivedFolders.map((f) => (
                    <tr key={f.id}>
                      <td>🗀 {f.name}</td>
                      <td style={{ color: TEXTD }}>{folderName(f.parentId) || "Workspace root"}</td>
                      <td style={{ display: "flex", gap: 6 }}>
                        <Button size="sm" kind="tertiary" onClick={() => api.restoreFolder(f.id)}>Restore</Button>
                        <ConfirmableButton label="Delete" confirmLabel="Delete forever" danger onConfirm={() => api.purgeFolder(f.id)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ fontSize: 10.5, color: TEXTD }}>Restoring a folder brings back the folder; restore its layouts individually below. Permanent delete removes the folder and everything still archived inside it.</div>
            </div>
          ) : null}

          {api.archivedConcepts.length > 0 ? (
            <div className="chart-card">
              <div className="layoutTitle">Archived concepts</div>
              <table className="schemaTbl">
                <thead><tr><th>Concept</th><th>Location</th><th></th></tr></thead>
                <tbody>
                  {api.archivedConcepts.map((c) => (
                    <tr key={c.id}>
                      <td>◈ {c.name}</td>
                      <td style={{ color: TEXTD }}>{folderName(c.folderId) || "Workspace root"}</td>
                      <td style={{ display: "flex", gap: 6 }}>
                        <Button size="sm" kind="tertiary" onClick={() => api.restoreConcept(c.id)}>Restore</Button>
                        <ConfirmableButton label="Delete" confirmLabel="Delete forever" danger onConfirm={() => api.purgeConcept(c.id)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ fontSize: 10.5, color: TEXTD }}>Restoring a concept brings back the concept and all its layouts.</div>
            </div>
          ) : null}

          {api.archivedCells.length > 0 ? (
            <div className="chart-card">
              <div className="layoutTitle">Archived layouts</div>
              <table className="schemaTbl">
                <thead><tr><th>Layout</th><th>Was in</th><th></th></tr></thead>
                <tbody>
                  {api.archivedCells.map((c) => (
                    <tr key={c.id}>
                      <td>▦ {c.name}</td>
                      <td style={{ color: TEXTD }}>{folderName(c.folderId) || "Workspace root"}</td>
                      <td style={{ display: "flex", gap: 6 }}>
                        <Button size="sm" kind="tertiary" onClick={() => api.restoreCell(c.id)}>Restore</Button>
                        <ConfirmableButton label="Delete" confirmLabel="Delete forever" danger onConfirm={() => api.purgeCell(c.id)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ fontSize: 10.5, color: TEXTD }}>A restored layout returns to its folder (or the root if that folder is gone).</div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
