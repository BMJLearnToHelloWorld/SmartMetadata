# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Check package version updates preserve locked dependency metadata.

Product port of the upstream script test (``ingestion/tests/unit/
test_update_version_script.py``, upstream PR #36870), adapted to the
product tree: the script under test is the repo-root
``scripts/update_version.py`` (loaded by path, following the
``scripts_loader.py`` precedent), and the tests live in the product
ingestion suite because the product has no ``ingestion/tests`` tree.

Not ported, with reasons: the two make-based cases (the product root
Makefile is rebuild-only and has no ``update_pyproject_version``
target), and the ``uv.lock`` end-to-end case (no ``uv`` binary sits
next to the test interpreter, and the product ingestion tree ships no
``uv.lock`` — the lock branch is dormant in product use). Lock
semantics are covered at unit level through ``local_lock_versions``.
"""

from __future__ import annotations

import importlib.util
import subprocess
import sys
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[2]
SCRIPT = REPO / "scripts" / "update_version.py"


def load_update_version():
    spec = importlib.util.spec_from_file_location("update_version", SCRIPT)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load {SCRIPT}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


update_version = load_update_version()
read_toml = update_version.read_toml

PYPROJECT = """\
[build-system]
requires = ["setuptools>=68", "wheel"]
build-backend = "setuptools.build_meta"

[project]
name = "smartmetadata-ingestion"
version = "0.7.0"
requires-python = ">=3.10"
dynamic = ["dependencies"]

[tool.uv]
required-version = "==0.13.4"

[[tool.uv.dependency-metadata]]
name = "sqlalchemy-ibmi"
version = "0.9.3"
requires-dist = ["pyodbc>=4.0", "sqlalchemy>=2.0,<2.1"]
"""

LOCK = """\
version = 1
requires-python = ">=3.10"

[[package]]
name = "smartmetadata-ingestion"
version = "0.7.0"
source = { editable = "." }

[[package]]
name = "packaging"
version = "25.0"
source = { registry = "https://pypi.org/simple" }
"""


def run_update(pyproject: Path, version: str):
    return subprocess.run(
        [
            sys.executable,
            str(SCRIPT),
            "update_pyproject_version",
            "--file-path",
            str(pyproject),
            "--version",
            version,
        ],
        capture_output=True,
        text=True,
        check=False,
        timeout=120,
    )


def test_project_version_updates_only_the_version():
    updated = update_version.project_version(PYPROJECT, "2.0.1234.0")
    metadata = read_toml(updated)["project"]
    assert metadata["version"] == "2.0.1234.0"
    assert metadata["name"] == "smartmetadata-ingestion"
    assert read_toml(updated)["tool"]["uv"]["dependency-metadata"][0]["version"] == "0.9.3"
    changed = [line for line in updated.splitlines() if line not in PYPROJECT.splitlines()]
    assert changed == ['version = "2.0.1234.0"']


def test_project_version_rejects_missing_project_table():
    try:
        update_version.project_version('[tool.uv]\nrequired-version = "==0.13.4"\n', "2.0.0")
    except ValueError as exc:
        assert "Missing [project] table" in str(exc)
    else:
        raise AssertionError("expected ValueError for a document without [project]")


def test_project_version_rejects_duplicate_version_lines():
    # A second version line in [project] is a duplicate TOML key, so the
    # document fails to parse before the stamp runs; either way the
    # function must refuse to stamp it.
    text = PYPROJECT.replace('version = "0.7.0"', 'version = "0.7.0"\nversion = "0.7.0"', 1)
    with pytest.raises(ValueError):
        update_version.project_version(text, "2.0.0")


def test_local_lock_versions_updates_only_the_local_record():
    updated = update_version.local_lock_versions(
        LOCK, {"smartmetadata-ingestion": ("0.7.0", "2.0.1234.0")}
    )
    assert read_toml(updated)["package"][0]["version"] == "2.0.1234.0"
    assert read_toml(updated)["package"][1]["version"] == "25.0"
    before = LOCK.splitlines()
    after = updated.splitlines()
    assert len(before) == len(after)
    diffs = [(a, b) for a, b in zip(before, after, strict=True) if a != b]
    assert diffs == [('version = "0.7.0"', 'version = "2.0.1234.0"')]


def test_local_lock_versions_rejects_non_local_package():
    try:
        update_version.local_lock_versions(LOCK, {"packaging": ("25.0", "26.0")})
    except ValueError as exc:
        assert "Expected a local package" in str(exc)
    else:
        raise AssertionError("expected ValueError for a registry package")


def test_local_lock_versions_rejects_version_mismatch():
    try:
        update_version.local_lock_versions(
            LOCK, {"smartmetadata-ingestion": ("0.6.0", "2.0.1234.0")}
        )
    except ValueError as exc:
        assert "Lock version does not match project" in str(exc)
    else:
        raise AssertionError("expected ValueError for a lock/project version mismatch")


def test_update_pyproject_version_cli_without_lock(tmp_path: Path):
    pyproject = tmp_path / "pyproject.toml"
    pyproject.write_text(PYPROJECT, encoding="utf-8")
    result = run_update(pyproject, "2.0.1234")
    assert result.returncode == 0, result.stdout + result.stderr
    assert read_toml(pyproject.read_text(encoding="utf-8"))["project"]["version"] == "2.0.1234.0"
    assert (
        read_toml(pyproject.read_text(encoding="utf-8"))["tool"]["uv"]["dependency-metadata"][0][
            "version"
        ]
        == "0.9.3"
    )
    assert not (tmp_path / "uv.lock").exists()
    before = pyproject.read_bytes()
    result = run_update(pyproject, "2.0.1234")
    assert result.returncode == 0, result.stdout + result.stderr
    assert pyproject.read_bytes() == before


def test_update_pyproject_version_cli_snapshot_version(tmp_path: Path):
    pyproject = tmp_path / "pyproject.toml"
    pyproject.write_text(PYPROJECT, encoding="utf-8")
    result = run_update(pyproject, "2.0.1234-SNAPSHOT")
    assert result.returncode == 0, result.stdout + result.stderr
    assert (
        read_toml(pyproject.read_text(encoding="utf-8"))["project"]["version"] == "2.0.1234.0.dev0"
    )


def test_invalid_version_does_not_change_inputs(tmp_path: Path):
    pyproject = tmp_path / "pyproject.toml"
    pyproject.write_text(PYPROJECT, encoding="utf-8")
    before = pyproject.read_bytes()
    result = run_update(pyproject, "invalid")
    assert result.returncode != 0
    assert pyproject.read_bytes() == before
