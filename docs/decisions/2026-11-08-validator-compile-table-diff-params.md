# Validators compile a pulled test case into SQL; tableDiff compiles into the shared DataDiffSpec shape

- **Status:** Accepted
- **Revisions:** v1 2026-11-08 (initial)
- **Deciders:** Bai (scope lock + 77 decisions 2026-11-07; H-Q-2.2, H-Q-3.2); Wave 2 H-track review (REVIEW-W2-H-TRACKS.md, conditions 11/12, APPROVE)
- **Guard:** `smartmetadata-ingestion/tests/test_data_quality_validators.py` (SQL compile per validator + dialect, verdicts, threshold semantics), `smartmetadata-ingestion/tests/test_data_quality_table_diff.py` (params setter, shared-shape contract, key-set execution)
- **Related:** `~/workspace/work/milestone-20261107/RULING-data-execution.md` §2 (b) + §3, `~/workspace/work/milestone-20261107/wave2/REVIEW-W2-H-TRACKS.md` §2-③, `docs/decisions/2026-11-08-test-suite-server-pull.md`

## Context

Official validators are SQLAlchemy objects over a `QueryRunner` (`ValidatorBuilder`
+ `BaseTestValidator` + per-definition `*Validator` classes); the product has
no SQLAlchemy profiler path — its quality execution is a raw DB-API scalar
callback (`TestSuiteWorkflow._execute_scalar`). The compile layer therefore
has to be a clean-room port of the official *semantics* onto the product's
execution surface: each validator compiles its pulled test case (definition
name + `parameterValues` + `entityLink`) into one or more scalar SQL
statements, runs them through the existing execute callback, and computes the
verdict itself. The official test-definition seed JSONs
(`openmetadata-service/.../json/data/tests/*.json` at pin `a3012259ca`) are
the parameter contract: exact parameter names per definition, including
`threshold` / `thresholdUnit` on every definition that supports them.

## Decision

1. **Registry, not a dispatch pile.** `data_quality/builder.py`
   `ValidatorBuilder` resolves a pulled case's test-definition name through
   the `VALIDATORS` registry in `data_quality/validators.py`. An unknown
   definition name fails closed with a `WorkflowError` naming the definition
   (the workflow turns it into a per-case `Aborted` result; see the
   companion record). No if-else chain over definition names exists anywhere
   in the run path.
2. **This batch's validator set is fixed.** Column (15):
   `columnValuesToBeNotNull`, `columnValuesToBeUnique`,
   `columnValuesToBeBetween`, `columnValueMeanToBeBetween`,
   `columnValueMinToBeBetween`, `columnValueMaxToBeBetween`,
   `columnValueStdDevToBeBetween`, `columnValueMedianToBeBetween`,
   `columnValuesSumToBeBetween`, `columnValuesToBeInSet`,
   `columnValuesToBeNotInSet`, `columnValuesToMatchRegex`,
   `columnValuesToNotMatchRegex`, `columnValueLengthsToBeBetween`,
   `columnValuesMissingCount`. Table (4): `tableRowCountToBeBetween`,
   `tableRowCountToEqual`, `tableColumnCountToBeBetween`,
   `tableColumnCountToEqual`. Plus `tableDiff` (decision 6). Everything
   else — `columnValuesToBeAtExpectedLocation` (geo validator over shapely
   reference shapes; the review's "column 系 15" count excludes it),
   `tableColumnNameToExist`, `tableColumnToMatchSet`, `tableCustomSQLQuery`,
   `tableRowInsertedCountToBeBetween`, the two rule-library validators —
   is next batch, and the registry says so by name instead of silently
   skipping.
3. **Threshold semantics mirror official `thresholds.py`.** Row tolerance:
   `failed <= threshold` (`ABSOLUTE`, default) or
   `failed / total <= threshold / 100` (`PERCENTAGE`); default threshold 0
   is strict. Bound tolerance: a between/equal validator widens its bounds
   by the threshold (absolute deviation, or that percentage of the bound;
   an unset bound stays unset; a zero reference stays strict). A negative,
   NaN or infinite threshold is treated as 0, never as a widening or a
   pass-everything.
4. **SQL is compiled per dialect from the official function shapes.**
   Identifier quoting reuses `connectors/profile_sql.py` (`quote_ansi` /
   `quote_mysql` / `quote_mssql`); table references are three-part except
   MySQL-family dialects (mysql / mariadb / doris, two-part). Regex uses the
   official `RegexpMatchFn` mapping: `~` on the Postgres family,
   `REGEXP` on MySQL family, `REGEXP_LIKE` on Snowflake / Databricks /
   Unity Catalog, and the official `LIKE` fallback on MSSQL. Median uses the
   official `MedianFn` mapping (`percentile_cont(0.50) WITHIN GROUP`,
   Snowflake `approx_percentile`, Databricks `percentile_approx`, MSSQL
   `... OVER()`); dialects with no official compile (mysql / mariadb /
   doris) fail closed with a named error instead of a computed substitute.
   `STDDEV` is `STDEV` on MSSQL, `STDDEV` elsewhere; length is `LEN` on
   MSSQL, `CHAR_LENGTH` elsewhere. Parameter literals are rendered by type
   (numbers plain, strings single-quote-escaped, booleans `TRUE`/`FALSE`);
   set parameters parse exactly like official `parse_set_values`
   (`literal_eval` first, JSON fallback; `"true"`/`"false"` become booleans
   only on a boolean-typed column). Parameter values come from
   server-authored test definitions — the same trust level as the existing
   config-supplied `expression`, never built from UI input at run time.
5. **Validator / (c)-metric cross-dependencies are listed, not hidden.**
   `columnValueMedianToBeBetween` needs the (c) window metric `median`:
   its SQL compiles this batch, but its live acceptance waits for the median
   metric to land (Wave 3 serial point ⑥); no median value is ever faked
   inside the validator. `columnValueStdDevToBeBetween` and
   `columnValuesSumToBeBetween` / `columnValueMeanToBeBetween` use plain SQL
   aggregates and have no (c) dependency. No other validator in this batch
   depends on a (c) metric. The column-count validators read the count from
   the pulled table entity (server-known columns); live
   `information_schema` counting is a follow-up, recorded as a residual.
6. **tableDiff has exactly one compiled shape: `DataDiffSpec`.** The
   product's `DataDiffSpec` (config.py) already mirrors official
   `TableDiffRuntimeParameters` (two tables, key columns, threshold,
   optional where clause). `data_quality/table_diff.py`
   `TableDiffParamsSetter` compiles a pulled `tableDiff` case into a
   `DataDiffSpec`: `table2` (required) resolved to a table entity,
   `keyColumns` from the parameter or the table's primary-key then unique
   columns, `table2.keyColumns` defaulting to the same set, `useColumns`
   validated against the table's columns (the key-set engine does not
   consume extra columns yet — that is the P2-1 value comparison's input),
   `where` as the where clause, `threshold` as the verdict threshold. The `TableDiffValidator`
   receives that spec and runs it through the existing Phase 1 key-set
   engine (`DATA_DIFF_BINDINGS` + `SqlKeyFetcher` + `compare_key_sets`,
   official verdict formula); its result writes only the fields the engine
   actually computes (`removedRows` / `addedRows` / `diffCount`, plus the
   key-set-only disclosure) — changed-row, schema-diff and sampled fields
   stay unwritten until P2-1/P2-2. **Wave 3 P2-3 must reuse this setter and
   this shape** for the server-pulled tableDiff compile; it must not invent
   a second tableDiff parameter structure. tableDiff is never expressed as a
   `TestCaseSpec{expression}` scalar.
7. **tableDiff limits of this batch.** Same-service diffs only: both sides
   run on the workflow's configured source connection, and a `table2` whose
   service differs from the table-1 service fails closed (cross-service
   connection resolution is P2-3's). `parallelQueries` and
   `table_profile_config` (sampling) are not consumed — sampling is P2-2.
   `caseSensitiveColumns` only governs whether column-name validation
   matches case-sensitively; it does not change the comparison itself.

## Consequences

- Every validator in the registry is executable against a real database
  through the existing scalar callback; none is a stub that reports
  success without running SQL.
- The median validator is the one deliberately incomplete live story in
  this batch: compiled, unit-tested on SQL shape, live-unverified until
  Wave 3 ⑥. Its status in any live report must read "not verified", never
  "passed".
- P2-6's form fields and P2-3's compile both contract against `DataDiffSpec`
  through this setter; a change to the setter's output shape is a change to
  both of their contracts and needs a record revision.
