# tableDiff sampling: MD5 key-hash where clause (P2-2)

- **Status:** Accepted
- **Revisions:** v1 2026-11-11 (initial)
- **Deciders:** Bai (scope lock + 77 decisions 2026-11-07; H-Q-3.2); Wave 3 H serial review (REVIEW-W3-H-SERIAL.md, condition 12, APPROVE); implementation ruling `~/workspace/work/wave3-h-serial-7-logs/RULING-7.md` §4/§7
- **Guard:** `smartmetadata-ingestion/tests/test_data_quality_sampling.py` (STATIC/DYNAMIC tiers, row-count laziness) + `smartmetadata-ingestion/tests/test_data_diff_workflow.py` (per-dialect sample where, same-run both-side identity, fallbacks, disclosure)
- **Related:** `docs/decisions/2026-11-11-table-diff-value-engine-chunked-row-comparison.md`, `docs/decisions/2026-11-11-table-diff-cross-service-connection-source.md`

## Context

A tableDiff case may carry a sampling config in table1's
`table_profile_config.profileSampleConfig`. The official engine samples
both tables by the MD5 of the key columns plus a random salt, so the same
rows are selected on both sides and the verdict is an estimate over the
sample. This batch ports that as a clean-room implementation — no
collate-data-diff dependency is imported or vendored.

## Decision

### Config resolution

`resolve_table_diff_sample_config(profile_sample_config, *,
row_count_fn)` mirrors the official `resolve_static_sampling_config`
(pin `sampler/config.py:230-255`) over the raw server dict:

- Missing / `None` config → no sampling.
- `STATIC` → the config's `profileSample` / `profileSampleType` /
  `samplingMethodType`; `ProfileSampleType.ROWS` maps to the product
  `SampleType.ROW_COUNT` (the product's existing name, mapped inside the
  resolver, not renamed).
- `DYNAMIC` → thresholds sorted by `rowCountThreshold` descending, first
  `row_count >= threshold` wins; `smartSampling` uses the official
  `get_tiered_sample` tiers verbatim (≤100k → 100%, ≤1M → 50%, ≤10M →
  10%, ≤100M → 5%, ≤1B → 1%, larger → 0.1%); no matching tier → no
  sampling.
- `row_count_fn` (the left-table `COUNT(*)`) is called only for DYNAMIC
  configs; a STATIC + PERCENTAGE config never takes the row count.
- The config source is table1's entity only — there is no per-table →
  workflow-default hierarchy on this path (the profiler's
  `resolve_sample_config` hierarchy does not enter tableDiff).

### Sample where rendering

- One salt (5 random alphanumerics) and one nonce per run, shared by both
  sides: `nonce = int((2**32 - 1) * fraction)` where the fraction is
  `profileSample / 100` (PERCENTAGE) or `profileSample / row_count`
  (ROWS); the hex nonce is zero-padded to 8 digits. The generic form is
  `SUBSTRING(MD5(<concat>), 1, 8) < '<hex>'` with the dialect's
  SUBSTRING/CAST spellings:

  | dialect | MD5 / SUBSTRING | concat |
  |---|---|---|
  | postgres | `MD5`, `SUBSTRING(x FROM 1 FOR 8)` | `CAST(k AS VARCHAR) \|\| ...` |
  | mysql | `MD5`, `SUBSTR(x, 1, 8)` | `CONCAT(CAST(k AS CHAR), ...)` |
  | snowflake | `MD5`, `SUBSTR(x, 1, 8)` | `CAST(k AS VARCHAR) \|\| ...` |
  | databricks / unitycatalog | `md5`, `substring(x, 1, 8)` | `CAST(k AS STRING) \|\| ...` |
  | trino | `substr(to_hex(md5(CAST(<concat> AS VARBINARY))), 1, 8)` | `CAST(k AS VARCHAR) \|\| ...` |
  | mssql / azuresql | SQL Server branch below | `+` after CAST |

- **Explicit CAST** (documented working equivalent, §4.4.3): the official
  form concatenates implicitly through SQLAlchemy; that fails on
  non-string keys in Postgres (`integer || text` has no operator —
  verified with SQLAlchemy 2.0.57: postgres renders `id || 'abcde'`,
  mysql renders `concat(id, 'abcde')`). The product renders an explicit
  `CAST(<key> AS VARCHAR/CHAR/STRING)` per dialect. Sampling consistency
  only needs both sides to render the same string.
- **SQL Server branch** (mssql / azuresql, pin
  `build_sql_server_sample_where_clause` verbatim): every key casts to
  VARCHAR and concatenates with `+` (SQL Server's `+` adds an integer key
  to the salt instead of concatenating), the digest is
  `HASHBYTES('MD5', ...)` lower-cased via
  `LOWER(CONVERT(VARCHAR(32), <digest>, 2))`, then
  `SUBSTRING(<hex>, 1, 8) < '<hex>'`. Only integer keys hash the same as
  every other database, so a SQL Server side with a non-integer key column
  — or a key column whose type is missing — warns with the official
  wording and compares all rows instead of sampling.
- **ClickZetta** (§4.4.2): re-verified from the `clickzetta-connector`
  wheel (2026-11-11) — no MD5 / SUBSTRING equivalent on the engine side,
  so a clickzetta side warns and compares all rows; no equivalent function
  is invented.
- **Combined where**: the sample where and the user's `where_clause`
  combine as `(<user where>) AND (<sample where>)` per side; either side
  alone when the other is absent.
- **Sampling off**: config missing, `profileSample` None, or PERCENTAGE ==
  100. ROWS with `profileSample >= row_count` still runs the sample
  clause (full-table effect, official behaviour, not short-circuited).
  ROWS with an unknown row count aborts the case with an `ERROR:` result.

### Disclosure

When sampling applies, the result message appends (§4.3):
`Sampled comparison: {profileSample}{%| rows} of the table (MD5 key-hash sampling); the verdict is an estimate over the sample, not a full-table conclusion.`
The official disclosure lives in the `EvaluationScope` layer; the product
discloses in the message — the equivalent observable surface.

### Assertions

Salt is random per run, so cross-run verdict stability is only a
probabilistic assertion. The deterministic assertion (Q-2 (b),
parent-approved) is **same-run both-side key-set identity**: one salt and
one nonce per run, the same where clause shape on both sides, so the same
rows are selected on both sides.

## Consequences

- The engine resolves sampling after opening the row source (the row
  count comes from it) and replaces the per-side where clauses before
  streaming; the injected test source ignores where clauses, so sampling
  selection is asserted at the where-clause level, not by row filtering.
- `DYNAMIC` resolution here covers the tableDiff path only; the profiler
  dataset's DYNAMIC tiering remains residual `R-W3H-6-dynamic-sampling`.
- Live verification is owed after merge (ruling §8 items 9–14): a sampled
  tableDiff case on real postgres + mysql, SQL Server int-key sampling
  pass + non-int-key warn + full compare, and the same-run both-side
  key-set identity on real data.
