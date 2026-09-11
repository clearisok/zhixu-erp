from __future__ import annotations

import pathlib
import sys
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from ainuoke_bridge.credential_store import MemoryCredentialStore  # noqa: E402
from ainuoke_bridge.http_server import BridgeApplication, BridgeRequest, SESSION_COOKIE  # noqa: E402
from ainuoke_bridge.security import SecurityContract  # noqa: E402
from ainuoke_bridge.service import AinuokeBridgeService  # noqa: E402
from ainuoke_bridge.session_store import AinuokeTokenCache, BrowserSessionStore  # noqa: E402

from test_service import FakeClient  # noqa: E402


ORIGIN = "http://127.0.0.1:3001"


class BridgeHttpContractTests(unittest.TestCase):
    def setUp(self) -> None:
        self.sessions = BrowserSessionStore()
        self.credentials = MemoryCredentialStore()
        self.tokens = AinuokeTokenCache()
        self.service = AinuokeBridgeService(credentials=self.credentials, token_cache=self.tokens, client=FakeClient())
        self.app = BridgeApplication(security=SecurityContract("127.0.0.1"), sessions=self.sessions, service=self.service)

    def create_session(self, user_id: str = "user-a") -> tuple[str, str]:
        response = self.app.handle(BridgeRequest("POST", "/v1/session", ORIGIN, body={"userId": user_id}))
        cookie = response.headers["Set-Cookie"].split(";", 1)[0]
        return cookie, str(response.body["csrfToken"])

    def request(self, method: str, path: str, *, cookie: str | None = None, csrf: str | None = None, body=None):
        headers = {}
        if cookie:
            headers["Cookie"] = cookie
        if csrf:
            headers["X-Zhixu-CSRF"] = csrf
        return self.app.handle(BridgeRequest(method, path, ORIGIN, headers=headers, body=body or {}))

    def test_disallowed_origin_is_rejected_without_wildcard_cors(self) -> None:
        response = self.app.handle(BridgeRequest("POST", "/v1/session", "https://attacker.example", body={"userId": "user-a"}))
        self.assertEqual(response.status, 403)
        self.assertNotIn("Access-Control-Allow-Origin", response.headers)

    def test_mutations_require_session_and_csrf_nonce(self) -> None:
        cookie, csrf = self.create_session()
        missing = self.request("PUT", "/v1/ainuoke/account", cookie=cookie, body={"username": "alice", "password": "secret"})
        wrong = self.request("PUT", "/v1/ainuoke/account", cookie=cookie, csrf="wrong", body={"username": "alice", "password": "secret"})
        valid = self.request("PUT", "/v1/ainuoke/account", cookie=cookie, csrf=csrf, body={"username": "alice", "password": "secret"})
        self.assertEqual((missing.status, wrong.status, valid.status), (400, 400, 200))

    def test_unknown_report_and_write_like_endpoint_are_rejected(self) -> None:
        cookie, csrf = self.create_session()
        self.request("PUT", "/v1/ainuoke/account", cookie=cookie, csrf=csrf, body={"username": "alice", "password": "secret"})
        unknown = self.request("POST", "/v1/ainuoke/reports/9999999/query", cookie=cookie, csrf=csrf)
        write_like = self.request("POST", "/v1/ainuoke/orders/create", cookie=cookie, csrf=csrf)
        self.assertEqual(unknown.status, 400)
        self.assertEqual(unknown.body["error"]["code"], "unknown_report")
        self.assertEqual(write_like.status, 405)
        self.assertEqual(write_like.body["error"]["code"], "read_only_boundary")

    def test_report_endpoint_rejects_raw_upstream_selector_and_condition(self) -> None:
        cookie, csrf = self.create_session()
        self.request("PUT", "/v1/ainuoke/account", cookie=cookie, csrf=csrf, body={"username": "alice", "password": "secret"})
        for body in (
            {"reportId": "6086103", "query": {"insideOrderNo": "D1935"}},
            {"sqlCdtn": {}, "query": {"insideOrderNo": "D1935"}},
            {"query": {"conditionList": []}},
        ):
            with self.subTest(body=body):
                response = self.request("POST", "/v1/ainuoke/reports/sales_contracts/query", cookie=cookie, csrf=csrf, body=body)
                self.assertEqual(response.status, 400)
                self.assertEqual(response.body["error"]["code"], "invalid_query")

    def test_order_discovery_accepts_only_empty_query(self) -> None:
        cookie, csrf = self.create_session()
        self.request("PUT", "/v1/ainuoke/account", cookie=cookie, csrf=csrf, body={"username": "alice", "password": "secret"})
        accepted = self.request("POST", "/v1/ainuoke/reports/order_discovery/query", cookie=cookie, csrf=csrf, body={"page": 1, "pageSize": 50, "query": {}})
        rejected = self.request("POST", "/v1/ainuoke/reports/order_discovery/query", cookie=cookie, csrf=csrf, body={"page": 1, "pageSize": 50, "query": {"status": "生效"}})
        self.assertEqual(accepted.status, 200)
        self.assertEqual(accepted.body["reportId"], "6086103")
        self.assertEqual(accepted.body["queryContext"], {})
        self.assertEqual(rejected.status, 400)
        self.assertEqual(rejected.body["error"]["code"], "invalid_query")

    def test_garment_color_size_endpoint_is_fixed_and_rejects_condition_injection(self) -> None:
        cookie, csrf = self.create_session()
        self.request("PUT", "/v1/ainuoke/account", cookie=cookie, csrf=csrf, body={"username": "alice", "password": "secret"})
        accepted = self.request("POST", "/v1/ainuoke/reports/garment_color_size_details/query", cookie=cookie, csrf=csrf, body={"page": 1, "pageSize": 50, "query": {"salesContractNo": "PI2607-235"}})
        injected = self.request("POST", "/v1/ainuoke/reports/garment_color_size_details/query", cookie=cookie, csrf=csrf, body={"page": 1, "pageSize": 50, "query": {"salesContractNo": "PI2607-235", "conditionList": []}})
        mixed = self.request("POST", "/v1/ainuoke/reports/garment_color_size_details/query", cookie=cookie, csrf=csrf, body={"page": 1, "pageSize": 50, "query": {"salesContractNo": "PI2607-235", "insideOrderNo": "D1935"}})
        raw = self.request("POST", "/v1/ainuoke/reports/6087105/query", cookie=cookie, csrf=csrf, body={"page": 1, "pageSize": 50, "query": {"salesContractNo": "PI2607-235"}})
        self.assertEqual(accepted.status, 200)
        self.assertEqual(accepted.body["reportId"], "6087105")
        self.assertEqual(injected.body["error"]["code"], "invalid_query")
        self.assertEqual(mixed.body["error"]["code"], "invalid_query")
        self.assertEqual(raw.body["error"]["code"], "unknown_report")

    def test_unbind_invalidates_bridge_session_and_upstream_cache(self) -> None:
        cookie, csrf = self.create_session()
        self.request("PUT", "/v1/ainuoke/account", cookie=cookie, csrf=csrf, body={"username": "alice", "password": "secret"})
        response = self.request("DELETE", "/v1/ainuoke/account", cookie=cookie, csrf=csrf)
        self.assertEqual(response.status, 200)
        self.assertIsNone(self.tokens.get("user-a"))
        self.assertEqual(self.request("GET", "/v1/ainuoke/account", cookie=cookie).status, 400)

    def test_account_request_uses_session_user_not_request_user_id(self) -> None:
        cookie_a, csrf_a = self.create_session("user-a")
        cookie_b, csrf_b = self.create_session("user-b")
        self.request("PUT", "/v1/ainuoke/account", cookie=cookie_a, csrf=csrf_a, body={"userId": "user-b", "username": "alice", "password": "secret-a"})
        self.request("PUT", "/v1/ainuoke/account", cookie=cookie_b, csrf=csrf_b, body={"userId": "user-a", "username": "bob", "password": "secret-b"})
        self.assertEqual(self.credentials.get("user-a").username, "alice")  # type: ignore[union-attr]
        self.assertEqual(self.credentials.get("user-b").username, "bob")  # type: ignore[union-attr]

    def test_unexpected_error_response_does_not_leak_secret_or_raw_exception(self) -> None:
        cookie, csrf = self.create_session()
        self.service.client.login_results = [RuntimeError("credential-secret jwt-secret")]  # type: ignore[attr-defined]
        response = self.request("PUT", "/v1/ainuoke/account", cookie=cookie, csrf=csrf, body={"username": "alice", "password": "credential-secret"})
        encoded = str(response.body)
        self.assertEqual(response.status, 500)
        self.assertNotIn("credential-secret", encoded)
        self.assertNotIn("jwt-secret", encoded)


if __name__ == "__main__":
    unittest.main()
