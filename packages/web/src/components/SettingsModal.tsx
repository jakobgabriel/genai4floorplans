import { useState } from "react";
import { Modal } from "@carbon/react";
import { type AiProviderId, type Settings, saveSettings } from "../store/settings";
import { Field } from "./ui";

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
export function SettingsModal({ initial, onClose, onSaved }: { initial: Settings; onClose: () => void; onSaved: (s: Settings) => void }) {
  const [s, setS] = useState<Settings>(initial);
  const cloud = s.aiProvider === "offline" ? null : PROVIDER_META[s.aiProvider];
  const provider = s.aiProvider === "offline" ? null : s.aiProvider;
  return (
    <Modal
      open
      modalHeading="Settings"
      primaryButtonText="Save settings"
      secondaryButtonText="Cancel"
      onRequestClose={onClose}
      onRequestSubmit={() => {
        saveSettings(s);
        onSaved(s);
        onClose();
      }}
    >
      <p>Configure AI Chat. The offline strategist always works; add a Claude or OpenAI key to use an LLM, scored by the same engine.</p>
      <Field label="AI provider">
          <select value={s.aiProvider} onChange={(e) => setS({ ...s, aiProvider: e.target.value as AiProviderId })}>
            <option value="offline">Offline strategist (no key)</option>
            <option value="claude">Claude API</option>
            <option value="openai">OpenAI API</option>
          </select>
        </Field>
        {cloud && provider ? (
          <>
            <Field label={cloud.keyLabel}>
              <input
                type="password"
                placeholder={cloud.placeholder}
                value={s.keys[provider]}
                onChange={(e) => setS({ ...s, keys: { ...s.keys, [provider]: e.target.value } })}
              />
            </Field>
            <Field label="Model">
              <input
                list={`models-${provider}`}
                value={s.models[provider]}
                onChange={(e) => setS({ ...s, models: { ...s.models, [provider]: e.target.value } })}
              />
              <datalist id={`models-${provider}`}>
                {cloud.models.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
            </Field>
            <div className="u-caption">
              The key is stored only in this browser and sent directly to {cloud.vendor} (direct browser access). All AI output is
              re-validated and re-scored by FlowPlan's engine — the model never sets your KPIs.
            </div>
          </>
        ) : null}
    </Modal>
  );
}
