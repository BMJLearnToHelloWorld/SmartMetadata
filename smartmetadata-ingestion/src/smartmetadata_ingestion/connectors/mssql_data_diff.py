# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""MSSQL data-diff table parameter (OM data_diff_class / dialect mssql).

Clean-room: no collate-data-diff dependency. Mirrors DatabricksTableParameter.
"""

from __future__ import annotations

from typing import Any

from smartmetadata_ingestion.connectors import mssql_common as mssql
from smartmetadata_ingestion.errors import WorkflowError


class MssqlTableParameter:
    """Builds connection kwargs used by OM MssqlDialect / TableParameter."""

    @staticmethod
    def build(
        connection: dict[str, Any],
        *,
        database: str,
        schema: str,
        table: str,
        key_columns: list[str] | None = None,
    ) -> dict[str, Any]:
        mssql.run_connection_test(connection)
        if not database or not schema or not table:
            raise WorkflowError("database, schema, and table are required")
        return {
            "type": "Mssql",
            "scheme": mssql.normalize_scheme(connection),
            "hostPort": connection.get("hostPort"),
            "database": database,
            "schema": schema,
            "table": table,
            "keyColumns": list(key_columns or []),
            "dialect": "mssql",
        }


class MssqlDataDiff:
    """Compare two table key sets via injected row-key fetchers (unit-testable)."""

    def __init__(self, *, fetch_keys=None) -> None:
        self._fetch_keys = fetch_keys

    def compare(
        self,
        left: dict[str, Any],
        right: dict[str, Any],
    ) -> dict[str, Any]:
        if self._fetch_keys is None:
            raise RuntimeError("fetch_keys is required for live data diff")
        left_keys = set(self._fetch_keys(left))
        right_keys = set(self._fetch_keys(right))
        only_left = left_keys - right_keys
        only_right = right_keys - left_keys
        return {
            "left": left,
            "right": right,
            "rowDiffCount": len(only_left) + len(only_right),
            "extraLeft": len(only_left),
            "extraRight": len(only_right),
        }
