# Service Insights refreshes by polling only; there is no socket stream

- **Status:** Accepted
- **Revisions:** v1 2026-11-17 (initial) · v2 2026-11-17 (Context/Decision/Consequences corrected: the pin does stream chart data; poll-only is a product gap, not pin parity)
- **Deciders:** service-detail parity design (DESIGN.md §5.5/§8, ADR-2) under Bai's standing official-alignment rules
- **Guard:** `smartmetadata-ui/src/components/ingestion/ServiceInsightsTab.test.ts` (fetch wiring, loading and failure tolerance); reviewer (no socket code path exists in the insights tree)
- **Related:** upstream pin `a3012259ca` (`pages/ServiceDetailsPage/ServiceInsightsTab.tsx`); D-10 residual (per-instance workflow state fetch)

## Context

The pin's Insights tab renders three widgets (agents status, platform
insights, total data assets) from REST fetches plus a live AutoPilot workflow
status — and opens a chart-data socket while an AutoPilot run is live
(`ServiceInsightsTab.tsx`, socket setup and live chart updates). The product
has no socket infrastructure for this page, so the live run updates the pin
streams cannot be reproduced here. Poll-only is therefore a known product
gap, not pin parity.

## Decision

`ServiceInsightsTab` fetches its chart and count data over REST once on
mount, and receives `liveAutoPilotStatus` as a prop from the page, which
loads workflow instance states unconditionally in `load()` (pin classic
effect). Failures are contained inside the tab (toast for chart data, silent
for counts) and never break the page. No WebSocket/EventSource code path is
added for Insights.

## Consequences

Insights data can go stale between mounts, and live AutoPilot runs do not
push chart updates the way the pin's socket does — both are accepted gaps
until socket infrastructure exists. The per-instance state fetch (one call
per workflow instance, pin classic) remains residual D-10: only the first
instance's state is retained today. A future live stream must follow the
pin's socket behavior, not invent a new one.

## Amendment

v2 corrects the v1 claim that adding a socket would invent behavior the pin
does not exhibit: the pin opens a chart-data socket while AutoPilot runs.
The poll-only decision stands on the no-socket-infrastructure rationale,
now recorded as a known gap. The Decision is also corrected from "on mount
and on service change" to mount-only, matching the code.
