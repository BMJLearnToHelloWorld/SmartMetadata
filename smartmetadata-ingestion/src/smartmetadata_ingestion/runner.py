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
from smartmetadata_ingestion.processors.identity import Processor
from smartmetadata_ingestion.progress import ProgressHook, RunReport
from smartmetadata_ingestion.sinks.metadata_rest import Sink
from smartmetadata_ingestion.workflow import (
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
) -> RunReport:
    """Run the workflow for ``config.workflow.type`` through the canonical lifecycle.

    ``profiler`` and ``TestSuite`` dispatch to their own workflows; every other
    type keeps the metadata workflow.
    """
    workflow_type = config.workflow.type
    if workflow_type == "profiler":
        workflow: MetadataWorkflow = ProfilerWorkflow(
            config,
            client=client,
            source=source,
            sink=sink,
            processors=processors,
            hook=hook,
            profile_reader=profile_reader,
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
        )
    else:
        workflow = MetadataWorkflow(
            config,
            client=client,
            source=source,
            sink=sink,
            processors=processors,
            hook=hook,
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
