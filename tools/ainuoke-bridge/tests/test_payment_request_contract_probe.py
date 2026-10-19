import copy
import json
from unittest import TestCase
from unittest.mock import patch

from ainuoke_bridge.payment_request_contract_probe import (
    collect, validate_input, validate_selection, ContractTransport, DEFINITION, fingerprint)
from ainuoke_bridge.contracts import REPORT_CATALOG, build_report_request
from ainuoke_bridge.server_source import APPROVED_HTTP_ORIGIN, APPROVED_HTTP_POLICY
from ainuoke_bridge.ainuoke_client import NetworkAinuokeError

USERNAME="synthetic-contract-account"
PASSWORD="synthetic-contract-secret"
def selection():
    return {"schemaVersion":"ainuoke-payment-contract-selection.v1",
        "sourceFingerprint":fingerprint(APPROVED_HTTP_ORIGIN,USERNAME),"samplesSha256":"a"*64,
        "targets":[{"alias":"S"+str(i),"salesContractNo":"SYN-SALES-"+str(i),
                    "witness":{"id":str(i*1000),"BillNo":"SYN-APP-"+str(i),"PurContractNo":"SYN-PUR-"+str(i)}} for i in (1,2)]}
def config():
    return {"baseUrl":APPROVED_HTTP_ORIGIN,"transportPolicy":APPROVED_HTTP_POLICY,
            "username":USERNAME,"password":PASSWORD,"action":"read-two-verified-contracts","selection":selection()}

class FakeTransport:
    def __init__(self,total=2,change=None):
        self.http_attempts=0;self.report_requests=0;self.last_report_text=None;self.last_report_request_number=0;self.phase="not-started"
        self.total=total;self.change=change;self.calls=[];self.passes={}
    def request(self,**kwargs):
        self.calls.append(kwargs);self.http_attempts+=1
        if kwargs["method"]=="GET":
            return {"data":{"isOk":True,"jwtToken":"synthetic-token","sessionId":"synthetic-session"}}
        self.report_requests+=1
        body=kwargs["body"];condition=body["sqlCdtn"]["conditionList"][0];contract=condition["compareValue"]
        page=body["sqlCdtn"]["pageIndex"];self.passes[contract]=self.passes.get(contract,0)+(1 if page==1 else 0)
        pass_no=self.passes[contract];i=int(contract[-1]);offset=(page-1)*100
        rows=[{"id":i*1000+n,"BillNo":"SYN-APP-"+str(i),"PurContractNo":"SYN-PUR-"+str(i),
               "ExpContractNo":contract,"CnName":"合成物料","Num":10,"OutStoreNum":12,"QtyUnit":"个","Price":"1.2300"} for n in range(offset,min(offset+100,self.total))]
        payload={"reObj":{"isOk":True},"dataList":json.dumps({"rows":rows},ensure_ascii=False),
                 "reportObj":{"reportId":6086941,"cellList":"[]"},"dataCount":self.total,"pageIndex":0,"pageSize":0}
        if self.change:self.change(contract,pass_no,page,payload)
        self.last_report_text=json.dumps(payload,ensure_ascii=False)
        self.last_report_request_number=self.report_requests
        return payload

def modify_rows(payload,fn):
    rows=json.loads(payload["dataList"])["rows"];fn(rows);payload["dataList"]=json.dumps({"rows":rows},ensure_ascii=False)

class ContractProbeTests(TestCase):
    def test_two_contracts_two_passes_exact_request_and_not_registered(self):
        transport=FakeTransport();result=collect(config(),transport)
        self.assertEqual(result["result"],"complete")
        self.assertEqual((result["httpAttempts"],result["reportRequests"],len(result["pages"])),(5,4,4))
        for call in transport.calls[1:]:
            body=call["body"];contract=body["sqlCdtn"]["conditionList"][0]["compareValue"]
            self.assertEqual(body,build_report_request(DEFINITION,page=1,page_size=100,query_context={"salesContractNo":contract}))
            self.assertEqual(body["sqlCdtn"]["conditionList"][0]["compareType"],"is")
        self.assertFalse(any(str(d.report_id)=="6086941" for d in REPORT_CATALOG.values()))
    def test_full_101_rows_in_two_pages_twice(self):
        result=collect(config(),FakeTransport(total=101))
        self.assertEqual(result["result"],"complete")
        self.assertEqual((result["httpAttempts"],result["reportRequests"],len(result["pages"])),(9,8,8))
        self.assertEqual([p["page"] for p in result["pages"]],[1,2,1,2,1,2,1,2])
    def test_invalid_scope_or_account_stops_before_login(self):
        for changes in ({"action":"read-all"},{"baseUrl":"https://example.invalid"},{"username":"wrong-account"},{"extra":"field"}):
            value=config();value.update(changes);transport=FakeTransport()
            with self.subTest(changes=changes),self.assertRaises(Exception):collect(value,transport)
            self.assertEqual(transport.calls,[])
    def test_target_count_duplicates_and_arbitrary_query_rejected(self):
        for mutate in (lambda s:s["targets"].pop(),lambda s:s["targets"].append(s["targets"][0]),
                       lambda s:s["targets"][1].update(s["targets"][0]),lambda s:s["targets"][0].update({"fieldName":"other"}),
                       lambda s:s["targets"][0].update({"salesContractNo":"SYN' OR 1=1"})):
            value=selection();mutate(value)
            with self.assertRaises(Exception):validate_selection(value)
    def test_mixed_contract_rows_rejected_and_safe_page_preserved(self):
        def change(contract,pass_no,page,p):
            if contract.endswith("1"):modify_rows(p,lambda rows:rows[0].update({"ExpContractNo":"OTHER"}))
        r=collect(config(),FakeTransport(change=change))
        self.assertEqual(r["code"],"payment_contract_identity_mismatch");self.assertEqual(len(r["pages"]),1)
        self.assertNotIn(PASSWORD,json.dumps(r))
    def test_ignored_filter_cannot_pass_both_positive_controls(self):
        def change(contract,pass_no,page,p):
            if contract.endswith("2"):modify_rows(p,lambda rows:[row.update({"ExpContractNo":"SYN-SALES-1"}) for row in rows])
        r=collect(config(),FakeTransport(change=change))
        self.assertEqual(r["result"],"failed");self.assertEqual(r["code"],"payment_contract_identity_mismatch")
    def test_changed_total_or_content_during_second_pass_rejected(self):
        for total_change in (True,False):
            def change(contract,pass_no,page,p):
                if pass_no==2:
                    if total_change:p["dataCount"]=3
                    else:modify_rows(p,lambda rows:rows[-1].update({"Price":"2.00"}))
            self.assertEqual(collect(config(),FakeTransport(change=change))["result"],"failed")
    def test_repeated_page_rejected_without_deduplicating_rows(self):
        def change(contract,pass_no,page,p):
            if page==2:modify_rows(p,lambda rows:[row.update({"id":int(row["id"])-100}) for row in rows])
        self.assertEqual(collect(config(),FakeTransport(total=200,change=change))["code"],"payment_contract_repeated_page")
    def test_duplicate_rows_inside_page_preserved(self):
        def change(contract,pass_no,page,p):modify_rows(p,lambda rows:rows.__setitem__(1,dict(rows[0])))
        r=collect(config(),FakeTransport(change=change))
        self.assertEqual(r["result"],"complete")
        rows=json.loads(json.loads(r["pages"][0]["rawReportResponse"])["dataList"])["rows"]
        self.assertEqual(len(rows),2);self.assertEqual(rows[0],rows[1])
    def test_empty_and_over_limit_stop_without_claiming_no_records(self):
        for total,code in ((0,"payment_contract_empty_unverified"),(201,"payment_contract_page_limit")):
            transport=FakeTransport(total=total);r=collect(config(),transport)
            self.assertEqual(r["code"],code);self.assertEqual(transport.report_requests,1)
    def test_missing_witness_not_accepted(self):
        value=config();value["selection"]["targets"][0]["witness"]["id"]="999999"
        self.assertEqual(collect(value,FakeTransport())["code"],"payment_contract_witness_missing")
    def test_missing_or_invalid_paging_stops(self):
        for mutate in (lambda p:p.pop("pageIndex"),lambda p:p.update({"pageSize":50}),lambda p:p.update({"dataCount":None})):
            r=collect(config(),FakeTransport(change=lambda c,n,g,p:mutate(p)));self.assertEqual(r["result"],"failed")
    def test_secret_reflection_does_not_enter_private_evidence(self):
        for reflected in (PASSWORD,"synthetic-token","synthetic-session"):
            def change(c,n,g,p):modify_rows(p,lambda rows:rows[0].update({"CnName":reflected}))
            r=collect(config(),FakeTransport(change=change))
            self.assertEqual(r["result"],"failed");self.assertEqual(r["pages"],[])
            self.assertNotIn(reflected,json.dumps(r))
    def test_network_failure_is_not_retried(self):
        class Failing(FakeTransport):
            def request(self,**kwargs):
                self.http_attempts+=1;raise NetworkAinuokeError("not-safe-to-reflect")
        transport=Failing();r=collect(config(),transport)
        self.assertEqual((r["code"],transport.http_attempts),("network_unavailable",1))
        self.assertNotIn("not-safe-to-reflect",json.dumps(r))
    def test_transport_only_allows_fixed_target_bodies_and_original_probe_stays_fixed(self):
        transport=ContractTransport(selection())
        good=build_report_request(DEFINITION,page=2,page_size=100,query_context={"salesContractNo":"SYN-SALES-1"})
        self.assertTrue(transport.report_body_allowed(good))
        for mutate in (lambda b:b.update({"reportId":6087050}),lambda b:b["sqlCdtn"].update({"pageIndex":3}),
                       lambda b:b["sqlCdtn"]["conditionList"][0].update({"compareType":"contains"}),
                       lambda b:b["sqlCdtn"]["conditionList"][0].update({"compareValue":"OTHER"})):
            bad=copy.deepcopy(good);mutate(bad);self.assertFalse(transport.report_body_allowed(bad))
        from ainuoke_bridge.payment_request_probe import BoundedPaymentTransport
        self.assertEqual((BoundedPaymentTransport.MAX_HTTP_ATTEMPTS,BoundedPaymentTransport.MAX_REPORT_REQUESTS),(2,1))
        self.assertFalse(BoundedPaymentTransport().report_body_allowed(good))

    def test_remaining_byte_budget_limits_the_next_response_read(self):
        transport=ContractTransport(selection())
        transport.total_report_bytes=16*1024*1024-10
        self.assertEqual(transport.response_byte_limit(True),10)
        self.assertEqual(transport.response_byte_limit(False),4*1024*1024)
        transport.total_report_bytes=16*1024*1024
        self.assertEqual(transport.response_byte_limit(True),0)

    def test_safe_report_error_without_rows_is_retained_for_private_debug(self):
        def change(c,n,g,p):
            p.clear();p.update({"reObj":{"isOk":False,"msg":"synthetic query rejected"}})
        r=collect(config(),FakeTransport(change=change))
        self.assertEqual(r["result"],"failed");self.assertEqual(len(r["pages"]),1)
        self.assertIn("synthetic query rejected",r["pages"][0]["rawReportResponse"])

    def test_secret_report_error_is_not_retained(self):
        def change(c,n,g,p):
            p.clear();p.update({"reObj":{"isOk":False,"msg":PASSWORD}})
        r=collect(config(),FakeTransport(change=change))
        self.assertEqual(r["result"],"failed");self.assertEqual(r["pages"],[])
        self.assertNotIn(PASSWORD,json.dumps(r))
