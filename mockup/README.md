# FlowPlan — clickable mockup

`index.html` is a **self-contained, click-through mockup** of the FlowPlan app, built
to match the real source in `packages/web/src`. Open it in any browser — no build,
no server, no dependencies. A key user can walk the whole product from the front door.

It uses the **real IBM Carbon Design System** — the same one the app ships
(`@carbon/react`). `carbon.css` next to this file is Carbon's full component CSS,
compiled with the **g100 (dark) theme** and vendored so the page stays offline. The
markup uses genuine Carbon classes — `cds--header`, `cds--progress` (the stepper),
`cds--btn`, `cds--tabs`, `cds--data-table`, `cds--tag`, `cds--tile`,
`cds--inline-notification`, `cds--text-input` — so buttons, tabs, tables, tags and
notifications are the actual Carbon components, not look-alikes. The bespoke pieces the
app itself hand-builds over Carbon (the SVG layout canvas, the KPI meters, the
Yamazumi and bar charts, the report) are styled with Carbon's `--cds-*` design tokens
so they stay consistent.

It carries the sample cell **"Cell A — Hydrobuchse line"** with the real engine numbers
locked by the golden-fixture tests (composite **92.6/100 → grade A**, line output
**685/shift**, takt **42 s**, CNC bottleneck, ergonomics **65**, automation coherence
**100**).

## Rebuilding `carbon.css`

```bash
mkdir carbonbuild && cd carbonbuild && npm init -y
npm install @carbon/styles sass
cat > entry.scss <<'SCSS'
@use '@carbon/styles/scss/themes' as themes;
@use '@carbon/styles/scss/theme' as theme;
@use '@carbon/styles';
@use '@carbon/styles/scss/grid';
:root { @include theme.theme(themes.$g100); }   /* force the dark theme onto :root */
SCSS
npx sass entry.scss carbon.css --style=compressed --load-path=node_modules
# then strip the @font-face blocks (they reference unresolved ~@ibm/plex paths);
# IBM Plex is loaded from the <link> in index.html instead.
```

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
