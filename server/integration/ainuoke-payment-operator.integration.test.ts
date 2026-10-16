import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import pg from 'pg';
import { startDisposablePostgres } from './postgres-container.js';
import { runMigrations } from '../db/migration-runner.js';
import { synchronizePermissionCatalog } from '../auth/permissions.js';
import { bootstrapAdmin } from '../auth/bootstrap.js';
import { loadExistingBootstrapActor } from '../sales-orders/bootstrap-runner.js';
import { createAinuokeSalesOrder } from '../sales-orders/service.js';
import { hash } from '../ainuoke-source/contract.js';
import { validateContractEvidence } from '../ainuoke-source/payment-request-contract-probe.js';
import { verifyPaymentTargetEvidence } from '../ainuoke-source/payment-target-verification.js';
import { planPaymentTargets, applyPaymentTargets } from '../ainuoke-source/payment-targets.js';
import { planPaymentOperatorCollection, collectPaymentOnce } from '../ainuoke-source/payment-operator-collection.js';
import { readPaymentOperatorCommand } from '../ainuoke-source/payment-operator-command-store.js';
import { createPaymentSnapshotReader } from '../ainuoke-source/payment-request-store.js';
import { collectionConfig, collectionSelection, collectionEvidence } from './payment-collection-fixture.js';

const matches = (code:string) => (e:unknown) => (e as {code?:string}).code === code;
test('payment operator: owned PG, target lifecycle and durable one-shot commands', {timeout:180000}, async t => {
  const db=await startDisposablePostgres(); assert.match(db.containerName,/^zhixu-pg-it-[a-f0-9]{12}$/u);
  const pool=new pg.Pool({connectionString:await db.createDatabase('payment_operator'),max:4});
  t.after(async()=>{await pool.end();await db.stop();});
  await runMigrations(pool,resolve('database/migrations')); await synchronizePermissionCatalog(pool);
  await bootstrapAdmin(pool,{username:collectionConfig.operatorUsername,displayName:'合成操作管理员',password:'Synthetic-Operator-2026'});
  const actor=await loadExistingBootstrapActor(pool,collectionConfig.operatorUsername);
  await pool.query('INSERT INTO ainuoke_source_profiles(source_key,account_fingerprint) VALUES($1,$2)',[collectionConfig.sourceKey,collectionSelection().sourceFingerprint]);
  let sequence=0,clock=Date.now(); const now=()=>clock;
  const permit=()=>({requestId:randomUUID(),expiresAt:new Date(clock+60000).toISOString()});
  const permitOf=(p:{requestId:string;expiresAt:string;scopeHash:string})=>({requestId:p.requestId,expiresAt:p.expiresAt,scopeHash:p.scopeHash});
  async function pair(){
    const selection=collectionSelection(String(++sequence)),targets=[];
    for(const target of selection.targets){
      const id=(await createAinuokeSalesOrder(pool,actor,{source:{sourceId:target.salesContractNo,sourceRowIdentity:target.salesContractNo,
        salesContractNo:target.salesContractNo,insideOrderNo:'SYN-FACTORY-'+sequence,lifecycleStatusRaw:'生效',contractDate:'2026-10-01',
        contractDeliveryDate:'2026-11-01',styleNo:'SYN-STYLE',companyNameSnapshot:'合成公司',customerNameSnapshot:'合成客户',
        brandNameSnapshot:'合成品牌',quantity:100,sourceHash:hash(target),fetchedAt:new Date(clock).toISOString()},colors:[]})).salesOrder.id;
      targets.push({alias:target.alias,salesOrderId:id});
    }
    const request={config:{...collectionConfig},selection,targets};
    const evidence=collectionEvidence(selection,clock-60000,12);
    const raw={...validateContractEvidence(evidence,request.config,selection,clock).privateReport,toolingCommit:'a'.repeat(40)};
    return {request,proof:verifyPaymentTargetEvidence(raw,hash(raw),request,clock)};
  }
  async function enable(p:Awaited<ReturnType<typeof pair>>){
    const plan=await planPaymentTargets(pool,actor,p.request,'enable',p.proof,permit(),clock);
    const result=await applyPaymentTargets(pool,actor,p.request,'enable',p.proof,permitOf(plan),clock); return {plan,result};
  }
  const counts=async()=> (await pool.query(`SELECT (SELECT count(*)::int FROM ainuoke_payment_source_targets) targets,
    (SELECT count(*)::int FROM ainuoke_payment_snapshots) snapshots,(SELECT count(*)::int FROM ainuoke_payment_operator_commands) commands,
    (SELECT count(*)::int FROM operation_logs WHERE entity_type='AinuokePaymentTarget') logs`)).rows[0];
  const collect=async(_c:unknown,selection:ReturnType<typeof collectionSelection>)=>{const value=collectionEvidence(selection,clock+1,12);clock+=1000;return value;};
  const reader=createPaymentSnapshotReader(pool,{sourceKey:collectionConfig.sourceKey},now);
  function lostCommit(after:string){
    let lost=false;
    const proxy=new Proxy(pool,{get(target,key){
      if(key!=='connect'){const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;}
      return async()=>{const client=await pool.connect();let touched=false;
        return new Proxy(client,{get(connection,property){
          if(property!=='query'){const value=Reflect.get(connection,property);return typeof value==='function'?value.bind(connection):value;}
          return async(sql:string,values?:unknown[])=>{const result=await client.query(sql,values);
            if(sql.startsWith(after))touched=true;
            if(sql==='COMMIT'&&touched&&!lost){lost=true;throw new Error('Synthetic-Secret-Not-For-Output');}return result;};
        }});
      };
    }});return {proxy,wasLost:()=>lost};
  }

  await t.test('preview has no writes; enables exactly two targets with audit and terminal receipt',async()=>{
    const p=await pair(),before=await counts(),plan=await planPaymentTargets(pool,actor,p.request,'enable',p.proof,permit(),clock);
    assert.deepEqual(await counts(),before);assert.equal(plan.authorization,'not_granted_by_plan');assert.equal(plan.sourceRead,'none');
    assert.ok(!JSON.stringify(plan).includes(collectionConfig.password));
    const result=await applyPaymentTargets(pool,actor,p.request,'enable',p.proof,permitOf(plan),clock);
    assert.equal(result.receiptState,'completed');assert.equal(result.result?.changedTargets,2);
    assert.deepEqual(await counts(),{...before,targets:before.targets+2,commands:before.commands+1,logs:before.logs+1});
    const replay=await applyPaymentTargets(pool,actor,p.request,'enable',p.proof,permitOf(plan),clock+120000);
    assert.equal(replay.replayed,true);assert.deepEqual(replay.result,result.result);
    await assert.rejects(()=>applyPaymentTargets(pool,actor,p.request,'enable',p.proof,{...permitOf(plan),scopeHash:'0'.repeat(64)},clock),matches('payment_operator_request_conflict'));
  });
  await t.test('missing proof, untrusted proof, wrong binding/account/operator and expired permit block before writes',async()=>{
    const p=await pair(),before=await counts();
    await assert.rejects(()=>planPaymentTargets(pool,actor,p.request,'enable',null,permit(),clock),matches('payment_operator_verification_required'));
    await assert.rejects(()=>planPaymentTargets(pool,actor,p.request,'enable',{...p.proof},permit(),clock),matches('payment_operator_verification_required'));
    const swapped={...p.request,targets:[...p.request.targets].reverse().map((x,i)=>({...x,alias:'S'+(i+1)}))};
    await assert.rejects(()=>planPaymentTargets(pool,actor,swapped,'enable',p.proof,permit(),clock),matches('payment_collection_binding_mismatch'));
    await assert.rejects(()=>planPaymentTargets(pool,actor,{...p.request,config:{...p.request.config,operatorUsername:'other'}},'enable',p.proof,permit(),clock),matches('payment_collection_operator_mismatch'));
    await assert.rejects(()=>planPaymentTargets(pool,actor,p.request,'enable',p.proof,{...permit(),expiresAt:new Date(clock).toISOString()},clock),matches('payment_operator_permit_expired'));
    await pool.query('UPDATE ainuoke_source_profiles SET enabled=false WHERE source_key=$1',[collectionConfig.sourceKey]);
    try{await assert.rejects(()=>planPaymentTargets(pool,actor,p.request,'enable',p.proof,permit(),clock),matches('payment_operator_profile_mismatch'));}
    finally{await pool.query('UPDATE ainuoke_source_profiles SET enabled=true WHERE source_key=$1',[collectionConfig.sourceKey]);}
    assert.deepEqual(await counts(),before);
  });
  await t.test('stale target version is atomic and fresh permission revocation denies both target operations',async()=>{
    const p=await pair();await enable(p);
    const plan=await planPaymentTargets(pool,actor,p.request,'disable',null,permit(),clock),before=await counts();
    await pool.query('UPDATE ainuoke_payment_source_targets SET version=version+1 WHERE sales_order_id=$1',[p.request.targets[1].salesOrderId]);
    await assert.rejects(()=>applyPaymentTargets(pool,actor,p.request,'disable',null,permitOf(plan),clock),matches('payment_operator_scope_changed'));
    assert.equal((await pool.query('SELECT count(*)::int n FROM ainuoke_payment_source_targets WHERE sales_order_id=ANY($1::uuid[]) AND enabled',[p.request.targets.map(x=>x.salesOrderId)])).rows[0].n,2);
    assert.deepEqual(await counts(),before);
    const rows=(await pool.query("DELETE FROM app_role_permissions WHERE permission_key='ainuoke.bind' RETURNING role_id,permission_key")).rows;
    try{await assert.rejects(()=>planPaymentTargets(pool,actor,p.request,'disable',null,permit(),clock),matches('permission_denied'));}
    finally{for(const row of rows)await pool.query('INSERT INTO app_role_permissions(role_id,permission_key) VALUES($1,$2)',[row.role_id,row.permission_key]);}
  });
  await t.test('two concurrent target commands consume one request and preserve atomic audit',async()=>{
    const p=await pair(),plan=await planPaymentTargets(pool,actor,p.request,'enable',p.proof,permit(),clock),before=await counts();
    const results=await Promise.all([1,2].map(()=>applyPaymentTargets(pool,actor,p.request,'enable',p.proof,permitOf(plan),clock)));
    assert.equal(results.filter(r=>r.replayed).length,1);assert.equal((await counts()).logs,before.logs+1);
  });
  await t.test('disable works with profile off; old enable replay never re-enables; re-enable invalidates old money',async()=>{
    const p=await pair(),original=await enable(p);
    const plan=await planPaymentOperatorCollection(pool,actor,p.request,permit(),now);
    const result=await collectPaymentOnce(pool,actor,p.request,permitOf(plan),{now,collect});assert.equal(result.result?.published,2);
    assert.equal((await reader(actor,p.request.targets[0].salesOrderId)).sourceStatus,'observed');
    await pool.query('UPDATE ainuoke_source_profiles SET enabled=false WHERE source_key=$1',[collectionConfig.sourceKey]);
    const disable=await planPaymentTargets(pool,actor,p.request,'disable',null,permit(),clock);
    await applyPaymentTargets(pool,actor,p.request,'disable',null,permitOf(disable),clock);
    assert.equal((await reader(actor,p.request.targets[0].salesOrderId)).sourceStatus,'not_connected');
    await applyPaymentTargets(pool,actor,p.request,'enable',p.proof,permitOf(original.plan),clock);
    assert.equal((await reader(actor,p.request.targets[0].salesOrderId)).sourceStatus,'not_connected');
    await pool.query('UPDATE ainuoke_source_profiles SET enabled=true WHERE source_key=$1',[collectionConfig.sourceKey]);await enable(p);
    assert.equal((await reader(actor,p.request.targets[0].salesOrderId)).sourceStatus,'identity_changed');
    assert.equal((await pool.query('SELECT count(*)::int n FROM ainuoke_payment_snapshots WHERE sales_order_id=ANY($1::uuid[])',[p.request.targets.map(x=>x.salesOrderId)])).rows[0].n,2);
  });
  await t.test('durable claim prevents concurrent or terminal replay from invoking upstream again',async()=>{
    const p=await pair();await enable(p);const plan=await planPaymentOperatorCollection(pool,actor,p.request,permit(),now);
    let calls=0,release!:()=>void,started!:()=>void;const gate=new Promise<void>(r=>{release=r;}),begun=new Promise<void>(r=>{started=r;});
    const running=collectPaymentOnce(pool,actor,p.request,permitOf(plan),{now,collect:async(c,s)=>{calls++;started();await gate;return collect(c,s);}});
    await begun;const concurrent=await collectPaymentOnce(pool,actor,p.request,permitOf(plan),{now,collect:async()=>{assert.fail('no second HTTP');}});
    assert.equal(concurrent.receiptState,'unverified_started');assert.equal(concurrent.sourceReadThisInvocation,'none');release();
    const first=await running;assert.equal(first.result?.published,2);
    const replay=await collectPaymentOnce(pool,actor,p.request,permitOf(plan),{now,collect:async()=>{assert.fail('no retry');}});
    assert.equal(replay.replayed,true);assert.deepEqual(replay.result,first.result);assert.equal(calls,1);
    for(const secret of [collectionConfig.password,collectionConfig.username,'SYN-SC','9007199254740993'])assert.equal(JSON.stringify(first).includes(secret),false);
  });
  await t.test('claim COMMIT acknowledgement loss makes zero upstream calls; readback shows started, never retry lease',async()=>{
    const p=await pair();await enable(p);const plan=await planPaymentOperatorCollection(pool,actor,p.request,permit(),now);
    const broken=lostCommit('INSERT INTO ainuoke_payment_operator_commands');let calls=0;
    const result=await collectPaymentOnce(broken.proxy,actor,p.request,permitOf(plan),{now,collect:async(c,s)=>{calls++;return collect(c,s);}});
    assert.ok(broken.wasLost());assert.equal(result.receiptState,'unverified_claim');assert.equal(calls,0);
    assert.equal((await readPaymentOperatorCommand(pool,actor,collectionConfig.sourceKey,plan.requestId))?.state,'started');
    const retry=await collectPaymentOnce(pool,actor,p.request,permitOf(plan),{now,collect:async(c,s)=>{calls++;return collect(c,s);}});
    assert.equal(retry.receiptState,'unverified_started');assert.equal(calls,0);
  });
  await t.test('target COMMIT loss is reconciled through historical receipt, not another enable',async()=>{
    const p=await pair(),plan=await planPaymentTargets(pool,actor,p.request,'enable',p.proof,permit(),clock);
    const broken=lostCommit('INSERT INTO ainuoke_payment_operator_commands');
    const result=await applyPaymentTargets(broken.proxy,actor,p.request,'enable',p.proof,permitOf(plan),clock);
    assert.equal(result.receiptState,'unverified_commit');
    const receipt=await readPaymentOperatorCommand(pool,actor,collectionConfig.sourceKey,plan.requestId);assert.equal(receipt?.state,'completed');
    assert.equal(receipt?.result?.changedTargets,2);
  });
  await t.test('terminal receipt COMMIT loss preserves actual publication result without a new worker',async()=>{
    const p=await pair();await enable(p);const plan=await planPaymentOperatorCollection(pool,actor,p.request,permit(),now);
    const broken=lostCommit('UPDATE ainuoke_payment_operator_commands');let calls=0;
    const result=await collectPaymentOnce(broken.proxy,actor,p.request,permitOf(plan),{now,collect:async(c,s)=>{calls++;return collect(c,s);}});
    assert.equal(result.receiptState,'unverified_receipt');assert.equal(result.result?.published,2);
    const receipt=await readPaymentOperatorCommand(pool,actor,collectionConfig.sourceKey,plan.requestId);assert.equal(receipt?.state,'completed');
    const replay=await collectPaymentOnce(pool,actor,p.request,permitOf(plan),{now,collect:async()=>{assert.fail('no retry');}});
    assert.equal(replay.replayed,true);assert.equal(calls,1);assert.deepEqual(receipt?.result,replay.result);
  });
  await t.test('terminal SQL receipts cannot be altered, deleted, restarted, or pre-inserted as complete',async()=>{
    const p=await pair(),{plan}=await enable(p);
    await assert.rejects(()=>pool.query("UPDATE ainuoke_payment_operator_commands SET result='{}' WHERE actor_id=$1 AND request_id=$2",[actor.internalUserId,plan.requestId]));
    await assert.rejects(()=>pool.query('DELETE FROM ainuoke_payment_operator_commands WHERE actor_id=$1 AND request_id=$2',[actor.internalUserId,plan.requestId]));
    await assert.rejects(()=>pool.query(`INSERT INTO ainuoke_payment_operator_commands(actor_id,request_id,source_key,kind,scope_hash,payload_hash,state,result,completed_at)
      VALUES($1,$2,$3,'collect',$4,$4,'completed','{}',now())`,[actor.internalUserId,randomUUID(),collectionConfig.sourceKey,hash('synthetic')]));
  });
});
