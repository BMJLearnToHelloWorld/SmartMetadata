"""Contract for the live-smoke HTTP helper.

Offline only: no Docker, no live catalog. Run with
``python3 scripts/rebuild/test_live_smoke.py``.
"""

from __future__ import annotations

import base64
import http.server
import importlib.util
import json
import sys
import threading
import time
import unittest
from pathlib import Path
from unittest import mock

SCRIPT = Path(__file__).with_name("live_smoke.py")


def load_smoke():
    spec = importlib.util.spec_from_file_location("live_smoke", SCRIPT)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load {SCRIPT}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


class LiveSmokeContract(unittest.TestCase):
    def test_script_exists(self) -> None:
        self.assertTrue(SCRIPT.is_file())

    def test_helper_does_not_invoke_docker(self) -> None:
        smoke = load_smoke()
        source = Path(smoke.__file__).read_text(encoding="utf-8")
        for forbidden in ("docker compose", "docker-compose", "run_local_docker", "-i true"):
            self.assertNotIn(forbidden, source)

    def test_healthcheck_requires_http_200(self) -> None:
        smoke = load_smoke()
        smoke.assert_healthcheck(smoke.HttpResult(200, "ok", {}))
        with self.assertRaises(smoke.SmokeError):
            smoke.assert_healthcheck(smoke.HttpResult(503, "unavailable", {}))

    def test_mcp_unregistered_accepts_404(self) -> None:
        smoke = load_smoke()
        smoke.assert_mcp_unregistered(smoke.HttpResult(404, "not found", {}))
        smoke.assert_mcp_unregistered(smoke.HttpResult(405, "method not allowed", {}))

    def test_mcp_unregistered_rejects_live_servlet(self) -> None:
        smoke = load_smoke()
        with self.assertRaises(smoke.SmokeError):
            smoke.assert_mcp_unregistered(
                smoke.HttpResult(200, '{"jsonrpc":"2.0"}', {"Content-Type": "application/json"})
            )
        with self.assertRaises(smoke.SmokeError):
            smoke.assert_mcp_unregistered(
                smoke.HttpResult(200, "event: endpoint", {"Content-Type": "text/event-stream"})
            )

    def test_mcp_unregistered_rejects_500(self) -> None:
        smoke = load_smoke()
        with self.assertRaises(smoke.SmokeError) as raised:
            smoke.assert_mcp_unregistered(smoke.HttpResult(500, "IllegalStateException", {}))
        self.assertIn("got 500", str(raised.exception))

    def test_mcp_unregistered_rejects_spa_html(self) -> None:
        smoke = load_smoke()
        with self.assertRaises(smoke.SmokeError):
            smoke.assert_mcp_unregistered(
                smoke.HttpResult(200, "<html><div id='root'></div></html>", {"Content-Type": "text/html"})
            )

    def test_root_is_not_official_product_ui(self) -> None:
        smoke = load_smoke()
        smoke.assert_root_is_not_product_ui(smoke.HttpResult(404, "Not Found", {}))
        smoke.assert_root_is_not_product_ui(smoke.HttpResult(200, "Jetty 404", {}))
        with self.assertRaises(smoke.SmokeError):
            smoke.assert_root_is_not_product_ui(
                smoke.HttpResult(200, '<div id="root"></div><!-- openmetadata-ui -->', {})
            )

    def test_spa_preview_looks_like_smartmetadata(self) -> None:
        smoke = load_smoke()
        smoke.assert_spa_preview(smoke.HttpResult(200, '<div id="app"></div><title>SmartMetadata</title>', {}))
        with self.assertRaises(smoke.SmokeError):
            smoke.assert_spa_preview(smoke.HttpResult(200, "<html></html>", {}))

    def test_login_password_is_base64(self) -> None:
        smoke = load_smoke()
        payload = smoke.login_payload("admin@open-metadata.org", "admin")
        self.assertEqual(payload["email"], "admin@open-metadata.org")
        self.assertEqual(payload["password"], base64.b64encode(b"admin").decode("ascii"))

    def test_search_hit_prefers_table_or_topic(self) -> None:
        smoke = load_smoke()
        payload = {
            "hits": {
                "total": {"value": 2},
                "hits": [
                    {"_source": {"entityType": "dashboard", "fullyQualifiedName": "dash.one"}},
                    {"_source": {"entityType": "table", "fullyQualifiedName": "svc.db.sch.orders"}},
                ],
            }
        }
        hit = smoke.first_openable_hit(payload)
        self.assertEqual(hit, ("table", "svc.db.sch.orders"))
        self.assertIsNone(smoke.first_openable_hit({"hits": {"hits": []}}))

    def test_jwt_fail_closed_when_placeholder_has_no_default(self) -> None:
        smoke = load_smoke()
        config = "jwtToken: ${OM_JWT}\nhostPort: ${OM_API_URL:-http://localhost:8585/api}\n"
        smoke.assert_jwt_fail_closed(config, environ={"OM_API_URL": "http://localhost:8585/api"})
        with self.assertRaises(smoke.SmokeError):
            smoke.assert_jwt_fail_closed(config, environ={"OM_JWT": "secret-token"})
        with self.assertRaises(smoke.SmokeError):
            smoke.assert_jwt_fail_closed("jwtToken: ${OM_JWT:-dev}\n", environ={})

    def test_asset_path_encodes_fqn(self) -> None:
        smoke = load_smoke()
        self.assertEqual(
            smoke.asset_path("table", "svc.db.sch.orders"),
            "/api/v1/tables/name/svc.db.sch.orders",
        )
        self.assertEqual(
            smoke.asset_path("topic", "kafka.orders"),
            "/api/v1/topics/name/kafka.orders",
        )
        with self.assertRaises(smoke.SmokeError):
            smoke.asset_path("dashboard", "dash.one")

    def test_mcp_stdio_frames_are_ndjson_not_lsp(self) -> None:
        """MCP stdio is newline-delimited JSON-RPC, not LSP Content-Length."""
        smoke = load_smoke()
        payload = {"jsonrpc": "2.0", "id": 1, "method": "initialize"}
        framed = smoke.encode_mcp_message(payload)
        self.assertTrue(framed.endswith(b"\n"))
        self.assertNotIn(b"Content-Length", framed)
        self.assertEqual(framed.count(b"\n"), 1)
        messages, rest = smoke.decode_mcp_messages(framed)
        self.assertEqual(rest, b"")
        self.assertEqual(messages, [payload])
        names = [item.get("method") for item in smoke.mcp_search_entities_messages()]
        self.assertEqual(names, ["initialize", "notifications/initialized", "tools/call"])

    def test_run_mcp_stdio_times_out_when_child_never_replies(self) -> None:
        """A silent MCP child must fail fast. Blocking stdout.read() hung Job C ~56 min."""
        smoke = load_smoke()
        silent = (
            "import sys, time\n"
            "sys.stderr.write('silent-mcp-child\\n')\n"
            "sys.stderr.flush()\n"
            "sys.stdin.read()\n"
            "time.sleep(60)\n"
        )
        started = time.monotonic()
        with self.assertRaises(smoke.SmokeError) as raised:
            smoke.run_mcp_stdio(
                [sys.executable, "-u", "-c", silent],
                env={"OM_JWT": "tok"},
                timeout=1,
            )
        elapsed = time.monotonic() - started
        self.assertLess(elapsed, 8, f"stdio timeout did not fire; hung {elapsed:.1f}s")
        self.assertIn("timed out", str(raised.exception).lower())

    def test_run_mcp_stdio_search_entities_over_ndjson(self) -> None:
        smoke = load_smoke()
        fake = r"""
import json, sys
for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    msg = json.loads(line)
    method = msg.get("method")
    if method == "initialize":
        sys.stdout.write(json.dumps({"jsonrpc":"2.0","id":msg["id"],"result":{"protocolVersion":"2024-11-05"}}) + "\n")
        sys.stdout.flush()
    elif method == "tools/call":
        payload = {"hits":{"hits":[{"_source":{"entityType":"table","fullyQualifiedName":"a.b.c.orders"}}]}}
        result = {"content":[{"type":"text","text":json.dumps(payload)}]}
        sys.stdout.write(json.dumps({"jsonrpc":"2.0","id":msg["id"],"result":result}) + "\n")
        sys.stdout.flush()
"""
        reply = smoke.run_mcp_stdio(
            [sys.executable, "-u", "-c", fake],
            env={"OM_JWT": "tok"},
            timeout=5,
        )
        self.assertEqual(reply.get("id"), 2)
        self.assertNotIn("error", reply)
        text = reply["result"]["content"][0]["text"]
        self.assertIn("a.b.c.orders", text)

    def test_run_mcp_stdio_against_built_smartmetadata_mcp(self) -> None:
        """Handshake + search_entities against the real stdio server (NDJSON, not LSP)."""
        entry = Path(__file__).resolve().parents[2] / "smartmetadata-mcp" / "dist" / "index.js"
        if not entry.is_file():
            self.skipTest("smartmetadata-mcp dist not built")
        smoke = load_smoke()

        class Handler(http.server.BaseHTTPRequestHandler):
            def do_GET(self) -> None:
                if "/v1/search/query" not in self.path:
                    self.send_error(404)
                    return
                body = json.dumps(
                    {
                        "hits": {
                            "hits": [
                                {
                                    "_source": {
                                        "entityType": "table",
                                        "fullyQualifiedName": "live.smoke.orders",
                                    }
                                }
                            ]
                        }
                    }
                ).encode("utf-8")
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)

            def log_message(self, format: str, *args: object) -> None:
                return

        httpd = http.server.HTTPServer(("127.0.0.1", 0), Handler)
        thread = threading.Thread(target=httpd.serve_forever, daemon=True)
        thread.start()
        try:
            reply = smoke.run_mcp_stdio(
                ["node", str(entry)],
                env={
                    "OM_JWT": "tok",
                    "OM_API_URL": f"http://127.0.0.1:{httpd.server_address[1]}",
                    "OM_TIMEOUT_MS": "3000",
                },
                timeout=8,
            )
        finally:
            httpd.shutdown()
            httpd.server_close()
        self.assertEqual(reply.get("id"), 2)
        self.assertIn("live.smoke.orders", reply["result"]["content"][0]["text"])

    def test_run_mcp_stdio_fails_on_jsonrpc_error(self) -> None:
        smoke = load_smoke()
        fake = r"""
import json, sys
for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    msg = json.loads(line)
    if msg.get("method") == "tools/call":
        sys.stdout.write(json.dumps({"jsonrpc":"2.0","id":msg["id"],"error":{"code":-32000,"message":"boom"}}) + "\n")
        sys.stdout.flush()
"""
        with self.assertRaises(smoke.SmokeError) as raised:
            smoke.run_mcp_stdio(
                [sys.executable, "-u", "-c", fake],
                env={"OM_JWT": "tok"},
                timeout=5,
            )
        self.assertIn("boom", str(raised.exception))

    def test_run_login_search_uses_bearer_token(self) -> None:
        smoke = load_smoke()
        calls: list[tuple[str, str]] = []

        def fake_request(url: str, *, method: str = "GET", json_body=None, headers=None, timeout=30):
            calls.append((method, url))
            if url.endswith("/api/v1/users/login"):
                return smoke.HttpResult(200, json.dumps({"accessToken": "tok-1", "tokenType": "Bearer"}), {})
            if "/api/v1/search/query" in url:
                self.assertEqual((headers or {}).get("Authorization"), "Bearer tok-1")
                return smoke.HttpResult(
                    200,
                    json.dumps(
                        {
                            "hits": {
                                "total": {"value": 1},
                                "hits": [
                                    {
                                        "_source": {
                                            "entityType": "table",
                                            "fullyQualifiedName": "smoke.analytics.public.orders",
                                        }
                                    }
                                ],
                            }
                        }
                    ),
                    {},
                )
            if "/api/v1/tables/name/" in url:
                return smoke.HttpResult(200, json.dumps({"name": "orders"}), {})
            raise AssertionError(url)

        with mock.patch.object(smoke, "http_request", fake_request):
            token = smoke.run_login_search(
                api_origin="http://localhost:8585",
                email="admin@open-metadata.org",
                password="admin",
            )
        self.assertEqual(token, "tok-1")
        self.assertTrue(any(url.endswith("/api/v1/users/login") for _, url in calls))
        self.assertTrue(any("/api/v1/search/query" in url for _, url in calls))
        self.assertTrue(any("/api/v1/tables/name/" in url for _, url in calls))


if __name__ == "__main__":
    unittest.main()
