# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Catalog table-type mapping (moved verbatim from the deleted regex
view module: the mapping is unrelated to view parsing and the
metadata sources still need it)."""

from __future__ import annotations


def map_table_type(table_type: str) -> str:
    kind = (table_type or "").upper()
    if kind in {"VIEW", "METRIC_VIEW"}:
        return "View"
    if kind in {"MATERIALIZED_VIEW", "MATERIALIZED VIEW"}:
        return "MaterializedView"
    return "Regular"
