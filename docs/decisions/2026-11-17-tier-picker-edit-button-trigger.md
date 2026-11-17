# The tier picker opens only from its edit button; tier options come from listTierTags

- **Status:** Accepted
- **Revisions:** v1 2026-11-17 (initial) · v2 2026-11-17 (rewritten: the picker routes through listTierTags; no client-side disabled filtering, style mapped from the server record)
- **Deciders:** service-detail parity design (DESIGN.md §8, ADR-7, Q23) under Bai's standing official-alignment rules
- **Guard:** `smartmetadata-ui/src/components/ingestion/TierPicker.test.ts` (trigger, tier save); `smartmetadata-ui/src/api/tags.test.ts` (listTierTags query and style mapping)
- **Related:** upstream pin `a3012259ca` (TierCard / tier selection); Q23 verification note below

## Context

The pin renders the tier control as a card whose edit affordance opens the
picker. The product's `TierPicker` must not open from clicking the tier label
itself (the label is display, and a click-to-edit label invites accidental
edits on a read-mostly surface). The pin's TierCard fetches its options with
`getTags({ parent: 'Tier', limit: PAGE_SIZE_LARGE, disabled: false })` and
takes each tier's color from the tag's `style` — the server excludes disabled
tags, and the client maps the style.

## Decision

The picker opens only from its explicit edit button. Tier options come from
`listTierTags`, which issues the pin's query (parent `Tier`, limit 50,
disabled excluded server-side) and maps each record's `style.color` onto the
option. There is no client-side disabled filter: Q23 is resolved by the
server-side `disabled` parameter in the pin query, verified against the pin
source. The picker search matches the tier name only, as the pin's
FilterSelect does.

## Consequences

Disabled tiers never reach the picker because the server excludes them; a
regression in the query (dropping `disabled: false`) would re-expose them
and must be caught by the `listTierTags` guard. Tier colors come from the
server record's style, never from a client-side palette. The edit-button-only
trigger is a deliberate narrowing of the pin's card affordance; widening it
to label-click requires a new decision here.

## Amendment

v2 rewrites the v1 record, which claimed disabled tiers were filtered
client-side after `listTags` because the product had no `disabled` query
parameter, and left tier style unmapped. The picker now routes through
`listTierTags`, which issues the pin query and maps the style; the
client-side filter and the partially-verified Q23 note are gone. The
edit-button-only trigger decision is unchanged.
