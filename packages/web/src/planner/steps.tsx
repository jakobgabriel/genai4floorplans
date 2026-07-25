import { useMemo, useState } from "react";
import {
  Button,
  ClickableTile,
  Column,
  Grid,
  InlineNotification,
  NumberInput,
  StructuredListBody,
  StructuredListCell,
  StructuredListHead,
  StructuredListRow,
  StructuredListWrapper,
  Tag,
  TextInput,
  Tile,
} from "@carbon/react";
import { inferWorkload } from "@flowplan/core/engine/infer";
import type { Candidate, GenerateBrief, ProcessStep } from "@flowplan/core/engine/generate";
import { Crossover } from "./Crossover";
import { Sensitivity } from "./Sensitivity";
import { DecisionWeightsEditor } from "./DecisionWeights";
import type { DecisionWeightsApi } from "../store/decisionWeights";
import { Btn } from "../components/Btn";
import { ConceptTable } from "./ConceptTable";
import { Add, Catalog, Subtract, TrashCan } from "@carbon/icons-react";
import { LibraryPicker } from "../components/LibraryPicker";
import type { LibraryApi } from "../store/library";
import { routingStepFrom } from "@flowplan/core/model/library";
import { Footnote, SectionLabel } from "../components/analysisKit";
import { derivePortfolio, type Part, type PortfolioDerivation } from "@flowplan/core/engine/portfolio";
import { formatRouting, parseRouting } from "./parseSteps";
import { analysisPath, type AnalysisStepId } from "../components/analysisPath";
import { navigate } from "../store/useHashRoute";
import type { FlowPlanApi } from "../store/useFlowPlan";
import { money, moneyWhole, num } from "../format";

// Individual stages of the planning process. Each is a plain presentational
// component; all state and navigation live in App, so the stepper stays
// authoritative and the editor can sit between two of these stages.

// ---- start ----------------------------------------------------------------

/**
 * The way in. Two things you can do: plan something new, or open something that
 * exists.
 *
 * This replaced a screen that asked you to classify yourself into one of five
 * lifecycle cases — "Plan a new process", "Choose a concept", "Improve a
 * planned cell", "Improve a running cell", "Monitor serial production" — each a
 * tall tile listing what you need and what you get. Four of them were the same
 * two paths wearing different labels: the first two both ran the full flow, and
 * the next two both just opened the editor on a cell you already had. So the
 * screen made you read five paragraphs and make a taxonomy decision to reach a
 * choice the buttons below make for you.
 *
 * Monitoring is genuinely not built, so it stays — as one honest line, not as a
 * tile you can evaluate and click.
 */
export function StartScreen({
  onPlan,
  onLibrary,
  onConcepts,
  onSample,
  onBlank,
  onImport,
  hasCell,
  onOpen,
  cellCount,
  processCount,
  conceptCount,
  conceptsEdited,
}: {
  onPlan: () => void;
  onLibrary: () => void;
  onConcepts: () => void;
  onSample: () => void;
  onBlank: () => void;
  onImport: () => void;
  /** True when there is saved work of the planner's own to go back to. */
  hasCell: boolean;
  onOpen: () => void;
  cellCount: number;
  processCount: number;
  conceptCount: number;
  conceptsEdited: boolean;
}) {
  return (
    <section className="planner planner--start">
      <header className="planner__head">
        <h1 className="planner__title">FlowPlan</h1>
        <p className="planner__sub">Manufacturing cell sizing, concept comparison and layout assessment.</p>
      </header>

      {/* Two destinations, not one with a side door. The library used to be a
          tab inside the editor's drawer, which said it only exists in service
          of whatever cell you have open — but looking a process up is a reason
          to open this tool on its own. */}
      <div className="portal">
        <PortalTile
          title="Plan a cell"
          body="Size a cell from its part demand, compare costed concepts, refine and assess the layout."
          meta="Parts & demand → Concepts → Refine → Summary"
          onClick={onPlan}
        />
        <PortalTile
          title="Process library"
          body="Process steps with cycle, manning, changeover, capex and footprint. Reused across routings and cells."
          meta={processCount === 0 ? "Empty" : `${processCount} process${processCount === 1 ? "" : "es"}`}
          onClick={onLibrary}
        />
        <PortalTile
          title="Manufacturing concepts"
          body="Concept profiles the comparison is generated from — volume band, cycle multiplier, manning and capex."
          meta={
            conceptCount === 0
              ? "None defined"
              : `${conceptCount} concept${conceptCount === 1 ? "" : "s"}${conceptsEdited ? " · edited" : " · as shipped"}`
          }
          onClick={onConcepts}
        />
        <PortalTile
          title={hasCell ? "Open a layout" : "See an example"}
          body={hasCell ? "Return to the workspace." : "A worked cell with a routing and a full assessment."}
          meta={hasCell ? `${cellCount} layout${cellCount === 1 ? "" : "s"} saved` : "Sample cell"}
          onClick={hasCell ? onOpen : onSample}
        />
      </div>

      <div className="planner__escape">
        {hasCell ? (
          <Button kind="ghost" size="md" onClick={onSample}>
            Open the sample cell
          </Button>
        ) : null}
        <Button kind="ghost" size="md" onClick={onBlank}>
          Start blank
        </Button>
        <Button kind="ghost" size="md" onClick={onImport}>
          Import a JSON model
        </Button>
      </div>

      <div className="planner__later">
        <p className="planner__laterRow">
          Serial-production monitoring is not implemented — see docs/lifecycle-cases-implementation.md §6.
        </p>
      </div>
    </section>
  );
}

/**
 * A portal tile — a button, not Carbon's `ClickableTile`.
 *
 * ClickableTile renders an anchor, and with no `href` that anchor is neither a
 * link nor a control: it is not keyboard-focusable, screen readers do not
 * announce it as actionable, and in jsdom clicking one queues a navigation to
 * the document URL *without* its fragment — which silently reset the hash
 * route a moment after any subsequent navigation, so every page opened from
 * the front door bounced straight back to the editor.
 *
 * These tiles run a function. That is a button.
 */
function PortalTile({
  title,
  body,
  meta,
  onClick,
}: {
  title: string;
  body: string;
  meta: string;
  onClick: () => void;
}) {
  return (
    <button type="button" className="portal__tile" onClick={onClick}>
      <span className="portal__title">{title}</span>
      <span className="portal__body">{body}</span>
      <span className="portal__meta">{meta}</span>
    </button>
  );
}

// ---- parts & demand -------------------------------------------------------

export interface DemandValues {
  name: string;
  programYears: number;
  annualShifts: number;
  shiftHours: number;
  /** The parts this cell makes, with a routing and a demand per program year
   *  each. The only source of what the cell has to do — see `PartTable`. */
  parts: Part[];
}

export function DemandStep({
  values,
  lib,
  onChange,
}: {
  values: DemandValues;
  lib: LibraryApi;
  onChange: (patch: Partial<DemandValues>) => void;
}) {
  const derived = useMemo(() => derivePortfolio(values.parts), [values.parts]);
  // The routing every part contributes to, so what was the Process step's
  // inference preview reads here instead of on a screen of its own.
  const unionSteps = derived ? derived.steps : [];

  const numField = (id: string, label: string, key: keyof DemandValues, min: number, helper?: string) => (
    <Column sm={4} md={4} lg={4}>
      <NumberInput
        id={id}
        label={label}
        helperText={helper}
        min={min}
        value={values[key] as number}
        onChange={(_: unknown, s: { value: number | string }) => onChange({ [key]: Math.max(min, Number(s.value) || min) })}
      />
    </Column>
  );

  return (
    <section className="planner planner--wide">
      <h2 className="planner__h2">Parts &amp; demand</h2>
      <p className="planner__sub">
        Part numbers, routings and demand per program year. The cell is sized on the busiest year and balanced across
        the mix.
      </p>

      <PartTable
        parts={values.parts}
        years={values.programYears}
        lib={lib}
        // Shortening the program drops the years it removes. The derivation
        // reads its length from the longest demand curve, so a retained-but-
        // hidden year would keep counting toward the program volume that
        // amortises capex — a number affecting the answer from off-screen.
        onYears={(programYears) =>
          onChange({
            programYears,
            parts: values.parts.map((p) => ({ ...p, demandByYear: p.demandByYear.slice(0, programYears) })),
          })
        }
        onChange={(parts) => onChange({ parts })}
      />

      <SectionLabel>Program</SectionLabel>
      <Grid condensed>
        <Column sm={4} md={4} lg={4}>
          <TextInput
            id="pl-name"
            labelText="Cell or program name"
            value={values.name}
            onChange={(e) => onChange({ name: e.target.value })}
          />
        </Column>
        {numField("pl-shifts", "Shifts per year", "annualShifts", 1)}
        {numField("pl-hours", "Shift hours", "shiftHours", 1)}
      </Grid>

      {unionSteps.length > 0 ? <InferencePreview steps={unionSteps} /> : null}
    </section>
  );
}

/** A program longer than this is not a program, it is a typo. */
const MAX_PROGRAM_YEARS = 25;

/**
 * The part portfolio, asked at the point the flow asks "how many".
 *
 * This replaced a hand-entered mix — two rows of "Mix A, 50%" — because those
 * percentages had to come from somewhere, and the somewhere is the part list a
 * planner already has. Part number, routing, and demand per program year is
 * what an RFQ actually contains.
 *
 * Everything the generator needs is derived from it (see
 * `@flowplan/core/engine/portfolio`): the cell is sized against the peak year
 * rather than an average, capex is amortised over every part and every year,
 * the routing is the union so there is a station for every step any part needs,
 * and the mix modes fall out of which parts share work content — skipping, per
 * mode, the steps its parts do not use.
 *
 * It belongs before Concepts because `generateCell` consumes all of that. Asked
 * later, the answer could not change the cell it describes.
 */
function PartTable({
  parts,
  years,
  lib,
  onYears,
  onChange,
}: {
  parts: Part[];
  years: number;
  lib: LibraryApi;
  onYears: (y: number) => void;
  onChange: (p: Part[]) => void;
}) {
  const derived = useMemo(() => derivePortfolio(parts), [parts]);
  // Which row is building its routing from the library, if any. Resolved
  // against the live list so appending a step re-reads the row it just changed.
  const [pickFor, setPickFor] = useState<string | null>(null);
  const picking = parts.find((p) => p.id === pickFor) ?? null;
  // No second cap here. The column count used to be `min(years, 10)`, which
  // silently truncated a longer program: you could ask for twelve years, see
  // ten, and have no way to enter demand for the last two.
  const cols = Math.max(1, Math.min(years, MAX_PROGRAM_YEARS));

  const patch = (id: string, p: Partial<Part>) => onChange(parts.map((x) => (x.id === id ? { ...x, ...p } : x)));
  const setDemand = (part: Part, y: number, v: number) => {
    const d = Array.from({ length: cols }, (_, i) => part.demandByYear[i] ?? 0);
    d[y] = Math.max(0, v);
    patch(part.id, { demandByYear: d });
  };
  const add = () => {
    const n = parts.length + 1;
    onChange(
      parts.concat([
        { id: "part-" + n + "-" + Date.now(), partNumber: "PN-" + String(n).padStart(3, "0"), steps: [], demandByYear: [] },
      ]),
    );
  };

  return (
    <section className="planner__mix">
      {/* The year count lives on the table it governs. It used to be a
          "Program years" field in a group below, so the control that adds a
          column was not visible from the columns. */}
      <div className="planner__mixHead">
        <Footnote>
          Routing format: <code>Load 5 &gt; Press 10</code> — step name, cycle in seconds. Omit a time to infer it.
        </Footnote>
        <div className="parts__years">
          <span className="parts__yearsLab">
            {cols} program year{cols === 1 ? "" : "s"}
          </span>
          <Button
            kind="ghost"
            size="sm"
            hasIconOnly
            renderIcon={Subtract}
            iconDescription="One year fewer"
            tooltipPosition="bottom"
            disabled={cols <= 1}
            onClick={() => onYears(cols - 1)}
          />
          <Button
            kind="ghost"
            size="sm"
            hasIconOnly
            renderIcon={Add}
            iconDescription="One year more"
            tooltipPosition="bottom"
            disabled={cols >= MAX_PROGRAM_YEARS}
            onClick={() => onYears(cols + 1)}
          />
        </div>
      </div>
      <div className="parts u-scroll-x">
        <table className="parts__table">
          <thead>
            <tr>
              <th>Part number</th>
              <th>Routing</th>
              {Array.from({ length: cols }, (_, y) => (
                <th key={y} className="parts__num">
                  Yr {y + 1}
                </th>
              ))}
              <th />
            </tr>
          </thead>
          <tbody>
            {parts.map((part) => (
              <tr key={part.id}>
                <td>
                  <TextInput
                    id={"pn-" + part.id}
                    labelText="Part number"
                    hideLabel
                    size="sm"
                    value={part.partNumber}
                    onChange={(e) => patch(part.id, { partNumber: e.target.value })}
                  />
                </td>
                <td>
                  <div className="parts__routing">
                    <TextInput
                      id={"rt-" + part.id}
                      labelText="Routing"
                      hideLabel
                      size="sm"
                      placeholder="Load 5 > Press 10 > Weld 20"
                      value={formatRouting(part.steps)}
                      onChange={(e) => patch(part.id, { steps: parseRouting(e.target.value) })}
                    />
                    {/* Typing a routing from memory is what the library exists
                        to stop. The field stays — this is the other way in. */}
                    <Button
                      kind="ghost"
                      size="sm"
                      hasIconOnly
                      renderIcon={Catalog}
                      iconDescription={`Build ${part.partNumber}'s routing from the library`}
                      tooltipPosition="left"
                      onClick={() => setPickFor(pickFor === part.id ? null : part.id)}
                    />
                  </div>
                </td>
                {Array.from({ length: cols }, (_, y) => (
                  <td key={y}>
                    <TextInput
                      id={"d-" + part.id + "-" + y}
                      labelText={"Year " + (y + 1)}
                      hideLabel
                      size="sm"
                      value={String(part.demandByYear[y] ?? "")}
                      onChange={(e) => setDemand(part, y, Number(e.target.value.replace(/[^0-9]/g, "")) || 0)}
                    />
                  </td>
                ))}
                <td>
                  <Button
                    kind="ghost"
                    size="sm"
                    hasIconOnly
                    renderIcon={TrashCan}
                    iconDescription={`Remove ${part.partNumber}`}
                    tooltipPosition="left"
                    disabled={parts.length === 1}
                    onClick={() => onChange(parts.filter((x) => x.id !== part.id))}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="planner__mixFoot">
        <Button kind="ghost" size="sm" renderIcon={Add} onClick={add}>
          Add a part
        </Button>
      </div>

      {picking ? (
        <div className="parts__picker">
          <div className="parts__pickerHead">
            <SectionLabel>Add a step to {picking.partNumber}</SectionLabel>
            <Button kind="ghost" size="sm" onClick={() => setPickFor(null)}>
              Done
            </Button>
          </div>
          <LibraryPicker
            lib={lib}
            onPick={(p) => patch(picking.id, { steps: picking.steps.concat([routingStepFrom(p)]) })}
          />
        </div>
      ) : null}

      {derived ? <PortfolioReadout d={derived} /> : null}
      {derived && derived.ignored.length > 0 ? (
        <InlineNotification
          kind="info"
          lowContrast
          hideCloseButton
          title={`Not counted: ${derived.ignored.join(", ")}`}
          subtitle="Requires a routing and demand in at least one year."
        />
      ) : null}
    </section>
  );
}

/** What the parts add up to — the numbers the concepts will actually use. */
function PortfolioReadout({ d }: { d: PortfolioDerivation }) {
  return (
    <Tile className="planner__derived">
      <div>
        <span className="planner__derivedLab">Sized for</span>
        <span className="planner__derivedVal">{num(d.peakVolume)}</span>
        <span className="planner__derivedNote">year {d.peakYear}, the busiest</span>
      </div>
      <div>
        <span className="planner__derivedLab">Program</span>
        <span className="planner__derivedVal">{num(d.programVolume)}</span>
        <span className="planner__derivedNote">all parts, all {d.years} years</span>
      </div>
      <div>
        <span className="planner__derivedLab">Distinct mixes</span>
        <span className="planner__derivedVal">{d.modes.length}</span>
        <span className="planner__derivedNote">
          {d.modes.length === 1 ? "one work content" : "by work content"}
        </span>
      </div>
      <div>
        <span className="planner__derivedLab">Union routing</span>
        <span className="planner__derivedVal">{d.steps.length}</span>
        <span className="planner__derivedNote">steps across all parts</span>
      </div>
    </Tile>
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
          subtitle={`${inferred.unmatched.join(", ")} — generic defaults applied. Name steps after the operation (weld, press, inspect, pack) to match.`}
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
        title="Inferred fields"
        subtitle="Capability, work class and operator binding are derived from the step name. Low confidence — correct in the editor."
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
  peakYear,
  brief,
  weightsApi,
}: {
  candidates: Candidate[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  perShift: number;
  /** Set when the volume came from a part portfolio's busiest year. */
  peakYear?: number;
  /** The brief the candidates came from, for the crossover and sensitivity sweeps. */
  brief: GenerateBrief;
  weightsApi: DecisionWeightsApi;
}) {
  const [showWeights, setShowWeights] = useState(false);
  return (
    <section className="planner planner--wide">
      <h2 className="planner__h2">Concept comparison</h2>
      <p className="planner__sub">
        {num(perShift)} parts/shift{peakYear ? ` · year-${peakYear} peak` : ""} · cost per part fully loaded
        (operating + amortised capex)
      </p>
      {/* The ranking is a weighted judgement, not a fact, so the weighting is
          one click away from the table it produced. */}
      <div className="planner__weightsBar">
        <Btn size="compact" variant="ghost" onClick={() => setShowWeights((v) => !v)}>
          {showWeights ? "Hide weights" : "Weights"}
        </Btn>
        <Footnote>{weightsApi.isDefault ? "Default weighting" : "Custom weighting"}</Footnote>
      </div>
      {showWeights ? <DecisionWeightsEditor api={weightsApi} /> : null}

      <ConceptTable candidates={candidates} selectedId={selectedId} onSelect={onSelect} />

      {/* The table answers "what is best at this volume". Demand is a forecast,
          so the two questions after it are always "where does that change?" and
          "does it survive being wrong?" */}
      <Crossover
        brief={brief}
        atVolume={brief.annualVolume}
        currency={candidates[0]?.cost.currency ?? "$"}
      />
      <Sensitivity brief={brief} weights={weightsApi.weights} />
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
        <p className="glance__footNote">Printable record of the concepts compared.</p>
      </div>
    </section>
  );
}

export function SummaryStep({
  picked,
  api,
  onOpenAnalysis,
}: {
  picked: Candidate | null;
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

      <SectionLabel>Costed from the brief</SectionLabel>
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
          title="Outside the concept's volume band"
          subtitle={`${picked.conceptLabel} normally suits ${num(picked.profile.viableVolume[0])}–${num(
            picked.profile.viableVolume[1],
          )} parts/year. Band editable on the Concepts page.`}
        />
      ) : null}

      <InlineNotification
        kind="info"
        lowContrast
        hideCloseButton
        title="Planning estimate"
        subtitle="Concept costs are heuristics; layouts are template placements. Refine before quoting."
      />

      {hasCell ? <AnalysisGlance api={api} onOpen={onOpenAnalysis} /> : null}
    </section>
  );
}
