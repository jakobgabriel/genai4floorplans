import { useMemo } from "react";
import {
  Button,
  ClickableTile,
  Column,
  Grid,
  InlineNotification,
  NumberInput,
  RadioButton,
  RadioButtonGroup,
  StructuredListBody,
  StructuredListCell,
  StructuredListHead,
  StructuredListRow,
  StructuredListWrapper,
  Tag,
  TextArea,
  TextInput,
  Tile,
} from "@carbon/react";
import { CONCEPTS } from "@flowplan/core/engine/concepts";
import { inferWorkload } from "@flowplan/core/engine/infer";
import type { Candidate, ProcessStep } from "@flowplan/core/engine/generate";
import { COMPLEXITY_LABELS, USE_CASES, type CycleKnowledge, type UseCase, type UseCaseId } from "./usecases";
import { ConceptTable } from "./ConceptTable";
import { money, moneyWhole, num } from "../format";

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

export interface DemandValues {
  name: string;
  annualVolume: number;
  programYears: number;
  annualShifts: number;
  shiftHours: number;
}

export function DemandStep({
  values,
  onChange,
}: {
  values: DemandValues;
  onChange: (patch: Partial<DemandValues>) => void;
}) {
  const perShift = values.annualShifts > 0 ? values.annualVolume / values.annualShifts : 0;
  const takt = perShift > 0 ? (values.shiftHours * 3600) / perShift : 0;

  const numField = (id: string, label: string, key: keyof DemandValues, min: number, helper?: string, step?: number) => (
    <Column sm={4} md={4} lg={8}>
      <NumberInput
        id={id}
        label={label}
        helperText={helper}
        min={min}
        step={step}
        value={values[key] as number}
        onChange={(_: unknown, s: { value: number | string }) => onChange({ [key]: Math.max(min, Number(s.value) || min) })}
      />
    </Column>
  );

  return (
    <section className="planner">
      <h2 className="planner__h2">How many, and for how long?</h2>
      <p className="planner__sub">Everything downstream is sized from this.</p>
      <Grid condensed>
        <Column sm={4} md={4} lg={8}>
          <TextInput
            id="pl-name"
            labelText="Product or process name"
            value={values.name}
            onChange={(e) => onChange({ name: e.target.value })}
          />
        </Column>
        {numField("pl-vol", "Annual volume (good parts)", "annualVolume", 0, undefined, 1000)}
        {numField("pl-years", "Program years", "programYears", 1, "Used to amortise equipment into the cost per part.")}
        {numField("pl-shifts", "Shifts per year", "annualShifts", 1)}
        {numField("pl-hours", "Shift hours", "shiftHours", 1)}
      </Grid>

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
          <span className="planner__derivedLab">Program</span>
          <span className="planner__derivedVal">{num(values.annualVolume * values.programYears)} parts</span>
        </div>
      </Tile>
    </section>
  );
}

// ---- process --------------------------------------------------------------

export function ProcessStepView({
  knowledge,
  setKnowledge,
  paste,
  setPaste,
  names,
  setNames,
  complexity,
  setComplexity,
  steps,
}: {
  knowledge: CycleKnowledge;
  setKnowledge: (k: CycleKnowledge) => void;
  paste: string;
  setPaste: (v: string) => void;
  names: string;
  setNames: (v: string) => void;
  complexity: string;
  setComplexity: (v: string) => void;
  steps: ProcessStep[];
}) {
  return (
    <section className="planner">
      <h2 className="planner__h2">What are the process steps?</h2>
      <RadioButtonGroup
        legendText="Do you have cycle times?"
        name="cycle-knowledge"
        valueSelected={knowledge}
        onChange={(v: unknown) => setKnowledge(v as CycleKnowledge)}
      >
        <RadioButton labelText="Yes — I'll paste them" value="known" id="ck-known" />
        <RadioButton labelText="Not yet — estimate from complexity" value="estimate" id="ck-est" />
      </RadioButtonGroup>

      {knowledge === "known" ? (
        <TextArea
          id="pl-steps"
          labelText="Process steps"
          helperText="One per line: name then cycle seconds. Paste straight from Excel — tab, comma or semicolon all work."
          rows={8}
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
        />
      ) : (
        <>
          <TextArea
            id="pl-stepnames"
            labelText="Process steps"
            helperText="One step name per line. Cycle times are estimated — replace them once you have real data."
            rows={8}
            value={names}
            onChange={(e) => setNames(e.target.value)}
          />
          <RadioButtonGroup
            legendText="Typical step complexity"
            name="complexity"
            valueSelected={complexity}
            onChange={(v: unknown) => setComplexity(String(v))}
          >
            {COMPLEXITY_LABELS.map((c) => (
              <RadioButton key={c.id} labelText={`${c.label} — ${c.hint}`} value={c.id} id={"cx-" + c.id} />
            ))}
          </RadioButtonGroup>
          <InlineNotification
            kind="info"
            lowContrast
            hideCloseButton
            title="These are estimates"
            subtitle="Every step is assumed identical. Good enough to compare concepts against each other; not good enough to quote."
          />
        </>
      )}

      <InferencePreview steps={steps} />
    </section>
  );
}

/**
 * What the tool inferred from the step names. The planner types names; this
 * shows every field that was guessed so nothing is presented as fact (spec §9).
 */
function InferencePreview({ steps }: { steps: ProcessStep[] }) {
  const inferred = useMemo(() => inferWorkload(steps.map((s) => ({ name: s.name, seconds: s.cycleTimeSec }))), [steps]);
  if (steps.length === 0) return <p className="planner__count">No steps yet.</p>;

  const total = inferred.elements.reduce((a, e) => a + e.time.seconds, 0);

  return (
    <>
      <p className="planner__count">
        {steps.length} step{steps.length === 1 ? "" : "s"} · {total}s total work content ·{" "}
        {inferred.matchRatePct}% of names recognised
      </p>

      {inferred.unmatched.length > 0 ? (
        <InlineNotification
          kind="warning"
          lowContrast
          hideCloseButton
          title="Some steps were not recognised"
          subtitle={`${inferred.unmatched.join(", ")} — these get generic defaults. Naming them after the operation (weld, press, inspect, pack) improves the result.`}
        />
      ) : null}

      <StructuredListWrapper ariaLabel="Inferred work elements" className="planner__table planner__table--infer">
        <StructuredListHead>
          <StructuredListRow head>
            <StructuredListCell head>Step</StructuredListCell>
            <StructuredListCell head>Time</StructuredListCell>
            <StructuredListCell head>Capability</StructuredListCell>
            <StructuredListCell head>Class</StructuredListCell>
            <StructuredListCell head>Operator</StructuredListCell>
          </StructuredListRow>
        </StructuredListHead>
        <StructuredListBody>
          {inferred.elements.map((e, i) => (
            <StructuredListRow key={e.id}>
              <StructuredListCell>{e.name}</StructuredListCell>
              <StructuredListCell>
                {e.time.seconds}s
                {steps[i]?.cycleTimeSec == null ? <div className="planner__inferred">inferred</div> : null}
              </StructuredListCell>
              <StructuredListCell>
                {e.capabilityId ?? "—"}
                <div className="planner__inferred">inferred</div>
              </StructuredListCell>
              <StructuredListCell>
                <Tag type={e.classification === "VA" ? "green" : e.classification === "NNVA" ? "gray" : "red"} size="sm">
                  {e.classification}
                </Tag>
                {e.wasteClass ? <div className="planner__cellSub">{e.wasteClass}</div> : null}
              </StructuredListCell>
              <StructuredListCell>
                {Math.round(e.attendedFraction * 100)}%
                <div className="planner__inferred">inferred</div>
              </StructuredListCell>
            </StructuredListRow>
          ))}
        </StructuredListBody>
      </StructuredListWrapper>

      <InlineNotification
        kind="info"
        lowContrast
        hideCloseButton
        title="Everything but the names was inferred"
        subtitle="Capability, work classification and operator binding come from the step name. They are starting values marked low confidence — correct them in the editor once the cell is generated."
      />
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

export function SummaryStep({ picked, useCase }: { picked: Candidate | null; useCase: UseCase | null }) {
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

  return (
    <section className="planner">
      <h2 className="planner__h2">{picked.conceptLabel}</h2>
      <p className="planner__sub">{picked.rationale}</p>

      <Tile className="planner__derived">
        <div>
          <span className="planner__derivedLab">Loaded cost/part</span>
          <span className="planner__derivedVal">{money(cur, m.loadedCostPerPart)}</span>
        </div>
        <div>
          <span className="planner__derivedLab">Capex</span>
          <span className="planner__derivedVal">{moneyWhole(cur, m.capexTotal)}</span>
        </div>
        <div>
          <span className="planner__derivedLab">Operators</span>
          <span className="planner__derivedVal">{m.operators}</span>
        </div>
        <div>
          <span className="planner__derivedLab">Output</span>
          <span className="planner__derivedVal">{num(m.lineOut)}/shift</span>
        </div>
      </Tile>

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

      {useCase ? <p className="planner__lifecycle">{useCase.lifecycle}</p> : null}
    </section>
  );
}
