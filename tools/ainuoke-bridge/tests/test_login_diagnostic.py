import io
import json
from unittest import TestCase
from unittest.mock import patch

from ainuoke_bridge.ainuoke_client import AinuokeClient, NetworkAinuokeError, UpstreamSchemaError
from ainuoke_bridge.login_diagnostic import LoginEvidenceTransport, main, run_login_diagnostic
from ainuoke_bridge.request_diagnostics import DiagnosticTransport
from ainuoke_bridge.selected_source_once import BudgetTransport, Refused

SECRET = "synthetic-private-user-password-session-token"
CONFIG = {"schemaVersion": "ainuoke-login-diagnostic-input.v1", "baseUrl": "https://example.invalid",
          "username": SECRET, "password": SECRET}

class FakeTransport:
    def __init__(self, response=None, error=None):
        self.response = response if response is not None else {"data": {"isOk": True, "jwtToken": SECRET, "sessionId": SECRET}}
        self.error = error
        self.calls = []
    def request(self, **request):
        self.calls.append(request)
        if self.error is not None:
            raise self.error
        return self.response

class LoginDiagnosticTests(TestCase):
    def test_success_discards_session_and_never_reads_reports(self):
        transport = FakeTransport()
        result = run_login_diagnostic(CONFIG, transport)
        self.assertEqual((result["result"], result["code"]), ("accepted", "login_accepted"))
        self.assertEqual(len(transport.calls), 1)
        self.assertEqual(result["metrics"], {"logins": 1, "reportRequests": 0, "httpAttempts": 1, "networkRetries": 0, "authRenewals": 0})
        call = transport.calls[0]
        self.assertEqual(call["url"], "https://example.invalid" + AinuokeClient.LOGIN_PATH)
        self.assertEqual(call["method"], "GET")
        self.assertEqual(call["body"]["isCoverLogin"], "false")
        self.assertNotIn("Authorization", call["headers"])
        self.assertFalse(result["sessionRetained"])
        self.assertEqual(result["databaseAccess"], "none")
        self.assertNotIn(SECRET, json.dumps(result))

    def test_only_exact_known_refusal_messages_become_closed_hints(self):
        cases = [("用户已登录。", "session_exists"), ("验证码错误", "verification_required"),
                 ("用户名或密码错误", "credentials_rejected"), ("账号已锁定", "account_unavailable"),
                 ("请求过于频繁", "throttling_hint"), (SECRET, "unclassified"),
                 (SECRET + "用户已登录", "unclassified")]
        for message, hint in cases:
            result = run_login_diagnostic(CONFIG, FakeTransport({"data": {"isOk": False, "message": message}}))
            self.assertEqual(result["result"], "rejected")
            self.assertEqual(result["serverHint"], hint)
            self.assertTrue(result["payloadRefused"])
            self.assertEqual(result["requests"][0]["outcome"], "auth_error")
            self.assertNotIn(message, json.dumps(result, ensure_ascii=False))
            self.assertNotIn(SECRET, json.dumps(result))

    def test_conflicting_or_oversized_hints_are_not_guessed(self):
        for response in [{"message": "验证码错误", "data": {"isOk": False, "msg": "账号已登录"}},
                         {"data": {"isOk": False, "message": "x" * 257 + "账号已登录"}}]:
            self.assertEqual(run_login_diagnostic(CONFIG, FakeTransport(response))["serverHint"], "unclassified")

    def test_public_client_cover_confirmation_signal_is_safe_and_never_overrides_login(self):
        for code in ("-2", -2):
            transport = FakeTransport({"data": {"isOk": False, "text1": code, "errorMsg": SECRET}})
            result = run_login_diagnostic(CONFIG, transport)
            self.assertEqual(result["serverHint"], "cover_confirmation_required")
            self.assertEqual(result["result"], "rejected")
            self.assertEqual(len(transport.calls), 1)
            self.assertEqual(transport.calls[0]["body"]["isCoverLogin"], "false")
            self.assertFalse(result["coverLogin"])
            self.assertNotIn(SECRET, json.dumps(result))

    def test_unknown_or_conflicting_server_codes_do_not_claim_cover_confirmation(self):
        for code in ("-20", "-2 " + SECRET, -3, None, {}, []):
            result = run_login_diagnostic(CONFIG, FakeTransport({"data": {"isOk": False, "text1": code}}))
            self.assertEqual(result["serverHint"], "unclassified")
        result = run_login_diagnostic(CONFIG, FakeTransport({"data": {"isOk": False, "text1": "-2", "errorMsg": "密码错误"}}))
        self.assertEqual(result["serverHint"], "unclassified")

    def test_network_failure_has_one_attempt_no_secret_or_retry(self):
        error = NetworkAinuokeError(SECRET)
        error.transport_category, error.http_status = "http_error", 429
        transport = FakeTransport(error=error)
        result = run_login_diagnostic(CONFIG, transport)
        self.assertEqual(len(transport.calls), 1)
        self.assertEqual(result["code"], "source_unavailable")
        self.assertEqual(result["requests"][0]["httpStatus"], 429)
        self.assertEqual(result["requests"][0]["outcome"], "http_error")
        self.assertNotIn(SECRET, json.dumps(result))

    def test_malformed_success_or_redirect_is_not_credential_failure(self):
        for transport in [FakeTransport({"data": {"isOk": True, "jwtToken": SECRET}}),
                          FakeTransport(error=UpstreamSchemaError("redirect_refused"))]:
            result = run_login_diagnostic(CONFIG, transport)
            self.assertEqual(result["code"], "upstream_schema_error")
            self.assertFalse(result["payloadRefused"])
            self.assertNotIn(SECRET, json.dumps(result))

    def test_extra_scopes_and_unapproved_origins_fail_before_transport(self):
        for config in [{**CONFIG, "contracts": ["SYN-1"]}, {**CONFIG, "reportId": 6086103},
                       {**CONFIG, "baseUrl": "http://example.invalid"}, {**CONFIG, "baseUrl": "https://example.invalid/?token=" + SECRET}]:
            transport = FakeTransport()
            with self.assertRaises(ValueError):
                run_login_diagnostic(config, transport)
            self.assertEqual(transport.calls, [])

    def test_budget_refuses_reports_second_login_and_expired_attempt(self):
        transport = FakeTransport()
        evidence = LoginEvidenceTransport(transport)
        bounded = BudgetTransport("https://example.invalid", DiagnosticTransport(evidence, []), lambda: 0, report_limit=0)
        client = AinuokeClient(base_url="https://example.invalid", transport=bounded, network_retries=0)
        client.login(SECRET, SECRET)
        with self.assertRaises(Exception):
            client.login(SECRET, SECRET)
        with self.assertRaises(Refused):
            bounded.request(url="https://example.invalid" + AinuokeClient.REPORT_PATH, method="POST", body={}, headers={}, timeout=15)
        self.assertEqual(len(transport.calls), 1)
        expired = BudgetTransport("https://example.invalid", evidence, lambda: 0, report_limit=0)
        expired.deadline = 0
        with self.assertRaises(Refused):
            expired.request(url="https://example.invalid" + AinuokeClient.LOGIN_PATH, method="GET", body={}, headers={}, timeout=15)
        self.assertEqual(len(transport.calls), 1)

    def test_forced_cover_login_and_other_methods_never_reach_transport(self):
        transport = FakeTransport()
        bounded = LoginEvidenceTransport(transport)
        for request in [{"method": "GET", "body": {"isCoverLogin": "true"}}, {"method": "POST", "body": {"isCoverLogin": "false"}}]:
            with self.assertRaises(Refused):
                bounded.request(**request)
        self.assertEqual(transport.calls, [])

    def test_cli_rejects_input_without_printing_secrets(self):
        class Input:
            buffer = io.BytesIO(json.dumps({"password": SECRET}).encode())
        output = io.StringIO()
        with patch("sys.stdin", Input()), patch("sys.stdout", output), patch("sys.argv", ["login-diagnostic"]):
            self.assertEqual(main(), 1)
        self.assertEqual(json.loads(output.getvalue()), {"error": "login_diagnostic_input_or_result_invalid"})
        self.assertNotIn(SECRET, output.getvalue())
