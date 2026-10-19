import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp,readdir,copyFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,relative,isAbsolute} from 'node:path';
import {createServer} from 'node:http';
import pg from 'pg';
import {startDisposablePostgres} from './postgres-container.js';
import {runMigrations} from '../db/migration-runner.js';
import {bootstrapAdmin} from '../auth/bootstrap.js';
import {synchronizePermissionCatalog} from '../auth/permissions.js';
import {loadExistingBootstrapActor} from '../sales-orders/bootstrap-runner.js';
import {bindOrders,previewBindings} from '../ainuoke-source/binding.js';
import {bindingBundle,freshMaterialBundle} from './ainuoke-binding-fixture.js';
import {captureSource} from '../ainuoke-source/service.js';
import {createPersistedMaterialHistoryReader,parseMaterialHistoryQuery} from '../ainuoke-source/history.js';
import {createPersistedMaterialPorts} from '../ainuoke-source/reader.js';
import {createOrderMaterialReader} from '../../features/ainuoke-material-progress/read-service.js';
import {createSalesOrder} from '../sales-orders/repository.js';
import {writeAttributionHeadInTransaction} from '../sales-orders/effective-attribution.js';
import {createApp} from '../app.js';
import {createIdentityAuthority} from '../auth/identity-authority.js';
import {migrationFilesAfter} from './current-migration-ledger-fixture.js';

const code=(value:string)=>(error:unknown)=>(error as {code?:string}).code===value;
test('historical queries accept only bounded original-target pagination',()=>{
 assert.deepEqual(parseMaterialHistoryQuery(new URLSearchParams()),{limit:20,cursor:null});
 for(const query of ['limit=0','limit=51','limit=1.2','limit=01','limit=1&limit=2','sourceKey=foreign','billNo=SYN','insideOrderNo=style','cursor=bad','cursor=&limit=20'])assert.throws(()=>parseMaterialHistoryQuery(new URLSearchParams(query)),code('invalid_material_history_query'));
});

test('historical material Source remains distinct from current identity and readiness',{timeout:180000},async t=>{
 const db=await startDisposablePostgres();const pool=new pg.Pool({connectionString:await db.createDatabase('material_history')});t.after(async()=>{await pool.end();await db.stop();});
 const prefix=await mkdtemp(join(tmpdir(),'zhixu-history-prefix21-'));
 try{for(const file of await readdir('database/migrations'))if(file.endsWith('.sql')&&Number(file.slice(0,4))<=21)await copyFile(join('database/migrations',file),join(prefix,file));await runMigrations(pool,prefix);}
 finally{const distance=relative(resolve(tmpdir()),resolve(prefix));assert.ok(distance&&!distance.startsWith('..')&&!isAbsolute(distance));await rm(prefix,{recursive:true,force:true});}
 await synchronizePermissionCatalog(pool);await bootstrapAdmin(pool,{username:'synthetic-history-admin',displayName:'Synthetic',password:'Synthetic-2026'});const actor=await loadExistingBootstrapActor(pool,'synthetic-history-admin');
 let clock=Date.now()-60000;const source=bindingBundle(clock),binding=await previewBindings(source);
 const a=(await bindOrders(pool,actor,{sourceKey:'history-test',accountFingerprint:'a'.repeat(64),expectedPreview:binding.reviewHash,collect:async()=>source})).orderIds[0];
 const b=(await createSalesOrder(pool,{creationSource:'manual'})).id;let price=20;
 const collect=async()=>{const data=freshMaterialBundle(clock);for(const page of Object.values(data.materials).flat())for(const row of page.rows){row.values.cgprice=price;row.values.unmappedPrivateAnnotation='protected-commercial-sentinel';}return data;};
 const capture=()=>captureSource(pool,actor,{sourceKey:'history-test',accountFingerprint:'a'.repeat(64),collect,maxAgeMs:1000,now:()=>clock});
 const legacy=(await capture()).runId;
 const rawLegacy=(await pool.query('SELECT r.discovery,r.content_hash,r.discovery_hash,s.snapshots,s.content_hash AS material_hash FROM ainuoke_source_runs r JOIN ainuoke_material_source_snapshots s ON s.run_id=r.id WHERE r.id=$1',[legacy])).rows;
 await t.test('forward context upgrade does not invent link/version/scope for prior evidence',async()=>{
  assert.deepEqual((await runMigrations(pool,resolve('database/migrations'))).applied,migrationFilesAfter(21));
  assert.deepEqual((await pool.query('SELECT r.discovery,r.content_hash,r.discovery_hash,s.snapshots,s.content_hash AS material_hash FROM ainuoke_source_runs r JOIN ainuoke_material_source_snapshots s ON s.run_id=r.id WHERE r.id=$1',[legacy])).rows,rawLegacy);
  assert.deepEqual((await pool.query('SELECT r.order_scope,s.source_link_id,s.captured_order_version FROM ainuoke_source_runs r JOIN ainuoke_material_source_snapshots s ON s.run_id=r.id WHERE r.id=$1',[legacy])).rows[0],{order_scope:null,source_link_id:null,captured_order_version:null});
 });
 const history=createPersistedMaterialHistoryReader(pool,{sourceKey:'history-test',maxAgeMs:1000});const current=createOrderMaterialReader(createPersistedMaterialPorts(pool,{sourceKey:'history-test',maxAgeMs:1000},()=>clock+600000));
 let ownRun='',upgradeRun='';
 await t.test('old snapshots stay readable as historical unknown-context, without fake current readiness',async()=>{
  const result=await history.read(actor,a,legacy);assert.equal(result.usage,'historical_only');assert.equal(result.currentStatusApplicable,false);assert.equal(result.record.identityEvidence,'legacy_context_unavailable');assert.equal(result.record.capturedOrderVersion,null);assert.equal(result.record.capturedSourceOwnerOrderId,null);assert.equal(result.progress.sourceStatus,'historical');assert.equal(result.progress.schemaVersion,'order-material-history-progress.v1');assert.ok(result.progress.rows.length>0);
  assert.ok(result.progress.rows.every(row=>row.status===null));assert.equal(result.progress.summary.fabric.states.ready+result.progress.summary.trim.states.ready,0);assert.equal(result.projectionBasis,'current-parser-on-captured-source');
  assert.equal(JSON.stringify(result).includes('protected-commercial-sentinel'),false);assert.ok(result.progress.rows.some(row=>row.purchases.some(event=>event.sourcePricing.unitPrice===20)));
  const fresh=await current(actor,{salesOrderId:a});assert.equal(fresh.status,200);if(fresh.status===200)assert.equal(fresh.body.progress.sourceStatus,'stale');
 });
 await t.test('unchanged legacy payload must get a recorded-context publication once after upgrade',async()=>{
  const upgraded=await capture();upgradeRun=upgraded.runId;assert.equal(upgraded.replayed,false);assert.notEqual(upgraded.runId,legacy);
  const detail=await history.read(actor,a,upgraded.runId);assert.equal(detail.record.identityEvidence,'recorded_context');assert.equal((await capture()).runId,upgraded.runId);
 });
 await t.test('new publication records exact scope/link/order version instead of relying on current facts later',async()=>{
  clock+=1000;price=21;ownRun=(await capture()).runId;const result=await history.read(actor,a,ownRun);assert.equal(result.record.identityEvidence,'recorded_context');assert.equal(result.record.capturedSourceOwnerOrderId,a);assert.equal(result.record.capturedOrderVersion,1);
  const stored=(await pool.query('SELECT r.order_scope,s.source_link_id::text,s.captured_order_version FROM ainuoke_source_runs r JOIN ainuoke_material_source_snapshots s ON s.run_id=r.id WHERE r.id=$1',[ownRun])).rows[0];assert.equal(stored.order_scope[0].sourceLinkId,stored.source_link_id);assert.equal(stored.order_scope[0].version,stored.captured_order_version);
 });
 const pair=[a,b].sort();const caseId=(await pool.query('INSERT INTO sales_order_normalization_cases(first_order_id,second_order_id,created_by,request_id,payload_hash) VALUES($1,$2,$3,$4,$5) RETURNING id',[...pair,actor.internalUserId,randomUUID(),'a'.repeat(64)])).rows[0].id;
 await pool.query("INSERT INTO sales_order_normalization_case_events(case_id,version,actor_id,request_id,payload_hash,event_type,reason,evidence) VALUES($1,1,$2,$3,$4,'opened','Synthetic history fixture','{}')",[caseId,actor.internalUserId,randomUUID(),'b'.repeat(64)]);
 const map=async(target:string|null)=>{const client=await pool.connect();try{
  await client.query('BEGIN');await client.query("SELECT pg_advisory_xact_lock(hashtextextended('order-effective-attribution',0))");const type=(await client.query('SELECT 1 FROM sales_order_attribution_heads LIMIT 1')).rowCount?'correct':'normalize';
  const change=(await client.query("INSERT INTO sales_order_attribution_changes(case_id,case_version,change_type,actor_id,request_id,payload_hash,evidence_hash,evidence_basis,reason) VALUES($1,1,$2,$3,$4,$5,$5,'{}','Synthetic metadata only') RETURNING id",[caseId,type,actor.internalUserId,randomUUID(),'c'.repeat(64)])).rows[0].id;
  for(const id of [a,b]){const previous=(await client.query('SELECT current_change_id,version FROM sales_order_attribution_heads WHERE sales_order_id=$1',[id])).rows[0];await client.query('INSERT INTO sales_order_attribution_members(change_id,sales_order_id,effective_order_id,previous_change_id,previous_version) VALUES($1,$2,$3,$4,$5)',[change,id,target??id,previous?.current_change_id??null,previous?.version??0]);}
  for(const id of [a,b])await writeAttributionHeadInTransaction(client,change,id);await client.query('COMMIT');return change as string;
 }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}};
 let transferredRun='',change='';
 await t.test('normalization does not redirect archive targets, move snapshots or combine quantities',async()=>{
  change=await map(b);clock+=1000;price=22;transferredRun=(await capture()).runId;
  const old=await history.read(actor,a,ownRun),later=await history.read(actor,b,transferredRun);assert.equal(old.originalOrderId,a);assert.equal(old.currentEffectiveOrderId,b);assert.equal(old.record.capturedTargetOrderId,a);assert.equal(later.record.capturedTargetOrderId,b);assert.equal(later.record.capturedSourceOwnerOrderId,a);assert.equal(later.record.capturedAttributionChangeId,change);
  assert.ok(old.progress.rows.some(row=>row.purchases.some(p=>p.sourcePricing.unitPrice===21)));assert.ok(later.progress.rows.some(row=>row.purchases.some(p=>p.sourcePricing.unitPrice===22)));
  await assert.rejects(()=>history.read(actor,b,ownRun),code('material_history_not_found'));await assert.rejects(()=>history.read(actor,a,transferredRun),code('material_history_not_found'));assert.equal((await current(actor,{salesOrderId:a})).status,404);
 });
 await t.test('complete corrective split keeps exact older publication identities',async()=>{
  await map(null);const old=await history.read(actor,b,transferredRun);assert.equal(old.currentEffectiveOrderId,b);assert.equal(old.record.capturedSourceOwnerOrderId,a);assert.equal(old.record.capturedAttributionChangeId,change);assert.equal(old.progress.sourceStatus,'historical');
  const nowA=await history.read(actor,a,ownRun);assert.equal(nowA.currentEffectiveOrderId,a);
 });
 await t.test('inside/style observations can advance while archived queries use captured discovery',async()=>{
  await pool.query("UPDATE ainuoke_sales_order_contract_mirrors SET inside_order_no='SYN-CURRENT-FACTORY',style_no='SYN-CURRENT-BUSINESS',quantity=101 WHERE sales_order_id=$1",[a]);
  await pool.query("UPDATE sales_order_source_links SET inside_order_no='SYN-CURRENT-FACTORY' WHERE sales_order_id=$1",[a]);
  const old=await history.read(actor,a,ownRun);assert.equal(old.progress.order.insideOrderNo,'SYNTHETIC-IN-OLD');assert.notEqual(old.progress.order.styleNo,'SYN-CURRENT-BUSINESS');
 });
 await t.test('delete/rebind/contract rename cannot erase source history, while color slice observations remain replaceable',async()=>{
  const link=(await pool.query('SELECT id::text FROM sales_order_source_links WHERE sales_order_id=$1',[a])).rows[0].id;
  for(const sql of ['DELETE FROM sales_order_source_links WHERE id=$1','UPDATE sales_order_source_links SET id=gen_random_uuid() WHERE id=$1',"UPDATE sales_order_source_links SET sales_contract_no='SYN-OTHER' WHERE id=$1"])await assert.rejects(()=>pool.query(sql,[link]),code('23514'));
  for(const sql of ['DELETE FROM ainuoke_sales_order_contract_mirrors WHERE sales_order_id=$1',"UPDATE ainuoke_sales_order_contract_mirrors SET source_id='foreign' WHERE sales_order_id=$1",'UPDATE ainuoke_sales_order_contract_mirrors SET sales_order_id=$2 WHERE sales_order_id=$1'])await assert.rejects(()=>pool.query(sql,[a,...(sql.includes('$2')?[b]:[])]),code('23514'));
  await pool.query('DELETE FROM ainuoke_sales_order_color_mirrors WHERE sales_order_id=$1',[a]);assert.equal((await history.read(actor,a,ownRun)).record.runId,ownRun);
 });
 await t.test('keyset pagination has no duplicate/omission and rejects a cursor belonging to another target',async()=>{
  const first=await history.list(actor,a,{limit:1,cursor:null});assert.equal(first.items.length,1);assert.equal(first.hasMore,true);const second=await history.list(actor,a,{limit:1,cursor:first.nextCursor}),third=await history.list(actor,a,{limit:1,cursor:second.nextCursor});assert.equal(second.items.length,1);assert.equal(second.hasMore,true);assert.equal(third.hasMore,false);assert.deepEqual(new Set([...first.items,...second.items,...third.items].map(row=>row.runId)),new Set([legacy,upgradeRun,ownRun]));
  await assert.rejects(()=>history.list(actor,a,{limit:1,cursor:transferredRun}),code('invalid_material_history_cursor'));assert.equal((await history.list(actor,b,{limit:1,cursor:null})).items[0].runId,transferredRun);
 });
 const corruptPool=(mutate:(query:string,result:{rows:Record<string,unknown>[]})=>void)=>new Proxy(pool,{get(target,key){if(key==='connect')return async()=>{const client=await target.connect();return new Proxy(client,{get(current,property){if(property==='query')return async(...args:unknown[])=>{const result=await (current.query as (...values:unknown[])=>Promise<{rows:Record<string,unknown>[]}>)(...args);if(typeof args[0]==='string')mutate(args[0],result);return result;};const value=Reflect.get(current,property);return typeof value==='function'?value.bind(current):value;}});};const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;}});
 await t.test('driver corruption of payload, discovery, scope or recorded version fails closed without SQL tampering',async()=>{
  for(const column of ['snapshots','discovery','order_scope']){const broken=corruptPool((query,result)=>{if(query.startsWith('SELECT r.discovery'))for(const row of result.rows)row[column]=[];});await assert.rejects(()=>createPersistedMaterialHistoryReader(broken,{sourceKey:'history-test',maxAgeMs:1000}).read(actor,a,ownRun),code('material_history_integrity_failed'));}
  const broken=corruptPool((query,result)=>{if(query.includes('AS source_link_id'))for(const row of result.rows)row.captured_order_version=999;});await assert.rejects(()=>createPersistedMaterialHistoryReader(broken,{sourceKey:'history-test',maxAgeMs:1000}).read(actor,a,ownRun),code('material_history_integrity_failed'));
  await assert.rejects(()=>pool.query("UPDATE ainuoke_source_runs SET order_scope='[]' WHERE id=$1",[ownRun]),code('23514'));
 });
 await t.test('fresh permission revocation and disabled profile protect historical reads despite cached grants',async()=>{
  await pool.query("DELETE FROM app_role_permissions WHERE role_id IN (SELECT role_id FROM app_user_roles WHERE user_id=$1) AND permission_key='ainuoke.view'",[actor.internalUserId]);
  await assert.rejects(()=>history.read(actor,a,ownRun),code('permission_denied'));await pool.query("INSERT INTO app_role_permissions SELECT role_id,'ainuoke.view' FROM app_user_roles WHERE user_id=$1",[actor.internalUserId]);
  await pool.query("UPDATE ainuoke_source_profiles SET enabled=false WHERE source_key='history-test'");await assert.rejects(()=>history.list(actor,a,{limit:20,cursor:null}),code('material_history_not_connected'));await pool.query("UPDATE ainuoke_source_profiles SET enabled=true WHERE source_key='history-test'");
 });
 await t.test('current and historical context schema cannot silently fall back when partially removed',async()=>{
  await pool.query('ALTER TABLE ainuoke_source_runs RENAME COLUMN order_scope TO synthetic_missing_scope');
  try{await assert.rejects(()=>history.read(actor,a,ownRun),code('material_history_unavailable'));assert.equal((await current(actor,{salesOrderId:a})).status,503);}
  finally{await pool.query('ALTER TABLE ainuoke_source_runs RENAME COLUMN synthetic_missing_scope TO order_scope');}
 });
 await t.test('history does not claim a capture in the future is a past fact',async()=>{
  await assert.rejects(()=>createPersistedMaterialHistoryReader(pool,{sourceKey:'history-test',maxAgeMs:1000},()=>clock-1000000).read(actor,a,ownRun),code('material_history_integrity_failed'));
 });
 await t.test('HTTP is session-only, exact-target, default disconnected and rejects request trust selectors',async()=>{
  const server=createServer(createApp({pool,orderMaterialHistory:history,allowedOrigins:['http://127.0.0.1'],security:{secureCookies:false,sessionTtlSeconds:3600}}));await new Promise<void>(done=>server.listen(0,'127.0.0.1',done));const address=server.address();assert.ok(address&&typeof address==='object');const base='http://127.0.0.1:'+address.port;
  try{
   assert.equal((await fetch(base+'/api/v1/sales-orders/'+a+'/material-history')).status,401);const login=await fetch(base+'/api/v1/auth/login',{method:'POST',headers:{Origin:'http://127.0.0.1','Content-Type':'application/json','X-Zhixu-Request':'1'},body:JSON.stringify({username:actor.username,password:'Synthetic-2026'})});const cookie=login.headers.get('set-cookie')!.split(';')[0];const get=(path:string)=>fetch(base+path,{headers:{Cookie:cookie}});
   const route='/api/v1/sales-orders/'+a+'/material-history';const listed=await get(route+'?limit=1');assert.equal(listed.status,200);assert.equal(listed.headers.get('cache-control'),'no-store');
   assert.equal((await get(route+'?sourceKey=foreign')).status,400);assert.equal((await get(route+'/'+ownRun+'?insideOrderNo=foreign')).status,400);assert.equal((await get('/api/v1/sales-orders/'+b+'/material-history/'+ownRun)).status,404);const read=await get(route+'/'+ownRun);assert.equal(read.status,200);assert.equal((await read.json()).currentStatusApplicable,false);
   assert.equal((await fetch(base+route,{method:'POST',headers:{Cookie:cookie,Origin:'http://127.0.0.1','X-Zhixu-Request':'1'},body:'{}'})).status,405);
  }finally{server.closeAllConnections();await new Promise<void>(done=>server.close(()=>done()));}
  for(const dependencies of [{pool},{pool,orderMaterialHistory:history,identityAuthority:createIdentityAuthority(pool,'local-single-user')}]){
   const server=createServer(createApp({...dependencies,allowedOrigins:['http://127.0.0.1'],security:{secureCookies:false,sessionTtlSeconds:3600}}));await new Promise<void>(done=>server.listen(0,'127.0.0.1',done));const address=server.address();assert.ok(address&&typeof address==='object');
   try{const login=await fetch('http://127.0.0.1:'+address.port+'/api/v1/auth/login',{method:'POST',headers:{Origin:'http://127.0.0.1','Content-Type':'application/json','X-Zhixu-Request':'1'},body:JSON.stringify({username:actor.username,password:'Synthetic-2026'})});const cookie=login.headers.get('set-cookie')?.split(';')[0];assert.equal((await fetch('http://127.0.0.1:'+address.port+'/api/v1/sales-orders/'+a+'/material-history',{headers:cookie?{Cookie:cookie}:{}})).status,503);}
   finally{server.closeAllConnections();await new Promise<void>(done=>server.close(()=>done()));}
  }
 });
 await t.test('read/list leave accounts, SO, snapshots and source pointers byte-for-byte unchanged',async()=>{
  const tables=['app_users','sales_orders','sales_order_source_links','ainuoke_source_runs','ainuoke_material_source_snapshots','ainuoke_source_profiles'];const snapshot=async()=>Promise.all(tables.map(async table=>(await pool.query('SELECT to_jsonb(x)::text row FROM '+table+' x ORDER BY to_jsonb(x)::text')).rows));const before=await snapshot();await history.list(actor,a,{limit:20,cursor:null});await history.read(actor,a,ownRun);assert.deepEqual(await snapshot(),before);
 });
});
