# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Builder registry: pipeline type -> DAG builder function."""

from __future__ import annotations

from typing import Any, Callable

Builder = Callable[[dict[str, Any]], Any]

_BUILDERS: dict[str, Builder] = {}


def register_builder(pipeline_type: str) -> Callable[[Builder], Builder]:
    def _put(builder: Builder) -> Builder:
        _BUILDERS[pipeline_type] = builder
        return builder

    return _put


def get_builder(pipeline_type: str) -> Builder | None:
    return _BUILDERS.get(pipeline_type)


def registered_types() -> tuple[str, ...]:
    return tuple(sorted(_BUILDERS))
