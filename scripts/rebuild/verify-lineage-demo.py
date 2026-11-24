#!/usr/bin/env python3
"""Verify the lineage demo seed (scripts/rebuild/lineage-demo.yaml) on a live stack.

Asserts the traversal endpoint the lineage UI actually reads —
``GET /v1/lineage/{type}/name/{fqn}?upstreamDepth=&downstreamDepth=`` —
at depths 0-3, plus the seeded entities themselves. Run AFTER applying the
seed (see the YAML header)::

    docker compose -f docker/rebuild/docker-compose.yml exec ingest \\
        smartmetadata-ingest run --config /config/lineage-demo.yaml
    python scripts/rebuild/verify-lineage-demo.py

Defaults point at a local stack (``localhost:8585`` API, ``localhost:8586``
admin); override with ``--api`` / ``--admin`` or ``OM_API_URL`` /
``OM_ADMIN_URL``. Login uses the same bootstrap admin as
``scripts/rebuild/live_smoke.py``.

The search-backed ``GET /v1/lineage/getLineage`` is checked ONLY as a
warning: it needs Elasticsearch indexing to catch up after seeding, so a
miss there right after the seed is expected and is not a failure.
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass

DEFAULT_ADMIN = "http://localhost:8586"
DEFAULT_API = "http://localhost:8585/api"
DEFAULT_LOGIN_EMAIL = "admin@open-metadata.org"
DEFAULT_LOGIN_PASSWORD = "admin"

PREFIX = "lineage-demo.demo.public"
DORIS_PREFIX = "lineage-demo-doris.demo.public"
DORIS_SERVICE = "lineage-demo-doris"
DORIS_VIEW = f"{DORIS_PREFIX}.doris_v_customer_orders"
DASHBOARD = "lineage-demo-superset.demo_orders_dashboard"


class VerifyError(RuntimeError):
    """A live lineage-demo assertion failed."""


@dataclass(frozen=True)
class HttpResult:
    status: int
    body: str


def http_request(
    url: str,
    *,
    method: str = "GET",
    json_body: object | None = None,
    headers: dict[str, str] | None = None,
    timeout: int = 30,
) -> HttpResult:
    data = None
    req_headers = {"Accept": "application/json"}
    if headers:
        req_headers.update(headers)
    if json_body is not None:
        data = json.dumps(json_body).encode("utf-8")
        req_headers["Content-Type"] = "application/json"
    request = urllib.request.Request(url, data=data, headers=req_headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return HttpResult(
                response.getcode() or 0, response.read().decode("utf-8", errors="replace")
            )
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace") if exc.fp else ""
        return HttpResult(exc.code, body)
    except urllib.error.URLError as exc:
        raise VerifyError(f"{method} {url} failed: {exc.reason}") from exc


def _fqn(ref: object) -> str:
    if isinstance(ref, dict):
        return str(ref.get("fullyQualifiedName") or ref.get("name") or "")
    if isinstance(ref, str):
        return ref
    return ""


def _check(label: str, condition: bool, detail: str = "") -> None:
    print(
        f"  [{'ok' if condition else 'FAIL'}] {label}"
        + (f" — {detail}" if detail and not condition else "")
    )
    if not condition:
        raise VerifyError(f"{label}: {detail}")


def fetch_lineage(
    api: str, auth: dict[str, str], entity_type: str, fqn: str, *, up: int, down: int
) -> dict:
    query = urllib.parse.urlencode({"upstreamDepth": up, "downstreamDepth": down})
    path = (
        f"/v1/lineage/{urllib.parse.quote(entity_type, safe='')}"
        f"/name/{urllib.parse.quote(fqn, safe='')}"
    )
    result = http_request(f"{api}{path}?{query}", headers=auth)
    if result.status != 200:
        raise VerifyError(f"GET {path} expected HTTP 200, got {result.status}: {result.body[:300]}")
    try:
        payload = json.loads(result.body)
    except json.JSONDecodeError as exc:
        raise VerifyError(f"GET {path} did not return JSON: {result.body[:200]}") from exc
    if not isinstance(payload, dict):
        raise VerifyError(f"GET {path} returned a non-object payload")
    return payload


def lineage_nodes(payload: dict) -> dict[str, dict]:
    nodes: dict[str, dict] = {}
    for ref in [payload.get("entity")] + list(payload.get("nodes") or []):
        if isinstance(ref, dict) and _fqn(ref):
            nodes.setdefault(_fqn(ref), ref)
    return nodes


def lineage_edges(payload: dict) -> list[dict]:
    # The lineage API returns edge endpoints as entity-ID strings; resolve
    # them to FQNs via the payload's own nodes (live-stage fix: the shipped
    # _fqn() returns "" for string refs, so every edge-pair check failed).
    # Only string endpoints are looked up: a dict endpoint keeps the
    # original behavior (passed through; _fqn reads its fullyQualifiedName).
    by_id: dict[str, str] = {}
    for ref in [payload.get("entity")] + list(payload.get("nodes") or []):
        if isinstance(ref, dict) and ref.get("id") and _fqn(ref):
            by_id[ref["id"]] = _fqn(ref)
    edges: list[dict] = []
    for key in ("upstreamEdges", "downstreamEdges"):
        for edge in payload.get(key) or []:
            if isinstance(edge, dict):
                e = dict(edge)
                for endpoint in ("fromEntity", "toEntity"):
                    value = edge.get(endpoint)
                    if isinstance(value, str):
                        e[endpoint] = by_id.get(value, value)
                edges.append(e)
    return edges


def edge_fqns(edge: dict) -> tuple[str, str]:
    return (_fqn(edge.get("fromEntity")), _fqn(edge.get("toEntity")))


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--api", default=os.environ.get("OM_API_URL", DEFAULT_API))
    parser.add_argument("--admin", default=os.environ.get("OM_ADMIN_URL", DEFAULT_ADMIN))
    parser.add_argument(
        "--login-email", default=os.environ.get("OM_LOGIN_EMAIL", DEFAULT_LOGIN_EMAIL)
    )
    parser.add_argument(
        "--login-password", default=os.environ.get("OM_LOGIN_PASSWORD", DEFAULT_LOGIN_PASSWORD)
    )
    args = parser.parse_args(argv)
    api = args.api.rstrip("/")
    if api.endswith("/api"):
        api_origin = api
    else:
        api_origin = f"{api}/api"

    print("==> healthcheck")
    health = http_request(f"{args.admin.rstrip('/')}/healthcheck")
    _check("server healthcheck is 200", health.status == 200, f"got {health.status}")

    print("==> login")
    encoded = base64.b64encode(args.login_password.encode("utf-8")).decode("ascii")
    login = http_request(
        f"{api_origin}/v1/users/login",
        method="POST",
        json_body={"email": args.login_email, "password": encoded},
    )
    _check("login is 200", login.status == 200, f"got {login.status}: {login.body[:200]}")
    token = str(json.loads(login.body).get("accessToken") or "").strip()
    _check("login returned an accessToken", bool(token))
    auth = {"Authorization": f"Bearer {token}"}

    print("==> seeded entities exist (by-name GET)")
    for label, path in [
        (
            "table fact_orders",
            f"/v1/tables/name/{urllib.parse.quote(PREFIX + '.fact_orders', safe='')}",
        ),
        (
            "dashboard demo_orders_dashboard",
            f"/v1/dashboards/name/{urllib.parse.quote(DASHBOARD, safe='')}",
        ),
        ("pipeline demo_orders_etl", "/v1/pipelines/name/lineage-demo-airflow.demo_orders_etl"),
        (
            "Doris service lineage-demo-doris",
            "/v1/services/databaseServices/name/lineage-demo-doris",
        ),
        (
            "Doris view doris_v_customer_orders",
            f"/v1/tables/name/{urllib.parse.quote(DORIS_VIEW, safe='')}",
        ),
    ]:
        result = http_request(f"{api_origin}{path}", headers=auth)
        _check(f"{label} is 200", result.status == 200, f"got {result.status}: {result.body[:200]}")

    print("==> Doris view is a View with the Doris connection shape")
    view = http_request(
        f"{api_origin}/v1/tables/name/{urllib.parse.quote(DORIS_VIEW, safe='')}",
        headers=auth,
    )
    _check("Doris view GET is 200", view.status == 200, f"got {view.status}")
    view_body = json.loads(view.body)
    _check(
        "Doris view tableType is View",
        view_body.get("tableType") == "View",
        f"got {view_body.get('tableType')!r}",
    )
    service = http_request(
        f"{api_origin}/v1/services/databaseServices/name/{DORIS_SERVICE}",
        headers=auth,
    )
    _check("Doris service GET is 200", service.status == 200, f"got {service.status}")
    service_body = json.loads(service.body)
    _check(
        "Doris serviceType is Doris",
        service_body.get("serviceType") == "Doris",
        f"got {service_body.get('serviceType')!r}",
    )
    _check(
        "Doris connection type is Doris",
        (service_body.get("connection") or {}).get("config", {}).get("type") == "Doris",
        f"got {service_body.get('connection')!r}"[:200],
    )

    print("==> traversal: 3-hop chain shop_raw_customer -> ... -> customer_features")
    payload = fetch_lineage(api_origin, auth, "table", f"{PREFIX}.shop_raw_customer", up=0, down=3)
    nodes = lineage_nodes(payload)
    edges = {edge_fqns(e) for e in lineage_edges(payload)}
    _check("shop_dim_customer at depth 1", f"{PREFIX}.shop_dim_customer" in nodes)
    _check("fact_orders at depth 2", f"{PREFIX}.fact_orders" in nodes)
    _check("customer_features at depth 3", f"{PREFIX}.customer_features" in nodes)
    _check("dashboard at depth 3", DASHBOARD in nodes)
    _check(
        "edge fact_orders -> customer_features",
        (f"{PREFIX}.fact_orders", f"{PREFIX}.customer_features") in edges,
    )

    print("==> traversal: fan-in upstream of customer_features at depth 3")
    payload = fetch_lineage(api_origin, auth, "table", f"{PREFIX}.customer_features", up=3, down=0)
    nodes = lineage_nodes(payload)
    for expected in (
        f"{PREFIX}.fact_orders",
        f"{PREFIX}.stg_orders",
        f"{PREFIX}.stg_payments",
        f"{PREFIX}.shop_dim_customer",
        f"{PREFIX}.raw_orders",
        f"{PREFIX}.raw_payments",
        f"{PREFIX}.shop_raw_customer",
    ):
        _check(f"upstream contains {expected}", expected in nodes)

    print("==> traversal: fact_orders hub — column lineage + pipeline attribution + dashboard")
    payload = fetch_lineage(api_origin, auth, "table", f"{PREFIX}.fact_orders", up=3, down=3)
    nodes = lineage_nodes(payload)
    raw_edges = lineage_edges(payload)
    edges = {edge_fqns(e): e for e in raw_edges}
    _check("dashboard reachable downstream", DASHBOARD in nodes)
    feature_edge = edges.get((f"{PREFIX}.fact_orders", f"{PREFIX}.customer_features"))
    _check("edge fact_orders -> customer_features exists", feature_edge is not None)
    if feature_edge is not None:
        details = feature_edge.get("lineageDetails") or {}
        columns = details.get("columnsLineage") or []
        total = next(
            (c for c in columns if c.get("toColumn") == f"{PREFIX}.customer_features.total_amount"),
            None,
        )
        _check("column lineage amount -> total_amount", total is not None)
        if total is not None:
            _check(
                "column lineage function is SUM",
                total.get("function") == "SUM",
                f"got {total.get('function')!r}",
            )
    pipe_edge = edges.get((f"{PREFIX}.stg_orders", f"{PREFIX}.fact_orders"))
    _check("edge stg_orders -> fact_orders exists", pipe_edge is not None)
    if pipe_edge is not None:
        details = pipe_edge.get("lineageDetails") or {}
        _check(
            "pipeline edge source is PipelineLineage",
            details.get("source") == "PipelineLineage",
            f"got {details.get('source')!r}",
        )
        pipeline = details.get("pipeline") or {}
        _check(
            "pipeline edge attributes demo_orders_etl",
            pipeline.get("fullyQualifiedName") == "lineage-demo-airflow.demo_orders_etl",
            f"got {pipeline.get('fullyQualifiedName')!r}",
        )
    dash_edge = edges.get((f"{PREFIX}.fact_orders", DASHBOARD))
    _check("edge fact_orders -> dashboard exists", dash_edge is not None)
    if dash_edge is not None:
        details = dash_edge.get("lineageDetails") or {}
        _check(
            "dashboard edge source is DashboardLineage",
            details.get("source") == "DashboardLineage",
            f"got {details.get('source')!r}",
        )

    print("==> traversal: Doris subgraph — MySQL mart -> Doris -> view -> mart")
    payload = fetch_lineage(api_origin, auth, "table", DORIS_VIEW, up=2, down=1)
    nodes = lineage_nodes(payload)
    edges = {edge_fqns(e): e for e in lineage_edges(payload)}
    for expected in (
        f"{DORIS_PREFIX}.doris_dim_customers",
        f"{DORIS_PREFIX}.doris_fact_orders",
        f"{PREFIX}.dim_customers",
        f"{PREFIX}.fact_orders",
    ):
        _check(f"upstream of Doris view contains {expected}", expected in nodes)
    _check("customer_features downstream of Doris view", f"{PREFIX}.customer_features" in nodes)
    dim_edge = edges.get((f"{PREFIX}.dim_customers", f"{DORIS_PREFIX}.doris_dim_customers"))
    _check("edge dim_customers -> doris_dim_customers exists", dim_edge is not None)
    if dim_edge is not None:
        details = dim_edge.get("lineageDetails") or {}
        columns = details.get("columnsLineage") or []
        _check(
            "column lineage dim customer_id -> Doris customer_id",
            any(
                c.get("toColumn") == f"{DORIS_PREFIX}.doris_dim_customers.customer_id"
                for c in columns
            ),
        )
    view_in = edges.get((f"{DORIS_PREFIX}.doris_fact_orders", DORIS_VIEW))
    _check("edge doris_fact_orders -> Doris view exists", view_in is not None)
    if view_in is not None:
        details = view_in.get("lineageDetails") or {}
        columns = details.get("columnsLineage") or []
        total = next(
            (c for c in columns if c.get("toColumn") == f"{DORIS_VIEW}.total_amount"),
            None,
        )
        _check("column lineage Doris amount -> view total_amount", total is not None)
        if total is not None:
            _check(
                "column lineage function is SUM",
                total.get("function") == "SUM",
                f"got {total.get('function')!r}",
            )
    payload = fetch_lineage(api_origin, auth, "table", f"{PREFIX}.fact_orders", up=0, down=2)
    nodes = lineage_nodes(payload)
    _check(
        "doris_fact_orders downstream of fact_orders", f"{DORIS_PREFIX}.doris_fact_orders" in nodes
    )
    _check("Doris view downstream of fact_orders at depth 2", DORIS_VIEW in nodes)

    print("==> traversal: depths are respected")
    payload = fetch_lineage(api_origin, auth, "table", f"{PREFIX}.dim_customers", up=1, down=0)
    nodes = lineage_nodes(payload)
    _check("stg_customers at upstream depth 1", f"{PREFIX}.stg_customers" in nodes)
    _check("raw_customers NOT at upstream depth 1", f"{PREFIX}.raw_customers" not in nodes)
    payload = fetch_lineage(api_origin, auth, "table", f"{PREFIX}.dim_customers", up=2, down=0)
    nodes = lineage_nodes(payload)
    _check("raw_customers at upstream depth 2", f"{PREFIX}.raw_customers" in nodes)
    payload = fetch_lineage(api_origin, auth, "table", f"{PREFIX}.raw_customers", up=0, down=0)
    nodes = lineage_nodes(payload)
    _check(
        "depth 0 returns only the centre node",
        set(nodes) == {f"{PREFIX}.raw_customers"},
        f"got {sorted(nodes)}",
    )

    print("==> search-backed getLineage (warning only — needs ES indexing)")
    search = http_request(
        f"{api_origin}/v1/lineage/getLineage?"
        + urllib.parse.urlencode({"fqn": f"{PREFIX}.fact_orders", "type": "table"}),
        headers=auth,
    )
    if search.status != 200:
        print(f"  [warn] getLineage returned {search.status} (search index may lag)")
    else:
        try:
            body = json.loads(search.body)
            found = f"{PREFIX}.fact_orders" in json.dumps(body)
            print(
                f"  [{'ok' if found else 'warn'}] getLineage mentions fact_orders"
                + ("" if found else " (search index may lag)")
            )
        except json.JSONDecodeError:
            print("  [warn] getLineage returned non-JSON (search index may lag)")

    print("lineage demo verified: all traversal assertions passed")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except VerifyError as exc:
        print(f"FAILED: {exc}", file=sys.stderr)
        sys.exit(1)
