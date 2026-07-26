# FlowPlan — Consolidation Handover

**For:** Claude Code, working on `jakobgabriel/genai4floorplans` (branch `claude/app-flexibility-ux-JvhKa`)
**From:** three-source reconciliation, 2026-07-20
**Supersedes:** the earlier Lean-Cell-Generator handover — see §1 for why

---

## 0. The decision this file makes

Three artifacts exist across these projects. They overlap heavily and none of them is a superset of the others. This file collapses them into **one project on one codebase**.

| Artifact | What it is | Verdict |
|---|---|---|
| **FlowPlan** (`genai4floorplans`) | TS monorepo, `@flowplan/core` + web + server, Postgres, Docker, deterministic engine, golden-fixture tests | **the codebase. Everything lands here.** |
| **Lean-Cell-Generator spike** | single-file `mockup.html`, 3686 lines vanilla JS, v0.9.2, 33/35 tests | **harvest ideas, retire the code** |
| **Line Cell Blueprint 0.1** (PDF) | released-format IE standard, 6 inputs → concept in 15 min | **method + defaults + output format** |

**Why FlowPlan is the base and not the spike:** FlowPlan has a framework-free deterministic engine with golden-fixture tests locking the numbers, a storage abstraction with a shared contract test, schema versioning with migration, and a real deployment story. The spike has three test cycles of hard-won behaviour but is a single mutable HTML file whose scoring constants were twice calibrated by hand after they saturated. Porting spike *ideas* into FlowPlan's engine is a week; porting FlowPlan's rigor into the spike is a rewrite.

**What that costs:** the spike's German operator-facing UI, its 4-tab topology, and its grid-cell painting are genuinely better than FlowPlan's equivalents. Those get ported (§3), not discarded. Nothing in the spike is thrown away except the file itself.

---

## 1. Correction to the previous handover

An earlier handover in this series told you to rework the spike in place and treated FlowPlan as a separate project to borrow two mechanisms from. **That was written before the FlowPlan repo was visible and it is wrong.** Discard it. The direction is reversed: FlowPlan is the base, the spike is the donor.

Everything the earlier file said about the *blueprint* still holds — it is reproduced and extended below, retargeted at FlowPlan.

---

## 2. What FlowPlan already has

Do not rebuild these. They are the reason it's the base.

- **Seven-KPI composite rating** — flow cost 0.25, travel 0.15, congestion 0.10, placement 0.10, balance 0.20, ergonomics 0.10, automation coherence 0.10 → letter grade A–E
- **Deterministic engine in `@flowplan/core`**, framework-free, re-scored identically client and server; golden fixtures lock the numbers
- Actual / Improved / Side-by-side views, ghost overlays, drag + anchor (`fixed`)
- Bottleneck analysis naming the constraint explicitly, with per-step utilization
- Flow validation: dead ends, orphans, unreachable steps, missing I/O
- Automation chaining (chained-auto / mixed / auto-island) + per-step potential with manual override
- Cell-form templates I/U/L/S with overlay + snap
- Schema versioning + migration, non-destructive import, named scenarios, workspace Explorer with nested folders
- Undo/redo, no-go zones, editable grid, per-station shift model, CSV export
- `StorageProvider` abstraction — localStorage offline, API when signed in, one contract test for both
- **Honest limitations surfaced in-app** via `?` popovers

That last one matters more than it looks. It is the same instinct as the blueprint's data-quality column and it is the hook §4.1 attaches to.

---

## 3. Harvest from the spike

Port these into FlowPlan. Each is an idea, not code — reimplement against `@flowplan/core` types with tests.

### 3.1 The 4-tab topology

The spike's canonical structure (its §14) is a better information architecture than FlowPlan's seven screens, because it separates *durable assets* from *ephemeral demand*:

```
ASSETS (horizontal, durable)      Halle + Arbeitsplätze
              │  demand × capacity interplay
PROJECTS (vertical, ephemeral)    Projekte  (products, volumes, BOMs)
              │  solver intersection
OUTPUT                            Varianten
```

FlowPlan's Layout / Rating / Balance / Flow / Automation / Configure / Schema are all *views of one cell*. That works for the single-cell v1 but breaks the moment multi-product arrives (§3.3). Adopt the four-tab split as the v2 shell, with FlowPlan's existing panels becoming views **inside** the Varianten tab.

Do this **after** §5 steps 1–6, not before — it is a shell refactor and it will churn every component test.

### 3.2 Grid-cell station model with typed ports

The spike models a workplace as painted grid cells with indexed ports (`in:1`, `out:1`) rather than FlowPlan's `x,y,w,h` rectangle. This is what makes material paths spatially real instead of centreline abstractions — and it is the prerequisite for the guardrail contract (§4.4).

Port as an **optional richer footprint**: keep `x,y,w,h` as the v1 form, add `cells` + `ports` as an optional field with migration defaulting a rectangle to its bounding cells. FlowPlan's schema versioning makes this safe.

### 3.3 Multi-BOM per cell + coverage LEDs

The spike's Projekte tab handles several products running through one cell, with per-BOM line→port mapping and a coverage cascade (R1–R6 rules, 🟢/🟡/🔴 gating inclusion in analysis). FlowPlan v1 is explicitly single-product.

This is the single largest capability gap and it is what the blueprint's weighted-mix requirement (§4.5) depends on.

### 3.4 Ranked variant generation

FlowPlan optimizes to *one* improved layout. The spike generates ~50 ranked variants with 5 optimize-for pills and featured cards (Balanced / Smallest / Highest throughput / Lowest TCO).

Port the **ranked-list concept**, not the spike's solver. FlowPlan's optimizer is greedy pairwise swapping; wrap it to emit N scored candidates rather than one, and rank by the existing seven-KPI composite. Featured cards fall out for free.

### 3.5 TCO

The spike computes total cost of ownership per variant plus operator/AGV/cobot counts. FlowPlan has no cost model at all. Add it — but see §4.1, because a point-valued TCO built from estimated inputs is exactly the failure both standards name.

### 3.6 What NOT to port

- The spike's `walkPenalty = min(0.7, walk/200)` — replaced by the loss factor (§4.2)
- Its MutationObserver reactivity — FlowPlan has a proper store
- Its solver-mutates-state model — see §4.7

---

## 4. Requirements from the Line Cell Blueprint

The blueprint is a released-format IE standard. Where it disagrees with either codebase, **it wins**, because it is what an industrial engineer gets reviewed against.

### 4.1 Data quality on every number

The blueprint's routing table carries `measured | experience | estimated` per operation, and states why: *uniform confidence across unevenly evidenced figures is expensive, because investment follows it.*

Add `dataQuality` to every time and cost field in the FlowPlan model. Render it, always visible, no hover required:

```
€2.10–2.90/unit  (6 of 14 inputs estimated)     correct
€2.43                                            a lie
```

Confidence propagates to the weakest input — an estimated cycle time makes the TCO built on it a range, not a point. Estimated renders as a hatched range.

FlowPlan's `?` help popovers already carry the honest-limitations instinct; this is the same idea moved from *the model* to *each number*. **Do this first — it constrains everything else, and retrofitting it later means touching every render path twice.**

The blueprint's `Open points` field (*"Time for operation 130 is estimated, not measured — secure before investment release"*) is the output form. Generate it from the flags; don't have the user type it.

### 4.2 The loss factor replaces fitted penalties

```
Stations ≈ (work content ÷ takt) × loss factor        loss factor = 1.15–1.25
```

The loss factor carries walking, reaching, handling and balancing loss — none of which appears in a standard time. The blueprint stores it as a constant *so it does not have to be measured, and so it does not get forgotten.*

Default 1.2, exposed as a cell-level parameter showing the band. This replaces the spike's saturating walk penalty and gives FlowPlan's station-count math a documented IE provenance instead of a fitted curve. Keep A*/rectilinear walking distance as a reported KPI and a ranking input — just not as the throughput derating mechanism.

### 4.3 Never round the station count

`STATIONS CALCULATED 4.9` · `STATIONS CHOSEN 5 (planner's decision)`.

The decimal says how much headroom remains for another variant. Display both; the chosen count is a recorded decision, not a `Math.ceil()` inside the engine.

### 4.4 Four separated material paths — IN / OUT / NOK / RWK

FlowPlan models flows with `from`/`to`/`volume`/`transport`. It has no reject or rework stream. The blueprint (§10) makes their **separation the guardrail**:

> No reject can leave the cell on the good-part route — ensured by design, not by work instruction. The reject path leaves in a different direction from the good-part path, so mix-up is spatially impossible.

Add `NOK` and `RWK` as flow kinds and port types. The separation is then a geometric constraint the engine can check and the canvas can render as a violation — testable design, not a procedure in a binder.

Guardrail rules worth encoding as validations: one exit one direction FIFO; buffer to next cell capped (full buffer stops the cell — *a signal, not a fault*); a part counts as good only after passing test; reworked parts re-test without exception; escalation after 3 consecutive rejects.

### 4.5 Weighted work content, not main-variant

*"Balancing is done against the weighted mix, not against the main variant — otherwise the cell tips over on every shift in mix."*

Variant-dependent operations enter proportionally to volume share. Depends on §3.3 (multi-BOM). Once that lands, confirm the balancer weights by share rather than balancing the dominant product and treating the rest as perturbation — **if it does the latter, that is a correctness bug, not a refinement.**

### 4.6 Two missing output artifacts

**The Cell Data Sheet** (blueprint §11) — every variant gets this, identical in form. That identity is what makes two variants comparable and lets a planner sort by whichever constraint actually binds. All fields are derivable from FlowPlan state plus the additions above:

```
Archetype code · Product/family · Data revision · Customer takt
Work content (weighted, and raw across variants)
Stations (chosen, and calculated) · Operators
Bottleneck station (which, and seconds over takt)
Behaviour at +20 % volume
Line balance efficiency · WIP cap · Changeover between variants
Floor space cell · Floor space material supply
Ramp-up · Open points
```

**`Behaviour at +20 % volume` is mandatory and no codebase has it.** The blueprint renders it as a sentence: *"Takt drops to 110.0 s → station 5 and station 2 exceed takt. A second test nest becomes mandatory, station 2 must be split → 6 stations."* Compute it, render it as that sentence. Volume is the assumption that breaks most often; a tool that hides that is worse than useless.

**The archetype code** — `MA · [flow shape] · [stations] · [sequence] · [labour class]`, e.g. `MA-U-05-F-H`:

- flow shape U | L | N (nest) | E (single station) — maps onto FlowPlan's existing I/U/L/S templates
- stations, two digits · sequence F (fixed) | V (variable) · labour class H | N

It tells a planner whether a variant fits *before opening it*. Add to variant output; show on featured cards and in the ranked list.

The **archetype matrix** (takt band × variant count) is worth a view, including its empty cells, which must render as two distinct declared states: `not populated` (uneconomic/out of domain, with reason) and `GAP` (occurs, not worked out, therefore an open action — warn colour). Empty fields being *declared* is the point: a planner landing on "not populated" knows they're building new ground rather than anchoring to the nearest unsuitable pattern.

### 4.7 The solver proposes, never mutates

FlowPlan has `fixed` anchoring, which is the right primitive but only half the contract. Make the split explicit:

```
User state      placements, pins, overrides    only the user writes this
Derived state   KPIs, distances, balance, TCO  recomputes continuously
Proposals       optimizer output               separate object, accepted explicitly
```

Improved-layout output is a **proposal**: ghost overlay, plain-language rationale, accepted per-item or wholesale. Editing user state marks outstanding proposals stale rather than deleting them silently.

One silent overwrite of a deliberate manual placement and the tool is abandoned for Excel permanently. Treat as correctness, not UX.

### 4.8 The freedom-finding pass

> The routing is numbered linearly and therefore implies a compulsory sequence that mostly does not exist. An edge is drawn only where it is **physically compulsory** — not because it has always been done that way.

The spike removed its Process tab on the grounds that the DAG emerges from BOM mapping — but a BOM-derived DAG inherits BOM ordering, which is the same failure in different costume. FlowPlan's flow validation already walks the graph; extend it to classify each edge:

| Finding | Meaning |
|---|---|
| `free` | depends only on an early predecessor; freely placeable, ideal for filling an under-loaded station |
| `swappable` | two ops share a predecessor, not each other |
| `exclusive` | mutually exclusive variants; can share a station since they never co-occur |
| `compulsory` | genuine physical precedence, not negotiable |

Render as a small table under the Balance panel. In the blueprint's worked example a single `free` operation (the type plate) fills the under-loaded station — that is precisely the balancing gain the tool exists to find.

### 4.9 The forgotten 30–40 %

*"The cell area gets planned, the area for bins and replenishment does not. Rule of thumb: another 30–40 % of the cell area."*

Report `floorSpaceCell` and `floorSpaceMaterialSupply` as **separate figures** everywhere. One combined footprint understates by a third, and the blueprint names it as one of the three most common mistakes with the U-cell archetype.

The other two are worth encoding as engine warnings:

- **Test time counted as operator time.** Autonomously running rigs occupy the operator only for load/unload. This is `attendedFraction` — FlowPlan lacks it and it is load-bearing: the blueprint's own example turns a 143 s bottleneck into ~68 s purely by recognising it. Without it, balancing is wrong for every semi-automated cell.
- **Sequence adopted from the routing** — §4.8.

### 4.10 The 15-minute path

The blueprint's acceptance test: an IE unfamiliar with the product family reaches a defensible first pass in **under 15 minutes** from six inputs, where *no input may require a measurement campaign* and *a missing figure takes the stored default — the standard never blocks.*

Six inputs: units/year + shift model · work content per unit · variant count · sequence fixed or free · labour cost class · available floor space + part weight class.

FlowPlan's success metric is "< 30 min to a scored before/after." The blueprint halves that and specifies the input set. Build a **quick-entry mode** that takes the six, applies stored defaults for everything else, and lands directly on a ranked variant list. This is the strongest adoption argument in any of the four documents — it is the thing that makes a planner try it twice.

---

## 5. Conflicts, stated explicitly

| # | Conflict | Resolution |
|---|---|---|
| C1 | FlowPlan = 7 screens of one cell; spike = 4 tabs separating assets/demand/output | Adopt 4 tabs as the v2 shell (§3.1); FlowPlan panels become views inside Varianten. **After** steps 1–6. |
| C2 | FlowPlan optimizes to one improved layout; spike ranks ~50 | Wrap FlowPlan's optimizer to emit N scored candidates (§3.4). Keep its engine; borrow the presentation. |
| C3 | Spike derates throughput by a fitted walk penalty; blueprint uses a documented loss factor | Loss factor wins (§4.2). Walk distance stays a KPI. |
| C4 | Spike removed explicit sequence authoring; blueprint says routing order must not be inherited | Keep it removed; add the freedom-finding pass (§4.8). Both satisfied. |
| C5 | FlowPlan ranks by composite score; blueprint ranks by whichever constraint binds | Keep the composite, add the data sheet (§4.6) — identical form across variants is what enables sort-by-binding-constraint. |
| C6 | FlowPlan is single-product; blueprint demands weighted mix | §3.3 multi-BOM is a prerequisite for §4.5. Sequence accordingly. |
| C7 | FlowPlan targets 30 min; blueprint targets 15 from six inputs | Quick-entry mode (§4.10). Not in tension — it's a faster on-ramp to the same model. |

---

## 6. Ordered work plan

Each step is independently shippable and testable. FlowPlan has golden-fixture tests that lock engine numbers — **steps 2, 4 and 5 will change those numbers deliberately. Re-baseline the fixtures in the same commit, never separately.**

| # | Work | Package | Risk |
|---|---|---|---|
| 1 | `dataQuality` on all time/cost fields + confidence rendering (§4.1) | core model, web render | low, wide |
| 2 | Loss factor replaces fitted penalties (§4.2) | core/engine | **med** — moves rankings, golden fixtures churn |
| 3 | Stations calculated vs chosen (§4.3) | core/engine, web | low |
| 4 | `attendedFraction` on stations (§4.9) | core model, balance engine | **med** — balancing is wrong without it |
| 5 | Floor space split cell / material supply (§4.9) | core/engine, TCO | low |
| 6 | Freedom-finding pass on the flow graph (§4.8) | core/engine/validation | med |
| 7 | Optimizer emits N ranked candidates + featured cards (§3.4, C2) | core/engine/optimizer, web | med |
| 8 | Cell data sheet artifact (§4.6) | web, core | low, mostly rendering |
| 9 | `Behaviour at +20 % volume` sensitivity (§4.6) | core/engine | med |
| 10 | Archetype code + matrix view (§4.6) | core model, web | med |
| 11 | Proposals as first-class objects, explicit accept (§4.7) | core/store/reducer | **high** — structural |
| 12 | NOK + RWK flow kinds + separation constraint (§4.4) | core model, validation, canvas | med |
| 13 | Multi-BOM per cell + coverage LEDs (§3.3) | core model, web, server schema | **high** — schema migration |
| 14 | Weighted work content in balancer (§4.5) | core/engine/balance | med — depends on 13 |
| 15 | Grid-cell footprint + typed ports, optional (§3.2) | core model + migration | med |
| 16 | TCO model (§3.5) | core/engine | med — must respect §4.1 |
| 17 | Quick-entry mode, six inputs (§4.10) | web | med |
| 18 | 4-tab shell refactor (§3.1) | web | **high** — churns component tests |

**Suggested milestones:** 1–6 = *credibility* (numbers become defensible). 7–12 = *variants* (the tool becomes explorative). 13–16 = *multi-product*. 17–18 = *adoption*.

---

## 7. Rules that survive all of the above

- **Engine stays framework-free and deterministic** (FlowPlan spec §4). Same code scores client and server. Never branch scoring on environment.
- **Golden fixtures are the contract.** Changing a number is allowed; changing it silently is not. Re-baseline in the same commit with the reason in the message.
- **Every number gets a confidence state at the point it enters the model**, not retrofitted at render.
- **Never round a station count silently.**
- **Capabilities and resources stay N:M.** Never hardcode a 1:1 process→workcenter link — that relation is what generates alternatives.
- **Schema changes go through the existing versioning + migration path.** Old JSON must keep loading — that property is already tested, don't break it.
- **`StorageProvider` contract test must keep passing for both providers.** Offline and cloud behave identically.
- **Honest limitations stay surfaced in-app.** Every heuristic added here (loss factor band, automation potential, congestion proxy, TCO) needs a `?` popover saying what it isn't.
- **German operator-facing vocabulary where the spike established it** — Arbeitsplatzbibliothek, not "Archetypes Library". Technical terms stay untranslated: takt, Yamazumi, OEE, DAG, TCO.

---

## 8. Open questions — answer before building, not during

1. **Does the 4-tab refactor (§3.1, step 18) happen at all, or do FlowPlan's seven screens stay?** It is the largest UI churn in the plan and the answer depends on whether multi-cell (spec v2) is actually coming. If it isn't, skip it.
2. **Loss-factor band** — fix at 1.2, or expose 1.15–1.25 per cell? Affects step 2's UI surface.
3. **Archetype matrix** — auto-populate from generated variants, or hand-curate? The blueprint's `GAP` state implies curation, which implies an owner.
4. **Does the first real user have existing CAD/DXF?** Open since the spike's §10.6. If yes, DXF import moves from "v2 someday" to near-term, because brownfield is where the volume is.
5. **Is the spike repo archived or kept running?** Recommend archiving with a README pointing here, once steps 1–7 land. Two live prototypes is how ideas get implemented twice and diverge.
