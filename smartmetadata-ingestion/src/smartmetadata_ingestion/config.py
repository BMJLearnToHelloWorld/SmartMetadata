# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""YAML/JSON workflow configuration. Secrets come from the environment, not the file."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Literal
from urllib.parse import urlparse

import yaml
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from smartmetadata_ingestion.errors import WorkflowError
from smartmetadata_ingestion.expand import expand_value


def _to_camel(name: str) -> str:
    head, *tail = name.split("_")
    return head + "".join(part.capitalize() for part in tail)


class CamelModel(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        populate_by_name=True,
        alias_generator=_to_camel,
    )


class AuthConfig(CamelModel):
    type: Literal["jwt", "login"] = "jwt"
    jwt_token: str | None = None
    email: str | None = None
    password: str | None = None

    @model_validator(mode="after")
    def require_credentials(self) -> AuthConfig:
        if self.type == "jwt" and not (self.jwt_token and self.jwt_token.strip()):
            raise ValueError("auth.jwtToken is required when auth.type is jwt")
        if self.type == "login":
            if not (self.email and self.email.strip()):
                raise ValueError("auth.email is required when auth.type is login")
            if not (self.password and self.password.strip()):
                raise ValueError("auth.password is required when auth.type is login")
        return self


class ServerConfig(CamelModel):
    host_port: str
    auth: AuthConfig
    timeout_seconds: float = 30.0
    retry_attempts: int = 3

    @field_validator("host_port")
    @classmethod
    def strip_host(cls, value: str) -> str:
        host = value.strip().rstrip("/")
        if not host:
            raise ValueError("server.hostPort is required")
        path = urlparse(host).path
        if path in {"", "/"}:
            return f"{host}/api"
        return host

    @field_validator("retry_attempts")
    @classmethod
    def cap_retries(cls, value: int) -> int:
        if value < 0 or value > 8:
            raise ValueError("server.retryAttempts must be between 0 and 8")
        return value


class WorkflowSettings(CamelModel):
    name: str
    type: Literal["metadata"] = "metadata"
    fail_fast: bool = False


class SourceConfig(CamelModel):
    type: Literal["postgres", "static"]
    service_name: str
    service_display_name: str | None = None
    connection: dict[str, Any] = Field(default_factory=dict)
    include_schemas: list[str] = Field(default_factory=list)
    exclude_schemas: list[str] = Field(
        default_factory=lambda: ["information_schema", "pg_catalog", "pg_toast"]
    )
    include_view_lineage: bool = False
    store_connection_secrets: bool = False
    records: list[dict[str, Any]] = Field(default_factory=list)

    @field_validator("service_name")
    @classmethod
    def require_service_name(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("source.serviceName is required")
        return value.strip()


class ProcessorConfig(CamelModel):
    type: str
    options: dict[str, Any] = Field(default_factory=dict)


class SinkConfig(CamelModel):
    type: Literal["metadata-rest"] = "metadata-rest"


class LineageEndpointConfig(CamelModel):
    type: str
    fqn: str


class LineageSpec(CamelModel):
    from_entity: LineageEndpointConfig
    to_entity: LineageEndpointConfig
    description: str | None = None
    source: str = "Manual"
    sql_query: str | None = None


class WorkflowConfig(CamelModel):
    workflow: WorkflowSettings
    server: ServerConfig
    source: SourceConfig
    processors: list[ProcessorConfig] = Field(default_factory=list)
    sink: SinkConfig = Field(default_factory=SinkConfig)
    lineage: list[LineageSpec] = Field(default_factory=list)


def load_raw_config(path: Path) -> dict[str, Any]:
    text = path.read_text(encoding="utf-8")
    suffix = path.suffix.lower()
    if suffix in {".yaml", ".yml"}:
        loaded = yaml.safe_load(text)
    elif suffix == ".json":
        loaded = json.loads(text)
    else:
        raise WorkflowError(f"unsupported config suffix {path.suffix}; use .yaml, .yml, or .json")
    if not isinstance(loaded, dict):
        raise WorkflowError("workflow config must be a mapping")
    return loaded


def load_workflow_config(
    path: Path,
    *,
    environ: dict[str, str] | None = None,
) -> WorkflowConfig:
    raw = expand_value(load_raw_config(path), environ)
    try:
        return WorkflowConfig.model_validate(raw)
    except Exception as exc:
        raise WorkflowError(f"invalid workflow config {path}: {exc}") from exc
