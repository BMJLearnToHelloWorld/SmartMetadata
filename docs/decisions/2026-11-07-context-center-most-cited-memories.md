# Most-cited memories sort and count on `appliedCount`, never `usageCount`

- **Status:** Accepted
- **Revisions:** v1 2026-11-07 (initial)
- **Deciders:** Wave 1 W1-3
- **Guard:** `contextCenter.test.ts` (`appliedCount` mapped from the list payload); `ContextCenterOverviewView.test.ts` (most-cited card shows "Cited N times" in `appliedCount` order)
- **Related:** W1-3 review condition 6; `RULING-context-center.md` §4.1; C-D1 (b); upstream pin `a3012259ca` (`ContextCenter.constants.ts` `MOST_CITED_MEMORIES_LIMIT = 10`, `ContextCenterDashboardPage.tsx` `fetchMostCitedMemories`)

## Context

The overview's most-cited card fetches
`listContextMemories({ limit: 10, sortBy: 'appliedCount', sortOrder: 'desc' })`
and shows each memory's citation count. The product's `ContextMemory`
type and `mapContextMemory` had neither `appliedCount` nor `usageCount`,
so the card could not display a count at all. Official's per-row
`getMemoryCitations` falls back to `usageCount` only for row display;
the most-cited ordering and count itself is `appliedCount`.

## Decision

- `ContextMemory` gains `appliedCount?: number`, mapped in
  `mapContextMemory` from the server field of the same name.
- The most-cited card reads only `appliedCount` and renders
  "Cited N times" per entry. `usageCount` is not added and is never
  substituted for the citation count.
- If the deployment's memories carry no `appliedCount` (all 0/absent),
  the card shows its empty state rather than an invented ordering.
