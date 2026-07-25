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
import type { VariantMode } from "@flowplan/core/model/types";
import { COMPLEXITY_LABELS, USE_CASES, type CycleKnowledge, type UseCase, type UseCaseId } from "./usecases";
import { ConceptTable } from "./ConceptTable";
import { Add, TrashCan } from "@carbon/icons-react";
import { Footnote, SectionLabel } from "../components/analysisKit";
import { analysisPath, type AnalysisStepId } from "../components/analysisPath";
import { navigate } from "../store/useHashRoute";
import type { FlowPlanApi } from "../store/useFlowPlan";
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
  const ready = USE_CASES.filter((u) => u.availability !== "unavailable");
  const later = USE_CASES.filter((u) => u.availability === "unavailable");
  return (
    <section className="planner">
      <header className="planner__head">
        <h1 className="planner__title">What are you planning?</h1>
        <p className="planner__sub">The steps that follow are only the ones that case needs.</p>
        {hasCell ? (
          <Button kind="ghost" size="sm" onClick={onSkip}>
            Skip to the editor →
          </Button>
        ) : null}
      </header>

      {/* The fastest way to understand the tool is to open something that
          already works, so it leads rather than sitting under five tall tiles. */}
      <div className="planner__escape">
        <Button kind="tertiary" size="sm" onClick={onSample}>
          Open the sample cell
        </Button>
        <Button kind="ghost" size="sm" onClick={onBlank}>
          Start blank
        </Button>
        <Button kind="ghost" size="sm" onClick={onImport}>
          Import a JSON model
        </Button>
      </div>

      <Grid className="planner__grid" condensed>
        {ready.map((u) => (
          <Column key={u.id} sm={4} md={4} lg={8}>
            <ClickableTile className="planner__tile" onClick={() => onPick(u.id)}>
              <div className="planner__tileHead">
                <h3>{u.label}</h3>
                {u.availability === "partial" ? (
                  <Tag type="magenta" size="sm">
                    Partial
                  </Tag>
                ) : null}
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
            </ClickableTile>
          </Column>
        ))}
      </Grid>

      {/* Unbuilt cases were full-size tiles among the working ones, so a
          first-timer read and evaluated an option that cannot be chosen. They
          are a roadmap line now, not a choice. */}
      {later.length > 0 ? (
        <div className="planner__later">
          <SectionLabel>Not built yet</SectionLabel>
          {later.map((u) => (
            <p key={u.id} className="planner__laterRow">
              <b>{u.label}</b> — {(u.caveat ?? u.gives).replace(/^Not built\.\s*/, "")}
            </p>
          ))}
        </div>
      ) : null}
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
  /** Mix modes. Empty ⇒ the cell carries one kind of work (single-model). */
  modes: VariantMode[];
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

      <MixEditor modes={values.modes} onChange={(modes) => onChange({ modes })} />
    </section>
  );
}

/**
 * The product mix, asked at the point the flow asks "how many".
 *
 * A cell almost never carries one part number, and the model has always known
 * that — `VariantMode` exists so one line can carry forty products without
 * modelling forty products. But nothing in the app could create one: the
 * reducer had ADD/UPDATE/DELETE_VARIANT_MODE with tests, and the only UI was a
 * read-only list buried in Build ▸ Workload. A planner had to size the whole
 * cell for a single product and discover the gap later.
 *
 * It belongs here because the concepts on the next step are balanced against
 * the mix — `generateCell` takes `variantModes` and assigns stations from the
 * heaviest one. Asked afterwards, the answer would arrive too late to matter.
 */
function MixEditor({ modes, onChange }: { modes: VariantMode[]; onChange: (m: VariantMode[]) => void }) {
  const total = modes.reduce((a, m) => a + m.share, 0);
  const off = modes.length > 0 && Math.abs(total - 1) > 0.005;

  const seed = () =>
    onChange([
      { id: "mix-1", name: "Mix A", share: 0.5, elementOverrides: {} },
      { id: "mix-2", name: "Mix B", share: 0.5, elementOverrides: {} },
    ]);
  const patch = (id: string, p: Partial<VariantMode>) => onChange(modes.map((m) => (m.id === id ? { ...m, ...p } : m)));

  return (
    <section className="planner__mix">
      <SectionLabel>Product mix</SectionLabel>
      {modes.length === 0 ? (
        <>
          <Footnote>
            This cell is sized for one kind of work. A mix exists only where work content genuinely differs —
            forty part numbers needing the same work are one mix.
          </Footnote>
          <Button kind="tertiary" size="sm" onClick={seed}>
            The cell carries more than one mix
          </Button>
        </>
      ) : (
        <>
          <Footnote>Shares of total output. The concepts on the next step are balanced against the heaviest.</Footnote>
          <div className="planner__mixHead">
            <span>Mix</span>
            <span>Share %</span>
          </div>
          {modes.map((m) => (
            <div key={m.id} className="planner__mixRow">
              <TextInput
                id={"mix-name-" + m.id}
                labelText="Mix"
                hideLabel
                size="sm"
                value={m.name}
                onChange={(e) => patch(m.id, { name: e.target.value })}
              />
              <NumberInput
                id={"mix-share-" + m.id}
                label="Share %"
                hideLabel
                size="sm"
                min={0}
                max={100}
                hideSteppers
                value={Math.round(m.share * 100)}
                onChange={(_: unknown, st: { value: number | string }) =>
                  patch(m.id, { share: Math.min(1, Math.max(0, (Number(st.value) || 0) / 100)) })
                }
              />
              <Button
                kind="ghost"
                size="sm"
                hasIconOnly
                renderIcon={TrashCan}
                iconDescription={`Remove ${m.name}`}
                tooltipPosition="left"
                onClick={() => onChange(modes.filter((x) => x.id !== m.id))}
              />
            </div>
          ))}
          <div className="planner__mixFoot">
            <Button
              kind="ghost"
              size="sm"
              renderIcon={Add}
              onClick={() =>
                onChange(
                  modes.concat([
                    { id: "mix-" + (modes.length + 1) + "-" + modes.length, name: "Mix " + String.fromCharCode(65 + modes.length), share: 0, elementOverrides: {} },
                  ]),
                )
              }
            >
              Add a mix
            </Button>
            <Button kind="ghost" size="sm" onClick={() => onChange([])}>
              Single mix
            </Button>
          </div>
          {off ? (
            <InlineNotification
              kind="warning"
              lowContrast
              hideCloseButton
              title={`Shares total ${(total * 100).toFixed(0)}%, not 100%`}
              subtitle="Balancing uses them as written, so the mix would not add up to the volume above."
            />
          ) : null}
        </>
      )}
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
          helperText="One per line: name then cycle seconds. Tab, comma or semicolon separated."
          rows={8}
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
        />
      ) : (
        <>
          <TextArea
            id="pl-stepnames"
            labelText="Process steps"
            helperText="One name per line. Cycle times are estimated until you enter real ones."
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
        Sized for {num(perShift)} parts/shift. Cost per part is fully loaded — operating cost plus equipment amortised
        over {programYears} years.
      </p>
      <ConceptTable candidates={candidates} selectedId={selectedId} onSelect={onSelect} />
    </section>
  );
}

// ---- summary --------------------------------------------------------------

/**
 * The six stages of the analysis path as one at-a-glance grid.
 *
 * Same order, same figures and same wording as the Analysis page, so the plan is
 * read the same way whether you are standing in the editor or looking at the
 * summary. Each tile opens the stage it summarises.
 */
function AnalysisGlance({ api, onOpen }: { api: FlowPlanApi; onOpen?: (id: AnalysisStepId) => void }) {
  const path = analysisPath(api);
  return (
    <section className="glance">
      <h3 className="planner__h2 glance__h">The cell as it now stands</h3>
      <p className="planner__sub">
        Measured on the layout in the editor, not on the concept estimate above — the two differ once you
        refine it. Open any one to see the working.
      </p>
      <div className="glance__grid">
        {path.map((s, i) => (
          <ClickableTile key={s.id} className="glance__tile" onClick={() => onOpen?.(s.id)}>
            <div className="glance__head">
              <span className="glance__num">{i + 1}</span>
              <span className="glance__label">{s.label}</span>
            </div>
            <div className="glance__value">{s.value}</div>
            <Tag type={s.tone} size="sm">
              {s.sub}
            </Tag>
            {s.question ? <p className="glance__q">{s.question}</p> : null}
          </ClickableTile>
        ))}
      </div>
      {/* The end of the flow: concepts compared, cell designed, now write it
          down. The report is a separate page rather than more of this one
          because it is the artefact that leaves the tool. */}
      <div className="glance__foot">
        <Button onClick={() => navigate("/report")}>Open report</Button>
        <p className="glance__footNote">Printable, and records the concepts you compared.</p>
      </div>
    </section>
  );
}

export function SummaryStep({
  picked,
  useCase,
  api,
  onOpenAnalysis,
}: {
  picked: Candidate | null;
  useCase: UseCase | null;
  api: FlowPlanApi;
  onOpenAnalysis?: (id: AnalysisStepId) => void;
}) {
  const hasCell = api.model.stations.some((s) => s.role === "process");
  if (!picked) {
    return (
      <section className="planner">
        {hasCell ? (
          <>
            <h2 className="planner__h2">{api.model.name}</h2>
            <p className="planner__sub">Pick a concept to compare this against a costed starting point.</p>
            <AnalysisGlance api={api} onOpen={onOpenAnalysis} />
          </>
        ) : (
          <>
            <h2 className="planner__h2">No concept chosen</h2>
            <p className="planner__sub">Pick one on the Concepts step.</p>
          </>
        )}
      </section>
    );
  }
  const m = picked.metrics;
  const cur = picked.cost.currency;

  return (
    <section className="planner">
      <h2 className="planner__h2">{picked.conceptLabel}</h2>
      <p className="planner__sub">{picked.rationale}</p>

      <SectionLabel>The concept, as costed from the brief</SectionLabel>
      <Tile className="planner__derived">
        <div>
          <span className="planner__derivedLab">Loaded cost/part</span>
          <span className="planner__derivedVal">{money(cur, m.loadedCostPerPart)}</span>
          <span className="planner__derivedNote">incl. capex</span>
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
          <span className="planner__derivedNote">as generated</span>
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

      {hasCell ? <AnalysisGlance api={api} onOpen={onOpenAnalysis} /> : null}

      {useCase ? <p className="planner__lifecycle">{useCase.lifecycle}</p> : null}
    </section>
  );
}
