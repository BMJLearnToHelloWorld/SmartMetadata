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
