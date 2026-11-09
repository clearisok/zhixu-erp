from datetime import datetime, timedelta, timezone
import io
import json
from unittest import TestCase
from unittest.mock import patch
from ainuoke_bridge.capture_session import CaptureSession
from ainuoke_bridge.selected_source_once import collect_selected
from ainuoke_bridge.ainuoke_client import NetworkAinuokeError, UpstreamSchemaError
from ainuoke_bridge.catalog_checkpoint import validated_prefix
from ainuoke_bridge.session_worker import main
from selected_source_fixture import FakeSelectedTransport, mutate_rows
from test_selected_source_once import CONFIG


class CatalogCheckpointTests(TestCase):
    def data(self):
        return {**CONFIG,'mode':'catalog-discovery','contracts':[]}

    def test_failed_page_keeps_prefix_and_same_session_resumes_with_full_fresh_second_pass(self):
        saved=[]
        def fail(report,page,payload):
            if report==6086103 and page==3:
                raise NetworkAinuokeError('synthetic-timeout')
        owner=CaptureSession()
        failed=collect_selected(self.data(),FakeSelectedTransport(fail,total=150),session_owner=owner,
                                catalog_progress=lambda phase,page:saved.append((phase,page)))
        self.assertEqual(failed['result'],'failed')
        self.assertEqual([p['page'] for phase,p in saved],[1,2])
        self.assertFalse(owner.stopped)
        transport=FakeSelectedTransport(total=150)
        result=collect_selected(self.data(),transport,session_owner=owner,catalog_resume=[p for _,p in saved])
        self.assertEqual(result['result'],'complete')
        self.assertEqual(result['metrics']['logins'],0)
        self.assertEqual(result['metrics']['reportRequests'],5)
        self.assertEqual([c['body']['sqlCdtn']['pageIndex'] for c in transport.calls],[1,3,1,2,3])
        self.assertEqual(result['bundle']['discoveryBefore'][1]['fetchedAt'],saved[1][1]['fetchedAt'])
        self.assertEqual(len(result['bundle']['discoveryAfter']),3)

    def prefix(self):
        return collect_selected(self.data(),FakeSelectedTransport(total=101))['bundle']['discoveryBefore'][:2]

    def test_changed_first_page_discards_prefix_and_restarts_complete_directory(self):
        prefix=self.prefix()
        transport=FakeSelectedTransport(total=151)
        result=collect_selected(self.data(),transport,catalog_resume=prefix)
        self.assertEqual(result['result'],'complete')
        self.assertEqual(result['metrics']['reportRequests'],8)
        self.assertEqual(sum(len(p['rows']) for p in result['bundle']['discoveryBefore']),151)

    def test_expired_prefix_restarts_without_relabeling_source_time(self):
        prefix=self.prefix()
        old=(datetime.now(timezone.utc)-timedelta(minutes=6)).isoformat()
        for page in prefix:page['fetchedAt']=old
        self.assertEqual(validated_prefix(prefix),[])
        result=collect_selected(self.data(),FakeSelectedTransport(total=101),catalog_resume=prefix)
        self.assertEqual(result['metrics']['reportRequests'],6)
        self.assertNotEqual(result['bundle']['discoveryBefore'][1]['fetchedAt'],old)

    def test_bad_query_or_page_checkpoint_refused_before_login(self):
        for key,value in [('reportId','6087051'),('queryContext',{'insideOrderNo':'other'}),('page',2)]:
            prefix=self.prefix();prefix[0][key]=value;transport=FakeSelectedTransport()
            with self.assertRaises(UpstreamSchemaError):
                collect_selected(self.data(),transport,catalog_resume=prefix)
            self.assertEqual(transport.calls,[])

    def test_directory_missing_optional_fields_is_still_complete(self):
        def change(report,page,payload):
            if report==6086103:
                mutate_rows(payload,lambda rows:[row.pop(key,None) for row in rows for key in ['InsideOrderNo','GoodsDesc','Status','Num']])
        result=collect_selected(self.data(),FakeSelectedTransport(change))
        self.assertEqual(result['result'],'complete')
        self.assertEqual(len(result['bundle']['discoveryAfter'][0]['rows']),3)

    def test_private_ndjson_progress_and_two_captures_share_owner_without_secret_output(self):
        data={**self.data(),'catalogProgress':True,'catalogResume':[]}
        stdin=type('Input',(),{'buffer':io.BytesIO((json.dumps(data)+'\n'+json.dumps(data)+'\n').encode())})()
        output=io.StringIO()
        with patch('sys.stdin',stdin),patch('sys.stdout',output),patch('ainuoke_bridge.selected_source_once.ProtectedTransport',return_value=FakeSelectedTransport()):
            self.assertEqual(main(),0)
        frames=[json.loads(line) for line in output.getvalue().splitlines()]
        results=[f for f in frames if f['schemaVersion']=='ainuoke-session-diagnostics.v1']
        self.assertEqual([f['capture']['metrics']['logins'] for f in results],[1,0])
        self.assertEqual(len([f for f in frames if f['schemaVersion']=='ainuoke-catalog-page.v1']),4)
        self.assertNotIn(CONFIG['password'],output.getvalue())
        self.assertNotIn('synthetic-token-value',output.getvalue())
