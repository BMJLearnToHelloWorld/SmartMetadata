# My-data My Tasks card: one page, bucket chips, bulk resolve, product task links

- **Status:** Accepted
- **Revisions:** v1 2026-11-08 (initial); v2 2026-11-08 (follow-up: unresolved toast is error-toned per official; switching buckets clears the selection)
- **Deciders:** Bai
- **Guard:** `MyTasksWidget.test.ts`, `useMyTasks.test.ts`, `myTaskBuckets.test.ts`, `useBulkResolveTasks.test.ts`
- **Related:** Wave 2 G-11 B/C, `wave2/REVIEW-W2-G11-BC.md` condition 9, official `hooks/useMyTasks.ts`, `utils/myTaskBuckets.ts`, `components/MyData/Widgets/MyTasksWidget/`

## Context

Official `useMyTasks` reads one page of `GET /v1/tasks/assigned`
(limit 100, `statusGroup=open`, fields `assignees,createdBy,about,payload`)
with a 60s TTL; bucket chips are counted over the loaded page, `ALL` is the
server total, and the footer says "loaded X of Y" when the page is partial.
Bulk resolve settles per task (allSettled); unresolved tasks stay selected
for a retry. Official rows link into the inbox tabs the product does not
have.

## Decision

- The card is a direct port of that shape: one page, 60s TTL, bucket counts
  over the loaded page, `ALL` from the server total, partial-page footer.
- Row links are the product's own routes: a row opens
  `{ name: 'task', params: { id } }` (`/tasks/:id`) and "Open tasks" goes to
  `{ name: 'tasks' }` (`/tasks`). There is no inbox-tab target in the
  product, so no tab parameter is invented.
- `getTaskTitle` follows the product's existing convention (TaskDetailView:
  `displayName || name || id`), falling back to the description's first
  line when the name merely repeats the id. Official additionally composes
  a "<type> <entity>" title from its task-type message catalogue
  (`getTaskTypeMessageKey`); the product has no such catalogue, so that
  composed form is not ported — adding it would mean inventing the type
  labels. If the catalogue ever lands, this record is revised.
- Bulk resolve reuses `catalog/taskResolve.ts`: a task whose action needs a
  comment, a pick, or a root cause is left unresolved (kept selected),
  never resolved with the input missing.
- Switching buckets clears the selection (official `handleBucketChange`):
  a selection from another bucket must not linger invisibly into the
  bulk action.
- An unresolved bulk resolve reports with official's error toast
  ("{count} task(s) could not be resolved here. Open it/them in Tasks
  to finish."), not a warning.

## Consequences

- The card shows the same tasks the inbox shows (team assignments resolved
  server-side by `/tasks/assigned`).
- Titles for server-named tasks read from the description instead of
  repeating `#<taskId>`; they do not carry the official type prefix.
- Unresolved bulk selections stay selected with an error toast, so a
  retry does not lose the selection.
