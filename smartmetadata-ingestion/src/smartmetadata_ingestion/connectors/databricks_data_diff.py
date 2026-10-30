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
            "authKind": kind,
        }
