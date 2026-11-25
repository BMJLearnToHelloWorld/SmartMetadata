# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Build catalog FQNs. Quote a part only when it would break dotted paths."""

from __future__ import annotations

_QUOTE_CHARS = frozenset('.()"')


def quote_name(part: str) -> str:
    if not part:
        raise ValueError("FQN part must not be empty")
    if any(char in part for char in _QUOTE_CHARS):
        return '"' + part.replace('"', '\\"') + '"'
    return part


def build_fqn(*parts: str) -> str:
    return ".".join(quote_name(part) for part in parts)


def parent_fqn(fqn: str) -> str:
    """The parent FQN: everything but the last segment.

    Dots inside a double-quoted segment do not split (``quote_name``
    quotes exactly the parts that would break a dotted path, escaping
    an inner quote as ``\\"``), so a quoted column such as
    ``svc.db.public."weird.name".id`` still yields its table
    ``svc.db.public."weird.name"``. A single-segment FQN has no
    parent and raises, like ``quote_name`` on an empty part.
    """
    parts: list[str] = []
    current: list[str] = []
    quoted = False
    index = 0
    while index < len(fqn):
        char = fqn[index]
        if quoted and char == "\\" and index + 1 < len(fqn):
            current.append(char)
            current.append(fqn[index + 1])
            index += 2
            continue
        if char == '"':
            quoted = not quoted
            current.append(char)
            index += 1
            continue
        if char == "." and not quoted:
            parts.append("".join(current))
            current = []
            index += 1
            continue
        current.append(char)
        index += 1
    if quoted:
        raise ValueError(f"unbalanced quotes in fqn {fqn!r}")
    parts.append("".join(current))
    if len(parts) < 2:
        raise ValueError(f"fqn {fqn!r} has no parent")
    return ".".join(parts[:-1])
