# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

import pytest

from smartmetadata_ingestion.errors import WorkflowError
from smartmetadata_ingestion.expand import expand_value


def test_expands_nested_mapping() -> None:
    raw = {"a": ["${X}", 1], "b": {"c": "${Y:-fallback}"}}
    assert expand_value(raw, {"X": "one"}) == {"a": ["one", 1], "b": {"c": "fallback"}}


def test_missing_var_without_default() -> None:
    with pytest.raises(WorkflowError, match="MISSING"):
        expand_value("${MISSING}", {})
