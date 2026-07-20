# FlowPlan — Concept Generation ("TestFit for manufacturing cells")

Design notes for the generate-then-edit loop: how a planner goes from a list of
process steps to a ranked set of costed manufacturing concepts in seconds.

Companion to `docs/lifecycle-cases-implementation.md` (this implements much of
case 2 and the setup half of case 1).

---

## 1. What we borrowed, and what we deliberately did not

TestFit's generative site planner was the reference. The research finding that
shaped this work: **TestFit is not machine learning.** It is a hand-written
deterministic geometric configurator in C, run under game-engine frame-rate
budgets, with "generative design" implemented as brute-force enumeration over a
bounded parameter space, then scored, sorted and filtered. Its CEO calls it a
*"building level constraint engine."* Across the wider market (Modelur, Giraffe,
Hypar, Arcol) there is almost no real optimization either — the dominant pattern
is fast feedback on a human-authored design.

So we copied the **product architecture**, not an algorithm:

| Borrowed | Rejected |
|---|---|
| Enumerate → score → rank → filter | Genetic / evolutionary search |
| One always-live headline number to design against | Pareto-front visualisation |
| Deal cards for candidate options | Optimization jargon in the UI |
| Hard = locked, soft = ranged parameter | ML-generated layouts |
| Degrade loudly, never silently | Black-box "AI" framing |

**Where the analogy breaks.** TestFit's problem is *packing* — units are
interchangeable tiles and adjacency barely matters. Ours is the facility layout
problem, effectively a quadratic assignment problem, where the sequence and
material flow between stations dominates cost. We also have a dimension they
lack entirely: **time** (takt, cycle, balance). So candidate *scoring* runs
through the full existing engine rather than a cheap geometric proxy.

---

## 2. The manufacturing concept axis

`engine/concepts.ts` introduces `ConceptKind` — the *organisational* choice,
orthogonal to `CellForm`, which is only geometry.

| Concept | Volume band (/yr) | Automation | Cycle factor | Capex/step | Parallel? |
|---|---|---|---|---|---|
| Job shop | 0 – 15k | manual | 1.4× | 20k | yes |
| Manual bench | 0 – 30k | manual | 1.2× | 5k | yes |
| U-cell | 15k – 200k | semi | 1.0× | 45k | yes |
| Flow line | 100k – 800k | semi | 0.85× | 95k | yes |
| Transfer line | 500k+ | auto | 0.6× | 260k | **no** |

`cycleFactor` scales the planner's quoted *manual base* cycle time; `handlingShare`
seeds the P0 cycle decomposition, so generated cells arrive with a realistic
value-add ratio rather than an opaque scalar.

`conceptFit(kind, volume)` scores 100 inside the band and **tapers in log space**
to 0 one decade outside it. Near-misses are shown, not excluded — planners need
to see the crossover to understand *why* a concept lost.

---

## 3. The generator

`engine/generate.ts` — `generateCandidates(brief)`.

```
for each concept (5)
  for each of the concept's cell forms (1–3)
    build stations from the brief's steps, scaled by the concept
    lay them out on the form template
    inverse-solve parallel lanes for demand
    score with buildRating({restarts: 0}) + costAnalysis
```

11 candidates for the default sweep. Deliberately brute force: the space is
small and every solve is an ordinary engine call, so the same brief always
produces the same ranking. **No randomness anywhere.**

This mirrors the existing AI contract from `ai/verify.ts` — the generator only
*assembles models*; every number on a card comes from the engine. A planner can
audit any candidate by opening it as a normal cell.

`restarts: 0` is the frame-budget decision: a candidate is a starting point, and
the user runs the full optimizer on the winner.

**Layout safety:** the form template is solved against an *inset* grid
(`END_MARGIN = 5` columns each side) and then translated, so the process band can
never collide with the fixed incoming/shipping areas. This was a real bug caught
by a collision test over every candidate — worth keeping that test.

### Ranking and filtering

`rankCandidates(candidates, by)` sorts on one metric (cost/part, rating, capex,
throughput, operators, concept fit). Two rules:

- Candidates that **cannot meet demand always sort last**, whatever the metric —
  a cheap option that can't make the parts is not a cheap option.
- Ties break on `id`, so ordering is stable and reproducible.

`filterCandidates` applies post-hoc gates (max capex, max cost/part, max
operators, concept subset) — TestFit's separation of *search constraints* from
*result filters*.

### Crossover

`conceptCrossover(brief, volumes)` sweeps a volume range and reports the winner
at each point — the "concept A below 120k/yr, B above" answer an RFQ turns on.
Currently engine-side only; not yet charted in the UI.

---

## 4. The inverse solve

`engine/capacity.ts` — `sizeForDemand(model, target)`.

The rest of the engine runs forwards (layout → throughput). This runs backwards:
given parts/shift, set `parallelUnits` on every step so each clears demand.
Closed-form, no search, safe to call on every keystroke.

Borrowed from **Modelur's inverse parametrics** (edit GFA, geometry back-solves)
— but applied to the axis Modelur doesn't have. *"I need 200/shift, what cell do
I need?"* is the most differentiated interaction in the tool.

It degrades honestly rather than silently:

- steps with no cycle time **and** no capacity are reported as unsizable
- runaway lane counts are capped (default 12) with a note saying so
- input/output areas whose `capacityPerShift` caps the line are called out
- `feasible: false` whenever the sized line still misses the target

---

## 5. Setup — the part that decides whether it gets used

The old first-run choice was sample / blank / import. Building a real cell meant
adding stations one at a time, which is why new-process setup was slow.

`ProcessSetupWizard` adds a fourth, primary path: **paste your steps.**

`parseSteps` accepts what industrial engineers actually have — a column pasted
out of Excel:

```
Blank	25          tab
Form, 40           comma
Weld; 55           semicolon
Press 12.5s        space + unit suffix
Deburr             bare name → default 30s
```

Name, volume, shifts, shift hours, and which concepts to sweep. Then: ranked
deal cards, re-rankable live, and **Use** loads one as an ordinary editable cell.

Reachable afterwards via ⋯ → *New process from steps…*

---

## 6. The live spine

TestFit's real product is the unbroken chain from a dragged setback to yield on
cost, at frame rate. Yield on cost stops being computed at the end of a
feasibility study and becomes the number you design *against*.

`HeaderKpis` is our version, always visible: **grade · output/shift ·
cost/part · takt · value-add %**. Every edit — moving a station, adding a lane,
changing a cycle time — visibly moves cost per part.

The spine already existed (`buildRating`, `costAnalysis`); it was buried in a
tab. Surfacing it was a few lines and changes how the tool feels.

---

## 7. Known limitations

Stated plainly, in the spirit of the README's existing honesty section:

1. **Concept profiles are planning heuristics, not costed engineering data.**
   Capex bands, cycle factors and manning are indicative. They exist to rank
   concepts against each other, not to quote a price.
2. **One routing for all concepts.** Every candidate uses the same step sequence.
   Real concept selection sometimes changes the process itself — that needs the
   process capability library (case 1, P5).
3. **`restarts: 0`** — candidate layouts are template placements, not optimized
   ones. Run the optimizer on the winner.
4. **Product mix still doesn't vary the routing** (carried over from P1).
5. **Generated geometry is a quantified starting point, not a plan.** The same
   caveat every reviewer makes about TestFit applies here: the value is in the
   numbers, and the layout needs an engineer's judgement before it means
   anything.
6. **No crossover chart yet** — `conceptCrossover` exists but is not surfaced.

---

## 8. What to build next

- **Crossover chart** in Compare — the single most persuasive RFQ artifact, and
  the engine function already exists.
- **Locked/ranged constraint model.** Generalise `Station.fixed` into TestFit's
  per-parameter *locked vs. min/max range*, plus their provenance glyphs
  (`*` auto-set, `?` unavailable, `!` manually overridden) so the tool never
  silently claims a value was validated.
- **Plant intelligence** — import the building shell (column grid, floor load,
  utility drops, crane envelopes, egress) into `NoGoZone`s. This is the analogue
  of TestFit's zoning/GIS pull, and their documented weakness (small irregular
  parcels) is our normal case, which `fixed` stations already handle better.
- **DES surrogate.** Where genuine ML exists in this market it is always a
  surrogate replacing expensive simulation — Forma trained NNs on tens of
  thousands of CFD runs. Our equivalent expensive simulation is discrete-event
  simulation of the cell (queueing, variability, buffer sizing). That is where
  ML belongs here, not in drawing layouts.
