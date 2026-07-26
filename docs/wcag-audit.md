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
| 1.4.3 | Contrast (minimum) | **Fixed (partial)** | Carbon text tokens meet AA in both themes. Light-theme accent tokens (`--data-*`) darkened to keep AA where the colour is resolved from CSS. **Gap:** canvas/inline accents captured as hex in `colors.ts` at load do not re-resolve on a light surface — see Known gaps. |
| 1.4.4 | Resize text | **Pass** | Type in `rem`; zoom to 200% reflows without loss. |
| 1.4.5 | Images of text | **Pass** | No text baked into images. |
| 1.4.10 | Reflow | **Pass** | Responsive grids; wide tables scroll inside their own container. |
| 1.4.11 | Non-text contrast | **Fixed (partial)** | Focus rings and controls meet 3:1. Same canvas-accent caveat as 1.4.3. |
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

## Known gaps (next steps)

1. **Canvas accent contrast on the light theme (1.4.3 / 1.4.11).** `colors.ts`
   captures the `--data-*` accents as hex at module load and the canvas applies
   them as SVG presentation attributes, so they don't re-resolve when the
   surface is light. Remedy: make the accent colours reactive to the active
   theme (a `useAccents()` hook re-reading the CSS variables on theme change, or
   applying them via `style` so `var()` resolves), then re-verify canvas and
   legend contrast at 3:1 on white. Tracked separately from this structural pass.
2. **Automated + manual verification.** Run `axe-core`/Lighthouse on each route
   in both themes, and a screen-reader walkthrough (NVDA/VoiceOver) of the
   guided flow, the editor, and the plans store.
3. **Full translation coverage.** i18n currently covers the portal and plans
   store; the editor and library pages resolve through the English fallback and
   should be moved into the dictionaries so language is complete, not partial.

## Fixed in this pass

- Skip-to-content link (shell + routed pages) — 2.4.1.
- `role="status"` live region for toasts — 4.1.3.
- `<main>` landmark on routed pages — 1.3.1.
- Visible focus on the portal tiles, language select, skip link — 2.4.7.
- `html lang` driven by the language switch — 3.1.1.
- Light-theme accent tokens darkened for AA where CSS-resolved — 1.4.3 (partial).
