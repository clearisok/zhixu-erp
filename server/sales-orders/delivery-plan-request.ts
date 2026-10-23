import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { HttpError } from '../http/errors.js';
import { parseDeliveryPlanCommand, UUID_PATTERN, validDeliveryDate, type DeliveryPlanSetDto } from './delivery-plan-model.js';

export const DELIVERY_PLAN_COMMAND_MAX_BYTES = 64 * 1024;
export const DELIVERY_PLAN_RECEIPT_MAX_BYTES = 16 * 1024 * 1024;
export const DELIVERY_PLAN_REJECTIONS = {
  delivery_plan_version_conflict: [409, 'DeliveryPlan collection version is stale'],
  delivery_plan_row_conflict: [409, 'DeliveryPlan row is absent or voided'],
  historical_duplicate_order_read_only: [409, 'Historical duplicate order is read-only'],
  delivery_plan_receipt_too_large: [422, 'DeliveryPlan result exceeds the receipt capacity'],
} as const;
type RejectionCode = keyof typeof DELIVERY_PLAN_REJECTIONS;
export type DeliveryPlanRequestResult =
  | { status: 'applied'; deliveryPlanSet: DeliveryPlanSetDto; operationId: string }
  | { status: 'rejected'; error: { status: 409 | 422; code: RejectionCode; message: string } };
export type DeliveryPlanRequest = ReturnType<typeof prepareDeliveryPlanRequest>;
export type DeliveryPlanReceipt = {
  schemaVersion: 1; salesOrderId: string; requestId: string | null; requestMode: 'explicit' | 'legacy';
} & (DeliveryPlanRequestResult | { status: 'unknown' });

/** Copy/normalize before the first await. No caller-owned arrays reach hashing or SQL. */
export function prepareDeliveryPlanRequest(salesOrderId: string, values: Record<string, unknown>) {
  if (!UUID_PATTERN.test(salesOrderId)) throw new HttpError(400, 'invalid_sales_order_id', 'SalesOrder ID must be a UUID');
  const input = parseDeliveryPlanCommand(values);
  const command = { salesOrderId: salesOrderId.toLowerCase(), expectedVersion: input.expectedVersion,
    upserts: input.upserts, voidIds: input.voidIds };
  const serializedCommand = JSON.stringify(command);
  if (Buffer.byteLength(serializedCommand) > DELIVERY_PLAN_COMMAND_MAX_BYTES) {
    throw new HttpError(400, 'invalid_delivery_plan_command', 'Invalid DeliveryPlan command');
  }
  const commandHash = createHash('sha256').update(serializedCommand).digest('hex');
  const requestId = input.requestId ?? null;
  return { command, serializedCommand, commandHash, requestId,
    requestMode: requestId === null ? 'legacy' as const : 'explicit' as const,
    requestKey: requestId === null ? 'legacy:' + commandHash : 'uuid:' + requestId };
}

export function stableDeliveryPlanRejection(error: unknown): Extract<DeliveryPlanRequestResult, { status: 'rejected' }> | null {
  if (!(error instanceof HttpError) || !Object.hasOwn(DELIVERY_PLAN_REJECTIONS, error.code)) return null;
  const code = error.code as RejectionCode, [status, message] = DELIVERY_PLAN_REJECTIONS[code];
  return error.status === status ? { status: 'rejected', error: { status, code, message } } : null;
}

export function deliveryPlanReceipt(request: DeliveryPlanRequest, result?: DeliveryPlanRequestResult): DeliveryPlanReceipt {
  return { schemaVersion: 1, salesOrderId: request.command.salesOrderId, requestId: request.requestId,
    requestMode: request.requestMode, ...(result ?? { status: 'unknown' }) };
}

type SavedRequest = { sales_order_id: string; command_hash: string; command: unknown; result: unknown; outcome: string; audit_log_id: string | null };
export function readSavedDeliveryPlanResult(request: DeliveryPlanRequest, row: SavedRequest): DeliveryPlanRequestResult {
  if (row.sales_order_id !== request.command.salesOrderId || row.command_hash !== request.commandHash
      || !isDeepStrictEqual(row.command, request.command)) {
    throw new HttpError(409, 'delivery_plan_request_conflict', 'Request identity was already used for another DeliveryPlan command');
  }
  const invalid = (): never => { throw new HttpError(503, 'delivery_plan_receipt_invalid', 'DeliveryPlan receipt is unavailable'); };
  const result = row.result;
  if (!record(result) || result.status !== row.outcome) return invalid();
  if (result.status === 'rejected' && exactKeys(result, ['status', 'error']) && row.audit_log_id === null) {
    const error = result.error;
    if (!record(error) || !exactKeys(error, ['status', 'code', 'message']) || typeof error.code !== 'string'
        || !Object.hasOwn(DELIVERY_PLAN_REJECTIONS, error.code)) return invalid();
    const code = error.code as RejectionCode, [status, message] = DELIVERY_PLAN_REJECTIONS[code];
    if (error.status !== status || error.message !== message) return invalid();
    return { status: 'rejected', error: { status, code, message } };
  }
  if (result.status !== 'applied' || !exactKeys(result, ['status', 'deliveryPlanSet', 'operationId'])
      || !row.audit_log_id || typeof result.operationId !== 'string' || !/^operation-[a-f0-9-]{36}$/.test(result.operationId)) return invalid();
  const set = result.deliveryPlanSet;
  if (!record(set) || !exactKeys(set, ['salesOrderId', 'ownership', 'version', 'plans', 'sourceDeliveryDate', 'sourceQuantity', 'reconciliation'])
      || set.salesOrderId !== request.command.salesOrderId || set.ownership !== 'user_managed'
      || !Number.isSafeInteger(set.version) || (set.version as number) < 1 || !Array.isArray(set.plans)
      || !(set.sourceDeliveryDate === null || validDeliveryDate(set.sourceDeliveryDate))
      || !(set.sourceQuantity === null || decimal(set.sourceQuantity))) return invalid();
  const ids = new Set<string>();
  for (const plan of set.plans) {
    if (!record(plan) || !exactKeys(plan, ['id', 'deliveryDate', 'quantity', 'isDerivedDefault', 'voidedAt'])
        || typeof plan.id !== 'string' || !UUID_PATTERN.test(plan.id) || ids.has(plan.id)
        || !(plan.deliveryDate === null || validDeliveryDate(plan.deliveryDate)) || !decimal(plan.quantity)
        || typeof plan.isDerivedDefault !== 'boolean'
        || !(plan.voidedAt === null || typeof plan.voidedAt === 'string' && plan.voidedAt.length <= 64 && Number.isFinite(Date.parse(plan.voidedAt)))) return invalid();
    ids.add(plan.id);
  }
  const r = set.reconciliation;
  if (!record(r) || !exactKeys(r, ['dateStatus', 'planDates', 'quantityStatus']) || !Array.isArray(r.planDates)
      || !r.planDates.every(validDeliveryDate) || !['no_source_date', 'matched', 'drift'].includes(r.dateStatus as string)
      || !['no_source_quantity', 'unplanned', 'short', 'matched', 'excess'].includes(r.quantityStatus as string)) return invalid();
  // Project a fixed validated shape. Stored JSON must never introduce prices or source metadata.
  return { status: 'applied', operationId: result.operationId, deliveryPlanSet: set as DeliveryPlanSetDto };
}
function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
function exactKeys(value: Record<string, unknown>, keys: string[]) { return Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key)); }
function decimal(value: unknown): value is string { return typeof value === 'string' && /^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value); }
