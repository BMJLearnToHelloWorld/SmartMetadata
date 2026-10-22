# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Include/exclude matching for catalog names."""

from __future__ import annotations

from collections.abc import Iterable


def name_set(names: Iterable[str]) -> set[str]:
    return {name.lower() for name in names if name}


def is_selected(name: str, *, include: Iterable[str], exclude: Iterable[str]) -> bool:
    key = name.lower()
    include_set = name_set(include)
    exclude_set = name_set(exclude)
    if include_set and key not in include_set:
        return False
    return key not in exclude_set
