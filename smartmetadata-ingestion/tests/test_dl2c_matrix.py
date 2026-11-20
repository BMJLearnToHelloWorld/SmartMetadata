# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""D-L2c §6 matrix completion (Leaf E): only the dimensions no other
Leaf E–prior test file locks.

- §6 test 7, binding half: the MySQL swapped native row walks through
  the real resolvers to its catalog FQN (the record half is locked by
  test_dl2c_mysql.py; the CSV binding half by test_dl2c_csv.py).
- §6 test 10, empty-connection regression: defaults derived from an
  empty connection via the shared naming function still let a fully
  qualified name and a two-column CSV row bind (the naming function
  alone is locked by test_dl2c_naming.py).
- §6 test 13, structural locks: no dotted-string splitting on the
  binding paths (one allowlisted display helper excepted), and the
  old truncation constant is gone. The structured
  ``table_aliases`` keys are locked by
  test_dl2c_parser_extraction.py and are not re-locked here.

All binding assertions run real product modules over an in-memory
catalog; no production function is mocked.
"""

from __future__ import annotations

import ast
from pathlib import Path
from typing import Any

from smartmetadata_ingestion.errors import RestError
from smartmetadata_ingestion.lineage.identifiers import StructuredIdentifier
from smartmetadata_ingestion.lineage.resolution import LineageBindingResolver
from smartmetadata_ingestion.naming import resolve_connection_defaults
from smartmetadata_ingestion.records import (
    BindingContext,
    FieldSource,
    TableQueryRecord,
)
from smartmetadata_ingestion.usage.stage import RestTableBindingResolver

SERVICE = "svc"
TARGET = "svc.warehouse.sales.orders"
DECOY = "svc.warehouse.warehouse.orders"


def _ident(*parts: str) -> StructuredIdentifier:
    return StructuredIdentifier.from_parts([(part, False) for part in parts])


def _table(fqn: str) -> dict[str, Any]:
    return {
        "id": f"id-{fqn}",
        "fullyQualifiedName": fqn,
        "name": fqn.rsplit(".", 1)[-1],
    }


class _FakeClient:
    """In-memory catalog reads. Absence is a 404; listings are
    scoped by the exact ``databaseSchema`` parameter the resolver
    asks for."""

    def __init__(self, tables: dict[str, dict[str, Any]]) -> None:
        self._tables = tables

    def get_table_by_name(self, fqn: str, fields: str | None = None) -> dict[str, Any]:
        entity = self._tables.get(fqn)
        if entity is None:
            raise RestError("not found", status_code=404)
        return entity

    def get_stored_procedure_by_name(
        self, fqn: str, fields: str | None = None
    ) -> dict[str, Any]:
        raise RestError("not found", status_code=404)

    def iter_collection(self, path: str, *, limit: int = 100, extra_params=None):
        schema_fqn = (extra_params or {}).get("databaseSchema", "")
        prefix = f"{schema_fqn}."
        return [e for fqn, e in self._tables.items() if fqn.startswith(prefix)]


def _resolvers(client: _FakeClient, defaults: tuple[str | None, str | None]):
    database, schema = defaults
    usage = RestTableBindingResolver(
        client,  # type: ignore[arg-type]
        SERVICE,
        default_database=database,
        default_schema=schema,
        engine_key="mysql",
    )
    lineage = LineageBindingResolver(
        client,  # type: ignore[arg-type]
        SERVICE,
        default_database=database,
        default_schema=schema,
        engine_key="mysql",
    )
    return usage, lineage


# --- §6 test 7, binding half: MySQL swapped-row walk-through --------


def test_mysql_swapped_row_binds_all_three_name_shapes() -> None:
    # The record half (template alias + swapped sources) is locked by
    # test_dl2c_mysql.py; this test starts from the record that half
    # produces — physical database in the schema segment, database
    # segment missing — and walks it through both resolvers.
    record = TableQueryRecord(
        query="SELECT * FROM orders",
        service_name=SERVICE,
        database_name=None,
        database_schema="sales",
        database_source=FieldSource.MISSING,
        schema_source=FieldSource.ROW_NATIVE_SWAPPED,
    )
    context = BindingContext.from_record(record)
    assert context.database_source is FieldSource.MISSING
    assert context.schema_source is FieldSource.ROW_NATIVE_SWAPPED
    defaults = resolve_connection_defaults({"databaseName": "warehouse"}, "mysql")
    assert defaults == ("warehouse", None)
    client = _FakeClient({TARGET: _table(TARGET), DECOY: _table(DECOY)})
    usage, lineage = _resolvers(client, defaults)
    for name in (
        _ident("orders"),
        _ident("sales", "orders"),
        _ident("warehouse", "sales", "orders"),
    ):
        assert usage.resolve(name, context=context) == TARGET
        assert lineage.resolve_table(name, context=context) == TARGET


def test_mysql_null_current_schema_row_falls_back_to_defaults() -> None:
    # A NULL CURRENT_SCHEMA row carries neither segment. After
    # D-L2c E the schema default is deleted, so a bare name misses
    # (the database default alone cannot complete it); a 2-part
    # name still binds through the database default, and a fully
    # qualified name still binds on its own segments.
    record = TableQueryRecord(
        query="SELECT * FROM orders",
        service_name=SERVICE,
        database_name=None,
        database_schema=None,
        database_source=FieldSource.MISSING,
        schema_source=FieldSource.MISSING,
    )
    context = BindingContext.from_record(record)
    defaults = resolve_connection_defaults(
        {"databaseName": "warehouse", "databaseSchema": "sales"}, "mysql"
    )
    assert defaults == ("warehouse", "sales")
    client = _FakeClient({TARGET: _table(TARGET), DECOY: _table(DECOY)})
    usage, lineage = _resolvers(client, defaults)
    assert usage.resolve(_ident("orders"), context=context) is None
    assert lineage.resolve_table(_ident("orders"), context=context) is None
    assert usage.binding_counts["missing_schema"] == 1
    assert (
        usage.resolve(_ident("sales", "orders"), context=context) == TARGET
    )
    assert (
        usage.resolve(_ident("warehouse", "sales", "orders"), context=context)
        == TARGET
    )


# --- §6 test 10: empty-connection regression ------------------------


def test_empty_connection_still_binds_qualified_names_and_csv_rows() -> None:
    # The shared rule must not raise for an empty connection (its
    # None result is locked by test_dl2c_naming.py); this test locks
    # the consequence: resolvers built from those defaults still bind
    # a fully qualified name and a two-column CSV row.
    defaults = resolve_connection_defaults({}, "postgres")
    assert defaults == (None, None)
    client = _FakeClient({TARGET: _table(TARGET), DECOY: _table(DECOY)})
    usage = RestTableBindingResolver(
        client,  # type: ignore[arg-type]
        SERVICE,
        default_database=defaults[0],
        default_schema=defaults[1],
        engine_key="postgres",
    )
    empty = BindingContext(
        database_name=None,
        database_schema=None,
        database_source=FieldSource.MISSING,
        schema_source=FieldSource.MISSING,
    )
    assert (
        usage.resolve(_ident("warehouse", "sales", "orders"), context=empty)
        == TARGET
    )
    csv_record = TableQueryRecord(
        query="SELECT * FROM orders",
        service_name=SERVICE,
        database_name="warehouse",
        database_schema="sales",
        database_source=FieldSource.ROW_CSV,
        schema_source=FieldSource.ROW_CSV,
    )
    csv_context = BindingContext.from_record(csv_record)
    assert usage.resolve(_ident("orders"), context=csv_context) == TARGET


# --- §6 test 13: structural locks ------------------------------------

# The binding paths: every module that turns a parsed name into a
# catalog decision (extraction, association, folding, resolution,
# parsing, processing, and the context/naming carriers). Display,
# logging, and staging modules are not binding paths and are not
# listed: this test's claim is exactly about these files.
_BINDING_MODULES = (
    "lineage/identifiers.py",
    "lineage/folding.py",
    "lineage/sqlglot_extract.py",
    "lineage/sqlfluff_extract.py",
    "lineage/sqlparse_extract.py",
    "lineage/parser.py",
    "lineage/resolution.py",
    "lineage/query_lineage.py",
    "lineage/procedure_lineage.py",
    "lineage/udf_names.py",
    "lineage/source.py",
    "lineage/view_lineage.py",
    "usage/stage.py",
    "usage/processor.py",
    "usage/query_log.py",
    "usage/workflow.py",
    "records.py",
    "naming.py",
)


def _package_root() -> Path:
    return Path(__file__).resolve().parents[1] / "src" / "smartmetadata_ingestion"


def test_no_dot_splitting_on_binding_paths_except_resolved_fqn_display() -> None:
    """Binding never splits a name string on ``"."``.

    The single exception is ``_fqn_service`` in
    ``lineage/query_lineage.py``, which splits an already-resolved
    catalog FQN to take its service segment for cross-database edge
    labeling — a display operation on resolved output, never a parse
    of an unresolved name. The exception is allowlisted by exact
    (file, enclosing function) identity, and the test requires it to
    still exist: deleting the helper must fail here, not pass
    silently.
    """
    root = _package_root()
    found: set[tuple[str, str]] = set()
    for relative in _BINDING_MODULES:
        path = root / relative
        assert path.is_file(), f"binding module missing: {relative}"
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        parents: dict[ast.AST, ast.AST] = {}
        for node in ast.walk(tree):
            for child in ast.iter_child_nodes(node):
                parents[child] = node
        for node in ast.walk(tree):
            if not (
                isinstance(node, ast.Call)
                and isinstance(node.func, ast.Attribute)
                and node.func.attr in ("split", "rsplit")
                and node.args
                and isinstance(node.args[0], ast.Constant)
                and node.args[0].value == "."
            ):
                continue
            enclosing = node
            while enclosing is not None and not isinstance(
                enclosing, (ast.FunctionDef, ast.AsyncFunctionDef)
            ):
                enclosing = parents.get(enclosing)
            function = enclosing.name if enclosing is not None else "<module>"
            found.add((relative, function))
    assert found == {("lineage/query_lineage.py", "_fqn_service")}


def test_name_part_truncation_constant_is_deleted() -> None:
    """The old three-part truncation has no remnant anywhere in the
    package or its tests — not in code, not in comments, not in test
    helpers. The constant's name is assembled so this file itself
    cannot trip the scan."""
    constant = "_MAX_" + "NAME_PARTS"
    root = _package_root()
    hits: list[str] = []
    for base in (root, Path(__file__).resolve().parent):
        for path in sorted(base.rglob("*.py")):
            if constant in path.read_text(encoding="utf-8"):
                hits.append(str(path.relative_to(root.parent)))
    assert hits == []
