# FlowPlan — Carbon Design System gap analysis

_Design audit of the whole web app against IBM Carbon v11 (`@carbon/react`,
`@carbon/icons-react`, `@carbon/styles`). Reference: the Carbon Figma kit and
[carbondesignsystem.com](https://carbondesignsystem.com/designing/kits/figma/)._

## How to read this

Every finding is one of five **violation classes**, each with an objective rule
from Carbon:

| Class | Carbon rule | How to fix |
|---|---|---|
| **C1 · Wrong primitive** | Use real Carbon React components, not raw `<button>/<input>/<select>/<table>/<div>` with custom classes | Swap to `Button`, `TextInput`, `NumberInput`, `Select`, `DataTable`, `Modal`, `Tag`, `Tile`, `TreeView`, `Tabs`, … |
| **C2 · Off-ramp type** | Type only from the Carbon ramp — 12/14/16/20/28/32px (`0.75/0.875/1/1.25/1.75/2rem`). 8.5/9/10/10.5/11/11.5/13/15/22/24/26px are **not on it** | Nearest ramp token; 12px is the floor |
| **C3 · Off-token spacing / geometry** | Spacing from the `$spacing-01…13` scale; `border-radius: 0` (Carbon is square) | Spacing tokens; radius 0 (circles excepted) |
| **C4 · Off-token color** | Foreground/border/background from `--cds-*` tokens. The chromatic palette in `components/colors.ts` (TEAL/AMBER/RED/BLUE/PURPLE) is sanctioned **for data encoding only** | Route chrome to `--cds-text-*`, `--cds-border-*`, `--cds-support-*`; stop leaking data hues onto labels/borders |
| **C5 · Glyph-as-icon** | Icons from `@carbon/icons-react` | Replace unicode/emoji glyphs (`＋ ✕ ◈ ▦ 🗀 🗄 ⋯ ✓ ✗ ◀ ⠿ ▸ ▾ 📚 ⧉`) with Carbon icons |

**Severity**: `high` = a user reads it as non-Carbon / wrong component or an
a11y gap; `medium` = token/typography off-ramp; `low` = cosmetic.

---

## Executive summary

The app is **"Carbon-flavoured", not Carbon.** It has a bespoke CSS layer
(`styles/tokens.css`, ~1400 lines) that *approximates* Carbon — square corners,
IBM Plex, `--cds-*` colour tokens — but the components themselves are largely
hand-rolled: `.btn`, `.field`, `.card`, `.tabs`, `.schemaTbl`, `.tree-row`,
`.menu-pop`, `.overlay/.modal`, `.toast`, `.help .pop`. Real `@carbon/react`
components appear in only a handful of places (`ProcessShell`, `ConceptTable`,
`WorkspacePage`, and the new planner steps).

Consequences:

- **Accessibility & behaviour gaps** — hand-rolled menus, modals, tooltips and
  the tree re-implement focus trapping, keyboard nav and ARIA that Carbon gives
  for free, usually incompletely.
- **Inconsistent type** — ~200 inline `fontSize` values, almost none on the
  Carbon ramp; text as small as **8.5px** (`HeaderKpis`).
- **Colour leakage** — the data-encoding palette (teal/amber/red) is used for
  chrome (labels, borders, pills), which is exactly what Carbon tokens exist to
  prevent, plus stray raw hex/rgba literals outside `colors.ts`.
- **Square-ness violations** — `border-radius` 2/3/4/6/7/8 in swatches,
  tooltips, popovers, chart bars and DAG nodes.

### Magnitude (raw counts)

| Surface | inline styles | raw `<button>` | raw `<input>` | raw `<select>` | raw `<table>` | notes |
|---|---:|---:|---:|---:|---:|---|
| `components/panels.tsx` (inspector rail) | ~150+ | ~20 | ~24 | ~13 | 2 | **worst offender**; `<textarea>` + `<input type=range>` too |
| `components/WorkloadPanel.tsx` | ~45 | ~6 | ~5 | ~5 | 0 | incl. `<select multiple>` |
| `components/AiChatPanel.tsx` | ~41 | ~11 | ~6 | 1 | 0 | AI is feature-hidden today |
| `pages/*` (Library/Admin/Archive/Compare/Site) | ~70 | ~30 | ~16 | ~5 | ~5 | entry/workspace chrome; import **zero** Carbon except Workspace |
| `components/Explorer.tsx` (tree) | ~10 | ~14 | 1 | 0 | 0 | hand-rolled `TreeView`; ~14 glyph icons |
| `components/Capacity/Cost/DataSheet/Proposal` | ~55 | ~5 | ~13 | 0 | 3 | number inputs + `schemaTbl` tables |
| shared (`ui`, `Menu`, `ConfirmDialog`, `SettingsModal`, `StationTooltip`, `CloseButton`, `HeaderKpis`, `charts`) | — | many | many | 2 | 0 | custom toast/modal/menu/tooltip systems |

---

## Findings by category

### C1 · Wrong primitive (high)

- **Custom modals** → Carbon `Modal` / `ComposedModal`:
  `ConfirmDialog.tsx` (`.overlay`+`.modal`), `SettingsModal.tsx`.
- **Custom toast system** → `ToastNotification` in a notification container:
  `ui.tsx` `ToastProvider` (`.toasts`/`.toast`, manual `setTimeout(3200)`, and
  a non-Carbon `warn/err` vocabulary — Carbon is `info/warning/error/success`).
- **Custom overflow menu** → `OverflowMenu`/`OverflowMenuItem` (or `MenuButton`):
  `Menu.tsx` (hand-rolled trigger + `.menu-pop`, hand-rolled outside-click/Esc).
- **Custom tooltips** → `Tooltip`/`Toggletip`/`DefinitionTooltip`:
  `StationTooltip.tsx` (position-fixed div), `ui.tsx` `HelpPopover` (`.help .pop`),
  and native `title=""` tooltips in `confidence.tsx`.
- **Hand-rolled tree** → `TreeView`/`TreeNode`: `Explorer.tsx` (entire
  `.tree-row/.tree-leaf/.tree-twisty/.tree-grip` structure + indentation math).
- **Hand-rolled tables** → `DataTable`/`StructuredList`: `schemaTbl` in
  `panels.tsx` (×2), `CapacityPanel`, `CostPanel`, `DataSheetPanel`,
  `AdminPage`, `ArchivePage`, `ComparePage`, `SitePage`.
- **Raw form controls** → `Button` / `TextInput` / `NumberInput` / `Select` /
  `TextArea` / `Slider` / `MultiSelect` / `ComboBox` / `PasswordInput`:
  pervasive — `panels.tsx` alone has ~24 inputs, ~13 selects, a range slider, a
  textarea; `WorkloadPanel`, `CapacityPanel`, `CostPanel`, `SettingsModal`,
  `AdminPage`, `LibraryPage`, `FlowEditorPopover`, `AiChatPanel`.
- **Custom tab strips** → `Tabs`/`TabList`/`Tab`: `.subtabs .chip` in
  `LibraryPage` and `App.tsx`; `.grouptabs`/`.tabs .btn` in the rail.
- **Custom tags/pills** → `Tag`: `.pill` (`panels`, `Workload`, `DataSheet`),
  `.lib-tag`, `ProposalPanel` "stale" chip.
- **Custom stat tiles / cards** → `Tile`/`ClickableTile`/`Layer`:
  `.stat-tile`/`Stat` (`charts`, `Compare`, `Site`), `.chart-card`,
  `.dash-tile`, `.card`, `.imp/.impVal`, `HeaderKpis` KPI divs.
- **Native `<details>`** → `Accordion`/`AccordionItem`: `LibraryPage` members.

### C2 · Off-ramp typography (medium, ~200 occurrences)

Present in **every** component via inline `fontSize`. Worst: `HeaderKpis` **8.5px**
& 13px; `charts` `Stat` 22px; `panels` 26px grade, 13px, and dozens of
10/10.5/11/11.5/12; `Explorer`/pages 10/10.5/11/12; CSS (now fixed — see below)
had 9/10/10.5/11/11.5/12/12.5/24/15px. Carbon floor is **12px** (`0.75rem`,
label/caption-01).

### C3 · Off-token spacing & radius (medium/low)

- Non-zero radius: `StationTooltip` 6, `FlowEditorPopover` 8, DAG nodes `rx=7`,
  chart bars `rx=2/3`, swatches 2/3/4, CSS swatches 1/2 (now fixed).
- Magic px spacing: `gap: 4/6/7/10/14/18`, `margin: "16px 0 8px"`, `paddingLeft:
  8 + depth*16`, fixed `width: 44/74/120/260/300/360px`. Several (7, 14, 18) are
  off the `$spacing` scale entirely.

### C4 · Off-token color (medium/high)

- Data-encoding hues (`TEAL/AMBER/RED/TEXTD`) applied to **chrome**: label text,
  dividers, pill/badge borders, button backgrounds. Should be `--cds-text-*` /
  `--cds-border-*` / `--cds-support-*`.
- Stray raw hex/rgba **outside** `colors.ts`: `#0e1416` (DataSheet, panels),
  `#a582c9`/`#d96b5b` (AnalysisDashboard, CostPanel, panels, App), and
  `rgba(...)` literals in `panels`/`WorkloadPanel`. `main.tsx` `#8d8d8d`.
- Legacy aliases `var(--panel2)`/`var(--line)` used directly instead of the
  `--cds-*` tokens they now point at.

### C5 · Glyph-as-icon (medium/high)

Unicode/emoji substitute for `@carbon/icons-react` throughout: `＋ ✕ ← ◀ ◈ ▦ ▣
🗀 🗄 🗄 ⋯ ✓ ✗ ⠿ ▸ ▾ 📚 ⧉`. Highest impact in `Explorer` (primary nav), the
pages, `CloseButton`, `LibrarySidebar`/`PaletteBar`.

---

## What this pass fixes (and what it defers)

Fully Carbon-izing every surface is a multi-phase migration (it rewrites the
inspector rail, the tree, and every table). This pass takes the **objective,
high-coverage, low-risk** layers first and lands them green, and sequences the
rest as a roadmap.

**Done in this pass** — see the accompanying commits:

- **C2/C3 in CSS** — every off-ramp `font-size` in `tokens.css` + `planner.css`
  mapped to the Carbon ramp; non-zero swatch/legend radii → 0. (Zero risk;
  touches every screen.)
- **C1/C5 on the entry surface** — the user-facing pages
  (Library/Admin/Archive/Compare/Site/Workspace) raw `.btn` → Carbon `Button`,
  glyph icons → `@carbon/icons-react`, `.page-title` → Carbon heading type.
- **C1 shared primitives** — `CloseButton` → `IconButton`+`Close`;
  `ConfirmDialog` → Carbon `Modal`; `Menu` → `OverflowMenu`.
- **C2/C3 inline offenders** — `HeaderKpis` (8.5/13px), `StationTooltip`
  (radius 6, 11px), `charts` `Stat` (22px) brought onto ramp / squared.

**Deferred (roadmap, by priority)** — tracked here so nothing is lost:

1. **Inspector rail** (`panels.tsx`) — the largest single job: ~24 inputs → the
   Carbon form set, ~13 selects → `Select`, range → `Slider`, the two
   `schemaTbl` tables → `DataTable`, ~150 inline styles → CSS classes /
   type tokens, `.pill` → `Tag`, `.bar` → `ProgressBar`. **Highest remaining.**
2. **Workload / Capacity / Cost / DataSheet panels** — number inputs →
   `NumberInput`, `schemaTbl` → `DataTable`/`StructuredList`, `.card`→`Tile`,
   `.issue/.ok`→`InlineNotification`, `.pill`→`Tag`.
3. **Explorer tree** → Carbon `TreeView` (+ Carbon icons, `OverflowMenu` rows).
4. **Toast system** (`ui.tsx`) → `ToastNotification`; **tooltips**
   (`StationTooltip`, `HelpPopover`, `title=""`) → `Toggletip`/`Tooltip`.
5. **Tables everywhere** (Admin/Archive/Compare/Site) → `DataTable`.
6. **Tab strips** (`.subtabs`, `.grouptabs`) → Carbon `Tabs`.
7. **AI panel** (`AiChatPanel`) — deferred behind the hidden-AI flag.
8. **Colour cleanup** — remove data-hue leakage into chrome; delete stray hex.

---

## Guardrails for the migration

- Carbon components render real, accessible DOM — a `Button` is still a
  `<button>` with its label — so most swaps keep `getByRole`/`getByText` tests
  green. Convert file-by-file and run `npm run test` after each.
- Keep the data-encoding palette in `components/colors.ts` as the **one**
  sanctioned source of chromatic hues; everything else must be a `--cds-*` token.
- Never set `border-radius` > 0 except deliberate circles (avatars, status dots).
- 12px (`0.75rem`) is the type floor. There is no 10/11px in Carbon.
