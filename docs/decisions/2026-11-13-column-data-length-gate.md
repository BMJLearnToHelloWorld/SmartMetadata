# Column dataLength is gated to char/varchar/binary/varbinary at construction

- **Status:** Accepted
- **Revisions:** v1 2026-11-13 (initial)
- **Deciders:** Bai (ruling: tables bulk 400, `dataLength` overflow)
- **Guard:** `smartmetadata-ingestion/tests/test_datatypes.py`, `smartmetadata-ingestion/tests/test_mysql.py`, `smartmetadata-ingestion/tests/test_postgres.py`, `smartmetadata-ingestion/tests/test_sink.py`
- **Related:** upstream pin `a3012259ca` (`ingestion/src/metadata/ingestion/source/database/sql_column_handler.py:386-394` `_check_col_length`, `ingestion/src/metadata/ingestion/source/database/column_type_parser.py:440`); `openmetadata-spec/.../schema/entity/data/table.json` (`column.properties.dataLength`)

## Context

The ingestion connectors copied `information_schema.columns.character_maximum_length`
verbatim into `ColumnRecord.data_length` for every column type, and the
sink emitted it as `dataLength`. For LONGTEXT/LONGBLOB columns MySQL
reports 4294967295 (2^32−1), which exceeds the Java `Integer` the
server maps `dataLength` to, so Jackson rejected the whole tables
bulk request with HTTP 400 "Invalid request format" before any table
was processed — one out-of-range column failed all 50 tables in the
batch. The spec defines `dataLength` as the length of `char`,
`varchar`, `binary`, `varbinary` `dataTypes`, "else null", and the
pin's shared `SqlColumnHandler._check_col_length` returns None for
every other type.

## Decision

- **One shared helper gates the length, at column construction.**
  `check_col_length(data_type, char_length)` in
  `smartmetadata-ingestion/.../datatypes.py` returns the length when
  the mapped OM type is one of CHAR, VARCHAR, BINARY, VARBINARY
  (falsy length → 1, the pin's rule, covering unbounded varchar
  whose `character_maximum_length` is NULL), and None otherwise.
  All 11 connector builders call it, computing the mapped type once
  per column.
- **No clamping.** Clamping 4294967295 into range would still send a
  spec-violating `dataLength` for TEXT/BLOB columns and invent a rule
  official does not have.
- **The sink and the record model are unchanged.** The sink already
  omits `dataLength` when the value is None, which is the spec's
  "else null" on the wire; the pin gates at construction, not in
  the model.

## Consequences

- TEXT/BLOB-family columns (TEXT, MEDIUMTEXT, BLOB, MEDIUMBLOB,
  LONGBLOB, and every other non-lengthed type) carry no `dataLength`
  on the wire, so the bulk 400 cannot recur from a raw catalog
  length. Lengthed columns keep their exact length, and unbounded
  varchar keeps the pin's `1`.
- The sink's per-kind flush ordering (a tables bulk can precede its
  unflushed parents) is a separate residual, not fixed here: fixing
  it means restructuring the sink to official's single-buffer design,
  its own round with its own review.
