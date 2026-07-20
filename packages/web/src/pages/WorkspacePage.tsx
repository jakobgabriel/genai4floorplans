import { Button } from "@carbon/react";
import { Add } from "@carbon/icons-react";
import type { FlowPlanApi } from "../store/useFlowPlan";
import { navigate } from "../store/useHashRoute";
import { Explorer } from "../components/Explorer";

// Workspace-first: this is the app's entry point. A concept is one workspace
// item that contains one or more layouts; opening a layout enters the node-RED
// editor. The workspace is deliberately NOT reachable from inside the editor.
// The top bar (brand, nav, theme) is the shared AppHeader; this renders only the
// page body.
export function WorkspacePage({ api, onGuided }: { api: FlowPlanApi; onGuided?: () => void }) {
  const conceptCount = api.concepts.length;
  const layoutCount = api.cells.length;
  return (
    <div className="page">
      <div className="page-head">
        <h1 className="page-title">Workspace</h1>
        <div className="spacer" />
        {onGuided ? (
          <Button size="sm" kind="tertiary" renderIcon={Add} onClick={onGuided} title="Plan a new concept with the guided wizard">
            New concept (guided)
          </Button>
        ) : null}
      </div>
      <p className="page-sub">
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
