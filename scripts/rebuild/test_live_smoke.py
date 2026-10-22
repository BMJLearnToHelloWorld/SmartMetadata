"""Contract for the live-smoke HTTP helper.

Offline only: no Docker, no live catalog. Run with
``python3 scripts/rebuild/test_live_smoke.py``.
"""

from __future__ import annotations

import base64
import importlib.util
import json
import sys
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

    def test_mcp_stdio_frames_round_trip(self) -> None:
        smoke = load_smoke()
        payload = {"jsonrpc": "2.0", "id": 1, "method": "initialize"}
        framed = smoke.encode_mcp_message(payload)
        self.assertTrue(framed.startswith(b"Content-Length:"))
        messages, rest = smoke.decode_mcp_messages(framed)
        self.assertEqual(rest, b"")
        self.assertEqual(messages, [payload])
        names = [item.get("method") for item in smoke.mcp_search_entities_messages()]
        self.assertEqual(names, ["initialize", "notifications/initialized", "tools/call"])

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
