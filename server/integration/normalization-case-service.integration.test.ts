import { createServer } from 'node:http';
import { createApp } from '../app.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import pg from 'pg';
import { startDisposablePostgres } from './postgres-container.js';
import { runMigrations } from '../db/migration-runner.js';
import { createSalesOrder } from '../sales-orders/repository.js';
import { previewOrderNormalization } from '../sales-orders/normalization-preview.js';
import { openNormalizationCase, appendNormalizationCaseEvent, readNormalizationCase, listNormalizationCases } from '../sales-orders/normalization-case-service.js';
import { parseCaseOpen, parseCaseEvent } from '../sales-orders/normalization-case-model.js';
import type { TrustedIdentity } from '../auth/session.js';
import { HttpError } from '../http/errors.js';
const conflict=(code:string)=>(error:unknown)=>error instanceof HttpError&&error.status===409&&error.code===code;
test('normalization case service transactional synthetic lifecycle',{timeout:180000},async t=>{
 const db=await startDisposablePostgres();const pool=new pg.Pool({connectionString:await db.createDatabase('case_service')});
 t.after(async()=>{await pool.end();await db.stop();});await runMigrations(pool,resolve('database/migrations'));
 await pool.query("INSERT INTO app_roles(id,name) VALUES('role-server-admin','Synthetic admin')");
 await pool.query("INSERT INTO app_permissions(key,module,label,description) VALUES('order.view','order','view','synthetic')");
 await pool.query("INSERT INTO app_role_permissions(role_id,permission_key) VALUES('role-server-admin','order.view')");
 const user=async(name:string)=>{const u=(await pool.query("INSERT INTO app_users(username,password_hash,display_name,role) VALUES($1,crypt('synthetic',gen_salt('bf',4)),'Synthetic','viewer') RETURNING id::text,public_id::text",[name])).rows[0];await pool.query("INSERT INTO app_user_roles VALUES($1,'role-server-admin')",[u.id]);return {internalUserId:u.id,userId:u.public_id,username:name,userName:'Synthetic',permissions:['order.view']} as TrustedIdentity;};
 const actor=await user('synthetic-case-owner'),other=await user('synthetic-case-other');
 const pair=async()=>Promise.all([createSalesOrder(pool,{creationSource:'manual'}),createSalesOrder(pool,{creationSource:'manual'})]).then(orders=>orders.map(o=>o.id));
 const open=async(ids:string[],who=actor)=>{const preview=await previewOrderNormalization(pool,who,ids);return {requestId:randomUUID(),orderIds:ids,expectedReviewHash:preview.reviewHash,reason:'Synthetic duplicate review'};};
 const ids=await pair();const command=await open(ids);let caseId='';
 await t.test('strict commands cannot inject evidence, execute, owner or merge flags',()=>{
  for(const key of ['evidence','executionAuthorized','effectiveOrderId','actorId','execute'])assert.throws(()=>parseCaseOpen({...command,[key]:true}));
  for(const eventType of ['opened','executed','merged','resolved'])assert.throws(()=>parseCaseEvent({requestId:randomUUID(),expectedVersion:1,eventType,reason:'Synthetic'}));
  for(const reason of ['', '  ', 'x'.repeat(2001)])assert.throws(()=>parseCaseOpen({...command,reason}));
 });
 await t.test('opening stores fresh server evidence and immutable retry result without creating SOs',async()=>{
  const before=(await pool.query('SELECT row_to_json(o) AS row FROM sales_orders o ORDER BY id')).rows;
  const first=await openNormalizationCase(pool,actor,command);caseId=first.caseId;
  assert.deepEqual(await openNormalizationCase(pool,actor,command),first);
  const read=await readNormalizationCase(pool,actor,caseId);assert.equal(read.case.version,1);assert.equal(read.events.length,1);
  assert.equal(read.events[0].evidence.assessment.disposition,'coverage_incomplete');assert.equal(read.events[0].evidence.assessment.executionAuthorized,false);
  assert.deepEqual((await pool.query('SELECT row_to_json(o) AS row FROM sales_orders o ORDER BY id')).rows,before);
  assert.equal((await pool.query("SELECT count(*)::int n FROM operation_logs WHERE entity_type='OrderNormalizationCase' AND entity_id=$1",[caseId])).rows[0].n,1);
  await assert.rejects(()=>openNormalizationCase(pool,actor,{...command,reason:'Different'}),conflict('normalization_request_mismatch'));
 });
 await t.test('canonical pair prevents reverse-order or different-actor duplicate cases',async()=>{
  const draft=await open([...ids].reverse(),other);await assert.rejects(()=>openNormalizationCase(pool,other,draft),conflict('normalization_case_already_exists'));
 });
 await t.test('stale preview blocks opening and retains the request for safe corrected retry',async()=>{
  const target=await pair(),draft=await open(target);await createSalesOrder(pool,{creationSource:'reorder',sourceOrderId:target[0]});
  await assert.rejects(()=>openNormalizationCase(pool,actor,draft),conflict('normalization_preview_changed'));
  assert.equal((await pool.query('SELECT count(*)::int n FROM sales_order_normalization_cases WHERE request_id=$1',[draft.requestId])).rows[0].n,0);
 });
 await t.test('two concurrent identical opening requests return one receipt and one audit',async()=>{
  const draft=await open(await pair());const receipts=await Promise.all([openNormalizationCase(pool,actor,draft),openNormalizationCase(pool,actor,draft)]);
  assert.deepEqual(receipts[0],receipts[1]);assert.equal((await pool.query("SELECT count(*)::int n FROM operation_logs WHERE entity_type='OrderNormalizationCase' AND entity_id=$1",[receipts[0].caseId])).rows[0].n,1);
 });
 await t.test('concurrent different operators opening one pair cannot make two cases',async()=>{
  const target=await pair();const a=await open(target),b=await open(target,other);
  const results=await Promise.allSettled([openNormalizationCase(pool,actor,a),openNormalizationCase(pool,other,b)]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.equal((await pool.query('SELECT count(*)::int n FROM sales_order_normalization_cases WHERE first_order_id=$1 AND second_order_id=$2',[...target].sort())).rows[0].n,1);
 });
 await t.test('concurrent append CAS, request replay and payload conflict are independent',async()=>{
  const note={requestId:randomUUID(),expectedVersion:1,eventType:'review_note',reason:'Synthetic note'};
  const results=await Promise.allSettled([appendNormalizationCaseEvent(pool,actor,caseId,note),appendNormalizationCaseEvent(pool,other,caseId,{...note,requestId:randomUUID()})]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  const winner=results.findIndex(r=>r.status==='fulfilled');const current=await readNormalizationCase(pool,actor,caseId);assert.equal(current.case.version,2);
  if(winner===0){assert.deepEqual(await appendNormalizationCaseEvent(pool,actor,caseId,note),(results[0] as PromiseFulfilledResult<unknown>).value);await assert.rejects(()=>appendNormalizationCaseEvent(pool,actor,caseId,{...note,reason:'Changed'}),conflict('normalization_request_mismatch'));}
 });
 await t.test('withdrawal and reopening append history and never execute normalization',async()=>{
  await appendNormalizationCaseEvent(pool,actor,caseId,{requestId:randomUUID(),expectedVersion:2,eventType:'withdrawn',reason:'Wrong pair'});
  assert.equal((await readNormalizationCase(pool,actor,caseId)).case.state,'withdrawn');
  await assert.rejects(()=>appendNormalizationCaseEvent(pool,actor,caseId,{requestId:randomUUID(),expectedVersion:3,eventType:'review_note',reason:'Forbidden'}),conflict('normalization_case_state_conflict'));
  await appendNormalizationCaseEvent(pool,actor,caseId,{requestId:randomUUID(),expectedVersion:3,eventType:'reopened',reason:'New evidence'});
  const read=await readNormalizationCase(pool,actor,caseId);assert.equal(read.case.version,4);assert.equal(read.events.length,4);assert.equal(read.executionAuthorized,false);
  assert.equal((await listNormalizationCases(pool,actor,{offset:0,search:'',includeWithdrawn:false})).items.some(r=>r.id===caseId),true);
 });
 await t.test('late audit failure rolls back case and event together',async()=>{
  const draft=await open(await pair());
  await pool.query("CREATE FUNCTION reject_synthetic_case_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.entity_type='OrderNormalizationCase' THEN RAISE EXCEPTION 'synthetic audit failure'; END IF; RETURN NEW; END $$");
  await pool.query('CREATE TRIGGER synthetic_case_audit_failure BEFORE INSERT ON operation_logs FOR EACH ROW EXECUTE FUNCTION reject_synthetic_case_audit()');
  await assert.rejects(()=>openNormalizationCase(pool,actor,draft),/synthetic audit failure/);
  assert.equal((await pool.query('SELECT count(*)::int n FROM sales_order_normalization_cases WHERE request_id=$1',[draft.requestId])).rows[0].n,0);
  assert.equal((await pool.query('SELECT count(*)::int n FROM sales_order_normalization_case_events WHERE request_id=$1',[draft.requestId])).rows[0].n,0);
  await pool.query('DROP TRIGGER synthetic_case_audit_failure ON operation_logs');await pool.query('DROP FUNCTION reject_synthetic_case_audit()');
  assert.equal((await openNormalizationCase(pool,actor,draft)).version,1);
 });
 await t.test('append audit failure also preserves previous version and permits exact retry',async()=>{
  const before=await readNormalizationCase(pool,actor,caseId);const note={requestId:randomUUID(),expectedVersion:before.case.version,eventType:'review_note',reason:'Audit test'};
  await pool.query("CREATE FUNCTION reject_synthetic_append_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.entity_type='OrderNormalizationCase' THEN RAISE EXCEPTION 'synthetic append audit failure'; END IF; RETURN NEW; END $$");
  await pool.query('CREATE TRIGGER synthetic_append_audit_failure BEFORE INSERT ON operation_logs FOR EACH ROW EXECUTE FUNCTION reject_synthetic_append_audit()');
  await assert.rejects(()=>appendNormalizationCaseEvent(pool,actor,caseId,note),/synthetic append audit failure/);assert.equal((await readNormalizationCase(pool,actor,caseId)).case.version,before.case.version);
  await pool.query('DROP TRIGGER synthetic_append_audit_failure ON operation_logs');await pool.query('DROP FUNCTION reject_synthetic_append_audit()');
  const after=await appendNormalizationCaseEvent(pool,actor,caseId,note);assert.deepEqual(await appendNormalizationCaseEvent(pool,actor,caseId,note),after);
 });
 await t.test('history pagination and withdrawn list filter preserve all evidence',async()=>{
  const target=await pair();const receipt=await openNormalizationCase(pool,actor,await open(target));
  for(let version=1;version<=21;version++)await appendNormalizationCaseEvent(pool,actor,receipt.caseId,{requestId:randomUUID(),expectedVersion:version,eventType:'review_note',reason:'Synthetic pagination '+version});
  const page1=await readNormalizationCase(pool,actor,receipt.caseId);assert.equal(page1.events.length,20);assert.equal(page1.hasMore,true);
  const page2=await readNormalizationCase(pool,actor,receipt.caseId,page1.nextOffset!);assert.equal(page2.events.length,2);assert.equal(page2.hasMore,false);
  assert.equal(new Set([...page1.events,...page2.events].map(e=>e.id)).size,22);
  await appendNormalizationCaseEvent(pool,actor,receipt.caseId,{requestId:randomUUID(),expectedVersion:22,eventType:'withdrawn',reason:'Exclude from active review'});
  const source=(await pool.query('SELECT order_no FROM sales_orders WHERE id=$1',[target[0]])).rows[0].order_no;
  assert.equal((await listNormalizationCases(pool,actor,{offset:0,search:source,includeWithdrawn:false})).items.length,0);
  assert.equal((await listNormalizationCases(pool,actor,{offset:0,search:source,includeWithdrawn:true})).items[0].id,receipt.caseId);
 });
 await t.test('retired case HTTP preserves history reads and rejects every public write',async()=>{
  const origin='http://case-http.invalid',server=createServer(createApp({pool,allowedOrigins:[origin],security:{secureCookies:false,sessionTtlSeconds:3600}}));
  await new Promise<void>(done=>server.listen(0,'127.0.0.1',done));const address=server.address();assert.ok(address&&typeof address==='object');const base='http://127.0.0.1:'+address.port,path='/api/v1/order-normalization-cases';
  const headers={Origin:origin,'Content-Type':'application/json','X-Zhixu-Request':'1'};
  try{
   assert.equal((await fetch(base+path)).status,401);
   const login=await fetch(base+'/api/v1/auth/login',{method:'POST',headers,body:JSON.stringify({username:actor.username,password:'synthetic'})});assert.equal(login.status,200);const Cookie=login.headers.get('set-cookie')!.split(';')[0];
   const req=(url:string,method='GET',body?:object,extra:Record<string,string>={})=>fetch(base+url,{method,headers:{...headers,Cookie,...extra},...(body?{body:JSON.stringify(body)}:{})});
   const draft=await open(await pair());const result=await openNormalizationCase(pool,actor,draft);const before=await readNormalizationCase(pool,actor,result.caseId);const created=await req(path,'POST',draft);assert.equal(created.status,410);assert.equal((await created.json()).error.code,'order_workflow_retired');
   const detail=await req(path+'/'+result.caseId);assert.equal(detail.status,200);assert.equal(detail.headers.get('cache-control'),'no-store');
   assert.equal((await detail.json()).executionAuthorized,false);
   for(const query of ['execute=true','offset=-1','offset=1&offset=2','includeWithdrawn=1','search=x&search=y'])assert.equal((await req(path+'?'+query)).status,400);
   assert.equal((await req(path+'/'+result.caseId+'?search=forged')).status,400);
   assert.equal((await req(path,'POST',{...draft,evidence:{execution:{coverage:'verified',count:0}}})).status,410);
   assert.equal((await req(path,'POST',draft,{Origin:'http://evil.invalid'})).status,403);
   const note={requestId:randomUUID(),expectedVersion:1,eventType:'review_note',reason:'HTTP note'};
   const written=await req(path+'/'+result.caseId+'/events','POST',note);assert.equal(written.status,410);
   const mixedPath='/api/v1/Order-normalization-cases/'+result.caseId+'/events';
   assert.equal((await fetch(base+mixedPath,{method:'POST',headers,body:JSON.stringify(note)})).status,401);
   assert.equal((await req(mixedPath,'POST',note,{Origin:'http://evil.invalid'})).status,403);
   assert.equal((await req(mixedPath,'POST',note,{'X-Zhixu-Request':'0'})).status,403);
   const history=await req('/API/V1/ORDER-NORMALIZATION-CASES/'+result.caseId);assert.equal(history.status,200);
   const ledgers=['sales_order_normalization_cases','sales_order_normalization_case_events','sales_order_attribution_changes','operation_logs'];
   const snapshot=()=>Promise.all(ledgers.map(table=>pool.query(`SELECT row_to_json(r) AS row FROM ${table} r ORDER BY id`).then(r=>r.rows)));
   const ledgerBefore=await snapshot();
   const variants:[string,string,object][]=[
    [mixedPath,'POST',note],
    [path.toUpperCase(),'POST',draft],
    ['/Api/V1/oRdEr-NoRmAlIzAtIoN-CaSeS/'+result.caseId+'/EVENTS','POST',note],
    [path.toUpperCase()+'/'+result.caseId,'DELETE',{}],
    ...['attribution-preview','review-proposals','reviews','execute'].map(action=>[path.toUpperCase()+'/'+result.caseId+'/'+action,'POST',{}] as [string,string,object]),
    ['/API/V1/ORDER-NORMALIZATION-WORKSPACE/proposals/'+result.caseId+'/reviews','POST',{}],
   ];
   for(const [url,method,body] of variants){
    const retired=await req(url,method,body);
    assert.equal(retired.status,410,`${method} ${url}; case version ${(await readNormalizationCase(pool,actor,result.caseId)).case.version}`);
    assert.equal((await retired.json()).error.code,'order_workflow_retired');
   }
   assert.deepEqual(await snapshot(),ledgerBefore);
   await pool.query("DELETE FROM app_role_permissions WHERE role_id='role-server-admin' AND permission_key='order.view'");
   try{assert.equal((await req(mixedPath,'POST',note)).status,403);}finally{await pool.query("INSERT INTO app_role_permissions(role_id,permission_key) VALUES('role-server-admin','order.view')");}
   assert.equal((await req(path+'/'+result.caseId+'/events','POST',{...note,requestId:randomUUID(),eventType:'executed',expectedVersion:2})).status,410);
   assert.equal((await req(path+'/'+result.caseId+'/events')).status,405);
   assert.equal((await req(path+'/'+result.caseId,'DELETE')).status,410);
   const closed=await req(path+'/'+result.caseId+'/execute','POST',{});assert.equal(closed.status,410);assert.equal((await closed.json()).error.code,'order_workflow_retired');
   assert.equal((await req(path,'POST',{...draft,reason:'x'.repeat(9000)})).status,410);assert.deepEqual(await readNormalizationCase(pool,actor,result.caseId),before);
   await pool.query('UPDATE app_users SET active=false WHERE id=$1',[actor.internalUserId]);assert.equal((await req(path)).status,401);await pool.query('UPDATE app_users SET active=true WHERE id=$1',[actor.internalUserId]);
  }finally{await new Promise<void>((done,reject)=>server.close(error=>error?reject(error):done()));}
 });
 await t.test('stale actor grants cannot read or retry after administrator role revocation',async()=>{
  await pool.query("DELETE FROM app_user_roles WHERE user_id=$1 AND role_id='role-server-admin'",[actor.internalUserId]);
  await assert.rejects(()=>readNormalizationCase(pool,actor,caseId));await assert.rejects(()=>openNormalizationCase(pool,actor,command));
  await assert.rejects(()=>listNormalizationCases(pool,actor,{offset:0,search:'',includeWithdrawn:true}));
 });
});
