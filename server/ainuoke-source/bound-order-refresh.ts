import type {Pool,PoolClient} from 'pg';
import type {TrustedIdentity} from '../auth/session.js';
import {readCurrentActor} from '../auth/current-actor.js';
import {requirePermission} from '../auth/permissions.js';
import {HttpError} from '../http/errors.js';
import {lockEffectiveAttribution,freezePhysicalOrderGroups} from '../sales-orders/effective-attribution.js';
import {identityUuid} from '../sales-orders/identity-model.js';
import {readDeliveryPlanSet} from '../sales-orders/delivery-plan-repository.js';
import {refreshAinuokeSalesOrderSourceInTransaction} from '../sales-orders/delivery-plan-source-refresh.js';
import {orderCommandControlError} from '../sales-orders/command-control.js';
import {appendOperationLog} from '../operation-logs/repository.js';
import {boundOrders} from './service.js';
import {previewAdditions,hasCompleteEmptyColorEvidence} from './additions.js';
import {hash,inspect,sourceKeyValid} from './contract.js';
import {paymentDatabaseFingerprint} from './payment-request-collection.js';

export type BoundOrderRefreshScope={sourceKey:string;accountFingerprint:string;salesOrderId:string};
export type BoundOrderRefreshResult={requestId:string;salesOrderId:string;sourceOwnerOrderId:string;salesContractNo:string;
 beforeSourceHash:string;afterSourceHash:string;beforePlanVersion:number;afterPlanVersion:number;colorLines:number;sourceFetchedAt:string};
const fail=(status:number,code:string):never=>{throw new HttpError(status,code,'合同来源刷新未完成，请核对原请求结果。');};
const sha=(value:unknown):value is string=>typeof value==='string'&&/^[a-f0-9]{64}$/u.test(value);
function scopeOf(raw:BoundOrderRefreshScope){
 if(!raw||Object.keys(raw).sort().join(',')!=='accountFingerprint,salesOrderId,sourceKey'||!sourceKeyValid(raw.sourceKey)
  ||!sha(raw.accountFingerprint)||!identityUuid.test(raw.salesOrderId))fail(400,'invalid_bound_refresh_scope');
 return {...raw,salesOrderId:raw.salesOrderId.toLowerCase()};
}
function evidenceOf(raw:unknown){
 const encoded=JSON.stringify(raw);
 if(!encoded||Buffer.byteLength(encoded)>32*1024*1024)fail(400,'invalid_bound_refresh_evidence');
 inspect(raw);return JSON.parse(encoded) as unknown;
}
async function actorFor(client:PoolClient,identity:TrustedIdentity,lock:boolean){
 const actor=await readCurrentActor(client,identity,lock);
 for(const key of ['order.view','ainuoke.view','ainuoke.sync'] as const)requirePermission(actor.permissions,key);
 return actor;
}
async function transaction<T>(pool:Pool,write:boolean,fn:(client:PoolClient)=>Promise<T>){
 const client=await pool.connect();try{
  await client.query(write?'BEGIN':'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  if(write){await client.query("SET LOCAL lock_timeout='5s'");await client.query("SET LOCAL statement_timeout='30s'");await lockEffectiveAttribution(client);}
  const result=await fn(client);await client.query('COMMIT');return result;
 }catch(error){await client.query('ROLLBACK').catch(()=>undefined);throw orderCommandControlError(error);}finally{client.release();}
}
async function available(client:PoolClient){
 const row=(await client.query("SELECT to_regclass('public.ainuoke_order_source_refresh_receipts') IS NOT NULL AS ready")).rows[0];
 if(!row.ready)fail(503,'bound_refresh_unavailable');
}
async function prepare(client:PoolClient,scope:BoundOrderRefreshScope,evidence:unknown,now:number,lock:boolean,databaseFingerprint:string){
 const profile=(await client.query('SELECT account_fingerprint,enabled FROM ainuoke_source_profiles WHERE source_key=$1'+(lock?' FOR SHARE':''),[scope.sourceKey])).rows[0];
 if(!profile?.enabled||profile.account_fingerprint!==scope.accountFingerprint)fail(409,'bound_refresh_profile_changed');
 if(!(await client.query("SELECT 1 FROM operation_logs WHERE entity_type='AinuokeSourceBinding' AND entity_id=$1 LIMIT 1",[scope.sourceKey])).rowCount)
  fail(409,'bound_refresh_binding_required');
 const targets=await boundOrders(client,false,[scope.salesOrderId]);
 if(targets.length!==1)fail(409,'bound_refresh_trusted_contract_required');
 let target=targets[0];
 if(lock){await freezePhysicalOrderGroups(client,[target.id]);const current=await boundOrders(client,false,[scope.salesOrderId]);
  if(current.length!==1)fail(409,'bound_refresh_binding_changed');target=current[0];}
 const mirror=(await client.query(`SELECT source_id,sales_contract_no,source_hash,fetched_at, to_jsonb(m) AS evidence
  FROM ainuoke_sales_order_contract_mirrors m WHERE sales_order_id=$1${lock?' FOR UPDATE':''}`,[target.sourceOwnerOrderId])).rows[0];
 if(!mirror||mirror.sales_contract_no!==target.salesContractNo)fail(409,'bound_refresh_binding_changed');
 const owner=(await client.query('SELECT id::text,version FROM sales_orders WHERE id=$1',[target.sourceOwnerOrderId])).rows[0];
 if(lock)await client.query('SELECT sales_order_id FROM sales_order_delivery_plan_sets WHERE sales_order_id=$1 FOR UPDATE',[owner.id]);
 const plans=await readDeliveryPlanSet(client,owner.id);
 const currentColors=(await client.query('SELECT source_line_identity,color_name,quantity::text,delivery_date::text,source_hash,source_metadata FROM ainuoke_sales_order_color_mirrors WHERE sales_order_id=$1 ORDER BY source_line_identity',[owner.id])).rows;
 const selected=[mirror.sales_contract_no];
 const mapped=await previewAdditions(evidence,selected,[{id:owner.id,sourceId:mirror.source_id,salesContractNo:mirror.sales_contract_no}],now,600000,{allowIncompleteHeader:true});
 const candidate=mapped.candidates[0];
 if(mapped.candidates.length!==1||candidate.source.sourceId!==mirror.source_id)fail(409,'bound_refresh_binding_changed');
 // Initial binding may accept incomplete enrichment. Refresh must never turn
 // invalid/missing enrichment into DELETE of an accepted current color slice.
 const colorPages=(evidence as import('./additions.js').AdditionBundle).colors[mirror.sales_contract_no];
 const initialEmpty=currentColors.length===0&&hasCompleteEmptyColorEvidence(colorPages,mirror.sales_contract_no);
 if((candidate.colorDetailStatus!=='usable'||!candidate.colors.length)&&!initialEmpty)fail(409,'bound_refresh_color_evidence_incomplete');
 if(candidate.colors.length>1000)fail(422,'bound_refresh_color_limit');
 if(Date.parse(candidate.source.fetchedAt)<new Date(mirror.fetched_at).getTime())fail(409,'bound_refresh_evidence_regressed');
 const context={scope,databaseFingerprint,target,owner,mirror:mirror.evidence,colors:currentColors,plans,evidenceHash:hash(evidence),candidate};
 return {previewHash:hash(context),target,owner,mirror,plans,candidate,currentColors};
}
/** Preview and apply consume the same already-captured formal bundle. Neither
 * accepts caller-created mirror DTOs, runs network IO, or creates an SO. */
export async function previewBoundOrderRefresh(pool:Pool,identity:TrustedIdentity,rawScope:BoundOrderRefreshScope,rawEvidence:unknown,now=Date.now()){
 const scope=scopeOf(rawScope),evidence=evidenceOf(rawEvidence);
 return transaction(pool,false,async client=>{
  await actorFor(client,identity,false);await available(client);
  const p=await prepare(client,scope,evidence,now,false,await paymentDatabaseFingerprint(pool,client));
  return {previewHash:p.previewHash,salesOrderId:p.target.id,sourceOwnerOrderId:p.owner.id,salesContractNo:p.candidate.source.salesContractNo,
   current:{quantity:String(p.mirror.evidence.quantity),deliveryDate:p.plans.sourceDeliveryDate,insideOrderNo:p.target.insideOrderNo,planVersion:p.plans.version,ownership:p.plans.ownership,
    colorLines:p.currentColors.map(c=>({colorName:c.color_name,quantity:c.quantity}))},
   incoming:{quantity:String(p.candidate.source.quantity),deliveryDate:p.candidate.source.contractDeliveryDate,insideOrderNo:p.candidate.source.insideOrderNo,
    colorLines:p.candidate.colors.map(c=>({colorName:c.colorName,quantity:String(c.quantity)})),fetchedAt:p.candidate.source.fetchedAt},
   manualPlansWillBePreserved:true,historicalOwner:p.owner.id!==p.target.id,sourceReadThisInvocation:'none' as const};
 });
}
export async function readBoundOrderRefreshReceipt(pool:Pool,identity:TrustedIdentity,requestId:string){
 if(!identityUuid.test(requestId))fail(400,'invalid_bound_refresh_request');
 return transaction(pool,false,async client=>{
  const actor=await actorFor(client,identity,false);await available(client);
  const row=(await client.query('SELECT result FROM ainuoke_order_source_refresh_receipts WHERE actor_id=$1 AND request_id=$2',[actor.internalUserId,requestId])).rows[0];
  return {state:row?'completed' as const:'unknown' as const,result:row?.result as BoundOrderRefreshResult|undefined,
   historical:true,absenceProvesFailure:false,sourceReadThisInvocation:'none' as const};
 });
}
export async function applyBoundOrderRefresh(pool:Pool,identity:TrustedIdentity,rawScope:BoundOrderRefreshScope,rawEvidence:unknown,
 command:{requestId:string;expectedPreview:string},now=Date.now()){
 const scope=scopeOf(rawScope),evidence=evidenceOf(rawEvidence);
 if(!command||Object.keys(command).sort().join(',')!=='expectedPreview,requestId'||!identityUuid.test(command.requestId)||!sha(command.expectedPreview))
  fail(400,'invalid_bound_refresh_request');
 const requestId=command.requestId.toLowerCase();
 return transaction(pool,true,async client=>{
  const actor=await actorFor(client,identity,true);await available(client);
  const databaseFingerprint=await paymentDatabaseFingerprint(pool,client),payloadHash=hash({scope,evidence,expectedPreview:command.expectedPreview,databaseFingerprint});
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['ainuoke-bound-refresh:'+actor.internalUserId+':'+requestId]);
  const prior=(await client.query('SELECT payload_hash,result FROM ainuoke_order_source_refresh_receipts WHERE actor_id=$1 AND request_id=$2',[actor.internalUserId,requestId])).rows[0];
  if(prior){if(prior.payload_hash!==payloadHash)fail(409,'bound_refresh_request_conflict');return {replayed:true,historical:true,result:prior.result as BoundOrderRefreshResult};}
  const p=await prepare(client,scope,evidence,now,true,databaseFingerprint);
  if(p.previewHash!==command.expectedPreview)fail(409,'bound_refresh_preview_changed');
  const operationId='bound-order-refresh:'+actor.internalUserId+':'+requestId;
  const refreshed=await refreshAinuokeSalesOrderSourceInTransaction(client,actor,p.owner.id,{...p.candidate,expectedSourceHash:p.mirror.source_hash,expectedPlanVersion:p.plans.version},{operationId,operationSequence:0});
  const result:BoundOrderRefreshResult={requestId,salesOrderId:p.target.id,sourceOwnerOrderId:p.owner.id,salesContractNo:p.candidate.source.salesContractNo,
   beforeSourceHash:p.mirror.source_hash,afterSourceHash:p.candidate.source.sourceHash,beforePlanVersion:p.plans.version,
   afterPlanVersion:refreshed.deliveryPlanSet.version,colorLines:p.candidate.colors.length,sourceFetchedAt:p.candidate.source.fetchedAt};
  const encoded=JSON.stringify(result);if(Buffer.byteLength(encoded)>65536)fail(422,'bound_refresh_receipt_limit');
  await client.query(`INSERT INTO ainuoke_order_source_refresh_receipts(actor_id,request_id,source_key,sales_order_id,source_owner_order_id,payload_hash,preview_hash,result)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`,[actor.internalUserId,requestId,scope.sourceKey,p.target.id,p.owner.id,payloadHash,p.previewHash,encoded]);
  await appendOperationLog(client,actor,{operationId,operationSequence:1,module:'艾诺科同步',action:'艾诺科同步订单',entityType:'SalesOrder',entityId:p.target.id,
   metadata:{mutationSurface:'bound_source_refresh',requestId,sourceOwnerOrderId:p.owner.id,previewHash:p.previewHash},
   afterData:{orderId:p.target.id,salesContractNo:result.salesContractNo,objectName:result.salesContractNo,values:{colorCount:result.colorLines}}});
  return {replayed:false,historical:false,result};
 });
}
/** The durable source-sync job is the outer receipt/transaction. Reuse the same
 * mapper, identity locks and source-only domain command as the reviewed refresh. */
export async function refreshCollectedBoundOrderInTransaction(pool:Pool,client:PoolClient,actor:TrustedIdentity,
 rawScope:BoundOrderRefreshScope,rawEvidence:unknown,jobId:string,now:number) {
 const scope=scopeOf(rawScope),evidence=evidenceOf(rawEvidence);
 await actorFor(client,actor,true);await available(client);await lockEffectiveAttribution(client);
 const p=await prepare(client,scope,evidence,now,true,await paymentDatabaseFingerprint(pool,client));
 await refreshAinuokeSalesOrderSourceInTransaction(client,actor,p.owner.id,
  {...p.candidate,expectedSourceHash:p.mirror.source_hash,expectedPlanVersion:p.plans.version},
  {operationId:'catalog-sync:'+jobId,operationSequence:0});
 return {orderId:p.target.id,sourceOwnerOrderId:p.owner.id,colorLines:p.candidate.colors.length};
}
