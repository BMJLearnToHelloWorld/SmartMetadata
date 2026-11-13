# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Parse nested STRUCT/ARRAY/MAP type strings into column dicts.

Behavior is aligned to the in-tree official helpers
``ingestion/src/metadata/ingestion/source/database/column_helpers.py``
(``parse_complex_column_type``) and
``column_type_parser.py`` (``_parse_datatype_string`` and its helpers).
This is a clean-room reimplementation in the Apache product tree; do not
paste the Collate-licensed official sources here.
"""

from __future__ import annotations

import logging
import re
from typing import Any

logger = logging.getLogger(__name__)

# Official ColumnTypeParser._BRACKETS.
_BRACKETS = {"(": ")", "[": "]", "{": "}", "<": ">"}

# Official ColumnTypeParser._FIXED_DECIMAL.
_FIXED_DECIMAL = re.compile(r"(decimal|numeric)(\(\s*(\d+)\s*(?:,\s*(\d+)\s*)?\))?")

# Official ColumnTypeParser._SOURCE_TYPE_TO_OM_TYPE entries needed to
# resolve nested Doris field types the same way the official parser does
# (POINT -> GEOMETRY, etc.). This is the typemap the official complex-type
# parser consults, not the Doris top-level ``_parse_type`` self-name rule.
_PARSER_SOURCE_TYPE_TO_OM: dict[str, str] = {
    "ARRAY": "ARRAY",
    "BIGINT": "BIGINT",
    "BIT": "BIT",
    "BOOL": "BOOLEAN",
    "BOOLEAN": "BOOLEAN",
    "CHAR": "CHAR",
    "DATE": "DATE",
    "DATEV2": "DATE",
    "DATETIME": "DATETIME",
    "DATETIMEV2": "DATETIME",
    "DECIMAL": "DECIMAL",
    "DOUBLE": "DOUBLE",
    "FLOAT": "FLOAT",
    "GEOMETRY": "GEOMETRY",
    "INT": "INT",
    "INTEGER": "INT",
    "JSON": "JSON",
    "LARGEINT": "LARGEINT",
    "MAP": "MAP",
    "MEDIUMINT": "INT",
    "MEDIUMTEXT": "MEDIUMTEXT",
    "NUMERIC": "NUMERIC",
    "POINT": "GEOMETRY",
    "POLYGON": "GEOMETRY",
    "SMALLINT": "SMALLINT",
    "STRING": "STRING",
    "STRUCT": "STRUCT",
    "TEXT": "TEXT",
    "TIMESTAMP": "TIMESTAMP",
    "TINYINT": "TINYINT",
    "UNKNOWN": "UNKNOWN",
    "VARCHAR": "VARCHAR",
    "VARIANT": "JSON",
    "YEAR": "YEAR",
}


def parse_complex_column_type(type_str: str) -> dict[str, Any] | None:
    """Parse a nested STRUCT/ARRAY/MAP type string.

    Official ``parse_complex_column_type``: take the name before ``(`` / ``<``,
    strip a trailing V2/V3 suffix, and only then parse STRUCT/ARRAY/MAP.
    Primitives return None. A string the parser cannot handle also returns
    None (the official path logs a warning and ingests the column without
    children — it does not invent a substitute query or shape).
    """
    field_base = type_str.split("(", maxsplit=1)[0].split("<", maxsplit=1)[0].upper()
    if len(field_base) >= 2 and field_base[-2:].lower() in ("v2", "v3"):
        field_base = field_base[:-2]
    if field_base not in ("STRUCT", "ARRAY", "MAP"):
        return None
    try:
        parsed = _parse_datatype_string(_colonize_field_type(type_str.lower()))
    except ValueError:
        logger.warning(
            "Failed to parse nested type %s, ingesting it without child fields",
            type_str,
        )
        return None
    if isinstance(parsed, dict):
        return parsed
    return None


def extract_child(data: str) -> str | None:
    """Inner type of ARRAY/STRUCT, e.g. ``ARRAY<INT(11)>`` -> ``INT(11)``.

    Official ``extract_child`` in ``doris/metadata.py``. Returns None when
    the string has no ``<...>`` pair; the official regex would raise, and
    the official column loop would skip that column. The fork never drops
    a column on type mapping, so a missing inner type leaves children /
    arrayDataType unset instead.
    """
    result = re.findall(r"(?<=<).+(?=>)", data)
    return result[0] if result else None


def extract_number(data: str) -> list[int]:
    """Lengths / precision args inside ``()``, official ``extract_number``.

    ``CHAR(1)`` -> ``[1]``; ``DECIMAL(9,0)`` -> ``[9, 0]``; a non-digit
    token such as ``VARCHAR(*)`` becomes ``1``.
    """
    result = re.findall(r"\((.*?)\)", data)
    if not result:
        return []
    values: list[int] = []
    for token in result[0].split(","):
        text = token.strip()
        values.append(int(text) if text.isdigit() else 1)
    return values


def doris_parse_type(raw_type: str) -> str:
    """Official Doris ``_parse_type``: name before ``(`` / ``<``, then a V-strip.

    ``CHAR(1)`` -> ``CHAR``, ``STRUCT<a:int>`` -> ``STRUCT``,
    ``DECIMALV3(9, 0)`` -> ``DECIMAL``, ``DATEV2`` -> ``DATE``.
    Applied blindly this mangles ``IPV4`` / ``IPV6``; callers that need
    the recorded lookup-before-strip correction should use
    ``map_doris_type`` instead of this function.
    """
    parse_type = raw_type.split("(")[0].split("<")[0]
    if len(parse_type) >= 2 and parse_type[-2] == "v":
        system_data_type = parse_type.split("v")[0].upper()
    else:
        system_data_type = parse_type.upper()
    return system_data_type


def _colonize_field_type(field_type: str) -> str:
    """Rewrite struct fields to ``name:type``; leave ``decimal(10, 2)`` alone."""
    field_type = field_type.strip()
    if not field_type.endswith(">"):
        return field_type
    base = field_type.split("<", 1)[0].lower()
    if base == "struct":
        inner = field_type[len("struct<") : -1]
        parts = _ignore_brackets_split(inner, ",")
        colonized = (_colonize_field_name(part) for part in parts)
        return f"struct<{','.join(colonized)}>"
    if base == "array":
        element = field_type[len("array<") : -1]
        return f"array<{_colonize_field_type(element)}>"
    return field_type


def _colonize_field_name(part: str) -> str:
    """Turn ``name type`` or ``name:type`` into ``name:type`` for one field."""
    part = part.strip()
    space_idx = part.find(" ")
    colon_idx = part.find(":")
    if colon_idx != -1 and (space_idx == -1 or colon_idx < space_idx):
        name, _, rest = part.partition(":")
    else:
        name, _, rest = part.partition(" ")
    if not rest:
        return part
    name = name.strip().strip("`")
    return f"{name}:{_colonize_field_type(rest)}"


def _parse_datatype_string(data_type: str) -> dict[str, Any] | list[Any]:
    data_type = data_type.lower().strip()
    data_type = data_type.replace(" ", "")
    if data_type.startswith("array<"):
        if data_type[-1] != ">":
            raise ValueError(f"expected '>' found: {data_type}")
        arr_data_type = _parse_primitive_datatype_string(data_type[6:-1])["dataType"]
        data_type_string: dict[str, Any] = {
            "dataType": "ARRAY",
            "arrayDataType": arr_data_type,
            "dataTypeDisplay": data_type,
        }
        if arr_data_type == "STRUCT":
            data_type_string["children"] = _parse_struct_fields_string(
                data_type[6:-1][7:-1]
            )["children"]
        return data_type_string
    if data_type.startswith("map<"):
        if data_type[-1] != ">":
            raise ValueError(f"expected '>' found: {data_type}")
        parts = _ignore_brackets_split(data_type[4:-1], ",")
        if len(parts) != 2:
            raise ValueError(
                "The map type string format is: 'map<key_type,value_type>', "
                + f"but got: {data_type}"
            )
        return {"dataType": "MAP", "dataTypeDisplay": data_type}
    if data_type.startswith("uniontype<") or data_type.startswith("union<"):
        if data_type[-1] != ">":
            raise ValueError(f"'>' should be the last char, but got: {data_type}")
        union_body = (
            data_type[10:-1] if data_type.startswith("uniontype<") else data_type[6:-1]
        )
        return [
            _parse_datatype_string(part)
            for part in _ignore_brackets_split(union_body, ",")
        ]
    if data_type.startswith("struct<"):
        if data_type[-1] != ">":
            raise ValueError(f"expected '>', found: {data_type}")
        return _parse_struct_fields_string(data_type[7:-1])
    if ":" in data_type:
        return _parse_struct_fields_string(data_type)
    return _parse_primitive_datatype_string(data_type)


def _parse_struct_fields_string(struct_type: str) -> dict[str, Any]:
    parts = _ignore_brackets_split(struct_type, ",", skip_no_child_validation=True)
    columns: list[dict[str, Any]] = []
    for part in parts:
        name_and_type = _ignore_brackets_split(part, ":")
        if len(name_and_type) < 2:
            raise ValueError(
                "expected format is: 'field_name:field_type', " + f"but got: {part}"
            )
        field_type_string = name_and_type[-1]
        field_name = ":".join(name_and_type[:-1]).strip()
        if field_name.startswith("`"):
            if field_name[-1] != "`":
                raise ValueError(f"'`' should be the last char, but got: {struct_type}")
            field_name = field_name[1:-1]
        field_type = _parse_datatype_string(field_type_string)
        if not isinstance(field_type, dict):
            raise ValueError(f"expected a field type, but got: {part}")
        field_type["name"] = field_name
        columns.append(field_type)
    return {
        "children": columns,
        "dataTypeDisplay": f"struct<{struct_type or 'unknown'}>",
        "dataType": "STRUCT",
    }


def _parser_column_type(dtype: str) -> str | None:
    """Official ``get_column_type`` typemap lookup, then strip ``(`` / ``<``."""
    direct = _PARSER_SOURCE_TYPE_TO_OM.get(dtype.upper())
    if direct:
        return direct
    base = dtype.split("(", maxsplit=1)[0].split("<")[0].upper()
    return _PARSER_SOURCE_TYPE_TO_OM.get(base) or _PARSER_SOURCE_TYPE_TO_OM.get("UNKNOWN")


def _parse_primitive_datatype_string(dtype: str) -> dict[str, Any]:
    if dtype.upper() in _PARSER_SOURCE_TYPE_TO_OM:
        return {
            "dataType": _PARSER_SOURCE_TYPE_TO_OM[dtype.upper()],
            "dataTypeDisplay": dtype,
        }
    decimal_match = _FIXED_DECIMAL.match(dtype)
    if decimal_match:
        parsed: dict[str, Any] = {
            "dataType": _parser_column_type(decimal_match.group(0)) or "DECIMAL",
            "dataTypeDisplay": dtype,
        }
        if decimal_match.group(3) is not None:
            parsed["precision"] = int(decimal_match.group(3))
        if decimal_match.group(4) is not None:
            parsed["scale"] = int(decimal_match.group(4))
        return parsed
    if dtype == "date":
        return {"dataType": "DATE", "dataTypeDisplay": dtype}
    if dtype == "timestamp":
        return {"dataType": "TIMESTAMP", "dataTypeDisplay": dtype}
    data_type = _parser_column_type(dtype)
    if not data_type:
        return {"dataType": "NULL", "dataTypeDisplay": dtype}
    data_length = 1
    match = re.match(r".*\(([\w]*)\)", dtype)
    if match:
        try:
            data_length = int(match.groups()[0])
        except ValueError:
            data_length = 1
    return {
        "dataType": data_type,
        "dataTypeDisplay": data_type,
        "dataLength": data_length,
    }


def _ignore_brackets_split(
    string: str, separator: str, skip_no_child_validation: bool = False
) -> list[str]:
    """Split on a separator that is not inside ``()`` / ``<>`` / ``[]`` / ``{}``."""
    parts: list[str] = []
    buf = ""
    level = 0
    closing = {end: start for start, end in _BRACKETS.items()}
    for char in string:
        if char in _BRACKETS:
            level += 1
            buf += char
        elif char in closing:
            if level == 0:
                raise ValueError(f"Brackets are not correctly paired: {string}")
            level -= 1
            buf += char
        elif char == separator and level > 0:
            buf += char
        elif char == separator:
            parts.append(buf)
            buf = ""
        else:
            buf += char
    if len(buf) == 0 and not skip_no_child_validation:
        raise ValueError(f"The {separator} cannot be the last char: {string}")
    if buf:
        parts.append(buf)
    return parts
