# My-data widget loading shares one bounded cache, keyed per widget, invalidated on principal change

- **Status:** Accepted
- **Revisions:** v1 2026-11-08 (initial)
- **Deciders:** Bai
- **Guard:** `features/home/widgets/PlatformHealthWidget.test.ts`, `features/home/widgets/useMyTasks.test.ts`
- **Related:** Wave 2 G-11 B/C, `wave2/REVIEW-W2-G11-BC.md` condition 6, upstream `AGENTS.md` ("All caches MUST be bounded")

## Context

The eight stage-B cards each fetch their own data, but they share the
same loading semantics: a 5-minute TTL, keep-previous-data on refetch,
in-flight deduplication, and a skeleton/error/retry card chrome. Official
does this with react-query; the product must not introduce vue-query, so
the shared behaviour lives in one composable, `useWidgetLoad`.

## Decision

- `useWidgetLoad(key, loader, { ttlMs, enabled })` in
  `features/home/widgetLoad.ts` is the single loading primitive for all
  eight cards: ref/string keys, 5-minute default TTL, previous data kept
  across a refetch, concurrent calls for the same key deduplicated.
- The module-level cache is **bounded at 100 entries**; the oldest entry
  is evicted on insert. A key change clears the data first — a bucket
  switch shows its skeleton, never the other bucket's rows.
- The cache is keyed by widget, not by principal, so
  `resetWidgetLoadCache()` is wired into the permission store's
  `ensureFresh` and `resetPermissions`: a logout/login switch must not
  serve the previous viewer's rows.

## Consequences

- No card invents its own loading state machine; the retry and skeleton
  behaviour is identical across cards.
- The 100-entry cap keeps the cache from growing with the layout; the
  principal-change invalidation keeps it from leaking across sessions.
