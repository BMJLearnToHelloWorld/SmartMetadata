# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Shared Trino connection helpers for data diff.

Data-diff-only surface: the product has no Trino metadata/lineage/profile
connector yet, so this module carries only what ``trino_data_diff`` needs —
connection validation and a lazy DB-API connect factory. A full Trino
connector is a separate item; it extends this module, it does not replace it.

Clean-room alignment to official TrinoConnection / TrinoTableParameter
(``trino://`` URL, table-specific catalog + schema per side).
ADR:2026-11-08-data-diff-p2-5-p2-6-bindings-and-form
"""

from __future__ import annotations

from typing import Any

from smartmetadata_ingestion.errors import WorkflowError

DEFAULT_SCHEME = "trino"
DEFAULT_PORT = 8080


def password_of(connection: dict[str, Any]) -> str:
    auth = connection.get("authType")
    if isinstance(auth, dict) and auth.get("password") is not None:
        return str(auth.get("password") or "")
    return str(connection.get("password") or "")


def run_connection_test(connection: dict[str, Any]) -> list[str]:
    steps: list[str] = []
    if not connection.get("hostPort"):
        raise WorkflowError("hostPort is required")
    steps.append("CheckHostPort")
    if not connection.get("username"):
        raise WorkflowError("username is required")
    steps.append("CheckUsername")
    if not connection.get("catalog") and not connection.get("database"):
        raise WorkflowError("catalog is required")
    steps.append("CheckCatalog")
    return steps


def trino_connect(connection: dict[str, Any]):
    """Return a zero-arg connect() using trino.dbapi (Trino/Presto wire protocol)."""
    try:
        import trino.dbapi
        from trino.auth import BasicAuthentication
    except ImportError as exc:
        raise WorkflowError(
            "trino live reads need: pip install 'smartmetadata-ingestion[trino]'"
        ) from exc
    host_port = connection.get("hostPort") or f"localhost:{DEFAULT_PORT}"
    if ":" in str(host_port):
        host, port_text = str(host_port).rsplit(":", 1)
        port = int(port_text)
    else:
        host, port = str(host_port), DEFAULT_PORT
    catalog = connection.get("catalog") or connection.get("database")
    username = connection.get("username")
    password = password_of(connection)
    http_scheme = connection.get("httpScheme") or ("https" if password else "http")
    auth = BasicAuthentication(username, password) if password else None

    def connect():
        return trino.dbapi.connect(
            host=host,
            port=port,
            user=username,
            catalog=catalog,
            schema=connection.get("schema"),
            http_scheme=http_scheme,
            auth=auth,
        )

    return connect
