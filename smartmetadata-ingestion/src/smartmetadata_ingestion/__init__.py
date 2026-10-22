# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Clean-room SmartMetadata ingestion framework (Apache-2.0)."""

from smartmetadata_ingestion.errors import IngestError, RestError, WorkflowError

__all__ = ["IngestError", "RestError", "WorkflowError", "__version__"]
__version__ = "0.6.0"
