import copy
import json
from unittest import TestCase
from unittest.mock import patch
from ainuoke_bridge.selected_source_once import collect_selected, BudgetClient, BudgetTransport, Refused, LIMITS
from ainuoke_bridge.server_source import validate_input, ProtectedTransport, APPROVED_HTTP_ORIGIN, APPROVED_HTTP_POLICY
from ainuoke_bridge.ainuoke_client import NetworkAinuokeError, AuthExpiredError, UpstreamSchemaError, AinuokeClient
from ainuoke_bridge.contracts import REPORT_CATALOG, build_report_request
from selected_source_fixture import FakeSelectedTransport, mutate_rows

CONFIG = {"baseUrl": "https://example.invalid", "username": "synthetic", "password": "synthetic-secret-value",
          "contracts": ["SYN-SALES-1", "SYN-SALES-2"], "mode": "selected-bindings"}


class SelectedSourceOnceTests(TestCase):
    def test_catalogue_discovery_reads_two_complete_passes_only(self):
        for total in (0, 3, 51, 1000, 1001, 1400):
            transport = FakeSelectedTransport(total=total)
            result = collect_selected({**CONFIG, "mode": "catalog-discovery", "contracts": []}, transport)
            self.assertEqual(result["result"], "complete")
            self.assertEqual(result["schemaVersion"], "ainuoke-catalog-discovery.v1")
            self.assertEqual(result["metrics"]["reportRequests"], 2*max(1, (total+49)//50))
            self.assertTrue(all(c["body"]["reportId"] == 6086103 for c in transport.calls[1:]))
        overflow = collect_selected({**CONFIG, "mode": "catalog-discovery", "contracts": []}, FakeSelectedTransport(total=1401))
        self.assertEqual(overflow["result"], "failed")
        self.assertIsNone(overflow["bundle"])

    def test_catalogue_image_reference_is_not_collected_or_hashed(self):
        seen = [0]
        def change(report, page, payload):
            if report == 6086103:
                seen[0] += 1
                mutate_rows(payload, lambda rows: rows[0].update(
                    ImageFile="" if seen[0] == 1 else "synthetic-new-image.png",
                    UnknownBusinessField="keep-this-value"))
        transport = FakeSelectedTransport(change)
        result = collect_selected({**CONFIG, "mode": "catalog-contracts", "contracts": ["SYN-SALES-1"]}, transport)
        self.assertEqual(result["result"], "complete")
        before, after = result["bundle"]["discoveryBefore"][0], result["bundle"]["discoveryAfter"][0]
        self.assertEqual(before["snapshotHash"], after["snapshotHash"])
        self.assertEqual(before["rows"], after["rows"])
        self.assertNotIn("ImageFile", before["rows"][0]["values"])
        self.assertEqual(before["rows"][0]["values"]["UnknownBusinessField"], "keep-this-value")
        self.assertTrue(all(c["url"].endswith((AinuokeClient.LOGIN_PATH, AinuokeClient.REPORT_PATH)) for c in transport.calls))

    def test_catalogue_1400_keeps_detail_and_total_budgets(self):
        config = {**CONFIG, "mode": "catalog-contracts", "contracts": ["SYN-SALES-1"]}
        result = collect_selected(config, FakeSelectedTransport(total=1400))
        self.assertEqual(result["result"], "complete")
        self.assertEqual(result["metrics"]["reportRequests"], 58)
        self.assertEqual(len(result["bundle"]["discoveryBefore"]), 28)
        self.assertEqual(set(result["bundle"]["materials"]), {"SYN-SALES-1"})
        overflow = collect_selected(config, FakeSelectedTransport(total=1401))
        self.assertEqual(overflow["code"], "selected_source_row_limit")
        detail_overflow = collect_selected(config, FakeSelectedTransport(total=1400, detail_total=1001))
        self.assertEqual(detail_overflow["code"], "selected_source_row_limit")
        aggregate = collect_selected(config, FakeSelectedTransport(total=1400, detail_total=1000))
        self.assertEqual(aggregate["code"], "selected_source_request_limit")
        self.assertEqual(aggregate["metrics"]["reportRequests"], 80)
        self.assertIsNone(aggregate["bundle"])

    def test_catalogue_combined_details_only_read_selected_contracts(self):
        transport = FakeSelectedTransport()
        result = collect_selected({**CONFIG, "mode": "catalog-contracts", "contracts": ["SYN-SALES-3"]}, transport)
        self.assertEqual(result["result"], "complete")
        self.assertEqual(result["schemaVersion"], "ainuoke-catalog-contracts.v1")
        self.assertEqual(result["metrics"]["reportRequests"], 4)
        self.assertEqual(set(result["bundle"]["colors"]), {"SYN-SALES-3"})
        self.assertEqual(set(result["bundle"]["materials"]), {"SYN-SALES-3"})
        self.assertEqual({int(c["body"]["reportId"]) for c in transport.calls[1:]}, {6086103,6087105,6087050})

    def test_catalogue_modes_reject_wrong_scope_before_network_and_never_retry(self):
        for mode, contracts in (("catalog-discovery", ["SYN-SALES-1"]),("catalog-contracts",[]),("catalog-contracts",["SYN-SALES-1"]*2)):
            transport = FakeSelectedTransport()
            with self.assertRaises(ValueError):
                collect_selected({**CONFIG, "mode":mode, "contracts":contracts}, transport)
            self.assertEqual(transport.calls, [])
        def fail(report, page, payload):
            if report == 6087050:
                raise NetworkAinuokeError("synthetic")
        transport = FakeSelectedTransport(fail)
        result = collect_selected({**CONFIG, "mode":"catalog-contracts", "contracts":["SYN-SALES-1"]}, transport)
        self.assertEqual(result["result"], "failed")
        self.assertIsNone(result["bundle"])
        self.assertEqual(result["metrics"]["networkRetries"], 0)
        self.assertEqual(sum(c.get("body",{}).get("reportId") == 6087050 for c in transport.calls), 1)

    def test_bound_material_scope_uses_distinct_protocol_and_same_aggregate_budget(self):
        for count in (1, 3, 25):
            contracts = sorted(f"SYN-SALES-{i+1}" for i in range(count))
            result = collect_selected({**CONFIG, "mode": "bound-materials", "contracts": contracts}, FakeSelectedTransport(total=max(3, count)))
            self.assertEqual(result["result"], "complete")
            self.assertEqual(result["schemaVersion"], "ainuoke-bound-materials-once.v1")
            self.assertEqual(result["limits"], {**LIMITS, "contracts": 25})
            self.assertEqual(result["metrics"]["reportRequests"], count+2)
            self.assertEqual(set(result["bundle"]["materials"]), set(contracts))
        for contracts in ([], ["SYN-SALES-1"]*2, [f"SYN-SALES-{i+1}" for i in range(26)]):
            transport = FakeSelectedTransport()
            with self.assertRaises(ValueError):
                collect_selected({**CONFIG, "mode": "bound-materials", "contracts": contracts}, transport)
            self.assertEqual(transport.calls, [])
        with self.assertRaises(ValueError):
            collect_selected({**CONFIG, "mode": "selected-materials", "contracts": ["SYN-SALES-1", "SYN-SALES-2", "SYN-SALES-3"]})

    def test_bound_material_third_contract_failure_cannot_publish_partial_or_retry(self):
        counts = [0]
        def expire(report, page, payload):
            if report == 6087050:
                counts[0] += 1
                if counts[0] == 3:
                    raise AuthExpiredError("synthetic")
        transport = FakeSelectedTransport(expire)
        result = collect_selected({**CONFIG, "mode": "bound-materials", "contracts": ["SYN-SALES-1", "SYN-SALES-2", "SYN-SALES-3"]}, transport)
        self.assertEqual(result["code"], "auth_expired")
        self.assertIsNone(result["bundle"])
        self.assertEqual(result["metrics"], {"logins": 1, "reportRequests": 4, "httpAttempts": 5, "networkRetries": 0, "authRenewals": 0})

    def test_bound_material_aggregate_budget_not_multiplied_by_contract_count(self):
        transport = FakeSelectedTransport(total=1000, detail_total=1000)
        result = collect_selected({**CONFIG, "mode": "bound-materials", "contracts": ["SYN-SALES-1", "SYN-SALES-2", "SYN-SALES-3"]}, transport)
        self.assertEqual(result["code"], "selected_source_request_limit")
        self.assertIsNone(result["bundle"])
        self.assertEqual(result["metrics"]["reportRequests"], 80)
        self.assertEqual(result["metrics"]["httpAttempts"], 81)

    def test_binding_exact_fixed_queries_only_selected_details_and_one_login(self):
        transport = FakeSelectedTransport()
        result = collect_selected(CONFIG, transport)
        self.assertEqual(result["result"], "complete")
        self.assertEqual(result["metrics"], {"logins": 1, "reportRequests": 4, "httpAttempts": 5, "networkRetries": 0, "authRenewals": 0})
        self.assertEqual(set(result["bundle"]["colors"]), set(CONFIG["contracts"]))
        expected = [("order_discovery", {}), ("garment_color_size_details", {"salesContractNo": "SYN-SALES-1"}),
                    ("garment_color_size_details", {"salesContractNo": "SYN-SALES-2"}), ("order_discovery", {})]
        for call, (key, query) in zip(transport.calls[1:], expected):
            self.assertEqual(call["body"], build_report_request(REPORT_CATALOG[key], page=1, page_size=50, query_context=query))
        self.assertNotIn(CONFIG["password"], json.dumps(result))

    def test_materials_use_discovery_identity_and_preserve_both_quantities(self):
        transport = FakeSelectedTransport()
        result = collect_selected({**CONFIG, "mode": "selected-materials"}, transport)
        self.assertEqual(result["result"], "complete")
        calls = transport.calls[2:4]
        for i, call in enumerate(calls, 1):
            self.assertEqual(call["body"], build_report_request(REPORT_CATALOG["material_purchase_statistics"], page=1,
                page_size=50, query_context={"insideOrderNo": f"SYN-IN-{i}"}))
        row = result["bundle"]["materials"]["SYN-SALES-1"][0]["rows"][0]["values"]
        self.assertEqual((row["TotalNum"], row["cgnum"], row["QtyUnit"], row["num_dyc"]), ("115.50", 118, "个", 1))

    def test_strict_scope_rejected_before_transport(self):
        for delta in ({"contracts": ["SYN-SALES-1"]}, {"contracts": ["SYN-SALES-1"]*2},
                      {"contracts": ["syn-1", "SYN-2"]}, {"contracts": ["SYN-1' OR 1=1", "SYN-2"]},
                      {"insideOrderNo": "guessed"}, {"reportId": 6086941}, {"networkRetries": 1},
                      {"baseUrl": "http://127.0.0.1"}, {"baseUrl": APPROVED_HTTP_ORIGIN}):
            transport = FakeSelectedTransport()
            with self.subTest(delta=delta), self.assertRaises(ValueError):
                collect_selected({**CONFIG, **delta}, transport)
            self.assertEqual(transport.calls, [])
        validate_input({**CONFIG, "baseUrl": APPROVED_HTTP_ORIGIN, "transportPolicy": APPROVED_HTTP_POLICY})

    def test_network_failure_has_one_attempt_and_never_retries(self):
        for at in (0, 6086103):
            def change(report, page, payload):
                if report == at:
                    raise NetworkAinuokeError(CONFIG["password"])
            transport = FakeSelectedTransport(change)
            result = collect_selected(CONFIG, transport)
            self.assertEqual(result["code"], "source_unavailable")
            self.assertEqual(len(transport.calls), 1 if at == 0 else 2)
            self.assertEqual(result["metrics"]["httpAttempts"], len(transport.calls))
            self.assertIsNone(result["bundle"])
            self.assertNotIn(CONFIG["password"], json.dumps(result))

    def test_expired_session_never_renews_or_repeats_report(self):
        def expired(report, page, payload):
            if report == 6087105:
                raise AuthExpiredError("private")
        transport = FakeSelectedTransport(expired)
        result = collect_selected(CONFIG, transport)
        self.assertEqual(result["code"], "auth_expired")
        self.assertEqual(result["metrics"]["httpAttempts"], 3)
        self.assertEqual(sum(c["method"] == "GET" for c in transport.calls), 1)
        self.assertIsNone(result["bundle"])

    def test_bad_login_stops_without_report(self):
        def bad(report, page, payload):
            if report == 0:
                payload["data"]["isOk"] = False
        result = collect_selected(CONFIG, FakeSelectedTransport(bad))
        self.assertEqual(result["code"], "invalid_credential")
        self.assertEqual(result["metrics"]["reportRequests"], 0)

    def test_protected_transport_limits_keep_safe_diagnostic_categories(self):
        for raw, code in (("response_limit", "selected_source_response_limit"),
                          ("redirect_refused", "selected_source_endpoint_refused"),
                          (CONFIG["password"], "selected_source_invalid")):
            def change(report, page, payload):
                raise UpstreamSchemaError(raw)
            transport = FakeSelectedTransport(change)
            result = collect_selected(CONFIG, transport)
            self.assertEqual(result["code"], code)
            self.assertEqual(len(transport.calls), 1)
            self.assertNotIn(CONFIG["password"], json.dumps(result))

    def test_full_detail_paging_is_counted_and_limit_stops_after_first_response(self):
        result = collect_selected({**CONFIG, "mode": "selected-materials"}, FakeSelectedTransport(detail_total=51))
        self.assertEqual(result["metrics"]["reportRequests"], 6)
        for discovery, detail in ((1001, 1), (3, 1001)):
            transport = FakeSelectedTransport(total=discovery, detail_total=detail)
            result = collect_selected(CONFIG, transport)
            self.assertEqual(result["code"], "selected_source_row_limit")
            self.assertEqual(result["metrics"]["reportRequests"], 1 if discovery > 1000 else 2)

    def test_missing_contract_and_short_page_never_return_partial_bundle(self):
        for total in (1, 51):
            def change(report, page, payload):
                if total == 51 and report == 6086103:
                    mutate_rows(payload, lambda rows: rows.pop())
            result = collect_selected(CONFIG, FakeSelectedTransport(change, total=total))
            self.assertEqual(result["result"], "failed")
            self.assertIsNone(result["bundle"])

    def test_deadline_and_response_size_stop_before_next_request(self):
        now = [0.0]
        def slow(report, page, payload):
            now[0] += 181
        transport = FakeSelectedTransport(slow)
        result = collect_selected(CONFIG, transport, clock=lambda: now[0])
        self.assertEqual(result["code"], "selected_source_timeout")
        self.assertEqual(len(transport.calls), 1)
        def huge(report, page, payload):
            payload["unmapped"] = "x"*LIMITS["responseBytes"]
        result = collect_selected(CONFIG, FakeSelectedTransport(huge))
        self.assertEqual(result["code"], "selected_source_response_limit")
        self.assertEqual(result["metrics"]["httpAttempts"], 1)

    def test_secret_values_cannot_be_reflected_into_safe_bundle(self):
        for secret in (CONFIG["password"], "synthetic-token-value", "synthetic-session-value"):
            def reflected(report, page, payload):
                if report == 6087105:
                    mutate_rows(payload, lambda rows: rows[0].update({"CnColor": secret}))
            result = collect_selected(CONFIG, FakeSelectedTransport(reflected))
            self.assertEqual(result["code"], "selected_source_secret_reflection")
            self.assertNotIn(secret, json.dumps(result))

    def test_escaped_secret_values_are_rejected_before_serialization(self):
        config = {**CONFIG, "password": 'Synthetic-"quote\\slash-secret'}
        def reflected(report, page, payload):
            if report == 6087105:
                mutate_rows(payload, lambda rows: rows[0].update({"CnColor": config["password"]}))
        result = collect_selected(config, FakeSelectedTransport(reflected))
        self.assertEqual(result["result"], "failed")
        self.assertEqual(result["code"], "selected_source_secret_reflection")
        self.assertIsNone(result["bundle"])

    def test_budget_rejects_endpoint_query_page_and_81st_report_before_wire(self):
        transport = FakeSelectedTransport()
        budget = BudgetTransport(CONFIG["baseUrl"], transport, lambda: 0)
        client = BudgetClient(AinuokeClient(base_url=CONFIG["baseUrl"], transport=budget, network_retries=0), budget,
                              CONFIG["contracts"], CONFIG["mode"])
        with self.assertRaises(Refused):
            budget.request(url=CONFIG["baseUrl"]+"/wrong", method="POST", body={}, headers={}, timeout=1)
        for query, page in (({"insideOrderNo": "guessed"}, 1), ({}, 21)):
            with self.assertRaises(Refused):
                client.read_report(REPORT_CATALOG["material_purchase_statistics"], jwt_token="synthetic", page=page,
                                   page_size=50, query_context=query)
        budget.logins, budget.reports = 1, 80
        with self.assertRaises(Refused):
            budget.request(url=CONFIG["baseUrl"]+AinuokeClient.REPORT_PATH, method="POST", body={}, headers={}, timeout=1)
        self.assertEqual(transport.calls, [])

    def test_existing_common_transport_remains_default_bounded(self):
        self.assertEqual(ProtectedTransport().max_response_bytes, 32*1024*1024)
        self.assertEqual(ProtectedTransport(4*1024*1024).max_response_bytes, 4*1024*1024)
        for limit in (0, True, 33*1024*1024):
            with self.assertRaises(ValueError):
                ProtectedTransport(limit)

    def test_complete_envelope_limits_cannot_mutate_module_budget(self):
        result = collect_selected(CONFIG, FakeSelectedTransport())
        result["limits"]["logins"] = 99
        self.assertEqual(LIMITS["logins"], 1)

    def test_full_fixed_upper_boundary_is_exactly_80_reports_and_4000_source_rows(self):
        result = collect_selected({**CONFIG, "mode": "selected-materials"}, FakeSelectedTransport(total=1000, detail_total=1000))
        self.assertEqual(result["result"], "complete")
        self.assertEqual(result["metrics"]["reportRequests"], 80)
        self.assertEqual(result["metrics"]["httpAttempts"], 81)
        bundle = result["bundle"]
        self.assertEqual(sum(len(p["rows"]) for p in bundle["discoveryBefore"]+bundle["discoveryAfter"]+
                         [p for pages in bundle["materials"].values() for p in pages]), 4000)

    def test_common_selected_entry_uses_owned_budget(self):
        from ainuoke_bridge.server_source import collect
        with patch("ainuoke_bridge.selected_source_once.ProtectedTransport", return_value=FakeSelectedTransport()):
            self.assertEqual(collect(copy.deepcopy(CONFIG))["metrics"]["httpAttempts"], 5)
