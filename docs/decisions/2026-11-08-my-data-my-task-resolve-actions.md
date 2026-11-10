# My-data task resolve actions: schema-less port of official taskResolve.utils

- **Status:** Accepted
- **Revisions:** v1 2026-11-08 (initial); v2 2026-11-08 (follow-up: open set gains ManualRevoke; legacy approve carries the normalized editable payload)
- **Deciders:** Bai
- **Guard:** `catalog/taskResolve.test.ts`
- **Related:** Wave 2 G-11 B/C, `wave2/REVIEW-W2-G11-BC.md` condition 9, official `components/discovery/personal-space/InboxPage/taskResolve.utils.ts`, `utils/TaskFormSchemaUtils.ts`, `utils/TaskUtils.ts`

## Context

Official resolves a task either through its workflow transition (when the
server lists `availableTransitions`) or through a legacy approve/reject
carrying `resolutionType` + `newValue` (+ the editable payload). The legacy
path is schema-less on the card: no form schema, so the approve builds the
payload from the raw payload with the normalized suggestion as fallback
(official `getEditableTaskPayload`, no uiSchema) rather than echoing the raw
payload verbatim. `DataAccessRequest` is NOT an approval handler — official
`DEFAULT_TASK_FORM_HANDLERS` has no entry for it, so its legacy approve
carries no `newValue` sentinel, only the echoed payload.

## Decision

- `catalog/taskResolve.ts` ports `getTaskResolveActions` /
  `buildResolveBody` / `needsTaskActionInput` / `getTaskActionInput`
  without a form-schema layer: approval-handler types are only
  GlossaryApproval / RequestApproval (sentinel newValue
  'approved'/'rejected'); suggestion types use the product's existing
  `getTaskResolutionNewValue`.
- The open set is official `OPEN_TASK_STATUSES` verbatim (inbox.utils,
  mirroring `TaskBucketSql.SHARED_OPEN_STATUSES`): Open, InProgress,
  Pending, **ManualRevoke**.
- The legacy approve payload is official `getEditableTaskPayload` with
  no uiSchema: DescriptionUpdate carries `fieldPath` + `currentDescription`
  + `newDescription`, TagUpdate carries `fieldPath` + `currentTags` +
  `tagsToAdd` + `tagsToRemove`, each taken from the raw payload with the
  normalized suggestion (`normalizeTaskSuggestion`) as fallback; every
  other type echoes the raw payload unchanged.
- `mapTask` keeps `rawPayload` for non-DataAccessRequest tasks so the
  legacy approve can echo it; DataAccessRequest tasks keep the typed
  `payload` and no `rawPayload` duplicate.
- Legacy approve/reject is offered only for open tasks; incidents are
  excluded (they resolve through their own transition with a root cause),
  as are ontology-review and revision-request tasks.

## Consequences

- Bulk and single resolves from the My Tasks card behave exactly as the
  inbox's one-at-a-time resolve does.
- A DataAccessRequest approve never invents a newValue the official
  handler would not send.
