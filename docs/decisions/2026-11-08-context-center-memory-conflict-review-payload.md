# Context Center memory conflict review payload and resolve contract

- **Status:** Accepted
- **Revisions:** v1 2026-11-08 (initial)
- **Deciders:** Wave 2 W2-1 (G-21)
- **Guard:** `tasks.test.ts` (reviewPayload mapping, malformed entries skipped); `MemoryConflictReviews.test.ts` (count, cursor load-more, admin vs assigned endpoint); `MemoryConflictCompareModal.test.ts` (nine diff rows, resolve payloads, reload on refusal); `contextCenterMemories.test.ts` (disputes, recency, diff rows, readiness)
- **Related:** W2-1 review conditions 4, 5; C-D6 (a); upstream pin `a3012259ca` (`useMemoryConflictReviews.ts`, `MemoryConflictReviews.utils.ts`, `MemoryConflictCompare.utils.ts`, `MemoryConflictCompare.tsx`)

## Context

A memory conflict review is a `MemoryConflictReview` task whose payload
carries `disputes: [{memory, detectedAt}]`. Official lists open reviews
(`limit: 1` for the count, 20 per page by cursor), reads each review's
title from the disputed memory, and resolves by keeping one side:
keep-reviewed is the `approve` transition (`resolutionType: Approved`),
keep-approved is `reject` (`resolutionType: Rejected`), both carrying
`payload: {compared: [{id, contentUpdatedAt}]}` so the server can refuse
a decision made on a stale read.

## Decision

- `CollaborationTask.reviewPayload` is mapped only for
  `MemoryConflictReview` tasks. Malformed dispute entries (no memory
  `EntityRef`) are skipped; a non-review task never carries
  `reviewPayload`. `detectedAt` is an epoch-millis number, per the
  product timestamp convention.
- List source: admins read `listTasks`, non-admins read
  `listMyAssignedTasks` (official: every open review for an admin,
  otherwise the ones assigned to the user or their teams). The review
  list requests `fields: 'about,createdBy,payload'` via the `listTasks`
  fields override — the default task list fields do not include
  `payload`, and the override is additive (default unchanged).
- The count query is `limit: 1`; the list is cursor-paged 20 per page
  (cursor, not offset — the memory list's offset rule does not apply
  here). Review titles come from `getContextMemoryById(review.about.id,
  MEMORY_FIELDS)`; a failed title read falls back to the about ref's
  display name.
- The compare modal shows the disputed (current, left) and reviewed
  (proposed, right) memories as nine diff rows (title, memory, question,
  type, linked assets, visibility, tags, source, owners). A side that
  cannot be read is `gone` (404), `hidden` (403), or `failed`; a decision
  needs both sides readable (`getReadiness`): reject needs both sides
  ready, approve needs all disputed sides ready. The review search box
  stays disabled in review mode (official has no search there).
- Resolve posts `{transitionId, resolutionType, payload: {compared}}`.
  On refusal the modal shows the failure and reloads both sides instead
  of failing silently, because the server rejects on optimistic
  concurrency. After a successful resolve the review list and the tab
  counts refresh; the inbox unread count is re-read by `InboxView` on
  mount (no global unread store exists, none is created).
