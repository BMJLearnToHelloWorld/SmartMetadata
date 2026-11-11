# Cross-service tableDiff resolves the table2 service's connection from the server entity

- **Status:** Accepted
- **Revisions:** v1 2026-11-11 (initial)
- **Deciders:** Bai (scope lock + 77 decisions 2026-11-07; H-Q-3.2); Wave 3 H serial review (REVIEW-W3-H-SERIAL.md, condition 10, APPROVE); implementation ruling `~/workspace/work/wave3-h-serial-7-logs/RULING-7.md` §2
- **Guard:** `smartmetadata-ingestion/tests/test_data_quality_table_diff.py` (cross-service compile, unmapped-type fail-closed, incomplete-connection fail-closed, credential grep)
- **Related:** `docs/decisions/2026-11-08-validator-compile-table-diff-params.md`, `docs/decisions/2026-11-08-test-suite-server-pull.md`

## Context

The H-③ setter only supported same-service diffs: both sides ran on the
workflow's configured source connection, and a `table2` on another service
failed closed. Official `TableDiffParamsSetter.get_parameters` resolves each
side independently: service1 through the workflow-resolved connection
(`_with_resolved_connection`), service2 through `ometa_client.get_by_id`
when the services differ, and renders each service's connection into a
data-diff URL or connection dict (`base_diff_params_setter.py:135-185`).
The product needs the same per-side resolution without importing the
official setter.

## Decision

1. **Connection source = server-side service-entity fetch.** New
   `RestClient.get_database_service_by_name`
   (`GET /v1/services/databaseServices/name/{name}`; `fields` is not sent —
   the service entity returns its connection by default). The setter takes
   it as `service_resolver` (wired in `TestSuiteWorkflow.prepare` via
   `ValidatorBuilder`); the left connection stays the workflow's configured
   source connection. Same-service diffs reuse the left connection
   (shallow-copied dict, as before). No `service2Url` parameter is read:
   official's `tableDiff.json` has no such parameter — the setter reads it
   only as an undefined-parameter fallback, and the product does not
   support it.
2. **Pipeline-config pass-through is rejected.** `SourceConfig` has no
   per-service connection map, and adding one would write service
   credentials into serializable pipeline config (Airflow DAG config can be
   exported and retained), against H-Q-1.3 (consumed credentials are never
   persisted). The TestSuite pipeline runs as the ingestion bot, so the
   server is expected to return the bot a complete connection; if live
   verification finds the server returning a masked connection to the bot,
   the cross-service case fails closed with a `WorkflowError` naming the
   service ("service connection incomplete"), never silently re-runs on the
   left connection, and no config override is added in this batch.
3. **Service-type mapping (ruling §2.2).** The entity's `serviceType` maps
   to the product `source_type` (lowercased): Postgres, Mysql, Mssql,
   AzureSQL, Snowflake, Databricks, UnityCatalog, Trino, ClickZetta. Any
   other type — Redshift, BigQuery, Athena, Oracle, SapHana, unknown —
   fails closed at compile time with a `WorkflowError` naming the service
   and the type; Redshift gets its own connector item and never reuses the
   postgres binding.
4. **Credential flow.** The fetched connection dict lives only in memory:
   server entity → setter → `DataDiffSideSpec.connection` → connector
   connect call. It is never written into config JSON (the pulled
   connection is not part of `DataDiffSpec`'s serializable surface beyond
   the in-memory side spec), never into a log call, never into a
   `TestCaseResultRecord` field, never into an exception message. The
   grep check: `password|privateKey|passPhrase|token|secret` in new code
   appears only inside connector connect calls. `SourceConfig.
   store_connection_secrets` (default False) governs the connector writing
   secrets back to the server on service-entity upsert; it is unrelated to
   this in-memory flow and is untouched.
5. **`table_profile_config` is carried raw.** `DataDiffSpec.
   table_profile_config` is the table1 entity's `tableProfilerConfig` as
   raw JSON (`TableContext.table_profiler_config`, parsed from the pulled
   entity; a non-dict value reads as `None`). No typed model is built for
   it: only its `profileSampleConfig` face is consumed (P2-2 sampling);
   modeling the other nine faces would be over-modeling. Only table1's
   config is read (official setter `:150`); table2's is not. The pull
   layer already fetches it (`source.py` `_TABLE_FIELDS` includes
   `tableProfilerConfig`).
6. **`caseSensitiveColumns` is written through.** `DataDiffSpec.
   case_sensitive_columns` (default False, official
   `get_bool_test_case_param`: "Boolean values are always False by
   default") is set from the parameter and consumed by the P2-1 engine for
   key and column-name matching. The setter canonicalizes user-supplied
   column names to the table's own spellings, so an insensitive match that
   differs in case still renders the real column name into SQL.
7. **Extra columns are constructed, not just validated.** `useColumns`
   wins when given; otherwise the default is the union of both sides'
   non-key columns; a per-side `table1.extraColumns` /
   `table2.extraColumns` parameter overrides the shared list for that
   side (official setter `:194-212` / `:238-251`). `DataDiffSideSpec.
   extra_columns` carries the per-side list (`None` = key-set mode, no
   value comparison). Key columns are excluded from the extra lists even
   when named in `useColumns` (they are compared as keys; pin's `_run`
   recomputation excludes them too). The schema diff is computed from the two pulled
   contexts in the setter and stored on `DataDiffSpec.schema_diff`; when a
   column diff exists, both sides' extra columns become the shared
   comparable set (common non-key columns minus incomparable ones), per
   official `_run` `:332-338`.
8. **`table2` is resolved with explicit fields.** `_table2_context`
   requests `fields="columns"` instead of relying on the server's default
   field set, so a default-field change cannot silently drop the columns
   the schema diff needs.

## Consequences

- Cross-service tableDiff compiles when both services have product
  data-diff bindings; otherwise it fails closed at compile time with the
  service and type named.
- The fetched service connection is an in-memory-only value. Any future
  change that persists a `DataDiffSpec` (or a side spec) must re-audit
  this flow; the credential grep check in the guard test pins the
  current boundary.
- Inline `DataDiffWorkflow` specs may carry `tableProfileConfig` in YAML
  (camelCase); unset means no sampling. Inline specs have no table
  metadata, so they carry no `schema_diff` and no `key_column_types` —
  the engine discloses that in the message instead of inventing metadata.
