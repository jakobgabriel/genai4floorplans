# FlowPlan

Cell & material-flow assessment tool for manufacturing. Rate a production cell's
actual state across flow, balance, ergonomics and automation, then see a scored
**improved layout** — no CAD, no backend required.

This is the productized app, ported from the original single-file demo
(`legacy/flowplan-demo.html`) into a modular, typed, tested React + TypeScript
SPA. The full product spec lives in [`docs/flowplanspec.md`](docs/flowplanspec.md).

## Quick start

```bash
npm install
npm run dev        # local dev server
npm run build      # type-check + production build to dist/
npm run preview    # serve the production build
npm run test       # run the engine + UI test suites
```

The build output in `dist/` is fully static and can be served by any web host.

## Architecture

```
src/
  model/      types, defaults, sample cell, schema migration
  engine/     pure, unit-tested calculators (KPIs, optimizer, balance,
              validation, automation, templates, composite rating)
  store/      model reducer + undo/redo history, autosave, named scenarios
  io/         JSON import/export (validated, non-destructive) and CSV export
  components/ SVG layout canvas + the six side panels + onboarding/UI
```

The **engine is framework-free and deterministic** (spec §4). The UI consumes it;
no rating logic lives in components. Golden-fixture tests in
`src/engine/engine.test.ts` lock the demo's numbers so refactors can't silently
change a rating.

## What's in this version

Beyond demo parity, this version adds:

- **UX & onboarding** — first-run start screen, undo/redo (`Ctrl/Cmd+Z`),
  on-canvas flow drawing (tap source → target), arrow-key nudging, view
  hotkeys (`1/2/3`), scroll-zoom + pan, KPI help popovers (which surface the
  model's honest limitations), and toasts.
- **Data-model flexibility** — editable grid size, station id rename (rewrites
  flows), in-canvas no-go zones, and a per-station / per-cell shift model.
- **Robustness** — schema versioning + migration so old JSON keeps loading,
  non-destructive import with friendly errors, named scenarios for comparing
  variants, and CSV export of the KPI + automation tables.
- **Optimizer credibility** — footprint-collision and no-go avoidance, plus
  bottleneck-aware "split / parallelize" suggestions in the Balance panel.

## Honest limitations

The optimizer is greedy pairwise swapping (a local floor, not a global optimum);
line balance treats the cell as a single sequential chain; congestion is a
centerline proxy; automation potential is a heuristic, not a validated ROI model.
These are surfaced in-app via the `?` help popovers. See spec §9.
