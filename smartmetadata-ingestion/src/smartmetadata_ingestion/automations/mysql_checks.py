# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""MySQL test-connection checks (definition-driven, pin ``MySQLChecks`` mirror).

Each check returns an :class:`Evidence` (summary + executed command +
optional non-blocking caveat) or raises :class:`WorkflowError`; the runner
in :mod:`smartmetadata_ingestion.automations.execute` turns the outcome
into a TestConnectionStepResult per the official step contract
(ADR:2026-11-11-test-connection-failed-steps-are-results). The SQL mirrors
the live ``CursorCatalogReader`` probes in ``mysql_common``.
"""

from __future__ import annotations

import logging
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from smartmetadata_ingestion.connectors import mysql_common
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
# Pin MYSQL_TEST_GET_QUERIES / MYSQL_TEST_GET_QUERIES_SLOW_LOGS verbatim.
_GENERAL_LOG_SQL = "SELECT `argument` from {table} limit 1;"
_SLOW_LOG_SQL = "SELECT `sql_text` from {table} limit 1;"


@dataclass(frozen=True, slots=True)
class Caveat:
    """Non-blocking advisory for an empty scope: a warning, never a failure."""

    title: str
    remediation: str


@dataclass(frozen=True, slots=True)
class Evidence:
    """What a check found: a human summary, the statement it ran, and an
    optional caveat (pin ``Evidence``)."""

    summary: str
    command: str | None = None
    caveat: Caveat | None = None


def _count(number: int, noun: str) -> str:
    """``3 tables`` / ``1 table`` (pin ``summary.count``)."""
    return f"{number} {noun if number == 1 else noun + 's'}"


def _enumerated(number: int, noun: str) -> str:
    """``3 tables enumerated`` / ``no tables enumerated`` (pin ``summary.enumerated``)."""
    if not number:
        return f"no {noun}s enumerated"
    return f"{_count(number, noun)} enumerated"


def _in_schema(kind: str, number: int, schema: str | None, auto_selected: bool) -> str:
    """``3 tables in schema 'sales'``; falls back to ``enumerated`` with no schema."""
    if schema is None:
        return _enumerated(number, kind)
    counted = _count(number, kind)
    if auto_selected:
        return (
            f"{counted} in schema '{schema}', "
            "auto-selected because no databaseSchema was configured"
        )
    return f"{counted} in schema '{schema}'"


def _empty_caveat(kind: str, scope: str) -> Caveat:
    """An empty reflection never raises: the catalog filters what the login
    cannot see, so "none visible" and "none exist" read identically."""
    return Caveat(
        title=f"No {kind}s visible in {scope}",
        remediation=(
            f"Verify the login can see the {kind}s (object permissions), "
            f"or confirm {scope} is not empty."
        ),
    )


def _one_line(sql: str) -> str:
    return " ".join(sql.split())


def _queries_statement(config: dict[str, Any]) -> str:
    """Pin ``_test_queries_statement``: slow log or general log, with the
    configured history table when one is set."""
    if config.get("useSlowLogs"):
        template, default_table = _SLOW_LOG_SQL, "mysql.slow_log"
    else:
        template, default_table = _GENERAL_LOG_SQL, "mysql.general_log"
    table = config.get("queryHistoryTable") or default_table
    return template.format(table=table)


class MysqlChecks:
    """Test-connection checks for MySQL (pin ``MySQLChecks``).

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
            "GetQueries": self.get_queries,
        }

    def check_access(self) -> Evidence:
        try:
            mysql_common.test_live_connection(self._config, connect=self._factory())
        except WorkflowError:
            host_port = str(self._config.get("hostPort") or "")
            if "localhost" not in host_port:
                raise
            # Official runner quirk (kept from _test_mysql): the plugin runs
            # in a container, where "localhost" means the container itself,
            # so a failed localhost test is retried once against the Docker host.
            retried = dict(self._config)
            retried["hostPort"] = host_port.replace("localhost", "host.docker.internal")
            logger.info("mysql test connection retrying localhost as host.docker.internal")
            self._config = retried
            self._connect = None
            mysql_common.test_live_connection(self._config, connect=self._factory())
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

    def get_queries(self) -> Evidence:
        statement = _queries_statement(self._config)
        self._fetch(statement)
        return Evidence(summary="query history accessible", command=statement.strip())

    def _resolve_schema(self) -> tuple[str | None, bool]:
        """The schema to probe, and whether it was auto-selected.

        Falls back to the first non-system schema so the checks still probe
        real data, then to the connected database (pin's inspector with no
        schema lists the current database).
        """
        configured = self._config.get("databaseSchema")
        if configured:
            return str(configured), False
        avoid = {name.lower() for name in mysql_common.system_schemas()}
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
            self._connect = mysql_common.mysql_connect(self._config)
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
            raise WorkflowError(f"mysql test connection failed: {exc}") from exc


__all__ = ["Caveat", "Evidence", "MysqlChecks"]
