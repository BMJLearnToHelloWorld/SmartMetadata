# Doris datasource and pipeline: test-connection checks, native type map, connection preservation

- **Status:** Accepted
- **Revisions:** v1 2026-11-13 (initial); v2 2026-11-13 (Bai ruling: land the previously recorded official gaps)
- **Deciders:** Bai (ruling: add the Doris datasource and pipeline, bundled with the dataLength fix in one PR)
- **Guard:** `smartmetadata-ingestion/tests/test_doris_checks.py`, `smartmetadata-ingestion/tests/test_datatypes.py`, `smartmetadata-ingestion/tests/test_doris.py`, `smartmetadata-ingestion/tests/test_sink.py`, `smartmetadata-ingestion/tests/test_automation_execute.py`, `smartmetadata-airflow-apis/tests/test_airflow_apis.py`
- **Related:** upstream pin `a3012259ca` (`ingestion/src/metadata/ingestion/source/database/doris/metadata.py` `_parse_type` / `get_columns_and_constraints`, `ingestion/src/metadata/ingestion/connections/test_connections.py:348` `test_connection_db_schema_sources`, `ingestion/src/metadata/ingestion/source/database/doris/service_spec.py`); `openmetadata-spec/.../schema/entity/services/connections/database/dorisConnection.json`; `openmetadata-service/.../json/data/testConnections/database/doris.json`; official `doris/metadata.py` `RELKIND_MAP` / `_get_column` / `get_table_partition_details` / `_qualified_identifier`, `doris/queries.py`, `column_helpers.parse_complex_column_type`, `column_type_parser._SOURCE_TYPE_TO_OM_TYPE`, `ssl_manager.check_ssl_and_init` / `setup_ssl` (Doris shares the MySQL registration); `openmetadata-spec/.../createTable.json` `tablePartition`

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
- **ENGINE-based table types (v2).** Official `RELKIND_MAP` is applied on
  the Doris reader only, from `INFORMATION_SCHEMA.tables.ENGINE`:
  `Doris` -> Regular, `View` -> View, `MEMORY` -> View, `OLAP` ->
  MaterializedView, `Iceberg` / `ICEBERG` -> Iceberg, else Regular.
  Keys are case-sensitive, matching the official map. MySQL/Postgres
  `table_type` mapping is unchanged. Official ENGINE `View` and
  `MaterializedView` (including `MEMORY` and `OLAP`) are treated as
  views for `include_views` and view lineage.
- **View definitions stay on `information_schema.views` (v2).** Official
  `DORIS_VIEW_DEFINITIONS` selects `'' as view_def` and uses invalid
  SQL (`engine in ['MaterializedView', 'View']`). That query was not
  copied, and `SHOW CREATE VIEW` was not invented. The fork already
  reads `information_schema.views.view_definition` in `list_views`
  and keeps that path.
- **Table partitions (v2).** Official `get_table_partition_details`
  runs `SHOW PARTITIONS FROM` the qualified identifier (each name part
  backtick-quoted, joined with `.`). If the first row's `PartitionKey`
  is not empty, the sink emits official `tablePartition` columns with
  `intervalType=TIME-UNIT` and no interval, keys split on `", "`.
  Any exception, or an empty key, yields no partition. Wired only on the
  Doris connector.
- **SSL for live reads (v2).** Official `DorisSource.__init__` calls
  `check_ssl_and_init` / `SSLManager.setup_ssl` when `sslConfig` has
  `caCertificate` and/or `sslCertificate` / `sslKey`, materialises
  those certs to temp files, and puts the paths on
  `connectionArguments.ssl`. The live `doris_connect` PyMySQL path
  now applies the same fields as `pymysql.connect(..., ssl=)` (ca /
  cert / key, the names SQLAlchemy would map official `ssl_ca` /
  `ssl_cert` / `ssl_key` to). Existing `connectionArguments.ssl`
  entries are kept. MySQL live connect still ignores `sslConfig`; this
  landing does not drive-by fix it, because the official-shaped helper
  is wired on the Doris connect factory only.
- **Complex-type children (v2).** Official `_get_column` sets
  `arrayDataType` from the element type inside `<>` and, for ARRAY of
  STRUCT or a STRUCT column, `children` from
  `parse_complex_column_type`. The official helper was reimplemented
  in Apache `column_helpers.py` (not pasted). The official shared
  parser typemap is used for children (so a STRUCT `point` field is
  `GEOMETRY`); top-level Doris `arrayDataType` uses
  `map_doris_type` so the recorded IPV4/IPV6 lookup-before-strip
  correction still applies. The dataLength gate remains on the mapped
  type (lengthed types only).
- **MySQL typemap drifts (v2, sink-adjacent).** Official
  `column_type_parser._SOURCE_TYPE_TO_OM_TYPE` maps `YEAR` ->
  `YEAR`, `BIT` -> `BIT`, `GEOMETRY` / `POINT` -> `GEOMETRY`.
  `_MYSQL_TO_OM` now matches that (MariaDB shares this map and has no
  official override). After that fix, `_DORIS_TO_OM` overrides
  `point` -> `POINT` so official Doris `_parse_type` self-naming
  is preserved.
- **Sink flush order (v2, sink-wide).** Official topology flushes
  parents at stage end before children. `BulkMetadataRestSink.write`
  used to flush a kind when its own buffer hit `batch_size`, so tables
  could go out before buffered databases/schemas. A table flush now
  force-flushes `database` then `schema` first (and a schema flush
  force-flushes `database`). `_flush_all` already used that order
  and is unchanged. `batch_size` is unchanged; the sink was not
  redesigned as official's single-buffer. This is not Doris-only.

## Consequences

- Creating a Doris service, testing its connection (four steps with real
  evidence), and running metadata/lineage/profiler pipelines for it all work
  through the existing generic paths; no UI, server, or MCP change was needed.
- Doris columns keep their native types (including V2/V3 spellings and IP
  addresses) instead of collapsing to STRING, and the dataLength gate reads
  the mapped type, so only lengthed types carry a length.
- A Doris ingestion run no longer strips connection settings from the stored
  service.
- The previously recorded official gaps (ENGINE table types, view
  definitions, partitions, live-read SSL, complex-type children) are
  landed in v2, against the official counterparts named above. The
  official empty/invalid view-definition query is recorded as a quirk:
  the fork keeps `information_schema.views`.
- Usage pipelines stay out of scope: the official Doris `service_spec`
  has no usage source, and none was invented.
- The recorded IPV4/IPV6 lookup-before-strip correction and UNKNOWN
  fallback for unmapped Doris types remain in force.
