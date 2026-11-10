# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Shared ClickZetta connection helpers for data diff.

Data-diff-only surface: the product has no ClickZetta metadata/lineage/
profile connector yet, so this module carries only what
``clickzetta_data_diff`` needs — connection validation and a lazy DB-API
connect factory. A full ClickZetta connector is a separate item; it extends
this module, it does not replace it.

Clean-room alignment to official ClickZettaConnection /
``clickzetta.connector.v0.dbapi``: the host is ``<instance>.<service>``
(optionally ``:<port>``), the workspace is the connection's ``databaseName``
and the virtual cluster is ``virtualCluster``. The official data-diff
adapter's ``allowFullTableScan`` guard is NOT ported: it guards the
collate-data-diff engine's scan behaviour, which this clean-room key-set
fetcher does not use (its full-scan cost is Phase 1's known limitation).
ADR:2026-11-08-data-diff-p2-5-p2-6-bindings-and-form
"""

from __future__ import annotations

from typing import Any

from smartmetadata_ingestion.errors import WorkflowError

DEFAULT_SCHEME = "clickzetta"
DEFAULT_PROTOCOL = "https"


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
    if not connection.get("databaseName"):
        raise WorkflowError("databaseName (workspace) is required")
    steps.append("CheckWorkspace")
    if not connection.get("virtualCluster"):
        raise WorkflowError("virtualCluster is required")
    steps.append("CheckVirtualCluster")
    return steps


def _split_host_port(host_port: str) -> tuple[str, int | None]:
    if ":" not in host_port:
        return host_port, None
    host, port_text = host_port.rsplit(":", 1)
    if not host or not port_text.isdigit():
        raise WorkflowError(f"invalid ClickZetta hostPort: {host_port!r}")
    return host, int(port_text)


def clickzetta_connect(connection: dict[str, Any]):
    """Return a zero-arg connect() using the vendor ClickZetta DB-API."""
    try:
        from clickzetta.connector.v0 import dbapi
    except ImportError as exc:
        raise WorkflowError(
            "clickzetta live reads need: pip install 'smartmetadata-ingestion[clickzetta]'"
        ) from exc
    host_port = str(connection.get("hostPort") or "")
    host, port = _split_host_port(host_port)
    host_parts = host.split(".", 1)
    instance = connection.get("instance") or (host_parts[0] if len(host_parts) == 2 else None)
    if not instance:
        raise WorkflowError("ClickZetta host must include an instance (<instance>.<service>)")
    service = host_parts[1] if len(host_parts) == 2 else host_parts[0]
    if port:
        service = f"{service}:{port}"
    workspace = connection.get("databaseName")
    virtual_cluster = connection.get("virtualCluster")
    schema = connection.get("databaseSchema")
    protocol = connection.get("protocol") or DEFAULT_PROTOCOL
    username = connection.get("username")
    password = password_of(connection)

    def connect():
        return dbapi.connect(
            username=username,
            password=password,
            instance=instance,
            workspace=workspace,
            vcluster=virtual_cluster,
            service=service,
            schema=schema,
            protocol=protocol,
        )

    return connect
