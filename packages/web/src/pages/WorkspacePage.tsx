import type { FlowPlanApi } from "../store/useFlowPlan";
import { navigate } from "../store/useHashRoute";
import { Explorer } from "../components/Explorer";
import { TEXTD } from "../components/colors";

// Workspace-first: this is the app's entry point. A concept is one workspace
// item that contains one or more layouts; opening a layout enters the node-RED
// editor. The workspace is deliberately NOT reachable from inside the editor.
export function WorkspacePage({ api, onGuided }: { api: FlowPlanApi; onGuided?: () => void }) {
  const conceptCount = api.concepts.length;
  const layoutCount = api.cells.length;
  return (
    <div className="page">
      <div className="page-head">
        <h1 className="page-title">Workspace</h1>
        <div className="spacer" />
        {onGuided ? (
          <button className="btn sm" onClick={onGuided} title="Plan a new concept with the guided wizard">
            ＋ New concept (guided)
          </button>
        ) : null}
        <button className="btn sm" onClick={() => navigate("/site")} title="Site overview across all concepts">Site</button>
      </div>
      <p style={{ fontSize: 12, color: TEXTD, maxWidth: 620, marginTop: 0 }}>
        {conceptCount} concept{conceptCount === 1 ? "" : "s"} · {layoutCount} layout{layoutCount === 1 ? "" : "s"}.
        A <strong>concept</strong> is one manufacturing concept; each holds one or more <strong>layouts</strong> —
        alternative arrangements you compare. Open a layout to enter the editor.
      </p>
      <div style={{ maxWidth: 640 }}>
        <Explorer api={api} onOpenCell={() => navigate("/")} />
      </div>
    </div>
  );
}
