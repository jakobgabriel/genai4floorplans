import { useMemo, useRef, useState } from "react";
import type { Model } from "../model/types";
import type { FlowPlanApi } from "../store/useFlowPlan";
import type { Settings } from "../store/settings";
import { getProvider } from "../ai/provider";
import type { GoalObjective, GoalResult, Proposal, ProposalContext } from "../ai/types";
import { saveScenario } from "../store/scenarios";
import { Field, useToast } from "./ui";
import { AMBER, RED, TEAL, TEALD, TEXTD } from "./colors";

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

interface ChatMsg {
  role: "user" | "ai";
  text: string;
}

const OBJECTIVES: Array<[GoalObjective, string]> = [
  ["throughput", "Maximize throughput (parts/shift)"],
  ["composite", "Maximize overall grade"],
  ["flowCost", "Minimize material-flow cost"],
  ["costPerPart", "Minimize cost per part"],
];

export function AiChatPanel({ api, settings, openSettings }: { api: FlowPlanApi; settings: Settings; openSettings: () => void }) {
  const { toast } = useToast();
  const provider = useMemo(() => getProvider(settings), [settings]);
  const isClaude = provider.name.includes("Claude");
  const ctx: ProposalContext = { model: api.model, rating: api.rating, validation: api.validation, chain: api.chain };

  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [chat, setChat] = useState<ChatMsg[]>([]);
  const [edit, setEdit] = useState("");
  const [design, setDesign] = useState("");
  const [ingest, setIngest] = useState("");
  const [goal, setGoal] = useState<{ objective: GoalObjective; target: string; moves: boolean; parallel: boolean; automate: boolean; budget: string }>({
    objective: "throughput",
    target: "",
    moves: true,
    parallel: true,
    automate: false,
    budget: "",
  });
  const [goalRes, setGoalRes] = useState<GoalResult | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

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

  function applyModel(model: Model, msg: string) {
    api.commit({ type: "SET_MODEL", model });
    toast(msg);
  }

  return (
    <div className="pad">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div className="lab">AI Chat · {isClaude ? "Claude" : "Offline"}</div>
        <button className="btn sm" onClick={openSettings}>
          ⚙ Settings
        </button>
      </div>
      <div style={{ fontSize: 10.5, color: TEXTD, marginBottom: 10, lineHeight: 1.5 }}>
        Ask, instruct, or set a goal. The AI proposes; every number is computed by FlowPlan's engine, not the model.
      </div>

      {chat.length > 0 ? (
        <div style={{ marginBottom: 8, maxHeight: 180, overflow: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
          {chat.map((m, i) => (
            <div key={i} className={m.role === "ai" ? "ok" : "card"} style={{ cursor: "default", fontSize: 11.5, alignSelf: m.role === "user" ? "flex-end" : "stretch", maxWidth: "92%" }}>
              {m.text}
            </div>
          ))}
        </div>
      ) : null}
      <textarea
        style={{ minHeight: 40, resize: "vertical" }}
        placeholder={'Instruct: "make the line a U", "move QA next to Assembly", "automate CNC"'}
        value={edit}
        onChange={(e) => setEdit(e.target.value)}
      />
      <button
        className="btn sm"
        style={{ marginTop: 6, width: "100%" }}
        disabled={busy !== null || !edit.trim()}
        onClick={() => {
          const instruction = edit.trim();
          setChat((c) => c.concat([{ role: "user", text: instruction }]));
          setEdit("");
          run(
            "edit",
            () => provider.edit(ctx, instruction),
            (res) => {
              if (res.actions.length === 0) {
                setChat((c) => c.concat([{ role: "ai", text: res.unresolved || "Nothing to apply." }]));
                return;
              }
              api.checkpoint();
              res.actions.forEach((a) => api.live(a));
              setChat((c) => c.concat([{ role: "ai", text: res.summary || "Applied." }]));
            },
          );
        }}
      >
        {busy === "edit" ? "Working…" : "Send"}
      </button>

      <button
        className="btn"
        style={{ width: "100%", borderColor: TEALD, color: TEAL, marginTop: 12 }}
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
            <button className="btn sm" style={{ flex: 1, borderColor: TEALD, color: TEAL }} onClick={() => applyModel(p.model, "Applied: " + p.title)}>
              Apply
            </button>
            <button className="btn sm" onClick={() => { saveScenario(p.title, p.model); toast("Saved as scenario " + p.title); }}>
              Save as scenario
            </button>
          </div>
        </div>
      ))}

      <div className="lab" style={{ margin: "16px 0 8px" }}>
        Goal-driven optimization
      </div>
      <Field label="Objective">
        <select value={goal.objective} onChange={(e) => setGoal({ ...goal, objective: e.target.value as GoalObjective })}>
          {OBJECTIVES.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </Field>
      <div className="row2">
        <Field label="Target (optional)">
          <input type="number" value={goal.target} placeholder="e.g. 900" onChange={(e) => setGoal({ ...goal, target: e.target.value })} />
        </Field>
        <Field label="Capex budget (opt.)">
          <input type="number" value={goal.budget} placeholder="none" onChange={(e) => setGoal({ ...goal, budget: e.target.value })} />
        </Field>
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", fontSize: 11, marginBottom: 8 }}>
        <label style={{ display: "flex", gap: 4, alignItems: "center" }}>
          <input type="checkbox" style={{ width: "auto" }} checked={goal.moves} onChange={(e) => setGoal({ ...goal, moves: e.target.checked })} /> moves
        </label>
        <label style={{ display: "flex", gap: 4, alignItems: "center" }}>
          <input type="checkbox" style={{ width: "auto" }} checked={goal.parallel} onChange={(e) => setGoal({ ...goal, parallel: e.target.checked })} /> parallel lanes
        </label>
        <label style={{ display: "flex", gap: 4, alignItems: "center" }}>
          <input type="checkbox" style={{ width: "auto" }} checked={goal.automate} onChange={(e) => setGoal({ ...goal, automate: e.target.checked })} /> automate
        </label>
      </div>
      <button
        className="btn sm"
        style={{ width: "100%" }}
        disabled={busy !== null}
        onClick={() =>
          run(
            "goal",
            () =>
              provider.optimizeGoal(ctx, {
                objective: goal.objective,
                target: goal.target ? +goal.target : undefined,
                constraints: {
                  allowMoves: goal.moves,
                  allowParallel: goal.parallel,
                  allowAutomate: goal.automate,
                  capexBudget: goal.budget ? +goal.budget : undefined,
                },
              }),
            setGoalRes,
          )
        }
      >
        {busy === "goal" ? "Searching…" : "Find a plan"}
      </button>
      {goalRes ? (
        <div className="card" style={{ marginTop: 8 }}>
          <div style={{ fontSize: 11.5, marginBottom: 6, color: goalRes.reached ? TEAL : AMBER }}>{goalRes.message}</div>
          {goalRes.steps.map((s, i) => (
            <div key={i} style={{ fontSize: 11, display: "flex", justifyContent: "space-between" }}>
              <span>
                {i + 1}. {s.action}
              </span>
              <span style={{ color: TEXTD }}>{s.metric.toLocaleString()}</span>
            </div>
          ))}
          {goalRes.proposal ? (
            <button className="btn sm" style={{ width: "100%", marginTop: 8, borderColor: TEALD, color: TEAL }} onClick={() => applyModel(goalRes.proposal!.model, "Applied the plan")}>
              Apply plan
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="lab" style={{ margin: "16px 0 8px" }}>
        Narrate the rating
      </div>
      <button className="btn sm" disabled={busy !== null} onClick={() => run("narrate", () => provider.narrate(ctx), (t) => setChat((c) => c.concat([{ role: "ai", text: t }])))}>
        {busy === "narrate" ? "Writing…" : "Explain this grade"}
      </button>

      <div className="lab" style={{ margin: "16px 0 8px" }}>
        Design a cell from a brief
      </div>
      <textarea
        style={{ minHeight: 44, resize: "vertical" }}
        placeholder={"e.g. Raw -> CNC x2 -> Press -> Assembly -> QA -> Ship"}
        value={design}
        onChange={(e) => setDesign(e.target.value)}
      />
      <button
        className="btn sm"
        style={{ marginTop: 6 }}
        disabled={busy !== null || !design.trim()}
        onClick={() => run("design", () => provider.design(design), (model) => { applyModel(model, "Designed a new cell"); setDesign(""); })}
      >
        {busy === "design" ? "Designing…" : "Generate cell"}
      </button>

      <div className="lab" style={{ margin: "16px 0 8px" }}>
        From a photo (vision)
      </div>
      {isClaude ? (
        <>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              const rd = new FileReader();
              rd.onload = () => {
                const dataUrl = String(rd.result);
                const data = dataUrl.slice(dataUrl.indexOf(",") + 1);
                run("vision", () => provider.ingestImage({ data, mediaType: f.type || "image/png" }), (model) => applyModel(model, "Built model from image"));
              };
              rd.readAsDataURL(f);
              e.target.value = "";
            }}
          />
          <button className="btn sm" disabled={busy !== null} onClick={() => fileRef.current?.click()}>
            {busy === "vision" ? "Reading…" : "Upload a routing sheet / sketch"}
          </button>
        </>
      ) : (
        <div style={{ fontSize: 10.5, color: TEXTD, lineHeight: 1.5 }}>
          Vision needs a Claude API key — add one in ⚙ Settings to extract a model from a photo.
        </div>
      )}

      <div className="lab" style={{ margin: "16px 0 8px" }}>
        Ingest a routing sheet (CSV)
      </div>
      <textarea
        style={{ minHeight: 56, resize: "vertical" }}
        placeholder={"name, cycle, operators, capacity, to\nRaw, 0, 0, 2000, CNC\nCNC, 42, 1, 1300, Press"}
        value={ingest}
        onChange={(e) => setIngest(e.target.value)}
      />
      <button
        className="btn sm"
        style={{ marginTop: 6 }}
        disabled={busy !== null || !ingest.trim()}
        onClick={() => run("ingest", () => provider.ingest(ingest), (model) => { api.reset(model); setIngest(""); toast("Built model from routing sheet"); })}
      >
        {busy === "ingest" ? "Parsing…" : "Build model from text"}
      </button>
    </div>
  );
}
