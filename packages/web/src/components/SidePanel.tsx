import { useCallback, useState } from "react";
import { Close } from "@carbon/icons-react";
import type { FlowPlanApi } from "../store/useFlowPlan";
import type { LibraryApi } from "../store/library";
import type { LibraryProcess } from "@flowplan/core/model/library";
import { Explorer } from "./Explorer";
import { LibraryPanel } from "./LibraryPanel";
import { IconBtn, TabBtn } from "./Btn";

/**
 * The left drawer: the planner's own material, in two halves.
 *
 * It used to be the workspace tree and nothing else, and it used to be a
 * permanent column — collapsing it left a vertical rail strip still taking
 * width beside the canvas. Two problems in one panel: it was always there, and
 * what it held was only ever saved layouts, so the processes a plant knows how
 * to do had nowhere to live at all.
 *
 * It overlays the canvas now, so closing it gives the drawing surface the whole
 * width, and it carries the process library beside the layouts.
 */
export type SideTab = "layouts" | "processes";

export function SidePanel({
  api,
  lib,
  tab,
  setTab,
  onClose,
  onUseProcess,
}: {
  api: FlowPlanApi;
  lib: LibraryApi;
  tab: SideTab;
  setTab: (t: SideTab) => void;
  onClose: () => void;
  onUseProcess: (p: LibraryProcess) => void;
}) {
  return (
    <div className="explorer">
      <div className="explorer-head">
        <div className="side-tabs" role="tablist" aria-label="Workspace">
          <TabBtn selected={tab === "layouts"} onClick={() => setTab("layouts")}>
            Layouts
          </TabBtn>
          <TabBtn selected={tab === "processes"} onClick={() => setTab("processes")}>
            Processes
          </TabBtn>
        </div>
        <IconBtn size="compact" icon={Close} label="Close the panel" tooltipPosition="left" onClick={onClose} />
      </div>
      {tab === "layouts" ? (
        <Explorer api={api} />
      ) : (
        <LibraryPanel lib={lib} onUse={onUseProcess} useLabel="Add to cell" />
      )}
    </div>
  );
}

/** Which half of the drawer is showing, remembered across sessions. */
export function useSideTab(): [SideTab, (t: SideTab) => void] {
  const [tab, setTab] = useState<SideTab>(() =>
    localStorage.getItem("flowplan_side_tab") === "processes" ? "processes" : "layouts",
  );
  const set = useCallback((t: SideTab) => {
    localStorage.setItem("flowplan_side_tab", t);
    setTab(t);
  }, []);
  return [tab, set];
}
