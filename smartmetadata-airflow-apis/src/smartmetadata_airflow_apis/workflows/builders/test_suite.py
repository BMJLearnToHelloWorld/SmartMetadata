# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""TestSuite pipeline builder: a single test_suite_task DAG.

Mirrors official ``build_test_suite_dag``: task id ``test_suite_task``
and no raiseOnError — the official testSuite ``WorkflowConfig`` omits
it, so a failing suite never fails the task (profiler precedent). The
sourceConfig passes through and the database connection is derived
from the suite's table at parse time (translation); the task runs the
product ``TestSuiteWorkflow``, which pulls and executes the cases.
"""

from __future__ import annotations

from typing import Any

from smartmetadata_airflow_apis.workflows.common import build_dag
from smartmetadata_airflow_apis.workflows.registry import register_builder
from smartmetadata_airflow_apis.workflows.translation import translate_pipeline


@register_builder("TestSuite")
def build_test_suite_dag(pipeline: dict[str, Any]) -> Any:
    workflow_config = translate_pipeline(
        pipeline,
        workflow_type="TestSuite",
        raise_on_error=False,
    )
    return build_dag(
        "test_suite_task",
        pipeline,
        workflow_config.model_dump(mode="json"),
        raise_on_error=False,
    )
