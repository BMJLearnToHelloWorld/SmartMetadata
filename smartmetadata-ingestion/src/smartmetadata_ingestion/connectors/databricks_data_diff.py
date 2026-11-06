# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Data-diff table parameter builders for Databricks / Unity Catalog."""

from __future__ import annotations

from typing import Any

from smartmetadata_ingestion.connectors import databricks_common as dbx
from smartmetadata_ingestion.errors import WorkflowError


class DatabricksTableParameter:
    """Builds connection kwargs used by OM DatabricksTableParameter."""

    @staticmethod
    def build(
        connection: dict[str, Any],
        *,
        catalog: str,
        schema: str,
        table: str,
        key_columns: list[str] | None = None,
    ) -> dict[str, Any]:
        dbx.run_connection_test(connection, require_http_path=True)
        auth = connection.get("authType")
        if not isinstance(auth, dict):
            raise WorkflowError("authType is required")
        kind = dbx.classify_auth(auth)
        payload: dict[str, Any] = {
            "type": "Databricks",
            "hostPort": connection.get("hostPort"),
            "httpPath": connection.get("httpPath"),
            "catalog": catalog,
            "schema": schema,
            "table": table,
            "keyColumns": list(key_columns or []),
            "authKind": kind,
        }
        return payload


class UnityCatalogTableParameter:
    @staticmethod
    def build(
        connection: dict[str, Any],
        *,
        catalog: str,
        schema: str,
        table: str,
        key_columns: list[str] | None = None,
    ) -> dict[str, Any]:
        dbx.run_connection_test(connection, require_http_path=False)
        auth = connection.get("authType")
        if not isinstance(auth, dict):
            raise WorkflowError("authType is required")
        kind = dbx.classify_auth(auth)
        return {
            "type": "UnityCatalog",
            "hostPort": connection.get("hostPort"),
            "httpPath": connection.get("httpPath"),
            "catalog": catalog,
            "schema": schema,
            "table": table,
            "keyColumns": list(key_columns or []),
            "authKind": kind,
        }


class DatabricksDataDiff:
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
        # Local import: datadiff imports this module for the binding table,
        # so a top-level import would be circular.
        from smartmetadata_ingestion.datadiff import compare_key_sets

        diff = compare_key_sets(self._fetch_keys(left), self._fetch_keys(right))
        return {
            "left": left,
            "right": right,
            "rowDiffCount": diff.total,
            "extraLeft": diff.extra_left,
            "extraRight": diff.extra_right,
        }


class UnityCatalogDataDiff(DatabricksDataDiff):
    """Unity Catalog reuses the Databricks key-set compare."""
