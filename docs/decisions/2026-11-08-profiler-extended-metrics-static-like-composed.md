# Profiler extended metrics: static + like/regex + composed (21 metrics)

- **Status:** Accepted
- **Revisions:** v1 2026-11-08 (initial)
- **Deciders:** Wave 2 H track ② implementer (per REVIEW-W2-H-TRACKS.md, conditions 8/9/16)
- **Guard:** `smartmetadata-ingestion/tests/test_profiler_metrics_c.py` + `tests/test_cursor_profile_reader.py`
- **Related:** `~/workspace/work/milestone-20261107/RULING-data-execution.md` §2.4 (c), `~/workspace/work/milestone-20261107/wave2/REVIEW-W2-H-TRACKS.md` §2-②

## Context

Official profiler registry (`ingestion/src/metadata/profiler/metrics/registry.py`,
pin `a3012259ca`) has 36 named metrics; the product computed 6
(`rowCount`, `nullCount`, `distinctCount`, `min`, `max`, `mean`), with
`min`/`max` stringified through `_as_text`. This batch lands the 21 metrics
that need no sampling dataset: 15 static + 6 composed. The remaining 9
(window 4, hybrid 2, `interQuartileRange` + `nonParametricSkew` whose
`required_metrics` need window results, system 1) go to Wave 3 serial point ⑥
with the sampling dataset; they must not appear in this batch.

## Decision

### Member table (21)

Static (15): `valuesCount` (`COUNT(col)`), `countInSet`, `columnCount`,
`iLikeCount`, `likeCount`, `notLikeCount`, `regexCount`, `notRegexCount`,
`maxLength`, `minLength`, `stddev`, `sum`, `uniqueCount`, `columnNames`,
`nullMissingCount`. Composed (6, derived in Python from the static results,
never from a second data pass): `distinctProportion`, `uniqueProportion`,
`nullProportion`, `duplicateCount`, `iLikeRatio`, `likeRatio`.

### Formulas (official, verbatim)

- `valuesCount` = `COUNT(col)` (non-null count, official `Count.fn`).
- `countInSet` = `SUM(CASE WHEN col IN (...) THEN 1 ELSE 0 END)`.
- `nullMissingCount` = `SUM(CASE WHEN col IS NULL THEN 1 [WHEN col = '' THEN 1] ELSE 0 END)`;
  the empty-string branch applies only to string-like types (official
  `can_hold_empty_string`).
- `sum` / `stddev` on a numeric column aggregate the column; on a string
  column they aggregate its length (official `Sum`/`StdDev` concatenable
  branch). `stddev` is the population deviation (`STDDEV_POP`, `STDEVP` on
  MSSQL).
- `maxLength` / `minLength` = `MAX`/`MIN` of the length function, string
  columns only, else `None` (official returns `None` for non-concatenable).
- `uniqueCount` = `SELECT COUNT(*) FROM (SELECT col ... GROUP BY col HAVING
  COUNT(*) = 1)` (official `UniqueCount` query shape; NULLs group together
  like any other value).
- `distinctProportion` = distinct / values (`None` when values is 0);
  `uniqueProportion` = `min(unique / values, 1)` (official cap: a sampled
  recount may exceed the count); `nullProportion` = null / (values + null)
  (`None` when the total is 0); `duplicateCount` = values − distinct
  (`None` when either input is `None`); `likeRatio` / `iLikeRatio` =
  like / values (`None` when values is 0 or the count is `None`).
- `notLikeCount` / `notRegexCount` use the official inverted CASE verbatim:
  `SUM(CASE WHEN col NOT LIKE <expr> THEN 0 ELSE 1 END)` — i.e. they count
  rows **matching** the pattern (NULL rows included), not rows failing it.
  This is the pin's own semantics, confirmed against the pin test
  `test_not_like_count` (`("J%", 3)` equals `likeCount("J%")` = 3,
  `("b%", 0)`); it is not a product invention and must not be "fixed" to
  count non-matching rows without a new ruling.

### Dialect rendering (official LenFn / StdDevFn / RegexpMatchFn compiles)

| Function | postgres family | mysql family | mssql | snowflake | databricks |
|---|---|---|---|---|---|
| length | `LENGTH(CAST(col AS text))` | `LENGTH(col)` | `LEN(col)` | `LEN(col)` | `LENGTH(col)` |
| stddev | `STDDEV_POP(col)` | `STDDEV_POP(col)` | `STDEVP(col)` | `STDDEV_POP(col)` | `STDDEV_POP(col)` |
| ilike | `ILIKE` | `LIKE` | `LIKE` | `ILIKE` | `ILIKE` |
| regex | `col ~ ?` | `col REGEXP ?` | unsupported → `None` | `REGEXP_LIKE(col, ?)` | `REGEXP_LIKE(col, ?)` |

`LIKE` stands in for `ILIKE` on MySQL-family and MSSQL because their `LIKE`
is already case-insensitive by collation (the same rendering SQLAlchemy's
`ilike()` produces there). MSSQL has no regex operator: `regexCount` /
`notRegexCount` resolve to `None` there instead of failing the column query.
LIKE / ILIKE / REGEXP / length metrics apply to string-like columns only;
on any other type they resolve to `None` instead of failing the query
(official guards `regexCount` / `maxLength` / `minLength` the same way with
`is_concatenable`; `likeCount` without a guard would hard-fail the column
query on e.g. an integer column in Postgres). MSSQL `uniqueCount` is
skipped (`None`) for deprecated `text` / `ntext` / `image` columns, which
cannot appear in a `GROUP BY` (official keeps a dedicated MSSQL branch for
them). The dialect is a per-reader key on `SqlProfileReader`, rendered from
lookup tables — no per-engine `if` chains in the SQL builder.

### Parameter pass-through (condition 8)

The six parameterized metrics are official `RUNTIME_PROPS_METRICS`: they
only run when runtime props are supplied. Officially the props come from
test definitions (validators build `add_props(expression=...)` /
`add_props(values=...)`); the profiler `metricConfiguration` only selects
which metrics run per data type and carries no expressions. The product
surface mirrors that split:

- Reader level: `SqlProfileReader.profile(..., metric_params)` — a mapping
  `column → {metric → {"expression": ...} | {"values": [...]}}`, threaded
  through `ProfileReader.profile_table` and each `*ProfilerInterface.profile`.
  Unknown metric names, non-string expressions and non-scalar or empty value
  sets raise `WorkflowError` (fail fast, not silent partial profiles).
  A metric with no props for a column resolves to `None`.
- Config level: `WorkflowConfig.profiler_metric_params`
  (`ProfilerMetricParamSpec`, one entry per column, camelCase YAML keys),
  converted by `ProfilerWorkflow` into the reader mapping. The (b) track's
  validators use the reader-level surface directly.
- `countInSet` values are only ever sent as bound DB-API parameters, one
  placeholder per value; no value is ever interpolated into SQL text
  (injection surface). Expressions are likewise bound parameters.

### Typed min/max write-back (condition 9)

`min` / `max` keep the column's type instead of being stringified
(`_typed_value`: int/float/str/bool pass through, `Decimal` → float,
dates/times → ISO strings, bytes → UTF-8, anything else → `str`, so the
record stays JSON-serializable). `sum` / `stddev` / `mean` are floats.
`columnCount` is written into `table_profile` (official `TableProfile`
carries it). `columnNames` is computed on the table row but not written
anywhere: official computes it and drops it at `TableProfile` construction
(the schema has no field for it), and this batch mirrors that.

### Out of scope, recorded (not fixed here)

- `interQuartileRange`, `nonParametricSkew`, window, hybrid and system
  metrics: Wave 3 serial point ⑥.
- The fqn write path (`_write_profile` → `POST /v1/entity/profiles/...`)
  posts the table profile only; column profiles travel only the legacy
  `tableId` path. That pre-existing gap affects all column metrics, old and
  new alike, and is **not** changed by this batch — whether the sink should
  post one `CreateEntityProfile` per column (profileType `column`) is a
  separate decision for the parent, because it changes the write contract
  against the server. Live same-table comparison of the 21 metrics must
  therefore run against the legacy path (or after that decision) and must
  not be claimed from the fqn path.
- `likeCount` / `iLikeCount` / `notLikeCount` / `regexCount` /
  `notRegexCount` / `countInSet` / `nullMissingCount` / `columnNames` have
  no first-class field in the pin `ColumnProfile` schema
  (`table.json`, `additionalProperties: false`, zero hits for those names);
  officially they only run in the default profiler set when explicitly
  configured, and the parameterized six are validator-driven in production
  (`RUNTIME_PROPS_METRICS`). The product carries them in the record under
  official metric names; server acceptance on the legacy path is a live
  verification item, not assumed here.

## Consequences

- One aggregate SELECT per column (+ one grouped subquery for
  `uniqueCount`); no new server endpoints, no Java changes, no ES changes.
- A misconfigured metric param fails the run loudly instead of producing a
  partial profile; a metric with no props is `None`, never a fabricated value.
- Any future dialect adds one row to four lookup tables and one
  `CursorProfileReader` dialect key — no new branches in the SQL builder.
