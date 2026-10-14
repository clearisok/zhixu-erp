import {supportsPreparationAdoption,readPreparationQuoteIntent} from './preparation-source.js';
import {parseCommercialProvenance} from './commercial-source.js';
import {lockEffectiveAttribution,requireEffectiveOrderForWrite,supportsEffectiveAttribution} from './effective-attribution.js';
import {effectiveOrderJoins,sourceOwnerSql} from './effective-order-sql.js';
import { createHash } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import type { TrustedIdentity } from '../auth/session.js';
import { permissionsForUser, requirePermission } from '../auth/permissions.js';
import type { PermissionKey } from '../../features/permissions/model/permissions.js';
import { HttpError } from '../http/errors.js';
import { appendOperationLog } from '../operation-logs/repository.js';
import { identityUuid, parseIdentityCommand, parsePreparation } from './identity-model.js';
function fail(status:number,code:string):never{throw new HttpError(status,code,code);}
type Queryable=Pick<Pool|PoolClient,'query'>;
export async function requireOrderCommandActor(client:PoolClient, actor:TrustedIdentity, permission:PermissionKey){
 const user=(await client.query('SELECT active,public_id::text FROM app_users WHERE id=$1 FOR SHARE',[actor.internalUserId])).rows[0];
 if(!user?.active||user.public_id!==actor.userId)fail(401,'authentication_required');
 await client.query('SELECT ur.user_id FROM app_user_roles ur JOIN app_role_permissions rp ON rp.role_id=ur.role_id WHERE ur.user_id=$1 FOR SHARE OF ur,rp',[actor.internalUserId]);
 const current={...actor,permissions:await permissionsForUser(client,actor.internalUserId)};
 requirePermission(current.permissions,'order.view');requirePermission(current.permissions,permission);return current;
}
export async function requireVerifiedOrderBusiness(client:Queryable,id:string,lock=false){
 if(!identityUuid.test(id))fail(400,'invalid_order_id');
 const order=(await client.query(`SELECT id::text,creation_source,lifecycle_state FROM sales_orders WHERE id=$1::uuid ${lock?'FOR UPDATE':''}`,[id])).rows[0];
 if(!order)fail(404,'sales_order_not_found');
 const attributed=await supportsEffectiveAttribution(client);
 const source=(await client.query(`SELECT m.source_id FROM sales_orders so ${effectiveOrderJoins(attributed)} JOIN ainuoke_sales_order_contract_mirrors m ON m.sales_order_id=${sourceOwnerSql(attributed)} JOIN sales_order_source_links l ON l.sales_order_id=m.sales_order_id AND l.external_id=m.source_id AND l.sales_contract_no=m.sales_contract_no WHERE so.id=$1::uuid AND l.source_system='ainuoke' AND l.source_entity_type='sales_contract'`,[id])).rows;
 const effective=attributed?(await client.query('SELECT attribution_change_id FROM sales_order_effective_identities WHERE original_order_id=$1 AND effective_order_id=$1',[id])).rows[0]:null;
 if((order.creation_source==='ainuoke'||effective?.attribution_change_id)&&source.length===1)return {...order,businessType:'ainuoke_contract'};
 if(order.creation_source==='quote'){
  const profile=(await client.query("SELECT business_type FROM sales_order_identity_profiles WHERE sales_order_id=$1",[id])).rows[0];
  if(profile?.business_type==='processing'){
   const trusted=(await client.query(`SELECT b.id FROM processing_order_batch_consumptions c JOIN processing_order_batches b ON b.id=c.batch_id JOIN sales_orders o ON o.id=c.sales_order_id WHERE o.id=$1 AND b.state='consumed' AND o.source_quote_id=b.quote_id AND o.source_revision_id=b.revision_id AND o.source_price_version_id=b.price_version_id`,[id])).rowCount;
   if(trusted===1)return {...order,businessType:'processing'};
  }
 }
 fail(409,'trusted_contract_required');
}
export async function readOrderIdentity(client:Queryable,id:string){
 if(!identityUuid.test(id))fail(400,'invalid_order_id');
 const attributed=await supportsEffectiveAttribution(client);const prepared=await supportsPreparationAdoption(client);const processing=(await client.query("SELECT to_regclass('public.processing_order_batch_consumptions') IS NOT NULL AS ready")).rows[0]?.ready;
 const row=(await client.query(`SELECT ${prepared?'p.preparation_id::text':'NULL::text'} AS preparation_id,${processing?`EXISTS(SELECT 1 FROM processing_order_batch_consumptions c JOIN processing_order_batches b ON b.id=c.batch_id WHERE c.sales_order_id=so.id AND b.state='consumed' AND so.creation_source='quote' AND so.source_quote_id=b.quote_id AND so.source_revision_id=b.revision_id AND so.source_price_version_id=b.price_version_id)`:'false'} AS trusted_processing,so.id::text,so.creation_source,p.business_type,p.version,p.lineage,p.reference_order_id::text,p.specification_changes,u.public_id::text AS owner_id,u.display_name AS owner_name,
 ${attributed?'attribution.effective_order_id::text':'so.id::text'} AS effective_order_id,
 ${attributed?'attribution.attribution_change_id::text':'NULL::text'} AS attribution_change_id,
 EXISTS(SELECT 1 FROM ainuoke_sales_order_contract_mirrors m JOIN sales_order_source_links l ON l.sales_order_id=m.sales_order_id AND l.external_id=m.source_id AND l.sales_contract_no=m.sales_contract_no WHERE m.sales_order_id=${sourceOwnerSql(attributed)} AND l.source_system='ainuoke' AND l.source_entity_type='sales_contract') AS trusted_contract
 FROM sales_orders so ${effectiveOrderJoins(attributed)} LEFT JOIN sales_order_identity_profiles p ON p.sales_order_id=so.id LEFT JOIN app_users u ON u.id=p.owner_id WHERE so.id=$1::uuid`,[id])).rows[0];
 if(!row)fail(404,'sales_order_not_found');
 const contractType=row.trusted_contract&&(row.creation_source==='ainuoke'||row.attribution_change_id&&row.effective_order_id===row.id);
 const businessType=row.business_type==='processing'&&row.trusted_processing?'processing':contractType?'ainuoke_contract':'unclassified';
 return {salesOrderId:row.id,businessType,version:row.version??0,ownerId:row.owner_id??null,ownerName:row.owner_name??null,lineage:row.lineage??'pending',referenceOrderId:row.reference_order_id??null,specificationChanges:row.specification_changes??'',preparationId:row.preparation_id??null};
}
export async function assertOrderLineageReference(client:PoolClient,id:string,referenceOrderId:string){
   if(referenceOrderId===id)fail(409,'lineage_cycle');
   if(!(await client.query('SELECT id FROM sales_orders WHERE id=$1::uuid',[referenceOrderId])).rowCount)fail(404,'reference_order_not_found');
   const attributed=await supportsEffectiveAttribution(client);
   const cycle=await client.query(`WITH RECURSIVE ancestors(id) AS (SELECT ${attributed?'effective_order_id FROM sales_order_effective_identities WHERE original_order_id=$1::uuid':'$1::uuid'} UNION SELECT ${attributed?'next.effective_order_id':'p.reference_order_id'} FROM sales_order_identity_profiles p JOIN ancestors a ON p.sales_order_id=a.id ${attributed?'JOIN sales_order_effective_identities next ON next.original_order_id=p.reference_order_id':''} WHERE p.reference_order_id IS NOT NULL) SELECT id FROM ancestors WHERE id=$2::uuid`,[referenceOrderId,id]);
   if(cycle.rowCount)fail(409,'lineage_cycle');
}
export async function mutateOrderIdentity(pool:Pool, actor:TrustedIdentity,id:string,raw:Record<string,unknown>){
 const command=parseIdentityCommand(raw);const client=await pool.connect();
 try{
  await client.query('BEGIN');await client.query("SET LOCAL lock_timeout='5s'");
  await lockEffectiveAttribution(client);
  const current=await requireOrderCommandActor(client,actor,command.action==='claim'?'order.claim':command.action==='transfer'?'order.transfer':'order.lineage.edit');
  // Global lineage lock also serializes claim/transfer, giving one lock order and preventing concurrent cycles.
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended('order-identity-lineage',0))");
  await requireEffectiveOrderForWrite(client,id);
  const eligible=await requireVerifiedOrderBusiness(client,id,true);const before=await readOrderIdentity(client,id);
  if(before.version!==command.expectedVersion)fail(409,'order_identity_version_conflict');
  if(command.action==='claim'&&before.ownerId!==null)fail(409,'order_already_claimed');
  if(command.action==='lineage'&&before.ownerId!==current.userId&&!current.permissions.includes('order.transfer'))fail(403,'order_owner_required');
  let ownerInternal:string|null=null;
  if(command.action==='transfer'){
   const target=(await client.query('SELECT id::text FROM app_users WHERE public_id=$1::uuid AND active FOR SHARE',[command.ownerId])).rows[0];
   if(!target)fail(409,'claim_target_unavailable');
   await client.query('SELECT ur.user_id FROM app_user_roles ur JOIN app_role_permissions rp ON rp.role_id=ur.role_id WHERE ur.user_id=$1 FOR SHARE OF ur,rp',[target.id]);
   const permissions=await permissionsForUser(client,target.id);
   if(!permissions.includes('order.view')||!permissions.includes('order.claim'))fail(409,'claim_target_unavailable');ownerInternal=target.id;
  }
  if(command.action==='lineage'&&command.referenceOrderId)await assertOrderLineageReference(client,id,command.referenceOrderId);
  await client.query("INSERT INTO sales_order_identity_profiles(sales_order_id,business_type) VALUES($1,$2) ON CONFLICT DO NOTHING",[id,eligible.businessType]);
  // First insertion is version 1. Existing mutations always increment; first change goes to 2 atomically.
  if(command.action==='claim'||command.action==='transfer')await client.query('UPDATE sales_order_identity_profiles SET owner_id=$2,version=version+1 WHERE sales_order_id=$1',[id,command.action==='claim'?current.internalUserId:ownerInternal]);
  else {const prepared=await supportsPreparationAdoption(client);await client.query(`UPDATE sales_order_identity_profiles SET lineage=$2,reference_order_id=$3,specification_changes=$4,${prepared?'preparation_id=NULL,':''}version=version+1 WHERE sales_order_id=$1`,[id,command.lineage,command.referenceOrderId,command.specificationChanges]);}
  const after=await readOrderIdentity(client,id);
  await appendOperationLog(client,current,{module:'订单中心',action:'维护订单身份',entityType:'SalesOrderIdentity',entityId:id,beforeData:{values:{...before}},afterData:{values:{...after}},metadata:{command:command.action,...(command.action==='transfer'?{reason:command.reason}:{})}});
  await client.query('COMMIT');return after;
 }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
}
export async function createOrderPreparation(pool:Pool,actor:TrustedIdentity,raw:Record<string,unknown>){
 const command=parsePreparation(raw),proposed=command.proposedCommercialSource?parseCommercialProvenance(command.proposedCommercialSource):null;const base=[command.referenceOrderId,command.quantity,command.deliveryDate,command.specificationChanges];const hash=createHash('sha256').update(JSON.stringify(proposed?[...base,proposed]:base)).digest('hex');const client=await pool.connect();
 try{await client.query('BEGIN');await client.query("SET LOCAL lock_timeout='5s'");await lockEffectiveAttribution(client);const current=await requireOrderCommandActor(client,actor,'order.preparation.create');if(proposed)requirePermission(current.permissions,'quote.view');
 await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`order-preparation:${current.internalUserId}:${command.requestId.toLowerCase()}`]);
 const existing=(await client.query('SELECT id::text,payload_hash FROM sales_order_preparations WHERE actor_id=$1 AND request_id=$2',[current.internalUserId,command.requestId])).rows[0];
 if(existing){if(existing.payload_hash!==hash)fail(409,'preparation_retry_mismatch');await client.query('COMMIT');return {id:existing.id,replayed:true};}
 if(!(await client.query('SELECT id FROM sales_orders WHERE id=$1',[command.referenceOrderId])).rowCount)fail(404,'reference_order_not_found');
 if(proposed&&!await supportsPreparationAdoption(client))fail(503,'preparation_adoption_unavailable');const source=proposed?await readPreparationQuoteIntent(client,proposed):null;
 const row=(await client.query('INSERT INTO sales_order_preparations(actor_id,request_id,payload_hash,reference_order_id,quantity,delivery_date,specification_changes) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id::text',[current.internalUserId,command.requestId,hash,command.referenceOrderId,command.quantity,command.deliveryDate,command.specificationChanges])).rows[0];
 if(source)await client.query('INSERT INTO sales_order_preparation_commercial_refs(preparation_id,quote_id,revision_id,price_version_id,observed_quote_version) VALUES($1,$2,$3,$4,$5)',[row.id,source.quoteId,source.revisionId,source.priceVersionId,source.observedQuoteVersion]);
 await appendOperationLog(client,current,{module:'订单中心',action:'建立翻单准备',entityType:'OrderPreparation',entityId:row.id,afterData:{values:{referenceOrderId:command.referenceOrderId,quantity:command.quantity,deliveryDate:command.deliveryDate,specificationChanges:command.specificationChanges,...(source?{proposedQuoteId:source.quoteId,proposedRevisionId:source.revisionId,proposedPriceVersionId:source.priceVersionId}:{} )}}});
 await client.query('COMMIT');return{id:row.id,replayed:false};
 }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
}

export async function listOrderPreparations(client:Queryable, referenceOrderId:string, offset:number){
 if(!identityUuid.test(referenceOrderId)||!Number.isSafeInteger(offset)||offset<0||offset>100000)fail(400,'invalid_preparation_query');
 const rows=(await client.query(`SELECT p.id::text,p.reference_order_id::text AS "referenceOrderId",p.quantity::text,p.delivery_date::text AS "deliveryDate",p.specification_changes AS "specificationChanges",p.created_at AS "createdAt",u.display_name AS "createdBy" FROM sales_order_preparations p JOIN app_users u ON u.id=p.actor_id WHERE p.reference_order_id=$1 ORDER BY p.created_at DESC,p.id DESC LIMIT 21 OFFSET $2`,[referenceOrderId,offset])).rows;
 return {items:rows.slice(0,20),hasMore:rows.length>20,offset};
}
export async function listClaimants(client:Queryable){
 const rows=(await client.query(`SELECT u.public_id::text AS id,u.display_name AS name FROM app_users u WHERE u.active AND NOT EXISTS(SELECT needed FROM unnest(ARRAY['order.view','order.claim']) needed WHERE NOT EXISTS(SELECT 1 FROM app_user_roles ur JOIN app_role_permissions rp ON rp.role_id=ur.role_id WHERE ur.user_id=u.id AND rp.permission_key=needed)) ORDER BY u.display_name,u.public_id`)).rows;
 return {users:rows};
}
