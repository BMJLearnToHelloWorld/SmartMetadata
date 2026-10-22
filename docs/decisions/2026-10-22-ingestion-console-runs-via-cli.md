# IngestionPipeline rows in the Vue console are catalog records; jobs run through smartmetadata-ingest

- **Status:** Accepted
- **Revisions:** v1 2026-10-22 (initial)
- **Deciders:** SmartMetadata rebuild (Phase 8)
- **Guard:** `smartmetadata-ui/src/api/ingestionPipelines.test.ts` and `PipelineDetailView.test.ts` assert list/create/status paths and that `/trigger/` and `/deploy/` are not called
- **Related:** `docs/rebuild/PHASE8.md`; ADR:2026-10-22-clean-room-vue-spa; ADR:2026-10-22-clean-room-ingestion-framework

## Context

`CreateIngestionPipeline` still requires OpenMetadata `sourceConfig` +
`airflowConfig`. Deploy and trigger on `/v1/services/ingestionPipelines` proxy
`PipelineServiceClient` (Airflow / `openmetadata-airflow-apis`). The Phase 0
slim dist disables that client. Product ingestion is the Apache CLI
`smartmetadata-ingest` (`source.type` = `postgres` | `mysql` | `kafka` |
`snowflake`). Inventing a Prefect backend in this UI would be a new server.

## Decision

- The console CRUDs `DatabaseService`, `MessagingService`, and
  `IngestionPipeline` through the documented EntityResource APIs.
- `sourceConfig.config.type` stays `DatabaseMetadata` / `MessagingMetadata`.
  CLI `source.type` is derived from the linked service's `serviceType`.
- `airflowConfig` is persisted because the schema requires it
  (`pausePipeline: true` by default). The CLI does not read it.
- The console does not call `/trigger/{id}` or `/deploy/{id}`. It may read
  `GET /{fqn}/pipelineStatus` and `GET /status`.
- Pipeline detail emits a `smartmetadata-ingest run` YAML. Secrets in that YAML
  are `${ENV}` placeholders, never stored passwords.

## Consequences

Operators can register services and pipeline entities without CCL UI or
Airflow. Running a job is still a local/CLI (or future Prefect) step. Revisit
when a CCL-free operator exists that can honor trigger without
`openmetadata-airflow-apis`.
