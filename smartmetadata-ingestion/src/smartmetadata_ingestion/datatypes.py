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


def map_postgres_type(data_type: str | None) -> str:
    if not data_type:
        return "STRING"
    key = data_type.strip().lower()
    if key.endswith("[]"):
        return "ARRAY"
    return _POSTGRES_TO_OM.get(key, "STRING")
