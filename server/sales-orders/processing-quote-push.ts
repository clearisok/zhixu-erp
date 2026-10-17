import {isDeepStrictEqual} from 'node:util';
import type {Pool,PoolClient} from 'pg';
import type {TrustedIdentity} from '../auth/session.js';
import {requirePermission} from '../auth/permissions.js';
import {HttpError} from '../http/errors.js';
import {requireOrderCommandActor} from './identity-service.js';
import {identityUuid} from './identity-model.js';
import {lockEffectiveAttribution} from './effective-attribution.js';
import {readQuoteAggregateInTransaction,saveQuoteAggregateInTransaction} from '../quotes/repository.js';
import {findTermsByQuoteProvenance,lockQuoteTermsContext} from '../confirmed-commercial-terms/repository.js';
import {updateQuoteTermsInTransaction} from '../confirmed-commercial-terms/service.js';
import {resolveConfirmationSource} from '../confirmed-commercial-terms/confirmation-source.js';
import {applyQuoteConfirmation} from '../quotes/confirmation-workflows.js';
import {canonicalDecimal} from '../quotes/model.js';
import {productHash} from './product-snapshot.js';
import {readCommercialCandidate} from './commercial-source.js';
import {parseProcessingBatchDraft} from './processing-batch-model.js';
import {createProcessingBatchInTransaction,confirmProcessingBatchInTransaction,consumeProcessingBatchInTransaction} from './processing-batch-service.js';
import {appendOperationLog} from '../operation-logs/repository.js';

function fail(status:number,code:string):never{throw new HttpError(status,code,code);}
type ExistingBatch={id:string;version:number;state:string;quantity:string;styleNo:string;deliveryDate:string|null;customerName:string;salesOrderId:string|null;orderNo:string|null};
type PriceEdit={priceVersionId:string;quantity:string;confirmedLabor:string;batchId:string|null;newOrder:boolean};
type PushItem={quoteId:string;expectedVersion:number;fingerprint:string;revisionId:string;businessStyleNo:string;customerName:string;deliveryDate:string|null;orderDate:string;customerReference:string;versions:PriceEdit[]};
type PushResult={quoteId:string;quoteVersion:number;items:{batchId:string;status:string;salesOrderId?:string;orderNo?:string}[]};
const object=(v:unknown):Record<string,unknown>=>{if(!v||typeof v!=='object'||Array.isArray(v))fail(400,'invalid_processing_quote_push');return v as Record<string,unknown>;};
const text=(v:unknown,n=256)=>typeof v==='string'&&v.length<=n&&!/[\u0000-\u001f]/u.test(v);
const decimal=(v:unknown)=>typeof v==='string'&&v.length<=128&&/^\d+(?:\.\d+)?$/u.test(v);
const uuidFor=(...keys:string[])=>{const h=productHash(keys);return `${h.slice(0,8)}-${h.slice(8,12)}-5${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`;};
async function authorize(c:PoolClient,actor:TrustedIdentity,write=false){
 const a=await requireOrderCommandActor(c,actor,write?'order.processing.consume':'order.view');
 for(const p of ['quote.view','commercial.labor.view'] as const)requirePermission(a.permissions,p);
 if(write)for(const p of ['order.processing.batch.manage','quote.edit','quote.confirm','commercial.labor.edit'] as const)requirePermission(a.permissions,p);
 return a;
}
async function readPushQuote(c:PoolClient,quoteId:string,expectedVersion:number){
 // Lock all current terms contexts in a stable order before the Quote row.
 const root=(await c.query('SELECT default_revision_id FROM quote_center_quotes WHERE id=$1',[quoteId])).rows[0];
 if(!root)fail(404,'quote_not_found');
 const pvs=(await c.query('SELECT id FROM quote_center_price_versions WHERE quote_id=$1 AND revision_id=$2 ORDER BY id',[quoteId,root.default_revision_id])).rows;
 for(const pv of pvs)await lockQuoteTermsContext(c,{quoteId,revisionId:root.default_revision_id,priceVersionId:pv.id});
 await c.query('SELECT id FROM quote_center_quotes WHERE id=$1 FOR UPDATE',[quoteId]);
 const record=await readQuoteAggregateInTransaction(c,quoteId);if(!record||record.quote.deletedAt)fail(404,'quote_not_found');
 if(record.version!==expectedVersion)fail(409,'quote_version_conflict');
 const revision=record.quote.revisions.find(r=>r.revisionId===record.quote.defaultRevisionId)!;
 if(revision.readOnly||revision.baseInfo.quoteType!=='processing')fail(409,'editable_processing_quote_required');
 const versions=[];
 for(const pv of revision.priceVersions){
  const provenance={quoteId,revisionId:revision.revisionId,priceVersionId:pv.id},terms=await findTermsByQuoteProvenance(c,provenance);
  const resolved=resolveConfirmationSource({terms:terms?{id:terms.id,version:terms.version,labor:terms.confirmed_labor_price,sale:null,currency:terms.labor_currency,confirmedAt:terms.updated_at.toISOString()}:null,snapshot:pv.confirmation?{labor:pv.confirmation.confirmedLaborPrice,sale:null,currency:pv.pricingParameters.laborCurrency,confirmedAt:pv.confirmation.confirmedAt}:null});
  const existing=(await c.query<ExistingBatch>(`SELECT b.id::text,b.version,b.state,b.quantity::text,b.business_style_no AS "styleNo",b.delivery_date::text AS "deliveryDate",b.customer_name AS "customerName",s.sales_order_id::text AS "salesOrderId",o.order_no AS "orderNo" FROM processing_order_batches b LEFT JOIN processing_order_batch_consumptions s ON s.batch_id=b.id LEFT JOIN sales_orders o ON o.id=s.sales_order_id WHERE b.quote_id=$1 AND b.revision_id=$2 AND b.price_version_id=$3 AND b.state<>'cancelled' ORDER BY b.created_at,b.id LIMIT 101`,[quoteId,revision.revisionId,pv.id])).rows;
  if(existing.length>100)fail(409,'processing_batch_selection_required');
  versions.push({id:pv.id,name:pv.name,quantity:pv.quantity,confirmedLabor:resolved.labor,currency:pv.pricingParameters.laborCurrency,termsVersion:terms?.version??0,existing});
 }
 const view={quoteId,quoteCode:record.quote.quoteCode,expectedVersion:record.version,revisionId:revision.revisionId,revisionLabel:revision.revisionLabel,businessStyleNo:revision.baseInfo.quoteStyleNo,brand:revision.baseInfo.brandName,deliveryDate:revision.baseInfo.garmentLeadDate,versions};
 return {record,revision,view:{...view,fingerprint:productHash(view)}};
}
export async function previewProcessingQuotePush(pool:Pool,actor:TrustedIdentity,raw:Record<string,unknown>){
 if(Object.keys(raw).join(',')!=='items'||!Array.isArray(raw.items)||!raw.items.length||raw.items.length>25)fail(400,'invalid_processing_push_selection');
 const inputs=raw.items.map(v=>{const item=object(v);if(Object.keys(item).sort().join(',')!=='expectedVersion,quoteId'||!text(item.quoteId)||!item.quoteId||!Number.isSafeInteger(item.expectedVersion)||Number(item.expectedVersion)<1)fail(400,'invalid_processing_push_selection');return {quoteId:item.quoteId as string,expectedVersion:item.expectedVersion as number};});
 if(new Set(inputs.map(i=>i.quoteId)).size!==inputs.length)fail(400,'duplicate_processing_quote');
 const results=[];
 for(const item of inputs){const c=await pool.connect();try{await c.query('BEGIN');await c.query("SET LOCAL lock_timeout='5s'");await authorize(c,actor);const q=await readPushQuote(c,item.quoteId,item.expectedVersion);await c.query('ROLLBACK');results.push({status:'ready' as const,...q.view});}catch(e){await c.query('ROLLBACK');if(!(e instanceof HttpError))throw e;results.push({status:'failed' as const,quoteId:item.quoteId,code:e.code});}finally{c.release();}}
 return {items:results};
}
function parseItem(raw:unknown):PushItem{
 const i=object(raw),keys=['quoteId','expectedVersion','fingerprint','revisionId','businessStyleNo','customerName','deliveryDate','orderDate','customerReference','versions'];
 if(Object.keys(i).sort().join(',')!==keys.sort().join(',')||!text(i.quoteId)||!i.quoteId||!text(i.revisionId)||!i.revisionId||!Number.isSafeInteger(i.expectedVersion)||Number(i.expectedVersion)<1||typeof i.fingerprint!=='string'||!/^([a-f0-9]{64})$/u.test(i.fingerprint)||!text(i.businessStyleNo)||!String(i.businessStyleNo).trim()||!text(i.customerName,300)||!String(i.customerName).trim()||!text(i.orderDate)||!(i.deliveryDate===null||text(i.deliveryDate))||!text(i.customerReference)||!Array.isArray(i.versions)||!i.versions.length||i.versions.length>25)fail(400,'invalid_processing_quote_push');
 const versions=i.versions.map(v=>{const p=object(v);if(Object.keys(p).sort().join(',')!=='batchId,confirmedLabor,newOrder,priceVersionId,quantity'||!text(p.priceVersionId)||!p.priceVersionId||!decimal(p.quantity)||!decimal(p.confirmedLabor)||typeof p.newOrder!=='boolean'||!(p.batchId===null||identityUuid.test(String(p.batchId))))fail(400,'invalid_processing_quote_push');return {...p,quantity:canonicalDecimal(p.quantity as string),confirmedLabor:canonicalDecimal(p.confirmedLabor as string)} as PriceEdit;});
 if(new Set(versions.map(v=>v.priceVersionId)).size!==versions.length)fail(400,'duplicate_processing_price_version');
 return {...i,versions} as PushItem;
}
async function pushQuote(pool:Pool,actor:TrustedIdentity,requestId:string,item:PushItem):Promise<PushResult & {replayed:boolean}>{
 const c=await pool.connect(),payloadHash=productHash(item);let committing=false;try{
  await c.query('BEGIN');await c.query("SET LOCAL lock_timeout='5s'");await lockEffectiveAttribution(c);const a=await authorize(c,actor,true);
  await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['processing-push:'+a.internalUserId+':'+requestId+':'+item.quoteId]);
  const old=(await c.query('SELECT payload_hash,result FROM processing_quote_push_receipts WHERE actor_id=$1 AND request_id=$2 AND quote_id=$3',[a.internalUserId,requestId,item.quoteId])).rows[0];
  if(old){if(old.payload_hash!==payloadHash)fail(409,'processing_push_retry_mismatch');await c.query('COMMIT');return {...old.result,replayed:true};}
  const q=await readPushQuote(c,item.quoteId,item.expectedVersion);
  const alreadyConsumed=item.versions.every(v=>v.batchId&&q.view.versions.find(p=>p.id===v.priceVersionId)?.existing.some(b=>b.id===v.batchId&&b.salesOrderId));
  if((q.view.fingerprint!==item.fingerprint&&!alreadyConsumed)||q.revision.revisionId!==item.revisionId)fail(409,'processing_push_preview_changed');
  const creates=item.versions.filter(v=>v.batchId===null);
  if(creates.length&&creates.length!==item.versions.length)fail(409,'processing_push_split_existing_and_new');
  let next=structuredClone(q.record.quote);
  for(const v of item.versions){const source=q.view.versions.find(p=>p.id===v.priceVersionId);if(!source)fail(409,'quote_price_version_not_found');
   if(v.batchId===null&&source.existing.length&&!v.newOrder)fail(409,'processing_order_already_registered');
   if(v.batchId!==null){const batch=source.existing.find(b=>b.id===v.batchId);if(!batch)fail(409,'processing_batch_changed');if(!batch.salesOrderId&&(v.newOrder||v.quantity!==batch.quantity||item.businessStyleNo!==batch.styleNo||item.deliveryDate!==batch.deliveryDate||item.customerName!==batch.customerName||v.confirmedLabor!==source.confirmedLabor))fail(409,'existing_processing_batch_read_only');continue;}
   parseProcessingBatchDraft({requestId,quoteId:item.quoteId,revisionId:item.revisionId,priceVersionId:v.priceVersionId,customerName:item.customerName,businessStyleNo:item.businessStyleNo,quantity:v.quantity,orderDate:item.orderDate,deliveryDate:item.deliveryDate,customerReference:item.customerReference,deliveryRequirements:'',referenceOrderId:null});
   const target=next.revisions.find(r=>r.revisionId===item.revisionId)!;target.baseInfo.quoteStyleNo=item.businessStyleNo.trim();target.baseInfo.garmentLeadDate=item.deliveryDate;target.priceVersions.find(p=>p.id===v.priceVersionId)!.quantity=v.quantity;
   if(source.termsVersion===0){requirePermission(a.permissions,'quote.confirm');next=applyQuoteConfirmation(next,{action:'confirmation.save',expectedVersion:q.record.version,revisionId:item.revisionId,priceVersionId:v.priceVersionId,confirmedLaborPrice:v.confirmedLabor,confirmedGarmentPrice:null,note:'Processing customer order confirmation'},new Date().toISOString());}
  }
  const changed=!isDeepStrictEqual(next,q.record.quote),saved=changed?await saveQuoteAggregateInTransaction(c,next,q.record.version):q.record;
  for(const v of creates){const source=q.view.versions.find(p=>p.id===v.priceVersionId)!;if(source.termsVersion>0)await updateQuoteTermsInTransaction(c,a,{quoteId:item.quoteId,revisionId:item.revisionId,priceVersionId:v.priceVersionId},{expectedVersion:source.termsVersion,expectedQuoteVersion:saved.version,confirmedLaborPrice:v.confirmedLabor,laborCurrency:source.currency});}
  const receipts=[];
  for(const v of item.versions){let batchId=v.batchId,version=0;
   const itemRequest=uuidFor(requestId,item.quoteId,v.priceVersionId);
   if(!batchId){const created=await createProcessingBatchInTransaction(c,a,{requestId:itemRequest,quoteId:item.quoteId,revisionId:item.revisionId,priceVersionId:v.priceVersionId,customerName:item.customerName,businessStyleNo:item.businessStyleNo,quantity:v.quantity,orderDate:item.orderDate,deliveryDate:item.deliveryDate,customerReference:item.customerReference,deliveryRequirements:'',referenceOrderId:null});batchId=created.batchId;version=created.version!;}
   else version=q.view.versions.find(p=>p.id===v.priceVersionId)!.existing.find(b=>b.id===batchId)!.version;
   const existing=q.view.versions.find(p=>p.id===v.priceVersionId)!.existing.find(b=>b.id===batchId);
   if(existing?.salesOrderId){receipts.push(await consumeProcessingBatchInTransaction(c,a,itemRequest,{batchId,expectedVersion:version}));continue;}
   const candidate=await readCommercialCandidate(c,{quoteId:item.quoteId,revisionId:item.revisionId,priceVersionId:v.priceVersionId});
   const confirmed=await confirmProcessingBatchInTransaction(c,a,batchId,{requestId:itemRequest,expectedVersion:version,sourceFingerprint:candidate.fingerprint});
   receipts.push(await consumeProcessingBatchInTransaction(c,a,itemRequest,{batchId,expectedVersion:confirmed.version!}));
  }
  const result:PushResult={quoteId:item.quoteId,quoteVersion:saved.version,items:receipts};
  await appendOperationLog(c,a,{module:'报价中心',action:'推送加工订单',entityType:'Quote',entityId:item.quoteId,quoteId:item.quoteId,beforeData:{values:{version:q.record.version}},afterData:{values:{version:saved.version}},metadata:{requestId,batchIds:receipts.map(r=>r.batchId),quoteSynchronized:changed}});
  await c.query('INSERT INTO processing_quote_push_receipts(actor_id,request_id,quote_id,payload_hash,result) VALUES($1,$2,$3,$4,$5)',[a.internalUserId,requestId,item.quoteId,payloadHash,result]);
  committing=true;await c.query('COMMIT');return {...result,replayed:false};
 }catch(e){let rollbackKnown=true;await c.query('ROLLBACK').catch(()=>{rollbackKnown=false;});if(!(e instanceof HttpError))fail(500,committing||!rollbackKnown?'processing_push_result_unverified':'processing_push_failed');throw e;}finally{c.release();}
}
export async function pushProcessingQuotes(pool:Pool,actor:TrustedIdentity,raw:Record<string,unknown>){
 if(Object.keys(raw).sort().join(',')!=='items,requestId'||!identityUuid.test(String(raw.requestId))||!Array.isArray(raw.items)||!raw.items.length||raw.items.length>25)fail(400,'invalid_processing_quote_push');
 const items=raw.items.map(parseItem);if(new Set(items.map(i=>i.quoteId)).size!==items.length)fail(400,'duplicate_processing_quote');
 const results=[];for(const item of items)try{results.push({status:'processed' as const,...await pushQuote(pool,actor,String(raw.requestId).toLowerCase(),item)});}catch(e){results.push({quoteId:item.quoteId,status:'failed' as const,code:e instanceof HttpError?e.code:'processing_push_result_unverified'});}
 return {results};
}

export async function readProcessingPushReceipt(pool:Pool,actor:TrustedIdentity,requestId:string){if(!identityUuid.test(requestId))fail(400,'invalid_processing_push_request');const c=await pool.connect();try{const a=await authorize(c,actor);return {results:(await c.query<{result:PushResult}>('SELECT result FROM processing_quote_push_receipts WHERE actor_id=$1 AND request_id=$2 ORDER BY quote_id',[a.internalUserId,requestId])).rows.map(r=>r.result)};}finally{c.release();}}
