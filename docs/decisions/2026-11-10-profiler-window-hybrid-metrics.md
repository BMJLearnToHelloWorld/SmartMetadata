# Profiler window/hybrid metrics (Wave 3 serial point 6)

- **Status:** Accepted
- **Revisions:** v1 2026-11-10 (initial)
- **Deciders:** Wave 3 H serial point 6 implementer (per REVIEW-W3-H-SERIAL.md, APPROVE + 16 conditions)
- **Guard:** `smartmetadata-ingestion/tests/test_profiler_window.py` + `tests/test_data_quality_sampling.py`
- **Related:** `~/workspace/work/milestone-20261107/wave3/RULING-W3-H-6.md`, `~/workspace/work/milestone-20261107/wave3/REVIEW-W3-H-SERIAL.md`

## Context

Wave 2 H tracks 1–5 landed the profiler's static metrics (15) and composed
ratios (6) plus the validator surface. The (a) → (c) window/hybrid family was
still missing on main: `median`, `firstQuartile`, `thirdQuartile`,
`valueRank`, `histogram`, `cardinalityDistribution`, `interQuartileRange`,
`nonParametricSkew`. The official profiler runs every metric on a *dataset*
— the full table, or a sample of it — and this batch closes that gap together
with the dataset abstraction itself.

## Decisions

### 1. Scope: 8 metrics; `system` is a residual

The batch implements exactly the 8 metrics above. The `system` scope
assignment is unconfirmed (H-Q-2.3 only says "deferred"; the Wave 2 review's
assignment of it to point 6 is not a Bai decision), so it is **not**
implemented and recorded as **R-W3H-6-system**.

### 2. One shared percentile renderer (review condition 4)

`percentile_sql(dialect, column_sql, percentile, *, table_sql=None)` lives in
`connectors/profile_sql.py` and is the single source for the profiler and the
median validator (`data_quality/sql.py::median_sql` delegates to it). The
physical location differs from the review's literal wording ("extend
`data_quality/sql.py::median_sql`") because `data_quality/sql.py` already
imports `quote_*` from `connectors/profile_sql.py` — defining the renderer
there and importing it back would create a module cycle. The single-shared-
source intent is satisfied; the placement reason is this cycle.

Per-dialect table, from pin `a3012259ca` `profiler/orm/functions/median.py`:

| dialect | rendering |
|---|---|
| postgres family (incl. greenplum/redshift/timescale) | `percentile_cont(p) WITHIN GROUP (ORDER BY col ASC)` (exact) |
| mssql | same + `OVER()` (exact) |
| snowflake | `approx_percentile(col, p)` (approximate) |
| databricks/unitycatalog | `percentile_approx(col, p)` (approximate) |
| mysql | ROW_NUMBER subquery (see §3) |
| doris | `percentile_approx(col, p)` |
| mariadb | no compile — fail-closed (see §4) |

Snowflake/Databricks/Doris render **approximate** percentiles. Acceptance
must use a tolerance on those dialects, never exact equality.

The shared `SqlDialect` key used to conflate MySQL, MariaDB and Doris
under `"mysql"`; their percentile compiles differ, so this batch extends
the key to seven values (postgres/mysql/mariadb/doris/mssql/snowflake/
databricks) and `mariadb_common` / `doris_common` pass their own key. The
LENGTH/STDDEV/LIKE/REGEXP renderings and the sampling random expressions
for mariadb/doris are byte-identical to mysql's — only the percentile
rendering differs.

### 3. MySQL rendering: one deliberate deviation (aliased value column)

Official MySQL `MedianFn` (non-correlated mode) renders:

```sql
(SELECT {col} FROM (SELECT {col}, ROW_NUMBER() OVER (ORDER BY {col}) AS row_num,
  COUNT(*) OVER () AS total_count FROM `{table}`) temp
 WHERE temp.row_num = ROUND({p} * temp.total_count))
```

The product aliases the value expression as `_pct_col` and selects that alias
in the outer query. The alias is required because condition 5 wraps string
columns in a length function: with `{col}` = `LENGTH(...)` the outer SELECT
cannot reference the bare column name. Official's verbatim form only works
for bare columns. This is a documented product-side porting change, not
official verbatim SQL.

The subquery's inner table is the **dataset source**, not the raw table name
(official uses the raw table name). With no sampling configured the two are
identical. With sampling enabled the median subquery re-evaluates the
sampling filter independently of the outer aggregate's copy of the dataset,
so the median is computed on a *different random sample* of the same
population — statistically consistent, but not row-identical. No materialized
sample (temp table) is introduced in this batch.

### 4. MariaDB: fail-closed

Pin has no MariaDB compile for `MedianFn` (the default `percentile_cont`
is not valid SQL on MariaDB). The batch keeps fail-closed: the profiler
omits the three percentile slots on MariaDB (None), and the validator raises
`WorkflowError`. Porting the MySQL rendering was rejected: no pin evidence
supports it, and the port would be inventing official behavior.

This corrects the merged-code comment that used to claim official `MedianFn`
has no compile for MySQL, MariaDB *and* Doris — pin has both a MySQL
ROW_NUMBER compile and a Doris `percentile_approx` compile; only MariaDB
lacks one. `MEDIAN_UNSUPPORTED_DIALECTS` shrinks to `{"mariadb"}`.

### 5. Dataset abstraction (review condition 6)

New module `data_quality/sampling.py`:

- `StaticSampleConfig` (`profile_sample`, `sample_type` PERCENTAGE |
  ROW_COUNT, `sampling_method` SYSTEM | BERNOULLI, Snowflake-only).
- `resolve_sample_config(*configs)`: first non-None wins, callers pass
  levels in priority order.
- `dataset_sql(dialect, table_ident, *, sample_config)`: the FROM source
  every profiler metric reads. PERCENTAGE uses official `RandomNumFn`
  reduced modulo 100 (`ABS((RANDOM() * 100)::INTEGER) % 100` postgres,
  `ABS(RAND()) * 100` mysql, `ABS(CHECKSUM(NewId()))` mssql,
  `ABS(RANDOM()) * 100` databricks); Snowflake uses `TABLESAMPLE BERNOULLI
  (p)` / `SYSTEM (p)`. ROW_COUNT uses `LIMIT` / `TOP (n)` /
  `TABLESAMPLE ROW (n ROWS)`.

Configuration surface (workflow YAML only, this batch):

- `WorkflowConfig.profiler_sample` — default sampling config.
- `WorkflowConfig.profiler_table_samples` — per-table overrides keyed by
  table FQN.
- Resolution: per-table → workflow default → no sampling (full table).

The server levels (entity `tableProfilerConfig` / schema / database) are
**not** pulled: `ProfilerWorkflow` does not fetch server Table entities.
`resolve_sample_config` reserves them as parameter positions for the future
server-pull wiring (**R-W3H-6-sampler-server-config**). `rowCount`
(`SELECT COUNT(*)`) stays on the raw table — it is the table's size, not
the sample's. Histogram binning uses `values_count` (official `Count` =
`COUNT(col)`), not `rowCount`.

Explicitly **not** in this batch (fail-closed, recorded as residuals):

- `profileQuery` (user-query dataset) — **R-W3H-6-profile-query**.
- Partitioned tables (no partition config surface exists) —
  **R-W3H-6-partitions**.
- DYNAMIC sampling (thresholds / smartSampling tiering) —
  **R-W3H-6-dynamic-sampling**.

`SqlProfileReader.sample()`'s LIMIT-50 template is `fetch_sample_data`
(write-back sampling) and is **not** the profiler dataset.

### 6. Window metrics

`median` / `firstQuartile` / `thirdQuartile` run as slots of the existing
per-column aggregate SELECT (p = 0.5 / 0.25 / 0.75), following official
`Median.fn` / `FirstQuartile` / `ThirdQuartile`: quantifiable columns direct,
concatenable columns over the length function, other types resolve to None
without failing the column query. The median validator gets the same
treatment (string columns median over length — previously a bare-column
`percentile_cont` on a text column would error).

`valueRank` has no `ColumnProfile` field (pin and product `table.json`
agree) and lands **only** as the `ROW_NUMBER() OVER (ORDER BY COUNT(col)
DESC)` fragment inside the cardinalityDistribution CTE. No profile field is
invented for it. In `metricConfiguration`, a `valueRank` entry therefore
means "provide the ordering for cardinalityDistribution", not an
independent write-back value.

### 7. Composed metrics

`interQuartileRange` = Q3 − Q1 and `nonParametricSkew` = (mean − median) /
stddev are derived in Python from the aggregate row, like the existing six
composed ratios; either input missing (or stddev 0 for NPS) yields None.

**Known limitation (R-W3H-6-nps-string):** the product's `mean` is NULL for
string columns (official `Mean` aggregates the length on concatenable
columns — a pre-existing product deviation, out of this batch's scope), so
NPS on string columns is always None here. Fixing `mean` would change an
existing metric's behavior and its existing tests and is a separate item.

### 8. Hybrid metrics (review condition 7)

Both compute in full for every eligible column — the product has no
`metricConfiguration` selection surface (no per-column metric enable/disable
in the profiler config), and this batch does not build one
(**R-W3H-6-metricconfig-selection**). Cost bound: histogram = one extra
session query per numeric column (at most 100 CASE aggregates);
cardinalityDistribution = one extra GROUP BY query per string column.

- **histogram** (numeric columns only; min/max NaN/inf → None): binning
  verbatim from official `hybrid/histogram.py` — Freedman-Diaconis
  (`2 * IQR * n^(-1/3)`, IQR = 0 → width 1), Sturges fallback
  (`ceil(log2(n)+1)`) when the IQR is missing or the bin count exceeds 100,
  cap at 100. Labels via `_format_bin_labels` (`"X to Y"` / `"X and up"`).
  Number formatting follows official `format_large_string_numbers` with
  **one deliberate fix**: the official magnitude is unclamped, so
  `0 < |n| < 1` indexes the units list with a negative magnitude (`0.25`
  would label `"250.000T"`); the magnitude is clamped at 0 here.
- **cardinalityDistribution** (string columns only): three-stage CTE
  verbatim from official `hybrid/cardinality_distribution.py` — per-value
  counts ranked by the ValueRank fragment, low-frequency values folded into
  `'Others'` (threshold 0 while distinct ≤ 20, else 2% of the total),
  summed per category, ordered by count descending; percentages rounded to
  2 decimals. Total == distinct → `{"allValuesUnique": True}`.

### 9. Write-back (review condition 9)

All 10 `ProfileStatRow` dataclasses and all 10 `column_profile` dicts gain
the same 7 fields/keys (`median`, `firstQuartile`, `thirdQuartile`,
`interQuartileRange`, `nonParametricSkew`, `histogram`,
`cardinalityDistribution`; snake_case in the row, camelCase in the dict).
No spec change, no Java change — server `table.json` `ColumnProfile`
already carries these fields.

### 10. Validator scope

- `ColumnValueMedianToBeBetweenValidator` uses the shared renderer and
  passes the table source (MySQL needs it).
- The dimension branch (official SQA `dimension_col` GROUP BY median) is
  **not** in this batch: the product has no dimension validation path and
  the median validator is whole-column only (**R-W3H-6-dimension-median**).
- Official has no quartile/histogram validators — none are invented.

## Residuals

| ID | Content |
|---|---|
| R-W3H-6-system | `system` metric family not implemented (H-Q-2.3 only defers it; no wave assigned) |
| R-W3H-6-sampler-server-config | Server `tableProfilerConfig` / schema / database sampling levels not pulled |
| R-W3H-6-profile-query | `profileQuery` user-query dataset unsupported |
| R-W3H-6-partitions | Partitioned-table datasets not partition-aware |
| R-W3H-6-dynamic-sampling | DYNAMIC sampling (thresholds / smartSampling tiering) not implemented |
| R-W3H-6-dimension-median | Dimension-related median branch not implemented |
| R-W3H-6-nps-string | NPS on string columns always None (pre-existing `mean` deviation) |
| R-W3H-6-metricconfig-selection | No `metricConfiguration` selection surface; histogram/cardinality compute in full |
| R-W3H-6-live-30 | Live acceptance owed: the 21-metric comparison must be redone on the fqn path and extended to 30 metrics |
