# Variable: CYCLE\_KEY\_CLASS

> `const` **CYCLE\_KEY\_CLASS**: `Record`\<[`CycleKey`](../../../model/types/type-aliases/CycleKey.md), [`WorkClass`](../../../model/types/type-aliases/WorkClass.md)\>

Defined in: engine/cycle.ts:41

Reconcile the 5-bucket CycleBreakdown with the WorkElement VA/NNVA/NVA
 taxonomy (audit A-06 / contradiction #3), so the Yamazumi and the workload
 analysis speak one lean vocabulary instead of two. Handling and setup are
 *necessary* non-value-add (NNVA); walking and waiting are pure waste (NVA).
 VA% is unchanged — only valueAdd is VA — but the non-VA time now carries the
 necessary/waste distinction the flat "everything else is waste" view lost.
