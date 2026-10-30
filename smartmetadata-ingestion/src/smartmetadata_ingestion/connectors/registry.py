# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""In-process source registry. ``source.type`` is the lookup key."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from smartmetadata_ingestion.config import SourceConfig
from smartmetadata_ingestion.errors import WorkflowError

SourceFactory = Callable[..., Any]

_FACTORIES: dict[str, SourceFactory] = {}


def register_source(type_name: str, factory: SourceFactory | None = None):
    """Register ``factory`` for ``type_name``. Usable as ``@register_source("mysql")``."""

    key = type_name.strip().lower()
    if not key:
        raise WorkflowError("source type name is required")

    def _put(impl: SourceFactory) -> SourceFactory:
        _FACTORIES[key] = impl
        return impl

    if factory is None:
        return _put
    return _put(factory)


def registered_source_types() -> tuple[str, ...]:
    return tuple(sorted(_FACTORIES))


def get_source(type_name: str, config: SourceConfig, **kwargs: Any):
    factory = _FACTORIES.get(type_name.strip().lower())
    if factory is None:
        known = ", ".join(registered_source_types()) or "(none registered)"
        raise WorkflowError(f"unsupported source type {type_name!r}; known types: {known}")
    return factory(config, **kwargs)


def load_builtin_sources() -> None:
    """Import built-in connector modules so they can register themselves."""
    from smartmetadata_ingestion.connectors import base as _base  # noqa: F401
    from smartmetadata_ingestion.connectors import kafka as _kafka  # noqa: F401
    from smartmetadata_ingestion.connectors import mysql as _mysql  # noqa: F401
    from smartmetadata_ingestion.connectors import postgres as _postgres  # noqa: F401
    from smartmetadata_ingestion.connectors import snowflake as _snowflake  # noqa: F401
    from smartmetadata_ingestion.connectors import databricks as _databricks  # noqa: F401
    from smartmetadata_ingestion.connectors import databricks_lineage as _databricks_lineage  # noqa: F401
    from smartmetadata_ingestion.connectors import databricks_usage as _databricks_usage  # noqa: F401
    from smartmetadata_ingestion.connectors import unitycatalog as _unitycatalog  # noqa: F401
    from smartmetadata_ingestion.connectors import unitycatalog_lineage as _unitycatalog_lineage  # noqa: F401
    from smartmetadata_ingestion.connectors import unitycatalog_usage as _unitycatalog_usage  # noqa: F401
