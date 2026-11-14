# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Lineage workflow: the metadata workflow with a client-bound source.

The only difference from ``MetadataWorkflow`` is the client injection:
lineage sources bind parsed names against the catalog through REST,
but ``build_source`` passes no client, so the workflow hands its own
client to the source after preparation. Record handling — processors,
the sink, flush counting, configured-lineage specs, pipeline-status
writeback — is the shared base behavior, inherited unchanged.
"""

from __future__ import annotations

from smartmetadata_ingestion.lineage.source import LineageSource
from smartmetadata_ingestion.workflow import MetadataWorkflow


class LineageWorkflow(MetadataWorkflow):
    """Metadata workflow whose lineage source is bound to the run's
    REST client before producing."""

    def prepare(self) -> None:
        super().prepare()
        if isinstance(self._source, LineageSource):
            self._source.bind_client(self._client)

    def _collect_warnings(self) -> None:
        """Lineage warning counts (C-11/B-4): channel warnings,
        runner-skipped items, binding skips, and query-log engine
        failures, all on the source step — binding and channels run
        during produce. A non-lineage source has nothing to count."""
        if isinstance(self._source, LineageSource):
            self.source_status.warn(self._source.warning_count)
