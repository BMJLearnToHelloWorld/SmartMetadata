# Bulk Edit navigates with the service entity type; non-metric scopes show an explicit unsupported state

- **Status:** Accepted
- **Revisions:** v1 2026-11-17 (initial) · v2 2026-11-17 (title/Decision corrected: the pin passes the service entity type; Consequence softened to match the existing guard text)
- **Deciders:** service-detail parity design (DESIGN.md §8, ADR-10, Q3(b)) under Bai's standing official-alignment rules
- **Guard:** `smartmetadata-ui/src/components/ingestion/ServiceMainTab.test.ts` (Bulk Edit navigation target); `MetricBulkEditView` `isMetricWildcard` guard (non-metric scopes)
- **Related:** upstream pin `a3012259ca` (Bulk Edit entry from the service main tab); `bulk-edit` route (`bulk/edit/:entityType/:fqn`)

## Context

The pin renders a Bulk Edit entry on the service main tab. The product's bulk
edit view only supports metric scope today (`MetricBulkEditView` with an
`isMetricWildcard` guard); other entity scopes have no bulk editor. Hiding
the button would diverge from the pin's surface; navigating blindly would
land on a broken view.

## Decision

The button renders per the pin and navigates to the bulk-edit route with the
service entity type and FQN: the pin's `handleEditTable` passes
`EntityType.DATABASE_SERVICE`, and the product passes `'databaseService'`
— not the child entity type. The target view keeps its existing guard:
non-metric scopes render an explicit unsupported state rather than failing
or silently doing nothing. Q3(b) is satisfied by the guard that already
exists; no target view change was needed in this batch.

## Consequences

Bulk edit from a service page is a navigation contract, not a working editor,
for every non-metric scope — the unsupported state must stay explicit and
name the supported (metric) scope, as the existing guard text does. Adding a
scope means extending the target view and its guard together, not removing
the guard.

## Amendment

v2 corrects the v1 title and Decision, which said the navigation carries
the child entity type. The pin passes the service entity type
(`EntityType.DATABASE_SERVICE`); the product passes `'databaseService'`.
The Consequence is softened to match the existing guard text, which names
the supported scope rather than the requested one.
