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

    def test_both_reported_totals_must_agree_even_for_empty_and_encoded_data(self):
        for total, row_count in [(101, 1), (0, 1), (1, 0), (101, 0)]:
            for encoded in (False, True):
                value = json.loads(capture()["rawReportResponse"])
                value["dataCount"] = row_count
                value["dataList"]["total"] = total
                if not row_count:
                    value["dataList"]["rows"] = []
                if encoded:
                    value["dataList"] = json.dumps(value["dataList"])
                with self.subTest(total=total, row_count=row_count, encoded=encoded):
                    with self.assertRaises(GarmentObservationError):
                        extract_garment_observation_page(capture(json.dumps(value)))

    def test_secondary_total_is_validated_not_ignored_or_coerced(self):
        for total in (None, True, False, [], {}, "", "01", "1.0", -1, 9007199254740992):
            value = json.loads(capture()["rawReportResponse"])
            value["dataList"]["total"] = total
            with self.subTest(total=total):
                with self.assertRaises(GarmentObservationError):
                    extract_garment_observation_page(capture(json.dumps(value)))
        value = json.loads(capture()["rawReportResponse"])
        value["dataCount"] = None
        value["dataList"]["total"] = 1
        with self.assertRaises(GarmentObservationError):
            extract_garment_observation_page(capture(json.dumps(value)))

    def test_equal_totals_and_single_total_keep_existing_contract(self):
        for total in (0, 1, 101):
            for fields in ("both", "dataCount", "total"):
                value = json.loads(capture()["rawReportResponse"])
                value["dataCount"] = total
                row = value["dataList"]["rows"][0]
                value["dataList"]["rows"] = [{**row, "id": str(i)} for i in range(min(total, 100))]
                value["dataList"]["total"] = total
                if fields == "dataCount":
                    del value["dataList"]["total"]
                elif fields == "total":
                    del value["dataCount"]
                with self.subTest(total=total, fields=fields):
                    result = extract_garment_observation_page(capture(json.dumps(value)))
                    self.assertEqual(result["reportedTotal"], total)
                    self.assertEqual(len(result["rows"]), min(total, 100))

    def test_later_page_cannot_mask_a_conflicting_total(self):
        value = json.loads(capture()["rawReportResponse"])
        value["dataCount"] = 101
        value["pageIndex"] = 2
        value["dataList"]["total"] = 201
        frame = capture(json.dumps(value))
        frame["page"] = 2
        with self.assertRaises(GarmentObservationError):
            extract_garment_observation_page(frame)
        value["dataList"]["total"] = 101
        frame = capture(json.dumps(value))
        frame["page"] = 2
        self.assertEqual(extract_garment_observation_page(frame)["reportedTotal"], 101)


if __name__ == "__main__":
    unittest.main()
