# No search-semantics deviation record is needed: the service search layer matches the pin

- **Status:** Withdrawn — investigated during synthesis; no deviation was found, so no deviation record is warranted
- **Revisions:** v1 2026-11-17 (initial)
- **Deciders:** service-detail parity synthesis (DESIGN.md §8, ADR-8, conditional: withdraw if no deviation)
- **Guard:** `smartmetadata-ui/src/api/serviceSearch.test.ts`; `smartmetadata-ui/src/catalog/queryFilter.test.ts` (quote/backslash cases); `smartmetadata-ui/src/api/search.ts` (verbatim escape helpers)
- **Related:** upstream pin `a3012259ca` (`utils/StringUtils.ts` `escapeESReservedCharacters`, `getEncodedFqn`, `getQueryWithSlash`)

## Context

The design reserved ADR-8 for a search-semantics deviation, if the
implementation diverged from the pin. Synthesis verified the search layer
against the pin before writing it: `escapeESReservedCharacters` and
`getEncodedFqn` in `api/search.ts` are verbatim ports (including the reserved
character set); `getQueryWithSlash` in `catalog/queryFilter.ts` ports the
pin's odd-backslash quote walk, including the drop-empty rule for queries
that are purely already-escaped characters; `searchServiceIndex` returns
unpacked `_source` hits plus total and aggregations, matching the component
contract.

## Decision

ADR-8 is withdrawn. No search deviation exists to record. This record exists
only so the conditional item in the design has a visible disposition instead
of a silent gap.

## Consequences

A future search change that diverges from the pin must open a new record
under its own slug; it must not resurrect this one. The escape helpers must
stay verbatim — any change to the reserved set needs a pin re-check first.
