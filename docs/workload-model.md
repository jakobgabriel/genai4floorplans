# Workload model — mixed-model & rich work elements (schema v8)

Implements [`line-planner-spec.md`](line-planner-spec.md) §11 (Workload /
WorkElement; formerly cited as Cell Design §3.2). Answers two questions directly: *how does one
line carry 40 products?* and *what should a process step carry besides seconds?*

---

## 1. Forty products is not forty products

The spec's key move is that **product data is out of scope**. The input is an
abstract *workload* — what must be done — never what is being made.

So a line running 40 part numbers is not modelled as 40 anything. It is modelled
as a set of **variant modes**: abstract shares of output that differ in **work
content**. Forty part numbers needing the same work are **one mode**. A mode
exists only where the work genuinely differs.

```ts
interface VariantMode {
  id: string;
  name: string;
  share: number;                              // 0–1, renormalised if they don't sum
  elementOverrides: Record<string, number>;   // elementId → time multiplier
}
```

`elementOverrides` is where variation lives: `{ weld: 2 }` doubles that element's
time in that mode; `{ test: 0 }` skips it entirely. So a 40-product line usually
collapses to three or four modes — "base", "with heat-shield", "short variant" —
and stays plannable.

### The trap this exists to catch

Balancing on the mix-weighted average alone is the classic mixed-model mistake. A
station can sit comfortably under takt *on average* and still be infeasible for
the heaviest variant, which then starves the line every time that variant runs.

So `analyseWorkload` computes **everything twice** and reports the gap:

| Figure | Weighted | Worst-case |
|---|---|---|
| Element time | `weightedSec` | `maxSec` + `worstModeId` |
| Total content | `weightedTotalSec` | `worstTotalSec` |
| Minimum stations | `minStationsWeighted` | `minStationsWorst` |

Plus `mixSpreadPct` (how much heavier the worst mode is) and an explicit warning
once it exceeds 15%:

> *Heavy carries 36% more work than the mix average — balance to the worst mode,
> not the average, or that variant will starve the line.*

`overTaktElements` flags any element whose worst-case time alone exceeds takt: it
cannot fit one station at any balance and must be split, automated or paralleled.

---

## 2. What a process step now carries

Previously a step was a name and a number of seconds. A `WorkElement` carries:

```ts
interface WorkElement {
  id: string;
  name: string;
  capabilityId?: string;          // what capability it needs — not which machine
  predecessors: string[];         // precedence is a DAG, not a linear routing
  time: {
    seconds: number;
    method: "MTM" | "UAS" | "estimate" | "benchmarked" | "measured";
    confidence: "low" | "med" | "high";
    sourceRef?: string;           // time study id, benchmark reference
  };
  classification: "VA" | "NNVA" | "NVA";
  wasteClass?: "transport" | "motion" | "waiting" | "overprocessing"
             | "inventory" | "defects" | "overproduction";
  attendedFraction: number;       // 1.0 = operator bound for the full duration
  skillClass?: string;
  ergonomicLoad: "light" | "medium" | "heavy";
  mustBeSameStationAs?: string[];      // zoning constraints for the balancer
  mustNotBeSameStationAs?: string[];
  fixedStationId?: string;
}
```

Three of these change what the tool can compute:

- **`attendedFraction`** — separates operator time from machine time. Without it
  balancing is simply wrong for any semi-automated cell: a 90s unattended machine
  cycle does not occupy an operator for 90s. `attendedTotalSec` / `attendedPct`
  are what drive manning, and chaku-chaku loops become computable.
- **`time.method` + `confidence`** — an estimate and a measured time are not the
  same number. `weakestConfidence` propagates the weakest input to every derived
  figure, so a result built on one guess is labelled a guess (spec §9).
- **`predecessors` as a DAG** — `precedenceOrder` returns null on a cycle rather
  than looping, and parallel branches are expressible. A linear routing cannot
  represent real assembly.

`classification` + `wasteClass` supersede the P0 five-bucket `CycleBreakdown` with
the standard lean taxonomy (VA / NNVA / NVA + the seven wastes).

---

## 3. Where this sits relative to the existing model

**It is additive and inert.** `workElements` and `variantModes` are optional and
absent on every existing model, so `migrate` v7→v8 is a pure version bump and no
rating moves. The golden fixtures are untouched.

**But it overlaps with what came before, and that has to be resolved.** Right
now there are two representations of work:

| | Old | New |
|---|---|---|
| Unit of work | `Station.cycleTimeSec` / `Station.cycle` | `WorkElement` |
| Waste taxonomy | 5 buckets (VA/handling/walk/wait/setup) | VA / NNVA / NVA + 7 wastes |
| Mix | `Product` + `VolumeScenario.productMix` | `VariantMode` |
| Sequence | `Flow` graph between stations | `predecessors` DAG between elements |

**The spec says product data is out of scope, which puts the P1 `Product` /
`PartFeature` / `VolumeScenario` work on the wrong side of the boundary.**
`VariantMode` is the spec-aligned replacement: same mixed-model capability, no
product identity. `Product` should be deprecated rather than extended — I have
left it in place for now because removing it is a separate, breaking change that
deserves its own decision.

The direction of travel: **elements are the input, stations are the output.**
Today a planner types cycle times onto stations. In the spec's model they author
work elements and the balancer *produces* stations. That inverts `ConfigurePanel`
and is the main structural work still outstanding.

---

## 4. Status

Shipped: model (v8), `engine/workload.ts`, 24 tests.

**Not built yet: any UI.** There is no editor for work elements or variant modes,
so the capability is engine-only and unreachable from the app. That is the next
piece, and it is also the natural moment to invert the inspector.

Also outstanding from the spec: `Capability` / `Resource` catalog (§3.3–3.4),
`OperatingContext` (§3.7), CP-SAT balancer (§5.2), layout solver (§5.3), Pugh
scoring with sensitivity (§5.6), immutable versioned snapshots (§2.6).
