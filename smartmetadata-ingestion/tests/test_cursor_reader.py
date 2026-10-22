# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

from __future__ import annotations

from smartmetadata_ingestion.connectors.postgres import CursorCatalogReader


class FakeCursor:
    def __init__(self, rows):
        self.rows = rows
        self.sql = None
        self.params = None
        self.closed = False

    def execute(self, sql, params=()):
        self.sql = sql
        self.params = params

    def fetchall(self):
        return self.rows

    def close(self):
        self.closed = True


class FakeConnection:
    def __init__(self, cursor: FakeCursor):
        self._cursor = cursor

    def cursor(self):
        return self._cursor

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return None


def test_cursor_reader_uses_information_schema() -> None:
    cursor = FakeCursor([("public",)])
    reader = CursorCatalogReader(lambda: FakeConnection(cursor))
    schemas = reader.list_schemas()
    assert [row.name for row in schemas] == ["public"]
    assert "information_schema.schemata" in cursor.sql
    assert cursor.closed is True

    cursor.rows = [("public", "orders", "BASE TABLE")]
    tables = reader.list_tables("public")
    assert tables[0].name == "orders"
    assert cursor.params == ("public",)

    cursor.rows = [("public", "orders", "id", "integer", 1, None)]
    columns = reader.list_columns("public", "orders")
    assert columns[0].name == "id"

    cursor.rows = [("public", "orders_v", "SELECT 1")]
    views = reader.list_views()
    assert views[0].name == "orders_v"
