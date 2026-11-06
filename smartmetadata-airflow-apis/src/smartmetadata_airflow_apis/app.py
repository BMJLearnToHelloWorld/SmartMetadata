# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Flask app factory mounting AirflowRESTClient path names under known prefixes.

Every route is mounted under all three prefixes (``/api/v1/openmetadata``,
``/api/v2/openmetadata``, ``/pluginsv2/api/v2/openmetadata``) because the
server probes them in order to detect the Airflow API version. ``/health``
is public; every other route requires Basic auth plus the action's
permission (fail closed).
"""

from __future__ import annotations

import secrets
from typing import Any, Callable

from flask import Flask, jsonify, request

from smartmetadata_airflow_apis import handlers
from smartmetadata_airflow_apis.contracts import API_PREFIXES
from smartmetadata_airflow_apis.handlers import USE_DEFAULT_FETCHER
from smartmetadata_airflow_apis.security import (
    CREATE,
    DELETE,
    EDIT,
    READ,
    Authenticator,
    build_authenticator,
    require_permission,
)
from smartmetadata_airflow_apis.store import DagStore, MemoryDagStore


def create_app(
    store: DagStore | None = None,
    credentials: tuple[str, str] | None = None,
    authenticator: Authenticator | None = None,
    automation_fetcher: Any = USE_DEFAULT_FETCHER,
) -> Flask:
    app = Flask("smartmetadata_airflow_apis")
    backend = store or MemoryDagStore()
    app.extensions["dag_store"] = backend
    app.extensions["authenticator"] = (
        authenticator if authenticator is not None else build_authenticator(credentials)
    )
    # The run_automation fetcher: the default is the executor's production
    # fetcher (re-fetch the decrypted workflow from the server); None
    # executes the posted body directly and exists only for tests without
    # a server (ruling §4.4).
    app.extensions["automation_fetcher"] = automation_fetcher
    # The standalone app always issues a CSRF token; the 11 other routes do
    # not validate it (they are exempt, matching the official plugin, where
    # CSRF is enforced by Airflow itself in production).
    app.extensions["csrf_token"] = secrets.token_urlsafe(32)

    def json_body() -> dict[str, Any]:
        data = request.get_json(silent=True)
        return data if isinstance(data, dict) else {}

    def reply(result: handlers.HandlerResult):
        return jsonify(result.body), result.status

    for prefix in API_PREFIXES:
        _mount(app, prefix, backend, json_body, reply, app.extensions["automation_fetcher"])
    return app


def _mount(
    app: Flask,
    prefix: str,
    store: DagStore,
    json_body: Callable[[], dict[str, Any]],
    reply: Callable,
    automation_fetcher: Any,
) -> None:
    tag = prefix.replace("/", "_")

    app.add_url_rule(
        f"{prefix}/health",
        endpoint=f"health{tag}",
        view_func=lambda: reply(handlers.health(store)),
        methods=["GET"],
    )
    app.add_url_rule(
        f"{prefix}/health-auth",
        endpoint=f"health_auth{tag}",
        view_func=require_permission(CREATE)(lambda: reply(handlers.health_auth(store))),
        methods=["GET"],
    )
    app.add_url_rule(
        f"{prefix}/csrf-token",
        endpoint=f"csrf_token{tag}",
        view_func=require_permission(READ)(
            lambda: reply(handlers.csrf_token(app.extensions["csrf_token"]))
        ),
        methods=["GET"],
    )
    app.add_url_rule(
        f"{prefix}/deploy",
        endpoint=f"deploy{tag}",
        view_func=require_permission(CREATE)(
            lambda: reply(handlers.deploy(store, json_body()))
        ),
        methods=["POST"],
    )
    app.add_url_rule(
        f"{prefix}/trigger",
        endpoint=f"trigger{tag}",
        view_func=require_permission(EDIT)(
            lambda: reply(handlers.trigger(store, json_body()))
        ),
        methods=["POST"],
    )
    app.add_url_rule(
        f"{prefix}/delete",
        endpoint=f"delete{tag}",
        view_func=require_permission(DELETE)(
            lambda: reply(handlers.delete(store, request.args.get("dag_id")))
        ),
        methods=["DELETE"],
    )
    app.add_url_rule(
        f"{prefix}/enable",
        endpoint=f"enable{tag}",
        view_func=require_permission(EDIT)(
            lambda: reply(handlers.enable(store, json_body()))
        ),
        methods=["POST"],
    )
    app.add_url_rule(
        f"{prefix}/disable",
        endpoint=f"disable{tag}",
        view_func=require_permission(EDIT)(
            lambda: reply(handlers.disable(store, json_body()))
        ),
        methods=["POST"],
    )
    def status_view():
        return reply(
            handlers.status(
                store,
                request.args.get("dag_id"),
                run_id=request.args.get("run_id"),
                only_queued=request.args.get("only_queued") == "true",
            )
        )

    app.add_url_rule(
        f"{prefix}/status",
        endpoint=f"status{tag}",
        view_func=require_permission(READ)(status_view),
        methods=["GET"],
    )
    app.add_url_rule(
        f"{prefix}/kill",
        endpoint=f"kill{tag}",
        view_func=require_permission(EDIT)(
            lambda: reply(handlers.kill(store, json_body()))
        ),
        methods=["POST"],
    )

    def logs_view():
        after_raw = request.args.get("after") or "0"
        try:
            after = int(after_raw)
        except ValueError:
            after = 0
        return reply(
            handlers.last_dag_logs(
                store,
                request.args.get("dag_id"),
                request.args.get("task_id"),
                run_id=request.args.get("run_id"),
                after=after,
            )
        )

    app.add_url_rule(
        f"{prefix}/last_dag_logs",
        endpoint=f"logs{tag}",
        view_func=require_permission(READ)(logs_view),
        methods=["GET"],
    )
    app.add_url_rule(
        f"{prefix}/ip",
        endpoint=f"ip{tag}",
        view_func=require_permission(EDIT)(lambda: reply(handlers.host_ip(store))),
        methods=["GET"],
    )
    app.add_url_rule(
        f"{prefix}/run_automation",
        endpoint=f"automation{tag}",
        view_func=require_permission(READ)(
            lambda: reply(
                handlers.run_automation(
                    store, json_body(), fetch_workflow=automation_fetcher
                )
            )
        ),
        methods=["POST"],
    )
