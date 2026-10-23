import test from 'node:test';
import {migrationFilesAfter} from './current-migration-ledger-fixture.js';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { resolve, join } from 'node:path';
import { mkdtemp, readdir, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import pg from 'pg';
import { startDisposablePostgres } from './postgres-container.js';
import { runMigrations, verifyMigrationsCurrent } from '../db/migration-runner.js';
import { bootstrapAdmin } from '../auth/bootstrap.js';
import { synchronizePermissionCatalog } from '../auth/permissions.js';
import { TEAM_ROLES } from '../auth/team-roles.js';
import { executeTeamCommand } from '../auth/team-access.js';
import { loadExistingBootstrapActor } from '../sales-orders/bootstrap-runner.js';
import { createAinuokeSalesOrder } from '../sales-orders/service.js';
import { createSalesOrder } from '../sales-orders/repository.js';
import { writeAttributionHeadInTransaction } from '../sales-orders/effective-attribution.js';
import { collectNormalizationEvidenceInTransaction,normalizationReferences } from '../sales-orders/normalization-preview.js';
import { collectFullNormalizationEvidence } from '../sales-orders/normalization-full-evidence.js';
import { parseAttributionProposal } from '../sales-orders/normalization-execution-model.js';
import { parsePaymentView } from '../../features/ainuoke-payment-requests/client';
import { createApp } from '../app.js';
import { hash } from '../ainuoke-source/contract.js';
import { createPaymentSnapshotReader, paymentReadConfig, preparePaymentPublication, publishPaymentSnapshot, type PaymentPublicationContext } from '../ainuoke-source/payment-request-store.js';

const code = (expected: string) => (error: unknown) => (error as { code?: string }).code === expected;
const fingerprint = 'a'.repeat(64), sourceKey = 'synthetic-payments';
function sample(context: PaymentPublicationContext, offset = 0, total = 127) {
  const scope = { sourceFingerprint: fingerprint, salesContractNo: context.salesContractNo,
    witness: { id: 'SYN-ROW-0', BillNo: 'SYN-APP-1', PurContractNo: 'SYN-PUR-1' } };
  const page = (pass: number, n: number) => ({ schemaVersion: 'ainuoke-payment-observation-page.v2', reportId: '6086941',
    sourceFingerprint: fingerprint, capturedAt: new Date(context.preparedAt + 1000 * pass + n + offset).toISOString(),
    page: n, pageSize: 100, reportedTotal: total, rawResponseSha256: hash([pass,n,offset,context.preparedAt,total]),
    rows: Array.from({length: Math.min(100, total - (n - 1) * 100)}, (_,i) => ({ id: 'SYN-ROW-' + ((n-1)*100+i),
      BillNo: 'SYN-APP-1', ExpContractNo: scope.salesContractNo, PurContractNo: 'SYN-PUR-1', CnName: '合成标签',
      Num: '6300', OutStoreNum: '6302', QtyUnit: i === 1 ? null : '个', Price: '9007199254740993.000000000001',
      tzamount: '-80.00', GoodsAmount: '100.00' })) });
  return { scope, input: { schemaVersion: 'ainuoke-payment-contract-snapshot-input.v1',
    firstPass: Array.from({length: Math.ceil(total/100)},(_,i)=>page(1,i+1)),
    secondPass: Array.from({length: Math.ceil(total/100)},(_,i)=>page(2,i+1)) } };
}

test('payment reads are independently opt-in and session-only', () => {
  assert.equal(paymentReadConfig({}, 'session'), null);
  assert.equal(paymentReadConfig({ZHIXU_AINUOKE_SOURCE_READ:'snapshot',ZHIXU_AINUOKE_SOURCE_KEY:sourceKey},'session'), null);
  assert.deepEqual(paymentReadConfig({ZHIXU_AINUOKE_PAYMENT_READ:'snapshot',ZHIXU_AINUOKE_SOURCE_KEY:sourceKey},'session'), {sourceKey});
  for (const values of [{ZHIXU_AINUOKE_PAYMENT_READ:'live',ZHIXU_AINUOKE_SOURCE_KEY:sourceKey},
    {ZHIXU_AINUOKE_PAYMENT_READ:'snapshot',ZHIXU_AINUOKE_SOURCE_KEY:'bad / selector'}])
    assert.throws(()=>paymentReadConfig(values,'session'), code('invalid_payment_source_configuration'));
  assert.throws(()=>paymentReadConfig({ZHIXU_AINUOKE_PAYMENT_READ:'snapshot',ZHIXU_AINUOKE_SOURCE_KEY:sourceKey},'local-single-user'));
});

test('payment snapshots: disposable PG upgrade, immutable publication and real session reads', {timeout:180000}, async t => {
  const db = await startDisposablePostgres();
  assert.match(db.containerName,/^zhixu-pg-it-[a-f0-9]{12}$/u);
  const pool = new pg.Pool({connectionString:await db.createDatabase('payment_snapshots')});
  const servers: ReturnType<typeof createServer>[] = [];
  t.after(async()=>{for(const server of servers) await new Promise<void>((done,reject)=>server.close(e=>e?reject(e):done())); await pool.end(); await db.stop();});
  const oldDirectory = await mkdtemp(join(tmpdir(),'zhixu-payment-before25-'));
  try {
    for(const filename of await readdir('database/migrations')) if(filename.endsWith('.sql') && Number(filename.slice(0,4))<=24)
      await copyFile(join('database/migrations',filename),join(oldDirectory,filename));
    await runMigrations(pool,oldDirectory);
  } finally { await rm(oldDirectory,{recursive:true,force:true}); }
  await assert.rejects(()=>verifyMigrationsCurrent(pool,resolve('database/migrations')),code('pending_migrations'));
  await synchronizePermissionCatalog(pool);
  await bootstrapAdmin(pool,{username:'synthetic.payment.admin',displayName:'合成管理员',password:'Synthetic-Payment-2026'});
  const actor = await loadExistingBootstrapActor(pool,'synthetic.payment.admin');
  let clock = Date.now(), orderNumber = 0;
  const createContract = async () => {
    const n = ++orderNumber;
    return (await createAinuokeSalesOrder(pool,actor,{source:{sourceId:'SYN-PAY-' + n,sourceRowIdentity:'SYN-PAY-' + n,
      salesContractNo:'SYN-SC-' + n,insideOrderNo:'SYN-FACTORY-' + n,lifecycleStatusRaw:'生效',contractDate:'2026-10-01',
      contractDeliveryDate:'2026-11-01',styleNo:'SYN-STYLE',companyNameSnapshot:'合成公司',customerNameSnapshot:'合成客户',
      brandNameSnapshot:'合成品牌',quantity:100,sourceHash:hash(n),fetchedAt:new Date(clock).toISOString()},colors:[]})).salesOrder.id;
  };
  const orderId = await createContract();
  { const client=await pool.connect();try{assert.ok((await normalizationReferences(client)).every(([table])=>!table.startsWith('ainuoke_payment_')));}finally{client.release();} }
  const before = (await pool.query(`SELECT (SELECT jsonb_agg(to_jsonb(o) ORDER BY id) FROM sales_orders o) AS orders,
    (SELECT jsonb_agg(to_jsonb(u) ORDER BY id) FROM app_users u) AS users,
    (SELECT jsonb_agg(to_jsonb(l) ORDER BY id) FROM sales_order_source_links l) AS links`)).rows;
  await t.test('nonempty 0024 upgrade is additive, idempotent and creates no target or snapshot', async()=>{
    assert.deepEqual((await runMigrations(pool,resolve('database/migrations'))).applied,migrationFilesAfter(24));
    assert.deepEqual((await runMigrations(pool,resolve('database/migrations'))).applied,[]);
    assert.deepEqual((await pool.query(`SELECT (SELECT jsonb_agg(to_jsonb(o) ORDER BY id) FROM sales_orders o) AS orders,
      (SELECT jsonb_agg(to_jsonb(u)-'archived_at'-'last_login_at'-'password_reset_required' ORDER BY id) FROM app_users u) AS users,
      (SELECT jsonb_agg(to_jsonb(l) ORDER BY id) FROM sales_order_source_links l) AS links`)).rows,before);
    assert.equal((await pool.query("SELECT count(*)::int n FROM app_users WHERE archived_at IS NOT NULL OR last_login_at IS NOT NULL OR password_reset_required")).rows[0].n,0);
    for(const name of ['ainuoke_payment_source_targets','ainuoke_payment_snapshots','ainuoke_payment_heads'])
      assert.equal((await pool.query('SELECT count(*)::int AS n FROM ' + name)).rows[0].n,0);
  });
  for(const [i,role] of TEAM_ROLES.entries()) await executeTeamCommand(pool,actor,{action:'create',requestId:randomUUID(),
    account:'synthetic.payment.'+i,name:'合成'+role.name,password:'Synthetic-Payment-2026',roleIds:[role.id]});
  const reader = createPaymentSnapshotReader(pool,{sourceKey},()=>clock);
  const origin = 'http://payment-test.invalid';
  async function listen(connected: boolean, local = false) {
    const server = createServer(createApp({pool,allowedOrigins:[origin],security:{secureCookies:false,sessionTtlSeconds:3600},
      ...(connected?{orderPaymentRead:reader}:{}),
      ...(local?{identityAuthority:{mode:'local-single-user' as const,verify:async()=>undefined,resolve:async()=>{throw Error('must not resolve local identity');}}}:{})})); servers.push(server);
    await new Promise<void>(done=>server.listen(0,'127.0.0.1',done));
    const address=server.address(); assert.ok(address && typeof address==='object'); return 'http://127.0.0.1:'+address.port;
  }
  const base=await listen(true), disconnected=await listen(false), local=await listen(true,true);
  const headers={Origin:origin,'Content-Type':'application/json','X-Zhixu-Request':'1'};
  const cookies: string[]=[];
  for(let i=0;i<TEAM_ROLES.length;i++){
    const response=await fetch(base+'/api/v1/auth/login',{method:'POST',headers,body:JSON.stringify({username:'synthetic.payment.'+i,password:'Synthetic-Payment-2026'})});
    assert.equal(response.status,200); cookies.push(response.headers.get('set-cookie')!.split(';')[0]);
  }
  const path='/api/v1/sales-orders/'+orderId+'/payment-requests';
  const read=(i=0,suffix='')=>fetch(base+path+suffix,{headers:{Cookie:cookies[i]}});
  let context!: PaymentPublicationContext;
  const prepare=()=>preparePaymentPublication(pool,actor,sourceKey,orderId,clock);
  async function publish(c: PaymentPublicationContext, offset=0) { const s=sample(c,offset); return publishPaymentSnapshot(pool,actor,c,s.input,s.scope,clock); }
  await t.test('HTTP has no writer/query selectors, no session bypass or automatic connection',async()=>{
    assert.equal((await fetch(base+path)).status,401);
    assert.equal((await fetch(local+path)).status,503);
    assert.equal((await fetch(disconnected+path,{headers:{Cookie:cookies[0]}})).status,503);
    assert.equal((await read(0,'?contract=SYN-SC-1')).status,400);
    assert.equal((await fetch(base+path,{method:'POST',headers:{...headers,Cookie:cookies[0]},body:'{}'})).status,405);
    assert.equal((await fetch(base+'/api/v1/sales-orders/not-a-uuid/payment-requests',{headers:{Cookie:cookies[0]}})).status,400);
    assert.equal((await fetch(base+'/api/v1/sales-orders/'+randomUUID()+'/payment-requests',{headers:{Cookie:cookies[0]}})).status,404);
    assert.equal((await (await read()).json()).sourceStatus,'not_connected');
    await assert.rejects(prepare,code('payment_source_not_connected'));
    await pool.query('INSERT INTO ainuoke_source_profiles(source_key,account_fingerprint) VALUES($1,$2)',[sourceKey,fingerprint]);
    await pool.query('INSERT INTO ainuoke_payment_source_targets(source_key,sales_order_id,account_fingerprint) VALUES($1,$2,$3)',[sourceKey,orderId,fingerprint]);
    assert.equal((await (await read()).json()).sourceStatus,'not_connected');
    await assert.rejects(prepare,code('payment_source_not_connected'));
    await pool.query('UPDATE ainuoke_payment_source_targets SET enabled=true,verification_sha256=$3,version=version+1 WHERE source_key=$1 AND sales_order_id=$2',[sourceKey,orderId,hash('synthetic-filter-proof')]);
    assert.equal((await (await read()).json()).sourceStatus,'not_captured');
    const other=await createContract(); assert.equal((await reader(actor,other)).sourceStatus,'not_connected');
  });
  await t.test('two pages survive JSONB/restart; seven roles see only Source observations, exact amounts and unknowns',async()=>{
    context=await prepare(); clock+=5000; const first=await publish(context);
    assert.equal(first.generation,1);assert.equal(first.alreadyPublished,false);
    for(let i=0;i<TEAM_ROLES.length;i++){
      const response=await read(i);assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
      const body=await response.json();assert.equal(body.rows.length,127);assert.equal(body.sourceStatus,'observed');assert.equal(body.bankPaymentStatus,'not_inferred');
      assert.equal(parsePaymentView(body,orderId,context.salesContractNo).sourceStatus,'observed');
      assert.equal(body.rows[100].trace.page,2);assert.equal(body.rows[100].trace.rowIndex,0);
      assert.equal(body.rows[0].amounts.Price.raw,'9007199254740993.000000000001');assert.equal(body.rows[0].quantities.Num.raw,'6300');
      assert.equal(body.rows[0].quantities.OutStoreNum.raw,'6302');assert.equal(body.rows[0].amounts.tzamount.raw,'-80.00');
      assert.equal(body.rows[0].amounts.YFAmount.state,'unknown');assert.equal(body.rows[1].sourceUnits.purchase.state,'unknown');
      assert.equal(body.rows[0].amountCurrencies.GoodsAmount.state,'unknown');assert.equal(body.rows[0].allocatedShipmentUnit.state,'unknown');
      assert.equal(JSON.stringify(body).includes('confirmedSalePrice'),false);assert.equal(body.mappingVerified,false);
    }
    assert.equal((await createPaymentSnapshotReader(pool,{sourceKey},()=>clock)(actor,orderId)).rows.length,127);
  });
  await t.test('same request replay and two concurrent copies return one publication and audit',async()=>{
    const beforeAudit=(await pool.query("SELECT count(*)::int n FROM operation_logs WHERE metadata->>'sourceReportId'='6086941'")).rows[0].n;
    const copies=await Promise.all([publish(context),publish(context)]);
    assert.equal(copies[0].publicationId,copies[1].publicationId);assert.ok(copies.every(x=>x.alreadyPublished && x.generation===1));
    assert.equal((await pool.query("SELECT count(*)::int n FROM operation_logs WHERE metadata->>'sourceReportId'='6086941'")).rows[0].n,beforeAudit);
  });
  await t.test('different captures with same expected generation have exactly one winner',async()=>{
    context=await prepare();clock+=5000;
    const results=await Promise.allSettled([publish(context,10),publish(context,20)]);
    assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
    const rejected=results.find(x=>x.status==='rejected');assert.ok(rejected?.status==='rejected');assert.equal(rejected.reason.code,'payment_generation_conflict');
    assert.equal((await pool.query('SELECT count(*)::int n FROM ainuoke_payment_snapshots')).rows[0].n,2);
  });
  await t.test('publication pins the reviewed input, scope and identity before asynchronous database work',async()=>{
    context=await prepare();clock+=5000;const value=sample(context), mutable=structuredClone(context);
    const pending=publishPaymentSnapshot(pool,actor,mutable,value.input,value.scope,clock);
    value.input.firstPass[0].rows[0].Price='999';value.scope.salesContractNo='SYN-FOREIGN';mutable.sourceKey='another-source';
    const published=await pending;assert.equal(published.alreadyPublished,false);
    const body=await (await read()).json();assert.equal(body.rows[0].amounts.Price.raw,'9007199254740993.000000000001');
  });
  await t.test('invalid/mixed/incomplete/authority-forged data never moves the head',async()=>{
    const c=await prepare();clock+=5000;
    const before=(await pool.query('SELECT * FROM ainuoke_payment_heads')).rows;
    for(const kind of ['mixed','missing','changed','forged'] as const){
      const value=sample(c);
      if(kind==='mixed')value.input.firstPass[0].rows[0].ExpContractNo='SYN-OTHER';
      if(kind==='missing')value.input.secondPass.pop();
      if(kind==='changed')value.input.secondPass[0].rows[0].Num='99';
      if(kind==='forged')Object.assign(value.input.firstPass[0].rows[0],{confirmedSalePrice:'999'});
      await assert.rejects(()=>publishPaymentSnapshot(pool,actor,c,value.input,value.scope,clock));
      assert.deepEqual((await pool.query('SELECT * FROM ainuoke_payment_heads')).rows,before);
    }
  });
  await t.test('new preparation cannot reuse captures made before its scope was checked',async()=>{
    const old=sample(context);const next=await prepare();clock+=5000;
    await assert.rejects(()=>publishPaymentSnapshot(pool,actor,next,old.input,old.scope,clock),code('payment_capture_precedes_scope'));
  });
  await t.test('expiry hides rows without renewing timestamps or deleting history',async()=>{
    const before=(await pool.query('SELECT * FROM ainuoke_payment_heads')).rows;const oldClock=clock;clock+=600000;
    const body=await (await read()).json();assert.equal(body.sourceStatus,'stale');assert.deepEqual(body.rows,[]);
    assert.deepEqual((await pool.query('SELECT * FROM ainuoke_payment_heads')).rows,before);clock=oldClock;
  });
  await t.test('account, target disable/reenable and profile changes cannot silently reuse old capture context',async()=>{
    const c=await prepare();clock+=5000;
    await pool.query('UPDATE ainuoke_source_profiles SET enabled=false WHERE source_key=$1',[sourceKey]);
    assert.equal((await reader(actor,orderId)).sourceStatus,'not_connected');await assert.rejects(()=>publish(c),code('payment_source_not_connected'));
    await pool.query('UPDATE ainuoke_source_profiles SET enabled=true,account_fingerprint=$2 WHERE source_key=$1',[sourceKey,'b'.repeat(64)]);
    assert.equal((await reader(actor,orderId)).sourceStatus,'not_connected');
    await pool.query('UPDATE ainuoke_source_profiles SET account_fingerprint=$2 WHERE source_key=$1',[sourceKey,fingerprint]);
    await pool.query('UPDATE ainuoke_payment_source_targets SET enabled=false,version=version+1 WHERE source_key=$1',[sourceKey]);
    assert.equal((await reader(actor,orderId)).sourceStatus,'not_connected');
    await pool.query('UPDATE ainuoke_payment_source_targets SET enabled=true,version=version+1 WHERE source_key=$1',[sourceKey]);
    assert.equal((await reader(actor,orderId)).sourceStatus,'identity_changed');
    await assert.rejects(()=>publish(c),code('payment_binding_changed'));
    context=await prepare();clock+=5000;await publish(context);
  });
  await t.test('fresh DB grants defeat supplied permission arrays; revoked accounts cannot read or publish',async()=>{
    const production=await loadExistingBootstrapActor(pool,'synthetic.payment.4');
    const forged={...production,permissions:actor.permissions};
    await assert.rejects(()=>preparePaymentPublication(pool,forged,sourceKey,orderId,clock),code('permission_denied'));
    await pool.query("DELETE FROM app_role_permissions WHERE role_id='role-team-production-manager' AND permission_key='ainuoke.view'");
    try{assert.equal((await read(4)).status,403);await assert.rejects(()=>reader(forged,orderId),code('permission_denied'));}
    finally{await pool.query("INSERT INTO app_role_permissions(role_id,permission_key) VALUES('role-team-production-manager','ainuoke.view')");}
    const c=await prepare();clock+=5000;await pool.query('UPDATE app_users SET active=false WHERE id=$1',[actor.internalUserId]);
    try{await assert.rejects(()=>publish(c),/source_actor_unavailable/);await assert.rejects(()=>reader(actor,orderId),/source_actor_unavailable/);}
    finally{await pool.query('UPDATE app_users SET active=true WHERE id=$1',[actor.internalUserId]);}
  });
  await t.test('ordinary SQL cannot edit/delete snapshots or reset heads/target versions',async()=>{
    await assert.rejects(()=>pool.query("UPDATE ainuoke_payment_snapshots SET content_hash=repeat('f',64)"));
    await assert.rejects(()=>pool.query('DELETE FROM ainuoke_payment_snapshots'));
    await assert.rejects(()=>pool.query('DELETE FROM ainuoke_payment_heads'));
    await assert.rejects(()=>pool.query('UPDATE ainuoke_payment_heads SET generation=generation+2'));
    await assert.rejects(()=>pool.query('UPDATE ainuoke_payment_source_targets SET enabled=false'));
    await assert.rejects(()=>pool.query('UPDATE ainuoke_payment_source_targets SET account_fingerprint=$1,version=version+1',['b'.repeat(64)]));
  });
  const cloneSnapshot=async(id:string,patch:Record<string,unknown>)=>pool.query(`INSERT INTO ainuoke_payment_snapshots
    SELECT (jsonb_populate_record(NULL::ainuoke_payment_snapshots,to_jsonb(s)||$2::jsonb)).*
    FROM ainuoke_payment_snapshots s WHERE s.id=$1`,[id,JSON.stringify(patch)]);
  await t.test('direct INSERT cannot omit required proof metadata or use a stale target version',async()=>{
    const current=(await pool.query('SELECT snapshot_id::text AS id FROM ainuoke_payment_heads')).rows[0].id;
    await assert.rejects(()=>cloneSnapshot(current,{id:randomUUID(),payload:{}}));
    await assert.rejects(()=>cloneSnapshot(current,{id:randomUUID(),scope:{}}));
    await assert.rejects(()=>cloneSnapshot(current,{id:randomUUID(),target_version:1}));
    const other=(await pool.query('SELECT id::text FROM sales_orders WHERE id<>$1 LIMIT 1',[orderId])).rows[0].id;
    await assert.rejects(()=>cloneSnapshot(current,{id:randomUUID(),source_owner_order_id:other}));
  });
  await t.test('corrupted stored projection cannot pass a content hash or idempotent replay check',async()=>{
    const current=(await pool.query('SELECT s.* FROM ainuoke_payment_heads h JOIN ainuoke_payment_snapshots s ON s.id=h.snapshot_id')).rows[0];
    const tampered=structuredClone(current.payload);tampered.rows[0].amounts.Price.raw='999';const id=randomUUID();
    // Deliberately insert malformed synthetic evidence as a DB owner. No trigger
    // is disabled: the reader must independently rebuild checked source pages.
    await cloneSnapshot(current.id,{id,payload:tampered});
    await pool.query('UPDATE ainuoke_payment_heads SET snapshot_id=$1,generation=generation+1',[id]);
    try{
      const response=await read();assert.equal(response.status,503);assert.equal((await response.json()).error.code,'payment_snapshot_integrity_failed');
      await assert.rejects(()=>publish(context),code('payment_snapshot_integrity_failed'));
    }finally{await pool.query('UPDATE ainuoke_payment_heads SET snapshot_id=$1,generation=generation+1',[current.id]);}
  });
  await t.test('direct head advancement cannot publish older observation timestamps',async()=>{
    const current=(await pool.query('SELECT s.* FROM ainuoke_payment_heads h JOIN ainuoke_payment_snapshots s ON s.id=h.snapshot_id')).rows[0];
    const payload=structuredClone(current.payload);
    for(const key of ['observedFrom','observedThrough','expiresAt'])payload[key]=new Date(Date.parse(payload[key])-1).toISOString();
    const id=randomUUID();await cloneSnapshot(current.id,{id,payload,observed_from:payload.observedFrom,observed_through:payload.observedThrough,expires_at:payload.expiresAt});
    await assert.rejects(()=>pool.query('UPDATE ainuoke_payment_heads SET snapshot_id=$1,generation=generation+1',[id]),/cannot regress/);
  });
  await t.test('processing orders have no Ainuoke financial source and cannot publish',async()=>{
    const processing=await createSalesOrder(pool,{creationSource:'manual'});
    await pool.query("INSERT INTO sales_order_identity_profiles(sales_order_id,business_type) VALUES($1,'processing')",[processing.id]);
    assert.equal((await reader(actor,processing.id)).sourceStatus,'not_applicable');
    await assert.rejects(()=>preparePaymentPublication(pool,actor,sourceKey,processing.id,clock),code('payment_order_not_available'));
  });
  await t.test('effective attribution changes require fresh collection; old aliases never redirect financial data',async()=>{
    const c=await prepare();clock+=5000;
    const primary=(await createSalesOrder(pool,{creationSource:'manual'})).id;
    const pair=[orderId,primary].sort();
    const caseId=(await pool.query('INSERT INTO sales_order_normalization_cases(first_order_id,second_order_id,created_by,request_id,payload_hash) VALUES($1,$2,$3,$4,$5) RETURNING id',[...pair,actor.internalUserId,randomUUID(),hash('synthetic-case')])).rows[0].id;
    await pool.query("INSERT INTO sales_order_normalization_case_events(case_id,version,actor_id,request_id,payload_hash,event_type,reason,evidence) VALUES($1,1,$2,$3,$4,'opened','synthetic payment attribution test','{}')",[caseId,actor.internalUserId,randomUUID(),hash('synthetic-event')]);
    const inspection=await pool.connect();
    try{
      await inspection.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const summary=await collectNormalizationEvidenceInTransaction(inspection,pair);assert.deepEqual(summary.unknownReferences,[]);
      const proposal=parseAttributionProposal({changeType:'normalize',caseVersion:1,assignments:pair.map(id=>({originalOrderId:id,effectiveOrderId:primary})),reason:'Synthetic payment source evidence',recoveryPlanHash:hash('synthetic-recovery')});
      const full=await collectFullNormalizationEvidence(inspection,caseId,proposal,{coverage:'unavailable',reason:'synthetic-test-no-external-ledger'});
      assert.deepEqual(full.unknownReferences,[]);assert.ok(full.blockers.includes('production_finance_coverage_unavailable'));
      const paymentReferences=full.references.filter(row=>row.relation.startsWith('ainuoke_payment_'));
      assert.equal(paymentReferences.length,8);assert.ok(paymentReferences.filter(row=>row.orderId===orderId).every(row=>row.count>0));
      assert.equal(JSON.stringify(full).includes('9007199254740993.000000000001'),false);
      await inspection.query('COMMIT');
    }catch(e){await inspection.query('ROLLBACK');throw e;}finally{inspection.release();}
    const map=async(target:string,type:'normalize'|'correct')=>{
      const client=await pool.connect();
      try{
        await client.query('BEGIN');await client.query("SELECT pg_advisory_xact_lock(hashtextextended('order-effective-attribution',0))");
        const change=(await client.query("INSERT INTO sales_order_attribution_changes(case_id,case_version,change_type,actor_id,request_id,payload_hash,evidence_hash,evidence_basis,reason) VALUES($1,1,$2,$3,$4,$5,$5,'{}','synthetic payment attribution') RETURNING id",[caseId,type,actor.internalUserId,randomUUID(),hash('synthetic-change')])).rows[0].id;
        for(const id of [orderId,primary]){
          const previous=(await client.query('SELECT current_change_id,version FROM sales_order_attribution_heads WHERE sales_order_id=$1',[id])).rows[0];
          await client.query('INSERT INTO sales_order_attribution_members(change_id,sales_order_id,effective_order_id,previous_change_id,previous_version) VALUES($1,$2,$3,$4,$5)',[change,id,target,previous?.current_change_id??null,previous?.version??0]);
        }
        for(const id of [orderId,primary])await writeAttributionHeadInTransaction(client,change,id);
        await client.query('COMMIT');
      }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
    };
    await map(orderId,'normalize');
    assert.equal((await reader(actor,orderId)).sourceStatus,'identity_changed');
    await assert.rejects(()=>publish(c),code('payment_binding_changed'));
    const newContext=await prepare(), oldCapture=sample(c);clock+=5000;
    await assert.rejects(()=>publishPaymentSnapshot(pool,actor,newContext,oldCapture.input,oldCapture.scope,clock),code('payment_capture_precedes_scope'));
    await publish(newContext);assert.equal((await reader(actor,orderId)).sourceStatus,'observed');
    await map(primary,'correct');
    await assert.rejects(()=>reader(actor,orderId),code('payment_order_not_available'));
    await assert.rejects(()=>publish(c),code('payment_binding_changed'));
    const historical=(await pool.query('SELECT id::text FROM ainuoke_payment_snapshots WHERE sales_order_id=$1 LIMIT 1',[orderId])).rows[0].id;
    await assert.rejects(()=>cloneSnapshot(historical,{id:randomUUID()}),/historical duplicate/);
    assert.equal((await reader(actor,primary)).sourceStatus,'not_connected');
    await assert.rejects(()=>pool.query('UPDATE ainuoke_payment_heads SET generation=generation+1,snapshot_id=snapshot_id'));
    const count=(await pool.query('SELECT count(*)::int n FROM ainuoke_payment_snapshots')).rows[0].n;assert.ok(count>=3);
  });
});
