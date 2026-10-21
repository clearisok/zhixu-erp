import { canonicalPlanJson } from "../../../server/production-scheduling/canonical-json";
import { parseOrderTrackingData, parseOrderTrackingIntent, type OrderTrackingCommand, type OrderTrackingIntent } from "../../../server/production-scheduling/tracking-contract";
import type { StoredOrderTracking, TrackingHubSnapshot } from "../../../server/production-scheduling/tracking-store";
import { productionResourceCommon } from "../../../server/production-resources/contract";
import type { EffectiveOrderIdentity } from "../../../server/sales-orders/effective-attribution";

export type TrackingOrder = { id: string; orderNo: string; version: number; lifecycleState: string; identity: EffectiveOrderIdentity };
export type OrderTrackingRead = { order: TrackingOrder; tracking: StoredOrderTracking | null; currentHub: TrackingHubSnapshot | null; canEdit: boolean };
export type OrderTrackingPreview = { intent: OrderTrackingIntent; before: StoredOrderTracking | null;
  after: OrderTrackingIntent["data"] & { hubSnapshot: TrackingHubSnapshot | null }; changed: boolean; order: TrackingOrder; previewHash: string };
export type VerifiedTrackingOutcome = ({ requestId: string; status: "applied"; changed: boolean; operationId: string | null; tracking: StoredOrderTracking | null }
  | { requestId: string; status: "rejected"; error: { status: number; code: string } }) & { payloadHash: string };
export type OrderTrackingHistoryRead = { order: TrackingOrder; tracking: StoredOrderTracking | null; history: {
  version: number; requestId: string; operationId: string; recordedAt: string; snapshot: StoredOrderTracking;
}[]; asOfVersion: number; offset: number; limit: 25; hasMore: boolean; nextOffset: number | null };
type Validation = {
  object(value: unknown): Record<string, unknown>; integer(value: unknown, min?: number, max?: number): number;
  text(value: unknown, max?: number): string; uuid(value: unknown): string; timestamp(value: unknown): string;
  boolean(value: unknown): boolean; hash(value: unknown): string; invalid(): never; mismatch(): never;
  errorCode(value: string): string;
};
/** Pure non-monetary projections; the original production client owns transport,
 * digest, lease and shared receipt handling. No separate writer or outbox. */
export function createOrderTrackingProjections(v: Validation) {
  const version = (value: unknown, min = 0) => v.integer(value, min, 2147483647);
  const nullableUuid = (value: unknown) => value === null ? null : v.uuid(value);
  function hub(value: unknown): TrackingHubSnapshot | null {
    if (value === null) return null;
    const raw = v.object(value); let common;
    try { common = productionResourceCommon({ name: raw.name, enabled: raw.enabled, remark: raw.remark }); } catch { return v.invalid(); }
    if (common.name !== raw.name || common.remark !== raw.remark) return v.invalid();
    return { ...common, id: v.uuid(raw.id), version: version(raw.version, 1) };
  }
  function data(value: unknown) {
    const raw = v.object(value);
    try { return parseOrderTrackingData({ supplyHubId: raw.supplyHubId, remark: raw.remark }); } catch { return v.invalid(); }
  }
  function tracking(value: unknown, orderId: string): StoredOrderTracking | null {
    if (value === null) return null;
    const raw = v.object(value), fields = data(raw), snapshot = hub(raw.hubSnapshot);
    const row = { ...fields, id: v.uuid(raw.id), orderId: v.uuid(raw.orderId), version: version(raw.version, 1),
      hubSnapshot: snapshot, createdAt: v.timestamp(raw.createdAt), updatedAt: v.timestamp(raw.updatedAt) };
    if (row.orderId !== orderId || (snapshot?.id ?? null) !== fields.supplyHubId || row.updatedAt < row.createdAt) return v.mismatch();
    return row;
  }
  function order(value: unknown, orderId: string): TrackingOrder {
    const raw = v.object(value), identityRaw = v.object(raw.identity), lifecycleState = v.text(raw.lifecycleState, 30);
    const identity = { originalOrderId: v.uuid(identityRaw.originalOrderId), effectiveOrderId: v.uuid(identityRaw.effectiveOrderId),
      attributionChangeId: nullableUuid(identityRaw.attributionChangeId), attributionVersion: version(identityRaw.attributionVersion), historicalDuplicate: v.boolean(identityRaw.historicalDuplicate) };
    if (v.uuid(raw.id) !== orderId || identity.originalOrderId !== orderId || identity.historicalDuplicate !== (orderId !== identity.effectiveOrderId)
      || (identity.attributionVersion === 0) !== (identity.attributionChangeId === null)
      || !["draft", "confirmed", "active", "completed", "cancelled"].includes(lifecycleState)) return v.mismatch();
    return { id: orderId, orderNo: v.text(raw.orderNo), version: version(raw.version, 1), lifecycleState, identity };
  }
  const operation = (value: unknown) => { const id = v.text(value, 200); if (id !== "operation-" + v.uuid(id.slice(10))) return v.invalid(); return id; };
  const pgTimestamp = (value: unknown) => { const raw = v.text(value, 50); if (!Number.isFinite(Date.parse(raw))) return v.invalid(); return new Date(raw).toISOString(); };
  function read(value: unknown, orderId: string): OrderTrackingRead {
    const raw = v.object(value), current = order(raw.order, orderId), saved = tracking(raw.tracking, orderId), currentHub = hub(raw.currentHub), canEdit = v.boolean(raw.canEdit);
    if ((currentHub?.id ?? null) !== (saved?.supplyHubId ?? null) || saved?.hubSnapshot && currentHub && currentHub.version < saved.hubSnapshot.version
      || canEdit && (current.identity.historicalDuplicate || ["completed", "cancelled"].includes(current.lifecycleState))) return v.mismatch();
    return { order: current, tracking: saved, currentHub, canEdit };
  }
  function preview(value: unknown, intent: OrderTrackingIntent, scope: OrderTrackingRead): OrderTrackingPreview {
    const raw = v.object(value), normalized = parseOrderTrackingIntent(raw.intent), current = order(raw.order, intent.orderId), before = tracking(raw.before, intent.orderId), afterRaw = v.object(raw.after);
    const fields = data(afterRaw), snapshot = hub(afterRaw.hubSnapshot), changed = v.boolean(raw.changed);
    if (canonicalPlanJson(normalized) !== canonicalPlanJson(intent) || scope.order.id !== intent.orderId || canonicalPlanJson(before) !== canonicalPlanJson(scope.tracking)
      || (before?.version ?? 0) !== intent.expectedVersion || canonicalPlanJson(fields) !== canonicalPlanJson(intent.data)
      || (snapshot?.id ?? null) !== intent.data.supplyHubId || snapshot && !snapshot.enabled && before?.supplyHubId !== snapshot.id
      || current.identity.historicalDuplicate || ["completed", "cancelled"].includes(current.lifecycleState)
      || canonicalPlanJson(current.identity) !== canonicalPlanJson(scope.order.identity) || current.version < scope.order.version
      || changed !== (fields.supplyHubId !== (before?.supplyHubId ?? null) || fields.remark !== (before?.remark ?? ""))) return v.mismatch();
    return { intent: normalized, before, after: { ...fields, hubSnapshot: snapshot }, changed, order: current, previewHash: v.hash(raw.previewHash) };
  }
  function outcome(value: unknown, command: OrderTrackingCommand, fingerprint: string): VerifiedTrackingOutcome {
    const raw = v.object(value);
    if (raw.requestId !== command.requestId || raw.payloadHash !== fingerprint) return v.mismatch();
    if (raw.status === "rejected") {
      const error = v.object(raw.error); if (![404, 409, 422].includes(error.status as number) || typeof error.code !== "string") return v.invalid();
      return { requestId: command.requestId, payloadHash: fingerprint, status: "rejected", error: { status: error.status as number, code: v.errorCode(error.code) } };
    }
    if (raw.status !== "applied") return v.invalid();
    const changed = v.boolean(raw.changed), saved = tracking(raw.tracking, command.intent.orderId), expected = command.intent.expectedVersion;
    if (expected === 0 && command.intent.data.supplyHubId === null && command.intent.data.remark === "" && (changed || saved !== null)) return v.mismatch();
    if (saved ? saved.version !== expected + Number(changed) || canonicalPlanJson(data(saved)) !== canonicalPlanJson(command.intent.data)
      : changed || expected !== 0 || command.intent.data.supplyHubId !== null || command.intent.data.remark !== "") return v.mismatch();
    return { requestId: command.requestId, payloadHash: fingerprint, status: "applied", changed,
      operationId: changed ? operation(raw.operationId) : raw.operationId === null ? null : v.mismatch(), tracking: saved };
  }
  function history(value: unknown, orderId: string, offset: number, anchor: number | null): OrderTrackingHistoryRead {
    const raw = v.object(value), current = order(raw.order, orderId), saved = tracking(raw.tracking, orderId), at = v.integer(raw.asOfVersion, 0, saved?.version ?? 0);
    const hasMore = v.boolean(raw.hasMore), nextOffset = raw.nextOffset === null ? null : v.integer(raw.nextOffset, 0, 100000);
    if (saved && at === 0 || anchor !== null && at !== anchor || v.integer(raw.offset) !== offset || raw.limit !== 25
      || (hasMore ? nextOffset !== offset + 25 : nextOffset !== null) || !Array.isArray(raw.history) || raw.history.length !== Math.max(0, Math.min(25, at - offset))
      || hasMore !== (offset + raw.history.length < at)) return v.mismatch();
    const rows = (raw.history as unknown[]).map((value, index) => {
      const item = v.object(value), snapshot = v.object(item.snapshot), rowVersion = version(item.version, 1);
      const row = tracking({ ...snapshot, orderId: snapshot.sales_order_id, supplyHubId: snapshot.supply_hub_id, hubSnapshot: snapshot.hub_snapshot,
        createdAt: pgTimestamp(snapshot.created_at), updatedAt: pgTimestamp(snapshot.updated_at) }, orderId);
      if (!row || row.id !== saved?.id || row.version !== rowVersion || rowVersion !== at - offset - index) return v.mismatch();
      return { version: rowVersion, requestId: v.uuid(item.requestId), operationId: operation(item.operationId), recordedAt: v.timestamp(item.recordedAt), snapshot: row };
    });
    return { order: current, tracking: saved, history: rows, offset, asOfVersion: at, limit: 25, hasMore, nextOffset };
  }
  return { read, preview, outcome, history };
}
