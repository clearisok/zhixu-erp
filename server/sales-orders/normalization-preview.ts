import { createHash } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import type { TrustedIdentity } from '../auth/session.js';
import { permissionsForUser, requirePermission } from '../auth/permissions.js';
import { HttpError } from '../http/errors.js';
import { requireOrderCommandActor } from './identity-service.js';
import { identityUuid } from './identity-model.js';
import { assessNormalizationPair, type NormalizationOrderEvidence } from './normalization-assessment.js';
// Fixed identifiers only. Never interpolate caller-controlled table/column names.
export const NORMALIZATION_REFERENCES = [
 ['sales_orders','source_order_id','id'],
 ['sales_order_attribution_members','sales_order_id','change_id'],
 ['sales_order_attribution_members','effective_order_id','change_id'],
 ['sales_order_attribution_heads','sales_order_id','sales_order_id'],
 ['sales_order_normalization_cases','first_order_id','id'],
 ['sales_order_normalization_cases','second_order_id','id'],
 ['sales_order_source_links','sales_order_id','id'],
 ['ainuoke_sales_order_contract_mirrors','sales_order_id','sales_order_id'],
 ['ainuoke_sales_order_color_mirrors','sales_order_id','id'],
 ['confirmed_commercial_terms_sales_orders','sales_order_id','sales_order_id'],
 ['sales_order_delivery_plan_sets','sales_order_id','sales_order_id'],
 ['sales_order_delivery_plans','sales_order_id','id'],
 ['ainuoke_material_source_snapshots','sales_order_id','run_id'],
 ['sales_order_identity_profiles','sales_order_id','sales_order_id'],
 ['sales_order_identity_profiles','reference_order_id','sales_order_id'],
 ['sales_order_preparations','reference_order_id','id'],
 ['sales_order_commercial_versions','sales_order_id','id'],
 ['sales_order_commercial_heads','sales_order_id','sales_order_id'],
 ['processing_order_batches','reference_order_id','id'],
 ['processing_order_batch_consumptions','sales_order_id','batch_id'],
] as const;
const references=NORMALIZATION_REFERENCES;
export function validateNormalizationPair(ids: readonly string[]) {
 if(ids.length!==2 || ids.some(id=>typeof id!=='string'||!identityUuid.test(id)) || ids[0].toLowerCase()===ids[1].toLowerCase()) throw new HttpError(400,'invalid_normalization_pair','Two distinct order IDs required');
}
export async function requireNormalizationAdmin(client:PoolClient,actor:TrustedIdentity,lock=false) {
 const current=lock?await requireOrderCommandActor(client,actor,'order.view'):actor;
 const user=(await client.query(`SELECT u.public_id::text,u.active,EXISTS(SELECT 1 FROM app_user_roles r WHERE r.user_id=u.id AND r.role_id='role-server-admin') AS administrator FROM app_users u WHERE u.id=$1`,[actor.internalUserId])).rows[0];
 if(!user?.active || user.public_id!==actor.userId) throw new HttpError(401,'authentication_required','Authentication required');
 if(!user.administrator) throw new HttpError(403,'normalization_admin_required','Administrator required');
 const permissions=lock?current.permissions:await permissionsForUser(client,actor.internalUserId);
 requirePermission(permissions,'order.view');return {...current,permissions};
}
/** Caller owns the transaction and trusted authorization. No caller-supplied evidence. */
export async function collectNormalizationEvidenceInTransaction(client:PoolClient,ids:readonly string[]) {
 validateNormalizationPair(ids);
  const capturedAt=(await client.query('SELECT transaction_timestamp()::text AS captured_at')).rows[0].captured_at as string;
  const foreignKeys=(await client.query(`SELECT n.nspname AS schema,c.relname AS relation,a.attname AS column FROM pg_constraint f JOIN pg_class c ON c.oid=f.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN LATERAL unnest(f.conkey) k(attnum) JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum=k.attnum WHERE f.contype='f' AND f.confrelid='sales_orders'::regclass ORDER BY 1,2,3`)).rows as {schema:string;relation:string;column:string}[];
  const unknownReferences=foreignKeys.filter(f=>f.schema!=='public'||!references.some(([table,column])=>table===f.relation&&column===f.column)).map(f=>`${f.schema}.${f.relation}.${f.column}`);
  const orders=[];
  for(const id of ids) {
   const order=(await client.query(`SELECT id::text,order_no,creation_source,lifecycle_state,version,source_order_id::text,source_quote_id,source_revision_id,source_price_version_id FROM sales_orders WHERE id=$1`,[id])).rows[0];
   if(!order) throw new HttpError(404,'sales_order_not_found','Sales order not found');
   const inventory:{relation:string;column:string;count:string;sampleIds:string[];truncated:boolean}[]=[];
   for(const [table,column,key] of references) {
    const rows=(await client.query(`SELECT ${key}::text AS id,count(*) OVER()::text AS total FROM ${table} WHERE ${column}=$1 ORDER BY ${key} LIMIT 100`,[id])).rows as {id:string;total:string}[];
    inventory.push({relation:table,column,count:rows[0]?.total??'0',sampleIds:rows.map(row=>row.id),truncated:BigInt(rows[0]?.total??'0')>BigInt(100)});
   }
   const contractFacts=(await client.query('SELECT source_id,source_row_identity,sales_contract_no,inside_order_no,style_no,customer_name_snapshot,brand_name_snapshot,quantity::text,contract_delivery_date::text,lifecycle_status_raw,source_hash,fetched_at FROM ainuoke_sales_order_contract_mirrors WHERE sales_order_id=$1',[id])).rows[0]??null;
   const sourceIdentities=(await client.query('SELECT id::text,source_system,source_entity_type,external_id,sales_contract_no,inside_order_no FROM sales_order_source_links WHERE sales_order_id=$1 ORDER BY id LIMIT 100',[id])).rows;
   const trusted=(await client.query(`SELECT 1 FROM sales_order_source_links l JOIN ainuoke_sales_order_contract_mirrors m ON m.sales_order_id=l.sales_order_id AND m.source_id=l.external_id AND m.sales_contract_no=l.sales_contract_no WHERE l.sales_order_id=$1 AND l.source_system='ainuoke' AND l.source_entity_type='sales_contract'`,[id])).rowCount===1;
   const batch=(await client.query('SELECT batch_id::text FROM processing_order_batch_consumptions WHERE sales_order_id=$1',[id])).rows[0];
   const count=(relation:string)=>{const n=Number(inventory.find(row=>row.relation===relation)?.count??0);if(!Number.isSafeInteger(n)) throw new Error('Reference count exceeds safe range');return n;};
   const evidence:NormalizationOrderEvidence={id:order.id,trustedContract:order.creation_source==='ainuoke'&&trusted,processingBatchId:batch?.batch_id??null,lifecycle:order.lifecycle_state,sourceSnapshots:count('ainuoke_material_source_snapshots'),deliveryPlans:count('sales_order_delivery_plans'),commercialVersions:count('sales_order_commercial_versions'),execution:{coverage:'unavailable',count:null},financialLocks:{coverage:'unavailable',count:null},unknownReferences};
   orders.push({order,contractFacts,sourceIdentities,inventory,evidence});
  }
  const assessment=assessNormalizationPair(orders[0].evidence,orders[1].evidence);
  const content={schemaVersion:'order-normalization-preview.v2',orders,unknownReferences,assessment,coverage:'server-declared-references-only',externalExecutionCoverage:'not-verified',hashScope:'order-contract-facts-counts-first-100-reference-ids-not-execution-token'};
  const reviewHash=createHash('sha256').update(JSON.stringify(content)).digest('hex');
  return {...content,capturedAt,reviewHash};
}
export async function previewOrderNormalization(pool: Pool, actor: TrustedIdentity, ids: readonly string[]) {
 validateNormalizationPair(ids);const client=await pool.connect();
 try {
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  await client.query("SET LOCAL statement_timeout='10s'");
  await requireNormalizationAdmin(client,actor);
  const result=await collectNormalizationEvidenceInTransaction(client,ids);
  await client.query('COMMIT');return result;
 } catch(error) {await client.query('ROLLBACK');throw error;} finally {client.release();}
}
