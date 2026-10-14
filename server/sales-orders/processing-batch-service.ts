import {createHash,randomUUID} from 'node:crypto';
import type {Pool,PoolClient} from 'pg';
import type {TrustedIdentity} from '../auth/session.js';
import {requirePermission} from '../auth/permissions.js';
import {HttpError} from '../http/errors.js';
import {appendOperationLog} from '../operation-logs/repository.js';
import {requireOrderCommandActor} from './identity-service.js';
import {identityUuid} from './identity-model.js';
import {readCommercialCandidate} from './commercial-source.js';
import {appendCommercialVersion} from './commercial-version-service.js';
import {createSalesOrder} from './repository.js';
import {parseProcessingBatchDraft,parseProcessingBatchConfirmation,parseProcessingBatchCancellation,parseProcessingBatchConsumption,processingDraftHash,type ProcessingBatchDraft} from './processing-batch-model.js';

function fail(status:number,code:string):never{throw new HttpError(status,code,code);}
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
type Operation='create'|'confirm'|'cancel'|'consume';
type Receipt={batchId:string;version?:number;salesOrderId?:string;orderNo?:string;status:string};
type Batch=ProcessingBatchDraft & {id:string;state:string;version:number;confirmationId:string|null};
const selectBatch=`SELECT id::text,quote_id AS "quoteId",revision_id AS "revisionId",price_version_id AS "priceVersionId",customer_name AS "customerName",business_style_no AS "businessStyleNo",quantity::text,order_date::text AS "orderDate",delivery_date::text AS "deliveryDate",customer_reference AS "customerReference",delivery_requirements AS "deliveryRequirements",reference_order_id::text AS "referenceOrderId",state,version,current_confirmation_id::text AS "confirmationId" FROM processing_order_batches`;
async function readBatch(c:PoolClient,id:string){
 if(!identityUuid.test(id))fail(400,'invalid_batch_id');
 const row=(await c.query<Batch>(selectBatch+' WHERE id=$1 FOR UPDATE',[id])).rows[0];
 if(!row)fail(404,'processing_batch_not_found');return row;
}
async function transaction<T>(pool:Pool,actor:TrustedIdentity,operation:Operation|'read',run:(c:PoolClient,a:TrustedIdentity)=>Promise<T>):Promise<T>{
 const c=await pool.connect();try{
  await c.query('BEGIN');await c.query("SET LOCAL lock_timeout='5s'");
  const a=await requireOrderCommandActor(c,actor,operation==='read'?'order.view':operation==='consume'?'order.processing.consume':'order.processing.batch.manage');
  if(operation==='read'&&!a.permissions.includes('order.processing.consume')&&!a.permissions.includes('order.processing.batch.manage'))fail(403,'permission_denied');
  requirePermission(a.permissions,'quote.view');requirePermission(a.permissions,'commercial.labor.view');
  const result=await run(c,a);await c.query('COMMIT');return result;
 }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}
async function replay(c:PoolClient,a:TrustedIdentity,requestId:string,operation:Operation,item:string,payloadHash:string){
 await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`processing-request:${a.internalUserId}:${requestId}:${operation}:${item}`]);
 const old=(await c.query('SELECT payload_hash,result FROM processing_order_batch_requests WHERE actor_id=$1 AND request_id=$2 AND operation=$3 AND item_key=$4',[a.internalUserId,requestId,operation,item])).rows[0];
 if(old&&old.payload_hash!==payloadHash)fail(409,'processing_request_payload_conflict');
 return old?.result as Receipt|undefined;
}
async function record(c:PoolClient,a:TrustedIdentity,requestId:string,operation:Operation,item:string,payloadHash:string,result:Receipt){
 await c.query('INSERT INTO processing_order_batch_requests(actor_id,request_id,operation,item_key,payload_hash,batch_id,result) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb)',[a.internalUserId,requestId,operation,item,payloadHash,result.batchId,JSON.stringify(result)]);
 const actions={create:'登记加工批次',confirm:'确认加工批次',cancel:'取消加工批次',consume:'创建加工订单'} as const;
 await appendOperationLog(c,a,{module:'订单中心',action:actions[operation],entityType:'ProcessingOrderBatch',entityId:result.batchId,afterData:{values:result},metadata:{requestId,operation}});
 return result;
}
export async function createProcessingBatch(pool:Pool,actor:TrustedIdentity,raw:unknown){
 const command=parseProcessingBatchDraft(raw),payloadHash=processingDraftHash(command);
 return transaction(pool,actor,'create',async(c,a)=>{
  const old=await replay(c,a,command.requestId,'create','',payloadHash);if(old)return old;
  // A draft is not an order, but must still refer to an actual eligible processing quote.
  const source=await readCommercialCandidate(c,{quoteId:command.quoteId,revisionId:command.revisionId,priceVersionId:command.priceVersionId});
  if(source.quoteType!=='processing')fail(409,'processing_quote_required');
  if(command.referenceOrderId&&!(await c.query('SELECT id FROM sales_orders WHERE id=$1',[command.referenceOrderId])).rowCount)fail(404,'reference_order_not_found');
  const row=(await c.query(`INSERT INTO processing_order_batches(created_by,quote_id,revision_id,price_version_id,customer_name,business_style_no,quantity,order_date,delivery_date,customer_reference,delivery_requirements,reference_order_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id::text`,[a.internalUserId,command.quoteId,command.revisionId,command.priceVersionId,command.customerName,command.businessStyleNo,command.quantity,command.orderDate,command.deliveryDate,command.customerReference,command.deliveryRequirements,command.referenceOrderId])).rows[0];
  return record(c,a,command.requestId,'create','',payloadHash,{batchId:row.id,version:1,status:'draft'});
 });
}
export async function previewProcessingBatch(pool:Pool,actor:TrustedIdentity,id:string){
 return transaction(pool,actor,'read',async(c)=>{
  const b=await readBatch(c,id);if(!['draft','confirmed'].includes(b.state))fail(409,'processing_batch_terminal');
  const candidate=await readCommercialCandidate(c,{quoteId:b.quoteId,revisionId:b.revisionId,priceVersionId:b.priceVersionId});
  if(candidate.quoteType!=='processing')fail(409,'processing_quote_required');
  return {batch:b,candidate};
 });
}
export async function confirmProcessingBatch(pool:Pool,actor:TrustedIdentity,id:string,raw:unknown){
 const command=parseProcessingBatchConfirmation(raw),item=id.toLowerCase(),payloadHash=hash([item,command.expectedVersion,command.sourceFingerprint]);
 return transaction(pool,actor,'confirm',async(c,a)=>{
  const old=await replay(c,a,command.requestId,'confirm',item,payloadHash);if(old)return old;
  const b=await readBatch(c,item);if(!['draft','confirmed'].includes(b.state))fail(409,'processing_batch_terminal');
  if(b.version!==command.expectedVersion)fail(409,'processing_batch_version_conflict');
  const source=await readCommercialCandidate(c,{quoteId:b.quoteId,revisionId:b.revisionId,priceVersionId:b.priceVersionId});
  if(source.quoteType!=='processing')fail(409,'processing_quote_required');
  if(source.fingerprint!==command.sourceFingerprint)fail(409,'processing_source_changed');
  const row=(await c.query('INSERT INTO processing_order_batch_confirmations(batch_id,batch_version,actor_id,source_fingerprint,draft_hash,source_snapshot) VALUES($1,$2,$3,$4,$5,$6::jsonb) RETURNING id',[item,b.version+1,a.internalUserId,source.fingerprint,processingDraftHash(b),JSON.stringify(source)])).rows[0];
  await c.query("UPDATE processing_order_batches SET state='confirmed',version=version+1,current_confirmation_id=$2 WHERE id=$1",[item,row.id]);
  return record(c,a,command.requestId,'confirm',item,payloadHash,{batchId:item,version:b.version+1,status:'confirmed'});
 });
}
export async function cancelProcessingBatch(pool:Pool,actor:TrustedIdentity,id:string,raw:unknown){
 const command=parseProcessingBatchCancellation(raw),item=id.toLowerCase(),payloadHash=hash([item,command.expectedVersion,command.reason]);
 return transaction(pool,actor,'cancel',async(c,a)=>{
  const old=await replay(c,a,command.requestId,'cancel',item,payloadHash);if(old)return old;
  const b=await readBatch(c,item);if(!['draft','confirmed'].includes(b.state))fail(409,'processing_batch_terminal');
  if(b.version!==command.expectedVersion)fail(409,'processing_batch_version_conflict');
  await c.query("UPDATE processing_order_batches SET state='cancelled',version=version+1 WHERE id=$1",[item]);
  await appendOperationLog(c,a,{module:'订单中心',action:'取消加工批次',entityType:'ProcessingOrderBatch',entityId:item,metadata:{reason:command.reason}});
  return record(c,a,command.requestId,'cancel',item,payloadHash,{batchId:item,version:b.version+1,status:'cancelled'});
 });
}
async function consumeOne(pool:Pool,actor:TrustedIdentity,requestId:string,item:{batchId:string;expectedVersion:number}){
 const payloadHash=hash([item.batchId,item.expectedVersion]);
 return transaction(pool,actor,'consume',async(c,a)=>{
  const old=await replay(c,a,requestId,'consume',item.batchId,payloadHash);if(old)return old;
  const b=await readBatch(c,item.batchId);
  const existing=(await c.query('SELECT o.id::text,o.order_no FROM processing_order_batch_consumptions p JOIN sales_orders o ON o.id=p.sales_order_id WHERE p.batch_id=$1',[b.id])).rows[0];
  if(existing)return record(c,a,requestId,'consume',b.id,payloadHash,{batchId:b.id,salesOrderId:existing.id,orderNo:existing.order_no,status:'existing'});
  if(b.state!=='confirmed')fail(409,'processing_batch_confirmation_required');
  if(b.version!==item.expectedVersion)fail(409,'processing_batch_version_conflict');
  const confirmation=(await c.query('SELECT source_fingerprint,draft_hash FROM processing_order_batch_confirmations WHERE batch_id=$1 AND id=$2',[b.id,b.confirmationId])).rows[0];
  const candidate=await readCommercialCandidate(c,{quoteId:b.quoteId,revisionId:b.revisionId,priceVersionId:b.priceVersionId});
  if(candidate.quoteType!=='processing')fail(409,'processing_quote_required');
  if(!confirmation||candidate.fingerprint!==confirmation.source_fingerprint||processingDraftHash(b)!==confirmation.draft_hash)fail(409,'processing_source_changed');
  const order=await createSalesOrder(c,{creationSource:'quote',lifecycleState:'confirmed',sourceQuoteId:b.quoteId,sourceRevisionId:b.revisionId,sourcePriceVersionId:b.priceVersionId});
  await c.query("INSERT INTO sales_order_identity_profiles(sales_order_id,business_type,lineage,reference_order_id) VALUES($1,'processing',$2,$3)",[order.id,b.referenceOrderId?'reorder':'pending',b.referenceOrderId]);
  const commercial=await appendCommercialVersion(c,{orderId:order.id,version:1,actorId:a.internalUserId,requestId:randomUUID(),payloadHash,candidate,reason:'Confirmed processing batch '+b.id});
  await c.query('INSERT INTO processing_order_batch_consumptions(batch_id,sales_order_id,confirmation_id,commercial_version_id,actor_id) VALUES($1,$2,$3,$4,$5)',[b.id,order.id,b.confirmationId,commercial.id,a.internalUserId]);
  return record(c,a,requestId,'consume',b.id,payloadHash,{batchId:b.id,salesOrderId:order.id,orderNo:order.orderNo,status:'created'});
 });
}
export async function consumeProcessingBatches(pool:Pool,actor:TrustedIdentity,raw:unknown){
 const command=parseProcessingBatchConsumption(raw);
 const results:Array<Receipt|{batchId:string;status:'failed';code:string}>=[];
 for(const item of command.items){
  try{results.push(await consumeOne(pool,actor,command.requestId,item));}
  catch(e){results.push({batchId:item.batchId,status:'failed',code:e instanceof HttpError?e.code:'processing_item_failed'});}
 }
 return {results};
}

export type ProcessingBatchQuery={offset:number;search:string;quoteId:string;includeProcessed:boolean};
export function parseProcessingBatchQuery(query:URLSearchParams):ProcessingBatchQuery{
 const allowed=['offset','search','quoteId','includeProcessed'];
 if([...query.keys()].some(k=>!allowed.includes(k)||query.getAll(k).length!==1))fail(400,'invalid_processing_query');
 const offset=query.get('offset')??'0',search=query.get('search')??'',quoteId=query.get('quoteId')??'',include=query.get('includeProcessed')??'false';
 if(!/^\d+$/u.test(offset)||Number(offset)>100000||search.length>256||quoteId.length>256||!['true','false'].includes(include))fail(400,'invalid_processing_query');
 return {offset:Number(offset),search,quoteId,includeProcessed:include==='true'};
}
export async function listProcessingBatches(pool:Pool,actor:TrustedIdentity,query:ProcessingBatchQuery){
 return transaction(pool,actor,'read',async(c)=>{
  const rows=(await c.query<Batch>(selectBatch+` WHERE ($1 OR state='confirmed') AND ($2='' OR quote_id=$2) AND ($3='' OR concat_ws(' ',customer_name,business_style_no,customer_reference,id::text) ILIKE $4) ORDER BY created_at DESC,id DESC LIMIT 21 OFFSET $5`,[query.includeProcessed,query.quoteId,query.search,'%'+query.search.replace(/[\\%_]/gu,'\\$&')+'%',query.offset])).rows;
  const items:Array<{batch:Batch;eligible:boolean;unavailableReason:string|null;salesOrderId:string|null;orderNo:string|null}>=[];
  for(const b of rows.slice(0,20)){
   const existing=(await c.query('SELECT o.id::text,o.order_no FROM processing_order_batch_consumptions p JOIN sales_orders o ON o.id=p.sales_order_id WHERE p.batch_id=$1',[b.id])).rows[0];
   let eligible=false,unavailableReason:string|null=b.state;
   if(b.state==='confirmed'){
    await c.query('SAVEPOINT candidate');
    try{
     const candidate=await readCommercialCandidate(c,{quoteId:b.quoteId,revisionId:b.revisionId,priceVersionId:b.priceVersionId});
     const confirmation=(await c.query('SELECT source_fingerprint,draft_hash FROM processing_order_batch_confirmations WHERE id=$1 AND batch_id=$2',[b.confirmationId,b.id])).rows[0];
     eligible=candidate.quoteType==='processing'&&candidate.fingerprint===confirmation?.source_fingerprint&&processingDraftHash(b)===confirmation?.draft_hash;
     unavailableReason=eligible?null:'processing_source_changed';
    }catch(e){await c.query('ROLLBACK TO SAVEPOINT candidate');if(!(e instanceof HttpError))throw e;unavailableReason=e.code;}
    await c.query('RELEASE SAVEPOINT candidate');
   }
   if(query.includeProcessed||eligible)items.push({batch:b,eligible,unavailableReason,salesOrderId:existing?.id??null,orderNo:existing?.order_no??null});
  }
  return {items,hasMore:rows.length>20,nextOffset:query.offset+Math.min(20,rows.length),offset:query.offset};
 });
}
