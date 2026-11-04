import io
import json
import socket
from unittest import TestCase
from unittest.mock import patch
from urllib.error import HTTPError, URLError
from ainuoke_bridge.ainuoke_client import NetworkAinuokeError
from ainuoke_bridge.server_source import ProtectedTransport
from ainuoke_bridge.request_diagnostics import DiagnosticTransport, run_diagnostic, main
from ainuoke_bridge.selected_source_once import collect_selected
from selected_source_fixture import FakeSelectedTransport

SECRET='synthetic-password-token-cookie-and-url'
CONFIG={'baseUrl':'https://example.invalid','username':'synthetic','password':SECRET,
        'contracts':['SYN-SALES-1'],'mode':'catalog-contracts'}
REQUEST={'url':'https://example.invalid/'+SECRET,'method':'POST',
         'body':{'reportId':6087050,'sqlCdtn':{'pageIndex':2,'conditionList':[SECRET]}},
         'headers':{'Authorization':SECRET,'Cookie':SECRET},'timeout':15}

class RequestDiagnosticsTests(TestCase):
    def test_catalogue_waits_45_seconds_without_changing_legacy_or_total_budget(self):
        for mode,contracts,expected in [('catalog-contracts',['SYN-SALES-1'],45),('catalog-discovery',[],45),('selected-bindings',['SYN-SALES-1','SYN-SALES-2'],15)]:
            transport=FakeSelectedTransport()
            result=collect_selected({**CONFIG,'mode':mode,'contracts':contracts},transport)
            self.assertEqual(result['result'],'complete')
            self.assertEqual(result['limits']['timeoutMs'],180000)
            self.assertTrue(all(call['timeout']==expected for call in transport.calls))
            self.assertEqual(result['metrics']['networkRetries'],0)
        calls=iter([0]+[179]*100)
        transport=FakeSelectedTransport()
        result=collect_selected(CONFIG,transport,clock=lambda:next(calls))
        self.assertEqual(result['result'],'complete')
        self.assertTrue(all(call['timeout']==1 for call in transport.calls))

    def test_http_status_and_report_page_are_preserved_without_sensitive_values(self):
        events=[]
        with patch('ainuoke_bridge.server_source.build_opener') as opener:
            opener.return_value.open.side_effect=HTTPError(REQUEST['url'],503,SECRET,{},None)
            traced=DiagnosticTransport(ProtectedTransport(),events)
            with self.assertRaises(NetworkAinuokeError) as raised:traced.request(**REQUEST)
        self.assertEqual(events[0]['reportId'],6087050)
        self.assertEqual(events[0]['page'],2)
        self.assertEqual(events[0]['outcome'],'http_error')
        self.assertEqual(events[0]['httpStatus'],503)
        self.assertNotIn(SECRET,json.dumps(events)+str(raised.exception))
        self.assertEqual(set(events[0]),{'kind','reportId','page','elapsedMs','outcome','httpStatus'})

    def test_timeout_dns_reset_and_refused_are_distinct_and_never_retried(self):
        cases=[(TimeoutError(SECRET),'timeout'),(URLError(TimeoutError(SECRET)),'timeout'),
               (URLError(socket.gaierror(1,SECRET)),'dns_error'),
               (ConnectionResetError(SECRET),'connection_reset'),(ConnectionRefusedError(SECRET),'connection_refused')]
        for error,category in cases:
            events=[]
            with self.subTest(category=category),patch('ainuoke_bridge.server_source.build_opener') as opener:
                opener.return_value.open.side_effect=error
                with self.assertRaises(NetworkAinuokeError):DiagnosticTransport(ProtectedTransport(),events).request(**REQUEST)
                self.assertEqual(opener.return_value.open.call_count,1)
            self.assertEqual(events[0]['outcome'],category)
            self.assertNotIn(SECRET,json.dumps(events))

    def test_enabled_diagnostics_preserve_normal_protocol_and_request_budget(self):
        plain=collect_selected(CONFIG,FakeSelectedTransport())
        events=[]
        observed=collect_selected(CONFIG,FakeSelectedTransport(),diagnostics=events)
        self.assertEqual(set(plain),set(observed))
        self.assertEqual(plain['metrics'],observed['metrics'])
        self.assertEqual(len(events),observed['metrics']['httpAttempts'])
        self.assertEqual(observed['metrics']['networkRetries'],0)
        self.assertNotIn(SECRET,json.dumps(events))

    def test_failure_event_identifies_exact_failing_report(self):
        def fail(report,page,payload):
            if report==6087050:
                error=NetworkAinuokeError(SECRET);error.transport_category='timeout';raise error
        with patch('ainuoke_bridge.selected_source_once.ProtectedTransport',return_value=FakeSelectedTransport(fail)):
            result=run_diagnostic(CONFIG)
        self.assertEqual(result['capture']['result'],'failed')
        self.assertEqual(result['capture']['code'],'source_unavailable')
        self.assertEqual(result['requests'][-1]['reportId'],6087050)
        self.assertEqual(result['requests'][-1]['outcome'],'timeout')
        self.assertNotIn(SECRET,json.dumps(result))

    def test_untrusted_attributes_and_body_fields_cannot_escape(self):
        class Failing:
            def request(self,**request):
                error=NetworkAinuokeError(SECRET);error.transport_category={'secret':SECRET};error.http_status=SECRET;raise error
        events=[]
        with self.assertRaises(NetworkAinuokeError):
            DiagnosticTransport(Failing(),events).request(**{**REQUEST,'body':{'reportId':SECRET,'sqlCdtn':{'pageIndex':SECRET}}})
        self.assertEqual(events[0]['outcome'],'network_error')
        self.assertIsNone(events[0]['reportId']);self.assertIsNone(events[0]['page']);self.assertIsNone(events[0]['httpStatus'])
        self.assertNotIn(SECRET,json.dumps(events))

    def test_invalid_scope_is_rejected_before_any_transport(self):
        with patch('ainuoke_bridge.selected_source_once.ProtectedTransport') as transport:
            with self.assertRaises(ValueError):run_diagnostic({**CONFIG,'mode':'bound-materials'})
            transport.assert_not_called()

    def test_cli_rejection_never_prints_input_or_exception(self):
        class Input:
            buffer=io.BytesIO(json.dumps({'password':SECRET}).encode())
        output=io.StringIO()
        with patch('sys.stdin',Input()),patch('sys.stdout',output),patch('sys.argv',['diagnostics']):
            self.assertEqual(main(),1)
        self.assertEqual(json.loads(output.getvalue()),{'error':'diagnostic_input_or_result_invalid'})
        self.assertNotIn(SECRET,output.getvalue())

    def test_diagnostic_event_limit_does_not_make_extra_request(self):
        events=[];transport=FakeSelectedTransport();trace=DiagnosticTransport(transport,events)
        trace.events.extend([{}]*81)
        with self.assertRaises(ValueError):trace.request(**REQUEST)
        self.assertEqual(transport.calls,[])
