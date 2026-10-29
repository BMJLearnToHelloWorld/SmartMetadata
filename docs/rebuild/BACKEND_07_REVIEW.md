# backend-07 Airflow managed APIs — review

Branch: `rebuild/backend-07-airflow-apis`  
Baseline: `main` @ `7df06092ba` (#54 backend-06)  
Scope: **clean-room** HTTP surface that preserves Java `AirflowRESTClient` path names and response shapes. Does **not** copy or import CCL-tainted `openmetadata-airflow-apis/`.

## Shipped

| Item | Status |
|---|---|
| New package `smartmetadata-airflow-apis` (Apache-2.0) | BehaviorMatched (unit) |
| Prefixes `/api/v1`, `/api/v2`, `/pluginsv2/api/v2` | BehaviorMatched (unit) |
| Routes: health, health-auth, deploy, trigger, delete, enable, disable, status, kill, last_dag_logs, ip, run_automation | BehaviorMatched (unit, MemoryDagStore) |
| `health-auth` JSON includes `version` (Java `readHealthResponse`) | BehaviorMatched (unit) |

## Still Partial

- No real Airflow DAG file write / scheduler integration (MemoryDagStore only)
- No CSRF cookie round-trip / Basic-auth middleware (Java client side still owns auth headers)
- No packaging into an Airflow plugin wheel for production hosts
- Legacy `openmetadata-airflow-apis` stays reference-only / not packaged

## How to verify

```bash
cd smartmetadata-airflow-apis
pip install -e ".[test]"   # or ensure flask+pytest available
pytest tests -q
```

## Verdict

**Ready to merge as BehaviorMatched (unit) for the AirflowRESTClient route contract.** Not ProductVerified. Next: MCP hygiene (Apache-backed) or connector batches only after Airflow contract is on main.
