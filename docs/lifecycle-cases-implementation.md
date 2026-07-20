# FlowPlan — Lifecycle Cases Implementation Spec

Implementation design for extending FlowPlan across the product lifecycle:
RFQ/planning (Cases 1–3), ramp-up (Case 4), serial production (Case 5).

Companion to `docs/flowplanspec.md`. Written against schema v5.

---

## 0. Ground rules

These are invariants of the existing codebase. Every design below respects them.

1. **Inert defaults.** `packages/core/src/engine/engine.test.ts` holds golden
   fixtures that lock the original demo's numbers. Every new field must default
   so that existing models score byte-identically. Migrations in `migrate.ts` are
   pure version bumps; `normalizeModel` fills the new fields.
2. **The engine is framework-free and deterministic.** It lives in
   `@flowplan/core` so the server re-scores AI output with the exact code the
   client runs. Nothing below may introduce I/O, randomness, or `Date.now()` into
   the engine.
3. **The AI never supplies numbers.** Per `ai/types.ts`, providers emit a `Model`
   or a `ModelAction[]`; all KPIs come from the engine via `verify.ts`. New AI
   surfaces follow the same contract.
4. **The Model is stored as JSONB** (`Cell.model`, `Scenario.model`). Extending
   the Model needs **no Prisma migration** — only a `SCHEMA_VERSION` bump. This
   is why Cases 1–4 are cheap and Case 5 is not.
5. **All mutations go through `modelReducer`** via the `ModelAction` union.
6. **Provider abstractions carry a shared contract test.** See
   `store/storage/storage.contract.test.ts`. New provider families do the same.

---

## 1. Foundation — Product & Volume — ✅ SHIPPED (schema v7)

Landed in `model/types.ts` (`Product`, `PartFeature`, `VolumeScenario`,
`VolumeMode`, `FEATURE_KINDS`), `engine/volume.ts` (`resolveVolumes`,
`volumeSummary`), `engine/validate.ts` (`validateVolume`), `store/reducer.ts`
(8 actions + `makeProduct`/`makeVolumeScenario`), and
`web/components/VolumePanel.tsx`. Tests: `engine/volume.test.ts` (24),
`web/components/VolumePanel.test.tsx` (9).

Two decisions worth recording, both refinements on the design below:

1. **Demand is stated as good parts out, not starts.** `resolveVolumes` does a
   unit propagation, measures what reaches the outputs, then scales — so scrap
   inflates upstream volumes automatically. A 10%-scrap step means 1111 started
   to ship 1000. Stating demand as starts would have been easier and wrong.
2. **Derived volumes are materialized into `Flow.volume` by the reducer**, not
   computed at read time. Same rationale as `syncCycleTime`: every existing
   reader (KPIs, cost, CSV export, the flow editor) keeps working untouched.
   Degrades safely — an ungraphable model keeps its stored volumes and reports
   why, rather than silently zeroing.

Known limitation, surfaced in the UI: `productMix` is carried and validated but
the routing does not yet vary per product. That needs the process library (§2).

### 1.0 Original design (schema v6 draft)

Prerequisite for Cases 1, 2, and 3. Build this first; nothing else lands cleanly
without it.

### 1.1 Model additions

```ts
// packages/core/src/model/types.ts

export type FeatureKind =
  | "hole" | "thread" | "face" | "slot" | "weld" | "bend"
  | "surface-finish" | "assembly-joint" | "marking" | "inspection-point";

export interface PartFeature {
  kind: FeatureKind;
  qty: number;
  toleranceMm?: number;
  notes?: string;
}

export interface Product {
  id: string;
  name: string;
  material: string;          // "AL6082", "S355", "PA66-GF30"
  massKg: number;
  features: PartFeature[];
  variantOf?: string;        // groups a variant family
}

export interface VolumeScenario {
  id: string;
  name: string;              // "RFQ base", "high take-rate", "downside"
  annualVolume: number;
  productMix: Record<string, number>;  // productId -> share (0..1)
  programYears: number;
  probability?: number;      // for probability-weighted RFQ appraisal
}

/** "explicit" = Flow.volume is authoritative (legacy). "derived" = volumes are
 *  computed from the active VolumeScenario. Defaults to "explicit". */
export type VolumeMode = "explicit" | "derived";

export interface Model {
  // ... existing fields unchanged ...
  products?: Product[];
  volumeScenarios?: VolumeScenario[];
  activeVolumeScenarioId?: string;
  volumeMode?: VolumeMode;
}
```

### 1.2 Preserving inertness

The critical design decision. `volumeMode` defaults to `"explicit"`, so every
existing model continues to read `Flow.volume` exactly as today and the golden
fixtures do not move.

When `volumeMode === "derived"`, flow volumes become computed. Implement this as
a **pre-pass that produces an ordinary `Model`**, so `balance.ts`, `kpis.ts`, and
`cost.ts` remain completely untouched:

```ts
// packages/core/src/engine/volume.ts
export function resolveVolumes(model: Model): Model;
```

It walks the flow graph from input roles, distributing annual volume (÷ shifts
per year, from `costConfig.annualShifts`) across split shares and multiplying
through `unitsPerAssembly` at assemble merges. Every downstream engine call
becomes `buildRating(resolveVolumes(model))`.

### 1.3 Migration & actions

```ts
// migrate.ts — v5 -> v6: products, volume scenarios. All absent by default.
const toV6: Migration = (m) => ({ ...m, schemaVersion: 6 });
```

```ts
// reducer.ts — new actions
| { type: "ADD_PRODUCT"; product: Product }
| { type: "UPDATE_PRODUCT"; id: string; patch: Partial<Product> }
| { type: "DELETE_PRODUCT"; id: string }
| { type: "ADD_VOLUME_SCENARIO"; scenario: VolumeScenario }
| { type: "UPDATE_VOLUME_SCENARIO"; id: string; patch: Partial<VolumeScenario> }
| { type: "DELETE_VOLUME_SCENARIO"; id: string }
| { type: "SET_ACTIVE_VOLUME_SCENARIO"; id: string | undefined }
| { type: "SET_VOLUME_MODE"; mode: VolumeMode }
```

### 1.4 UI

New `ProductPanel` in the side-panel tab group (`panels.tsx` pattern), plus a
volume-scenario selector in the header. Switching the active scenario re-scores
live — the whole app becomes volume-aware for free.

---

## 2. Case 1 — Recommend manufacturing steps for a new product

**Goal:** given a product and a target volume, propose the required processes.

**Core gap:** there is no process taxonomy. `StationType` is
`machine|manual|quality|store|buffer` — it cannot express *milling* vs *welding*.
The work here is 70% reference-data curation, 30% code.

### 2.1 Process capability library

New module `packages/core/src/process/`.

```ts
export interface ProcessCapability {
  id: string;                        // "cnc-mill-3ax"
  name: string;
  family: "machining" | "forming" | "joining" | "additive"
        | "surface" | "assembly" | "inspection";

  // --- feasibility ---
  producesFeatures: FeatureKind[];
  materials: string[];               // glob-ish: "AL*", "S355"
  toleranceMinMm: number;            // best achievable
  massRangeKg: [number, number];
  requiresBefore?: FeatureKind[];    // precedence (e.g. heat-treat before grind)

  // --- economics (drives volume dependence) ---
  viableVolume: [number, number];    // annual units where this is sensible
  capexBand: [number, number];
  cycleTimeSecPerFeature: number;
  setupMin: number;
  operators: number;
  energyKw: number;

  // --- mapping back into the existing Model ---
  stationType: StationType;
  automationReadiness: AutoState;
}
```

Ships as a seeded JSON library, editable per team (stored on `Team`, so a plant
can tune it to its real machine park). This editability is what makes it adopted
rather than ignored.

### 2.2 The recommender

```ts
// packages/core/src/process/recommend.ts
export interface RoutingProposal {
  model: Model;                      // engine-scorable, immediately
  steps: Array<{
    capabilityId: string;
    coversFeatures: PartFeature[];
    rationale: string;
    alternatives: string[];          // capability ids that also fit
  }>;
  unresolvedFeatures: PartFeature[]; // honest about what it couldn't cover
}

export function recommendRouting(
  product: Product,
  annualVolume: number,
  library: ProcessCapability[],
): RoutingProposal;
```

Algorithm:

1. **Feature coverage.** For each `PartFeature`, collect capabilities matching
   feature kind, material, tolerance, and mass. Empty set → `unresolvedFeatures`.
2. **Volume scoring.** Score each candidate by where `annualVolume` sits inside
   `viableVolume` — centred scores high, near the band edges is penalised, outside
   is excluded. *This is the mechanism that makes the recommendation
   volume-dependent.*
3. **Consolidation.** Merge features producible on one capability into a single
   station (fewer setups, fewer handovers). Greedy set-cover weighted by setup time.
4. **Sequencing.** Topological sort over `requiresBefore` precedence.
5. **Emit a Model.** Stations with
   `cycleTimeSec = Σ(feature × cycleTimeSecPerFeature) + amortised setup`,
   chained flows, plus `input`/`output` role stations so `validateFlow` passes
   clean.

The output is an ordinary `Model`, so `buildRating` scores it instantly and it
drops into the existing canvas, Compare page, and export path with zero new
plumbing.

### 2.3 Volume sweep

```ts
export function recommendAcrossVolumes(
  product: Product, volumes: number[], library: ProcessCapability[],
): Array<{ volume: number; proposal: RoutingProposal }>;
```

Reveals where the recommended routing *changes* as volume rises — the direct
input to Case 2's crossover analysis.

### 2.4 Division of labour with the AI layer

Important: the LLM should **not** invent routings. Its job is
unstructured → structured extraction:

- `ingest`/`ingestImage` (already exist) parse an RFQ document, drawing, or
  routing sheet into a `Product` with `PartFeature[]`.
- `recommendRouting` — deterministic, testable, auditable — does the selection.

This keeps the `verify.ts` guarantee intact and makes the output defensible in an
RFQ review, which a free-associating LLM answer is not.

### 2.5 Testing

Golden fixtures per product archetype (turned shaft, sheet-metal bracket,
injection-moulded housing, welded assembly) × three volume bands. Lock both the
selected capability ids and the resulting composite score.

---

## 3. Case 2 — Which manufacturing concept to use

**Goal:** a defensible, auditable concept decision.

**Existing foundation:** scenarios + `ComparePage` already compare variants.
What's missing is decision *structure* and lifecycle economics.

### 3.1 Concept as an explicit axis

`cellTemplate`'s `CellForm` (`I|U|L|S`) is layout geometry, not manufacturing
concept. Add the orthogonal axis:

```ts
export type ConceptKind =
  | "manual-bench" | "cell" | "flow-line" | "transfer-line" | "job-shop";

export interface Model { /* ... */ conceptKind?: ConceptKind; }
```

### 3.2 The Decision entity

A decision sits *above* the Model — it references several cells.

```ts
// packages/core/src/decision/types.ts
export interface DecisionCriterion {
  id: string;
  label: string;
  weight: number;                    // normalized like RatingWeights
  direction: "min" | "max";
  source: "engine" | "manual";
  metric?: EngineMetric;             // when source==="engine"
}

export type EngineMetric =
  | "composite" | "costPerPart" | "capexTotal" | "lineOut"
  | "balanceScore" | "ergoScore" | "npv" | "breakEvenUnits";

export interface Alternative {
  id: string;
  name: string;
  conceptKind: ConceptKind;
  cellId: string;                    // -> a stored Model
  manualScores: Record<string, number>;  // criterionId -> 0..100
}

export interface Decision {
  id: string;
  name: string;
  productId: string;
  volumeScenarioIds: string[];
  criteria: DecisionCriterion[];
  alternatives: Alternative[];
  recommendation?: {
    alternativeId: string;
    rationale: string;
    decidedBy: string;
    decidedAt: string;               // ISO
  };
}
```

`source: "engine"` criteria pull their value straight from `buildRating` /
`costAnalysis`. That is the credibility hook: most of the matrix is computed, not
asserted, and it stays live as the underlying layouts change.

### 3.3 Scoring & sensitivity

```ts
// packages/core/src/decision/score.ts
export interface DecisionResult {
  ranked: Array<{ alternativeId: string; score: number; byCriterion: Record<string, number> }>;
  /** Rank stability under weight perturbation — the defensibility check. */
  sensitivity: { stableTopChoice: boolean; flipsAt: Array<{ criterionId: string; deltaPct: number }> };
}

export function scoreDecision(d: Decision, models: Record<string, Model>): DecisionResult;
```

Min–max normalize each criterion across alternatives, apply `direction`, weight,
sum. Then perturb each weight ±20% and report whether the top choice flips —
this is what survives scrutiny in an RFQ gate review.

### 3.4 Lifecycle appraisal

`costAnalysis` is steady-state per-shift. RFQ decisions need program economics.

```ts
// packages/core/src/engine/appraisal.ts
export interface AppraisalResult {
  npv: number;
  cashflows: Array<{ year: number; capex: number; opex: number; revenue?: number; net: number }>;
  costPerPartByYear: number[];
  breakEvenUnits: number | null;
  totalProgramCost: number;
}

export function appraise(model: Model, scenario: VolumeScenario, cfg: CostConfig): AppraisalResult;
```

`CostConfig` gains `discountRate` and `programYears`. Reuses `costAnalysis` per
year; the new part is discounting and the capex/opex split over time.

### 3.5 Crossover analysis

Evaluate every alternative across a volume sweep → the chart that answers the
actual RFQ question:

> *Concept A wins below 120k/yr; the transfer line wins above it.*

This is the single highest-value output of Case 2, and it composes directly out
of §2.3 and §3.4.

### 3.6 Storage

Unlike Cases 1/3/4, a `Decision` references *multiple* cells, so it does **not**
live inside a Model JSONB blob. It needs a real table:

```prisma
model Decision {
  id           String   @id @default(cuid())
  workspaceId  String
  name         String
  payload      Json     // the Decision object
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  workspace    Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  @@index([workspaceId])
}
```

### 3.7 UI

Extend `ComparePage` into the decision matrix: alternatives as columns, criteria
as rows, engine-sourced cells live and manual cells editable, weights as sliders
(mirroring the existing weights UI), sensitivity bar underneath, and a sign-off
block that writes `recommendation`.

---

## 4. Case 3 — Optimizing a process during planning

**Goal:** handling, cycle times, balancing.

**Status:** balancing is already strong (`balance.ts` has bottleneck detection,
takt, critical path, parallel units, `syncWaits`). Handling and cycle-time
structure are the gaps.

### 4.1 Cycle-time decomposition — ✅ SHIPPED (schema v6)

Implemented as described below. Landed in:

- `model/types.ts` — `CycleBreakdown`, `CYCLE_KEYS`, `sumCycle`, `Station.cycle`
- `model/defaults.ts` — `syncCycleTime`, called from `normalizeStation`
- `model/migrate.ts` — `toV6` (inert bump)
- `engine/cycle.ts` — `effectiveCycleSec`, `cycleAnalysis`, `cycleAdvice`, `seedBreakdown`
- `engine/balance.ts` / `engine/automation.ts` — all cycle reads routed through `effectiveCycleSec`
- `store/reducer.ts` — `SET_CYCLE_BREAKDOWN`, `PATCH_CYCLE_BREAKDOWN`
- `web/components/charts.tsx` — `YamazumiChart`
- `web/components/panels.tsx` — `CycleSection` (Balance tab), `CycleBreakdownEditor` (Inspect)
- Tests: `engine/cycle.test.ts` (20), `web/components/CyclePanel.test.tsx` (7)

One design point worth recording: `cycleTimeSec` is kept **in sync** with the
breakdown's sum by `syncCycleTime` rather than being left to drift. That means
every legacy reader that was never taught about decomposition — the station
tooltip, CSV export, the AI layout signature in `verify.ts` — keeps showing a
correct number with no change.

### 4.1a Original design

```ts
export interface CycleBreakdown {
  valueAddSec: number;
  handlingSec: number;      // load / unload / part presentation
  walkSec: number;
  waitSec: number;
  setupSec: number;         // amortised per part over batch size
}

export interface Station { /* ... */ cycle?: CycleBreakdown; }
```

**Inertness:** introduce one choke point in `balance.ts` —

```ts
export function effectiveCycleSec(s: Station): number {
  if (!s.cycle) return s.cycleTimeSec;                 // legacy path, unchanged
  const c = s.cycle;
  return c.valueAddSec + c.handlingSec + c.walkSec + c.waitSec + c.setupSec;
}
```

`stationRate` calls this instead of reading `cycleTimeSec` directly. Golden
fixtures have no `cycle`, so they take the legacy path and stay green.

Unlocks immediately:
- **Yamazumi chart** — stacked value-add vs non-value-add per station against takt.
- **Handling share of takt** as a headline KPI.
- Optimisation that targets *waste* rather than just moving boxes.

### 4.2 Handling model

```ts
// packages/core/src/engine/handling.ts
export interface HandlingSpec {
  method: "manual" | "gripper" | "fixture" | "conveyor" | "robot";
  graspSec: number; moveSec: number; placeSec: number; orientSec: number;
  reachDistanceMm: number;
  partWeightKg: number;
  repetitionsPerCycle: number;
  posture: "neutral" | "reaching" | "overhead" | "bent";
}

export function handlingTime(spec: HandlingSpec): number;
export function ergoLoad(spec: HandlingSpec): { index: number; risk: ErgoRisk };
```

`ergoLoad` derives a NIOSH/REBA-lite index from weight × reach × repetition ×
posture. This replaces `ergoRisk` being a hand-set enum — it becomes *computed*,
which is what makes ergonomic trade-offs visible instead of guessed.

Station gains `handling?: HandlingSpec`. When present, `cycle.handlingSec` and
`ergoRisk` are derived; when absent, the current behaviour is untouched.

### 4.3 Walk time from geometry

Layout and cycle time currently do not talk to each other — a real miss, since
this app's whole premise is that layout drives performance.

```ts
export interface OperatorAssignment { operatorId: string; stationIds: string[]; }
export interface Model { /* ... */ operators?: OperatorAssignment[]; }
```

With assignments, walk time is computable from station `x`/`y` using the existing
distance helpers in `kpis.ts` — so moving a station now correctly changes the
cycle time, and the layout optimiser gains a real objective.

### 4.4 Line balancing

- **Yamazumi / operator balance chart** against takt.
- **Rebalancing optimiser** (`engine/rebalance.ts`) — reassign work elements
  between stations to level load. Distinct from the *layout* optimiser; this one
  moves work, not boxes.
- **Upgrade the layout optimiser.** README is candid that it is greedy pairwise
  swapping finding local optima. `optimize.ts` already accepts `restarts` —
  extend to simulated annealing with a seeded PRNG (seeded, to preserve
  determinism and the golden fixtures).

---

## 5. Case 4 — Optimizing an existing process during ramp-up

**Goal:** close the loop between plan and reality.

**Core gap:** every number in the Model is design intent. There is no notion of
*measured*. Ramp-up is exactly where intent and reality diverge.

### 5.1 The Observed layer

Keep `Model` as the plan. Add observations alongside — never overwrite planned
values, or the variance becomes invisible.

```ts
export interface ObservedStation {
  stationId: string;
  cycleTimeSec?: number;
  cycleTimeStdDev?: number;
  scrapRate?: number;
  availability?: number;    // OEE: A
  performance?: number;     // OEE: P
  quality?: number;         // OEE: Q
  downtimeMin?: number;
  samples: number;          // confidence weighting
}

export interface Observation {
  id: string;
  label: string;            // "Week 12"
  periodStart: string;      // ISO
  periodEnd: string;
  stations: ObservedStation[];
}

export interface Model { /* ... */ observations?: Observation[]; }
```

Stored inside the Model JSONB — **no Prisma migration** for a handful of ramp
periods. Promote to a table only if this grows unbounded (at which point it is
really Case 5).

### 5.2 Variance & OEE engine

```ts
// packages/core/src/engine/variance.ts
export interface StationVariance {
  stationId: string;
  planned: { cycleTimeSec: number; scrapRate: number; rate: number };
  actual:  { cycleTimeSec: number; scrapRate: number; rate: number };
  deltaPct: number;
  throughputImpact: number;    // parts/shift lost — the ranking key
  oee: { a: number; p: number; q: number; overall: number };
}

export interface VarianceReport {
  stations: StationVariance[];
  lineOee: number;
  plannedOut: number;
  actualOut: number;
  /** Did the constraint move? The most valuable single output here. */
  bottleneckMigrated: { planned: string | null; actual: string | null; moved: boolean };
}

export function varianceReport(model: Model, observationId: string): VarianceReport;
```

`bottleneckMigrated` is nearly free — run the existing `balanceAnalysis` twice,
once on planned stations and once on stations overlaid with observed values. A
migrating constraint is the classic ramp-up surprise and the thing teams most
often miss.

### 5.3 Ramp projection

```ts
export interface RampProfile {
  weeks: number;
  startYieldPct: number; targetYieldPct: number;
  startOeePct: number;   targetOeePct: number;
  curve: "linear" | "exponential";
}

export function projectRamp(model: Model, profile: RampProfile):
  Array<{ week: number; projectedOut: number; projectedYield: number; projectedOee: number }>;
```

Overlaying actual observations on the projection answers the defining ramp-up
question — *are we on the curve?* — and turns `scrapRate` from a static constant
into a trajectory.

### 5.4 Variability & buffer sizing

```ts
// packages/core/src/engine/variability.ts
export function bufferRecommendation(model: Model, obs?: Observation):
  Array<{ afterStationId: string; recommendedUnits: number; rationale: string }>;
```

A Kingman/queueing approximation using `cycleTimeStdDev`. This explains why a
deterministically-balanced line still underperforms — the single most common
"why is the plan wrong" question during ramp-up. `buffer` already exists as a
`StationType` but nothing sizes it.

### 5.5 UI

A **Ramp** page: variance table ranked by `throughputImpact`, planned-vs-actual
overlay on the balance chart, bottleneck-migration callout, ramp curve with
actuals plotted, and a "re-plan from actuals" action that forks a new scenario
seeded with observed values — closing the loop back into Cases 2 and 3.

---

## 6. Case 5 — Monitoring in serial production

**Honest framing:** this is a **separate application** sharing `@flowplan/core`,
not a panel inside the SPA. FlowPlan is design-time — open, edit, score.
Monitoring is continuous, data-fed, and alert-driven.

**The architectural advantage:** because the engine is framework-free,
deterministic, and already re-run server-side, live production data can be
replayed through the *identical* balance/cost engine that produced the plan. The
plan-vs-actual comparison is apples-to-apples by construction. That is unusual
and it is the reason this is worth building here rather than buying.

### 6.1 Time-series storage

The first thing needing a genuine Prisma migration.

```prisma
enum ProductionEventType { CYCLE DOWNTIME SCRAP CHANGEOVER ALARM }

model ProductionEvent {
  id        BigInt              @id @default(autoincrement())
  cellId    String
  stationId String
  ts        DateTime
  type      ProductionEventType
  value     Float               // cycle sec / downtime min / scrap qty
  meta      Json?
  @@index([cellId, ts])
  @@index([cellId, stationId, ts])
}

model MetricRollup {
  id          BigInt   @id @default(autoincrement())
  cellId      String
  stationId   String?           // null = whole line
  bucket      DateTime
  granularity String            // "1m" | "1h" | "shift" | "day"
  throughput  Float
  oee         Float
  availability Float
  performance Float
  quality     Float
  scrapRate   Float
  avgCycleSec Float
  @@unique([cellId, stationId, bucket, granularity])
  @@index([cellId, bucket])
}
```

Use TimescaleDB (`ProductionEvent` as a hypertable) if volume warrants — it is a
Postgres extension, so Prisma is unaffected.

### 6.2 Ingestion adapters

Mirror the `StorageProvider` pattern — an interface plus a **shared contract
test**, exactly as `storage.contract.test.ts` does today.

```ts
export interface IngestionAdapter {
  name: string;
  connect(cfg: unknown): Promise<void>;
  subscribe(cellId: string, onEvent: (e: ProductionEvent) => void): Promise<void>;
  disconnect(): Promise<void>;
}
```

Implementations: OPC-UA, MQTT/Sparkplug B, MES REST poller, CSV/file drop
(always ship this one — it makes the whole thing demoable without plant IT).

### 6.3 Rollup & scoring

A scheduled job folds raw events into 1m/1h/shift buckets. **Never score raw
events** — score rollups, so cost stays bounded as data grows.

### 6.4 Drift detection — closing the loop

```ts
export interface DriftAlert {
  cellId: string;
  kind: "bottleneck-moved" | "oee-below-threshold" | "cost-per-part-exceeded"
      | "scrap-trend" | "cycle-drift";
  severity: "info" | "warn" | "critical";
  detail: string;
  planned: number; actual: number;
}
```

Periodically re-run `balanceAnalysis` and `costAnalysis` over rolled-up actuals
against the approved plan Model. `cost-per-part-exceeded` is the important one:
it compares live production against the **cost committed in the RFQ**, which
closes the loop all the way back to Case 2. Very few tools can answer *"are we
actually hitting what we quoted?"* — this architecture can.

### 6.5 SPC

Control charts (X̄-R, p-chart) on cycle time and scrap, with Western Electric
rule evaluation. Pure functions over rollups — belongs in `@flowplan/core` so
both apps share it.

### 6.6 Dashboard

This is where a Carbon migration genuinely pays off: Carbon's data-viz and
dashboard patterns are strong, and a monitoring UI is far more
component-dense than the current editor.

### 6.7 The feedback loop

Observed OEE and cycle times should flow **back into the process capability
library** (§2.1), so Case 1's recommendations get more accurate with every
program run. This is the strategic payoff for doing all five cases rather than
any one of them: the tool learns your plant.

---

## 7. Sequencing

| Phase | Scope | Unlocks | Prisma migration? |
|---|---|---|---|
| **P0** ✅ | Cycle-time decomposition (§4.1) — **shipped, schema v6** | Case 3 core | No |
| **P1** ✅ | Product + Volume foundation (§1) — **shipped, schema v7** | Cases 1, 2, 3 | No |
| **P2** | Handling + ergo + walk time (§4.2–4.4) | Case 3 complete | No |
| **P3** | Observed layer + variance/OEE (§5.1–5.3) | Case 4 | No |
| **P4** | Appraisal + decision matrix (§3) | Case 2 | Yes (`Decision`) |
| **P5** | Process capability library (§2) | Case 1 | Yes (team library) |
| **P6** | Monitoring app (§6) | Case 5 | Yes (time series) |

Rationale for the ordering: **P0 first** because it is small, self-contained, and
immediately useful. **P5 sits late** despite being Case 1 — its cost is
domain-data curation, not code, and it benefits from real cycle-time data
produced by P3. **P6 is a separate deliverable** and should not block anything.

### Scale warning

This is a multi-quarter programme for a team, not a sprint. Recommended de-risk:
build one **thin vertical slice** first — P0 plus a minimal P1 (one product, two
volume scenarios) against a single real cell — and validate the outputs with
planners before committing to the rest.

### Test strategy

Golden fixtures must stay green at every phase; that is the contract that keeps
this refactorable. Add new golden fixtures per feature (a routing per product
archetype, a variance report per ramp fixture) and keep engine additions pure so
they remain trivially testable.
