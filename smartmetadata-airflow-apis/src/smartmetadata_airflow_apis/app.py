# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Flask app factory mounting AirflowRESTClient path names under known prefixes."""

from __future__ import annotations

from typing import Any, Callable

from flask import Flask, jsonify, request

from smartmetadata_airflow_apis import handlers
from smartmetadata_airflow_apis.contracts import API_PREFIXES
from smartmetadata_airflow_apis.store import MemoryDagStore


def create_app(store: MemoryDagStore | None = None) -> Flask:
    app = Flask("smartmetadata_airflow_apis")
    backend = store or MemoryDagStore()
    app.extensions["dag_store"] = backend

    def json_body() -> dict[str, Any]:
        data = request.get_json(silent=True)
        return data if isinstance(data, dict) else {}

    def reply(result: handlers.HandlerResult):
        return jsonify(result.body), result.status

    for prefix in API_PREFIXES:
        _mount(app, prefix, backend, json_body, reply)
    return app


def _mount(
    app: Flask,
    prefix: str,
    store: MemoryDagStore,
    json_body: Callable[[], dict[str, Any]],
    reply: Callable,
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
        view_func=lambda: reply(handlers.health_auth(store)),
        methods=["GET"],
    )
    app.add_url_rule(
        f"{prefix}/deploy",
        endpoint=f"deploy{tag}",
        view_func=lambda: reply(handlers.deploy(store, json_body())),
        methods=["POST"],
    )
    app.add_url_rule(
        f"{prefix}/trigger",
        endpoint=f"trigger{tag}",
        view_func=lambda: reply(handlers.trigger(store, json_body())),
        methods=["POST"],
    )
    app.add_url_rule(
        f"{prefix}/delete",
        endpoint=f"delete{tag}",
        view_func=lambda: reply(handlers.delete(store, request.args.get("dag_id"))),
        methods=["DELETE"],
    )
    app.add_url_rule(
        f"{prefix}/enable",
        endpoint=f"enable{tag}",
        view_func=lambda: reply(handlers.enable(store, json_body())),
        methods=["POST"],
    )
    app.add_url_rule(
        f"{prefix}/disable",
        endpoint=f"disable{tag}",
        view_func=lambda: reply(handlers.disable(store, json_body())),
        methods=["POST"],
    )
    app.add_url_rule(
        f"{prefix}/status",
        endpoint=f"status{tag}",
        view_func=lambda: reply(handlers.status(store, request.args.get("dag_id"))),
        methods=["GET"],
    )
    app.add_url_rule(
        f"{prefix}/kill",
        endpoint=f"kill{tag}",
        view_func=lambda: reply(handlers.kill(store, json_body())),
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
                after=after,
            )
        )

    app.add_url_rule(
        f"{prefix}/last_dag_logs",
        endpoint=f"logs{tag}",
        view_func=logs_view,
        methods=["GET"],
    )
    app.add_url_rule(
        f"{prefix}/ip",
        endpoint=f"ip{tag}",
        view_func=lambda: reply(handlers.host_ip(store)),
        methods=["GET"],
    )
    app.add_url_rule(
        f"{prefix}/run_automation",
        endpoint=f"automation{tag}",
        view_func=lambda: reply(handlers.run_automation(store, json_body())),
        methods=["POST"],
    )
