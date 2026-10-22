# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

from __future__ import annotations

import importlib
import sys
from pathlib import Path

from scripts_loader import load_gate

REPO = Path(__file__).resolve().parents[2]


def test_package_does_not_import_ccl_modules() -> None:
    importlib.import_module("smartmetadata_ingestion")
    importlib.import_module("smartmetadata_ingestion.cli")
    importlib.import_module("smartmetadata_ingestion.connectors.postgres")
    banned = {
        name
        for name in sys.modules
        if name == "metadata"
        or name.startswith("metadata.")
        or name.startswith("openmetadata_ingestion")
        or name.startswith("openmetadata_airflow_apis")
    }
    assert banned == set()


def test_gate_passes_on_this_package() -> None:
    gate = load_gate()
    assert gate.main([]) == 0


def test_gate_flags_banned_import(tmp_path: Path) -> None:
    gate = load_gate()
    path = tmp_path / "bad.py"
    path.write_text("import metadata\n", encoding="utf-8")
    errors: list[str] = []
    gate.check_python_file(path, errors)
    assert errors
    assert "banned" in errors[0] or "metadata" in errors[0]
