# The service version page shows field diffs as a diff-rows table, not the pin's word-level diffs

- **Status:** Accepted
- **Revisions:** v1 2026-11-17 (initial) · v2 2026-11-20 (Decision corrected: the children table shares the detail page's column set but NOT its paging — paging follows the pin version page, 10 rows fixed)
- **Deciders:** service-detail parity synthesis (V1 gate: pin `ServiceVersionPage` read in full before building)
- **Guard:** `smartmetadata-ui/src/views/ingestion/ServiceVersionView.test.ts` (diff rows, versions timeline, permission deny, children table)
- **Related:** upstream pin `a3012259ca` (`pages/ServiceVersionPage/ServiceVersionPage.tsx`, `ServiceVersionMainTabContent.tsx`, `utils/EntityVersionUtilsPure.ts` `getCommonDiffsFromVersionData`); `GovernanceVersionView` (product diff-rows precedent)

## Context

The pin's version page diffs at word level: `getCommonDiffsFromVersionData`
produces diff-aware description and tags, rendered with inline highlighting
in the description block and the read-only tags panel, alongside the current
children table and the versions timeline. The product has no word-diff
renderer; its existing version views (`GovernanceVersionView`) present
`changeDescription` as a diff-rows table (field, old value, new value).

## Decision

The version page keeps the pin's structure — version header (display name,
FQN, version, read-only owner/tier/domain), a single main tab with the
current children table (the same column set as the detail page — the shared
column definition, tier and certification columns included — only for kinds
with a child fetcher), and the right-side versions timeline with
back-to-detail navigation — but presents the diff as a diff-rows table
(fields added/deleted/updated, old/new values) following the product
precedent. v1 said the children table had "the same column set and paging
as the detail page"; the paging half was wrong. The pin version page pages
with `usePaging()` at its default `PAGE_SIZE = 10`
(`ServiceVersionPage.tsx:92-98`, `constants.ts:58`), and the product
matches it (`ServiceVersionView.vue:356-359`, `useCursorPaging(10, [10])`,
fixed, no size selector) — not the detail main tab's 15/25/50 sizes
(design §3.6). The description shows the snapshot value, not a diff-aware
rendering, and there is no right tags panel; tag changes appear as diff
rows. Permission follows the pin's shape: the snapshot FQN's entity
permission, `ViewAll` or `ViewBasic`, denying closed on failure.

## Consequences

Word-level change highlighting is lost on this page; a reader sees which
fields changed and their old/new values, not which words within a field.
Porting the pin's word diff later means building the diff renderer once and
sharing it with the other version views — not bolting highlighting onto the
rows table.
