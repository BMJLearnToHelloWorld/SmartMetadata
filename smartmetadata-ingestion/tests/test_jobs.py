# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

import pytest

from smartmetadata_ingestion.errors import WorkflowError
from smartmetadata_ingestion.jobs import ProfilerJob, QualityJob


def test_profiler_and_quality_are_stubs() -> None:
    with pytest.raises(WorkflowError, match="Phase 6"):
        ProfilerJob().run()
    with pytest.raises(WorkflowError, match="Phase 6"):
        QualityJob().run()
