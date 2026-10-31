# Dashboard P0 connectors — Superset / Metabase

**Status:** Locked by Bernie 2026-10-31 t222u/t223u (Dashboard P0 — both tiles)
**Target:** BehaviorMatched (unit) for each official Apache OpenMetadata capability surface  
**OSS (locked from `ingestion/setup.py` plugins — no invent):**
- **Superset:** `{}` (requests-only via shared httpx); optional DB modes (Postgres/MySQL connection oneOf) **deferred** — P0 lands **API mode** only
- **Metabase:** no dedicated plugins key; HTTP session or API key via httpx

## Scope

| Official tile | SM `source.type` | `serviceType` | Notes |
| --- | --- | --- | --- |
| Superset | `superset` | `Superset` | API connection: hostPort + connection.{provider,username,password} |
| Metabase | `metabase` | `Metabase` | hostPort + username/password **or** apiKey |

Not in scope this PR: Storage/Pipeline/Messaging leftovers; Superset DB-backed metadata mode; Collate CCL; inventing lineage/usage/profiler (official `service_spec` is BaseSpec metadata+connection only).

## Capability chain (1:1 with OM `service_spec`)

| Surface | Superset | Metabase | SM landing |
| --- | --- | --- | --- |
| Connection + Test | yes (API) | yes | HTTP login/session in readers |
| Metadata | yes | yes | charts + dashboards records |
| Lineage | **absent** (BaseSpec) | **absent** | no invent |
| Usage | **absent** | **absent** | no invent |
| Profiler | **absent** | **absent** | no invent |
| UI Add Service | OM fields | OM fields | tiles + `ServiceConnectionFields.vue` |

## Design (clean-room, Kafka HTTP + Sequence* pattern)

1. Injectable `DashboardCatalogReader` + `SequenceDashboardCatalogReader` for unit BehaviorMatched.
2. Live `SupersetHttpCatalogReader` / `MetabaseHttpCatalogReader` with injectable httpx transport.
3. New record kinds: `dashboardService` → `chart` → `dashboard` (topology ranks 0/1/2); REST `/v1/services/dashboardServices`, `/v1/charts`, `/v1/dashboards` (+ bulk + deleteStale).
4. Secrets omitted from catalog connection payload by default (same as Kafka/DB family).
5. Java/spec already enumerate Superset/Metabase — no schema invent; UI curated list opts them in.

## Honest Partial

- Live IntegrationVerified against real Superset/Metabase deferred (unit uses Sequence* + MockTransport).
- Superset Postgres/MySQL connection oneOf modes deferred (API mode covers official BaseSpec metadata path).
- Pipeline sourceConfig `DashboardMetadata` filter fields land in UI; no lineageInformation invent.

## Self-review (COMMENT — not APPROVE)

**Landing quality**
- Surfaces match OM BaseSpec (metadata+connection only); connection field schemas 1:1 for API/Metabase.
- UI tiles + forms use official fields only.
- Unit BehaviorMatched: `test_superset.py` / `test_metabase.py` + UI connections/cliWorkflow; registry loads both.

**Design approach**
- Clean-room Kafka HTTP pattern: injectable readers + Sequence*; live Cursor* deferred (honest Partial).
- OSS locked from setup.py (requests/httpx only).

**Honest Partial**
- Live IntegrationVerified deferred.
- Superset DB connection modes deferred.
