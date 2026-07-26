import { Stack } from "@carbon/react";
import { PageHead } from "../components/PageHead";
import { Btn } from "../components/Btn";
import { Document } from "@carbon/icons-react";
import { navigate } from "../store/useHashRoute";
import {
  AutomationSection,
  BalanceSection,
  FlowCostSection,
  NoSteps,
  VerdictSection,
  YieldSection,
  stepCount,
  type PanelProps,
} from "../components/panels";
import { CostSection } from "../components/CostPanel";
import { WorkloadPanel } from "../components/WorkloadPanel";
import { CollapsibleSection } from "../components/CollapsibleSection";
import { ANALYSIS_PATH } from "../components/analysisPath";

/**
 * The assessment, at full width.
 *
 * It used to be a tab group inside the 360px editor rail — six numbered stages
 * with their own jump-nav, squeezed next to the canvas. That was wrong twice
 * over: the rail is for editing the thing on the canvas, and an assessment
 * crammed into a column that narrow needs scaffolding (a nav, a numbering
 * scheme) that only exists to survive the width.
 *
 * Given the page, the six stages are just sections. They read in two columns on
 * a wide screen and one on a narrow one, and the scaffolding is gone.
 *
 * Workload leads because everything below is derived from it: it states what
 * must be done, and the stages measure what that costs.
 */
export function AnalysisPage(props: PanelProps) {
  const { api, setSel, setTab } = props;
  const empty = stepCount(api) === 0;

  return (
    <div className="page anp">
      <PageHead
        title="Analysis"
        actions={
          <Btn size="compact" icon={Document} onClick={() => navigate("/report")}>
            Open report
          </Btn>
        }
      />
      {empty ? (
        <NoSteps reads="analysis" api={api} setSel={setSel} setTab={setTab} />
      ) : (
        <>
          {/* WorkloadPanel carries its own heading, so this section does not
              add a second one. */}
          <section className="anp__sec anp__sec--wide">
            <WorkloadPanel {...props} />
          </section>
          {/* Full-width, collapsible sections. Given the whole page (not the
              360px rail), each assessment stage gets the width its charts and
              tables need, and the reader can fold away the ones they are done
              with. */}
          <div className="anp__stack">
            {[
              <VerdictSection key="v" {...props} />,
              <FlowCostSection key="f" api={api} />,
              <BalanceSection key="b" api={api} setSel={setSel} setTab={setTab} />,
              <YieldSection key="y" api={api} />,
              <AutomationSection key="a" api={api} setSel={setSel} setTab={setTab} />,
              <CostSection key="c" api={api} setSel={setSel} setTab={setTab} />,
            ].map((body, i) => (
              <CollapsibleSection key={ANALYSIS_PATH[i].id} id={"an-" + ANALYSIS_PATH[i].id} title={ANALYSIS_PATH[i].title}>
                <Stack gap={5}>{body}</Stack>
              </CollapsibleSection>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
