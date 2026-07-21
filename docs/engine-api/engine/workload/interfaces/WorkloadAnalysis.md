# Interface: WorkloadAnalysis

Defined in: engine/workload.ts:79

## Properties

### attendedPct

> **attendedPct**: `number` \| `null`

Defined in: engine/workload.ts:99

Operator-bound share of the weighted content — drives manning.

***

### attendedTotalSec

> **attendedTotalSec**: `number`

Defined in: engine/workload.ts:97

***

### confidence

> **confidence**: [`Confidence`](../../../model/types/type-aliases/Confidence.md)

Defined in: engine/workload.ts:116

***

### elements

> **elements**: [`ElementLoad`](ElementLoad.md)[]

Defined in: engine/workload.ts:80

***

### issues

> **issues**: `string`[]

Defined in: engine/workload.ts:117

***

### lossFactor

> **lossFactor**: `number`

Defined in: engine/workload.ts:112

The loss factor these calculated counts were derived with.

***

### minStationsWeighted

> **minStationsWeighted**: `number` \| `null`

Defined in: engine/workload.ts:101

ceil(weighted total ÷ takt). Theoretical minimum — no loss allowance.

***

### minStationsWorst

> **minStationsWorst**: `number` \| `null`

Defined in: engine/workload.ts:103

ceil(worst mode total ÷ takt). Feasibility figure.

***

### mixSpreadPct

> **mixSpreadPct**: `number`

Defined in: engine/workload.ts:88

How much heavier the worst mode is than the average, %.

***

### modes

> **modes**: [`ModeTotals`](ModeTotals.md)[]

Defined in: engine/workload.ts:81

***

### nnvaSec

> **nnvaSec**: `number`

Defined in: engine/workload.ts:90

***

### nvaSec

> **nvaSec**: `number`

Defined in: engine/workload.ts:91

***

### overTaktElements

> **overTaktElements**: [`ElementLoad`](ElementLoad.md)[]

Defined in: engine/workload.ts:115

Elements whose worst-case time alone exceeds takt — they cannot fit one
 station at any balance and must be split, automated or paralleled.

***

### stationsCalculated

> **stationsCalculated**: `number` \| `null`

Defined in: engine/workload.ts:108

(weighted total ÷ takt) × lossFactor, UNROUNDED. The realistic station
 count once walking/reaching/handling/balancing loss is allowed for. The
 decimal is meaningful — it says how much headroom remains — so it is never
 silently rounded (spec / IE blueprint "never round the station count").

***

### stationsCalculatedWorst

> **stationsCalculatedWorst**: `number` \| `null`

Defined in: engine/workload.ts:110

Same, against the heaviest mode — the count feasibility actually requires.

***

### vaPct

> **vaPct**: `number` \| `null`

Defined in: engine/workload.ts:92

***

### vaSec

> **vaSec**: `number`

Defined in: engine/workload.ts:89

***

### wastePareto

> **wastePareto**: [`WasteBucket`](WasteBucket.md)[]

Defined in: engine/workload.ts:96

The seven wastes ranked by weighted seconds — a lean Pareto of where the
 non-value-add time actually sits (audit B-05). Empty when no element
 carries a waste class.

***

### weightedTotalSec

> **weightedTotalSec**: `number`

Defined in: engine/workload.ts:83

Mix-weighted total work content.

***

### worstModeId

> **worstModeId**: `string`

Defined in: engine/workload.ts:86

***

### worstTotalSec

> **worstTotalSec**: `number`

Defined in: engine/workload.ts:85

Work content of the heaviest single mode.
