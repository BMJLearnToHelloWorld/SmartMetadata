# Pipeline P0 connectors — Prefect / Dagster

**Status:** Locked by Bernie 2026-11-01 t225u (Pipeline P0 — both tiles)
**Target:** BehaviorMatched (unit) for each official Apache OpenMetadata capability surface  
**OSS (locked from `ingestion/setup.py` plugins — no invent):**
- **Prefect:** `{}` (requests-only via shared httpx)
- **Dagster:** `dagster_graphql>=1.8.0` (+ upstream postgres commons listed on the plugins key). P0 GraphQL catalog reads use shared httpx; live `dagster_graphql` client path is Partial.

## Scope

| Official tile | SM `source.type` | `serviceType` | Notes |
| --- | --- | --- | --- |
| Prefect | `prefect` | `Prefect` | hostPort + authType (cloudAuth \| serverAuth) + numberOfStatus |
| Dagster | `dagster` | `Dagster` | host + token/timeout/stripAssetKeyPrefixLength |

Not in scope this PR: lineage / usage / sampler / DataDiff invent (official `service_spec` is BaseSpec metadata+connection only); Collate CCL; other pipeline tiles.

## Capability chain (1:1 with OM `service_spec`)

| Surface | Prefect | Dagster | SM landing |
| --- | --- | --- | --- |
| Connection + Test | yes | yes | HTTP/GraphQL prepare() via readers |
| Metadata | yes | yes | pipelineService + pipeline records |
| Lineage | **absent** (BaseSpec) | **absent** | no invent |
| Usage | **absent** | **absent** | no invent |
| Sampler | **absent** | **absent** | no invent |
| UI Add Service | OM fields | OM fields | tiles + `ServiceConnectionFields.vue` |

## Design (clean-room, Dashboard Sequence* pattern)

1. Shared `PipelineRow` / `PipelineCatalogReader` / `SequencePipelineCatalogReader`.
2. Live `PrefectHttpCatalogReader` (`POST …/flows/filter`) and `DagsterGraphqlCatalogReader` (repositoriesOrError jobs) with injectable httpx transport.
3. New record kinds: `pipelineService` → `pipeline` (topology ranks 0/1); REST `/v1/services/pipelineServices`, `/v1/pipelines` (+ bulk + deleteStale).
4. Secrets omitted from catalog connection payload by default (`apiKey` / `authString` / `token`).
5. Java/spec already enumerate Prefect/Dagster — no schema invent; UI curated list opts them in under kind `pipeline`.

## Honest Partial

- Live IntegrationVerified against real Prefect Cloud/Server and Dagster deferred (unit uses Sequence* + MockTransport).
- Optional live `dagster_graphql` client (OSS extra) deferred — httpx GraphQL covers BaseSpec metadata path.
- Pipeline run status writeback / task-level lineage invent deferred (not in BaseSpec).

## Self-review (COMMENT — not APPROVE)

**Landing quality**
- Surfaces match OM BaseSpec (metadata+connection only); connection field schemas 1:1.
- UI tiles + forms use official fields only.
- Unit BehaviorMatched: `test_prefect.py` / `test_dagster.py` + UI connections/cliWorkflow; registry loads both.

**Design approach**
- Clean-room Dashboard HTTP pattern: injectable readers + Sequence*; live Cursor* deferred (honest Partial).
- OSS locked from setup.py.

**Honest Partial**
- Live IntegrationVerified deferred.
- dagster_graphql native client deferred.
