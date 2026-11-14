# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Clean-room SQL parsing core for the usage/lineage chain.

The parsing engine is the MIT-licensed ``collate-sqllineage`` library;
this package is the fresh glue around it — cascade, dialect map,
masking, T-SQL rewrite — specified by design-sql-parsing §3.2. The
interface exported here is frozen for the lineage worker.
"""

from __future__ import annotations

from smartmetadata_ingestion.lineage.dialect import (
    CONNECTION_TYPE_DIALECTS,
    Dialect,
    dialect_for_connection_type,
)
from smartmetadata_ingestion.lineage.masking import MASK_PLACEHOLDER, mask_query
from smartmetadata_ingestion.lineage.parser import (
    LINEAGE_PARSING_TIMEOUT,
    PARSER_SQLFLUFF,
    PARSER_SQLGLOT,
    PARSER_SQLPARSE,
    LineageParser,
    QueryParserType,
    QueryParsingError,
    QueryParsingFailures,
    TableColumn,
    TableColumnJoin,
    clean_raw_query,
    clean_table_name,
    query_hash_of,
    query_parsing_failures,
    resolve_parser_type,
)
from smartmetadata_ingestion.lineage.tsql import rewrite_switch_statements

__all__ = [
    "CONNECTION_TYPE_DIALECTS",
    "LINEAGE_PARSING_TIMEOUT",
    "MASK_PLACEHOLDER",
    "PARSER_SQLFLUFF",
    "PARSER_SQLGLOT",
    "PARSER_SQLPARSE",
    "Dialect",
    "LineageParser",
    "QueryParserType",
    "QueryParsingError",
    "QueryParsingFailures",
    "TableColumn",
    "TableColumnJoin",
    "clean_raw_query",
    "clean_table_name",
    "dialect_for_connection_type",
    "mask_query",
    "query_hash_of",
    "query_parsing_failures",
    "resolve_parser_type",
    "rewrite_switch_statements",
]
