# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""DAG store protocol and the in-memory implementation.

The protocol is what the HTTP handlers speak to. ``AirflowBackend``
(``backends.py``) implements the same protocol against a real Airflow 3
instance; ``MemoryDagStore`` is the stand-in used by the contract tests
and by environments without Airflow. Both must answer the same contract
(ruling §2.1): same success bodies, same failure codes.

Run identity: the converged run UUID (``run_id.pipeline_run_id``) is the
only run identity the server ever sees. ``MemoryDagStore`` mints the
Airflow-side run id (``manual__<timestamp>``) exactly as ``trigger_dag``
would, then derives the converged UUID from it.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any, Protocol

from smartmetadata_airflow_apis.contracts import DEFAULT_TASK_KEY, TYPE_TO_TASK
from smartmetadata_airflow_apis.errors import (
    NoRunsError,
    UnknownDagError,
    ValidationError,
)
from smartmetadata_airflow_apis.run_id import clean_dag_id, pipeline_run_id

_LOG_CHUNK_BYTES = 2 * 1024 * 1024  # official last_dag_logs chunk size
_STATUS_LIMIT = 10  # official status returns the 10 latest runs


def _now_ms() -> int:
    return int(time.time() * 1000)


def _new_run_record(run_id: str) -> dict[str, Any]:
    now = _now_ms()
    return {
        "runId": run_id,
        "pipelineState": "queued",
        "startDate": now,
        "endDate": None,
        "timestamp": now,
    }


class DagStore(Protocol):
    """What a DAG backend must provide (handlers depend only on this)."""

    def deploy(self, pipeline: dict[str, Any]) -> str: ...
    def trigger(self, dag_id: str, conf: dict[str, Any] | None = None) -> dict[str, Any]: ...
    def status(
        self,
        dag_id: str,
        run_id: str | None = None,
        only_queued: bool = False,
    ) -> list[dict[str, Any]]: ...
    def set_enabled(self, dag_id: str, enabled: bool) -> bool: ...
    def delete(self, dag_id: str) -> bool: ...
    def kill(self, dag_id: str, run_id: str | None = None) -> bool: ...
    def last_logs(
        self,
        dag_id: str,
        run_id: str | None,
        task_id: str,
        after: int = 0,
    ) -> dict[str, Any]: ...
    def host_ip(self) -> str: ...


@dataclass
class DagState:
    dag_id: str
    config: dict[str, Any] = field(default_factory=dict)
    pipeline_type: str = "metadata"
    enabled: bool = True
    runs: list[dict[str, Any]] = field(default_factory=list)
    logs: dict[str, str] = field(default_factory=dict)

    @property
    def task_ids(self) -> list[str]:
        return [TYPE_TO_TASK.get(self.pipeline_type, DEFAULT_TASK_KEY)]


class MemoryDagStore:
    """In-memory DAG registry used by unit tests and the default app backend."""

    def __init__(self) -> None:
        self._dags: dict[str, DagState] = {}

    def deploy(self, pipeline: dict[str, Any]) -> str:
        dag_id = clean_dag_id(str(pipeline["name"]))
        state = self._dags.get(dag_id)
        if state is None:
            pause = bool((pipeline.get("airflowConfig") or {}).get("pausePipeline", False))
            state = DagState(
                dag_id=dag_id,
                pipeline_type=str(pipeline.get("pipelineType") or "metadata"),
                enabled=not pause,
            )
            self._dags[dag_id] = state
        state.config = dict(pipeline)
        state.pipeline_type = str(pipeline.get("pipelineType") or "metadata")
        return dag_id

    def _require(self, dag_id: str) -> DagState:
        state = self._dags.get(dag_id)
        if state is None:
            raise UnknownDagError(dag_id)
        return state

    def trigger(
        self, dag_id: str, conf: dict[str, Any] | None = None
    ) -> dict[str, Any]:
        state = self._require(dag_id)
        conf = conf or {}
        # Official trigger has no paused check (ruling §3.5 item 14): a
        # run is created and waits queued until the DAG is unpaused.
        minted = conf.get("pipelineRunId") or conf.get("run_id")
        if isinstance(minted, str) and minted:
            run_id = pipeline_run_id(dag_id, minted)
        else:
            # Airflow mints manual__<timestamp>; the converged UUID derives
            # from it, exactly as the real backend does.
            airflow_run_id = f"manual__{time.strftime('%Y-%m-%dT%H:%M:%S')}"
            run_id = pipeline_run_id(dag_id, airflow_run_id)
        record = _new_run_record(run_id)
        state.runs.append(record)
        return dict(record)

    def status(
        self,
        dag_id: str,
        run_id: str | None = None,
        only_queued: bool = False,
    ) -> list[dict[str, Any]]:
        state = self._require(dag_id)
        runs = list(state.runs)
        if run_id is not None:
            runs = [r for r in runs if r["runId"] == run_id]
        if only_queued:
            runs = [r for r in runs if r.get("pipelineState") == "queued"]
        # Newest first, latest 10 (official operations/status.py).
        return [dict(r) for r in reversed(runs[-_STATUS_LIMIT:])]

    def set_enabled(self, dag_id: str, enabled: bool) -> bool:
        state = self._dags.get(dag_id)
        if state is None:
            return False
        state.enabled = enabled
        return True

    def delete(self, dag_id: str) -> bool:
        return self._dags.pop(dag_id, None) is not None

    def kill(self, dag_id: str, run_id: str | None = None) -> bool:
        state = self._require(dag_id)
        targets = [
            r
            for r in state.runs
            if r.get("pipelineState") in {"queued", "running"}
            and (run_id is None or r["runId"] == run_id)
        ]
        if not targets:
            raise NoRunsError(dag_id)
        now = _now_ms()
        for run in targets:
            run["pipelineState"] = "failed"
            run["endDate"] = now
            run["timestamp"] = now
        return True

    def set_log(self, dag_id: str, task_id: str, text: str) -> None:
        state = self._dags.get(dag_id)
        if state is None:
            state = DagState(dag_id=dag_id)
            self._dags[dag_id] = state
        state.logs[task_id] = text

    def last_logs(
        self,
        dag_id: str,
        run_id: str | None,
        task_id: str,
        after: int = 0,
    ) -> dict[str, Any]:
        state = self._require(dag_id)
        if not state.runs:
            raise NoRunsError(dag_id)
        if task_id not in state.task_ids:
            raise ValidationError([f"Invalid: task_id {task_id}"])
        text = state.logs.get(task_id, "")
        total = max(1, (len(text) + _LOG_CHUNK_BYTES - 1) // _LOG_CHUNK_BYTES)
        if after < 0 or after >= total:
            raise ValidationError([f"Invalid: after {after}"])
        chunk = text[after * _LOG_CHUNK_BYTES : (after + 1) * _LOG_CHUNK_BYTES]
        body: dict[str, Any] = {task_id: chunk, "total": total}
        if after + 1 < total:
            body["after"] = after + 1
        return body

    def host_ip(self) -> str:
        return "127.0.0.1"
