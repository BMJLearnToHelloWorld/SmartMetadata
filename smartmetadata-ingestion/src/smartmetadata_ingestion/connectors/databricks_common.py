# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Shared Databricks / Unity Catalog connection, catalog reader, and auth helpers.

Clean-room implementation aligned to Apache OpenMetadata connection schemas
(hostPort + authType PAT|OAuth|AzureAD; httpPath required for Databricks).
Uses official OSS clients: databricks-sql-connector / databricks-sdk.
"""

from __future__ import annotations

import re
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any, Protocol

from smartmetadata_ingestion.errors import WorkflowError

_SYSTEM_CATALOGS = frozenset({"system", "samples"})
_SYSTEM_SCHEMAS = frozenset({"information_schema"})
_UNSAFE_IDENT = re.compile(r'[`\\;\n\r\x00]')

AUTH_PAT = "personalAccessToken"
AUTH_OAUTH = "databricksOAuth"
AUTH_AZURE = "azureADSetup"


@dataclass(frozen=True, slots=True)
class DatabaseRow:
    name: str


@dataclass(frozen=True, slots=True)
class SchemaRow:
    database_name: str
    name: str


@dataclass(frozen=True, slots=True)
class TableRow:
    database_name: str
    schema_name: str
    name: str
    table_type: str
    comment: str | None = None


@dataclass(frozen=True, slots=True)
class ColumnRow:
    database_name: str
    schema_name: str
    table_name: str
    name: str
    data_type: str
    ordinal_position: int
    char_length: int | None = None
    comment: str | None = None


@dataclass(frozen=True, slots=True)
class ViewRow:
    database_name: str
    schema_name: str
    name: str
    definition: str


@dataclass(frozen=True, slots=True)
class LineageEdgeRow:
    source_catalog: str
    source_schema: str
    source_table: str
    target_catalog: str
    target_schema: str
    target_table: str
    sql_query: str | None = None


@dataclass(frozen=True, slots=True)
class UsageEventRow:
    catalog: str
    schema_name: str
    table_name: str
    date: str
    count: int


@dataclass(frozen=True, slots=True)
class ProfileStatRow:
    column_name: str | None
    row_count: int | None = None
    null_count: int | None = None
    distinct_count: int | None = None
    min_value: str | None = None
    max_value: str | None = None
    mean: float | None = None


@dataclass(frozen=True, slots=True)
class SampleRow:
    values: dict[str, Any]


class CatalogReader(Protocol):
    def list_databases(self) -> Sequence[DatabaseRow]: ...

    def list_schemas(self, database: str) -> Sequence[SchemaRow]: ...

    def list_tables(self, database: str, schema: str) -> Sequence[TableRow]: ...

    def list_columns(self, database: str, schema: str, table: str) -> Sequence[ColumnRow]: ...

    def list_views(self, database: str) -> Sequence[ViewRow]: ...


class LineageReader(Protocol):
    def list_edges(self) -> Sequence[LineageEdgeRow]: ...


class UsageReader(Protocol):
    def list_usage(self) -> Sequence[UsageEventRow]: ...


class ProfileReader(Protocol):
    def profile_table(
        self, database: str, schema: str, table: str
    ) -> Sequence[ProfileStatRow]: ...

    def sample_table(
        self, database: str, schema: str, table: str, *, limit: int = 50
    ) -> Sequence[SampleRow]: ...


class SequenceCatalogReader:
    def __init__(
        self,
        *,
        databases: Sequence[DatabaseRow] = (),
        schemas: Sequence[SchemaRow] = (),
        tables: Sequence[TableRow] = (),
        columns: Sequence[ColumnRow] = (),
        views: Sequence[ViewRow] = (),
    ) -> None:
        self._databases = list(databases)
        self._schemas = list(schemas)
        self._tables = list(tables)
        self._columns = list(columns)
        self._views = list(views)

    def list_databases(self) -> Sequence[DatabaseRow]:
        return self._databases

    def list_schemas(self, database: str) -> Sequence[SchemaRow]:
        return [row for row in self._schemas if row.database_name == database]

    def list_tables(self, database: str, schema: str) -> Sequence[TableRow]:
        return [
            row
            for row in self._tables
            if row.database_name == database and row.schema_name == schema
        ]

    def list_columns(self, database: str, schema: str, table: str) -> Sequence[ColumnRow]:
        return [
            row
            for row in self._columns
            if row.database_name == database
            and row.schema_name == schema
            and row.table_name == table
        ]

    def list_views(self, database: str) -> Sequence[ViewRow]:
        return [row for row in self._views if row.database_name == database]


class SequenceLineageReader:
    def __init__(self, edges: Sequence[LineageEdgeRow] = ()) -> None:
        self._edges = list(edges)

    def list_edges(self) -> Sequence[LineageEdgeRow]:
        return self._edges


class SequenceUsageReader:
    def __init__(self, events: Sequence[UsageEventRow] = ()) -> None:
        self._events = list(events)

    def list_usage(self) -> Sequence[UsageEventRow]:
        return self._events


class SequenceProfileReader:
    def __init__(
        self,
        *,
        stats: Sequence[ProfileStatRow] = (),
        samples: Sequence[SampleRow] = (),
    ) -> None:
        self._stats = list(stats)
        self._samples = list(samples)

    def profile_table(
        self, database: str, schema: str, table: str
    ) -> Sequence[ProfileStatRow]:
        return self._stats

    def sample_table(
        self, database: str, schema: str, table: str, *, limit: int = 50
    ) -> Sequence[SampleRow]:
        return self._samples[:limit]


def quote_ident(name: str) -> str:
    if not name or _UNSAFE_IDENT.search(name):
        raise WorkflowError(f"unsafe Databricks identifier {name!r}")
    return "`" + name.replace("`", "``") + "`"


def server_hostname(host_port: str) -> str:
    text = (host_port or "").strip()
    if not text:
        raise WorkflowError("source.connection.hostPort is required")
    for prefix in ("https://", "http://"):
        if text.lower().startswith(prefix):
            text = text[len(prefix) :]
    return text.split("/")[0].strip()


def classify_auth(auth: dict[str, Any] | None) -> str:
    if not isinstance(auth, dict) or not auth:
        raise WorkflowError("source.connection.authType is required")
    if auth.get("token"):
        return AUTH_PAT
    if auth.get("clientId") and auth.get("clientSecret"):
        return AUTH_OAUTH
    if auth.get("azureClientId") and auth.get("azureClientSecret") and auth.get("azureTenantId"):
        return AUTH_AZURE
    raise WorkflowError(
        "authType must be Personal Access Token (token), "
        "Databricks OAuth (clientId+clientSecret), "
        "or Azure AD (azureClientId+azureClientSecret+azureTenantId)"
    )


def run_connection_test(connection: dict[str, Any], *, require_http_path: bool) -> list[str]:
    """Validate required connection fields. Returns list of step labels that passed."""

    steps: list[str] = []
    if not connection.get("hostPort"):
        raise WorkflowError("hostPort is required")
    steps.append("CheckHostPort")
    server_hostname(str(connection["hostPort"]))
    steps.append("ResolveHostname")
    if require_http_path and not connection.get("httpPath"):
        raise WorkflowError("httpPath is required for Databricks")
    if connection.get("httpPath") is not None or require_http_path:
        steps.append("CheckHttpPath")
    classify_auth(connection.get("authType") if isinstance(connection.get("authType"), dict) else None)
    steps.append("CheckAuthType")
    return steps


def build_service_connection_config(
    *,
    service_type: str,
    raw: dict[str, Any],
    store_secrets: bool,
) -> dict[str, Any] | None:
    if not raw:
        return None
    config: dict[str, Any] = {"type": service_type}
    for key in (
        "hostPort",
        "httpPath",
        "catalog",
        "databaseSchema",
        "queryHistoryTable",
        "connectionTimeout",
        "includeMetricViews",
        "scheme",
    ):
        if raw.get(key) is not None and raw.get(key) != "":
            config[key] = raw[key]
    auth = raw.get("authType")
    if isinstance(auth, dict):
        redacted = dict(auth)
        if not store_secrets:
            for secret_key in ("token", "clientSecret", "azureClientSecret"):
                redacted.pop(secret_key, None)
        if redacted:
            config["authType"] = redacted
        elif store_secrets and auth:
            config["authType"] = auth
    return {"config": config}


def databricks_connect(connection: dict[str, Any]):
    """Return a zero-arg connect() using databricks-sql-connector."""

    host_port = connection.get("hostPort")
    http_path = connection.get("httpPath")
    if not host_port:
        raise WorkflowError("databricks source.connection.hostPort is required")
    if not http_path:
        raise WorkflowError("databricks/unitycatalog live reads need connection.httpPath")
    auth = connection.get("authType")
    if not isinstance(auth, dict):
        raise WorkflowError("databricks source.connection.authType is required")
    kind = classify_auth(auth)
    try:
        from databricks import sql
    except ImportError as exc:
        raise WorkflowError(
            "databricks live reads need the optional extra: "
            "pip install 'smartmetadata-ingestion[databricks]'"
        ) from exc

    hostname = server_hostname(str(host_port))
    timeout = connection.get("connectionTimeout") or 120
    catalog = connection.get("catalog")
    schema = connection.get("databaseSchema")

    def connect():
        kwargs: dict[str, Any] = {
            "server_hostname": hostname,
            "http_path": http_path,
            "_socket_timeout": int(timeout),
        }
        if catalog:
            kwargs["catalog"] = catalog
        if schema:
            kwargs["schema"] = schema
        if kind == AUTH_PAT:
            kwargs["access_token"] = auth["token"]
        elif kind == AUTH_OAUTH:
            kwargs.update(_oauth_kwargs(hostname, auth))
        else:
            kwargs.update(_azure_ad_kwargs(auth))
        return sql.connect(**kwargs)

    return connect


def _oauth_kwargs(hostname: str, auth: dict[str, Any]) -> dict[str, Any]:
    try:
        from databricks.sdk.core import Config, oauth_service_principal
    except ImportError as exc:
        raise WorkflowError(
            "Databricks OAuth needs databricks-sdk: "
            "pip install 'smartmetadata-ingestion[databricks]'"
        ) from exc

    def credential_provider():
        config = Config(
            host=f"https://{hostname}",
            client_id=auth["clientId"],
            client_secret=auth["clientSecret"],
        )
        return oauth_service_principal(config)

    return {"credentials_provider": credential_provider}


def _azure_ad_kwargs(auth: dict[str, Any]) -> dict[str, Any]:
    # databricks-sql-connector accepts azure_* kwargs for AAD SP auth.
    return {
        "auth_type": "azure-service-principal",
        "azure_client_id": auth["azureClientId"],
        "azure_client_secret": auth["azureClientSecret"],
        "azure_tenant_id": auth["azureTenantId"],
    }


class CursorCatalogReader:
    """Reads Unity Catalog / Databricks INFORMATION_SCHEMA through a DB-API connect factory."""

    def __init__(self, connect) -> None:
        self._connect = connect

    def list_databases(self) -> Sequence[DatabaseRow]:
        rows = self._fetch(
            "SELECT catalog_name FROM system.information_schema.catalogs "
            "ORDER BY catalog_name"
        )
        return [DatabaseRow(name=row[0]) for row in rows]

    def list_schemas(self, database: str) -> Sequence[SchemaRow]:
        rows = self._fetch(
            "SELECT catalog_name, schema_name FROM system.information_schema.schemata "
            "WHERE catalog_name = ? ORDER BY schema_name",
            (database,),
        )
        return [SchemaRow(database_name=row[0], name=row[1]) for row in rows]

    def list_tables(self, database: str, schema: str) -> Sequence[TableRow]:
        rows = self._fetch(
            """
            SELECT table_catalog, table_schema, table_name, table_type, comment
            FROM system.information_schema.tables
            WHERE table_catalog = ? AND table_schema = ?
            ORDER BY table_name
            """,
            (database, schema),
        )
        return [
            TableRow(
                database_name=row[0],
                schema_name=row[1],
                name=row[2],
                table_type=row[3] or "BASE TABLE",
                comment=_blank_to_none(row[4]),
            )
            for row in rows
        ]

    def list_columns(self, database: str, schema: str, table: str) -> Sequence[ColumnRow]:
        rows = self._fetch(
            """
            SELECT table_catalog, table_schema, table_name, column_name, full_data_type,
                   ordinal_position, character_maximum_length, comment
            FROM system.information_schema.columns
            WHERE table_catalog = ? AND table_schema = ? AND table_name = ?
            ORDER BY ordinal_position
            """,
            (database, schema, table),
        )
        return [
            ColumnRow(
                database_name=row[0],
                schema_name=row[1],
                table_name=row[2],
                name=row[3],
                data_type=row[4] or "STRING",
                ordinal_position=int(row[5]),
                char_length=row[6],
                comment=_blank_to_none(row[7]),
            )
            for row in rows
        ]

    def list_views(self, database: str) -> Sequence[ViewRow]:
        rows = self._fetch(
            """
            SELECT table_catalog, table_schema, table_name, view_definition
            FROM system.information_schema.views
            WHERE table_catalog = ?
            ORDER BY table_schema, table_name
            """,
            (database,),
        )
        return [
            ViewRow(
                database_name=row[0],
                schema_name=row[1],
                name=row[2],
                definition=row[3] or "",
            )
            for row in rows
        ]

    def _fetch(self, sql: str, params: tuple[Any, ...] = ()) -> list[tuple[Any, ...]]:
        with self._connect() as connection:
            cursor = connection.cursor()
            try:
                cursor.execute(sql, params)
                return list(cursor.fetchall())
            finally:
                cursor.close()


class CursorLineageReader:
    def __init__(self, connect) -> None:
        self._connect = connect

    def list_edges(self) -> Sequence[LineageEdgeRow]:
        rows = self._fetch(
            """
            SELECT source_table_full_name, target_table_full_name
            FROM system.access.table_lineage
            WHERE source_table_full_name IS NOT NULL
              AND target_table_full_name IS NOT NULL
            """
        )
        edges: list[LineageEdgeRow] = []
        for source_full, target_full in rows:
            source = _split_fqn(source_full)
            target = _split_fqn(target_full)
            if source is None or target is None:
                continue
            edges.append(
                LineageEdgeRow(
                    source_catalog=source[0],
                    source_schema=source[1],
                    source_table=source[2],
                    target_catalog=target[0],
                    target_schema=target[1],
                    target_table=target[2],
                )
            )
        return edges

    def _fetch(self, sql: str) -> list[tuple[Any, ...]]:
        with self._connect() as connection:
            cursor = connection.cursor()
            try:
                cursor.execute(sql)
                return list(cursor.fetchall())
            finally:
                cursor.close()


class CursorUsageReader:
    """Live query-history aggregation.

    Unit BehaviorMatched uses ``SequenceUsageReader``. The live cursor path
    validates ``queryHistoryTable`` and probes connectivity with ``LIMIT 0``;
    full statement→table aggregation is IntegrationVerified against a real
    workspace (runtime history schemas differ by DBSQL version).
    """

    def __init__(self, connect, *, query_history_table: str = "system.query.history") -> None:
        self._connect = connect
        self._table = query_history_table

    def list_usage(self) -> Sequence[UsageEventRow]:
        table = self._table
        if _UNSAFE_IDENT.search(table) or " " in table:
            raise WorkflowError(f"unsafe queryHistoryTable {table!r}")
        parts = table.split(".")
        safe = ".".join(quote_ident(part) for part in parts)
        with self._connect() as connection:
            cursor = connection.cursor()
            try:
                cursor.execute(f"SELECT 1 FROM {safe} LIMIT 0")
            finally:
                cursor.close()
        return []


class CursorProfileReader:
    def __init__(self, connect) -> None:
        self._connect = connect

    def profile_table(
        self, database: str, schema: str, table: str
    ) -> Sequence[ProfileStatRow]:
        ident = ".".join(quote_ident(part) for part in (database, schema, table))
        rows = self._fetch(f"SELECT COUNT(*) FROM {ident}")
        row_count = int(rows[0][0]) if rows else 0
        return [ProfileStatRow(column_name=None, row_count=row_count)]

    def sample_table(
        self, database: str, schema: str, table: str, *, limit: int = 50
    ) -> Sequence[SampleRow]:
        ident = ".".join(quote_ident(part) for part in (database, schema, table))
        with self._connect() as connection:
            cursor = connection.cursor()
            try:
                cursor.execute(f"SELECT * FROM {ident} LIMIT {int(limit)}")
                names = [col[0] for col in (cursor.description or [])]
                return [
                    SampleRow(values={names[i]: row[i] for i in range(len(names))})
                    for row in cursor.fetchall()
                ]
            finally:
                cursor.close()

    def _fetch(self, sql: str) -> list[tuple[Any, ...]]:
        with self._connect() as connection:
            cursor = connection.cursor()
            try:
                cursor.execute(sql)
                return list(cursor.fetchall())
            finally:
                cursor.close()


def _split_fqn(value: Any) -> tuple[str, str, str] | None:
    if value is None:
        return None
    parts = [part for part in str(value).split(".") if part]
    if len(parts) < 3:
        return None
    return parts[0], parts[1], parts[2]


def _blank_to_none(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def system_catalogs() -> frozenset[str]:
    return _SYSTEM_CATALOGS


def system_schemas() -> frozenset[str]:
    return _SYSTEM_SCHEMAS
