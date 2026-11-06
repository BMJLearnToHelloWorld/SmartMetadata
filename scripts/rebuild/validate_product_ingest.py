#!/usr/bin/env python3
"""Validate the product postgres ingest: entities landed, rerun is idempotent.

Product counterpart of the reference ``scripts/validate_sample_data.py``.
Checks, against a live slim server, that the postgres example ingest
(``smartmetadata-ingestion/examples/postgres-metadata.yaml``) created the
expected service / database / schema / tables, then optionally records the
entity IDs in a snapshot file: a second run must find the same IDs (same
entities upserted, no duplicates) and the same table count.

Stdlib only. Exit 0 on pass, 1 on failure. Auth is a bot JWT from OM_JWT,
or a bootstrap login (OM_LOGIN_EMAIL / OM_LOGIN_PASSWORD, admin defaults).
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
from pathlib import Path
from typing import Any

DEFAULT_API_URL = "http://localhost:8585/api"
DEFAULT_SERVICE = "warehouse"
DEFAULT_DATABASE = "warehouse"
DEFAULT_SCHEMA = "public"
# (table, expected columns) — must match scripts/rebuild/seed-postgres.sql.
EXPECTED_TABLES: dict[str, list[str]] = {
    "customers": ["id", "name", "email"],
    "orders": ["id", "customer_id", "total"],
    "customer_orders": ["customer_id", "total"],
}


def api_request(
    base: str, path: str, token: str, *, method: str = "GET"
) -> tuple[int, Any]:
    url = f"{base.rstrip('/')}{path}"
    request = urllib.request.Request(
        url, method=method, headers={"Authorization": f"Bearer {token}"}
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return response.status, json.loads(response.read() or b"null")
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")[:500]
        return exc.code, {"error": body}


def login(api_url: str, email: str, password: str) -> str:
    payload = json.dumps(
        {
            "email": email,
            "password": base64.b64encode(password.encode("utf-8")).decode("ascii"),
        }
    ).encode("utf-8")
    request = urllib.request.Request(
        f"{api_url.rstrip('/')}/users/login",
        data=payload,
        method="POST",
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            body = json.loads(response.read())
    except urllib.error.HTTPError as exc:
        raise SystemExit(
            f"login failed: HTTP {exc.code}: "
            f"{exc.read().decode('utf-8', errors='replace')[:300]}"
        ) from exc
    token = body.get("accessToken")
    if not token:
        raise SystemExit("login JSON had no accessToken")
    return str(token)


def require_ok(status: int, payload: Any, what: str) -> dict[str, Any]:
    if status != 200 or not isinstance(payload, dict):
        raise SystemExit(f"{what}: expected HTTP 200, got {status}: {payload}")
    return payload


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--api-url", default=os.environ.get("OM_API_URL", DEFAULT_API_URL))
    parser.add_argument("--service", default=DEFAULT_SERVICE)
    parser.add_argument("--database", default=DEFAULT_DATABASE)
    parser.add_argument("--schema", default=DEFAULT_SCHEMA)
    parser.add_argument(
        "--id-snapshot",
        type=Path,
        help="Write entity IDs on the first run and require the same IDs on the next run.",
    )
    args = parser.parse_args()

    api_url = args.api_url
    token = os.environ.get("OM_JWT", "").strip()
    if not token:
        token = login(
            api_url,
            os.environ.get("OM_LOGIN_EMAIL", "admin@open-metadata.org"),
            os.environ.get("OM_LOGIN_PASSWORD", "admin"),
        )
        print("logged in with bootstrap credentials")

    service_fqn = args.service
    database_fqn = f"{args.service}.{args.database}"
    schema_fqn = f"{database_fqn}.{args.schema}"

    # 1. Database service landed.
    status, service = api_request(
        api_url, f"/services/databaseServices/name/{service_fqn}", token
    )
    service = require_ok(status, service, f"database service {service_fqn}")
    if service.get("serviceType") != "Postgres":
        raise SystemExit(
            f"database service {service_fqn}: expected serviceType Postgres, "
            f"got {service.get('serviceType')}"
        )
    print(f"service ok: {service_fqn} (Postgres)")

    # 2. Database landed.
    status, database = api_request(api_url, f"/databases/name/{database_fqn}", token)
    require_ok(status, database, f"database {database_fqn}")
    print(f"database ok: {database_fqn}")

    # 3. Schema landed.
    status, schema = api_request(
        api_url, f"/databaseSchemas/name/{schema_fqn}", token
    )
    require_ok(status, schema, f"schema {schema_fqn}")
    print(f"schema ok: {schema_fqn}")

    # 4. Tables landed, with the expected columns.
    query = urllib.parse.urlencode(
        {"databaseSchema": schema_fqn, "limit": 100, "fields": "columns"}
    )
    status, tables_page = api_request(api_url, f"/tables?{query}", token)
    tables_page = require_ok(status, tables_page, f"tables in {schema_fqn}")
    found: dict[str, dict[str, Any]] = {
        str(t.get("fullyQualifiedName", "")).rsplit(".", 1)[-1]: t
        for t in tables_page.get("data", [])
        if isinstance(t, dict)
    }
    missing = sorted(set(EXPECTED_TABLES) - set(found))
    if missing:
        raise SystemExit(
            f"tables missing in {schema_fqn}: {missing} (found: {sorted(found)})"
        )
    for name, columns in EXPECT_TABLES.items():
        actual = {str(c.get("name")) for c in found[name].get("columns", [])}
        absent = sorted(set(columns) - actual)
        if absent:
            raise SystemExit(f"table {name}: missing columns {absent} (have {sorted(actual)})")
    print(f"tables ok: {sorted(found)} ({len(found)} tables in {schema_fqn})")

    # 5. Idempotency snapshot: same entity IDs (and same table set) every run.
    tracked = {
        f"service:{service_fqn}": str(service.get("id")),
        f"database:{database_fqn}": str(database.get("id")),
        f"schema:{schema_fqn}": str(schema.get("id")),
        **{
            f"table:{schema_fqn}.{name}": str(found[name].get("id"))
            for name in sorted(EXPECTED_TABLES)
        },
        "table-count": str(len(found)),
    }
    if args.id_snapshot is not None:
        snapshot = args.id_snapshot
        if snapshot.exists():
            expected = json.loads(snapshot.read_text(encoding="utf-8"))
            if expected != tracked:
                raise SystemExit(
                    "entity IDs changed after rerunning the ingest: "
                    f"expected {expected}, found {tracked}"
                )
            print(f"idempotency ok: snapshot {snapshot} unchanged")
        else:
            snapshot.write_text(
                json.dumps(tracked, indent=2, sort_keys=True), encoding="utf-8"
            )
            print(f"id snapshot written: {snapshot}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
