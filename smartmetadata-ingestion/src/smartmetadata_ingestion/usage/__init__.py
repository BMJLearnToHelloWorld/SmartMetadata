# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Usage chain: query-log reading, parsing, staging, and server writes.

Clean-room reimplementation of the usage workflow steps from the
behavioral spec (design-sql-parsing §3.3–§3.6), composed inside the
fork's ``MetadataWorkflow`` architecture — no ported step framework.
"""

from __future__ import annotations

from smartmetadata_ingestion.usage.query_log import (
    QueryLogSource,
    QueryLogSpec,
    get_query_log_spec,
    load_query_log_specs,
    query_window,
    register_query_log_spec,
    registered_query_log_engines,
)

__all__ = [
    "QueryLogSource",
    "QueryLogSpec",
    "get_query_log_spec",
    "load_query_log_specs",
    "query_window",
    "register_query_log_spec",
    "registered_query_log_engines",
]
