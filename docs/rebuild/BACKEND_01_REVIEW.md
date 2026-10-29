# backend-01 ingestion metadata runtime — review

Branch: `rebuild/backend-01-ingestion-metadata-runtime`  
Baseline: `main` @ `0e4e0801`  
Scope: metadata workflow lifecycle + MySQL/Kafka correctness. **Not** full CCL CLI parity, not status writeback, not topology, not Airflow/MCP/connectors sprawl.

## Shipped in this phase

| Item | Status |
|---|---|
| MySQL `databaseName` → driver database | BehaviorMatched (unit) |
| Kafka Schema Registry: 404 continue, 401/5xx fail closed | BehaviorMatched (unit) |
| `MetadataWorkflow` prepare → execute → close_steps → stop | BehaviorMatched (unit) |
| Error taxonomy Init / Execution / Teardown | BehaviorMatched |
| `StepStatus` + `RecordFailure.stack_trace` | Partial (local only; no catalog writeback yet) |
| `Source` / `Processor` prepare|close contract | BehaviorMatched (protocol + no-ops) |
| CLI JSON includes `stack_trace` when present | BehaviorMatched (unit) |
| Processor failures attributed to `processor_status` | BehaviorMatched (unit) |

## Still Partial / deferred

- CLI remains single `run --config` (exit 0/1/2). Full multi-command / status-file matrix → later CLI contract work, not invented here.
- No `pipelineStatus` / logs / metrics writeback to catalog → **backend-02**.
- No Topology / Ack / Barrier / BulkSink / sourceHash / delete detection → **backend-03**.
- Profiler/Quality still stubs → **backend-05**.
- Airflow API / MCP / 106 connectors → later phases per fused plan.
- Collate-only AI/RDF remains OutOfScope.

## Hygiene

- Removed committed `.pytest-tmp` / `.pytest-tmp-single` artifacts; ignored going forward.

## Verdict

**Ready to merge as Partial→BehaviorMatched for the scoped runtime + two correctness fixes.** Do not mark ProductVerified. Next phase after merge: backend-02 status observability writeback.
