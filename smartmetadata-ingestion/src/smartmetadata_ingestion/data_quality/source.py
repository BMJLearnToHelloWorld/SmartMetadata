# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Server-pulled TestSuite source (official ``TestSuiteSource`` equivalent).

Pulls the suite → cases → definition parameters from the catalog REST API
and returns them grouped by table, ready for the validator builder. The
pull is fail-closed: a missing suite/table, an unreachable server, a table
with no executable suite, or a suite with zero cases raises
``WorkflowError`` at prepare time. It never falls back to the inline
``TestCaseSpec`` path.

ADR:2026-11-08-test-suite-server-pull
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

from smartmetadata_ingestion.data_quality.models import (
    PulledTestCase,
    TableContext,
)
from smartmetadata_ingestion.errors import RestError, WorkflowError

if TYPE_CHECKING:
    from smartmetadata_ingestion.client.rest import RestClient

_TABLE_FIELDS = "columns,tableProfilerConfig,testSuite"


@dataclass(frozen=True)
class PulledSuite:
    """One table with the pulled test cases that run against it."""

    table: TableContext
    cases: tuple[PulledTestCase, ...]


def pull_test_cases(
    client: RestClient,
    *,
    entity_fqn: str | None = None,
    service_name: str,
    test_case_names: list[str] | None = None,
) -> list[PulledSuite]:
    """Pull test cases for a table suite or a logical suite.

    ``entity_fqn`` names the table of a table suite; without it, the
    logical suite named ``service_name`` is pulled (official
    ``TestSuiteSource._process_logical_suite``). ``test_case_names``
    filters by case name, like official ``TestSuitePipeline.testCases``.
    """
    wanted = {name for name in (test_case_names or []) if name}
    if entity_fqn:
        return [_pull_table_suite(client, entity_fqn, wanted)]
    return _pull_logical_suite(client, service_name, wanted)


def _pull_table_suite(client: RestClient, entity_fqn: str, wanted: set[str]) -> PulledSuite:
    table_payload = _get_table(client, entity_fqn)
    table = TableContext.from_table_entity(table_payload, fqn=entity_fqn)
    suite_ref = table_payload.get("testSuite") or {}
    suite_id = suite_ref.get("id") if isinstance(suite_ref, dict) else None
    if not isinstance(suite_id, str) or not suite_id:
        raise WorkflowError(
            f"table {entity_fqn!r} has no executable test suite; "
            "create one in the UI before running a server-pulled TestSuite "
            "workflow (the workflow does not auto-create an empty suite)"
        )
    try:
        suite = client.get_test_suite_by_id(suite_id)
    except RestError as exc:
        raise _pull_failed(f"test suite {suite_id!r} for table {entity_fqn!r}", exc) from exc
    if not isinstance(suite, dict) or not suite.get("id"):
        raise WorkflowError(f"test suite {suite_id!r} for table {entity_fqn!r} was not found")
    cases = _list_cases(client, suite_id, wanted)
    if not cases:
        raise WorkflowError(
            f"test suite {suite.get('name') or suite_id!r} for table "
            f"{entity_fqn!r} has no test cases"
            + (" matching the configured names" if wanted else "")
        )
    return PulledSuite(table=table, cases=tuple(cases))


def _pull_logical_suite(
    client: RestClient, service_name: str, wanted: set[str]
) -> list[PulledSuite]:
    try:
        suite = client.get_test_suite_by_name(service_name)
    except RestError as exc:
        raise _pull_failed(f"logical test suite {service_name!r}", exc) from exc
    suite_id = suite.get("id") if isinstance(suite, dict) else None
    if not isinstance(suite_id, str) or not suite_id:
        raise WorkflowError(f"logical test suite {service_name!r} was not found")
    cases = _list_cases(client, suite_id, wanted)
    if not cases:
        raise WorkflowError(
            f"logical test suite {service_name!r} has no test cases"
            + (" matching the configured names" if wanted else "")
        )
    grouped: dict[str, list[PulledTestCase]] = {}
    for case in cases:
        grouped.setdefault(case.table_fqn(), []).append(case)
    suites: list[PulledSuite] = []
    for table_fqn, group in grouped.items():
        table_payload = _get_table(client, table_fqn)
        suites.append(
            PulledSuite(
                table=TableContext.from_table_entity(table_payload, fqn=table_fqn),
                cases=tuple(group),
            )
        )
    return suites


def _list_cases(client: RestClient, suite_id: str, wanted: set[str]) -> list[PulledTestCase]:
    try:
        raw = list(client.list_test_cases(test_suite_id=suite_id))
    except RestError as exc:
        raise _pull_failed(f"test cases of suite {suite_id!r}", exc) from exc
    cases = [PulledTestCase.from_dict(item) for item in raw]
    if wanted:
        cases = [case for case in cases if case.name in wanted]
    return cases


def _get_table(client: RestClient, fqn: str) -> dict[str, Any]:
    try:
        payload = client.get_table_by_name(fqn, fields=_TABLE_FIELDS)
    except RestError as exc:
        raise _pull_failed(f"table {fqn!r}", exc) from exc
    if not isinstance(payload, dict) or not payload.get("id"):
        raise WorkflowError(f"table {fqn!r} was not found")
    return payload


def _pull_failed(what: str, exc: RestError) -> WorkflowError:
    if exc.status_code == 404:
        return WorkflowError(
            f"could not pull {what} from the server: not found (HTTP 404); "
            "the server-pulled TestSuite path never falls back to inline "
            "test cases"
        )
    return WorkflowError(f"could not pull {what} from the server: {exc}")
