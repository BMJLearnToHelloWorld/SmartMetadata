# The service right panel renders three faces, matching the pin's service page

- **Status:** Accepted
- **Revisions:** v1 2026-11-17 (initial)
- **Deciders:** service-detail parity synthesis (finding F-a verified against the pin, V4)
- **Guard:** `smartmetadata-ui/src/components/ingestion/ServiceMainTab.test.ts` (right-panel faces: Data Products, Tags, Glossary Terms)
- **Related:** upstream pin `a3012259ca` (`pages/ServiceDetailsPage/ServiceMainTabContent.tsx`, `components/Entity/EntityRightPanel/EntityRightPanel.tsx`)

## Context

The shared `EntityRightPanel` component supports a fourth face, Custom
Properties (`CustomPropertyTable`, rendered only when the caller passes
`customProperties`). The design listed "right panel 3 faces, not 4" as a
finding (F-a), on the assumption that the pin's service page shows all four.
Verification against the pin settled it: the pin's `ServiceMainTabContent`
does not pass `customProperties` (nor knowledge articles), so the Custom
Properties face never renders on the service page. Three faces is pin
behavior, not a product cut.

## Decision

The product right panel renders exactly the three faces the pin renders on
this page: Data Products (hidden for the metadata kind), Tags, and Glossary
Terms. Glossary writes go through the shared tags PATCH, matching the pin's
single tag-selection handler. No Custom Properties face is added.

## Consequences

A future reader must not "complete" the panel to four faces without
re-checking the pin's caller: the fourth face exists in the shared component
but is not passed on this page. If the pin's service page starts passing
`customProperties`, this record is superseded by that change.
