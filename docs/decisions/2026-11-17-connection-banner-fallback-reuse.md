# The Connection tab reuses the Agents tab's Airflow banner, including its fallback

- **Status:** Accepted
- **Revisions:** v1 2026-11-17 (initial) · v2 2026-11-17 (Context corrected: the pin's two banner call sites differ; the decision is unchanged)
- **Deciders:** service-detail parity design (DESIGN.md §8, ADR-11, D11) under Bai's standing official-alignment rules
- **Guard:** `smartmetadata-ui/src/views/ingestion/ServiceDetailView.test.ts` (banner props on both tabs)
- **Related:** upstream pin `a3012259ca` (classic page orchestrator banner); `AirflowMessageBanner` component

## Context

Both the Agents tab and the Connection tab must surface orchestrator
unavailability: agents cannot run and connection tests cannot execute without
it. The pin's two call sites differ: the Agents tab
(`Ingestion.component.tsx`) passes `disabledFallbackMessage` and
`unreachableFallbackMessage` to the banner, while the Connection tab renders
a bare `<AirflowMessageBanner />` with no fallback props. The product
nevertheless renders one shared component with identical props on both tabs,
so the Connection tab shows fallback content the pin's Connection tab does
not — a deliberate product narrowing, not pin parity. Two banner
implementations would drift; one shared component keeps the message and the
fallback consistent.

## Decision

The Connection tab renders `AirflowMessageBanner` with the same props as the
Agents tab, including the fallback shown when orchestrator status is
unavailable. The orchestrator probe is page-level and runs independently of
the agents fetch, so the banner is correct even when the agents list is
skipped (OpenMetadata service).

## Consequences

A change to the banner's message or fallback applies to both tabs at once —
that is the point. A tab-specific banner variant must be justified as a pin
difference, not a product preference.

## Amendment

v2 corrects the v1 Context, which wrongly claimed the pin shows the banner
in both places with the same fallback content. The pin's Agents tab passes
fallback props and its Connection tab does not; the shared-props decision
stands, now recorded honestly as a product narrowing rather than pin parity.
