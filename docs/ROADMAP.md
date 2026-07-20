# FlowPlan — Long-Term Feature Roadmap

**Repo:** `jakobgabriel/genai4floorplans` · **Companion to:** `HANDOVER.md`
**Version:** 1.0 · **Date:** 2026-07-20
**Owner:** Jakob Gabriel

---

## 0. How to use this document

`HANDOVER.md` is the *execution order* for the next few months. **This is the idea ledger** — every valid idea from all five sources, placed on a horizon, with its provenance and its open questions. Nothing is silently dropped; things that are cut say so and say why.

**Maintenance rule:** when an idea is implemented, move it to §10 Shipped with the commit or PR. When an idea is rejected, move it to §9 Graveyard **with the reason**. Never delete a row. A roadmap that only contains the future loses the argument for why the present looks the way it does.

**Provenance keys** used throughout:

| Key | Source |
|---|---|
| `FP` | FlowPlan spec v1.0 (`docs/flowplanspec.md`) + repo README |
| `LCG` | Lean-Cell-Generator spike, `SPEC.md` v0.2–v0.9.2 |
| `BP` | Line Cell Blueprint 0.1 (IE standard PDF) |
| `LP` | Line Planner demonstrator spec v2.0 |
| `NEW` | emerged from reconciliation, not in any source |

---

## 1. Product thesis

> Rate a manufacturing cell honestly, explore variants in minutes, and produce a concept that survives review — with classical auditable math, never a black box.

Three commitments that outrank any feature in this document:

1. **The engine is deterministic and framework-free.** Same code scores client and server. Golden fixtures lock the numbers. `FP`
2. **Every number carries its confidence.** Estimated renders as a range, never a point. `BP` `LP`
3. **The solver proposes; the user decides.** No silent overwrite of a deliberate placement, ever. `LP`

If a feature below conflicts with one of these, the commitment wins and the feature changes.

---

## 2. Horizons

| Horizon | Theme | Question it answers |
|---|---|---|
| **H1 — Credibility** | the numbers become defensible | *Would an industrial engineer sign this?* |
| **H2 — Exploration** | one layout becomes many | *What are my options, ranked?* |
| **H3 — Multi-product** | one cell, several products | *Does the mix still work in every shift?* |
| **H4 — Adoption** | the tool enters the real process | *Can I quote from this, in 15 minutes?* |
| **H5 — Compliance & site** | one cell becomes a hall | *Does it pass ASR, and does it fit the building?* |
| **H6 — Platform** | one hall becomes many sites | *Can 15 plants run this and compare?* |
| **H7 — Intelligence** | the model learns and ingests | *Can it read my routing sheet and correct itself?* |

Horizons are **thematic, not calendrical**. H1 gates everything: features built on unmarked numbers inherit the false precision they were meant to fix.

---

## 3. H1 — Credibility

*The numbers become defensible.*

| # | Feature | Why | Src |
|---|---|---|---|
| 1.1 | **`dataQuality` on every time and cost field** — `measured \| experience \| estimated`, rendered always-visible; estimated shows as a hatched **range**, never a point; confidence propagates to the weakest input | *Uniform confidence across unevenly evidenced figures is expensive, because investment follows it.* FlowPlan today renders `€245/Stk` from estimated inputs — the exact false-precision failure both standards name | `BP` `LP` |
| 1.2 | **Loss factor replaces fitted penalties** — `stations ≈ (work content ÷ takt) × 1.15–1.25`, default 1.2, band shown | Carries walking, reaching, handling and balancing loss, none of which appears in a standard time. Stored as a constant *so it does not have to be measured, and so it does not get forgotten*. Replaces the spike's `min(0.7, walk/200)`, which saturated twice | `BP` |
| 1.3 | **Station count: calculated AND chosen** — `4.9` alongside `5 (planner's decision)` | The decimal says how much headroom remains for another variant. Never a silent `Math.ceil()` | `BP` |
| 1.4 | **`attendedFraction` per station** | Autonomously running rigs occupy the operator only for load/unload. The blueprint's own example turns a 143 s bottleneck into ~68 s purely by recognising this. **Without it, balancing is wrong for every semi-automated cell** | `BP` `LP` |
| 1.5 | **Floor space split: cell vs material supply** | *The cell area gets planned, the area for bins and replenishment does not. Rule of thumb: another 30–40 %.* One combined number understates by a third | `BP` |
| 1.6 | **Freedom-finding pass on the flow graph** — classify each edge `free \| swappable \| exclusive \| compulsory`, render as a table under Balance | *An edge is drawn only where it is physically compulsory — not because it has always been done that way.* In the worked example a single `free` operation fills the under-loaded station. That is the balancing gain the tool exists to find | `BP` |
| 1.7 | **Open points, generated** — auto-list every estimated input blocking release | *"Time for operation 130 is estimated, not measured — secure before investment release."* Output form of 1.1; don't make the user type it | `BP` |
| 1.8 | **`?` popovers extended to every new heuristic** | FlowPlan already surfaces honest limitations. Loss-factor band, TCO, congestion proxy and automation potential each need one | `FP` |

**Exit criterion:** no number in the UI is a point value derived from an estimated input.

---

## 4. H2 — Exploration

*One layout becomes many.*

| # | Feature | Why | Src |
|---|---|---|---|
| 2.1 | **Optimizer emits N ranked candidates**, not one improved layout | Wrap FlowPlan's greedy pairwise swapper to emit scored candidates ranked by the existing seven-KPI composite. Keep the engine; borrow the presentation | `LCG` `FP` |
| 2.2 | **Featured quick-preview cards** — Balanced · Smallest footprint · Highest throughput · Lowest TCO | Four pre-selected jump-to-variant entry points above the detail view | `LCG` |
| 2.3 | **Optimize-for pills** — five weighting presets that reorder the ranked list | Acceptance test from the spike: all five must produce *different* #1 rankings on the same input, or the weights are doing nothing | `LCG` |
| 2.4 | **Cell Data Sheet** — identical form for every variant | Identity of form is what makes two variants comparable and lets a planner **sort by whichever constraint actually binds** — sometimes floor space, sometimes headcount, sometimes changeover | `BP` |
| 2.5 | **`Behaviour at +20 % volume`** — rendered as a sentence: *"Takt drops to 110.0 s → stations 5 and 2 exceed takt. A second test nest becomes mandatory, station 2 must be split → 6 stations"* | Volume is the assumption that breaks most often. No codebase has this today | `BP` |
| 2.6 | **Archetype code** — `MA-U-05-F-H` (flow shape · stations · sequence F/V · labour class H/N) | Tells a planner whether a variant fits *before opening it*. Maps onto FlowPlan's existing I/U/L/S templates | `BP` |
| 2.7 | **Archetype matrix view** — takt band × variant count, **including declared empty cells**: `not populated` (uneconomic, with reason) vs `GAP` (occurs, not worked out — an open action, warn colour) | Empty fields being *declared* is the point. A planner landing on "not populated" knows they're building new ground rather than anchoring to the nearest unsuitable pattern | `BP` |
| 2.8 | **Proposals as first-class objects** — ghost overlay, plain-language rationale, accepted per-item or wholesale; editing user state marks proposals `stale`, never deletes silently | One silent overwrite of a deliberate placement and the tool is abandoned for Excel permanently. Correctness, not UX | `LP` |
| 2.9 | **NOK + RWK as flow kinds** with a geometric separation constraint | *The reject path leaves in a different direction from the good-part path, so mix-up is spatially impossible, not merely prohibited.* Testable design rather than a work instruction | `BP` |
| 2.10 | **Guardrail contract validations** — one exit one direction FIFO; buffer cap (*full buffer stops the cell: a signal, not a fault*); good only after test; rework re-tests without exception; andon after 3 consecutive rejects | The cell's interface contract at its edges — what makes cells composable | `BP` |
| 2.11 | **U-shape weight bonus in composite scoring** | Literature-confirmed: 2–3× higher balancing flexibility (tasks balanceable across both arms), operator overview from inside the U, entry/exit co-location kills return-walk waste. Justifies a bonus even when raw walking distance ties with linear | `LCG` |
| 2.12 | **Spaghetti-Validation** — rename the walk heatmap, add flow-arrow overlay | The Spaghetti Diagram is the canonical shop-floor validation visual. Using the domain's own vocabulary signals lean-credibility to factory planners. Cheap, high perceived value | `LCG` |
| 2.13 | **TCO model** per variant + operator/AGV/cobot counts | FlowPlan has no cost model at all. Must respect 1.1 — a point-valued TCO from estimated inputs is the failure both standards name | `LCG` |

**Exit criterion:** a planner can produce three genuinely different, ranked, comparable concepts for one cell in a sitting.

---

## 5. H3 — Multi-product

*One cell, several products.*

| # | Feature | Why | Src |
|---|---|---|---|
| 3.1 | **Multi-BOM per cell** — several products routed through one cell, per-BOM line→port mapping | FlowPlan v1 is explicitly single-product. This is the largest capability gap | `LCG` |
| 3.2 | **Coverage cascade LEDs** — R1–R6 rules; 🟢 auto-included, 🟡 opt-in with warning, 🔴 blocked until fixed. Solver shows `running for X 🟢 + Y opt-in 🟡 · Z BOMs` | Makes partial models usable instead of blocking. Prevents the silent half-modelled analysis | `LCG` |
| 3.3 | **Weighted work content** — variant-dependent operations enter proportionally to volume share | *Balancing is done against the weighted mix, not against the main variant — otherwise the cell tips over on every shift in mix.* **If the balancer optimises the dominant product, that is a correctness bug** | `BP` |
| 3.4 | **Variant exclusions** — domain override marking product variants mutually exclusive per station | `exclusive` operations can share a station since they never co-occur — a real balancing gain | `LCG` `BP` |
| 3.5 | **Changeover between variants** as a first-class figure | The blueprint's data sheet reports `0 s — all three variants run in mix without changeover` as a headline property. Absence of changeover is a selling point that must be visible | `BP` |
| 3.6 | **Grid-cell footprint + typed ports** (optional, migrated) — `cells` + indexed `in:n`/`out:n` alongside `x,y,w,h` | Makes material paths spatially real rather than centreline abstractions. Prerequisite for 2.9's geometric separation | `LCG` |
| 3.7 | **Parallel / branching topologies** | Already on FlowPlan's own v1.2 roadmap. Balance currently treats the cell as a single sequential chain — a stated limitation | `FP` |
| 3.8 | **Multi-manning** — more than one operator per station | Operators-as-parallelism is a known simplification in FlowPlan's balance model | `FP` `LP` |

**Exit criterion:** a three-variant product family balances correctly against the weighted mix and the tool says what happens at the mix boundary.

---

## 6. H4 — Adoption

*The tool enters the real process.*

| # | Feature | Why | Src |
|---|---|---|---|
| 4.1 | **Quick-entry mode — six inputs, 15 minutes** — units/year + shift model · work content · variant count · sequence fixed or free · labour cost class · floor space + part weight class. Missing figures take stored defaults; **the standard never blocks** | *An IE unfamiliar with this product family arrives at an archetype and a defensible first pass in under 15 minutes, surviving review with at most two corrections.* The strongest adoption argument in any source — it's what makes a planner try it twice | `BP` |
| 4.2 | **4-tab shell** — Halle · Arbeitsplätze · Projekte · Varianten, separating durable assets from ephemeral demand; FlowPlan's panels become views inside Varianten | FlowPlan's seven screens are all views of *one cell*; that breaks once multi-product and multi-cell arrive. **Conditional — see §11 Q1** | `LCG` |
| 4.3 | **German operator-facing vocabulary** — Arbeitsplatzbibliothek, not "Archetypes Library" | Developer vocabulary leaking into operator UI was a real defect the spike fixed. Technical terms stay untranslated: takt, Yamazumi, OEE, DAG, TCO | `LCG` |
| 4.4 | **Review pack export** — data sheet + Yamazumi + layout + open points as one PDF | The blueprint *is* a rendered artifact. The tool should emit the same thing the standard's format defines | `BP` `NEW` |
| 4.5 | **Correction path** — findings from the shop floor route back and correct the source | *A standard without a return path is demonstrably wrong after two years and is still followed.* Applies equally to the tool's defaults and catalogs | `BP` |

**Exit criterion:** a planner goes from six inputs to a review-ready concept artifact without leaving the tool.

---

## 7. H5 — Compliance & site

*One cell becomes a hall.*

| # | Feature | Why | Src |
|---|---|---|---|
| 5.1 | **Typed corridor cells** — `hauptverkehrsweg` · `fußgängerweg` · `fahrweg` · `agv-lane` · `brandweg` · `esd-zone` · `wall` · `column` | Turns aisles from a congestion *proxy* into modelled geometry. FlowPlan's centreline congestion is a stated limitation | `LCG` |
| 5.2 | **ASR A1.8 rule pack (DACH)** — pedestrian one-way 875 mm · meeting 1250 mm · main corridor 2000–3000 mm · Brandweg 1200 mm · safety margin 500 mm/side · mixed ped+forklift → **warn, don't reject** | Quantitative, authoritative (BAuA), and directly encodable. The qualitative rule stays a warning because the mitigation is structural, not layout | `LCG` |
| 5.3 | **Per-jurisdiction rule packs** — OSHA for US/INT (3 ft buffer, aisle = vehicle + load + buffer, floor striping), plugin architecture | Compliance is per-market and complex; a plugin boundary keeps it from contaminating the engine | `LCG` |
| 5.4 | **Hall boundary authoring** — paint walls, columns, corridor spine, Brandweg loop, then solve into the residual | The TestFit affordance: constrain first, generate second. Feasibility as an early filter, not a late check | `LCG` `LP` |
| 5.5 | **DXF import** — outline auto-rasterized to grid | Brownfield is where the volume is. **Priority depends entirely on §8 Q5** | `LCG` |
| 5.6 | **DXF / IFC export** — handover to CAD | VDI 5200 Phase 6 realization planning. The tool ends at Phase 5; the export is the handoff | `LCG` |
| 5.7 | **Fixed obstacles / sacred cows** — existing machines with move cost and downtime; churn metric on brownfield variants | Brownfield re-layout means minimum-churn, not optimum. *How many machines must physically move, at what cost and downtime* | `LCG` `LP` |
| 5.8 | **VDI 5200 phase positioning** — declare the tool operates in the Phase 4→5 transition | Positions the tool inside a standard planners already use, rather than asking them to adopt a new frame | `LCG` |
| 5.9 | **Multi-cell / multi-line**, site-level rollups | Already on FlowPlan's own v2 roadmap | `FP` |

**Exit criterion:** a generated layout passes an ASR A1.8 check and a factory planner recognises the corridor model as the one they actually use.

---

## 8. H6–H7 — Platform & intelligence

*Longer horizon. Listed so they aren't reinvented; not costed.*

### H6 — Platform

| # | Feature | Src |
|---|---|---|
| 6.1 | **Per-site GitOps rollout** — ArgoCD ApplicationSet, Manufacturing App Store pattern; portable JSON models | `FP` |
| 6.2 | **Postgres model store, multi-tenant teams** — partly built already in `@flowplan/server` | `FP` |
| 6.3 | **Pattern catalog with normalized metrics** — `units/yr/m²`, `space_efficiency_pct`, each shown with **percentile against comparable patterns** (`p78 of 41`). A raw number teaches nothing; a ranked one teaches immediately | `LP` |
| 6.4 | **Renormalization on use** — a pattern's metrics recompute against the target context, showing stored → renormalized → delta (`1 480 → 1 210, −18 %, your takt is 12 % longer`). **Never show a stored metric as if it applied to the user's conditions** | `LP` |
| 6.5 | **Auto-extraction of patterns from released cells** — every released cell becomes a `candidate` pattern automatically; curation is a **review queue, not an authoring task** | `LP` |
| 6.6 | **Promotion ladder + automatic demotion** — `draft → candidate → validated → deprecated`; a pattern whose actuals contradict its claims drops out of `validated` automatically | `LP` |
| 6.7 | **Pattern deduplication** — cluster by resource-set similarity and metric proximity; without it the catalog is unusable at ~200 entries | `LP` |
| 6.8 | **`capabilities_absent`** on every pattern — the "minus police station" field. Honest declaration of what a pattern does *not* cover is what makes it trustworthy | `LP` |
| 6.9 | **Composition — tiling and chaining** with typed interfaces; transfer heights must match (900 mm meeting 1100 mm is an error, not a warning). Composite metrics **do not sum** — shared aisles improve area efficiency superlinearly | `LP` |
| 6.10 | **Immutable versioned snapshots** — a released concept reconstructs exactly, including catalog state and rates effective at release | `LP` |
| 6.11 | **Capability ≠ Resource (N:M)** — a cell needs capabilities, resources provide them. **Never hardcode a 1:1 process→workcenter link** — the N:M relation is what generates alternatives; 1:1 makes the tool a recorder instead of a generator | `LP` |

### H7 — Intelligence

| # | Feature | Src |
|---|---|---|
| 7.1 | **LLM ingestion** — routing sheet or photo → model. The routing *is the cheapest available input*: it already combines sequence, times and work centres, and exists before anyone thinks about the cell | `FP` `BP` |
| 7.2 | **LLM narration** — explain why variant B beats A in review language, and name the tradeoff (*"B shortens flow but puts QA next to a noisy station — ergonomic risk"*) | `FP` `LP` |
| 7.3 | **Actuals feedback loop** — measured cycle times correct the catalog; deltas beyond threshold flag for re-curation. **The decisive advantage over both the spreadsheet and any wiki: you have ground truth to correct against** | `LP` |
| 7.4 | **Store distributions, not averages** — p50/p95/p99 with sample count. *The p95 tail is where the losses are; a mean hides the problem you are hunting* | `LP` |
| 7.5 | **MTM-Logistics integration** — export route lengths → planned times return → closes layout → time → cost | `LCG` |
| 7.6 | **Exact solver on explicit request** — CP-SAT for SALBP-1/2 with a 30–60 s cancellable budget, alongside the fast heuristic. Two-tier: same interface, different budget | `LP` |
| 7.7 | **Discrete-event simulation in the loop** — replaces static throughput for high-variability lines. Explicitly out of scope for every source so far; the honest ceiling of the current model | `FP` `LCG` |
| 7.8 | **Scale tiering** — declared strategy per tier (S/M/L by parts × stations), tier always displayed, **no silent downgrade** to a heuristic | `LP` |

---

## 9. Graveyard — considered and cut

Kept so they aren't rediscovered as novel.

| Idea | Why cut | Src |
|---|---|---|
| **Rework the LCG spike in place** | FlowPlan has the deterministic engine, golden fixtures, migration and deployment. Porting spike *ideas* into FlowPlan is a week; the reverse is a rewrite | reconciliation |
| **Merge Line Planner as a separate app** | Same problem space, two codebases. Two live prototypes is how one idea gets built twice and diverges. Its two load-bearing mechanisms (confidence, proposals) are absorbed as 1.1 and 2.8 | reconciliation |
| **Explicit DAG/process-authoring tab** | The spike removed it (`v0.5 §14.3`) on the grounds the DAG emerges from BOM mapping. Correct *provided* 1.6's freedom-finding runs — otherwise a BOM-derived DAG silently inherits BOM ordering, the same failure in a different costume | `LCG` `BP` |
| **`walkPenalty = min(0.7, walk/200)`** | A fitted curve with no physical meaning; saturated twice under changing distance metrics (BUG-4). Replaced by the loss factor (1.2) | `LCG` |
| **MutationObserver-based reactivity** | Caused an infinite loop (BUG-3) in the spike. FlowPlan has a proper store; not a pattern to carry over | `LCG` |
| **Brute-force placement search** | 50 stations × positions × rotations ≈ 10²⁰. TestFit itself doesn't brute-force — placement heuristic plus local search. Keep FlowPlan's greedy swapper, wrap for N candidates | `LCG` |
| **Export/integration to the incumbent quotation tool** | Cut as scope. It ties the roadmap to one org's internal workbook and its 1:1 process→workcenter model, which is the exact modelling error 6.11 exists to avoid | reconciliation |
| **Robot-cell internal layout** (reach envelopes, dead zones) | Covered by Visual Components / Tecnomatix. Wrong domain | `LCG` |
| **Kanban / supermarket loop modelling** | Logistics engineering. Plugin at best, and not soon | `LCG` |
| **Greenfield building / structural design** | Out of domain entirely | `LCG` |
| **Machinery-directive safety assessment** | Separate regulated process; including it turns the tool into something that must be certified | `BP` |
| **ROI / investment calculation inside the concept step** | *These follow AFTER the concept decision. Include them here and the blueprint becomes a planning tool — and therefore unusable.* TCO (2.13) is deliberately lighter than full ROI | `BP` |

---

## 10. Shipped

*Move rows here with commit/PR as they land. Everything in §2 of `HANDOVER.md` predates this roadmap and is listed there as existing capability.*

Landed on branch `claude/feature-plan-design-overhaul-304leo` (design overhaul + credibility milestones):

| Feature | Horizon | Landed | Ref |
|---|---|---|---|
| 1.1 `dataQuality` on stations + confidence rendered as range/hatch | H1 | branch | `model/types.ts` (schema v9), `components/confidence.tsx` |
| 1.2 Loss factor replaces implicit derating | H1 | branch | `DEFAULT_LOSS_FACTOR`, `engine/workload.ts`, `WorkloadPanel` |
| 1.3 Station count calculated (decimal) vs chosen | H1 | branch | `analyseWorkload.stationsCalculated` |
| 1.5 Floor space split cell vs material supply | H1 | branch | `engine/cost.ts` `FloorSpace`, `CostPanel` |
| 1.6 Freedom-finding pass on the precedence DAG | H1 | branch | `engine/freedom.ts`, Balance panel table |
| 1.7 Open points, generated from estimated flags | H1 | branch | `engine/openpoints.ts`, Rating panel |
| 1.8 `?` popovers on every new heuristic | H1 | branch | loss factor, floor space, freedom, open points |
| — Node palette (drag station types onto canvas) | Adoption/design | branch | `components/PaletteBar.tsx` |
| — Drag-to-wire flows from OUT ports | design | branch | `LayoutCanvas` `onWire` |
| — Calm inspector (progressive disclosure) | design | branch | `ConfigurePanel` Essentials/Advanced |
| 2.12-ish Composable canvas overlays (Confidence, Congestion) | H2/design | branch | `LayoutCanvas` overlay + §37 |
| — CI (typecheck + test) + clean typecheck | infra | branch | `.github/workflows/ci.yml` |
| — Right rail = inputs only; analysis in a dedicated view | design | branch | `App` INPUT_TABS/ANALYSIS_TABS |
| — Workspace & folders made a global page | design | branch | `pages/WorkspacePage`, `/workspace` |
| — Process library (standard building blocks, N:M capability) | H4/H6 | branch | `model/catalog.ts`, `pages/LibraryPage`, `store/library.ts` |
| 2.4 Cell Data Sheet (identical-form artifact) | H2 | branch | `engine/datasheet.ts`, `DataSheetPanel` |
| 2.5 Behaviour at +20 % volume | H2 | branch | `engine/sensitivity.ts` |
| 2.6 Archetype code MA-shape-NN-seq-labour | H2 | branch | `engine/archetype.ts` |
| 2.1/2.2 Ranked variants + featured cards | H2 | branch | `planner/ConceptTable` FeaturedCards |
| — Data models absorbed from the two IE source docs | H1-H4 | branch | `docs/concept-model.md` |

---

## 11. Open strategic questions

These change the shape of the roadmap, not just the order. Answer them deliberately.

| # | Question | What it decides |
|---|---|---|
| Q1 | **Does the 4-tab refactor (4.2) happen at all?** | Largest UI churn in the plan. Only worth it if multi-cell (5.9) is genuinely coming. If FlowPlan stays single-cell, its seven screens are fine and this is pure cost |
| Q2 | **Loss-factor band — fixed 1.2, or exposed 1.15–1.25 per cell?** | Affects 1.2's UI surface and whether it becomes a tuning knob people abuse |
| Q3 | **Archetype matrix (2.7) — auto-populated from generated variants, or hand-curated?** | The `GAP` state implies curation, which implies a named owner. Auto-population makes it a mirror; curation makes it a standard |
| Q4 | **Does the first real user have existing CAD/DXF?** | Open since the spike's §10.6. If yes, DXF import (5.5) jumps from H5 to near-term, because brownfield is where the volume is |
| Q5 | **Is the LCG spike repo archived?** | Recommend archiving with a README pointing here once H1 lands. Two live prototypes diverge |
| Q6 | **Target market — DACH Mittelstand greenfield, or automotive Tier-1 brownfield?** | Drives 5.7 (fixed obstacles) priority and the whole H5 ordering. Open since the spike's §10.1 |
| Q7 | **Single-tenant per site, or multi-tenant SaaS?** | 6.1 vs 6.2 are different products. The server package already leans multi-tenant; the GitOps story leans per-site |
| Q8 | **Competitive window.** Siemens × NVIDIA is runtime-focused today; probability they absorb design-time in 12–24 months was assessed as high. Does that argue for H4 adoption speed over H5/H6 depth? | Sequencing of everything after H3 |

---

## 12. Invariants

True across all horizons. A feature that breaks one of these is wrong, however useful it looks.

- **Engine framework-free and deterministic.** Same code client and server. Never branch scoring on environment.
- **Golden fixtures are the contract.** Changing a number is fine; changing it silently is not. Re-baseline in the same commit, reason in the message.
- **Confidence is assigned at model-entry, never retrofitted at render.**
- **Never round a station count silently.**
- **The solver proposes; user state is written only by the user.**
- **Capabilities and resources stay N:M.** Never collapse process→workcenter to 1:1 in the model.
- **Schema changes go through versioning + migration.** Old JSON keeps loading — already tested, don't break it.
- **`StorageProvider` contract test passes for both providers.** Offline and cloud behave identically.
- **Every heuristic gets a `?` popover saying what it isn't.** Loss factor, TCO, congestion proxy, automation potential, optimizer locality.
- **No input may require a measurement campaign.** Missing figures take stored defaults; the tool never blocks.
