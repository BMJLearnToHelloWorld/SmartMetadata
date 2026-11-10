# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Shared Azure SQL connection helpers for data diff.

Data-diff-only surface: the product has no Azure SQL metadata/lineage/
profile connector yet, so this module carries only what
``azuresql_data_diff`` needs — connection validation and a lazy DB-API
connect factory. A full Azure SQL connector is a separate item; it extends
this module, it does not replace it.

Wire protocol: Azure SQL is SQL Server over TDS, so the connect factory
delegates to ``mssql_common.mssql_connect`` (same drivers, same ODBC
connection string). That is a wire-protocol reuse, not an identity reuse:
the binding keeps its own ``AzureSQLTableParameter`` (type ``"AzureSQL"``),
its own registry entry, and its own default scheme — official groups
Mssql + AzureSQL as one SQL Server dialect family
(``SQL_SERVER_SERVICE_TYPES``) and the data-diff dialect for both is
``mssql``. The only difference from MSSQL is the default scheme:
official AzureSQLScheme defaults to ``mssql+pyodbc``.
ADR:2026-11-08-data-diff-p2-5-p2-6-bindings-and-form
"""

from __future__ import annotations

from typing import Any

from smartmetadata_ingestion.connectors import mssql_common as mssql

DEFAULT_SCHEME = mssql.SCHEME_PYODBC


def run_connection_test(connection: dict[str, Any]) -> list[str]:
    return mssql.run_connection_test(
        {**connection, "scheme": connection.get("scheme") or DEFAULT_SCHEME}
    )


def azuresql_connect(connection: dict[str, Any]):
    """Return a zero-arg connect() over TDS (see module docstring)."""
    return mssql.mssql_connect({**connection, "scheme": connection.get("scheme") or DEFAULT_SCHEME})
