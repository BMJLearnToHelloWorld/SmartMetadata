# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

from __future__ import annotations

import logging
from pathlib import Path

import yaml

from smartmetadata_ingestion.cli import main
from smartmetadata_ingestion.progress import RunReport


def _write_demo_config(tmp_path: Path) -> Path:
    path = tmp_path / "wf.yaml"
    path.write_text(
        yaml.safe_dump(
            {
                "workflow": {"name": "demo"},
                "server": {
                    "hostPort": "http://catalog.test/api",
                    "auth": {"type": "jwt", "jwtToken": "x"},
                },
                "source": {"type": "static", "serviceName": "demo"},
            }
        ),
        encoding="utf-8",
    )
    return path


def _fake_run(config, **kwargs):
    return RunReport(workflow_name=config.workflow.name, succeeded=2)


def test_cli_run_prints_report(tmp_path: Path, monkeypatch, capsys) -> None:
    path = tmp_path / "wf.yaml"
    path.write_text(
        yaml.safe_dump(
            {
                "workflow": {"name": "demo"},
                "server": {
                    "hostPort": "http://catalog.test/api",
                    "auth": {"type": "jwt", "jwtToken": "x"},
                },
                "source": {"type": "static", "serviceName": "demo"},
            }
        ),
        encoding="utf-8",
    )

    def fake_run(config, **kwargs):
        return RunReport(workflow_name=config.workflow.name, succeeded=2)

    monkeypatch.setattr("smartmetadata_ingestion.cli.run_workflow", fake_run)
    assert main(["run", "--config", str(path)]) == 0
    output = capsys.readouterr().out
    assert '"workflow": "demo"' in output
    assert '"succeeded": 2' in output


def test_cli_invalid_config_is_nonzero(tmp_path: Path, capsys) -> None:
    path = tmp_path / "bad.yaml"
    path.write_text("workflow: []\n", encoding="utf-8")
    assert main(["run", "--config", str(path)]) == 2
    assert "error:" in capsys.readouterr().err


def test_cli_log_level_info_applies(monkeypatch, tmp_path: Path) -> None:
    # LOG_LEVEL=INFO (the level the live run already used) must reach the
    # root logger, so INFO lines such as the per-group flush summaries
    # actually appear.
    monkeypatch.setenv("LOG_LEVEL", "INFO")
    monkeypatch.setattr("smartmetadata_ingestion.cli.run_workflow", _fake_run)
    root = logging.getLogger()
    old_level = root.level
    try:
        assert main(["run", "--config", str(_write_demo_config(tmp_path))]) == 0
        assert root.level == logging.INFO
    finally:
        root.setLevel(old_level)


def test_cli_log_level_unknown_warns_and_keeps_level(monkeypatch, tmp_path: Path, capsys) -> None:
    # A typo in LOG_LEVEL must not silence the run: warn on stderr and
    # keep the previous level, so ERROR lines still show.
    monkeypatch.setenv("LOG_LEVEL", "BOGUS")
    monkeypatch.setattr("smartmetadata_ingestion.cli.run_workflow", _fake_run)
    root = logging.getLogger()
    old_level = root.level
    try:
        assert main(["run", "--config", str(_write_demo_config(tmp_path))]) == 0
        assert root.level == old_level
    finally:
        root.setLevel(old_level)
    assert "unknown LOG_LEVEL 'BOGUS'" in capsys.readouterr().err
