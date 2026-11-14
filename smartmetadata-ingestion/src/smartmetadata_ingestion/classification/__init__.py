# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Clean-room autoClassification engine (design §5.2).

Fresh glue over Presidio + spaCy (both MIT) implementing the
behavioral spec: candidate resolution from the catalog, sample
preprocessing, recognizer construction, content and column-name
analysis, conflict resolution, column adaptation, the classification
engine, model selection/provisioning, and optimistic-lock patching.
Nothing here is ported from the CCL chain; the spec, the JSON
schemas, and the libraries' public APIs are the only sources.
ADR:2026-11-14-autoclassification-engine
"""

from __future__ import annotations

from smartmetadata_ingestion.classification.engine import (
    PII_CLASSIFICATION_FILTER,
    ClassificationEngine,
    ColumnFailure,
    ColumnTag,
    EntityClassification,
    resolve_store_sample_data,
)

__all__ = [
    "PII_CLASSIFICATION_FILTER",
    "ClassificationEngine",
    "ColumnFailure",
    "ColumnTag",
    "EntityClassification",
    "resolve_store_sample_data",
]
