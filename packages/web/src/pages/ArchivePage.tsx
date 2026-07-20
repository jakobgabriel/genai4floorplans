import { useMemo } from "react";
import { Button, StructuredListWrapper, StructuredListHead, StructuredListBody, StructuredListRow, StructuredListCell } from "@carbon/react";
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
              <StructuredListWrapper isCondensed>
                <StructuredListHead><StructuredListRow head><StructuredListCell head>Folder</StructuredListCell><StructuredListCell head>Location</StructuredListCell><StructuredListCell head></StructuredListCell></StructuredListRow></StructuredListHead>
                <StructuredListBody>
                  {api.archivedFolders.map((f) => (
                    <StructuredListRow key={f.id}>
                      <StructuredListCell>🗀 {f.name}</StructuredListCell>
                      <StructuredListCell style={{ color: TEXTD }}>{folderName(f.parentId) || "Workspace root"}</StructuredListCell>
                      <StructuredListCell style={{ display: "flex", gap: 6 }}>
                        <Button size="sm" kind="tertiary" onClick={() => api.restoreFolder(f.id)}>Restore</Button>
                        <ConfirmableButton label="Delete" confirmLabel="Delete forever" danger onConfirm={() => api.purgeFolder(f.id)} />
                      </StructuredListCell>
                    </StructuredListRow>
                  ))}
                </StructuredListBody>
              </StructuredListWrapper>
              <div style={{ fontSize: 10.5, color: TEXTD }}>Restoring a folder brings back the folder; restore its layouts individually below. Permanent delete removes the folder and everything still archived inside it.</div>
            </div>
          ) : null}

          {api.archivedConcepts.length > 0 ? (
            <div className="chart-card">
              <div className="layoutTitle">Archived concepts</div>
              <StructuredListWrapper isCondensed>
                <StructuredListHead><StructuredListRow head><StructuredListCell head>Concept</StructuredListCell><StructuredListCell head>Location</StructuredListCell><StructuredListCell head></StructuredListCell></StructuredListRow></StructuredListHead>
                <StructuredListBody>
                  {api.archivedConcepts.map((c) => (
                    <StructuredListRow key={c.id}>
                      <StructuredListCell>◈ {c.name}</StructuredListCell>
                      <StructuredListCell style={{ color: TEXTD }}>{folderName(c.folderId) || "Workspace root"}</StructuredListCell>
                      <StructuredListCell style={{ display: "flex", gap: 6 }}>
                        <Button size="sm" kind="tertiary" onClick={() => api.restoreConcept(c.id)}>Restore</Button>
                        <ConfirmableButton label="Delete" confirmLabel="Delete forever" danger onConfirm={() => api.purgeConcept(c.id)} />
                      </StructuredListCell>
                    </StructuredListRow>
                  ))}
                </StructuredListBody>
              </StructuredListWrapper>
              <div style={{ fontSize: 10.5, color: TEXTD }}>Restoring a concept brings back the concept and all its layouts.</div>
            </div>
          ) : null}

          {api.archivedCells.length > 0 ? (
            <div className="chart-card">
              <div className="layoutTitle">Archived layouts</div>
              <StructuredListWrapper isCondensed>
                <StructuredListHead><StructuredListRow head><StructuredListCell head>Layout</StructuredListCell><StructuredListCell head>Was in</StructuredListCell><StructuredListCell head></StructuredListCell></StructuredListRow></StructuredListHead>
                <StructuredListBody>
                  {api.archivedCells.map((c) => (
                    <StructuredListRow key={c.id}>
                      <StructuredListCell>▦ {c.name}</StructuredListCell>
                      <StructuredListCell style={{ color: TEXTD }}>{folderName(c.folderId) || "Workspace root"}</StructuredListCell>
                      <StructuredListCell style={{ display: "flex", gap: 6 }}>
                        <Button size="sm" kind="tertiary" onClick={() => api.restoreCell(c.id)}>Restore</Button>
                        <ConfirmableButton label="Delete" confirmLabel="Delete forever" danger onConfirm={() => api.purgeCell(c.id)} />
                      </StructuredListCell>
                    </StructuredListRow>
                  ))}
                </StructuredListBody>
              </StructuredListWrapper>
              <div style={{ fontSize: 10.5, color: TEXTD }}>A restored layout returns to its folder (or the root if that folder is gone).</div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
