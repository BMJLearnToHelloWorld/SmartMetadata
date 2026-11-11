# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""P-06/P-39/P-40: deploy writes config + DAG files and registers the DAG.

Real AirflowBackend with tmp dirs. The service-connection fetch is the
only stub seam (an HTTP boundary); the registration wait and the
background scan are patched out except where the test itself drives
them. No scheduler and no Airflow DB are involved: _last_parsed_time is
stubbed and the wait path is replaced unless the test asserts on it.
"""

from __future__ import annotations

import contextlib
import importlib.util
import json
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import pytest

import smartmetadata_airflow_apis.backends as backends
from smartmetadata_airflow_apis.backends import AirflowBackend
from smartmetadata_airflow_apis.errors import DagOperationError

CONNECTION = {
    "type": "MySQL",
    "hostPort": "127.0.0.1:3306",
    "username": "stub",
    "password": "stub",
}


def _pipeline(
    name: str = "deploy_demo", pipeline_type: str = "metadata", **overrides: Any
) -> dict[str, Any]:
    pipeline: dict[str, Any] = {
        "name": name,
        "fullyQualifiedName": f"svc.{name}",
        "pipelineType": pipeline_type,
        "service": {"type": "databaseService", "name": "svc"},
        "sourceConfig": {"config": {}},
        "openMetadataServerConnection": {
            "hostPort": "http://127.0.0.1:8585/api",
            "securityConfig": {"jwtToken": "test-jwt"},
        },
        "airflowConfig": {},
    }
    pipeline.update(overrides)
    return pipeline


def _test_suite_pipeline() -> dict[str, Any]:
    pipeline = _pipeline("suite_demo", "TestSuite")
    pipeline["service"] = {"type": "testSuite", "name": "suite-1"}
    pipeline["sourceConfig"] = {
        "config": {
            "entityFullyQualifiedName": "warehouse.analytics.public.orders",
            "testCases": ["orders_email_not_null"],
        }
    }
    return pipeline


def _pipeline_for(pipeline_type: str) -> dict[str, Any]:
    if pipeline_type == "TestSuite":
        return _test_suite_pipeline()
    return _pipeline(f"{pipeline_type.lower()}_demo", pipeline_type)


def _stub_fetch(monkeypatch: pytest.MonkeyPatch) -> None:
    import smartmetadata_airflow_apis.workflows.translation as translation

    monkeypatch.setattr(
        translation,
        "fetch_service_connection",
        lambda pipeline, client=None: (dict(CONNECTION), "Mysql"),
    )
    monkeypatch.setattr(
        translation,
        "_test_suite_service_connection",
        lambda pipeline, server_client=None: (dict(CONNECTION), "Mysql"),
    )


def _patch_registration(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(backends, "_wait_for_registration", lambda *a, **k: None)
    monkeypatch.setattr(backends, "_scan_in_background", lambda: None)
    monkeypatch.setattr(backends, "_last_parsed_time", lambda dag_id: None)


def _backend(tmp_path: Path) -> AirflowBackend:
    return AirflowBackend(
        configs_dir_path=tmp_path / "configs",
        dags_folder_path=tmp_path / "dags",
    )


def _reimport_dag(dag_path: Path, module_name: str):
    spec = importlib.util.spec_from_file_location(module_name, dag_path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


# --- P-06: real-backend deploy of the five types ---------------------------


@pytest.mark.parametrize(
    ("pipeline_type", "task_id"),
    [
        ("dbt", "dbt_task"),
        ("autoClassification", "auto_classification_task"),
        ("TestSuite", "test_suite_task"),
        ("elasticSearchReindex", "elasticsearch_reindex_task"),
        ("application", "application_task"),
    ],
)
def test_real_backend_deploy_writes_importable_dag(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    pipeline_type: str,
    task_id: str,
) -> None:
    pytest.importorskip("airflow")
    _stub_fetch(monkeypatch)
    _patch_registration(monkeypatch)
    backend = _backend(tmp_path)
    dag_id = backend.deploy(_pipeline_for(pipeline_type))
    config_path = tmp_path / "configs" / f"{dag_id}.json"
    dag_path = tmp_path / "dags" / f"{dag_id}.py"
    assert config_path.exists()
    assert dag_path.exists()
    # The DAG file re-imports standalone with the expected task.
    module = _reimport_dag(dag_path, f"_sm_reimport_{pipeline_type}")
    assert task_id in module.dag.task_dict


# --- P-39: secret reference on disk, never plaintext ------------------------


def test_deploy_writes_secret_reference_not_plaintext(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    pytest.importorskip("airflow")
    from smartmetadata_ingestion.secrets import (
        register_secret_resolver,
        reset_secret_resolvers,
    )

    # The report's regression assumes a resolver is registered (the fake
    # one below); without any client for the provider the deploy fails
    # closed at DAG-parse time (see the next test).
    register_secret_resolver("aws", lambda secret_id, loader: "resolved-value")
    try:
        _stub_fetch(monkeypatch)
        _patch_registration(monkeypatch)
        pipeline = _pipeline()
        pipeline["openMetadataServerConnection"]["securityConfig"]["jwtToken"] = (
            "secret:/super/secret"
        )
        pipeline["openMetadataServerConnection"]["secretsManagerProvider"] = "aws"
        dag_id = _backend(tmp_path).deploy(pipeline)
        config_text = (tmp_path / "configs" / f"{dag_id}.json").read_text(encoding="utf-8")
        assert "secret:/super/secret" in config_text
        assert "resolved-value" not in config_text
        parsed = json.loads(config_text)
        assert (
            parsed["openMetadataServerConnection"]["securityConfig"]["jwtToken"]
            == "secret:/super/secret"
        )
    finally:
        reset_secret_resolvers()


def test_deploy_without_secrets_client_fails_closed(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    pytest.importorskip("airflow")
    _stub_fetch(monkeypatch)
    _patch_registration(monkeypatch)
    pipeline = _pipeline()
    pipeline["openMetadataServerConnection"]["securityConfig"]["jwtToken"] = (
        "secret:/super/secret"
    )
    pipeline["openMetadataServerConnection"]["secretsManagerProvider"] = "aws"
    # No client is registered for the external provider: the DAG cannot
    # parse (the worker would have no Bearer), so deploy fails instead of
    # writing a DAG that can never run. The config file already on disk
    # still carries only the reference, never a resolved value.
    with pytest.raises(DagOperationError, match="no secrets client"):
        _backend(tmp_path).deploy(pipeline)
    config_text = (tmp_path / "configs" / "deploy_demo.json").read_text(encoding="utf-8")
    assert "secret:/super/secret" in config_text


def test_deploy_secret_rotation_takes_effect_on_reparse(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    pytest.importorskip("airflow")
    from smartmetadata_ingestion.secrets import (
        register_secret_resolver,
        reset_secret_resolvers,
    )

    mapping = {"token": "token-v1"}
    register_secret_resolver("aws", lambda secret_id, loader: mapping["token"])
    try:
        _stub_fetch(monkeypatch)
        _patch_registration(monkeypatch)
        pipeline = _pipeline()
        pipeline["openMetadataServerConnection"]["securityConfig"]["jwtToken"] = (
            "secret:/super/secret"
        )
        pipeline["openMetadataServerConnection"]["secretsManagerProvider"] = "aws"
        dag_id = _backend(tmp_path).deploy(pipeline)
        dag_path = tmp_path / "dags" / f"{dag_id}.py"

        def parse_token() -> str:
            module = _reimport_dag(dag_path, f"_sm_rot_{mapping['token']}")
            task = module.dag.get_task("ingestion_task")
            return task._workflow_config["server"]["auth"]["jwt_token"]

        assert parse_token() == "token-v1"
        # Rotate the secret in the manager: re-parsing the same DAG file
        # (no re-deploy, no file change) picks up the new Bearer.
        mapping["token"] = "token-v2"
        assert parse_token() == "token-v2"
    finally:
        reset_secret_resolvers()


# --- P-40: deploy registration wait -----------------------------------------
# The DAG object decides the path: sync_to_db when present (skip the
# wait), the wait otherwise. A DAG that never registers times out with
# DagOperationError (deploy 500), never a false 200.


class _FakeColumn:
    def desc(self):
        return self


class _FakeDagModel:
    dag_id = "demo"


class _FakeSerializedDagModel:
    dag_id = "demo"
    last_updated = _FakeColumn()


class _FakeQuery:
    def __init__(self, rows: list) -> None:
        self._rows = rows

    def filter(self, *args, **kwargs):
        return self

    def order_by(self, *args, **kwargs):
        return self

    def one_or_none(self):
        return self._rows[0] if self._rows else None

    def first(self):
        return self._rows[0] if self._rows else None


class _FakeSession:
    def __init__(self, *, dag_rows: list, serialized_rows: list) -> None:
        self._dag_rows = dag_rows
        self._serialized_rows = serialized_rows

    def query(self, model):
        if model is _FakeDagModel:
            return _FakeQuery(self._dag_rows)
        return _FakeQuery(self._serialized_rows)

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False


def _patch_session(
    monkeypatch: pytest.MonkeyPatch, *, dag_rows: list, serialized_rows: list
) -> None:
    @contextlib.contextmanager
    def fake_create_session():
        yield _FakeSession(dag_rows=dag_rows, serialized_rows=serialized_rows)

    monkeypatch.setattr("airflow.models.dag.DagModel", _FakeDagModel)
    monkeypatch.setattr(
        "airflow.models.serialized_dag.SerializedDagModel", _FakeSerializedDagModel
    )
    monkeypatch.setattr("airflow.utils.session.create_session", fake_create_session)


def test_is_registered_rejects_import_errors(monkeypatch: pytest.MonkeyPatch) -> None:
    pytest.importorskip("airflow")
    row = SimpleNamespace(
        last_parsed_time=datetime(2026, 11, 11, tzinfo=timezone.utc),
        has_import_errors=True,
    )
    _patch_session(
        monkeypatch,
        dag_rows=[row],
        serialized_rows=[SimpleNamespace(dag_id="demo")],
    )
    # A serialized row exists, but the DAG has import errors: not registered.
    assert backends._is_registered("demo", None) is False


def test_is_registered_accepts_clean_row(monkeypatch: pytest.MonkeyPatch) -> None:
    pytest.importorskip("airflow")
    row = SimpleNamespace(
        last_parsed_time=datetime(2026, 11, 11, tzinfo=timezone.utc),
        has_import_errors=False,
    )
    _patch_session(
        monkeypatch,
        dag_rows=[row],
        serialized_rows=[SimpleNamespace(dag_id="demo")],
    )
    assert backends._is_registered("demo", None) is True


def test_is_registered_rejects_stale_parse(monkeypatch: pytest.MonkeyPatch) -> None:
    pytest.importorskip("airflow")
    parsed = datetime(2026, 11, 11, tzinfo=timezone.utc)
    row = SimpleNamespace(last_parsed_time=parsed, has_import_errors=False)
    _patch_session(
        monkeypatch,
        dag_rows=[row],
        serialized_rows=[SimpleNamespace(dag_id="demo")],
    )
    assert backends._is_registered("demo", parsed) is False


def test_deploy_sync_path_skips_wait(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    pytest.importorskip("airflow")
    _stub_fetch(monkeypatch)
    _patch_registration(monkeypatch)
    calls = {"wait": 0, "sync": 0}
    monkeypatch.setattr(
        backends, "_wait_for_registration", lambda *a, **k: calls.__setitem__("wait", calls["wait"] + 1)
    )
    monkeypatch.setattr(
        backends, "_sync_dag_to_db", lambda dag: calls.__setitem__("sync", calls["sync"] + 1)
    )
    fake_dag = SimpleNamespace(dag_id="demo", sync_to_db=lambda session=None: None)
    monkeypatch.setattr(
        backends.AirflowBackend,
        "_parse_with_dagbag",
        lambda self, path: [fake_dag],
    )
    dag_id = _backend(tmp_path).deploy(_pipeline("demo"))
    assert dag_id == "demo"
    assert calls["sync"] == 1
    assert calls["wait"] == 0


def test_deploy_wait_path_when_no_sync_to_db(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    pytest.importorskip("airflow")
    _stub_fetch(monkeypatch)
    _patch_registration(monkeypatch)
    calls = {"wait": 0, "sync": 0}
    monkeypatch.setattr(
        backends, "_wait_for_registration", lambda *a, **k: calls.__setitem__("wait", calls["wait"] + 1)
    )
    monkeypatch.setattr(
        backends, "_sync_dag_to_db", lambda dag: calls.__setitem__("sync", calls["sync"] + 1)
    )
    fake_dag = SimpleNamespace(dag_id="demo")  # Airflow 3.3.2: no sync_to_db
    monkeypatch.setattr(
        backends.AirflowBackend,
        "_parse_with_dagbag",
        lambda self, path: [fake_dag],
    )
    dag_id = _backend(tmp_path).deploy(_pipeline("demo"))
    assert dag_id == "demo"
    assert calls["sync"] == 0
    assert calls["wait"] == 1


def test_deploy_times_out_when_dag_never_registers(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    pytest.importorskip("airflow")
    _stub_fetch(monkeypatch)
    monkeypatch.setattr(backends, "_scan_in_background", lambda: None)
    monkeypatch.setattr(backends, "_last_parsed_time", lambda dag_id: None)
    # A DAG with import errors never registers: the wait must time out
    # (deploy 500 via DagOperationError), never report a false 200.
    monkeypatch.setattr(backends, "_is_registered", lambda dag_id, prev: False)
    monkeypatch.setattr(backends, "_WAIT_TIMEOUT_SECONDS", 0.2)
    monkeypatch.setattr(backends, "_WAIT_POLL_SECONDS", 0.05)
    fake_dag = SimpleNamespace(dag_id="demo")
    monkeypatch.setattr(
        backends.AirflowBackend,
        "_parse_with_dagbag",
        lambda self, path: [fake_dag],
    )
    with pytest.raises(DagOperationError, match="was not registered"):
        _backend(tmp_path).deploy(_pipeline("demo"))
