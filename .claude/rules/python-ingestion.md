---
description: Python ingestion — pytest style, connector files, formatting
paths: "smartmetadata-ingestion/src/**/*.py"
---

# Python ingestion conventions

Applies to `smartmetadata-ingestion/src/**/*.py`. Official CCL `ingestion/` was purged
(ADR:2026-10-22-ccl-trees-are-purged). Compliant reference:
`smartmetadata-ingestion/src/smartmetadata_ingestion/connectors/postgres.py`.

## Test style

- **Use pytest** — plain `assert`, fixtures, `unittest.mock` for boundaries.
- Test classes do **not** inherit `TestCase`; prefix with `Test`.

## Connector guidelines

- Register with `@register_source("type")` in `connectors/`. Do not import
  `metadata`, `openmetadata_ingestion`, or `openmetadata_airflow_apis`
  (`scripts/rebuild/check_ccl_free_ingestion.py`).
- Keep connector-specific SQL/HTTP in that connector file; share only through
  `sql_views.py` / `CatalogReader` contracts already on the branch.
- Do not copy purged official connectors.

## Checks

```bash
make ingest_test
python3 scripts/rebuild/check_ccl_free_ingestion.py
```
