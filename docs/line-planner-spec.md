# Line Planner — Unified Specification

**Version 1.0 · Supersedes `CELL_DESIGN_TOOL_SPEC.md`, `PART_00_MANIFESTO.md`, `PART_01_PATTERN_LIBRARY.md`**

---

> ## Status of this document
>
> This is the **governing specification** for the Line Planner. It is the source
> that `docs/spec-alignment.md` measures the FlowPlan codebase against. Cite it by
> section number.
>
> The three documents it supersedes never existed in this repository — the
> alignment doc referenced them for months against nothing. That is the failure
> this file closes.
>
> **Precedence rule.** Where Part I conflicts with any later part, **Part I wins**.
> The interaction model is the harder problem and the one that decides adoption.
>
> **⚠ This document is incomplete.** It carries Parts I–IV in full plus the opening
> of Part V (§36–§37). §37 is cut mid-table. **Part V from §37 onward (overlays,
> simulation, API) and all of Part VI (build sequence, migration, risks,
> acceptance) have not been supplied.** Do not cite them — see the placeholder at
> the foot of this file. Anything sequencing-related currently attributed to
> Part VI in `spec-alignment.md` is inference, and is labelled as such.

---

## 0. Reading guide

| Part | Contents | Audience |
|---|---|---|
| **I — Premise** | What this is, why, the seven interaction laws, confidence discipline | everyone; read first |
| **II — Domain model** | Entities, schemas, relationships | implementers |
| **III — Engine** | Solvers, gates, performance budgets | implementers |
| **IV — Knowledge** | Pattern library, catalog governance, feedback loops | implementers, PE |
| **V — Application** | UI, overlays, simulation, API | implementers, UX |
| **VI — Delivery** | Build sequence, migration, risks, acceptance | leads |

**Precedence rule:** where Part I conflicts with any later part, **Part I wins**. The interaction model is the harder problem and the one that decides adoption.

---

# PART I — PREMISE

## 1. What this is

A tool to **plan, define, and optimize manufacturing cells and lines** across their lifecycle, answering five questions:

| Case | Phase | Question |
|---|---|---|
| **C1** | Planning / RFQ | Given a workload and a takt, what cell configuration performs it? |
| **C2** | Planning / RFQ | Which of N candidate concepts should we pick, and why? |
| **C3** | Planning / RFQ | How do I balance this cell to minimize stations, operators, and waste? |
| **C4** | Ramp-up | Actuals differ from plan — how do I re-optimize? |
| **C5** | Serial | Is it still running to standard, and when do I re-open C4? |

Above these sits the question that subsumes them, and the one the tool exists to answer:

> **Can this set of parts be produced on this line — and if not, what is blocking it?**

### 1.1 Scope

**In scope:** cells, lines, layouts, stations, processes, capabilities, resources, time, multi-part feasibility, changeovers, sequencing.

**Out of scope:** product data — part numbers, BOM, CAD geometry, tolerances, customer variants. Parts enter the model as abstract **workloads**: a precedence DAG of capability demands plus a demand rate. The line does not need to know it is making a sensor housing; it needs to know this workload demands these capabilities in this order at this volume.

### 1.2 What it replaces

The incumbent is a macro-driven Excel workbook. Its failure modes define the requirements:

| # | Failure mode | Consequence | Fixed by |
|---|---|---|---|
| F1 | No single source of truth; files copied and renamed `_final_v3_REV2` | Nobody knows which version was quoted | §6 immutable snapshots |
| F2 | VBA macros *are* the business logic | Knowledge trapped in one person; changes are risky | §4.8 rules-as-data |
| F3 | 1:1 process→workcenter link | Concept recorded, never generated; no alternatives | §7 Capability abstraction |
| F4 | Flat time model (setup/labor/machine) | VA/NNVA/NVA invisible; balancing impossible | §8 element decomposition |
| F5 | Layout is a screenshot in a tab | Walk time and footprint are typed guesses | §11 computed geometry |
| F6 | Overwrite on resubmission | No learning loop; every RFQ starts from zero | §6 append-only + §22 feedback |
| F7 | Averages everywhere | The p95 tail — where losses live — is invisible | §13 distributions |
| F8 | No confidence signal | €2M decisions on unmarked guesses | §5 confidence rendering |
| F9 | Fit checked last, manually | Late-discovered infeasibility | §16 testfit inversion |
| F10 | No sensitivity; scenarios = more files | Volume assumption breaks silently | §17.6 sensitivity |
| F11 | Approval by email and coloured cell | Approvals not bound to a version | §18 decision records |
| F12 | Catalog drift per plant | Concepts not comparable across sites | §21 governed catalog |

**Three properties of Excel must survive, or adoption fails:**

1. **Zero-friction entry.** No schema modelling before first value. A useful result within 60 seconds of first launch (§3, Law 7).
2. **Local override.** The engineer must be able to say "the standard says 12 s, here it is 15 s" and proceed. Overrides are visibly flagged and collected as catalog-improvement candidates.
3. **It just works offline.** Excel never says "service unavailable." Interaction computes locally (§15).

## 2. The reference implementation is a 1998 city-builder

The interaction model was solved commercially before 2000 — *Anno 1602*, *Die Siedler II/III*, *Transport Tycoon*, *SimCity 2000* — on hardware slower than a modern thermostat. The domain was villages, not cells, but the problem is identical: **place interdependent facilities under spatial and throughput constraints, and understand instantly why the current arrangement is bad.**

| Game mechanic | Manufacturing equivalent |
|---|---|
| Footprint turns red on invalid ground *while dragging* | Placement validates against clearance/aisle/load during the drag |
| Radius overlays (market reach, fire coverage) | Operator reach, walk-loop radius, material-supply reach, utility reach |
| Visible carriers walking routes | Operator loops and part flow as animated paths, not table rows |
| Congestion visible as carriers queueing | Bottleneck stations visible as accumulating WIP |
| Production chain overlay (grain→mill→bakery) | Capability chain overlay (form→join→inspect→mark) |
| Ghost preview before commit | Solver proposals as ghost overlay, accepted explicitly |
| Instant unlimited undo | Undo across every operation including proposal acceptance |
| No modal dialogs, ever | No modal dialogs, ever |
| Pause / 1× / 4× speed control | Shift simulation at variable speed |
| The tutorial *is* the game | First useful output in 60 seconds |

**Design instruction: when in doubt about an interaction, do what Anno 1602 did.**

The second borrowing is the **community layout catalog** (Part IV): in that community nobody designs from scratch — they pick a proven layout with published metrics, verify it fits their terrain, and adapt. That inversion is the highest-value mechanic in this specification.

### 2.1 Where the analogy must break

Three deliberate divergences. Games are a model for *interaction*, not *epistemics*.

**2.1.1 Games have no ground truth; this tool does.** A wrong Anno supply chain costs nothing. A wrong line concept costs €2M and eighteen months. Every number carries provenance and confidence (§5). Game UIs project total certainty; this must project calibrated uncertainty.

**2.1.2 Games auto-resolve; this tool proposes.** When a game's pathfinder reroutes carriers, nobody objects. When a solver silently re-optimizes an engineer's deliberate placement, trust is destroyed permanently (§4).

**2.1.3 Games have one authored ruleset; this has contested, plant-specific, drifting master data.** A marketplace radius is identical for every Anno player; takt, tariffs, aisle rules, and resource catalogs are not. Patterns therefore carry explicit validity conditions and renormalize on use (§20.2).

## 3. The seven interaction laws

Binding on all UI work; they override convenience.

**Law 1 — Nothing is modal.** No dialog blocks the canvas. Validation errors render *in place*, on the offending geometry. Confirmation happens by clicking the thing itself.

**Law 2 — Feedback during the gesture, not after it.** Constraint state updates while dragging, inside the 16 ms frame budget. The user learns the constraint by feeling it. This drives the entire performance architecture (§15).

**Law 3 — Invalid states are permitted and visible.** The user may hold a broken layout while working toward a good one. The tool renders violations; it never blocks the edit. Prevention teaches nothing; visible failure teaches the constraint.

**Law 4 — Every change is cheap and reversible.** Unlimited undo/redo. No save ceremony. No "are you sure."

**Law 5 — The spatial view is primary.** Numbers annotate the canvas; the canvas is not a supplement to a table. If a metric matters, it has a spatial rendering — heat, radius, path thickness, accumulation.

**Law 6 — Show the mechanism, not the verdict.** "Infeasible" is a failure of the tool. "Station 4 is the bottleneck: 47 s against a 38 s takt — the joining operation is 9 s over" is the product.

**Law 7 — First value in sixty seconds.** No schema authoring, no catalog setup, no login ceremony before first insight.

## 4. The solver is an advisor

The load-bearing trust decision, stated once and enforced everywhere.

```
User state      placements, station assignments, pins, overrides
Derived state   distances, balance, cost, utilization, verdicts
Proposals       solver output — a separate, never-merged object
```

- Derived state recomputes **continuously and automatically**.
- The solver emits **proposals**: ghost overlays with a mandatory plain-language rationale and predicted effect.
- Proposals are accepted per-item or wholesale, **always explicitly**.
- `POST /propose` is non-mutating, **enforced at the API layer**, not by convention.
- Editing underlying state marks outstanding proposals `stale` rather than deleting them silently.

**One silent overwrite of a deliberate manual placement and the tool is abandoned for Excel permanently.** Treat as a correctness requirement, not a UX preference.

## 5. Confidence is a rendered property

Every displayed number resolves to one of three states, **always visible without interaction**:

| State | Source | Rendering |
|---|---|---|
| **Measured** | shopfloor actuals, MTM-validated | solid, exact value |
| **Benchmarked** | catalog standard validated elsewhere | solid, provenance dot |
| **Estimated** | default, extrapolated, or guess | **range**, hatched fill |

- Confidence **propagates to the weakest input.** A cost built from one estimated cycle time is an estimated cost, shown as a range.
- Aggregate confidence shows as coverage: *"8 of 14 inputs measured."*
- A concept cannot reach `released` while any gate-blocking input is `estimated`, unless explicitly accepted with recorded rationale.
- Hovering any number reveals its provenance chain: value → source → derivation → effective date.

`€2.10–2.90/unit (low confidence — 6 of 14 inputs estimated)` is correct. `€2.43` is a lie. This is the specific mechanism that prevents Excel's false-precision failure (F8), and it is why this is not a game.

## 6. Immutability and provenance

- Cells, patterns, envelopes, and portfolios are **append-only versioned snapshots**. Never overwrite.
- Comparison is always between versions.
- A released concept reconstructs **exactly**, including catalog state, FX rates, and changeover matrix effective at release time.
- Every derived value is traceable to its inputs and the rule that produced it.

## 7. Capability ≠ Resource

A cell needs **capabilities**; resources **provide** them. The N:M relation is what generates alternatives. A 1:1 process→workcenter link (Excel's F3) makes the tool a recorder instead of a generator, and is the single most consequential modelling error to avoid.

## 8. Time is decomposed, never flat

Every time element is classified **VA / NNVA / NVA**, carries a waste class, a source method, and a confidence. Flat setup/labor/machine (F4) makes optimization impossible because there is nothing to optimize against.

## 9. Lean principles as mechanics

Not decoration — each becomes a computation or constraint.

| Principle | Mechanic |
|---|---|
| **Takt is the master constraint** | Everything derives from available time ÷ required output (§14.1) |
| **Flow before automation** | Lowest automation meeting takt wins by default; escalation needs justification |
| **VA/NNVA/NVA decomposition** | Element-level classification (§8) |
| **Standard work / Yamazumi** | Balancing output is a stacked bar vs. takt line, not a table |
| **One-piece flow** | Lot size 1 default; batching must be justified by changeover, which triggers a SMED proposal |
| **Jidoka / right-sized equipment** | Scoring penalty on monuments; `attended_fraction` enables multi-machine tending |
| **Genchi genbutsu** | Actuals feed back and correct the catalog (§22) |

---

# PART II — DOMAIN MODEL

## 10. Entity overview

```
LinePortfolio ──< PortfolioMember >── Workload ──< WorkElement >── Capability
      │                                                                 │
      │                                                                 ∨
      └── Cell ──< Station >── Assignment ──────────────────────── Resource
            │        │                                                  │
            │        └──< OperatorLoop                                  │
            ├── Layout ──< Placement, Path, Buffer, Zone                │
            └── Envelope (fixed constraint)                             │
                                                                        │
Pattern ──────────── instantiates ─────────────────────────────────────┘
```

## 11. Workload — the product-free input

```yaml
Workload:
  id: string
  name: string
  output_rate: {units_per_period: number, period: shift|day|week|year}
  precedence: DAG                     # NOT a linear routing
  elements: [WorkElement]
  changeover_family: string           # groups workloads with similar setup
  variant_modes:                      # abstract variants, no product identity
    - {id: string, share: 0.0-1.0, element_overrides: {element_id: multiplier}}
```

```yaml
WorkElement:
  id: string
  name: string
  required_capability_id: string
  precedence_predecessors: [element_id]
  zoning_constraints:
    must_be_same_station_as: [element_id]
    must_not_be_same_station_as: [element_id]
    fixed_station: station_id | null
  time:
    value_seconds: number
    method: MTM | UAS | estimate | benchmarked | measured
    confidence: low | med | high
    source_ref: string
  classification: VA | NNVA | NVA
  waste_class: transport | motion | waiting | overprocessing |
               inventory | defects | overproduction | null
  attended_fraction: 0.0-1.0          # 1.0 = operator bound for full duration
  skill_class_required: string
  ergonomic_load: light | medium | heavy
```

**`attended_fraction` is load-bearing.** It is what makes operator/machine separation, chaku-chaku loops, and multi-machine tending computable. Without it, balancing is wrong for every semi-automated cell.

**Precedence is a DAG, not a list.** Parallel branches and flexible ordering are exactly where balancing gains come from. Authoring it is manual — there is no product data to derive it from, by design — so DAG editing UX and template reuse deserve real investment.

## 12. Capability and Resource

```yaml
Capability:
  id: string
  name: string
  category: join | form | cut | inspect | handle | mark | test | transport
  preconditions: [string]             # "surface_clean", "oriented"
  postconditions: [string]
  alternatives: [capability_id]       # substitutable → generates concept variants
  effective_from: date
  effective_to: date | null
```

```yaml
Resource:
  id: string
  name: string
  provides: [capability_id]
  automation_level: manual | mechanized | semi_auto | auto | fully_auto
  cycle_time_model:                   # parametric, not a constant
    expression: string                # "2.1 + 0.8*n_ops"
    parameters: [{name, unit, default, range}]
  attended_fraction: 0.0-1.0
  changeover:
    internal_seconds: number          # line must stop
    external_seconds: number          # preparable while running
    smed_stage: 1 | 2 | 3
  cost:
    investment: currency
    transport: currency
    installation: currency
    depreciation_years: integer
    maintenance_per_year: currency
    energy_kw: number
    tooling_cost_per_change: currency
    tooling_life_cycles: integer
  footprint:
    area_m2: number
    bounding_box_mm: {x, y, z}
    access_clearance_mm: {front, back, left, right}
    utilities: [electric | air | water | vacuum | exhaust]
    floor_load_kg_m2: number
  reliability:
    availability_pct: number
    mtbf_hours: number
    mttr_hours: number
    yield_pct: number
  ramp_curve: [{week: integer, yield_pct: number}]
  volume_band: {min_units_year, max_units_year}
  robustness_rating: 1-5
  trl: 1-9
  confidence: low | med | high
```

## 13. Cell, Station, OperatorLoop

```yaml
Cell:
  id: string
  version: integer                    # immutable snapshot
  parent_version: integer | null
  source_pattern_id: string | null    # lineage if instantiated from a pattern
  workload_ids: [string]
  envelope_id: string
  topology: U | straight | L | island | loop | parallel
  takt_seconds: number                # computed
  stations: [Station]
  operator_loops: [OperatorLoop]
  layout: Layout
  status: draft | evaluated | selected | released | superseded
  created_at, created_by
  assumptions: {}                     # frozen at release
```

```yaml
Station:
  id: string
  sequence: integer
  resource_ids: [string]
  assigned_elements: [element_id]     # may differ per workload (multi-model)
  cycle_time: number                  # computed
  utilization_pct: number             # computed vs takt
  is_bottleneck: boolean

OperatorLoop:
  id: string
  skill_class: string
  station_sequence: [station_id]      # the walk route
  walk_time: number                   # computed from layout geometry
  loop_time: number
  utilization_pct: number
```

## 14. Layout and Envelope

```yaml
Layout:
  id: string
  placements: [{resource_id, x, y, rotation_deg, pinned: boolean,
                source: user | accepted_proposal | pattern | import}]
  paths: [{from_station, to_station, distance_mm,
           mode: walk | conveyor | agv | manual_carry}]
  buffers: [{location, capacity_units, wip_rule: fifo | lifo | kanban}]
  zones: [{polygon, type: safety | ergonomic | material_supply | egress}]
  material_supply: {routes: [{path, container_type, kanban_loops}]}
```

**Distances are computed from placements, never entered.** Switching topology U→straight recomputes walk time automatically. This is the entire point of modelling layout rather than pasting a screenshot (F5).

```yaml
Envelope:                             # fixed constraint, not an output
  id: string
  version: integer
  site_id: string
  polygon_mm: [[x,y]]
  obstacles:
    - polygon: [[x,y]]
      type: column | wall | aisle | utility_drop | door | existing_cell
      movable: boolean
      move_cost: currency | null
      move_lead_time_days: integer | null
  fixed_placements:                   # C4 as-built
    - {resource_id, x, y, rotation_deg, locked: boolean,
       move_cost: currency, move_downtime_hours: number}
  hard_constraints:
    min_aisle_mm: number
    ceiling_mm: number
    floor_load_kg_m2: number
    egress_rules: {max_travel_mm, min_exit_width_mm, exits: [[x,y]]}
    utility_reach_mm: number
  soft_constraints:
    preferred_flow_direction: [[x,y],[x,y]]
    dock_proximity_weight: 0.0-1.0
```

## 15. Portfolio and changeovers

The multi-part layer. Regime is **multi-model**: batches with changeovers, not simultaneous mixed flow.

```yaml
LinePortfolio:
  id: string
  version: integer
  line_id: string                     # the Cell being tested
  envelope_id: string
  planning_horizon: {from: date, to: date}
  members: [PortfolioMember]
  regime: multi_model                 # mixed_model reserved for future
  sequencing_policy: fixed | optimized | campaign
  changeover_matrix_id: string

PortfolioMember:
  workload_id: string
  demand: {units_per_period: number, period: string}
  priority: must_run | should_run | optional
  batch_constraints: {min_batch, max_batch, campaign_frequency_per_year}
  earliest_date: date | null
  latest_date: date | null
```

```yaml
ChangeoverMatrix:
  id: string
  line_id: string
  granularity: part | family          # family is the practical default
  entries:
    - from: string                    # workload_id or family
      to: string
      time_seconds: number
      internal_seconds: number
      external_seconds: number
      smed_stage: 1 | 2 | 3
      requires_skill_class: string
      tooling_changes: [resource_id]
      confidence: low | med | high
  default_seconds: number
  symmetric: boolean
```

**N×N is unfillable by hand.** Three strategies, in order of preference:

1. **Derive** from resource-level tooling deltas: changeover = f(resources whose tooling differs).
2. **Group** into changeover families; the matrix is family×family. *This is the default.*
3. **Default + override**: one global value, populate only the pairs that matter.

## 16. Operating context and actuals

```yaml
OperatingContext:
  site_id: string
  shift_model: {shifts_per_day, hours_per_shift, days_per_year}
  planned_downtime_pct: number
  break_structure: [{start, duration_min, paid: boolean}]
  allowances: {personal_pct, fatigue_pct, delay_pct}      # PFD
  labor_tariffs: [{skill_class, cost_per_hour, shift_premium_pct}]
  machine_hour_rate_default: number
  floor_space_cost_per_m2_year: number
  energy_cost_per_kwh: number
  fx_rates: [{currency, rate_to_base, valid_from}]
  installed_base: [{resource_id, free_capacity_pct, location}]
  walk_speed_m_per_s: number          # default 1.2
  effective_from: date
```

`installed_base` matters more than it looks: a concept reusing an idle machine beats one buying new, and the solver can only see that if it is modelled.

```yaml
Measurement:
  cell_version: integer
  station_id: string
  element_id: string | null
  timestamp: datetime
  metric: cycle_time | changeover | downtime | scrap | rework | fpy
  value: number
  distribution: {p50, p95, p99, n_samples}
  reason_code: string | null
```

**Store distributions, not averages** (F7). The p95 tail is where the losses are; a mean hides the problem you are hunting.

---

# PART III — ENGINE

## 17. Takt and capacity

```
available_time = hours_per_shift × shifts_per_day × days_per_year
                 × (1 − planned_downtime_pct) − unpaid_breaks

takt           = available_time / required_output_units
effective_takt = takt × availability_pct × yield_pct
```

Takt is computed **first** and constrains which resource classes are even offered. Volume-dependency falls out automatically: at 200k/yr takt might be 90 s → manual bench with poka-yoke; at 2M/yr takt is 9 s → linked automation.

## 18. The five feasibility gates

The engine's spine, and the answer to *can all parts run on this line*. Evaluated in order, cheapest first, so failures surface fast.

```
Gate 1  COVERAGE    every required capability has a providing resource on the line
Gate 2  TECHNICAL   resource envelope / tolerance / volume-band admits each workload
Gate 3  CAPACITY    Σ(run time) + Σ(changeover time) ≤ available time
Gate 4  BALANCE     a feasible station assignment exists per workload, within takt
Gate 5  SPATIAL     the resource set places within the envelope
```

**Gate 1 — Coverage.** Set arithmetic, milliseconds.
```
uncovered = ⋃ᵢ {e ∈ Workloadᵢ.elements |
                ¬∃r ∈ Line.resources : e.capability ∈ r.provides}
```
Output: which capabilities are missing and which parts they block. Worth building alone — it is the question most often answered wrongly today.

**Gate 2 — Technical fit.** Volume band containment; parametric cycle-time inputs inside declared parameter ranges. Extrapolation beyond validated range is a warning with reduced confidence, not a silent pass.

**Gate 3 — Capacity with changeovers.** The gate spreadsheets get wrong, because they omit changeover entirely.
```
run_time        = Σᵢ (demandᵢ × cycle_timeᵢ) / yieldᵢ
changeover_time = Σ internal_seconds over the realized sequence
required        = run_time + changeover_time
utilization     = required / (available_time × availability_pct)
```
Always report utilization **with and without** changeover, so the changeover burden is a visible number in its own right.

**Gate 4 — Balance per workload.** Run the balancer once per workload against the **fixed physical resource set**. This is the multi-model consequence: station assignment may differ per part, but resources are shared and immovable.

**Gate 5 — Spatial.** Testfit (§20) against the envelope, using the union of all required resources.

```yaml
PortfolioFitResult:
  verdict: all_fit | partial_fit | infeasible
  per_member:
    - workload_id: string
      verdict: fits | fits_with_changes | infeasible
      failed_gate: 1|2|3|4|5|null
      blocking_reason: string
      missing_capabilities: [capability_id]
      required_changes: [{type, description, cost, lead_time_days}]
  capacity:
    run_time_hours, changeover_time_hours, available_hours: number
    utilization_pct, utilization_excl_changeover_pct: number
    headroom_units: number
  sequence: {order: [workload_id], total_changeover_hours, n_changeovers}
  bottleneck: {station_id, binding_workload_id, utilization_pct}
  drop_analysis:
    - {drop_workload_id, makes_feasible: boolean, utilization_after_pct}
  confidence: low | med | high
  truncated: boolean
```

**`drop_analysis` is the most actionable output.** When a portfolio does not fit, the useful answer is *"remove part 7 and it fits at 91% utilization"* — not a red verdict. Scope: single drops exhaustively, plus greedy pairs; combinatorics beyond that are capped and the cap is stated.

## 19. Balancing

Problem class **SALBP-1** (min stations for given takt) and **SALBP-2** (min takt for given stations), extended with:

- Precedence DAG with parallel branches
- Zoning constraints (must / must-not co-locate)
- Operator vs. machine separation via `attended_fraction`
- Walk time in the objective for U-cells — **layout-coupled**
- Multi-model: one balance per workload against shared resources
- Multi-manning (>1 operator per station)

```
minimize  w₁·n_stations + w₂·n_operators + w₃·Σ idle
        + w₄·walk_time + w₅·NVA_time
s.t.      station_cycle ≤ takt ∀ stations
          precedence, zoning, ergonomic, skill constraints
```

Implementation: **OR-Tools CP-SAT** behind a `Balancer` interface, swappable. Output artifact is a **Yamazumi** (stacked time per station vs. takt line), not a table — it is the primary UI object for C3 and C4.

## 20. Testfit — constrain, then generate

### 20.1 Posture

Not *design then check* but **constrain then generate**. The envelope is an input; feasibility is an early filter.

Three consequences:
1. The envelope is fixed and immovable.
2. **Speed beats optimality** — answer in seconds so a planner runs twenty in a meeting.
3. The output is a **fit report**, not a design: verdict + binding constraint + slack.

> **The single most important architectural decision in this document: feasibility and optimization are separate services.** Merge them and every testfit costs a full optimization, nobody runs twenty, the volume slider stops feeling live, and the tool degrades into Excel with better graphics.

```
Envelope + Workload(s) + Context
  → takt
  → candidate configurations (capped at N)
  → fast constructive placement per candidate, time-boxed
  → clearance / aisle / egress / utility / load validation
  → verdict + binding constraint + slack + required changes
  → ranked fit report
```

### 20.2 Per-case framing

| Case | Fixed | Free | Question |
|---|---|---|---|
| C1 | envelope, output rate | config, placement | What fits in bay 3 at 400k/yr? |
| C2 | envelope | which concept | Which candidate survives the envelope best? |
| C3 | envelope, resources | assignment, placement | Rebalance to 6 stations — does the U still close? |
| C4 | envelope + as-built | delta only | What is the minimum-churn fix? |
| C5 | envelope, as-built | nothing — monitor | Does it still fit takt and space? |

**C1 emits a fit-vs-volume curve.** Sweep `output_rate` and show the volume at which the envelope stops working. This has no equivalent in the spreadsheet process and is the most useful single artifact in an RFQ conversation.

**C4 requires a churn metric** — how many machines must physically move, at what cost and downtime.

```yaml
FitResult:
  verdict: fits | fits_with_changes | infeasible
  binding_constraint: area | aisle | clearance | utility | reach |
                      takt | ergonomic | egress | floor_load | ceiling
  slack: {area_m2, takt_seconds, aisle_mm, utilization_headroom_pct}   # neg = short
  required_changes: [{type, description, cost, lead_time_days}]
  churn: {machines_moved, move_cost, downtime_hours}    # C4
  confidence: low | med | high
  compute_time_ms: integer
  truncated: boolean
```

**Service contract:** always returns (partial with `truncated: true` on budget exhaustion, never fails, never hangs); deterministic seed for reproducibility; degrades honestly — if 3 of 8 candidates were placed, say so.

## 21. Sequencing and batch sizing

Invoked only when Gate 3 is tight (utilization > ~85%); below that the sequence rarely binds.

**Sequencing** is an asymmetric TSP over the changeover matrix — minimize total changeover across one production cycle, subject to date windows and `priority`.

**Batch sizing** trades changeover amortization against WIP:
```
minimize Σ (changeover_time / batch) × demand + w_wip × Σ (batch/2) × holding
s.t.     min_batch ≤ b ≤ max_batch, capacity ≤ available
```

Default remains **lot size 1** (§9). Any batch the solver proposes emits a **SMED proposal** — which internal steps could become external — as the preferred alternative to accepting the batch.

## 22. Layout placement

Facility-layout problem constrained by the floor polygon:
```
minimize Σ (flow_frequency_ij × distance_ij)
s.t.     no overlap incl. access clearance
         aisle width, egress, safety zones
         utility reachability, floor load, ceiling height
```

Heuristic (simulated annealing / CP) suffices — exactness is not the value; fast iteration is. **Placement feeds distances back into balancing, so balance and layout must iterate.** Cap iterations, converge on the weighted objective, and expose the trade-off rather than hiding it.

## 23. Cost roll-up

Cell-derived only — no material, no product cost:
```
LDC    = Σ(operator_time × tariff) / units
MDC    = Σ(machine_time × machine_hour_rate) / units
space  = footprint_m2 × cost_per_m2_year / units_per_year
tool   = Σ(tooling_cost / tooling_life) per unit
energy = Σ(kw × time) × cost_per_kwh / units
invest = Σ(investment + transport + installation)
```

## 24. Concept scoring (C2)

Weighted **Pugh matrix against a datum concept**. Criteria are registered, not hardcoded:

| Criterion | Direction |
|---|---|
| Piece cost (LDC+MDC+space+energy) | lower |
| Investment | lower |
| Floor space | lower |
| Flexibility (variants without changeover) | higher |
| Scalability (capacity increment granularity) | higher |
| Ramp risk (TRL, robustness) | lower |
| Quality risk (yield, capability) | lower |
| Ergonomic load | lower |
| Spatial fit (from §20) | higher |
| Energy / CO₂ per unit | lower |

**Sensitivity is mandatory, not optional**: which ranking flips if output drops 30% or rises 50%. Volume is the assumption that breaks most often (F10); a tool that hides that is worse than useless.

## 25. Scale tiering

Line scale varies widely across plants, so every algorithm declares a strategy per tier. Tier is detected from `n_parts × n_stations` and **always displayed**.

| Tier | Scale | Balancing | Sequencing | Placement |
|---|---|---|---|---|
| **S** | <10 parts, <10 stations | CP-SAT exact | exact ATSP | CP-SAT exact |
| **M** | 10–50 parts, 10–30 stations | CP-SAT, 10 s box | ATSP heuristic + 2-opt | SA, time-boxed |
| **L** | 50+ parts, 30+ stations | priority rules + local search | family-grouped greedy + 2-opt | constructive + repair |

- Tier selection is automatic but **overridable** — force exact on tier L and accept the wait.
- Every solution carries `method: exact | heuristic` and `optimality_gap` when known.
- **No silent downgrade.** If adding parts moves S→M mid-session, say so.

## 26. Performance budgets

Law 2 is only real if these hold. Acceptance criteria, not aspirations.

| Operation | Budget | Strategy |
|---|---|---|
| Geometry validation during drag | **16 ms** | R-tree spatial index, dirty set only |
| Path distance recompute | 50 ms | incremental, affected paths only |
| Derived metrics (cost, utilization) | 100 ms | incremental aggregation |
| Coverage gate | 200 ms | precomputed capability index |
| Capacity gate | 500 ms | closed form |
| Testfit per candidate | 200 ms | constructive placer + greedy repair |
| Balance proposal | debounced 400 ms, **off the drag path** | never blocks interaction |
| Full refine (CP-SAT) | 30–60 s | explicit, cancellable, progressive |

Architectural consequences:
- **Local-first.** Interaction never round-trips to a server. WASM build of geometry and placement core.
- **Two-tier solving.** Fast heuristic for interaction; exact on explicit request. Same interface, different budget.
- **Canvas rendering, not DOM.** SVG will not sustain the frame budget at tier L.
- **Cancellable everything.** The next user gesture always wins.

## 27. Incremental recomputation

A drag must never trigger a full re-solve:
```
placement moved
  → recompute affected path distances only (dirty set)
  → recompute affected operator loop walk times
  → recompute derived cost / space
  → revalidate affected geometry only
  → [debounced 400 ms] offer re-balance as a PROPOSAL
```

## 28. Continuous validation

Runs on every edit, incrementally, and **never blocks** (Law 3).

| Check | Severity | Trigger |
|---|---|---|
| Resource overlap incl. clearance | error | placement |
| Aisle width below minimum | error | placement |
| Egress travel distance exceeded | error | placement |
| Floor load exceeded | error | placement |
| Utility out of reach | warning | placement |
| Station cycle > takt | error | assignment |
| Precedence violated | error | assignment |
| Zoning violated | error | assignment |
| Ergonomic load exceeded | warning | assignment |
| Skill class unavailable | warning | assignment |
| Capability uncovered for member N | error | portfolio |
| Interface mismatch between chained patterns | error | composition |

Rendering: errors as red geometry **at the violation location**, plus one plain sentence. Never a modal (Law 1), never a blocked drag (Law 3).

## 29. Layer architecture

```
┌──────────────────────────────────────────────┐
│ Case/Workflow   C1 C2 C3 C4 C5               │  cheap to extend
├──────────────────────────────────────────────┤
│ Solver          balance | place | sequence |  │  swappable
│                 size | cost | score | testfit │
├──────────────────────────────────────────────┤
│ Rule/Knowledge  matching | allowances |       │  volatile, data-driven
│                 heuristics | SMED | patterns  │
├──────────────────────────────────────────────┤
│ Domain model    entities in Part II           │  stable
└──────────────────────────────────────────────┘
```

Rules never live in solver code. Solvers never live in workflow code. **No case-specific logic below the workflow layer.**

| Extension | Mechanism |
|---|---|
| New solver | implement `Balancer` / `Placer` interface, register |
| New objective (CO₂, ergonomics) | register a `Scorer`, add weight to config |
| New capability or resource | catalog entry, no code |
| New matching rule | rules-as-data, effective-dated |
| New topology | template + path generator |
| New case (C6…) | compose existing solvers in the workflow layer |

---

# PART IV — KNOWLEDGE

## 30. The pattern library

### 30.1 What it is and why it dominates

The second borrowing from the city-builders, and the highest-value mechanic in this specification. The Anno 1800 community layout catalog is not a game UI — it is a **shared, curated library of parameterized reference layouts with normalized metrics**, and its significance is that in that community *nobody designs from scratch*:

```
browse catalog → filter by constraints → pick a proven layout
  → verify it fits your terrain → adapt at the edges → build
```

Design-from-blank is the fallback, not the default. The gates (§18) answer *can this line make these parts*; testfit (§20) answers *does it fit*. The library answers the question that precedes both: **what should I even be considering?**

### 30.2 Anatomy of a catalog entry

Decomposing a real Anno entry reveals a schema the community converged on without anyone specifying it:

| Element | Anno | Manufacturing |
|---|---|---|
| Canonical name | "Diamond City T5" | "U-Cell 4-Station Semi-Auto Assembly" |
| Author, provenance | Bagheera | plant, engineer, source concept ID |
| **Bill of materials** | 80 Residence, 1 Marketplace, 1 Pub | 2× press, 1× vision, 3× bench |
| Bounding box | 36×36 tiles | 12 000 × 8 000 mm |
| Occupied area | 1 681 tiles | 74 m² net |
| **Normalized efficiency** | `Space Efficiency: 70%` | m²/unit·yr; units/yr per m² |
| **Output figure** | Max population 5 440 | units/yr at reference takt |
| Coverage claim | "100% of public services" | covers {form, join, inspect, mark} |
| **Stated exceptions** | "minus police station"; "mind the gap" | "no leak test"; "station 3 at 96%" |
| Modularity | "easily repeatable", "squared to stack" | tiles on X; mirrors on Y; 6 m pitch |
| Build sequence | "build left half, sustain with 2 farms" | phase 1 manual → phase 2 automate |
| **Upgrade path** | `518 (550) Residence` — brackets = after | 200k → 450k with 1 added station |
| Cost | 22 000 Credits, 640 Timber | investment, footprint, tooling |
| Running cost | −390 Balance, −300 Workforce | operators/shift, energy, maintenance |

Three of these do most of the work and exist nowhere in the incumbent process:

- **Normalized efficiency** — `Space Efficiency: 70%` makes a 36×36 and a 161×81 layout comparable at a glance. The single most important metric in the catalog.
- **Stated exceptions** — honest declaration of what a pattern does *not* cover is what makes it trustworthy. A pattern claiming to do everything is one nobody believes.
- **Upgrade path in brackets** — before/after in one entry; capacity scalability made legible.

### 30.3 The two corrections manufacturing forces

Per §2.1.3, Anno layouts are comparable because the game has **one fixed ruleset**. A marketplace radius is identical on every island. Takt, tariffs, aisle rules, shift models, and resource catalogs are not.

1. **Every pattern declares explicit validity conditions** — takt band, volume band, capability set, layout constraints. Outside that envelope it is not silently offered.
2. **Metrics are stored normalized and renormalize on instantiation.** A pattern's units/yr is meaningless without the takt and availability it assumed. Store the assumptions; recompute on use; **show both figures and the delta.**

Without these the catalog becomes a library of confidently-wrong numbers — worse than no catalog, because it carries authority.

## 31. The Pattern object

```yaml
Pattern:
  id: string
  name: string
  version: integer
  status: draft | candidate | validated | deprecated
  lineage:
    author, plant: string
    derived_from_cell_version: integer | null    # auto-extracted (§33)
    parent_pattern_id: string | null
    published_at: date

  # WHAT IT IS
  topology: U | straight | L | island | loop | parallel
  automation_level: manual | mechanized | semi_auto | auto | fully_auto
  resource_set: [{resource_id, qty, role: primary|support|buffer|inspection}]
  station_count: integer
  operator_count: number              # fractional if multi-machine tending

  # WHAT IT DOES
  capabilities_provided: [capability_id]
  capabilities_absent: [capability_id]          # the "minus police station" field
  precedence_shape: linear | branched | reentrant

  # GEOMETRY
  footprint:
    bounding_box_mm: {x, y}
    net_area_m2, gross_area_m2: number
    space_efficiency_pct: number      # net/gross — the Anno metric
    min_ceiling_mm, floor_load_kg_m2: number
    utilities_required: [string]

  # MODULARITY
  modularity:
    tiles_on_axis: x | y | both | none
    tiling_pitch_mm: {x, y}
    mirrorable: boolean
    shared_edges: [north|south|east|west]
    max_chain: integer | null

  # PERFORMANCE — NORMALIZED
  reference_conditions:               # mandatory; what the metrics assume
    takt_seconds, availability_pct, yield_pct: number
    shift_model: {shifts, hours, days_per_year}
    tariff_basis: currency
    fx_date: date
  metrics:
    units_per_year: number
    units_per_year_per_m2: number     # primary comparison metric
    balance_efficiency_pct: number
    operators_per_1000_units_year: number
    investment_per_unit_year: currency
    walk_distance_per_unit_mm: number
    va_ratio_pct: number
    bottleneck_utilization_pct: number
    changeover_burden_pct: number
    flexibility_index: number         # variants w/o changeover ÷ total

  # VALIDITY
  validity:
    volume_band: {min_units_year, max_units_year}
    takt_band: {min_s, max_s}
    variant_count_max: integer
    requires_skill_classes: [string]
    excluded_when: [string]

  # HONESTY
  caveats: [string]                   # "station 3 at 96% — no headroom"
  known_failure_modes: [string]       # "breaks above 3 variants"
  confidence: low | med | high
  evidence:
    times_instantiated, times_released: integer
    plants_used: [string]
    actuals_available: boolean
    actual_vs_plan_delta_pct: number | null

  # LIFECYCLE
  upgrade_paths:
    - to_pattern_id: string
      trigger: string                 # "volume > 450k/yr"
      delta_resources: [{op: add|remove|replace, resource_id, qty}]
      delta_investment: currency
      delta_units_per_year: number
      downtime_hours: number
  build_phases:
    - {phase: integer, description, resources: [resource_id],
       capacity_after_units_year: number}

  geometry: Layout                    # instantiable
```

## 32. Normalized metrics and ranking

**Primary set** (always on the card):

| Metric | Formula | Direction |
|---|---|---|
| `units_per_year_per_m2` | output ÷ gross area | higher |
| `space_efficiency_pct` | net ÷ gross | higher |
| `balance_efficiency_pct` | 1 − (Σ idle ÷ (stations × takt)) | higher |
| `operators_per_1000_units_year` | operators ÷ (output/1000) | lower |
| `investment_per_unit_year` | Σ investment ÷ output | lower |

**Rendering rule.** Every metric shows a value **plus its percentile against comparable patterns** — `1 480 units/yr/m² (p78 of 41 comparable)`. A raw number teaches nothing; a ranked one teaches immediately. "Comparable" = same automation level, overlapping volume band.

**Renormalization rule.** Viewed against a target context differing from `reference_conditions`, all metrics recompute and both figures show:
```
units/yr/m²   1 480 → 1 210   (−18%, your takt is 12% longer)
```
**Never show a stored metric as if it applied to the user's conditions.**

## 33. Matching, comparison, composition

### 33.1 Matching

Inverse of the gates: the situation is fixed, patterns are ranked against it.

```
Given envelope, workload(s), demand, context
  → compute required capability set and takt
  → filter: capability coverage ≥ threshold
  → filter: volume/takt inside validity bands
  → filter: bounding box fits envelope (with rotation, tiling)
  → renormalize metrics to target context
  → score, rank, emit with gap analysis
```

```yaml
PatternMatch:
  pattern_id: string
  fit_score: 0-100
  capability_coverage_pct: number
  missing_capabilities: [capability_id]
  extra_capabilities: [capability_id]      # over-spec = wasted investment
  renormalized_metrics: {...}
  metric_deltas_vs_reference: {...}
  spatial_fit: fits | fits_rotated | fits_tiled | infeasible
  tiling_needed: {count, axis} | null
  validity_violations: [string]
  adaptation_required:
    - {type: add_station|swap_resource|extend_footprint,
       description, cost, effort: trivial|moderate|major}
  confidence: low | med | high
```

**Ranking is multi-objective and the trade-off is visible.** The densest pattern is rarely the most flexible; show a frontier, not a winner.

### 33.2 Composition

Anno's *"squared to stack next to other cities"* is compositional grammar. Real lines are rarely one pattern.

**Tiling** — replicate N times for capacity:
```
required_units / pattern.units_per_year → N
place at tiling_pitch, shared edges abutting
→ recompute: shared aisles reduce gross area (tiling is SUPERLINEAR in efficiency)
→ revalidate material supply and egress at composite scale
```

**Chaining** — connect different patterns when one doesn't cover the capability set:
```yaml
PatternInterface:
  edge: north | south | east | west
  handoff: manual | conveyor | agv | buffer
  buffer_capacity_units: integer
  handoff_time_s: number
  orientation_required: string
  height_mm: number                   # transfer heights must match
```
Interface mismatch is an **error**, not a warning (900 mm meeting 1 100 mm does not work).

**Composite metrics do not sum.** Shared aisles improve area efficiency; buffers decouple takt but add WIP; the composite bottleneck is the slowest constituent. Recompute from composed geometry.

## 34. Bootstrapping — the curation problem

Anno's catalog works because thousands of players iterate for free. Yours will be curated by a handful of PE staff with no spare time. **A catalog depending on voluntary authoring will be empty in eighteen months.**

### 34.1 Automatic extraction (primary path)

**Every released cell becomes a candidate pattern automatically.**
```
cell reaches status: released
  → extract geometry, resource set, station structure
  → compute normalized metrics from its actual context
  → generalize: strip site-specific placements, keep relative geometry
  → derive validity bands from the released context
  → status: candidate, confidence: low
  → queue for curator review
```
The engineer does nothing. Curation is a **review queue, not an authoring task.**

### 34.2 Promotion ladder

| Status | Criteria | In search? |
|---|---|---|
| `draft` | manually authored, incomplete | no |
| `candidate` | auto-extracted from one released cell | yes, flagged low confidence |
| `validated` | ≥2 independent instantiations, curator-reviewed, caveats written | yes, ranked normally |
| `deprecated` | superseded, or actuals contradict claims | on request only, with reason |

**Demotion is automatic.** If actuals from any instantiation deviate beyond threshold from claimed metrics, the pattern is flagged and drops from `validated`. The catalog corrects itself against reality rather than accumulating optimism.

### 34.3 Deduplication

Auto-extraction produces near-duplicates. Cluster by resource-set similarity, topology, and metric proximity; propose merges; keep the better-evidenced variant, record the other as lineage. Without this the catalog is unusable at ~200 entries.

### 34.4 The feedback loop

```
pattern instantiated → cell built → actuals measured (C4/C5)
  → delta vs. claim computed
  → evidence updated (times_released, actual_vs_plan_delta_pct)
  → |delta| > threshold → flag for re-curation
  → validated deltas update pattern metrics and reference_conditions
  → validated deltas also update Resource.cycle_time_model
```

This is the decisive advantage over both the spreadsheet and the Anno wiki: **the wiki has no ground truth to correct against; you do.** A catalog validated by production actuals rather than opinion is the only compounding asset in this specification.

## 35. Catalog governance

- Capabilities, resources, tariffs, allowances, changeover families, and scoring weights are **rules-as-data**, effective-dated, editable by PE without a release (fixes F2).
- Plant-level divergence is a **first-class condition to be surfaced**, not normalized away (§2.1.3).
- Overrides at the concept level are visibly flagged (red, per Excel convention) and **collected as catalog-improvement candidates** rather than discarded.
- A released concept reproduces exactly against the catalog state effective at its release date (§6).

---

# PART V — APPLICATION

## 36. Interaction model

Testfit-first, pattern-first, spatial-first. The primary screen is neither a form nor a spreadsheet — it is a **canvas with a parameter rail and a pattern palette**.

```
┌───────────┬──────────────────────────────────┬──────────────┐
│ Patterns  │  Canvas                          │  Fit report  │
│ ┌───────┐ │  ┌────────────────────────────┐  │              │
│ │ card  │ │  │ envelope polygon           │  │  verdict     │
│ │ card  │ │  │  ▢ ▢ ▢  placements         │  │  binding     │
│ └───────┘ │  │  ↝ operator loop           │  │  slack       │
│           │  │  ⬚ clearance violations    │  │  changes     │
│ Params    │  └────────────────────────────┘  │  cost/unit   │
│ rate ▓▓░░ │  ── Yamazumi ──────────────────  │  invest      │
│ shifts 2  │  ▇▇▅ ▇▇▇ ▇▇▂ ▇▇▇   takt line     │  confidence  │
│ topo  [U] │  ── timeline ─────────────────   │  gates 1-5   │
│           │  ⏸ ▶ 1× 10× 100×                 │              │
└───────────┴──────────────────────────────────┴──────────────┘
```

**Every parameter change re-runs testfit within budget.** Dragging the output-rate slider animates the layout and the Yamazumi and flips the verdict live. This is the product thesis: the spreadsheet cannot do this, and it is what makes concepts *explorable* rather than *authored*.

## 37. Overlays — the core visual vocabulary

Transplanted from the city-builder idiom. Toggleable, composable, on one canvas.

| Overlay | Shows | Ancestor |
|---|---|---|
| **Clearance** | access envelopes, aisle corridors, egress | building footprint validity |
| **Reach** | operator reach, material supply, utility reach | market / fire radius |
| **Flow** | routing per member, thickness = frequency | carrier paths |
| **Congestion** | station utilization heat, WIP, bottleneck pulse | carriers queueing |
| **Capability chain** | which resource provides what, and gaps | production chain view |
| **Coverage** | per member: used resources lit, unused dimmed | uncovered-house shading |
| **Sharing heat** | how many members use each resource; single-use = risk | — |

<!-- SOURCE TRUNCATED HERE -->

> **⚠ The supplied source ends mid-table at this point.** The remaining overlay
> rows — beginning with a **Confidence** overlay ("estimated hatched, measured …")
> — were cut off. Do not reconstruct them.

---

# PART V (remainder) — PART VI — NOT YET SUPPLIED

The following were listed in the §0 reading guide but have **not been provided**:

| Missing | Reading-guide description |
|---|---|
| **Part V**, from §37's Confidence overlay onward | remaining overlays, simulation, API surface |
| **Part VI — Delivery** | build sequence, migration, risks, acceptance criteria |

**Do not cite these sections.** Anything in `docs/spec-alignment.md` that sequences
work is derived by inference from Parts I–IV and is explicitly labelled as such.
When the remainder arrives, append it here and re-derive the alignment doc's
"suggested order" against the real Part VI build sequence.
