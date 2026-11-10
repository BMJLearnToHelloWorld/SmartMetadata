# My-data add-service action follows the official permission line, one wizard page

- **Status:** Accepted
- **Revisions:** v1 2026-11-08 (initial)
- **Deciders:** Bai
- **Guard:** `PlatformHealthWidget.test.ts` (empty state + add-service action)
- **Related:** Wave 2 G-11 B/C, `wave2/REVIEW-W2-G11-BC.md` condition 6, official `components/integration/ConnectionsPage/useAddServiceAction.ts`

## Context

Official `useAddServiceAction` gates the "add service" entry on whether the
viewer can Create the service resource for the requested category, and
navigates to the per-category add page. The product has a single service
wizard page (`ingestion-service-add`, `/ingestion/services/add`) with a kind
selector instead of one page per category.

## Decision

- `canAddService` is Create permission on any of the 11 classic service
  resources for `'all'`, or on the category's resource (`<kind>Service`)
  for a specific category — the same permission line official uses.
- `addService` navigates to `{ name: 'ingestion-service-add' }` for every
  category. The wizard reads no kind query parameter, so no kind is passed;
  the viewer picks the kind in the wizard.

## Consequences

- The empty-state "Add Service" entry on PlatformHealth (and later cards)
  appears only for viewers who can actually create a service.
- If the product ever splits the wizard per category, `addService` gains
  the kind parameter then; until then the single target is deliberate.
