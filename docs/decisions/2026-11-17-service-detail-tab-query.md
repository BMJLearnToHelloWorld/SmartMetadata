# The service detail tab lives in `?tab=`; switching tabs clears the rest of the query

- **Status:** Accepted
- **Revisions:** v1 2026-11-17 (initial)
- **Deciders:** service-detail parity design (DESIGN.md §5/§8, ADR-5, D14/Q1) under Bai's standing official-alignment rules
- **Guard:** `smartmetadata-ui/src/views/ingestion/ServiceDetailView.test.ts` (invalid-tab fallback, tab switch clears query, default tabs); `smartmetadata-ui/src/catalog/serviceDetailTabs.test.ts` (registry and defaults)
- **Related:** ADR:2026-11-17-service-main-tab-key; `ingestion-service-connection` route (`ingestion/services/:kind/:id/connection`) occupies the path-segment form

## Context

A path segment for the tab (`…/services/:kind/:id/<tab>`) collides with the
existing `ingestion-service-connection` route, so the tab must live in the
query string. Tab-specific state (search terms, cursors, `showDeletedTables`)
belongs to one tab; carrying it across a tab switch would apply stale filters
to a different table.

## Decision

The active tab is `route.query.tab`, read through a computed with get/set:
missing → the kind default (metadata → `agents`, security → `connection`,
otherwise `insights`); invalid → the first visible tab, without rewriting the
URL. Switching tabs pushes `{ query: { tab: key } }`, clearing every other
query parameter. `showDeletedTables` is written back by `load()` after a
successful fetch (pin classic semantics) and is the only query parameter the
page itself restores.

## Consequences

Bookmarked tab URLs are stable across locales (keys are English slugs per
ADR:2026-11-17-service-main-tab-key). Any future tab that needs persistent
query state must re-establish it on mount rather than expecting the switch to
preserve it, and must document the exception here.
