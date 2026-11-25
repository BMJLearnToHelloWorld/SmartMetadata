# Sink failures are recorded values, not aborts: one shared buffer, hierarchy-ordered flush, and a post-scan success-threshold verdict

- **Status:** Accepted
- **Revisions:** v1 2026-11-17 (initial) · v2 2026-11-25 (FK premise corrected by ADR:2026-11-25-fk-deferral)
- **Deciders:** Bai (2026-11-17: option A — align with official, no FK topological sort; design v2 approved on the recommended answers to Q1–Q5; the AutoPilot trigger-button fix rides in the same batch)
- **Guard:** `smartmetadata-ingestion/tests/test_bulk_sink.py` (single buffer, group order, group isolation); `smartmetadata-ingestion/tests/test_workflow.py` and `test_pipeline_status.py` (record-and-continue, threshold boundaries, close-flush); `smartmetadata-airflow-apis/tests/test_translation.py` (no `failFast` emission); `smartmetadata-ui/src/views/ingestion/ServiceDetailView.test.ts` (request hits `/permissions/app`, button renders) — assertions added or rewritten by this batch
- **Related:** upstream pin `a3012259ca`; design v2 `~/workspace/work/sink-failure-semantics/DESIGN.md` (not in-repo, sole authority for this batch); ADR:2026-11-16-live-issues-batch-parity (the batch whose main this defect surfaced on); ADR:2026-11-17-dl2c-binding-context (D-L2c Phase 2 untouched by this batch)

## Context

On 2026-11-17 the icrm live run failed and stopped the chain. Service
`icrm-monorepo` (MySQL, 1004 tables): AutoPilot built the metadata
pipeline and ran it at once; at 50 tables the sink's bulk write had 19
table records rejected by the server — every one a foreign-key pair, a
table written before the table its foreign key points at had landed.
The workflow aborted, 38 records had landed, the run was judged
`failed`, and the AutoPilot chain stopped at the metadata node: the
other four agents were never built. Rebuilding the service reproduced
the same failure (new service id `32d5ad66…`, still one agent).

Source-level benchmarking against the pin established that the failure
is in the fork's failure semantics, not in ordering:

- `default` is unrelated: the pin applies the same rule (an empty
  `databaseName` means `default`).
- The pin has no FK topological sort either. A first run fails every
  X-before-Y pair across the whole stream; the 19 rejections are only
  the first batch's observed value, not the stream's total.
- The pin gets through on failure semantics: failures are recorded,
  the scan runs to the end, and the verdict is computed afterwards.

The fork diverged from the pin in three places:

1. **Mid-stream abort.** `translation.py` translated the pipeline's
   `raiseOnError=True` into workflow config `failFast: true`, and
   `_drain_flush_result` raised on the first failed flush, so the
   remaining records were never attempted. The pin has no mid-stream
   abort: `raiseOnError` is judged only after the full scan, against
   a success-rate threshold.
2. **Per-kind buffers.** `BulkMetadataRestSink` used nine per-kind
   buffers plus a `_KIND_PARENTS` parent-first patch. The pin uses one
   shared buffer, grouped by entity type and ordered by hierarchy
   depth at flush time.
3. **State close-out chain.** The fork's ingestion already computed
   `final_pipeline_state` (some success plus some failure yields
   `partialSuccess`), but the mid-stream raise failed the Airflow
   task, and the failure callback in `workflows/common.py` overwrote
   the state to `failed`, stopping the chain. The same data under pin
   semantics finishes as `partialSuccess`, which the chain accepts as
   success (`SUCCESS` or `PARTIAL_SUCCESS`).

### Official-behavior benchmark (pin `a3012259ca`, behavior only)

| # | Behavior | Official behavior | Fork status before this batch |
|---|----------|-------------------|-------------------------------|
| B-1 | Buffer structure | One shared buffer, flushed when the batch fills (default 100) | Nine per-kind buffers, batch default 50 |
| B-2 | Flush grouping and order | Grouped by entity type; groups in ascending hierarchy-depth order (depth = tree level × 100 + in-node stage index, minimum across topologies); arrival order within a group; one bulk call per group | Fixed kind order in `_flush_all` plus the `_KIND_PARENTS` patch; proven not equivalent to depth order (the storedProcedure group precedes the table group officially) |
| B-3 | Group failure isolation | One group's bulk-call exception records only that group's failure; the other groups continue | Aligned: one kind's failure is recorded in `FlushResult`, the rest continue; no change |
| B-4 | Failure shape | A failure is a value, recorded in step state; nothing throws, nothing interrupts | Flush failures are recorded in `FlushResult` (aligned), but `_drain_flush_result` raises when `fail_fast` is set (divergence) |
| B-5 | Full scan | Every record is attempted; failures never truncate what follows | First failed batch aborts (divergence) |
| B-6 | Post-scan verdict | After the full scan, judged against `successThreshold` (spec default 90): rate ≥ threshold and < 100 → `partialSuccess`; < threshold → `failed`; 100 → `success`; an unhandled exception → `failed` | `final_pipeline_state` judged "some success and some failure → partialSuccess" with no threshold, and the mid-stream raise pre-empted it |
| B-7 | Raise timing | `raiseOnError` (default true) raises only after the state is written back, per the threshold verdict; above the threshold it does not raise and the task succeeds | `failFast` raised while records were being processed (divergence) |
| B-8 | Task-failure callback | On task failure, takes the stored state and changes only `endDate` plus `pipelineState=failed` | Implemented as-is; keep untouched |
| B-9 | Single-write types | Service-class records and a set of types are single-written, never buffered; this includes Container and Pipeline (noted officially as having no bulk endpoint or as order-processed within a topology) | `MetadataRestSink` writes immediately with flush-then-write; Container/Pipeline are buffered groups in the fork (the server bulk endpoints exist in fact); the difference is an explicit decision, see D-S4; all other items compared one by one and matching |
| B-10 | Close drain | Close drains the remaining buffer; failures are recorded in state | `close_steps` calls `flush()` and counts the result (structurally aligned; failure semantics per D-S6) |
| B-11 | FK ordering | None. Server bulk handling prepares record by record, FK checks run against the database, and a batch is neither sorted nor retried | Likewise none (in agreement; do nothing) |
| B-12 | Success-rate math | Per step: successes are `max(record_count + updated_records, 1)`; rate = successes / (successes + failures); an empty step scores 100%. The workflow rate is the MEAN of the step rates (the pin's `calculate_success` code returns the mean; its docstring calling it the minimum is a proven comment error — the source wins) | `RunReport` carries succeeded/failed counts; per-step rates must be added (see D-S5); `updated_records` is constantly 0 in the fork |

## Decision

**D-S1 — Record the failure and continue; judge by threshold
afterwards (the core).** `_drain_flush_result` no longer raises.
Flush failures go into step state and the report only, and record
processing continues to the end of the stream. `WorkflowSettings`
gains `success_threshold: int = 90` (the spec `workflow.json`
default). The post-scan raise in `execute()` is unconditional once
the state has been written back; whether the task itself fails is
decided by the operator's existing `raise_on_error` gate — no new
`raiseOnError` field is added to `WorkflowSettings`. The two local
`fail_fast` points in `usage/workflow.py` follow the same rule in
this batch; `lineage/workflow.py` has no local point and is covered
automatically by the base class with zero changes. The Airflow-side
`raise_on_error` gate and failure callback in `run_pipeline_workflow`
stay untouched (already official behavior).

**D-S2 — One shared buffer, batch default 100.** `BulkMetadataRestSink`
keeps a single shared buffer (records in arrival order, each tagged
with its kind) and flushes when `bulk_batch_size` fills;
`SinkConfig.bulk_batch_size` moves from 50 to 100 (Q1, official
default; `translation.py` does not emit the value, so the default
applies). The `_KIND_PARENTS` patch and the nine per-kind buffers are
deleted. The outward contracts of `buffers()`, `take_flush_result()`,
`FlushResult`, and `FlushFailure` are kept (the workflow-side drain
mechanism does not move; only the raise goes). The `__init__`
construction default for `batch_size` aligns to 100 with the config
default.

**D-S3 — Flush grouping and hierarchy order.** At flush time the
buffer is grouped by kind and the groups are emitted in official
hierarchy-depth order (depth = tree level × 100 + in-node stage
index, minimum across topologies). The implementation exports the
complete group-order table from the pin topology tree and pins it
with tests; a proven constraint is that the storedProcedure group
precedes the table group. The fork's old kind order is not reused
(proven not equivalent to depth order). Arrival order holds within a
group; each group makes one call to the existing bulk endpoint; each
group's call and response recording sit inside broad exception
isolation, so one group's exception records failure and the rest
continue. When a whole batch is rejected, failures are recorded per
payload (kept — see the F10 deviation below). The per-record
`successRequest` / `failedRequest` recording moves with the
structure, semantics unchanged.

**D-S4 — Single-write list aligned, with one recorded exception.**
Service records, lineage, usage, query, profile, test-case-result,
classification, tag, and app records keep going through
`MetadataRestSink` immediate writes; when the bulk sink meets a
non-buffered kind it drains first and then hands over (the existing
"wire order, parent first" behavior is kept). Container and Pipeline
stay buffered groups (F7 deviation, below).

**D-S5 — Threshold verdict.** `final_pipeline_state` applies the
threshold rule: step rate = `max(record_count + updated_records, 1)`
divided by that success count plus failures, an empty step (0 records,
0 failures) scoring 100%; the workflow rate is the MEAN of the step
rates (Q2, F1 — code over docstring). Rate ≥ threshold and < 100 →
`partialSuccess`; < threshold → `failed`; 100 → `success`; `stopped`
is kept. The generic threshold is 90; the profiler uses the shared
determination with its own 80 value (F3) and keeps its existing
post-scan 80 verdict — both must pass. Step rates use the
step's own counts (`StepStatus` records/failures), never derived back
from the report; `updated_records` enters the pin formula (currently
constantly 0, no difference); `RunReport` counts stay the
workflow-level rollup. The `execute()` shape is kept: run the records
→ `close_steps()` → reconcile (only when no exception escaped) →
write the state back → raise below the threshold or on an escaped
exception (after write-back). `pending` carries only unhandled
exceptions and the below-threshold verdict, never per-record flush
failures.

**D-S6 — Close-flush failure semantics.** In `close_steps()`, the
sink `flush()` result counts toward the report and the threshold
verdict, keeping the fork's "drain first, then decide" order (F6
deviation, below). Source/processor close failures keep the existing
teardown-raise semantics (the D-C7 rule does not move; F6 deviation,
below).

**D-S7 — Special paths kept.** The sampled topic's "drain, then
single-write (upsert + sample PUT)" is kept; `_write_topic_sample_data`,
`_write_profile`, `_write_query`, and the like do not move. The pin's
query buffering and deferred lifecycle are out of this batch's scope;
the fork's existing query write path is kept.

**D-S8 — AutoPilot trigger button (same batch, small item).**
`ServiceDetailView.vue` called `getResourcePermission('application')`;
the server answers `GET /permissions/application` with 400 ("Resource
type application not found"), the `.catch(() => null)` failed closed,
and the button never rendered. The literal becomes `'app'` (the
official `ResourceEntity.APPLICATION` value; `/permissions/app`
returns `Trigger: allow`). A regression test covers the button
rendering when the permission store returns `Trigger: allow` for the
`app` resource, and asserts the request hits `/permissions/app` (the
test fetch mock's `/api/v1/permissions/application` match moves to
`/permissions/app` with it, so the literal cannot regress silently).
The disabled-while-Running semantics do not move. Live check: the
"Trigger AutoPilot" button appears in the service detail header, in
both languages.

**D-S9 — Exclusions (explicitly not done).** No FK topological sort
(option A, decided; the pin has none either). Zero server changes
(bulk handling, FK checks, and chain verdicts are already official
behavior). Zero schema changes (`PipelineState` already carries
`partialSuccess`; `successThreshold` is a workflow config field, not
an entity schema field). Zero UI changes except D-S8 (the deprecated
`fail_fast` field stays, so `cliWorkflow.ts` and the example YAMLs do
not move). Parse/bind/classification engine logic does not move;
D-L2c Phase 2 does not move.

### Adjudicated answers (Q1–Q5)

- **Q1:** batch default 50 → 100 (align with official). Accepted.
- **Q2:** step-level success rates aggregated by MEAN (the official
  rule, code over docstring), not a report-level total rate. Accepted.
- **Q3:** the `usage` workflow's two local `fail_fast` points change
  semantics in this batch (one rule; splitting batches would leave
  the semantics split). Accepted; lineage follows the base class.
- **Q4:** the two D-S6 intentional deviations are accepted (below).
- **Q5:** the standard flow applies: implement → review → PR →
  unified gate → one deploy.

### Intentional deviations, recorded explicitly

These are deliberate retentions of fork behavior that differ from the
pin. They are not defects, and a future reader must not "fix" them
without a new adjudication:

- **(a) F6 — teardown raise kept, drain-before-decide kept.** The pin
  swallows close exceptions (a warning only, never flipping the final
  state) and determines state before the close-flush. The fork keeps
  raising on source/processor teardown failure, and keeps deciding
  the verdict after the close-flush, so a trailing partial batch
  counts toward the verdict — judged more accurate. Accepted by Q4.
- **(b) F7 — Container/Pipeline stay buffered.** The pin single-writes
  them; the fork keeps them as buffered groups because the server bulk
  endpoints exist in fact, the batch path is usable, and there is no
  ordering dependency. The difference from the pin's single-write
  list is recorded here, not treated as a defect.
- **(c) F10 — per-payload failure counting on whole-group rejection
  kept.** The pin counts a wholly rejected group as 1 failure; the
  fork records one failure per payload. The counting difference feeds
  the threshold math, and the fork is the more pessimistic side — an
  explicit conservative retention.
- **F4 — `fail_fast` deprecated but retained.** `WorkflowSettings.fail_fast`
  stays as a deprecated, semantically ignored field: `CamelModel`
  sets `extra="forbid"`, so deleting the field would fail validation
  for existing emitters (`translation.py`, `cliWorkflow.ts`, four
  example YAMLs) and deployed DAG configs. The field validates, never
  triggers a mid-stream raise, and is marked deprecated in code
  comments and here; `translation.py` stops emitting `failFast`, so
  new DAGs no longer carry it, and the field may be deleted after DAG
  rotation.
- **F3 — profiler 80 preserved.** `ProfilerWorkflow`'s existing
  post-scan 80 verdict is untouched, and the shared determination
  applies to profiler runs with threshold 80 (via
  `_success_threshold`), so the generic 90 never covers the
  profiler. Both verdicts must pass; this matches the pin, where
  the profiler carries successThreshold 80 under the generic rule.

### Clean-room note

The pin's ingestion source is Collate-licensed. This record states
behavior specifications only and quotes no pin code; the
implementation is rewritten clean-room under the same constraint as
the SQL parse chain and the classification chain. Where this record
and the pin source ever disagree, the source wins and the difference
is recorded as a finding.

### Live verification plan (icrm re-run, Bai's transient login)

Re-run metadata on the icrm service: the final state must be
`partialSuccess`, every failed record must be an FK-predecessor pair,
the AutoPilot chain must proceed, and all five agents must appear
(metadata/lineage/usage running, profiler/autoClassification deployed
but not run). A second run must converge on the remaining tables. The
trigger button must appear and be triggerable. This batch restores
the chain; it does not prove each agent's execution correctness —
lineage/usage parse-and-bind correctness (D-L2c §8 end-to-end still
unverified live), profiler execution and the 31-field display, and
autoClassification execution each need their own live verification,
and defects found there go to later batches. Lineage/usage first-run
states are recorded as observed; an empty run on a service with no
query-log data is a normal result, not a defect.

## Consequences

- A partial run lands what it can and converges on re-run instead of
  aborting at the first rejected batch; the AutoPilot chain proceeds
  past metadata and all five agents get built. First-run FK failures
  still occur until convergence — that is the expected official
  behavior, not a defect to chase.
- A flush failure must never again raise mid-stream, and no new
  per-kind buffer or parent-first patch may be added: the single
  shared buffer with hierarchy-depth flush order is the structure.
  `fail_fast` must never regain mid-stream semantics, and the field
  must not be deleted before DAG rotation.
- The F6/F7/F10 deviations and the F4/F3 retentions are recorded
  above; changing any of them needs a new record and an adjudication,
  not a drive-by alignment.
- The threshold math is step-mean with per-payload failure counting:
  a batch that rejects a whole group weighs heavier here than under
  the pin. Anyone tuning `success_threshold` must reckon with that
  pessimism rather than assuming pin-identical numbers.
- Deployment covers the ingest + airflow containers (the UI container
  is rebuilt with the batch for the one-line D-S8 change); server and
  MCP contents do not change.
- Processor-step counting is part of the threshold rule: the base
  workflow previously never incremented processor records, which
  would have collapsed the processor step rate under the step-mean
  and failed runs the profiler's own 80-check passes. `_handle_record`
  now accounts processor records/completion (mirroring the usage
  workflow), so the Processor step carries real counts in status
  writebacks.
- The usage workflow's end-of-run raise on any sink failure was
  removed with its two `fail_fast` points: it would have raised
  through the operator and let the failure callback overwrite
  `partialSuccess` with `failed`. The shared threshold determination
  owns the raise decision for usage runs too.

## Amendment

**v2 2026-11-25 (FK premise corrected).** The "the pin has no FK
topological sort either" finding stands, and B-11/D-S9 still exclude
topological sort. What is corrected is the inference drawn from it:
the pin defers a foreign key whose referred table is not cataloged
yet and patches it on after every table has landed
(`yield_table_constraints`), so an official first run does not fail
on foreign keys — it converges in one round. The consequence
"first-run FK failures still occur until convergence — that is the
expected official behavior" is therefore withdrawn, and the guard
"no new per-kind buffer or parent-first patch may be added" does not
cover the post-scan PATCH stage added by ADR:2026-11-25-fk-deferral
(the single shared buffer and the hierarchy-depth flush order are
unchanged). Everything else in this record stands.
