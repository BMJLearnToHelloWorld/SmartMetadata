# Database connection filter defaults exclude engine-owned system schemas, by exact name

- **Status:** Accepted
- **Revisions:** v1 2026-11-08 (initial)
- **Deciders:** Bai
- **Guard:** `smartmetadata-ingestion/tests/test_connection_schema_defaults.py`
- **Related:** Upstream PR #36677; pin ADR `2026-10-30-database-connection-defaults-exclude-system-schemas.md`; `wave2/REVIEW-W2-K-SMALL.md` condition 10; `wave2/K-S3-IMPL.md` §4

## Context

The `databaseFilterPattern` / `schemaFilterPattern` `default` on a database connection schema
pre-fills the filters of every newly created ingestion pipeline. Ingestion reads filters from
the pipeline's `sourceConfig`, so the default never changes an existing pipeline. Some
connectors had defaults; doris, greenplum and mariaDB had none, so new pipelines ingested
`information_schema`, `performance_schema`, `__internal_schema`, `gp_toolkit` and the
`template0`/`template1` databases.

## Decision

A database connector whose engine exposes its own system databases/schemas to the listing the
connector uses gets a connection-level `default` that excludes them.

- Patterns are anchored exact names (`^name$`). A prefix wildcard is allowed only when the prefix
  is engine-reserved — never a naming convention a user can share.
- Product scope is the three types with a product service type: doris
  (`^information_schema$`, `^performance_schema$`, `^__internal_schema$`), greenplum
  (`^information_schema$`, `^gp_toolkit$`, plus `databaseFilterPattern` excluding `^template1$`
  and `^template0$`), mariaDB (`^information_schema$`, `^performance_schema$`). The other
  upstream connectors have no product service type and are not taken.
- The default lives in both copies of each schema — `openmetadata-spec` and the
  `openmetadata-ui` public/jsons copy — and the two copies must agree.
- No Vue form field is added for these filters (K-6-5): the lean-forms connection groups for
  the three types have no `schemaFilterPattern` field, so the default currently lives in the
  spec contract only. The clean-room ingestion already excludes system schemas through its
  global `exclude_schemas` default.

## Consequences

New pipelines no longer ingest engine catalogs by default; users can still clear the default.
Existing pipelines are untouched. A connector added later should ship its system-schema default
in the same PR. Matching is case-insensitive, so one pattern covers engines that upper-case
their catalog names.
