# Service table empty states are plain strings through SmTable; the pin's rich placeholder is not rendered

- **Status:** Accepted
- **Revisions:** v1 2026-11-17 (initial)
- **Deciders:** service-detail parity synthesis (finding F-i, verified against SmTable)
- **Guard:** `smartmetadata-ui/src/components/ingestion/ServiceMainTab.test.ts` (empty-text strings, search vs no-data variants)
- **Related:** upstream pin `a3012259ca` (`NoDataPlaceholder` in `ServiceVersionMainTabContent.tsx` / main-tab table `locale.emptyText`); `components/shared/SmTable.vue`

## Context

The pin renders table empty states as a rich placeholder node (icon plus a
title carrying the count label) passed as the table's `locale.emptyText`.
SmTable's `emptyText` prop is string-only and forwards straight to the
underlying table's locale; it accepts no placeholder node or slot.

## Decision

The pin's empty semantics are connected as plain strings: a search-active
variant (no matching results + check spelling) and a no-data variant (no
entity data available, with the localized count label). The same string
wiring is used by the main tab, the data-models tab, and the drive-asset
table. No icon placeholder is rendered.

## Consequences

Empty states on these tables are text-only until SmTable grows a placeholder
slot. Any richer empty presentation must be built in SmTable once and shared,
not special-cased per tab. The string content must keep the pin's two
variants distinct — collapsing them would lose the search feedback.
