import { useMemo, useState } from "react";
import { Button, InlineNotification, MultiSelect, Stack, Tag, Tile } from "@carbon/react";
import { Add, TrashCan } from "@carbon/icons-react";
import type { PanelProps } from "./panels";
import type { Confidence, TimeMethod, WorkClass, WorkElement } from "@flowplan/core/model/types";
import { CONFIDENCES, TIME_METHODS, WORK_CLASSES } from "@flowplan/core/model/types";
import { analyseWorkload, makeWorkElement, precedenceOrder } from "@flowplan/core/engine/workload";
import { inferWorkload, type InferenceResult } from "@flowplan/core/engine/infer";
import { Footnote, SectionLabel } from "./analysisKit";
import { FieldRow, NumberField, SelectField, TextField } from "./formKit";

// Spec §11 — the product-free workload editor.
//
// `analyseWorkload` has existed and been tested since schema v8 and nothing
// could reach it: `Model.workElements` was on the type, but no reducer action
// and no screen ever wrote it. This panel is that missing half.
//
// It is deliberately NOT another station inspector. The spec's flow is
//   workload → balancer → stations
// and this is the first step of it. Elements carry seconds, a VA/NNVA/NVA
// classification, an attended fraction and a confidence — the four things §8
// and §11 say a time must carry for optimization to be possible at all.
//
// Standardized on Carbon: status through the design system's Tag palette
// (VA → green, NNVA → gray, NVA → red, matching the planner's inference table)
// and Carbon fields for editing. The stacked VA/NNVA/NVA proportion bar keeps a
// categorical encoding — it is a chart, not a status.

const CLASS_BAR: Record<WorkClass, string> = {
  VA: "var(--cds-support-success)",
  NNVA: "var(--cds-border-strong-01)",
  NVA: "var(--cds-support-error)",
};
const classTag = (c: WorkClass): "green" | "gray" | "red" => (c === "VA" ? "green" : c === "NNVA" ? "gray" : "red");

function ConfidenceDot({ c }: { c: Confidence }) {
  const col = c === "high" ? "var(--cds-support-success)" : c === "med" ? "var(--cds-support-warning)" : "var(--cds-support-error)";
  return (
    <span
      title={`${c} confidence`}
      style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: col, marginRight: 5, flex: "0 0 auto" }}
    />
  );
}

export function WorkloadPanel({ api }: PanelProps) {
  const model = api.model;
  const elements = useMemo(() => model.workElements ?? [], [model.workElements]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [derived, setDerived] = useState<InferenceResult | null>(null);

  // Takt drives the station counts. Absent a demand figure the analysis still
  // produces every time figure — §11 — so this panel is useful before takt is known.
  const taktSec = useMemo(() => {
    const stations = model.stations.filter((s) => s.role === "process");
    if (stations.length === 0) return undefined;
    const slowest = Math.max(...stations.map((s) => s.cycleTimeSec || 0));
    return slowest > 0 ? slowest : undefined;
  }, [model.stations]);

  const a = useMemo(() => analyseWorkload(elements, model.variantModes, taktSec), [elements, model.variantModes, taktSec]);
  const order = useMemo(() => precedenceOrder(elements), [elements]);

  function add() {
    const id = `we${elements.length + 1}_${Math.random().toString(36).slice(2, 6)}`;
    api.commit({ type: "ADD_WORK_ELEMENT", element: makeWorkElement(id, `Element ${elements.length + 1}`, 10) });
    setOpenId(id);
  }
  function patch(id: string, p: Partial<WorkElement>) {
    api.commit({ type: "UPDATE_WORK_ELEMENT", id, patch: p });
  }

  // Seed from the stations that already exist. Most cells reaching this panel
  // were authored station-first (the inversion in contradiction 2 is not done),
  // so an empty workload is the common case and "type it all again" is the
  // wrong answer. Everything inferred lands at low confidence and says why.
  const processStations = model.stations.filter((s) => s.role === "process");
  function derive() {
    const inf = inferWorkload(processStations.map((s) => ({ name: s.name, seconds: s.cycleTimeSec || undefined })));
    api.commit({ type: "SET_WORK_ELEMENTS", elements: inf.elements });
    setDerived(inf);
  }

  if (elements.length === 0) {
    return (
      <div className="pad ak-panel">
        <Stack gap={5}>
          <SectionLabel>Workload</SectionLabel>
          <Footnote>
            The product-free input: what must be done, independent of what is made. Add elements with a
            time, a value classification and how much of that time binds an operator — the balancer turns
            them into stations.
          </Footnote>
          {processStations.length > 0 ? (
            <Stack gap={2}>
              <Button kind="primary" size="sm" onClick={derive}>
                Derive from {processStations.length} process station{processStations.length === 1 ? "" : "s"}
              </Button>
              <Footnote>
                Names are matched against the capability keyword list. Everything inferred lands at{" "}
                <strong>low confidence</strong> — check it.
              </Footnote>
            </Stack>
          ) : null}
          <Button kind="tertiary" size="sm" renderIcon={Add} onClick={add}>
            Add element manually
          </Button>
        </Stack>
      </div>
    );
  }

  return (
    <div className="pad ak-panel">
      <Stack gap={6}>
        <SectionLabel>
          Workload — {elements.length} element{elements.length === 1 ? "" : "s"}
        </SectionLabel>

        {/* --- analysis readout: the engine's answer, always visible --- */}
        <Tile>
          <div className="wl-metrics">
            <span>
              <span className="wl-metrics__lab">weighted </span>
              <strong>{a.weightedTotalSec.toFixed(1)}s</strong>
            </span>
            <span>
              <span className="wl-metrics__lab">worst mode </span>
              <strong>{a.worstTotalSec.toFixed(1)}s</strong>
            </span>
            {a.mixSpreadPct > 0 ? (
              <Tag type="magenta" size="sm">
                +{a.mixSpreadPct.toFixed(0)}% spread
              </Tag>
            ) : null}
            <span>
              <ConfidenceDot c={a.confidence} />
              {a.confidence}
            </span>
          </div>

          {/* VA/NNVA/NVA bar — §8: time is decomposed, never flat. */}
          <div className="wl-classbar">
            {(["VA", "NNVA", "NVA"] as WorkClass[]).map((k) => {
              const sec = k === "VA" ? a.vaSec : k === "NNVA" ? a.nnvaSec : a.nvaSec;
              const pct = a.weightedTotalSec > 0 ? (sec / a.weightedTotalSec) * 100 : 0;
              return <div key={k} title={`${k} ${sec.toFixed(1)}s`} style={{ width: `${pct}%`, background: CLASS_BAR[k] }} />;
            })}
          </div>
          <Footnote>
            VA {a.vaPct == null ? "—" : `${a.vaPct.toFixed(0)}%`} · operator-bound{" "}
            {a.attendedPct == null ? "—" : `${a.attendedPct.toFixed(0)}%`}
            {a.minStationsWeighted != null ? ` · ${a.minStationsWeighted} stations (${a.minStationsWorst} worst-case)` : " · no takt yet"}
          </Footnote>
        </Tile>

        {order === null ? (
          <InlineNotification
            kind="error"
            lowContrast
            hideCloseButton
            title="Precedence contains a cycle"
            subtitle="No valid order exists — balancing is blocked until it is broken."
          />
        ) : null}

        {a.overTaktElements.length > 0 ? (
          <InlineNotification
            kind="warning"
            lowContrast
            hideCloseButton
            title="Exceeds takt alone"
            subtitle={`${a.overTaktElements.map((e) => e.name).join(", ")} exceed${a.overTaktElements.length === 1 ? "s" : ""} takt — no balance fits ${
              a.overTaktElements.length === 1 ? "it" : "them"
            } on one station. Split, automate or parallel.`}
          />
        ) : null}

        {a.issues.map((msg, i) => (
          <InlineNotification key={i} kind="warning" lowContrast hideCloseButton title={msg} />
        ))}

        {/* Inference is auditable, not magic — §5: every number says where it came from. */}
        {derived ? (
          <Stack gap={2}>
            <InlineNotification
              kind="info"
              lowContrast
              hideCloseButton
              title={`Derived from stations · ${derived.matchRatePct.toFixed(0)}% of names matched a capability`}
              subtitle={`${derived.unmatched.length > 0 ? `No keyword matched: ${derived.unmatched.join(", ")} — defaults applied. ` : ""}${
                derived.notes.length
              } value${derived.notes.length === 1 ? "" : "s"} inferred, all at low confidence. Precedence was assumed linear.`}
            />
            <Button kind="ghost" size="sm" onClick={() => setDerived(null)}>
              Dismiss
            </Button>
          </Stack>
        ) : null}

        {/* --- the elements --- */}
        <Stack gap={3}>
          {elements.map((el) => {
            const load = a.elements.find((l) => l.elementId === el.id);
            const open = openId === el.id;
            return (
              <Tile key={el.id} className="wl-el">
                <button type="button" className="wl-el__head" onClick={() => setOpenId(open ? null : el.id)}>
                  <span className="wl-el__name">
                    <ConfidenceDot c={el.time.confidence} />
                    {el.name}
                  </span>
                  <span className="wl-el__sec">{load ? `${load.weightedSec.toFixed(1)}s` : `${el.time.seconds}s`}</span>
                  <Tag type={classTag(el.classification)} size="sm">
                    {el.classification}
                  </Tag>
                </button>

                {open ? (
                  <Stack gap={4} className="wl-el__body">
                    <TextField id={`wl-name-${el.id}`} labelText="Name" value={el.name} onChange={(v) => patch(el.id, { name: v })} />
                    <FieldRow>
                      <NumberField
                        id={`wl-sec-${el.id}`}
                        label="Seconds"
                        value={el.time.seconds}
                        min={0}
                        step={0.1}
                        onChange={(v) => patch(el.id, { time: { ...el.time, seconds: Math.max(0, Number(v) || 0) } })}
                      />
                      <NumberField
                        id={`wl-att-${el.id}`}
                        label="Attended"
                        value={el.attendedFraction}
                        min={0}
                        max={1}
                        step={0.1}
                        onChange={(v) => patch(el.id, { attendedFraction: Math.min(1, Math.max(0, Number(v) || 0)) })}
                      />
                    </FieldRow>
                    <FieldRow>
                      <SelectField
                        id={`wl-method-${el.id}`}
                        labelText="Method"
                        value={el.time.method}
                        options={TIME_METHODS}
                        onChange={(v) => patch(el.id, { time: { ...el.time, method: v as TimeMethod } })}
                      />
                      <SelectField
                        id={`wl-conf-${el.id}`}
                        labelText="Confidence"
                        value={el.time.confidence}
                        options={CONFIDENCES}
                        onChange={(v) => patch(el.id, { time: { ...el.time, confidence: v as Confidence } })}
                      />
                    </FieldRow>
                    <SelectField
                      id={`wl-class-${el.id}`}
                      labelText="Classification"
                      value={el.classification}
                      options={WORK_CLASSES}
                      onChange={(v) => patch(el.id, { classification: v as WorkClass })}
                    />
                    <MultiSelect
                      id={`wl-pred-${el.id}`}
                      titleText="Predecessors (DAG — not a linear routing)"
                      label="Select steps…"
                      size="sm"
                      items={elements.filter((o) => o.id !== el.id)}
                      itemToString={(o) => (o ? o.name : "")}
                      selectedItems={elements.filter((o) => el.predecessors.includes(o.id))}
                      onChange={({ selectedItems }) => patch(el.id, { predecessors: (selectedItems ?? []).map((o) => o.id) })}
                    />
                    {load && load.skippedInModeIds.length > 0 ? <Footnote>Skipped in {load.skippedInModeIds.length} mode(s)</Footnote> : null}
                    <Button
                      kind="danger--tertiary"
                      size="sm"
                      renderIcon={TrashCan}
                      onClick={() => { api.commit({ type: "DELETE_WORK_ELEMENT", id: el.id }); setOpenId(null); }}
                    >
                      Delete element
                    </Button>
                  </Stack>
                ) : null}
              </Tile>
            );
          })}
        </Stack>

        <Button kind="tertiary" size="sm" renderIcon={Add} onClick={add}>
          Add element
        </Button>

        {/* --- mix modes --- */}
        <Stack gap={3}>
          <SectionLabel>Mix modes</SectionLabel>
          {a.modes.map((m) => (
            <div key={m.modeId} className="ak-kv">
              <span className="ak-kv__k">
                {m.name}
                {m.modeId === a.worstModeId && a.modes.length > 1 ? " · heaviest" : ""}
              </span>
              <span className="ak-kv__v">
                {(m.share * 100).toFixed(0)}% · {m.totalSec.toFixed(1)}s
              </span>
            </div>
          ))}
          <Footnote>
            Forty part numbers needing the same work are one mode. A mode exists only where work content
            genuinely differs — it carries no product identity.
          </Footnote>
        </Stack>
      </Stack>
    </div>
  );
}
