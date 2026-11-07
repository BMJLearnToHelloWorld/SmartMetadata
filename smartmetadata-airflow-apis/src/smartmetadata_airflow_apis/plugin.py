# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Airflow plugin entry point: mounts the product REST routes in Airflow.

Airflow 3 mounts plugin Flask blueprints under ``/pluginsv2`` through a
WSGI app (``airflow.api_fastapi.core_api.app.init_flask_plugins``),
which requires the FAB provider; with url_prefix
``/api/v2/openmetadata`` the routes answer the server's
``/pluginsv2/api/v2/openmetadata`` probe. The blueprint authenticates
itself (see ``security.py``) because Airflow does not authenticate
requests to plugin blueprints.

The plugin degrades instead of failing the import when Airflow or FAB
is absent (``SmartMetadataPlugin is None``), so the package stays
importable — and its contract tests runnable — in environments without
Airflow. Entry points are only ever loaded by Airflow itself.
"""

from __future__ import annotations

from smartmetadata_airflow_apis.app import get_blueprint
from smartmetadata_airflow_apis.views.rest_api import RestApiView

PLUGIN_NAME = "smartmetadata_airflow_apis"

try:
    from airflow.plugins_manager import AirflowPlugin
except ImportError:
    AirflowPlugin = None  # type: ignore[assignment,misc]

# Built at import time: Airflow reads flask_blueprints off the plugin
# class, so the blueprint must exist before the class is defined.
api_blueprint = get_blueprint()

rest_api_view = (
    {"category": "Admin", "name": "REST API Plugin", "view": RestApiView()}
    if RestApiView is not None
    else None
)

if AirflowPlugin is not None:

    class SmartMetadataPlugin(AirflowPlugin):
        """Mounts the product REST routes inside Airflow."""

        name = PLUGIN_NAME
        operators = []  # noqa: RUF012
        hooks = []  # noqa: RUF012
        executors = []  # noqa: RUF012
        menu_links = []  # noqa: RUF012

        flask_blueprints = [api_blueprint]
        appbuilder_views = [rest_api_view] if rest_api_view else []
        admin_views = [rest_api_view] if rest_api_view else []

else:
    SmartMetadataPlugin = None  # type: ignore[assignment,misc]
