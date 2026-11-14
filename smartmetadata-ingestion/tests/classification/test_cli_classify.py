# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Fresh spec tests for the classify + model-provisioning CLI commands."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import pytest
import yaml

from smartmetadata_ingestion.classification.models import InstallOutcome
from smartmetadata_ingestion.cli import main
from smartmetadata_ingestion.errors import WorkflowError
from smartmetadata_ingestion.progress import RecordFailure, RunReport


def _write_config(tmp_path: Path, workflow_type: str) -> Path:
    path = tmp_path / "wf.yaml"
    path.write_text(
        yaml.safe_dump(
            {
                "workflow": {"name": "demo", "type": workflow_type},
                "server": {
                    "hostPort": "http://catalog.test/api",
                    "auth": {"type": "jwt", "jwtToken": "x"},
                },
                "source": {"type": "mysql", "serviceName": "demo"},
            }
        ),
        encoding="utf-8",
    )
    return path


def test_classify_runs_an_autoclassification_config(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    path = _write_config(tmp_path, "autoClassification")
    seen: list[str] = []

    def fake_run(config: Any, **kwargs: Any) -> RunReport:
        seen.append(config.workflow.type)
        return RunReport(workflow_name=config.workflow.name, succeeded=3)

    monkeypatch.setattr("smartmetadata_ingestion.cli.run_workflow", fake_run)
    assert main(["classify", "--config", str(path)]) == 0
    assert seen == ["autoClassification"]
    assert '"succeeded": 3' in capsys.readouterr().out


def test_classify_refuses_any_other_workflow_type(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    path = _write_config(tmp_path, "metadata")

    def fake_run(config: Any, **kwargs: Any) -> RunReport:
        raise AssertionError("run_workflow must not be called")

    monkeypatch.setattr("smartmetadata_ingestion.cli.run_workflow", fake_run)
    assert main(["classify", "--config", str(path)]) == 2
    assert "autoClassification" in capsys.readouterr().err


def test_classify_reports_a_failing_run_as_exit_1(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    path = _write_config(tmp_path, "autoClassification")

    def fake_run(config: Any, **kwargs: Any) -> RunReport:
        report = RunReport(workflow_name=config.workflow.name, succeeded=1)
        report.failures.append(RecordFailure(label="x", kind="table", message="boom"))
        return report

    monkeypatch.setattr("smartmetadata_ingestion.cli.run_workflow", fake_run)
    assert main(["classify", "--config", str(path)]) == 1


def test_install_models_parses_comma_separated_languages(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    seen: dict[str, Any] = {}

    def fake_install(
        languages: list[str], *, dry_run: bool = False, runner: Any = None
    ) -> InstallOutcome:
        seen["languages"] = languages
        seen["dry_run"] = dry_run
        return InstallOutcome(installed=["en_core_web_md", "es_core_news_md"], already_available=[])

    monkeypatch.setattr("smartmetadata_ingestion.cli.install_models", fake_install)
    assert main(["install-classification-models", "--languages", "en, es"]) == 0
    assert seen == {"languages": ["en", "es"], "dry_run": False}
    output = capsys.readouterr().out
    assert "installed en_core_web_md" in output
    assert "installed es_core_news_md" in output


def test_install_models_requires_the_languages_flag(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    def boom_install(
        languages: list[str], *, dry_run: bool = False, runner: Any = None
    ) -> InstallOutcome:
        raise AssertionError("install must not run without --languages")

    monkeypatch.setattr("smartmetadata_ingestion.cli.install_models", boom_install)
    with pytest.raises(SystemExit) as excinfo:
        main(["install-classification-models"])
    assert excinfo.value.code == 2
    assert "--languages" in capsys.readouterr().err


def test_install_models_with_explicit_english(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    seen: dict[str, Any] = {}

    def fake_install(
        languages: list[str], *, dry_run: bool = False, runner: Any = None
    ) -> InstallOutcome:
        seen["languages"] = languages
        seen["dry_run"] = dry_run
        return InstallOutcome(installed=["en_core_web_md"], already_available=[])

    monkeypatch.setattr("smartmetadata_ingestion.cli.install_models", fake_install)
    assert main(["install-classification-models", "--languages", "en"]) == 0
    assert seen == {"languages": ["en"], "dry_run": False}
    assert "installed en_core_web_md" in capsys.readouterr().out


def test_install_models_reports_already_available_models(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    def fake_install(
        languages: list[str], *, dry_run: bool = False, runner: Any = None
    ) -> InstallOutcome:
        return InstallOutcome(installed=[], already_available=["en_core_web_md"])

    monkeypatch.setattr("smartmetadata_ingestion.cli.install_models", fake_install)
    assert main(["install-classification-models", "--languages", "en"]) == 0
    output = capsys.readouterr().out
    assert "already available: en_core_web_md" in output
    assert "installed en_core_web_md" not in output


def test_install_models_reports_installed_and_already_available_together(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    def fake_install(
        languages: list[str], *, dry_run: bool = False, runner: Any = None
    ) -> InstallOutcome:
        return InstallOutcome(installed=["es_core_news_md"], already_available=["en_core_web_md"])

    monkeypatch.setattr("smartmetadata_ingestion.cli.install_models", fake_install)
    assert main(["install-classification-models", "--languages", "en,es"]) == 0
    output = capsys.readouterr().out
    assert "installed es_core_news_md" in output
    assert "already available: en_core_web_md" in output


def test_install_models_dry_run_passes_through(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    seen: dict[str, Any] = {}

    def fake_install(
        languages: list[str], *, dry_run: bool = False, runner: Any = None
    ) -> InstallOutcome:
        seen["languages"] = languages
        seen["dry_run"] = dry_run
        return InstallOutcome(installed=["en_core_web_md"], already_available=[])

    monkeypatch.setattr("smartmetadata_ingestion.cli.install_models", fake_install)
    assert main(["install-classification-models", "--languages", "en", "--dry-run"]) == 0
    assert seen == {"languages": ["en"], "dry_run": True}
    assert "installed" not in capsys.readouterr().out


@pytest.mark.parametrize("flag_value", [" , ", "", "en,", "en,,es", ",en", "en, "])
def test_install_models_empty_segments_are_an_error(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
    flag_value: str,
) -> None:
    def boom_install(
        languages: list[str], *, dry_run: bool = False, runner: Any = None
    ) -> InstallOutcome:
        raise AssertionError("install must not run with an empty segment")

    monkeypatch.setattr("smartmetadata_ingestion.cli.install_models", boom_install)
    assert main(["install-classification-models", "--languages", flag_value]) == 2
    assert "empty segment" in capsys.readouterr().err


def test_install_models_failure_exits_2(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    def failing_install(
        languages: list[str], *, dry_run: bool = False, runner: Any = None
    ) -> InstallOutcome:
        raise WorkflowError("failed to install spaCy model en_core_web_md")

    monkeypatch.setattr("smartmetadata_ingestion.cli.install_models", failing_install)
    assert main(["install-classification-models", "--languages", "en"]) == 2
    assert "failed to install" in capsys.readouterr().err
