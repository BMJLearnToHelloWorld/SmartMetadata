# backend-04 lineage / usage — review

Branch: `rebuild/backend-04-lineage-usage`  
Baseline: `main` @ `975cd8d1` (#51 backend-03)  
Scope: deepen Apache lineage payload (`columnsLineage`, `pipeline`) + DailyCount usage write (`PUT /v1/usage/{entity}/name/{fqn}`) + delete-by-name client. **Not** query-log connectors, profiler, Airflow, MCP, or UI.

## Shipped in this phase

| Item | Status |
|---|---|
| `ColumnLineage` / `EntityRef` on `LineageRecord` + config/static parsing | BehaviorMatched (unit) |
| Sink emits Apache `LineageDetails` keys (`columnsLineage`, `pipeline`, `sqlQuery`, `source`) | BehaviorMatched (unit) |
| `RestClient.put_usage_by_name` → PUT `/v1/usage/.../name/...` with `{date,count}` | BehaviorMatched (unit) |
| `RestClient.delete_lineage_by_name` → DELETE lineage edge by FQN | BehaviorMatched (unit) |
| `UsageRecord` + configured `usage:` list + topology stage before lineage | BehaviorMatched (unit) |
| No invented query-log / cost / dataInsight product surface | OutOfScope (intentional) |

## Still Partial / deferred

- No IntegrationVerified against a live catalog.
- No DB query-log collectors (Postgres/Snowflake/etc.) — bring UsageRecord later via connectors.
- Lineage delete not wired into workflow reconcile (client only).
- OpenLineage ingest / hydrate / ES lineage search remain out of scope.

## How to verify

```bash
cd smartmetadata-ingestion
pytest tests -q
```

## Verdict

**Ready to merge as BehaviorMatched (unit) for lineage details + usage DailyCount.** Do not mark ProductVerified. Next per fused plan: backend-05 profiler/quality, or Airflow / MCP when prioritized.
