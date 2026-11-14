# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Table-definition (DDL) reads for database connectors.

A reader exposes ``get_table_ddl`` when its engine can return a
definition; engines without one fail the run loudly when the pipeline
asks for DDL (``includeDDL``), instead of silently landing tables
without definitions. When DDL is not requested the reader is never
touched.
"""

from __future__ import annotations

from typing import Any

from smartmetadata_ingestion.errors import WorkflowError


def quote_backtick_ident(name: str) -> str:
    """A backtick-quoted identifier for SHOW statements.

    SHOW statements take no bound parameters, so identifiers are
    interpolated; doubling an embedded backtick keeps the quoting
    sound.
    """
    return "`" + name.replace("`", "``") + "`"


def require_ddl_support(reader: Any, engine_label: str, *, enabled: bool) -> None:
    """Fail fast when DDL was requested from an engine without a reader."""
    if enabled and not callable(getattr(reader, "get_table_ddl", None)):
        raise WorkflowError(
            f"{engine_label} does not expose table definitions: "
            "disable includeDDL or use an engine with DDL support"
        )


def table_ddl_for_schema(
    reader: Any,
    engine_label: str,
    *,
    schema_name: str,
    table_name: str,
    enabled: bool,
) -> str | None:
    """A table definition from a single-database reader, or ``None``."""
    if not enabled:
        return None
    fetch = getattr(reader, "get_table_ddl", None)
    if not callable(fetch):
        raise WorkflowError(
            f"{engine_label} does not expose table definitions: "
            "disable includeDDL or use an engine with DDL support"
        )
    return fetch(schema_name, table_name)


def table_ddl_for_database_schema(
    reader: Any,
    engine_label: str,
    database_name: str,
    *,
    schema_name: str,
    table_name: str,
    enabled: bool,
) -> str | None:
    """A table definition from a multi-database reader, or ``None``."""
    if not enabled:
        return None
    fetch = getattr(reader, "get_table_ddl", None)
    if not callable(fetch):
        raise WorkflowError(
            f"{engine_label} does not expose table definitions: "
            "disable includeDDL or use an engine with DDL support"
        )
    return fetch(database_name, schema_name, table_name)
