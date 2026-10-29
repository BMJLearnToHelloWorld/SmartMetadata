# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0


class IngestError(Exception):
    """Base error for the clean-room ingestion package."""


class WorkflowError(IngestError):
    """Invalid workflow configuration or run setup."""


class WorkflowInitializationError(WorkflowError):
    """A workflow source, processor, or sink could not be prepared."""


class WorkflowExecutionError(WorkflowError):
    """A prepared workflow could not finish successfully."""


class WorkflowTeardownError(WorkflowError):
    """A workflow step could not flush or close."""


class RestError(IngestError):
    """A catalog REST call failed."""

    def __init__(self, message: str, *, status_code: int | None = None, body: str | None = None):
        super().__init__(message)
        self.status_code = status_code
        self.body = body
