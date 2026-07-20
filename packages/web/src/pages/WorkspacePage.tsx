import type { FlowPlanApi } from "../store/useFlowPlan";
import { navigate } from "../store/useHashRoute";
import { Explorer } from "../components/Explorer";

// The workspace (folders + layouts) is a GLOBAL surface, not part of the flow
// editor — where it was a distraction. Opening a layout returns to the editor.
export function WorkspacePage({ api }: { api: FlowPlanApi }) {
  return (
    <div className="page">
      <div className="page-head">
        <button className="btn sm" onClick={() => navigate("/")}>← Editor</button>
        <h1 className="page-title">Workspace</h1>
      </div>
      <div style={{ maxWidth: 640 }}>
        <Explorer api={api} onOpenCell={() => navigate("/")} />
      </div>
    </div>
  );
}
