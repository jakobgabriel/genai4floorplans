# Interface: Capability

Defined in: model/capabilities.ts:21

## Properties

### alternatives?

> `optional` **alternatives?**: `string`[]

Defined in: model/capabilities.ts:27

Capabilities that can substitute for this one — the N:M substitution that
 generates concept variants (§7). Weld vs. bolt, visual vs. functional test.

***

### category

> **category**: [`CapabilityCategory`](../type-aliases/CapabilityCategory.md)

Defined in: model/capabilities.ts:24

***

### effectiveFrom?

> `optional` **effectiveFrom?**: `string`

Defined in: model/capabilities.ts:30

Effective-dating so a released cell reconstructs against the catalog state
 at its release (spec §6/§12). Absent ⇒ always effective.

***

### effectiveTo?

> `optional` **effectiveTo?**: `string`

Defined in: model/capabilities.ts:31

***

### id

> **id**: `string`

Defined in: model/capabilities.ts:22

***

### name

> **name**: `string`

Defined in: model/capabilities.ts:23
