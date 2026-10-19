import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { linkSync, chmodSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { paymentOperatorArguments,parsePaymentOperatorJob } from '../ainuoke-source/payment-operator-cli.js';
import { readPaymentPrivateFile,readPaymentPrivateJson,readPaymentCredential } from '../ainuoke-source/payment-private-files.js';
import { collectionConfig,collectionSelection } from './payment-collection-fixture.js';
import { paymentPrivateFixture } from './payment-operator-private-fixture.js';
const matches=(code:string)=>(e:unknown)=>(e as {code?:string}).code===code;

test('operator CLI accepts one explicit action, no implicit writes, secret argv or retry/migration mode',()=>{
  const f=paymentPrivateFixture();try{
    const args=['--plan-collection=6086941','--job='+join(f.directory,'job.json'),'--expected-job='+'a'.repeat(64),
      '--private-output='+f.directory,'--request-id='+randomUUID(),'--expires-at='+new Date(Date.now()+60000).toISOString()];
    assert.equal(paymentOperatorArguments(args).action,'plan-collection');
    for(const invalid of [[],[...args,'--plan-targets=enable'],[...args,'--execute=I_CONFIRM_EXACT_SCOPE'],[...args,'--password=secret'],
      [...args,'--schedule=true'],[...args,'--migrate=true'],[...args,args[1]],args.map(x=>x.startsWith('--plan-collection')?'--collect-once=6086941':x),
      args.map(x=>x.startsWith('--plan-collection')?'--plan-collection=6087050':x)])
      assert.throws(()=>paymentOperatorArguments(invalid),matches('payment_operator_explicit_action_required'));
  }finally{f.close();}
});

test('job has exact two-contract metadata and never accepts source password or operator-supplied SQL',()=>{
  const selection=collectionSelection(),{password:_unused,operatorUsername,...source}=collectionConfig;void _unused;
  const job={schemaVersion:'ainuoke-payment-operator-job.v1',databaseUrl:'postgresql://synthetic:synthetic@127.0.0.1:5432/synthetic',
    operatorUsername,source,selection,targets:selection.targets.map(t=>({alias:t.alias,salesOrderId:randomUUID()})),verification:null};
  assert.equal(parsePaymentOperatorJob(job).request.targets.length,2);
  for(const altered of [{...job,source:{...source,password:'forbidden'}},{...job,databaseUrl:'file:///tmp/private'},
    {...job,sql:'SELECT *'},{...job,targets:[job.targets[0],job.targets[0]]},{...job,selection:{...selection,targets:selection.targets.slice(0,1)}}])
    assert.throws(()=>parsePaymentOperatorJob(altered));
});

test('protected UTF8 files bind exact bytes, ownership, size and hardlink identity; credential format does not leak',()=>{
  const f=paymentPrivateFixture();try{
    const json=f.write('synthetic.json',JSON.stringify({label:'合成报告'}));
    assert.deepEqual(readPaymentPrivateJson(json.path,json.sha256,1024),{label:'合成报告'});
    assert.throws(()=>readPaymentPrivateJson(json.path,'0'.repeat(64),1024),matches('payment_operator_private_file_invalid'));
    assert.throws(()=>readPaymentPrivateFile(json.path,2),matches('payment_operator_private_file_invalid'));
    const bad=f.write('bad-utf8.bin',Buffer.from([0xff,0xfe,0x61]));
    assert.throws(()=>readPaymentPrivateFile(bad.path,20),matches('payment_operator_private_file_invalid'));
    const key=f.write('synthetic-key.txt','账号：合成账号\r\n密码：Synthetic-Private-Only\r\n');
    assert.equal(readPaymentCredential(key.path,'合成账号'),'Synthetic-Private-Only');
    assert.throws(()=>readPaymentCredential(key.path,'another'),matches('payment_operator_private_file_invalid'));
    const extra=f.write('extra-key.txt','账号：合成账号\n密码：synthetic\n\n');
    assert.throws(()=>readPaymentCredential(extra.path,'合成账号'),matches('payment_operator_private_file_invalid'));
    const linked=f.write('linked.json','{}');linkSync(linked.path,join(f.directory,'second-link.json'));
    assert.throws(()=>readPaymentPrivateFile(linked.path,20),matches('payment_operator_private_file_invalid'));
    const broad=f.write('broad.json','{}');
    if(process.platform==='win32')execFileSync('icacls',[broad.path,'/grant','*S-1-1-0:R'],{stdio:'ignore',windowsHide:true});
    else chmodSync(broad.path,0o644);
    assert.throws(()=>readPaymentPrivateFile(broad.path,20),matches('payment_operator_private_file_invalid'));
  }finally{f.close();}
});
