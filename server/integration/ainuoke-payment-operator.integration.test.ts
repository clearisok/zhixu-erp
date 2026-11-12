import {historicalSourceFixture} from './historical-source-fixture.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { resolve, dirname, basename, join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync, spawnSync } from 'node:child_process';
import pg from 'pg';
import { startDisposablePostgres } from './postgres-container.js';
import { freezeExistingPublicRows } from './legacy-row-snapshot-fixture.js';
import { runMigrations, inspectMigrationStatus } from '../db/migration-runner.js';
import { synchronizePermissionCatalog } from '../auth/permissions.js';
import { bootstrapAdmin } from '../auth/bootstrap.js';
import { loadExistingBootstrapActor } from '../sales-orders/bootstrap-runner.js';
import { createAinuokeSalesOrder } from '../sales-orders/service.js';
import { hash } from '../ainuoke-source/contract.js';
import { validateContractEvidence } from '../ainuoke-source/payment-request-contract-probe.js';
import { verifyPaymentTargetEvidence } from '../ainuoke-source/payment-target-verification.js';
import { planPaymentTargets, applyPaymentTargets } from '../ainuoke-source/payment-targets.js';
import { planPaymentOperatorCollection, collectPaymentOnce } from '../ainuoke-source/payment-operator-collection.js';
import { planPaymentCollection } from '../ainuoke-source/payment-request-collection.js';
import { readPaymentOperatorCommand } from '../ainuoke-source/payment-operator-command-store.js';
import { createPaymentSnapshotReader } from '../ainuoke-source/payment-request-store.js';
import { collectionConfig, collectionSelection, collectionEvidence } from './payment-collection-fixture.js';
import { paymentOperatorArguments, runPaymentOperator } from '../ainuoke-source/payment-operator-cli.js';
import { paymentPrivateFixture } from './payment-operator-private-fixture.js';
import { readFileSync, mkdtempSync, copyFileSync, rmSync } from 'node:fs';
import { CURRENT_MIGRATION_FILES, migrationFilesAfter } from './current-migration-ledger-fixture.js';

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
    return {request,proof:verifyPaymentTargetEvidence(raw,hash(raw),request,clock),report:raw};
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
    const changed={...p.request,targets:p.request.targets.map((row,i)=>({...row,salesOrderId:i?row.salesOrderId:randomUUID()}))};
    await assert.rejects(()=>applyPaymentTargets(pool,actor,changed,'enable',p.proof,permitOf(plan),clock),matches('payment_operator_request_conflict'));
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
    const changed={...p.request,targets:p.request.targets.map((row,i)=>({...row,salesOrderId:i?row.salesOrderId:randomUUID()}))};
    await assert.rejects(()=>collectPaymentOnce(pool,actor,changed,permitOf(plan),{now,collect}),matches('payment_operator_request_conflict'));
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
  await t.test('audit failure rolls back both targets and the command receipt',async()=>{
    const p=await pair(),plan=await planPaymentTargets(pool,actor,p.request,'enable',p.proof,permit(),clock),before=await counts();
    await pool.query(`CREATE FUNCTION synthetic_operator_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.entity_type='AinuokePaymentTarget' THEN RAISE EXCEPTION 'synthetic audit unavailable'; END IF; RETURN NEW; END; $$`);
    await pool.query('CREATE TRIGGER synthetic_operator_audit_failure BEFORE INSERT ON operation_logs FOR EACH ROW EXECUTE FUNCTION synthetic_operator_audit_failure()');
    try{await assert.rejects(()=>applyPaymentTargets(pool,actor,p.request,'enable',p.proof,permitOf(plan),clock));assert.deepEqual(await counts(),before);}
    finally{await pool.query('DROP TRIGGER synthetic_operator_audit_failure ON operation_logs');await pool.query('DROP FUNCTION synthetic_operator_audit_failure()');}
  });
  await t.test('wrong or stale operator plan never consumes a command or invokes a worker',async()=>{
    const p=await pair();await enable(p);const plan=await planPaymentOperatorCollection(pool,actor,p.request,permit(),now),before=await counts();
    let calls=0;const never=async()=>{calls++;assert.fail('no source read');};
    await assert.rejects(()=>collectPaymentOnce(pool,actor,p.request,{...permitOf(plan),scopeHash:'0'.repeat(64)},{now,collect:never}),matches('payment_operator_scope_changed'));
    await pool.query('UPDATE ainuoke_payment_source_targets SET version=version+1 WHERE sales_order_id=$1',[p.request.targets[0].salesOrderId]);
    await assert.rejects(()=>collectPaymentOnce(pool,actor,p.request,permitOf(plan),{now,collect:never}),matches('payment_operator_scope_changed'));
    assert.equal(calls,0);assert.deepEqual(await counts(),before);
  });
  await t.test('private operator entry plans, enables, collects once, then reads or replays with no secret file',async()=>{
    const p=await pair(),files=paymentPrivateFixture();try{
      const proof=files.write('synthetic-proof.json',JSON.stringify(p.report));
      const {password:_discarded,operatorUsername,...source}=collectionConfig;void _discarded;
      const job=files.write('synthetic-job.json',JSON.stringify({schemaVersion:'ainuoke-payment-operator-job.v1',databaseUrl:pool.options.connectionString,
        operatorUsername,source,selection:p.request.selection,targets:p.request.targets,verification:proof}));
      const key=files.write('synthetic-key.txt','账号：'+collectionConfig.username+'\n密码：'+collectionConfig.password+'\n');
      const base=['--job='+job.path,'--expected-job='+job.sha256,'--private-output='+files.directory];
      const args=(action:string,id:string,expiresAt?:string,scopeHash?:string)=>paymentOperatorArguments([action,...base,'--request-id='+id,
        ...(expiresAt?['--expires-at='+expiresAt]:[]),...(scopeHash?['--scope-hash='+scopeHash,'--execute=I_CONFIRM_EXACT_SCOPE']:[]),
        ...(action.startsWith('--collect-once')?['--credential-file='+key.path]:[])]);
      const token=permit();
      const targetPlan=await runPaymentOperator(args('--plan-targets=enable',token.requestId,token.expiresAt),'a'.repeat(40),{now});
      assert.equal(targetPlan.result,'READ_ONLY_PLAN_RECORDED');assert.ok('scopeHash'in targetPlan);
      if(!('scopeHash'in targetPlan)||typeof targetPlan.scopeHash!=='string')assert.fail('expected scope');
      const enabled=await runPaymentOperator(args('--apply-targets=enable',token.requestId,token.expiresAt,targetPlan.scopeHash),'a'.repeat(40),{now});
      assert.ok('changedTargets'in enabled);assert.equal(enabled.changedTargets,2);
      const captureToken=permit(),capturePlan=await runPaymentOperator(args('--plan-collection=6086941',captureToken.requestId,captureToken.expiresAt),'a'.repeat(40),{now});
      if(!('scopeHash'in capturePlan)||typeof capturePlan.scopeHash!=='string')assert.fail('expected collection scope');
      let calls=0;
      const captured=await runPaymentOperator(args('--collect-once=6086941',captureToken.requestId,captureToken.expiresAt,capturePlan.scopeHash),'a'.repeat(40),
        {now,collect:async(c,s)=>{calls++;return collect(c,s);}});
      assert.ok('published'in captured);assert.equal(captured.published,2);assert.equal(calls,1);
      const readback=await runPaymentOperator(args('--receipt=6086941',captureToken.requestId),'a'.repeat(40),{now});
      assert.equal(readback.receiptState,'completed');assert.ok('privateReportPath'in readback);
      const text=readFileSync(readback.privateReportPath!,'utf8');assert.match(text,/PAYMENT_COLLECTION_PUBLISHED/u);
      for(const value of [collectionConfig.password,collectionConfig.username,pool.options.connectionString!]){
        assert.ok(!text.includes(value));assert.ok(!JSON.stringify([targetPlan,enabled,capturePlan,captured,readback]).includes(value));}
      const replayArgs=args('--collect-once=6086941',captureToken.requestId,captureToken.expiresAt,capturePlan.scopeHash);
      replayArgs.values.set('credential-file',key.path+'.not-present');
      const replay=await runPaymentOperator(replayArgs,'a'.repeat(40),{now,collect:async()=>{assert.fail('no second read');}});
      assert.ok('replayed'in replay);assert.equal(replay.replayed,true);assert.equal(calls,1);
      const receiptArgs=['--receipt=6086941',...base,'--request-id='+captureToken.requestId];
      const dirty=execFileSync('git',['status','--porcelain','--untracked-files=normal'],{encoding:'utf8',windowsHide:true}).trim();
      const child=spawnSync(process.execPath,['--import','tsx','server/ainuoke-source/payment-operator-cli.ts',...receiptArgs],
        {encoding:'utf8',windowsHide:true,timeout:30000,maxBuffer:65536});
      const output=JSON.parse(child.stdout);
      if(dirty){assert.equal(child.status,1);assert.equal(output.code,'payment_operator_committed_clean_worktree_required');}
      else{assert.equal(child.status,0,child.stderr);assert.equal(output.receiptState,'completed');assert.equal(output.operationResult,'PAYMENT_COLLECTION_PUBLISHED');}
      t.diagnostic('Actual source executable: '+(dirty?'dirty checkout correctly refused':'clean checkout durable readback passed'));
      assert.ok(!child.stdout.includes(collectionConfig.password));assert.ok(!child.stderr.includes(pool.options.connectionString!));
    }finally{files.close();}
  });
  await t.test('missing migrations stop the entry without applying SQL or creating an operator account',async()=>{
    const blankUrl=await db.createDatabase('operator_blank'),blank=new pg.Pool({connectionString:blankUrl,max:1}),files=paymentPrivateFixture();
    try{
      const selection=collectionSelection('BLANK'),{password:_discarded,operatorUsername,...source}=collectionConfig;void _discarded;
      const job=files.write('blank-job.json',JSON.stringify({schemaVersion:'ainuoke-payment-operator-job.v1',databaseUrl:blankUrl,
        operatorUsername,source,selection,targets:selection.targets.map(row=>({alias:row.alias,salesOrderId:randomUUID()})),verification:null}));
      const token=permit(),args=paymentOperatorArguments(['--receipt=6086941','--job='+job.path,'--expected-job='+job.sha256,
        '--private-output='+files.directory,'--request-id='+token.requestId]);
      await assert.rejects(()=>runPaymentOperator(args,'a'.repeat(40),{now}),matches('pending_migrations'));
      assert.equal((await blank.query("SELECT count(*)::int n FROM information_schema.tables WHERE table_schema='public'")).rows[0].n,0);
    }finally{await blank.end();files.close();}
  });
  await t.test('nonempty 0025 upgrade preserves historical fields and adds empty command storage; old-schema rollback is rejected',async()=>{
    const directory=mkdtempSync(join(tmpdir(),'zhixu-payment-operator-upgrade-'));
    const legacy=await historicalSourceFixture();
    const old=new pg.Pool({connectionString:await db.createDatabase('operator_upgrade'),max:2});
    try{
      for(const file of CURRENT_MIGRATION_FILES.filter(name=>Number(name.slice(0,4))<=25))copyFileSync(resolve('database/migrations',file),join(directory,file));
      await runMigrations(old,directory);await synchronizePermissionCatalog(old);
      await bootstrapAdmin(old,{username:collectionConfig.operatorUsername,displayName:'合成升级管理员',password:'Synthetic-Upgrade-2026'});
      const user=await loadExistingBootstrapActor(old,collectionConfig.operatorUsername),selection=collectionSelection('UPGRADE'),targets=[];
      await old.query('INSERT INTO ainuoke_source_profiles(source_key,account_fingerprint) VALUES($1,$2)',[collectionConfig.sourceKey,selection.sourceFingerprint]);
      for(const row of selection.targets){
        const id=(await createAinuokeSalesOrder(old,user,{source:{sourceId:row.salesContractNo,sourceRowIdentity:row.salesContractNo,
          salesContractNo:row.salesContractNo,insideOrderNo:'SYN-UPGRADE',lifecycleStatusRaw:'生效',contractDate:'2026-10-01',contractDeliveryDate:'2026-11-01',
          styleNo:'SYN-STYLE',companyNameSnapshot:'合成公司',customerNameSnapshot:'合成客户',brandNameSnapshot:'合成品牌',quantity:100,
          sourceHash:hash(row),fetchedAt:new Date(clock).toISOString()},colors:[]})).salesOrder.id;
        await old.query(`INSERT INTO ainuoke_payment_source_targets(source_key,sales_order_id,account_fingerprint,enabled,verification_sha256)
          VALUES($1,$2,$3,true,$4)`,[collectionConfig.sourceKey,id,selection.sourceFingerprint,hash(row)]);targets.push({alias:row.alias,salesOrderId:id});
      }
      const request={config:{...collectionConfig},selection,targets},plan=await planPaymentCollection(old,user,request,now);
      assert.equal((await legacy.collectAndPublishPaymentContracts(old,user,request,plan.scopeHash,{now,collect})).published,2);
      const tables=['app_users','sales_orders','ainuoke_sales_order_contract_mirrors','ainuoke_source_profiles','ainuoke_payment_source_targets',
        'ainuoke_payment_snapshots','ainuoke_payment_heads','operation_logs'];
      const inventory=await freezeExistingPublicRows(old,tables);
      const before=await inventory(),upgraded=await runMigrations(old,resolve('database/migrations'));
      assert.deepEqual(upgraded.applied,migrationFilesAfter(25));assert.deepEqual(await inventory(),before);
      assert.deepEqual((await old.query('SELECT archived_at,last_login_at,password_reset_required FROM app_users')).rows,
        [{archived_at:null,last_login_at:null,password_reset_required:false}]);
      assert.deepEqual((await old.query('SELECT catalog_run_id FROM ainuoke_source_profiles')).rows,[{catalog_run_id:null}]);
      assert.equal((await old.query('SELECT count(*)::int n FROM ainuoke_payment_operator_commands')).rows[0].n,0);
      assert.deepEqual((await runMigrations(old,resolve('database/migrations'))).applied,[]);
      await assert.rejects(()=>inspectMigrationStatus(old,directory),/Applied migration 26 .* is missing from the migration directory/u);
    }finally{await legacy.close();await old.end();assert.equal(dirname(directory),resolve(tmpdir()));assert.match(basename(directory),/^zhixu-payment-operator-upgrade-/u);rmSync(directory,{recursive:true,force:true});}
  });
});
