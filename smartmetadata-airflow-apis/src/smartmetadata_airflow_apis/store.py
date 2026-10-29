# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""In-memory DAG registry used by unit tests and the default app backend."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class DagState:
    dag_id: str
    config: dict[str, Any] = field(default_factory=dict)
    enabled: bool = True
    runs: list[dict[str, Any]] = field(default_factory=list)
    logs: dict[str, str] = field(default_factory=dict)


class MemoryDagStore:
    def __init__(self) -> None:
        self._dags: dict[str, DagState] = {}

    def deploy(self, dag_id: str, config: dict[str, Any]) -> DagState:
        state = self._dags.get(dag_id) or DagState(dag_id=dag_id)
        state.config = dict(config)
        state.enabled = True
        self._dags[dag_id] = state
        return state

    def delete(self, dag_id: str) -> bool:
        return self._dags.pop(dag_id, None) is not None

    def get(self, dag_id: str) -> DagState | None:
        return self._dags.get(dag_id)

    def enable(self, dag_id: str, enabled: bool) -> DagState | None:
        state = self._dags.get(dag_id)
        if state is None:
            return None
        state.enabled = enabled
        return state

    def trigger(self, dag_id: str, conf: dict[str, Any] | None = None) -> dict[str, Any] | None:
        state = self._dags.get(dag_id)
        if state is None or not state.enabled:
            return None
        run = {
            "dag_id": dag_id,
            "pipelineState": "queued",
            "runId": f"run-{len(state.runs) + 1}",
            "conf": conf or {},
        }
        state.runs.append(run)
        return run

    def status(self, dag_id: str) -> list[dict[str, Any]]:
        state = self._dags.get(dag_id)
        if state is None:
            return []
        return list(state.runs)

    def kill(self, dag_id: str) -> bool:
        state = self._dags.get(dag_id)
        if state is None:
            return False
        for run in state.runs:
            if run.get("pipelineState") in {"queued", "running"}:
                run["pipelineState"] = "killed"
        return True

    def set_log(self, dag_id: str, task_id: str, text: str) -> None:
        state = self._dags.get(dag_id)
        if state is None:
            state = DagState(dag_id=dag_id)
            self._dags[dag_id] = state
        state.logs[task_id] = text

    def last_logs(self, dag_id: str, task_id: str, after: int = 0) -> dict[str, Any] | None:
        state = self._dags.get(dag_id)
        if state is None:
            return None
        text = state.logs.get(task_id, "")
        piece = text[after:]
        return {"logs": piece, "after": after + len(piece)}
