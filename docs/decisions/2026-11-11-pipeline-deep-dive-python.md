# Pipeline deep-dive Python fixes: flush accounting, failure writeback, five builders, regex scope, nested validation, secret references, deploy registration

- **Status:** Accepted
- **Revisions:** v1 2026-11-11 (initial)
- **Deciders:** Bai, 默默来帮忙
- **Guard:** `smartmetadata-ingestion/tests/test_bulk_sink.py`, `test_workflow.py`, `test_select.py`, `test_mysql.py`, `test_secrets.py`, `test_client.py`; `smartmetadata-airflow-apis/tests/test_builders.py`, `test_translation.py`, `test_airflow_apis.py`, `test_backends_deploy.py` (targeted pytest; see the implementation report for the exact commands)
- **Related:** `~/workspace/work/pipeline-deep-dive/REPORT.md` §7.1–7.3, §8 (C-01), §12; upstream pin `a3012259ca`

## Context

The pipeline deep-dive (REPORT.md) found seven Python-side defects in how
pipelines deploy, run and report:

- A whole-batch bulk 400 was counted as if every record had landed: the
  workflow reported `succeeded == buffered count` and `success` while the
  server had stored nothing (live incident).
- A failed run overwrote the stored pipeline status with a bare build,
  erasing the steps and start date the workflow had already written.
- Five pipeline types (`dbt`, `autoClassification`, `TestSuite`,
  `elasticSearchReindex`, `application`) had no DAG builder, so deploy
  failed 500 at DAG import.
- Filter patterns were matched as exact lowercased names and any regex
  was rejected at deploy time, although the runner and the official
  `FilterPattern` are regex-based.
- Deploy validation checked only top-level fields: a wrong-typed nested
  field (`airflowConfig.scheduleInterval: 5`, `service.type: "noSuch"`)
  passed validation and failed at DAG-parse time after files were written.
- The deployed config JSON carried the resolved JWT in plaintext even
  when a secrets manager was configured.
- Deploy reported 200 for a DAG the Airflow processor kept failing to
  import, because registration was judged by the serialized row alone.

## Decision

### P-01 — only truly-flushed records count as succeeded

`BulkMetadataRestSink` accumulates a `FlushResult` per flush: `succeeded`
counts come from the real `BulkOperationResult` shape
(`len(successRequest)`), and each failed payload becomes one
`FlushFailure` (kind, label, server message). A whole-batch HTTP error
(`RestError` / `httpx.HTTPError`) becomes one failure per buffered
payload. A response with neither `successRequest` nor `failedRequest`
(e.g. an empty-body 200, which `RestClient.request()` returns as `None`)
fails closed: one failure per payload, zero succeeded — an unobservable
flush must never count as a success. The workflow drains the result after every write
(`take_flush_result()`) and from `flush()` at close; failures become
per-record `RecordFailure`s in the report. `final_pipeline_state` is
unchanged (failed == 0 → success; succeeded > 0 → partialSuccess; else
failed). The sink's `flush()` returns the drained result; sinks without
`take_flush_result`/`buffers` keep the old immediate-count behaviour.

### P-02 — the failure callback fetches the stored status first

`_write_failed_status` fetches the stored row via
`RestClient.get_pipeline_status` (`GET
/v1/services/ingestionPipelines/{fqn}/pipelineStatus/{runId}`) and
changes only `pipelineState="failed"` and `endDate`. Steps, start date
and counts stay. `triggeredBy` is never written (a server audit field
the PUT handler nulls anyway). A 404, or a client without the getter,
falls back to the bare build. The callback never raises.

### P-06 — five builders; testSuite derives its connection at parse time

Builders for `dbt`, `autoClassification`, `TestSuite`,
`elasticSearchReindex` and `application` use the official task names
(`dbt_task`, `auto_classification_task`, `test_suite_task`,
`elasticsearch_reindex_task`, `application_task`). testSuite passes
`raise_on_error=False` (profiler precedent); the other four pass the
pipeline's own value through. testSuite's connection is derived at
DAG-parse time from the table named by
`sourceConfig.config.entityFullyQualifiedName` (table → its service
reference → that service's live connection, so a rotation takes effect
on the next parse); a suite with no single table fails loudly
(`TranslationError`). `testCases` are normalized to case names (string
as-is; dict → `name`, else the last segment of `fullyQualifiedName`).

**Deliberate partial mapping (amended in review, 2026-11-12):** the four
non-testSuite builders deploy with the official task names and importable
DAGs, but no runner implements their types yet — the pin runs these through
`metadata_ingestion_workflow` with a type-specific source (`dbt`,
`metadata_elasticsearch`) or a dedicated workflow class
(`AutoClassificationWorkflow`, `ApplicationWorkflow`), none of which the
product has. Running them as a metadata ingestion would be a silent wrong
success, so `run_workflow` raises `WorkflowExecutionError` ("no runner
implemented for pipeline type ...") instead: with `raiseOnError` the
Airflow task fails and the run is recorded failed with that diagnostic;
without it the task stays green per the existing contract and the run
reports nothing — never a success. Dedicated runners are future work;
nothing is invented here. Also fixed in passing: `TYPE_TO_TASK` keyed
`"testSuite"` (lowercase) while the server sends `"TestSuite"` (schema
enum), so TestSuite validation rejected every real pipeline — the key is
now `"TestSuite"`, matching official
`PipelineServiceClientInterface.TYPE_TO_TASK`.

### P-11 — FilterPattern is a regex; ignored switches are surfaced

`is_selected` matches includes/excludes as regular expressions
(`re.match` — prefix match from the start of the name, case-insensitive,
per the pin's `filters.py:_filter`); `.*` includes all; empty includes
means all; excludes win; an invalid regex fails loudly (`ValueError`).
`translate_filter_pattern` passes patterns through verbatim; only
malformed structure (non-dict pattern, non-list includes/excludes)
raises `TranslationError`. `tableFilterPattern`, `includeViews` and
non-literal patterns are no longer rejected at deploy time.
`generateSampleData` / `storeSampleData` reach the runner only for
messaging services; `sampleDataQuery` and `enableDataProfiler` have no
runner capability anywhere. Anything ignored is surfaced at deploy time
(warning log + `"; ignored source switches: <names>"` appended to the
deploy message; the official message stays the prefix) so a successful
deploy never silently under-ingests. The 11 SQL connectors gate their
`produce()` loops on `is_selected_table` (view gate first, then the
table regex); view-lineage enumeration is untouched (it resolves edges,
not tables).

### P-32 — nested deploy validation, before any file is written

`validate_ingestion_pipeline` additionally checks: `airflowConfig`
fields by type (`scheduleInterval` str-or-null; `maxActiveRuns`,
`retries`, `retryDelay`, `workflowTimeout`, `concurrency`, `endDate`
int-or-null — booleans excluded; `pausePipeline`, `pipelineCatchup`
bool-or-null); `service.type` in the known service types;
`pipelineType` in a registered builder. All violations report together
as a 400 naming field locations, before the store writes anything.
Consequence: `dataInsight`, `policyAgent` and `reverseMetadata` (in
`TYPE_TO_TASK` but with no builder, as in official) now fail 400 at
deploy instead of 500 at DAG import — a deliberate fail-fast.

### P-39 — the secret reference lives on disk; resolution happens at use

`dump_with_safe_jwt` (port of official `operations/deploy.py`) writes
the JWT in its stored form: a `secret:<id>` reference when the server
sent one, the plaintext token when no secrets manager is configured —
never resolved at dump time. `resolve_secret` resolves a reference at
DAG-parse time (`_server_config`) and at run time (`_server_client` in
the automation executor): the `db` provider (and no provider) returns
the id itself (official `DBSecretsManager` semantics); any other
provider needs a registered resolver, otherwise it raises loudly —
the literal reference is never handed to a client as a Bearer. The
plugin cannot manufacture a `secret:<id>` from a plaintext token; the
reference form comes from the server. **No cloud secrets-manager
clients exist in the product yet** — a pipeline whose provider has no
registered resolver fails closed at deploy (DAG-parse time). The
resolved plaintext token is baked into the in-memory translated
`WorkflowConfig` (and hence Airflow's serialized DAG); that is
pre-existing behaviour, not worsened by this change.

### P-40 — deploy syncs first, waits only when it must

Deploy takes the parsed DAG and, when it has `sync_to_db` (guarded by
`hasattr`), syncs it to the DB and skips the wait; otherwise it scans
in the background and waits up to 60s for registration. `_is_registered`
additionally requires `not row.has_import_errors` (official
`_wait_for_dag_registration`), so a DAG with import errors but an
existing serialized row no longer counts as registered. A sync failure
is a deploy failure, never a reason to fall back to waiting. On
Airflow 3.3.2 `DAG` has no `sync_to_db`, so the wait path is the live
one there.

## Consequences

- Bulk failures are visible in the report and the pipeline state; the
  live incident shape (1 database + 2 schemas landed, tables 400) now
  reports `succeeded == 3`, `failed == 2`, `partialSuccess`.
- Failed-run writebacks preserve the run's history; the bare-build
  fallback remains for 404s and old clients.
- All nine registered pipeline types deploy; three types remain
  builder-less by design and now fail 400 at deploy.
- Regex scope works end to end (deploy → translate → connector);
  previously accepted deploy bodies that were rejected for scope now
  deploy, and the deploy message names any ignored switches.
- External-secrets-manager pipelines cannot deploy until a resolver
  client for their provider exists in the product — that client is the
  known follow-up, not something this change pretends to provide.
- Deploy on Airflow 3.3.2 still waits for registration; the sync fast
  path activates on Airflow versions whose `DAG` exposes `sync_to_db`.
