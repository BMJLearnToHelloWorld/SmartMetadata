# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""The 109-key knob census, as a regression test (T-F5).

The census used to exist only as a one-off audit log. These tests
load the 17 openmetadata-spec pipeline schemas plus the UI schema
copies and assert the knob tables account for every key they declare,
so "0 unaccounted" stays true by construction: a schema that gains a
key fails the census until translation accounts for it. Expected key
lists are never hardcoded — every expectation is derived from the
schema files plus the knob tables themselves. The recount method: 108
distinct keys across the 17 spec schemas, plus exactly one UI-only key
carried as an object knob, for 109 total.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from smartmetadata_airflow_apis.workflows.translation import (
    _BOOL_KNOBS,
    _INT_KNOBS,
    _KNOWN_CONFIG_KEYS,
    _NULLABLE_INT_KNOBS,
    _NULLABLE_STR_KNOBS,
    _OBJECT_KNOBS,
    _PATTERN_KNOBS,
    _STR_KNOBS,
    ignored_source_switches,
)

# The five-type pipeline schemas: one metadata schema per service
# family, plus the database autoClassification/profiler/lineage/usage
# schemas and the messaging/storage autoClassification schemas.
_PIPELINE_SCHEMA_FILES: tuple[str, ...] = (
    "apiServiceMetadataPipeline.json",
    "dashboardServiceMetadataPipeline.json",
    "databaseServiceAutoClassificationPipeline.json",
    "databaseServiceMetadataPipeline.json",
    "databaseServiceProfilerPipeline.json",
    "databaseServiceQueryLineagePipeline.json",
    "databaseServiceQueryUsagePipeline.json",
    "driveServiceMetadataPipeline.json",
    "mcpServiceMetadataPipeline.json",
    "messagingServiceAutoClassificationPipeline.json",
    "messagingServiceMetadataPipeline.json",
    "mlmodelServiceMetadataPipeline.json",
    "pipelineServiceMetadataPipeline.json",
    "searchServiceMetadataPipeline.json",
    "securityServiceMetadataPipeline.json",
    "storageServiceAutoClassificationPipeline.json",
    "storageServiceMetadataPipeline.json",
)


def _repo_root() -> Path:
    for parent in Path(__file__).resolve().parents:
        spec_dir = (
            parent
            / "openmetadata-spec"
            / "src"
            / "main"
            / "resources"
            / "json"
            / "schema"
            / "metadataIngestion"
        )
        if spec_dir.is_dir():
            return parent
    raise AssertionError("openmetadata-spec schema tree not found above the test file")


def _schema_keys(path: Path) -> set[str]:
    """A pipeline schema's sourceConfig keys: its top-level properties."""
    return set(json.loads(path.read_text(encoding="utf-8"))["properties"])


def _load_census() -> tuple[set[str], set[str]]:
    root = _repo_root()
    spec_dir = (
        root
        / "openmetadata-spec"
        / "src"
        / "main"
        / "resources"
        / "json"
        / "schema"
        / "metadataIngestion"
    )
    ui_dir = root / "smartmetadata-ui" / "src" / "ingestion" / "schemas"
    assert ui_dir.is_dir(), f"UI schema copies not found at {ui_dir}"
    spec_keys: set[str] = set()
    ui_keys: set[str] = set()
    for name in _PIPELINE_SCHEMA_FILES:
        spec_path = spec_dir / name
        assert spec_path.is_file(), f"pipeline schema missing: {spec_path}"
        spec_keys |= _schema_keys(spec_path)
        ui_path = ui_dir / name
        if ui_path.is_file():
            ui_keys |= _schema_keys(ui_path)
    return spec_keys, ui_keys


_SPEC_KEYS, _UI_KEYS = _load_census()
_ALL_SCHEMA_KEYS = _SPEC_KEYS | _UI_KEYS


def _knob_table_keys() -> set[str]:
    return (
        {key for key, _, _ in _PATTERN_KNOBS}
        | {key for key, _, _ in _BOOL_KNOBS}
        | {key for key, _, _ in _INT_KNOBS}
        | {key for key, _ in _NULLABLE_INT_KNOBS}
        | {key for key, _, _ in _STR_KNOBS}
        | {key for key, _ in _NULLABLE_STR_KNOBS}
        | set(_OBJECT_KNOBS)
    )


def test_census_counts_reproduce() -> None:
    assert len(_PIPELINE_SCHEMA_FILES) == 17
    assert len(_SPEC_KEYS) == 108
    ui_only = _UI_KEYS - _SPEC_KEYS
    assert len(ui_only) == 1
    # The single UI-only key is carried as an object knob, so it is
    # accounted for by the knob tables, not by a special case.
    assert ui_only <= set(_OBJECT_KNOBS)
    assert len(_ALL_SCHEMA_KEYS) == 109


def test_every_schema_key_is_known() -> None:
    unaccounted = _ALL_SCHEMA_KEYS - _KNOWN_CONFIG_KEYS
    assert unaccounted == set()


def test_known_keys_beyond_schemas_are_legacy_ignored_switches() -> None:
    # Keys translation knows that no schema declares must be legacy
    # switches the deploy path still warns about — never phantom keys.
    for key in sorted(_KNOWN_CONFIG_KEYS - _ALL_SCHEMA_KEYS):
        pipeline: dict[str, Any] = {
            "pipelineType": "metadata",
            "service": {"type": "databaseService"},
            "sourceConfig": {"config": {key: True}},
        }
        assert key in ignored_source_switches(pipeline)


def test_knob_tables_carry_no_phantom_keys() -> None:
    phantom = _knob_table_keys() - _ALL_SCHEMA_KEYS
    assert phantom == set()


def test_ignored_switches_are_known_keys() -> None:
    pipeline: dict[str, Any] = {
        "pipelineType": "metadata",
        "service": {"type": "databaseService"},
        "sourceConfig": {
            "config": {
                "generateSampleData": True,
                "storeSampleData": True,
                "sampleDataQuery": "SELECT 1",
                "enableDataProfiler": True,
                "storageMetadataConfigSource": {"type": "s3"},
            }
        },
    }
    ignored = ignored_source_switches(pipeline)
    assert set(ignored) == set(pipeline["sourceConfig"]["config"])
    assert set(ignored) <= _KNOWN_CONFIG_KEYS
