# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""DAG/run identifiers.

``pipeline_run_id`` is the single rule that lets the server, the worker and
the failure callbacks agree on one run UUID: a run id that already parses
as a UUID is used as-is, otherwise a UUIDv5 is derived from the dag id and
the Airflow run id.
"""

from __future__ import annotations

import re
import uuid
from typing import Any

_DAG_ID_INVALID = re.compile(r"[^0-9a-zA-Z-_]+")


def clean_dag_id(value: str) -> str:
    return _DAG_ID_INVALID.sub("_", value)


def sanitize_task_id(value: str) -> str:
    return _DAG_ID_INVALID.sub("_", value)


def pipeline_run_id(dag_id: str, run_id: str) -> uuid.UUID:
    try:
        return uuid.UUID(str(run_id))
    except (ValueError, AttributeError, TypeError):
        return uuid.uuid5(
            uuid.NAMESPACE_URL, f"openmetadata:{dag_id}:{run_id}"
        )


def resolve_run_id(
    dag_id: str,
    airflow_run_id: str | None,
    conf: dict[str, Any] | None,
) -> str:
    """The converged run UUID (ruling §1.5): the server-minted pipelineRunId
    from the trigger conf when it is a valid UUID, else the derivation from
    the Airflow run id. Server, worker and callbacks all use this rule, so
    one run has one id everywhere.

    The server mints the UUID into ``conf.pipelineRunId`` and records the
    queued run under it (AirflowRESTClient.runPipelineWithOptions); the
    worker reports under it. Official's ``format_dag_run_state`` derives
    only from ``dag_run.run_id`` (Airflow-minted ``manual__...``), which
    would not match the server's queued UUID — the product resolves
    conf-first so status, worker and callbacks agree.
    """
    candidate = conf.get("pipelineRunId") if isinstance(conf, dict) else None
    if isinstance(candidate, str) and candidate:
        try:
            return str(uuid.UUID(candidate))
        except ValueError:
            pass
    if airflow_run_id:
        return str(pipeline_run_id(dag_id, str(airflow_run_id)))
    return str(uuid.uuid4())
