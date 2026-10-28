# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

from __future__ import annotations

import logging

from smartmetadata_ingestion.client.rest import RestClient
from smartmetadata_ingestion.config import WorkflowConfig
from smartmetadata_ingestion.connectors.base import Source
from smartmetadata_ingestion.processors.identity import Processor
from smartmetadata_ingestion.progress import ProgressHook, RunReport
from smartmetadata_ingestion.sinks.metadata_rest import Sink
from smartmetadata_ingestion.workflow import MetadataWorkflow

logger = logging.getLogger(__name__)


def run_workflow(
    config: WorkflowConfig,
    *,
    client: RestClient | None = None,
    source: Source | None = None,
    sink: Sink | None = None,
    processors: list[Processor] | None = None,
    hook: ProgressHook | None = None,
) -> RunReport:
    """Run the metadata workflow through the canonical lifecycle."""
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
