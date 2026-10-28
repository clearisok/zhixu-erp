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
import { assignmentsForOrder } from '../production-scheduling/repository.js';
import { SCHEDULE_PLANNING_LIMITS } from '../production-scheduling/planning-preview.js';
import { executionsForAssignments, executionFacts } from '../production-scheduling/execution-store.js';
import {canonicalDecimal} from '../quotes/decimal-projection.js';
import { CLOSING_READ_PERMISSIONS, closingFail, closingUuid, compareDecimals } from './contract.js';
import { closingExecutionFingerprint, type ClosingExecutionReference } from './basis-model.js';
import { matchMonthExecutors, releaseMonthExecutors, monthQuantity, moveMonthQuantities, parseClosingMonthCommand, parseClosingMonthIntent, quantityUnits, sumMonthQuantities, validateMonthLines,
  type ClosingMonthCommand, type ClosingMonthIntent, type ClosingMonthLine } from './month-plan-model.js';
import { reconcileClosingSource, type ObservedClosingSource } from './source-reconciliation-model.js';
import { closingMonthDisplayScope, projectClosingMonthDisplay, MONTH_DISPLAY_LIMITS, type DisplayPeriod } from './month-display-model.js';

export type MonthPlan = { orderId: string; defaultMonth: string | null; sourceDeliveryDate: string | null; versionId: string; version: number;
  sourceQuantity: string | null; quantityState:'ready'|'unknown'|'unsupported'; sourceFingerprint: string; lines: ClosingMonthLine[]; executorBasis: ClosingExecutionReference[] };
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
async function requireExecutorSchema(client: PoolClient) {
  const row = (await client.query<{ present: boolean }>(`SELECT EXISTS(SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='server_closing_month_plan_versions' AND column_name='executor_basis') AS present`)).rows[0];
  if (!row.present) closingFail(503, 'closing_executor_schema_unavailable');
}
async function requireSourceReconciliationSchema(client: PoolClient) {
  const row = (await client.query<{ present: boolean }>(`SELECT EXISTS(SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='server_closing_month_plan_versions' AND column_name='source_observation') AS present`)).rows[0];
  if (!row.present) closingFail(503, 'closing_source_reconciliation_schema_unavailable');
}
async function executorReferences(client: PoolClient, orderId: string): Promise<ClosingExecutionReference[]> {
  const assignments = await assignmentsForOrder(client, orderId), executions = await executionsForAssignments(client, assignments.map(row => row.id));
  return assignments.map(row => ({ assignmentId: row.id, salesOrderId: orderId, assignmentVersion: row.version, colorId: row.colorId,
    executionType: row.executionType, executorId: row.productionGroupId ?? row.outsourceFactoryId!, resourceSnapshotHash: row.resourceSnapshotHash,
    plannedQuantity: row.plannedQuantity, planStatus: row.status, execution: executionFacts(executions[row.id]) }));
}
const executorAttribution = (ref: ClosingExecutionReference) => ({ assignmentId: ref.assignmentId, salesOrderId: ref.salesOrderId, colorId: ref.colorId,
  executionType: ref.executionType, executorId: ref.executorId, resourceSnapshotHash: ref.resourceSnapshotHash });
function executorCapacity(ref: ClosingExecutionReference) {
  const planned = ref.planStatus === 'planned' ? ref.plannedQuantity : '0', actual = ref.execution?.completedQuantity ?? '0';
  return compareDecimals(planned, actual) >= 0 ? planned : actual;
}
function executorWarnings(lines: ClosingMonthLine[], references: ClosingExecutionReference[]) {
  return references.flatMap(ref => {
    const portions = lines.filter(line => line.assignmentId === ref.assignmentId);
    if (!portions.length) return [];
    const quantity = sumMonthQuantities(portions), referenceQuantity = executorCapacity(ref);
    const codes = [...(ref.planStatus === 'cancelled' ? ['executor_plan_cancelled'] : []),
      ...(compareDecimals(quantity, referenceQuantity) > 0 ? ['executor_quantity_exceeds_reference'] : [])];
    return codes.map(code => ({ assignmentId: ref.assignmentId, code, quantity, referenceQuantity }));
  });
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
function observedSource(current: Awaited<ReturnType<typeof source>>): ObservedClosingSource {
  return { fingerprint: current.fingerprint, quantity: current.quantity, quantityState: current.quantityState,
    businessType: current.order.businessType === 'processing' ? 'processing' : 'ainuoke_contract',
    colors: current.colors.map(color => ({ id: color.id, quantity: color.quantity, ambiguous: color.ambiguous })) };
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
    v.quantity_state AS "quantityState",v.source_fingerprint AS "sourceFingerprint",v.lines,
    COALESCE(to_jsonb(v)->'executor_basis','[]'::jsonb) AS "executorBasis" FROM server_closing_month_plans p
    JOIN server_closing_month_plan_heads h ON h.sales_order_id=p.sales_order_id JOIN server_closing_month_plan_versions v ON v.id=h.current_version_id
    WHERE p.sales_order_id=$1`, [orderId])).rows[0];
  if (!row) return null;
  try { row.lines = validateMonthLines(row.lines, row.quantityState==='ready'?row.sourceQuantity:null); } catch { closingFail(503, 'closing_month_plan_invalid'); }
  if (!Array.isArray(row.executorBasis)) closingFail(503, 'closing_month_plan_invalid');
  closingExecutionFingerprint(row.executorBasis);
  const assigned = new Set(row.lines.flatMap(line => line.assignmentId === null ? [] : [line.assignmentId]));
  if (assigned.size !== row.executorBasis.length || row.executorBasis.some(ref => !assigned.has(ref.assignmentId) || ref.salesOrderId !== orderId)) closingFail(503, 'closing_month_plan_invalid');
  return row;
}
/** Caller owns the transaction, fresh actor, effective fence and write locks.
 * This reads the current unpriced owner, never initializes a historical SO. */
export async function readClosingMonthFinancialBasis(client: PoolClient, orderId: string, freeze = false) {
  await available(client);
  const record = await plan(client,orderId),current = await source(client,orderId,freeze);
  if (!record) closingFail(409,'closing_month_not_initialized');
  if (record.sourceFingerprint !== current.fingerprint) closingFail(409,'closing_month_source_changed');
  if (record.quantityState !== 'ready') closingFail(409,record.quantityState==='unsupported'?'closing_month_quantity_unrepresentable':'closing_month_quantity_unknown');
  const references = await executorReferences(client,orderId);
  if (record.executorBasis.some(saved => {
    const now=references.find(ref=>ref.assignmentId===saved.assignmentId);
    return !now || planHash(executorAttribution(saved))!==planHash(executorAttribution(now));
  })) closingFail(409,'closing_month_executor_review_required');
  return {plan:record,order:current.order,references};
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
async function build(client: PoolClient, intent: ClosingMonthIntent, freeze = false) {
  await requireExecutorSchema(client);
  const prior = await plan(client, intent.orderId, freeze);
  if (!prior) closingFail(409, 'closing_month_not_initialized');
  if (prior.version !== intent.expectedVersion) closingFail(409, 'closing_month_version_conflict');
  const current = await source(client,intent.orderId,freeze);
  const reconciling = intent.action === 'reconcile_source', releasing = intent.action === 'release_executors';
  if (reconciling) {
    await requireSourceReconciliationSchema(client);
    if (current.fingerprint === prior.sourceFingerprint) closingFail(409, 'closing_month_no_change');
  } else if (!releasing) {
    if (current.fingerprint !== prior.sourceFingerprint) closingFail(409,'closing_month_source_changed');
    if(prior.quantityState!=='ready')closingFail(409,prior.quantityState==='unsupported'?'closing_month_quantity_unrepresentable':'closing_month_quantity_unknown');
  }
  const linksReady=(await client.query<{present:boolean}>("SELECT to_regclass('public.server_closing_month_financial_links') IS NOT NULL AS present")).rows[0].present;
  const legacy = await client.query(`SELECT 1 FROM server_closing_allocations a JOIN server_closing_allocation_heads h ON h.allocation_id=a.id
    JOIN server_closing_allocation_versions v ON v.id=h.current_version_id WHERE a.sales_order_id=$1 AND v.status='active'
    ${linksReady?'AND NOT EXISTS(SELECT 1 FROM server_closing_month_financial_links l WHERE l.allocation_id=a.id)':''} LIMIT 1`,[intent.orderId]);
  if (legacy.rowCount) closingFail(409,'closing_month_legacy_allocations_require_review');
  const references = await executorReferences(client, intent.orderId);
  const changed = prior.executorBasis.filter(saved => {
    const now = references.find(ref => ref.assignmentId === saved.assignmentId);
    return !now || planHash(executorAttribution(saved)) !== planHash(executorAttribution(now));
  });
  if (releasing) {
    if (!(await client.query<{present:boolean}>("SELECT to_regprocedure('validate_closing_executor_release()') IS NOT NULL AS present")).rows[0].present)
      closingFail(503, 'closing_executor_recovery_schema_unavailable');
    if (!changed.length) closingFail(409, 'closing_month_no_change');
    if (planHash(changed.map(row => row.assignmentId).sort()) !== planHash(intent.assignmentIds)
      || closingExecutionFingerprint(references) !== intent.observedExecutorFingerprint) closingFail(409, 'closing_month_preview_changed');
    if (changed.some(saved => !references.some(now => now.assignmentId === saved.assignmentId && now.salesOrderId === intent.orderId)))
      closingFail(409, 'closing_month_executor_unavailable');
    const produced = await client.query(`SELECT 1 FROM production_schedule_execution_versions WHERE assignment_id=ANY($1::uuid[])
      AND (snapshot->>'completed_quantity')::numeric>0 LIMIT 1`, [intent.assignmentIds]);
    if (produced.rowCount || changed.some(saved => compareDecimals(saved.execution?.completedQuantity ?? '0', '0') > 0)
      || references.some(now => intent.assignmentIds.includes(now.assignmentId) && compareDecimals(now.execution?.completedQuantity ?? '0', '0') > 0))
      closingFail(409, 'closing_month_executor_has_output');
  } else if (changed.length) closingFail(409, 'closing_month_executor_review_required');
  let executorBasis = prior.executorBasis;
  const next = intent.action === 'release_executors' ? releaseMonthExecutors(prior.lines,intent)
    : intent.action === 'move_months' ? moveMonthQuantities(prior.lines,intent,seed=>derivedId(prior.versionId+':'+seed))
    : intent.action === 'match_executors' ? matchMonthExecutors(prior.lines,intent,seed=>derivedId(prior.versionId+':'+seed))
    : reconcileClosingSource(prior,intent,observedSource(current),seed=>derivedId(prior.versionId+':source:'+seed));
  if (reconciling || releasing) {
    const used = new Set(next.lines.flatMap(line => line.assignmentId === null ? [] : [line.assignmentId]));
    executorBasis = prior.executorBasis.filter(ref => used.has(ref.assignmentId));
    // Stable identities are created only in the already-owned write transaction.
    if (reconciling && freeze) for (const color of current.colors) await ensureStableOrderColor(client,intent.orderId,color);
  }
  if (intent.action === 'match_executors') {
    await requireExecutorSchema(client);
    const added = new Set(intent.items.flatMap(item => item.parts.flatMap(part => part.assignmentId === null ? [] : [part.assignmentId])));
    for (const id of added) {
      const ref = references.find(ref => ref.assignmentId === id), saved = prior.executorBasis.find(ref => ref.assignmentId === id);
      if (!ref || ref.salesOrderId !== intent.orderId) closingFail(409, 'closing_month_executor_unavailable');
      if (saved && planHash(executorAttribution(saved)) !== planHash(executorAttribution(ref))) closingFail(409, 'closing_month_executor_changed');
      const portions = next.lines.filter(line => line.assignmentId === id);
      if (portions.some(line => ref.colorId !== null && line.colorId !== ref.colorId)) closingFail(409, 'closing_month_executor_color_mismatch');
    }
    // A new month version records this matching observation. Older versions keep
    // their exact evidence; ordinary month moves never refresh these references.
    executorBasis = [...prior.executorBasis.filter(ref => !added.has(ref.assignmentId)), ...references.filter(ref => added.has(ref.assignmentId))]
      .sort((a,b) => a.assignmentId.localeCompare(b.assignmentId));
    if ((await client.query<{bytes:number}>('SELECT octet_length($1::jsonb::text)::int AS bytes',[JSON.stringify(executorBasis)])).rows[0].bytes > 262144) closingFail(422, 'closing_month_plan_too_large');
  }
  if(await lineBytes(client,next.lines)>262144)closingFail(422,'closing_month_plan_too_large');
  const states = await periodStates(client,next.touchedMonths);
  if (states.some(row=>row.status!=='open')) closingFail(409,'closing_month_period_not_open');
  const warnings = executorWarnings(next.lines,references);
  const sourceObservation=reconciling?observedSource(current):null;
  if (sourceObservation && (await client.query<{bytes:number}>('SELECT octet_length($1::jsonb::text)::int AS bytes',[JSON.stringify(sourceObservation)])).rows[0].bytes>262144) closingFail(422,'closing_month_plan_too_large');
  const previewHash = planHash({intent,prior,sourceFingerprint:current.fingerprint,currentDeliveryDate:current.order.deliveryDate,states,next,warnings,
    executorBasis,executionFingerprint:closingExecutionFingerprint(references)});
  return {intent,prior,...next,executorBasis,warnings,previewHash,orderNo:current.order.orderNo,
    sourceObservation};
}
async function budget(client: PoolClient, command: ClosingMonthCommand) {
  const bytes=(await client.query<{bytes:number}>('SELECT octet_length($1::jsonb::text)::int AS bytes',[JSON.stringify(command)])).rows[0].bytes;
  if(bytes>16384) closingFail(422,'closing_month_command_too_large');
}
/** Internal read primitive; the caller owns the snapshot and fresh identity. */
async function monthStateContext(client:PoolClient,actor:TrustedIdentity,rawId:string){
    const orderId=closingUuid(rawId);requireRead(actor);await available(client);
    const current=await source(client,orderId),record=await plan(client,orderId),references=await executorReferences(client,orderId);
    const executorChanges = record?.executorBasis.flatMap(saved => {
      const now = references.find(ref => ref.assignmentId === saved.assignmentId);
      return !now || planHash(executorAttribution(saved)) !== planHash(executorAttribution(now)) ? [{assignmentId:saved.assignmentId,reason:'attribution_changed' as const}] : [];
    }) ?? [];
    return {colors:current.colors,state:{plan:record,currentDeliveryDate:current.order.deliveryDate,sourceChanged:record!==null&&record.sourceFingerprint!==current.fingerprint,observedSource:observedSource(current),
      executorChanges,executorWarnings:executorWarnings(record?.lines??[],references),executorCandidates:references,meaning:'unpriced_quantity_month_plan' as const}};
}
export async function readClosingMonthStateInTransaction(client:PoolClient,actor:TrustedIdentity,rawId:string){
  return (await monthStateContext(client,actor,rawId)).state;
}
async function readMonthSnapshot<T>(pool:Pool,identity:TrustedIdentity,rawId:string,read:(client:PoolClient,actor:TrustedIdentity,id:string)=>Promise<T>){
  const orderId=closingUuid(rawId),client=await pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const result=await read(client,await readCurrentActor(client,identity),orderId);
    await client.query('COMMIT');return result;
  } catch(error){await client.query('ROLLBACK').catch(()=>undefined);throw error;}finally{client.release();}
}
export async function readOrderClosingMonthPlan(pool: Pool, identity: TrustedIdentity, rawId: string) {
  return readMonthSnapshot(pool,identity,rawId,readClosingMonthStateInTransaction);
}
/** Opt-in reference labels share the exact state snapshot. Existing reads and
 * annual aggregation keep their old payload and perform no extra label queries. */
export async function readOrderClosingMonthDisplay(pool:Pool,identity:TrustedIdentity,rawId:string){
  return readMonthSnapshot(pool,identity,rawId,async(client,actor,orderId)=>{
    requireRead(actor);await available(client);
    // The existing state reader loads facts once per assignment, including
    // repeated hashes. Budget that actual transfer before invoking it.
    const initial=(await client.query<{rows:number;bytes:string}>(`SELECT count(*)::int AS rows,COALESCE(sum(octet_length(s.facts::text)),0)::text AS bytes
      FROM (SELECT resource_snapshot_hash FROM production_schedule_assignments WHERE sales_order_id=$1 ORDER BY created_at,id LIMIT $2) a
      JOIN production_schedule_resource_snapshots s ON s.hash=a.resource_snapshot_hash`,[orderId,SCHEDULE_PLANNING_LIMITS.queueRows+1])).rows[0];
    const loadedSnapshotBytes=BigInt(initial.bytes);
    if(initial.rows>SCHEDULE_PLANNING_LIMITS.queueRows||loadedSnapshotBytes>BigInt(MONTH_DISPLAY_LIMITS.snapshotBytes))closingFail(422,'closing_month_display_too_large');
    const {state,colors}=await monthStateContext(client,actor,orderId),scope=closingMonthDisplayScope(state.plan,colors,state.executorCandidates);
    const identities=scope.colorIds.length?(await client.query<{id:string;name:string}>(`SELECT id::text,color_name AS name
      FROM sales_order_color_identities WHERE sales_order_id=$1 AND id=ANY($2::uuid[]) ORDER BY id`,[orderId,scope.colorIds])).rows:[];
    let snapshots:{hash:string;facts:unknown}[]=[];
    if(scope.hashes.length){
      const size=(await client.query<{bytes:string}>(`SELECT COALESCE(sum(octet_length(facts::text)),0)::text AS bytes
        FROM production_schedule_resource_snapshots WHERE hash=ANY($1::text[])`,[scope.hashes])).rows[0].bytes;
      if(loadedSnapshotBytes+BigInt(size)>BigInt(MONTH_DISPLAY_LIMITS.snapshotBytes))closingFail(422,'closing_month_display_too_large');
      snapshots=(await client.query<{hash:string;facts:unknown}>('SELECT hash,facts FROM production_schedule_resource_snapshots WHERE hash=ANY($1::text[]) ORDER BY hash',[scope.hashes])).rows;
    }
    const periods=scope.months.length?(await client.query<DisplayPeriod>(`SELECT p.month,p.id::text,v.status,h.version FROM server_closing_periods p
      JOIN server_closing_period_heads h ON h.period_id=p.id JOIN server_closing_period_versions v ON v.id=h.current_version_id
      WHERE p.month=ANY($1::text[]) ORDER BY p.month`,[scope.months])).rows:[];
    const result={...state,display:projectClosingMonthDisplay(scope,colors,identities,snapshots,periods)};
    if(Buffer.byteLength(JSON.stringify(result))>MONTH_DISPLAY_LIMITS.responseBytes)closingFail(422,'closing_month_display_too_large');
    return result;
  });
}
export async function previewClosingMonthMove(pool: Pool, identity: TrustedIdentity, raw: unknown) {
  const intent=parseClosingMonthIntent(raw),client=await pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const actor=await readCurrentActor(client,identity);requireRead(actor);requirePermission(actor.permissions,'closing.edit');await available(client);
    await budget(client,{requestId:'00000000-0000-0000-0000-000000000000',intent,previewHash:'0'.repeat(64)});
    const result=await build(client,intent);await client.query('COMMIT');
    return {intent,version:result.prior.version,before:result.prior.lines,after:result.lines,
      ...('releasedQuantity' in result?{releasedQuantity:result.releasedQuantity}:'movedQuantity' in result?{movedQuantity:result.movedQuantity}:'matchedQuantity' in result?{matchedQuantity:result.matchedQuantity}
        :{sourceReconciliation:{beforeQuantity:result.beforeQuantity,beforeQuantityState:result.prior.quantityState,quantityDelta:result.quantityDelta,changedLines:result.changedLines,addedLines:result.addedLines,source:result.sourceObservation}}),
      beforeExecutorBasis:result.prior.executorBasis,executorBasis:result.executorBasis,warnings:result.warnings,touchedMonths:result.touchedMonths,previewHash:result.previewHash};
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
      await requireExecutorSchema(client);
      const reconciling=command.intent.action==='reconcile_source',observation=change.sourceObservation;
      const row=(await client.query<{id:string}>(`INSERT INTO server_closing_month_plan_versions(sales_order_id,version,source_quantity,quantity_state,source_fingerprint,lines,action,reason,actor_id,request_id,operation_id,executor_basis${reconciling?',source_observation':''})
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12${reconciling?',$13':''}) RETURNING id::text`,[command.intent.orderId,change.prior.version+1,reconciling?observation!.quantity:change.prior.sourceQuantity,
        reconciling?observation!.quantityState:change.prior.quantityState,reconciling?observation!.fingerprint:change.prior.sourceFingerprint,JSON.stringify(change.lines),command.intent.action,command.intent.reason,actor.internalUserId,command.requestId,operationId,JSON.stringify(change.executorBasis),
        ...(reconciling?[JSON.stringify(observation)]:[])])).rows[0];
      if((await client.query('UPDATE server_closing_month_plan_heads SET current_version_id=$2,version=$3 WHERE sales_order_id=$1 AND version=$4',
        [command.intent.orderId,row.id,change.prior.version+1,change.prior.version])).rowCount!==1)closingFail(409,'closing_month_version_conflict');
      await appendOperationLog(client,actor,{operationId,module:'关账中心',action:command.intent.action==='release_executors'?'恢复关账未分配归属':command.intent.action==='move_months'?'调整关账月份':command.intent.action==='match_executors'?'匹配关账执行方':'复核关账来源数量',entityType:'SalesOrder',entityId:command.intent.orderId,
        afterData:{objectName:change.orderNo,values:{...(command.intent.action==='move_months'?{调入月份:command.intent.targetMonth,数量:'movedQuantity' in change?change.movedQuantity:null}
          :command.intent.action==='release_executors'?{恢复未分配数量:'releasedQuantity' in change?change.releasedQuantity:null}
          :command.intent.action==='match_executors'?{匹配数量:'matchedQuantity' in change?change.matchedQuantity:null}
          :{原数量:change.prior.sourceQuantity,来源数量:observation!.quantity,数量变化:'quantityDelta' in change?change.quantityDelta:null}),版本:change.prior.version+1}},
        metadata:{requestId:command.requestId,action:command.intent.action,touchedMonths:change.touchedMonths}});
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
