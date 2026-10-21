import io
import json
import sys
from copy import deepcopy
from hashlib import sha256
from unittest import TestCase, main
from unittest.mock import patch

from ainuoke_bridge.ainuoke_client import AuthExpiredError, NetworkAinuokeError, UpstreamSchemaError
from ainuoke_bridge.contracts import REPORT_CATALOG
from ainuoke_bridge.garment_contract_verification import (
    ACTION, DEFINITION, ZERO_CONTRACT, VerificationTransport, checked_page, collect, main as worker_main,
    request_queue, validate_input,
)
from ainuoke_bridge.payment_request_contract_probe import fingerprint
from ainuoke_bridge.payment_request_observations import strict_json
from ainuoke_bridge.server_source import APPROVED_HTTP_ORIGIN, APPROVED_HTTP_POLICY

SELECTION = {"schemaVersion": "ainuoke-garment-filter-selection.v1", "sourceFingerprint": fingerprint(APPROVED_HTTP_ORIGIN, "synthetic-user"),
    "candidateSha256": "a" * 64, "rawResponseSha256": "b" * 64, "toolingCommit": "c" * 40,
    "salesContractNo": "SYNTHETIC-C1", "witness": {"id": "9007199254740993", "billno": "SYNTHETIC-D1"}}
CONFIG = {"baseUrl": APPROVED_HTTP_ORIGIN, "transportPolicy": APPROVED_HTTP_POLICY, "username": "synthetic-user",
          "password": "Synthetic-Only-Private", "action": ACTION, "selection": SELECTION}


def page(rows=None, total=None, **patch_value):
    if rows is None:
        rows = [{"id": "9007199254740993", "billno": "SYNTHETIC-D1", "ExpContractNo": "SYNTHETIC-C1", "insideorderno": "D1933",
                 "Num": "12345678901234567890.123456789", "outdate": "2026-10-11", "CnColor": "合成红", "QtyUnit": "件"}]
    total = len(rows) if total is None else total
    value = {"reObj": {"isOk": True}, "dataList": json.dumps({"rows": rows, "total": total}, ensure_ascii=False),
             "dataCount": total, "pageIndex": 0, "pageSize": 0, "reportObj": json.dumps({"reportId": 6086979, "cellList": []}), **patch_value}
    return json.dumps(value, ensure_ascii=False)


class FakeTransport:
    def __init__(self, responses=None, failure_at=None):
        self.responses = responses or [page(), page([]), page()]
        self.failure_at = failure_at
        self.http_attempts = 0
        self.report_requests = 0
        self.last_report_text = None
        self.last_report_request_number = 0
        self.phase = "not-started"
        self.calls = []

    def request(self, **kwargs):
        self.calls.append(kwargs)
        self.http_attempts += 1
        if kwargs["method"] == "GET":
            return {"data": {"isOk": True, "jwtToken": "synthetic-jwt", "sessionId": "synthetic-session"}}
        self.report_requests += 1
        if self.report_requests == self.failure_at:
            raise NetworkAinuokeError("PRIVATE-MUST-NOT-REFLECT")
        self.last_report_text = self.responses[self.report_requests - 1]
        self.last_report_request_number = self.report_requests
        return json.loads(self.last_report_text)


class GarmentContractVerificationTests(TestCase):
    def test_real_bounded_transport_uses_exactly_four_stubbed_http_attempts_and_latches_stop(self):
        payloads = [json.dumps({"data": {"isOk": True, "jwtToken": "synthetic-jwt", "sessionId": "synthetic-session"}}).encode(),
                    page().encode(), page([]).encode(), page().encode()]
        calls = []

        class Response:
            def __init__(self, content):
                self.content = content
            def __enter__(self):
                return self
            def __exit__(self, *_args):
                pass
            def read(self, limit):
                return self.content[:limit]

        class Opener:
            def open(self, request, timeout):
                calls.append((request.method, timeout))
                return Response(payloads[len(calls) - 1])

        transport = VerificationTransport(SELECTION)
        with patch("ainuoke_bridge.payment_request_probe.build_opener", return_value=Opener()):
            result = collect(CONFIG, transport)
            self.assertEqual(result["result"], "complete")
            with self.assertRaises(UpstreamSchemaError):
                transport.request(method="GET", url="unused", body={}, headers={}, timeout=15)
            with self.assertRaises(UpstreamSchemaError):
                transport.request(method="POST", url="unused", body=request_queue(SELECTION)[0], headers={}, timeout=15)
        self.assertEqual([entry[0] for entry in calls], ["GET", "POST", "POST", "POST"])
        self.assertTrue(all(0 < timeout <= 15 for _, timeout in calls))
        self.assertEqual((transport.http_attempts, transport.report_requests), (4, 3))
        self.assertEqual(transport.total_report_bytes, sum(len(text) for text in payloads[1:]))
        self.assertTrue(transport.stopped)

    def test_real_response_read_stops_at_four_mib_before_parsing_or_another_request(self):
        calls = []

        class Response:
            def __init__(self, number):
                self.number = number
            def __enter__(self):
                return self
            def __exit__(self, *_args):
                pass
            def read(self, limit):
                if self.number == 1:
                    return json.dumps({"data": {"isOk": True, "jwtToken": "synthetic-jwt", "sessionId": "synthetic-session"}}).encode()
                self_test.assertEqual(limit, 4 * 1024 * 1024 + 1)
                return b"x" * limit

        class Opener:
            def open(self, _request, timeout):
                calls.append(timeout)
                return Response(len(calls))

        self_test = self
        transport = VerificationTransport(SELECTION)
        with patch("ainuoke_bridge.payment_request_probe.build_opener", return_value=Opener()):
            result = collect(CONFIG, transport)
        self.assertEqual((result["httpAttempts"], result["reportRequests"], len(calls)), (2, 1, 2))
        self.assertEqual(result["code"], "payment_probe_response_limit")
        self.assertEqual(result["pages"], [])
        self.assertTrue(transport.stopped)

    def test_fixed_order_one_login_no_catalog_registration_and_lossless_rows(self):
        transport = FakeTransport()
        result = collect(CONFIG, transport)
        self.assertEqual(result["result"], "complete")
        self.assertEqual((result["httpAttempts"], result["reportRequests"]), (4, 3))
        self.assertEqual([entry["body"] for entry in transport.calls[1:]], list(request_queue(SELECTION)))
        self.assertEqual([entry["alias"] for entry in result["pages"]], ["C1", "C0", "C1"])
        self.assertFalse(any(value.report_id == "6086979" for value in REPORT_CATALOG.values()))
        total, rows = checked_page(page(), SELECTION, False, ())
        self.assertEqual((total, rows[0]["Num"], rows[0]["CnColor"]), (1, "12345678901234567890.123456789", "合成红"))

    def test_native_numeric_lexemes_are_not_rounded(self):
        text = page().replace('"9007199254740993"', '9007199254740993')
        # The embedded dataList representation has escaped quotes.
        text = text.replace('\\"9007199254740993\\"', '9007199254740993').replace('\\"12345678901234567890.123456789\\"', '12345678901234567890.123456789')
        rows = checked_page(text, SELECTION, False, ())[1]
        self.assertEqual(rows[0]["id"], "9007199254740993")
        self.assertEqual(rows[0]["Num"], "12345678901234567890.123456789")

    def test_wrong_account_action_extra_parameters_refused_before_any_request(self):
        for change in ({"action": "other"}, {"baseUrl": "https://other.invalid"}, {"username": "other"}, {"page": 2}, {"password": ""}):
            transport = FakeTransport()
            with self.subTest(change=change), self.assertRaises(UpstreamSchemaError):
                collect({**CONFIG, **change}, transport)
            self.assertEqual(transport.calls, [])

    def test_transport_enforces_sequence_and_never_relogs_or_restarts(self):
        transport = VerificationTransport(SELECTION)
        queue = request_queue(SELECTION)
        self.assertFalse(transport.report_body_allowed(queue[0]))
        transport.http_attempts = 1
        self.assertTrue(transport.report_body_allowed(queue[0]))
        self.assertFalse(transport.report_body_allowed(queue[1]))
        transport.http_attempts, transport.report_requests = 2, 1
        self.assertTrue(transport.report_body_allowed(queue[1]))
        self.assertFalse(transport.report_body_allowed(queue[0]))
        for change in (("pageSize", 101), ("pageIndex", 2), ("targetId", 6086941)):
            body = deepcopy(queue[1]); body["sqlCdtn"][change[0]] = change[1]
            self.assertFalse(transport.report_body_allowed(body))
        for field, value in (("compareType", "contains"), ("compareValue", "SYNTHETIC-C10"), ("fieldName", "BillNo")):
            body = deepcopy(queue[1]); body["sqlCdtn"]["conditionList"][0][field] = value
            self.assertFalse(transport.report_body_allowed(body))
        with self.assertRaises(UpstreamSchemaError):
            transport.request(method="GET", url="unused", body={}, headers={}, timeout=1)
        transport.stopped = True
        self.assertFalse(transport.report_body_allowed(queue[1]))

    def test_first_page_over_limit_stops_before_control_or_page_two_and_keeps_safe_text(self):
        transport = FakeTransport([page(total=101)])
        result = collect(CONFIG, transport)
        self.assertEqual((result["result"], result["code"], result["reportRequests"]), ("failed", "garment_filter_page_limit", 1))
        self.assertEqual(len(result["pages"]), 1)
        self.assertEqual(result["pages"][0]["rawReportResponse"], transport.responses[0])

    def test_negative_control_must_be_successful_explicit_complete_zero(self):
        controls = [page(), page([], total=1), page([], dataCount=None), page([], reObj={"isOk": False}),
                    page([], pageIndex=2), page([], reportObj=json.dumps({"reportId": 6086941})), page([], dataCount=1)]
        for control in controls:
            transport = FakeTransport([page(), control])
            with self.subTest(control=control):
                result = collect(CONFIG, transport)
                self.assertEqual(result["result"], "failed")
                self.assertEqual(result["reportRequests"], 2)
                self.assertEqual(len(transport.calls), 3)

    def test_count_conflicts_missing_totals_near_contract_duplicate_id_and_missing_witness_stop(self):
        original = strict_json(page())
        row = strict_json(original["dataList"])["rows"][0]
        samples = [page(dataCount=2), page(dataCount=None), page([{**row, "ExpContractNo": "SYNTHETIC-C10"}]),
                   page([row, row]), page([{**row, "id": "different"}]), page([]), page(reportObj=None)]
        missing = json.loads(page()); del missing["dataCount"]; missing["dataList"] = '{"rows":[]}'
        samples.append(json.dumps(missing))
        for sample in samples:
            transport = FakeTransport([sample])
            with self.subTest(sample=sample):
                result = collect(CONFIG, transport)
                self.assertEqual(result["result"], "failed")
                self.assertEqual(result["reportRequests"], 1)

    def test_row_order_is_irrelevant_but_second_pass_change_is_rejected(self):
        row = strict_json(strict_json(page())["dataList"])["rows"][0]
        rows = [row, {**row, "id": "second"}]
        self.assertEqual(collect(CONFIG, FakeTransport([page(rows), page([]), page(list(reversed(rows)))]))["result"], "complete")
        result = collect(CONFIG, FakeTransport([page(), page([]), page([{**row, "Num": "999"}])]))
        self.assertEqual((result["code"], result["reportRequests"]), ("garment_filter_source_changed", 3))

    def test_nested_duplicate_keys_and_secret_reflection_never_become_evidence(self):
        row = strict_json(strict_json(page())["dataList"])["rows"][0]
        bad = [page().replace('"dataCount": 1', '"dataCount": 1,"dataCount": 1'),
               page(dataList='{"rows":[],"rows":[]}'), page(reportObj='{"reportId":6086979,"reportId":6086979}'),
               page([{**row, "remark": json.dumps({"password": "private"})}]), page([{**row, "remark": '{"x":1,"x":1}'}]), page([{**row, "remark": CONFIG["password"]}]),
               page([{**row, "remark": "synthetic-jwt"}]), page([{**row, "remark": "synthetic-session"}])]
        for sample in bad:
            result = collect(CONFIG, FakeTransport([sample]))
            with self.subTest(sample=sample):
                self.assertEqual(result["result"], "failed")
                self.assertEqual(result["reportRequests"], 1)
                self.assertEqual(result["pages"], [])
                self.assertNotIn("PRIVATE-MUST", json.dumps(result))

    def test_ordinary_bracket_business_text_is_not_mistaken_for_json(self):
        row = strict_json(strict_json(page())["dataList"])["rows"][0]
        for label in ("[待核]", "{测试款}", "[内层]", "{not-json"):
            text = page([{**row, "remark": label}])
            with self.subTest(label=label):
                self.assertEqual(collect(CONFIG, FakeTransport([text, page([]), text]))["result"], "complete")

    def test_network_failure_has_actual_counts_no_retry_and_only_preceding_safe_page(self):
        transport = FakeTransport(failure_at=2)
        result = collect(CONFIG, transport)
        self.assertEqual((result["httpAttempts"], result["reportRequests"], len(result["pages"])), (3, 2, 1))
        self.assertEqual(result["code"], "network_unavailable")
        self.assertNotIn("PRIVATE-MUST-NOT-REFLECT", json.dumps(result))

    def test_real_transport_deadline_and_byte_budget_are_checked_without_network(self):
        transport = VerificationTransport(SELECTION)
        transport.deadline = 0
        with self.assertRaises(UpstreamSchemaError) as raised:
            transport.request(method="GET", url="unused", body={}, headers={}, timeout=1)
        self.assertEqual(raised.exception.args[0], "garment_filter_deadline")
        self.assertEqual((transport.http_attempts, transport.report_requests), (0, 0))
        transport.total_report_bytes = 12 * 1024 * 1024
        self.assertEqual(transport.response_byte_limit(True), 0)

    def test_wire_has_only_fixed_inner_exact_contract_condition(self):
        body = request_queue(SELECTION)[0]
        self.assertEqual(DEFINITION.report_id, "6086979")
        self.assertEqual(body["sqlCdtn"]["conditionList"][0]["flowName"], "[内层]")
        self.assertEqual(body["sqlCdtn"]["conditionList"][0]["compareType"], "is")
        self.assertEqual(body["sqlCdtn"]["conditionList"][0]["fieldName"], "ExpContractNo")
        self.assertEqual(request_queue(SELECTION)[1]["sqlCdtn"]["conditionList"][0]["compareValue"], ZERO_CONTRACT)

    def test_worker_rejects_missing_action_without_stdin_and_serializes_safe_ascii_failure(self):
        with patch.object(sys, "argv", ["probe"]), patch.object(sys, "stdin", None), patch("sys.stdout", new_callable=io.StringIO) as stdout:
            self.assertEqual(worker_main(), 1)
            result = json.loads(stdout.getvalue())
        self.assertEqual((result["httpAttempts"], result["reportRequests"]), (0, 0))
        self.assertEqual(result["code"], "garment_filter_scope_refused")
        self.assertNotIn("Traceback", stdout.getvalue())


if __name__ == "__main__":
    main()
