# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Doris database connector (metadata + view lineage).

Aligns to Apache OpenMetadata Doris service tile / DorisSource.
"""

from __future__ import annotations

from collections.abc import Iterable
from typing import Any

from smartmetadata_ingestion.config import SourceConfig
from smartmetadata_ingestion.connectors import doris_common as doris
from smartmetadata_ingestion.connectors.registry import register_source
from smartmetadata_ingestion.connectors.select import is_selected, is_selected_table
from smartmetadata_ingestion.column_helpers import (
    extract_child,
    extract_number,
    parse_complex_column_type,
)
from smartmetadata_ingestion.connectors.doris_common import map_doris_table_type
from smartmetadata_ingestion.connectors.sql_views import parse_view_parents
from smartmetadata_ingestion.datatypes import check_col_length, map_doris_type
from smartmetadata_ingestion.fqn import build_fqn
from smartmetadata_ingestion.records import (
    ColumnRecord,
    DatabaseRecord,
    DatabaseServiceRecord,
    LineageEndpoint,
    LineageRecord,
    SchemaRecord,
    TableRecord,
    WorkflowRecord,
)


@register_source("doris")
class DorisSource:
    SERVICE_TYPE = "Doris"

    def __init__(
        self,
        config: SourceConfig,
        *,
        reader: doris.CatalogReader | None = None,
        connect=None,
    ) -> None:
        self._config = config
        self._reader = reader or (
            doris.CursorCatalogReader(connect) if connect is not None else None
        )

    def prepare(self) -> None:
        doris.run_connection_test(self._config.connection or {})

    def close(self) -> None:
        return None

    def produce(self) -> Iterable[WorkflowRecord]:
        yield self._service_record()
        database_name = self._database_name()
        yield DatabaseRecord(name=database_name, service=self._config.service_name)
        reader = self._require_reader()
        for schema in self._selected_schemas(reader):
            database_fqn = build_fqn(self._config.service_name, database_name)
            yield SchemaRecord(name=schema.name, database=database_fqn)
            schema_fqn = build_fqn(self._config.service_name, database_name, schema.name)
            for table in reader.list_tables(schema.name):
                table_type = map_doris_table_type(table.table_type)
                if not is_selected_table(
                    table.name,
                    table_type,
                    include_tables=self._config.include_tables,
                    exclude_tables=self._config.exclude_tables,
                    include_views=self._config.include_views,
                ):
                    continue
                yield TableRecord(
                    name=table.name,
                    database_schema=schema_fqn,
                    table_type=table_type,
                    description=table.comment,
                    columns=self._columns(reader, table),
                    table_partition=reader.get_table_partition_details(
                        table.schema_name, table.name
                    ),
                )
        if self._config.include_view_lineage:
            yield from self._view_lineage(reader, database_name)

    def _service_record(self) -> DatabaseServiceRecord:
        connection = doris.build_service_connection_config(
            raw=self._config.connection or {},
            store_secrets=self._config.store_connection_secrets,
        )
        return DatabaseServiceRecord(
            name=self._config.service_name,
            service_type=self.SERVICE_TYPE,
            display_name=self._config.service_display_name,
            connection=connection,
        )

    def _database_name(self) -> str:
        raw = self._config.connection or {}
        return str(raw.get("databaseName") or raw.get("database") or "default")

    def _require_reader(self) -> doris.CatalogReader:
        if self._reader is not None:
            return self._reader
        return doris.CursorCatalogReader(doris.doris_connect(self._config.connection or {}))

    def _include_schemas(self) -> list[str]:
        if self._config.include_schemas:
            return list(self._config.include_schemas)
        schema = (self._config.connection or {}).get("databaseSchema")
        return [str(schema)] if schema else []

    def _selected_schemas(self, reader: doris.CatalogReader) -> list[doris.SchemaRow]:
        exclude = list(self._config.exclude_schemas) + list(doris.system_schemas())
        return [
            schema
            for schema in reader.list_schemas()
            if is_selected(schema.name, include=self._include_schemas(), exclude=exclude)
        ]

    def _columns(
        self, reader: doris.CatalogReader, table: doris.TableRow
    ) -> list[ColumnRecord]:
        columns = []
        for column in reader.list_columns(table.schema_name, table.name):
            raw_type = column.data_type
            data_type = map_doris_type(raw_type)
            array_data_type = None
            children = None
            lowered = raw_type.lower()
            if data_type == "ARRAY":
                element_type = extract_child(lowered)
                if element_type:
                    # Official arr_data_type is _parse_type(element). The
                    # recorded lookup-before-strip correction keeps IPV4
                    # / IPV6 as themselves instead of the official "I".
                    array_data_type = map_doris_type(element_type)
                    if array_data_type == "STRUCT":
                        children = _children_from_complex(element_type)
            elif data_type == "STRUCT":
                children = _children_from_complex(raw_type)
            char_length = _doris_char_length(data_type, raw_type, column.char_length)
            precision = None
            scale = None
            # Official _get_column sets precision/scale when DECIMAL has (p, s).
            if data_type == 'DECIMAL':
                numbers = extract_number(raw_type)
                if len(numbers) == 2:
                    precision, scale = numbers
            columns.append(
                ColumnRecord(
                    name=column.name,
                    data_type=data_type,
                    data_type_display=raw_type,
                    description=column.comment,
                    ordinal_position=column.ordinal_position,
                    data_length=check_col_length(data_type, char_length),
                    array_data_type=array_data_type,
                    children=children,
                    precision=precision,
                    scale=scale,
                )
            )
        return columns

    def _view_lineage(
        self, reader: doris.CatalogReader, database_name: str
    ) -> Iterable[LineageRecord]:
        known_tables = {
            (table.schema_name, table.name)
            for schema in self._selected_schemas(reader)
            for table in reader.list_tables(schema.name)
        }
        for view in reader.list_views():
            if (view.schema_name, view.name) not in known_tables:
                continue
            to_fqn = build_fqn(
                self._config.service_name, database_name, view.schema_name, view.name
            )
            for schema_name, table_name in parse_view_parents(
                view.definition, view.schema_name
            ):
                if (schema_name, table_name) not in known_tables:
                    continue
                if schema_name == view.schema_name and table_name == view.name:
                    continue
                from_fqn = build_fqn(
                    self._config.service_name, database_name, schema_name, table_name
                )
                yield LineageRecord(
                    from_entity=LineageEndpoint(type="table", fqn=from_fqn),
                    to_entity=LineageEndpoint(type="table", fqn=to_fqn),
                    source="ViewLineage",
                    sql_query=view.definition,
                )


def _as_int(value: Any) -> int | None:
    if value is None:
        return None
    return int(value)


def _doris_char_length(
    mapped_type: str, raw_type: str, catalog_length: Any
) -> int | None:
    # Official _get_column uses extract_number for CHAR/VARCHAR lengths.
    if mapped_type in {"CHAR", "VARCHAR"}:
        numbers = extract_number(raw_type)
        if numbers:
            return numbers[0]
    return _as_int(catalog_length)


def _children_from_complex(type_str: str) -> list[ColumnRecord] | None:
    parsed = parse_complex_column_type(type_str)
    if not parsed or not parsed.get("children"):
        return None
    return [
        _column_from_parsed(ordinal, child)
        for ordinal, child in enumerate(parsed["children"])
    ]


def _column_from_parsed(ordinal: int, parsed: dict[str, Any]) -> ColumnRecord:
    # Official column_from_parsed, with the dataLength gate applied to
    # the mapped type (lengthed types only).
    data_type = str(parsed["dataType"])
    nested = parsed.get("children")
    children = (
        [_column_from_parsed(index, child) for index, child in enumerate(nested)]
        if nested
        else None
    )
    return ColumnRecord(
        name=str(parsed["name"]),
        data_type=data_type,
        data_type_display=parsed.get("dataTypeDisplay"),
        data_length=check_col_length(data_type, _as_int(parsed.get("dataLength"))),
        array_data_type=parsed.get("arrayDataType"),
        children=children,
        precision=_as_int(parsed.get("precision")),
        scale=_as_int(parsed.get("scale")),
        ordinal_position=ordinal,
    )
