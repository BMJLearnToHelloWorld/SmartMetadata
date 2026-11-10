# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Profiler dataset abstraction (Wave 3 serial point 6).

Official ``get_dataset`` equivalent (pin ``a3012259ca``,
``sampler/sqlalchemy/sampler.py:281-293``): no sampling config -> the full
table (``raw_dataset``); PERCENTAGE -> ``ModuloFn(RandomNumFn(), 100)``
filter; ROW_COUNT -> ``LIMIT`` (``TOP`` on MSSQL); Snowflake uses
``TABLESAMPLE`` (its ``RandomNumFn`` returns 0 because the sample is
already taken by the clause).

The dataset is the FROM source every profiler metric reads — window,
composed and hybrid alike. ``SqlProfileReader.sample()``'s LIMIT-50
template is ``fetch_sample_data`` (write-back sampling), never the
profiler dataset: a LIMIT without ORDER BY is arbitrary rows, not a
random sample.

ADR:2026-11-10-profiler-window-hybrid-metrics
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING, Literal

from smartmetadata_ingestion.errors import WorkflowError

if TYPE_CHECKING:  # Runtime import would cycle: profile_sql imports this module.
    from smartmetadata_ingestion.connectors.profile_sql import SqlDialect

SampleType = Literal["PERCENTAGE", "ROW_COUNT"]
SamplingMethod = Literal["SYSTEM", "BERNOULLI"]

# Official RandomNumFn reduced modulo 100 (pin
# ``profiler/orm/functions/random_num.py`` + ``modulo.py``): rows are kept
# when the remainder is <= profileSample. Snowflake's RandomNumFn returns 0
# because its sampler takes the sample with TABLESAMPLE instead.
_RANDOM_SQL: dict[SqlDialect, str] = {
    "postgres": "ABS((RANDOM() * 100)::INTEGER) % 100",
    "mysql": "ABS(RAND()) * 100 % 100",
    "mariadb": "ABS(RAND()) * 100 % 100",
    "doris": "ABS(RAND()) * 100 % 100",
    "mssql": "ABS(CHECKSUM(NewId())) % 100",
    "snowflake": "0",
    "databricks": "ABS(RANDOM()) * 100 % 100",
}


@dataclass(frozen=True, slots=True)
class StaticSampleConfig:
    """Resolved static sampling config (official StaticSamplingConfig)."""

    profile_sample: float
    sample_type: SampleType = "PERCENTAGE"
    sampling_method: SamplingMethod | None = None


def resolve_sample_config(
    *configs: StaticSampleConfig | None,
) -> StaticSampleConfig | None:
    """Resolve the sampling config through the hierarchy, first non-None wins.

    Callers pass the levels in priority order: per-table config, then the
    workflow default. The server levels (entity ``tableProfilerConfig`` /
    schema / database) are parameters of the same shape, reserved for the
    server-pull wiring — today the workflow passes None for them
    (R-W3H-6-sampler-server-config).
    """
    for config in configs:
        if config is not None:
            return config
    return None


def _format_number(value: float) -> str:
    if value == int(value):
        return str(int(value))
    return repr(value)


def dataset_sql(
    dialect: SqlDialect,
    table_ident: str,
    *,
    sample_config: StaticSampleConfig | None,
) -> str:
    """Render the FROM source for the profiler dataset.

    No config -> the table itself. PERCENTAGE -> a derived table filtered
    on the dialect's random expression (Snowflake: TABLESAMPLE on the
    table). ROW_COUNT -> a LIMIT / TOP derived table (Snowflake:
    TABLESAMPLE ROW).
    """
    if sample_config is None:
        return table_ident
    profile_sample = sample_config.profile_sample
    if sample_config.sample_type == "PERCENTAGE":
        if not 0 < profile_sample <= 100:
            raise WorkflowError(
                f"PERCENTAGE profileSample must be in (0, 100], got {profile_sample!r}"
            )
        if dialect == "snowflake":
            method = sample_config.sampling_method or "BERNOULLI"
            return f"{table_ident} TABLESAMPLE {method} ({_format_number(profile_sample)})"
        random_sql = _RANDOM_SQL[dialect]
        return (
            f"(SELECT * FROM {table_ident} "
            f"WHERE {random_sql} <= {_format_number(profile_sample)}) AS _sample"
        )
    if not float(profile_sample).is_integer() or profile_sample < 1:
        raise WorkflowError(
            f"ROW_COUNT profileSample must be an integer >= 1, got {profile_sample!r}"
        )
    count = int(profile_sample)
    if dialect == "snowflake":
        return f"{table_ident} TABLESAMPLE ROW ({count} ROWS)"
    if dialect == "mssql":
        return f"(SELECT TOP ({count}) * FROM {table_ident}) AS _sample"
    return f"(SELECT * FROM {table_ident} LIMIT {count}) AS _sample"
