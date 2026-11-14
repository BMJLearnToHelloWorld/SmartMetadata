# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Fresh spec tests for AutoClassificationWorkflow (design §2.1–2.3)."""

from __future__ import annotations

from collections.abc import Iterator
from typing import Any

import pytest

from smartmetadata_ingestion.classification.engine import (
    ColumnFailure,
    ColumnTag,
    EntityClassification,
)
from smartmetadata_ingestion.config import WorkflowConfig
from smartmetadata_ingestion.errors import (
    RestError,
    WorkflowExecutionError,
    WorkflowInitializationError,
)
from smartmetadata_ingestion.workflow import (
    AutoClassificationWorkflow,
    _database_sample_adapter,
    _EntitySample,
    _messaging_sample_adapter,
    _storage_sample_adapter,
)


def _config(source_type: str = "mysql", **source: Any) -> WorkflowConfig:
    payload: dict[str, Any] = {
        "type": source_type,
        "serviceName": "svc",
        "connection": {},
    }
    payload.update(source)
    return WorkflowConfig.model_validate(
        {
            "source": payload,
            "workflow": {"type": "autoClassification", "name": "svc-ac"},
            "server": {
                "hostPort": "http://localhost:8585/api",
                "auth": {"type": "jwt", "jwtToken": "test"},
            },
        }
    )


def _table(
    fqn: str = "svc.db.sc.users",
    columns: list[dict[str, Any]] | None = None,
    **extra: Any,
) -> dict[str, Any]:
    entity: dict[str, Any] = {
        "id": f"id-{fqn}",
        "name": fqn.split(".")[-1],
        "fullyQualifiedName": fqn,
        "tableType": "Regular",
        "columns": columns if columns is not None else [{"name": "email", "tags": []}],
        "tags": [],
        "version": 0.1,
    }
    entity.update(extra)
    return entity


class _FakeClient:
    def __init__(self, entities: list[dict[str, Any]], *, services: set[str] | None = None) -> None:
        self._entities = entities
        self.services = {"svc"} if services is None else set(services)
        self.service_calls: list[tuple[str, str]] = []
        self.list_calls: list[tuple[str, dict[str, Any]]] = []
        self.patch_calls: list[tuple[str, Any, Any]] = []
        self.stored: list[tuple[str, str, dict[str, Any]]] = []
        self.statuses: list[dict[str, Any]] = []
        self.patch_outcomes: list[Any] = []
        self.store_error: Exception | None = None

    def _service(self, category: str, name: str) -> dict[str, Any]:
        self.service_calls.append((category, name))
        if name not in self.services:
            raise RestError(
                f"GET /v1/services/{category}Services/name/{name} "
                "failed with HTTP 404: service not found",
                status_code=404,
            )
        return {"id": f"svc-{name}", "name": name}

    def get_database_service_by_name(self, name: str) -> dict[str, Any]:
        return self._service("database", name)

    def get_messaging_service_by_name(self, name: str) -> dict[str, Any]:
        return self._service("messaging", name)

    def get_storage_service_by_name(self, name: str) -> dict[str, Any]:
        return self._service("storage", name)

    def iter_collection(
        self, path: str, *, limit: int = 100, extra_params: dict[str, Any] | None = None
    ) -> Any:
        self.list_calls.append((path, dict(extra_params or {})))
        return iter(self._entities)

    def _by_name(self, fqn: str, fields: str | None = None) -> dict[str, Any] | None:
        for entity in self._entities:
            if entity["fullyQualifiedName"] == fqn:
                return entity
        return None

    def get_table_by_name(self, fqn: str, fields: str | None = None) -> dict[str, Any] | None:
        return self._by_name(fqn, fields)

    def get_container_by_name(self, fqn: str, fields: str | None = None) -> dict[str, Any] | None:
        return self._by_name(fqn, fields)

    def get_topic_by_name(self, fqn: str, fields: str | None = None) -> dict[str, Any] | None:
        return self._by_name(fqn, fields)

    def patch(self, path: str, *, json: Any = None, headers: dict[str, str] | None = None) -> Any:
        self.patch_calls.append((path, json, headers))
        if self.patch_outcomes:
            outcome = self.patch_outcomes.pop(0)
            if isinstance(outcome, Exception):
                raise outcome
            return outcome
        return {"patched": True}

    def ingest_table_sample_data(self, entity_id: str, payload: dict) -> Any:
        if self.store_error is not None:
            raise self.store_error
        self.stored.append(("table", entity_id, payload))
        return {}

    def ingest_container_sample_data(self, entity_id: str, payload: dict) -> Any:
        if self.store_error is not None:
            raise self.store_error
        self.stored.append(("container", entity_id, payload))
        return {}

    def ingest_topic_sample_data(self, entity_id: str, payload: dict) -> Any:
        if self.store_error is not None:
            raise self.store_error
        self.stored.append(("topic", entity_id, payload))
        return {}

    def get_profiler_config_settings(self) -> None:
        return None

    def add_pipeline_status(self, fqn: str, payload: dict[str, Any]) -> Any:
        self.statuses.append(payload)
        return {}

    def close(self) -> None:
        pass


class _StubEngine:
    def __init__(
        self,
        *,
        tags: dict[str, list[ColumnTag]] | None = None,
        failures: dict[str, list[ColumnFailure]] | None = None,
        warm_error: Exception | None = None,
    ) -> None:
        self._tags = tags or {}
        self._failures = failures or {}
        self._warm_error = warm_error
        self.warmed = False
        self.classified: list[tuple[str, str, Any]] = []

    def warm_up(self) -> None:
        self.warmed = True
        if self._warm_error is not None:
            raise self._warm_error

    def classify_entity(
        self, entity: dict[str, Any], entity_type: str, rows: Any
    ) -> EntityClassification:
        fqn = str(entity.get("fullyQualifiedName") or "")
        self.classified.append((fqn, entity_type, rows))
        return EntityClassification(
            column_tags=list(self._tags.get(fqn, [])),
            failures=list(self._failures.get(fqn, [])),
        )


def _sample(rows: list[dict[str, Any]] | None = None) -> _EntitySample:
    return _EntitySample(rows=rows if rows is not None else [{"email": "a@b.com"}], messages=None)


def _run(
    config: WorkflowConfig,
    client: _FakeClient,
    *,
    sample_entity: Any = None,
    engine: Any = None,
) -> tuple[AutoClassificationWorkflow, Any]:
    workflow = AutoClassificationWorkflow(
        config, client=client, sample_entity=sample_entity, engine=engine
    )
    report = workflow.execute()
    return workflow, report


def test_full_run_samples_classifies_stores_and_patches() -> None:
    client = _FakeClient([_table()])
    engine = _StubEngine(
        tags={
            "svc.db.sc.users": [
                ColumnTag(
                    column_fqn="svc.db.sc.users.email",
                    tag_label={"tagFQN": "PII.Sensitive"},
                )
            ]
        }
    )
    workflow, report = _run(
        _config(storeSampleData=True),
        client,
        sample_entity=lambda entity: _sample(),
        engine=engine,
    )
    assert engine.warmed is True
    assert client.list_calls == [("/v1/tables", {"service": "svc", "fields": "columns,tags"})]
    assert engine.classified == [("svc.db.sc.users", "table", [{"email": "a@b.com"}])]
    assert client.stored == [
        ("table", "id-svc.db.sc.users", {"columns": ["email"], "rows": [["a@b.com"]]})
    ]
    assert len(client.patch_calls) == 1
    assert client.patch_calls[0][0] == "/v1/tables/id-svc.db.sc.users"
    assert client.patch_calls[0][2] == {"If-Match": 'W/"0.1"'}
    assert report.succeeded == 1
    assert report.skipped == 0
    assert report.failed == 0
    assert workflow.source_status.progress["table"].total == 1
    assert workflow.sink_status.warnings == 0


def test_unknown_source_type_fails_in_prepare() -> None:
    client = _FakeClient([])
    with pytest.raises(WorkflowInitializationError, match="no entity category"):
        AutoClassificationWorkflow(_config("metabase"), client=client)


@pytest.mark.parametrize(
    ("source_type", "category"),
    [("mysql", "database"), ("kafka", "messaging"), ("s3", "storage")],
)
def test_known_service_is_validated_with_the_category_getter(
    source_type: str, category: str
) -> None:
    client = _FakeClient([])
    # An injected sampler keeps the database case off the live sampler
    # build (which needs the driver extra); validation runs before the
    # sampler is built either way.
    AutoClassificationWorkflow(
        _config(source_type), client=client, sample_entity=lambda entity: _sample()
    )
    assert client.service_calls == [(category, "svc")]


@pytest.mark.parametrize("source_type", ["mysql", "kafka", "s3"])
def test_unknown_service_fails_before_enumeration(source_type: str) -> None:
    client = _FakeClient([_table()], services=set())
    with pytest.raises(WorkflowInitializationError) as excinfo:
        AutoClassificationWorkflow(_config(source_type), client=client)
    message = str(excinfo.value)
    assert "could not prepare autoClassification workflow" in message
    assert "svc" in message
    assert "404" in message
    assert client.list_calls == []


def test_flag_off_samples_and_stores_without_classifying() -> None:
    client = _FakeClient([_table()])
    engine = _StubEngine()
    _, report = _run(
        _config(storeSampleData=True, enableAutoClassification=False),
        client,
        sample_entity=lambda entity: _sample(),
        engine=engine,
    )
    assert engine.warmed is False
    assert engine.classified == []
    assert len(client.stored) == 1
    assert client.patch_calls == []
    assert report.succeeded == 1


def test_store_flag_off_skips_persistence_but_still_patches() -> None:
    client = _FakeClient([_table()])
    engine = _StubEngine(
        tags={
            "svc.db.sc.users": [
                ColumnTag(
                    column_fqn="svc.db.sc.users.email",
                    tag_label={"tagFQN": "PII.Sensitive"},
                )
            ]
        }
    )
    _, report = _run(
        _config(storeSampleData=False),
        client,
        sample_entity=lambda entity: _sample(),
        engine=engine,
    )
    assert client.stored == []
    assert len(client.patch_calls) == 1
    assert report.succeeded == 1


def test_no_columns_entity_skips_with_a_counted_warning() -> None:
    client = _FakeClient([_table(columns=[])])
    sampled: list[str] = []

    def sample_entity(entity: dict[str, Any]) -> _EntitySample:
        sampled.append(str(entity["fullyQualifiedName"]))
        return _sample()

    workflow, report = _run(_config(), client, sample_entity=sample_entity, engine=_StubEngine())
    assert sampled == []
    assert report.skipped == 1
    assert report.succeeded == 0
    assert workflow.processor_status.filtered == 1
    assert workflow.processor_status.warnings == 1


def test_sampler_declining_an_entity_skips_it() -> None:
    client = _FakeClient([_table()])

    def sample_entity(entity: dict[str, Any]) -> _EntitySample:
        raise NotImplementedError("no sampler for this shape")

    workflow, report = _run(_config(), client, sample_entity=sample_entity, engine=_StubEngine())
    assert report.skipped == 1
    assert report.failed == 0
    assert workflow.processor_status.warnings == 1


def test_sampling_failure_records_a_processor_failure_and_continues() -> None:
    client = _FakeClient([_table("svc.db.sc.bad"), _table("svc.db.sc.good")])

    def sample_entity(entity: dict[str, Any]) -> _EntitySample:
        if entity["fullyQualifiedName"] == "svc.db.sc.bad":
            raise RuntimeError("connection reset")
        return _sample()

    workflow, report = _run(_config(), client, sample_entity=sample_entity, engine=_StubEngine())
    assert report.succeeded == 1
    assert report.failed == 1
    assert len(workflow.processor_status.failures) == 1
    assert "connection reset" in workflow.processor_status.failures[0].message
    assert client.patch_calls == []


def test_store_failure_is_a_sink_failure_but_the_patch_still_runs() -> None:
    client = _FakeClient([_table()])
    client.store_error = RuntimeError("sample ingest down")
    engine = _StubEngine(
        tags={
            "svc.db.sc.users": [
                ColumnTag(
                    column_fqn="svc.db.sc.users.email",
                    tag_label={"tagFQN": "PII.Sensitive"},
                )
            ]
        }
    )
    workflow, report = _run(
        _config(storeSampleData=True),
        client,
        sample_entity=lambda entity: _sample(),
        engine=engine,
    )
    assert report.failed == 1
    assert report.succeeded == 0
    assert len(client.patch_calls) == 1
    assert len(workflow.sink_status.failures) == 1


def test_patch_failure_warns_and_never_fails_the_run() -> None:
    client = _FakeClient([_table()])
    client.patch_outcomes = [RestError("boom", status_code=500)]
    engine = _StubEngine(
        tags={
            "svc.db.sc.users": [
                ColumnTag(
                    column_fqn="svc.db.sc.users.email",
                    tag_label={"tagFQN": "PII.Sensitive"},
                )
            ]
        }
    )
    workflow, report = _run(
        _config(),
        client,
        sample_entity=lambda entity: _sample(),
        engine=engine,
    )
    assert report.failed == 0
    assert report.succeeded == 1
    assert workflow.sink_status.warnings == 1


def test_patch_exhaustion_warns() -> None:
    client = _FakeClient([_table(columns=[{"name": "other"}])])
    engine = _StubEngine(
        tags={
            "svc.db.sc.users": [
                ColumnTag(
                    column_fqn="svc.db.sc.users.email",
                    tag_label={"tagFQN": "PII.Sensitive"},
                )
            ]
        }
    )
    workflow, report = _run(
        _config(),
        client,
        sample_entity=lambda entity: _sample(),
        engine=engine,
    )
    assert client.patch_calls == []
    assert report.succeeded == 1
    assert workflow.sink_status.warnings == 1


def test_per_column_engine_failures_become_processor_failures() -> None:
    client = _FakeClient([_table()])
    engine = _StubEngine(
        failures={
            "svc.db.sc.users": [
                ColumnFailure(
                    column_fqn="svc.db.sc.users.email",
                    message="recognizer exploded",
                    stack_trace="Traceback...",
                )
            ]
        }
    )
    workflow, report = _run(
        _config(),
        client,
        sample_entity=lambda entity: _sample(),
        engine=engine,
    )
    assert report.failed == 1
    assert report.succeeded == 1
    assert len(workflow.processor_status.failures) == 1
    failure = workflow.processor_status.failures[0]
    assert failure.label == "svc.db.sc.users.email"
    assert failure.stack_trace == "Traceback..."


def test_warm_up_failure_fails_the_run_loudly() -> None:
    client = _FakeClient([_table()])
    engine = _StubEngine(warm_error=WorkflowExecutionError("model missing"))
    workflow = AutoClassificationWorkflow(
        _config(),
        client=client,
        sample_entity=lambda entity: _sample(),
        engine=engine,
    )
    with pytest.raises(WorkflowExecutionError, match="model missing"):
        workflow.execute()
    assert engine.classified == []


def test_enumeration_applies_the_classification_filter() -> None:
    tagged = _table("svc.db.sc.tagged", tags=[{"tagFQN": "Tier.Tier1"}])
    untagged = _table("svc.db.sc.plain")
    client = _FakeClient([tagged, untagged])
    seen: list[str] = []

    def sample_entity(entity: dict[str, Any]) -> _EntitySample:
        seen.append(str(entity["fullyQualifiedName"]))
        return _sample()

    _run(
        _config(includeClassifications=["Tier.*"]),
        client,
        sample_entity=sample_entity,
        engine=_StubEngine(),
    )
    assert seen == ["svc.db.sc.tagged"]


def test_enumeration_applies_database_schema_and_table_patterns() -> None:
    client = _FakeClient(
        [
            _table("svc.db1.sc.users"),
            _table("svc.db2.sc.users"),
            _table("svc.db1.other.users"),
            _table("svc.db1.sc.orders"),
        ]
    )
    seen: list[str] = []

    def sample_entity(entity: dict[str, Any]) -> _EntitySample:
        seen.append(str(entity["fullyQualifiedName"]))
        return _sample()

    _run(
        _config(
            includeDatabases=["db1"],
            includeSchemas=["sc"],
            includeTables=["users"],
        ),
        client,
        sample_entity=sample_entity,
        engine=_StubEngine(),
    )
    assert seen == ["svc.db1.sc.users"]


def test_enumeration_excludes_views_when_include_views_is_false() -> None:
    client = _FakeClient(
        [
            _table("svc.db.sc.real"),
            _table("svc.db.sc.v", tableType="View"),
            _table("svc.db.sc.mv", tableType="MaterializedView"),
            _table("svc.db.sc.sv", tableType="SecureView"),
        ]
    )
    seen: list[str] = []

    def sample_entity(entity: dict[str, Any]) -> _EntitySample:
        seen.append(str(entity["fullyQualifiedName"]))
        return _sample()

    _run(
        _config(includeViews=False),
        client,
        sample_entity=sample_entity,
        engine=_StubEngine(),
    )
    assert seen == ["svc.db.sc.real", "svc.db.sc.sv"]


def test_malformed_table_fqn_skips_with_a_warning() -> None:
    client = _FakeClient([{"fullyQualifiedName": "svc.only", "columns": [], "tags": []}])
    _, report = _run(_config(), client, sample_entity=lambda e: _sample(), engine=_StubEngine())
    assert report.succeeded == 0
    assert report.skipped == 0
    assert report.failed == 0


def test_enumeration_streams_without_materializing_the_full_list() -> None:
    class _PullingClient(_FakeClient):
        def __init__(self, entities: list[dict[str, Any]]) -> None:
            super().__init__(entities)
            self.pulled = 0

        def iter_collection(
            self, path: str, *, limit: int = 100, extra_params: dict[str, Any] | None = None
        ) -> Iterator[dict[str, Any]]:
            self.list_calls.append((path, dict(extra_params or {})))
            return self._pulling()

        def _pulling(self) -> Iterator[dict[str, Any]]:
            for entity in self._entities:
                self.pulled += 1
                yield entity

    client = _PullingClient([_table(f"svc.db.sc.t{i}") for i in range(3)])
    pulls_at_first_process: list[int] = []

    def sample_entity(entity: dict[str, Any]) -> _EntitySample:
        if not pulls_at_first_process:
            pulls_at_first_process.append(client.pulled)
        return _sample()

    workflow, report = _run(_config(), client, sample_entity=sample_entity, engine=_StubEngine())
    # Only the first entity has been pulled when its processing starts:
    # a materializing enumeration would have pulled all three first.
    assert pulls_at_first_process == [1]
    assert client.pulled == 3
    assert report.succeeded == 3
    assert workflow.source_status.records == 3
    assert workflow.source_status.progress["table"].total == 3
    assert workflow.source_status.progress["table"].processed == 3


def test_enumeration_failure_mid_stream_fails_after_partial_processing() -> None:
    class _FailingClient(_FakeClient):
        def iter_collection(
            self, path: str, *, limit: int = 100, extra_params: dict[str, Any] | None = None
        ) -> Iterator[dict[str, Any]]:
            self.list_calls.append((path, dict(extra_params or {})))
            return self._failing()

        def _failing(self) -> Iterator[dict[str, Any]]:
            yield self._entities[0]
            yield self._entities[1]
            raise RuntimeError("page 2 down")

    client = _FailingClient([_table("svc.db.sc.a"), _table("svc.db.sc.b"), _table("svc.db.sc.c")])
    workflow = AutoClassificationWorkflow(
        _config(),
        client=client,
        sample_entity=lambda entity: _sample(),
        engine=_StubEngine(),
    )
    with pytest.raises(RuntimeError, match="page 2 down"):
        workflow.execute()
    assert workflow.report.succeeded == 2
    assert workflow.source_status.progress["table"].total == 2
    assert workflow.source_status.progress["table"].processed == 2


def test_messaging_path_classifies_topics_by_name_and_stores_messages() -> None:
    topic = {
        "id": "id-svc.orders",
        "name": "orders",
        "fullyQualifiedName": "svc.orders",
        "messageSchema": {"schemaFields": [{"name": "email", "tags": []}]},
        "tags": [],
        "version": 0.2,
    }
    client = _FakeClient([topic])
    engine = _StubEngine()
    workflow, report = _run(
        _config("kafka", storeSampleData=True),
        client,
        sample_entity=lambda entity: _EntitySample(rows=None, messages=["hello", "world"]),
        engine=engine,
    )
    assert client.list_calls[0][0] == "/v1/topics"
    assert client.list_calls[0][1]["fields"] == "messageSchema,tags"
    assert engine.classified == [("svc.orders", "topic", None)]
    assert client.stored == [("topic", "id-svc.orders", {"messages": ["hello", "world"]})]
    assert report.succeeded == 1
    assert workflow.source_status.progress["topic"].total == 1


def test_storage_path_lists_containers() -> None:
    container = {
        "id": "id-svc.bucket",
        "name": "bucket",
        "fullyQualifiedName": "svc.bucket",
        "dataModel": {"columns": [{"name": "key", "tags": []}]},
        "tags": [],
        "version": 0.1,
    }
    client = _FakeClient([container])
    workflow, report = _run(
        _config("s3"),
        client,
        sample_entity=lambda entity: _sample(rows=[{"key": "a"}]),
        engine=_StubEngine(),
    )
    assert client.list_calls[0][0] == "/v1/containers"
    assert client.list_calls[0][1]["fields"] == "dataModel,tags"
    assert report.succeeded == 1
    assert workflow.source_status.progress["container"].total == 1


def test_sampler_close_runs_once_at_run_end() -> None:
    client = _FakeClient([_table()])

    class ClosingSampler:
        def __init__(self) -> None:
            self.closes = 0

        def close(self) -> None:
            self.closes += 1

    workflow = AutoClassificationWorkflow(
        _config(),
        client=client,
        sample_entity=lambda entity: _sample(),
        engine=_StubEngine(),
    )
    sampler = ClosingSampler()
    workflow._sampler = sampler
    workflow.execute()
    workflow.stop()
    assert sampler.closes == 1


# --- Adapters ------------------------------------------------------------------


class _RecordingSampler:
    def __init__(self) -> None:
        self.calls: list[tuple[tuple[Any, ...], dict[str, Any]]] = []

    def sample(self, *args: Any, **kwargs: Any) -> list[dict[str, Any]]:
        self.calls.append((args, kwargs))
        return [{"x": 1}]


def test_database_adapter_passes_the_arity_the_binding_declares() -> None:
    sampler = _RecordingSampler()
    adapter = _database_sample_adapter(sampler, True, 25)
    result = adapter({"fullyQualifiedName": "svc.db.sc.tbl"})
    assert result.rows == [{"x": 1}]
    assert sampler.calls == [(("db", "sc", "tbl"), {"limit": 25})]
    sampler = _RecordingSampler()
    adapter = _database_sample_adapter(sampler, False, 25)
    adapter({"fullyQualifiedName": "svc.db.sc.tbl"})
    assert sampler.calls == [(("sc", "tbl"), {"limit": 25})]


def test_database_adapter_rejects_malformed_fqns() -> None:
    adapter = _database_sample_adapter(_RecordingSampler(), True, 10)
    with pytest.raises(WorkflowExecutionError, match="no database/schema/table"):
        adapter({"fullyQualifiedName": "svc.db.sc"})
    with pytest.raises(WorkflowExecutionError, match="no database/schema/table"):
        adapter({"fullyQualifiedName": "svc.db.sc.tbl.extra"})


def test_database_adapter_handles_quoted_dots_in_names() -> None:
    sampler = _RecordingSampler()
    adapter = _database_sample_adapter(sampler, True, 10)
    adapter({"fullyQualifiedName": 'svc.db.sc."my.tbl"'})
    assert sampler.calls == [(("db", "sc", "my.tbl"), {"limit": 10})]


def test_messaging_adapter_samples_by_topic_name() -> None:
    class TopicSampler:
        def __init__(self) -> None:
            self.calls: list[tuple[str, int]] = []

        def sample(self, *, topic: str, limit: int) -> list[str]:
            self.calls.append((topic, limit))
            return ["m1"]

    sampler = TopicSampler()
    adapter = _messaging_sample_adapter(sampler, 40)
    result = adapter({"name": "orders"})
    assert result.rows is None
    assert result.messages == ["m1"]
    assert sampler.calls == [("orders", 40)]


def test_storage_adapter_splits_bucket_and_prefix() -> None:
    class BucketSampler:
        def __init__(self) -> None:
            self.calls: list[tuple[str, str, int]] = []

        def sample(self, *, bucket: str, prefix: str, limit: int) -> list[dict]:
            self.calls.append((bucket, prefix, limit))
            return [{"key": "k"}]

    sampler = BucketSampler()
    adapter = _storage_sample_adapter(sampler, 30)
    result = adapter({"fullyQualifiedName": "svc.bucket.a.b"})
    assert result.rows == [{"key": "k"}]
    assert sampler.calls == [("bucket", "a/b", 30)]
    adapter({"fullyQualifiedName": "svc.bucket"})
    assert sampler.calls[-1] == ("bucket", "", 30)
    with pytest.raises(WorkflowExecutionError, match="no bucket segment"):
        adapter({"fullyQualifiedName": "svc"})


def test_messaging_and_storage_samplers_construct_without_a_network() -> None:
    kafka = AutoClassificationWorkflow(_config("kafka"), client=_FakeClient([]))
    assert kafka._sample_entity is not None
    assert kafka._entity_type == "topic"
    s3 = AutoClassificationWorkflow(_config("s3"), client=_FakeClient([]))
    assert s3._sample_entity is not None
    assert s3._entity_type == "container"
    redpanda = AutoClassificationWorkflow(_config("redpanda"), client=_FakeClient([]))
    assert redpanda._entity_type == "topic"
