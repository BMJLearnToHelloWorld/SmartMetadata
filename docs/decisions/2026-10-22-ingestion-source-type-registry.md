# `source.type` selects a connector from an in-process registry

- **Status:** Accepted
- **Revisions:** v1 2026-10-22 (initial)
- **Deciders:** SmartMetadata rebuild (Phase 7)
- **Guard:** `smartmetadata-ingestion/tests/test_registry.py`; unknown types fail in `build_source`
- **Related:** `docs/rebuild/PHASE7.md`; ADR:2026-10-22-clean-room-ingestion-framework

## Context

Phase 6 dispatched connectors with a closed `Literal["postgres", "static"]` and an if/else in
`build_source`. Phase 7 adds MySQL, Kafka, and Snowflake. A closed literal forces a config-schema
edit for every connector. setuptools entry points would be a plugin surface we do not need yet.

## Decision

- `source.type` is a lowercase string. The workflow config no longer enumerates allowed types.
- Built-in connectors register with `@register_source("mysql")` (or `register_source(name, cls)`).
- `build_source` calls `load_builtin_sources()` then looks up the type. Unknown types fail closed
  with the registered names in the error.
- No setuptools/importlib entry points in this phase. Extra connectors are added by a module in
  `smartmetadata_ingestion/connectors/` plus a registration call.

## Consequences

Adding a connector is: implement a `Source`, register its type, add tests and an example YAML.
Revisit only if out-of-tree plugins become a product requirement.
