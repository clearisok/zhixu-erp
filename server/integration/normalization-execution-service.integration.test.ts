import assert from 'node:assert/strict';
import test from 'node:test';
import pg from 'pg';
import {randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import {createServer} from 'node:http';
import {startDisposablePostgres} from './postgres-container.js';
import {runMigrations} from '../db/migration-runner.js';
import {bootstrapAdmin} from '../auth/bootstrap.js';
import {synchronizePermissionCatalog} from '../auth/permissions.js';
import {loadExistingBootstrapActor} from '../sales-orders/bootstrap-runner.js';
import {createAinuokeSalesOrder} from '../sales-orders/service.js';
import {createSalesOrder,getSalesOrderById} from '../sales-orders/repository.js';
import {normalizationHash,parseAttributionProposal,type AttributionProposal} from '../sales-orders/normalization-execution-model.js';
import {createFrozenInventoryCoverageProvider,type BusinessInventoryRecord} from '../sales-orders/normalization-coverage.js';
import {previewAttributionExecution,recordAttributionReview,executeAttributionChange,readAttributionExecutionReceipt,readAttributionReviewSummary,type NormalizationExecutionPermit} from '../sales-orders/normalization-execution-service.js';
import {resolveEffectiveOrder} from '../sales-orders/effective-attribution.js';
import {createApp} from '../app.js';
import type {TrustedIdentity} from '../auth/session.js';

const code=(expected:string)=>(error:unknown)=>(error as {code?:string}).code===expected;
test('normalization execution and correction are authorized, atomic and historical',{timeout:180000},async t=>{
 const db=await startDisposablePostgres();const pool=new pg.Pool({connectionString:await db.createDatabase('normalization_execution')});
 t.after(async()=>{await pool.end();await db.stop();});await runMigrations(pool,resolve('database/migrations'));await synchronizePermissionCatalog(pool);await bootstrapAdmin(pool,{username:'synthetic-executor',displayName:'Synthetic admin',password:'Synthetic-2026'});
 const admin=await loadExistingBootstrapActor(pool,'synthetic-executor');
 const user=async(username:string,roles:string[]):Promise<TrustedIdentity>=>{const u=(await pool.query("INSERT INTO app_users(username,password_hash,display_name,role) VALUES($1,crypt('Synthetic-2026',gen_salt('bf',4)),$1,'admin') RETURNING id::text,public_id::text",[username])).rows[0];for(const role of roles){await pool.query('INSERT INTO app_roles(id,name) VALUES($1,$1) ON CONFLICT DO NOTHING',[role]);await pool.query("INSERT INTO app_role_permissions VALUES($1,'order.view') ON CONFLICT DO NOTHING",[role]);await pool.query('INSERT INTO app_user_roles VALUES($1,$2)',[u.id,role]);}return {internalUserId:u.id,userId:u.public_id,username,userName:username,permissions:['order.view']};};
 const production=await user('synthetic-production',['role-team-production-manager']),finance=await user('synthetic-finance',['role-team-finance-manager']),dual=await user('synthetic-dual-reviewer',['role-team-production-manager','role-team-finance-manager']),viewer=await user('synthetic-legacy-admin',[]);
 const facts=new Map<string,{execution:BusinessInventoryRecord[];financial:BusinessInventoryRecord[]}>();
 const expiry=new Date(Date.now()+900000).toISOString();let driftDuringRevalidation=false;let reads=0;
 const coverage=createFrozenInventoryCoverageProvider({withReadLease:async(_ids,run)=>run(),read:async(ids,target)=>{
  if(driftDuringRevalidation&&++reads===2)facts.get(ids[0])!.execution.push({id:'synthetic-concurrent-new-flow',kind:'purchase',facts:{quantity:5}});
  return {schemaVersion:'order-business-inventory.v1',targetFingerprint:target,memberOrderIds:[...ids],sourceKey:'synthetic-frozen-ledger',leaseId:'synthetic-local-lease',expiresAt:expiry,orders:ids.map(id=>{assert.ok(facts.has(id));return {id,...structuredClone(facts.get(id)!)};})};
 }});
 let serial=0;
 const pair=async(execution:'none'|'quote'|'both'='none',financial=false)=>{
  const n=++serial;const a=(await createAinuokeSalesOrder(pool,admin,{source:{sourceId:'synthetic-exec-'+n,sourceRowIdentity:'synthetic-exec-row-'+n,salesContractNo:'SYN-EXEC-'+n,insideOrderNo:'SYN-FACTORY-'+n,lifecycleStatusRaw:'生效',contractDate:'2026-10-01',contractDeliveryDate:'2026-12-01',styleNo:'SYN-STYLE-'+n,companyNameSnapshot:'Synthetic',customerNameSnapshot:'Synthetic',brandNameSnapshot:'Synthetic',quantity:100,sourceHash:'synthetic-'+n,fetchedAt:'2026-10-15T00:00:00Z'},colors:[]})).salesOrder.id;
  const b=(await createSalesOrder(pool,{creationSource:'quote'})).id;
  for(const id of [a,b])facts.set(id,{execution:[],financial:[]});
  if(execution!=='none')facts.get(b)!.execution=[{id:'synthetic-completion-'+n,kind:'completion',facts:{quantity:25}}];
  if(execution==='both')facts.get(a)!.execution=[{id:'synthetic-purchase-'+n,kind:'purchase',facts:{quantity:100}}];
  if(financial)facts.get(b)!.financial=[{id:'synthetic-frozen-closing-'+n,kind:'closing',facts:{quantity:20,locked:true,salePrice:7654321.123}}];
  const ids=[a,b].sort();const caseId=(await pool.query('INSERT INTO sales_order_normalization_cases(first_order_id,second_order_id,created_by,request_id,payload_hash) VALUES($1,$2,$3,$4,$5) RETURNING id',[...ids,admin.internalUserId,randomUUID(),'a'.repeat(64)])).rows[0].id;
  await pool.query("INSERT INTO sales_order_normalization_case_events(case_id,version,actor_id,request_id,payload_hash,event_type,reason,evidence) VALUES($1,1,$2,$3,$4,'opened','synthetic execution fixture','{}')",[caseId,admin.internalUserId,randomUUID(),'b'.repeat(64)]);
  const root=execution==='quote'?b:a;
  const proposal=parseAttributionProposal({changeType:'normalize',caseVersion:1,assignments:ids.map(id=>({originalOrderId:id,effectiveOrderId:root})),reason:'Keep original flows and continue on reviewed root',recoveryPlanHash:normalizationHash({caseId,ids,rule:'retain original business references'})});
  return {a,b,ids,caseId,root,proposal};
 };
 const prepare=async(c:Awaited<ReturnType<typeof pair>>,proposal:AttributionProposal=c.proposal)=>{
  const evidence=await previewAttributionExecution(pool,admin,c.caseId,proposal,{coverage});
  const command={requestId:randomUUID(),expectedEvidenceHash:evidence.evidenceHash,proposal};
  const permit:NormalizationExecutionPermit={caseId:c.caseId,targetFingerprint:evidence.targetFingerprint,proposalHash:evidence.proposalHash,evidenceHash:evidence.evidenceHash,backupSha256:normalizationHash({syntheticBackup:c.ids}),restoreRehearsalSha256:normalizationHash({syntheticRehearsal:c.ids}),recoveryPlanHash:proposal.recoveryPlanHash,expiresAt:expiry};
  return {evidence,command,permit};
 };
 const approve=async(c:Awaited<ReturnType<typeof pair>>,p:Awaited<ReturnType<typeof prepare>>,type:'production'|'finance',who=type==='production'?production:finance,decision:'approve'|'reject'='approve')=>recordAttributionReview(pool,who,c.caseId,{...p.command,requestId:randomUUID(),reviewType:type,decision,reason:'Synthetic reviewed complete original references'},{coverage});
 const changes=async(caseId:string)=>(await pool.query('SELECT count(*)::int AS n FROM sales_order_attribution_changes WHERE case_id=$1',[caseId])).rows[0].n;
 const original=async(ids:string[])=>(await pool.query('SELECT row_to_json(o) AS row FROM sales_orders o WHERE id=ANY($1::uuid[]) ORDER BY id',[ids])).rows;
 await t.test('default execution and missing real coverage stay closed; body cannot inject a permit',async()=>{
  const c=await pair();const p=await prepare(c);
  await assert.rejects(()=>executeAttributionChange(pool,admin,c.caseId,p.command,{coverage}),code('normalization_execution_disabled'));
  const missing=await previewAttributionExecution(pool,admin,c.caseId,c.proposal);assert.ok(missing.blockers.includes('production_finance_coverage_unavailable'));
  await assert.rejects(()=>executeAttributionChange(pool,admin,c.caseId,{...p.command,permit:p.permit},{coverage,permit:p.permit}),code('invalid_attribution_command'));
  await assert.rejects(()=>executeAttributionChange(pool,admin,c.caseId,p.command,{permit:p.permit}),code('normalization_full_evidence_changed'));assert.equal(await changes(c.caseId),0);
 });
 await t.test('operator command pause blocks a fully permitted normalization and rolls back all proof writes',async()=>{
  const c=await pair();const p=await prepare(c);const before=await original(c.ids);
  await pool.query("UPDATE sales_order_command_control SET mode='frozen',reason='Synthetic permitted normalization paused',version=version+1 WHERE singleton");
  try{await assert.rejects(()=>executeAttributionChange(pool,admin,c.caseId,p.command,{coverage,permit:p.permit}),code('order_commands_frozen'));assert.equal(await changes(c.caseId),0);assert.deepEqual(await original(c.ids),before);assert.equal((await pool.query('SELECT count(*)::int n FROM sales_order_normalization_proofs WHERE case_id=$1',[c.caseId])).rows[0].n,0);}
  finally{await pool.query("UPDATE sales_order_command_control SET mode='enabled',reason='Synthetic normalization resumed after verification',version=version+1 WHERE singleton");}
 });
 await t.test('legacy admin label/cached grants cannot execute; exact target, proposal, evidence and time are mandatory',async()=>{
  const c=await pair();const p=await prepare(c);
  await assert.rejects(()=>executeAttributionChange(pool,{...viewer,permissions:admin.permissions},c.caseId,p.command,{coverage,permit:p.permit}));
  for(const edit of [{targetFingerprint:'d'.repeat(64)},{proposalHash:'d'.repeat(64)},{evidenceHash:'d'.repeat(64)},{caseId:randomUUID()},{recoveryPlanHash:'d'.repeat(64)}])await assert.rejects(()=>executeAttributionChange(pool,admin,c.caseId,p.command,{coverage,permit:{...p.permit,...edit}}),code('normalization_execution_scope_mismatch'));
  await assert.rejects(()=>executeAttributionChange(pool,admin,c.caseId,p.command,{coverage,permit:{...p.permit,expiresAt:new Date(Date.now()-1).toISOString()}}),code('normalization_execution_permit_expired'));
  await assert.rejects(()=>executeAttributionChange(pool,admin,c.caseId,p.command,{coverage,permit:{...p.permit,backupSha256:''}}),code('normalization_execution_permit_invalid'));assert.equal(await changes(c.caseId),0);
 });
 await t.test('no execution prefers trusted SO and normalization never changes original business facts',async()=>{
  const c=await pair();const p=await prepare(c);const before=await original(c.ids);
  const outcome=await executeAttributionChange(pool,admin,c.caseId,p.command,{coverage,permit:p.permit});assert.equal(outcome.replayed,false);assert.equal((await resolveEffectiveOrder(pool,c.b)).effectiveOrderId,c.a);assert.deepEqual(await original(c.ids),before);
  assert.equal((await getSalesOrderById(pool,c.b))?.id,c.b);assert.equal((await pool.query('SELECT sales_order_id::text FROM sales_order_source_links WHERE external_id=(SELECT source_id FROM ainuoke_sales_order_contract_mirrors WHERE sales_order_id=$1)',[c.a])).rows[0].sales_order_id,c.a);
 });
 await t.test('single executed quote cannot be discarded and requires independent production review',async()=>{
  const c=await pair('quote');const p=await prepare(c);const before=await original(c.ids);
  await assert.rejects(()=>executeAttributionChange(pool,admin,c.caseId,p.command,{coverage,permit:p.permit}),code('normalization_review_required'));
  await assert.rejects(()=>approve(c,p,'production',admin),code('normalization_review_role_required'));
  await approve(c,p,'production');await executeAttributionChange(pool,admin,c.caseId,p.command,{coverage,permit:p.permit});
  assert.equal((await resolveEffectiveOrder(pool,c.a)).effectiveOrderId,c.b);assert.deepEqual(await original(c.ids),before);assert.equal((await getSalesOrderById(pool,c.b))?.salesContractNo,'SYN-EXEC-'+serial);
 });
 await t.test('dual execution and frozen history require both reviewers; no quantities or prices are merged',async()=>{
  const c=await pair('both',true);const p=await prepare(c);assert.deepEqual(p.evidence.requiredReviews,['production','finance']);assert.equal(JSON.stringify(p.evidence).includes('7654321.123'),false);
  await approve(c,p,'production');await assert.rejects(()=>executeAttributionChange(pool,admin,c.caseId,p.command,{coverage,permit:p.permit}),code('normalization_review_required'));
  await approve(c,p,'finance');const before=structuredClone(c.ids.map(id=>facts.get(id)));
  await executeAttributionChange(pool,admin,c.caseId,p.command,{coverage,permit:p.permit});assert.deepEqual(c.ids.map(id=>facts.get(id)),before);
  const summary=await readAttributionReviewSummary(pool,production,c.caseId,p.evidence.evidenceHash,p.evidence.proposalHash);assert.equal(summary.reviews.length,2);assert.equal(JSON.stringify(summary).includes('7654321.123'),false);
 });
 await t.test('a dual-role account cannot approve both domains; executor cannot substitute for a reviewer',async()=>{
  const c=await pair('both',true);const p=await prepare(c);await approve(c,p,'production',dual);
  await assert.rejects(()=>approve(c,p,'finance',dual),code('normalization_independent_reviewers_required'));
  await pool.query("INSERT INTO app_user_roles VALUES($1,'role-team-production-manager')",[admin.internalUserId]);
  try{await approve(c,p,'production',admin);await approve(c,p,'finance');await assert.rejects(()=>executeAttributionChange(pool,admin,c.caseId,p.command,{coverage,permit:p.permit}),code('normalization_independent_reviewers_required'));}
  finally{await pool.query("DELETE FROM app_user_roles WHERE user_id=$1 AND role_id='role-team-production-manager'",[admin.internalUserId]);}
 });
 await t.test('latest rejection and current reviewer-role revocation invalidate prior approvals',async()=>{
  const c=await pair('quote');const p=await prepare(c);await approve(c,p,'production');await approve(c,p,'production',production,'reject');
  await assert.rejects(()=>executeAttributionChange(pool,admin,c.caseId,p.command,{coverage,permit:p.permit}),code('normalization_review_required'));await approve(c,p,'production');
  await pool.query("DELETE FROM app_user_roles WHERE user_id=$1 AND role_id='role-team-production-manager'",[production.internalUserId]);
  try{await assert.rejects(()=>executeAttributionChange(pool,admin,c.caseId,p.command,{coverage,permit:p.permit}),code('normalization_reviewer_authorization_changed'));}finally{await pool.query("INSERT INTO app_user_roles VALUES($1,'role-team-production-manager')",[production.internalUserId]);}
  await assert.rejects(()=>executeAttributionChange(pool,admin,c.caseId,p.command,{coverage,permit:p.permit}),code('normalization_reviewer_authorization_changed'));
  await approve(c,p,'production');await executeAttributionChange(pool,admin,c.caseId,p.command,{coverage,permit:p.permit});assert.equal(await changes(c.caseId),1);
 });
 await t.test('source row or external inventory change requires fresh evidence and fresh approvals',async()=>{
  const c=await pair('quote');const p=await prepare(c);await approve(c,p,'production');
  await pool.query("UPDATE ainuoke_sales_order_contract_mirrors SET source_hash='synthetic-new-hash' WHERE sales_order_id=$1",[c.a]);
  await assert.rejects(()=>executeAttributionChange(pool,admin,c.caseId,p.command,{coverage,permit:p.permit}),code('normalization_full_evidence_changed'));
  const next=await prepare(c);await assert.rejects(()=>executeAttributionChange(pool,admin,c.caseId,next.command,{coverage,permit:next.permit}),code('normalization_review_required'));
  await approve(c,next,'production');facts.get(c.b)!.execution[0].facts.quantity=26;
  await assert.rejects(()=>executeAttributionChange(pool,admin,c.caseId,next.command,{coverage,permit:next.permit}),code('normalization_full_evidence_changed'));assert.equal(await changes(c.caseId),0);
 });
 await t.test('review request is immutable, exact retry is idempotent, and audit failure rolls back proof/review',async()=>{
  const c=await pair('quote');const p=await prepare(c);const raw={...p.command,requestId:randomUUID(),reviewType:'production',decision:'approve',reason:'Synthetic'};
  const first=await recordAttributionReview(pool,production,c.caseId,raw,{coverage}),again=await recordAttributionReview(pool,production,c.caseId,raw,{coverage});assert.equal(first.reviewId,again.reviewId);assert.equal(again.replayed,true);
  await assert.rejects(()=>recordAttributionReview(pool,production,c.caseId,{...raw,reason:'changed'},{coverage}),code('normalization_review_retry_mismatch'));
  await assert.rejects(()=>pool.query("UPDATE sales_order_normalization_reviews SET decision='reject' WHERE id=$1",[first.reviewId]));await assert.rejects(()=>pool.query('DELETE FROM sales_order_normalization_proofs WHERE id=$1',[first.proofId]));
  const other=await pair('quote');const op=await prepare(other);
  await pool.query("CREATE FUNCTION synthetic_review_audit_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.entity_type='OrderNormalizationCase' AND NEW.metadata ? 'reviewId' THEN RAISE EXCEPTION 'synthetic review audit fault'; END IF; RETURN NEW; END $$; CREATE TRIGGER synthetic_review_audit_fault BEFORE INSERT ON operation_logs FOR EACH ROW EXECUTE FUNCTION synthetic_review_audit_fault()");
  try{await assert.rejects(()=>approve(other,op,'production'));assert.equal((await pool.query('SELECT count(*)::int n FROM sales_order_normalization_proofs WHERE case_id=$1',[other.caseId])).rows[0].n,0);}finally{await pool.query('DROP TRIGGER synthetic_review_audit_fault ON operation_logs');await pool.query('DROP FUNCTION synthetic_review_audit_fault()');}
 });
 await t.test('late execute audit failure rolls back proof, ledger and every head; exact retry can succeed',async()=>{
  const c=await pair();const p=await prepare(c);
  await pool.query("CREATE FUNCTION synthetic_execute_audit_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.entity_type='OrderNormalizationCase' AND NEW.metadata ? 'changeId' THEN RAISE EXCEPTION 'synthetic execute audit fault'; END IF; RETURN NEW; END $$; CREATE TRIGGER synthetic_execute_audit_fault BEFORE INSERT ON operation_logs FOR EACH ROW EXECUTE FUNCTION synthetic_execute_audit_fault()");
  try{await assert.rejects(()=>executeAttributionChange(pool,admin,c.caseId,p.command,{coverage,permit:p.permit}));assert.equal(await changes(c.caseId),0);assert.equal((await resolveEffectiveOrder(pool,c.b)).historicalDuplicate,false);assert.equal((await pool.query('SELECT count(*)::int n FROM sales_order_normalization_proofs WHERE case_id=$1',[c.caseId])).rows[0].n,0);}finally{await pool.query('DROP TRIGGER synthetic_execute_audit_fault ON operation_logs');await pool.query('DROP FUNCTION synthetic_execute_audit_fault()');}
  await executeAttributionChange(pool,admin,c.caseId,p.command,{coverage,permit:p.permit});assert.equal(await changes(c.caseId),1);
 });
 await t.test('external revalidation failure at transaction end rolls back already-proposed heads',async()=>{
  const c=await pair();const p=await prepare(c);driftDuringRevalidation=true;reads=0;
  try{await assert.rejects(()=>executeAttributionChange(pool,admin,c.caseId,p.command,{coverage,permit:p.permit}),code('normalization_external_coverage_changed'));assert.equal(await changes(c.caseId),0);assert.equal((await resolveEffectiveOrder(pool,c.b)).historicalDuplicate,false);}finally{driftDuringRevalidation=false;}
 });
 await t.test('concurrent exact requests yield one change; different requests cannot repeat the original normalization',async()=>{
  const c=await pair();const p=await prepare(c);const results=await Promise.all([executeAttributionChange(pool,admin,c.caseId,p.command,{coverage,permit:p.permit}),executeAttributionChange(pool,admin,c.caseId,p.command,{coverage,permit:p.permit})]);assert.equal(results[0].changeId,results[1].changeId);assert.equal(results.filter(row=>row.replayed).length,1);assert.equal(await changes(c.caseId),1);
  await assert.rejects(()=>executeAttributionChange(pool,admin,c.caseId,{...p.command,requestId:randomUUID()},{coverage,permit:p.permit}));
  await assert.rejects(()=>executeAttributionChange(pool,admin,c.caseId,{...p.command,proposal:{...p.command.proposal,reason:'different'}},{coverage,permit:p.permit}),code('normalization_execution_scope_mismatch'));
 });
 await t.test('lost COMMIT response reconciles the immutable receipt instead of making another change',async()=>{
  const c=await pair();const p=await prepare(c);let lost=false;
  const wrapped=new Proxy(pool,{get(target,key){if(key==='connect')return async()=>{const client=await target.connect();return new Proxy(client,{get(current,property){if(property==='query')return async(...args:unknown[])=>{const result=await (current.query as (...values:unknown[])=>Promise<unknown>)(...args);if(args[0]==='COMMIT'&&!lost){lost=true;throw Object.assign(new Error('synthetic lost COMMIT'),{code:'ECONNRESET'});}return result;};const value=Reflect.get(current,property);return typeof value==='function'?value.bind(current):value;}});};const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;}});
  await assert.rejects(()=>executeAttributionChange(wrapped,admin,c.caseId,p.command,{coverage,permit:p.permit}),code('ECONNRESET'));const receipt=await readAttributionExecutionReceipt(pool,admin,p.command.requestId);assert.equal((await executeAttributionChange(pool,admin,c.caseId,p.command,{coverage,permit:p.permit})).changeId,receipt.changeId);assert.equal(await changes(c.caseId),1);
 });
 await t.test('new execution after normalization invalidates correction; reviewed correction preserves original histories',async()=>{
  const c=await pair('quote');const p=await prepare(c);await approve(c,p,'production');const first=await executeAttributionChange(pool,admin,c.caseId,p.command,{coverage,permit:p.permit});
  const correction=parseAttributionProposal({...c.proposal,changeType:'correct',assignments:c.ids.map(id=>({originalOrderId:id,effectiveOrderId:id})),reason:'Reviewed split preserving all old flows'});const cp=await prepare(c,correction);await approve(c,cp,'production');
  facts.get(c.b)!.execution.push({id:'synthetic-after-normalization',kind:'completion',facts:{quantity:5}});
  await assert.rejects(()=>executeAttributionChange(pool,admin,c.caseId,cp.command,{coverage,permit:cp.permit}),code('normalization_full_evidence_changed'));assert.equal(await changes(c.caseId),1);
  const fresh=await prepare(c,correction);await approve(c,fresh,'production');const next=await executeAttributionChange(pool,admin,c.caseId,fresh.command,{coverage,permit:fresh.permit});assert.notEqual(first.changeId,next.changeId);assert.equal((await resolveEffectiveOrder(pool,c.a)).effectiveOrderId,c.a);assert.equal((await pool.query('SELECT count(*)::int n FROM sales_order_attribution_members WHERE change_id=$1',[first.changeId])).rows[0].n,2);assert.equal(facts.get(c.b)!.execution.length,2);
 });
 await t.test('complete prior groups and lineage remain mandatory in the public execution service',async()=>{
  const c=await pair();const third=(await createSalesOrder(pool,{creationSource:'manual'})).id;facts.set(third,{execution:[],financial:[]});
  const all=parseAttributionProposal({...c.proposal,assignments:[...c.proposal.assignments,{originalOrderId:third,effectiveOrderId:c.a}]});
  const p=await prepare(c,all);await executeAttributionChange(pool,admin,c.caseId,p.command,{coverage,permit:p.permit});
  const partial=parseAttributionProposal({...c.proposal,changeType:'correct',assignments:c.ids.map(id=>({originalOrderId:id,effectiveOrderId:id}))});
  await assert.rejects(()=>previewAttributionExecution(pool,admin,c.caseId,partial,{coverage}),code('attribution_complete_group_required'));
  const cycle=await pair();await pool.query("INSERT INTO sales_order_identity_profiles(sales_order_id,business_type,lineage,reference_order_id) VALUES($1,'ainuoke_contract','reorder',$2)",[cycle.a,cycle.b]);
  const cp=await prepare(cycle);assert.ok(cp.evidence.blockers.includes('lineage_cycle_after_attribution'));
  await assert.rejects(()=>executeAttributionChange(pool,admin,cycle.caseId,cp.command,{coverage,permit:cp.permit}),code('normalization_evidence_blocked'));assert.equal(await changes(cycle.caseId),0);
 });
 await t.test('frozen source lease stays held through actual database COMMIT',async()=>{
  const c=await pair();let held=false,committedWhileHeld=false;
  const leased=createFrozenInventoryCoverageProvider({withReadLease:async(_ids,run)=>{assert.equal(held,false);held=true;try{return await run();}finally{held=false;}},read:async(ids,target)=>{assert.equal(held,true);return {schemaVersion:'order-business-inventory.v1',targetFingerprint:target,memberOrderIds:[...ids],sourceKey:'synthetic-held-lease',leaseId:'synthetic-scope-lease',expiresAt:expiry,orders:ids.map(id=>({id,...structuredClone(facts.get(id)!)}))};}});
  const evidence=await previewAttributionExecution(pool,admin,c.caseId,c.proposal,{coverage:leased});const command={requestId:randomUUID(),expectedEvidenceHash:evidence.evidenceHash,proposal:c.proposal};
  const permit={caseId:c.caseId,targetFingerprint:evidence.targetFingerprint,proposalHash:evidence.proposalHash,evidenceHash:evidence.evidenceHash,backupSha256:'a'.repeat(64),restoreRehearsalSha256:'b'.repeat(64),recoveryPlanHash:c.proposal.recoveryPlanHash,expiresAt:expiry};
  const wrapped=new Proxy(pool,{get(target,key){if(key==='connect')return async()=>{const client=await target.connect();return new Proxy(client,{get(current,property){if(property==='query')return async(...args:unknown[])=>{if(args[0]==='COMMIT')committedWhileHeld=held;return (current.query as (...values:unknown[])=>Promise<unknown>)(...args);};const value=Reflect.get(current,property);return typeof value==='function'?value.bind(current):value;}});};const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;}});
  await executeAttributionChange(wrapped,admin,c.caseId,command,{coverage:leased,permit});assert.equal(committedWhileHeld,true);assert.equal(held,false);assert.equal(await changes(c.caseId),1);
 });
 await t.test('withdrawn/version-changed case cannot execute an old proof',async()=>{
  const c=await pair();const p=await prepare(c);await pool.query("INSERT INTO sales_order_normalization_case_events(case_id,version,actor_id,request_id,payload_hash,event_type,reason,evidence) VALUES($1,2,$2,$3,$4,'withdrawn','synthetic withdrawal','{}')",[c.caseId,admin.internalUserId,randomUUID(),'c'.repeat(64)]);await assert.rejects(()=>executeAttributionChange(pool,admin,c.caseId,p.command,{coverage,permit:p.permit}),code('normalization_case_version_conflict'));
 });
 await t.test('local no-auth authority cannot arm normalization even with a real admin anchor and permit',async()=>{
  const c=await pair();const p=await prepare(c);const origin='http://synthetic-noauth.invalid';
  const server=createServer(createApp({pool,allowedOrigins:[origin],identityAuthority:{mode:'local-single-user',resolve:async()=>admin,verify:async()=>undefined},normalizationExecution:{coverage,permit:p.permit}}));
  await new Promise<void>(done=>server.listen(0,'127.0.0.1',done));const address=server.address();assert.ok(address&&typeof address==='object');
  try{const response=await fetch('http://127.0.0.1:'+address.port+'/api/v1/order-normalization-cases/'+c.caseId+'/execute',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','X-Zhixu-Request':'1'},body:JSON.stringify(p.command)});assert.equal(response.status,410);assert.equal((await response.json()).error.code,'order_workflow_retired');assert.equal(await changes(c.caseId),0);}finally{await new Promise<void>((done,reject)=>server.close(error=>error?reject(error):done()));}
 });
 await t.test('retired HTTP execution cannot be enabled by permits; historical private receipts remain protected',async()=>{
  const c=await pair('quote');const p=await prepare(c);const origin='http://synthetic-normalization.invalid';
  const start=async(enabled:boolean)=>{const server=createServer(createApp({pool,allowedOrigins:[origin],security:{secureCookies:false,sessionTtlSeconds:3600},normalizationExecution:enabled?{coverage,permit:p.permit}:{coverage}}));await new Promise<void>(done=>server.listen(0,'127.0.0.1',done));const address=server.address();assert.ok(address&&typeof address==='object');return {server,base:'http://127.0.0.1:'+address.port};};
  const app=await start(true),disabled=await start(false);
  const headers={Origin:origin,'Content-Type':'application/json','X-Zhixu-Request':'1'};const path='/api/v1/order-normalization-cases/'+c.caseId;
  const login=async(base:string,username:string)=>{const response=await fetch(base+'/api/v1/auth/login',{method:'POST',headers,body:JSON.stringify({username,password:'Synthetic-2026'})});assert.equal(response.status,200);return response.headers.get('set-cookie')!.split(';')[0];};
  try{const adminCookie=await login(app.base,admin.username),prodCookie=await login(app.base,production.username),viewerCookie=await login(app.base,viewer.username);
   const request=(base:string,suffix:string,cookie:string,body:object,extra={})=>fetch(base+path+suffix,{method:'POST',headers:{...headers,Cookie:cookie,...extra},body:JSON.stringify(body)});
   assert.equal((await fetch(app.base+path+'/attribution-preview',{method:'POST',headers,body:JSON.stringify({proposal:c.proposal})})).status,401);
   assert.equal((await request(app.base,'/execute',adminCookie,p.command,{Origin:'http://evil.invalid'})).status,403);
   assert.equal((await request(app.base,'/execute',adminCookie,p.command,{'X-Zhixu-Request':'0'})).status,403);
   assert.equal((await request(app.base,'/execute',viewerCookie,p.command)).status,403);
   assert.equal((await request(disabled.base,'/execute',adminCookie,p.command)).status,410);
   assert.equal((await request(app.base,'/execute',adminCookie,{...p.command,verified:true})).status,410);
   const raw={...p.command,reviewType:'production',decision:'approve',reason:'Synthetic HTTP review'};assert.equal((await request(app.base,'/reviews',adminCookie,raw)).status,410);assert.equal((await request(app.base,'/reviews',prodCookie,raw)).status,410);
   const response=await request(app.base,'/execute',adminCookie,p.command);assert.equal(response.status,410);assert.equal(await changes(c.caseId),0);await approve(c,p,'production');const receipt=(await executeAttributionChange(pool,admin,c.caseId,p.command,{coverage,permit:p.permit})).changeId;
   const observed=await fetch(app.base+'/api/v1/order-attribution-receipts/'+p.command.requestId,{headers:{Cookie:adminCookie}});assert.equal(observed.status,200);assert.equal((await observed.json()).changeId,receipt);
   assert.equal((await fetch(app.base+'/api/v1/order-attribution-receipts/'+p.command.requestId,{headers:{Cookie:prodCookie}})).status,403);
  }finally{for(const server of [app.server,disabled.server])await new Promise<void>((done,reject)=>server.close(error=>error?reject(error):done()));}
 });
});
