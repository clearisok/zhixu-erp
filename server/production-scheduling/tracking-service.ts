import type { Pool, PoolClient } from "pg";
import { readCurrentActor } from "../auth/current-actor.js";
import type { TrustedIdentity } from "../auth/session.js";
import { HttpError } from "../http/errors.js";
import { appendOperationLog, createServerOperationId } from "../operation-logs/repository.js";
import { productionResourceUuid } from "../production-resources/contract.js";
import { readProductionSupplyHubSnapshot } from "../production-resources/service.js";
import { freezePhysicalOrderGroups, resolveEffectiveOrder } from "../sales-orders/effective-attribution.js";
import { requireVerifiedOrderBusiness } from "../sales-orders/identity-service.js";
import { boundProductionPayload, requireProductionPermissions, runProductionCommand, type RejectedProductionCommand } from "./command-transaction.js";
import { planFail, planHash, productionPlansAvailable } from "./repository.js";
import { ORDER_TRACKING_READ_PERMISSIONS, ORDER_TRACKING_WRITE_PERMISSIONS, parseOrderTrackingCommand, parseOrderTrackingIntent, type OrderTrackingIntent } from "./tracking-contract.js";
import { orderTrackingAvailable, persistOrderTracking, readStoredOrderTracking, type StoredOrderTracking } from "./tracking-store.js";

export type OrderTrackingOutcome = { requestId: string; status: "applied"; changed: boolean; operationId: string | null;
  tracking: StoredOrderTracking | null } | RejectedProductionCommand;
async function orderFacts(client: PoolClient, orderId: string) {
  const order = (await client.query<{ id: string; orderNo: string; version: number; lifecycleState: string }>(`SELECT id::text,order_no AS "orderNo",version,lifecycle_state AS "lifecycleState"
    FROM sales_orders WHERE id=$1`, [orderId])).rows[0];
  if (!order) return planFail(404, "sales_order_not_found");
  return { ...order, identity: await resolveEffectiveOrder(client, orderId) };
}
async function writableOrder(client: PoolClient, order: Awaited<ReturnType<typeof orderFacts>>) {
  if (order.identity.historicalDuplicate) planFail(409, "historical_duplicate_order_read_only");
  if (["completed", "cancelled"].includes(order.lifecycleState)) planFail(409, "production_order_read_only");
  await requireVerifiedOrderBusiness(client, order.id);
}
async function buildTracking(client: PoolClient, intent: OrderTrackingIntent, freeze: boolean) {
  await orderTrackingAvailable(client);
  if (freeze) await freezePhysicalOrderGroups(client, [intent.orderId]);
  const order = await orderFacts(client, intent.orderId); await writableOrder(client, order);
  const before = await readStoredOrderTracking(client, order.id);
  if ((before?.version ?? 0) !== intent.expectedVersion) planFail(409, "order_tracking_version_conflict");
  const changed = intent.data.supplyHubId !== (before?.supplyHubId ?? null) || intent.data.remark !== (before?.remark ?? "");
  const hub = intent.data.supplyHubId ? await readProductionSupplyHubSnapshot(client, intent.data.supplyHubId, freeze) : null;
  if (hub && !hub.enabled && hub.id !== before?.supplyHubId) planFail(409, "production_supply_hub_disabled");
  return { intent, order, before, hub, changed };
}
function project(build: Awaited<ReturnType<typeof buildTracking>>, actor: TrustedIdentity) {
  const result = { intent: build.intent, before: build.before, after: { ...build.intent.data, hubSnapshot: build.hub }, changed: build.changed,
    order: build.order, previewHash: planHash({ actorId: actor.userId, ...build }) };
  boundProductionPayload(result, "order_tracking_preview_too_large"); return result;
}
export async function previewOrderTracking(pool: Pool, identity: TrustedIdentity, raw: unknown) {
  const intent = parseOrderTrackingIntent(raw), client = await pool.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const actor = await readCurrentActor(client, identity); requireProductionPermissions(actor, ORDER_TRACKING_WRITE_PERMISSIONS);
    await productionPlansAvailable(client); const result = project(await buildTracking(client, intent, false), actor);
    await client.query("COMMIT"); return result;
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}
export async function executeOrderTracking(pool: Pool, identity: TrustedIdentity, raw: unknown) {
  const command = parseOrderTrackingCommand(raw);
  return runProductionCommand(pool, identity, command, ORDER_TRACKING_WRITE_PERMISSIONS, async (client, actor) => {
    const build = await buildTracking(client, command.intent, true);
    if (project(build, actor).previewHash !== command.previewHash) planFail(409, "order_tracking_preview_changed");
    const operationId = build.changed ? createServerOperationId() : null;
    const tracking = build.changed ? await persistOrderTracking(client, build.order.id, build.before, command.intent.data, build.hub, actor, command.requestId, operationId!) : build.before;
    if (build.changed) {
      const audit = (row: StoredOrderTracking | null) => row ? { orderId: build.order.id, objectName: build.order.orderNo,
        values: { 集货仓: row.hubSnapshot?.name ?? "未设置", 备注: row.remark } } : null;
      await appendOperationLog(client, actor, { operationId: operationId!, operationSequence: 0, module: "生产排单", entityType: "OrderExecutionTracking", entityId: build.order.id,
        action: "更新订单执行跟进", beforeData: audit(build.before), afterData: audit(tracking), metadata: { requestId: command.requestId, previewHash: command.previewHash, appliedVersion: tracking!.version } });
    }
    return { result: { requestId: command.requestId, status: "applied" as const, changed: build.changed, operationId, tracking }, orderIds: [build.order.id] };
  });
}
async function readTrackingTransaction<T>(pool: Pool, identity: TrustedIdentity, fn: (client: PoolClient, actor: TrustedIdentity) => Promise<T>) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const actor = await readCurrentActor(client, identity); requireProductionPermissions(actor, ORDER_TRACKING_READ_PERMISSIONS);
    await productionPlansAvailable(client); await orderTrackingAvailable(client);
    const result = await fn(client, actor); boundProductionPayload(result, "order_tracking_read_too_large");
    await client.query("COMMIT"); return result;
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}
export async function readOrderTracking(pool: Pool, identity: TrustedIdentity, inputId: string) {
  const id = productionResourceUuid(inputId);
  return readTrackingTransaction(pool, identity, async (client, actor) => {
    const order = await orderFacts(client, id), tracking = await readStoredOrderTracking(client, id);
    let canEdit = ORDER_TRACKING_WRITE_PERMISSIONS.every(key => actor.permissions.includes(key));
    if (canEdit) try { await writableOrder(client, order); } catch (error) {
      if (!(error instanceof HttpError) || error.status !== 409) throw error; canEdit = false;
    }
    return { order, tracking, currentHub: tracking?.supplyHubId ? await readProductionSupplyHubSnapshot(client, tracking.supplyHubId) : null, canEdit };
  });
}
export async function readOrderTrackingHistory(pool: Pool, identity: TrustedIdentity, inputId: string, offset = 0, asOfVersion: number | null = null) {
  const id = productionResourceUuid(inputId);
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 100000) planFail(400, "invalid_production_history_query");
  return readTrackingTransaction(pool, identity, async client => {
    const order = await orderFacts(client, id), tracking = await readStoredOrderTracking(client, id), anchor = asOfVersion ?? tracking?.version ?? 0;
    if (!Number.isSafeInteger(anchor) || anchor < 0 || anchor > (tracking?.version ?? 0) || tracking && anchor === 0) planFail(400, "invalid_production_history_query");
    // SQL bounds each complete snapshot at 32KiB. 25 records plus the head and
    // bounded metadata fit the existing 1MiB response even for escaped text.
    const limit = 25;
    const history = (await client.query(`SELECT version,snapshot,request_id::text AS "requestId",operation_id AS "operationId",recorded_at AS "recordedAt"
      FROM production_order_execution_tracking_versions WHERE sales_order_id=$1 AND version<=$3 ORDER BY version DESC LIMIT 26 OFFSET $2`, [id, offset, anchor])).rows;
    if (history.length > limit && offset + limit > 100000) planFail(422, "production_history_projection_limit");
    return { order, tracking, history: history.slice(0, limit), offset, limit, asOfVersion: anchor, hasMore: history.length > limit, nextOffset: history.length > limit ? offset + limit : null };
  });
}
