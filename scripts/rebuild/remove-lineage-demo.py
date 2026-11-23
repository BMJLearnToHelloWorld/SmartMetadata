#!/usr/bin/env python3
"""Remove the lineage demo seed (scripts/rebuild/lineage-demo.yaml) from a live stack.

The demo seed is fully namespaced: every entity it creates is named
``lineage-demo*`` (services ``lineage-demo``, ``lineage-demo-doris``,
``lineage-demo-airflow``, ``lineage-demo-superset`` and everything under
them). This script deletes exactly those entities — and refuses to touch
anything else. The safety rule is enforced in code, not by convention:
every FQN/name the script will delete must start with ``lineage-demo``
(see :func:`is_demo_name`); a single record outside the namespace aborts
the run before anything is deleted.

Usage (from the repo root)::

    # Plan only (default): print what would be deleted, delete nothing.
    python scripts/rebuild/remove-lineage-demo.py

    # Actually delete (asks for confirmation unless --yes):
    python scripts/rebuild/remove-lineage-demo.py --delete
    python scripts/rebuild/remove-lineage-demo.py --delete --yes

Defaults point at a local stack (``localhost:8585`` API,
``localhost:8586`` admin); override with ``--api`` / ``--admin`` or
``OM_API_URL`` / ``OM_ADMIN_URL``. Login uses the same bootstrap admin as
``scripts/rebuild/verify-lineage-demo.py``. The admin password is taken
from ``--login-password`` / ``OM_LOGIN_PASSWORD`` and never stored.

Order of operations (deletion is the inverse of seeding):
1. Delete the 15 lineage edges by FQN (200 = deleted, 404 = already gone).
2. Delete charts, dashboards, pipelines and tables by name (hard delete).
3. Delete the 4 services with hardDelete + recursive (cascades whatever
   databases/schemas/tables remain under them).
4. Verify: every demo entity GETs 404, and no service of any kind still
   starts with ``lineage-demo``. The remaining service list is printed as
   proof nothing else was touched.

Re-running is safe: entities already gone report 404 and are skipped.
Search may briefly still list deleted demo entities until Elasticsearch
re-indexes — that is expected, not a failure.
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
from dataclasses import dataclass, field

DEFAULT_ADMIN = "http://localhost:8586"
DEFAULT_API = "http://localhost:8585/api"
DEFAULT_LOGIN_EMAIL = "admin@open-metadata.org"
DEFAULT_LOGIN_PASSWORD = "admin"

DEMO_PREFIX = "lineage-demo"

# Entity delete endpoints, by record kind. The service kinds map to their
# service-collection endpoints; the rest map to their entity collections.
SERVICE_COLLECTIONS = {
    "databaseService": "databaseServices",
    "pipelineService": "pipelineServices",
    "dashboardService": "dashboardServices",
}
ENTITY_COLLECTIONS = {
    "table": "tables",
    "pipeline": "pipelines",
    "chart": "charts",
    "dashboard": "dashboards",
}


class RemovalError(RuntimeError):
    """A lineage-demo removal step failed."""


@dataclass(frozen=True)
class HttpResult:
    status: int
    body: str


@dataclass
class Inventory:
    """Everything the demo seed creates, derived from the YAML itself."""

    services: list[tuple[str, str]] = field(default_factory=list)
    tables: list[str] = field(default_factory=list)
    pipelines: list[str] = field(default_factory=list)
    charts: list[str] = field(default_factory=list)
    dashboards: list[str] = field(default_factory=list)
    edges: list[tuple[str, str, str, str]] = field(default_factory=list)

    def all_names(self) -> list[str]:
        names = [name for _, name in self.services]
        names += self.tables + self.pipelines + self.charts + self.dashboards
        for _from_type, from_fqn, _to_type, to_fqn in self.edges:
            names += [from_fqn, to_fqn]
        return names


def is_demo_name(name: str) -> bool:
    """True only for the demo namespace: ``lineage-demo`` or anything under it."""
    return (
        name == DEMO_PREFIX
        or name.startswith(DEMO_PREFIX + "-")
        or name.startswith(DEMO_PREFIX + ".")
    )


def plan(yaml_path: str) -> Inventory:
    """Build the deletion inventory from the demo seed YAML.

    Raises RemovalError if any record falls outside the demo namespace —
    the run aborts before anything is deleted.
    """
    import yaml

    with open(yaml_path, encoding="utf-8") as handle:
        seed = yaml.safe_load(handle)
    source = seed.get("source") or {}
    records = source.get("records") or []
    inventory = Inventory()

    # The implicit database service: the seed's source serviceName.
    service_name = str(source.get("serviceName") or "")
    if service_name:
        inventory.services.append(("databaseService", service_name))

    for record in records:
        kind = str(record.get("kind") or "")
        if kind in SERVICE_COLLECTIONS:
            inventory.services.append((kind, str(record.get("name") or "")))
        elif kind == "table":
            inventory.tables.append(f"{record.get('databaseSchema')}.{record.get('name')}")
        elif kind == "pipeline":
            inventory.pipelines.append(f"{record.get('service')}.{record.get('name')}")
        elif kind == "chart":
            inventory.charts.append(f"{record.get('service')}.{record.get('name')}")
        elif kind == "dashboard":
            inventory.dashboards.append(f"{record.get('service')}.{record.get('name')}")
        elif kind == "lineage":
            from_entity = record.get("fromEntity") or {}
            to_entity = record.get("toEntity") or {}
            inventory.edges.append(
                (
                    str(from_entity.get("type") or ""),
                    str(from_entity.get("fqn") or ""),
                    str(to_entity.get("type") or ""),
                    str(to_entity.get("fqn") or ""),
                )
            )
        # database / schema records need no step: the recursive service
        # delete cascades them.

    # Safety gate: every single name must be inside the demo namespace.
    offenders = sorted({name for name in inventory.all_names() if not is_demo_name(name)})
    if offenders:
        raise RemovalError(
            "refusing to proceed: these seed records are outside the "
            f"'{DEMO_PREFIX}' namespace: {offenders}"
        )
    if not inventory.services and not inventory.tables:
        raise RemovalError(f"no demo records found in {yaml_path}")
    return inventory


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
        raise RemovalError(f"{method} {url} failed: {exc.reason}") from exc


def _quote(value: str) -> str:
    return urllib.parse.quote(value, safe="")


def _expect(label: str, result: HttpResult, ok: tuple[int, ...]) -> None:
    if result.status not in ok:
        raise RemovalError(f"{label}: expected HTTP {ok}, got {result.status}: {result.body[:300]}")


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
    parser.add_argument(
        "--yaml",
        default=os.path.join(os.path.dirname(__file__), "lineage-demo.yaml"),
        help="demo seed YAML the deletion inventory is derived from",
    )
    parser.add_argument(
        "--delete",
        action="store_true",
        help="actually delete (without it, only the plan is printed)",
    )
    parser.add_argument(
        "--yes",
        action="store_true",
        help="skip the confirmation prompt (use with --delete)",
    )
    args = parser.parse_args(argv)
    api = args.api.rstrip("/")
    api_origin = api if api.endswith("/api") else f"{api}/api"

    inventory = plan(args.yaml)
    total = (
        len(inventory.edges)
        + len(inventory.tables)
        + len(inventory.pipelines)
        + len(inventory.charts)
        + len(inventory.dashboards)
        + len(inventory.services)
    )
    print(f"demo inventory from {args.yaml}:")
    print(f"  services:   {len(inventory.services)}")
    print(f"  tables:     {len(inventory.tables)}")
    print(f"  pipelines:  {len(inventory.pipelines)}")
    print(f"  charts:     {len(inventory.charts)}")
    print(f"  dashboards: {len(inventory.dashboards)}")
    print(f"  edges:      {len(inventory.edges)}")
    print(f"  total deletions: {total}")
    if not args.delete:
        print("plan only — nothing deleted (pass --delete to delete).")
        return 0
    if not args.yes:
        answer = (
            input(f"Delete these {total} demo entities and nothing else? [y/N] ").strip().lower()
        )
        if answer not in ("y", "yes"):
            print("aborted — nothing deleted.")
            return 0

    print("==> healthcheck")
    health = http_request(f"{args.admin.rstrip('/')}/healthcheck")
    _expect("server healthcheck is 200", health, (200,))

    print("==> login")
    encoded = base64.b64encode(args.login_password.encode("utf-8")).decode("ascii")
    login = http_request(
        f"{api_origin}/v1/users/login",
        method="POST",
        json_body={"email": args.login_email, "password": encoded},
    )
    _expect("login is 200", login, (200,))
    token = str(json.loads(login.body).get("accessToken") or "").strip()
    if not token:
        raise RemovalError("login returned no accessToken")
    auth = {"Authorization": f"Bearer {token}"}

    def delete(path: str, label: str) -> str:
        result = http_request(f"{api_origin}{path}", method="DELETE", headers=auth)
        if result.status == 200:
            return "deleted"
        if result.status == 404:
            return "already gone"
        raise RemovalError(
            f"{label}: expected HTTP 200/404, got {result.status}: {result.body[:300]}"
        )

    print("==> 1/3 delete lineage edges")
    for from_type, from_fqn, to_type, to_fqn in inventory.edges:
        path = f"/v1/lineage/{from_type}/name/{_quote(from_fqn)}/{to_type}/name/{_quote(to_fqn)}"
        print(f"  [{delete(path, f'edge {from_fqn} -> {to_fqn}')}] {from_fqn} -> {to_fqn}")

    print("==> 2/3 delete entities (hard delete)")
    for collection, fqns in [
        ("charts", inventory.charts),
        ("dashboards", inventory.dashboards),
        ("pipelines", inventory.pipelines),
        ("tables", inventory.tables),
    ]:
        for fqn in fqns:
            path = f"/v1/{collection}/name/{_quote(fqn)}?hardDelete=true"
            print(f"  [{delete(path, f'{collection[:-1]} {fqn}')}] {fqn}")

    print("==> 3/3 delete services (hard + recursive)")
    for kind, name in inventory.services:
        collection = SERVICE_COLLECTIONS[kind]
        path = f"/v1/services/{collection}/name/{_quote(name)}?hardDelete=true&recursive=true"
        print(f"  [{delete(path, f'service {name}')}] {name}")

    print("==> verify: every demo entity is gone")
    failures: list[str] = []
    for collection, fqns in [
        ("tables", inventory.tables),
        ("pipelines", inventory.pipelines),
        ("charts", inventory.charts),
        ("dashboards", inventory.dashboards),
    ]:
        for fqn in fqns:
            result = http_request(f"{api_origin}/v1/{collection}/name/{_quote(fqn)}", headers=auth)
            if result.status != 404:
                failures.append(f"{collection} {fqn} still returns {result.status}")
    for kind, name in inventory.services:
        collection = SERVICE_COLLECTIONS[kind]
        result = http_request(
            f"{api_origin}/v1/services/{collection}/name/{_quote(name)}", headers=auth
        )
        if result.status != 404:
            failures.append(f"service {name} still returns {result.status}")
    for collection in ("databaseServices", "pipelineServices", "dashboardServices"):
        result = http_request(f"{api_origin}/v1/services/{collection}?limit=100", headers=auth)
        _expect(f"list {collection} is 200", result, (200,))
        names = [str(item.get("name") or "") for item in json.loads(result.body).get("data") or []]
        leftovers = [name for name in names if is_demo_name(name)]
        if leftovers:
            failures.append(f"{collection} still lists demo services: {leftovers}")
        print(f"  remaining {collection}: {names}")
    if failures:
        raise RemovalError("verification failed:\n  - " + "\n  - ".join(failures))

    print("lineage demo removed: all demo entities gone, nothing else touched")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except RemovalError as exc:
        print(f"FAILED: {exc}", file=sys.stderr)
        sys.exit(1)
