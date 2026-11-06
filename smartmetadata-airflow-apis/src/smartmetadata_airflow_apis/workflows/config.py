# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Stored pipeline config loading.

The config file is the IngestionPipeline JSON the server sent at deploy
time. It is read as-is: no ``${VAR}`` expansion, because expanding it
would rewrite free text the pipeline editor stored (e.g. a query or a
filter) with host environment values.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any


class ConfigurationError(Exception):
    """The stored config file is missing or unusable."""


def load_config_file(path: str | Path) -> dict[str, Any]:
    file = Path(path)
    if not file.is_file():
        raise ConfigurationError(f"workflow config file not found: {path}")
    try:
        data = json.loads(file.read_text(encoding="utf-8"))
    except ValueError as exc:
        raise ConfigurationError(f"workflow config file is not valid JSON: {path}") from exc
    if not isinstance(data, dict):
        raise ConfigurationError(f"workflow config file must hold an object: {path}")
    return data
