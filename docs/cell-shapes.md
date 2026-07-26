# Cell shapes (flow-path topologies)

A **cell form** is the geometric flow path a cell's stations follow — where
material enters, the route through the stations, and where it leaves. FlowPlan
models each form in `engine/topology.ts` as `{ slots, entry, exit, legs,
entryExitAdjacent }`, so the same definition drives the one-click "arrange as…"
buttons, concept generation, and the Optimize search (which picks the
lowest-flow-cost form for the actual station graph).

## What's possible — the established taxonomy

Facilities-planning and lean cell-design literature converge on a small set of
**single-flow-path** patterns. FlowPlan implements all six:

| Form | Shape | Legs | Entry/exit | When it wins |
|------|-------|------|-----------|--------------|
| **I** | straight line | 1 | opposite ends | shortest path for a purely linear process; conveyor/transfer lines |
| **L** | one right-angle bend | 2 | two sides | fits a corner / around an obstruction; short processes |
| **U** | U-cell | 2 | **adjacent** (same end) | canonical lean cell — one operator loads *and* unloads without walking the loop; flexible manning |
| **S** | serpentine | 3 (rows) | opposite ends | a long process folded into rows to fit a wide-but-shallow bay |
| **W** | double-U / multi-fold | 4 (legs) | both at the front | a *long* process packed compact with load, unload and every station reachable from one side |
| **O** | closed loop / racetrack | 4 (ring) | **same open mouth** | carriers/pallets/AGVs that circulate and must return to start; kitting loops |

Selection is by flow cost, not by name: `bestLayout()` lays the actual station
graph into every form and keeps the cheapest, so a form is only ever chosen when
its path genuinely shortens material travel for *this* process. On a purely
linear flow the I-line stays optimal; the folded/looped forms win when the graph
has return legs, revisits, or must fit a constrained footprint.

## What is deliberately *not* a "form"

Multi-branch layouts — **T / comb / spine / fishbone** (a central aisle with
feeder cells hanging off it) and **parallel lines** — are not a single flow path;
they are *compositions of cells*. FlowPlan expresses those with **grouped
subflows** (reusable sub-cells) placed alongside each other, not as a topology
form. **Fixed-position** layouts (the product stays put, resources come to it —
aircraft, ships) are a different paradigm outside the cell-flow model entirely.

## Extending

Add a form by (1) widening the `CellForm` union in `engine/topology.ts`, (2)
adding its branch in `cellTopology` (return `slots` + `entry`/`exit` + `legs`),
and (3) listing it in `bestLayout`'s `ALL_FORMS`, the relevant `CONCEPTS[*].forms`,
and the `FORMS` palette in `LibrarySidebar`. `applyForm` and the rating pick it
up automatically. Keep the invariant: a form only ever **repositions** existing
stations (same ids, same count), so applying one stays a non-destructive,
undoable edit.
