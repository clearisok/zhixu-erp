import json
from unittest import TestCase

from ainuoke_bridge.garment_report_screening import DEFINITION, screen
from ainuoke_bridge.contracts import REPORT_CATALOG, build_report_request
from ainuoke_bridge.ainuoke_client import UpstreamSchemaError


class GarmentReportScreeningTests(TestCase):
    def test_definition_is_fixed_and_not_registered_as_a_general_source(self):
        body = build_report_request(DEFINITION, page=1, page_size=100, query_context={"salesContractNo": "SYN-C1"})
        condition = body["sqlCdtn"]["conditionList"][0]
        self.assertEqual((body["reportId"], condition["fieldName"], condition["compareType"], condition["flowName"]),
                         (6086979, "ExpContractNo", "is", "[内层]"))
        self.assertFalse(any(value.report_id == "6086979" for value in REPORT_CATALOG.values()))

    def test_nested_secret_keys_reflections_and_decoded_duplicate_keys_are_rejected(self):
        for value in ({"x": {"token": "private"}}, {"x": "synthetic-password"}, {"x": '{"a":1,"\\u0061":2}'}):
            with self.assertRaises(Exception):
                screen(value, ("synthetic-password",))

    def test_plain_labels_and_huge_numeric_lexemes_are_not_reparsed_as_floats(self):
        for value in ("[内层]", "{not-json", '{"x":' + "9" * 4500 + "}"):
            screen(value, ())

    def test_combined_depth_is_bounded_including_encoded_json_edges(self):
        def nested(levels):
            value = "safe"
            for _ in range(levels):
                value = {"child": value}
            return value
        screen(nested(64), ())
        for value in (nested(65), {"child": json.dumps(nested(64))}):
            with self.assertRaises(UpstreamSchemaError):
                screen(value, ())
