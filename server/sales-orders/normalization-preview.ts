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
 ['sales_order_delivery_plan_requests','sales_order_id','id'],
 ['ainuoke_material_source_snapshots','sales_order_id','run_id'],
 ['ainuoke_material_order_heads','sales_order_id','source_key'],
 ['ainuoke_order_followups','sales_order_id','sales_order_id'],
 ['ainuoke_payment_source_targets','sales_order_id','source_key'],
 ['ainuoke_payment_snapshots','sales_order_id','id'],
 ['ainuoke_payment_snapshots','source_owner_order_id','id'],
 ['ainuoke_payment_heads','sales_order_id','source_key'],
 ['ainuoke_garment_shipment_targets','sales_order_id','source_key'],
 ['ainuoke_garment_shipment_snapshots','sales_order_id','id'],
 ['ainuoke_garment_shipment_snapshots','source_owner_order_id','id'],
 ['ainuoke_garment_shipment_color_matches','sales_order_id','snapshot_id'],
 ['ainuoke_garment_shipment_heads','sales_order_id','source_key'],
 ['ainuoke_garment_collection_commands','sales_order_id','request_id'],
 ['ainuoke_garment_collection_commands','source_owner_order_id','request_id'],
 ['ainuoke_garment_target_commands','sales_order_id','request_id'],
 ['ainuoke_garment_target_commands','source_owner_order_id','request_id'],
 ['ainuoke_order_source_refresh_receipts','sales_order_id','request_id'],
 ['ainuoke_order_source_refresh_receipts','source_owner_order_id','request_id'],
 ['sales_order_identity_profiles','sales_order_id','sales_order_id'],
 ['sales_order_identity_profiles','reference_order_id','sales_order_id'],
 ['sales_order_preparations','reference_order_id','id'],
 ['sales_order_preparation_adoptions','sales_order_id','id'],
 ['sales_order_preparation_adoptions','reference_order_id','id'],
 ['sales_order_commercial_versions','sales_order_id','id'],
 ['sales_order_commercial_heads','sales_order_id','sales_order_id'],
 ['sales_order_color_identities','sales_order_id','id'],
 ['sales_order_commercial_lines','sales_order_id','id'],
 ['order_sale_adjustment_receipts','sales_order_id','operation_id'],
 ['sales_order_business_source_snapshots','sales_order_id','commercial_version_id'],
 ['sales_order_business_source_snapshots','reference_order_id','commercial_version_id'],
 ['processing_order_batches','reference_order_id','id'],
 ['processing_order_batch_consumptions','sales_order_id','batch_id'],
 ['quote_creation_order_contexts','sales_order_id','quote_id'],
 ['production_order_plan_heads','sales_order_id','sales_order_id'],
 ['production_schedule_assignments','sales_order_id','id'],
 ['production_schedule_plan_versions','sales_order_id','assignment_id'],
 ['production_schedule_command_orders','sales_order_id','request_id'],
 ['production_schedule_executions','sales_order_id','assignment_id'],
 ['production_schedule_execution_versions','sales_order_id','assignment_id'],
 ['production_order_execution_trackings','sales_order_id','id'],
 ['production_order_execution_tracking_versions','sales_order_id','tracking_id'],
 ['material_arrival_demands','sales_order_id','id'],
 ['material_arrival_plans','sales_order_id','id'],
 ['material_arrival_plan_versions','sales_order_id','plan_id'],
 ['material_arrival_command_orders','sales_order_id','request_id'],
 ['server_closing_allocations','sales_order_id','id'],
 ['server_closing_allocation_versions','sales_order_id','id'],
 ['server_closing_month_plans','sales_order_id','sales_order_id'],
 ['server_closing_month_plan_versions','sales_order_id','id'],
 ['server_closing_month_plan_heads','sales_order_id','sales_order_id'],
 ['server_closing_month_financial_links','sales_order_id','allocation_id'],
 ['order_labor_adoption_commands','sales_order_id','request_id'],
 ['order_labor_adoption_commands','declared_order_id','request_id'],
] as const;
const references=NORMALIZATION_REFERENCES;
/** Optional only for an unupgraded rehearsal. A partial financial schema fails
 * closed. Observations are reference evidence, never actual bank payments. */
export async function normalizationReferences(client:PoolClient){
 const catalogTables=['ainuoke_material_order_heads','ainuoke_order_followups'];
 const catalogCount=(await client.query("SELECT count(*)::int AS n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND c.relname=ANY($1::text[])",[catalogTables])).rows[0].n;
 if(catalogCount!==0&&catalogCount!==catalogTables.length)throw new HttpError(503,'catalog_reference_schema_incomplete','Catalogue reference schema is incomplete');
 const garmentTargetsReady=(await client.query("SELECT to_regclass('public.ainuoke_garment_target_commands') IS NOT NULL AS ready")).rows[0].ready;
 const garmentCommandsReady=(await client.query("SELECT to_regclass('public.ainuoke_garment_collection_commands') IS NOT NULL AS ready")).rows[0].ready;
 const refreshReady=(await client.query("SELECT to_regclass('public.ainuoke_order_source_refresh_receipts') IS NOT NULL AS ready")).rows[0].ready;
 const planRequestsReady=(await client.query("SELECT to_regclass('public.sales_order_delivery_plan_requests') IS NOT NULL AS ready")).rows[0].ready;
 const laborAdoptionsReady=(await client.query("SELECT to_regclass('public.order_labor_adoption_commands') IS NOT NULL AS ready")).rows[0].ready;
 const monthFinancialReady=(await client.query("SELECT to_regclass('public.server_closing_month_financial_links') IS NOT NULL AS ready")).rows[0].ready;
 const laborEvidenceReady=(await client.query("SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='sales_order_commercial_lines' AND column_name='labor_confirmation_source') AS ready")).rows[0].ready;
 const references=NORMALIZATION_REFERENCES.filter(([table])=>(catalogCount===catalogTables.length||!catalogTables.includes(table))&&(laborAdoptionsReady||table!=='order_labor_adoption_commands')&&(garmentTargetsReady||table!=='ainuoke_garment_target_commands')&&(garmentCommandsReady||table!=='ainuoke_garment_collection_commands')&&(refreshReady||table!=='ainuoke_order_source_refresh_receipts')&&(planRequestsReady||table!=='sales_order_delivery_plan_requests'));
 const present=(await client.query<{n:number}>(`SELECT count(*)::int AS n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind='r' AND c.relname IN ('ainuoke_payment_source_targets','ainuoke_payment_snapshots','ainuoke_payment_heads')`)).rows[0].n;
 if(present!==0&&present!==3)throw new HttpError(503,'payment_reference_schema_incomplete','Financial source reference schema is incomplete');
 const sourceReady=(await client.query("SELECT to_regclass('sales_order_business_source_snapshots') IS NOT NULL ready")).rows[0].ready;
 const creationContextReady=(await client.query("SELECT to_regclass('quote_creation_order_contexts') IS NOT NULL ready")).rows[0].ready;
 const colorTables=['sales_order_color_identities','sales_order_commercial_lines'];
 const colorCount=(await client.query<{n:number}>(`SELECT count(*)::int AS n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind='r' AND c.relname=ANY($1::text[])`,[colorTables])).rows[0].n;
 if(colorCount!==0&&colorCount!==colorTables.length)throw new HttpError(503,'color_reference_schema_incomplete','Color commercial reference schema is incomplete');
 const adjustmentCount=(await client.query<{n:number}>(`SELECT count(*)::int AS n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind='r' AND c.relname IN ('order_sale_adjustment_operations','order_sale_adjustment_receipts')`)).rows[0].n;
 if(adjustmentCount!==0&&adjustmentCount!==2)throw new HttpError(503,'adjustment_reference_schema_incomplete','Sale adjustment reference schema is incomplete');
 const planningTables=['production_order_plan_heads','production_group_plan_heads','production_schedule_assignments','production_schedule_plan_versions','production_schedule_commands','production_schedule_command_orders','production_schedule_resource_snapshots'];
 const planningCount=(await client.query<{n:number}>(`SELECT count(*)::int AS n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND c.relname=ANY($1::text[])`,[planningTables])).rows[0].n;
 if(planningCount!==0&&planningCount!==planningTables.length)throw new HttpError(503,'production_reference_schema_incomplete','Production plan reference schema is incomplete');
 const executionTables=['production_schedule_executions','production_schedule_execution_versions','production_schedule_execution_epochs'];
 const executionCount=(await client.query<{n:number}>(`SELECT count(*)::int AS n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND c.relname=ANY($1::text[])`,[executionTables])).rows[0].n;
 if(executionCount!==0&&executionCount!==executionTables.length)throw new HttpError(503,'production_execution_reference_schema_incomplete','Production execution reference schema is incomplete');
 const trackingTables=['production_order_execution_trackings','production_order_execution_tracking_versions'];
 const trackingCount=(await client.query<{n:number}>(`SELECT count(*)::int AS n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND c.relname=ANY($1::text[])`,[trackingTables])).rows[0].n;
 if(trackingCount!==0&&trackingCount!==trackingTables.length)throw new HttpError(503,'production_tracking_reference_schema_incomplete','Production tracking reference schema is incomplete');
 const arrivalTables=['material_arrival_demands','material_arrival_plans','material_arrival_plan_versions','material_arrival_commands','material_arrival_command_orders'];
 const arrivalCount=(await client.query<{n:number}>(`SELECT count(*)::int AS n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND c.relname=ANY($1::text[])`,[arrivalTables])).rows[0].n;
 if(arrivalCount!==0&&arrivalCount!==arrivalTables.length)throw new HttpError(503,'material_arrival_reference_schema_incomplete','Material arrival reference schema is incomplete');
 const garmentTables=['ainuoke_garment_shipment_targets','ainuoke_garment_shipment_snapshots','ainuoke_garment_shipment_color_matches','ainuoke_garment_shipment_heads'];
 const garmentCount=(await client.query<{n:number}>(`SELECT count(*)::int AS n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND c.relname=ANY($1::text[])`,[garmentTables])).rows[0].n;
 if(garmentCount!==0&&garmentCount!==garmentTables.length)throw new HttpError(503,'garment_reference_schema_incomplete','Garment shipment reference schema is incomplete');
 if((garmentCommandsReady||garmentTargetsReady)&&garmentCount!==garmentTables.length)throw new HttpError(503,'garment_reference_schema_incomplete','Garment command reference schema is incomplete');
 if(laborAdoptionsReady!==laborEvidenceReady)throw new HttpError(503,'labor_adoption_reference_schema_incomplete','Labor adoption reference schema is incomplete');
 const closingTables=['server_closing_commands','server_closing_periods','server_closing_period_versions','server_closing_period_heads','server_closing_allocations','server_closing_allocation_versions','server_closing_allocation_heads'];
 const closingCount=(await client.query<{n:number}>(`SELECT count(*)::int AS n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND c.relname=ANY($1::text[])`,[closingTables])).rows[0].n;
 if(closingCount!==0&&closingCount!==closingTables.length)throw new HttpError(503,'closing_reference_schema_incomplete','Server closing reference schema is incomplete');
 const monthTables=['server_closing_month_commands','server_closing_month_plans','server_closing_month_plan_versions','server_closing_month_plan_heads'];
 const monthCount=(await client.query<{n:number}>(`SELECT count(*)::int AS n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND c.relname=ANY($1::text[])`,[monthTables])).rows[0].n;
 if(monthCount!==0&&monthCount!==monthTables.length)throw new HttpError(503,'closing_month_reference_schema_incomplete','Order month reference schema is incomplete');
 if(monthCount>0&&closingCount!==closingTables.length)throw new HttpError(503,'closing_month_reference_schema_incomplete','Order month period dependencies are incomplete');
 if(monthFinancialReady&&(monthCount!==monthTables.length||closingCount!==closingTables.length))throw new HttpError(503,'closing_month_financial_schema_incomplete','Month financial dependencies are incomplete');
 if(!monthFinancialReady){const index=references.findIndex(([table])=>table==='server_closing_month_financial_links');if(index>=0)references.splice(index,1);}
 return references.filter(([table])=>(present===3||!table.startsWith('ainuoke_payment_'))&&(sourceReady||table!=='sales_order_business_source_snapshots')&&(creationContextReady||table!=='quote_creation_order_contexts')&&(colorCount===colorTables.length||!colorTables.includes(table))&&(adjustmentCount===2||table!=='order_sale_adjustment_receipts')&&(planningCount===planningTables.length||!planningTables.includes(table))&&(executionCount===executionTables.length||!executionTables.includes(table))&&(trackingCount===trackingTables.length||!trackingTables.includes(table))&&(arrivalCount===arrivalTables.length||!arrivalTables.includes(table))&&(garmentCount===garmentTables.length||!garmentTables.includes(table))&&(closingCount===closingTables.length||!closingTables.includes(table))&&(monthCount===monthTables.length||!monthTables.includes(table)));
}
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
  const availableReferences=await normalizationReferences(client);
  const capturedAt=(await client.query('SELECT transaction_timestamp()::text AS captured_at')).rows[0].captured_at as string;
  const foreignKeys=(await client.query(`SELECT n.nspname AS schema,c.relname AS relation,a.attname AS column FROM pg_constraint f JOIN pg_class c ON c.oid=f.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN LATERAL unnest(f.conkey) k(attnum) JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum=k.attnum WHERE f.contype='f' AND f.confrelid='sales_orders'::regclass ORDER BY 1,2,3`)).rows as {schema:string;relation:string;column:string}[];
  const unknownReferences=foreignKeys.filter(f=>f.schema!=='public'||!references.some(([table,column])=>table===f.relation&&column===f.column)).map(f=>`${f.schema}.${f.relation}.${f.column}`);
  const orders=[];
  for(const id of ids) {
   const order=(await client.query(`SELECT id::text,order_no,creation_source,lifecycle_state,version,source_order_id::text,source_quote_id,source_revision_id,source_price_version_id FROM sales_orders WHERE id=$1`,[id])).rows[0];
   if(!order) throw new HttpError(404,'sales_order_not_found','Sales order not found');
   const inventory:{relation:string;column:string;count:string;sampleIds:string[];truncated:boolean}[]=[];
   for(const [table,column,key] of availableReferences) {
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
