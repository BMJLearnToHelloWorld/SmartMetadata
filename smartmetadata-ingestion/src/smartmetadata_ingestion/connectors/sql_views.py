# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Conservative FROM/JOIN parent extraction for view lineage."""

from __future__ import annotations

import re

_FROM_TABLE = re.compile(
    r'(?:from|join)\s+("?[A-Za-z_][\w$]*"?\.)?("?[A-Za-z_][\w$]*"?)',
    re.IGNORECASE,
)


def parse_view_parents(definition: str, default_schema: str) -> list[tuple[str, str]]:
    found: list[tuple[str, str]] = []
    seen: set[tuple[str, str]] = set()
    for match in _FROM_TABLE.finditer(definition or ""):
        schema = _unquote(match.group(1).rstrip(".")) if match.group(1) else default_schema
        table = _unquote(match.group(2))
        key = (schema, table)
        if key in seen:
            continue
        seen.add(key)
        found.append(key)
    return found


def _unquote(name: str) -> str:
    value = name.strip()
    if value.startswith('"') and value.endswith('"'):
        return value[1:-1].replace('""', '"')
    if value.startswith("`") and value.endswith("`"):
        return value[1:-1].replace("``", "`")
    return value


def map_table_type(table_type: str) -> str:
    kind = (table_type or "").upper()
    if kind == "VIEW":
        return "View"
    return "Regular"
