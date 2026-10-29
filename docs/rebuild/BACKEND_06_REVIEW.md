# backend-06 classification / tag / app (+ dbt stance) — review

Branch: `rebuild/backend-06-dbt-app-classification`  
Baseline: `main` @ `b6f45c6576` (#53 backend-05)  
Scope: Apache **write contracts** for Classification, Tag, and App in smartmetadata-ingestion.

## Shipped

| Item | Status |
|---|---|
| `RestClient.upsert_classification` → PUT `/v1/classifications` | BehaviorMatched (unit) |
| `RestClient.upsert_tag` → PUT `/v1/tags` | BehaviorMatched (unit) |
| `RestClient.upsert_app` → PUT `/v1/apps` (CreateAppRequest fields only) | BehaviorMatched (unit) |
| Records + sink payloads + static/config + topology (classification/app=0, tag=1) | BehaviorMatched (unit) |

## dbt (explicit)

**No full dbt manifest/catalog parser in this slice** (would invent a connector runner).  
dbt-derived metadata continues to land through existing Table / Lineage / Tag / Profile write paths once a future connector emits those records. Status for a dedicated dbt source: **Partial / deferred**, not OutOfScope.

## Out of scope (correct)

- Collate-only AI / RDF app configs (`collateAI*`, `rdf*`) — do not invent; AI/RDF remain OutOfScope unless scope expands in writing
- App run/trigger/marketplace install flows
- Auto-classification recognizer execution
- Live IntegrationVerified

## How to verify

```bash
cd smartmetadata-ingestion
pytest tests -q
```

## Verdict

**Ready to merge as BehaviorMatched (unit)** for classification/tag/app writes. Next per fused plan: backend-07 Airflow API (before connector sprawl), or MCP hygiene when prioritized.
