# Recently-viewed pages live in localStorage, keyed by user name

- **Status:** Accepted
- **Revisions:** v1 2026-11-07 (initial)
- **Deciders:** Wave 1 W1-3
- **Guard:** `stores/contextCenterRecent.test.ts` (dedupe, ordering, 10-item cap, per-user isolation, corrupt-JSON tolerance, no-user no-op); `ContextCenterOverviewView.test.ts` (recently-viewed card renders recorded entries)
- **Related:** W1-3 review condition 7; C-D1 (b); C-D2 (b) (G-19 right panel reuses this module in Wave 2); upstream pin `a3012259ca` (`utils/KnowledgePageUtils.tsx` `addToKnowledgeCenterRecentViewed`, `hooks/currentUserStore/useCurrentUserStore.ts`)

## Context

Official keeps `recentlyViewedQuickLinks` in the persisted user-preference
store (localStorage, key `user-preferences-store`) and syncs only
`appMode` to the server (`BACKEND_SYNCED_KEYS`) — recent views never
leave the browser. Official keys the preference by `currentUser.name`.
The product's `shellPreferences.ts` keys are global (no per-user
segment), so that pattern must not be copied for this store.

## Decision

- A shared module, `stores/contextCenterRecent.ts`, owns all reads and
  writes, so the overview card and Wave 2's G-19 right panel import the
  same source. Nothing about recent views lives inside a view component.
- The storage key is per user, segmented by `LoginUser.name`:
  `sm.contextCenter.recentlyViewed.v1:<name>`. `name` is chosen over `id`
  because official keys by `currentUser.name`; the name is the stable
  login identity in this product. With no logged-in user, nothing is
  recorded and nothing throws.
- Rules mirror official exactly: same id keeps only the newest entry,
  entries sort by `timestamp` descending, at most 10 are kept, only
  localStorage is written (no server sync), and every write is wrapped
  in try/catch — a corrupt stored JSON value is treated as empty, never
  a white screen.
- Stored entry: `{ id, title, pageType, pageUrl?, fqn?, timestamp }` —
  the fields the card needs to render and to navigate (articles route
  to detail; quick links open the external URL in a new tab with
  `noopener,noreferrer`).
- Record points: article list `openPage`, overview `openArticle`, and
  article detail after a successful `loadDetail`. Re-recording the same
  page is idempotent by the dedupe rule.
