import json
from copy import deepcopy
from unittest import TestCase, main
from unittest.mock import patch

from ainuoke_bridge.ainuoke_client import UpstreamSchemaError, AuthExpiredError
from ainuoke_bridge.contracts import REPORT_CATALOG
from ainuoke_bridge.garment_collection import (
    ACTION, GarmentCollectionTransport, collect, safe_failure,
)
from ainuoke_bridge.payment_request_contract_probe import fingerprint
from ainuoke_bridge.server_source import APPROVED_HTTP_ORIGIN, APPROVED_HTTP_POLICY
from ainuoke_bridge.garment_shipment_observations import extract_garment_observation_page

CONFIG = {"baseUrl": APPROVED_HTTP_ORIGIN, "transportPolicy": APPROVED_HTTP_POLICY,
          "username": "synthetic-collection-account", "password": "Synthetic-Collection-Private-Only", "action": ACTION,
          "scope": {"sourceFingerprint": fingerprint(APPROVED_HTTP_ORIGIN, "synthetic-collection-account"), "salesContractNo": "SYN-C1"}}


def response(contract="SYN-C1", rows=None, **patch):
    rows = [{"id": "SYN-ROW-1", "billno": "SYN-OUT", "ExpContractNo": contract, "CnColor": "合成蓝", "QtyUnit": "件",
             "Num": "9007199254740993.000000000001", "outdate": "2026-10-11"}] if rows is None else rows
    return {"reObj": {"isOk": True}, "dataList": json.dumps({"rows": rows, "total": len(rows)}, ensure_ascii=False),
            "dataCount": len(rows), "pageIndex": 1, "pageSize": 100,
            "reportObj": json.dumps({"reportId": 6086979, "cellList": []}), **patch}


class FakeTransport(GarmentCollectionTransport):
    def __init__(self, responses=None, report_error=None):
        super().__init__()
        self.responses = responses
        self.report_error = report_error
        self.calls = []

    def request(self, **kwargs):
        self.calls.append(kwargs)
        if kwargs["method"] == "GET":
            if self.http_attempts != 0:
                raise AssertionError("second login")
            self.http_attempts += 1
            return {"data": {"isOk": True, "jwtToken": "synthetic-jwt", "sessionId": "synthetic-session"}}
        if not self.report_body_allowed(kwargs["body"]):
            raise AssertionError("unexpected query or budget")
        self.http_attempts += 1
        self.report_requests += 1
        if self.report_error:
            raise self.report_error("PRIVATE-NOT-FOR-OUTPUT")
        payload = self.responses[self.report_requests - 1] if self.responses is not None else response(self.scope["salesContractNo"])
        text = payload if isinstance(payload, str) else json.dumps(payload, ensure_ascii=False)
        self.last_report_text = text
        self.last_report_request_number = self.report_requests
        self.record_executed_request(kwargs["body"])
        return json.loads(text)


class GarmentCollectionTests(TestCase):
    def test_fixed_one_contract_two_complete_pages_and_no_catalog_entry(self):
        transport = FakeTransport()
        evidence = collect(deepcopy(CONFIG), transport)
        self.assertEqual(evidence["counts"], {"httpAttempts": 3, "reportRequests": 2})
        self.assertEqual(len(evidence["captures"]), 2)
        for call in transport.calls[1:]:
            body = call["body"]
            condition = body["sqlCdtn"]["conditionList"][0]
            self.assertEqual((body["reportId"], body["sqlCdtn"]["currentPage"], body["sqlCdtn"]["pageSize"]), (6086979, 1, 100))
            self.assertEqual((condition["fieldName"], condition["compareType"], condition["compareValue"], condition["flowName"]),
                             ("ExpContractNo", "is", "SYN-C1", "[内层]"))
        self.assertFalse(any(item.report_id == "6086979" for item in REPORT_CATALOG.values()))
        self.assertEqual(extract_garment_observation_page(evidence["captures"][0])["rows"][0]["Num"], "9007199254740993.000000000001")

    def test_empty_range_is_an_observation_without_old_witness_requirement(self):
        transport = FakeTransport([response(rows=[]), response(rows=[])])
        evidence = collect(CONFIG, transport)
        self.assertEqual([extract_garment_observation_page(cap)["reportedTotal"] for cap in evidence["captures"]], [0, 0])

    def test_account_scope_and_extra_arguments_are_rejected_before_login(self):
        for patch in ({"baseUrl": "https://other.invalid"}, {"action": "other"}, {"reportId": 6086979},
                      {"scope": {**CONFIG["scope"], "sourceFingerprint": "a" * 64}},
                      {"scope": {**CONFIG["scope"], "page": 2}}):
            transport = FakeTransport()
            with self.assertRaises(Exception):
                collect({**CONFIG, **patch}, transport)
            self.assertEqual(transport.http_attempts, 0)

    def test_paired_zero_sentinel_retains_actual_request_and_raw_response(self):
        for rows in (None, [], [{"id": str(i), "ExpContractNo": "SYN-C1"} for i in range(100)]):
            payload = response(rows=rows, pageIndex=0, pageSize=0)
            evidence = collect(CONFIG, FakeTransport([payload, payload]))
            for ordinal, cap in enumerate(evidence["captures"], 1):
                checked = extract_garment_observation_page(cap)
                self.assertEqual(cap["schemaVersion"], "ainuoke-garment-shipment-capture.v2")
                self.assertEqual(checked["pagingEvidence"]["reportRequestNumber"], ordinal)
                self.assertEqual((checked["pagingEvidence"]["responsePageIndex"], checked["pagingEvidence"]["responsePageSize"]), (0, 0))
                self.assertEqual(json.loads(cap["rawReportResponse"])["pageIndex"], 0)
                self.assertEqual(cap["executedRequest"]["body"]["sqlCdtn"]["pageIndex"], 1)

    def test_missing_or_forged_executed_request_stops_before_second_report(self):
        edits = [lambda x: x.update(last_executed_request=None),
                 lambda x: x.last_executed_request.update(reportRequestNumber=2),
                 lambda x: x.last_executed_request["body"]["sqlCdtn"].update(pageSize=True),
                 lambda x: x.last_executed_request["body"]["sqlCdtn"]["conditionList"][0].update(compareType="contains")]
        for edit in edits:
            transport = FakeTransport()
            original = transport.record_executed_request
            def record(body):
                original(body)
                edit(transport)
            transport.record_executed_request = record
            with self.assertRaises(Exception):
                collect(CONFIG, transport)
            self.assertEqual(transport.report_requests, 1)

    def test_transport_records_only_successful_actual_bounded_request_without_aliasing(self):
        from ainuoke_bridge.contracts import build_report_request
        from ainuoke_bridge.garment_report_screening import DEFINITION
        from ainuoke_bridge.payment_request_probe import BoundedPaymentTransport
        transport = GarmentCollectionTransport()
        transport.scope = CONFIG["scope"]
        transport.http_attempts = 1
        body = build_report_request(DEFINITION, page=1, page_size=100, query_context={"salesContractNo": "SYN-C1"})
        def success(_self, **_kwargs):
            transport.http_attempts += 1
            transport.report_requests += 1
            transport.last_report_text = json.dumps(response())
            return response()
        with patch.object(BoundedPaymentTransport, "request", success):
            transport.request(url="unused", method="POST", body=body, headers={}, timeout=1)
        body["sqlCdtn"]["pageIndex"] = 2
        self.assertEqual(transport.last_executed_request["body"]["sqlCdtn"]["pageIndex"], 1)

    def test_mixed_sentinels_wrong_contract_and_inconsistent_totals_stop_before_second_report(self):
        for payload in (response(pageIndex=0), response(pageSize=0), response(contract="OTHER"), response(dataCount=2),
                        response(dataCount=None), response(reportObj=json.dumps({"reportId": 6086941}))):
            transport = FakeTransport([payload, response()])
            with self.assertRaises(Exception):
                collect(CONFIG, transport)
            self.assertEqual((transport.http_attempts, transport.report_requests), (2, 1))

    def test_unverified_second_page_is_not_requested(self):
        rows = [{"id": str(i), "ExpContractNo": "SYN-C1"} for i in range(100)]
        payload = response(rows=rows, dataCount=101, dataList=json.dumps({"rows": rows, "total": 101}))
        transport = FakeTransport([payload, response()])
        with self.assertRaises(Exception):
            collect(CONFIG, transport)
        self.assertEqual(transport.report_requests, 1)

    def test_native_numeric_lexeme_is_not_rounded(self):
        # The row array is JSON-encoded in dataList, so construct that exact text.
        root = response()
        root["dataList"] = root["dataList"].replace('"9007199254740993.000000000001"', '9007199254740993.000000000001')
        payload = json.dumps(root)
        evidence = collect(CONFIG, FakeTransport([payload, payload]))
        self.assertEqual(extract_garment_observation_page(evidence["captures"][0])["rows"][0]["Num"], "9007199254740993.000000000001")

    def test_nested_secrets_and_duplicate_keys_never_return_captures(self):
        for label in (CONFIG["password"], "synthetic-jwt", "synthetic-session", '{"token":"PRIVATE"}'):
            payload = response()
            payload["reportObj"] = json.dumps({"reportId": 6086979, "cellList": [], "layout": json.dumps({"label": label})})
            transport = FakeTransport([payload, response()])
            with self.assertRaises(Exception):
                collect(CONFIG, transport)
            self.assertEqual(transport.report_requests, 1)
        text = json.dumps(response()).replace('"dataCount": 1', '"dataCount": 1,"dataCount": 1')
        with self.assertRaises(Exception):
            collect(CONFIG, FakeTransport([text, text]))

    def test_failure_counts_are_static_and_authentication_is_not_retried(self):
        transport = FakeTransport(report_error=AuthExpiredError)
        with self.assertRaises(Exception) as raised:
            collect(CONFIG, transport)
        failure = safe_failure(raised.exception, transport)
        self.assertNotIn("PRIVATE", json.dumps(failure))
        self.assertEqual(failure["counts"], {"httpAttempts": 2, "reportRequests": 1})
        self.assertEqual(len(transport.calls), 2)

    def test_transport_rejects_unexpected_page_and_relogin_without_io(self):
        transport = GarmentCollectionTransport()
        transport.scope = CONFIG["scope"]
        self.assertFalse(transport.report_body_allowed({"reportId": 6086979}))
        transport.http_attempts = 1
        with self.assertRaises(UpstreamSchemaError):
            transport.request(url="unused", method="GET", body={}, headers={}, timeout=1)
        self.assertEqual(transport.http_attempts, 1)


if __name__ == "__main__":
    main()
