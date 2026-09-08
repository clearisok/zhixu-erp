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
        self.assertEqual({item.report_id for item in REPORT_CATALOG.values()}, {"6086103", "6086997", "6087050"})
        with self.assertRaisesRegex(SourceContractError, "unknown_report"):
            resolve_report("6086103")
        with self.assertRaisesRegex(SourceContractError, "unknown_report"):
            resolve_report("write_sales_order")

    def test_snapshot_preserves_provenance_and_has_deterministic_hash(self) -> None:
        arguments = dict(
            report_key="sales_contracts",
            rows=[{"id": 7, "contractNo": "D1935"}],
            page=1,
            page_size=100,
            total=1,
            query_context={"styleNo": "D1935"},
        )
        first = build_report_snapshot(**arguments, fetched_at="2026-09-08T01:00:00+00:00")
        second = build_report_snapshot(**arguments, fetched_at="2026-09-08T02:00:00+00:00")
        self.assertEqual(first.schema_version, SOURCE_SCHEMA_VERSION)
        self.assertEqual(first.report_id, "6086103")
        self.assertEqual(first.rows[0].source_row_identity, "6086103:7")
        self.assertEqual(first.snapshot_hash, second.snapshot_hash)

    def test_source_snapshot_removes_secret_named_fields(self) -> None:
        snapshot = build_report_snapshot(
            report_key="material_purchase_statistics",
            rows=[{"id": 1, "material": "罗马布", "jwtToken": "jwt-secret", "nested": [[{"session": "session-secret"}]]}],
            page=1,
            page_size=50,
            total=1,
            query_context={"password": "credential-secret", "styleNo": "D1935"},
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
