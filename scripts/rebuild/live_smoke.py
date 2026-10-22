#!/usr/bin/env python3
"""HTTP smoke against an already-running slim catalog.

Does **not** start Docker, MySQL, Elasticsearch, or the Java process. Point it
at GitHub Actions Job C (localhost on the runner), a remote VM, or a laptop
that is proxying to a catalog that is already up.

See ``docs/rebuild/VERIFY_RUNTIME.md``. Live e2e stays out of
``make verify-rebuild`` (ADR:2026-10-22-rebuild-verify-is-offline,
ADR:2026-10-22-rebuild-ci-is-a-separate-workflow).
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any

DEFAULT_ADMIN = "http://localhost:8586"
DEFAULT_API = "http://localhost:8585"
DEFAULT_LOGIN_EMAIL = "admin@open-metadata.org"
DEFAULT_LOGIN_PASSWORD = "admin"
JWT_PLACEHOLDER = re.compile(r"\$\{OM_JWT}(?!:-)")
JWT_WITH_DEFAULT = re.compile(r"\$\{OM_JWT:-")
OPENABLE = {
    "table": "/api/v1/tables/name/{fqn}",
    "topic": "/api/v1/topics/name/{fqn}",
}
OFFICIAL_UI_MARKERS = (
    "openmetadata-ui",
    "collate community",
    'id="root"',
    "data-testid=\"navbar\"",
)


class SmokeError(RuntimeError):
    """A live-smoke assertion failed."""


@dataclass(frozen=True)
class HttpResult:
    status: int
    body: str
    headers: dict[str, str]


def login_payload(email: str, password: str) -> dict[str, str]:
    encoded = base64.b64encode(password.encode("utf-8")).decode("ascii")
    return {"email": email, "password": encoded}


def normalize_origin(url: str) -> str:
    return url.rstrip("/")


def normalize_api_origin(url: str) -> str:
    origin = normalize_origin(url)
    if origin.endswith("/api"):
        return origin[: -len("/api")]
    return origin


def http_request(
    url: str,
    *,
    method: str = "GET",
    json_body: Any | None = None,
    headers: dict[str, str] | None = None,
    timeout: int = 30,
) -> HttpResult:
    data = None
    req_headers = {"Accept": "application/json, text/html;q=0.9, */*;q=0.8"}
    if headers:
        req_headers.update(headers)
    if json_body is not None:
        data = json.dumps(json_body).encode("utf-8")
        req_headers["Content-Type"] = "application/json"
    request = urllib.request.Request(url, data=data, headers=req_headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            body = response.read().decode("utf-8", errors="replace")
            header_map = {key: value for key, value in response.headers.items()}
            return HttpResult(response.getcode() or 0, body, header_map)
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace") if exc.fp else ""
        header_map = {key: value for key, value in exc.headers.items()} if exc.headers else {}
        return HttpResult(exc.code, body, header_map)
    except urllib.error.URLError as exc:
        raise SmokeError(f"{method} {url} failed: {exc.reason}") from exc


def assert_healthcheck(result: HttpResult) -> None:
    if result.status != 200:
        raise SmokeError(f"healthcheck expected HTTP 200, got {result.status}: {result.body[:200]}")


def _content_type(result: HttpResult) -> str:
    for key, value in result.headers.items():
        if key.lower() == "content-type":
            return value.lower()
    return ""


def assert_mcp_unregistered(result: HttpResult) -> None:
    ctype = _content_type(result)
    body = result.body.lower()
    looks_like_mcp = (
        "text/event-stream" in ctype
        or "jsonrpc" in body
        or "/mcp/sse" in body
        or "mcp-session" in body
    )
    if looks_like_mcp:
        raise SmokeError("GET /mcp looks registered; slim dist must leave official MCP off the classpath")
    if result.status in {404, 405}:
        return
    raise SmokeError(
        f"GET /mcp expected unregistered (404/405), got {result.status}: {result.body[:200]}"
    )


def assert_root_is_not_product_ui(result: HttpResult) -> None:
    body = result.body.lower()
    if any(marker in body for marker in OFFICIAL_UI_MARKERS):
        raise SmokeError("GET / looks like the official CCL UI; slim dist must not ship it")
    if result.status in {404, 401, 403}:
        return
    if result.status == 200:
        return
    raise SmokeError(f"GET / unexpected status {result.status}")


def assert_spa_preview(result: HttpResult) -> None:
    if result.status != 200:
        raise SmokeError(f"SPA preview expected HTTP 200, got {result.status}")
    body = result.body.lower()
    if "smartmetadata" not in body and 'id="app"' not in body:
        raise SmokeError("SPA preview is not the SmartMetadata Vue app")


def assert_jwt_fail_closed(config_text: str, environ: dict[str, str] | None = None) -> None:
    env = environ if environ is not None else dict(os.environ)
    if JWT_WITH_DEFAULT.search(config_text):
        raise SmokeError("OM_JWT has a ${OM_JWT:-default}; fail-closed requires a required placeholder")
    if not JWT_PLACEHOLDER.search(config_text):
        raise SmokeError("config does not contain required ${OM_JWT}")
    if env.get("OM_JWT", "").strip():
        raise SmokeError("OM_JWT is set; refuse to claim fail-closed while a token is present")


def first_openable_hit(payload: Any) -> tuple[str, str] | None:
    if not isinstance(payload, dict):
        return None
    hits = payload.get("hits")
    if not isinstance(hits, dict):
        return None
    inner = hits.get("hits")
    if not isinstance(inner, list):
        return None
    fallback: tuple[str, str] | None = None
    for item in inner:
        if not isinstance(item, dict):
            continue
        source = item.get("_source")
        if not isinstance(source, dict):
            source = item
        entity_type = str(source.get("entityType") or "").strip().lower()
        fqn = str(source.get("fullyQualifiedName") or "").strip()
        if not entity_type or not fqn:
            continue
        if entity_type in OPENABLE:
            return entity_type, fqn
        if fallback is None:
            fallback = (entity_type, fqn)
    return None


def asset_path(entity_type: str, fqn: str) -> str:
    template = OPENABLE.get(entity_type)
    if template is None:
        raise SmokeError(f"no Phase-1 detail endpoint for entity type {entity_type!r}")
    return template.format(fqn=urllib.parse.quote(fqn, safe="."))


def run_login_search(
    *,
    api_origin: str,
    email: str,
    password: str,
) -> str:
    origin = normalize_api_origin(api_origin)
    login = http_request(
        f"{origin}/api/v1/users/login",
        method="POST",
        json_body=login_payload(email, password),
    )
    if login.status != 200:
        raise SmokeError(f"login expected HTTP 200, got {login.status}: {login.body[:300]}")
    try:
        body = json.loads(login.body)
    except json.JSONDecodeError as exc:
        raise SmokeError("login did not return JSON") from exc
    token = str(body.get("accessToken") or "").strip()
    if not token:
        raise SmokeError("login JSON had no accessToken")
    auth = {"Authorization": f"Bearer {token}"}
    query = urllib.parse.urlencode({"q": "*", "index": "dataAsset", "from": 0, "size": 20})
    search = http_request(f"{origin}/api/v1/search/query?{query}", headers=auth)
    if search.status != 200:
        raise SmokeError(f"search expected HTTP 200, got {search.status}: {search.body[:300]}")
    try:
        payload = json.loads(search.body)
    except json.JSONDecodeError as exc:
        raise SmokeError("search did not return JSON") from exc
    hit = first_openable_hit(payload)
    if hit is None:
        print("search returned no table/topic hit (empty catalog is allowed)")
        return token
    entity_type, fqn = hit
    detail = http_request(f"{origin}{asset_path(entity_type, fqn)}?fields=owners,tags", headers=auth)
    if detail.status != 200:
        raise SmokeError(f"open {entity_type} {fqn} expected HTTP 200, got {detail.status}")
    print(f"opened {entity_type} {fqn}")
    return token


def encode_mcp_message(payload: dict[str, Any]) -> bytes:
    body = json.dumps(payload).encode("utf-8")
    return f"Content-Length: {len(body)}\r\n\r\n".encode("ascii") + body


def decode_mcp_messages(buffer: bytes) -> tuple[list[dict[str, Any]], bytes]:
    messages: list[dict[str, Any]] = []
    while True:
        header_end = buffer.find(b"\r\n\r\n")
        if header_end < 0:
            return messages, buffer
        header = buffer[:header_end].decode("ascii", errors="replace")
        match = re.search(r"Content-Length:\s*(\d+)", header, re.I)
        if match is None:
            raise SmokeError("MCP stdio message is missing Content-Length")
        length = int(match.group(1))
        start = header_end + 4
        if len(buffer) < start + length:
            return messages, buffer
        raw = buffer[start : start + length]
        messages.append(json.loads(raw.decode("utf-8")))
        buffer = buffer[start + length :]


def mcp_search_entities_messages() -> list[dict[str, Any]]:
    return [
        {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {
                "protocolVersion": "2024-11-05",
                "capabilities": {},
                "clientInfo": {"name": "smartmetadata-live-smoke", "version": "0.1.0"},
            },
        },
        {"jsonrpc": "2.0", "method": "notifications/initialized"},
        {
            "jsonrpc": "2.0",
            "id": 2,
            "method": "tools/call",
            "params": {"name": "search_entities", "arguments": {"q": "*"}},
        },
    ]


def run_mcp_stdio(command: list[str], *, env: dict[str, str], timeout: int = 30) -> dict[str, Any]:
    jwt = env.get("OM_JWT", "").strip()
    if not jwt:
        raise SmokeError("OM_JWT is required for MCP stdio")
    merged = dict(os.environ)
    merged.update(env)
    proc = subprocess.Popen(
        command,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        env=merged,
    )
    assert proc.stdin is not None
    assert proc.stdout is not None
    try:
        for message in mcp_search_entities_messages():
            proc.stdin.write(encode_mcp_message(message))
            proc.stdin.flush()
        deadline = time.time() + timeout
        buffer = b""
        while time.time() < deadline:
            if proc.stdout.readable():
                chunk = proc.stdout.read1(4096) if hasattr(proc.stdout, "read1") else proc.stdout.read(4096)
                if chunk:
                    buffer += chunk
                messages, buffer = decode_mcp_messages(buffer)
                for item in messages:
                    if item.get("id") == 2:
                        if item.get("error"):
                            raise SmokeError(f"MCP search_entities error: {item['error']}")
                        return item
            if proc.poll() is not None and not buffer:
                stderr = proc.stderr.read().decode("utf-8", errors="replace") if proc.stderr else ""
                raise SmokeError(f"MCP process exited before search_entities: {stderr[:400]}")
            time.sleep(0.05)
        raise SmokeError("MCP stdio timed out waiting for search_entities")
    finally:
        proc.kill()
        proc.wait(timeout=5)


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--admin-url", default=DEFAULT_ADMIN, help="Dropwizard admin origin")
    parser.add_argument("--api-url", default=DEFAULT_API, help="Slim server origin (port 8585)")
    parser.add_argument("--spa-url", default="", help="Optional SmartMetadata Vite preview origin")
    parser.add_argument("--login-email", default=DEFAULT_LOGIN_EMAIL)
    parser.add_argument("--login-password", default=DEFAULT_LOGIN_PASSWORD)
    parser.add_argument(
        "--ingest-fail-closed",
        metavar="CONFIG",
        help="Assert CONFIG contains required ${OM_JWT} and OM_JWT is unset",
    )
    parser.add_argument(
        "--token-out",
        metavar="PATH",
        help="Write the login accessToken to PATH (for optional MCP / JWT ingest)",
    )
    parser.add_argument("--skip-login", action="store_true", help="Only health /mcp GET /")
    parser.add_argument(
        "--no-http",
        action="store_true",
        help="Skip health/login/SPA (for --ingest-fail-closed on a machine without a catalog)",
    )
    parser.add_argument(
        "--mcp-command",
        nargs="+",
        help="Optional stdio MCP server command (requires OM_JWT). Example: node smartmetadata-mcp/dist/index.js",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv if argv is not None else sys.argv[1:])
    try:
        if args.no_http:
            if not args.ingest_fail_closed:
                raise SmokeError("--no-http requires --ingest-fail-closed")
            path = Path(args.ingest_fail_closed)
            print(f"==> ingest fail-closed {path}")
            environ = {key: value for key, value in os.environ.items() if key != "OM_JWT"}
            assert_jwt_fail_closed(path.read_text(encoding="utf-8"), environ=environ)
            print("Live smoke passed (fail-closed only).")
            return 0
        admin = normalize_origin(args.admin_url)
        origin = normalize_api_origin(args.api_url)
        print(f"==> healthcheck {admin}/healthcheck")
        assert_healthcheck(http_request(f"{admin}/healthcheck"))
        print("==> GET /mcp (must be unregistered)")
        assert_mcp_unregistered(http_request(f"{origin}/mcp"))
        print("==> GET / (must not be official UI)")
        assert_root_is_not_product_ui(http_request(f"{origin}/"))
        token = ""
        if not args.skip_login:
            print("==> login → search → open asset if seeded")
            token = run_login_search(
                api_origin=origin,
                email=args.login_email,
                password=args.login_password,
            )
            if args.token_out:
                Path(args.token_out).write_text(token, encoding="utf-8")
        if args.spa_url:
            spa = normalize_origin(args.spa_url)
            print(f"==> SPA preview {spa}/")
            assert_spa_preview(http_request(f"{spa}/"))
        if args.ingest_fail_closed:
            path = Path(args.ingest_fail_closed)
            print(f"==> ingest fail-closed {path}")
            environ = {key: value for key, value in os.environ.items() if key != "OM_JWT"}
            assert_jwt_fail_closed(path.read_text(encoding="utf-8"), environ=environ)
        if args.mcp_command:
            print(f"==> MCP stdio {' '.join(args.mcp_command)}")
            run_mcp_stdio(args.mcp_command, env=dict(os.environ))
        print("Live smoke passed (HTTP). Docker was not started by this script.")
        return 0
    except SmokeError as exc:
        print(f"live-smoke FAILED: {exc}", file=sys.stderr)
        print("See docs/rebuild/VERIFY_RUNTIME.md.", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
