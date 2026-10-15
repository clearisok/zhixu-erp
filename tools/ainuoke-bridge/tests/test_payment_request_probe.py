import json
import io
import sys
from hashlib import sha256
from unittest import TestCase, main
from unittest.mock import patch
from urllib.error import HTTPError, URLError
from ainuoke_bridge.ainuoke_client import AinuokeClient, UpstreamSchemaError, AuthExpiredError, NetworkAinuokeError
from ainuoke_bridge.contracts import REPORT_CATALOG, build_report_request
from ainuoke_bridge.payment_request_probe import probe, BoundedPaymentTransport, DEFINITION, MAX_RESPONSE_BYTES, main as worker_main
from ainuoke_bridge.server_source import APPROVED_HTTP_ORIGIN, APPROVED_HTTP_POLICY

CONFIG={"baseUrl":APPROVED_HTTP_ORIGIN,"transportPolicy":APPROVED_HTTP_POLICY,"username":"synthetic-account","password":"Secret-Synthetic-Only","action":"read-first-page-only"}
def response(rows=None,total=17247):
    return {"reObj":{"isOk":True},"dataList":json.dumps({"rows":rows if rows is not None else [{"id":1,"Num":3045,"OutStoreNum":3396,"QtyUnit":"个"}]}),
            "dataCount":total,"pageIndex":0,"pageSize":0,"reportObj":{"reportId":6086941,"cellList":[{"fieldName":"QtyUnit"}]},"totalInfo":{"Num":"raw-only"}}
class FakeTransport:
    def __init__(self,payload=None,raw=None,error=None):
        self.payload=payload if payload is not None else response(); self.raw=raw; self.error=error
        self.http_attempts=0; self.report_requests=0; self.last_report_text=None; self.calls=[]
    def request(self,**kwargs):
        self.calls.append(kwargs); self.http_attempts+=1
        if kwargs["method"]=="GET": return {"data":{"isOk":True,"jwtToken":"synthetic-token","sessionId":"synthetic-session"}}
        self.report_requests+=1
        if self.error: raise self.error("must-not-reflect")
        self.last_report_text=self.raw if self.raw is not None else json.dumps(self.payload,ensure_ascii=False)
        return self.payload
class Response:
    def __init__(self,raw): self.raw=raw; self.read_limit=None
    def __enter__(self): return self
    def __exit__(self,*args): return False
    def read(self,limit): self.read_limit=limit; return self.raw[:limit]
class PaymentProbeTests(TestCase):
    def test_fixed_scope_no_catalog_and_raw_evidence(self):
        transport=FakeTransport(); result=probe(CONFIG,transport)
        self.assertEqual((result["reportId"],result["page"],result["pageSize"],result["httpAttempts"]),("6086941",1,100,2))
        self.assertEqual(transport.calls[1]["body"],build_report_request(DEFINITION,page=1,page_size=100,query_context={}))
        self.assertFalse(any(str(d.report_id)=="6086941" for d in REPORT_CATALOG.values()))
        self.assertEqual(result["rawResponseSha256"],sha256(result["rawReportResponse"].encode()).hexdigest())
        for secret in (CONFIG["username"],CONFIG["password"],"synthetic-token","synthetic-session"): self.assertNotIn(secret,json.dumps(result))
    def test_scope_cannot_expand_before_login(self):
        for change in ({"page":2},{"contracts":["SYNTHETIC"]},{"reportId":"6087050"},{"baseUrl":"https://example.invalid"},
                       {"baseUrl":APPROVED_HTTP_ORIGIN+"/"},{"transportPolicy":"other"},{"action":"all-pages"},{"password":""},{"username":"x\nbad"}):
            with self.subTest(change=change):
                transport=FakeTransport()
                with self.assertRaises(ValueError): probe({**CONFIG,**change},transport)
                self.assertEqual(transport.calls,[])
    def test_bad_page_and_metadata(self):
        cases=[]
        for field,value in (("dataCount",0),("pageIndex",2),("pageSize",50),("dataList",'{"rows":null}')):
            item=response(); item[field]=value; cases.append(item)
        cases.append(response([{} for _ in range(101)],101))
        item=response(); item["reportObj"]["reportId"]=6087050; cases.append(item)
        item=response(); item["reportObj"]["cellList"]={}; cases.append(item)
        for index,item in enumerate(cases):
            with self.subTest(index=index):
                with self.assertRaises(UpstreamSchemaError): probe(CONFIG,FakeTransport(item))
    def test_missing_metadata_no_invention(self):
        item=response(); del item["reportObj"]
        self.assertNotIn("reportObj",json.loads(probe(CONFIG,FakeTransport(item))["rawReportResponse"]))
    def test_zero_unknown_negative_and_duplicate_rows_preserved(self):
        rows=[{"id":7,"Num":None,"OutStoreNum":0,"PayAmount":-1,"GoodsAmount":None}]*2
        result=probe(CONFIG,FakeTransport(response(rows)))
        self.assertEqual(json.loads(json.loads(result["rawReportResponse"])["dataList"])["rows"],rows)
    def test_numeric_text_preserved(self):
        raw=json.dumps(response()).replace('"raw-only"','12345678901234567890.12345678901234567890')
        self.assertIn('12345678901234567890.12345678901234567890',probe(CONFIG,FakeTransport(json.loads(raw),raw))["rawReportResponse"])
    def test_secrets_even_in_encoded_rows_or_metadata(self):
        cases=[response([{"password":"bad"}]),response([{"id":CONFIG["password"]}]),response([{"id":"synthetic-token"}])]
        for meta in ({"cookie":"bad"},json.dumps({"sessionId":"bad"})):
            item=response(); item["reportObj"]=meta; cases.append(item)
        for index,item in enumerate(cases):
            with self.subTest(index=index):
                with self.assertRaises(UpstreamSchemaError): probe(CONFIG,FakeTransport(item))
    def test_auth_network_no_retry(self):
        for error in (AuthExpiredError,NetworkAinuokeError):
            transport=FakeTransport(error=error)
            with self.assertRaises(error): probe(CONFIG,transport)
            self.assertEqual((transport.http_attempts,transport.report_requests),(2,1))
    def test_worker_wrong_args_no_stdin(self):
        with patch.object(sys,"argv",["probe"]),patch.object(sys,"stdin",None),patch("sys.stdout",new_callable=io.StringIO) as out:
            self.assertEqual(worker_main(),1); self.assertEqual(json.loads(out.getvalue()),{"schemaVersion":"ainuoke-payment-page-failure.v1","code":"payment_probe_explicit_action_required","workerStage":"not-started","httpAttempts":0,"reportRequests":0})
    def test_transport_proxy_and_budgets(self):
        from ainuoke_bridge import payment_request_probe as module
        wire=Response(b'{"reObj":{"isOk":true}}')
        with patch.object(module,"build_opener") as builder:
            builder.return_value.open.return_value=wire
            transport=BoundedPaymentTransport()
            arguments={"url":APPROVED_HTTP_ORIGIN+AinuokeClient.REPORT_PATH,"method":"POST","body":build_report_request(DEFINITION,page=1,page_size=100,query_context={}),"headers":{},"timeout":100}
            transport.request(**arguments)
            self.assertEqual(wire.read_limit,MAX_RESPONSE_BYTES+1); self.assertEqual(builder.call_args.args[1].proxies,{})
            self.assertEqual(builder.return_value.open.call_args.kwargs["timeout"],15)
            with self.assertRaises(UpstreamSchemaError): transport.request(**arguments)
    def test_transport_refuses_wrong_scope_and_bad_response(self):
        from ainuoke_bridge import payment_request_probe as module
        report=APPROVED_HTTP_ORIGIN+AinuokeClient.REPORT_PATH
        for url,body in (("https://example.invalid",{}),(report,{}),(report,build_report_request(DEFINITION,page=2,page_size=100,query_context={}))):
            with self.assertRaises(UpstreamSchemaError): BoundedPaymentTransport().request(url=url,method="POST",body=body,headers={},timeout=15)
        for raw in (b"x"*(MAX_RESPONSE_BYTES+1),b"invalid",b"[]"):
            with patch.object(module,"build_opener") as builder:
                builder.return_value.open.return_value=Response(raw)
                with self.assertRaises(UpstreamSchemaError): BoundedPaymentTransport().request(url=report,method="POST",body=build_report_request(DEFINITION,page=1,page_size=100,query_context={}),headers={},timeout=15)
    def test_transport_safe_errors(self):
        from ainuoke_bridge import payment_request_probe as module
        for error,expected in ((HTTPError("http://hidden",401,"private",{},None),AuthExpiredError),(HTTPError("http://hidden",302,"private",{},None),UpstreamSchemaError),(URLError("private"),NetworkAinuokeError)):
            with patch.object(module,"build_opener") as builder:
                builder.return_value.open.side_effect=error
                with self.assertRaises(expected) as raised: BoundedPaymentTransport().request(url=APPROVED_HTTP_ORIGIN+AinuokeClient.REPORT_PATH,method="POST",body=build_report_request(DEFINITION,page=1,page_size=100,query_context={}),headers={},timeout=15)
                self.assertNotIn("private",str(raised.exception))

    def test_safe_failure_codes_counters_and_no_exception_text(self):
        from ainuoke_bridge.payment_request_probe import safe_failure
        transport=FakeTransport(); transport.http_attempts=2; transport.report_requests=1; transport.phase="report"
        for error,code in ((NetworkAinuokeError("private-business-text"),"network_unavailable"),
                           (UpstreamSchemaError("payment_probe_secret_field"),"payment_probe_secret_field"),
                           (RuntimeError({"private":"never-output"}),"payment_probe_failed")):
            result=safe_failure(error,transport)
            self.assertEqual(result["code"],code); self.assertEqual(result["workerStage"],"report")
            self.assertEqual((result["httpAttempts"],result["reportRequests"]),(2,1))
            self.assertNotIn("private",json.dumps(result))
    def test_main_network_failure_reports_stage_without_retry_or_private_text(self):
        from ainuoke_bridge import payment_request_probe as module
        from types import SimpleNamespace
        transport=FakeTransport(error=NetworkAinuokeError)
        with patch.object(module,"BoundedPaymentTransport",return_value=transport),patch.object(sys,"argv",["probe","--stdin-request"]),patch.object(sys,"stdin",SimpleNamespace(buffer=io.BytesIO(json.dumps(CONFIG).encode()))),patch("sys.stdout",new_callable=io.StringIO) as out:
            self.assertEqual(worker_main(),1); result=json.loads(out.getvalue())
            self.assertEqual(result["code"],"network_unavailable"); self.assertEqual(result["workerStage"],"report")
            self.assertEqual((result["httpAttempts"],result["reportRequests"]),(2,1)); self.assertNotIn("must-not-reflect",out.getvalue())


    def test_optional_and_json_encoded_metadata_keep_original_wire_text(self):
        cases=[]
        for value in (None,"", "   ", {"cellList": None}, {"cellList": ""}, {"cellList": " [] "},
                      {"reportId":6086941,"cellList":json.dumps([{"fieldName":"QtyUnit"}])},
                      json.dumps({"reportId":6086941,"cellList":json.dumps([{"fieldName":"QtyUnit"}])})):
            item=response(); item["reportObj"]=value; cases.append(item)
        for index,item in enumerate(cases):
            with self.subTest(index=index):
                transport=FakeTransport(item); result=probe(CONFIG,transport)
                self.assertEqual(result["rawReportResponse"],json.dumps(item,ensure_ascii=False))
                self.assertEqual((transport.http_attempts,transport.report_requests),(2,1))
    def test_metadata_shape_errors_precise_but_identity_and_secret_rules_unchanged(self):
        from ainuoke_bridge.payment_request_probe import safe_failure
        cases=[("invalid", "payment_probe_report_metadata_invalid_json"),
               ([], "payment_probe_report_metadata_shape"),
               ({"cellList":"invalid"}, "payment_probe_column_metadata_invalid_json"),
               ({"cellList":{}}, "payment_probe_column_metadata_shape")]
        for value,code in cases:
            with self.subTest(code=code):
                item=response(); item["reportObj"]=value; transport=FakeTransport(item)
                with self.assertRaises(UpstreamSchemaError) as raised: probe(CONFIG,transport)
                self.assertEqual(safe_failure(raised.exception,transport)["code"],code)
        for value in (json.dumps({"reportId":6087050,"cellList":"[]"}),
                      {"cellList":json.dumps([{"password":"must-not-pass"}])}):
            item=response();item["reportObj"]=value
            with self.assertRaises(UpstreamSchemaError): probe(CONFIG,FakeTransport(item))

if __name__=="__main__": main()
