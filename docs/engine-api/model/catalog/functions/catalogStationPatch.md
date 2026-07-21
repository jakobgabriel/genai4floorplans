# Function: catalogStationPatch()

> **catalogStationPatch**(`e`): `Record`\<`string`, `unknown`\>

Defined in: model/catalog.ts:81

The partial-station patch a catalog entry contributes when placed. The web
 layer merges this over station defaults (keeping the engine framework-free).
 `provides` carries the capability; there is intentionally no workcenter.

## Parameters

### e

[`ProcessCatalogEntry`](../interfaces/ProcessCatalogEntry.md)

## Returns

`Record`\<`string`, `unknown`\>
