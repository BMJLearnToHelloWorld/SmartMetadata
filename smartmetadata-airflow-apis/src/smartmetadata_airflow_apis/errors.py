# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Typed failures raised by backends; handlers map them to HTTP statuses."""

from __future__ import annotations


class ValidationError(Exception):
    """The request body fails shape validation. Carries field locations only."""

    def __init__(self, problems: list[str]) -> None:
        super().__init__("; ".join(problems))
        self.problems = problems


class UnknownDagError(Exception):
    """The named DAG is not registered."""

    def __init__(self, dag_id: str) -> None:
        super().__init__(f"DAG {dag_id} not found.")
        self.dag_id = dag_id


class NoRunsError(Exception):
    """The DAG has no running or pending runs to act on."""

    def __init__(self, dag_id: str) -> None:
        super().__init__(
            f"Workflow [{dag_id}] has no running or pending runs nor tasks"
        )
        self.dag_id = dag_id


class DagOperationError(Exception):
    """The operation failed (bad DAG state, failed registration, IO)."""


class AutomationError(Exception):
    """An automation workflow could not be executed."""
