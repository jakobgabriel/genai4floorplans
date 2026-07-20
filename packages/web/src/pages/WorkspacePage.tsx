import { Button } from "@carbon/react";
import { Asleep, Light } from "@carbon/icons-react";
import type { FlowPlanApi } from "../store/useFlowPlan";
import type { CarbonTheme } from "../store/theme";
import { navigate } from "../store/useHashRoute";
import { Explorer } from "../components/Explorer";
import { TEXTD } from "../components/colors";

// Workspace-first: this is the app's entry point. A concept is one workspace
// item that contains one or more layouts; opening a layout enters the node-RED
// editor. The workspace is deliberately NOT reachable from inside the editor.
export function WorkspacePage({ api, onGuided, theme, onToggleTheme }: { api: FlowPlanApi; onGuided?: () => void; theme?: CarbonTheme; onToggleTheme?: () => void }) {
  const conceptCount = api.concepts.length;
  const layoutCount = api.cells.length;
  return (
    <div className="page">
      <div className="page-head">
        <h1 className="page-title">Workspace</h1>
        <div className="spacer" />
        {onGuided ? (
          <Button size="sm" kind="tertiary" onClick={onGuided} title="Plan a new concept with the guided wizard">
            ＋ New concept (guided)
          </Button>
        ) : null}
        <Button size="sm" kind="ghost" onClick={() => navigate("/site")} title="Site overview across all concepts">Site</Button>
        {onToggleTheme ? (
          <Button
            size="sm"
            kind="ghost"
            hasIconOnly
            renderIcon={theme === "g100" ? Light : Asleep}
            iconDescription={theme === "g100" ? "Switch to light theme" : "Switch to dark theme"}
            tooltipAlignment="end"
            onClick={onToggleTheme}
          />
        ) : null}
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
