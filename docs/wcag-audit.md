# WCAG 2.1 AA audit — FlowPlan web

A step-by-step audit against WCAG 2.1 Level AA. Status legend:

- **Pass** — met before this audit.
- **Fixed** — a gap found and corrected in this pass.
- **Gap** — a real shortfall, with the planned remedy noted. Not yet done.
- **N/A** — the success criterion does not apply to this app.

The app has two themes (dark `cds--g100`, light `cds--white`) and two languages
(en, de); both are covered below where relevant.

---

## 1. Perceivable

| SC | Criterion | Status | Notes |
|----|-----------|--------|-------|
| 1.1.1 | Non-text content | **Pass/Fixed** | Icon-only buttons carry `iconDescription`/`aria-label` (Btn/IconBtn). Canvas stations expose `role="button"` + `aria-label` (name, type, fixed). Purely decorative glyphs sit beside text labels. |
| 1.2.x | Time-based media | **N/A** | No audio or video. |
| 1.3.1 | Info & relationships | **Fixed** | Portal split into `<section>`s with headings; route pages wrapped in `<main>`; tables use `<th>`; form controls keep `labelText` even when visually hidden. |
| 1.3.2 | Meaningful sequence | **Pass** | DOM order matches visual order; no CSS reordering that changes meaning. |
| 1.3.3 | Sensory characteristics | **Pass** | Instructions don't rely on shape/position alone. |
| 1.3.4 | Orientation | **Pass** | No orientation lock; layout reflows. |
| 1.3.5 | Identify input purpose | **N/A** | No fields collecting user personal data. |
| 1.4.1 | Use of colour | **Pass** | Status is colour **plus** text/letter/number (Carbon Tags carry the value; legends pair a swatch with a word). |
| 1.4.3 | Contrast (minimum) | **Fixed** | Carbon text tokens meet AA in both themes. The canvas/chart palette is now theme-reactive: `colors.ts` holds a per-theme palette read at render time via `useAccents()`, so on the light theme the accents darken (teal `#0f766e`, amber `#8a5a00`, red `#b42318`) and station fills become pale tints with dark labels — all ≥4.5:1 on white. |
| 1.4.4 | Resize text | **Pass** | Type in `rem`; zoom to 200% reflows without loss. |
| 1.4.5 | Images of text | **Pass** | No text baked into images. |
| 1.4.10 | Reflow | **Pass** | Responsive grids; wide tables scroll inside their own container. |
| 1.4.11 | Non-text contrast | **Fixed** | Focus rings and controls meet 3:1. Canvas graphics (station outlines, flow links, port dots, Yamazumi/bar segments) use the theme-reactive palette, so they hold ≥3:1 on both surfaces. |
| 1.4.12 | Text spacing | **Pass** | No fixed line-heights that clip on user spacing. |
| 1.4.13 | Content on hover/focus | **Pass** | Tooltips are Carbon (dismissible, hoverable, persistent). |

## 2. Operable

| SC | Criterion | Status | Notes |
|----|-----------|--------|-------|
| 2.1.1 | Keyboard | **Pass** | Controls are real `<button>`/`<a>`/inputs; the canvas is keyboard-navigable (stations focusable, arrows move). |
| 2.1.2 | No keyboard trap | **Pass** | Modals are Carbon (Esc closes, focus returns); no custom traps. |
| 2.1.4 | Character key shortcuts | **Pass** | Single-key shortcuts (1–4, arrows) are gated to when no field/dialog is focused. |
| 2.4.1 | Bypass blocks | **Fixed** | "Skip to main content" link added to the shell and to routed pages, targeting `#main-content`. |
| 2.4.2 | Page titled | **Pass** | `<title>FlowPlan`. |
| 2.4.3 | Focus order | **Pass** | Source order is logical; skip link is first. |
| 2.4.4 | Link purpose (in context) | **Pass** | Links/buttons have descriptive names. |
| 2.4.5 | Multiple ways | **Pass** | Portal + hash routes + in-editor nav. |
| 2.4.6 | Headings and labels | **Pass/Fixed** | Section headings added on the portal; controls labelled. |
| 2.4.7 | Focus visible | **Fixed** | Explicit `:focus-visible` rings on the portal tiles, the language select, and the skip link (Carbon supplies the rest). |
| 2.5.1 | Pointer gestures | **Pass** | No multi-point/path gestures required. |
| 2.5.2 | Pointer cancellation | **Pass** | Actions fire on up, not down. |
| 2.5.3 | Label in name | **Pass** | Visible labels are contained in accessible names. |
| 2.5.4 | Motion actuation | **N/A** | No motion-actuated features. |
| 2.3.1 | Three flashes | **Pass** | No flashing. |
| 2.3.3 | Animation from interactions (AAA, honoured) | **Pass** | `prefers-reduced-motion` neutralises transitions/animations. |

## 3. Understandable

| SC | Criterion | Status | Notes |
|----|-----------|--------|-------|
| 3.1.1 | Language of page | **Fixed** | `html lang` is set and updated by the language switch (en/de). |
| 3.1.2 | Language of parts | **Pass** | No inline foreign-language passages needing markup. |
| 3.2.1 | On focus | **Pass** | Focus causes no context change. |
| 3.2.2 | On input | **Pass** | Changing a select/field doesn't auto-navigate unexpectedly. |
| 3.2.3 | Consistent navigation | **Pass** | The shell header and back affordance are consistent across pages. |
| 3.2.4 | Consistent identification | **Pass** | Same icons/labels for the same actions. |
| 3.3.1 | Error identification | **Pass** | Import errors surface as text via the toast live region. |
| 3.3.2 | Labels or instructions | **Pass** | Inputs have labels and helper text where useful. |
| 3.3.3 | Error suggestion | **Pass** | Messages say what to fix. |
| 3.3.4 | Error prevention | **Pass** | Destructive actions confirm (reset, archive is recoverable). |

## 4. Robust

| SC | Criterion | Status | Notes |
|----|-----------|--------|-------|
| 4.1.1 | Parsing | **Pass** | React output; no duplicate ids at runtime (routed `#main-content` and shell `#main-content` never co-render). |
| 4.1.2 | Name, role, value | **Pass** | Carbon components expose correct roles; custom controls are native elements with names. |
| 4.1.3 | Status messages | **Fixed** | Toasts now render inside a `role="status" aria-live="polite"` region, announced without stealing focus. |

---

## Automated pass (axe-core)

`axe-core` was run against seven screens — portal, process library, concepts,
plans store, admin, the editor, and the analysis page — in **both themes**,
filtered to the `wcag2a / wcag2aa / wcag21a / wcag21aa` rule sets. The first
pass surfaced these; all are now fixed and a re-run reports **zero violations**:

| Rule | Impact | Where | Fix |
|------|--------|-------|-----|
| `color-contrast` | serious | Portal tile meta text (both themes) | Repointed `.portal__meta` from `--cds-text-placeholder` (intentionally low-contrast) to `--cds-text-secondary` (AA). |
| `label` | critical | Admin sign-in & console inputs | Associated every `<label>` via `htmlFor`/`id`; added `aria-label` to the console's placeholder-only inputs and role select. |
| `aria-required-parent` | critical | Plans view toggle, editor view + panel tabs | Single-select `role="tab"` groups now sit in a `role="tablist"` (plans `.plans__views`, editor `.views`, editor `.grouptabs__tabs`). |
| `aria-required-children` | critical | Editor panel tablist | The icon buttons beside the panel tabs are no longer inside the tablist — only the tabs are (a `display:contents` wrapper keeps the row intact). |
| (semantics) | — | Concepts "Layout forms", Library tag assignment | These are **multi-select**, so `TabBtn` now renders them as `aria-pressed` toggle buttons rather than single-select tabs. |

## Flow editor deep-dive (hard pass)

A focused, strict audit of the flow editor — the canvas plus its toolbar,
rails and drawer — since it is the app's most interactive surface and a
mouse-only canvas is where accessibility usually breaks.

**Automated:** `axe-core` (wcag A/AA **plus best-practice**) over the editor
in both themes, with the drawer open and a station selected — **zero
violations** after the fixes below.

**Manual — keyboard & screen reader (the parts axe can't see):**

| Concern | Before | Fixed |
|---------|--------|-------|
| Operate the canvas without a mouse | Stations were focusable and arrow-movable, but silently | Kept; the SVG now names itself and states the keys ("Tab to a station, arrow keys move, Enter selects, Delete removes"); the visible hint says so too |
| Know what has focus / what changed | No feedback — a move or delete was invisible to a screen reader | A polite `role="status"` live region announces selection ("Selected Load, column 3, row 2…"), each move ("Load moved to column 4, row 2"), a blocked move on a fixed station, and deletes ("Deleted Load. Press Ctrl+Z to undo") |
| Selected state | Not exposed to AT | Stations are `role="button"` with `aria-pressed` reflecting selection |
| Station identity | Name + type only | Label now adds movable/fixed and grid position |
| Panel tabs | `role="tab"` group with no panel | The rendered rail panel is a named `role="tabpanel"` |
| Active plan in the drawer tree | Teal text on the selected grey row = 3.12:1 (fails AA) | Active shown by the selected background + left-accent border + bold + `aria-current`; teal text dropped |

Locked in by a test (`App.test`: focusable station → `aria-pressed`, position
in the label, and the live region announcing select + move).

## Known gaps (next steps)

1. **Manual screen-reader walkthrough.** Automated tools catch ~a third of
   issues; a NVDA/VoiceOver pass over the guided flow, the editor and the plans
   store is still worth doing.
2. **Full translation coverage.** i18n currently covers the portal and plans
   store; the editor and library pages resolve through the English fallback and
   should be moved into the dictionaries so language is complete, not partial.

## Fixed in this pass

- Skip-to-content link (shell + routed pages) — 2.4.1.
- `role="status"` live region for toasts — 4.1.3.
- `<main>` landmark on routed pages — 1.3.1.
- Visible focus on the portal tiles, language select, skip link — 2.4.7.
- `html lang` driven by the language switch — 3.1.1.
- Theme-reactive canvas/chart palette (`useAccents()` / per-theme palette in
  `colors.ts`): light accents darkened and station fills turned to pale tints,
  so the canvas, legends and Yamazumi/bar charts hold AA on the white theme —
  1.4.3 / 1.4.11. Verified in-browser on the editor canvas and the analysis
  charts in both themes.
- Automated axe-core sweep (7 screens × 2 themes) driven to zero violations:
  portal meta contrast, admin input labels, tab/tablist parentage, and the
  tab-vs-toggle semantics of multi-select filters — see the table above.
