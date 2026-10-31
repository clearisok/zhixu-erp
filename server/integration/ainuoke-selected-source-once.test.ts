import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,unlinkSync,rmdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,join,delimiter} from 'node:path';
import {collectSelectedSourceOnce,validateSelectedSourceOnce,SELECTED_SOURCE_LIMITS,BOUND_MATERIAL_LIMITS,type SelectedSourceMetrics} from '../ainuoke-source/selected-source-once.js';
import {parseSourceArguments} from '../ainuoke-source/cli.js';
import type {AdditionBundle} from '../ainuoke-source/additions.js';
import {selectedConfig,selectedContracts,selectedWorkerFixture} from './selected-source-fixture.js';

type Envelope=Record<string,unknown>&{bundle:AdditionBundle;metrics:SelectedSourceMetrics;limits:Record<string,number>};
const request={mode:'selected-bindings' as const,contracts:selectedContracts};
const envelope=()=>selectedWorkerFixture('selected-bindings') as Envelope;

test('bounded material protocol covers explicit 1, 3 and 25 contracts without changing old v1',async()=>{
  for(const count of [1,3,25]){
    const contracts=Array.from({length:count},(_,i)=>`SYN-SALES-${i+1}`).sort();
    const targets=contracts.map((salesContractNo,i)=>({id:`target-${i}`,version:1,salesContractNo,
      styleNo:`SYN-STYLE-${salesContractNo.split('-').at(-1)}`,insideOrderNo:`SYN-IN-${salesContractNo.split('-').at(-1)}`}));
    const input=selectedWorkerFixture('bound-materials','',contracts) as Envelope;
    assert.deepEqual(input.limits,BOUND_MATERIAL_LIMITS);
    const result=await validateSelectedSourceOnce(input,selectedConfig,{mode:'bound-materials',targets});
    assert.ok(result.result==='complete'&&result.mode==='bound-materials');
    assert.equal(result.validated.rows.length,count);assert.equal(result.metrics.reportRequests,count+2);
    assert.equal(input.schemaVersion,'ainuoke-bound-materials-once.v1');
    await assert.rejects(validateSelectedSourceOnce({...input,schemaVersion:'ainuoke-selected-source-once.v1'},selectedConfig,{mode:'bound-materials',targets}));
    await assert.rejects(validateSelectedSourceOnce(input,selectedConfig,{mode:'selected-materials',targets}));
  }
  assert.equal(SELECTED_SOURCE_LIMITS.contracts,2);assert.equal(BOUND_MATERIAL_LIMITS.reportRequests,80);
});

test('bounded material rejects foreign rows, missing scope and enlarged request budget',async()=>{
  const contracts=['SYN-SALES-1','SYN-SALES-2','SYN-SALES-3'];
  const targets=contracts.map((salesContractNo,i)=>({id:`target-${i}`,version:1,salesContractNo,styleNo:`SYN-STYLE-${i+1}`,insideOrderNo:`SYN-IN-${i+1}`}));
  const request={mode:'bound-materials' as const,targets};
  const original=selectedWorkerFixture('bound-materials','',contracts) as Envelope;
  for(const delta of [{selectedContracts:contracts.slice(0,2)},{limits:{...BOUND_MATERIAL_LIMITS,reportRequests:100}},
    {metrics:{...original.metrics,networkRetries:1}},{mode:'selected-bindings'}])
    await assert.rejects(validateSelectedSourceOnce({...original,...delta},selectedConfig,request));
  const mixed=selectedWorkerFixture('bound-materials',"if report == 6087050: mutate_rows(payload, lambda rows: rows[0].update({'ExpContractNo': 'SYN-SALES-99'}))",contracts);
  await assert.rejects(validateSelectedSourceOnce(mixed,selectedConfig,request),/selected_source_row_scope_mismatch/);
  for(const bad of [[],[targets[0],targets[0]],Array.from({length:26},(_,i)=>({...targets[0],salesContractNo:`SYN-${i}`}))])
    await assert.rejects(collectSelectedSourceOnce(selectedConfig,{mode:'bound-materials',targets:bad},{python:'unavailable'}),/selected_source_scope_invalid/);
});

test('bounded CLI requires explicit contracts and target, and cannot enable a scheduler',()=>{
  const args=['--execute-bounded=synthetic-selected-once','--config=/private/source.json','--expected-target='+'a'.repeat(64)];
  assert.throws(()=>parseSourceArguments(args));
  assert.equal(parseSourceArguments([...args,'--contracts=SYN-SALES-1,SYN-SALES-2,SYN-SALES-3']).action,'execute-bounded');
  assert.throws(()=>parseSourceArguments([...args,'--contracts=SYN-SALES-1','--interval-ms=300000']));
});

test('actual Python stdout uses the same fixed limits and formal selected-binding mapper',async()=>{
  const input=envelope();assert.deepEqual(input.limits,SELECTED_SOURCE_LIMITS);
  const result=await validateSelectedSourceOnce(input,selectedConfig,request);
  assert.equal(result.result,'complete');
  if(result.result==='complete'&&result.mode==='selected-bindings'){
    assert.deepEqual(result.preview.selectedContracts,selectedContracts);assert.equal(result.preview.visibleContracts,3);
    assert.deepEqual(result.preview.preview.candidates.map(c=>c.source.salesContractNo).sort(),selectedContracts);
    assert.deepEqual(result.metrics,{logins:1,reportRequests:4,httpAttempts:5,networkRetries:0,authRenewals:0});
  }
});

test('actual failed worker stdout retains accurate counters without a partial business bundle',async()=>{
  const input=selectedWorkerFixture('selected-bindings',"if report == 6087105: raise __import__('ainuoke_bridge.ainuoke_client', fromlist=['AuthExpiredError']).AuthExpiredError('private')");
  const result=await validateSelectedSourceOnce(input,selectedConfig,request);
  assert.deepEqual(result,{result:'failed',code:'auth_expired',metrics:{logins:1,reportRequests:2,httpAttempts:3,networkRetries:0,authRenewals:0}});
});

test('real parent subprocess accepts validated success and closed nonzero failure without retry',async()=>{
  const directory=mkdtempSync(join(tmpdir(),'zhixu-selected-source-test-'));
  const site=join(directory,'sitecustomize.py'),previous=process.env.PYTHONPATH;
  const fixturePath=resolve('tools/ainuoke-bridge/tests').replaceAll('\\','/');
  try {
    process.env.PYTHONPATH=[directory,resolve('tools/ainuoke-bridge'),...(previous?[previous]:[])].join(delimiter);
    for(const mode of ['selected-bindings','bound-materials'] as const)for(const fail of [false,true]) {
      writeFileSync(site,`import sys\nsys.path.insert(0, ${JSON.stringify(fixturePath)})\nfrom selected_source_fixture import FakeSelectedTransport\nimport ainuoke_bridge.selected_source_once as module\nfrom ainuoke_bridge.ainuoke_client import AuthExpiredError\ndef change(report, page, payload):\n    if ${fail?'True':'False'} and report == ${mode==='selected-bindings'?6087105:6087050}: raise AuthExpiredError('synthetic')\nmodule.ProtectedTransport = lambda *args: FakeSelectedTransport(change)\n`,{mode:0o600});
      const current=mode==='selected-bindings'?request:{mode,targets:['SYN-SALES-1','SYN-SALES-2','SYN-SALES-3'].map((salesContractNo,i)=>({id:`target-${i}`,version:1,salesContractNo,styleNo:`SYN-STYLE-${i+1}`,insideOrderNo:`SYN-IN-${i+1}`}))};
      const result=await collectSelectedSourceOnce(selectedConfig,current,{timeoutMs:10000});
      assert.equal(result.result,fail?'failed':'complete');
      assert.equal(result.metrics.httpAttempts,fail?3:mode==='selected-bindings'?5:6);
    }
  } finally {
    if(previous===undefined)delete process.env.PYTHONPATH;else process.env.PYTHONPATH=previous;
    unlinkSync(site);rmdirSync(directory);
  }
});

test('wrong account, selection, mode, budget and secret reflections cannot reuse a result',async()=>{
  const original=envelope();
  for(const delta of [{sourceFingerprint:'a'.repeat(64)},{selectedContracts:['SYN-SALES-1','SYN-SALES-3']},
    {mode:'selected-materials'},{limits:{...original.limits,logins:2}},{other:'unknown'},
    {code:selectedConfig.password}])await assert.rejects(validateSelectedSourceOnce({...original,...delta},selectedConfig,request));
  await assert.rejects(validateSelectedSourceOnce(original,{...selectedConfig,username:'other'},request));
});

test('escaped secret values are rejected as decoded data rather than serialized substrings',async()=>{
  const password='Synthetic-"quote\\slash-secret',config={...selectedConfig,password},input=envelope();
  input.bundle.colors[selectedContracts[0]][0].rows[0].values.CnColor=password;
  await assert.rejects(validateSelectedSourceOnce(input,config,request),{name:'SourceError'});
});

test('forged counts, retry flags and complete metrics cannot underreport collected pages',async()=>{
  const original=envelope();
  for(const delta of [{reportRequests:3,httpAttempts:4},{authRenewals:1},{networkRetries:1},{logins:2,httpAttempts:6},
    {reportRequests:-1},{reportRequests:81,httpAttempts:82},{logins:0,httpAttempts:4},{httpAttempts:4}])
    await assert.rejects(validateSelectedSourceOnce({...original,metrics:{...original.metrics,...delta}},selectedConfig,request));
});

test('paging, stale or changed Discovery and mixed colors fail existing domain validation',async()=>{
  const original=envelope();
  const changes:Array<(e:Envelope)=>void>=[
    e=>{e.bundle.discoveryBefore[0].total=1001;},
    e=>{e.bundle.discoveryBefore[0].rows.pop();},
    e=>{e.bundle.discoveryBefore[0].pageSize=100;},
    e=>{e.bundle.discoveryAfter[0].rows[0].values.InsideOrderNo='CHANGED';},
    e=>{for(const pages of [e.bundle.discoveryBefore,e.bundle.discoveryAfter,...Object.values(e.bundle.colors)])pages[0].fetchedAt='2000-01-01T00:00:00.000Z';},
    e=>{e.bundle.colors[selectedContracts[0]][0].rows[0].values.BillNo='SYN-SALES-3';},
    e=>{e.bundle.colors['SYN-SALES-3']=e.bundle.colors[selectedContracts[0]];},
    e=>{e.bundle.discoveryBefore[0].rows[0].values.Num=null;},
  ];
  for(const [index,change] of changes.entries()){const altered=structuredClone(original);change(altered);
    await assert.rejects(validateSelectedSourceOnce(altered,selectedConfig,request),{name:'SourceError'},`mutation ${index}`);}
});

test('missing units and unknown purchase quantity stay unknown; no specification inference',async()=>{
  const input=selectedWorkerFixture('selected-materials',"if report == 6087050: mutate_rows(payload, lambda rows: rows[0].update({'QtyUnit': '', 'cgnum': None}))");
  const targets=selectedContracts.map((salesContractNo,i)=>({id:`00000000-0000-4000-8000-00000000000${i+1}`,version:1,
    salesContractNo,styleNo:`SYN-STYLE-${i+1}`,insideOrderNo:`SYN-IN-${i+1}`}));
  const result=await validateSelectedSourceOnce(input,selectedConfig,{mode:'selected-materials',targets});
  assert.equal(result.result,'complete');
  if(result.result==='complete'&&result.mode==='selected-materials'){
    const values=result.bundle.materials[selectedContracts[0]][0].rows[0].values;
    assert.equal(values.cgnum,null);assert.equal(values.QtyUnit,'');assert.equal(values.TotalNum,'115.50');
    const wrong=structuredClone(targets);wrong[1].salesContractNo='SYN-SALES-3';
    await assert.rejects(validateSelectedSourceOnce(input,selectedConfig,{mode:'selected-materials',targets:wrong}));
  }
});

test('malformed failure cannot retain partial records or pretend a known zero-attempt result',async()=>{
  const original=envelope();
  for(const delta of [{result:'failed',code:'source_unavailable'},
    {result:'failed',code:'raw-secret-error',bundle:null},
    {result:'failed',code:'auth_expired',bundle:null,metrics:{...original.metrics,logins:0}},
    {result:'complete',code:'not-null'}])await assert.rejects(validateSelectedSourceOnce({...original,...delta},selectedConfig,request));
});

test('invalid scope and over-budget timeout refuse before starting the private subprocess',async()=>{
  const options={python:'intentionally-unavailable-python'};
  for(const contracts of [[],['SYN-SALES-1'],['SYN-SALES-1','SYN-SALES-1'],['SYN-SALES-1',"SYN' OR 1=1"]])
    await assert.rejects(collectSelectedSourceOnce(selectedConfig,{mode:'selected-bindings',contracts},options),/selected_source_scope_invalid/);
  for(const timeoutMs of [0,180001,NaN])await assert.rejects(collectSelectedSourceOnce(selectedConfig,request,{...options,timeoutMs}),/selected_source_timeout_invalid/);
  await assert.rejects(collectSelectedSourceOnce({...selectedConfig,baseUrl:'http://127.0.0.1'},request,options),/protected_source_transport_required/);
});
