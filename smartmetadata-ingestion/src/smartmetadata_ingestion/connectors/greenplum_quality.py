# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Greenplum data-quality test-suite interface."""

from __future__ import annotations

from typing import Any, Callable

from smartmetadata_ingestion.records import TestCaseResultRecord


class GreenplumTestSuiteInterface:
    def __init__(self, execute: Callable[[str], Any] | None = None) -> None:
        self._execute = execute

    def run_test_case(
        self,
        *,
        test_case_fqn: str,
        timestamp: int,
        expression: str,
        expected: Any = True,
    ) -> TestCaseResultRecord:
        if self._execute is None:
            raise RuntimeError("execute callback is required for live DQ")
        actual = self._execute(expression)
        passed = actual == expected
        return TestCaseResultRecord(
            test_case_fqn=test_case_fqn,
            timestamp=timestamp,
            test_case_status="Success" if passed else "Failed",
            test_result_value=[
                {"name": "actual", "value": str(actual)},
                {"name": "expected", "value": str(expected)},
            ],
            result="passed" if passed else "failed",
        )
