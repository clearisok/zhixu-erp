import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {spawnSync,type spawn} from 'node:child_process';
import {resolve} from 'node:path';
import {createSessionCollector} from './session-collector.js';
import {selectedConfig} from '../integration/selected-source-fixture.js';
import {validateCatalogDiagnostic} from './sync-diagnostics.js';

test('persistent Python protocol validates two order captures with one real SDK login',async()=>{
 const script=`
import sys
from unittest.mock import patch
sys.path.insert(0,'tests')
from selected_source_fixture import FakeSelectedTransport
from ainuoke_bridge.session_worker import main
with patch('ainuoke_bridge.selected_source_once.ProtectedTransport',return_value=FakeSelectedTransport()):
    sys.exit(main())
`;
 const inputs=['SYN-SALES-1','SYN-SALES-2'].map(c=>JSON.stringify({baseUrl:selectedConfig.baseUrl,username:selectedConfig.username,password:selectedConfig.password,mode:'catalog-contracts',contracts:[c]}));
 const child=spawnSync(process.platform==='win32'?'python':'python3',['-c',script],{cwd:resolve('tools/ainuoke-bridge'),input:inputs.join('\n')+'\n',encoding:'utf8',timeout:10000,windowsHide:true,env:{...process.env,PYTHONUTF8:'1'}});
 assert.equal(child.status,0,child.stderr);
 const values=child.stdout.trim().split('\n').map(v=>JSON.parse(v));assert.equal(values.length,2);
 const results=[];
 for(let i=0;i<values.length;i++)results.push(await validateCatalogDiagnostic(values[i],selectedConfig,{mode:'catalog-contracts',contracts:[`SYN-SALES-${i+1}`]},Date.now()));
 assert.deepEqual(results.map(v=>v.capture.metrics.logins),[1,0]);
 assert.deepEqual(results.map(v=>v.capture.result),['complete','complete']);
 assert.equal(child.stdout.includes(selectedConfig.password),false);
 assert.equal(child.stdout.includes('synthetic-token-value'),false);
});

const page=()=>({schemaVersion:'ainuoke-direct-read.v2',reportId:'6086103',page:1,pageSize:50,total:1,
 rows:[{sourceRowIdentity:'synthetic-row',values:{id:'1',BillNo:'SYN-1'}}],queryContext:{},fetchedAt:new Date().toISOString(),snapshotHash:'a'.repeat(64)});
const final={schemaVersion:'ainuoke-session-diagnostics.v1',capture:{synthetic:true},requests:[]};
function fixture(){
 class Child extends EventEmitter{
  stdin=new PassThrough();stdout=new PassThrough();stderr=new PassThrough();killed=false;
  kill(){this.killed=true;this.emit('close',0);return true;}
 }
 const child=new Child();
 const start=(()=>child) as unknown as typeof spawn;
 return {child,owner:createSessionCollector(start)};
}
test('private IPC accepts combined/split page frames and waits for durable callbacks before resolving',async()=>{
 const {owner,child}=fixture(),saved:string[]=[];
 const result=owner.collect(selectedConfig,{mode:'catalog-discovery',contracts:[]},{onPage:async(phase)=>{await Promise.resolve();saved.push(phase);}});
 const frames=['before','after'].map(phase=>JSON.stringify({schemaVersion:'ainuoke-catalog-page.v1',phase,page:page()})).concat(JSON.stringify(final)).join('\n')+'\n';
 child.stdout.write(frames.slice(0,23));child.stdout.write(frames.slice(23));
 assert.deepEqual(await result,final);assert.deepEqual(saved,['before','after']);owner.close();
});
test('malformed or secret-reflecting progress stops owner before persistence',async()=>{
 for(const mutate of [(p:ReturnType<typeof page>)=>{p.reportId='6087051';},(p:ReturnType<typeof page>)=>{p.rows[0].values.BillNo=selectedConfig.password;}]){
  const {owner,child}=fixture();let saved=0;
  const result=owner.collect(selectedConfig,{mode:'catalog-discovery',contracts:[]},{onPage:async()=>{saved++;}});
  const p=page();mutate(p);
  child.stdout.write(JSON.stringify({schemaVersion:'ainuoke-catalog-page.v1',phase:'before',page:p})+'\n');
  await assert.rejects(result,/source_invalid/);assert.equal(saved,0);assert.equal(owner.available(),false);assert.equal(child.killed,true);
 }
});
test('checkpoint database failure rejects capture and prevents reuse',async()=>{
 const {owner,child}=fixture();
 const result=owner.collect(selectedConfig,{mode:'catalog-discovery',contracts:[]},{onPage:async()=>{throw Error('synthetic database interruption');}});
 child.stdout.write(JSON.stringify({schemaVersion:'ainuoke-catalog-page.v1',phase:'before',page:page()})+'\n'+JSON.stringify(final)+'\n');
 await assert.rejects(result,/catalog_checkpoint_failed/);assert.equal(owner.available(),false);
});
test('final authentication refusal can be inspected even when Python immediately closes owner',async()=>{
 const {owner,child}=fixture(),result=owner.collect(selectedConfig,{mode:'catalog-contracts',contracts:['SYN-1']});
 child.stdout.write(JSON.stringify(final)+'\n');child.emit('close',0);
 assert.deepEqual(await result,final);assert.equal(owner.available(),false);
});
