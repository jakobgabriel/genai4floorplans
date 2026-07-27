# Flow editor — Node-RED comparison

A short reference note. We looked at how Node-RED (a mature open-source flow
editor) builds its canvas, to decide what to borrow and to be honest about where
FlowPlan is a different tool rather than a worse one.

## How Node-RED is built

- **Palette + workspace + wiring.** A left palette lists node types; you drag one
  onto the workspace and wire ports together. The graph is the artefact.
- **Effectively unbounded workspace.** The workspace extends well past the
  viewport — nodes can be dragged "off to the edges" and the scroll region grows
  to follow. There is no fixed page the diagram must fit inside.
- **Footer controls.** Zoom in / out / reset and a view navigator (minimap) live
  in the workspace footer.

## What FlowPlan does that Node-RED does not

FlowPlan is not a generic node graph — it is a **spatial manufacturing layout**
tool, and that changes what the canvas means:

- **Real geometry.** Stations have a grid footprint (width × height) and ports on
  real edges; positions are metres on a floor, not just diagram coordinates.
- **Material-flow physics.** Flows carry volume, unit cost and transport; KPIs
  (flow cost, travel, congestion across the central corridor) are computed from
  the actual placement. Moving a box changes the numbers.
- **Auto-generation.** A cell can be generated from part demand and routing, then
  balanced (SALBP-1 RPW) into stations — the layout is derived, not only drawn.
- **Scoring & optimisation.** Every layout is graded, and an optimiser proposes
  moves you accept per-item on the canvas itself (the ghost is the button).
- **Zones.** Typed drawable areas — blocked, pathway, ESD, cleanliness — where
  blocked/pathway keep stations out and ESD/cleanliness annotate without blocking.

## What we adopted from Node-RED

- **Unbounded, auto-expanding canvas.** The floor is no longer a fixed
  `gridW × gridH` pen that clamps stations at the edge. Placing or dragging a
  station (or drawing a zone) past the edge grows the floor to fit, plus a small
  margin (`fitGrid` in `packages/core/src/store/reducer.ts`). Growth is
  automatic; shrinking stays a deliberate act via the Grid width/height fields.
  Because the stage already fits the whole floor into view, growth zooms out
  rather than pushing content off-screen.
- **Reset zoom** already exists; a **minimap** is a reasonable future addition for
  very large floors (noted, not yet built).

## Deliberately not adopted

- **A drag-from-palette wiring model.** FlowPlan adds steps from the process
  library or as a blank step, and draws flows by tapping source → target. The
  palette-drag metaphor buys little over that and would compete with the spatial
  drag that already means "move this station on the floor".
