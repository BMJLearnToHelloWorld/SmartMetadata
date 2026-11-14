# Agent capability batch 1: translation plumbing, parser dependency, and runner status shape

- **Status:** Accepted
- **Revisions:** v1 2026-11-14 (initial); v2 2026-11-14 (D-C7: metadata deletion); v3 2026-11-14 (D-C8: metadata enrichment); v4 2026-11-14 (D-C5: lineage REST adaptation as built); v5 2026-11-14 (review fix pass: B-1–B-12 decisions, profiler fold-in, corrected overclaims, fix-pass residuals)
- **Deciders:** Bai (2026-11-14: capabilities aligned, one round in two batches, source-level benchmarking, cleanup over accommodation); parent ruling RULING-CAPABILITY.md (D-C1/D-C2/D-C3/D-C5/D-C6/D-C7/D-C9/D-C12/D-C13)
- **Guard:** `smartmetadata-airflow-apis/tests/test_translation_knobs.py`, `smartmetadata-airflow-apis/tests/test_source_config_override.py`, `smartmetadata-ingestion/tests/test_source_knobs.py`, `smartmetadata-ingestion/tests/test_pipeline_status.py`, `smartmetadata-ingestion/tests/test_reconcile.py`, `smartmetadata-ingestion/tests/test_workflow.py`, `smartmetadata-ingestion/tests/test_procedures.py`, `smartmetadata-ingestion/tests/test_constraints.py`, `smartmetadata-ingestion/tests/test_metadata_c8.py`, `smartmetadata-ingestion/tests/test_metadata_c8_enrichment.py`, `smartmetadata-ingestion/tests/test_usage_engines.py`, `smartmetadata-ingestion/tests/test_usage_processor.py`, `smartmetadata-ingestion/tests/test_usage_query_log.py`, `smartmetadata-ingestion/tests/test_usage_sink.py`, `smartmetadata-ingestion/tests/test_usage_stage.py`, `smartmetadata-ingestion/tests/test_usage_workflow.py`, `smartmetadata-ingestion/tests/test_lineage_channels.py`, `smartmetadata-ingestion/tests/test_lineage_graphs.py`, `smartmetadata-ingestion/tests/test_lineage_parser.py`, `smartmetadata-ingestion/tests/test_lineage_procedure.py`, `smartmetadata-ingestion/tests/test_lineage_query_filters.py`, `smartmetadata-ingestion/tests/test_lineage_resolution.py`, `smartmetadata-ingestion/tests/test_lineage_source.py`, `smartmetadata-ingestion/tests/test_lineage_workflow.py`, `smartmetadata-ingestion/tests/test_profiler_execution.py`, `smartmetadata-ingestion/tests/test_profiler_plan.py`
- **Related:** RULING-CAPABILITY.md D-C1–D-C13; CAPABILITY-GAPS.md C-3/C-11; design-sql-parsing.md; design-ac-engine.md

## Context

The five agent types' pipeline schemas were at parity and the forms
rendered every knob, but `translate_pipeline` carried only filter
patterns, `includeViews`, `markDeletedTables`, and the messaging
sampling flags into the runner config — every other knob was silently
dropped (C-3), so users set knobs that provably never executed. The
runner status shape could not feed live agent cards either: no
`progress` map, hardcoded zero warnings, and no steps while running
(C-11). The usage/lineage clean-room chain additionally needs the SQL
parsing engine the pin delegates to.

## Decision

**D-C1 — Clean-room basis.** Nothing in the SQL-parsing or
autoClassification chains is portable: every chain file carries a CCL
header. This batch works only from the behavioral specs in the two
design docs, the `openmetadata-spec` JSON schemas already in the tree,
and third-party library APIs. No pin code, structure, or tests are
copied. New files carry the Apache-2.0 header.

**D-C2 — Dependency adoption.** `collate-sqllineage==2.1.9` is a CORE
dependency of `smartmetadata-ingestion` (usage/lineage run for every
database connector), the same version the pin uses, so cascade behavior
matches. License: MIT per the published wheel's `METADATA` classifier
(`License :: OSI Approved :: MIT License`), confirmed from the
installed 2.1.9 distribution. Caveat: the wheel bundles no `LICENSE`
file; the MIT declaration rests on the PyPI metadata classifier (and
Snyk's listing). Transitives (sqlglot 29.0.1, sqlparse 0.6.1,
collate-sqlfluff 3.5.3, networkx) are permissive. Requires-Python is
`>=3.10`; the resolved image Pythons satisfy it — the ingest image
resolves to Python 3.11 (`Dockerfile.ingest` default
`python:3.11-slim`, same tag pinned by both compose variants) and the
Airflow image to Python 3.12 (`Dockerfile.airflow` default
`apache/airflow:3.3.2-python3.12`, no compose override). Rejected
alternatives stand rejected: upstream `sqllineage` (no SqlGlot
analyzer), raw `sqlglot` only (loses the fallbacks and the
column-lineage graph), hand-rolled regex parsing.

**D-C3 — Translation plumbing.** `translate_pipeline` +
`WorkflowConfig` + `SourceConfig` carry EVERY per-type knob from the
five pipeline schemas — database metadata (all service variants),
usage, lineage, profiler, and autoClassification (all three category
schemas) — enumerated from the `openmetadata-spec` JSON schemas in the
tree, plus `shardedTables`, which exists only in the UI schema copy
(the spec copy lacks it; C-15 stale snapshot). Typed fields only: the
base model's extras-forbidding policy stands. Absent keys take their
schema default so the runner always sees the effective config, except
where the schema default itself varies by pipeline/service:
`includeViews` defaults false for profiler (true elsewhere),
`includeOwners` defaults true for pipeline-service metadata (false
elsewhere), `includeTags` defaults false for storage metadata (true
elsewhere) — the translation computes those three from the pipeline.
Two naming rules: where a boolean toggle and a filter-pattern list
would share a name, the list keeps the plain name and the toggle takes
an `_enabled` suffix (`includeTables` → `include_tables_enabled`, and
siblings); the `includeDDL` / `includeUnDeployedPipelines` aliases are
spelled explicitly because the camel-case generator would lowercase
the capitals. An explicitly empty `metrics` list is preserved (it
means "compute all metrics"), distinct from an absent key (the schema
default list, carried as `DEFAULT_PROFILER_METRICS`). The schema's
`profileSampleConfig` `oneOf` resolves by declared arm first, other
arm second, since the `oneOf` does not consult `sampleConfigType`.
`processingEngine` is a discriminated union (Native/Spark); selecting
Spark is carried typed and is a recorded residual (no Spark runner
exists — the runner must fail loud on it, never silently run Native).
`storageMetadataConfigSource` is the one schema knob NOT plumbed: its
credential-bearing manifest sources have no runner design yet, so it
stays in `ignored_source_switches` with a runtime warning and a
residual entry below. The pre-existing ignored switches
(`sampleDataQuery`, `enableDataProfiler`, and the sampling flags
outside their owning pipeline types) stay ignored-with-warning, now
type-aware: `storeSampleData` is plumbed for autoClassification and
messaging metadata, ignored elsewhere. Unknown `sourceConfig` keys on
five-type pipelines warn at parse time. `workflow.reconcileStale`
keeps its existing `markDeletedTables`-with-`False`-default mapping in
this batch; the D-C7 default flip and per-kind reconcile wiring belong
to the metadata worker, which records them in this file's D-C7 section.

**D-C5 — Fork adaptations (interface-level).** The REST-only runner
decision stands: no Elasticsearch client is added (view definitions
come from the existing live-catalog channel, checksum/incremental
skips and UDF resolution go through REST reads), and no SQLAlchemy is
added (query-log readers execute through the existing per-connector
`*_connect` factories + cursor protocol, rows normalized to
lowercase-key dicts). Observable equivalence: the same edges, counts,
queries, joins, lifecycle, and cost records the pin's chain produces,
reached through REST and raw drivers instead of ES and SQLAlchemy.
This batch carries the knobs those adaptations need
(`incrementalLineageProcessing`, `overrideViewLineage`,
`queryParserConfig`, `stageFileLocation`); the adaptations themselves
land with the parsing work. As built by the lineage worker (C-6):
incremental skip is decided through REST reads — the view channel
skips only when every expected edge is present with the stored
`sqlQuery` equal to the view definition, and the query channel skips
only when BOTH the `processedLineage` query lookup and a
first-edge-intact lineage read agree; `overrideViewLineage` deletes by
lineage source (upstream-only, source-filtered, so a query's edges
into a view are never clobbered; 404 on delete is a no-op); UDF bodies
are resolved through REST and parsed one level deep, with lookup
misses counted as a bounded per-engine gap; binding reuses the usage
worker's REST resolver unchanged, with the full fallback chain
specified in `lineage/resolution.py` (a mandatory parent-review item).
`_replace_target_table` (view-write target replacement) is NOT
implemented: the design names it without specifying behavior, and the
behavior was not invented — it is recorded as an open detail in
`lineage/query_lineage.py`.

**D-C6 — Dead knob.** `processQueryCostAnalysis` is carried as a typed
field with NO behavior: the pin has zero readers for it too, and the
cost pipeline runs unconditionally. No runner code may read it; parity
means leaving it unread.

**D-C7 — Metadata deletion: pin default, per-kind flags, guarded.**
`workflow.reconcileStale` is no longer `markDeletedTables` with a
`False` default: for metadata pipelines it is true when any effective
`markDeleted*` flag of the pipeline's service family is true (schema
defaults applied), and false for every other workflow type, whose runs
must never delete catalog entities. The four database flags reconcile
independently — tables, schemas, databases, and stored procedures each
get their own `deleteStale` call, gated by their own flag — and the
other families' kinds (topics, charts, dashboards, containers,
pipelines) likewise reconcile only under their own flags. Stored
procedures reconcile through the existing `/v1/storedProcedures/
deleteStale` endpoint; no server change was needed (D-C12).
Reconcile runs only after a clean run (a failed run's seen set is
partial), only for kinds whose listing was complete — a filter
pattern narrowing the kind, or an inclusion toggle suppressing part
of it (`includeTables`/`includeViews` off for tables,
`includeStoredProcedures` off for procedures), skips that kind, since
the service-scoped `deleteStale` would otherwise delete live entities
the run never listed — and never against an empty listing (a kind
with no seen FQNs is skipped; the server's `allowEmptySeenFqns`
default-false is the backstop and is never set here). A reconcile
failure fails the run: every eligible kind is still attempted, then
the failure raises as a sink-step failure — this supersedes the C-11
sentence above that carried reconcile failures as sink-step warnings.
The trigger-override path honors every knob the translation owns
through the same knob tables (filter patterns re-translated, scalars
carried to their aliases) and recomputes the gate when the override
carries `markDeleted*` keys, so a scoped run stays unreconciled.

**V-3 evidence (no creator depends on the old `False` default).**
UI-created pipelines carry seeded explicit values: the form seeds
schema defaults under the prefill
(`smartmetadata-ui/src/components/ingestion/
SchemaDrivenSourceConfigForm.vue:26-29,188-199`), so `markDeletedTables`
is explicitly `true`. AutoPilot-created pipelines set only filter
patterns (`CreateIngestionPipelineImpl.java:376-383`,
`getDatabaseServiceMetadataPipeline`) and rely on runtime defaults —
the flip aligns them with the pin, whose schema default is `true`.
The server's scoped-run overrides set all four flags explicitly
false (`MetadataScoper.java:56-64`, plus `TableFilterScoper.java:36-44`
for the narrowing patterns) and are honored as explicit values by the
override path above, not by the default. No YAML/JSON workflow config
in the tree sets `reconcileStale`, and the `WorkflowSettings` default
stays `False`, so config-file creators are unaffected. No in-repo REST
creator sets `markDeletedTables` (grep: only UI schemas/tests, the
server scopers, and the translation itself). The flip is therefore
safe, conditional on the override path honoring all four flags — which
this batch implements and guards.

**D-C8 — Metadata enrichment: procedures first-class, payloads
complete, every database knob honored or residualed.** Stored
procedures are a first-class topology node: a record type, a topology
stage, single and bulk sink paths, and their own reconcile flag
(D-C7). Readers exist for seven engines (postgres, mysql, mariadb,
mssql, snowflake, greenplum, timescale); overloads dedupe by name
because the server identifies a procedure by FQN alone, and a NULL
definition emits `code: ""` rather than skipping the record — a
skipped procedure would reconcile as stale. Table payloads carry
tags, owners, DDL, constraints, lifecycle, and custom properties:
owners resolve to entity references by id (the schema requires `id`,
so bare names are invalid and resolve loudly or not at all); DDL and
JSON-schema extraction fail loudly when requested from an engine
without a reader, never silently emit empty values; CHECK/EXCLUDE
constraints are dropped because the schema enum cannot represent
them, and Snowflake foreign keys carry no referred columns because
its referential view is unverified; lifecycle comes from
MySQL-family table timestamps and MySQL/Snowflake procedure
timestamps only. Selection is per-kind: `includeTables=false` gates
tables while views stay under `includeViews`,
`databaseFilterPattern` applies to single-database connectors, and
`useFqnForFiltering` matches fully qualified names. Knob
disposition: `queryLogDuration`/`queryParsingTimeoutLimit` belong to
the lineage sibling; `shardedTables` is BigQuery-only (C-10);
`sampleSize`/`includeSampleData` have no connector; the
dashboard/pipeline/storage inclusion knobs and
`defaultManifest`/`lineageInformation` are pre-existing and outside
database scope. `threads` is a performance hint — execution stays
sequential with identical catalog results. `incremental` fails the
run loudly when enabled: no audit-table incremental reader exists,
and the UI form never offers the field (no caller passes the
support props, C-15), so the fail-loud path guards only
non-UI-created pipelines. Tags and custom properties are
record-plus-sink only: no connector populates them today, and
`includeTags=false`/`includeCustomProperties` are honored as
send-only-when-present. `overrideMetadata` is bulk-only — the server
honors it only in bulk requests. No engine exposes source-derived
owners.

**C-11 — Runner status shape.** `step_summary` reports the step's own
warning and updated-record counters (never hardcoded zeros) and a real
`progress` map: per entity kind, `total`/`processed`, plus
`estimatedRemainingSeconds` only when a rate exists (some processed,
some remaining, elapsed time recorded) — otherwise the key is omitted,
never guessed. Steps are present in every state, including while
running. The source step's totals come from the collected records;
the sink step's totals from records that reached the sink, completed
only when their write or flush lands. Reconcile's per-call soft
failures count as sink-step warnings. `updated_records` has no
producer yet (the sink does not distinguish creates from updates);
its counter stays the source of truth and reads zero until a producer
lands — the serializer must not invent it.

## Consequences

- Batch-2 (AC engine) never extends translation: the AC knobs
  (confidence, enableAutoClassification, classificationLanguage,
  sampleDataCount, classificationFilterPattern, topic/bucket/container
  patterns) are already carried.
- Runners read knobs from `SourceConfig`; a knob set in the UI that a
  runner does not honor yet is a visible gap in that runner, not a
  silent drop in translation. Honoring is the batch-1/2 runner work.
- The `ROWS` vs `ROW_COUNT` spelling split is preserved deliberately:
  the pipeline-carried sampling models use the schema's `ROWS`; the
  runner's `StaticSampleConfig` uses `ROW_COUNT`; the profiler worker
  maps between them following the existing `_static_from_dict`.
- Residuals: `storageMetadataConfigSource` (no runner design);
  Spark processing engine (no runner); `updated_records` producer
  (sink create/update distinction); per-scope reconcile (a filtered
  run reconciles nothing for the narrowed kind — the service-scoped
  `deleteStale` cannot express per-schema/per-database scopes, so
  filtered runs skip reconcile for those kinds rather than risk live
  entities; per-scope calls are follow-up work); connector-confirmed
  empty listings (a genuinely empty listing never clears stale
  entities — `allowEmptySeenFqns` stays unset until a listing can
  prove its completeness per scope); procedure/constraint readers for
  doris, redshift, databricks, and unitycatalog; DDL readers for
  postgres, mssql, redshift, greenplum, and timescale; JSON-schema
  sampling for mssql, redshift, doris, databricks, and unitycatalog;
  Snowflake foreign-key referred columns (referential view
  unverified); source-derived tags (no engine exposes them; Snowflake
  `TAG_REFERENCES` is the future reader); source-derived owners;
  incremental metadata ingestion (fail-loud, no audit-table reader).

## Revision v5 — 2026-11-14 (review fix pass)

The parent review returned REJECT (fix-before-merge): four
overclaims in v1–v4, zero profiler decisions, unrecorded
invented-semantics choices, and missing residuals. The fix pass
corrected the code; this revision corrects the record. v1–v4
text above is untouched. Decisions B-1–B-12 were taken by the
parent agent under Bai's standing rules on 2026-11-14 and
implemented by four fix branches plus the coordinator's
warnings-producer wiring pass. The V-3, checksum, warnings, and
override sentences below supersede their v1–v4 counterparts;
everywhere else v5 adds to v1–v4.

### Corrected overclaims

**Warnings producer restored (B-4; supersedes the C-11 "real
warnings counters" claim and the "soft failures count as
warnings" sentence).** Phase 1 added two warning producers; the
C-7 commit removed both when reconcile failures became
sink-step failures, leaving every run reporting `warnings: 0`.
The producer is restored with an explicit counted set,
documented in `StepStatus.warn` and folded once per run by each
workflow: (1) binding-resolution skips — usage stage skips and
usage-sink join-column drops on the processor step, lineage
skips on the source step, one per skipped attempt; (2)
reconcile skips on the sink step — gate-excluded flag-on kinds,
empty-listing kinds, and one warning for a run whose workflow
type never reconciles; (3) query-log engine failures on the
source step, one per failed engine; (4) lineage channel
warnings on the source step; (5) one source-step warning for a
usage run that scanned queries but published no tables.
Deliberately log-only: malformed rows, unreadable CSVs, outcome
aggregates, cost-record skips, ambiguous column matches,
profiler clamping/unreadable settings, hook/cleanup failures,
percentile recompute failures, masking-stage parser failures,
and per-schema procedure/constraint reader-absent warnings
(helpers with no count channel). Reconcile `deleteStale`
failures are failures, never warnings. Workflow-driven tests
assert the counts; the U-F21 engine-failure log line surfaces
the already-counted failures and is not counted twice.
`updated_records` still has no producer (unchanged).

**Checksum-skip strengthening (B-5; supersedes the D-C5 blanket
"observable equivalence" claim for the query channel).** The
query channel now skips only when the `processedLineage` lookup
and an all-edges-intact lineage read agree — every expected edge
still present — matching the pin's all-tables-joined
requirement and the view channel's existing strictness. The v4
first-edge-only check is gone; no weakening is recorded. The
REST-vs-ES mechanism difference remains a fork adaptation
(D-C5), not an equivalence claim about internals.

**Trigger-override correction (B-11/T-F4; supersedes the D-C7
"honors every knob" sentence).** The override path crashed on
validation (camelCase keys merged into a snake_case dump,
`extra_forbidden`) — fixed by a single-spelling merge keyed off
the models' field aliases, with a `WorkflowConfig.model_validate`
test asserting values and the gate. Corrected sentence: the
trigger-override path honors every knob the translation owns
through the same knob tables (filter patterns re-translated,
scalars carried to their aliases) and recomputes the gate when
the override carries `markDeleted*` keys, so a scoped run stays
unreconciled — except `storeSampleData` and
`generateSampleData`, which the override path warns-and-ignores:
neither sampling flag is in the override alias table, so an
override carrying one logs a warning and drops it, while deploy
time honors both. Bounded residual: trigger-override sampling
flags (batch-2 or accept) — no live impact in batch 1 (no AC
runner yet; a messaging sampling override is an edge case).
The behavior is warned, not silent.

**V-3 position corrected (supersedes "V-3: CLEAR" and "the flip
is therefore safe").** The creator re-enumeration stands (UI
seeding, AutoPilot filter-only builders, server scopers, tree
grep, REST creators, pin schema defaults). The flip-safety case
did not stand at v2 time: (a) the override path crashed (M-F2,
now fixed); (b) pre-existing stored pipelines were never
examined. Corrected position: the flip is safe-direction only
with the M-F1 gate (fails closed on any narrowed listing —
ancestor patterns, connection-implied scope, single-database
scope) plus the fixed override path. Pre-existing stored
pipelines without explicit `markDeleted*` keys will reconcile
on their first post-deploy run under schema defaults —
pin-aligned behavior, but a behavior change for pipelines that
never reconciled. First-run behavior is a live-verification
item; the M-F1 gate bounds it to complete listings. Do not cite
"V-3: CLEAR" without this qualification.

**Reconcile "clean run" wording (M-F6; supersedes the D-C7
sentence).** Reconcile runs when no exception escaped the
record run: per-record failures recorded with `fail_fast=False`
do not skip reconcile, because their records join the seen set
and the listing ran to completion. Only an escaping exception
(a listing cut short) skips it. No failures-empty gate exists
— none is warranted on the evidence — and the behavior is
safe-direction. A test pins reconcile after non-exception
partial failure.

**`_replace_target_table` (U-F26).** The pin's mechanism
(rewriting a view definition's target table in place) is
deliberately omitted: the view outcome it exists to produce —
edges landing on the enumerated view — is already covered by
`target_override_fqn`. No separate replacement step is needed.

### Usage/lineage semantics decisions

**B-1 cost: pin-code parity.** Cost is the SUM of execution
costs; `count` counts EVERY execution (a cost-less execution
adds zero); `totalDuration` sums duration over all executions.
The pin code contradicts its own schema text ("avg query cost
per execution"); the code is the behavior, so the code wins.
The fork's averaging (cost-bearing executions only) is gone;
for Snowflake it differed by a factor of N executions.

**B-2 lifecycle/`exclude_usage` families: pin-literal sets as
spec data.** Snowflake exact-match {DROP, DELETE,
TRUNCATE_TABLE, UPDATE, ALTER, INSERT, MERGE} — exact match:
suffixed types like ALTER_TABLE do NOT match; preserved as
pin-literal behavior and flagged here. Databricks: NO override
(base False, everything masked). Redshift: query-TEXT regexes
(CREATE/INSERT) as the pin implements them. Masking direction
follows the pin (the fork's flipped direction is fixed). Each
set was verified against pin code and written as data, not
copied code.

**B-3 lifecycle: follow the pin.** A fresh LifeCycle is built
per run (latest per aspect within the run), including
`accessedBy` (user entity reference) and `accessedByAProcess`
(raw name) from the winning query, replacing the whole
`lifeCycle`. Mapping: SHOW/DESCRIBE added to `accessed`;
`updated` requires literal TRUNCATE_TABLE (bare TRUNCATE does
not map). Fall-through nuance, a documented judgment call: when
a staged `users` FQN cannot resolve to an entity reference, the
raw `usedBy` name becomes `accessedByAProcess` rather than
losing attribution; with both present and resolvable, the
entity reference wins, per the pin.

**B-6 Snowflake usage SQL.** The QUERY_TYPE exclusion list is
ported as spec data (23 values, including CREATE_TABLE and
CREATE_TABLE_AS_SELECT — with targets in `involved_tables`,
CTAS/CREATE_TABLE stay excluded for Snowflake; tested). Cost =
credits × creditCost², honoring the `creditCost` schema knob
(default 3.3): squaring is a pin quirk, preserved for parity and
flagged here — a custom creditCost changes reported cost
quadratically. Configurable `accountUsageSchema` is honored
(default SNOWFLAKE.ACCOUNT_USAGE, shape-validated against
injection). One-LIMIT-per-day-batch pagination is kept
(semantics preserved). Follow-up: the Snowflake procedure
provider's CALL_HISTORY_SQL still uses fixed
SNOWFLAKE.ACCOUNT_USAGE — threading config through it was
outside the fix scope.

**B-8 column-spelling fallback CONFIRMED.** When the catalog
returns no columns for an already-bound table, edges carry the
parsed spelling — bounded (no entity invented), documented,
tested. Whether table GETs include `columns` by default is
still unverified live.

**B-7 status writeback (T-F2).** Status writeback is
start/final-only in batch 1: the workflow writes exactly two
statuses per run — a `running` payload carrying the (still
zero) step skeletons so live cards can attach, and a final
payload carrying the final counts — and no mid-run writeback
exists, so live pct/ETA never updates during a run. This
satisfies the ruling's letter (steps present while running) and
is accepted as the batch-1 shape; a mid-run or periodic
writeback is follow-up work, not a batch-1 gap.

**Involved tables (B-10b).** `involved_tables` = source +
intermediate + TARGET; design-sql-parsing.md §3.2 is amended
accordingly. INSERT...VALUES and CREATE TABLE statements now
count in usage; the Snowflake exclusions above keep CTAS out
of Snowflake usage reads (F3+F9 decided together, tested).

**Masking (U-F7; C-16 deviation).** A dialect-aware span-union
masking stage replaces the dead SqlFluff stage (its
`recursive_crawl("unparsable")` test was a generator, always
truthy, so it never ran): literal spans are computed on the raw
query by both stages and unioned for SNOWFLAKE/POSTGRES/REDSHIFT
(SqlParse misses dollar quotes, SqlFluff misses Snowflake DATE
literals and Redshift hex). `$$` literals now mask. Edge/hop
`sqlQuery` carries masked text (pin parity); QueryRecord keeps
raw text (checksum + Query entity); the view channel keeps the
original definition. AST-reuse masking (design §3.2 step 4) is
NOT implemented — recorded deviation C-16 below.

**Other fix-pass corrections (behavior fixed, no new
decisions).** Path-object guard in `clean_table_name`; COPY/DDL
statement filters + `\n` unescape in the parser (COPY GRANTS
removal and MERGE `WHEN MATCHED` tail strip deliberately
omitted — SqlGlot parses both; a MERGE test locks the
behavior); service-scoped stale-file cleaning at stage
construction + scoped `close()` (two concurrent same-service
runs sharing one `stageFileLocation` still race — the shape the
pin accepts); join-column validation against catalog columns
(unique case-insensitive match → catalog spelling; no/ambiguous
match → drop with warning; unknown column list → parsed-spelling
fallback; partner 404 drops the join); percentile POSTs in
`close()` (lowercase `table`/`database` wire form, local date;
failures logged, never fatal); three files re-headed to the
fork Apache-2.0 header (two templates were used in one commit;
no header gate exists — the license test checks imports only);
`users` and `usedBy` both set on resolution; zero-publish and
engine-failure run warnings; quiet own-service probe with a
deferred warning after all resolvers are exhausted; string-aware
CSV `aborted` parsing; UDF context threaded through
`resolve_udf`; override-edge deletion only when
`processed.edges` is non-empty; `lineage_spec_for` REPLACES the
usage predicate with the DML fragment (required by the B-6
interplay — the Snowflake lineage spec carries no QUERY_TYPE
exclusion).

### Profiler decisions (C-9/C-13 fold-in)

**Plan precedence.** Table entity > pipeline typed config >
config-file fallback; global-config metric filtering first,
then per-table filtering; explicit partitioning shadows
auto-detect. Partition auto-detect windows/defaults match the
pin exactly (code constants + comments carry the values).

**`columnNames` is not written.** No such field exists in the
pin or fork `tableProfile` schema and pin write-back never maps
it; the value stays on the table stat row only. `columnNames`
remains an accepted metric name and selecting it is a no-op in
output.

**`executionSource` server/spec residual (B-12).** Written as
`{databaseName, schemaName, tableName}` on table + column
profiles, `None` under `profileQuery` (pin rule). The fork
server/spec lack the field entirely (spec drift vs pin
`type/tableExecutionSource.json`); the file cites are in the
profiler review §5. "The server drops it" is NOT asserted: it
is unverified, and two server mechanisms point the other way
(strict-mapper fallback preserving the raw map; possible
`additionalProperties` round-trip). Open live check: one
profiler run + `GET .../tableProfile/latest` settles whether
the field survives the round trip. UI rendering is withheld
pending that check: the panel renders size/sample table extras
(P-F5) but not `executionSource` (a component test pins its
absence) or the table `timestamp`.

**TIME-UNIT cutoff in Python.** The partition cutoff is
computed in Python (`now - interval`, bound param), not by
per-dialect DB-side date dispatch — a fork adaptation. The
cutoff uses the worker's clock, not the database's.

**Live-catalog enumeration.** Enumeration stays live-catalog
with per-table entity enrichment, not pin OM-entity
enumeration — a fork adaptation; it explains the ENTITY-only
global-filter limitation below.

**Threading/timeout adaptation (P-F11).** Threading and timeout
granularity differ from the pin by adaptation, not by omission.
The pin threads within a table (per-metric futures,
`timeout_seconds` per future, automatic thread count from task
count with a minimum of 5 when unset). The fork threads across
tables (per-table futures), applies `timeoutSeconds` per table,
and runs sequentially when `threadCount` is unset. The
user-count clamp `[1, 20]` matches the pin exactly and clamping
warns. A thread that outlives its timeout cannot be killed
mid-query: it is abandoned (`shutdown(wait=False)`) and the
table is already recorded as failed. The adaptation is
thread-safe because the reader opens a fresh connection per
query. One caveat: sequential waiting over in-order futures
means a slow early table delays the timeout clock start for
later tables — the per-table bound holds, the total wall-clock
bound does not.

**80% success threshold.** Raised after all handles; written
profiles stay written. Denominator = attempted tables
INCLUDING fetch/plan failures (P-F1 fix: a 9/10-fetch-failure
run no longer computes 100%); classification-filtered tables
stay excluded from the denominator.

**Fail-loud set.** Spark engine, `useStatistics`, `system`
metric, unknown metrics, non-positive timeout, and explicitly
configured INGESTION-TIME/ENUM/OTHER/INJECTED partition types
(the last fail the table at plan time). No silent fallbacks.

**System profiles + table-stats SQL (per-dialect residuals).**
No dialect has a wired system-profile computer; Redshift's
computer stays injectable-only (query map differs by instance
type, unverifiable without live Redshift). Redshift, Doris,
Databricks, and UnityCatalog table-stats SQL report
`(None, None)` — never guessed queries. MSSQL allocation-units
SQL and Snowflake `BYTES`/`CREATED` columns are
standard-catalog knowledge, NOT live-verified.

**Global-config filtering (P-F8).** Matching uses ENTITY column
dataTypes only; a column missing from the entity (or an
uncataloged table) passes the global filter through. If the
global `ProfilerConfiguration` settings endpoint cannot be
read, the run proceeds with pipeline + table metric filtering
only — metrics the global config disabled get computed — and
the only trace is a warning log line: no step warning, no
report counter, and the catch is total (any exception,
including client misconfiguration). The settings read is
treated as advisory, never a run blocker. The workflow-level
catch is a second net behind the REST client's own swallow,
which already returns `None` on any error; the limitation and
its failure mode (silently wider computation) are recorded
here rather than changed, under the standing fail-loud rule's
exception for this advisory read.

**Sample-data scope boundary (P-F4).** The profiler honors no
sample-data knob. The per-table
`tableProfilerConfig.sampleDataCount` (schema default 50) is
editable in the per-table settings modal, but no profiler run
consumes it: the plan resolver never reads it, and the profiler
never fetches sample data at all during a run. The global
`ProfilerConfiguration` `sampleDataConfig`
(`storeSampleData`/`readSampleData`) is likewise never read on
the profiler path: the global-config filter reads only
`metricConfiguration`. The per-table `sparkTableProfilerConfig`
is silently ignored (no reader anywhere); it is implicitly
covered by the Spark-engine residual but is named here
explicitly. In the pin, `sampleDataCount` sets the sampler's
sample-data row limit and `sampleDataConfig` gates sample-data
store/read in the sampler, so this is a scope boundary, not
parity: sample-data fetching is unimplemented in the fork
profiler, and the modal's sample-data field edits a value no
run consumes.

**Custom-metric edge (P-F9).** A custom metric bound to a
column the global config disabled is evaluated (one scalar
query) and its result then dropped, silently: the binding check
validates only include/exclude scope, not the per-column empty
sets produced by global filtering, while the column loop skips
such columns entirely. This contrasts with the loud error for a
metric bound to an unprofiled (excluded) column. Edge case;
recorded, not fixed: making it loud would fail whole tables on
a configuration combination that today completes, and the pin's
behavior for this edge is unknown. A fix needs a ruling on
loud-vs-drop.

**Partition-column display-type risk (P-F6).**
`partitionColumnsFor` matches the column's `dataType` exactly
(upper-cased) against the pin's enum sets, but the settings
modal receives `dataTypeDisplay || dataType` from the entity
mapper. If a live catalog returns display strings such as
`varchar(255)` or `timestamp with time zone`, the exact match
fails and the partition-column select offers nothing, with no
error. The unit tests use enum names only, so this is
untested. One live check against a real table's `schemaRows`
settles it; until then it stands as an unverified risk, not a
confirmed defect.

**Settings modal decisions (summary).** GET/PUT
`tableProfilerConfig` only (no DELETE — the pin modal doesn't
use it); failed load disables save (pin rule); label
compositions built from pin parts where the pin template
ignores its parameter; `profileQuery` in a monospace textarea
(the fork ships no code editor); all four pin interval types
offered including INGESTION-TIME (pin surface) while the
runner rejects it loudly. The 31-field surfacing set is exactly
the pin vocabulary; the modal matches pin evidence
field-by-field. Empty-SELECT guard (P-F2): table-only /
`valueRank`-only metric selections skip column SELECTs, and
`_profile_column` never renders an empty SELECT. Write-back
claim (P-F10): writing prerequisites is pin parity (the pin
writes `ColumnProfile(**all results)` with no post-filter) —
the docstring is corrected, behavior unchanged.

### Disposition corrections

**`queryParsingTimeoutLimit` (T-F6).** `queryLogDuration`
belongs to the lineage sibling. `queryParsingTimeoutLimit` is
typed and translated but carried-but-unread: no code reads it,
and the lineage schema does not declare it, so the disposition
names no real reader. It is carried for a future metadata-side
query-parsing bound; wiring it to the metadata-side query
parsing it nominally bounds is follow-up work.

**Non-database-family knobs + gate-only flags (T-F7).** The
`dataModelFilterPattern`, `projectFilterPattern`,
`apiCollectionFilterPattern`, `apiEndpointFilterPattern`,
`mlModelFilterPattern`, `searchIndexFilterPattern`,
`directoryFilterPattern`, `fileFilterPattern`,
`spreadsheetFilterPattern`, `worksheetFilterPattern`,
`bucketFilterPattern`, and `serverFilterPattern` knobs (and the
include/exclude lists they split into) are typed and translated
but have no fork runner for their service families; they are
carried for future runners. `overrideLineage`,
`ownershipUpdateMode`, and `statusLookbackDays` are typed and
translated but have no reader in this batch — no fork runner
for the behaviors they govern; carried for future runners.
Eight `markDeleted*` flags — `markDeletedDataModels`,
`markDeletedMlModels`, `markDeletedSearchIndexes`,
`markDeletedApiCollections`, `markDeletedDirectories`,
`markDeletedFiles`, `markDeletedSpreadsheets`,
`markDeletedWorksheets` — feed only the aggregate reconcile
gate in translation and can never enable a reconcile kind,
because the runner's per-kind map covers 9 kinds and no fork
runner lists those families; behaviorally a no-op, carried for
future runners.

### Residuals added by the fix pass

- C-1 metrics absent (M-F5): the pin's per-table metrics have
  no fork counterpart — no field, reader, or sink key. Owner: a
  future metadata-enrichment batch. (Tags/custom properties
  stay record-plus-sink only; no live connector populates
  them. Note: static-path records carry owner/tags/extension
  regardless of knobs — static gating unenforced.)
- C-2 sample-data knobs (P-F4): see the profiler section above.
- C-3 C-14 UI surfaces unbuilt: the data path is present (all
  five usage writes + percentile POSTs), the UI absent as
  decided. Evidence: C14-PIN-EVIDENCE.md. Owner: the D-C14 UI
  follow-up batch (recognizer-feedback approval surface,
  Generated-tag badge, C-14 surfaces).
- C-4/C-5/C-6/C-17: RESOLVED by the fix pass (Snowflake SQL,
  join validation, percentile compute, CSV `aborted`, UDF
  context, view-override scope) — no residual entries.
- C-7 Postgres PG<13 bound (U-F18): `mean_exec_time` is
  hardcoded and `time_column_name` dropped, so PG<13 history
  reads fail outright (fail-loud). PG13+ only until engine
  probing lands.
- C-8 MySQL history source (U-F19): the fork reads
  `performance_schema` (a different source from the pin's log
  tables; timer math verified sound) and drops
  `queryHistoryTable` configurability; unlive-verified.
  Performance-schema consumer prerequisites stay on the
  live-verification list.
- C-9 missed DML forms (U-F20): lineage misses Snowflake
  COPY/UNLOAD/SWAP/CLONE forms the pin includes. Follow-up:
  type-based fragments for Snowflake/Databricks.
- C-10 `queryUsedIn` equivalence unverified (U-F27): the pin
  sets `queryUsedIn`; the fork links via
  `PUT /queries/{id}/usage`. Likely equivalent display; on the
  live-verification list.
- C-11 procedure/constraint readers absent on doris, redshift,
  databricks, unitycatalog: already in the v1–v4 residual list;
  the fix pass adds warnings when procedures/constraints are
  requested or default-on but the reader is absent (silent
  when `enabled=False`).
- C-12 profiler per-dialect residuals: see the profiler
  section above.
- C-13 partition-column display-type risk (P-F6): see the
  profiler section above; one live check settles it.
- C-14 F3 drift risk (Q-F3): the lineage query-channel gate
  reads an 8-engine frozenset snapshot
  (`SUPPORTS_LINEAGE_EXTRACTION_ENGINES`) rather than the
  design's field-presence check on the connection model
  (gating on the connection model HAVING a
  `supportsLineageExtraction` field — presence, not value).
  Verified factually correct against all 11 connection schemas
  at batch time (doris/mariadb/greenplum declare only
  `supportsViewLineageExtraction` and are correctly absent),
  but a future schema or connector change silently
  desynchronizes the gate. Deriving the gate from the
  connection shape is a later pass, per the D-C6
  derive-from-shape principle.
- C-15 staging file naming (U-F17): calendar dates vs pin
  millisecond timestamps; an internal-only contract, the fork
  naming more operable. Note only; do not "fix" without reason.
- C-16 AST-reuse masking deviation (U-F15): design §3.2 step 4
  skipped; the span-union stage above is behaviorally
  equivalent on all representatives probed, but AST reuse is
  the mechanism that would fix dialect blindness structurally.
  Deviation recorded; implementing reuse is follow-up work.
- C-18 no live verification anywhere: the 7-item acceptance
  list (history SQL per engine; five writes + percentile
  POSTs against the real server; reconcile + stored-pipeline
  first runs + override scoping; `executionSource` round trip;
  table-GET columns / `put_lineage` procedure type / partition
  display types / stats SQL / metadata assumptions; image
  builds with collate-sqllineage; profiler threshold /
  table-only selection / global filtering end to end) must
  close specific questions; the blanket statement must not
  survive the deploy unexamined.

### Guard-list extension (Q-F2)

The Guard header above is extended with the 16 usage/lineage/
profiler guard test files added in this batch. Adjacent UI
guard (same batch):
`smartmetadata-ui/src/quality/profilerSettings.test.ts`.
