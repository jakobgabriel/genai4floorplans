import { useState } from "react";
import { type Settings, saveSettings } from "../store/settings";
import { Field } from "./ui";
import { TEXTD } from "./colors";

// AI provider settings. The key lives in localStorage only and is sent directly
// to Anthropic from the browser when the Claude provider is selected.
export function SettingsModal({ initial, onClose, onSaved }: { initial: Settings; onClose: () => void; onSaved: (s: Settings) => void }) {
  const [s, setS] = useState<Settings>(initial);
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Settings</h2>
        <p>Configure the Copilot. The offline strategist always works; add a Claude key to use the LLM, scored by the same engine.</p>
        <Field label="AI provider">
          <select value={s.aiProvider} onChange={(e) => setS({ ...s, aiProvider: e.target.value as Settings["aiProvider"] })}>
            <option value="offline">Offline strategist (no key)</option>
            <option value="claude">Claude API</option>
          </select>
        </Field>
        {s.aiProvider === "claude" ? (
          <>
            <Field label="Anthropic API key">
              <input type="password" placeholder="sk-ant-…" value={s.apiKey} onChange={(e) => setS({ ...s, apiKey: e.target.value })} />
            </Field>
            <Field label="Model">
              <input value={s.model} onChange={(e) => setS({ ...s, model: e.target.value })} />
            </Field>
            <div style={{ fontSize: 10.5, color: TEXTD, lineHeight: 1.5, marginBottom: 10 }}>
              The key is stored only in this browser and sent directly to Anthropic (direct browser access). All AI output is
              re-validated and re-scored by FlowPlan's engine — the model never sets your KPIs.
            </div>
          </>
        ) : null}
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn" style={{ flex: 1 }} onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn on"
            style={{ flex: 1 }}
            onClick={() => {
              saveSettings(s);
              onSaved(s);
              onClose();
            }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
