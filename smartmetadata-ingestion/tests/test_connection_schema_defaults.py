# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Check the connection-schema copies carry the upstream defaults.

Guards the M6 port (doris/greenplum/mariaDB system-schema filter
defaults, upstream PR #36677) and the M7 port (HuggingFace baseURL
defaults to the OpenAI-compatible router, upstream PR #37039): both
copies — ``openmetadata-spec`` and the ``openmetadata-ui`` public/jsons
copy — must carry the pin-exact defaults, and the two copies must agree
with each other, so neither drifts alone.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[2]
SPEC = REPO / "openmetadata-spec/src/main/resources/json/schema/entity/services/connections"
UI = REPO / "openmetadata-ui/src/main/resources/ui/public/jsons/connectionSchemas/connections"

# Full expected schemaFilterPattern defaults, per connection (pin-exact).
SCHEMA_FILTER_DEFAULTS = {
    "dorisConnection.json": {
        "includes": [],
        "excludes": ["^information_schema$", "^performance_schema$", "^__internal_schema$"],
    },
    "greenplumConnection.json": {
        "includes": [],
        "excludes": ["^information_schema$", "^gp_toolkit$"],
    },
    "mariaDBConnection.json": {
        "includes": [],
        "excludes": ["^information_schema$", "^performance_schema$"],
    },
}
DATABASE_FILTER_DEFAULTS = {
    "greenplumConnection.json": {
        "includes": [],
        "excludes": ["^template1$", "^template0$"],
    },
}
HF_BASE_URL = "https://router.huggingface.co/v1"


def load(base: Path, *parts: str):
    return json.loads((base.joinpath(*parts)).read_text(encoding="utf-8"))


@pytest.mark.parametrize("filename", sorted(SCHEMA_FILTER_DEFAULTS))
def test_schema_filter_pattern_default_matches_pin(filename: str):
    expected = SCHEMA_FILTER_DEFAULTS[filename]
    for base in (SPEC, UI):
        schema = load(base, "database", filename)
        assert schema["properties"]["schemaFilterPattern"]["default"] == expected


@pytest.mark.parametrize("filename", sorted(DATABASE_FILTER_DEFAULTS))
def test_database_filter_pattern_default_matches_pin(filename: str):
    expected = DATABASE_FILTER_DEFAULTS[filename]
    for base in (SPEC, UI):
        schema = load(base, "database", filename)
        assert schema["properties"]["databaseFilterPattern"]["default"] == expected


def test_spec_and_ui_copies_agree_on_filter_defaults():
    for filename, expected in SCHEMA_FILTER_DEFAULTS.items():
        spec = load(SPEC, "database", filename)
        ui = load(UI, "database", filename)
        assert (
            spec["properties"]["schemaFilterPattern"]["default"]
            == ui["properties"]["schemaFilterPattern"]["default"]
            == expected
        )
    for filename, expected in DATABASE_FILTER_DEFAULTS.items():
        spec = load(SPEC, "database", filename)
        ui = load(UI, "database", filename)
        assert (
            spec["properties"]["databaseFilterPattern"]["default"]
            == ui["properties"]["databaseFilterPattern"]["default"]
            == expected
        )


def test_huggingface_base_url_defaults_to_router():
    for base in (SPEC, UI):
        schema = load(base, "llm", "huggingFaceConnection.json")
        assert schema["properties"]["baseURL"]["default"] == HF_BASE_URL
