# Line Planner — alignment status

Where FlowPlan stands against [`docs/line-planner-spec.md`](line-planner-spec.md),
honestly. Two columns matter: what exists, and what is claimed but not built.

**Numbering changed.** This document previously cited a "Cell Design & Optimization
Tool" spec (§3.2, §5.2, §12, §15, §16 …) that was never in the repo. That spec is
now landed as `line-planner-spec.md` v1.0 with new section numbers, and every
citation below has been remapped. Old→new: §3.2→§11, §3.3/§3.4→§12, §3.6→§14,
§3.7/§3.8→§16, §5.1→§17, §5.2→§19, §5.3→§22, §5.5→§23, §5.6→§24, §9→§5, §12→§20,
§15→§15+§18, §15.6→§25, §16→**§4**, §2.2→§7, §2.6→§6, §2.7→§35.

**Parts V–VI of the spec have not been supplied.** The old §10 build sequence this
document used to follow no longer exists. §4 below is therefore inference from
Parts I–IV, and is labelled as such.

---

## 1. Built and tested

| Spec | Status | Where |
|---|---|---|
| §11 Workload / WorkElement | ✅ | `model/types.ts`, schema v8 |
| §11 `attended_fraction` | ✅ | `attendedFraction` drives operator/machine separation |
| §11 time method + confidence | ✅ | `ElementTime`, `weakestConfidence` |
| §11 VA/NNVA/NVA + 7 wastes | ✅ | `WorkClass`, `WasteClass` |
| §11 precedence as DAG | ✅ | `precedenceOrder`, null on cycle |
| §11 variant modes (mixed-model) | ✅ | `engine/workload.ts` |
| §11 workload **editor** — reachable | ✅ | `components/WorkloadPanel.tsx`, Build ▸ Workload |
| §5 confidence propagation | ✅ | weakest input wins, everywhere — *in the engine* |
| §19 Balancing (SALBP-1) | ⚠️ | **`engine/assign.ts` — RPW heuristic, not CP-SAT** (see 1.1) |
| §23 Cost roll-up | ⚠️ | labor/energy/transport/capex yes; **space and tooling no** (`engine/cost.ts`) |
| §24 Concept scoring | ⚠️ | weighted rank, **not** a Pugh matrix vs. datum; no sensitivity |
| §20 Testfit | ⚠️ | verdict/binding-constraint shape only; no envelope |
| §4 Proposal model | ✅ | **both paths** — `ai/verify.ts` and `engine/proposal.ts` (see 1.2) |
| §4 per-item accept, pinning, staleness | ✅ | `engine/proposal.ts`, `components/ProposalPanel.tsx` |

292 tests pass (28 of 35 test files). The 7 failing files are all
`packages/server/src/routes/*` and fail at *collection*, not assertion:
`Role` is undefined because the Prisma client has not been generated. Pre-existing
and unrelated to anything in this document — run `npx prisma generate` in
`packages/server` to clear it.

### 1.1 The balancer row was wrong before

The previous revision said *"§5.2 CP-SAT balancer — not built; `minStations` is a
lower bound, not an assignment."* That is false.
[`packages/core/src/engine/assign.ts`](../packages/core/src/engine/assign.ts) is a
real element-to-station balancer: ranked positional weight, deterministic,
precedence + zoning + takt constrained, emitting per-station `cycleTimeSec`,
worst-mode vs. mix-weighted figures, and `attendedSec` → operator count.

It already does two things §25 asks for: it reports `method: "heuristic-rpw"` and
an `optimalityGapPct` against the theoretical bound. It declines to pretend.

What is missing against §19 is the exact tier: no CP-SAT, no walk-time term in the
objective (`w₄·walk_time`), no multi-manning beyond the operator count, and no
Yamazumi artifact — §19 names the stacked-bar-vs-takt-line as the *primary UI
object* for C3/C4, and it does not exist.

### 1.2 §4 is now satisfied on both paths — *done*

The old document called this "not built, and this is the adoption risk". It was
half built: `core/src/ai/types.ts` already defined a `Proposal` with a mandatory
`rationale` and before/after ratings, and `ai/verify.ts` engine-scored every
candidate. The AI chat path honoured §4. **The optimizer path did not** —
`ADOPT_STATIONS` replaced `model.stations` wholesale, all-or-nothing.

That is closed. [`engine/proposal.ts`](../packages/core/src/engine/proposal.ts)
now wraps the optimizer's output as a `PlacementProposal`, and the reducer's
`ACCEPT_PROPOSAL` is the only path from a solver result into the model:

| §4 requirement | Where |
|---|---|
| Solver output is a separate, never-merged object | `makePlacementProposal()` |
| Mandatory plain-language rationale | `ProposalItem.rationale`, per move |
| Predicted effect | `flowCostDeltaPct`, per item *and* whole-proposal |
| Accepted per-item or wholesale, always explicitly | `applyProposalItems()`, `ProposalPanel` checkboxes |
| Editing underlying state marks proposals `stale`, not deleted | `isProposalStale()` via `model/signature.ts` |
| Pins are never overridden | `Station.fixed` filtered in *both* `optimize.ts` and `applyProposalItems()` |

Two things were already right and were kept rather than rebuilt: `Station.fixed`
**is** the spec's `pinned` flag (§14) and `optimize.ts` already honoured it; and
the amber dashed ghost in the IMPROVED view is §2's "ghost preview before
commit". The genuinely missing pieces were per-item accept, a reason per move,
and staleness.

`layoutSignature` moved from `ai/verify.ts` to
[`model/signature.ts`](../packages/core/src/model/signature.ts) so the engine can
detect staleness without an `engine/ → ai/` import, which §29 forbids. It is
re-exported from its old home.

Ten tests in `engine/proposal.test.ts` cover the subset semantics, pin
resistance, and staleness — so the spec's adoption test now fails CI rather than
relying on memory.

**Still open on the API side:** §4 also requires `POST /propose` to be
non-mutating *enforced at the API layer*. There is no propose endpoint yet;
`packages/server/src/routes/` has no equivalent. Local-first interaction (§26)
means this only matters when a solver runs server-side, which none does today.

### 1.3 The workload engine is now reachable — *partly done*

`analyseWorkload` shipped with schema v8 and **nothing could feed it**. The model
carried `workElements` and `variantModes` on the type; no reducer action and no
screen ever wrote either. A grep for `workElements` across `store/` and
`packages/web/src/` returned zero hits.

[`WorkloadPanel.tsx`](../packages/web/src/components/WorkloadPanel.tsx) (Build ▸
Workload) is the missing half: add/edit/delete elements with seconds, time
method, confidence, VA/NNVA/NVA class, `attendedFraction` and multi-select DAG
predecessors — with the live `analyseWorkload` readout above it (weighted vs.
worst-mode content, the VA bar, operator-bound share, min stations, over-takt
elements, precedence-cycle warning).

The reducer gained six actions. The one worth reviewing is `DELETE_WORK_ELEMENT`:
it strips the deleted id from every other element's `predecessors`,
`mustBeSameStationAs` and `mustNotBeSameStationAs`, and from every mode's
`elementOverrides`. Without that, a dangling predecessor makes `precedenceOrder`
return null — which the UI reads as "cycle", so a stale model presents as a
broken balancer. That is the case the tests pin.

An empty workload is the common case for any cell authored station-first, so the
panel offers **Derive from N process stations** — `engine/infer.ts` matches step
names to capabilities, and the result is reported honestly: match rate, the names
that matched nothing, "19 values inferred, all at low confidence, precedence
assumed linear". On the sample cell that yields 4 elements / 205 s / 100% match.
Inference that does not say what it guessed is the F8 failure wearing a new hat.

**What is still open from build-order item 2:**

- `assign.ts` remains unreachable. The panel edits the workload but nothing
  turns it into stations yet — the `workload → balancer → stations` inversion
  (contradiction 2) is not done.
- Takt is inferred from the slowest process station rather than computed from
  demand (§17). That is a placeholder; real takt needs the OperatingContext
  work in §3.
- Mix modes are read-only in the panel. `ADD/UPDATE/DELETE_VARIANT_MODE` exist
  and are tested; no UI writes them yet.

### The 40-product answer, concretely

Two layers, and they are different questions:

1. **`VariantMode`** (§11) — one workload, several work-content variants. Forty
   part numbers that need the same work are **one mode**. Balancing computes both
   the mix-weighted average *and* the worst mode, because balancing to the
   average starves the heavy variant.
2. **`LinePortfolio`** (§15) — N *separate* workloads sharing one line in
   multi-model regime. Changeover is capacity consumed, sequence is a decision,
   and `drop_analysis` answers "which part do I drop to make this fit".

Gate 1 (§18) is the cheap one and, as the spec says, the one most often answered
wrongly: a set operation over capability ids that names exactly which part is
blocked by which missing capability.

---

## 2. Written, parked, unreachable

The multi-part layer was built, tested, and then removed from the main tree. It
lives in [`packages/core/src/parked/`](../packages/core/src/parked/) —
`portfolioModel.ts`, `portfolioEngine.ts`, `changeover.ts` — with its own README.
Its tests still run, so it cannot rot silently, but **no UI can reach any of it.**

| Spec | Status | Where |
|---|---|---|
| §15 LinePortfolio, ChangeoverMatrix | parked | `parked/portfolioModel.ts` |
| §18 Gate 1 Coverage | parked | `coverageCheck`, `assessPortfolio` |
| §18 Gate 2 Technical fit | parked | volume-band check, or "not assessed" |
| §18 Gate 3 Capacity w/ changeover | parked | split reported separately, per §18 |
| §18 Gate 4 Balance | parked | per workload vs. fixed station count |
| §18 `drop_analysis` | parked | ranked by cheapest sacrifice that helps |
| §21 Sequencing | parked | greedy + 2-opt ATSP, deterministic |
| §15 family grouping + derive | parked | `parked/changeover.ts` |
| §17 Takt / available time | parked | `availableSeconds` — **the live app has no takt** |

That last row is the one to notice. §17 says takt is computed **first** and
constrains which resource classes are offered at all. In the running application
it is not computed at all; the planner types cycle times onto stations.

The parked README names its own unpark condition — a Capability/Resource catalog
(§12) and a UI that can show a coverage verdict. That remains correct.

**It has already rotted, though.** The README claims "its tests still run, so it
cannot rot silently". Vitest does not typecheck, and `npx tsc --noEmit -p
packages/core` reports:

```
packages/core/src/parked/portfolioModel.ts(1,59):
  error TS2307: Cannot find module './types'
```

The import was not repointed when the code moved into `parked/`. The tests pass
because they never exercise that type import at runtime. Fix it when unparking,
or fix it now — but the README's safety claim is currently false.

---

## 3. Not built

| Spec | Gap |
|---|---|
| §12 Capability catalog | `Station.provides` is a bare string array — no governed catalog, no `alternatives`, so **§7 cannot generate alternatives yet** |
| §12 Resource catalog | No parametric `cycle_time_model`, no reliability, no ramp curve, no TRL, no `volume_band` on a resource |
| §14 Layout (polygon/obstacles) | Layout is a coarse integer grid, not a floor polygon with clearances |
| §14 Envelope | Not built. No obstacles, no egress rules, no floor load, no `fixed_placements` |
| §16 OperatingContext | Partial — `AvailableTime` only. No tariffs by skill class, no PFD allowances, no FX, no `installed_base` |
| §16 Measurement distributions | Still means, not p50/p95/p99. §16 is explicit: store distributions (F7) |
| §20 Testfit service | Not built. §20 calls separating feasibility from optimization "the single most important architectural decision in this document" |
| §22 Layout solver | `optimize.ts` is greedy pairwise swap; no clearance, aisle, egress or floor-load constraints |
| §25 Scale tiering | No tier detection, no display of tier. `method`/`optimalityGapPct` exist in `assign.ts` only |
| §6 Immutable snapshots | Models are mutated in place. No version, no `parent_version`, no reconstruct-at-release-date |

### 3.1 New in the unified spec — never previously assessed

Parts I, III (§26–29) and IV had no counterpart in the old document. These are
gaps that were not being tracked at all:

| Spec | Status |
|---|---|
| §3 seven interaction laws | Unaudited. `components/LayoutCanvas.tsx` needs a pass against Law 1 (no modals), Law 3 (invalid states permitted and visible), Law 5 (canvas primary) |
| §5 confidence **rendered** as range + hatch | Engine propagates it correctly; **the UI shows point values.** §5 is a rendering requirement, and it is unmet — this is the F8 false-precision failure reappearing |
| §26 performance budgets | No budgets declared, none measured. Canvas is DOM/SVG; §26 says SVG will not sustain 16 ms at tier L |
| §27 incremental recomputation | Full recompute on edit; no dirty set |
| §28 continuous validation | `engine/validate.ts` exists but is not wired as in-place, non-blocking, at-the-violation rendering |
| §29 layer architecture | **Violated.** `engine/concepts.ts` `CONCEPTS` is a TypeScript constant; §29 and §35 both require rules-as-data |
| **§30–35 pattern library** | **Entirely unbuilt** |
| §36 canvas + parameter rail + pattern palette | Partial. `LayoutCanvas`, `DagView`, `CyclePanel` exist; no pattern palette, no live testfit on parameter change |
| §37 overlays | Not built. No overlay system at all |

### 3.2 The pattern library is the largest unlisted gap

§30 names it "the highest-value mechanic in this specification", and the argument
is that design-from-blank should be the *fallback*, not the default. FlowPlan is
100% design-from-blank.

It is also the gap with the deepest prerequisite chain, and this is worth stating
plainly because it changes the build order:

```
§6 immutable versioned snapshots
     ↓  (§34.1 — "every released cell becomes a candidate pattern automatically")
§34 auto-extraction on status: released
     ↓
§31 Pattern objects with reference_conditions
     ↓  (§32 renormalization, §33 matching)
a catalog worth searching
```

**No snapshots → no auto-extraction → no catalog.** §34 is explicit that a catalog
depending on voluntary authoring "will be empty in eighteen months", so the manual
path is not a viable substitute. Immutability (§6) is currently filed as a
data-hygiene nicety; it is actually the gate on Part IV.

---

## 4. Where FlowPlan contradicts the spec

1. **Product data is in the model and shouldn't be.** `Product`, `PartFeature`,
   `VolumeScenario.productMix` were built before the scope boundary was set. §1.1
   excludes product data outright — "parts enter the model as abstract
   workloads". `VariantMode` is the replacement. These should be **removed**, not
   extended — deferred only because it is a breaking change deserving its own
   decision.

2. **Stations are authored, not derived.** The spec's flow is
   `workload → balancer → stations`. FlowPlan's is `author stations directly`.
   `assign.ts` can already invert this (§1.1) and is only reachable through
   `generateCell.ts`; until the UI inverts too, the 26-field station inspector
   stays, and it stays the worst screen in the app.

3. **`CycleBreakdown` duplicates `WorkElement.classification`.** Five buckets
   (VA/handling/walk/wait/setup) versus §8's VA/NNVA/NVA + seven wastes. The
   latter is correct; the former should be migrated onto it.

4. **Concept profiles are hardcoded heuristics, not catalog data.** §35 says rules
   are data, effective-dated, editable by PE without a release — that is the fix
   for Excel's F2. `CONCEPTS` in `engine/concepts.ts` is a TypeScript constant, so
   FlowPlan reproduces F2 in a different language.

---

## 5. Suggested order — *inferred, not specified*

The spec's Part VI build sequence has not been supplied. The following is derived
from what Parts I–IV assert about dependencies, and should be re-checked against
Part VI when it lands.

| # | Next | Why |
|---|---|---|
| ~~1~~ | ~~**§4 — route every solver write through `Proposal`**~~ | **Done** — see 1.2. Only the `POST /propose` API guard remains, and it is moot until a solver runs server-side |
| ~~2~~ | ~~**Workload editor UI**~~ | **Partly done** — `workload.ts` is now reachable (see 1.3). `assign.ts` still is not, and the station inspector is not yet inverted |
| 3 | **§12 capability/resource catalog** | The unpark condition the parked README names, and the shared prerequisite for §7 alternatives, §18 Gate 1, and §33 pattern matching |
| 4 | **§15/§18 portfolio UI** | Unpark. Gate 1 is set arithmetic and already written and tested |
| 5 | **§5 confidence rendering** | Cheap, and it is the mechanism that prevents F8. The engine already computes what the UI needs to draw |
| 6 | **§6 immutable snapshots** | Prerequisite for §34 auto-extraction — see 3.2. Nothing in Part IV is reachable before this |
| 7 | **§14 envelope + §20 testfit** | Needs a real layout model first; §20's separate-services rule should be honoured from the first commit, not retrofitted |

Items 5–7 are sequenced by inference from the dependency chains in §30–35 and
§20, since no authoritative build sequence exists yet.
