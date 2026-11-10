# TestSuite workflows pull test definitions from the server; the inline TestCaseSpec path stays only as transitional compat

- **Status:** Accepted
- **Revisions:** v1 2026-11-08 (initial)
- **Deciders:** Bai (scope lock + 77 decisions 2026-11-07; H-Q-2.2, H-Q-3.2); Wave 2 H-track review (REVIEW-W2-H-TRACKS.md, conditions 10/11/12, APPROVE)
- **Guard:** `smartmetadata-ingestion/tests/test_data_quality_pull.py` (pull paths, paging, 404 fail-closed, empty-suite fail-closed, name filter), `smartmetadata-ingestion/tests/test_data_quality_validators.py` (per-case Aborted on unbuildable definitions)
- **Related:** `~/workspace/work/milestone-20261107/RULING-data-execution.md` §2 (b), `~/workspace/work/milestone-20261107/wave2/REVIEW-W2-H-TRACKS.md` §2-③, `docs/decisions/2026-11-08-validator-compile-table-diff-params.md`

## Context

The product `TestSuiteWorkflow` was purely config-driven: `config.test_cases`
(`TestCaseSpec{test_case_fqn, expression, expected}`) ran one scalar SQL each
through the connector quality interfaces. The official workflow never does
that as its main path: `TestSuiteWorkflow` pulls the TestSuite entity from the
server (`TestSuiteSource`: suite → cases → testDefinition + parameterValues)
and compiles each case with `ValidatorBuilder`. The product server already
exposes the read endpoints (`GET /v1/dataQuality/testSuites`,
`GET /v1/dataQuality/testCases?testSuiteId=…`, `GET …/name/{name}`); only the
ingestion client lacked methods for them.

## Decision

1. **Pull layer first.** `RestClient` gains the read methods
   `list_test_suites`, `get_test_suite_by_id`, `get_test_suite_by_name`,
   `list_test_cases` (paged, `testSuiteId` filter, `fields=testSuite,
   entityLink,testDefinition`) and `get_table_by_name`. They live in the
   marked "Data-quality pull (Wave 2 H track 3)" section of
   `client/rest.py`; the Sampler messaging chain (H track 1) adds its
   sample-data write methods in the marked section below it. No second REST
   client is ever built for this.
2. **Source shape mirrors official `TestSuiteSource`.** `data_quality/source.py`
   `pull_test_cases` takes the table FQN from
   `source.entityFullyQualifiedName` for a table suite (table entity →
   its `testSuite` → cases by `testSuiteId`), and falls back to a logical
   suite named `source.service_name` when no FQN is given (cases grouped by
   the table FQN in each case's `entityLink`, one table entity fetched per
   group). `source.test_case_names` filters cases by name, like official
   `TestSuitePipeline.testCases`.
3. **Fail-closed, never silent fallback.** A missing suite/table (HTTP 404),
   an unreachable server, a table with no executable test suite, or a suite
   with zero cases (after filtering) raises `WorkflowError` at prepare time.
   The pulled path never falls back to the inline `test_cases` list.
4. **Pulled is the default path.** A `TestSuite` workflow with
   `entityFullyQualifiedName` set, or with an empty inline `test_cases`
   list, runs the pulled path. Combining `entityFullyQualifiedName` with a
   non-empty inline `test_cases` list is a configuration error
   (`WorkflowInitializationError`). The inline path keeps working unchanged
   for configs that still carry `test_cases` and no FQN — transitional
   compat only, not a second supported mode.
5. **Per-case failure is an Aborted result, not a failed run.** A case whose
   definition has no validator in this batch, or whose execution raises,
   writes a `TestCaseResultRecord` with status `Aborted` and the reason in
   `result`, and the run continues with the next case — the official
   `TestCaseRunner` shape. Only pull-level failures (decision 3) fail the
   run.
6. **No suite auto-creation this batch.** Official `TestSuiteSource` creates
   an executable suite when the table has none; the product fails closed
   with a message telling the operator to create the suite in the UI. The
   created suite would have zero cases, so creation adds no executable work
   this batch; it is a follow-up, not a silent gap.
7. **Single-connection logical suites only.** The workflow runs every pulled
   case against the one configured source connection. A logical suite whose
   cases span services with different connections fails closed at the case
   that needs another connection (the tableDiff cross-service case is the
   concrete one; see the companion record). Per-service connection
   resolution from the server is Wave 3 work, not re-decided here.

## Consequences

- A `TestSuite` run with no inline cases now requires a real suite on the
  server; a typo'd suite name fails loudly at prepare time instead of
  running zero tests and reporting success.
- The inline `TestCaseSpec` path is frozen: no new features are added to it,
  and it must not be used to smuggle a tableDiff case past the compiler
  (the companion record forbids tableDiff in `TestCaseSpec{expression}`).
- Live verification of the pulled path needs a real suite with real cases on
  the deploy server; unit tests cover the pull/compile shapes only.
