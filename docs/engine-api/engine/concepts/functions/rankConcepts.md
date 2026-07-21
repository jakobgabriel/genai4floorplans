# Function: rankConcepts()

> **rankConcepts**(`annualVolume`): `object`[]

Defined in: engine/concepts.ts:170

Concepts ordered by how well they fit a volume, best first.

 Equal volume fit is broken by the lean default (spec §9, "lowest automation
 meeting takt wins by default; escalation needs justification"): the cheaper,
 less-automated concept ranks first. Without this, overlapping volume bands
 tied at 100 in arbitrary declaration order (audit C-06). This is a coarse
 screen; the primary concept comparison is the fully-loaded cost ranking over
 generated cells in generate.ts (RankBy), which weighs capex, opex, ergo and
 balance together.

## Parameters

### annualVolume

`number`

## Returns

`object`[]
