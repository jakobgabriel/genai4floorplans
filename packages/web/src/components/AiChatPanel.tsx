import { useMemo, useRef, useState } from "react";
import { Checkbox, SelectItem, Stack, Tag, Tile } from "@carbon/react";
import { Settings as SettingsIcon } from "@carbon/icons-react";
import { Btn, IconBtn } from "./Btn";
import { Footnote, SectionLabel } from "./analysisKit";
import { FieldRow, SelectField, TextAreaField, TextField } from "./formKit";
import type { Model } from "@flowplan/core/model/types";
import type { FlowPlanApi } from "../store/useFlowPlan";
import type { Settings } from "../store/settings";
import { getProvider } from "../ai/provider";
import type { GoalObjective, GoalResult, Proposal, ProposalContext } from "@flowplan/core/ai/types";
import { saveScenario } from "../store/scenarios";
import { useToast } from "./ui";

function Delta({ label, value }: { label: string; value: number }) {
  if (Math.abs(value) < 0.5) return null;
  return (
    <Tag type={value > 0 ? "green" : "red"} size="sm">
      {label} {value > 0 ? "+" : ""}
      {value.toFixed(0)}
    </Tag>
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
  // Any cloud LLM (Claude or OpenAI) unlocks vision; the offline strategist can't see.
  const isLlm = settings.aiProvider !== "offline" && provider.name !== "Offline strategist";
  const providerLabel = isLlm ? (provider.name.includes("OpenAI") ? "OpenAI" : "Claude") : "Offline";
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
    <div className="pad ak-panel">
      <Stack gap={5}>
        <Stack gap={3}>
          <div className="fk-listrow">
            <SectionLabel>AI Chat · {providerLabel}</SectionLabel>
            <IconBtn size="compact" icon={SettingsIcon} label="AI settings" tooltipPosition="left" onClick={openSettings} />
          </div>
          <Footnote>Every number is computed by FlowPlan's engine, not by the model.</Footnote>

          {chat.length > 0 ? (
            <div className="aichat__log">
              {chat.map((m, i) => (
                <div key={i} className={"aichat__msg aichat__msg--" + m.role}>
                  {m.text}
                </div>
              ))}
            </div>
          ) : null}

          <TextAreaField
            id="ai-edit"
            labelText="Instruction"
            rows={2}
            placeholder={'"make the line a U", "move QA next to Assembly", "automate CNC"'}
            value={edit}
            onChange={setEdit}
          />
          {/* The one primary in this panel: the others are alternate routes to
              the same place and should not all shout. */}
          <Btn
            variant="primary"
            size="compact"
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
          </Btn>
        </Stack>

        <Stack gap={3}>
          <SectionLabel>Layout improvements</SectionLabel>
          <Btn size="compact" disabled={busy !== null} onClick={() => run("propose", () => provider.propose(ctx), setProposals)}>
            {busy === "propose" ? "Thinking…" : "Propose improvements"}
          </Btn>
          {proposals.map((p) => (
            <Tile key={p.id} className="ak-row">
              <div className="ak-row__head">
                <span>{p.title}</span>
                <Tag type={p.deltas.composite >= 0 ? "green" : "red"} size="sm">
                  {p.deltas.composite >= 0 ? "+" : ""}
                  {p.deltas.composite.toFixed(1)} pts
                </Tag>
              </div>
              <div className="ak-row__sub">{p.rationale}</div>
              <div className="aichat__deltas">
                <Delta label="flow" value={p.deltas.flowCost} />
                <Delta label="bal" value={p.deltas.balance} />
                <Delta label="auto" value={p.deltas.auto} />
                <Delta label="ergo" value={p.deltas.ergo} />
                <Tag type="gray" size="sm">
                  grade {p.after.letter}
                </Tag>
              </div>
              <div className="fk-listrow">
                <Btn size="compact" className="fk-listrow__main" onClick={() => applyModel(p.model, "Applied: " + p.title)}>
                  Apply
                </Btn>
                <Btn
                  size="compact"
                  variant="ghost"
                  onClick={() => {
                    saveScenario(p.title, p.model);
                    toast("Saved variant “" + p.title + "”");
                  }}
                >
                  Save variant
                </Btn>
              </div>
            </Tile>
          ))}
        </Stack>

        <Stack gap={3}>
          <SectionLabel>Goal-driven optimization</SectionLabel>
          <SelectField
            id="ai-objective"
            labelText="Objective"
            value={goal.objective}
            onChange={(v) => setGoal({ ...goal, objective: v as GoalObjective })}
          >
            {OBJECTIVES.map(([v, l]) => (
              <SelectItem key={v} value={v} text={l} />
            ))}
          </SelectField>
          <FieldRow>
            <TextField id="ai-target" labelText="Target" placeholder="e.g. 900" value={goal.target} onChange={(v) => setGoal({ ...goal, target: v })} />
            <TextField id="ai-budget" labelText="Capex budget" placeholder="none" value={goal.budget} onChange={(v) => setGoal({ ...goal, budget: v })} />
          </FieldRow>
          <div className="aichat__opts">
            <Checkbox id="ai-moves" labelText="Moves" checked={goal.moves} onChange={(_: unknown, { checked }: { checked: boolean }) => setGoal({ ...goal, moves: checked })} />
            <Checkbox id="ai-parallel" labelText="Parallel lanes" checked={goal.parallel} onChange={(_: unknown, { checked }: { checked: boolean }) => setGoal({ ...goal, parallel: checked })} />
            <Checkbox id="ai-automate" labelText="Automate" checked={goal.automate} onChange={(_: unknown, { checked }: { checked: boolean }) => setGoal({ ...goal, automate: checked })} />
          </div>
          <Btn
            size="compact"
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
          </Btn>
          {goalRes ? (
            <Tile className="ak-row">
              <div className="ak-row__head">
                <span>{goalRes.message}</span>
                <Tag type={goalRes.reached ? "green" : "blue"} size="sm">
                  {goalRes.reached ? "target met" : "best found"}
                </Tag>
              </div>
              {goalRes.steps.map((s, i) => (
                <div key={i} className="aichat__step">
                  <span>
                    {i + 1}. {s.action}
                  </span>
                  <span>{s.metric.toLocaleString()}</span>
                </div>
              ))}
              {goalRes.proposal ? (
                <Btn size="compact" onClick={() => applyModel(goalRes.proposal!.model, "Applied the plan")}>
                  Apply plan
                </Btn>
              ) : null}
            </Tile>
          ) : null}
        </Stack>

        <Stack gap={3}>
          <SectionLabel>Explain the grade</SectionLabel>
          <Btn
            size="compact"
            disabled={busy !== null}
            onClick={() => run("narrate", () => provider.narrate(ctx), (t) => setChat((c) => c.concat([{ role: "ai", text: t }])))}
          >
            {busy === "narrate" ? "Writing…" : "Explain this grade"}
          </Btn>
        </Stack>

        <Stack gap={3}>
          <SectionLabel>Design a cell from a brief</SectionLabel>
          <TextAreaField
            id="ai-design"
            labelText="Brief"
            rows={2}
            placeholder="Raw -> CNC x2 -> Press -> Assembly -> QA -> Ship"
            value={design}
            onChange={setDesign}
          />
          <Btn
            size="compact"
            disabled={busy !== null || !design.trim()}
            onClick={() =>
              run("design", () => provider.design(design), (model) => {
                api.addCell(model, "AI-designed cell");
                setDesign("");
                toast("Designed a new cell");
              })
            }
          >
            {busy === "design" ? "Designing…" : "Generate cell"}
          </Btn>
        </Stack>

        <Stack gap={3}>
          <SectionLabel>From a photo</SectionLabel>
          {isLlm ? (
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
                    run("vision", () => provider.ingestImage({ data, mediaType: f.type || "image/png" }), (model) => {
                      api.addCell(model, "From image");
                      toast("Built a new cell from the image");
                    });
                  };
                  rd.readAsDataURL(f);
                  e.target.value = "";
                }}
              />
              <Btn size="compact" disabled={busy !== null} onClick={() => fileRef.current?.click()}>
                {busy === "vision" ? "Reading…" : "Upload a routing sheet or sketch"}
              </Btn>
            </>
          ) : (
            <Footnote>Needs an LLM provider — add a Claude or OpenAI key in settings.</Footnote>
          )}
        </Stack>

        <Stack gap={3}>
          <SectionLabel>Ingest a routing sheet</SectionLabel>
          <TextAreaField
            id="ai-ingest"
            labelText="CSV"
            rows={3}
            placeholder={"name, cycle, operators, capacity, to\nCNC, 42, 1, 1300, Press"}
            value={ingest}
            onChange={setIngest}
          />
          <Btn
            size="compact"
            disabled={busy !== null || !ingest.trim()}
            onClick={() =>
              run("ingest", () => provider.ingest(ingest), (model) => {
                api.addCell(model, "Imported routing");
                setIngest("");
                toast("Built a new cell from the routing sheet");
              })
            }
          >
            {busy === "ingest" ? "Parsing…" : "Build model from text"}
          </Btn>
        </Stack>
      </Stack>
    </div>
  );
}
