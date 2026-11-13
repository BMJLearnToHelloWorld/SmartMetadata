# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Doris test-connection checks (pin ``test_connection_db_schema_sources`` mirror).

Each check returns an :class:`Evidence` (summary + executed command +
optional non-blocking caveat) or raises :class:`WorkflowError`; the runner
in :mod:`smartmetadata_ingestion.automations.execute` turns the outcome
into a TestConnectionStepResult per the official step contract
(ADR:2026-11-11-test-connection-failed-steps-are-results). The definition
has exactly 4 steps — CheckAccess, GetSchemas, GetTables, GetViews — and
no GetQueries step (the pin defines no ``queries`` for Doris). The SQL
mirrors the live ``CursorCatalogReader`` probes in ``doris_common``.
"""

from __future__ import annotations

import logging
from collections.abc import Callable
from typing import Any

from smartmetadata_ingestion.automations.checks_common import (
    Evidence,
    _empty_caveat,
    _enumerated,
    _in_schema,
    _one_line,
)
from smartmetadata_ingestion.connectors import doris_common
from smartmetadata_ingestion.errors import WorkflowError

logger = logging.getLogger(__name__)

_LIST_SCHEMAS_SQL = "SELECT schema_name FROM information_schema.schemata ORDER BY schema_name"
_LIST_TABLES_SQL = """
    SELECT table_schema, table_name, table_type, table_comment
    FROM information_schema.tables
    WHERE table_schema = %s
    ORDER BY table_name
    """
_LIST_VIEWS_SQL = """
    SELECT table_schema, table_name, view_definition
    FROM information_schema.views
    ORDER BY table_schema, table_name
    """


class DorisChecks:
    """Test-connection checks for Doris (pin ``test_connection_db_schema_sources``).

    The connect factory is built lazily so a localhost failure can be
    retried against the Docker host before any step runs (the retry only
    swaps the factory; the step that failed is re-run, not skipped).
    """

    def __init__(self, config: dict[str, Any], *, connect=None):
        self._config = dict(config)
        self._connect = connect

    def checks(self) -> dict[str, Callable[[], Evidence]]:
        return {
            "CheckAccess": self.check_access,
            "GetSchemas": self.get_schemas,
            "GetTables": self.get_tables,
            "GetViews": self.get_views,
        }

    def check_access(self) -> Evidence:
        try:
            doris_common.test_live_connection(self._config, connect=self._factory())
        except WorkflowError:
            host_port = str(self._config.get("hostPort") or "")
            if "localhost" not in host_port:
                raise
            # Same container reasoning as the MySQL checks: the plugin runs
            # in a container, where "localhost" means the container itself,
            # so a failed localhost test is retried once against the Docker host.
            retried = dict(self._config)
            retried["hostPort"] = host_port.replace("localhost", "host.docker.internal")
            logger.info("doris test connection retrying localhost as host.docker.internal")
            self._config = retried
            self._connect = None
            doris_common.test_live_connection(self._config, connect=self._factory())
        return Evidence(summary="connection established", command="SELECT 1")

    def get_schemas(self) -> Evidence:
        rows = self._fetch(_LIST_SCHEMAS_SQL)
        names = [row[0] for row in rows]
        return Evidence(
            summary=_enumerated(len(names), "schema"),
            command=_LIST_SCHEMAS_SQL,
            caveat=None if names else _empty_caveat("schema", "the database"),
        )

    def get_tables(self) -> Evidence:
        schema, auto_selected = self._resolve_schema()
        rows = self._fetch(_LIST_TABLES_SQL, (schema,)) if schema is not None else []
        return Evidence(
            summary=_in_schema("table", len(rows), schema, auto_selected),
            command=_one_line(_LIST_TABLES_SQL),
            caveat=None
            if rows
            else _empty_caveat("table", f"schema '{schema}'" if schema else "the database"),
        )

    def get_views(self) -> Evidence:
        schema, auto_selected = self._resolve_schema()
        rows = self._fetch(_LIST_VIEWS_SQL)
        if schema is not None:
            rows = [row for row in rows if row[0] == schema]
        # An empty view list is normal — no caveat (pin list_views).
        return Evidence(
            summary=_in_schema("view", len(rows), schema, auto_selected),
            command=_one_line(_LIST_VIEWS_SQL),
        )

    def _resolve_schema(self) -> tuple[str | None, bool]:
        """The schema to probe, and whether it was auto-selected.

        Falls back to the first non-system schema so the checks still probe
        real data, then to the connected database (pin's inspector with no
        schema lists the current database).
        """
        configured = self._config.get("databaseSchema")
        if configured:
            return str(configured), False
        avoid = {name.lower() for name in doris_common.system_schemas()}
        for row in self._fetch(_LIST_SCHEMAS_SQL):
            name = str(row[0])
            if name.lower() not in avoid:
                return name, True
        connected = self._config.get("databaseName") or self._config.get("database")
        if connected:
            return str(connected), False
        return None, False

    def _factory(self):
        if self._connect is None:
            self._connect = doris_common.doris_connect(self._config)
        return self._connect

    def _fetch(self, sql: str, params: tuple[Any, ...] = ()) -> list[tuple[Any, ...]]:
        try:
            with self._factory()() as connection:
                cursor = connection.cursor()
                try:
                    cursor.execute(sql, params)
                    return list(cursor.fetchall())
                finally:
                    cursor.close()
        except WorkflowError:
            raise
        except Exception as exc:  # noqa: BLE001 - surfaced as a workflow error
            raise WorkflowError(f"doris test connection failed: {exc}") from exc


__all__ = ["DorisChecks"]
