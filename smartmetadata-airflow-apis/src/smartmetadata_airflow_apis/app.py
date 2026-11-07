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
    set_fallback_authenticator,
)
from smartmetadata_airflow_apis.store import DagStore, MemoryDagStore


def _json_body() -> dict[str, Any]:
    data = request.get_json(silent=True)
    return data if isinstance(data, dict) else {}


def _reply(result: handlers.HandlerResult):
    return jsonify(result.body), result.status


def _default_store() -> DagStore:
    """Production store: the real Airflow backend when Airflow is installed.

    The backend only imports Airflow lazily (inside its methods), so
    constructing it is cheap; in an environment without Airflow at all the
    memory store is the only option and is used for standalone tests.
    """
    try:
        import airflow  # noqa: F401
    except ImportError:
        return MemoryDagStore()
    from smartmetadata_airflow_apis.backends import AirflowBackend

    return AirflowBackend()


def get_blueprint(
    store: DagStore | None = None,
    credentials: tuple[str, str] | None = None,
    authenticator: Authenticator | None = None,
    automation_fetcher: Any = USE_DEFAULT_FETCHER,
) -> Blueprint:
    """Blueprint for mounting inside Airflow's api-server.

    Airflow 3 mounts plugin Flask blueprints under ``/pluginsv2``
    (``init_flask_plugins``), so with url_prefix ``/api/v2/openmetadata``
    the routes answer the server's ``/pluginsv2/api/v2/openmetadata``
    probe. The other two standalone prefixes do not exist under Airflow;
    the server probes them against the api-server's own FastAPI app and
    they 404 there, which is why the /pluginsv2 probe comes first.

    Airflow does not authenticate requests to plugin blueprints and the
    host Flask app carries no authenticator for them, so the blueprint
    installs its own authenticator as the process fallback (see
    ``security.set_fallback_authenticator``): explicit credentials first,
    otherwise the server env vars and the SimpleAuthManager passwords
    file the startup script maintains.
    """
    from flask import Blueprint

    backend = store or _default_store()
    auth = (
        authenticator
        if authenticator is not None
        else build_authenticator(credentials)
    )
    set_fallback_authenticator(auth)
    csrf_token = secrets.token_urlsafe(32)
    blueprint = Blueprint(
        "smartmetadata_airflow_apis", __name__, url_prefix="/api/v2/openmetadata"
    )
    _mount(
        blueprint, "", backend, _json_body, _reply, automation_fetcher,
        csrf_token, csrf=_fab_csrf(),
    )
    return blueprint


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
    # The standalone app always issues a CSRF token; the 12 exempt routes
    # do not validate it (in production the exemption is the FAB app's
    # CSRFProtect @csrf.exempt, matching the official plugin; here there
    # is no CSRFProtect at all, so the token only satisfies the client's
    # fetch-then-send flow).
    app.extensions["csrf_token"] = secrets.token_urlsafe(32)

    for prefix in API_PREFIXES:
        _mount(
            app,
            prefix,
            backend,
            _json_body,
            _reply,
            app.extensions["automation_fetcher"],
            app.extensions["csrf_token"],
        )
    return app


def _resolve_csrf_token(fallback: str) -> str:
    """Token the csrf-token route reports (ruling §2.1 row 13).

    Inside Airflow the Flask-WTF session token is the real one: the
    server echoes it as ``X-CSRFToken`` with the session cookie. Outside
    Airflow (standalone app, tests) there is no Flask-WTF session, so the
    self-issued token is reported instead — it is never validated by the
    exempt routes, it only satisfies the client's fetch-then-send flow.
    """
    try:
        from flask import session

        token = session.get("csrf_token") or session.get("_csrf_token")
        if token:
            return str(token)
    except RuntimeError:
        pass
    try:
        from flask_wtf.csrf import generate_csrf

        return str(generate_csrf())
    except Exception:
        return fallback


def _fab_csrf() -> Any | None:
    """The FAB app's CSRFProtect instance, when this runs inside Airflow.

    The official plugin exempts its routes through this exact object
    (``from airflow.providers.fab.www.app import csrf``); the exemption
    is registered on the instance that protects the host app, so a
    locally created instance would not exempt anything.
    """
    try:
        from airflow.providers.fab.www.app import csrf
    except ImportError:
        return None
    return csrf


def _mount(
    target: Any,
    prefix: str,
    store: DagStore,
    json_body: Callable[[], dict[str, Any]],
    reply: Callable,
    automation_fetcher: Any,
    csrf_token: str,
    csrf: Any | None = None,
) -> None:
    # Named view functions (not lambdas): Flask-WTF exemption is keyed on
    # ``__module__.__name__``, so every exempt route needs a distinct name.
    # The 12 exempt routes match the official plugin exactly (ruling §2.0):
    # every route except csrf-token carries @csrf.exempt there.
    # GET-only routes are never CSRF-validated, so exempting csrf-token as
    # well would be unobservable — the split is kept anyway so the
    # exemption list stays auditable against the official one.
    def health_view():
        return reply(handlers.health(store))

    def health_auth_view():
        return reply(handlers.health_auth(store))

    def csrf_token_view():
        return reply(handlers.csrf_token(_resolve_csrf_token(csrf_token)))

    def deploy_view():
        return reply(handlers.deploy(store, json_body()))

    def trigger_view():
        return reply(handlers.trigger(store, json_body()))

    def delete_view():
        return reply(handlers.delete(store, request.args.get("dag_id")))

    def enable_view():
        return reply(handlers.enable(store, json_body()))

    def disable_view():
        return reply(handlers.disable(store, json_body()))

    def status_view():
        return reply(
            handlers.status(
                store,
                request.args.get("dag_id"),
                run_id=request.args.get("run_id"),
                only_queued=request.args.get("only_queued") == "true",
            )
        )

    def kill_view():
        return reply(handlers.kill(store, json_body()))

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

    def ip_view():
        return reply(handlers.host_ip(store))

    def automation_view():
        return reply(
            handlers.run_automation(
                store, json_body(), fetch_workflow=automation_fetcher
            )
        )

    tag = prefix.replace("/", "_") or "_v2"

    def rule(path: str, name: str, view: Callable, methods: list[str],
             permission: str | None, *, exempt: bool) -> None:
        guarded = (
            require_permission(permission)(view) if permission is not None else view
        )
        if csrf is not None and exempt:
            guarded = csrf.exempt(guarded)
        target.add_url_rule(
            f"{prefix}{path}", endpoint=f"{name}{tag}",
            view_func=guarded, methods=methods,
        )

    rule("/health", "health", health_view, ["GET"], None, exempt=True)
    rule("/health-auth", "health_auth", health_auth_view, ["GET"], CREATE, exempt=True)
    rule("/csrf-token", "csrf_token", csrf_token_view, ["GET"], READ, exempt=False)
    rule("/deploy", "deploy", deploy_view, ["POST"], CREATE, exempt=True)
    rule("/trigger", "trigger", trigger_view, ["POST"], EDIT, exempt=True)
    rule("/delete", "delete", delete_view, ["DELETE"], DELETE, exempt=True)
    rule("/enable", "enable", enable_view, ["POST"], EDIT, exempt=True)
    rule("/disable", "disable", disable_view, ["POST"], EDIT, exempt=True)
    rule("/status", "status", status_view, ["GET"], READ, exempt=True)
    rule("/kill", "kill", kill_view, ["POST"], EDIT, exempt=True)
    rule("/last_dag_logs", "logs", logs_view, ["GET"], READ, exempt=True)
    rule("/ip", "ip", ip_view, ["GET"], EDIT, exempt=True)
    rule("/run_automation", "automation", automation_view, ["POST"], READ, exempt=True)
