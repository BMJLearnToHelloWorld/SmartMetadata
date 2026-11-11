# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

from __future__ import annotations

import logging
from typing import Any

from smartmetadata_ingestion.client.rest import RestClient
from smartmetadata_ingestion.config import WorkflowConfig
from smartmetadata_ingestion.connectors.base import Source
from smartmetadata_ingestion.errors import WorkflowExecutionError
from smartmetadata_ingestion.processors.identity import Processor
from smartmetadata_ingestion.progress import ProgressHook, RunReport
from smartmetadata_ingestion.sinks.metadata_rest import Sink
from smartmetadata_ingestion.workflow import (
    DataDiffWorkflow,
    MetadataWorkflow,
    ProfilerWorkflow,
    TestSuiteWorkflow,
)

logger = logging.getLogger(__name__)


def run_workflow(
    config: WorkflowConfig,
    *,
    client: RestClient | None = None,
    source: Source | None = None,
    sink: Sink | None = None,
    processors: list[Processor] | None = None,
    hook: ProgressHook | None = None,
    profile_reader: Any | None = None,
    execute: Any | None = None,
    fetch_keys: Any | None = None,
    fetch_rows: Any | None = None,
    run_id: str | None = None,
) -> RunReport:
    """Run the workflow for ``config.workflow.type`` through the canonical lifecycle.

    ``profiler``, ``TestSuite`` and ``data_diff`` dispatch to their own
    workflows; every other type keeps the metadata workflow — except
    ``dbt``, ``autoClassification``, ``elasticSearchReindex`` and
    ``application``, which have no runner yet and raise instead of
    silently running a metadata ingestion (P-06; see the ADR).

    ``run_id`` pins the id the workflow reports its status under (the
    Airflow plugin passes the id the server already recorded for the run);
    unset, the workflow mints a UUID as before.
    """
    workflow_type = config.workflow.type
    if workflow_type in (
        "dbt",
        "autoClassification",
        "elasticSearchReindex",
        "application",
    ):
        # No runner implements these types yet (P-06). The builders deploy
        # and the DAG imports, but the run must fail loudly with a
        # diagnostic instead of succeeding as a metadata ingestion — the
        # fake-success class this round exists to eliminate.
        # (ADR:2026-11-11-pipeline-deep-dive-python)
        raise WorkflowExecutionError(
            f"no runner implemented for pipeline type {workflow_type!r}; "
            "dbt / autoClassification / elasticSearchReindex / application "
            "runners are future work"
        )
    if workflow_type == "profiler":
        workflow: MetadataWorkflow = ProfilerWorkflow(
            config,
            client=client,
            source=source,
            sink=sink,
            processors=processors,
            hook=hook,
            profile_reader=profile_reader,
            run_id=run_id,
        )
    elif workflow_type == "TestSuite":
        workflow = TestSuiteWorkflow(
            config,
            client=client,
            source=source,
            sink=sink,
            processors=processors,
            hook=hook,
            execute=execute,
            fetch_keys=fetch_keys,
            fetch_rows=fetch_rows,
            run_id=run_id,
        )
    elif workflow_type == "data_diff":
        workflow = DataDiffWorkflow(
            config,
            client=client,
            source=source,
            sink=sink,
            processors=processors,
            hook=hook,
            fetch_keys=fetch_keys,
            fetch_rows=fetch_rows,
            run_id=run_id,
        )
    else:
        workflow = MetadataWorkflow(
            config,
            client=client,
            source=source,
            sink=sink,
            processors=processors,
            hook=hook,
            run_id=run_id,
        )
    try:
        report = workflow.execute()
    except BaseException:
        try:
            workflow.stop()
        except Exception as cleanup_error:
            logger.warning("Workflow cleanup failed after execution failure: %s", cleanup_error)
        raise
    workflow.stop()
    return report
