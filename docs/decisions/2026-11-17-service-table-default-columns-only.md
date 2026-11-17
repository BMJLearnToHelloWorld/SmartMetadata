# The service children table renders only the pin's default visible columns; there is no column-visibility UI

- **Status:** Accepted
- **Revisions:** v1 2026-11-17 (initial)
- **Deciders:** service-detail parity design (DESIGN.md §8, ADR-13, §5.4.3) under Bai's standing official-alignment rules
- **Guard:** `smartmetadata-ui/src/components/ingestion/ServiceMainTab.test.ts` (column set); reviewer (SmTable exposes no column-visibility mechanism)
- **Related:** upstream pin `a3012259ca` (`constants/TableKeys.constants.ts` `DEFAULT_SERVICE_TAB_VISIBLE_COLUMNS`, `COMMON_STATIC_TABLE_VISIBLE_COLUMNS`); V3

## Context

The pin defines the full column set for the service children table (Name,
Description, Owners, Tags, Tier, Certification, Schedule, Usage, Domain,
Data Products) and a default-visible subset, with a column-visibility control
that lets the user show the rest. The product table component (SmTable) has
no column-visibility mechanism, and building one is outside this batch.

## Decision

Only the pin's default visible set renders: Name + Description + Owners +
Tags + Tier + Certification. Schedule, Usage, Domain, and Data Products are
defined in the pin but hidden by default, and stay unreachable until a
visibility mechanism exists. The column-set default-visibility finding is
merged into this record rather than tracked separately.

## Consequences

Users cannot reveal the hidden columns from this table; that gap is visible
and owned here, not hidden behind a control that does nothing. Adding
column visibility later means implementing the mechanism in SmTable (or its
successor) and wiring the full pin column set — not adding per-column
toggles to this tab alone.
