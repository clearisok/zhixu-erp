import type { PermissionKey } from "../../features/permissions/model/permissions.js";
import { HttpError } from "../http/errors.js";
import { productionResourceUuid } from "../production-resources/contract.js";

export type OrderTrackingData = { supplyHubId: string | null; remark: string };
export type OrderTrackingIntent = { action: "set_order_tracking"; orderId: string; expectedVersion: number; data: OrderTrackingData };
export type OrderTrackingCommand = { requestId: string; intent: OrderTrackingIntent; previewHash: string };
export const ORDER_TRACKING_READ_PERMISSIONS: readonly PermissionKey[] = ["order.view", "schedule.view"];
export const ORDER_TRACKING_WRITE_PERMISSIONS: readonly PermissionKey[] = [...ORDER_TRACKING_READ_PERMISSIONS, "schedule.edit"];
const invalid = (): never => { throw new HttpError(400, "invalid_order_tracking_intent", "Invalid order tracking intent"); };
function exact(value: unknown, keys: readonly string[]) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid();
  const row = value as Record<string, unknown>;
  if (Object.keys(row).length !== keys.length || keys.some(key => !Object.hasOwn(row, key))) return invalid();
  return row;
}
const uuid = (value: unknown) => { try { return productionResourceUuid(value); } catch { return invalid(); } };
export function parseOrderTrackingData(value: unknown): OrderTrackingData {
  const row = exact(value, ["supplyHubId", "remark"]);
  if (typeof row.remark !== "string" || row.remark.length > 2000 || row.remark.includes("\0")
    || Array.from(row.remark).some(char => char.length === 1 && /[\uD800-\uDFFF]/u.test(char))) return invalid();
  return { supplyHubId: row.supplyHubId === null ? null : uuid(row.supplyHubId), remark: row.remark };
}
export function parseOrderTrackingIntent(value: unknown): OrderTrackingIntent {
  const row = exact(value, ["action", "orderId", "expectedVersion", "data"]);
  if (row.action !== "set_order_tracking" || typeof row.expectedVersion !== "number" || !Number.isSafeInteger(row.expectedVersion)
    || row.expectedVersion < 0 || row.expectedVersion > 2147483646) return invalid();
  return { action: row.action, orderId: uuid(row.orderId), expectedVersion: row.expectedVersion, data: parseOrderTrackingData(row.data) };
}
export function parseOrderTrackingCommand(value: unknown): OrderTrackingCommand {
  const row = exact(value, ["requestId", "intent", "previewHash"]);
  if (typeof row.previewHash !== "string" || !/^[a-f0-9]{64}$/u.test(row.previewHash)) return invalid();
  return { requestId: uuid(row.requestId), intent: parseOrderTrackingIntent(row.intent), previewHash: row.previewHash };
}
export function parseOrderTrackingHistoryQuery(params: URLSearchParams) {
  const fail = (): never => { throw new HttpError(400, "invalid_production_history_query", "Invalid history query"); };
  if ([...params.keys()].some(key => !["offset", "asOfVersion"].includes(key) || params.getAll(key).length !== 1)) fail();
  const integer = (key: string, max: number) => {
    const raw = params.get(key); if (raw === null) return null;
    if (!/^\d{1,10}$/u.test(raw)) return fail();
    const value = Number(raw); if (!Number.isSafeInteger(value) || value > max) fail(); return value;
  };
  return { offset: integer("offset", 100000) ?? 0, asOfVersion: integer("asOfVersion", 2147483647) };
}
