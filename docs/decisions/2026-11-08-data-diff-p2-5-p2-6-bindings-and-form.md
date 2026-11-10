# Data Diff P2-5 bindings and P2-6 form: three new bindings, form-to-spec mapping, render-only-what-is-computed

- **Status:** Accepted
- **Revisions:** v1 2026-11-08 (initial)
- **Deciders:** Wave 2 H track ⑤ (Data Diff P2-5/P2-6)
- **Guard:** `smartmetadata-ingestion/tests/test_data_diff_p2_bindings.py` (registry, per-binding parameter dicts, per-dialect key SQL, stub-driver connect kwargs) and `smartmetadata-ui/src/features/quality/TableDiffFields.test.ts` + `src/views/quality/TestCasesListView.test.ts` (tableDiff create flow) + `src/views/quality/TestCaseDetailView.test.ts` (measured-values rendering, edit save)
- **Related:** Phase 1 key-set differ (Wave 0, PR #145; no ADR was written for it), REVIEW-W2-H-TRACKS.md conditions 2/13/14, RULING-data-execution.md (H group), DECISIONS-RESOLVED.md H-Q-3.2

## Context

Phase 1 (Wave 0, #145) shipped a clean-room key-set differ for postgres, mysql,
mssql, oracle, snowflake and redshift-registered dialects, driven by a
`DataDiffSpec` carried in the test-case parameter values. P2-5 extends the
binding surface to the three remaining official data-diff dialects the product
has a connector story for — trino, azuresql, clickzetta — and P2-6 gives the
tableDiff test definition a real form (official `TableDiffFields.tsx`) plus a
result presentation that only shows what the engine actually computed.

Official evidence (pin `a3012259ca`): `TrinoTableParameter` and
`AzureSQLTableParameter` only override `get_data_diff_url` to inject the
table-specific catalog/schema (trino) or database/schema (azure sql);
`ClickzettaTableParameter` only registers a custom data-diff adapter whose
dialect quotes identifiers with backticks and hashes with MD5-as-hex. Official
`SUPPORTED_DIALECTS` groups AzureSQL under the `mssql` dialect. Official
`table_diff_params_setter.py` parses array parameters with `ast.literal_eval`
(empty `keyColumns` falls back to PK then UNIQUE), resolves `table2` by FQN,
and renders `removedRows` / `addedRows` / `changedRows` / `diffCount` (plus
`columnDiffCounts` when present) into the test result.

## Decision

### P2-5 — three bindings, one per official dedicated module

- `TrinoTableParameter.build(connection, *, catalog, schema, table, key_columns)`
  returns `{type: "Trino", scheme, hostPort, catalog, schema, table, keyColumns,
  dialect: "trino"}`; the connection is built lazily from `trino.dbapi` with
  `BasicAuthentication` only when a password is present (http_scheme https iff
  a password is set, else http), per the official Trino connection shape.
- `AzureSQLTableParameter.build(connection, *, database, schema, table,
  key_columns)` returns `{type: "AzureSQL", scheme (default `mssql+pyodbc`),
  hostPort, database, schema, table, keyColumns, dialect: "mssql"}`. The
  connect path reuses `mssql_common` (same TDS wire protocol, same `mssql`
  dialect — the binding identity stays distinct: its own `type`, its own
  registry entry). No new driver extra: the mssql extras already cover it.
- `ClickzettaTableParameter.build(connection, *, database, schema, table,
  key_columns)` returns `{type: "ClickZetta", scheme, hostPort, workspace:
  database, schema, table, keyColumns, dialect: "clickzetta"}`; the connect
  path is lazy `clickzetta.connector.v0.dbapi` with the official host split
  (`<instance>.<service>`, official `url.py` `_split_host_port`); quoting is
  strict backticks per the official dialect (an identifier that does not match
  `^[A-Za-z_][A-Za-z0-9_$]*$` raises `WorkflowError`, it is never escaped).
  New extras: `trino = ["trino[sqlalchemy]"]`,
  `clickzetta = ["clickzetta-connector==1.0.30"]` (official pin versions).
- Redshift stays unbound by design: it is a separate connector item
  (R-H-6), never masqueraded as postgres. BigQuery / Athena / Oracle /
  SapHana are not built — the product has no connectors for them. No binding
  registers a metadata source (`registry.py` untouched): `DataDiffWorkflow`
  never calls a source's `produce()`, tables come from the config.
- No binding is live-verified: there is no real Trino / Azure SQL /
  ClickZetta database in this environment. The tests assert parameter
  construction, per-dialect key SQL, strict quoting, and connect-factory
  kwargs against stub driver modules — never a live claim.

### P2-6 — form field to DataDiffSpec mapping

| Form field | Stored as | Consumed by |
|---|---|---|
| `table2` (FQN, required) | test-case parameter value | P2-3 compiler: right-hand side (FQN split) |
| `keyColumns` | JSON array string | P2-3 compiler: left `key_columns` |
| `table2.keyColumns` | JSON array string | P2-3 compiler: right `key_columns` (defaults to `keyColumns`) |
| `where` | plain string | P2-3 compiler: `where_clause` |
| `threshold` | plain string | P2-3 compiler: `threshold` |
| `useColumns` | JSON array string | P2-3 compiler / P2-1 engine (column projection); **not** carried by the Phase 1 `DataDiffSpec` (key-set comparison does not use it) |
| `caseSensitiveColumns`, `parallelQueries` | plain strings | P2-3 compiler / P2-1 engine; stored on the test case, not in the Phase 1 spec |

- Array parameters are encoded as JSON array strings (`["id","code"]`). The
  P2-3 compiler parses with `ast.literal_eval` per official, which accepts
  both the JSON and the Python-literal spelling; the form decoder also accepts
  a hand-typed comma list, so legacy values keep working.
- `table2` is an async table search (official behaviour); swapping or
  clearing it resets `table2.keyColumns` (edit-prefill is protected: the
  reset only fires on a change after mount). Key and use columns exclude each
  other (official cross-exclusion). Column lists come from
  `GET /v1/tables/name/{fqn}?fields=columns` (new thin client
  `api/tables.ts`), because `SearchHit` drops `columns` — the same lesson as
  G-19. A column-load failure shows a hint and never blocks typing.
- The edit modal reuses the same component; if the definition fetch fails it
  falls back to the plain-text parameter editor (honest degradation, not a
  silent empty form).

### P2-6 — result rendering: only what was computed

- The detail view renders `testResultValue` entries as `name: value` lines
  (new `TestCaseResult.testResultValue` on the UI type; the server sink
  already writes it). A run without entries shows `—`.
- Fields the engine did not compute (`changedRows`, `columnDiffCounts`,
  schema-diff fields) are never rendered as placeholders or fake data; their
  absence is a residual (R-W2H-1 below), to be closed when the P2-1 engine
  produces them.

### Acceptance split (condition 2)

- The form design lands now, per the `DataDiffSpec` contract above.
- Form-submit → compile → execute → result end-to-end acceptance is
  **explicitly NOT done in this batch**: it waits for H track ③ (b), the
  compile layer (`TableDiffParamsSetter.compile` → `DataDiffSpec`), to merge.
  The PR description must state this serial acceptance point. "The form
  renders" is not a claim that P2-6 is complete.

## Consequences

- The three new bindings are parameter builders + differ + connect factory
  only; adding a full Trino / Azure SQL / ClickZetta metadata connector is a
  separate decision and must not be smuggled in through the data-diff files.
- Any future binding follows the same shape: `*TableParameter.build` exact
  dict, `*DataDiff.compare` via injected `fetch_keys`, a connect factory
  tested against a stub driver, and a registry entry in `datadiff.py`.
- The JSON array encoding is now the wire format for tableDiff array
  parameters; the P2-3 compiler must not re-encode them as Python literals.
- Residuals: R-W2H-1 — `changedRows` / `columnDiffCounts` / schema-diff
  fields have no producer yet (P2-1 engine); R-W2H-2 — no live database
  verification for any of the three bindings; R-W2H-3 — Redshift binding
  still open as its own connector item.
