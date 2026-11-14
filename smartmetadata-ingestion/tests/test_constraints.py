# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

from __future__ import annotations

import logging

import pytest

from smartmetadata_ingestion.config import SourceConfig
from smartmetadata_ingestion.connectors import (
    greenplum_common,
    mariadb_common,
    mssql_common,
    timescale_common,
)
from smartmetadata_ingestion.connectors.constraints import (
    ConstraintRow,
    SchemaConstraints,
    column_constraint_from_nullable,
    nullable_flag,
    schema_constraints_for_database_schema,
    schema_constraints_for_schema,
)
from smartmetadata_ingestion.connectors.mysql import (
    CursorCatalogReader as MysqlCursorReader,
)
from smartmetadata_ingestion.connectors.mysql import (
    SequenceCatalogReader as MysqlSequenceReader,
)
from smartmetadata_ingestion.connectors.postgres import (
    ColumnRow as PgColumnRow,
)
from smartmetadata_ingestion.connectors.postgres import (
    CursorCatalogReader as PgCursorReader,
)
from smartmetadata_ingestion.connectors.postgres import (
    PostgresSource,
)
from smartmetadata_ingestion.connectors.postgres import (
    SchemaRow as PgSchemaRow,
)
from smartmetadata_ingestion.connectors.postgres import (
    SequenceCatalogReader as PgSequenceReader,
)
from smartmetadata_ingestion.connectors.postgres import (
    TableRow as PgTableRow,
)
from smartmetadata_ingestion.connectors.snowflake import (
    CursorCatalogReader as SnowflakeCursorReader,
)
from smartmetadata_ingestion.connectors.snowflake import (
    SequenceCatalogReader as SnowSequenceReader,
)
from smartmetadata_ingestion.records import ColumnRecord, TableRecord
from smartmetadata_ingestion.sinks.metadata_rest import _table_payload


def _rows() -> list[ConstraintRow]:
    return [
        ConstraintRow(
            schema_name="public",
            table_name="orders",
            constraint_name="orders_pkey",
            constraint_type="PRIMARY KEY",
            column_name="id",
            ordinal_position=1,
        ),
        ConstraintRow(
            schema_name="public",
            table_name="orders",
            constraint_name="orders_customer_fk",
            constraint_type="FOREIGN KEY",
            column_name="customer_id",
            ordinal_position=1,
            referred_schema="public",
            referred_table="customers",
            referred_column="id",
        ),
        ConstraintRow(
            schema_name="public",
            table_name="orders",
            constraint_name="orders_email_key",
            constraint_type="UNIQUE",
            column_name="email",
            ordinal_position=1,
        ),
        ConstraintRow(
            schema_name="public",
            table_name="orders",
            constraint_name="orders_check",
            constraint_type="CHECK",
            column_name="total",
            ordinal_position=1,
        ),
        ConstraintRow(
            schema_name="public",
            table_name="customers",
            constraint_name="customers_pkey",
            constraint_type="PRIMARY KEY",
            column_name="id",
            ordinal_position=1,
        ),
    ]


def _grouped() -> SchemaConstraints:
    return SchemaConstraints(_rows(), service_name="svc", database_name="db")


def test_grouping_orders_columns_and_drops_check_constraints() -> None:
    records = _grouped().for_table("orders")
    assert [record.constraint_type for record in records] == [
        "PRIMARY_KEY",
        "FOREIGN_KEY",
        "UNIQUE",
    ]
    assert records[0].columns == ["id"]
    assert records[2].columns == ["email"]
    assert _grouped().for_table("missing") == []


def test_foreign_key_referred_columns_are_fqns() -> None:
    records = _grouped().for_table("orders")
    assert records[1].referred_columns == ["svc.db.public.customers.id"]
    assert records[0].referred_columns is None


def test_incomplete_referred_side_drops_the_whole_list() -> None:
    grouped = SchemaConstraints(
        [
            ConstraintRow(
                schema_name="public",
                table_name="t",
                constraint_name="fk",
                constraint_type="FOREIGN KEY",
                column_name="a",
                ordinal_position=1,
                referred_table="o",
                referred_column="x",
            ),
            ConstraintRow(
                schema_name="public",
                table_name="t",
                constraint_name="fk",
                constraint_type="FOREIGN KEY",
                column_name="b",
                ordinal_position=2,
            ),
        ],
        service_name="svc",
        database_name="db",
    )
    record = grouped.for_table("t")[0]
    assert record.columns == ["a", "b"]
    assert record.referred_columns is None


def test_column_kind_prefers_primary_key_over_unique() -> None:
    grouped = SchemaConstraints(
        [
            ConstraintRow(
                table_name="t",
                constraint_name="u",
                constraint_type="UNIQUE",
                column_name="id",
            ),
            ConstraintRow(
                table_name="t",
                constraint_name="p",
                constraint_type="PRIMARY KEY",
                column_name="id",
            ),
        ],
        service_name="svc",
        database_name="db",
    )
    assert grouped.column_kind("t", "id") == "PRIMARY_KEY"
    assert grouped.column_kind("t", "other") is None


def test_apply_overlays_keys_and_keeps_not_null() -> None:
    columns = [
        ColumnRecord(name="id", data_type="INT", constraint="NOT_NULL"),
        ColumnRecord(name="email", data_type="VARCHAR", constraint="NOT_NULL"),
        ColumnRecord(name="note", data_type="VARCHAR", constraint="NOT_NULL"),
        ColumnRecord(name="opt", data_type="VARCHAR"),
    ]
    _grouped().apply("orders", columns)
    assert [column.constraint for column in columns] == [
        "PRIMARY_KEY",
        "UNIQUE",
        "NOT_NULL",
        None,
    ]


def test_nullable_flag_maps_only_yes_and_no() -> None:
    assert nullable_flag("YES") is True
    assert nullable_flag("NO") is False
    assert nullable_flag(None) is None
    assert nullable_flag("yes") is None
    assert nullable_flag("") is None


def test_column_constraint_from_nullable() -> None:
    assert column_constraint_from_nullable(False) == "NOT_NULL"
    assert column_constraint_from_nullable(True) is None
    assert column_constraint_from_nullable(None) is None


def test_probe_helpers_warn_for_readers_without_constraints(
    caplog: pytest.LogCaptureFixture,
) -> None:
    # INTENDED CHANGE (B-10a, same ruling as the procedures probe): a
    # reader without list_constraints no longer fails silently. The
    # grouping stays empty, but each call warns naming the reader and
    # schema, so the missing capability is visible in the run history.
    class _BareReader:
        pass

    with caplog.at_level(
        logging.WARNING, logger="smartmetadata_ingestion.connectors.constraints"
    ):
        grouped = schema_constraints_for_schema(
            _BareReader(), service_name="svc", database_name="db", schema_name="public"
        )
        assert grouped.for_table("t") == []
        grouped = schema_constraints_for_database_schema(
            _BareReader(), "db", service_name="svc", schema_name="public"
        )
        assert grouped.for_table("t") == []
    warnings = [record.message for record in caplog.records]
    assert len(warnings) == 2
    for warning in warnings:
        assert "list_constraints" in warning
        assert "_BareReader" in warning
        assert "svc.db.public" in warning


def test_sequence_readers_filter_constraints_by_scope() -> None:
    rows = _rows()
    assert len(PgSequenceReader(constraints=rows).list_constraints("public")) == 5
    assert len(MysqlSequenceReader(constraints=rows).list_constraints("public")) == 5
    assert (
        len(
            mariadb_common.SequenceCatalogReader(constraints=rows).list_constraints("public")
        )
        == 5
    )
    scoped = [
        ConstraintRow(database_name="db", schema_name="public", table_name="t"),
        ConstraintRow(database_name="x", schema_name="public", table_name="t"),
    ]
    assert (
        len(SnowSequenceReader(constraints=scoped).list_constraints("db", "public")) == 1
    )
    assert (
        len(mssql_common.SequenceCatalogReader(constraints=scoped).list_constraints("db", "public"))
        == 1
    )
    assert (
        len(
            greenplum_common.SequenceCatalogReader(constraints=scoped).list_constraints(
                "db", "public"
            )
        )
        == 1
    )
    assert (
        len(
            timescale_common.SequenceCatalogReader(constraints=scoped).list_constraints(
                "db", "public"
            )
        )
        == 1
    )


class _FakeCursor:
    def __init__(self, rows: list[tuple]) -> None:
        self._rows = rows
        self.executed: list[tuple[str, tuple]] = []

    def execute(self, sql: str, params: tuple = ()) -> None:
        self.executed.append((sql, params))

    def fetchall(self) -> list[tuple]:
        return self._rows

    def close(self) -> None:
        pass


class _FakeConnection:
    def __init__(self, cursor: _FakeCursor) -> None:
        self._cursor = cursor

    def __enter__(self) -> _FakeConnection:
        return self

    def __exit__(self, *exc: object) -> None:
        return None

    def cursor(self) -> _FakeCursor:
        return self._cursor


def _connect(cursor: _FakeCursor):
    def _factory():
        return _FakeConnection(cursor)

    return _factory


def test_postgres_cursor_reader_joins_referential_constraints() -> None:
    cursor = _FakeCursor(
        [("public", "orders", "fk", "FOREIGN KEY", "customer_id", 1, "public", "customers", "id")]
    )
    rows = PgCursorReader(_connect(cursor)).list_constraints("public")
    assert rows[0].referred_table == "customers"
    assert rows[0].referred_column == "id"
    sql, params = cursor.executed[0]
    assert "information_schema.referential_constraints" in sql
    assert "information_schema.key_column_usage" in sql
    assert params == ("public",)


def test_mysql_cursor_reader_uses_referenced_columns() -> None:
    cursor = _FakeCursor(
        [("app", "orders", "fk", "FOREIGN KEY", "customer_id", 1, "app", "customers", "id")]
    )
    rows = MysqlCursorReader(_connect(cursor)).list_constraints("app")
    assert rows[0].referred_schema == "app"
    assert rows[0].referred_table == "customers"
    sql, params = cursor.executed[0]
    assert "referenced_table_name" in sql
    assert params == ("app",)


def test_mssql_cursor_reader_uses_question_mark_params() -> None:
    cursor = _FakeCursor(
        [("dbo", "orders", "pk", "PRIMARY KEY", "id", 1, None, None, None)]
    )
    rows = mssql_common.CursorCatalogReader(_connect(cursor)).list_constraints("db", "dbo")
    assert rows[0].constraint_type == "PRIMARY KEY"
    assert rows[0].referred_table is None
    sql, params = cursor.executed[0]
    assert "INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS" in sql
    assert "?" in sql
    assert params == ("dbo",)


def test_snowflake_cursor_reader_scopes_constraints_without_referential_join() -> None:
    cursor = _FakeCursor([("PUBLIC", "ORDERS", "pk", "PRIMARY KEY", "ID", 1)])
    rows = SnowflakeCursorReader(_connect(cursor)).list_constraints("ANALYTICS", "PUBLIC")
    assert rows[0].database_name == "ANALYTICS"
    assert rows[0].referred_table is None
    sql, params = cursor.executed[0]
    assert "INFORMATION_SCHEMA.TABLE_CONSTRAINTS" in sql
    assert "INFORMATION_SCHEMA.KEY_COLUMN_USAGE" in sql
    assert "REFERENTIAL" not in sql
    assert params == ("PUBLIC",)


def test_greenplum_and_timescale_cursor_readers_query_constraints() -> None:
    for reader_cls in (
        greenplum_common.CursorCatalogReader,
        timescale_common.CursorCatalogReader,
    ):
        cursor = _FakeCursor(
            [("public", "orders", "pk", "PRIMARY KEY", "id", 1, None, None, None)]
        )
        rows = reader_cls(_connect(cursor)).list_constraints("db", "public")
        assert rows[0].database_name == "db"
        sql, params = cursor.executed[0]
        assert "information_schema.table_constraints" in sql
        assert params == ("public",)


def test_postgres_source_emits_constraints_and_column_kinds() -> None:
    reader = PgSequenceReader(
        schemas=[PgSchemaRow("public")],
        tables=[PgTableRow("public", "orders", "BASE TABLE")],
        columns=[
            PgColumnRow("public", "orders", "id", "integer", 1, is_nullable=False),
            PgColumnRow("public", "orders", "email", "character varying", 2, is_nullable=False),
            PgColumnRow("public", "orders", "note", "text", 3, is_nullable=True),
            PgColumnRow("public", "orders", "opt", "text", 4),
        ],
        views=[],
        constraints=_rows(),
    )
    source = PostgresSource(
        SourceConfig(
            type="postgres",
            service_name="warehouse",
            connection={
                "hostPort": "localhost:5432",
                "username": "u",
                "database": "analytics",
            },
        ),
        reader=reader,
    )
    tables = [record for record in source.produce() if isinstance(record, TableRecord)]
    assert len(tables) == 1
    table = tables[0]
    assert [column.constraint for column in table.columns] == [
        "PRIMARY_KEY",
        "UNIQUE",
        None,
        None,
    ]
    assert [item.constraint_type for item in table.table_constraints] == [
        "PRIMARY_KEY",
        "FOREIGN_KEY",
        "UNIQUE",
    ]
    payload = _table_payload(table)
    assert payload["tableConstraints"][1]["referredColumns"] == [
        "warehouse.analytics.public.customers.id"
    ]
    assert payload["columns"][0]["constraint"] == "PRIMARY_KEY"
    assert "constraint" not in payload["columns"][2]


class _MinimalReader:
    """A reader with no constraint/procedure support: the probe path."""

    def list_schemas(self):
        return [PgSchemaRow("public")]

    def list_tables(self, schema):
        return [PgTableRow("public", "orders", "BASE TABLE")]

    def list_columns(self, schema, table):
        return [PgColumnRow("public", "orders", "id", "integer", 1, is_nullable=False)]

    def list_views(self):
        return []


def test_source_without_constraint_reader_still_derives_not_null() -> None:
    source = PostgresSource(
        SourceConfig(
            type="postgres",
            service_name="warehouse",
            connection={
                "hostPort": "localhost:5432",
                "username": "u",
                "database": "analytics",
            },
        ),
        reader=_MinimalReader(),
    )
    tables = [record for record in source.produce() if isinstance(record, TableRecord)]
    assert tables[0].columns[0].constraint == "NOT_NULL"
    assert tables[0].table_constraints == []
