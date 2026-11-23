# Copyright 2026 SmartMetadata authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Removal contract for scripts/rebuild/remove-lineage-demo.py.

Pins the property Bai asked for: deleting the demo seed removes exactly
the demo namespace and nothing else. The inventory is derived from the
seed YAML itself (so it cannot drift from what was seeded), every name
must pass the ``lineage-demo`` prefix gate, and a single record outside
the namespace aborts the run before anything is deleted.
"""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
REMOVE_SCRIPT = REPO_ROOT / "scripts" / "rebuild" / "remove-lineage-demo.py"
DEMO_YAML = REPO_ROOT / "scripts" / "rebuild" / "lineage-demo.yaml"


def _load_module():
    spec = importlib.util.spec_from_file_location("remove_lineage_demo", REMOVE_SCRIPT)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules["remove_lineage_demo"] = module
    spec.loader.exec_module(module)
    return module


def test_inventory_matches_the_seed():
    module = _load_module()
    inventory = module.plan(str(DEMO_YAML))
    assert [(kind, name) for kind, name in inventory.services] == [
        ("databaseService", "lineage-demo"),
        ("pipelineService", "lineage-demo-airflow"),
        ("dashboardService", "lineage-demo-superset"),
        ("databaseService", "lineage-demo-doris"),
    ]
    assert len(inventory.tables) == 14
    assert len(inventory.pipelines) == 2
    assert len(inventory.charts) == 1
    assert len(inventory.dashboards) == 1
    assert len(inventory.edges) == 15
    assert all(module.is_demo_name(name) for name in inventory.all_names())


def test_prefix_gate_rejects_lookalikes_and_real_names():
    module = _load_module()
    assert module.is_demo_name("lineage-demo")
    assert module.is_demo_name("lineage-demo-doris")
    assert module.is_demo_name("lineage-demo.demo.public.fact_orders")
    assert not module.is_demo_name("lineage-demo2")
    assert not module.is_demo_name("lineage-demox.demo.public.fact_orders")
    assert not module.is_demo_name("icrm-monorepo")
    assert not module.is_demo_name("smoke")


def test_poisoned_record_aborts_before_anything_is_planned(tmp_path: Path):
    module = _load_module()
    # Insert the poisoned record at the head of the records list (appending
    # at the end of the file would land under the `sink:` block and just be
    # malformed YAML).
    poisoned = DEMO_YAML.read_text(encoding="utf-8").replace(
        "  records:\n",
        "  records:\n"
        "    - kind: table\n"
        "      name: icrm_orders\n"
        "      databaseSchema: icrm.public\n",
        1,
    )
    assert poisoned != DEMO_YAML.read_text(encoding="utf-8")
    poisoned_yaml = tmp_path / "lineage-demo.yaml"
    poisoned_yaml.write_text(poisoned, encoding="utf-8")
    with pytest.raises(module.RemovalError, match="outside the .* namespace"):
        module.plan(str(poisoned_yaml))
