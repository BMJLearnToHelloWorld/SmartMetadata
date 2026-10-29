# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Pure request handlers for AirflowRESTClient path names."""

from __future__ import annotations

from typing import Any

from smartmetadata_airflow_apis.contracts import PACKAGE_VERSION
from smartmetadata_airflow_apis.store import MemoryDagStore


class HandlerResult:
    def __init__(self, status: int, body: Any):
        self.status = status
        self.body = body


def health(_: MemoryDagStore) -> HandlerResult:
    return HandlerResult(200, {"status": "healthy", "version": PACKAGE_VERSION})


def health_auth(_: MemoryDagStore) -> HandlerResult:
    # Java AirflowRESTClient.readHealthResponse expects JSON with "version"
    return HandlerResult(200, {"version": PACKAGE_VERSION, "status": "healthy"})


def deploy(store: MemoryDagStore, payload: dict[str, Any]) -> HandlerResult:
    dag_id = (
        payload.get("name")
        or payload.get("dag_id")
        or (payload.get("airflowConfig") or {}).get("dagId")
    )
    if not dag_id:
        return HandlerResult(400, {"error": "deploy requires name or dag_id"})
    store.deploy(str(dag_id), payload)
    return HandlerResult(200, {"message": f"DAG {dag_id} deployed", "dag_id": dag_id})


def trigger(store: MemoryDagStore, payload: dict[str, Any]) -> HandlerResult:
    dag_id = payload.get("dag_id") or payload.get("dagId")
    if not dag_id:
        return HandlerResult(400, {"error": "trigger requires dag_id"})
    conf = payload.get("conf") if isinstance(payload.get("conf"), dict) else {}
    run = store.trigger(str(dag_id), conf)
    if run is None:
        return HandlerResult(404, {"error": f"DAG {dag_id} not found or disabled"})
    return HandlerResult(200, run)


def delete(store: MemoryDagStore, dag_id: str | None) -> HandlerResult:
    if not dag_id:
        return HandlerResult(400, {"error": "delete requires dag_id"})
    if not store.delete(dag_id):
        return HandlerResult(404, {"error": f"DAG {dag_id} not found"})
    return HandlerResult(200, {"message": f"DAG {dag_id} deleted"})


def enable(store: MemoryDagStore, payload: dict[str, Any]) -> HandlerResult:
    dag_id = payload.get("dag_id") or payload.get("dagId")
    if not dag_id:
        return HandlerResult(400, {"error": "enable requires dag_id"})
    if store.enable(str(dag_id), True) is None:
        return HandlerResult(404, {"error": f"DAG {dag_id} not found"})
    return HandlerResult(200, {"message": f"DAG {dag_id} enabled"})


def disable(store: MemoryDagStore, payload: dict[str, Any]) -> HandlerResult:
    dag_id = payload.get("dag_id") or payload.get("dagId")
    if not dag_id:
        return HandlerResult(400, {"error": "disable requires dag_id"})
    if store.enable(str(dag_id), False) is None:
        return HandlerResult(404, {"error": f"DAG {dag_id} not found"})
    return HandlerResult(200, {"message": f"DAG {dag_id} disabled"})


def status(store: MemoryDagStore, dag_id: str | None) -> HandlerResult:
    if not dag_id:
        return HandlerResult(400, {"error": "status requires dag_id"})
    # Java reads a JSON array of PipelineStatus
    return HandlerResult(200, store.status(dag_id))


def kill(store: MemoryDagStore, payload: dict[str, Any]) -> HandlerResult:
    dag_id = payload.get("dag_id") or payload.get("dagId")
    if not dag_id:
        return HandlerResult(400, {"error": "kill requires dag_id"})
    if not store.kill(str(dag_id)):
        return HandlerResult(404, {"error": f"DAG {dag_id} not found"})
    return HandlerResult(200, {"message": f"killed runs for {dag_id}"})


def last_dag_logs(
    store: MemoryDagStore,
    dag_id: str | None,
    task_id: str | None,
    after: int = 0,
) -> HandlerResult:
    if not dag_id or not task_id:
        return HandlerResult(400, {"error": "last_dag_logs requires dag_id and task_id"})
    body = store.last_logs(dag_id, task_id, after=after)
    if body is None:
        return HandlerResult(404, {"error": f"DAG {dag_id} not found"})
    return HandlerResult(200, body)


def host_ip(_: MemoryDagStore) -> HandlerResult:
    return HandlerResult(200, {"ip": "127.0.0.1"})


def run_automation(store: MemoryDagStore, payload: dict[str, Any]) -> HandlerResult:
    name = payload.get("name") or "automation"
    # Reuse deploy+trigger semantics without inventing a new product surface
    store.deploy(str(name), payload)
    run = store.trigger(str(name), {})
    return HandlerResult(200, run or {"message": f"automation {name} accepted"})
