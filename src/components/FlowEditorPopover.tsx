import type { Flow } from "../model/types";
import { TRANSPORT } from "../model/types";
import type { FlowPlanApi } from "../store/useFlowPlan";
import { Field } from "./ui";
import { RED } from "./colors";

// Inline editor for a flow selected on the canvas.
export function FlowEditorPopover({
  api,
  flow,
  onClose,
}: {
  api: FlowPlanApi;
  flow: { from: string; to: string };
  onClose: () => void;
}) {
  const f = api.model.flows.find((x) => x.from === flow.from && x.to === flow.to);
  if (!f) return null;
  const src = api.model.stations.find((x) => x.id === f.from);
  const dst = api.model.stations.find((x) => x.id === f.to);
  const isDistribute = (src?.splitMode ?? "distribute") === "distribute" && api.model.flows.filter((x) => x.from === f.from).length > 1;
  const isAssemble = (dst?.mergeMode ?? "sum") === "assemble";
  return (
    <div
      style={{
        position: "absolute",
        right: 12,
        top: 12,
        zIndex: 25,
        width: 210,
        background: "var(--panel2)",
        border: "1px solid var(--line)",
        borderRadius: 8,
        padding: 12,
        boxShadow: "0 6px 20px rgba(0,0,0,.45)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ fontSize: 11.5 }}>
          {f.from} → {f.to}
        </span>
        <button className="btn sm" onClick={onClose}>
          ✕
        </button>
      </div>
      <Field label="Volume (parts/shift)">
        <input
          type="number"
          value={f.volume}
          onFocus={api.checkpoint}
          onChange={(e) => api.live({ type: "UPDATE_FLOW", from: f.from, to: f.to, patch: { volume: +e.target.value } })}
        />
      </Field>
      <Field label="Unit cost / distance">
        <input
          type="number"
          step="0.01"
          value={f.unitCost}
          onFocus={api.checkpoint}
          onChange={(e) => api.live({ type: "UPDATE_FLOW", from: f.from, to: f.to, patch: { unitCost: +e.target.value } })}
        />
      </Field>
      <Field label="Transport">
        <select
          value={f.transport}
          onChange={(e) => api.commit({ type: "UPDATE_FLOW", from: f.from, to: f.to, patch: { transport: e.target.value as Flow["transport"] } })}
        >
          {TRANSPORT.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </Field>
      {isDistribute ? (
        <Field label="Split share (%)">
          <input
            type="number"
            min={0}
            max={100}
            value={f.share != null ? Math.round(f.share * 100) : ""}
            placeholder="equal"
            onFocus={api.checkpoint}
            onChange={(e) => api.live({ type: "UPDATE_FLOW", from: f.from, to: f.to, patch: { share: e.target.value === "" ? undefined : Math.max(0, Math.min(100, +e.target.value)) / 100 } })}
          />
        </Field>
      ) : null}
      {isAssemble ? (
        <Field label="Units per assembly">
          <input
            type="number"
            min={1}
            value={f.unitsPerAssembly ?? 1}
            onFocus={api.checkpoint}
            onChange={(e) => api.live({ type: "UPDATE_FLOW", from: f.from, to: f.to, patch: { unitsPerAssembly: Math.max(1, Math.round(+e.target.value)) } })}
          />
        </Field>
      ) : null}
      <button
        className="btn sm"
        style={{ width: "100%", borderColor: RED, color: RED, marginTop: 4 }}
        onClick={() => {
          api.commit({ type: "REMOVE_FLOW", from: f.from, to: f.to });
          onClose();
        }}
      >
        Delete flow
      </button>
    </div>
  );
}
