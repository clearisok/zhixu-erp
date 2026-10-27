import { createHash, randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import type { TrustedIdentity } from '../auth/session.js';
import { readCurrentActor } from '../auth/current-actor.js';
import { requirePermission } from '../auth/permissions.js';
import { HttpError } from '../http/errors.js';
import { appendOperationLog } from '../operation-logs/repository.js';
import { lockEffectiveAttribution } from '../sales-orders/effective-attribution.js';
import { ensureStableOrderColor, readStableOrderColors } from '../sales-orders/color-identities.js';
import { readPlanOrderSummaries } from '../production-scheduling/read-model.js';
import { planHash } from '../production-scheduling/repository.js';
import {canonicalDecimal} from '../quotes/decimal-projection.js';
import { CLOSING_READ_PERMISSIONS, closingFail, closingUuid } from './contract.js';
import { monthQuantity, moveMonthQuantities, parseClosingMonthCommand, parseClosingMonthMove, quantityUnits, validateMonthLines,
  type ClosingMonthCommand, type ClosingMonthLine, type ClosingMonthMove } from './month-plan-model.js';

type MonthPlan = { orderId: string; defaultMonth: string | null; sourceDeliveryDate: string | null; versionId: string; version: number;
  sourceQuantity: string | null; quantityState:'ready'|'unknown'|'unsupported'; sourceFingerprint: string; lines: ClosingMonthLine[] };
type Outcome = { requestId: string; status: 'applied'; orderId: string; version: number; versionId: string; operationId: string }
  | { requestId: string; status: 'rejected'; error: { status: number; code: string } };
const lockName = 'production-planning-write-v1';
async function supported(client: PoolClient) {
  return (await client.query<{ present: boolean }>("SELECT to_regclass('public.server_closing_month_plans') IS NOT NULL AS present")).rows[0]?.present === true;
}
async function available(client: PoolClient) { if (!await supported(client)) closingFail(503, 'closing_month_schema_unavailable'); }
/** Creation entry points acquire this before any SO, Quote or CCT lock. */
export async function lockOrderClosingMonthCreation(client:PoolClient){
  if(await supported(client))await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[lockName]);
}
const plannableQuantity=(value:string|null):value is string=>value!==null&&/^\d{1,12}(?:\.\d{1,6})?$/u.test(value);
async function lineBytes(client: PoolClient, lines: ClosingMonthLine[]) {
  return (await client.query<{bytes:number}>('SELECT octet_length($1::jsonb::text)::int AS bytes',[JSON.stringify(lines)])).rows[0].bytes;
}
function requireRead(actor: TrustedIdentity) { for (const key of CLOSING_READ_PERMISSIONS) requirePermission(actor.permissions, key); }
function derivedId(seed: string) {
  const hex = createHash('sha256').update('closing-month-line:' + seed).digest('hex');
  return hex.slice(0,8)+'-'+hex.slice(8,12)+'-5'+hex.slice(13,16)+'-a'+hex.slice(17,20)+'-'+hex.slice(20,32);
}
async function source(client: PoolClient, orderId: string, freeze = false) {
  if (freeze) {
    await client.query('SELECT id FROM sales_orders WHERE id=$1 FOR SHARE', [orderId]);
    await client.query('SELECT sales_order_id FROM ainuoke_sales_order_contract_mirrors WHERE sales_order_id=$1 FOR SHARE', [orderId]);
    await client.query('SELECT sales_order_id FROM ainuoke_sales_order_color_mirrors WHERE sales_order_id=$1 FOR SHARE', [orderId]);
    await client.query('SELECT b.id FROM processing_order_batches b JOIN processing_order_batch_consumptions c ON c.batch_id=b.id WHERE c.sales_order_id=$1 FOR SHARE OF b,c', [orderId]);
  }
  const order = (await readPlanOrderSummaries(client, [orderId]))[orderId];
  if (!order) closingFail(404, 'sales_order_not_found');
  if (order.effectiveOrderId !== orderId) closingFail(409, 'closing_physical_order_required');
  if (order.businessType === 'unclassified') closingFail(409, 'closing_trusted_order_required');
  const colors = order.businessType === 'ainuoke_contract' ? (await readStableOrderColors(client, orderId)).map(color=>({...color,quantity:canonicalDecimal(color.quantity)})) : [];
  const quantity = order.quantity,quantityState=quantity===null?'unknown' as const:plannableQuantity(quantity)?'ready' as const:'unsupported' as const;
  const fingerprint = planHash({ orderId, businessType: order.businessType, quantity,
    colors: colors.map(color => ({ id: color.id, quantity: color.quantity, ambiguous: color.ambiguous })) });
  return { order, colors, quantity, quantityState, fingerprint };
}
async function periodStates(client: PoolClient, months: readonly string[]) {
  if (!months.length) return [];
  return (await client.query<{ month: string; status: string; version: number }>(`SELECT p.month,v.status,h.version FROM server_closing_periods p
    JOIN server_closing_period_heads h ON h.period_id=p.id JOIN server_closing_period_versions v ON v.id=h.current_version_id
    WHERE p.month=ANY($1::text[]) ORDER BY p.month`, [months])).rows;
}
async function plan(client: PoolClient, orderId: string, freeze = false): Promise<MonthPlan | null> {
  if (freeze) await client.query('SELECT sales_order_id FROM server_closing_month_plan_heads WHERE sales_order_id=$1 FOR UPDATE', [orderId]);
  const row = (await client.query<MonthPlan>(`SELECT p.sales_order_id::text AS "orderId",p.default_month AS "defaultMonth",
    p.source_delivery_date::text AS "sourceDeliveryDate",v.id::text AS "versionId",v.version,v.source_quantity::text AS "sourceQuantity",
    v.quantity_state AS "quantityState",v.source_fingerprint AS "sourceFingerprint",v.lines FROM server_closing_month_plans p
    JOIN server_closing_month_plan_heads h ON h.sales_order_id=p.sales_order_id JOIN server_closing_month_plan_versions v ON v.id=h.current_version_id
    WHERE p.sales_order_id=$1`, [orderId])).rows[0];
  if (!row) return null;
  try { row.lines = validateMonthLines(row.lines, row.quantityState==='ready'?row.sourceQuantity:null); } catch { closingFail(503, 'closing_month_plan_invalid'); }
  return row;
}
/** New trusted SO transaction only. No lazy initialization, price, or tax dependency. */
export async function initializeOrderClosingMonth(client: PoolClient, actor: TrustedIdentity, orderId: string) {
  if (!await supported(client)) return;
  if (await plan(client, orderId)) closingFail(409, 'closing_month_already_initialized');
  await lockOrderClosingMonthCreation(client);
  const current = await source(client, orderId), date = current.order.deliveryDate, defaultMonth = date?.slice(0,7) ?? null;
  const blocked = defaultMonth !== null && (await periodStates(client, [defaultMonth])).some(row => row.status !== 'open');
  const month = blocked ? null : defaultMonth;
  let lines: ClosingMonthLine[] = [];
  if (current.quantityState==='ready' && current.quantity !== null && quantityUnits(current.quantity) > BigInt(0)) {
    const colored = current.order.businessType === 'ainuoke_contract' && current.colors.length > 0 && current.colors.length <= 2000 && current.colors.every(color => !color.ambiguous)
      && current.colors.every(color=>plannableQuantity(color.quantity))
      && current.colors.reduce((sum,color)=>sum+quantityUnits(color.quantity),BigInt(0))===quantityUnits(current.quantity);
    if (colored) {
      for (const color of current.colors) {
        await ensureStableOrderColor(client, orderId, color);
        if (quantityUnits(color.quantity) > BigInt(0)) lines.push({ id: randomUUID(), colorId: color.id, assignmentId: null, month, quantity: monthQuantity(color.quantity) });
      }
    } else lines = [{ id: randomUUID(), colorId: null, assignmentId: null, month, quantity: current.quantity }];
  }
  if (lines.length > 1 && await lineBytes(client,lines) > 262144) lines=[{id:randomUUID(),colorId:null,assignmentId:null,month,quantity:current.quantity!}];
  lines = validateMonthLines(lines, current.quantityState==='ready'?current.quantity:null);
  await client.query("SELECT set_config('zhixu.closing_month_command','on',true)");
  await client.query('INSERT INTO server_closing_month_plans(sales_order_id,default_month,source_delivery_date,created_by) VALUES($1,$2,$3,$4)', [orderId, defaultMonth, date, actor.internalUserId]);
  const version = (await client.query<{ id: string }>(`INSERT INTO server_closing_month_plan_versions(sales_order_id,version,source_quantity,quantity_state,source_fingerprint,lines,action,reason,actor_id,operation_id)
    VALUES($1,1,$2,$3,$4,$5,'initialize',$6,$7,$8) RETURNING id::text`, [orderId,current.quantity,current.quantityState,current.fingerprint,JSON.stringify(lines),
    current.quantityState==='unsupported'?'Source quantity is preserved exactly but exceeds month-plan precision/range':blocked ? 'Default month is confirmed or locked; quantity awaits an open month' : '',actor.internalUserId,'closing-month-init:'+orderId])).rows[0];
  await client.query('INSERT INTO server_closing_month_plan_heads VALUES($1,$2,1)', [orderId,version.id]);
}
async function build(client: PoolClient, intent: ClosingMonthMove, freeze = false) {
  const prior = await plan(client, intent.orderId, freeze);
  if (!prior) closingFail(409, 'closing_month_not_initialized');
  if (prior.version !== intent.expectedVersion) closingFail(409, 'closing_month_version_conflict');
  const current = await source(client,intent.orderId,freeze);
  if (current.fingerprint !== prior.sourceFingerprint) closingFail(409,'closing_month_source_changed');
  if(prior.quantityState!=='ready')closingFail(409,prior.quantityState==='unsupported'?'closing_month_quantity_unrepresentable':'closing_month_quantity_unknown');
  const legacy = await client.query(`SELECT 1 FROM server_closing_allocations a JOIN server_closing_allocation_heads h ON h.allocation_id=a.id
    JOIN server_closing_allocation_versions v ON v.id=h.current_version_id WHERE a.sales_order_id=$1 AND v.status='active' LIMIT 1`,[intent.orderId]);
  if (legacy.rowCount) closingFail(409,'closing_month_legacy_allocations_require_review');
  const next = moveMonthQuantities(prior.lines,intent,seed=>derivedId(prior.versionId+':'+seed));
  if(await lineBytes(client,next.lines)>262144)closingFail(422,'closing_month_plan_too_large');
  const states = await periodStates(client,next.touchedMonths);
  if (states.some(row=>row.status!=='open')) closingFail(409,'closing_month_period_not_open');
  const previewHash = planHash({intent,prior,sourceFingerprint:current.fingerprint,currentDeliveryDate:current.order.deliveryDate,states,next});
  return {intent,prior,...next,previewHash,orderNo:current.order.orderNo};
}
async function budget(client: PoolClient, command: ClosingMonthCommand) {
  const bytes=(await client.query<{bytes:number}>('SELECT octet_length($1::jsonb::text)::int AS bytes',[JSON.stringify(command)])).rows[0].bytes;
  if(bytes>16384) closingFail(422,'closing_month_command_too_large');
}
export async function readOrderClosingMonthPlan(pool: Pool, identity: TrustedIdentity, rawId: string) {
  const orderId=closingUuid(rawId),client=await pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const actor=await readCurrentActor(client,identity);requireRead(actor);await available(client);
    const current=await source(client,orderId),record=await plan(client,orderId);
    await client.query('COMMIT');
    return {plan:record,currentDeliveryDate:current.order.deliveryDate,sourceChanged:record!==null&&record.sourceFingerprint!==current.fingerprint,
      meaning:'unpriced_quantity_month_plan' as const};
  } catch(error){await client.query('ROLLBACK').catch(()=>undefined);throw error;}finally{client.release();}
}
export async function previewClosingMonthMove(pool: Pool, identity: TrustedIdentity, raw: unknown) {
  const intent=parseClosingMonthMove(raw),client=await pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const actor=await readCurrentActor(client,identity);requireRead(actor);requirePermission(actor.permissions,'closing.edit');await available(client);
    await budget(client,{requestId:'00000000-0000-0000-0000-000000000000',intent,previewHash:'0'.repeat(64)});
    const result=await build(client,intent);await client.query('COMMIT');
    return {intent,version:result.prior.version,before:result.prior.lines,after:result.lines,movedQuantity:result.movedQuantity,
      touchedMonths:result.touchedMonths,previewHash:result.previewHash};
  } catch(error){await client.query('ROLLBACK').catch(()=>undefined);throw error;}finally{client.release();}
}
export async function executeClosingMonthMove(pool: Pool, identity: TrustedIdentity, raw: unknown) {
  const command=parseClosingMonthCommand(raw),digest=planHash(command),client=await pool.connect();let committing=false;
  try {
    await client.query('BEGIN');await client.query("SET LOCAL lock_timeout='5s'");await lockEffectiveAttribution(client);
    const actor=await readCurrentActor(client,identity,true);requireRead(actor);requirePermission(actor.permissions,'closing.edit');await available(client);await budget(client,command);
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['closing-month:'+actor.internalUserId+':'+command.requestId]);
    const old=(await client.query<{payload_hash:string;result:Outcome}>('SELECT payload_hash,result FROM server_closing_month_commands WHERE actor_id=$1 AND request_id=$2',[actor.internalUserId,command.requestId])).rows[0];
    if(old){if(old.payload_hash!==digest)closingFail(409,'closing_month_request_conflict');committing=true;await client.query('COMMIT');return {...old.result,replayed:true};}
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[lockName]);
    await client.query("SELECT set_config('zhixu.closing_month_command','on',true)");await client.query('SAVEPOINT month_move');
    let result:Outcome;
    try {
      const change=await build(client,command.intent,true);
      if(change.previewHash!==command.previewHash)closingFail(409,'closing_month_preview_changed');
      const operationId='closing-month:'+actor.userId+':'+command.requestId;
      const row=(await client.query<{id:string}>(`INSERT INTO server_closing_month_plan_versions(sales_order_id,version,source_quantity,quantity_state,source_fingerprint,lines,action,reason,actor_id,request_id,operation_id)
        VALUES($1,$2,$3,$4,$5,$6,'move_months',$7,$8,$9,$10) RETURNING id::text`,[command.intent.orderId,change.prior.version+1,change.prior.sourceQuantity,
        change.prior.quantityState,change.prior.sourceFingerprint,JSON.stringify(change.lines),command.intent.reason,actor.internalUserId,command.requestId,operationId])).rows[0];
      if((await client.query('UPDATE server_closing_month_plan_heads SET current_version_id=$2,version=$3 WHERE sales_order_id=$1 AND version=$4',
        [command.intent.orderId,row.id,change.prior.version+1,change.prior.version])).rowCount!==1)closingFail(409,'closing_month_version_conflict');
      await appendOperationLog(client,actor,{operationId,module:'关账中心',action:'调整关账月份',entityType:'SalesOrder',entityId:command.intent.orderId,
        afterData:{objectName:change.orderNo,values:{调入月份:command.intent.targetMonth,数量:change.movedQuantity,版本:change.prior.version+1}},
        metadata:{requestId:command.requestId,action:'move_months',touchedMonths:change.touchedMonths}});
      result={requestId:command.requestId,status:'applied',orderId:command.intent.orderId,version:change.prior.version+1,versionId:row.id,operationId};
    }catch(error){
      if(!(error instanceof HttpError)||![404,409,422].includes(error.status))throw error;
      await client.query('ROLLBACK TO SAVEPOINT month_move');result={requestId:command.requestId,status:'rejected',error:{status:error.status,code:error.code}};
    }
    await client.query('INSERT INTO server_closing_month_commands(actor_id,request_id,payload_hash,command,result) VALUES($1,$2,$3,$4,$5)',
      [actor.internalUserId,command.requestId,digest,JSON.stringify(command),JSON.stringify(result)]);
    committing=true;await client.query('COMMIT');return {...result,replayed:false};
  }catch(error){await client.query('ROLLBACK').catch(()=>undefined);if(committing)return {requestId:command.requestId,status:'unverified' as const};throw error;}finally{client.release();}
}
export async function readClosingMonthReceipt(pool: Pool, identity: TrustedIdentity, rawId: string) {
  const requestId=closingUuid(rawId),client=await pool.connect();
  try {
    await client.query('BEGIN READ ONLY');let actor=await readCurrentActor(client,identity);requireRead(actor);await available(client);
    await client.query('SELECT pg_advisory_xact_lock_shared(hashtextextended($1,0))',['closing-month:'+actor.internalUserId+':'+requestId]);
    actor=await readCurrentActor(client,identity);requireRead(actor);
    const row=(await client.query<{payload_hash:string;command:unknown;result:Outcome}>('SELECT payload_hash,command,result FROM server_closing_month_commands WHERE actor_id=$1 AND request_id=$2',[actor.internalUserId,requestId])).rows[0];
    if(row){
      let original:ClosingMonthCommand;
      try{original=parseClosingMonthCommand(row.command);}catch{closingFail(503,'closing_month_receipt_invalid');}
      if(original.requestId!==requestId||planHash(original)!==row.payload_hash||row.result.requestId!==requestId)closingFail(503,'closing_month_receipt_invalid');
    }
    await client.query('COMMIT');return row?{state:'recorded' as const,requestId,commandHash:row.payload_hash,result:row.result}:{state:'unknown' as const,requestId};
  }catch(error){await client.query('ROLLBACK').catch(()=>undefined);throw error;}finally{client.release();}
}
