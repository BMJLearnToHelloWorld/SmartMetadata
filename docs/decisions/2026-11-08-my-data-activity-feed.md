# My-data ActivityFeed: my-feed scope, six rows, no event-type filter

- **Status:** Accepted
- **Revisions:** v1 2026-11-08 (initial)
- **Deciders:** Bai
- **Guard:** `ActivityFeedWidget.test.ts`, `activitySentence.test.ts`
- **Related:** Wave 2 G-11 B/C, `wave2/REVIEW-W2-G11-BC.md` condition 12, official `components/MyData/Widgets/TeamActivityWidget/`, `components/MyData/Widgets/Common/TopicWidget/activityVerb.tsx`; closes R-W15-4

## Context

The stage-A card read the generic `/v1/activity` list with a product-owned
event-type filter dropdown, and its scope was the viewer's own activity.
Official's card reads `GET /v1/activity/my-feed` — what changed recently
on the assets the viewer, or one of their teams, owns — with 7 days, 21
rows fetched, 6 shown, and the count capped at "20+". The newest event
doubles as the card's summary (sentence + relative time). The empty state
has no call to action: quiet is not a setup problem.

## Decision

- The widget reads `getMyActivityFeed({ days: 7, limit: 21 })` through
  `useWidgetLoad` (60s TTL) and renders at most 6 rows.
- The count is read off the fetched page: over 20 shows "20+" instead of
  passing the cap off as the real number.
- The product's own event-type filter dropdown is **removed**: the feed is
  the viewer's own, unfiltered. No filter state survives in the widget.
- Rows render one translated sentence per event (`catalog/activitySentence`,
  a port of official `activityVerb`'s sentence-key table, with the actor
  and entity as slots; unmapped types read as a generic update). A row
  opens the entity through the product's existing `assetLocation` when
  the event names one.
- "View all activity" goes to the product's activity page
  (`{ name: 'activity' }`). Official's classic target is the user
  profile's Activity tab and its AI-mode target the inbox's My Assets
  activity path; the product has neither, so the full-feed page is the
  target and no tab parameter is invented.
- The empty state ("All quiet in your domains") has no action.

## Consequences

- `MyDataView` no longer feeds this card: the central loader's activity
  props and the `change-filter` / `open-activity` wiring are removed
  with the rewrite.
- The card's scope is now the `my-feed` scope (assets the viewer or
  their teams own), not the viewer's own edits — that is the R-W15-4
  closure.
