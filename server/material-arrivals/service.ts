import type { Pool, PoolClient } from "pg";
import { readCurrentActor } from "../auth/current-actor.js";
import { requirePermission } from "../auth/permissions.js";
import type { TrustedIdentity } from "../auth/session.js";
import { HttpError } from "../http/errors.js";
import { freezePersistedMaterialProfile, type SourceReadConfig } from "../ainuoke-source/reader.js";
import { appendOperationLog, createServerOperationId } from "../operation-logs/repository.js";
import { freezePhysicalOrderGroups, lockEffectiveAttribution, resolveEffectiveOrder } from "../sales-orders/effective-attribution.js";
import { requireVerifiedOrderBusiness } from "../sales-orders/identity-service.js";
import { canonicalPlanJson } from "../production-scheduling/canonical-json.js";
import { readStoredOrderTracking } from "../production-scheduling/tracking-store.js";
import { ARRIVAL_READ_PERMISSIONS, ARRIVAL_WRITE_PERMISSIONS, arrivalFail, arrivalKey, arrivalUuid, compareArrivalQuantities,
  parseArrivalCommand, parseArrivalIntent, sumArrivalQuantities, type ArrivalIntent } from "./contract.js";
import { materialArrivalHash } from "./demand-identity.js";
import { readArrivalSource, type ArrivalSource } from "./source.js";
import { arrivalTrackingBasis, boundArrivalPayload, materialArrivalsAvailable, persistArrivalPlan, readArrivalPlan, readArrivalPlans, verifyArrivalDemandRegistry,
  type ArrivalBasis, type StoredArrivalPlan } from "./store.js";

const requireRead = (actor: TrustedIdentity) => { for (const permission of ARRIVAL_READ_PERMISSIONS) requirePermission(actor.permissions, permission); };
const requireWrite = (actor: TrustedIdentity) => { for (const permission of ARRIVAL_WRITE_PERMISSIONS) requirePermission(actor.permissions, permission); };
export const materialArrivalRequestLock = (actor: TrustedIdentity, requestId: string) => `material-arrival:${actor.internalUserId}:${requestId}`;
async function orderFacts(client: PoolClient, id: string) {
  const order = (await client.query<{ id: string; orderNo: string; version: number; lifecycleState: string }>(
    `SELECT id::text,order_no AS "orderNo",version,lifecycle_state AS "lifecycleState" FROM sales_orders WHERE id=$1`, [id])).rows[0];
  if (!order) return arrivalFail(404, "sales_order_not_found");
  return { ...order, identity: await resolveEffectiveOrder(client, id) };
}
async function writableOrder(client: PoolClient, order: Awaited<ReturnType<typeof orderFacts>>) {
  if (order.identity.historicalDuplicate) arrivalFail(409, "historical_duplicate_order_read_only");
  if (["completed", "cancelled"].includes(order.lifecycleState)) arrivalFail(409, "material_arrival_order_read_only");
  await requireVerifiedOrderBusiness(client, order.id);
}
async function transaction<T>(pool: Pool, identity: TrustedIdentity, read: (client: PoolClient, actor: TrustedIdentity) => Promise<T>) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const actor = await readCurrentActor(client, identity); requireRead(actor); await materialArrivalsAvailable(client);
    const result = await read(client, actor); boundArrivalPayload(result); await client.query("COMMIT"); return result;
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}
function groupDemands(source: ArrivalSource, key: string) { return source.demands.filter(row => row.canonicalKey === key); }
function comparableDemands(data: ArrivalBasis) {
  return data.demands.map(row => ({ id: row.id, identityKey: row.identityKey, identity: row.identity, requiredQuantity: row.requiredQuantity, unit: row.unit }));
}
async function build(client: PoolClient, actor: TrustedIdentity, intent: ArrivalIntent, config: SourceReadConfig | null, freeze: boolean) {
  await materialArrivalsAvailable(client);
  if (freeze) {
    // Capture publication takes profile before orders; never reverse this order.
    if (config) await freezePersistedMaterialProfile(client, config);
    await freezePhysicalOrderGroups(client, [intent.orderId]);
  }
  const order = await orderFacts(client, intent.orderId); await writableOrder(client, order);
  const before = await readArrivalPlan(client, order.id, intent.canonicalKey);
  if ((before?.version ?? 0) !== intent.expectedVersion) arrivalFail(409, "material_arrival_version_conflict");
  const tracking = await readStoredOrderTracking(client, order.id);
  const source = await readArrivalSource(client, actor, order.id, config);
  const candidates = groupDemands(source, intent.canonicalKey), canonicalIdentity = before?.canonicalIdentity ?? candidates[0]?.canonicalIdentity;
  if (!canonicalIdentity) return arrivalFail(404, "material_arrival_material_not_found");
  const selected = new Map<string, typeof candidates[number]>(), sums = new Map<string, string[]>();
  if (intent.batches.length) {
    if (source.status !== "ready" || !source.generation) arrivalFail(409, "material_arrival_source_unavailable");
    if (!tracking?.supplyHubId) arrivalFail(409, "material_arrival_hub_missing");
    for (const batch of intent.batches) for (const allocation of batch.allocations) {
      const matches = candidates.filter(row => row.id === allocation.materialDemandId);
      if (matches.length !== 1 || matches[0].eligibility === "ambiguous") arrivalFail(409, "material_arrival_demand_unmatched");
      const demand = matches[0];
      if (demand.eligibility !== "eligible" || demand.requiredQuantity === null || demand.unit === null) arrivalFail(409, "material_arrival_demand_unavailable");
      const previousDemand = before?.data.demands.find(row => row.id === demand.id);
      if (previousDemand && previousDemand.unit !== demand.unit) arrivalFail(409, "material_arrival_unit_changed");
      if (canonicalPlanJson(demand.canonicalIdentity) !== canonicalPlanJson(canonicalIdentity)) arrivalFail(409, "material_arrival_identity_conflict");
      selected.set(demand.id, demand); const values = sums.get(demand.id) ?? []; values.push(allocation.quantity); sums.set(demand.id, values);
    }
    for (const [id, values] of sums) if (compareArrivalQuantities(sumArrivalQuantities(values), selected.get(id)!.requiredQuantity!) > 0)
      arrivalFail(422, "material_arrival_overallocated");
    await verifyArrivalDemandRegistry(client, order.id, [...selected.values()]);
  }
  // Explicit clearing remains possible after Source disappears; it uses the
  // preserved evidence only for the empty revision, never for new allocations.
  const generation = source.generation ?? before?.data.source;
  if (!generation) return arrivalFail(409, "material_arrival_source_unavailable");
  const data: ArrivalBasis = { dateSource: "manual", batches: intent.batches, demands: [...selected.values()].sort((a, b) => a.id.localeCompare(b.id)), source: generation,
    tracking: arrivalTrackingBasis(tracking) };
  boundArrivalPayload(data, 24000);
  const changed = before === null ? data.batches.length > 0 : canonicalPlanJson({ batches: before.data.batches, hub: before.supplyHubId, demands: comparableDemands(before.data) })
    !== canonicalPlanJson({ batches: data.batches, hub: data.tracking?.supplyHubId ?? null, demands: comparableDemands(data) });
  return { order, before, data, canonicalIdentity, changed, sourceStatus: source.status };
}
function projectPreview(built: Awaited<ReturnType<typeof build>>, actor: TrustedIdentity, intent: ArrivalIntent) {
  const result = { intent, order: built.order, before: built.before, after: built.data, changed: built.changed, sourceStatus: built.sourceStatus,
    previewHash: materialArrivalHash({ actorId: actor.userId, permissions: actor.permissions, intent, ...built }) };
  boundArrivalPayload(result); return result;
}
export async function previewMaterialArrival(pool: Pool, identity: TrustedIdentity, raw: unknown, config: SourceReadConfig | null) {
  const intent = parseArrivalIntent(raw);
  return transaction(pool, identity, async (client, actor) => { requireWrite(actor); return projectPreview(await build(client, actor, intent, config, false), actor, intent); });
}
export type ArrivalRejected = { requestId: string; status: "rejected"; error: { status: number; code: string } };
export type ArrivalOutcome = { requestId: string; status: "applied"; changed: boolean; operationId: string | null; plan: StoredArrivalPlan | null } | ArrivalRejected;
function auditBatchSummary(data: ArrivalBasis) {
  const demands = new Map(data.demands.map(row => [row.id, row]));
  return data.batches.map(batch => `${batch.expectedArrivalAtHubDate}：${batch.allocations.map(allocation => {
    const demand = demands.get(allocation.materialDemandId)!;
    return `${[demand.color, demand.specification].filter(Boolean).join(" / ")} ${allocation.quantity}${demand.unit ?? "（单位未记录）"}`;
  }).join("；")}`).join("\n") || "未安排批次";
}
export async function executeMaterialArrival(pool: Pool, identity: TrustedIdentity, raw: unknown, config: SourceReadConfig | null) {
  const command = parseArrivalCommand(raw), digest = materialArrivalHash(command), client = await pool.connect();
  try {
    await client.query("BEGIN"); await client.query("SET LOCAL lock_timeout='5s'");
    await lockEffectiveAttribution(client);
    const actor = await readCurrentActor(client, identity, true); requireWrite(actor); await materialArrivalsAvailable(client);
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [materialArrivalRequestLock(actor, command.requestId)]);
    const prior = (await client.query<{ payload_hash: string; result: ArrivalOutcome }>(
      "SELECT payload_hash,result FROM material_arrival_commands WHERE actor_id=$1 AND request_id=$2", [actor.internalUserId, command.requestId])).rows[0];
    if (prior) {
      if (prior.payload_hash !== digest) arrivalFail(409, "material_arrival_request_conflict");
      await client.query("COMMIT"); return { ...prior.result, payloadHash: digest, replayed: true };
    }
    await client.query("SAVEPOINT arrival_apply"); let result: ArrivalOutcome;
    try {
      const built = await build(client, actor, command.intent, config, true);
      if (projectPreview(built, actor, command.intent).previewHash !== command.previewHash) arrivalFail(409, "material_arrival_preview_changed");
      const operationId = built.changed ? createServerOperationId() : null;
      const plan = built.changed ? await persistArrivalPlan(client, actor, built.order.id, command.intent.canonicalKey, built.canonicalIdentity, built.before, built.data, command.requestId, operationId!) : built.before;
      if (built.changed) await appendOperationLog(client, actor, { operationId: operationId!, operationSequence: 0, module: "款式进度", action: "修改预计到仓计划",
        entityType: "MaterialExpectedArrivalPlan", entityId: plan!.id, beforeData: built.before ? { orderId: built.order.id, objectName: built.order.orderNo, values: { 物料: built.canonicalIdentity.materialName, 批次: auditBatchSummary(built.before.data) } } : null,
        afterData: { orderId: built.order.id, objectName: built.order.orderNo, values: { 物料: built.canonicalIdentity.materialName, 集货仓: built.data.tracking?.hubSnapshot?.name ?? "未设置", 批次: auditBatchSummary(built.data) } },
        metadata: { requestId: command.requestId, previewHash: command.previewHash, appliedVersion: plan!.version } });
      result = { requestId: command.requestId, status: "applied", changed: built.changed, operationId, plan }; boundArrivalPayload(result, 64000);
    } catch (error) {
      if (!(error instanceof HttpError) || ![404, 409, 422].includes(error.status)) throw error;
      await client.query("ROLLBACK TO SAVEPOINT arrival_apply"); result = { requestId: command.requestId, status: "rejected", error: { status: error.status, code: error.code } };
    }
    await client.query("INSERT INTO material_arrival_commands(actor_id,request_id,payload_hash,command,result) VALUES($1,$2,$3,$4,$5)",
      [actor.internalUserId, command.requestId, digest, command, result]);
    if (result.status === "applied") await client.query("INSERT INTO material_arrival_command_orders(actor_id,request_id,sales_order_id) VALUES($1,$2,$3)", [actor.internalUserId, command.requestId, command.intent.orderId]);
    await client.query("COMMIT"); return { ...result, payloadHash: digest, replayed: false };
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}
export function materialArrivalPlanIssues(plan: StoredArrivalPlan, source: ArrivalSource, hubId: string | null) {
  const issues = new Set<string>();
  if (!plan.data.batches.length) return [];
  if (source.status !== "ready") issues.add("source_unavailable");
  if (plan.supplyHubId !== hubId) issues.add("hub_changed");
  for (const old of plan.data.demands) {
    const current = source.demands.filter(row => row.id === old.id);
    if (current.length !== 1 || current[0].eligibility !== "eligible") { issues.add("demand_unavailable"); continue; }
    if (current[0].unit !== old.unit) issues.add("unit_changed");
    const quantities = plan.data.batches.flatMap(batch => batch.allocations.filter(row => row.materialDemandId === old.id).map(row => row.quantity));
    if (compareArrivalQuantities(sumArrivalQuantities(quantities), current[0].requiredQuantity!) > 0) issues.add("overallocated");
  }
  return [...issues].sort();
}
export async function readMaterialArrivals(pool: Pool, identity: TrustedIdentity, rawId: string, config: SourceReadConfig | null) {
  const id = arrivalUuid(rawId);
  return transaction(pool, identity, async (client, actor) => {
    const order = await orderFacts(client, id), plans = await readArrivalPlans(client, id), tracking = await readStoredOrderTracking(client, id), source = await readArrivalSource(client, actor, id, config);
    await verifyArrivalDemandRegistry(client, id, source.demands);
    let canEdit = ARRIVAL_WRITE_PERMISSIONS.every(key => actor.permissions.includes(key));
    if (canEdit) try { await writableOrder(client, order); } catch (error) { if (!(error instanceof HttpError) || error.status !== 409) throw error; canEdit = false; }
    return { order, source, tracking: arrivalTrackingBasis(tracking), canEdit, plans: plans.map(plan => ({ plan, issues: materialArrivalPlanIssues(plan, source, tracking?.supplyHubId ?? null) })) };
  });
}
export async function readMaterialArrivalHistory(pool: Pool, identity: TrustedIdentity, rawId: string, rawKey: string, offset = 0, asOfVersion: number | null = null) {
  const id = arrivalUuid(rawId), key = arrivalKey(rawKey);
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 100000) arrivalFail(400, "invalid_material_arrival_history_query");
  return transaction(pool, identity, async client => {
    const order = await orderFacts(client, id), plan = await readArrivalPlan(client, id, key), anchor = asOfVersion ?? plan?.version ?? 0;
    if (!Number.isSafeInteger(anchor) || anchor < 0 || anchor > (plan?.version ?? 0) || plan && anchor === 0) arrivalFail(400, "invalid_material_arrival_history_query");
    const rows = (await client.query(`SELECT version,snapshot,request_id::text AS "requestId",operation_id AS "operationId",recorded_at AS "recordedAt"
      FROM material_arrival_plan_versions WHERE plan_id=$1 AND version<=$2 ORDER BY version DESC LIMIT 26 OFFSET $3`, [plan?.id ?? null, anchor, offset])).rows;
    if (rows.length > 25 && offset + 25 > 100000) arrivalFail(422, "material_arrival_projection_limit");
    return { order, plan, history: rows.slice(0, 25), offset, limit: 25, asOfVersion: anchor, hasMore: rows.length > 25, nextOffset: rows.length > 25 ? offset + 25 : null };
  });
}
/** Recovery is independent of the current Source pointer, lifecycle and Hub. */
export async function readMaterialArrivalReceipt(pool: Pool, identity: TrustedIdentity, rawId: string) {
  const requestId = arrivalUuid(rawId), client = await pool.connect();
  try {
    await client.query("BEGIN"); const actor = await readCurrentActor(client, identity); requireWrite(actor); await materialArrivalsAvailable(client);
    const available = (await client.query<{ available: boolean }>("SELECT pg_try_advisory_xact_lock(hashtextextended($1,0)) AS available", [materialArrivalRequestLock(actor, requestId)])).rows[0].available;
    const row = (await client.query<{ payload_hash: string; result: ArrivalOutcome }>("SELECT payload_hash,result FROM material_arrival_commands WHERE actor_id=$1 AND request_id=$2", [actor.internalUserId, requestId])).rows[0];
    const result = row ? { state: "known" as const, requestId, payloadHash: row.payload_hash, result: row.result } : { state: available ? "unknown" as const : "pending" as const, requestId };
    boundArrivalPayload(result); await client.query("COMMIT"); return result;
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}
