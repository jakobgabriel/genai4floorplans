# FlowPlan — functional gap analysis for the first product pitch

_Audience for the pitch: a **strong method / industrial engineer** whose job is
**lean layout planning and optimization** — line design, balancing to takt,
minimizing material travel, standardized work, and the business case behind a
line._

This is a product (not visual) audit: what that engineer expects the tool to do,
what FlowPlan already does, and the gaps that must close before the pitch lands.

---

## What FlowPlan already does well (the credible core)

- **Line balancing** — work elements → stations via SALBP-1, sized to takt, with
  parallel lanes; a **vertical Yamazumi** against takt with value-add/waste
  decomposition.
- **Concept generation & costing** — concept × form sweep, fully-loaded
  cost/part (LDC/MDC split), capex/payback, ranked candidates + volume crossover.
- **Precedence & freedom** — a real DAG with free/swappable/exclusive/compulsory
  classification — the balancing slack most tools hide.
- **Data model** — WorkElement (capability, classification, attended fraction,
  ergo, scrap, data-quality), multi-year Demand + shift model + OEE, variant
  modes, no-go zones / aisles / fixed stations.
- **Cost / capacity / yield / automation-ROI** analysis; **scenario compare**;
  DB-backed persistence; JSON/CSV/PNG/report export.

That core is genuinely strong. The gaps below are what a method engineer will
*probe for* in the first ten minutes.

---

## Gaps, prioritized

Severity: **P0** = the pitch is weak without it · **P1** = expected, asked-for in
demo · **P2** = differentiator / later.

### P0 · Material flow & distance analytics (the heart of layout optimization)

Layout optimization *is* minimizing material travel. The engine computes flow
cost and travel effort, but the app never **shows distance** as a first-class
analytic: no total transport distance, no from-to intensity, no spaghetti.

- **Expect:** total travel distance/shift; a from-to intensity matrix or
  ranked "heaviest flows"; a spaghetti overlay on the canvas; distance in metres
  (via `cellAreaM2`).
- **Have:** `flowCost`, `travel`, `pareto` (top flows by cost) computed;
  flows drawn on the canvas; no distance/intensity view.
- **Close:** a **Material-flow card** in the Analysis dashboard — total travel,
  transport intensity, top flows by distance×volume; a canvas **spaghetti
  overlay**. _(Quick win — implemented now, see below.)_

### P0 · One-click "Optimize layout" with before/after

An optimizer exists (placement proposal / rating restarts) but is not exposed as
a confident **"Optimize this layout → here's the % travel saved"** action with a
visible before/after. Method engineers expect CRAFT-style pairwise-exchange
optimization they can run and trust.

- **Close:** surface an **Optimize** action (run the placement optimizer),
  show before/after flow-cost + travel with a % delta, and a one-click accept.

### P1 · Operator balancing & standardized work

The Yamazumi is **per station**. Lean balancing is about **operators**: operator
loading vs takt, number of operators, chaku-chaku / walk loops, and a
**Standardized Work Combination Sheet** (manual/auto/walk time per operator).

- **Have:** `attendedFraction`, operators per station, walk in the cycle split.
- **Gap:** an operator-loading Yamazumi and a standardized-work combination sheet.

### P1 · Systematic Layout Planning (SLP) inputs

Muther SLP is the method engineer's shared language: an **activity-relationship
chart (REL)** and a **from-to matrix** feeding placement. FlowPlan infers
adjacency from flows only.

- **Gap:** REL-chart input (A/E/I/O/U/X closeness) + from-to matrix; feed both
  into the placement objective.

### P2 · Actual-vs-plan (measured data)

Use-case 4 ("improve a running cell") is explicitly *partial* — the tool can't
record measured cycle times / downtime / scrap and compare plan vs actual. Time
studies (MTM/UAS/stopwatch) import belongs here too.

- **Gap:** a measured-data store + plan-vs-actual variance + time-study import.

### P2 · Value-stream & flow-time metrics

VA ratio exists; **lead time, WIP, and a VA/NVA time ladder** (VSM-style) do not.
Buffer/Kanban sizing and EPEI/changeover (SMED) analysis are also absent.

### P2 · Real dimensions, ergonomics, reporting polish

- **Dimensions:** work in metres end-to-end (machine footprints, aisle widths,
  reach envelopes) — today mostly grid cells.
- **Ergonomics:** `ergoRisk` is coarse (low/med/high); an EAWS/NIOSH-lite screen
  would be credible.
- **Reporting:** an **A3 / layout drawing / standardized-work** export pack for
  stakeholders (JSON/CSV/PNG/report exist, but not the IE deliverables).

---

## Recommended sequence for the pitch

1. **P0 Material-flow & distance analytics** — closes the biggest credibility gap
   (a layout tool that doesn't surface travel isn't a layout tool). _Started._
2. **P0 Optimize-layout action** with before/after % — the "wow" of the demo.
3. **P1 Operator-balance Yamazumi + standardized work** — speaks the lean dialect.
4. **P1 SLP REL/from-to inputs** — speaks the layout-planning dialect.
5. **P2** actual-vs-plan, VSM metrics, metric dimensions, ergo, IE reporting.

Everything in P0/P1 is buildable on the **existing engine outputs** (flow cost,
travel, pareto, cycle split, attended fraction) — no new solver required, which
is what makes them the right first-pitch scope.

---

## Closed in this iteration

- **Material-flow & distance** — a Carbon dashboard card: total travel/shift,
  transport intensity, and the heaviest flows by distance×volume, from the
  engine's existing flow/travel outputs. (See the Analysis dashboard.)
