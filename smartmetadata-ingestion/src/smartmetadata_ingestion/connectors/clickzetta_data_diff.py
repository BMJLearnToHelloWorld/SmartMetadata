# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""ClickZetta data-diff table parameter (OM ClickzettaTableParameter / dialect clickzetta).

Clean-room: no collate-data-diff dependency and no vendored copy of the
official ClickZetta data-diff adapter. The official parameter class only
registers the adapter and reuses the base construction; this builder does
the product's equivalent — a side descriptor the key-set fetcher consumes.
The side's ``database`` segment is the ClickZetta workspace (the
connection's ``databaseName``); tables are addressed ``schema.table``.
ADR:2026-11-08-data-diff-p2-5-p2-6-bindings-and-form
"""

from __future__ import annotations

from typing import Any

from smartmetadata_ingestion.connectors import clickzetta_common as clickzetta
from smartmetadata_ingestion.errors import WorkflowError


class ClickzettaTableParameter:
    """Builds connection kwargs used by OM ClickZettaDialect / TableParameter."""

    @staticmethod
    def build(
        connection: dict[str, Any],
        *,
        database: str,
        schema: str,
        table: str,
        key_columns: list[str] | None = None,
    ) -> dict[str, Any]:
        clickzetta.run_connection_test(connection)
        if not database or not schema or not table:
            raise WorkflowError("database, schema, and table are required")
        return {
            "type": "ClickZetta",
            "scheme": connection.get("scheme") or clickzetta.DEFAULT_SCHEME,
            "hostPort": connection.get("hostPort"),
            "workspace": database,
            "schema": schema,
            "table": table,
            "keyColumns": list(key_columns or []),
            "dialect": "clickzetta",
        }


class ClickzettaDataDiff:
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
