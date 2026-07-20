# Manufacturing-concept data model & analysis steps

Consolidates the two IE source documents into the FlowPlan model. The
**Line Cell Blueprint** gives the concept method; the **"Creation of
manufacturing concept" (PAUL)** standard gives the enterprise data model and
the analysis steps. We absorb the *data and analysis*, not the tool.

## Hard exclusions (do NOT build)
- The PAUL Excel-tool paradigm: RFQ approval macros, SharePoint sync, release
  notification mails, "export to analyze" sheets, Compliance-Quest workflow.
- **1:1 process→workcenter.** PAUL links processes to workcenters 1:1; the
  governing spec forbids it. Keep **N:M capability↔resource** (`Station.provides`)
  — the N:M relation is what generates alternatives.
- ROI/investment sign-off, machinery-directive safety, millimetre ergonomics,
  discrete-event simulation — all explicitly "after the concept decision".

## App structure (the northstar, Carbon-only)
1. **Workspace & folders are global**, not part of the flow editor. Today the
   Explorer tree sits inside the editor and clutters it. Move it to an app-level
   surface (Carbon UI Shell side nav / a Projects home). The editor shows only
   the cell being worked on.
2. **Right rail = inputs only.** Configuration of steps and connections: the
   Configure inspector, Flow/connections, Workload. No analysis in the rail.
3. **Analysis is a dedicated tab**, opened when wanted — never crowding the
   editor. It carries every derived figure (below).
4. **Process library** — a catalog of standard processes / building blocks that
   feed the palette.

## Core data model additions
| Concept | Source | Shape |
|---|---|---|
| Multi-year **Demand** | PAUL Demands | units/year over N years (7), shift model, flex volumes, peak year, currency, time-unit |
| **Setup / Labor / Machine** time triad per step | PAUL Process flow | extend the step time model beyond one `cycleTimeSec`; machine time is unattended (ties to `attendedFraction`) |
| **Scrap %** per process | PAUL + blueprint | already `Station.scrapRate` |
| **Tooling** | PAUL | price, qty, group, category per step |
| **LDC / MDC** cost split | PAUL Compare/Summary | labour-dependent vs machine-dependent cost per part |
| **FX / currency** | PAUL Controlling | currency + FX to a base; costs convertible |
| **Machine capacity** | PAUL Capa MA | machines needed/year = f(demand, scrap%, cycle, utilization, shift model); invest plan (price/transport/equipment/space/other), depreciation start year, additional building m² |
| **Head-count capacity** | PAUL Capa HC | operators needed/step/year |
| **Process catalog entry** | PAUL Catalog + blueprint building blocks | standard process: category (metal/rubber/plastic/assembly), std cycle times, robustness, provided capability, tariffs (setup/labor/machine), space, tooling cost, machine invest, process id |
| **Configurator (rules-as-data)** | PAUL Configurator | parametric estimate of cycle time / tooling from product parameters (parts, sensors, connection points, length) — effective-dated data, not code |
| **Archetype code + matrix** | Blueprint | `MA-U-05-F-H`; takt-band × variant-count matrix with declared empty cells |
| **Guardrails / four paths** | Blueprint | IN / OUT(FIFO) / NOK / RWK as flow kinds + spatial separation |

## Analysis steps (all live in the Analysis tab)
Blueprint chain, kept in order:
1. Routing → **precedence graph** (freedom-finding: free/swappable/exclusive/compulsory).
2. **Balancing** against takt — Yamazumi vs takt line, bottleneck, stations
   calculated (decimal) vs chosen, line-balance efficiency.
3. **Layout & guardrails** — U-shape, four separated material paths.
4. **Cell data sheet** — the identical-form artifact; sortable by binding constraint.
5. **Behaviour at +20 % volume** — the mandatory sentence.

PAUL analyses, added:
6. **Machine capacity / utilization** → machines per year + invest plan.
7. **Head-count capacity** → operators per year.
8. **Summary** — total invest/year, tooling, output pcs/week peak year, building
   space, floor space (cell vs material supply), LDC/MDC cost per part, FX to base.
9. **Maindriver (Pareto)** — processes with the biggest impact on the result.
10. **Compare** — two concepts side by side (already exists; extend with LDC/MDC).

## Invariants carried forward
Engine stays framework-free/deterministic; confidence at model-entry; never
round stations silently; N:M capabilities; schema via migration; both storage
providers pass; every heuristic gets a `?` popover; **Carbon design only — no
other component libraries.**
