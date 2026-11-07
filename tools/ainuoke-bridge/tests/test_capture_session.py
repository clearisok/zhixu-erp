import json
from unittest import TestCase
from ainuoke_bridge.capture_session import CaptureSession
from ainuoke_bridge.selected_source_once import collect_selected
from ainuoke_bridge.login_evidence import login_details
from selected_source_fixture import FakeSelectedTransport
from test_selected_source_once import CONFIG


class CaptureSessionTests(TestCase):
    def capture(self, owner, transport, contract='SYN-SALES-1'):
        return collect_selected({**CONFIG, 'mode':'catalog-contracts', 'contracts':[contract]}, transport, session_owner=owner)

    def test_two_orders_share_one_login_and_preserve_separate_bundles(self):
        owner, transport = CaptureSession(), FakeSelectedTransport()
        first = self.capture(owner, transport)
        second = self.capture(owner, transport, 'SYN-SALES-2')
        self.assertEqual([first['result'], second['result']], ['complete', 'complete'])
        self.assertEqual([first['metrics']['logins'], second['metrics']['logins']], [1, 0])
        self.assertEqual(sum(c['method']=='GET' for c in transport.calls), 1)
        self.assertEqual(set(second['bundle']['materials']), {'SYN-SALES-2'})
        self.assertNotIn('synthetic-token-value', json.dumps(second))

    def test_explicit_expiry_renews_once_and_retries_same_page(self):
        owner = CaptureSession()
        self.capture(owner, FakeSelectedTransport())
        expired = [False]
        def mutate(report, page, payload):
            if report and not expired[0]:
                expired[0] = True
                payload.clear()
                payload.update(code='token_expired')
        transport = FakeSelectedTransport(mutate)
        result = self.capture(owner, transport, 'SYN-SALES-2')
        self.assertEqual(result['result'], 'complete')
        self.assertEqual(result['metrics']['logins'], 1)
        self.assertEqual(result['metrics']['authRenewals'], 1)
        self.assertEqual(transport.calls[0]['body'], transport.calls[2]['body'])

    def test_rejected_renewal_stops_owner_without_next_login(self):
        owner = CaptureSession()
        self.capture(owner, FakeSelectedTransport())
        def mutate(report, page, payload):
            payload.clear()
            payload.update({'code':'token_expired'} if report else {'data':{'isOk':False,'text1':'unknown denial'}})
        transport = FakeSelectedTransport(mutate)
        result = self.capture(owner, transport)
        self.assertEqual(result['code'], 'invalid_credential')
        self.assertTrue(owner.stopped)
        count = len(transport.calls)
        with self.assertRaises(ValueError):
            self.capture(owner, transport)
        self.assertEqual(len(transport.calls), count)

    def test_identity_change_refused_before_request(self):
        owner, transport = CaptureSession(), FakeSelectedTransport()
        self.capture(owner, transport)
        count = len(transport.calls)
        with self.assertRaises(ValueError):
            collect_selected({**CONFIG,'username':'different','mode':'catalog-contracts'},transport,session_owner=owner)
        self.assertEqual(len(transport.calls),count)

    def test_permission_refusal_does_not_trigger_reauthentication(self):
        owner = CaptureSession()
        self.capture(owner, FakeSelectedTransport())
        def mutate(report, page, payload):
            if report:
                payload.clear()
                payload.update(code=403)
        transport = FakeSelectedTransport(mutate)
        result = self.capture(owner, transport)
        self.assertEqual(result['result'], 'failed')
        self.assertEqual(result['metrics']['logins'], 0)
        self.assertTrue(owner.stopped)

    def test_diagnostic_redacts_secrets_but_keeps_business_message(self):
        details = login_details({'data':{'isOk':False,'code':-2,'text1':'用户已登录','message':'password=secret token=abcd','jwtToken':'abcd'}}, {'password':'secret','userName':'user'})
        self.assertEqual(details['text1'],'用户已登录')
        self.assertEqual(details['businessCode'],'-2')
        self.assertNotIn('secret',json.dumps(details))
        self.assertNotIn('abcd',json.dumps(details))
        details = login_details({'data':{'isOk':False,'errorMsg':'账号已锁定'}}, {})
        self.assertEqual(details['errorMsg'],'账号已锁定')
