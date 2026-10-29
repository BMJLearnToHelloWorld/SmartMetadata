# backend-10 Apache positive regression — review

## Scope
Prove rebuilt Apache surfaces still behave like Apache after de-CCL / clean-room
work (backend-01..09). Offline **positive regression** harness only — no new
product features, no connector sprawl, no Collate AI/RDF invent, no Alma deploy.

Authority: official OpenMetadata (Apache) REST + docs; status vocab Missing |
Partial | BehaviorMatched | IntegrationVerified | ProductVerified.

## Shipped
| Surface | What is asserted | Status |
|---|---|---|
| Ingestion RestClient paths | `/v1/...` constants + methods for pipelineStatus, `/bulk`, deleteStale, lineage, usage DailyCount, entity profiles, testCaseResults, classifications/tags/apps | BehaviorMatched (static) |
| Topology `STAGE_ORDER` | parent-before-child ranks (service/class/app → … → lineage last) | BehaviorMatched (static) |
| Bulk sink default | `SinkConfig.use_bulk=True` + `BulkMetadataRestSink` / `columnsLineage` retained | BehaviorMatched (static) |
| AirflowRESTClient routes | `smartmetadata-airflow-apis` `API_PREFIXES` + `ENDPOINTS` catalog; pytest wired into `verify-rebuild` | BehaviorMatched (static + unit) |
| MCP allowlist | exact `TOOL_NAMES` (11 Apache tools); forbidden Collate AI/RDF names absent | BehaviorMatched (static) |
| Settings/UI clients | Policies POST/PUT/DELETE `/v1/policies`; CP defs PUT `/v1/metadata/types`; Apps GET `/v1/apps` | BehaviorMatched (static) |

Harness entry points:
- `scripts/rebuild/check_apache_positive_regression.py`
- `scripts/rebuild/test_apache_positive_regression.py`
- `verify_rebuild` steps: `apache-positive-regression`, `apache-positive-regression-contract`, `airflow-apis-test`

## Explicit OutOfScope
- Live catalog / Job C e2e (ADR: rebuild-verify-is-offline)
- Capability ledger as a product surface (optional inventory not started)
- New connectors, SSO/Persona/Appearance, #18 purge, CCL React copy
- Collate AI/RDF tools-as-requirements
- Marking residuals ProductVerified / IntegrationVerified

## Status
**BehaviorMatched (static/unit)** for the positive-regression lock above.
Not ProductVerified. Not IntegrationVerified.

## Residuals left honestly
- Full ingest/UI/MCP suites already ran in verify; this slice adds a *focused*
  contract lock so a silent path rename fails the gate even if a soft test is
  deleted later.
- Airflow package remains MemoryDagStore (no real scheduler) — Partial for
  production plugin packaging (see BACKEND_07_REVIEW).
- Capability ledger deferred.

## How to run
```bash
python3 scripts/rebuild/check_apache_positive_regression.py
python3 scripts/rebuild/test_apache_positive_regression.py
python3 -m pip install -e smartmetadata-airflow-apis/[test]
cd smartmetadata-airflow-apis && python3 -m pytest -q
# or the full offline matrix (auto-installs airflow-apis when flask missing):
make verify-rebuild
# Windows:
py -3 scripts/rebuild/check_apache_positive_regression.py
py -3 scripts/rebuild/test_apache_positive_regression.py
```

## Next
- Capability ledger (factual inventory indexed by this harness) if prioritized
- Do not invent connectors / AI / SSO on the back of this gate
