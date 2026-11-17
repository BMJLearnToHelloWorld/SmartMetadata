# The Agents tab has no pager and no filter UI; cursor plumbing and filter state exist but have no producers

- **Status:** Accepted
- **Revisions:** v1 2026-11-17 (initial)
- **Deciders:** service-detail parity design (DESIGN.md §5.8/§8, ADR-3, D18) under Bai's standing official-alignment rules
- **Guard:** `smartmetadata-ui/src/api/serviceAgents.test.ts` (fetch/refresh/page-change resolvers); `smartmetadata-ui/src/views/ingestion/ServiceDetailView.test.ts` (agents load, refresh, and OpenMetadata skip); reviewer (no pager or filter UI is rendered)
- **Related:** upstream pin `a3012259ca` (classic page agents fetch); ADR:2026-11-17-agent-card-menu-no-pending-state

## Context

The pin's classic page fetches agents with cursor paging, a search term, and
type/status filters. The product page renders the agents list without a pager
and without filter controls (a deliberate scope cut in the design: D18 keeps
the fetch scheduling, not the controls). The fetch/refresh/page-change
resolvers and the page-level search/filter refs therefore exist without any UI
that writes to them.

## Decision

`resolveAgentsFetchMode`, `resolveAgentsRefreshMode`, and
`resolveAgentsPageChange` stay in `api/serviceAgents.ts` with full resolver
tests, and the page keeps `agentsSearchText`/`agentsTypeFilter`/
`agentsStatusFilter` refs that are always empty. `resolveAgentsPageChange`
and the search-first-reset-cursor ordering (`handleSearchChange`) have no UI
callers today. The list loads one page (`PAGE_SIZE_BASE` = 15) per fetch mode
and refreshes on `@refresh`; the OpenMetadata service skip applies to fetch
mode only, not refresh mode.

## Consequences

The dead-looking plumbing is intentional scaffolding for the pager/filter UI,
not dead code to delete — but it must not be presented as working pagination
or filtering. Wiring a pager or filter UI later means adding producers for
the existing state, not redesigning the fetch layer. Until then, agents
beyond the first page are unreachable from this tab.
