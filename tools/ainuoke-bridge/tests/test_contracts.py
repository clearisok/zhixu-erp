from __future__ import annotations

import json
import pathlib
import sys
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from ainuoke_bridge.contracts import (  # noqa: E402
    REPORT_CATALOG,
    SOURCE_SCHEMA_VERSION,
    SourceContractError,
    build_report_snapshot,
    build_report_request,
    resolve_report,
)
from ainuoke_bridge.security import (  # noqa: E402
    DEFAULT_ALLOWED_ORIGINS,
    SecurityContract,
    SecurityContractError,
    contains_secret_field,
)


class ReportContractTests(unittest.TestCase):
    def test_catalog_is_exact_and_does_not_accept_unknown_report(self) -> None:
        self.assertEqual(set(REPORT_CATALOG), {"order_discovery", "sales_contracts", "sales_contract_color_sizes", "garment_color_size_details", "material_purchase_statistics"})
        self.assertEqual({item.report_id for item in REPORT_CATALOG.values()}, {"6086103", "6086997", "6087050", "6087105"})
        with self.assertRaisesRegex(SourceContractError, "unknown_report"):
            resolve_report("6086103")
        with self.assertRaisesRegex(SourceContractError, "unknown_report"):
            resolve_report("6087105")
        with self.assertRaisesRegex(SourceContractError, "unknown_report"):
            resolve_report("write_sales_order")

    def test_order_discovery_replays_only_the_observed_empty_query_contract(self) -> None:
        definition = resolve_report("order_discovery")
        request = build_report_request(definition, page=3, page_size=50, query_context={})
        self.assertEqual(request, {
            "reportId": 6086103,
            "sqlCdtn": {
                "targetId": 6086103,
                "entId": 6086103,
                "currentPage": 3,
                "pageIndex": 3,
                "pageSize": 50,
                "targetType": 1,
                "conditionList": [],
                "sqlParamList": [],
                "orderFieldList": [],
            },
            "isFirstTime": True,
            "isIniPage": False,
        })
        for query in ({"insideOrderNo": "D1935"}, {"conditionList": []}, {"status": "生效"}):
            with self.subTest(query=query), self.assertRaisesRegex(SourceContractError, "invalid_query"):
                build_report_request(definition, page=1, page_size=50, query_context=query)

    def test_snapshot_preserves_provenance_and_has_deterministic_hash(self) -> None:
        arguments = dict(
            report_key="sales_contracts",
            rows=[{"id": 7, "contractNo": "D1935"}],
            page=1,
            page_size=100,
            total=1,
            query_context={"insideOrderNo": "D1935"},
        )
        first = build_report_snapshot(**arguments, fetched_at="2026-09-08T01:00:00+00:00")
        second = build_report_snapshot(**arguments, fetched_at="2026-09-08T02:00:00+00:00")
        self.assertEqual(first.schema_version, SOURCE_SCHEMA_VERSION)
        self.assertEqual(first.report_id, "6086103")
        self.assertTrue(first.rows[0].source_row_identity.startswith("6086103:sha256:"))
        self.assertEqual(first.snapshot_hash, second.snapshot_hash)

    def test_6087105_uses_fixed_contains_sales_contract_contract(self) -> None:
        definition = resolve_report("garment_color_size_details")
        request = build_report_request(definition, page=2, page_size=50, query_context={"salesContractNo": " PI2607-235 "})
        self.assertEqual(request["reportId"], 6087105)
        self.assertEqual(request["sqlCdtn"]["targetId"], 6087105)
        self.assertEqual(request["sqlCdtn"]["entId"], 6087105)
        self.assertEqual(request["sqlCdtn"]["currentPage"], 2)
        self.assertEqual(request["sqlCdtn"]["pageIndex"], 2)
        self.assertEqual(request["sqlCdtn"]["conditionList"], [{
            "conditionRelation": "and",
            "cuHaiType": 0,
            "dbTableName": "",
            "fieldName": "BillNo",
            "compareType": "contains",
            "dataType": "varchar",
            "dataTypeId": 2,
            "valueType": 1,
            "dealWithType": 0,
            "compareValue": "PI2607-235",
            "flowName": "[内层]",
        }])
        for query in (
            {"reportId": "6087105"},
            {"salesContractNo": "PI2607-235", "conditionList": []},
            {"salesContractNo": ""},
            {"insideOrderNo": "D1935"},
            {"insideOrderNo": "D1935", "salesContractNo": "PI2607-235"},
        ):
            with self.subTest(query=query), self.assertRaisesRegex(SourceContractError, "invalid_query"):
                build_report_request(definition, page=1, page_size=50, query_context=query)

    def test_snapshot_serialization_is_detached_from_hash_content(self) -> None:
        snapshot = build_report_snapshot(report_key="order_discovery", rows=[{"id": 1, "nested": {"values": [2]}}], page=1, page_size=50, total=1, query_context={})
        exported = snapshot.to_dict()
        exported["rows"][0]["values"]["nested"]["values"].append(3)
        exported["queryContext"]["injected"] = "value"
        self.assertEqual(snapshot.rows[0].values["nested"]["values"], [2])
        self.assertEqual(snapshot.query_context, {})

    def test_6087050_repeated_id_uses_distinct_stable_row_fingerprints(self) -> None:
        rows = [
            {"id": 71001, "insideorderno": "D1935", "GoodsNo": "MATERIAL-A", "CnColor": "BLACK"},
            {"id": 71001, "insideorderno": "D1935", "GoodsNo": "MATERIAL-B", "CnColor": "WHITE"},
        ]
        first = build_report_snapshot(report_key="material_purchase_statistics", rows=rows, page=1, page_size=50, total=2, query_context={"insideOrderNo": "D1935"})
        reordered = build_report_snapshot(report_key="material_purchase_statistics", rows=list(reversed(rows)), page=1, page_size=50, total=2, query_context={"insideOrderNo": "D1935"})
        identities = [row.source_row_identity for row in first.rows]
        self.assertEqual(len(set(identities)), 2)
        self.assertEqual(set(identities), {row.source_row_identity for row in reordered.rows})
        self.assertTrue(all(identity.startswith("6087050:sha256:") for identity in identities))

    def test_browser_query_cannot_supply_raw_upstream_contract(self) -> None:
        definition = resolve_report("sales_contracts")
        for query in ({"conditionList": []}, {"sqlCdtn": {}}, {"reportId": "6086103"}, {"insideOrderNo": ""}):
            with self.subTest(query=query), self.assertRaisesRegex(SourceContractError, "invalid_query"):
                build_report_request(definition, page=1, page_size=50, query_context=query)

    def test_source_snapshot_removes_secret_named_fields(self) -> None:
        snapshot = build_report_snapshot(
            report_key="material_purchase_statistics",
            rows=[{"id": 1, "material": "罗马布", "jwtToken": "jwt-secret", "nested": [[{"session": "session-secret"}]]}],
            page=1,
            page_size=50,
            total=1,
            query_context={"password": "credential-secret", "insideOrderNo": "D1935"},
        )
        encoded = json.dumps(snapshot.to_dict(), ensure_ascii=False)
        self.assertNotIn("credential-secret", encoded)
        self.assertNotIn("jwt-secret", encoded)
        self.assertNotIn("session-secret", encoded)
        self.assertFalse(contains_secret_field(snapshot.to_dict()))


class SecurityContractTests(unittest.TestCase):
    def test_bridge_accepts_only_literal_loopback(self) -> None:
        SecurityContract("127.0.0.1")
        SecurityContract("::1")
        for host in ("0.0.0.0", "127.0.0.2", "192.168.1.20", "localhost"):
            with self.subTest(host=host), self.assertRaises(SecurityContractError):
                SecurityContract(host)

    def test_origin_allowlist_is_explicit(self) -> None:
        contract = SecurityContract("127.0.0.1")
        for origin in DEFAULT_ALLOWED_ORIGINS:
            self.assertEqual(contract.allow_origin(origin), origin)
        with self.assertRaisesRegex(SecurityContractError, "origin_not_allowed"):
            contract.allow_origin("https://attacker.example")
        with self.assertRaises(SecurityContractError):
            SecurityContract("127.0.0.1", frozenset({"*"}))


if __name__ == "__main__":
    unittest.main()
