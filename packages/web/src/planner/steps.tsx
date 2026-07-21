import { useMemo, useState } from "react";
import {
  Button,
  ClickableTile,
  Column,
  Grid,
  IconButton,
  InlineNotification,
  MultiSelect,
  NumberInput,
  Select,
  SelectItem,
  Tag,
  TextArea,
  TextInput,
  Tile,
} from "@carbon/react";
import { Add, TrashCan } from "@carbon/icons-react";
import { CONCEPTS } from "@flowplan/core/engine/concepts";
import { CAPABILITY_HINTS, inferWorkload } from "@flowplan/core/engine/infer";
import type { Candidate, ProcessStep } from "@flowplan/core/engine/generate";
import {
  CONFIDENCES,
  ERGONOMIC_LOADS,
  TIME_METHODS,
  TRANSPORT,
  WORK_CLASSES,
  type Confidence,
  type DemandYear,
  type ErgonomicLoad,
  type TimeMethod,
  type Transport,
  type VariantMode,
  type WorkClass,
} from "@flowplan/core/model/types";
import { USE_CASES, type UseCase, type UseCaseId } from "./usecases";
import { parseSteps } from "./parseSteps";
import { ConceptTable } from "./ConceptTable";
import { money, moneyWhole, num } from "../format";
import { LayoutCanvas } from "../components/LayoutCanvas";
import { TEAL, scoreColor } from "../components/colors";
import { navigate } from "../store/useHashRoute";

// Individual stages of the planning process. Each is a plain presentational
// component; all state and navigation live in App, so the stepper stays
// authoritative and the editor can sit between two of these stages.

// ---- situation ------------------------------------------------------------

export function SituationStep({
  onPick,
  onSample,
  onBlank,
  onImport,
  hasCell,
  onSkip,
}: {
  onPick: (id: UseCaseId) => void;
  onSample: () => void;
  onBlank: () => void;
  onImport: () => void;
  hasCell: boolean;
  onSkip: () => void;
}) {
  return (
    <section className="planner">
      <header className="planner__head">
        <h1 className="planner__title">What are you planning?</h1>
        <p className="planner__sub">
          Pick the situation. FlowPlan asks only for what that case needs — nothing else.
        </p>
        {hasCell ? (
          <Button kind="ghost" size="sm" onClick={onSkip}>
            Skip to the editor →
          </Button>
        ) : null}
      </header>

      <Grid className="planner__grid" condensed>
        {USE_CASES.map((u) => {
          const off = u.availability === "unavailable";
          const Wrapper = off ? Tile : ClickableTile;
          return (
            <Column key={u.id} sm={4} md={4} lg={8}>
              <Wrapper
                className={"planner__tile" + (off ? " planner__tile--off" : "")}
                {...(off ? {} : { onClick: () => onPick(u.id) })}
              >
                <div className="planner__tileHead">
                  <h3>{u.label}</h3>
                  {u.availability === "ready" ? null : (
                    <Tag type={u.availability === "partial" ? "magenta" : "gray"} size="sm">
                      {u.availability === "partial" ? "Partial" : "Not built"}
                    </Tag>
                  )}
                </div>
                <p className="planner__q">“{u.question}”</p>
                <p className="planner__meta">
                  <b>You need:</b> {u.needs.join(" · ")}
                </p>
                <p className="planner__meta">
                  <b>You get:</b> {u.gives}
                </p>
                {u.caveat ? <p className="planner__caveat">{u.caveat}</p> : null}
                <p className="planner__lifecycle">{u.lifecycle}</p>
              </Wrapper>
            </Column>
          );
        })}
      </Grid>

      <div className="planner__escape">
        <span className="planner__escapeLab">Or go straight in:</span>
        <Button kind="ghost" size="sm" onClick={onSample}>
          Start from the sample cell
        </Button>
        <Button kind="ghost" size="sm" onClick={onBlank}>
          Start blank
        </Button>
        <Button kind="ghost" size="sm" onClick={onImport}>
          Import a JSON model
        </Button>
      </div>
    </section>
  );
}

// ---- demand ---------------------------------------------------------------

// The wizard's demand model mirrors the engine's Demand (multi-year units + a
// shift model) while keeping the scalar figures the rest of the app reads.
// annualVolume tracks the sizing (first) year; annualShifts is derived from the
// shift model. A mix of variant modes is optional (single-model when empty).
export interface DemandValues {
  name: string;
  /** Sizing-year units — mirrors years[0].units, kept for takt/cost sizing. */
  annualVolume: number;
  programYears: number;
  /** Derived: shiftsPerDay × workingDaysPerYear. */
  annualShifts: number;
  /** Hours produced per shift. */
  shiftHours: number;
  /** Units required per program year. */
  years: DemandYear[];
  shiftsPerDay: number;
  workingDaysPerYear: number;
  /** Overall equipment effectiveness, 0–1. */
  oee: number;
  /** Mix modes for mixed-model balancing. Empty ⇒ single-model. */
  variantModes: VariantMode[];
  /** Default inter-station transport for the generated flows. */
  transport: Transport;
  /** Default part weight (kg) stamped on the generated flows. */
  partWeightKg: number;
}

export const DEFAULT_DEMAND: DemandValues = {
  name: "New product",
  annualVolume: 250000,
  programYears: 5,
  annualShifts: 460,
  shiftHours: 8,
  years: [{ year: 1, units: 250000 }],
  shiftsPerDay: 2,
  workingDaysPerYear: 230,
  oee: 0.85,
  variantModes: [],
  transport: "manual",
  partWeightKg: 1,
};

/** The engine Demand carried onto the generated model. */
export function toDemand(v: DemandValues) {
  return { years: v.years, shiftsPerDay: v.shiftsPerDay, hoursPerShift: v.shiftHours, workingDaysPerYear: v.workingDaysPerYear, oee: v.oee };
}

let vmCounter = 0;

export function DemandStep({
  values,
  onChange,
}: {
  values: DemandValues;
  onChange: (patch: Partial<DemandValues>) => void;
}) {
  const annualShifts = Math.max(1, values.shiftsPerDay * values.workingDaysPerYear);
  const perShift = annualShifts > 0 ? values.annualVolume / annualShifts : 0;
  const takt = perShift > 0 ? (values.shiftHours * 3600) / perShift : 0;
  const programParts = values.years.length > 1 ? values.years.reduce((a, y) => a + y.units, 0) : values.annualVolume * values.programYears;

  const setYear = (i: number, units: number) => {
    const years = values.years.map((y, k) => (k === i ? { ...y, units } : y));
    onChange(i === 0 ? { years, annualVolume: units } : { years });
  };
  const addYear = () => {
    const last = values.years[values.years.length - 1];
    onChange({ years: values.years.concat([{ year: (last?.year ?? 0) + 1, units: last?.units ?? 0 }]) });
  };
  const removeYear = (i: number) => {
    if (values.years.length <= 1) return;
    const years = values.years.filter((_, k) => k !== i);
    onChange({ years, annualVolume: years[0].units });
  };

  const setShiftsPerDay = (v: number) => onChange({ shiftsPerDay: v, annualShifts: Math.max(1, v * values.workingDaysPerYear) });
  const setWorkingDays = (v: number) => onChange({ workingDaysPerYear: v, annualShifts: Math.max(1, values.shiftsPerDay * v) });

  const totalShare = values.variantModes.reduce((a, m) => a + m.share, 0);

  return (
    <section className="planner">
      <h2 className="planner__h2">How many, and for how long?</h2>
      <p className="planner__sub">Everything downstream is sized from this. Volume can vary per program year.</p>

      <Grid condensed>
        <Column sm={4} md={8} lg={16}>
          <TextInput id="pl-name" labelText="Product or process name" value={values.name} onChange={(e) => onChange({ name: e.target.value })} />
        </Column>
      </Grid>

      <h3 className="planner__h3">Demand over the program</h3>
      <Grid condensed className="planner__rowGrid">
        {values.years.map((y, i) => (
          <Column key={i} sm={4} md={4} lg={5}>
            <div className="planner__yearRow">
              <NumberInput
                id={`pl-vol-${i}`}
                label={i === 0 ? "Annual volume (good parts)" : `Year ${y.year} units`}
                min={0}
                step={1000}
                value={y.units}
                onChange={(_: unknown, s: { value: number | string }) => setYear(i, Math.max(0, Number(s.value) || 0))}
              />
              {i > 0 ? (
                <IconButton kind="ghost" size="sm" label={`Remove year ${y.year}`} onClick={() => removeYear(i)}>
                  <TrashCan />
                </IconButton>
              ) : null}
            </div>
          </Column>
        ))}
        <Column sm={4} md={4} lg={6}>
          <Button kind="ghost" size="md" renderIcon={Add} onClick={addYear} className="planner__addYear">
            Add a program year
          </Button>
        </Column>
      </Grid>

      <h3 className="planner__h3">Shift model</h3>
      <Grid condensed>
        <Column sm={2} md={4} lg={4}>
          <NumberInput id="pl-spd" label="Shifts per day" min={1} step={1} value={values.shiftsPerDay} onChange={(_: unknown, s: { value: number | string }) => setShiftsPerDay(Math.max(1, Number(s.value) || 1))} />
        </Column>
        <Column sm={2} md={4} lg={4}>
          <NumberInput id="pl-hours" label="Shift hours" min={1} step={0.5} value={values.shiftHours} onChange={(_: unknown, s: { value: number | string }) => onChange({ shiftHours: Math.max(1, Number(s.value) || 1) })} />
        </Column>
        <Column sm={2} md={4} lg={4}>
          <NumberInput id="pl-days" label="Working days / year" min={1} step={1} value={values.workingDaysPerYear} onChange={(_: unknown, s: { value: number | string }) => setWorkingDays(Math.max(1, Number(s.value) || 1))} />
        </Column>
        <Column sm={2} md={4} lg={4}>
          <NumberInput id="pl-oee" label="OEE %" min={1} max={100} step={1} value={Math.round(values.oee * 100)} onChange={(_: unknown, s: { value: number | string }) => onChange({ oee: Math.min(1, Math.max(0.01, (Number(s.value) || 85) / 100)) })} />
        </Column>
        <Column sm={4} md={4} lg={4}>
          <NumberInput id="pl-years" label="Program years" min={1} step={1} helperText="Amortises equipment into cost/part." value={values.programYears} onChange={(_: unknown, s: { value: number | string }) => onChange({ programYears: Math.max(1, Number(s.value) || 1) })} />
        </Column>
      </Grid>

      <h3 className="planner__h3">Variant mix <span className="planner__hint">— optional; leave empty for a single model</span></h3>
      <div className="planner__variants">
        {values.variantModes.map((m, i) => (
          <div key={m.id} className="planner__variantRow">
            <TextInput
              id={`pl-vm-name-${i}`}
              labelText={i === 0 ? "Variant name" : ""}
              hideLabel={i > 0}
              value={m.name}
              onChange={(e) => onChange({ variantModes: values.variantModes.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)) })}
            />
            <NumberInput
              id={`pl-vm-share-${i}`}
              label={i === 0 ? "Share %" : ""}
              hideLabel={i > 0}
              min={0}
              max={100}
              step={5}
              value={Math.round(m.share * 100)}
              onChange={(_: unknown, s: { value: number | string }) => onChange({ variantModes: values.variantModes.map((x, k) => (k === i ? { ...x, share: Math.min(1, Math.max(0, (Number(s.value) || 0) / 100)) } : x)) })}
            />
            <IconButton kind="ghost" size="sm" label={`Remove ${m.name}`} onClick={() => onChange({ variantModes: values.variantModes.filter((_, k) => k !== i) })}>
              <TrashCan />
            </IconButton>
          </div>
        ))}
        <Button
          kind="ghost"
          size="sm"
          renderIcon={Add}
          onClick={() => onChange({ variantModes: values.variantModes.concat([{ id: "vm" + ++vmCounter, name: `Variant ${values.variantModes.length + 1}`, share: 0, elementOverrides: {} }]) })}
        >
          Add a variant mode
        </Button>
        {values.variantModes.length > 0 && Math.abs(totalShare - 1) > 0.001 ? (
          <InlineNotification kind="warning" lowContrast hideCloseButton title="Shares don't sum to 100%" subtitle={`Currently ${Math.round(totalShare * 100)}%. The balancer normalises, but round shares read better.`} />
        ) : null}
      </div>

      <Tile className="planner__derived">
        <div>
          <span className="planner__derivedLab">Demand</span>
          <span className="planner__derivedVal">{num(perShift)}/shift</span>
        </div>
        <div>
          <span className="planner__derivedLab">Takt</span>
          <span className="planner__derivedVal">{takt > 0 ? takt.toFixed(1) + "s" : "—"}</span>
        </div>
        <div>
          <span className="planner__derivedLab">Shifts / year</span>
          <span className="planner__derivedVal">{num(annualShifts)}</span>
        </div>
        <div>
          <span className="planner__derivedLab">Program</span>
          <span className="planner__derivedVal">{num(programParts)} parts</span>
        </div>
      </Tile>
    </section>
  );
}

// ---- process --------------------------------------------------------------

// Distinct capability ids from the seed catalog, for the per-step selector.
const CAPABILITY_OPTIONS: string[] = Array.from(new Set(CAPABILITY_HINTS.map((h) => h.capabilityId))).sort();

/** A predecessor option: an earlier step, keyed by its index. */
interface PredItem {
  id: string;
  text: string;
}

/** Map a ProcessStep to the RawStep the inference consumes (identical mapping to
 *  the engine's buildModel, so the preview matches what generation will produce). */
function toRaw(s: ProcessStep) {
  return {
    name: s.name,
    seconds: s.cycleTimeSec,
    capabilityId: s.capabilityId,
    classification: s.classification,
    wasteClass: s.wasteClass,
    attendedFraction: s.attendedFraction,
    ergonomicLoad: s.ergonomicLoad,
    timeMethod: s.timeMethod,
    confidence: s.confidence,
    predecessors: s.predecessors,
    scrapRate: s.scrapRate,
  };
}

export function ProcessStepView({
  steps,
  onChange,
  routing,
  onRouting,
}: {
  steps: ProcessStep[];
  onChange: (steps: ProcessStep[]) => void;
  routing: { transport: Transport; partWeightKg: number };
  onRouting: (patch: { transport?: Transport; partWeightKg?: number }) => void;
}) {
  const [paste, setPaste] = useState("");
  // The live inference resolves every unspecified field, so each row can show
  // the real value it will generate with — overrides simply pin it.
  const inferred = useMemo(() => inferWorkload(steps.map(toRaw)), [steps]);

  const update = (i: number, patch: Partial<ProcessStep>) => onChange(steps.map((s, k) => (k === i ? { ...s, ...patch } : s)));
  const remove = (i: number) => onChange(steps.filter((_, k) => k !== i).map((s) => ({ ...s, predecessors: undefined })));
  const add = () => onChange(steps.concat([{ name: `Step ${steps.length + 1}`, cycleTimeSec: 30 }]));
  const seedFromPaste = () => {
    const parsed = parseSteps(paste);
    if (parsed.length) onChange(steps.concat(parsed));
    setPaste("");
  };

  return (
    <section className="planner planner--wide">
      <h2 className="planner__h2">What are the process steps?</h2>
      <p className="planner__sub">
        Each step is a work element. Only the name is required — capability, work class, operator binding and ergonomics
        are inferred and shown below; edit any of them to pin your own value.
      </p>

      <div className="planner__steps">
        {steps.map((s, i) => {
          const el = inferred.elements[i];
          const resolved = {
            capabilityId: s.capabilityId ?? el?.capabilityId ?? "",
            seconds: s.cycleTimeSec ?? el?.time.seconds ?? 30,
            classification: (s.classification ?? el?.classification ?? "VA") as WorkClass,
            attended: s.attendedFraction ?? el?.attendedFraction ?? 1,
            ergo: (s.ergonomicLoad ?? el?.ergonomicLoad ?? "medium") as ErgonomicLoad,
            method: (s.timeMethod ?? el?.time.method ?? "estimate") as TimeMethod,
            confidence: (s.confidence ?? el?.time.confidence ?? "low") as Confidence,
          };
          const isPinned = (f: keyof ProcessStep) => s[f] != null;
          const pred = s.predecessors ?? (i > 0 ? [i - 1] : []);
          const predItems: PredItem[] = steps.slice(0, i).map((p, k) => ({ id: String(k), text: p.name || `Step ${k + 1}` }));
          return (
            <Tile key={i} className="planner__step">
              <div className="planner__stepHead">
                <span className="planner__stepNo">{i + 1}</span>
                <TextInput
                  id={`st-name-${i}`}
                  labelText="Step name"
                  hideLabel
                  placeholder="Step name"
                  value={s.name}
                  onChange={(e) => update(i, { name: e.target.value })}
                />
                <IconButton kind="ghost" size="sm" label={`Remove ${s.name || "step"}`} onClick={() => remove(i)} disabled={steps.length <= 1}>
                  <TrashCan />
                </IconButton>
              </div>
              <div className="planner__stepGrid">
                <Select id={`st-cap-${i}`} size="sm" labelText={`Capability${isPinned("capabilityId") ? " ✏" : ""}`} value={resolved.capabilityId} onChange={(e) => update(i, { capabilityId: e.target.value || undefined })}>
                  <SelectItem value="" text="Auto (from name)" />
                  {CAPABILITY_OPTIONS.map((c) => (
                    <SelectItem key={c} value={c} text={c} />
                  ))}
                  {resolved.capabilityId && !CAPABILITY_OPTIONS.includes(resolved.capabilityId) ? <SelectItem value={resolved.capabilityId} text={resolved.capabilityId} /> : null}
                </Select>
                <NumberInput id={`st-cyc-${i}`} size="sm" label={`Cycle s${isPinned("cycleTimeSec") ? " ✏" : ""}`} min={0.1} step={1} value={resolved.seconds} onChange={(_: unknown, o: { value: number | string }) => update(i, { cycleTimeSec: Math.max(0.1, Number(o.value) || 0.1) })} />
                <NumberInput id={`st-ppc-${i}`} size="sm" label="Parts/cyc" min={1} step={1} value={s.partsPerCycle ?? 1} onChange={(_: unknown, o: { value: number | string }) => update(i, { partsPerCycle: Math.max(1, Math.floor(Number(o.value) || 1)) })} />
                <Select id={`st-cls-${i}`} size="sm" labelText={`Class${isPinned("classification") ? " ✏" : ""}`} value={resolved.classification} onChange={(e) => update(i, { classification: e.target.value as WorkClass })}>
                  {WORK_CLASSES.map((c) => (
                    <SelectItem key={c} value={c} text={c} />
                  ))}
                </Select>
                <NumberInput id={`st-att-${i}`} size="sm" label={`Attended %${isPinned("attendedFraction") ? " ✏" : ""}`} min={0} max={100} step={5} value={Math.round(resolved.attended * 100)} onChange={(_: unknown, o: { value: number | string }) => update(i, { attendedFraction: Math.min(1, Math.max(0, (Number(o.value) || 0) / 100)) })} />
                <Select id={`st-erg-${i}`} size="sm" labelText={`Ergo${isPinned("ergonomicLoad") ? " ✏" : ""}`} value={resolved.ergo} onChange={(e) => update(i, { ergonomicLoad: e.target.value as ErgonomicLoad })}>
                  {ERGONOMIC_LOADS.map((c) => (
                    <SelectItem key={c} value={c} text={c} />
                  ))}
                </Select>
                <NumberInput id={`st-scr-${i}`} size="sm" label="Scrap %" min={0} max={100} step={0.5} value={+((s.scrapRate ?? 0) * 100).toFixed(1)} onChange={(_: unknown, o: { value: number | string }) => update(i, { scrapRate: Math.min(1, Math.max(0, (Number(o.value) || 0) / 100)) || undefined })} />
                <Select id={`st-mth-${i}`} size="sm" labelText="Method" value={resolved.method} onChange={(e) => update(i, { timeMethod: e.target.value as TimeMethod })}>
                  {TIME_METHODS.map((c) => (
                    <SelectItem key={c} value={c} text={c} />
                  ))}
                </Select>
                <Select id={`st-cnf-${i}`} size="sm" labelText="Confidence" value={resolved.confidence} onChange={(e) => update(i, { confidence: e.target.value as Confidence })}>
                  {CONFIDENCES.map((c) => (
                    <SelectItem key={c} value={c} text={c} />
                  ))}
                </Select>
                {i > 0 ? (
                  <div className="planner__pred">
                    <MultiSelect<PredItem>
                      id={`st-pred-${i}`}
                      size="sm"
                      label="Predecessors"
                      titleText="Predecessors"
                      items={predItems}
                      itemToString={(it) => (it ? it.text : "")}
                      initialSelectedItems={predItems.filter((it) => pred.includes(Number(it.id)))}
                      onChange={(d: { selectedItems: PredItem[] }) => update(i, { predecessors: d.selectedItems.map((it) => Number(it.id)) })}
                    />
                  </div>
                ) : null}
              </div>
            </Tile>
          );
        })}
      </div>

      <div className="planner__stepActions">
        <Button kind="tertiary" size="md" renderIcon={Add} onClick={add}>
          Add a step
        </Button>
      </div>

      <ProcessSummary steps={steps} inferred={inferred} />

      <h3 className="planner__h3">Material routing</h3>
      <p className="planner__sub">Defaults stamped on every generated flow. Refine per edge in the editor.</p>
      <Grid condensed>
        <Column sm={2} md={4} lg={4}>
          <Select id="rt-transport" labelText="Transport mode" value={routing.transport} onChange={(e) => onRouting({ transport: e.target.value as Transport })}>
            {TRANSPORT.map((t) => (
              <SelectItem key={t} value={t} text={t} />
            ))}
          </Select>
        </Column>
        <Column sm={2} md={4} lg={4}>
          <NumberInput id="rt-weight" label="Part weight (kg)" min={0} step={0.1} value={routing.partWeightKg} onChange={(_: unknown, o: { value: number | string }) => onRouting({ partWeightKg: Math.max(0, Number(o.value) || 0) })} />
        </Column>
      </Grid>

      <details className="planner__paste">
        <summary>Paste from a spreadsheet to add rows</summary>
        <TextArea
          id="pl-paste"
          labelText="Steps to append"
          helperText="One per line: name then cycle seconds. Tab, comma or semicolon all work."
          rows={5}
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
        />
        <Button kind="ghost" size="sm" onClick={seedFromPaste} disabled={!paste.trim()}>
          Add pasted rows
        </Button>
      </details>
    </section>
  );
}

/** Live rollup of the structured steps — total content and how much is still
 *  inferred vs pinned, so the planner sees exactly what remains a guess (§9). */
function ProcessSummary({ steps, inferred }: { steps: ProcessStep[]; inferred: ReturnType<typeof inferWorkload> }) {
  if (steps.length === 0) return <p className="planner__count">No steps yet — add one to begin.</p>;
  const total = inferred.elements.reduce((a, e) => a + e.time.seconds, 0);
  const va = inferred.elements.reduce((a, e) => a + (e.classification === "VA" ? e.time.seconds : 0), 0);
  const vaPct = total > 0 ? Math.round((va / total) * 100) : 0;
  return (
    <>
      <p className="planner__count">
        {steps.length} step{steps.length === 1 ? "" : "s"} · {Math.round(total)}s total work content · {vaPct}% value-add · {inferred.matchRatePct}% of names recognised
      </p>
      {inferred.unmatched.length > 0 ? (
        <InlineNotification
          kind="warning"
          lowContrast
          hideCloseButton
          title="Some steps were not recognised"
          subtitle={`${inferred.unmatched.join(", ")} — these get generic defaults until you pick a capability. Naming a step after its operation (weld, press, inspect, pack) also resolves it.`}
        />
      ) : null}
    </>
  );
}

// ---- concepts -------------------------------------------------------------

export function ConceptsStep({
  candidates,
  selectedId,
  onSelect,
  perShift,
  programYears,
}: {
  candidates: Candidate[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  perShift: number;
  programYears: number;
}) {
  return (
    <section className="planner planner--wide">
      <h2 className="planner__h2">Which concept?</h2>
      <p className="planner__sub">
        {candidates.length} options for {num(perShift)} parts/shift. Cost per part is fully loaded — operating cost plus
        equipment amortised over {programYears} years.
      </p>
      <ConceptTable candidates={candidates} selectedId={selectedId} onSelect={onSelect} />
    </section>
  );
}

// ---- summary --------------------------------------------------------------

/** One decision figure in the summary's KPI panel. */
function SumKpi({ lab, val, sub, color, big }: { lab: string; val: string; sub?: string; color?: string; big?: boolean }) {
  return (
    <div className={"sum1__kpi" + (big ? " sum1__kpi--big" : "")}>
      <span className="sum1__kpiLab">{lab}</span>
      <span className="sum1__kpiVal" style={{ color }}>{val}</span>
      {sub ? <span className="sum1__kpiSub">{sub}</span> : null}
    </div>
  );
}

// The Summary is a decision one-pager: the chosen concept, the numbers a
// business case turns on, a layout thumbnail, and — the "why this one" — a
// head-to-head against the other concepts. Everything comes from the candidate
// set already computed; this only arranges it for a pitch.
export function SummaryStep({
  picked,
  useCase,
  candidates = [],
  onRefine,
}: {
  picked: Candidate | null;
  useCase: UseCase | null;
  candidates?: Candidate[];
  onRefine?: () => void;
}) {
  if (!picked) {
    return (
      <section className="planner">
        <h2 className="planner__h2">Nothing chosen yet</h2>
        <p className="planner__sub">Go back to Concepts and pick an option.</p>
      </section>
    );
  }
  const m = picked.metrics;
  const cur = picked.cost.currency;
  const foot = picked.cost.floorSpace;

  // Head-to-head: rank every concept by the loaded cost/part a business case
  // turns on (lower = better). The picked one is highlighted.
  const ranked = [...candidates].sort((a, b) => a.metrics.loadedCostPerPart - b.metrics.loadedCostPerPart);
  const worst = Math.max(m.loadedCostPerPart, ...ranked.map((c) => c.metrics.loadedCostPerPart), 1e-9);

  return (
    <section className="planner sum1">
      {/* Header — the choice + its grade, top-left. */}
      <div className="sum1__head">
        <div>
          <h2 className="planner__h2">{picked.conceptLabel}</h2>
          <p className="planner__sub">{picked.rationale}</p>
        </div>
        <Tile className="sum1__grade">
          <span className="sum1__gradeLab">Rating</span>
          <span className="sum1__gradeVal" style={{ color: scoreColor(m.composite) }}>{m.letter}</span>
          <span className="sum1__gradeScore">{m.composite.toFixed(0)} / 100</span>
        </Tile>
      </div>

      {/* Layout thumbnail + the decision figures. */}
      <div className="sum1__grid">
        <Tile className="sum1__viz">
          <div className="sum1__vizLab">Layout</div>
          <div className="sum1__vizCanvas">
            <LayoutCanvas model={picked.model} stations={picked.model.stations} flows={picked.model.flows} label="" badge={TEAL} cell={14} />
          </div>
        </Tile>
        <Tile className="sum1__kpis">
          <SumKpi lab="Loaded cost / part" val={money(cur, m.loadedCostPerPart)} sub={`${money(cur, m.costPerPart)} opex + ${money(cur, m.capexPerPart)} capex`} big />
          <SumKpi lab="Output / shift" val={num(m.lineOut)} sub={`takt ${m.takt > 0 ? m.takt.toFixed(1) + "s" : "—"} · demand ${m.meetsDemand ? "met" : "not met"}`} color={m.meetsDemand ? undefined : "var(--cds-support-error)"} />
          <SumKpi lab="Capex" val={moneyWhole(cur, m.capexTotal)} />
          <SumKpi lab="Operators" val={String(m.operators)} sub={`${m.stations} stations · ${m.parallelUnits} units`} />
          <SumKpi lab="Footprint" val={`${num(foot.total)} ${foot.unit}`} sub={`cell ${num(foot.cell)} + supply ${num(foot.materialSupply)}`} />
          <SumKpi lab="Over-capacity" val={`${m.overCapacityPct}%`} sub="line vs demand" color={m.overCapacityPct > 30 ? "var(--cds-support-warning)" : undefined} />
        </Tile>
      </div>

      {/* Why this concept — head-to-head on loaded cost/part. */}
      {ranked.length > 1 ? (
        <Tile className="sum1__cmp">
          <h3 className="sum1__cmpH">Why this concept — loaded cost / part vs alternatives</h3>
          {ranked.map((c) => {
            const isPicked = c.id === picked.id;
            return (
              <div key={c.id} className={"sum1__cmpRow" + (isPicked ? " sum1__cmpRow--on" : "")}>
                <span className="sum1__cmpName">{c.conceptLabel}{isPicked ? " ✓" : ""}</span>
                <span className="sum1__cmpTrack">
                  <span className="sum1__cmpBar" style={{ width: `${(c.metrics.loadedCostPerPart / worst) * 100}%`, background: isPicked ? TEAL : "var(--cds-border-strong-01)" }} />
                </span>
                <span className="sum1__cmpVal">{money(cur, c.metrics.loadedCostPerPart)} · {c.metrics.letter}</span>
              </div>
            );
          })}
        </Tile>
      ) : null}

      {m.conceptFit < 40 ? (
        <InlineNotification
          kind="warning"
          lowContrast
          hideCloseButton
          title="Outside the usual volume range"
          subtitle={`${picked.conceptLabel} normally suits ${num(CONCEPTS[picked.concept].viableVolume[0])}–${num(
            CONCEPTS[picked.concept].viableVolume[1],
          )} parts/year. Treat this as a comparison point, not a recommendation.`}
        />
      ) : null}

      <InlineNotification
        kind="info"
        lowContrast
        hideCloseButton
        title="This is a starting point, not a plan"
        subtitle="Concept costs are planning heuristics and layouts are template placements. Refine the layout before quoting."
      />

      {/* Next actions. */}
      <div className="sum1__actions">
        {onRefine ? (
          <Button kind="primary" onClick={onRefine}>Refine the layout</Button>
        ) : null}
        <Button kind="tertiary" onClick={() => navigate("/compare")}>Compare scenarios</Button>
      </div>

      {useCase ? <p className="planner__lifecycle">{useCase.lifecycle}</p> : null}
    </section>
  );
}
