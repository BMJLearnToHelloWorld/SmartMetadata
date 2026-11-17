# The Data Products face has no entity-rules gating: multiple selection is always allowed and no domain is required

- **Status:** Accepted
- **Revisions:** v1 2026-11-17 (initial)
- **Deciders:** service-detail parity synthesis (finding F-d, verified against the pin)
- **Guard:** `smartmetadata-ui/src/components/ingestion/ServiceMainTab.test.ts` (Data Products save); reviewer (no rules fetch exists in the main-tab tree)
- **Related:** upstream pin `a3012259ca` (`components/Entity/EntityRightPanel/EntityRightPanel.tsx` `DataProductsContainer` props: `multiple`, `requireDomainForDataProduct`)

## Context

The pin gates the Data Products face with entity rules loaded from the
server: `multiple` is true only when rules are loaded and
`canAddMultipleDataProducts`, and `requireDomainForDataProduct` is true
until rules load or the rule says otherwise. The product has no entity-rules
fetch on this page, so there is nothing to gate with.

## Decision

The product Data Products face renders without rules gating: multiple
selection is always allowed, and no domain is required before attaching a
data product. The face still hides for the metadata kind, matching the pin's
`showDataProductContainer` rule. The save path (single-field `/dataProducts`
op, refs as-is) is unchanged.

## Consequences

Users can attach multiple data products, or a data product without a domain,
in deployments where the pin's rules would forbid it. This is a real
behavioral deviation, owned here. Closing it requires loading entity rules
on this page and applying both gates; until then, the rules endpoint must
not be faked with client-side defaults.
