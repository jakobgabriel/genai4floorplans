# FlowPlan — Product Specification

**Type:** Cell & material-flow assessment tool for manufacturing
**Status:** Spec v1.0 — derived from working HTML demo (`flowplan.html`)
**Owner:** Jakob Gabriel
**One-line:** Rate a production cell's actual state across flow, balance, ergonomics and automation, then show a scored improved layout — no CAD, no backend required to start.

---

## 1. Purpose & positioning

FlowPlan rates an existing manufacturing cell and quantifies improvement potential. It sits between heavyweight factory-planning suites (Tecnomatix, FlexSim) and the spreadsheet-plus-intuition reality of most cell redesigns. The wedge: a planner can model a cell in minutes from data they already have (cycle times, volumes, footprints), get a defensible rating, and walk into a review with a scored before/after — not a hand-drawn spaghetti diagram.

**Explicitly not:** a discrete-event simulator, a CAD tool, or an AI that "designs the factory." The optimization math is classical and auditable; any future LLM layer only ingests inputs and narrates results.

**Primary user:** industrial / manufacturing engineer doing cell layout, line balancing, or lean assessment across one or several sites.

## 2. Scope

### In scope (v1, already demonstrated)
- Single-cell layout on a grid with draggable stations and fixed/anchored constraints.
- Seven-KPI composite rating vs. an optimized floor: material flow cost, travel effort, aisle congestion, placement efficiency, line balance, ergonomics, automation coherence.
- Bottleneck / line-balance analysis (throughput per step, constraint identification, takt).
- Process-flow validation: dead ends, orphans, unreachable steps, missing I/O.
- Automation rating: per-link chaining (chained-auto / mixed / auto-island) and per-step automation potential (heuristic + manual override).
- Flexible input/output areas (station roles).
- Standard cell-form templates (I, U, L, S) with overlay + snap.
- Manual step creation, flow editing, full per-station configuration.
- JSON import/export as the model format; localStorage autosave.
- Mobile-responsive, runs as a single self-contained HTML file.

### Out of scope (v1)
Parallel/branching flow topologies, shared-resource modelling, multi-cell/multi-line, discrete-event simulation, real CAD import, LLM ingestion, multi-user/cloud sync.

## 3. Data model (canonical)

The entire model is one JSON object. Export produces exactly this; import fills missing fields with defaults.

```jsonc
{
  "name": "string",
  "gridW": 22, "gridH": 14,
  "stations": [ /* Station */ ],
  "flows":    [ /* Flow */ ],
  "noGoZones":[ { "x":0,"y":0,"w":0,"h":0,"label":"" } ]
}
```

**Station**

| field | type | meaning |
|---|---|---|
| id | string | unique key, referenced by flows |
| name | string | display name |
| role | enum | `input` · `process` · `output` (flexible I/O) |
| type | enum | `machine` · `manual` · `quality` · `store` · `buffer` |
| x, y, w, h | int | grid position & footprint |
| fixed | bool | anchored — optimizer won't move it |
| auto | enum | `manual` · `semi` · `auto` (current automation state) |
| autoOverride | enum? | `null` · `yes` · `no` (override automation potential) |
| capacityPerShift | int | throughput ceiling |
| operators | int | staffing / parallelism |
| cycleTimeSec | int | per-part cycle |
| changeoverMin | int | setup/changeover time |
| ergoRisk | enum | `low` · `med` · `high` |
| utilities | string[] | e.g. power, air, coolant |
| notes | string | free text |

**Flow**

| field | type | meaning |
|---|---|---|
| from, to | string | station ids |
| volume | int | parts/shift moved |
| unitCost | float | cost per unit-distance |
| transport | enum | `manual` · `forklift` · `conveyor` · `agv` |
| partWeightKg | float | per-part weight |
| notes | string | free text |

## 4. Rating model

Composite = weighted sum of seven KPIs, each normalized 0–100 against an achievable floor.

| KPI | Weight | Basis |
|---|---|---|
| Material flow cost | 0.25 | Σ(volume × rectilinear-distance × unitCost) vs. optimizer floor |
| Travel effort | 0.15 | Σ(volume × distance) vs. floor |
| Aisle congestion | 0.10 | flow crossing central corridor (proxy) |
| Placement efficiency | 0.10 | actual flow cost vs. optimal floor |
| Line balance | 0.20 | line output ÷ mean step rate |
| Ergonomics | 0.10 | 100 − volume-weighted high-risk share |
| Automation coherence | 0.10 | 100 − (auto-islands ÷ links) |

Letter grade A–E from the composite. **Improvement potential** = % flow-cost reduction the optimizer achieves by repositioning movable stations.

**Bottleneck:** station rate = min(3600/cycleTimeSec × shift-hours × operators, capacityPerShift). Line output = slowest process step. Constraint named explicitly; other steps shown as % utilization.

## 5. Architecture

**Demo (now):** single HTML file, React via CDN (no build step, no Babel), all logic client-side, localStorage persistence, JSON files as the interchange format. Runs on desktop and mobile.

**Productized (target):**
```
React SPA (canvas + rating panels)
   │  JSON model
   ▼
Optimization engine  ──  classical, deterministic
   (Python: OR-Tools / scipy, or keep in-browser JS for small cells)
   │
   ▼
Model store  ── start: JSON files / localStorage
             ── later: Postgres per site
   │
   ▼  (optional, later)
LLM layer  ── ingest routing sheets/photos → model; narrate tradeoffs
```
Deployment fits an ArgoCD ApplicationSet for per-site rollout (Manufacturing App Store pattern). Each site runs its own instance; models are portable JSON.

## 6. Key screens

1. **Layout** (dominant) — Actual / Improved / Side-by-side views; drag, select, ghost overlays.
2. **Rating** — grade, seven KPI bars, improvement potential, flow-cost Pareto.
3. **Balance** — throughput per step, bottleneck callout, takt.
4. **Flow** — validation issues, cell-form templates, add step.
5. **Automation** — chaining links, per-step automation potential.
6. **Configure** — full station fields, connections editor.
7. **Schema** — in-app data-model reference.

## 7. Roadmap

**v1.1 — credibility**
- Bottleneck-aware suggestions (split/parallelize the constraint, not just move boxes).
- Footprint-collision avoidance in optimizer and template snapping; respect no-go zones.
- On-canvas flow drawing (tap two stations) and inline flow attribute editing.

**v1.2 — fidelity**
- Parallel/branching topologies; per-station shift model.
- Editable grid size, station id rename, no-go zone editing in-UI.
- CSV export of KPI + automation-potential tables for review packs.
- Undo/redo.

**v2 — platform**
- Multi-cell / multi-line; site-level rollups.
- Postgres model store; multi-user.
- LLM ingestion (routing sheet / photo → model) and review narration.
- Per-site deployment via GitOps.

## 8. Success metrics

- Time to model a cell and produce a scored before/after: target < 30 min from existing data.
- Variants evaluated per layout decision: target ≥ 3 (vs. typically 1).
- Bottleneck correctly surfaced where cycle-time intuition would mislead (the demo already shows CNC, not the longest-cycle Assembly, as the constraint).

## 9. Honest limitations (carry into any pitch)

- Optimizer is greedy pairwise position-swapping — a local floor, not a global optimum; it won't resize or re-route.
- Balance treats the line as a single sequential chain; operators-as-parallelism is a simplification.
- Congestion is a centerline proxy, not an aisle-network model.
- Automation potential is a heuristic opinion from entered fields, not a validated ROI model — hence the manual override.
- Not a substitute for discrete-event simulation on complex, high-variability lines.
