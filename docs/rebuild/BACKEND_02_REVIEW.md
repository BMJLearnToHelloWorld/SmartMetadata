# backend-02 ingestion status observability — review

Branch: `rebuild/backend-02-ingestion-status-observability`  
Baseline: `main` @ `5709a455` (#49 backend-01)  
Scope: optional catalog `pipelineStatus` writeback + run logging from `MetadataWorkflow`. **Not** topology/ack/bulk, not Airflow, not MCP, not connector sprawl.

## Shipped in this phase

| Item | Status |
|---|---|
| Optional `workflow.ingestionPipelineFqn` | BehaviorMatched (unit) |
| `RestClient.add_pipeline_status` → PUT `/v1/services/ingestionPipelines/{fqn}/pipelineStatus` | BehaviorMatched (unit; Apache Java path) |
| Stable `runId` per `execute` | BehaviorMatched (unit) |
| Write `running` early, final `success` / `failed` / `partialSuccess` | BehaviorMatched (unit) |
| Final `status` step summaries from Source/Processor/Sink `StepStatus` | BehaviorMatched (unit) |
| Do not set `triggeredBy` (server audit field) | BehaviorMatched |
| Writeback soft-fail (log, do not fail a successful run) | BehaviorMatched (unit) |
| Skip writeback when FQN absent | BehaviorMatched (unit) |
| Structured run start/finish logs with runId + state | BehaviorMatched |

## Still Partial / deferred

- No live IntegrationVerified against a running catalog UI/API — unit/mocked HTTP only.
- `stopped` / `queued` states are modeled in helpers; workflow does not yet surface an operator stop mid-run beyond KeyboardInterrupt mapping.
- Progress `progress` / `operationMetrics` / timing fields on StepSummary remain unused (no instrumentation yet).
- No separate log-file upload / metrics exporter — **later observability**, not invented here.
- Topology / Ack / Barrier / BulkSink — **backend-03**.
- Airflow pipeline deploy/status — **backend-07**.
- Collate-only AI/RDF remains OutOfScope.

## How to verify

```bash
cd smartmetadata-ingestion
pytest tests/test_pipeline_status.py tests/test_client.py tests/test_config.py tests/test_workflow.py -q
```

Optional integration: configure `workflow.ingestionPipelineFqn`, run against a catalog with an existing Ingestion Pipeline FQN, confirm Pipeline Status history shows running → terminal state with matching `runId`.

## Verdict

**Ready to merge as BehaviorMatched (unit) for scoped writeback.** Do not mark ProductVerified / IntegrationVerified. Next phase after merge: backend-03 topology framework, or ledger if prioritized.
