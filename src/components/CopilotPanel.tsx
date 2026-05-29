import { useMemo, useState } from "react";
import type { FlowPlanApi } from "../store/useFlowPlan";
import type { Settings } from "../store/settings";
import { getProvider } from "../ai/provider";
import type { Proposal, ProposalContext } from "../ai/types";
import { saveScenario } from "../store/scenarios";
import { useToast } from "./ui";
import { RED, TEAL, TEALD, TEXTD } from "./colors";

function Delta({ label, value }: { label: string; value: number }) {
  if (Math.abs(value) < 0.5) return null;
  const col = value > 0 ? TEAL : RED;
  return (
    <span className="pill" style={{ background: "rgba(255,255,255,.05)", color: col, marginRight: 4 }}>
      {label} {value > 0 ? "+" : ""}
      {value.toFixed(0)}
    </span>
  );
}

export function CopilotPanel({ api, settings, openSettings }: { api: FlowPlanApi; settings: Settings; openSettings: () => void }) {
  const { toast } = useToast();
  const provider = useMemo(() => getProvider(settings), [settings]);
  const ctx: ProposalContext = { model: api.model, rating: api.rating, validation: api.validation, chain: api.chain };

  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [narration, setNarration] = useState("");
  const [edit, setEdit] = useState("");
  const [ingest, setIngest] = useState("");

  async function run<T>(tag: string, fn: () => Promise<T>, after: (r: T) => void) {
    setBusy(tag);
    try {
      after(await fn());
    } catch (e) {
      toast((e as Error).message || "AI request failed", "err");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="pad">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div className="lab">Copilot · {provider.name.includes("Claude") ? "Claude" : "Offline"}</div>
        <button className="btn sm" onClick={openSettings}>
          ⚙ Settings
        </button>
      </div>
      <div style={{ fontSize: 10.5, color: TEXTD, marginBottom: 10, lineHeight: 1.5 }}>
        The AI proposes layouts and edits; every number below is computed by FlowPlan's engine, not the model.
      </div>

      <button
        className="btn"
        style={{ width: "100%", borderColor: TEALD, color: TEAL }}
        disabled={busy !== null}
        onClick={() => run("propose", () => provider.propose(ctx), setProposals)}
      >
        {busy === "propose" ? "Thinking…" : "✨ Propose layout improvements"}
      </button>

      {proposals.map((p) => (
        <div key={p.id} className="card" style={{ marginTop: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 600 }}>{p.title}</span>
            <span style={{ color: p.deltas.composite >= 0 ? TEAL : RED, fontSize: 12 }}>
              {p.deltas.composite >= 0 ? "+" : ""}
              {p.deltas.composite.toFixed(1)} pts
            </span>
          </div>
          <div style={{ fontSize: 10.5, color: TEXTD, marginBottom: 6, lineHeight: 1.5 }}>{p.rationale}</div>
          <div style={{ marginBottom: 8 }}>
            <Delta label="flow" value={p.deltas.flowCost} />
            <Delta label="bal" value={p.deltas.balance} />
            <Delta label="auto" value={p.deltas.auto} />
            <Delta label="ergo" value={p.deltas.ergo} />
            <span className="pill" style={{ background: "rgba(255,255,255,.05)", color: TEXTD }}>
              grade {p.after.letter}
            </span>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button
              className="btn sm"
              style={{ flex: 1, borderColor: TEALD, color: TEAL }}
              onClick={() => {
                api.commit({ type: "SET_MODEL", model: p.model });
                toast("Applied: " + p.title);
              }}
            >
              Apply
            </button>
            <button
              className="btn sm"
              onClick={() => {
                const name = p.title;
                saveScenario(name, p.model);
                toast("Saved as scenario “" + name + "”");
              }}
            >
              Save as scenario
            </button>
          </div>
        </div>
      ))}

      <div className="lab" style={{ margin: "16px 0 8px" }}>
        Narrate the rating
      </div>
      <button className="btn sm" disabled={busy !== null} onClick={() => run("narrate", () => provider.narrate(ctx), setNarration)}>
        {busy === "narrate" ? "Writing…" : "Explain this grade"}
      </button>
      {narration ? <div className="ok" style={{ marginTop: 8, cursor: "default", lineHeight: 1.6 }}>{narration}</div> : null}

      <div className="lab" style={{ margin: "16px 0 8px" }}>
        Edit in natural language
      </div>
      <textarea
        style={{ minHeight: 40, resize: "vertical" }}
        placeholder='e.g. "make the line a U" or "move QA next to Assembly"'
        value={edit}
        onChange={(e) => setEdit(e.target.value)}
      />
      <button
        className="btn sm"
        style={{ marginTop: 6 }}
        disabled={busy !== null || !edit.trim()}
        onClick={() =>
          run(
            "edit",
            () => provider.edit(ctx, edit),
            (res) => {
              if (res.unresolved && res.actions.length === 0) {
                toast(res.unresolved, "warn");
                return;
              }
              api.checkpoint();
              res.actions.forEach((a) => api.live(a));
              setEdit("");
              toast(res.summary || "Applied edit");
            },
          )
        }
      >
        {busy === "edit" ? "Working…" : "Apply instruction"}
      </button>

      <div className="lab" style={{ margin: "16px 0 8px" }}>
        Ingest a routing sheet
      </div>
      <textarea
        style={{ minHeight: 60, resize: "vertical" }}
        placeholder={"Paste CSV/TSV: name, cycle, operators, capacity, to\nRaw, 0, 0, 2000, CNC\nCNC, 42, 1, 1300, Press\n…"}
        value={ingest}
        onChange={(e) => setIngest(e.target.value)}
      />
      <button
        className="btn sm"
        style={{ marginTop: 6 }}
        disabled={busy !== null || !ingest.trim()}
        onClick={() =>
          run(
            "ingest",
            () => provider.ingest(ingest),
            (model) => {
              api.reset(model);
              setIngest("");
              toast("Built model from routing sheet");
            },
          )
        }
      >
        {busy === "ingest" ? "Parsing…" : "Build model from text"}
      </button>
    </div>
  );
}
