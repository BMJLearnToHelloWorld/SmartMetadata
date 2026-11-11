# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Profiler dataset abstraction (Wave 3 serial point 6).

Dataset SQL per dialect (official RandomNumFn + ModuloFn + Snowflake
TABLESAMPLE), resolution hierarchy, and the workflow config surface.
"""

from __future__ import annotations

import pytest

from smartmetadata_ingestion.config import ProfilerSampleSpec, ProfilerTableSampleSpec
from smartmetadata_ingestion.data_quality.sampling import (
    StaticSampleConfig,
    dataset_sql,
    resolve_sample_config,
    resolve_table_diff_sample_config,
)
from smartmetadata_ingestion.errors import WorkflowError

TABLE = '"analytics"."public"."orders"'


def test_dataset_sql_no_config_returns_table() -> None:
    for dialect in ("postgres", "mysql", "mariadb", "doris", "mssql", "snowflake", "databricks"):
        assert dataset_sql(dialect, TABLE, sample_config=None) == TABLE


def test_dataset_sql_percentage_per_dialect() -> None:
    config = StaticSampleConfig(profile_sample=10)
    assert dataset_sql("postgres", TABLE, sample_config=config) == (
        f"(SELECT * FROM {TABLE} WHERE ABS((RANDOM() * 100)::INTEGER) % 100 <= 10) AS _sample"
    )
    assert dataset_sql("mysql", TABLE, sample_config=config) == (
        f"(SELECT * FROM {TABLE} WHERE ABS(RAND()) * 100 % 100 <= 10) AS _sample"
    )
    assert dataset_sql("mssql", TABLE, sample_config=config) == (
        f"(SELECT * FROM {TABLE} WHERE ABS(CHECKSUM(NewId())) % 100 <= 10) AS _sample"
    )
    assert dataset_sql("databricks", TABLE, sample_config=config) == (
        f"(SELECT * FROM {TABLE} WHERE ABS(RANDOM()) * 100 % 100 <= 10) AS _sample"
    )
    # MariaDB and Doris share the MySQL random expression.
    for dialect in ("mariadb", "doris"):
        assert dataset_sql(dialect, TABLE, sample_config=config) == (
            f"(SELECT * FROM {TABLE} WHERE ABS(RAND()) * 100 % 100 <= 10) AS _sample"
        )


def test_dataset_sql_percentage_snowflake_tablesample() -> None:
    bernoulli = StaticSampleConfig(profile_sample=25)
    assert dataset_sql("snowflake", TABLE, sample_config=bernoulli) == (
        f"{TABLE} TABLESAMPLE BERNOULLI (25)"
    )
    system = StaticSampleConfig(profile_sample=25, sampling_method="SYSTEM")
    assert dataset_sql("snowflake", TABLE, sample_config=system) == (
        f"{TABLE} TABLESAMPLE SYSTEM (25)"
    )


def test_dataset_sql_row_count_per_dialect() -> None:
    config = StaticSampleConfig(profile_sample=100, sample_type="ROW_COUNT")
    assert dataset_sql("postgres", TABLE, sample_config=config) == (
        f"(SELECT * FROM {TABLE} LIMIT 100) AS _sample"
    )
    assert dataset_sql("mysql", TABLE, sample_config=config) == (
        f"(SELECT * FROM {TABLE} LIMIT 100) AS _sample"
    )
    assert dataset_sql("mssql", TABLE, sample_config=config) == (
        f"(SELECT TOP (100) * FROM {TABLE}) AS _sample"
    )
    assert dataset_sql("snowflake", TABLE, sample_config=config) == (
        f"{TABLE} TABLESAMPLE ROW (100 ROWS)"
    )


def test_dataset_sql_rejects_invalid_sample() -> None:
    with pytest.raises(WorkflowError, match="PERCENTAGE"):
        dataset_sql("postgres", TABLE, sample_config=StaticSampleConfig(profile_sample=0))
    with pytest.raises(WorkflowError, match="PERCENTAGE"):
        dataset_sql("postgres", TABLE, sample_config=StaticSampleConfig(profile_sample=101))
    with pytest.raises(WorkflowError, match="ROW_COUNT"):
        dataset_sql(
            "postgres",
            TABLE,
            sample_config=StaticSampleConfig(profile_sample=0.5, sample_type="ROW_COUNT"),
        )
    with pytest.raises(WorkflowError, match="ROW_COUNT"):
        dataset_sql(
            "postgres",
            TABLE,
            sample_config=StaticSampleConfig(profile_sample=0, sample_type="ROW_COUNT"),
        )


def test_resolve_sample_config_first_non_none_wins() -> None:
    default = StaticSampleConfig(profile_sample=10)
    table = StaticSampleConfig(profile_sample=50)
    assert resolve_sample_config(None, None) is None
    assert resolve_sample_config(table, default) is table
    assert resolve_sample_config(None, default) is default


def test_sample_spec_validates_and_converts() -> None:
    spec = ProfilerSampleSpec.model_validate({"profileSample": 10})
    assert spec.to_static() == StaticSampleConfig(profile_sample=10.0)
    spec = ProfilerSampleSpec.model_validate(
        {
            "profileSample": 100,
            "profileSampleType": "ROW_COUNT",
            "samplingMethodType": "SYSTEM",
        }
    )
    assert spec.to_static() == StaticSampleConfig(
        profile_sample=100.0, sample_type="ROW_COUNT", sampling_method="SYSTEM"
    )
    with pytest.raises(ValueError, match="PERCENTAGE"):
        ProfilerSampleSpec.model_validate({"profileSample": 0})
    with pytest.raises(ValueError, match="PERCENTAGE"):
        ProfilerSampleSpec.model_validate({"profileSample": 101})
    with pytest.raises(ValueError, match="ROW_COUNT"):
        ProfilerSampleSpec.model_validate({"profileSample": 0.5, "profileSampleType": "ROW_COUNT"})


def test_table_sample_spec_requires_fqn() -> None:
    spec = ProfilerTableSampleSpec.model_validate(
        {"tableFqn": "warehouse.analytics.public.orders", "profileSample": 25}
    )
    assert spec.table_fqn == "warehouse.analytics.public.orders"
    assert spec.to_static() == StaticSampleConfig(profile_sample=25.0)
    with pytest.raises(ValueError, match="tableFqn is required"):
        ProfilerTableSampleSpec.model_validate({"tableFqn": "  ", "profileSample": 25})


# -- tableDiff sampling (P2-2, ruling §4.1) ---------------------------------


def _static(profile_sample, sample_type="PERCENTAGE", method=None):
    config = {
        "sampleConfigType": "STATIC",
        "config": {
            "profileSample": profile_sample,
            "profileSampleType": sample_type,
            **({"samplingMethodType": method} if method else {}),
        },
    }
    return config


def _dynamic(thresholds=None, smart=False):
    return {
        "sampleConfigType": "DYNAMIC",
        "config": {
            "smartSampling": smart,
            **({"thresholds": thresholds} if thresholds is not None else {}),
        },
    }


def test_resolve_table_diff_sample_config_missing_is_none() -> None:
    assert resolve_table_diff_sample_config(None, row_count_fn=lambda: 10) is None
    assert resolve_table_diff_sample_config({}, row_count_fn=lambda: 10) is None
    assert (
        resolve_table_diff_sample_config(
            {"sampleConfigType": "STATIC", "config": {}},
            row_count_fn=lambda: 10,
        )
        is None
    )


def test_resolve_table_diff_sample_config_static() -> None:
    assert resolve_table_diff_sample_config(
        _static(50), row_count_fn=lambda: 10
    ) == StaticSampleConfig(profile_sample=50, sample_type="PERCENTAGE")
    # ROWS maps to the product ROW_COUNT name.
    assert resolve_table_diff_sample_config(
        _static(1000, "ROWS"), row_count_fn=lambda: 10
    ) == StaticSampleConfig(profile_sample=1000, sample_type="ROW_COUNT")
    assert resolve_table_diff_sample_config(
        _static(25, method="BERNOULLI"), row_count_fn=lambda: 10
    ) == StaticSampleConfig(
        profile_sample=25, sample_type="PERCENTAGE", sampling_method="BERNOULLI"
    )
    # No sample value / unknown type -> no sampling, never a crash.
    assert (
        resolve_table_diff_sample_config(
            _static(None), row_count_fn=lambda: 10
        )
        is None
    )
    assert (
        resolve_table_diff_sample_config(
            _static(50, "WEEKLY"), row_count_fn=lambda: 10
        )
        is None
    )


def test_resolve_table_diff_sample_config_static_never_counts_rows() -> None:
    """STATIC + PERCENTAGE must not take the row count."""

    def _boom() -> int:
        raise AssertionError("row_count_fn must not be called for STATIC")

    assert resolve_table_diff_sample_config(_static(50), row_count_fn=_boom) is not None


def test_resolve_table_diff_sample_config_dynamic_thresholds() -> None:
    calls = []

    def _count() -> int:
        calls.append(1)
        return 750_000

    config = resolve_table_diff_sample_config(
        _dynamic(
            [
                {
                "rowCountThreshold": 100_000,
                "profileSample": 50,
                "profileSampleType": "PERCENTAGE",
            },
                {
                "rowCountThreshold": 1_000_000,
                "profileSample": 10,
                "profileSampleType": "PERCENTAGE",
            },
                {
                "rowCountThreshold": 500_000,
                "profileSample": 25,
                "profileSampleType": "PERCENTAGE",
            },
            ]
        ),
        row_count_fn=_count,
    )
    # Thresholds sort descending; 750k matches the 500k tier, not the 100k one.
    assert config == StaticSampleConfig(profile_sample=25, sample_type="PERCENTAGE")
    assert len(calls) == 1  # the row count is taken once, for DYNAMIC only

    assert (
        resolve_table_diff_sample_config(
            _dynamic(
                [
                    {
                        "rowCountThreshold": 1_000_000,
                        "profileSample": 10,
                        "profileSampleType": "PERCENTAGE",
                    }
                ]
            ),
            row_count_fn=lambda: 10,
        )
        is None
    )  # no tier matches


@pytest.mark.parametrize(
    ("row_count", "expected"),
    [
        (50_000, 100),
        (100_000, 100),
        (500_000, 50),
        (1_000_000, 50),
        (5_000_000, 10),
        (10_000_000, 10),
        (50_000_000, 5),
        (100_000_000, 5),
        (500_000_000, 1),
        (1_000_000_000, 1),
        (2_000_000_000, 0.1),
    ],
)
def test_resolve_table_diff_sample_config_smart_sampling_tiers(row_count, expected) -> None:
    config = resolve_table_diff_sample_config(
        _dynamic(smart=True), row_count_fn=lambda: row_count
    )
    assert config == StaticSampleConfig(profile_sample=expected, sample_type="PERCENTAGE")
