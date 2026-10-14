import assert from 'node:assert/strict';
import test from 'node:test';
import pg from 'pg';
import {randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import {startDisposablePostgres} from './postgres-container.js';
import {runMigrations} from '../db/migration-runner.js';
import {createAinuokeSalesOrder} from '../sales-orders/service.js';
import {createSalesOrder} from '../sales-orders/repository.js';
import {bootstrapAdmin} from '../auth/bootstrap.js';
import {synchronizePermissionCatalog} from '../auth/permissions.js';
import {loadExistingBootstrapActor} from '../sales-orders/bootstrap-runner.js';
import {collectFullNormalizationEvidence,normalizationTargetFingerprint} from '../sales-orders/normalization-full-evidence.js';
import {collectNormalizationEvidenceInTransaction} from '../sales-orders/normalization-preview.js';
import {createFrozenInventoryCoverageProvider,validateFrozenBusinessInventory,type CoverageSnapshot,type FrozenBusinessInventory} from '../sales-orders/normalization-coverage.js';
import {parseAttributionProposal,parseAttributionExecute,parseAttributionReview} from '../sales-orders/normalization-execution-model.js';

test('strict attribution commands cannot inject authorization or counts',()=>{
 const a=randomUUID(),b=randomUUID();const proposal={changeType:'normalize',caseVersion:1,assignments:[{originalOrderId:a,effectiveOrderId:a},{originalOrderId:b,effectiveOrderId:a}],reason:'Synthetic',recoveryPlanHash:'a'.repeat(64)};
 assert.equal(parseAttributionProposal(proposal).assignments.length,2);
 for(const extra of [{verified:true},{moveExecution:true},{productionCount:0}])assert.throws(()=>parseAttributionProposal({...proposal,...extra}));
 assert.throws(()=>parseAttributionProposal({...proposal,assignments:[{originalOrderId:a,effectiveOrderId:b},{originalOrderId:b,effectiveOrderId:a}]}));
 assert.throws(()=>parseAttributionProposal({...proposal,assignments:[{originalOrderId:a,effectiveOrderId:a},{originalOrderId:a.toUpperCase(),effectiveOrderId:a}]}));
 assert.throws(()=>parseAttributionExecute({requestId:randomUUID(),proposal,expectedEvidenceHash:'a'.repeat(64),execute:true}));
 assert.throws(()=>parseAttributionReview({requestId:randomUUID(),proposal,expectedEvidenceHash:'a'.repeat(64),reviewType:'finance',decision:'approve',reason:'Synthetic',actorId:a}));
});

test('full normalization evidence fingerprints every declared row and frozen source',{timeout:180000},async t=>{
 const db=await startDisposablePostgres();const pool=new pg.Pool({connectionString:await db.createDatabase('normalization_full_evidence')});
 t.after(async()=>{await pool.end();await db.stop();});await runMigrations(pool,resolve('database/migrations'));await synchronizePermissionCatalog(pool);await bootstrapAdmin(pool,{username:'synthetic-full-admin',displayName:'Synthetic',password:'Synthetic-2026'});
 const actor=await loadExistingBootstrapActor(pool,'synthetic-full-admin');
 const a=(await createAinuokeSalesOrder(pool,actor,{source:{sourceId:'synthetic-full-contract',sourceRowIdentity:'synthetic-row',salesContractNo:'SYN-FULL-CONTRACT',insideOrderNo:'SYN-FULL-FACTORY',lifecycleStatusRaw:'生效',contractDate:'2026-10-01',contractDeliveryDate:'2026-11-01',styleNo:'SYN-FULL-STYLE',companyNameSnapshot:'Synthetic',customerNameSnapshot:'Synthetic',brandNameSnapshot:'Synthetic',quantity:100,sourceHash:'synthetic-source',fetchedAt:'2026-10-15T00:00:00Z'},colors:[]})).salesOrder.id;
 const b=(await createSalesOrder(pool,{creationSource:'quote'})).id;
 const pair=[a,b].sort();const caseId=(await pool.query('INSERT INTO sales_order_normalization_cases(first_order_id,second_order_id,created_by,request_id,payload_hash) VALUES($1,$2,$3,$4,$5) RETURNING id',[...pair,actor.internalUserId,randomUUID(),'a'.repeat(64)])).rows[0].id;
 await pool.query("INSERT INTO sales_order_normalization_case_events(case_id,version,actor_id,request_id,payload_hash,event_type,reason,evidence) VALUES($1,1,$2,$3,$4,'opened','synthetic full evidence','{}')",[caseId,actor.internalUserId,randomUUID(),'b'.repeat(64)]);
 const proposal=parseAttributionProposal({changeType:'normalize',caseVersion:1,assignments:pair.map(id=>({originalOrderId:id,effectiveOrderId:a})),reason:'Synthetic',recoveryPlanHash:'a'.repeat(64)});
 const before=(await pool.query('SELECT row_to_json(o) AS row FROM sales_orders o ORDER BY id')).rows;
 let target='';let raw:FrozenBusinessInventory;
 const read=async(external:CoverageSnapshot,limits?:{maxRows:number;maxBytes:number})=>{const client=await pool.connect();try{await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');const result=await collectFullNormalizationEvidence(client,caseId,proposal,external,limits);await client.query('COMMIT');return result;}catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}};
 const client=await pool.connect();try{target=await normalizationTargetFingerprint(client);}finally{client.release();}
 raw={schemaVersion:'order-business-inventory.v1',targetFingerprint:target,memberOrderIds:pair,sourceKey:'synthetic-frozen-ledger',leaseId:'synthetic-lease',expiresAt:new Date(Date.now()+600000).toISOString(),orders:pair.map(id=>({id,execution:[],financial:[]}))};
 const frozen=()=>validateFrozenBusinessInventory(raw,pair,target);
 await t.test('missing external coverage remains unavailable; server zero cannot authorize execution',async()=>{
  const result=await read({coverage:'unavailable',reason:'not-connected'});assert.ok(result.blockers.includes('production_finance_coverage_unavailable'));assert.equal(result.executionAuthorized,false);
  assert.deepEqual((await pool.query('SELECT row_to_json(o) AS row FROM sales_orders o ORDER BY id')).rows,before);
 });
 await t.test('frozen empty domain is distinct from unknown and exposes no protected business payload',async()=>{
  const result=await read(frozen());assert.deepEqual(result.blockers,[]);assert.deepEqual(result.requiredReviews,[]);assert.equal(result.external.coverage,'frozen_adapter_inventory');assert.equal(result.executionAuthorized,false);
  assert.equal(JSON.stringify(result).includes('confirmed_sale_price'),false);assert.equal(result.hashScope,'all-bounded-declared-server-reference-rows-and-locked-adapter-inventory');
 });
 await t.test('content change beyond first 100 stable IDs invalidates full fingerprint while old limited preview stays equal',async()=>{
  for(let i=0;i<125;i++)await pool.query('INSERT INTO ainuoke_sales_order_color_mirrors(sales_order_id,source_line_identity,color_name,quantity,source_hash) VALUES($1,$2,$2,1,$2)',[a,'synthetic-color-'+i]);
  const limited=async()=>{const c=await pool.connect();try{await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');return await collectNormalizationEvidenceInTransaction(c,pair);}finally{await c.query('ROLLBACK');c.release();}};
  const oldLimited=await limited(),oldFull=await read(frozen());
  const last=(await pool.query('SELECT id FROM ainuoke_sales_order_color_mirrors WHERE sales_order_id=$1 ORDER BY id OFFSET 120 LIMIT 1',[a])).rows[0].id;
  await pool.query('UPDATE ainuoke_sales_order_color_mirrors SET quantity=2 WHERE id=$1',[last]);
  assert.equal((await limited()).reviewHash,oldLimited.reviewHash);assert.notEqual((await read(frozen())).evidenceHash,oldFull.evidenceHash);
  assert.equal(oldFull.references.find(row=>row.relation==='ainuoke_sales_order_color_mirrors'&&row.orderId===a)?.count,125);
 });
 await t.test('unknown FK and inventory budgets fail closed without truncated passing evidence',async()=>{
  await pool.query('CREATE TABLE synthetic_full_unknown(id UUID PRIMARY KEY,sales_order_id UUID REFERENCES sales_orders(id))');
  try{const result=await read(frozen());assert.ok(result.blockers.includes('unclassified_references'));assert.ok(result.unknownReferences.includes('public.synthetic_full_unknown.sales_order_id'));}finally{await pool.query('DROP TABLE synthetic_full_unknown');}
  await assert.rejects(()=>read(frozen(),{maxRows:1,maxBytes:33554432}),/normalization_full_inventory_limit/);
  await assert.rejects(()=>read(frozen(),{maxRows:100000,maxBytes:1}),/normalization_full_inventory_limit/);
 });
 await t.test('single executed legacy quote is preserved; financial history requires separate finance review',async()=>{
  raw.orders.find(row=>row.id===b)!.execution=[{id:'synthetic-schedule',kind:'schedule',facts:{quantity:25,unit:'件'}}];
  assert.ok((await read(frozen())).blockers.includes('executed_order_must_remain_effective'));
  const p={...proposal,assignments:pair.map(id=>({originalOrderId:id,effectiveOrderId:b}))};const c=await pool.connect();
  try{await c.query('BEGIN');const result=await collectFullNormalizationEvidence(c,caseId,p,frozen());assert.deepEqual(result.requiredReviews,['production']);assert.deepEqual(result.blockers,[]);await c.query('ROLLBACK');}finally{c.release();}
  raw.orders.find(row=>row.id===b)!.financial=[{id:'synthetic-locked-period',kind:'closing',facts:{status:'locked',price:123456.789}}];
  const result=await read(frozen());assert.ok(result.requiredReviews.includes('finance'));assert.equal(JSON.stringify(result).includes('123456.789'),false);
 });
 await t.test('frozen inventory rejects missing/duplicate scopes, expired leases and source changes before commit',async()=>{
  for(const corrupt of [{...raw,targetFingerprint:'b'.repeat(64)},{...raw,expiresAt:new Date(Date.now()-1).toISOString()},{...raw,memberOrderIds:[a]},{...raw,orders:[raw.orders[0],raw.orders[0]]}])assert.throws(()=>validateFrozenBusinessInventory(corrupt,pair,target));
  const provider=createFrozenInventoryCoverageProvider({read:async()=>structuredClone(raw),withReadLease:async(_ids,run)=>run()});
  await assert.rejects(()=>provider.withFrozenScope(pair,target,async(_snapshot,revalidate)=>{raw.orders.find(row=>row.id===b)!.execution[0].facts.quantity=26;await revalidate();}),/Frozen inventory changed/);
 });
 await t.test('target marker cannot be changed/deleted and case version change invalidates old proposal',async()=>{
  await assert.rejects(()=>pool.query('UPDATE sales_order_normalization_target SET target_id=gen_random_uuid()'));
  await assert.rejects(()=>pool.query('DELETE FROM sales_order_normalization_target'));
  await pool.query("INSERT INTO sales_order_normalization_case_events(case_id,version,actor_id,request_id,payload_hash,event_type,reason,evidence) VALUES($1,2,$2,$3,$4,'review_note','synthetic change','{}')",[caseId,actor.internalUserId,randomUUID(),'c'.repeat(64)]);
  await assert.rejects(()=>read(frozen()),/normalization_case_version_conflict/);
 });
});
