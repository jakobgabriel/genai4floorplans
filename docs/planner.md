# FlowPlan — the guided process

> **Update — full Carbon UI + the editor inside the process.**
>
> **One process, six stages:** `Situation → Demand → Process → Concepts →
> **Refine** → Summary`. The editor *is* the Refine stage. It is no longer a
> separate destination: the Carbon `ProgressIndicator` stays pinned above it,
> earlier stages remain clickable, and the editor has a forward exit
> ("Continue to summary") as well as an entrance. Nothing in the app now sits
> outside the process.
>
> **`ProcessShell`** (`planner/ProcessShell.tsx`) wraps every screen: Carbon UI
> Shell `Header` + the stepper + content. Steps not yet reached are disabled, so
> the indicator doubles as navigation without letting anyone skip ahead.
>
> **`tokens.css` is now a Carbon bridge.** The legacy variables survive — 270+
> inline styles reference them — but resolve to Gray 100 tokens:
> `--bg: var(--cds-background)`, `--panel: var(--cds-layer-01)`,
> `--text: var(--cds-text-primary)`, and so on. Re-skinning the entire editor was
> therefore ~15 lines rather than a rewrite of every component. The file also
> applies Carbon geometry throughout: `border-radius: 0`, IBM Plex Sans for UI
> (Mono only for data), the Carbon type/spacing scales, 2px `--cds-focus` rings
> on every interactive element, contained-tab underlines, Carbon field styling,
> and a `prefers-reduced-motion` block. `body.cds--g100` in `index.html` puts the
> dark theme on the document root so `--cds-*` resolves for plain CSS too.
>
> Chromatic colour is now reserved for **data encoding** (flow lines, charts,
> status) — Carbon Blue 60 is the interactive colour everywhere else.
>
> Structural note: `App.tsx` owns the brief and the stage; `planner/steps.tsx`
> holds presentational stages only. That is what let the editor be slotted
> between two stages without special-casing it.

---

# The guided Planner (original notes)

The answer to "it's too complex, too much input." A use-case-driven entry path
that asks only what a given situation needs, built in **IBM Carbon** so it reads
as a standard product surface rather than a bespoke tool.

---

## 1. The problem it fixes

FlowPlan opened on **"Actual-state rating"** — a grade for a cell. That is an
*assessment* posture, and it forces full specification before the tool says
anything: 10 tabs, 55 labelled inputs, 26 fields per station.

But every lifecycle case is about cells that **don't exist yet**. The value
exchange was inverted:

| | Inputs | Output |
|---|---|---|
| Old setup wizard | 6 | 11 ranked, costed concepts |
| Rest of the app | ~155 | A letter grade |

The Planner makes the first row the front door.

---

## 2. Process = use case × preconditions

`planner/usecases.ts` is the entry taxonomy. Each case states, in the planner's
words: the question, **what you must already have**, what you get, and its
lifecycle stage. Preconditions decide which steps run.

| Use case | Flow | Availability |
|---|---|---|
| Plan a new process | demand → process → concepts → review | ready |
| Choose a concept | demand → process → concepts → review | ready |
| Improve a planned cell | → editor | ready |
| Improve a running cell | → editor | **partial** — no measured-data model yet |
| Monitor serial production | — | **not built** — needs time-series + ingestion |

Unavailable cases are **shown and labelled**, not hidden. A planner learns what
the tool cannot do before investing time in it, and the caveat names the missing
capability rather than saying "coming soon."

### Preconditions inside a step

The process step branches on *"Do you have cycle times?"*:

- **Yes** — paste from Excel (`parseSteps` takes tab, comma, semicolon, space,
  `12.5s` suffixes, decimal commas, or a bare name).
- **Not yet** — name the steps and pick a complexity band (simple 15s /
  moderate 35s / complex 60s). This is the real RFQ situation: routing is known,
  cycle times are not. The estimate path is explicitly labelled *"good enough to
  compare concepts, not good enough to quote."*

**Five inputs before an answer** — name, volume, program years, shifts, steps —
and four of those have defaults.

---

## 3. Carbon usage

Prebuilt CSS (`@carbon/styles/css/styles.min.css`), so no Sass build config.
Loaded **before** `tokens.css`: Carbon's reset touches `html/body`, and the
existing editor theme must keep winning there. Carbon components are `.cds--*`
scoped, so load order does not affect them. The Planner is wrapped in
`<Theme theme="g100">` to match the app's dark surface.

Components used: `ClickableTile`/`Tile`, `ProgressIndicator`, `NumberInput`,
`TextInput`, `TextArea`, `RadioButtonGroup`, `StructuredList`, `Tag`,
`InlineNotification`, `Button`, `Grid`/`Column`.

`planner.css` carries layout only — every colour, size and space is a Carbon
token (`--cds-*`).

**Cost:** the full Carbon CSS is 827 kB raw / 87 kB gzipped. Acceptable for an
internal tool; trim to per-component Sass imports if it ever matters.

**Test shim:** Carbon observes element size at mount, so `vitest.setup.ts` stubs
`ResizeObserver` and `matchMedia` for jsdom.

---

## 4. Correctness fixes shipped alongside

These came out of an industrial-engineer walkthrough and matter more than the UI.

1. **Cost per part excluded capex.** `costAnalysis` returns operating cost only,
   so a $1.3M transfer line was presented as 3× cheaper per part than a $225k
   cell. Candidates now carry `capexPerPart` (capex ÷ annualVolume × programYears)
   and `loadedCostPerPart`, and **loaded cost is the default ranking**. The
   concept table shows the split — `$2.35 = $1.31 run + $1.04 capex` — so the
   number is auditable rather than asserted.
2. **Over-capacity was invisible.** Lane rounding routinely sizes a cell 50%
   above demand. `overCapacityPct` is now a metric, a tag, and a line in the
   rationale.
3. **Off-band concepts looked endorsed.** `conceptFit` is surfaced as an
   "Off-volume" tag and an explicit warning on review, naming the concept's
   normal range.
4. **Locale-mixed numbers.** Bare `toLocaleString()` renders 1300000 as
   "1.300.000" on a German workstation — inside a `$` string that reads as $1.30.
   `src/format.ts` pins the locale; all money and grouped numbers route through it.

---

## 5. What was removed

`ProcessSetupWizard` and `EmptyState` are **deleted**. The Planner supersedes
both, and keeping a wizard *and* a planner *and* an empty state would have been
the same duplication the redesign set out to remove. `parseSteps` moved to
`planner/parseSteps.ts` with its unit tests.

The editor is unchanged and reachable via **Planner → Skip to the editor**, the
direct entry buttons, or the header **Planner** toggle.

---

## 6. Still open

- The editor behind the Planner is untouched: still 10 tabs and a 26-field
  station inspector. The next simplification is collapsing that to ~6 fields with
  everything else behind "Advanced".
- `conceptCrossover` is implemented and tested but not charted.
- Concept profiles remain planning heuristics, not costed engineering data.
- All concepts still share one routing.
