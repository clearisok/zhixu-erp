import io
import json
import sys
from copy import deepcopy
from hashlib import sha256
from unittest import TestCase, main
from unittest.mock import patch

from ainuoke_bridge.ainuoke_client import AuthExpiredError, NetworkAinuokeError, UpstreamSchemaError
from ainuoke_bridge.contracts import REPORT_CATALOG
from ainuoke_bridge.garment_shipment_probe import (
    ACTION, BoundedGarmentShipmentTransport, main as worker_main, probe, request_body, safe_failure,
)
from ainuoke_bridge.server_source import APPROVED_HTTP_ORIGIN, APPROVED_HTTP_POLICY

CONFIG = {"baseUrl": APPROVED_HTTP_ORIGIN, "transportPolicy": APPROVED_HTTP_POLICY,
          "username": "synthetic-candidate", "password": "Synthetic-Private-Only", "action": ACTION}


def response(rows=None, total=200):
    return {"reObj": {"isOk": True}, "dataList": json.dumps({"rows": rows if rows is not None else [
        {"id": 1, "InsideOrderNo": "D1933-other-contract", "CandidateQty": None, "CandidateDate": ""}]}),
        "dataCount": total, "pageIndex": 0, "pageSize": 0,
        "reportObj": json.dumps({"reportId": 6086979, "cellList": json.dumps([{"fieldName": "CandidateQty"}])})}


class FakeTransport:
    def __init__(self, payload=None, raw=None, error=None):
        self.payload = response() if payload is None else payload
        self.raw = raw
        self.error = error
        self.http_attempts = 0
        self.report_requests = 0
        self.last_report_text = None
        self.calls = []

    def request(self, **kwargs):
        self.calls.append(kwargs)
        self.http_attempts += 1
        if kwargs["method"] == "GET":
            return {"data": {"isOk": True, "jwtToken": "synthetic-jwt", "sessionId": "synthetic-session"}}
        self.report_requests += 1
        if self.error:
            raise self.error("PRIVATE-MUST-NOT-REFLECT")
        self.last_report_text = self.raw if self.raw is not None else json.dumps(self.payload, ensure_ascii=False)
        return self.payload


class GarmentCandidateProbeTests(TestCase):
    def test_deep_configuration_is_bounded_without_changing_raw_text(self):
        layout = "合成配置"
        for index in range(13):
            layout = [layout] if index % 2 else {"child": layout}
        for value in (layout, json.dumps(layout)):
            payload = response()
            payload["reportObj"] = json.dumps({"reportId": 6086979, "cellList": [], "layout": value})
            transport = FakeTransport(payload)
            evidence = probe(CONFIG, transport)
            self.assertEqual(evidence["rawReportResponse"], transport.last_report_text)
            self.assertEqual((transport.http_attempts, transport.report_requests), (2, 1))

    def test_nested_encoded_secrets_and_duplicate_keys_never_leave_worker(self):
        layouts = [json.dumps({"child": json.dumps({"sessionId": "PRIVATE"})}), '{"x":1,"x":1}']
        for secret in (CONFIG["password"], "synthetic-jwt", "synthetic-session"):
            layouts.append(json.dumps({"label": secret}).replace("s", "\\u0073").replace("S", "\\u0053"))
        for layout in layouts:
            with self.subTest(layout=layout):
                payload = response()
                payload["reportObj"] = json.dumps({"reportId": 6086979, "cellList": [], "layout": layout})
                transport = FakeTransport(payload)
                with self.assertRaises(UpstreamSchemaError):
                    probe(CONFIG, transport)
                self.assertEqual((transport.http_attempts, transport.report_requests), (2, 1))

    def test_only_user_supplied_request_and_no_catalog_registration(self):
        transport = FakeTransport()
        evidence = probe(CONFIG, transport)
        body = transport.calls[1]["body"]
        self.assertEqual(body, request_body())
        self.assertEqual(body["reportId"], 6086979)
        self.assertEqual(body["sqlCdtn"]["pageSize"], 100)
        condition = body["sqlCdtn"]["conditionList"][0]
        self.assertEqual((condition["fieldName"], condition["compareType"], condition["compareValue"], condition["flowName"]),
                         ("insideorderno", "contains", "D1933", "[内层]"))
        self.assertEqual((evidence["httpAttempts"], evidence["reportRequests"], evidence["returnedRows"]), (2, 1, 1))
        self.assertEqual(evidence["queryContext"], {"insideOrderNo": "D1933"})
        self.assertFalse(any(item.report_id == "6086979" for item in REPORT_CATALOG.values()))
        self.assertEqual(evidence["rawResponseSha256"], sha256(evidence["rawReportResponse"].encode()).hexdigest())

    def test_deep_rejection_keeps_closed_failure_counts_without_retry(self):
        layout = "PRIVATE-MUST-NOT-REFLECT"
        for _ in range(65):
            layout = {"child": layout}
        payload = response()
        payload["reportObj"] = json.dumps({"reportId": 6086979, "cellList": [], "layout": layout})
        transport = FakeTransport(payload)
        with self.assertRaises(UpstreamSchemaError) as error:
            probe(CONFIG, transport)
        receipt = safe_failure(error.exception, transport)
        self.assertEqual(receipt["code"], "shipment_probe_structure_limit")
        self.assertEqual(receipt["workerStage"], "validation")
        self.assertEqual((receipt["httpAttempts"], receipt["reportRequests"], len(transport.calls)), (2, 1, 2))
        self.assertNotIn("PRIVATE-MUST-NOT-REFLECT", json.dumps(receipt))

    def test_scope_cannot_expand_or_use_payment_action_before_login(self):
        for patch_value in ({"page": 2}, {"insideOrderNo": "OTHER"}, {"reportId": 6086979}, {"action": "read-first-page-only"},
                            {"action": "read-6086979-d1935-first-page-only"},
                            {"baseUrl": APPROVED_HTTP_ORIGIN + "/"}, {"baseUrl": "https://example.invalid"}, {"password": ""}):
            with self.subTest(patch_value=patch_value):
                transport = FakeTransport()
                with self.assertRaises(ValueError):
                    probe({**CONFIG, **patch_value}, transport)
                self.assertEqual(transport.calls, [])

    def test_wire_scope_refuses_other_pages_reports_queries_or_comparators(self):
        transport = BoundedGarmentShipmentTransport()
        self.assertTrue(transport.report_body_allowed(request_body()))
        for field, value in (("pageIndex", 2), ("pageSize", 101), ("targetId", 6086941)):
            body = request_body()
            body["sqlCdtn"][field] = value
            self.assertFalse(transport.report_body_allowed(body))
        for field, value in (("compareValue", "D19330"), ("compareType", "is"), ("fieldName", "BillNo")):
            body = request_body()
            body["sqlCdtn"]["conditionList"][0][field] = value
            self.assertFalse(transport.report_body_allowed(body))
        self.assertEqual((transport.http_attempts, transport.report_requests), (0, 0))

    def test_metadata_encoding_unknown_values_duplicates_and_precision_are_preserved(self):
        rows = [{"id": 7, "CandidateQty": None, "CandidateDate": "", "CandidateValue": 0}] * 2
        original = response(rows)
        raw = json.dumps(original, ensure_ascii=False).replace('"dataCount": 200', '"dataCount": 200, "rawDecimal": 12345678901234567890.123456789')
        evidence = probe(CONFIG, FakeTransport(json.loads(raw), raw))
        self.assertIn("12345678901234567890.123456789", evidence["rawReportResponse"])
        self.assertEqual(json.loads(json.loads(evidence["rawReportResponse"])["dataList"])["rows"], rows)
        self.assertNotIn("shipmentDate", evidence)
        self.assertNotIn("salesContractNo", evidence)

    def test_missing_metadata_stays_missing_and_no_second_page_is_read(self):
        payload = response([], 1000)
        del payload["reportObj"]
        transport = FakeTransport(payload)
        evidence = probe(CONFIG, transport)
        self.assertNotIn("reportObj", json.loads(evidence["rawReportResponse"]))
        self.assertEqual((evidence["reportedTotal"], evidence["returnedRows"], len(transport.calls)), (1000, 0, 2))

    def test_blank_columns_remain_unknown_and_original_text_is_kept(self):
        for columns in ("", " \t\r\n", None):
            payload = response()
            payload["reportObj"] = json.dumps({"reportId": 6086979, "cellList": columns})
            transport = FakeTransport(payload)
            evidence = probe(CONFIG, transport)
            self.assertEqual(json.loads(json.loads(evidence["rawReportResponse"])["reportObj"])["cellList"], columns)
            self.assertEqual((transport.http_attempts, transport.report_requests), (2, 1))

    def test_wrong_report_bad_page_and_duplicate_json_keys_are_rejected(self):
        cases = []
        for key, value in (("pageIndex", 2), ("pageSize", 50), ("reportObj", {"reportId": 6086941}), ("dataCount", 0)):
            payload = response()
            payload[key] = value
            cases.append((payload, None))
        payload = response()
        raw = json.dumps(payload).replace('"dataCount": 200', '"dataCount": 200, "dataCount": 201')
        cases.append((payload, raw))
        payload = response()
        payload["dataList"] = '{"rows":[],"rows":[]}'
        cases.append((payload, None))
        for payload, raw in cases:
            with self.subTest(payload=payload):
                with self.assertRaises(UpstreamSchemaError):
                    probe(CONFIG, FakeTransport(payload, raw))

    def test_secret_reflections_and_encoded_metadata_never_leave_worker(self):
        for payload in (response([{"password": "PRIVATE"}]), response([{"id": CONFIG["password"]}]), response([{"id": "synthetic-jwt"}])):
            with self.assertRaises(UpstreamSchemaError):
                probe(CONFIG, FakeTransport(payload))
        payload = response()
        payload["reportObj"] = json.dumps({"reportId": 6086979, "cellList": json.dumps([{"sessionId": "PRIVATE"}])})
        with self.assertRaises(UpstreamSchemaError):
            probe(CONFIG, FakeTransport(payload))

    def test_network_auth_failure_counts_are_bounded_and_error_text_is_static(self):
        for error in (NetworkAinuokeError, AuthExpiredError):
            transport = FakeTransport(error=error)
            with self.assertRaises(error) as raised:
                probe(CONFIG, transport)
            result = safe_failure(raised.exception, transport)
            self.assertEqual((result["httpAttempts"], result["reportRequests"]), (2, 1))
            self.assertNotIn("PRIVATE", json.dumps(result))
            self.assertEqual(len(transport.calls), 2)

    def test_worker_requires_explicit_action_without_reading_stdin(self):
        with patch.object(sys, "argv", ["probe"]), patch.object(sys, "stdin", None), patch("sys.stdout", new_callable=io.StringIO) as stdout:
            self.assertEqual(worker_main(), 1)
            result = json.loads(stdout.getvalue())
        self.assertEqual(result["code"], "shipment_probe_explicit_action_required")
        self.assertEqual((result["httpAttempts"], result["reportRequests"]), (0, 0))
        self.assertNotIn("Traceback", stdout.getvalue())

    def test_success_worker_json_is_ascii_and_restores_unicode_raw_hash(self):
        config = json.dumps(CONFIG).encode()
        stdin = type("Input", (), {"buffer": io.BytesIO(config)})()
        evidence = probe(CONFIG, FakeTransport(response([{"color": "合成蓝🧵"}])))
        with patch.object(sys, "argv", ["probe", "--stdin-request"]), patch.object(sys, "stdin", stdin), \
                patch("ainuoke_bridge.garment_shipment_probe.probe", return_value=deepcopy(evidence)), patch("sys.stdout", new_callable=io.StringIO) as stdout:
            self.assertEqual(worker_main(), 0)
        stdout.getvalue().encode("ascii")
        result = json.loads(stdout.getvalue())
        self.assertEqual(result["rawResponseSha256"], sha256(result["rawReportResponse"].encode("utf-8")).hexdigest())


if __name__ == "__main__":
    main()
