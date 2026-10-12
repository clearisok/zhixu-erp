from http.server import BaseHTTPRequestHandler, HTTPServer
from threading import Thread
from unittest import TestCase, main
from unittest.mock import patch
import json
import subprocess
import sys

from ainuoke_bridge.ainuoke_client import AinuokeLoginSession, ReportPage, AuthExpiredError, UpstreamSchemaError
from ainuoke_bridge.server_source import collect, validate_input, ProtectedTransport


CONFIG = {"baseUrl": "https://example.invalid", "username": "synthetic", "password": "never-reflect-secret", "contracts": ["CONTRACT-1"]}


class FakeClient:
    def __init__(self, expired=0, partial=False, total_change=False):
        self.logins = 0
        self.calls = []
        self.expired = expired
        self.partial = partial
        self.total_change = total_change

    def login(self, username, password):
        self.logins += 1
        return AinuokeLoginSession("synthetic-token", "synthetic-session")

    def read_report(self, definition, *, jwt_token, page, page_size, query_context):
        self.calls.append((int(definition.report_id), page, query_context))
        if self.expired:
            self.expired -= 1
            raise AuthExpiredError("never-reflect-secret")
        if int(definition.report_id) == 6086103:
            return ReportPage([{"BillNo": "CONTRACT-1", "InsideOrderNo": "INSIDE-1"}], 1, page, page_size)
        total = 52 if self.total_change and page == 2 else 51
        count = 50 if page == 1 else 1
        if self.partial:
            count -= 1
        return ReportPage([{"ExpContractNo": "CONTRACT-1", "id": str(i)} for i in range(count)], total, page, page_size)


class ServerSourceTests(TestCase):
    def test_only_fixed_reports_complete_pagination(self):
        client = FakeClient()
        data = collect(CONFIG, client)
        self.assertEqual(client.logins, 1)
        self.assertEqual([c[0] for c in client.calls], [6086103, 6087050, 6087050, 6086103])
        self.assertEqual(client.calls[1][2], {"insideOrderNo": "INSIDE-1"})
        self.assertEqual(len(data["materials"]["CONTRACT-1"]), 2)

    def test_single_auth_renewal_is_bounded(self):
        client = FakeClient(expired=1)
        collect(CONFIG, client)
        self.assertEqual(client.logins, 2)
        client = FakeClient(expired=2)
        with self.assertRaises(AuthExpiredError):
            collect(CONFIG, client)
        self.assertEqual(client.logins, 2)

    def test_partial_and_changing_totals_rejected(self):
        for client in (FakeClient(partial=True), FakeClient(total_change=True)):
            with self.subTest(client=client):
                with self.assertRaises(UpstreamSchemaError):
                    collect(CONFIG, client)

    def test_remote_plaintext_and_ambiguous_scope_rejected(self):
        for change in (
            {"baseUrl": "http://example.invalid"},
            {"baseUrl": "https://u:p@example.invalid"},
            {"baseUrl": "https://example.invalid/path"},
            {"contracts": ["Contract-1", " CONTRACT-1 "]},
            {"contracts": []},
            {"reportId": 123},
        ):
            with self.subTest(change=change):
                with self.assertRaises(ValueError):
                    validate_input({**CONFIG, **change})

    def test_redirect_never_forwards_credentials(self):
        paths = []
        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass
            def do_GET(self):
                paths.append(self.path.split("?")[0])
                self.send_response(302)
                self.send_header("Location", "/credential-sink")
                self.end_headers()
        server = HTTPServer(("127.0.0.1", 0), Handler)
        thread = Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            with self.assertRaises(UpstreamSchemaError):
                ProtectedTransport().request(url=f"http://127.0.0.1:{server.server_port}/login", method="GET", body={"password": "synthetic"}, headers={}, timeout=2)
            self.assertEqual(paths, ["/login"])
        finally:
            server.shutdown()
            server.server_close()
            thread.join(2)

    def test_response_size_and_invalid_json_fail_closed(self):
        class Response:
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def read(self, size): return b"x" * size
        with patch("ainuoke_bridge.server_source.build_opener") as opener:
            opener.return_value.open.return_value = Response()
            with patch("ainuoke_bridge.server_source.MAX_BYTES", 16):
                with self.assertRaises(UpstreamSchemaError):
                    ProtectedTransport().request(url=CONFIG["baseUrl"], method="POST", body={}, headers={}, timeout=2)

    def test_aggregate_size_is_bounded_before_final_serialization(self):
        with patch("ainuoke_bridge.server_source.MAX_BYTES", 100):
            with self.assertRaises(UpstreamSchemaError):
                collect(CONFIG, FakeClient())

    def test_invalid_worker_output_is_closed_error_without_credentials(self):
        result = subprocess.run([sys.executable, "-m", "ainuoke_bridge.server_source"], input=json.dumps({**CONFIG, "baseUrl": "http://example.invalid"}).encode(), capture_output=True, timeout=10)
        self.assertEqual(result.returncode, 1)
        self.assertEqual(json.loads(result.stdout), {"error": "source_invalid"})
        self.assertNotIn(b"never-reflect-secret", result.stdout + result.stderr)


if __name__ == "__main__":
    main()
