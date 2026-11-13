# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Map source type names to OpenMetadata ColumnDataType values."""

from __future__ import annotations

# Values are from openmetadata-spec entity/data/table.json#/definitions/dataType.
_POSTGRES_TO_OM: dict[str, str] = {
    "smallint": "SMALLINT",
    "integer": "INT",
    "bigint": "BIGINT",
    "decimal": "DECIMAL",
    "numeric": "NUMERIC",
    "real": "FLOAT",
    "double precision": "DOUBLE",
    "money": "NUMERIC",
    "character varying": "VARCHAR",
    "varchar": "VARCHAR",
    "character": "CHAR",
    "char": "CHAR",
    "text": "TEXT",
    "boolean": "BOOLEAN",
    "date": "DATE",
    "time": "TIME",
    "time without time zone": "TIME",
    "time with time zone": "TIME",
    "timestamp": "TIMESTAMP",
    "timestamp without time zone": "TIMESTAMP",
    "timestamp with time zone": "TIMESTAMPZ",
    "interval": "INTERVAL",
    "bytea": "BYTEA",
    "json": "JSON",
    "jsonb": "JSON",
    "uuid": "UUID",
    "xml": "STRING",
    "array": "ARRAY",
    "user-defined": "STRING",
}


_MYSQL_TO_OM: dict[str, str] = {
    "tinyint": "TINYINT",
    "smallint": "SMALLINT",
    "mediumint": "INT",
    "int": "INT",
    "integer": "INT",
    "bigint": "BIGINT",
    "decimal": "DECIMAL",
    "numeric": "NUMERIC",
    "float": "FLOAT",
    "double": "DOUBLE",
    "double precision": "DOUBLE",
    "bit": "BINARY",
    "char": "CHAR",
    "varchar": "VARCHAR",
    "tinytext": "TEXT",
    "text": "TEXT",
    "mediumtext": "MEDIUMTEXT",
    "longtext": "TEXT",
    "binary": "BINARY",
    "varbinary": "VARBINARY",
    "tinyblob": "BLOB",
    "blob": "BLOB",
    "mediumblob": "MEDIUMBLOB",
    "longblob": "LONGBLOB",
    "json": "JSON",
    "date": "DATE",
    "datetime": "DATETIME",
    "timestamp": "TIMESTAMP",
    "time": "TIME",
    "year": "NUMBER",
    "enum": "ENUM",
    "set": "SET",
    "boolean": "BOOLEAN",
    "bool": "BOOLEAN",
    "geometry": "GEOGRAPHY",
    "point": "GEOGRAPHY",
}

_SNOWFLAKE_TO_OM: dict[str, str] = {
    "number": "NUMBER",
    "decimal": "DECIMAL",
    "numeric": "NUMERIC",
    "int": "INT",
    "integer": "INT",
    "bigint": "BIGINT",
    "smallint": "SMALLINT",
    "tinyint": "TINYINT",
    "byteint": "BYTEINT",
    "float": "FLOAT",
    "float4": "FLOAT",
    "float8": "DOUBLE",
    "double": "DOUBLE",
    "double precision": "DOUBLE",
    "real": "FLOAT",
    "varchar": "VARCHAR",
    "character": "CHAR",
    "char": "CHAR",
    "string": "STRING",
    "text": "TEXT",
    "binary": "BINARY",
    "varbinary": "VARBINARY",
    "boolean": "BOOLEAN",
    "date": "DATE",
    "time": "TIME",
    "timestamp": "TIMESTAMP",
    "timestamp_ntz": "TIMESTAMP",
    "timestamp_ltz": "TIMESTAMPZ",
    "timestamp_tz": "TIMESTAMPZ",
    "datetime": "DATETIME",
    "variant": "JSON",
    "object": "JSON",
    "array": "ARRAY",
    "geography": "GEOGRAPHY",
    "geometry": "GEOGRAPHY",
}


def map_postgres_type(data_type: str | None) -> str:
    return _map_simple(data_type, _POSTGRES_TO_OM)


def map_mysql_type(data_type: str | None) -> str:
    return _map_simple(data_type, _MYSQL_TO_OM)


def map_snowflake_type(data_type: str | None) -> str:
    return _map_simple(data_type, _SNOWFLAKE_TO_OM)


def map_databricks_type(data_type: str | None) -> str:
    return _map_databricks(data_type)


_MSSQL_TO_OM: dict[str, str] = {
    "bit": "BOOLEAN",
    "tinyint": "TINYINT",
    "smallint": "SMALLINT",
    "int": "INT",
    "integer": "INT",
    "bigint": "BIGINT",
    "decimal": "DECIMAL",
    "numeric": "NUMERIC",
    "money": "NUMERIC",
    "smallmoney": "NUMERIC",
    "float": "FLOAT",
    "real": "FLOAT",
    "date": "DATE",
    "time": "TIME",
    "datetime": "DATETIME",
    "datetime2": "DATETIME",
    "smalldatetime": "DATETIME",
    "datetimeoffset": "TIMESTAMPZ",
    "char": "CHAR",
    "varchar": "VARCHAR",
    "text": "TEXT",
    "nchar": "CHAR",
    "nvarchar": "VARCHAR",
    "ntext": "TEXT",
    "binary": "BINARY",
    "varbinary": "VARBINARY",
    "image": "BLOB",
    "uniqueidentifier": "UUID",
    "xml": "STRING",
    "sql_variant": "STRING",
    "hierarchyid": "STRING",
    "geometry": "GEOGRAPHY",
    "geography": "GEOGRAPHY",
}


def map_mssql_type(data_type: str | None) -> str:
    return _map_simple(data_type, _MSSQL_TO_OM)


# Doris names are MySQL-compatible plus Doris natives. The pin's
# DorisSource._parse_type strips args at "("/"<" and a version suffix
# (parse_type[-2] == "v" -> split("v")[0]: DATEV2 -> DATE, DECIMALV3 ->
# DECIMAL), and its output goes DIRECTLY into Column.dataType — no
# get_column_type pass — so native names map to themselves (HLL,
# BITMAP, QUANTILE_STATE, AGG_STATE, LARGEINT, VARIANT are all valid
# spec-enum members). Unmapped names fall back to UNKNOWN: the pin
# drops such columns, and the fork never drops columns on type
# mapping, so UNKNOWN is the honest equivalent.
# ADR:2026-11-13-doris-source-and-pipeline
_DORIS_TO_OM: dict[str, str] = {
    **_MYSQL_TO_OM,
    "largeint": "LARGEINT",
    "variant": "VARIANT",
    "ipv4": "IPV4",
    "ipv6": "IPV6",
    "hll": "HLL",
    "bitmap": "BITMAP",
    "quantile_state": "QUANTILE_STATE",
    "agg_state": "AGG_STATE",
    "map": "MAP",
    "struct": "STRUCT",
    "string": "STRING",
    "array": "ARRAY",
}


def map_doris_type(data_type: str | None) -> str:
    if not data_type:
        return "UNKNOWN"
    key = data_type.strip().lower()
    if key.endswith("[]"):
        return "ARRAY"
    if key.startswith("array"):
        return "ARRAY"
    if key.startswith("map"):
        return "MAP"
    if key.startswith("struct"):
        return "STRUCT"
    base = key.split("(")[0].split("<")[0]
    mapped = _DORIS_TO_OM.get(base)
    if mapped is not None:
        return mapped
    # The version strip runs only when the unstripped name is unmapped:
    # applied blindly it would eat IPV4/IPV6 ("ipv4"[-2] == "v" -> "i").
    # The pin drops those columns; the map carries them explicitly so the
    # fork keeps them with the correct enum type instead.
    if len(base) >= 2 and base[-2] == "v":
        return _DORIS_TO_OM.get(base.split("v")[0], "UNKNOWN")
    return "UNKNOWN"



_DATABRICKS_TO_OM = {
    "boolean": "BOOLEAN",
    "byte": "NUMBER",
    "tinyint": "NUMBER",
    "short": "NUMBER",
    "smallint": "NUMBER",
    "int": "NUMBER",
    "integer": "NUMBER",
    "long": "BIGINT",
    "bigint": "BIGINT",
    "float": "FLOAT",
    "double": "DOUBLE",
    "decimal": "NUMERIC",
    "numeric": "NUMERIC",
    "string": "STRING",
    "varchar": "VARCHAR",
    "char": "CHAR",
    "binary": "BINARY",
    "date": "DATE",
    "timestamp": "TIMESTAMP",
    "timestamp_ntz": "TIMESTAMP",
    "void": "NULL",
}


def _map_databricks(data_type: str | None) -> str:
    if not data_type:
        return "STRING"
    key = data_type.strip().lower()
    base = key.split("(", 1)[0].strip()
    if base.startswith("array"):
        return "ARRAY"
    if base.startswith("map"):
        return "MAP"
    if base.startswith("struct"):
        return "RECORD"
    if base.startswith("decimal") or base.startswith("numeric"):
        return "NUMERIC"
    return _DATABRICKS_TO_OM.get(base, "STRING")


def _map_simple(data_type: str | None, mapping: dict[str, str]) -> str:
    if not data_type:
        return "STRING"
    key = data_type.strip().lower()
    if key.endswith("[]"):
        return "ARRAY"
    if key.startswith("array"):
        return "ARRAY"
    return mapping.get(key, "STRING")


# Lengths are defined only for char/varchar/binary/varbinary columns
# (openmetadata-spec schema/entity/data/table.json, column.dataLength:
# "else null"). Sending a raw character_maximum_length for any other
# type overflows the server's Java Integer for LONGTEXT/LONGBLOB
# (4294967295) and fails the whole bulk request at deserialization.
# Port of the pin's SqlColumnHandler._check_col_length
# (ingestion/src/metadata/ingestion/source/database/sql_column_handler.py).
# ADR:2026-11-13-column-data-length-gate
_LENGTHED_DATA_TYPES: frozenset[str] = frozenset({"CHAR", "VARCHAR", "BINARY", "VARBINARY"})


def check_col_length(data_type: str, char_length: int | None) -> int | None:
    if data_type and data_type.upper() in _LENGTHED_DATA_TYPES:
        return char_length if char_length else 1
    return None
