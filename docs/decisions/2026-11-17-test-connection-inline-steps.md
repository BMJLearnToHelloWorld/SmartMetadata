# Test Connection keeps the inline steps table; the pin's modal form is cut

- **Status:** Accepted
- **Revisions:** v1 2026-11-17 (initial)
- **Deciders:** service-detail parity design (DESIGN.md §8, ADR-12, D9/D10) under Bai's standing official-alignment rules
- **Guard:** `smartmetadata-ui/src/views/ingestion/ServiceDetailView.test.ts` (test-connection flow, polling, disabled gating)
- **Related:** upstream pin `a3012259ca` (classic page test-connection flow, `isTestingDisabled`); `ingestion/connectionTest.ts` (`shouldTestConnection`)

## Context

The pin's test-connection flow runs through a modal with its own form. The
product page already has a working inline steps table with polling, and the
modal form would duplicate the connection editing surface that the Edit
button already owns. The gating, however, must match the pin: edit
permission, the OpenMetadata-service exclusion, connector-type support, and
orchestrator availability.

## Decision

Test Connection stays inline: the steps table renders on the Connection tab
with the existing polling flow. The disabled rule is the pin's
`isTestingDisabled` (ungated edit permission, metadata service with FQN
`OpenMetadata`, undefined config, unsupported connector type, orchestrator
unavailable, or a test already running). `shouldTestConnection` is called
with the connector type string, per the product's existing `TestConnectionCard`
precedent — the pin classic page calls it with the service category, whose
semantics are ambiguous and may always pass; the product form is the
effective gate.

## Consequences

No modal form is added for test connection; the Edit flow owns connection
editing. Any change to the disabled rule must be checked against the pin's
`isTestingDisabled` line by line, not against the modal's behavior.
