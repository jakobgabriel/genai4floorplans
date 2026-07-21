# Interface: WasteBucket

Defined in: engine/workload.ts:41

A ranked bucket of one of the seven wastes (audit B-05).

## Properties

### sec

> **sec**: `number`

Defined in: engine/workload.ts:44

Mix-weighted seconds carrying this waste.

***

### sharePct

> **sharePct**: `number`

Defined in: engine/workload.ts:47

Share of all CLASSIFIED waste seconds (non-VA elements that carry a waste
 class), %. Elements tagged NNVA/NVA without a waste class are not counted.

***

### wasteClass

> **wasteClass**: [`WasteClass`](../../../model/types/type-aliases/WasteClass.md)

Defined in: engine/workload.ts:42
