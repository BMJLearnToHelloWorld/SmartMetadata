# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Filesystem locations for generated DAGs and configs.

Resolution order mirrors the official plugin: an explicit env var first,
then ``airflow.cfg`` when Airflow is importable, then the ``$AIRFLOW_HOME``
fallback. All lookups are lazy so importing this package never requires
Airflow to be installed.
"""

from __future__ import annotations

import os
from pathlib import Path

ENV_GENERATED_CONFIGS = "AIRFLOW__OPENMETADATA_AIRFLOW_APIS__DAG_GENERATED_CONFIGS"
ENV_DAGS_FOLDER = "AIRFLOW__CORE__DAGS_FOLDER"
ENV_BASE_LOG_FOLDER = "AIRFLOW__LOGGING__BASE_LOG_FOLDER"


def _airflow_home() -> Path:
    return Path(os.environ.get("AIRFLOW_HOME", "/opt/airflow"))


def _cfg_value(section: str, key: str) -> str | None:
    try:
        from airflow.configuration import conf as airflow_conf
    except ImportError:
        return None
    try:
        return airflow_conf.get(section, key)
    except Exception:
        return None


def dag_generated_configs_dir() -> Path:
    env = os.environ.get(ENV_GENERATED_CONFIGS)
    if env:
        return Path(env)
    cfg = _cfg_value("openmetadata_airflow_apis", "DAG_GENERATED_CONFIGS")
    if cfg:
        return Path(cfg)
    return _airflow_home() / "dag_generated_configs"


def dags_folder() -> Path:
    env = os.environ.get(ENV_DAGS_FOLDER)
    if env:
        return Path(env)
    cfg = _cfg_value("core", "DAGS_FOLDER")
    if cfg:
        return Path(cfg)
    return _airflow_home() / "dags"


def base_log_folder() -> Path:
    env = os.environ.get(ENV_BASE_LOG_FOLDER)
    if env:
        return Path(env)
    cfg = _cfg_value("logging", "BASE_LOG_FOLDER")
    if cfg:
        return Path(cfg)
    return _airflow_home() / "logs"
