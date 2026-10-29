# backend-05 profiler / quality — review

Branch: `rebuild/backend-05-profiler-quality`  
Baseline: `main` @ `02aea856` (#52 backend-04)  
Scope: Apache **write contracts** for entity/table profiles and test-case results in smartmetadata-ingestion. **Not** a profiler runner, SQL sampler, test executor, or new DQ product surface.

## Shipped in this phase

| Item | Status |
|---|---|
| `RestClient.post_entity_profile_by_name` → POST `/v1/entity/profiles/name/{type}/{fqn}` | BehaviorMatched (unit) |
| `RestClient.put_table_profile` → PUT `/v1/tables/{id}/tableProfile` (legacy) | BehaviorMatched (unit) |
| `RestClient.post_test_case_result` → POST `/v1/dataQuality/testCases/testCaseResults/{fqn}` | BehaviorMatched (unit) |
| `ProfileRecord` / `TestCaseResultRecord` + sink payloads (`CreateEntityProfile` / `CreateTestCaseResult` keys) | BehaviorMatched (unit) |
| Config `profiles` / `testCaseResults` + static kinds | BehaviorMatched (unit) |
| Topology stage alongside usage (before lineage) | BehaviorMatched (unit) |

## Still Partial / deferred

- No IntegrationVerified against live catalog.
- No connector-side profiler/DQ runners (sampling, metric compute, test execution).
- No TestSuite/TestCase/TestDefinition CRUD in this slice (results assume cases exist).
- EntityProfile list/delete and dimensional results remain out of scope.

## How to verify

```bash
cd smartmetadata-ingestion
pytest tests -q
```

## Verdict

**Ready to merge as BehaviorMatched (unit) for profile + test-result write contracts.** Do not mark ProductVerified. Next per fused plan: backend-06 dbt/app/classification, or Airflow / MCP when prioritized.
