from http.server import BaseHTTPRequestHandler, HTTPServer
from threading import Thread
from unittest import TestCase, main
from unittest.mock import patch
import json
import subprocess
import sys
import io
import getpass
import warnings

from ainuoke_bridge.ainuoke_client import AinuokeLoginSession, ReportPage, AuthExpiredError, UpstreamSchemaError
from ainuoke_bridge.server_source import collect, validate_input, ProtectedTransport, read_input, main as worker_main, APPROVED_HTTP_ORIGIN, APPROVED_HTTP_POLICY


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
    def test_readonly_audit_reads_complete_discovery_and_spread_samples_only(self):
        class AuditClient(FakeClient):
            def read_report(self, definition, *, jwt_token, page, page_size, query_context):
                self.calls.append((int(definition.report_id), page, query_context))
                if int(definition.report_id) == 6086103:
                    rows = [{"BillNo": f"SC-{i:04d}", "InsideOrderNo": f"IN-{i:04d}"} for i in range(558)]
                    return ReportPage(rows[(page-1)*50:page*50], 558, page, page_size)
                return ReportPage([], 0, page, page_size)
        client = AuditClient()
        with patch("time.sleep"):
            result = collect({**CONFIG, "contracts": [], "mode": "audit"}, client)
        self.assertEqual(client.logins, 1)
        self.assertEqual(result["schemaVersion"], "ainuoke-readonly-audit.v1")
        self.assertEqual(len(result["discoveryBefore"]), 12)
        self.assertEqual(len(result["discoveryAfter"]), 12)
        self.assertEqual(len(result["materials"]), 80)
        self.assertIn("SC-0000", result["materials"])
        self.assertIn("SC-0557", result["materials"])
        self.assertEqual(result["reportRequests"], 104)
        self.assertTrue(all(c[0] in (6086103, 6087050) for c in client.calls))
        self.assertNotIn(CONFIG["password"], json.dumps(result))

    def test_readonly_audit_is_private_explicit_mode_without_custom_scope(self):
        with patch("sys.stdin.isatty", return_value=True), patch("builtins.input", return_value="private"), patch("getpass.getpass", return_value="hidden"):
            self.assertEqual(read_input(["--interactive-readonly-audit"])["mode"], "audit")
        with self.assertRaises(ValueError):
            validate_input({**CONFIG, "mode": "audit"})
        with patch("time.sleep"), self.assertRaises(UpstreamSchemaError):
            collect({**CONFIG, "contracts": [], "mode": "audit"}, FakeClient(partial=True))

    def test_d109_is_exact_origin_and_explicit_policy_for_all_fixed_modes(self):
        approved = {**CONFIG, "baseUrl": APPROVED_HTTP_ORIGIN, "transportPolicy": APPROVED_HTTP_POLICY}
        for mode in (None, "bindings", "probe"):
            data = approved if mode is None else {**approved, "contracts": [], "mode": mode}
            client = FakeClient()
            collect(data, client)
            self.assertEqual(client.logins, 1)
            self.assertTrue(all(c[0] in (6086103, 6087105, 6087050) for c in client.calls))
        for change in ({"transportPolicy": None}, {"transportPolicy": "allow-http"}, {"baseUrl": "http://example.invalid"},
                       {"baseUrl": APPROVED_HTTP_ORIGIN + "/kaijin"}, {"baseUrl": APPROVED_HTTP_ORIGIN + "?x=1"},
                       {"baseUrl": "http://61.164.81.194:9044"}, {"baseUrl": "https://61.164.81.194:9043"},
                       {"baseUrl": "http://127.0.0.1:9043"}, {"baseUrl": "http://u:p@61.164.81.194:9043"}):
            with self.subTest(change=change), self.assertRaises(ValueError):
                validate_input({**approved, **change})
        with self.assertRaises(ValueError):
            validate_input({**CONFIG, "baseUrl": APPROVED_HTTP_ORIGIN})

    def test_interactive_input_is_probe_only_and_refuses_echo_fallback(self):
        with patch("sys.stdin.isatty", return_value=True), patch("builtins.input", return_value="private-user"), patch("getpass.getpass", return_value="private-password"):
            data = read_input(["--interactive-approved-http"])
        self.assertEqual(data, {"baseUrl": APPROVED_HTTP_ORIGIN, "transportPolicy": APPROVED_HTTP_POLICY,
                               "username": "private-user", "password": "private-password", "mode": "probe", "contracts": []})
        with patch("sys.stdin.isatty", return_value=False), self.assertRaises(ValueError):
            read_input(["--interactive-approved-http"])
        def unsafe_prompt(*args):
            warnings.warn("unsafe echo", getpass.GetPassWarning)
        with patch("sys.stdin.isatty", return_value=True), patch("builtins.input", return_value="private-user"), patch("getpass.getpass", side_effect=unsafe_prompt), self.assertRaises(getpass.GetPassWarning):
            read_input(["--interactive-approved-http"])

    def test_interactive_worker_uses_private_stdin_bounded_child_and_closed_errors(self):
        data = {**CONFIG, "mode": "probe", "contracts": [], "baseUrl": APPROVED_HTTP_ORIGIN, "transportPolicy": APPROVED_HTTP_POLICY}
        faults = [subprocess.CompletedProcess([], 1, b'{"error":"invalid_credential"}', b"SECRET-STDERR"),
                  subprocess.TimeoutExpired(["python"], 90, output=b"SECRET-TIMEOUT")]
        for fault in faults:
            output = io.StringIO()
            with patch("sys.argv", ["worker", "--interactive-approved-http"]), patch("ainuoke_bridge.server_source.read_input", return_value=data), patch("sys.stdout", output), patch("subprocess.run") as run:
                if isinstance(fault, Exception): run.side_effect = fault
                else: run.return_value = fault
                self.assertEqual(worker_main(), 1)
                self.assertNotIn(CONFIG["password"], str(run.call_args.args))
                self.assertEqual(run.call_args.kwargs["timeout"], 90)
                self.assertEqual(json.loads(run.call_args.kwargs["input"]), data)
                self.assertNotIn("SECRET", output.getvalue())
                self.assertNotIn(CONFIG["password"], output.getvalue())
                self.assertIn(json.loads(output.getvalue())["error"], ("invalid_credential", "source_unavailable"))

    def test_real_interactive_entry_rejects_nonterminal_without_network(self):
        for args in (["--interactive-approved-http"], ["--password=never-reflect-secret"]):
            result = subprocess.run([sys.executable, "-m", "ainuoke_bridge.server_source", *args], input=b"", capture_output=True, timeout=10)
            self.assertEqual(result.returncode, 1)
            self.assertEqual(json.loads(result.stdout), {"error": "source_invalid"})
            self.assertNotIn(b"never-reflect-secret", result.stdout + result.stderr)

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
