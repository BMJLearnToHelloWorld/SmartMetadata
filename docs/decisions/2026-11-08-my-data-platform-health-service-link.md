# My-data PlatformHealth service link goes to the service detail page

- **Status:** Accepted
- **Revisions:** v1 2026-11-08 (initial)
- **Deciders:** Bai
- **Guard:** `PlatformHealthWidget.test.ts` (row navigates to the service detail page)
- **Related:** Wave 2 G-11 B/C, `wave2/REVIEW-W2-G11-BC.md` condition 7, official `components/MyData/Widgets/PlatformHealthWidget/PlatformHealthWidget.tsx`

## Context

Official PlatformHealth rows link to the service's Connections page with
the AGENTS tab active (`/settings/services/<kind>/<fqn>/agents` in the
classic layout). The product has no real AGENTS tab: its
`ServiceDetailView` `#agents` slot renders only an empty residual.

## Decision

- A failing-service row navigates to the product's service detail page
  (`{ name: 'ingestion-service', params: { kind, id: fqn } }`). No AGENTS
  tab parameter is invented and no tab is faked.
- The missing AGENTS tab stays a residual, recorded where the empty slot
  already is; it is not part of this batch.

## Consequences

- The row link lands on a real page that shows the service and its
  pipelines, instead of a 404 or a fabricated tab.
- When the product gains a real agents tab, the link gains the tab
  parameter in the same change.
