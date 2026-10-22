# Phase 8 — Ingestion console (clean-room UI)

Phase 8 extends `smartmetadata-ui/` so operators can manage **services** and
**ingestion pipeline entities** against Apache `openmetadata-service` REST APIs.
It is oriented to clean-room `smartmetadata-ingestion/` (`postgres`, `mysql`,
`kafka`, `snowflake`). It does not copy, transpile, or import `openmetadata-ui`,
`openmetadata-ui-core-components`, `ingestion/`, or `openmetadata-airflow-apis`.

Earlier phases: [PHASE0.md](PHASE0.md)–[PHASE7.md](PHASE7.md).
ADR:2026-10-22-clean-room-vue-spa still applies. New convention:
ADR:2026-10-22-ingestion-console-runs-via-cli.

## What shipped

JWT route guards from Phase 1 are unchanged. Phase 1–5 routes stay.

| Surface | Location | Server contract |
|---|---|---|
| Database + messaging services list / create / edit / detail | `views/ingestion/ServicesListView.vue`, `ServiceDetailView.vue` | `GET/POST/PUT/DELETE /v1/services/databaseServices` and `/messagingServices`. Create requires `name` + `serviceType`. Connection is optional `{ config: { type, … } }` |
| Ingestion pipelines list / create / edit / detail | `PipelinesListView.vue`, `PipelineDetailView.vue` | `GET/POST/PUT/DELETE /v1/services/ingestionPipelines`. Create requires `name` + `service` + `pipelineType` + `sourceConfig` + `airflowConfig` |
| Stored run status | pipeline detail | `GET /v1/services/ingestionPipelines/{fqn}/pipelineStatus` (catalog rows; latest 5 by default) |
| Orchestrator probe | pipeline detail, read-only | `GET /v1/services/ingestionPipelines/status` — reports `platform`/`reason` (usually `disabled` on a slim dist) |

Routes (still JWT-guarded except `/login`):

`/ingestion/services`, `/ingestion/services/:kind/:id`,
`/ingestion/pipelines`, `/ingestion/pipelines/:id`.

AppShell adds an **Ingestion** section (Services, Pipelines). Search, lineage,
Governance, Quality, Observability, and Admin stay.

### Connection forms (Phase 6–7 subset)

| `serviceType` | Catalog fields | Secret handling |
|---|---|---|
| `Postgres` | `hostPort`, `username`, `database` | Optional `authType.password` |
| `Mysql` | `hostPort`, `username`, `databaseName`, `databaseSchema` | Optional `authType.password` |
| `Snowflake` | `account`, `username`, `warehouse`, `database`, `role` | Optional `password` |
| `Kafka` | `bootstrapServers`, `schemaRegistryURL` | No catalog password. CLI `restProxyUrl` is YAML-only |

Passwords are never echoed. A `${VAR}` / `${VAR:-default}` placeholder is stored
as-is. A typed literal is sent only if the operator checks “persist secrets”
(default **off**, same as `source.storeConnectionSecrets: false`). On edit, a
masked `********` value is sent back unchanged so the server can unmask.

Dashboard / pipeline / storage services exist on the server but are skipped —
no Phase 6–7 connector.

### How a UI pipeline relates to `smartmetadata-ingest`

The server schema is still OpenMetadata pipeline JSON:

```json
{
  "name": "warehouse-metadata",
  "pipelineType": "metadata",
  "service": { "id": "…", "type": "databaseService" },
  "sourceConfig": { "config": { "type": "DatabaseMetadata", "includeViews": true } },
  "airflowConfig": { "pausePipeline": true }
}
```

`sourceConfig.config.type` is `DatabaseMetadata` or `MessagingMetadata`, not
`postgres` / `mysql` / `kafka` / `snowflake`. Those CLI `source.type` values
live on the **service** (`serviceType` → `postgres` …) plus the generated YAML
on the pipeline detail page.

`airflowConfig` is required by `CreateIngestionPipeline`. The console always
sends `pausePipeline: true` and treats `scheduleInterval` as a catalog note.
The CLI does not read it.

`POST /v1/services/ingestionPipelines/trigger/{id}` and `/deploy/{id}` proxy
`PipelineServiceClient` (Airflow). Phase 0 slim dist has that client disabled.
This UI does **not** call those endpoints and does not invent a Prefect backend.
Run:

```bash
smartmetadata-ingest run --config path/to/generated.yaml
```

See [PHASE6.md](PHASE6.md) and [PHASE7.md](PHASE7.md). A future operator can
write `PUT /{fqn}/pipelineStatus` so runs show up in the status table.

## How to run

Same as Phase 1: slim server from [PHASE0.md](PHASE0.md), then

```bash
make ui_install
make ui_dev
# http://localhost:5173
```

Stock bootstrap: `admin@open-metadata.org` / `admin`. Writes need create/edit
on services and ingestion pipelines (admin does).

### Manual verify

1. Unauthenticated `/ingestion/services` redirects to
   `/login?redirect=/ingestion/services`.
2. Sign in. Search, lineage, Governance, Quality, Observability, and Admin still
   work.
3. **Ingestion → Services**: list from both service APIs. Create a Postgres
   service (`name` + host/user/database). Leave password blank or enter
   `${PG_PASSWORD}`. Open it; connection JSON must not show a raw secret.
4. Create a Kafka service (`bootstrapServers`). REST proxy URL is not a catalog
   field.
5. **Ingestion → Pipelines**: create a metadata pipeline against that service.
   Open it. Status table is whatever `GET …/pipelineStatus` returns (empty is
   fine). YAML names `smartmetadata-ingest run` and `source.type: postgres`.
6. Confirm the page never offers Deploy/Trigger.
7. Log out. Session key `sm.auth.v1` is cleared.

## Tests

```bash
cd smartmetadata-ui && npm test && npm run build
python3 scripts/rebuild/check_ccl_free_dist.py
```

Covered: database/messaging/pipeline clients against real paths and required
bodies; secret placeholder vs literal vs mask; CLI YAML mapping; Services and
Pipelines list views; pipeline detail does not call trigger/deploy.

## Non-goals (later phases)

- Prefect / native Airflow operator that would make trigger safe
- Full OM connector wizard (75+ types, test-connection automations)
- Dashboard / pipeline / storage / drive service forms
- Phase 9 Feed/Tasks (see [PHASE9.md](PHASE9.md)); Phase 10 MCP
- Shipping the SPA inside `openmetadata-dist` (needs a new ADR)
- Depending on `openmetadata-airflow-apis` or CCL ingestion wheels

## Residual risks and open questions

- **airflowConfig is mandatory.** The entity is still an Airflow DAG record in
  the Apache schema. We persist `pausePipeline: true` and document the lie.
- **sourceConfig is OM JSON, not CLI YAML.** Mapping is honest and generated
  YAML is the bridge. ADR:2026-10-22-ingestion-console-runs-via-cli.
- **Trigger/deploy exist but are Airflow.** GET `/status` is shown so operators
  see `disabled`. No fake run button.
- **Logs / SSE / progress** (`/logs/{id}/last`, stream endpoints) go through
  the same pipeline-service client or a log backend that is not configured on
  the slim dist. Not wired.
- **PUT /{fqn}/pipelineStatus** can record a run. The CLI does not write it
  yet. Status stays empty until a runner does.
- **Unknown service types** (Redshift, …) list and show redacted JSON; no form.
- **Empty catalog.** New servers have no services. Empty tables are empty
  states.

## Open questions (safest default already taken)

1. **Wire POST /trigger anyway and show the Airflow error?** **No.**
2. **Dashboard / pipeline services in this PR?** **No.**
3. **Serve SPA from slim Java?** Still **no** — same as Phase 1.
4. **Have the CLI write pipelineStatus?** **Not in this phase** — console only.

## Verification checklist

1. `cd smartmetadata-ui && npm test`
2. `cd smartmetadata-ui && npm run build`
3. `python3 scripts/rebuild/check_ccl_free_dist.py`
4. Manual path above against a running Phase 0 server
