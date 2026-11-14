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

from collections.abc import Callable
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any, Literal

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

# Raw random expression per dialect, for ORDER BY randomization of a
# ROW_COUNT sample (``randomizedSample``). Distinct from ``_RANDOM_SQL``
# (the modulo-100 filter for PERCENTAGE sampling): Snowflake needs none
# here because TABLESAMPLE ROW is already random, and MSSQL orders by
# NEWID() since it has no RAND() row function.
_RANDOM_ORDER_SQL: dict[SqlDialect, str] = {
    "postgres": "RANDOM()",
    "mysql": "RAND()",
    "mariadb": "RAND()",
    "doris": "RAND()",
    "mssql": "NEWID()",
    "snowflake": "RANDOM()",
    "databricks": "RAND()",
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


# -- tableDiff sampling (P2-2, ruling §4.1) ----------------------------------
# The tableDiff sampling config comes from ONE place only — table1's
# ``table_profile_config.profileSampleConfig`` (a raw server dict, camelCase
# keys) — and resolves through the official ``resolve_static_sampling_config``
# semantics (pin ``sampler/config.py:230-255``). It shares the STATIC/DYNAMIC
# tier table with the profiler path, but NOT ``resolve_sample_config``'s
# hierarchy: there is no per-table -> workflow-default fallback here.
#
# ADR:2026-11-11-table-diff-sampling-disclosure


def _static_from_dict(config: dict[str, Any]) -> StaticSampleConfig | None:
    """One static tier (a threshold entry or a STATIC config) as a
    ``StaticSampleConfig``; ``None`` when it carries no sample value."""
    profile_sample = config.get("profileSample")
    if profile_sample is None:
        return None
    sample_type = config.get("profileSampleType")
    if sample_type == "ROWS":
        resolved_type: SampleType = "ROW_COUNT"
    elif sample_type == "PERCENTAGE":
        resolved_type = "PERCENTAGE"
    else:
        # An unknown type never silently samples: no sampling, full compare.
        return None
    method = config.get("samplingMethodType")
    return StaticSampleConfig(
        profile_sample=float(profile_sample),
        sample_type=resolved_type,
        sampling_method=method if method in ("SYSTEM", "BERNOULLI") else None,
    )


def _tiered_sample(row_count: int) -> StaticSampleConfig:
    """The official ``get_tiered_sample`` tiers (pin ``sampler/config.py``),
    verbatim: ≤100k → 100%, ≤1M → 50%, ≤10M → 10%, ≤100M → 5%, ≤1B → 1%,
    larger → 0.1%."""
    if row_count <= 100_000:
        return StaticSampleConfig(profile_sample=100, sample_type="PERCENTAGE")
    if row_count <= 1_000_000:
        return StaticSampleConfig(profile_sample=50, sample_type="PERCENTAGE")
    if row_count <= 10_000_000:
        return StaticSampleConfig(profile_sample=10, sample_type="PERCENTAGE")
    if row_count <= 100_000_000:
        return StaticSampleConfig(profile_sample=5, sample_type="PERCENTAGE")
    if row_count <= 1_000_000_000:
        return StaticSampleConfig(profile_sample=1, sample_type="PERCENTAGE")
    return StaticSampleConfig(profile_sample=0.1, sample_type="PERCENTAGE")


def resolve_dict_sample_config(
    profile_sample_config: dict[str, Any] | None,
    row_count: int,
) -> StaticSampleConfig | None:
    """Resolve a raw ``profileSampleConfig`` dict (camelCase keys) to a
    static config, or ``None`` for no sampling.

    The shared STATIC/DYNAMIC semantics for every consumer of the schema
    shape (tableDiff, the profiler's per-table config, the profiler
    pipeline config once dumped to a dict): DYNAMIC with ``smartSampling``
    takes the tiered sample for the row count; DYNAMIC with thresholds
    takes the largest threshold at or below the row count; STATIC takes
    its one tier; anything else (or a tier with no sample value) means no
    sampling. ``row_count`` is only meaningful for DYNAMIC configs —
    callers that resolve lazily must not fetch it for STATIC ones.
    """
    if not profile_sample_config:
        return None
    config_type = profile_sample_config.get("sampleConfigType")
    config = profile_sample_config.get("config") or {}
    if not isinstance(config, dict):
        return None
    if config_type == "DYNAMIC":
        if config.get("smartSampling"):
            return _tiered_sample(row_count)
        thresholds = config.get("thresholds") or []
        for threshold in sorted(
            thresholds,
            key=lambda item: item.get("rowCountThreshold", 0),
            reverse=True,
        ):
            if row_count >= threshold.get("rowCountThreshold", 0):
                return _static_from_dict(threshold)
        return None
    if config_type == "STATIC":
        return _static_from_dict(config)
    return None


def resolve_table_diff_sample_config(
    profile_sample_config: dict[str, Any] | None,
    *,
    row_count_fn: Callable[[], int | None],
) -> StaticSampleConfig | None:
    """Resolve a tableDiff sampling config to a static config (or ``None``
    for no sampling). ``row_count_fn`` (the left-table ``COUNT(*)``) is
    called only for DYNAMIC configs — a STATIC + PERCENTAGE config never
    needs the row count."""
    if not profile_sample_config:
        return None
    if profile_sample_config.get("sampleConfigType") != "DYNAMIC":
        return resolve_dict_sample_config(profile_sample_config, 0)
    return resolve_dict_sample_config(profile_sample_config, row_count_fn() or 0)


def _format_number(value: float) -> str:
    if value == int(value):
        return str(int(value))
    return repr(value)


def dataset_sql(
    dialect: SqlDialect,
    table_ident: str,
    *,
    sample_config: StaticSampleConfig | None,
    randomized: bool = False,
) -> str:
    """Render the FROM source for the profiler dataset.

    No config -> the table itself. PERCENTAGE -> a derived table filtered
    on the dialect's random expression (Snowflake: TABLESAMPLE on the
    table). ROW_COUNT -> a LIMIT / TOP derived table (Snowflake:
    TABLESAMPLE ROW). ``randomized`` (``randomizedSample``) only changes
    ROW_COUNT sampling: the rows are ordered by the dialect's random
    expression before the limit, so the sample is random instead of
    whatever order the engine returns. PERCENTAGE sampling is already
    random (the filter itself is random) and Snowflake TABLESAMPLE ROW
    is already random, so the flag is a no-op for those.
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
        order = f" ORDER BY {_RANDOM_ORDER_SQL[dialect]}" if randomized else ""
        return f"(SELECT TOP ({count}) * FROM {table_ident}{order}) AS _sample"
    order = f" ORDER BY {_RANDOM_ORDER_SQL[dialect]}" if randomized else ""
    return f"(SELECT * FROM {table_ident}{order} LIMIT {count}) AS _sample"
