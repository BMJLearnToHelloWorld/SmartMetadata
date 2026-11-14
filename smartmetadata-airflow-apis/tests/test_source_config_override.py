# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Trigger-time sourceConfigOverride application (C-7/C-8).

The override narrows one run through the same knob tables as deploy
time; the reconcile gate is recomputed when the override carries
deletion flags, so a scoped run never reconciles.
"""

from __future__ import annotations

import logging
from typing import Any

import pytest
from smartmetadata_airflow_apis.workflows.common import _apply_source_config_override
from smartmetadata_airflow_apis.workflows.translation import translate_pipeline
from smartmetadata_ingestion.config import WorkflowConfig


def _pipeline(
    workflow_type: str,
    service_type: str,
    config: dict[str, Any] | None = None,
) -> dict[str, Any]:
    return {
        "name": f"svc_{workflow_type}",
        "fullyQualifiedName": f"svc.{workflow_type}",
        "pipelineType": workflow_type,
        "service": {"type": service_type, "name": "svc"},
        "sourceConfig": {"config": config or {}},
        "openMetadataServerConnection": {
            "hostPort": "http://127.0.0.1:8585/api",
            "securityConfig": {"jwtToken": "test-jwt"},
        },
        "airflowConfig": {},
    }


def _baked_dump(**dump_kwargs: Any) -> dict[str, Any]:
    """A builder-shaped baked config: translate, then model_dump."""
    translated = translate_pipeline(
        _pipeline("metadata", "databaseService"),
        workflow_type="metadata",
        service_connection=({"type": "Mysql"}, "Mysql"),
    )
    return translated.model_dump(mode="json", **dump_kwargs)


_SCOPED_OVERRIDE: dict[str, Any] = {
    "useFqnForFiltering": True,
    "databaseFilterPattern": {"includes": ["^svc\\.db$"]},
    "schemaFilterPattern": {"includes": ["^svc\\.db\\.public$"]},
    "tableFilterPattern": {"includes": ["^svc\\.db\\.public\\.orders$"]},
    "includeViews": True,
    "markDeletedTables": False,
    "markDeletedSchemas": False,
    "markDeletedDatabases": False,
    "markDeletedStoredProcedures": False,
    "includeStoredProcedures": False,
    "includeTables": True,
}


def test_scoped_override_merged_config_validates() -> None:
    # The merged dict must validate: builders dump snake_case while
    # overrides arrive camelCase, and a duplicated spelling used to
    # crash scoped runs at WorkflowConfig validation before they ran.
    merged = _apply_source_config_override(_baked_dump(), _SCOPED_OVERRIDE)
    assert "mark_deleted_tables" not in merged["source"]
    assert "reconcile_stale" not in merged["workflow"]
    validated = WorkflowConfig.model_validate(merged)
    assert validated.source.mark_deleted_tables is False
    assert validated.source.mark_deleted_schemas is False
    assert validated.source.mark_deleted_databases is False
    assert validated.source.mark_deleted_stored_procedures is False
    assert validated.source.include_databases == ["^svc\\.db$"]
    assert validated.source.include_schemas == ["^svc\\.db\\.public$"]
    assert validated.source.include_tables == ["^svc\\.db\\.public\\.orders$"]
    assert validated.source.use_fqn_for_filtering is True
    assert validated.source.include_stored_procedures_enabled is False
    assert validated.source.include_tables_enabled is True
    assert validated.workflow.reconcile_stale is False


def test_filter_only_override_merged_config_validates() -> None:
    merged = _apply_source_config_override(
        _baked_dump(),
        {"tableFilterPattern": {"includes": ["^svc\\.db\\.public\\.orders$"]}},
    )
    assert "include_tables" not in merged["source"]
    validated = WorkflowConfig.model_validate(merged)
    assert validated.source.include_tables == ["^svc\\.db\\.public\\.orders$"]
    # No deletion flags in the override: the gate is not recomputed
    # and stays open from the deploy-time defaults.
    assert validated.workflow.reconcile_stale is True


def test_scoped_override_validates_for_camel_spelled_baked_config() -> None:
    # The raw translation spells keys camelCase; the merge must keep
    # a single spelling for that input shape too.
    merged = _apply_source_config_override(
        _baked_dump(by_alias=True), _SCOPED_OVERRIDE
    )
    assert "reconcile_stale" not in merged["workflow"]
    validated = WorkflowConfig.model_validate(merged)
    assert validated.source.mark_deleted_tables is False
    assert validated.source.include_tables == ["^svc\\.db\\.public\\.orders$"]
    assert validated.workflow.reconcile_stale is False


def test_sampling_flags_stay_warned_and_ignored_in_override(
    caplog: pytest.LogCaptureFixture,
) -> None:
    # Parent decision: the override path does not honor the sampling
    # flags (deploy time does); they stay warned-and-ignored here.
    with caplog.at_level(
        logging.WARNING, logger="smartmetadata_airflow_apis.workflows.common"
    ):
        merged = _apply_source_config_override(
            _baked_dump(),
            {"storeSampleData": True, "generateSampleData": True},
        )
    warnings = [record.message for record in caplog.records]
    assert "ignoring sourceConfigOverride key storeSampleData" in warnings
    assert "ignoring sourceConfigOverride key generateSampleData" in warnings
    validated = WorkflowConfig.model_validate(merged)
    assert validated.source.store_sample_data is False
    assert validated.source.messaging_metadata is None


def _baked_config(**source_overrides: Any) -> dict[str, Any]:
    source: dict[str, Any] = {
        "type": "mysql",
        "serviceName": "svc",
        "mark_deleted_tables": True,
        "mark_deleted_stored_procedures": True,
        "mark_deleted_schemas": False,
        "mark_deleted_databases": False,
    }
    source.update(source_overrides)
    return {
        "workflow": {
            "name": "svc_metadata",
            "type": "metadata",
            "reconcile_stale": True,
        },
        "source": source,
    }


def test_scoped_run_override_closes_reconcile_gate() -> None:
    # The server's MetadataScoper override for a one-table run: all
    # four deletion flags false, procedures excluded, FQN filtering on.
    result = _apply_source_config_override(
        _baked_config(),
        {
            "useFqnForFiltering": True,
            "databaseFilterPattern": {"includes": ["^svc\\.db$"]},
            "schemaFilterPattern": {"includes": ["^svc\\.db\\.public$"]},
            "tableFilterPattern": {"includes": ["^svc\\.db\\.public\\.orders$"]},
            "includeViews": True,
            "markDeletedTables": False,
            "markDeletedSchemas": False,
            "markDeletedDatabases": False,
            "markDeletedStoredProcedures": False,
            "includeStoredProcedures": False,
            "includeTables": True,
        },
    )
    assert result["workflow"]["reconcileStale"] is False
    assert result["source"]["markDeletedTables"] is False
    assert result["source"]["markDeletedStoredProcedures"] is False
    assert result["source"]["includeTables"] == ["^svc\\.db\\.public\\.orders$"]
    assert result["source"]["useFqnForFiltering"] is True
    assert result["source"]["includeStoredProceduresEnabled"] is False
    assert result["source"]["includeTablesEnabled"] is True


def test_partial_deletion_override_keeps_gate_open() -> None:
    # Disabling only table deletion leaves procedure deletion (true at
    # deploy) in force: the gate stays open, per-kind flags decide.
    result = _apply_source_config_override(
        _baked_config(), {"markDeletedTables": False}
    )
    assert result["workflow"]["reconcileStale"] is True
    assert result["source"]["markDeletedTables"] is False


def test_filter_only_override_leaves_gate_untouched() -> None:
    # A filter-only override (the profiler's TableFilterScoper shape)
    # must not recompute the gate: profiler runs never reconcile.
    config = _baked_config()
    config["workflow"]["type"] = "profiler"
    config["workflow"]["reconcile_stale"] = False
    result = _apply_source_config_override(
        config,
        {"tableFilterPattern": {"includes": ["^svc\\.db\\.public\\.orders$"]}},
    )
    assert result["workflow"]["reconcile_stale"] is False
    assert "reconcileStale" not in result["workflow"]
    assert result["source"]["includeTables"] == ["^svc\\.db\\.public\\.orders$"]
