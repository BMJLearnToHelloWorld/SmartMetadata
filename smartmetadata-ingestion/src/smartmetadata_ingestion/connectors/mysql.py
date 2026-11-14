# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""MySQL connector. Reads information_schema through a CatalogReader."""

from __future__ import annotations

from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from typing import Any, Protocol

from smartmetadata_ingestion.config import SourceConfig
from smartmetadata_ingestion.connectors import mysql_common
from smartmetadata_ingestion.connectors.constraints import (
    ConstraintRow,
    column_constraint_from_nullable,
    nullable_flag,
    schema_constraints_for_schema,
)
from smartmetadata_ingestion.connectors.ddl import (
    quote_backtick_ident,
    require_ddl_support,
    table_ddl_for_schema,
)
from smartmetadata_ingestion.connectors.json_schema import (
    attach_json_schemas_for_schema,
    require_json_sampling_support,
)
from smartmetadata_ingestion.connectors.owners import (
    owner_names_resolver,
    resolve_owner_names,
)
from smartmetadata_ingestion.connectors.procedures import (
    ProcedureRow,
    epoch_ms,
    procedures_for_schema,
)
from smartmetadata_ingestion.connectors.registry import register_source
from smartmetadata_ingestion.connectors.select import is_selected, is_selected_table
from smartmetadata_ingestion.connectors.table_types import map_table_type
from smartmetadata_ingestion.datatypes import check_col_length, map_mysql_type
from smartmetadata_ingestion.errors import WorkflowError
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
    life_cycle_from_ms,
)

_SYSTEM_SCHEMAS = frozenset({"information_schema", "mysql", "performance_schema", "sys", "innodb"})


@dataclass(frozen=True, slots=True)
class SchemaRow:
    name: str


@dataclass(frozen=True, slots=True)
class TableRow:
    schema_name: str
    name: str
    table_type: str
    comment: str | None = None
    created_ms: int | None = None
    updated_ms: int | None = None


@dataclass(frozen=True, slots=True)
class ColumnRow:
    schema_name: str
    table_name: str
    name: str
    data_type: str
    ordinal_position: int
    char_length: int | None = None
    comment: str | None = None
    is_nullable: bool | None = None


@dataclass(frozen=True, slots=True)
class ViewRow:
    schema_name: str
    name: str
    definition: str


class CatalogReader(Protocol):
    def list_schemas(self) -> Sequence[SchemaRow]: ...

    def list_tables(self, schema: str) -> Sequence[TableRow]: ...

    def list_columns(self, schema: str, table: str) -> Sequence[ColumnRow]: ...

    def list_views(self) -> Sequence[ViewRow]: ...


class SequenceCatalogReader:
    """In-memory catalog used by tests and the static dry-run path."""

    def __init__(
        self,
        *,
        schemas: Sequence[SchemaRow] = (),
        tables: Sequence[TableRow] = (),
        columns: Sequence[ColumnRow] = (),
        views: Sequence[ViewRow] = (),
        procedures: Sequence[ProcedureRow] = (),
        constraints: Sequence[ConstraintRow] = (),
        ddls: Mapping[tuple[str, str], str] | None = None,
        samples: Mapping[tuple[str, str], list[Any]] | None = None,
    ) -> None:
        self._schemas = list(schemas)
        self._tables = list(tables)
        self._columns = list(columns)
        self._views = list(views)
        self._procedures = list(procedures)
        self._constraints = list(constraints)
        self._ddls = dict(ddls or {})
        self._samples = dict(samples or {})

    def list_schemas(self) -> Sequence[SchemaRow]:
        return self._schemas

    def list_tables(self, schema: str) -> Sequence[TableRow]:
        return [row for row in self._tables if row.schema_name == schema]

    def list_columns(self, schema: str, table: str) -> Sequence[ColumnRow]:
        return [
            row for row in self._columns if row.schema_name == schema and row.table_name == table
        ]

    def list_views(self) -> Sequence[ViewRow]:
        return self._views

    def list_procedures(self, schema: str) -> Sequence[ProcedureRow]:
        return [row for row in self._procedures if row.schema_name == schema]

    def list_constraints(self, schema: str) -> Sequence[ConstraintRow]:
        return [row for row in self._constraints if row.schema_name == schema]

    def get_table_ddl(self, schema: str, table: str) -> str | None:
        return self._ddls.get((schema, table))

    def sample_column_values(
        self, schema: str, table: str, column: str, limit: int
    ) -> list[Any]:
        return list(self._samples.get((schema, table, column), ()))[:limit]


class CursorCatalogReader:
    """Reads MySQL information_schema through a DB-API cursor factory."""

    def __init__(self, connect):
        self._connect = connect

    def list_schemas(self) -> Sequence[SchemaRow]:
        rows = self._fetch(
            "SELECT schema_name FROM information_schema.schemata ORDER BY schema_name"
        )
        return [SchemaRow(name=row[0]) for row in rows]

    def list_tables(self, schema: str) -> Sequence[TableRow]:
        rows = self._fetch(
            """
            SELECT table_schema, table_name, table_type, table_comment, create_time, update_time
            FROM information_schema.tables
            WHERE table_schema = %s
            ORDER BY table_name
            """,
            (schema,),
        )
        return [
            TableRow(
                schema_name=row[0],
                name=row[1],
                table_type=row[2],
                comment=_blank_to_none(row[3]),
                created_ms=epoch_ms(row[4]),
                updated_ms=epoch_ms(row[5]),
            )
            for row in rows
        ]

    def list_columns(self, schema: str, table: str) -> Sequence[ColumnRow]:
        rows = self._fetch(
            """
            SELECT table_schema, table_name, column_name, data_type, ordinal_position,
                   character_maximum_length, column_comment, is_nullable
            FROM information_schema.columns
            WHERE table_schema = %s AND table_name = %s
            ORDER BY ordinal_position
            """,
            (schema, table),
        )
        return [
            ColumnRow(
                schema_name=row[0],
                table_name=row[1],
                name=row[2],
                data_type=row[3],
                ordinal_position=int(row[4]),
                char_length=row[5],
                comment=_blank_to_none(row[6]),
                is_nullable=nullable_flag(row[7]),
            )
            for row in rows
        ]

    def list_views(self) -> Sequence[ViewRow]:
        rows = self._fetch(
            """
            SELECT table_schema, table_name, view_definition
            FROM information_schema.views
            ORDER BY table_schema, table_name
            """
        )
        return [ViewRow(schema_name=row[0], name=row[1], definition=row[2] or "") for row in rows]

    def list_procedures(self, schema: str) -> Sequence[ProcedureRow]:
        rows = self._fetch(
            """
            SELECT routine_schema, routine_name, routine_type, external_language,
                   routine_definition, routine_comment, created, last_altered
            FROM information_schema.routines
            WHERE routine_schema = %s
            ORDER BY routine_name
            """,
            (schema,),
        )
        return [
            ProcedureRow(
                schema_name=row[0],
                name=row[1],
                routine_type=row[2],
                language=row[3],
                definition=row[4],
                comment=row[5],
                created_ms=epoch_ms(row[6]),
                updated_ms=epoch_ms(row[7]),
            )
            for row in rows
        ]
    def list_constraints(self, schema: str) -> Sequence[ConstraintRow]:
        rows = self._fetch(
            """
            SELECT tc.table_schema, tc.table_name, tc.constraint_name, tc.constraint_type,
                   kcu.column_name, kcu.ordinal_position,
                   kcu.referenced_table_schema, kcu.referenced_table_name,
                   kcu.referenced_column_name
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu
              ON kcu.constraint_schema = tc.constraint_schema
             AND kcu.constraint_name = tc.constraint_name
             AND kcu.table_schema = tc.table_schema
             AND kcu.table_name = tc.table_name
            WHERE tc.table_schema = %s
              AND tc.constraint_type IN ('PRIMARY KEY', 'FOREIGN KEY', 'UNIQUE')
            ORDER BY tc.table_name, tc.constraint_name, kcu.ordinal_position
            """,
            (schema,),
        )
        return [
            ConstraintRow(
                schema_name=row[0],
                table_name=row[1],
                constraint_name=row[2],
                constraint_type=row[3],
                column_name=row[4],
                ordinal_position=int(row[5]),
                referred_schema=row[6],
                referred_table=row[7],
                referred_column=row[8],
            )
            for row in rows
        ]

    def get_table_ddl(self, schema: str, table: str) -> str | None:
        ident = f"{quote_backtick_ident(schema)}.{quote_backtick_ident(table)}"
        rows = self._fetch(f"SHOW CREATE TABLE {ident}")
        if not rows:
            return None
        return rows[0][1]

    def sample_column_values(
        self, schema: str, table: str, column: str, limit: int
    ) -> list[Any]:
        ident = quote_backtick_ident(column)
        rows = self._fetch(
            f"SELECT {ident} FROM {quote_backtick_ident(schema)}.{quote_backtick_ident(table)} "
            f"WHERE {ident} IS NOT NULL LIMIT %s",
            (limit,),
        )
        return [row[0] for row in rows]

    def _fetch(self, sql: str, params: tuple[Any, ...] = ()) -> list[tuple[Any, ...]]:
        with self._connect() as connection:
            cursor = connection.cursor()
            try:
                cursor.execute(sql, params)
                return list(cursor.fetchall())
            finally:
                cursor.close()


@register_source("mysql")
class MysqlSource:
    def __init__(
        self,
        config: SourceConfig,
        *,
        reader: CatalogReader | None = None,
        connect=None,
    ) -> None:
        self._config = config
        self._reader = reader or (CursorCatalogReader(connect) if connect is not None else None)

    def prepare(self) -> None:
        return None

    def close(self) -> None:
        return None

    def produce(self) -> Iterable[WorkflowRecord]:
        yield self._service_record()
        database_name = self._database_name()
        if not is_selected(
            database_name,
            include=self._config.include_databases,
            exclude=self._config.exclude_databases,
            fqn=build_fqn(self._config.service_name, database_name),
            use_fqn=self._config.use_fqn_for_filtering,
        ):
            # A filtered-out single database yields the service
            # record only: nothing below it was listed.
            return
        yield DatabaseRecord(name=database_name, service=self._config.service_name)
        reader = self._require_reader()
        require_ddl_support(reader, "Mysql", enabled=self._config.include_ddl)
        require_json_sampling_support(reader, "Mysql", enabled=self._config.extract_json_schema)
        for schema in self._selected_schemas(reader, database_name):
            database_fqn = build_fqn(self._config.service_name, database_name)
            yield SchemaRecord(name=schema.name, database=database_fqn)
            schema_fqn = build_fqn(self._config.service_name, database_name, schema.name)
            constraints = schema_constraints_for_schema(
                reader,
                service_name=self._config.service_name,
                database_name=database_name,
                schema_name=schema.name,
            )
            for table in reader.list_tables(schema.name):
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
                ddl = table_ddl_for_schema(
                    reader,
                    "Mysql",
                    schema_name=schema.name,
                    table_name=table.name,
                    enabled=self._config.include_ddl,
                )
                attach_json_schemas_for_schema(
                    reader,
                    "Mysql",
                    schema.name,
                    table.name,
                    columns,
                    self._config,
                )
                owner_names = resolve_owner_names(
                    self._config.owner_config,
                    include_owners=self._config.include_owners,
                    service_name=self._config.service_name,
                    database_name=database_name,
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
                    life_cycle=life_cycle_from_ms(table.created_ms, table.updated_ms),
                )
            yield from procedures_for_schema(
                reader,
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
                    database_name=database_name,
                    schema_name=schema.name,
                ),
            )
        if self._config.include_view_lineage:
            yield from self._view_lineage(reader, database_name)

    def _service_record(self) -> DatabaseServiceRecord:
        connection = mysql_common.build_service_connection_config(
            raw=self._config.connection or {},
            store_secrets=self._config.store_connection_secrets,
        )
        return DatabaseServiceRecord(
            name=self._config.service_name,
            service_type="Mysql",
            display_name=self._config.service_display_name,
            description=None,
            connection=connection,
        )

    def _database_name(self) -> str:
        raw = self._config.connection
        return str(raw.get("databaseName") or raw.get("database") or "default")

    def _require_reader(self) -> CatalogReader:
        if self._reader is not None:
            return self._reader
        return CursorCatalogReader(_pymysql_connect(self._config.connection))

    def _include_schemas(self) -> list[str]:
        if self._config.include_schemas:
            return list(self._config.include_schemas)
        schema = self._config.connection.get("databaseSchema") or self._config.connection.get(
            "database_schema"
        )
        return [str(schema)] if schema else []

    def _selected_schemas(
        self, reader: CatalogReader, database_name: str
    ) -> list[SchemaRow]:
        exclude = list(self._config.exclude_schemas) + list(_SYSTEM_SCHEMAS)
        return [
            schema
            for schema in reader.list_schemas()
            if is_selected(
                schema.name,
                include=self._include_schemas(),
                exclude=exclude,
                fqn=build_fqn(self._config.service_name, database_name, schema.name),
                use_fqn=self._config.use_fqn_for_filtering,
            )
        ]

    def _columns(self, reader: CatalogReader, table: TableRow) -> list[ColumnRecord]:
        columns = []
        for column in reader.list_columns(table.schema_name, table.name):
            data_type = map_mysql_type(column.data_type)
            columns.append(
                ColumnRecord(
                    name=column.name,
                    constraint=column_constraint_from_nullable(column.is_nullable),
                    data_type=data_type,
                    data_type_display=column.data_type,
                    description=column.comment,
                    ordinal_position=column.ordinal_position,
                    data_length=check_col_length(data_type, column.char_length),
                )
            )
        return columns

    def _view_lineage(self, reader: CatalogReader, database_name: str) -> Iterable[LineageRecord]:
        known_tables = {
            (table.schema_name, table.name)
            for schema in self._selected_schemas(reader, database_name)
            for table in reader.list_tables(schema.name)
        }
        for view in reader.list_views():
            if (view.schema_name, view.name) not in known_tables:
                continue
            to_fqn = build_fqn(
                self._config.service_name, database_name, view.schema_name, view.name
            )
            for schema_name, table_name in view_parent_schema_tables(
                view.definition, dialect_for_connection_type("mysql"), view.schema_name
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


def _blank_to_none(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _pymysql_connect(connection: dict[str, Any]):
    try:
        import pymysql
    except ImportError as exc:
        raise WorkflowError(
            "mysql live reads need the optional extra: pip install 'smartmetadata-ingestion[mysql]'"
        ) from exc
    host_port = connection.get("hostPort") or connection.get("host_port") or "localhost:3306"
    if ":" in host_port:
        host, port_text = host_port.rsplit(":", 1)
        port = int(port_text)
    else:
        host, port = host_port, 3306
    database = (
        connection.get("databaseName")
        or connection.get("database")
        or connection.get("databaseSchema")
    )

    def connect():
        return pymysql.connect(
            host=host,
            port=port,
            user=connection.get("username"),
            # Same rule as mysql_common.password_of: the server returns
            # authType-only configs, so a top-level-only read sends an empty
            # password (step-6 gate: Access denied 1045 on catalog reads).
            password=mysql_common.password_of(connection),
            database=database,
        )

    return connect
