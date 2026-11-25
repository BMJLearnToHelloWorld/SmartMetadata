# Foreign keys are held back from create requests and patched on after the scan: one PATCH per table

- **Status:** Accepted
- **Revisions:** v1 2026-11-25 (initial)
- **Deciders:** Bai (2026-11-25: option (a) — clean-room port of the official "hold back + same-round PATCH"; implement and merge into this batch, #343+#344)
- **Guard:** `smartmetadata-ingestion/tests/test_bulk_sink.py` (patch applier: merge, dedupe, skip, per-table isolation); `smartmetadata-ingestion/tests/test_workflow.py` (patch phase ordering, metadata-only gate, threshold accounting); `smartmetadata-ingestion/tests/test_mysql.py` and `test_constraints.py` (source deferral and the held-back store); `scripts/harness/check_decision_records.py`
- **Related:** upstream pin `a3012259ca`; ADR:2026-11-17-sink-failure-semantics (its FK premise is corrected here); verification `~/workspace/work/verify-mysql-fk-deferral/REPORT.md`

## Context

On 2026-11-17 the icrm live run (MySQL, 1004 tables) had 19 table
records rejected by the server in its first bulk batch — every one a
foreign-key pair, a table written before the table its foreign key
points at had landed. ADR:2026-11-17-sink-failure-semantics recorded
the failure semantics (record-and-continue, threshold verdict) and
decided, under B-11/D-S9, to do nothing about ordering: "the pin has
no FK topological sort either", and "first-run FK failures still
occur until convergence — that is the expected official behavior".

That premise was incomplete. Verification on 2026-11-25
(`~/workspace/work/verify-mysql-fk-deferral/REPORT.md`, pin source
read directly) established that the pin has no topological sort but
does have a deferral: `common_db_source.py` checks the referred
table with `get_by_name` and, when it is not cataloged yet, withholds
the foreign key from the create request and records the column for
later; the topology root's `post_process` runs
`yield_table_constraints` after every table has landed, patching the
held-back keys on one PATCH per table. An official first run therefore
does not fail on foreign keys at all — it converges in one round.
The fork has no equivalent: all four database sources
(MySQL/Postgres/MariaDB/Doris) put every `FOREIGN_KEY` group into the
first `TableRecord`, in `ORDER BY table_name` order, and the sink
sends them with the bulk create, so a child in an earlier flush batch
than its parent is rejected whole (the server's
`validateTableConstraints` rejects the entire create request with
`Table not found`, it never lands a table with its key silently
dropped). Within one bulk request the order is irrelevant — the
server validates all records before persisting any — so what matters
is the flush/batch boundary, not the table order. A persistent
"table is cataloged but its foreign key is empty" is not a direct
consequence of ordering and needs its own live investigation per
table; this record does not claim to explain it.

## Decision

**D-F1 — The source holds foreign keys back.** Each database
source's `produce()` puts every `FOREIGN_KEY` group into a per-run
deferred store (`DeferredForeignKeys`, keyed by table FQN, first-seen
order) and yields the `TableRecord` without them. `PRIMARY_KEY` and
`UNIQUE` groups stay in the create request: they depend on no other
table. The store lives only for the run and is exposed to the
workflow as `deferred_table_constraints()`.

**D-F2 — One post-scan patch phase, after the close flush.**
`MetadataWorkflow.execute()` runs the patch after `close_steps()`
has flushed every table, and only when the record run completed
without an escaping exception — a cut-short listing must not patch
against a partial catalog. One PATCH per table: the table is fetched
with `fields=tableConstraints` first, the held-back keys are merged
with the stored constraints (never replacing them), keys already
present are not sent again, and the merged list goes out as a single
JSON Patch `add /tableConstraints`. A second run is a no-op for keys
already stored.

**D-F3 — A key whose parent is still missing is skipped, never
failed.** At patch time each key's referred table is re-checked; a
key whose child table or referred table is still not cataloged is
skipped with a warning, and the table's other keys still patch. A
foreign key whose referred columns are unknown is dropped at the
source with a warning, never stored and never emitted: the server
would accept it without a target, and the pin drops such keys
instead of landing a targetless constraint. The referred side comes
from the source catalog and cannot resolve later, so deferring it
would only postpone the same drop.

**D-F4 — Patch failures are values, skips are warnings.** A patch
that fails for any other reason (REST error, malformed response) is
recorded per table as a sink-step failure and never raises, so one
table's patch cannot stop the rest; the failures feed the threshold
verdict (D-S1). Skipped keys are warnings on the sink step — counted
set item 7 in `progress.StepStatus.warn`. A successful patch counts
as nothing in the threshold math: the table was already counted when
its create flushed, and counting the patch again would dilute the
rate.

**D-F5 — Metadata runs only; D-S9 is not violated.**
The patch phase runs only when `workflow.type == "metadata"`.
Profiler runs enumerate the same database sources but write no
tables, so a patch there would write metadata a non-metadata run
must never write. Deferral is not topological sort: the send order
is unchanged (still alphabetical within the source, still
hierarchy-depth order at flush), only the keys' landing is split
across two phases. D-S9 ("no FK topological sort") therefore stands
as written. What this record supersedes is narrower: the 11-17
Consequences guard "no new per-kind buffer or parent-first patch
may be added" does not cover this post-scan PATCH stage — the single
shared buffer and the hierarchy-depth flush order are untouched —
and the 11-17 consequence "first-run FK failures still occur until
convergence — that is the expected official behavior" is corrected:
official first runs converge in one round, and so do ours now.

**D-F6 — No server changes, no schema changes, clean-room.**
The pin's ingestion source is Collate-licensed. This record states
behavior specifications only and quotes no pin code; the
implementation is rewritten clean-room under the same constraint as
the SQL parse chain and the classification chain. Where this record
and the pin source ever disagree, the source wins and the difference
is recorded as a finding.

## Consequences

- A first run whose parents all land converges in one round: the
  run ends `success` instead of `partialSuccess`, and the AutoPilot
  chain no longer waits for a second run to see the keys.
- A run whose parent was filtered out or never ingested still ends
  cleanly: the key is skipped with a warning, the table lands, and
  the run is judged on its records, not on the missing parent.
- The patch phase costs one GET per deferred table plus one GET per
  distinct referred table (memoized for the run) plus one PATCH per
  table that still has fresh keys — bounded by the deferred set, not
  by the catalog.
- Deployment covers the ingest + airflow containers (Python
  ingestion code; the profiler runs the airflow container's copy).
  Server and MCP contents do not change; the UI container is rebuilt
  with the batch for the unrelated #343/#344 changes.
- Live verification (after deploy, Bai's transient login): re-run
  metadata on a service with known foreign-key pairs — the run must
  end `success`, the previously rejected tables must land with their
  keys, and a second run must send no PATCH for them. The §4b items
  of the verification report (which tables are cataloged with empty
  keys, whether their parents are cataloged, the last run's
  `failedRequest` contents, the source's full foreign-key list) still
  need a live pass to close the "table present, key empty" question.
