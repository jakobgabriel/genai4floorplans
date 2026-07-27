# FlowPlan — clickable mockup

`index.html` is a **self-contained, click-through mockup** of the FlowPlan app, built
to match the real source in `packages/web/src`. Open it in any browser — no build,
no server, no dependencies. A key user can walk the whole product from the front door.

It reproduces the Carbon g100 (dark) design language, IBM Plex typography and the
sample cell **"Cell A — Hydrobuchse line"** with the real engine numbers locked by
the golden-fixture tests (composite **92.6/100 → grade A**, line output **685/shift**,
takt **42 s**, CNC bottleneck, ergonomics **65**, automation coherence **100**).

## What you can click through

The four-stage planning process (the shell stepper is always present on these):

1. **Parts & demand** — part table, derived portfolio (sized-for / program / mixes /
   union routing), and the inferred-workload preview.
2. **Concepts** — the ranked concept comparison table, crossover band and sensitivity.
3. **Refine** — the three-column editor: workspace Explorer · canvas (Actual /
   Improved / Both / DAG, with the sample layout drawn on a 22×14 grid) · the
   Flow / Element / Schema config rail. Toolbar carries the live KPI strip and the
   Export menu.
4. **Summary** — the costed concept tile and the six-stage "cell as it now stands"
   glance.

The hash-route pages, reachable from the editor toolbar, the summary and the portal:

- **Analysis** (six-stage assessment: Verdict · Flow · Balance · Yield · Automation · Cost)
- **Concept recommendations**
- **Assessment report** (printable)
- **Compare variants**
- **Site overview**
- **Process library**
- **Manufacturing concepts** (catalog)
- **Cell plans**

A **Mockup navigator** bar is pinned at the bottom as a prototype aid so every screen
is reachable in one click. It is not part of the real app chrome — the in-screen
buttons, tiles and stepper are the faithful navigation.

## Notes

- Data is illustrative where the real values depend on user input (e.g. the concept
  ranking on the planning flow); the editor / analysis / report figures follow the
  sample cell and its rating.
- `render.mjs` screenshots the portal via the pre-installed Chromium (used offline;
  the Google-Fonts `<link>` degrades gracefully to system fonts when blocked).
- `layout.html` is a separate, earlier study — a before/after "declutter" comparison
  of the editor chrome, not a click-through.
