# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Runnable profiler / data-quality / data-diff jobs.

Each job holds its workflow config and runs it through the canonical
``run_workflow`` dispatch (``profiler`` / ``TestSuite`` / ``data_diff``), so
the job is the same execution the CLI performs — not a stub.
"""

from __future__ import annotations

from typing import Any, Protocol

from smartmetadata_ingestion.client.rest import RestClient
from smartmetadata_ingestion.config import WorkflowConfig
from smartmetadata_ingestion.connectors.base import Source
from smartmetadata_ingestion.progress import RunReport
from smartmetadata_ingestion.runner import run_workflow
from smartmetadata_ingestion.sinks.metadata_rest import Sink


class JobRunner(Protocol):
    kind: str

    def run(self) -> RunReport: ...


class ProfilerJob:
    kind = "profiler"

    def __init__(
        self,
        config: WorkflowConfig,
        *,
        client: RestClient | None = None,
        source: Source | None = None,
        sink: Sink | None = None,
        profile_reader: Any | None = None,
    ) -> None:
        self._config = config
        self._client = client
        self._source = source
        self._sink = sink
        self._profile_reader = profile_reader

    def run(self) -> RunReport:
        config = self._config.model_copy(
            update={"workflow": self._config.workflow.model_copy(update={"type": "profiler"})}
        )
        return run_workflow(
            config,
            client=self._client,
            source=self._source,
            sink=self._sink,
            profile_reader=self._profile_reader,
        )


class QualityJob:
    kind = "quality"

    def __init__(
        self,
        config: WorkflowConfig,
        *,
        client: RestClient | None = None,
        source: Source | None = None,
        sink: Sink | None = None,
        execute: Any | None = None,
    ) -> None:
        self._config = config
        self._client = client
        self._source = source
        self._sink = sink
        self._execute = execute

    def run(self) -> RunReport:
        config = self._config.model_copy(
            update={"workflow": self._config.workflow.model_copy(update={"type": "TestSuite"})}
        )
        return run_workflow(
            config,
            client=self._client,
            source=self._source,
            sink=self._sink,
            execute=self._execute,
        )


class DataDiffJob:
    kind = "data_diff"

    def __init__(
        self,
        config: WorkflowConfig,
        *,
        client: RestClient | None = None,
        source: Source | None = None,
        sink: Sink | None = None,
        fetch_keys: Any | None = None,
    ) -> None:
        self._config = config
        self._client = client
        self._source = source
        self._sink = sink
        self._fetch_keys = fetch_keys

    def run(self) -> RunReport:
        config = self._config.model_copy(
            update={"workflow": self._config.workflow.model_copy(update={"type": "data_diff"})}
        )
        return run_workflow(
            config,
            client=self._client,
            source=self._source,
            sink=self._sink,
            fetch_keys=self._fetch_keys,
        )
