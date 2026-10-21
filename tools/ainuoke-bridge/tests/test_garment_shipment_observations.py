import copy
import json
import unittest
from hashlib import sha256

from ainuoke_bridge.garment_shipment_observations import extract_garment_observation_page, GarmentObservationError


def capture(raw=None):
    if raw is None:
        raw = '{"reObj":{"isOk":true},"reportObj":{"reportId":6086979},"pageIndex":1,"pageSize":100,"dataCount":1,"dataList":{"rows":[{"id":9007199254740993,"Num":9007199254740993.000000000001,"ExpContractNo":"SYN-SC-1","outdate":"2026-10-11","wxprice":null}]}}'
    return {"schemaVersion": "ainuoke-garment-shipment-capture.v1", "reportId": "6086979", "sourceFingerprint": "a" * 64,
            "queryContext": {"match": "exact", "salesContractNo": "SYN-SC-1"}, "capturedAt": "2026-10-21T10:00:00.000Z",
            "page": 1, "pageSize": 100, "rawReportResponse": raw, "rawResponseSha256": sha256(raw.encode("utf-8")).hexdigest()}


class GarmentObservationsTest(unittest.TestCase):
    def test_lossless_hash_bound_page(self):
        value = extract_garment_observation_page(capture())
        self.assertEqual(value["rows"][0]["id"], "9007199254740993")
        self.assertEqual(value["rows"][0]["Num"], "9007199254740993.000000000001")
        self.assertIsNone(value["rows"][0]["wxprice"])
        self.assertEqual(value["schemaVersion"], "ainuoke-garment-shipment-page.v1")
        self.assertNotIn("rawReportResponse", value)

    def test_capture_scope_and_hash(self):
        for key, replacement in [("reportId", "6086941"), ("page", True), ("pageSize", True), ("page", 21),
                                 ("schemaVersion", "ainuoke-garment-shipment-candidate-private.v1"),
                                 ("rawResponseSha256", "b" * 64), ("sourceFingerprint", "not-a-hash")]:
            with self.subTest(key=key, replacement=replacement):
                value = capture(); value[key] = replacement
                with self.assertRaises(GarmentObservationError): extract_garment_observation_page(value)
        value = capture(); value["queryContext"]["match"] = "contains"
        with self.assertRaises(GarmentObservationError): extract_garment_observation_page(value)

    def test_raw_response_rejection(self):
        base = json.loads(capture()["rawReportResponse"])
        edits = [lambda x: x.update(pageIndex=0), lambda x: x.update(pageSize=0), lambda x: x.update(dataCount=2),
                 lambda x: x["reportObj"].update(reportId=6086941), lambda x: x["reObj"].update(isOk=False),
                 lambda x: x["dataList"]["rows"][0].update(ExpContractNo="SYN-OTHER"),
                 lambda x: x["dataList"]["rows"][0].update(Num=True),
                 lambda x: x["dataList"]["rows"][0].update(Password="secret")]
        for edit in edits:
            value = copy.deepcopy(base); edit(value)
            with self.subTest(edit=edits.index(edit)):
                with self.assertRaises(GarmentObservationError): extract_garment_observation_page(capture(json.dumps(value)))
        for raw in ['{"a":1,"a":2}', '{"value":NaN}', 'not JSON']:
            with self.subTest(raw=raw):
                with self.assertRaises(GarmentObservationError): extract_garment_observation_page(capture(raw))

    def test_empty_page_and_signed_number_preserved(self):
        value = json.loads(capture()["rawReportResponse"]); value["dataCount"] = 0; value["dataList"]["rows"] = []
        self.assertEqual(extract_garment_observation_page(capture(json.dumps(value)))["rows"], [])
        raw = capture()["rawReportResponse"].replace("9007199254740993.000000000001", "-0.12500")
        self.assertEqual(extract_garment_observation_page(capture(raw))["rows"][0]["Num"], "-0.12500")


if __name__ == "__main__":
    unittest.main()
