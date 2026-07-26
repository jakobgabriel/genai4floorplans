import { PageHead } from "../components/PageHead";
import { AiChatPanel } from "../components/AiChatPanel";
import type { FlowPlanApi } from "../store/useFlowPlan";
import type { Settings } from "../store/settings";

/**
 * The assistant, at full width.
 *
 * It was a tab in the editor rail, which put a conversation and a proposal list
 * in a 360px column beside the canvas it talks about. The rail is for editing
 * the selected step; this is not that.
 */
export function AssistantPage({
  api,
  settings,
  openSettings,
}: {
  api: FlowPlanApi;
  settings: Settings;
  openSettings: () => void;
}) {
  return (
    <div className="page asp">
      <PageHead title="Assistant" />
      <AiChatPanel api={api} settings={settings} openSettings={openSettings} />
    </div>
  );
}
