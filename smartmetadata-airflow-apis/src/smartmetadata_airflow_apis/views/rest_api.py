# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Admin menu view listing the plugin REST endpoints.

Airflow 3's UI is FastAPI/React; plugin Flask blueprints are served
through the FAB compatibility app under ``/pluginsv2``, so this view is
a plain endpoint list, not a console. It exists so the plugin still has
an Admin menu entry, as the official plugin does. The view is absent
(``RestApiView is None``) when Flask-AppBuilder is not installed, so a
missing FAB install never breaks the REST routes.
"""

from __future__ import annotations

from smartmetadata_airflow_apis.contracts import ENDPOINTS

try:
    from flask_appbuilder import BaseView as AppBuilderBaseView
    from flask_appbuilder import expose as app_builder_expose
except ImportError:
    AppBuilderBaseView = None  # type: ignore[assignment,misc]
    app_builder_expose = None  # type: ignore[assignment,misc]


if AppBuilderBaseView is not None:

    class RestApiView(AppBuilderBaseView):
        """Endpoint list at the plugin's Admin menu entry."""

        @app_builder_expose("/")
        def list(self):  # noqa: A003 - route name, mirrors the official view
            rows = "".join(
                "<tr><td>{}</td><td>/api/v2/openmetadata/{}</td>"
                "<td>{}</td></tr>".format(
                    endpoint.method, endpoint.name, endpoint.description
                )
                for endpoint in ENDPOINTS
            )
            return (
                "<html><body><h1>SmartMetadata Airflow APIs</h1>"
                "<table><tr><th>Method</th><th>Path</th>"
                "<th>Description</th></tr>"
                f"{rows}</table></body></html>"
            )

else:
    RestApiView = None  # type: ignore[assignment,misc]
