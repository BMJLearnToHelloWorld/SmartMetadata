# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Response envelope for the plugin routes.

Success is always 200 with the body as-is. Errors carry ``{"error": msg}``;
for status >= 500 the message is replaced with a generic sentence so
internal details never leak to the caller.
"""

from __future__ import annotations

from typing import Any

GENERIC_SERVER_ERROR = "An unexpected problem occurred"


def success(body: Any, status: int = 200) -> tuple[Any, int]:
    return body, status


def error(status: int, message: str) -> tuple[dict[str, str], int]:
    if status >= 500:
        message = GENERIC_SERVER_ERROR
    return {"error": message}, status


def bad_request(message: str) -> tuple[dict[str, str], int]:
    return error(400, message)


def not_found(message: str = "Resource not found") -> tuple[dict[str, str], int]:
    return error(404, message)


def server_error() -> tuple[dict[str, str], int]:
    return error(500, GENERIC_SERVER_ERROR)
