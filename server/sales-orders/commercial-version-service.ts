import {orderCommandControlError} from './command-control.js';
import {appendBusinessSourceSnapshot,quoteProductSnapshot,type BusinessSourceSnapshot} from './product-snapshot.js';
import {lockEffectiveAttribution,requireEffectiveOrderForWrite} from './effective-attribution.js';
import {createHash} from 'node:crypto';
import type {Pool,PoolClient} from 'pg';
import type {TrustedIdentity} from '../auth/session.js';
import {requirePermission} from '../auth/permissions.js';
import {HttpError} from '../http/errors.js';
import {appendOperationLog} from '../operation-logs/repository.js';
import {identityUuid} from './identity-model.js';
import {readOrderIdentity,requireOrderCommandActor} from './identity-service.js';
import {readCommercialCandidate,type CommercialCandidate} from './commercial-source.js';
import type {QuoteProvenance} from '../confirmed-commercial-terms/repository.js';

type Queryable=Pick<Pool|PoolClient,'query'>;
function fail(status:number,code:string):never{throw new HttpError(status,code,code);}
export type AdoptCommercialCommand=QuoteProvenance & {requestId:string;expectedVersion:number;sourceFingerprint:string;reason:string};
export function parseAdoptCommercial(raw:Record<string,unknown>):AdoptCommercialCommand{
 const keys=['quoteId','revisionId','priceVersionId','requestId','expectedVersion','sourceFingerprint','reason'];
 if(Object.keys(raw).length!==keys.length||keys.some(k=>!Object.hasOwn(raw,k)))fail(400,'invalid_commercial_adoption');
 for(const k of ['quoteId','revisionId','priceVersionId'])if(typeof raw[k]!=='string'||!(raw[k] as string).trim()||(raw[k] as string).length>256)fail(400,'invalid_commercial_adoption');
 if(typeof raw.requestId!=='string'||!identityUuid.test(raw.requestId)||!Number.isSafeInteger(raw.expectedVersion)||Number(raw.expectedVersion)<0||typeof raw.sourceFingerprint!=='string'||!/^([0-9a-f]{64})$/u.test(raw.sourceFingerprint)||typeof raw.reason!=='string'||!raw.reason.trim()||raw.reason.length>2000)fail(400,'invalid_commercial_adoption');
 return raw as AdoptCommercialCommand;
}
export type OrderCommercialVersion={id:string;salesOrderId:string;version:number;quoteId:string;revisionId:string;priceVersionId:string;quoteVersion:number;sourceKind:string;sourceCctId:string|null;sourceCctVersion:number|null;sourceConfirmedAt:string;salePrice:string|null;saleCurrency:'CNY';laborPrice:string;laborCurrency:'CNY'|'USD';adoptedAt:string;reason:string};
const selectVersion=`SELECT id::text,sales_order_id::text AS "salesOrderId",version,quote_id AS "quoteId",revision_id AS "revisionId",price_version_id AS "priceVersionId",source_quote_version AS "quoteVersion",source_kind AS "sourceKind",source_cct_id::text AS "sourceCctId",source_cct_version AS "sourceCctVersion",source_confirmed_at::text AS "sourceConfirmedAt",confirmed_sale_price::text AS "salePrice",sale_currency AS "saleCurrency",confirmed_labor_price::text AS "laborPrice",labor_currency AS "laborCurrency",adopted_at::text AS "adoptedAt",reason FROM sales_order_commercial_versions`;
export async function readOrderCommercialState(client:Queryable,orderId:string){
 if(!identityUuid.test(orderId))fail(400,'invalid_order_id');
 const exists=await client.query('SELECT id FROM sales_orders WHERE id=$1',[orderId]);if(!exists.rowCount)fail(404,'sales_order_not_found');
 const head=(await client.query('SELECT current_version_id::text,version FROM sales_order_commercial_heads WHERE sales_order_id=$1',[orderId])).rows[0];
 const current=head?(await client.query<OrderCommercialVersion>(selectVersion+' WHERE id=$1',[head.current_version_id])).rows[0]:null;
 return {version:head?.version??0,current:current??null};
}
async function authorized(client:PoolClient,actor:TrustedIdentity){
 const current=await requireOrderCommandActor(client,actor,'order.commercial.adopt');
 for(const p of ['quote.view','commercial.sale.view','commercial.labor.view'] as const)requirePermission(current.permissions,p);
 return current;
}
async function editableOrder(client:PoolClient,actor:TrustedIdentity,orderId:string,candidate:CommercialCandidate){
 if(!identityUuid.test(orderId))fail(400,'invalid_order_id');
 await requireEffectiveOrderForWrite(client,orderId);
 const row=(await client.query('SELECT lifecycle_state FROM sales_orders WHERE id=$1 FOR UPDATE',[orderId])).rows[0];if(!row)fail(404,'sales_order_not_found');
 if(['completed','cancelled'].includes(row.lifecycle_state))fail(409,'order_commercial_frozen');
 const identity=await readOrderIdentity(client,orderId);
 if(identity.businessType==='unclassified')fail(409,'order_business_type_unverified');
 if((identity.businessType==='processing')!==(candidate.quoteType==='processing'))fail(409,'order_quote_business_type_conflict');
 if(!identity.ownerId)fail(409,'order_claim_required');
 if(identity.ownerId!==actor.userId&&!actor.permissions.includes('order.transfer'))fail(403,'order_owner_required');
}
export async function previewOrderCommercial(pool:Pool,actor:TrustedIdentity,orderId:string,source:QuoteProvenance){
 const client=await pool.connect();try{await client.query('BEGIN');await client.query("SET LOCAL lock_timeout='5s'");await lockEffectiveAttribution(client);const currentActor=await authorized(client,actor);const candidate=await readCommercialCandidate(client,source);await editableOrder(client,currentActor,orderId,candidate);const current=await readOrderCommercialState(client,orderId);await client.query('ROLLBACK');return {current,candidate};}catch(e){await client.query('ROLLBACK');throw orderCommandControlError(e);}finally{client.release();}
}
export async function adoptOrderCommercial(pool:Pool,actor:TrustedIdentity,orderId:string,raw:Record<string,unknown>){
 const command=parseAdoptCommercial(raw);if(!identityUuid.test(orderId))fail(400,'invalid_order_id');
 const payloadHash=createHash('sha256').update(JSON.stringify([orderId.toLowerCase(),command.quoteId,command.revisionId,command.priceVersionId,command.expectedVersion,command.sourceFingerprint,command.reason])).digest('hex');
 const client=await pool.connect();try{
  await client.query('BEGIN');await client.query("SET LOCAL lock_timeout='5s'");await lockEffectiveAttribution(client);const currentActor=await authorized(client,actor);
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['order-commercial-request:'+actor.internalUserId+':'+command.requestId.toLowerCase()]);
  const prior=(await client.query('SELECT id::text,payload_hash,sales_order_id::text FROM sales_order_commercial_versions WHERE actor_id=$1 AND request_id=$2',[actor.internalUserId,command.requestId])).rows[0];
  if(prior){if(prior.payload_hash!==payloadHash||prior.sales_order_id!==orderId.toLowerCase())fail(409,'commercial_adoption_retry_mismatch');const adopted=(await client.query<OrderCommercialVersion>(selectVersion+' WHERE id=$1',[prior.id])).rows[0];await client.query('COMMIT');return{adopted,replayed:true};}
  const candidate=await readCommercialCandidate(client,{quoteId:command.quoteId,revisionId:command.revisionId,priceVersionId:command.priceVersionId});
  if(candidate.fingerprint!==command.sourceFingerprint)fail(409,'commercial_source_changed');
  await editableOrder(client,currentActor,orderId,candidate);const before=await readOrderCommercialState(client,orderId);
  if(before.version!==command.expectedVersion)fail(409,'order_commercial_version_conflict');
  const row=await appendCommercialVersion(client,{orderId,version:before.version+1,actorId:currentActor.internalUserId,requestId:command.requestId,payloadHash,candidate,reason:command.reason});
  const after=await readOrderCommercialState(client,orderId);
  await appendOperationLog(client,currentActor,{module:'订单中心',action:'采用订单商业版本',entityType:'OrderCommercialVersion',entityId:row.id,quoteId:candidate.quoteId,beforeData:before.current?{values:{customerConfirmedPrice:before.current.salePrice,confirmedLaborPrice:before.current.laborPrice,laborCurrency:before.current.laborCurrency,version:before.version}}:null,afterData:{values:{salesOrderId:orderId,customerConfirmedPrice:candidate.salePrice,confirmedLaborPrice:candidate.laborPrice,laborCurrency:candidate.laborCurrency,version:after.version}},metadata:{reason:command.reason,sourceKind:candidate.sourceKind}});
  await client.query('COMMIT');return{adopted:after.current!,replayed:false};
 }catch(e){await client.query('ROLLBACK');throw orderCommandControlError(e);}finally{client.release();}
}

/** Internal transaction primitive. Caller must authorize and lock the business command. */
export async function appendCommercialVersion(client:PoolClient,input:{orderId:string;version:number;actorId:string;requestId:string;payloadHash:string;candidate:CommercialCandidate;reason:string;businessSource?:BusinessSourceSnapshot}):Promise<{id:string}>{
 const {orderId,version,actorId,requestId,payloadHash,candidate,reason}=input;
  const row=(await client.query(`INSERT INTO sales_order_commercial_versions(sales_order_id,version,actor_id,request_id,payload_hash,quote_id,revision_id,price_version_id,source_quote_version,source_kind,source_cct_id,source_cct_version,source_confirmed_at,source_fingerprint,quote_type,confirmed_sale_price,confirmed_labor_price,labor_currency,reason) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) RETURNING id::text`,[orderId,version,actorId,requestId,payloadHash,candidate.quoteId,candidate.revisionId,candidate.priceVersionId,candidate.quoteVersion,candidate.sourceKind,candidate.sourceCctId,candidate.sourceCctVersion,candidate.sourceConfirmedAt,candidate.fingerprint,candidate.quoteType,candidate.salePrice,candidate.laborPrice,candidate.laborCurrency,reason])).rows[0];
  await client.query('INSERT INTO sales_order_commercial_heads(sales_order_id,current_version_id,version) VALUES($1,$2,$3) ON CONFLICT(sales_order_id) DO UPDATE SET current_version_id=EXCLUDED.current_version_id,version=EXCLUDED.version',[orderId,row.id,version]);
  // Historical migration rehearsals may intentionally predate 0027. Current servers
  // verify the complete migration set before listening; no historical backfill.
  if((await client.query("SELECT to_regclass('sales_order_business_source_snapshots') IS NOT NULL AS ready")).rows[0].ready){
   await appendBusinessSourceSnapshot(client,orderId,row.id,input.businessSource??await quoteProductSnapshot(client,candidate));
  }
 return row;
}
