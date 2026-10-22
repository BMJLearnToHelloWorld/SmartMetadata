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


def _map_simple(data_type: str | None, mapping: dict[str, str]) -> str:
    if not data_type:
        return "STRING"
    key = data_type.strip().lower()
    if key.endswith("[]"):
        return "ARRAY"
    if key.startswith("array"):
        return "ARRAY"
    return mapping.get(key, "STRING")
