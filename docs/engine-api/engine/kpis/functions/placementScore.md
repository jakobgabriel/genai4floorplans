# Function: placementScore()

> **placementScore**(`stations`): `number`

Defined in: engine/kpis.ts:58

Placement efficiency (audit A-03): the share of the cell's bounding rectangle
 actually occupied by equipment — a compactness score, 0–100. It is genuinely
 distinct from flow cost: a cell can have cheap flow yet sprawl across the
 floor (dead space, long walks, wasted rent), or pack tightly. Higher is
 better. Measured over process work steps (the movable work content); a cell
 with fewer than two placed steps is trivially "packed" and scores 100.

 Replaces the former `sPlace = sFlow` copy, which double-counted flow cost and
 left the tool with no real placement metric despite advertising one.

## Parameters

### stations

[`Station`](../../../model/types/interfaces/Station.md)[]

## Returns

`number`
