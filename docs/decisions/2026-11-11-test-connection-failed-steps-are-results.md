# A failed test connection is a test result, not a server error

- **Status:** Accepted
- **Revisions:** v1 2026-11-11 (initial)
- **Deciders:** Bai (scope: fix the supported types first, mirror official)
- **Guard:** `smartmetadata-ingestion/tests/test_automation_execute.py` (failed run returns a Failed result) + `smartmetadata-airflow-apis/tests/test_airflow_apis.py` (run_automation 200 / 400 / 500 mapping)
- **Related:** `~/workspace/work/test-connection-diagnosis/REPORT.md`

## Context

Clicking "test connection" on a service failed twice in a row, for two
different reasons. The first click failed because the plugin masked every
execution failure as a generic 500 (`{"error": "An unexpected problem
occurred"}`), which the server turned into a 400 — so a MySQL service whose
host simply does not resolve (`seed.invalid`) looked like a broken
executor. The second click then failed with 409 because the failed run had
left a soft-deleted workflow holding the fixed `<Type>.testConnection`
name.

Official's design treats a failed connection as a test outcome: the
definition-driven `TestConnectionRunner` runs each definition step, records
a failed step (with a diagnosis) instead of raising, and patches the
workflow with the `TestConnectionResult` — the UI renders the failed steps.
Only a failure before any step runs (a missing definition) escapes as an
error, and even then the workflow is patched Failed first.

The product's executor ran a single probe (connect + `SELECT 1`) for the
only supported type (MySQL) and raised on any failure; it never built a
`TestConnectionResult` and nothing ever patched the workflow, so the UI
poll (which waits for status `Successful`/`Failed`) could never complete
even on a successful test.

## Decision

- The executor is definition-driven: it fetches the
  `TestConnectionDefinition` from the server and runs its steps in order
  against the type's checks (MySQL: `CheckAccess`, `GetSchemas`,
  `GetTables`, `GetViews`, `GetQueries`, per the pinned definition). A
  missing check is a visible `Skipped` step (`NotImplemented`), never a
  crash; once a `ConnectionGate` step fails the rest are skipped as
  `ConnectionNotEstablished`. The final status is `Successful` only when
  every mandatory step passed.
- A completed test — pass or fail — returns the `TestConnectionResult` and
  the plugin answers 200 with it. The workflow is patched after each step
  (`Running`) and finally (`Successful`/`Failed`, mirroring the result),
  using the same JSON Patch shape as official's
  `patch_automation_workflow_response` (`add /response`, `add /status`).
  A failed write-back is logged, never raised.
- An unsupported service type raises `UnsupportedServiceTypeError`; the
  plugin answers 400 with the reason in plaintext. No new executor is
  added by this decision.
- Only infra failures (workflow fetch, definition fetch, unusable request)
  raise `AutomationError` and stay the masked 500.

## Consequences

- The UI renders failed steps instead of a generic error, and the poll
  completes on every run — the failure that used to read as "executor
  broken" now reads as the step that failed.
- The 200 body is the raw `TestConnectionResult`; the server echoes it as
  the trigger response's `reason` and the UI ignores it (it polls the
  workflow), exactly as before.
- Known gaps (not in this batch): per-step timeouts (official caps each
  step at 60s) and failure classification into `diagnosis` (official maps
  error chains to titled diagnoses; failures here carry only `errorLog`,
  except the empty-catalog caveats). Both are recorded here so a later
  batch can close them without re-litigating the result contract.
