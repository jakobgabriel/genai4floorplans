import { useMemo } from "react";
import { Btn } from "../components/Btn";
import type { FlowPlanApi } from "../store/useFlowPlan";
import { PageHead } from "../components/PageHead";
import { ConfirmableButton } from "../components/ConfirmableButton";

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

  const empty = api.archivedCells.length === 0 && api.archivedFolders.length === 0;

  return (
    <div className="page">
      <PageHead title="Archive" />

      {empty ? (
        <p className="u-muted">Nothing archived. Archive a layout or folder from the workspace sidebar.</p>
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
                      <td className="u-muted">{folderName(f.parentId) || "Workspace root"}</td>
                      <td className="u-row">
                        <Btn size="compact" variant="ghost" onClick={() => api.restoreFolder(f.id)}>Restore</Btn>
                        <ConfirmableButton label="Delete" confirmLabel="Delete forever" danger onConfirm={() => api.purgeFolder(f.id)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="u-caption">Restoring a folder brings back the folder only — restore its layouts below. Permanent delete removes both.</div>
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
                      <td className="u-muted">{folderName(c.folderId) || "Workspace root"}</td>
                      <td className="u-row">
                        <Btn size="compact" variant="ghost" onClick={() => api.restoreCell(c.id)}>Restore</Btn>
                        <ConfirmableButton label="Delete" confirmLabel="Delete forever" danger onConfirm={() => api.purgeCell(c.id)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="u-caption">A restored layout returns to its folder, or to the root if that folder is gone.</div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
