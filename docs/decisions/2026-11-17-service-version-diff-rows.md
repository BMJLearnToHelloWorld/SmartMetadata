# The service version page shows field diffs as a diff-rows table, not the pin's word-level diffs

- **Status:** Accepted
- **Revisions:** v1 2026-11-17 (initial)
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
current children table (same column set and paging as the detail page, only
for kinds with a child fetcher), and the right-side versions timeline with
back-to-detail navigation — but presents the diff as a diff-rows table
(fields added/deleted/updated, old/new values) following the product
precedent. The description shows the snapshot value, not a diff-aware
rendering, and there is no right tags panel; tag changes appear as diff
rows. Permission follows the pin's shape: the snapshot FQN's entity
permission, `ViewAll` or `ViewBasic`, denying closed on failure.

## Consequences

Word-level change highlighting is lost on this page; a reader sees which
fields changed and their old/new values, not which words within a field.
Porting the pin's word diff later means building the diff renderer once and
sharing it with the other version views — not bolting highlighting onto the
rows table.
