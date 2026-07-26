import { useState } from "react";
import { Modal, Select, SelectItem, TextInput, ComboBox } from "@carbon/react";
import { type AiProviderId, type Settings, saveSettings } from "../store/settings";

const PROVIDER_META: Record<Exclude<AiProviderId, "offline">, { label: string; vendor: string; keyLabel: string; placeholder: string; models: string[] }> = {
  claude: {
    label: "Claude API",
    vendor: "Anthropic",
    keyLabel: "Anthropic API key",
    placeholder: "sk-ant-…",
    models: ["claude-sonnet-4-6", "claude-opus-4-6", "claude-haiku-4-5-20251001"],
  },
  openai: {
    label: "OpenAI API",
    vendor: "OpenAI",
    keyLabel: "OpenAI API key",
    placeholder: "sk-…",
    models: ["gpt-4o", "gpt-4o-mini", "gpt-4.1"],
  },
};

// AI provider settings. Keys live in localStorage only and are sent directly to
// the chosen vendor from the browser. Each provider remembers its own key/model.
// Carbon Modal + Select/TextInput(password)/ComboBox instead of the old custom
// .overlay/.modal and raw form controls.
export function SettingsModal({ initial, onClose, onSaved }: { initial: Settings; onClose: () => void; onSaved: (s: Settings) => void }) {
  const [s, setS] = useState<Settings>(initial);
  const cloud = s.aiProvider === "offline" ? null : PROVIDER_META[s.aiProvider];
  const provider = s.aiProvider === "offline" ? null : s.aiProvider;
  return (
    <Modal
      open
      modalHeading="Settings"
      primaryButtonText="Save"
      secondaryButtonText="Cancel"
      onRequestClose={onClose}
      onRequestSubmit={() => {
        saveSettings(s);
        onSaved(s);
        onClose();
      }}
    >
      <p style={{ marginBottom: "var(--cds-spacing-05)" }}>
        Configure AI Chat. The offline strategist always works; add a Claude or OpenAI key to use an LLM, scored by the same engine.
      </p>
      <Select
        id="ai-provider"
        labelText="AI provider"
        value={s.aiProvider}
        onChange={(e) => setS({ ...s, aiProvider: e.target.value as AiProviderId })}
      >
        <SelectItem value="offline" text="Offline strategist (no key)" />
        <SelectItem value="claude" text="Claude API" />
        <SelectItem value="openai" text="OpenAI API" />
      </Select>
      {cloud && provider ? (
        <>
          <div style={{ marginTop: "var(--cds-spacing-05)" }}>
            <TextInput
              id="ai-key"
              type="password"
              labelText={cloud.keyLabel}
              placeholder={cloud.placeholder}
              value={s.keys[provider]}
              onChange={(e) => setS({ ...s, keys: { ...s.keys, [provider]: e.target.value } })}
            />
          </div>
          <div style={{ marginTop: "var(--cds-spacing-05)" }}>
            <ComboBox
              id="ai-model"
              titleText="Model"
              allowCustomValue
              items={cloud.models}
              selectedItem={s.models[provider]}
              onChange={({ selectedItem }: { selectedItem?: string | null }) => setS({ ...s, models: { ...s.models, [provider]: selectedItem ?? "" } })}
              onInputChange={(value: string) => setS({ ...s, models: { ...s.models, [provider]: value } })}
            />
          </div>
          <p style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary)", lineHeight: 1.5, marginTop: "var(--cds-spacing-05)" }}>
            The key is stored only in this browser and sent directly to {cloud.vendor} (direct browser access). All AI output is
            re-validated and re-scored by FlowPlan's engine — the model never sets your KPIs.
          </p>
        </>
      ) : null}
    </Modal>
  );
}
