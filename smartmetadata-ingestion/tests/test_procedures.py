# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

from __future__ import annotations

import logging
from datetime import datetime, timezone

import pytest

from smartmetadata_ingestion.config import SourceConfig
from smartmetadata_ingestion.connectors import (
    greenplum_common,
    mariadb_common,
    mssql_common,
    timescale_common,
)
from smartmetadata_ingestion.connectors.mysql import (
    CursorCatalogReader as MysqlCursorReader,
)
from smartmetadata_ingestion.connectors.mysql import (
    SequenceCatalogReader as MysqlSequenceReader,
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
from smartmetadata_ingestion.connectors.procedures import (
    ProcedureRow,
    epoch_ms,
    procedure_record,
    procedures_for_database_schema,
    procedures_for_schema,
)
from smartmetadata_ingestion.connectors.snowflake import (
    CursorCatalogReader as SnowflakeCursorReader,
)
from smartmetadata_ingestion.connectors.snowflake import (
    DatabaseRow as SnowDatabaseRow,
)
from smartmetadata_ingestion.connectors.snowflake import (
    SchemaRow as SnowSchemaRow,
)
from smartmetadata_ingestion.connectors.snowflake import (
    SequenceCatalogReader as SnowSequenceReader,
)
from smartmetadata_ingestion.connectors.snowflake import (
    SnowflakeSource,
)
from smartmetadata_ingestion.records import StoredProcedureRecord


def test_procedure_record_maps_routine_type_and_language() -> None:
    record = procedure_record(
        ProcedureRow(
            schema_name="public",
            name="calc",
            routine_type="FUNCTION",
            language="python",
            definition="def calc(): pass",
        ),
        database_schema="svc.db.public",
    )
    assert record.stored_procedure_type == "Function"
    assert record.language == "Python"
    assert record.code == "def calc(): pass"


def test_procedure_record_defaults_unknown_type_and_language() -> None:
    record = procedure_record(
        ProcedureRow(
            schema_name="public",
            name="weird",
            routine_type="PACKAGE",
            language="plpgsql",
            definition=None,
        ),
        database_schema="svc.db.public",
    )
    assert record.stored_procedure_type == "StoredProcedure"
    assert record.language == "External"
    assert record.code == ""


def test_procedure_record_carries_comment_and_lifecycle() -> None:
    record = procedure_record(
        ProcedureRow(
            schema_name="public",
            name="calc",
            comment="totals",
            created_ms=1000,
            updated_ms=2000,
        ),
        database_schema="svc.db.public",
    )
    assert record.description == "totals"
    assert record.life_cycle is not None
    assert record.life_cycle.created is not None
    assert record.life_cycle.created.timestamp == 1000
    assert record.life_cycle.updated is not None
    assert record.life_cycle.updated.timestamp == 2000


def test_epoch_ms_reads_naive_datetimes_as_utc() -> None:
    assert epoch_ms(datetime(2024, 1, 1, tzinfo=timezone.utc)) == 1704067200000
    assert epoch_ms(datetime(2024, 1, 1)) == 1704067200000
    assert epoch_ms(None) is None
    assert epoch_ms("2024-01-01") is None
    assert epoch_ms(1704067200000) is None


class _StubReader:
    def __init__(self, rows: list[ProcedureRow]) -> None:
        self._rows = rows

    def list_procedures(self, schema: str) -> list[ProcedureRow]:
        return [row for row in self._rows if row.schema_name == schema]


def test_procedures_for_schema_filters_and_dedupes_overloads() -> None:
    reader = _StubReader(
        [
            ProcedureRow(schema_name="public", name="calc", definition="v1"),
            ProcedureRow(schema_name="public", name="calc", definition="v2"),
            ProcedureRow(schema_name="public", name="audit", definition="a"),
            ProcedureRow(schema_name="other", name="skip", definition="s"),
        ]
    )
    records = procedures_for_schema(
        reader,
        schema_fqn="svc.db.public",
        schema_name="public",
        include=[],
        exclude=["audit"],
        enabled=True,
    )
    assert [record.name for record in records] == ["calc"]
    assert records[0].code == "v1"


def test_procedures_for_schema_honors_fqn_filtering_and_gate() -> None:
    reader = _StubReader([ProcedureRow(schema_name="public", name="calc")])
    records = procedures_for_schema(
        reader,
        schema_fqn="svc.db.public",
        schema_name="public",
        include=[r"svc\.db\.public\.calc$"],
        exclude=[],
        use_fqn=True,
    )
    assert [record.name for record in records] == ["calc"]
    assert (
        procedures_for_schema(
            reader,
            schema_fqn="svc.db.public",
            schema_name="public",
            include=[],
            exclude=[],
            enabled=False,
        )
        == []
    )


def test_procedures_for_schema_warns_for_readers_without_procedures(
    caplog: pytest.LogCaptureFixture,
) -> None:
    # INTENDED CHANGE (B-10a): a reader without list_procedures no
    # longer fails silently. The listing stays empty, but each call
    # warns naming the reader and schema, so a default-on capability
    # missing on an engine is visible in the run history.
    class _BareReader:
        pass

    with caplog.at_level(
        logging.WARNING, logger="smartmetadata_ingestion.connectors.procedures"
    ):
        assert (
            procedures_for_schema(
                _BareReader(),
                schema_fqn="svc.db.public",
                schema_name="public",
                include=[],
                exclude=[],
            )
            == []
        )
        assert (
            procedures_for_database_schema(
                _BareReader(),
                "db",
                schema_fqn="svc.db.public",
                schema_name="public",
                include=[],
                exclude=[],
            )
            == []
        )
    warnings = [record.message for record in caplog.records]
    assert len(warnings) == 2
    for warning in warnings:
        assert "list_procedures" in warning
        assert "_BareReader" in warning
        assert "svc.db.public" in warning


def test_procedures_for_schema_stays_silent_when_disabled(
    caplog: pytest.LogCaptureFixture,
) -> None:
    # Procedures not requested: no warning for an absent reader, since
    # nothing was asked of the engine.
    class _BareReader:
        pass

    with caplog.at_level(
        logging.WARNING, logger="smartmetadata_ingestion.connectors.procedures"
    ):
        assert (
            procedures_for_schema(
                _BareReader(),
                schema_fqn="svc.db.public",
                schema_name="public",
                include=[],
                exclude=[],
                enabled=False,
            )
            == []
        )
    assert caplog.records == []


def test_procedures_attach_owner_names_from_callable() -> None:
    reader = _StubReader([ProcedureRow(schema_name="public", name="calc")])
    records = procedures_for_schema(
        reader,
        schema_fqn="svc.db.public",
        schema_name="public",
        include=[],
        exclude=[],
        owner_names_for=lambda name: ["alice"] if name == "calc" else [],
    )
    assert records[0].owner_names == ["alice"]


def test_sequence_readers_filter_procedures_by_scope() -> None:
    rows = [
        ProcedureRow(database_name="db", schema_name="public", name="a"),
        ProcedureRow(database_name="db", schema_name="other", name="b"),
        ProcedureRow(database_name="x", schema_name="public", name="c"),
    ]
    assert [row.name for row in PgSequenceReader(procedures=rows).list_procedures("public")] == [
        "a",
        "c",
    ]
    assert [row.name for row in MysqlSequenceReader(procedures=rows).list_procedures("public")] == [
        "a",
        "c",
    ]
    reader = mariadb_common.SequenceCatalogReader(procedures=rows)
    assert [row.name for row in reader.list_procedures("public")] == ["a", "c"]
    assert [
        row.name
        for row in SnowSequenceReader(procedures=rows).list_procedures("db", "public")
    ] == ["a"]
    reader = mssql_common.SequenceCatalogReader(procedures=rows)
    assert [row.name for row in reader.list_procedures("db", "public")] == ["a"]
    assert [
        row.name
        for row in greenplum_common.SequenceCatalogReader(procedures=rows).list_procedures(
            "db", "public"
        )
    ] == ["a"]
    assert [
        row.name
        for row in timescale_common.SequenceCatalogReader(procedures=rows).list_procedures(
            "db", "public"
        )
    ] == ["a"]


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


def test_postgres_cursor_reader_queries_routines() -> None:
    cursor = _FakeCursor([("public", "calc", "PROCEDURE", "SQL", "SELECT 1")])
    rows = PgCursorReader(_connect(cursor)).list_procedures("public")
    assert len(rows) == 1
    assert rows[0].name == "calc"
    assert rows[0].definition == "SELECT 1"
    sql, params = cursor.executed[0]
    assert "information_schema.routines" in sql
    assert params == ("public",)


def test_mysql_cursor_reader_maps_comment_and_timestamps() -> None:
    created = datetime(2024, 1, 1, tzinfo=timezone.utc)
    updated = datetime(2024, 2, 1, tzinfo=timezone.utc)
    cursor = _FakeCursor(
        [("mydb", "calc", "PROCEDURE", "SQL", "SELECT 1", "totals", created, updated)]
    )
    rows = MysqlCursorReader(_connect(cursor)).list_procedures("mydb")
    assert rows[0].comment == "totals"
    assert rows[0].created_ms == 1704067200000
    assert rows[0].updated_ms == 1706745600000
    sql, params = cursor.executed[0]
    assert "information_schema.routines" in sql
    assert params == ("mydb",)


def test_mariadb_cursor_reader_queries_routines() -> None:
    cursor = _FakeCursor([("mydb", "calc", "FUNCTION", "SQL", "SELECT 1", None, None, None)])
    rows = mariadb_common.CursorCatalogReader(_connect(cursor)).list_procedures("mydb")
    assert rows[0].routine_type == "FUNCTION"
    sql, params = cursor.executed[0]
    assert "information_schema.routines" in sql
    assert params == ("mydb",)


def test_mssql_cursor_reader_uses_question_mark_params() -> None:
    cursor = _FakeCursor([("dbo", "calc", "PROCEDURE", "SELECT 1")])
    rows = mssql_common.CursorCatalogReader(_connect(cursor)).list_procedures("db", "dbo")
    assert rows[0].database_name == "db"
    assert rows[0].definition == "SELECT 1"
    sql, params = cursor.executed[0]
    assert "INFORMATION_SCHEMA.ROUTINES" in sql
    assert "?" in sql
    assert params == ("dbo",)


def test_snowflake_cursor_reader_unions_procedures_and_functions() -> None:
    created = datetime(2024, 1, 1, tzinfo=timezone.utc)
    cursor = _FakeCursor(
        [
            ("ANALYTICS", "PUBLIC", "CALC", "PROCEDURE", "SQL", "SELECT 1", "c", created, created),
            (
                "ANALYTICS",
                "PUBLIC",
                "F",
                "FUNCTION",
                "PYTHON",
                "def f(): pass",
                "",
                created,
                created,
            ),
        ]
    )
    rows = SnowflakeCursorReader(_connect(cursor)).list_procedures("ANALYTICS", "PUBLIC")
    assert [row.name for row in rows] == ["CALC", "F"]
    assert rows[1].routine_type == "FUNCTION"
    assert rows[0].comment == "c"
    assert rows[1].comment is None
    sql, params = cursor.executed[0]
    assert "INFORMATION_SCHEMA.PROCEDURES" in sql
    assert "INFORMATION_SCHEMA.FUNCTIONS" in sql
    assert params == ("PUBLIC", "PUBLIC")


def test_greenplum_and_timescale_cursor_readers_query_routines() -> None:
    for reader_cls in (
        greenplum_common.CursorCatalogReader,
        timescale_common.CursorCatalogReader,
    ):
        cursor = _FakeCursor([("public", "calc", "PROCEDURE", "SQL", "SELECT 1")])
        rows = reader_cls(_connect(cursor)).list_procedures("db", "public")
        assert rows[0].name == "calc"
        sql, params = cursor.executed[0]
        assert "information_schema.routines" in sql
        assert params == ("public",)


def test_postgres_source_emits_procedures_after_tables() -> None:
    reader = PgSequenceReader(
        schemas=[PgSchemaRow("public")],
        tables=[],
        columns=[],
        views=[],
        procedures=[
            ProcedureRow(schema_name="public", name="calc", definition="SELECT 1"),
        ],
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
    records = list(source.produce())
    kinds = [record.kind for record in records]
    assert kinds == ["databaseService", "database", "schema", "storedProcedure"]
    procedure = records[-1]
    assert isinstance(procedure, StoredProcedureRecord)
    assert procedure.database_schema == "warehouse.analytics.public"
    assert procedure.code == "SELECT 1"


def test_postgres_source_procedure_emission_honors_gate_and_pattern() -> None:
    def _produce(**overrides):
        reader = PgSequenceReader(
            schemas=[PgSchemaRow("public")],
            tables=[],
            columns=[],
            views=[],
            procedures=[ProcedureRow(schema_name="public", name="calc")],
        )
        config = {
            "type": "postgres",
            "service_name": "warehouse",
            "connection": {
                "hostPort": "localhost:5432",
                "username": "u",
                "database": "analytics",
            },
        }
        config.update(overrides)
        return list(PostgresSource(SourceConfig(**config), reader=reader).produce())

    assert "storedProcedure" not in [
        record.kind for record in _produce(include_stored_procedures_enabled=False)
    ]
    assert "storedProcedure" not in [
        record.kind for record in _produce(exclude_stored_procedures=["calc"])
    ]
    assert "storedProcedure" in [
        record.kind for record in _produce(include_stored_procedures=["calc"])
    ]


def test_snowflake_source_emits_procedures_per_schema() -> None:
    reader = SnowSequenceReader(
        databases=[SnowDatabaseRow("ANALYTICS")],
        schemas=[SnowSchemaRow("ANALYTICS", "PUBLIC")],
        tables=[],
        columns=[],
        views=[],
        procedures=[
            ProcedureRow(
                database_name="ANALYTICS",
                schema_name="PUBLIC",
                name="CALC",
                routine_type="PROCEDURE",
                language="SQL",
                definition="SELECT 1",
            )
        ],
    )
    source = SnowflakeSource(
        SourceConfig(
            type="snowflake",
            service_name="warehouse",
            connection={"account": "xy12345", "username": "u", "warehouse": "COMPUTE_WH"},
            include_databases=["ANALYTICS"],
            include_schemas=["PUBLIC"],
        ),
        reader=reader,
    )
    records = list(source.produce())
    procedures = [record for record in records if isinstance(record, StoredProcedureRecord)]
    assert [record.name for record in procedures] == ["CALC"]
    assert procedures[0].database_schema == "warehouse.ANALYTICS.PUBLIC"
