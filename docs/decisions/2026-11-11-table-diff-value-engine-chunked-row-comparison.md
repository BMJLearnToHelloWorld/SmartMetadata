# tableDiff value engine: chunked row comparison (P2-1)

- **Status:** Accepted
- **Revisions:** v1 2026-11-11 (initial)
- **Deciders:** Bai (scope lock + 77 decisions 2026-11-07; H-Q-3.2); Wave 3 H serial review (REVIEW-W3-H-SERIAL.md, conditions 11–13, APPROVE); implementation ruling `~/workspace/work/wave3-h-serial-7-logs/RULING-7.md` §3/§7
- **Guard:** `smartmetadata-ingestion/tests/test_data_diff_workflow.py` (chunk boundaries, duplicate keys, error layering, capped counting, per-dialect row SQL) + `smartmetadata-ingestion/tests/test_data_quality_table_diff.py` (row-mode verdicts, column-diff fail, key-type mismatch, unbound-dialect abort, capped-count shape)
- **Related:** `docs/decisions/2026-11-11-table-diff-cross-service-connection-source.md`, `docs/decisions/2026-11-08-validator-compile-table-diff-params.md`

## Context

The Phase-1 data-diff engine compared key sets only (added / removed
keys); it could not see a changed row, a column type mismatch, or a schema
difference, and it capped nothing — it materialised both key sets in
memory. The official engine (`data_diff.diff_tables`, pin
`a3012259ca`) compares full row values in chunks, fails the case on a
column difference or an incomparable key type, and stops counting once the
count passes the threshold. This batch ports that behaviour as a clean-room
implementation in `smartmetadata_ingestion/datadiff.py` — no
collate-data-diff dependency is imported or vendored.

## Decision

### Chunked, two-pass row comparison

- One chunk is `DATA_DIFF_CHUNK_SIZE = 1000` rows. Pass 1 streams the left
  rows in chunks ordered by key and looks each chunk up on the right
  (`WHERE key IN (...)` for a single key, `OR` of `AND` groups for a
  composite key) — that pass finds removed, changed and unchanged rows.
  Pass 2 streams the right keys in chunks and looks each chunk up on the
  left — only that pass finds added rows, which pass 1 can never fetch.
  Memory stays chunk-bounded: one chunk of left rows, one chunk of right
  rows, one chunk of keys per side.
- Duplicate keys abort the case. Duplicates are detected adjacently in the
  key-ordered stream (a string key orders by `LOWER(column)` when the
  comparison is case insensitive, so case-variants stay adjacent) and in
  each chunk lookup's result. The abort message names the key columns only,
  never the offending values, and the location is the side's full FQN
  (`service.database.schema.table` when the setter recorded the service,
  else `database.schema.table`).
- Value equality (`_values_equal`) is cross-type with no `str()`
  normalisation: `INT 1 == BIGINT 1` (via `Decimal(str(v))`, `bool` excluded
  from numeric), strings compare lower-cased when the comparison is case
  insensitive, a JSON string parses to an object before comparing, aware
  datetimes compare as UTC instants, a naive and an aware datetime are
  never equal, `None == None`, `NaN == NaN`, and a numeric string never
  equals a number. Key identity (`_norm_key_value`) is the hashable form of
  the same rules.
- Column types decide comparability (`column_type_family` /
  `column_types_comparable`, added in commit 1): the three numeric families
  compare across each other, every other family only with itself, an
  unknown dataType is its own family, and a missing type on either side
  compares. A key column the schema diff says changed type fails the case
  before any row is streamed, naming the column and both types.
- Failed-row sampling keeps the first 50 failed rows in memory only, for
  the debug log — key columns in the clear, every other value `"***"`.
  Nothing about the sample is written into a result record or into
  `sample_data`.

### Verdict and result shape

- `pass ⟺ ¬has_column_diff ∧ ((threshold or total) == 0 ∨ total < threshold)`,
  where `total` is the distinct diff-key count. A column diff fails the
  case even when no row differs.
- Full-count branch (`threshold == 0` or `computePassedFailedRowCount`
  true): writes `removedRows` / `addedRows` / `changedRows` / `diffCount`
  plus `columnDiffCounts` (JSON, count-descending) when any column differs,
  plus the five schema fields when a column diff exists, plus
  `passedRows` = unchanged and the two percentages over the left-table
  `SELECT COUNT(*)` (unfiltered, the official denominator). The message
  names the total and, when columns differ, the top-3 differing columns.
- Capped branch (`threshold > 0` and `computePassedFailedRowCount` false):
  counting stops at the first distinct diff key past the threshold and the
  result writes **only** `diffCount = threshold + 1` plus the schema fields
  (Q-1 (a): no `"None"` strings, no invented counts). The message carries
  the capped-count disclosure: "Counting stopped after exceeding the
  threshold of {threshold} (capped count, not the full total)."
- Inline specs (the `data_diff` workflow) carry no table metadata, so the
  engine takes `schema_compared=False` there and the message discloses
  "Schema differences are not compared (no table metadata in inline spec)."
  (Q-3 (a).)

### Error layering

- Duplicate key → `Aborted` (message above).
- A side with no data-diff binding → `Aborted`
  ("Unsupported dialect on the {left|right} side: '{source_type}'"); the
  validator no longer raises for an unbound dialect. The inline
  `data_diff` workflow still rejects an unbound side at prepare time with
  `WorkflowInitializationError`.
- Any other unexpected exception → `Aborted` with an `ERROR:` prefix and
  no traceback in the result.

### `parallelQueries`

Parsed and validated with the official warning
("Ignoring parallelQueries=%r: it must be a whole number of at least 1.
Using 1."), falling back to 1. Execution is always single-threaded in
this batch (residual R-W3H-5).

## Deviations from the official engine (documented)

1. **Inline spec skips schema comparison** (Q-3 (a), parent-approved):
   the inline `data_diff` workflow has no table metadata, so no schema
   diff is computed; the result discloses it in the message.
2. **Capped branch writes no `"None"` strings** (Q-1 (a),
   parent-approved): the official capped branch writes `None` for the
   uncomputed counts; this engine writes only `diffCount` plus the schema
   fields.
3. **Capped-count disclosure sentence**: the capped message states the
   count stopped at the threshold and is not the full total.
4. **Two-pass comparison**: the ruling's single left-driven pass cannot
   find added rows (right-only keys are never fetched), so the engine does
   a symmetric second pass over the right keys. Memory stays chunk-bounded.
5. **Left-table `COUNT(*)` denominator**: percentages divide by the
   unfiltered left-table row count (the official denominator), fetched by
   the engine's live row source; the injected test source counts injected
   left rows.
6. **Completed capped stream**: if the stream finishes without exceeding
   the threshold, the real removed / added / changed counts were computed,
   so they are written — only the early-stop case writes `diffCount =
   threshold + 1` alone.
7. **Per-dialect parameter markers**: `DataDiffBinding.paramstyle` —
   `format` (`%s`) for postgres / mysql / snowflake, `qmark` (`?`) for
   mssql / databricks / unitycatalog / trino / azuresql / clickzetta
   (verified from the product connectors and the trino / clickzetta DB-API
   wheels).

## Consequences

- `run_data_diff_spec` is the single verdict implementation for both the
  `data_diff` workflow and the tableDiff validator; both gain a
  `fetch_rows` injection alongside the existing `fetch_keys`, plumbed
  through `runner.py`, `jobs.py` (`DataDiffJob`), `workflow.py`
  (`TestSuiteWorkflow` / `DataDiffWorkflow`) and `builder.py`.
- The key-set path is unchanged when both sides carry no extra columns,
  except that a column diff now fails the case and writes the schema fields
  with a schema-mismatch message.
- Live verification is owed after merge (ruling §8 items 9–14): real
  TestSuites with known added / removed / changed rows and one schema
  diff, real postgres + mysql databases, threshold and capped-count cases.
