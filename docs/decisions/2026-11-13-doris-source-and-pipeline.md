# Doris datasource and pipeline: test-connection checks, native type map, connection preservation

- **Status:** Accepted
- **Revisions:** v1 2026-11-13 (initial)
- **Deciders:** Bai (ruling: add the Doris datasource and pipeline, bundled with the dataLength fix in one PR)
- **Guard:** `smartmetadata-ingestion/tests/test_doris_checks.py`, `smartmetadata-ingestion/tests/test_datatypes.py`, `smartmetadata-ingestion/tests/test_doris.py`, `smartmetadata-ingestion/tests/test_automation_execute.py`, `smartmetadata-airflow-apis/tests/test_airflow_apis.py`
- **Related:** upstream pin `a3012259ca` (`ingestion/src/metadata/ingestion/source/database/doris/metadata.py` `_parse_type` / `get_columns_and_constraints`, `ingestion/src/metadata/ingestion/connections/test_connections.py:348` `test_connection_db_schema_sources`, `ingestion/src/metadata/ingestion/source/database/doris/service_spec.py`); `openmetadata-spec/.../schema/entity/services/connections/database/dorisConnection.json`; `openmetadata-service/.../json/data/testConnections/database/doris.json`

## Context

The fork already had most of a Doris implementation: the server spec and the
4-step test-connection definition are byte-identical to the pin, the UI form
and config builder exist, the metadata/lineage/profiler/TestSuite sources are
registered and bound, and the Airflow pipeline path is generic. Three gaps
remained: test-connection execution rejected Doris with HTTP 400 (the executor
gated on MySQL only); `map_doris_type` delegated to the MySQL map, mis-mapping
every Doris-native and version-suffixed type to STRING; and the Doris
service-connection builder carried only four keys, so each ingestion run would
strip sslConfig, connection options/arguments, filter patterns, and supports*
flags from the stored service.

## Decision

- **Doris test-connection checks mirror the pin's shared framework.**
  `DorisChecks` implements exactly the definition's four steps (CheckAccess,
  GetSchemas, GetTables, GetViews — no GetQueries, which the pin defines no
  query for) over the live reader's information_schema probes, with the fork's
  schema-resolution rule and the localhost → `host.docker.internal` retry.
  The shared `Evidence`/`Caveat`/summary helpers moved unchanged into
  `automations/checks_common.py` when Doris became the second consumer, so no
  check module imports from another check module; MySQL behavior is unchanged.
- **Doris types follow the pin's Doris rule, not the generic map.** The pin's
  Doris path puts `_parse_type` output directly into `Column.dataType` (no
  `get_column_type` pass), so native names map to themselves: HLL, BITMAP,
  QUANTILE_STATE, AGG_STATE, LARGEINT, VARIANT. The fork's `map_doris_type`
  strips args and version suffixes the same way and looks the name up in a
  Doris map layered over the MySQL-compatible names. Two deliberate
  corrections to pin quirks, recorded here: (1) lookup-before-strip preserves
  IPV4/IPV6, which the pin's V-strip mangles to `"I"` and drops — the fork
  keeps those columns with the correct enum type; (2) unmapped names yield
  UNKNOWN, the fork's honest equivalent of the pin dropping the column — the
  fork never drops columns on type mapping, and an unmapped type is unknown,
  not a string.
- **The Doris service-connection builder preserves the connection.** It
  mirrors the MySQL builder's two-loop structure with Doris's own schema keys
  (six supports* flags; filter patterns, sslConfig, connectionOptions,
  connectionArguments as dicts). The password stays top-level when secrets are
  stored: the Doris schema carries `password` and has no `authType`.

## Consequences

- Creating a Doris service, testing its connection (four steps with real
  evidence), and running metadata/lineage/profiler pipelines for it all work
  through the existing generic paths; no UI, server, or MCP change was needed.
- Doris columns keep their native types (including V2/V3 spellings and IP
  addresses) instead of collapsing to STRING, and the dataLength gate reads
  the mapped type, so only lengthed types carry a length.
- A Doris ingestion run no longer strips connection settings from the stored
  service.
- Out of scope, recorded in the ruling, not fixed here: ENGINE-based table-type
  mapping, view-definition population, table partitions, SSL for live reads,
  complex-type children, and usage pipelines (the pin's Doris spec has no
  usage source).
