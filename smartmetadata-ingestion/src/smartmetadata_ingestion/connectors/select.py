# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Include/exclude matching for catalog names.

Official ``FilterPattern`` semantics (pin a3012259ca,
``metadata/utils/filters.py``): includes/excludes are regular
expressions matched from the start of the candidate name (``re.match``,
case-insensitive); ``.*`` includes everything; excludes win over
includes. The product used to match exact lowercased names, so any real
regex was rejected at deploy time instead of honored at run time (P-11).
"""

from __future__ import annotations

import re
from collections.abc import Iterable


def _matches(pattern: str, name: str) -> bool:
    """One regex against one candidate name (prefix match, case-insensitive)."""
    try:
        return re.match(pattern, name, re.IGNORECASE) is not None
    except re.error as exc:
        raise ValueError(f"invalid filter pattern {pattern!r}: {exc}") from exc


def is_selected(name: str, *, include: Iterable[str], exclude: Iterable[str]) -> bool:
    """Whether ``name`` passes an include/exclude regex pair.

    Excludes win: a name matching any exclude is out even if an include
    matches it. An empty include list means "everything" (``.*`` does
    the same explicitly). An invalid regex fails loudly instead of
    silently selecting nothing.
    """
    if any(_matches(pattern, name) for pattern in exclude):
        return False
    includes = list(include)
    if not includes:
        return True
    return any(_matches(pattern, name) for pattern in includes)


def is_selected_table(
    name: str,
    mapped_table_type: str,
    *,
    include_tables: Iterable[str],
    exclude_tables: Iterable[str],
    include_views: bool = True,
) -> bool:
    """Whether a table row is emitted: view gate first, then the table regex.

    ``mapped_table_type`` is the ``map_table_type`` value (``"View"`` /
    ``"MaterializedView"`` / ``"Regular"``). With ``include_views`` false,
    views never reach the sink however the table pattern reads.
    """
    if not include_views and mapped_table_type in {"View", "MaterializedView"}:
        return False
    return is_selected(name, include=include_tables, exclude=exclude_tables)
