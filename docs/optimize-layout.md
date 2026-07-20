# Optimize layout — one-click, with before/after

**Why (P0 from the product gap analysis):** the demo "wow" for a method engineer
is *"optimize this layout → here's the travel saved."* The engine already
computes an optimized placement and the deltas; this exposes it as a confident,
one-click action with a real before/after comparison.

## Design

- An **Optimize** button in the editor toolbar (Actual view). One click runs the
  optimizer (`improvedLayout(model)` — repositions existing stations, never
  invents work) and opens a Carbon `Modal`.
- The modal shows a **before/after comparison** (Carbon `StructuredList`):
  Current · Optimized · Δ for the metrics an IE cares about — **flow cost**,
  **material travel**, **grade**, **output/shift**, **cost/part** — plus the
  strategy and a plain-language rationale, and how many stations move.
- **Apply optimized layout** commits the move (reusing the existing
  APPLY_TEMPLATE / ACCEPT_PROPOSAL path, so it is a normal undoable edit);
  **Discard** closes. When nothing beats the current layout it says so honestly
  and Apply is disabled — no invented change.

## Scope

Reuses the existing engine (`improvedLayout`, `buildRating`, `costAnalysis`) and
reducer actions — no new solver. Non-destructive (undoable). Tested end-to-end.
