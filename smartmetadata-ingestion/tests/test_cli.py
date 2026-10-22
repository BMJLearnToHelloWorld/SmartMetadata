# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

from __future__ import annotations

from pathlib import Path

import yaml

from smartmetadata_ingestion.cli import main
from smartmetadata_ingestion.progress import RunReport


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
