# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""MSSQL database connector (metadata + view lineage + synonyms flag).

Aligns to Apache OpenMetadata MssqlSource / MssqlConnection.
"""

from __future__ import annotations

from collections.abc import Iterable
from typing import Any

from smartmetadata_ingestion.config import SourceConfig
from smartmetadata_ingestion.connectors import mssql_common as mssql
from smartmetadata_ingestion.connectors.constraints import (
    column_constraint_from_nullable,
    schema_constraints_for_database_schema,
)
from smartmetadata_ingestion.connectors.ddl import (
    require_ddl_support,
    table_ddl_for_database_schema,
)
from smartmetadata_ingestion.connectors.json_schema import (
    attach_json_schemas_for_database_schema,
    require_json_sampling_support,
)
from smartmetadata_ingestion.connectors.owners import (
    owner_names_resolver,
    resolve_owner_names,
)
from smartmetadata_ingestion.connectors.procedures import procedures_for_database_schema
from smartmetadata_ingestion.connectors.registry import register_source
from smartmetadata_ingestion.connectors.select import is_selected, is_selected_table
from smartmetadata_ingestion.connectors.table_types import map_table_type
from smartmetadata_ingestion.datatypes import check_col_length, map_mssql_type
from smartmetadata_ingestion.fqn import build_fqn, quote_name
from smartmetadata_ingestion.lineage.dialect import dialect_for_connection_type
from smartmetadata_ingestion.lineage.resolution import view_parent_schema_tables
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


@register_source("mssql")
class MssqlSource:
    SERVICE_TYPE = "Mssql"

    def __init__(
        self,
        config: SourceConfig,
        *,
        reader: mssql.CatalogReader | None = None,
        connect=None,
    ) -> None:
        self._config = config
        raw = config.connection or {}
        self._ingest_all = bool(raw.get("ingestAllDatabases"))
        self._entry_database = str(raw.get("database") or "")
        if reader is not None:
            self._reader = reader
        elif connect is not None:
            self._reader = mssql.CursorCatalogReader(
                connect,
                ingest_all=self._ingest_all,
                entry_database=self._entry_database or None,
            )
        else:
            self._reader = None

    def prepare(self) -> None:
        mssql.run_connection_test(self._config.connection or {})

    def close(self) -> None:
        return None

    def produce(self) -> Iterable[WorkflowRecord]:
        yield self._service_record()
        reader = self._require_reader()
        require_ddl_support(reader, "Mssql", enabled=self._config.include_ddl)
        require_json_sampling_support(reader, "Mssql", enabled=self._config.extract_json_schema)
        for database in self._selected_databases(reader):
            yield DatabaseRecord(name=database.name, service=self._config.service_name)
            for schema in self._selected_schemas(reader, database.name):
                database_fqn = build_fqn(self._config.service_name, database.name)
                yield SchemaRecord(name=schema.name, database=database_fqn)
                schema_fqn = build_fqn(
                    self._config.service_name, database.name, schema.name
                )
                constraints = schema_constraints_for_database_schema(
                    reader,
                    database.name,
                    service_name=self._config.service_name,
                    schema_name=schema.name,
                )
                for table in reader.list_tables(database.name, schema.name):
                    table_type = map_table_type(table.table_type)
                    if not is_selected_table(
                        table.name,
                        table_type,
                        include_tables=self._config.include_tables,
                        exclude_tables=self._config.exclude_tables,
                        include_views=self._config.include_views,
                        include_tables_enabled=self._config.include_tables_enabled,
                        fqn=f"{schema_fqn}.{quote_name(table.name)}",
                        use_fqn=self._config.use_fqn_for_filtering,
                    ):
                        continue
                    columns = self._columns(reader, table)
                    constraints.apply(table.name, columns)
                    ddl = table_ddl_for_database_schema(
                        reader,
                        "Mssql",
                        database.name,
                        schema_name=schema.name,
                        table_name=table.name,
                        enabled=self._config.include_ddl,
                    )
                    attach_json_schemas_for_database_schema(
                        reader,
                        "Mssql",
                        database.name,
                        schema.name,
                        table.name,
                        columns,
                        self._config,
                    )
                    owner_names = resolve_owner_names(
                        self._config.owner_config,
                        include_owners=self._config.include_owners,
                        service_name=self._config.service_name,
                        database_name=database.name,
                        schema_name=schema.name,
                        entity_name=table.name,
                    )
                    yield TableRecord(
                        name=table.name,
                        database_schema=schema_fqn,
                        table_type=table_type,
                        description=table.comment,
                        columns=columns,
                        table_constraints=constraints.for_table(table.name),
                        owner_names=owner_names,
                        schema_definition=ddl,
                    )
                yield from procedures_for_database_schema(
                    reader,
                    database.name,
                    schema_fqn=schema_fqn,
                    schema_name=schema.name,
                    include=self._config.include_stored_procedures,
                    exclude=self._config.exclude_stored_procedures,
                    enabled=self._config.include_stored_procedures_enabled,
                    use_fqn=self._config.use_fqn_for_filtering,
                    owner_names_for=owner_names_resolver(
                        self._config.owner_config,
                        include_owners=self._config.include_owners,
                        service_name=self._config.service_name,
                        database_name=database.name,
                        schema_name=schema.name,
                    ),
                )
            if self._config.include_view_lineage:
                yield from self._view_lineage(reader, database.name)

    def _service_record(self) -> DatabaseServiceRecord:
        connection = mssql.build_service_connection_config(
            raw=self._config.connection or {},
            store_secrets=self._config.store_connection_secrets,
        )
        return DatabaseServiceRecord(
            name=self._config.service_name,
            service_type=self.SERVICE_TYPE,
            display_name=self._config.service_display_name,
            connection=connection,
        )

    def _require_reader(self) -> mssql.CatalogReader:
        if self._reader is not None:
            return self._reader
        connect = mssql.mssql_connect(self._config.connection or {})
        return mssql.CursorCatalogReader(
            connect,
            ingest_all=self._ingest_all,
            entry_database=self._entry_database or None,
        )

    def _selected_databases(self, reader: mssql.CatalogReader) -> list[mssql.DatabaseRow]:
        include = list(self._config.include_databases)
        exclude = list(self._config.exclude_databases) + list(mssql.system_databases())
        return [
            db
            for db in reader.list_databases()
            if is_selected(
                db.name,
                include=include,
                exclude=exclude,
                fqn=build_fqn(self._config.service_name, db.name),
                use_fqn=self._config.use_fqn_for_filtering,
            )
        ]

    def _include_schemas(self) -> list[str]:
        if self._config.include_schemas:
            return list(self._config.include_schemas)
        schema = (self._config.connection or {}).get("databaseSchema")
        return [str(schema)] if schema else []

    def _selected_schemas(
        self, reader: mssql.CatalogReader, database: str
    ) -> list[mssql.SchemaRow]:
        exclude = list(self._config.exclude_schemas) + list(mssql.system_schemas())
        return [
            schema
            for schema in reader.list_schemas(database)
            if is_selected(
                schema.name,
                include=self._include_schemas(),
                exclude=exclude,
                fqn=build_fqn(self._config.service_name, database, schema.name),
                use_fqn=self._config.use_fqn_for_filtering,
            )
        ]

    def _columns(
        self, reader: mssql.CatalogReader, table: mssql.TableRow
    ) -> list[ColumnRecord]:
        columns = []
        for column in reader.list_columns(
            table.database_name, table.schema_name, table.name
        ):
            data_type = map_mssql_type(column.data_type)
            columns.append(
                ColumnRecord(
                    name=column.name,
                    constraint=column_constraint_from_nullable(column.is_nullable),
                    data_type=data_type,
                    data_type_display=column.data_type,
                    description=column.comment,
                    ordinal_position=column.ordinal_position,
                    data_length=check_col_length(data_type, _as_int(column.char_length)),
                )
            )
        return columns

    def _view_lineage(
        self, reader: mssql.CatalogReader, database_name: str
    ) -> Iterable[LineageRecord]:
        known = {
            (t.schema_name, t.name)
            for schema in self._selected_schemas(reader, database_name)
            for t in reader.list_tables(database_name, schema.name)
        }
        for view in reader.list_views(database_name):
            if (view.schema_name, view.name) not in known:
                continue
            to_fqn = build_fqn(
                self._config.service_name, database_name, view.schema_name, view.name
            )
            for schema_name, table_name in view_parent_schema_tables(
                view.definition, dialect_for_connection_type("mssql"), view.schema_name
            ):
                if (schema_name, table_name) not in known:
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
