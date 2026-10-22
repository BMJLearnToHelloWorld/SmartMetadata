# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Expand ${VAR} and ${VAR:-default} in config values. Secrets stay in the environment."""

from __future__ import annotations

import os
import re
from typing import Any

from smartmetadata_ingestion.errors import WorkflowError

_ENV_PATTERN = re.compile(r"\$\{([A-Za-z_][A-Za-z0-9_]*)(?::-([^}]*))?\}")


def expand_string(value: str, environ: dict[str, str] | None = None) -> str:
    env = environ if environ is not None else os.environ

    def replace(match: re.Match[str]) -> str:
        name = match.group(1)
        default = match.group(2)
        if name in env:
            return env[name]
        if default is not None:
            return default
        raise WorkflowError(f"environment variable {name} is not set")

    return _ENV_PATTERN.sub(replace, value)


def expand_value(value: Any, environ: dict[str, str] | None = None) -> Any:
    if isinstance(value, str):
        return expand_string(value, environ)
    if isinstance(value, list):
        return [expand_value(item, environ) for item in value]
    if isinstance(value, dict):
        return {key: expand_value(item, environ) for key, item in value.items()}
    return value
