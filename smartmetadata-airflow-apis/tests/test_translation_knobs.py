# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""translate_pipeline carries every per-type knob (capability batch 1, C-3).

Knobs are enumerated from the openmetadata-spec JSON schemas; each test
pins one type's knobs reaching the runner config typed, with the schema
defaults applied when the pipeline omits a key.
"""

from __future__ import annotations

from typing import Any

import pytest

from smartmetadata_airflow_apis.workflows.translation import (
    TranslationError,
    deploy_scope_problems,
    ignored_source_switches,
    reconcile_gate_for_source,
    translate_pipeline,
    translate_source_config_override,
)


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


def _translate(
    pipeline: dict[str, Any],
    workflow_type: str,
    connection: dict[str, Any] | None = None,
    service_type: str | None = None,
):
    connection = connection or {"type": "Mysql"}
    return translate_pipeline(
        pipeline,
        workflow_type=workflow_type,
        service_connection=(dict(connection), service_type or connection["type"]),
    )


def test_metadata_database_knobs_carried() -> None:
    config = _translate(
        _pipeline(
            "metadata",
            "databaseService",
            {
                "markDeletedTables": False,
                "markDeletedSchemas": True,
                "markDeletedDatabases": True,
                "includeTables": False,
                "includeTags": False,
                "includeDDL": True,
                "includeOwners": True,
                "includeStoredProcedures": False,
                "overrideMetadata": True,
                "useFqnForFiltering": True,
                "threads": 4,
                "queryLogDuration": 7,
                "queryParsingTimeoutLimit": 60,
                "extractJsonSchema": True,
                "jsonSchemaSampleSize": 100,
                "maxSchemaInferenceDepth": 3,
                "maxChildrenPerColumn": 20,
                "storedProcedureFilterPattern": {"includes": ["^sp_"]},
                "incremental": {"enabled": True, "lookbackDays": 3},
                "ownerConfig": {"default": "team-a"},
                "shardedTables": {"enabled": True},
            },
        ),
        "metadata",
    )
    source = config.source
    assert source.mark_deleted_tables is False
    assert source.mark_deleted_schemas is True
    assert source.mark_deleted_databases is True
    assert source.include_tables_enabled is False
    assert source.include_tags is False
    assert source.include_ddl is True
    assert source.include_owners is True
    assert source.include_stored_procedures_enabled is False
    assert source.override_metadata is True
    assert source.use_fqn_for_filtering is True
    assert source.threads == 4
    assert source.query_log_duration == 7
    assert source.query_parsing_timeout_limit == 60
    assert source.extract_json_schema is True
    assert source.json_schema_sample_size == 100
    assert source.max_schema_inference_depth == 3
    assert source.max_children_per_column == 20
    assert source.include_stored_procedures == ["^sp_"]
    assert source.incremental.enabled is True
    assert source.incremental.lookback_days == 3
    assert source.owner_config.default == "team-a"
    assert source.sharded_tables.enabled is True


def test_metadata_defaults_and_reconcile_split() -> None:
    # Schema defaults land on the source; workflow.reconcileStale
    # follows the family's effective deletion flags (D-C7): the pin
    # schema defaults markDeletedTables/markDeletedStoredProcedures to
    # true, so a config that sets only filter patterns reconciles.
    config = _translate(_pipeline("metadata", "databaseService"), "metadata")
    assert config.source.mark_deleted_tables is True
    assert config.workflow.reconcile_stale is True
    assert config.source.include_views is True


def test_reconcile_gate_needs_a_family_flag() -> None:
    # All four database flags false: no reconcile. Only schemas true:
    # the gate opens (the old markDeletedTables-only gate would not).
    config = _translate(
        _pipeline(
            "metadata",
            "databaseService",
            {
                "markDeletedTables": False,
                "markDeletedStoredProcedures": False,
                "markDeletedSchemas": False,
                "markDeletedDatabases": False,
            },
        ),
        "metadata",
    )
    assert config.workflow.reconcile_stale is False
    config = _translate(
        _pipeline(
            "metadata",
            "databaseService",
            {
                "markDeletedTables": False,
                "markDeletedStoredProcedures": False,
                "markDeletedSchemas": True,
                "markDeletedDatabases": False,
            },
        ),
        "metadata",
    )
    assert config.workflow.reconcile_stale is True


def test_reconcile_gate_scoped_to_service_family() -> None:
    # A messaging pipeline's gate follows markDeletedTopics only: the
    # database defaults must not open it.
    config = _translate(
        _pipeline("metadata", "messagingService", {"markDeletedTopics": False}),
        "metadata",
    )
    assert config.workflow.reconcile_stale is False
    config = _translate(_pipeline("metadata", "messagingService"), "metadata")
    assert config.workflow.reconcile_stale is True


def test_reconcile_gate_stays_shut_for_other_types() -> None:
    # Usage/lineage/profiler runs never reconcile, whatever the knob
    # defaults on the source say.
    for workflow_type in ("usage", "lineage", "profiler"):
        config = _translate(
            _pipeline(workflow_type, "databaseService"), workflow_type
        )
        assert config.workflow.reconcile_stale is False


def test_usage_knobs_carried_including_dead_knob() -> None:
    config = _translate(
        _pipeline(
            "usage",
            "databaseService",
            {
                "queryLogDuration": 3,
                "stageFileLocation": "/tmp/logs",
                "filterCondition": "x > 1",
                "resultLimit": 50,
                "queryLogFilePath": "/data/logs.csv",
                "processQueryCostAnalysis": False,
            },
        ),
        "usage",
    )
    source = config.source
    assert source.type == "mysql-usage"
    assert source.query_log_duration == 3
    assert source.stage_file_location == "/tmp/logs"
    assert source.filter_condition == "x > 1"
    assert source.result_limit == 50
    assert source.query_log_file_path == "/data/logs.csv"
    assert source.process_query_cost_analysis is False
    absent = _translate(_pipeline("usage", "databaseService"), "usage")
    assert absent.source.process_query_cost_analysis is True
    assert absent.source.query_parser_config is None


def test_lineage_knobs_carried() -> None:
    config = _translate(
        _pipeline(
            "lineage",
            "databaseService",
            {
                "queryLogDuration": 2,
                "resultLimit": 10,
                "parsingTimeoutLimit": 45,
                "queryParserConfig": {"type": "SqlGlot"},
                "filterCondition": "y = 2",
                "queryLogFilePath": "/data/q.csv",
                "overrideViewLineage": True,
                "processViewLineage": False,
                "processQueryLineage": False,
                "processStoredProcedureLineage": False,
                "threads": 8,
                "processCrossDatabaseLineage": True,
                "crossDatabaseServiceNames": ["other"],
                "enableTempTableLineage": True,
                "incrementalLineageProcessing": False,
                "storedProcedureFilterPattern": {"excludes": ["tmp"]},
            },
        ),
        "lineage",
    )
    source = config.source
    assert source.type == "mysql-lineage"
    assert source.query_log_duration == 2
    assert source.result_limit == 10
    assert source.parsing_timeout_limit == 45
    assert source.query_parser_config.type == "SqlGlot"
    assert source.filter_condition == "y = 2"
    assert source.query_log_file_path == "/data/q.csv"
    assert source.override_view_lineage is True
    assert source.process_view_lineage is False
    assert source.process_query_lineage is False
    assert source.process_stored_procedure_lineage is False
    assert source.threads == 8
    assert source.process_cross_database_lineage is True
    assert source.cross_database_service_names == ["other"]
    assert source.enable_temp_table_lineage is True
    assert source.incremental_lineage_processing is False
    assert source.exclude_stored_procedures == ["tmp"]


def test_profiler_knobs_and_schema_defaults() -> None:
    config = _translate(
        _pipeline(
            "profiler",
            "databaseService",
            {
                "computeTableMetrics": False,
                "computeColumnMetrics": False,
                "useStatistics": True,
                "enableAutoPartitionDetection": False,
                "randomizedSample": True,
                "threadCount": 3,
                "timeoutSeconds": 60,
                "metrics": ["mean", "rowCount"],
                "classificationFilterPattern": {"includes": ["PII"]},
                "profileSampleConfig": {
                    "sampleConfigType": "STATIC",
                    "config": {"profileSample": 10, "profileSampleType": "PERCENTAGE"},
                },
                "processingEngine": {"type": "Native"},
            },
        ),
        "profiler",
    )
    source = config.source
    # The profiler schema defaults includeViews to false, unlike metadata.
    assert source.include_views is False
    assert source.compute_table_metrics is False
    assert source.compute_column_metrics is False
    assert source.use_statistics is True
    assert source.enable_auto_partition_detection is False
    assert source.randomized_sample is True
    assert source.thread_count == 3
    assert source.timeout_seconds == 60
    assert source.metrics == ["mean", "rowCount"]
    assert source.include_classifications == ["PII"]
    assert source.profile_sample_config.sample_config_type == "STATIC"
    assert source.profile_sample_config.config.profile_sample == 10
    assert source.processing_engine.type == "Native"

    absent = _translate(_pipeline("profiler", "databaseService"), "profiler")
    assert absent.source.thread_count is None
    assert absent.source.timeout_seconds == 43200
    assert len(absent.source.metrics) == 20
    assert absent.source.profile_sample_config is None
    explicit = _translate(
        _pipeline("profiler", "databaseService", {"includeViews": True}),
        "profiler",
    )
    assert explicit.source.include_views is True


def test_profiler_empty_metrics_list_means_all() -> None:
    # An explicitly empty list is not replaced by the schema default: it
    # means "compute all metrics".
    config = _translate(
        _pipeline("profiler", "databaseService", {"metrics": []}),
        "profiler",
    )
    assert config.source.metrics == []


def test_auto_classification_database_knobs() -> None:
    config = _translate(
        _pipeline(
            "autoClassification",
            "databaseService",
            {
                "confidence": 90,
                "enableAutoClassification": False,
                "classificationLanguage": "any",
                "sampleDataCount": 100,
                "storeSampleData": True,
                "classificationFilterPattern": {"includes": ["PII"]},
                "useFqnForFiltering": True,
            },
        ),
        "autoClassification",
    )
    source = config.source
    assert source.confidence == 90
    assert source.enable_auto_classification is False
    assert source.classification_language == "any"
    assert source.sample_data_count == 100
    assert source.store_sample_data is True
    assert source.include_classifications == ["PII"]
    assert source.use_fqn_for_filtering is True
    assert source.messaging_metadata is None


def test_auto_classification_messaging_and_storage_patterns() -> None:
    messaging = _translate(
        _pipeline(
            "autoClassification",
            "messagingService",
            {
                "topicFilterPattern": {"includes": ["events"]},
                "storeSampleData": True,
            },
        ),
        "autoClassification",
        connection={"type": "Kafka", "bootstrapServers": "broker:9092"},
        service_type="Kafka",
    )
    # On a messaging service the AC storeSampleData still travels as the
    # AC knob, not as the messaging-metadata sampling block.
    assert messaging.source.include_topics == ["events"]
    assert messaging.source.store_sample_data is True
    assert messaging.source.messaging_metadata is None

    storage = _translate(
        _pipeline(
            "autoClassification",
            "storageService",
            {
                "bucketFilterPattern": {"includes": ["raw"]},
                "containerFilterPattern": {"excludes": ["tmp"]},
            },
        ),
        "autoClassification",
        connection={"type": "S3"},
        service_type="S3",
    )
    assert storage.source.include_buckets == ["raw"]
    assert storage.source.exclude_containers == ["tmp"]


def test_per_service_metadata_defaults() -> None:
    pipeline = _translate(_pipeline("metadata", "pipelineService"), "metadata")
    assert pipeline.source.include_owners is True
    storage = _translate(_pipeline("metadata", "storageService"), "metadata")
    assert storage.source.include_tags is False
    explicit = _translate(
        _pipeline("metadata", "storageService", {"includeTags": True}),
        "metadata",
    )
    assert explicit.source.include_tags is True


def test_other_metadata_variants_carry_their_knobs() -> None:
    config = _translate(
        _pipeline(
            "metadata",
            "dashboardService",
            {
                "dashboardFilterPattern": {"includes": ["sales"]},
                "chartFilterPattern": {"excludes": ["draft"]},
                "dataModelFilterPattern": {"includes": ["dm"]},
                "projectFilterPattern": {"includes": ["p1"]},
                "markDeletedDashboards": False,
                "includeDataModels": False,
                "includeMetrics": True,
                "includeDraftDashboard": False,
                "includeUsage": False,
                "overrideLineage": True,
                "queryParserConfig": {"type": "SqlFluff"},
                "lineageInformation": {"dbServicePrefixes": ["svc.db"]},
            },
        ),
        "metadata",
        connection={"type": "Superset"},
        service_type="Superset",
    )
    source = config.source
    assert source.include_dashboards == ["sales"]
    assert source.exclude_charts == ["draft"]
    assert source.include_data_models == ["dm"]
    assert source.include_projects == ["p1"]
    assert source.mark_deleted_dashboards is False
    assert source.include_data_models_enabled is False
    assert source.include_metrics is True
    assert source.include_draft_dashboard is False
    assert source.include_usage is False
    assert source.override_lineage is True
    assert source.query_parser_config.type == "SqlFluff"
    assert source.lineage_information.db_service_prefixes == ["svc.db"]


def test_ignored_switches_are_type_aware() -> None:
    ac = _pipeline(
        "autoClassification", "databaseService", {"storeSampleData": True}
    )
    assert ignored_source_switches(ac) == []
    assert ignored_source_switches(ac, workflow_type="autoClassification") == []
    storage = _pipeline(
        "metadata",
        "storageService",
        {"storageMetadataConfigSource": {"manifestFilePath": "/tmp/m.json"}},
    )
    assert ignored_source_switches(storage) == ["storageMetadataConfigSource"]


def test_storage_manifest_source_warns_and_drops(caplog) -> None:
    with caplog.at_level("WARNING"):
        config = _translate(
            _pipeline(
                "metadata",
                "storageService",
                {"storageMetadataConfigSource": {"manifestFilePath": "/tmp/m.json"}},
            ),
            "metadata",
            connection={"type": "S3"},
            service_type="S3",
        )
    assert config.source.type == "s3"
    assert "storageMetadataConfigSource is not supported" in caplog.text


def test_unknown_key_warns_but_does_not_fail(caplog) -> None:
    with caplog.at_level("WARNING"):
        config = _translate(
            _pipeline("metadata", "databaseService", {"includeTablse": True}),
            "metadata",
        )
    assert config.source.include_tables_enabled is True
    assert "unknown sourceConfig key 'includeTablse'" in caplog.text


def test_malformed_knob_fails_loudly() -> None:
    with pytest.raises(TranslationError):
        _translate(
            _pipeline(
                "lineage", "databaseService", {"queryParserConfig": {"type": "Bogus"}}
            ),
            "lineage",
        )
    with pytest.raises(TranslationError):
        _translate(
            _pipeline("autoClassification", "databaseService", {"confidence": 150}),
            "autoClassification",
        )
    with pytest.raises(TranslationError):
        _translate(
            _pipeline(
                "metadata",
                "databaseService",
                {"containerFilterPattern": "raw.*"},
            ),
            "metadata",
        )


def test_deploy_scope_problems_cover_all_pattern_levels() -> None:
    problems = deploy_scope_problems(
        {"config": {"containerFilterPattern": "raw.*", "topicFilterPattern": {"includes": "x"}}}
    )
    assert problems == [
        "sourceConfig.config.topicFilterPattern",
        "sourceConfig.config.containerFilterPattern",
    ]
    assert deploy_scope_problems({"config": {"bucketFilterPattern": {"includes": ["b"]}}}) == []


# --- trigger-time sourceConfigOverride translation (C-7/C-8) -------------


def test_override_translation_honors_scoper_keys() -> None:
    # The keys the server's TableFilterScoper + MetadataScoper emit for
    # a run scoped to one table: patterns, FQN filtering, inclusion
    # toggles, and all four deletion flags.
    updates, ignored = translate_source_config_override(
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
        }
    )
    assert ignored == []
    assert updates["useFqnForFiltering"] is True
    assert updates["includeDatabases"] == ["^svc\\.db$"]
    assert updates["includeSchemas"] == ["^svc\\.db\\.public$"]
    assert updates["includeTables"] == ["^svc\\.db\\.public\\.orders$"]
    assert updates["includeViews"] is True
    assert updates["markDeletedTables"] is False
    assert updates["markDeletedSchemas"] is False
    assert updates["markDeletedDatabases"] is False
    assert updates["markDeletedStoredProcedures"] is False
    assert updates["includeStoredProceduresEnabled"] is False
    assert updates["includeTablesEnabled"] is True


def test_override_translation_ignores_unowned_keys() -> None:
    updates, ignored = translate_source_config_override(
        {
            "type": "DatabaseMetadata",
            "generateSampleData": True,
            "testCases": ["case-a"],
            "threads": 4,
        }
    )
    assert updates == {"threads": 4}
    assert ignored == ["type", "generateSampleData", "testCases"]


def test_override_translation_rejects_malformed_patterns() -> None:
    with pytest.raises(TranslationError):
        translate_source_config_override({"tableFilterPattern": "orders.*"})


def test_reconcile_gate_for_source_reads_either_spelling() -> None:
    # Builder dumps spell flags snake_case; raw translation spells them
    # camelCase; an override may add camelCase beside dumped snake_case.
    assert reconcile_gate_for_source(
        {"mark_deleted_tables": False, "mark_deleted_stored_procedures": False},
        "databaseService",
    ) is False
    assert reconcile_gate_for_source(
        {"markDeletedTables": False, "markDeletedStoredProcedures": True},
        "databaseService",
    ) is True
    assert reconcile_gate_for_source(
        {
            "mark_deleted_tables": True,
            "markDeletedTables": False,
            "mark_deleted_stored_procedures": False,
        },
        "databaseService",
    ) is False
    # Another family's flag does not open the database gate when the
    # database flags are explicitly false; missing keys fall back to
    # the schema defaults (tables/procedures true).
    assert reconcile_gate_for_source(
        {
            "markDeletedTables": False,
            "markDeletedStoredProcedures": False,
            "markDeletedSchemas": False,
            "markDeletedDatabases": False,
            "markDeletedTopics": True,
        },
        "databaseService",
    ) is False
    assert reconcile_gate_for_source({}, "databaseService") is True
    assert reconcile_gate_for_source(
        {"markDeletedTopics": False}, "messagingService"
    ) is False
