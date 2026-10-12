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
    def test_probe_reads_only_three_first_pages_without_raw_values(self):
        client = FakeClient()
        result = collect({**CONFIG, "mode": "probe", "contracts": []}, client)
        self.assertEqual(client.logins, 1)
        self.assertEqual(client.calls, [(6086103, 1, {}), (6087105, 1, {"salesContractNo": "CONTRACT-1"}), (6087050, 1, {"insideOrderNo": "INSIDE-1"})])
        self.assertEqual([r["complete"] for r in result["reports"]], [True, False, False])
        for value in ("CONTRACT-1", "INSIDE-1", "synthetic-token", "never-reflect-secret"):
            self.assertNotIn(value, json.dumps(result))

    def test_probe_empty_discovery_leaves_downstream_unverified(self):
        client = FakeClient()
        with patch.object(client, "read_report", return_value=ReportPage([], 0, 1, 50)) as read:
            result = collect({**CONFIG, "mode": "probe", "contracts": []}, client)
        self.assertEqual(read.call_count, 1)
        self.assertEqual([r["status"] for r in result["reports"]], ["readable", "not-probed", "not-probed"])

    def test_probe_never_renews_expired_session(self):
        client = FakeClient(expired=1)
        with self.assertRaises(AuthExpiredError):
            collect({**CONFIG, "mode": "probe", "contracts": []}, client)
        self.assertEqual(client.logins, 1)
        self.assertEqual(len(client.calls), 1)

    def test_probe_rejects_partial_pages_and_missing_first_identity(self):
        with self.assertRaises(UpstreamSchemaError):
            collect({**CONFIG, "mode": "probe", "contracts": []}, FakeClient(partial=True))
        for rows, total, index, size in [([{}], 1, 1, 50), ([], -1, 1, 50), ([], True, 1, 50), ([], 0, 2, 50), ([], 0, 1, 49)]:
            with self.subTest(rows=rows, total=total, index=index, size=size):
                with patch.object(FakeClient, "read_report", return_value=ReportPage(rows, total, index, size)):
                    with self.assertRaises(UpstreamSchemaError):
                        collect({**CONFIG, "mode": "probe", "contracts": []}, FakeClient())

    def test_probe_refuses_supplied_contracts_and_public_plaintext(self):
        for change in ({"contracts": ["CONTRACT-1"]}, {"baseUrl": "http://example.invalid"}):
            with self.assertRaises(ValueError):
                validate_input({**CONFIG, "mode": "probe", "contracts": [], **change})

    def test_probe_production_client_disables_network_retries(self):
        with patch("ainuoke_bridge.server_source.AinuokeClient", return_value=FakeClient()) as client:
            collect({**CONFIG, "mode": "probe", "contracts": []})
        self.assertEqual(client.call_args.kwargs["network_retries"], 0)

    def test_binding_mode_reads_all_discovery_contracts_with_formal_color_query(self):
        client = FakeClient()
        data = collect({**CONFIG, "mode": "bindings", "contracts": []}, client)
        self.assertEqual(data["schemaVersion"], "ainuoke-order-binding.v1")
        self.assertEqual([c[0] for c in client.calls], [6086103, 6087105, 6087105, 6086103])
        self.assertEqual(client.calls[1][2], {"salesContractNo": "CONTRACT-1"})
        self.assertEqual(set(data["colors"]), {"CONTRACT-1"})

    def test_binding_mode_rejects_caller_scope_or_unknown_mode(self):
        for change in ({"mode": "bindings"}, {"mode": "inventory", "contracts": []}):
            with self.assertRaises(ValueError):
                validate_input({**CONFIG, **change})

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
