import type {Pool,PoolClient} from 'pg';
import type {TrustedIdentity} from '../auth/session.js';
import {requirePermission} from '../auth/permissions.js';
import {HttpError} from '../http/errors.js';
import {appendOperationLog} from '../operation-logs/repository.js';
import {identityUuid} from './identity-model.js';
import {requireOrderCommandActor,requireVerifiedOrderBusiness,assertOrderLineageReference} from './identity-service.js';
import {lockEffectiveAttribution,requireEffectiveOrderForWrite} from './effective-attribution.js';
import {readCommercialCandidate,parseCommercialProvenance,type CommercialCandidate} from './commercial-source.js';
import {readOrderCommercialState,appendCommercialVersion} from './commercial-version-service.js';
import {projectOrderCommercialState,projectCommercialCandidate} from './commercial-projection.js';
import {productHash,quoteProductSnapshot,type BusinessSourceSnapshot,type ProductSnapshot} from './product-snapshot.js';
import {orderCommandControlError} from './command-control.js';

function fail(status:number,code:string):never{throw new HttpError(status,code,code);}
type Selection={kind:'quote';quoteId:string;revisionId:string;priceVersionId:string}|{kind:'reorder';referenceOrderId:string;unchanged:true};
export function parseBusinessSourceSelection(raw:Record<string,unknown>):Selection{
 if(raw.kind==='quote'){
  const {kind,...source}=raw;
  return {kind,...parseCommercialProvenance(source)};
 }
 if(raw.kind==='reorder'&&Object.keys(raw).length===3&&typeof raw.referenceOrderId==='string'&&identityUuid.test(raw.referenceOrderId)&&raw.unchanged===true)return {kind:'reorder',referenceOrderId:raw.referenceOrderId.toLowerCase(),unchanged:true};
 fail(400,'invalid_business_source_selection');
}
type Command={selection:Selection;requestId:string;expectedVersion:number;fingerprint:string;reason:string};
export function parseBusinessSourceCommand(raw:Record<string,unknown>):Command{
 const keys=['selection','requestId','expectedVersion','fingerprint','reason'];
 if(Object.keys(raw).length!==keys.length||keys.some(k=>!Object.hasOwn(raw,k))||!raw.selection||typeof raw.selection!=='object'||Array.isArray(raw.selection)||typeof raw.requestId!=='string'||!identityUuid.test(raw.requestId)||!Number.isSafeInteger(raw.expectedVersion)||Number(raw.expectedVersion)<0||typeof raw.fingerprint!=='string'||!/[a-f0-9]{64}/u.test(raw.fingerprint)||raw.fingerprint.length!==64||typeof raw.reason!=='string'||!raw.reason.trim()||raw.reason.length>2000)fail(400,'invalid_business_source_command');
 return {selection:parseBusinessSourceSelection(raw.selection as Record<string,unknown>),requestId:raw.requestId.toLowerCase(),expectedVersion:Number(raw.expectedVersion),fingerprint:raw.fingerprint,reason:raw.reason.trim()};
}
async function authorize(c:PoolClient,actor:TrustedIdentity){
 const a=await requireOrderCommandActor(c,actor,'order.commercial.adopt');
 for(const p of ['order.lineage.edit','quote.view','commercial.sale.view','commercial.labor.view'] as const)requirePermission(a.permissions,p);
 return a;
}
async function target(c:PoolClient,id:string){
 await requireEffectiveOrderForWrite(c,id);
 const business=await requireVerifiedOrderBusiness(c,id,true);
 if(['completed','cancelled'].includes(business.lifecycle_state))fail(409,'order_commercial_frozen');
 return business;
}
async function selected(c:PoolClient,id:string,selection:Selection){
 let candidate:CommercialCandidate,source:BusinessSourceSnapshot;
 if(selection.kind==='quote'){
  const {kind:omitted,...provenance}=selection;void omitted;
  candidate=await readCommercialCandidate(c,provenance);source=await quoteProductSnapshot(c,candidate);
 }else{
  await requireEffectiveOrderForWrite(c,selection.referenceOrderId);
  const reference=await requireVerifiedOrderBusiness(c,selection.referenceOrderId,true);
  if(reference.lifecycle_state==='cancelled')fail(409,'reference_order_cancelled');
  await assertOrderLineageReference(c,id,selection.referenceOrderId);
  const cycle=await c.query(`WITH RECURSIVE chain(id) AS (SELECT $1::uuid UNION SELECT s.reference_order_id FROM chain a JOIN sales_order_commercial_heads h ON h.sales_order_id=a.id JOIN sales_order_business_source_snapshots s ON s.commercial_version_id=h.current_version_id WHERE s.kind='reorder') SELECT id FROM chain WHERE id=$2::uuid`,[selection.referenceOrderId,id]);
  if(cycle.rowCount)fail(409,'lineage_cycle');
  const original=(await readOrderCommercialState(c,selection.referenceOrderId)).current;
  if(!original)fail(409,'reference_commercial_snapshot_required');
  const saved=(await c.query('SELECT product_snapshot,product_hash FROM sales_order_business_source_snapshots WHERE commercial_version_id=$1',[original.id])).rows[0];
  if(!saved||productHash(saved.product_snapshot)!==saved.product_hash)fail(409,'reference_product_snapshot_required');
  source={kind:'reorder',referenceOrderId:selection.referenceOrderId,referenceCommercialVersionId:original.id,productSnapshot:saved.product_snapshot,productHash:saved.product_hash};
  candidate={quoteId:original.quoteId,revisionId:original.revisionId,priceVersionId:original.priceVersionId,quoteVersion:original.quoteVersion,quoteType:reference.businessType==='processing'?'processing':'distribution',sourceKind:original.sourceKind as CommercialCandidate['sourceKind'],sourceCctId:original.sourceCctId,sourceCctVersion:original.sourceCctVersion,sourceConfirmedAt:original.sourceConfirmedAt,salePrice:original.salePrice,saleCurrency:original.saleCurrency,laborPrice:original.laborPrice,laborCurrency:original.laborCurrency,fingerprint:productHash({id:original.id,productHash:source.productHash})};
 }
 const business=await target(c,id);
 if((business.businessType==='processing')!==(candidate.quoteType==='processing'))fail(409,'order_quote_business_type_conflict');
 return {candidate,source,fingerprint:productHash({selection,candidate,source})};
}
function productSummary(snapshot:ProductSnapshot){
 const base=snapshot.revision.baseInfo as Record<string,unknown>|undefined;
 const text=(value:unknown)=>typeof value==='string'?value:'';
 return {quoteCode:text(snapshot.quoteCode),revisionLabel:text(snapshot.revision.revisionLabel),priceVersionName:text(snapshot.priceVersion.name),styleNo:text(base?.quoteStyleNo),styleName:text(base?.styleName)};
}
/** Snapshot payloads may contain cost information; only identity and permitted prices leave this boundary. */
export async function readOrderBusinessSource(c:Pick<Pool|PoolClient,'query'>,actor:TrustedIdentity,id:string){
 const state=await readOrderCommercialState(c,id);
 const source=state.current?(await c.query(`SELECT s.kind,s.reference_order_id::text AS "referenceOrderId",s.reference_commercial_version_id::text AS "referenceCommercialVersionId",o.order_no AS "referenceOrderNo",s.product_hash AS "productHash",s.recorded_at AS "recordedAt" FROM sales_order_business_source_snapshots s LEFT JOIN sales_orders o ON o.id=s.reference_order_id WHERE s.commercial_version_id=$1`,[state.current.id])).rows[0]:null;
 const saved=state.current&&actor.permissions.includes('quote.view')?(await c.query('SELECT product_snapshot FROM sales_order_business_source_snapshots WHERE commercial_version_id=$1',[state.current.id])).rows[0]:null;
 return {commercial:projectOrderCommercialState(actor,state),source:source??null,product:saved?productSummary(saved.product_snapshot):null};
}
export async function previewOrderBusinessSource(pool:Pool,actor:TrustedIdentity,id:string,raw:Record<string,unknown>){
 const selection=parseBusinessSourceSelection(raw);if(!identityUuid.test(id))fail(400,'invalid_order_id');
 const c=await pool.connect();try{
  await c.query('BEGIN');await c.query("SET LOCAL lock_timeout='5s'");await lockEffectiveAttribution(c);const a=await authorize(c,actor);
  await c.query("SELECT pg_advisory_xact_lock(hashtextextended('order-identity-lineage',0))");
  const chosen=await selected(c,id,selection),current=await readOrderBusinessSource(c,a,id);
  await c.query('ROLLBACK');return {current,candidate:projectCommercialCandidate(a,chosen.candidate),fingerprint:chosen.fingerprint,kind:chosen.source.kind,product:productSummary(chosen.source.productSnapshot),referenceCommercialVersionId:chosen.source.referenceCommercialVersionId,productHash:chosen.source.productHash};
 }catch(e){await c.query('ROLLBACK');throw orderCommandControlError(e);}finally{c.release();}
}
export async function adoptOrderBusinessSource(pool:Pool,actor:TrustedIdentity,id:string,raw:Record<string,unknown>){
 const command=parseBusinessSourceCommand(raw);if(!identityUuid.test(id))fail(400,'invalid_order_id');
 const hash=productHash({orderId:id.toLowerCase(),...command}),c=await pool.connect();
 try{
  await c.query('BEGIN');await c.query("SET LOCAL lock_timeout='5s'");await lockEffectiveAttribution(c);const a=await authorize(c,actor);
  await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['order-commercial-request:'+actor.internalUserId+':'+command.requestId]);
  const prior=(await c.query('SELECT id::text,payload_hash FROM sales_order_commercial_versions WHERE actor_id=$1 AND request_id=$2',[a.internalUserId,command.requestId])).rows[0];
  if(prior){if(prior.payload_hash!==hash)fail(409,'business_source_retry_mismatch');await c.query('COMMIT');return {commercialVersionId:prior.id,replayed:true};}
  await c.query("SELECT pg_advisory_xact_lock(hashtextextended('order-identity-lineage',0))");
  const chosen=await selected(c,id,command.selection);
  if(chosen.fingerprint!==command.fingerprint)fail(409,'business_source_changed');
  const before=await readOrderCommercialState(c,id);
  if(before.version!==command.expectedVersion)fail(409,'order_commercial_version_conflict');
  const next=await appendCommercialVersion(c,{orderId:id,version:before.version+1,actorId:a.internalUserId,requestId:command.requestId,payloadHash:hash,candidate:chosen.candidate,reason:command.reason,businessSource:chosen.source});
  await appendOperationLog(c,a,{module:'订单中心',action:'维护订单业务来源',entityType:'OrderCommercialVersion',entityId:next.id,quoteId:chosen.candidate.quoteId,afterData:{values:{salesOrderId:id,version:before.version+1}},metadata:{businessSource:chosen.source.kind,referenceOrderId:chosen.source.referenceOrderId}});
  await c.query('COMMIT');return {commercialVersionId:next.id,replayed:false};
 }catch(e){await c.query('ROLLBACK');throw orderCommandControlError(e);}finally{c.release();}
}
