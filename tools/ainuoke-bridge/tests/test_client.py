from __future__ import annotations

import json
import io
import pathlib
import sys
import unittest
from contextlib import redirect_stderr, redirect_stdout
from unittest.mock import patch

ROOT = pathlib.Path(__file__).resolve().parents[1]
FIXTURES = pathlib.Path(__file__).resolve().parent / "fixtures"
sys.path.insert(0, str(ROOT))

from ainuoke_bridge.ainuoke_client import (  # noqa: E402
    AinuokeClient,
    InvalidCredentialError,
    NetworkAinuokeError,
    UpstreamSchemaError,
    UrllibJsonTransport,
)
from ainuoke_bridge.contracts import resolve_report  # noqa: E402


def fixture(name: str):
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


class SequenceTransport:
    def __init__(self, results: list[object]) -> None:
        self.results = results
        self.calls: list[dict[str, object]] = []

    def request(self, **arguments):
        self.calls.append(arguments)
        result = self.results.pop(0)
        if isinstance(result, Exception):
            raise result
        return result


class AinuokeClientProtocolTests(unittest.TestCase):
    def test_invalid_credentials_are_not_retried(self) -> None:
        transport = SequenceTransport([{"data": {"isOk": False}}])
        client = AinuokeClient(transport=transport, network_retries=4, sleeper=lambda _: None)
        with self.assertRaises(InvalidCredentialError):
            client.login("alice", "wrong")
        self.assertEqual(len(transport.calls), 1)

    def test_network_retry_is_bounded(self) -> None:
        transport = SequenceTransport([NetworkAinuokeError("network") for _ in range(3)])
        client = AinuokeClient(transport=transport, network_retries=2, sleeper=lambda _: None)
        with self.assertRaises(NetworkAinuokeError):
            client.login("alice", "synthetic-password")
        self.assertEqual(len(transport.calls), 3)

    def test_transport_timeout_is_sanitized_and_retried_with_configured_bound(self) -> None:
        output = io.StringIO()
        with patch("ainuoke_bridge.ainuoke_client.urlopen", side_effect=TimeoutError("synthetic-secret-in-url")) as opened, redirect_stdout(output), redirect_stderr(output):
            client = AinuokeClient(transport=UrllibJsonTransport(), timeout_seconds=0.5, network_retries=2, sleeper=lambda _: None)
            with self.assertRaises(NetworkAinuokeError) as raised:
                client.login("synthetic-user", "synthetic-secret-in-url")
        self.assertEqual(opened.call_count, 3)
        self.assertTrue(all(call.kwargs["timeout"] == 0.5 for call in opened.call_args_list))
        self.assertNotIn("synthetic-secret-in-url", str(raised.exception) + output.getvalue())

    def test_login_matches_verified_query_headers_and_response_shape(self) -> None:
        transport = SequenceTransport([fixture("login-success.redacted.json")])
        client = AinuokeClient(transport=transport)
        session = client.login("alice", "synthetic-password")
        self.assertEqual((session.jwt_token, session.session_id), ("REDACTED_JWT", "REDACTED_SESSION"))
        call = transport.calls[0]
        self.assertEqual(call["method"], "GET")
        self.assertTrue(str(call["url"]).endswith("/kaijin/system/user/loginsys2"))
        self.assertEqual(
            call["body"],
            {"userName": "alice", "password": "synthetic-password", "verifyCode": "", "cltType": 1, "rememberMe": "true", "jsCode": "", "isCoverLogin": "false"},
        )
        headers = call["headers"]
        self.assertEqual(headers["Accept"], "application/json, text/javascript, */*; q=0.01")
        self.assertEqual(headers["X-Requested-With"], "XMLHttpRequest")
        self.assertEqual(headers["Referer"], "http://61.164.81.194:9043/kaijin/login.html")

    def test_token_without_verified_is_ok_or_session_id_fails_closed(self) -> None:
        for response in ({"data": {"jwtToken": "synthetic-token", "sessionId": "synthetic-session"}}, {"data": {"isOk": True, "jwtToken": "synthetic-token"}}):
            with self.subTest(response=response):
                with self.assertRaises(UpstreamSchemaError):
                    AinuokeClient(transport=SequenceTransport([response])).login("alice", "synthetic-password")

    def test_report_matches_verified_auth_payload_and_data_list_shape(self) -> None:
        transport = SequenceTransport([fixture("report-6087050-d1935.redacted.json")])
        page = AinuokeClient(transport=transport).read_report(
            resolve_report("material_purchase_statistics"), jwt_token="synthetic-token", page=1, page_size=50, query_context={"insideOrderNo": "D1935"}
        )
        self.assertEqual((page.total, page.page_index, page.page_size, len(page.rows)), (2, 1, 50, 2))
        call = transport.calls[0]
        self.assertTrue(str(call["url"]).endswith("/kaijin/report/report/getReportObjAndData"))
        headers = call["headers"]
        self.assertEqual(headers["Authorization"], "synthetic-token")
        self.assertEqual(headers["Token"], "synthetic-token")
        self.assertEqual(headers["Cookie"], "kaijin_my_token=synthetic-token; rungingSysId=6080183")
        self.assertNotIn("Bearer", str(headers))
        body = call["body"]
        self.assertEqual(body["reportId"], 6087050)
        self.assertNotIn("formId", body)
        self.assertEqual((body["sqlCdtn"]["pageIndex"], body["sqlCdtn"]["pageSize"]), (1, 50))
        self.assertEqual(body["sqlCdtn"]["conditionList"], [{
            "conditionRelation": "and", "cuHaiType": 0, "dbTableName": "", "fieldName": "insideorderno",
            "compareType": "is", "dataType": "varchar", "dataTypeId": 2, "valueType": 1,
            "dealWithType": 0, "compareValue": "D1935", "flowName": "[内层]",
        }])

    def test_report_specific_inside_order_condition_mapping(self) -> None:
        expected = {
            "sales_contracts": ("InsideOrderNo", "contains", "[内层]"),
            "sales_contract_color_sizes": ("InsideOrderNo", "is", None),
            "material_purchase_statistics": ("insideorderno", "is", "[内层]"),
        }
        for report_key, (field_name, compare_type, flow_name) in expected.items():
            with self.subTest(report_key=report_key):
                transport = SequenceTransport([fixture("report-6087050-d1935.redacted.json")])
                AinuokeClient(transport=transport).read_report(resolve_report(report_key), jwt_token="synthetic-token", page=2, page_size=25, query_context={"insideOrderNo": "D1935"})
                condition = transport.calls[0]["body"]["sqlCdtn"]["conditionList"][0]
                self.assertEqual((condition["fieldName"], condition["compareType"], condition.get("flowName")), (field_name, compare_type, flow_name))
                self.assertEqual((transport.calls[0]["body"]["sqlCdtn"]["pageIndex"], transport.calls[0]["body"]["sqlCdtn"]["pageSize"]), (2, 25))

    def test_malformed_data_list_fails_closed(self) -> None:
        malformed = {"dataList": "{not-json", "dataCount": 1, "pageIndex": 1, "pageSize": 50, "reObj": {"isOk": True}}
        with self.assertRaises(UpstreamSchemaError):
            AinuokeClient(transport=SequenceTransport([malformed])).read_report(
                resolve_report("sales_contracts"), jwt_token="synthetic-token", page=1, page_size=50, query_context={"insideOrderNo": "D1935"}
            )

    def test_paging_numbers_do_not_truncate_or_accept_nonfinite_values(self) -> None:
        for field in ("dataCount", "pageIndex", "pageSize"):
            for value in (True, 1.5, float("inf"), float("nan"), "1.5", None):
                response = fixture("report-6087050-d1935.redacted.json")
                response[field] = value
                with self.subTest(field=field, value=value), self.assertRaises(UpstreamSchemaError):
                    AinuokeClient(transport=SequenceTransport([response])).read_report(
                        resolve_report("material_purchase_statistics"), jwt_token="synthetic-token", page=1, page_size=50, query_context={"insideOrderNo": "D1935"}
                    )

    def test_explicit_not_logged_in_without_report_data_is_auth_expired(self) -> None:
        from ainuoke_bridge.ainuoke_client import AuthExpiredError

        with self.assertRaises(AuthExpiredError):
            AinuokeClient(transport=SequenceTransport([{"isLogined": False, "reObj": {"isOk": False}}])).read_report(
                resolve_report("sales_contracts"), jwt_token="synthetic-token", page=1, page_size=50, query_context={"insideOrderNo": "D1935"}
            )

    def test_protocol_failures_do_not_emit_or_raise_secret_values(self) -> None:
        output = io.StringIO()
        with redirect_stdout(output), redirect_stderr(output):
            try:
                AinuokeClient(transport=SequenceTransport([{"data": {"isOk": False}}])).login("alice", "credential-leak-marker")
            except InvalidCredentialError as error:
                self.assertNotIn("credential-leak-marker", str(error))
            try:
                AinuokeClient(transport=SequenceTransport([{"dataList": "bad"}])).read_report(
                    resolve_report("sales_contracts"), jwt_token="token-leak-marker", page=1, page_size=50, query_context={"insideOrderNo": "D1935"}
                )
            except UpstreamSchemaError as error:
                self.assertNotIn("token-leak-marker", str(error))
        self.assertNotIn("credential-leak-marker", output.getvalue())
        self.assertNotIn("token-leak-marker", output.getvalue())


if __name__ == "__main__":
    unittest.main()
