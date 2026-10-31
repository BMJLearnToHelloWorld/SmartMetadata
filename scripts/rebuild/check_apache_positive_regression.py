#!/usr/bin/env python3
"""Fail if Apache contracts claimed BehaviorMatched in backend-01..09 regress.

Offline static checks only (no live catalog). Extends the Phase 11 matrix:
docs/rebuild/PHASE11.md, BACKEND_01..09_REVIEW.md, ADR rebuild-verify-is-offline.

Stdlib only. Exit 0 on pass, 1 on failure.
"""

from __future__ import annotations

import argparse
import ast
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]

REST = (
    REPO
    / "smartmetadata-ingestion"
    / "src"
    / "smartmetadata_ingestion"
    / "client"
    / "rest.py"
)
TOPOLOGY = (
    REPO
    / "smartmetadata-ingestion"
    / "src"
    / "smartmetadata_ingestion"
    / "topology.py"
)
CONFIG = (
    REPO
    / "smartmetadata-ingestion"
    / "src"
    / "smartmetadata_ingestion"
    / "config.py"
)
SINK = (
    REPO
    / "smartmetadata-ingestion"
    / "src"
    / "smartmetadata_ingestion"
    / "sinks"
    / "metadata_rest.py"
)
AIRFLOW_CONTRACTS = (
    REPO
    / "smartmetadata-airflow-apis"
    / "src"
    / "smartmetadata_airflow_apis"
    / "contracts.py"
)
MCP_TOOLS = REPO / "smartmetadata-mcp" / "src" / "tools.ts"
UI_POLICIES = REPO / "smartmetadata-ui" / "src" / "api" / "policies.ts"
UI_APPS = REPO / "smartmetadata-ui" / "src" / "api" / "apps.ts"
UI_CP = REPO / "smartmetadata-ui" / "src" / "api" / "customProperties.ts"

REQUIRED_REST_CONSTANTS = {
    "INGESTION_PIPELINES_PATH": "/v1/services/ingestionPipelines",
    "DATABASES_PATH": "/v1/databases",
    "SCHEMAS_PATH": "/v1/databaseSchemas",
    "TABLES_PATH": "/v1/tables",
    "TOPICS_PATH": "/v1/topics",
    "LINEAGE_PATH": "/v1/lineage",
    "USAGE_PATH": "/v1/usage",
    "ENTITY_PROFILES_PATH": "/v1/entity/profiles",
    "TEST_CASE_RESULTS_PATH": "/v1/dataQuality/testCases/testCaseResults",
    "CLASSIFICATIONS_PATH": "/v1/classifications",
    "TAGS_PATH": "/v1/tags",
    "APPS_PATH": "/v1/apps",
}

REQUIRED_REST_METHOD_NEEDLES = {
    "add_pipeline_status": ("pipelineStatus",),
    "bulk_upsert_databases": ("/bulk",),
    "bulk_upsert_schemas": ("/bulk",),
    "bulk_upsert_tables": ("/bulk",),
    "bulk_upsert_topics": ("/bulk",),
    "delete_stale": ("deleteStale",),
    "put_usage_by_name": ("USAGE_PATH", "date", "count"),
    "post_entity_profile_by_name": ("ENTITY_PROFILES_PATH",),
    "put_table_profile": ("tableProfile",),
    "post_test_case_result": ("TEST_CASE_RESULTS_PATH",),
    "upsert_classification": ("CLASSIFICATIONS_PATH",),
    "upsert_tag": ("TAGS_PATH",),
    "upsert_app": ("APPS_PATH",),
    "put_lineage": ("LINEAGE_PATH",),
    "delete_lineage_by_name": ("LINEAGE_PATH",),
}

REQUIRED_STAGE_ORDER = {
    "databaseService": 0,
    "messagingService": 0,
    "dashboardService": 0,
    "storageService": 0,
    "classification": 0,
    "app": 0,
    "database": 1,
    "topic": 1,
    "chart": 1,
    "container": 1,
    "tag": 1,
    "schema": 2,
    "dashboard": 2,
    "table": 3,
    "usage": 4,
    "profile": 4,
    "testCaseResult": 4,
    "lineage": 5,
}

REQUIRED_AIRFLOW_PREFIXES = (
    "/api/v1",
    "/api/v2",
    "/pluginsv2/api/v2",
)

REQUIRED_AIRFLOW_ENDPOINTS = (
    "health",
    "health-auth",
    "deploy",
    "trigger",
    "delete",
    "enable",
    "disable",
    "status",
    "kill",
    "last_dag_logs",
    "ip",
    "run_automation",
)

REQUIRED_MCP_TOOLS = (
    "search_entities",
    "get_table",
    "get_topic",
    "get_entity_details",
    "get_lineage",
    "create_lineage",
    "list_glossaries",
    "list_tags",
    "find_by_tag",
    "get_test_definitions",
    "create_conversation",
    "create_entity",
    "patch_entity",
    "create_test_case",
)

FORBIDDEN_MCP_TOOLS = (
    "semantic_search",
    "sparql_query",
    "entity_neighborhood",
    "shacl_validate",
    "ontology_describe",
    "root_cause_analysis",
    "ask_data",
    "nlq",
    "persona_context",
)

REQUIRED_UI_NEEDLES = {
    UI_POLICIES: (
        "/v1/policies",
        "method: 'POST'",
        "method: 'PUT'",
        "method: 'DELETE'",
    ),
    UI_APPS: ("/v1/apps",),
    UI_CP: (
        "/v1/metadata/types",
        "method: 'PUT'",
    ),
}


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def parse_module(path: Path) -> ast.Module:
    return ast.parse(read_text(path), filename=str(path))


def iter_assignments(tree: ast.AST):
    for node in getattr(tree, "body", []):
        if isinstance(node, ast.Assign) and len(node.targets) == 1:
            target = node.targets[0]
            if isinstance(target, ast.Name):
                yield target.id, node.value
        elif isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name) and node.value is not None:
            yield node.target.id, node.value


def const_str_assignments(tree: ast.AST) -> dict[str, str]:
    out: dict[str, str] = {}
    for name, value in iter_assignments(tree):
        if isinstance(value, ast.Constant) and isinstance(value.value, str):
            out[name] = value.value
    return out


def dict_str_int(tree: ast.AST, name: str) -> dict[str, int] | None:
    for assigned_name, value in iter_assignments(tree):
        if assigned_name != name:
            continue
        if not isinstance(value, ast.Dict):
            return None
        out: dict[str, int] = {}
        for key, item in zip(value.keys, value.values, strict=True):
            if not isinstance(key, ast.Constant) or not isinstance(key.value, str):
                return None
            if not isinstance(item, ast.Constant) or not isinstance(item.value, int):
                return None
            out[key.value] = item.value
        return out
    return None


def method_source(path: Path, method_name: str) -> str | None:
    tree = parse_module(path)
    for node in ast.walk(tree):
        if isinstance(node, ast.FunctionDef) and node.name == method_name:
            return ast.get_source_segment(read_text(path), node) or ""
    return None


def check_rest_client(errors: list[str]) -> None:
    if not REST.is_file():
        errors.append(f"missing {REST.relative_to(REPO)}")
        return
    tree = parse_module(REST)
    constants = const_str_assignments(tree)
    for name, expected in REQUIRED_REST_CONSTANTS.items():
        actual = constants.get(name)
        if actual != expected:
            errors.append(
                f"RestClient {name} must be {expected!r} (got {actual!r})"
            )
    text = read_text(REST)
    for method, needles in REQUIRED_REST_METHOD_NEEDLES.items():
        if f"def {method}(" not in text:
            errors.append(f"RestClient missing method {method}")
            continue
        body = method_source(REST, method) or ""
        for needle in needles:
            if needle not in body:
                errors.append(f"RestClient.{method} must contain {needle!r}")


def check_topology(errors: list[str]) -> None:
    if not TOPOLOGY.is_file():
        errors.append(f"missing {TOPOLOGY.relative_to(REPO)}")
        return
    tree = parse_module(TOPOLOGY)
    order = dict_str_int(tree, "STAGE_ORDER")
    if order is None:
        errors.append("topology.STAGE_ORDER missing or not a str->int dict")
        return
    if order != REQUIRED_STAGE_ORDER:
        errors.append(
            "topology.STAGE_ORDER drifted from Apache parent-before-child contract: "
            f"expected {REQUIRED_STAGE_ORDER}, got {order}"
        )


def check_bulk_default(errors: list[str]) -> None:
    if not CONFIG.is_file():
        errors.append(f"missing {CONFIG.relative_to(REPO)}")
        return
    text = read_text(CONFIG)
    if "use_bulk: bool = True" not in text:
        errors.append("config SinkConfig.use_bulk must default True (Apache bulk sink)")
    if not SINK.is_file():
        errors.append(f"missing {SINK.relative_to(REPO)}")
        return
    sink = read_text(SINK)
    for needle in ("BulkMetadataRestSink", "columnsLineage", "bulk_upsert_"):
        if needle not in sink:
            errors.append(f"metadata_rest sink must retain {needle!r}")


def check_airflow(errors: list[str]) -> None:
    if not AIRFLOW_CONTRACTS.is_file():
        errors.append(f"missing {AIRFLOW_CONTRACTS.relative_to(REPO)}")
        return
    tree = parse_module(AIRFLOW_CONTRACTS)
    prefixes: list[str] = []
    endpoints: list[str] = []
    for assigned_name, value in iter_assignments(tree):
        if assigned_name == "API_PREFIXES" and isinstance(value, ast.Tuple):
            for elt in value.elts:
                if isinstance(elt, ast.Constant) and isinstance(elt.value, str):
                    prefixes.append(elt.value)
        if assigned_name == "ENDPOINTS" and isinstance(value, ast.Tuple):
            for elt in value.elts:
                if not isinstance(elt, ast.Call):
                    continue
                if not elt.args:
                    continue
                first = elt.args[0]
                if isinstance(first, ast.Constant) and isinstance(first.value, str):
                    endpoints.append(first.value)
    if tuple(prefixes) != REQUIRED_AIRFLOW_PREFIXES:
        errors.append(
            f"Airflow API_PREFIXES must be {REQUIRED_AIRFLOW_PREFIXES} (got {tuple(prefixes)})"
        )
    missing = [name for name in REQUIRED_AIRFLOW_ENDPOINTS if name not in endpoints]
    if missing:
        errors.append(f"Airflow ENDPOINTS missing {missing}")
    extra_forbidden = [name for name in endpoints if name.startswith("collate") or "rdf" in name]
    if extra_forbidden:
        errors.append(f"Airflow ENDPOINTS must stay Apache-only; found {extra_forbidden}")


def parse_ts_string_array(text: str, const_name: str) -> list[str] | None:
    marker = f"export const {const_name}"
    start = text.find(marker)
    if start < 0:
        return None
    bracket = text.find("[", start)
    if bracket < 0:
        return None
    end = text.find("]", bracket)
    if end < 0:
        return None
    block = text[bracket + 1 : end]
    return re.findall(r"['\"]([^'\"]+)['\"]", block)


def check_mcp(errors: list[str]) -> None:
    if not MCP_TOOLS.is_file():
        errors.append(f"missing {MCP_TOOLS.relative_to(REPO)}")
        return
    text = read_text(MCP_TOOLS)
    tools = parse_ts_string_array(text, "TOOL_NAMES")
    if tools is None:
        errors.append("smartmetadata-mcp TOOL_NAMES export not found")
        return
    if tuple(tools) != REQUIRED_MCP_TOOLS:
        errors.append(
            "MCP TOOL_NAMES drifted from Apache-only allowlist: "
            f"expected {REQUIRED_MCP_TOOLS}, got {tuple(tools)}"
        )
    lowered = {name.lower() for name in tools}
    banned = [name for name in FORBIDDEN_MCP_TOOLS if name.lower() in lowered]
    if banned:
        errors.append(f"MCP allowlist must not include Collate AI/RDF tools: {banned}")
    for banned_name in FORBIDDEN_MCP_TOOLS:
        quoted = chr(39) + banned_name + chr(39)
        quoted2 = chr(34) + banned_name + chr(34)
        if quoted in text or quoted2 in text:
            errors.append(f"MCP tools.ts must not mention forbidden tool {banned_name!r}")


def check_ui_settings(errors: list[str]) -> None:
    for path, needles in REQUIRED_UI_NEEDLES.items():
        if not path.is_file():
            errors.append(f"missing {path.relative_to(REPO)}")
            continue
        text = read_text(path)
        for needle in needles:
            if needle not in text:
                errors.append(f"{path.relative_to(REPO)} must contain {needle!r}")


def run_checks() -> list[str]:
    errors: list[str] = []
    check_rest_client(errors)
    check_topology(errors)
    check_bulk_default(errors)
    check_airflow(errors)
    check_mcp(errors)
    check_ui_settings(errors)
    return errors


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--list",
        action="store_true",
        help="print contract groups and exit 0",
    )
    args = parser.parse_args(argv if argv is not None else sys.argv[1:])
    if args.list:
        print("rest-client")
        print("topology-stage-order")
        print("bulk-sink-default")
        print("airflow-route-contract")
        print("mcp-apache-allowlist")
        print("ui-settings-apache-paths")
        return 0
    errors = run_checks()
    if errors:
        print("Apache positive regression FAILED:", file=sys.stderr)
        for item in errors:
            print(f"  - {item}", file=sys.stderr)
        return 1
    print("Apache positive regression ok")
    print("  rest-client, topology, bulk-default, airflow, mcp-allowlist, ui-settings")
    return 0


if __name__ == "__main__":
    sys.exit(main())

