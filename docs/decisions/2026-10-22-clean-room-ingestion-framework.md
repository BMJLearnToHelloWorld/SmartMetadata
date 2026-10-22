# Product ingestion is a clean-room Apache package with no CCL dependencies

- **Status:** Accepted
- **Revisions:** v1 2026-10-22 (initial)
- **Deciders:** SmartMetadata rebuild (Phase 6)
- **Guard:** `scripts/rebuild/check_ccl_free_ingestion.py`; `smartmetadata-ingestion/LICENSE` is Apache-2.0; `make check-ccl-free-dist` still bans `openmetadata-ingestion` in the server tarball
- **Related:** `docs/rebuild/PHASE6.md`; ADR:2026-10-22-shippable-dist-excludes-ccl-modules

## Context

`ingestion/` and PyPI `openmetadata-ingestion` are Collate Community License.
`openmetadata-airflow-apis` is VERIFY (directory Apache, many file headers point
at `ingestion/LICENSE`). A competing product cannot ship those trees. Phase 0
already keeps them out of `openmetadata-dist`. Metadata still has to be pulled
from source systems and written through the Apache server REST API.

## Decision

- New module path: `smartmetadata-ingestion/` (Apache-2.0). Import package
  `smartmetadata_ingestion`. CLI `smartmetadata-ingest`.
- The package must not import or depend on `metadata`, `openmetadata-ingestion`,
  or `openmetadata-airflow-apis`. Reviewers reject copies from `ingestion/src`.
- The catalog client is a self-written httpx wrapper over documented
  `openmetadata-service` paths. Auth is `Authorization: Bearer <jwt>` or
  `POST /v1/users/login` with a Base64 password.
- Workflows are YAML/JSON. Secrets are environment substitutions
  (`${VAR}` / `${VAR:-default}`), not committed literals.
- Runtime for this phase is CLI/process. Do not add an Airflow provider here.
- Profiler and data-quality runners are stub interfaces only.

## Consequences

CCL ingestion stays reference-only. Later connector work (Phase 7) and the
ingestion console (Phase 8) extend this package. Revisit the client only if the
server path contract changes; do not replace it with the CCL Python SDK.
