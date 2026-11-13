# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Shared test-connection check helpers (pin ``Evidence`` / ``summary``).

The per-type check modules (``mysql_checks``, ``doris_checks``) share the
result shape and the summary phrasing; the SQL and the connect factory stay
per-type. Extracted unchanged from ``mysql_checks`` when Doris became the
second consumer, so no check module imports from another check module.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class Caveat:
    """Non-blocking advisory for an empty scope: a warning, never a failure."""

    title: str
    remediation: str


@dataclass(frozen=True, slots=True)
class Evidence:
    """What a check found: a human summary, the statement it ran, and an
    optional caveat (pin ``Evidence``)."""

    summary: str
    command: str | None = None
    caveat: Caveat | None = None


def _count(number: int, noun: str) -> str:
    """``3 tables`` / ``1 table`` (pin ``summary.count``)."""
    return f"{number} {noun if number == 1 else noun + 's'}"


def _enumerated(number: int, noun: str) -> str:
    """``3 tables enumerated`` / ``no tables enumerated`` (pin ``summary.enumerated``)."""
    if not number:
        return f"no {noun}s enumerated"
    return f"{_count(number, noun)} enumerated"


def _in_schema(kind: str, number: int, schema: str | None, auto_selected: bool) -> str:
    """``3 tables in schema 'sales'``; falls back to ``enumerated`` with no schema."""
    if schema is None:
        return _enumerated(number, kind)
    counted = _count(number, kind)
    if auto_selected:
        return (
            f"{counted} in schema '{schema}', "
            "auto-selected because no databaseSchema was configured"
        )
    return f"{counted} in schema '{schema}'"


def _empty_caveat(kind: str, scope: str) -> Caveat:
    """An empty reflection never raises: the catalog filters what the login
    cannot see, so "none visible" and "none exist" read identically."""
    return Caveat(
        title=f"No {kind}s visible in {scope}",
        remediation=(
            f"Verify the login can see the {kind}s (object permissions), "
            f"or confirm {scope} is not empty."
        ),
    )


def _one_line(sql: str) -> str:
    return " ".join(sql.split())


__all__ = [
    "Caveat",
    "Evidence",
    "_count",
    "_empty_caveat",
    "_enumerated",
    "_in_schema",
    "_one_line",
]
