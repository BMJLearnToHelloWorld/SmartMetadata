# Test-connection workflow cleanup is a single hard delete

- **Status:** Accepted
- **Revisions:** v1 2026-11-11 (initial)
- **Deciders:** Bai (scope: fix the supported types first, mirror official)
- **Guard:** `smartmetadata-ui/src/views/ingestion/ServiceDetailView.test.ts` (exactly one DELETE with `hardDelete=true` on trigger failure and on success)
- **Related:** `~/workspace/work/test-connection-diagnosis/REPORT.md`, ADR:2026-11-11-test-connection-failed-steps-are-results

## Context

A test-connection run creates a workflow named `<Type>.testConnection`
(a fixed name per service type, not a unique one) and deletes it when the
run ends. The UI deleted it twice on trigger failure — once in the
trigger's `.catch`, once in the outer `catch`, because the first delete did
not clear the id — and both deletes were soft deletes. A soft-deleted row
keeps its name under the unique constraint, so the next run's create hit
409 `Entity already exists`. The same applied to the success path: a
successful run's soft-deleted workflow also blocked the next run.

Official deletes the test-connection workflow with hard delete
(`deleteWorkflowById(workflowId, true)` in `TestConnection.tsx`).

## Decision

- Every cleanup delete of a test-connection workflow is a hard delete
  (`DELETE /v1/automations/workflows/{id}?hardDelete=true`), on the
  trigger-failure path and on the completion path alike. The workflow
  resource supports `hardDelete` as a query parameter.
- The trigger failure path deletes once and clears the workflow id before
  rethrowing, so the outer catch does not delete a second time.
- A polling timeout still leaves the workflow in place (deleting an
  unfinished run would hide its state), as before.

## Consequences

- Re-running "test connection" immediately after a failure or a success no
  longer 409s; the name is freed the moment cleanup runs.
- Hard delete is permanent for that workflow entity — acceptable because a
  test-connection workflow is a transient run record, not user data, and
  official does the same.
