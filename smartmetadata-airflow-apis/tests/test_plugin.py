# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Plugin entry-point tests (step 7): Airflow discovers the plugin.

These pin the production mounting shape: the ``airflow.plugins`` entry
point loads the plugin class, the class carries one Flask blueprint with
url_prefix ``/api/v2/openmetadata`` (served by Airflow 3 at
``/pluginsv2/api/v2/openmetadata``), and the blueprint authenticates
itself through the process fallback when the host Flask app carries no
authenticator — the exact situation inside Airflow's api-server.
"""

from __future__ import annotations

import base64
import sys
from importlib.metadata import distribution

import pytest
from flask import Flask

from smartmetadata_airflow_apis.app import _default_store, get_blueprint
from smartmetadata_airflow_apis.store import MemoryDagStore

CREDS = ("admin", "admin-pass")


def _auth_headers() -> dict[str, str]:
    token = base64.b64encode(b"admin:admin-pass").decode()
    return {"Authorization": f"Basic {token}"}


def test_entry_point_registered() -> None:
    pytest.importorskip("airflow")
    dist = distribution("smartmetadata-airflow-apis")
    points = [
        ep for ep in dist.entry_points if ep.group == "airflow.plugins"
    ]
    assert [ep.name for ep in points] == ["smartmetadata_airflow_apis"]
    loaded = points[0].load()
    assert loaded is not None
    assert loaded.name == "smartmetadata_airflow_apis"


def test_plugin_class_carries_one_blueprint(monkeypatch, tmp_path) -> None:
    pytest.importorskip("airflow")
    monkeypatch.setenv("AIRFLOW_HOME", str(tmp_path))
    import smartmetadata_airflow_apis.plugin as plugin_module

    plugin_cls = plugin_module.SmartMetadataPlugin
    assert plugin_cls is not None
    assert plugin_cls.name == "smartmetadata_airflow_apis"
    assert len(plugin_cls.flask_blueprints) == 1
    blueprint = plugin_cls.flask_blueprints[0]
    assert blueprint.url_prefix == "/api/v2/openmetadata"
    assert plugin_cls.appbuilder_views
    assert plugin_cls.admin_views


def test_blueprint_answers_on_bare_host_app() -> None:
    # The host app carries no authenticator in extensions — the blueprint
    # must still authenticate through the fallback get_blueprint installs.
    host = Flask("host-without-authenticator")
    host.register_blueprint(
        get_blueprint(store=MemoryDagStore(), credentials=CREDS)
    )
    client = host.test_client()

    assert client.get("/api/v2/openmetadata/health").status_code == 200
    assert client.get("/api/v2/openmetadata/health-auth").status_code == 401
    authed = client.get(
        "/api/v2/openmetadata/health-auth", headers=_auth_headers()
    )
    assert authed.status_code == 200
    assert authed.get_json()["version"] == "2.0.0-SNAPSHOT"
    token_resp = client.get(
        "/api/v2/openmetadata/csrf-token", headers=_auth_headers()
    )
    assert token_resp.status_code == 200
    assert isinstance(token_resp.get_json()["csrf_token"], str)


def test_blueprint_mounts_only_v2_prefix() -> None:
    host = Flask("host-prefix-check")
    host.register_blueprint(
        get_blueprint(store=MemoryDagStore(), credentials=CREDS)
    )
    rules = [
        str(rule)
        for rule in host.url_map.iter_rules()
        if "openmetadata" in str(rule)
    ]
    assert rules
    assert all(rule.startswith("/api/v2/openmetadata/") for rule in rules)


def test_default_store_is_airflow_backend(monkeypatch, tmp_path) -> None:
    pytest.importorskip("airflow")
    monkeypatch.setenv("AIRFLOW_HOME", str(tmp_path))
    from smartmetadata_airflow_apis.backends import AirflowBackend

    assert isinstance(_default_store(), AirflowBackend)


def test_default_store_falls_back_without_airflow(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("AIRFLOW_HOME", str(tmp_path))
    monkeypatch.setitem(sys.modules, "airflow", None)
    assert isinstance(_default_store(), MemoryDagStore)


def test_csrf_exemption_matches_official_twelve(monkeypatch) -> None:
    # Ruling §2.0 (fix-round B-3): every route except csrf-token carries
    # @csrf.exempt in the official plugin — 12 routes, status included
    # (api/routes/status.py). The fake records what the blueprint asks
    # the FAB CSRFProtect instance to exempt.
    import smartmetadata_airflow_apis.app as app_module

    seen: list[str] = []

    class FakeCsrf:
        def exempt(self, view):
            seen.append(f"{view.__module__}.{view.__name__}")
            return view

    monkeypatch.setattr(app_module, "_fab_csrf", lambda: FakeCsrf())
    get_blueprint(store=MemoryDagStore(), credentials=CREDS)

    exempted = {name.rsplit(".", 1)[-1] for name in seen}
    assert exempted == {
        "health_view",
        "health_auth_view",
        "deploy_view",
        "trigger_view",
        "delete_view",
        "enable_view",
        "disable_view",
        "status_view",
        "kill_view",
        "logs_view",
        "ip_view",
        "automation_view",
    }


def test_admin_view_lists_endpoints() -> None:
    pytest.importorskip("flask_appbuilder")
    from smartmetadata_airflow_apis.views.rest_api import RestApiView

    assert RestApiView is not None
    html = RestApiView().list()
    assert "health-auth" in html
    assert "deploy" in html
    assert "/api/v2/openmetadata/run_automation" in html
