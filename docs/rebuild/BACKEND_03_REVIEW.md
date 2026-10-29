# backend-03 ingestion topology framework — review

Branch: `rebuild/backend-03-ingestion-topology-framework`  
Baseline: `main` @ `44643c8a` (#50 backend-02)  
Scope: parent-before-child topology ordering, Apache `/bulk` buffering, optional `deleteStale` reconcile. **Not** new connectors, Airflow, MCP, or UI.

## Shipped in this phase

| Item | Status |
|---|---|
| Stable stage order (service → database → schema → table / topic → lineage) | BehaviorMatched (unit) |
| `SeenSet` + FQN helpers for current-run inventory | BehaviorMatched (unit) |
| `RestClient` bulk upsert: databases / databaseSchemas / tables / topics | BehaviorMatched (unit; Apache PUT `.../bulk`) |
| `RestClient.delete_stale` → DELETE `.../deleteStale` + `BulkDeleteStaleRequest` | BehaviorMatched (unit) |
| `BulkMetadataRestSink` (default `sink.useBulk=true`) buffers then flushes | BehaviorMatched (unit) |
| Bulk sink flushes buffers before lineage/service passthrough (wire parent-first) | BehaviorMatched (unit) |
| Optional `workflow.reconcileStale` / `reconcileDryRun` soft-fail reconcile | BehaviorMatched (unit) |
| Workflow reorders produced + configured lineage records before sink | BehaviorMatched (unit) |
| Runner / client / workflow regression suite green with default bulk | BehaviorMatched (unit) |

## Still Partial / deferred

- No IntegrationVerified against a live catalog bulk/deleteStale endpoint.
- DatabaseService / MessagingService still single PUT (Apache has no matching bulk here in this slice).
- Lineage still per-edge PUT.
- `Ack`/`Barrier` as first-class cross-worker coordination is not invented; stage order covers single-process topology.
- sourceHash fast-path / overrideMetadata query flags not plumbed yet.
- Kafka family reconcile uses `messagingService` scope; database family uses `databaseService`.
- Collate-only AI/RDF remains OutOfScope.

## How to verify

```bash
cd smartmetadata-ingestion
pytest tests -q
```

## Verdict

**Ready to merge as BehaviorMatched (unit) for scoped topology + bulk + stale reconcile.** Do not mark ProductVerified. Next per fused plan: backend-04 lineage/usage, then Airflow / MCP (Apache-backed) as prioritized — not connector sprawl.
