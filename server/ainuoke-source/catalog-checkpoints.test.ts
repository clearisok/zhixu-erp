import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import {selectedConfig} from '../integration/selected-source-fixture.js';
import {validateCatalogDiagnostic} from './sync-diagnostics.js';
import type {CatalogPage} from './catalog-checkpoints.js';
import {hasCompleteEmptyColorEvidence} from './additions.js';
import type {AinuokeReportSnapshot,AinuokeSalesContractQuery} from '../../features/ainuoke-api/model/ainuoke-api.js';

test('blank colour evidence requires complete exact-contract pages and never treats explicit zero as absent',()=>{
 const page={schemaVersion:'ainuoke-direct-read.v2',reportId:'6087105',page:1,pageSize:50,total:1,
  queryContext:{salesContractNo:'SYN-SALES-4'},fetchedAt:new Date().toISOString(),snapshotHash:'a'.repeat(64),
  rows:[{sourceRowIdentity:'synthetic-blank',values:{BillNo:'SYN-SALES-4',CnColor:'',SizeNum:'',Size1:''}}]} satisfies AinuokeReportSnapshot<AinuokeSalesContractQuery>;
 assert.equal(hasCompleteEmptyColorEvidence([page],'SYN-SALES-4'),true);
 assert.equal(hasCompleteEmptyColorEvidence([{...page,total:51}],'SYN-SALES-4'),false);
 assert.equal(hasCompleteEmptyColorEvidence([page],'OTHER-CONTRACT'),false);
 assert.equal(hasCompleteEmptyColorEvidence([{...page,rows:[{...page.rows[0],values:{...page.rows[0].values,Size1:0}}]}],'SYN-SALES-4'),false);
});

test('real SDK resumed directory validates only with the exact trusted prefix and actual request count',async()=>{
 const script=`
import sys,json
sys.path.insert(0,'tests')
from ainuoke_bridge.capture_session import CaptureSession
from ainuoke_bridge.selected_source_once import collect_selected
from ainuoke_bridge.ainuoke_client import NetworkAinuokeError
from selected_source_fixture import FakeSelectedTransport
data=json.load(sys.stdin)
owner=CaptureSession();prefix=[]
def fail(report,page,payload):
    if report==6086103 and page==3:raise NetworkAinuokeError('synthetic timeout')
collect_selected(data,FakeSelectedTransport(fail,total=150),session_owner=owner,catalog_progress=lambda phase,page:prefix.append(page))
events=[]
capture=collect_selected(data,FakeSelectedTransport(total=150),session_owner=owner,diagnostics=events,catalog_resume=prefix)
print(json.dumps({'prefix':prefix,'wrapped':{'schemaVersion':'ainuoke-session-diagnostics.v1','capture':capture,'requests':events}}))
`;
 const result=spawnSync(process.platform==='win32'?'python':'python3',['-c',script],{cwd:resolve('tools/ainuoke-bridge'),encoding:'utf8',windowsHide:true,timeout:10000,maxBuffer:32*1024*1024,
  env:{...process.env,PYTHONUTF8:'1',PYTHONDONTWRITEBYTECODE:'1'},input:JSON.stringify({baseUrl:selectedConfig.baseUrl,username:selectedConfig.username,password:selectedConfig.password,mode:'catalog-discovery',contracts:[]})});
 assert.equal(result.status,0,result.stderr);
 const data=JSON.parse(result.stdout) as {prefix:CatalogPage[];wrapped:unknown};
 const request={mode:'catalog-discovery' as const,contracts:[] as []};
 const checked=await validateCatalogDiagnostic(data.wrapped,selectedConfig,request,Date.now(),data.prefix);
 assert.equal(checked.capture.result,'complete');assert.equal(checked.capture.metrics.logins,0);assert.equal(checked.capture.metrics.reportRequests,5);
 await assert.rejects(validateCatalogDiagnostic(data.wrapped,selectedConfig,request,Date.now()),/selected_source_metrics_invalid/);
 const changed=structuredClone(data.prefix);changed[1].rows[0].values.BillNo='DIFFERENT';
 await assert.rejects(validateCatalogDiagnostic(data.wrapped,selectedConfig,request,Date.now(),changed),/catalog_checkpoint_changed/);
});
