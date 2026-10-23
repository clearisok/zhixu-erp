import { parseDeliveryPlanCommand, UUID_PATTERN, validDeliveryDate, type DeliveryPlanCommand, type DeliveryPlanSetDto } from '../../../server/sales-orders/delivery-plan-model';
import type { DeliveryPlanReceipt } from '../../../server/sales-orders/delivery-plan-request';
import { ServerAuthError } from '../../server-auth/server-auth-client';

export type ExplicitDeliveryPlanCommand = DeliveryPlanCommand & { requestId: string };
export type DeliveryPlanPending = { salesOrderId: string; command: ExplicitDeliveryPlanCommand };
export type DeliveryPlanLease = () => boolean;
export const DELIVERY_PLAN_RESPONSE_BYTES = 16 * 1024 * 1024 + 64 * 1024;
const messages: Record<string, string> = {
  delivery_plan_response_invalid: '返回的交付计划无法完整核对，请重新读取。',
  delivery_plan_response_too_large: '交付计划记录较多，无法完整读取；原记录仍保留。',
  delivery_plan_receipt_mismatch: '核对结果与本次保存不一致，原请求仍保留。',
  delivery_plan_owner_changed: '登录或订单已变化，原请求仍保留供核对。',
  delivery_plan_outcome_unknown: '保存结果暂未确认，请先核对本次保存结果。',
  invalid_delivery_plan_command: '请检查交付日期和数量，每次最多变更100条。',
  delivery_plan_version_conflict: '交付计划已被其他人修改，请重新读取后核对。',
  delivery_plan_row_conflict: '计划记录已变化，请重新读取后核对。',
  delivery_plan_request_conflict: '请求编号与原内容不一致，请保留现场并联系管理员。',
  historical_duplicate_order_read_only: '该历史订单仅可查看，原计划保留。',
  delivery_plan_receipt_too_large: '本次变更结果过大，未应用变更，请缩小范围。',
  delivery_plan_request_failed: '交付计划暂时不可用，请稍后核对。',
};
export class DeliveryPlanClientError extends ServerAuthError {
  constructor(status: number, code: string) { super(status, code, messages[code]); }
}
const invalid = (): never => { throw new DeliveryPlanClientError(502, 'delivery_plan_response_invalid'); };
const mismatch = (): never => { throw new DeliveryPlanClientError(502, 'delivery_plan_receipt_mismatch'); };
const owned = (lease: DeliveryPlanLease) => { if (!lease()) throw new DeliveryPlanClientError(0, 'delivery_plan_owner_changed'); };
function object(value: unknown): Record<string, unknown> { if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid(); return value as Record<string, unknown>; }
function keys(value: Record<string, unknown>, expected: string[]) { if (Object.keys(value).length !== expected.length || expected.some(key => !Object.hasOwn(value, key))) invalid(); }
function integer(value: unknown, minimum = 0): number { if (!Number.isSafeInteger(value) || (value as number) < minimum) return invalid(); return value as number; }
function uuid(value: unknown): string { if (typeof value !== 'string' || !UUID_PATTERN.test(value)) return invalid(); return value.toLowerCase(); }
function decimal(value: unknown): string { if (typeof value !== 'string' || !/^(?:0|[1-9]\d*)(?:\.\d+)?$/u.test(value)) return invalid(); return value; }
function date(value: unknown): string { if (!validDeliveryDate(value)) return invalid(); return value; }

/** Reuse the Server command validator; UI writes always have an explicit UUID.
 * Its normalized copy is captured before any asynchronous operation. */
export function explicitDeliveryPlanCommand(value: unknown): ExplicitDeliveryPlanCommand {
  try {
    const input = object(value), command = parseDeliveryPlanCommand(input);
    if (!command.requestId) throw new Error();
    return { requestId: command.requestId, expectedVersion: command.expectedVersion,
      upserts: command.upserts, voidIds: command.voidIds };
  } catch { throw new DeliveryPlanClientError(400, 'invalid_delivery_plan_command'); }
}
export function deliveryPlanPending(value: unknown): DeliveryPlanPending {
  const input = object(value); keys(input, ['salesOrderId', 'command']);
  return { salesOrderId: uuid(input.salesOrderId), command: explicitDeliveryPlanCommand(input.command) };
}

/** Complete white-listed projection. History is not limited to the100-row write
 * budget; retained zero quantities and nullable system-default dates are legal. */
export function parseDeliveryPlanSet(value: unknown, expectedOrder: string): DeliveryPlanSetDto {
  const input = object(value); keys(input, ['salesOrderId', 'ownership', 'version', 'plans', 'sourceDeliveryDate', 'sourceQuantity', 'reconciliation']);
  const salesOrderId = uuid(input.salesOrderId); if (salesOrderId !== uuid(expectedOrder)) return mismatch();
  if (typeof input.ownership !== 'string' || !['source_derived', 'user_managed', 'uninitialized'].includes(input.ownership) || !Array.isArray(input.plans)) return invalid();
  const ids = new Set<string>();
  const plans = input.plans.map(value => {
    const row = object(value); keys(row, ['id', 'deliveryDate', 'quantity', 'isDerivedDefault', 'voidedAt']);
    const id = uuid(row.id); if (ids.has(id)) return invalid(); ids.add(id);
    if (typeof row.isDerivedDefault !== 'boolean' || !(row.voidedAt === null || typeof row.voidedAt === 'string'
      && row.voidedAt.length <= 64 && Number.isFinite(Date.parse(row.voidedAt)))) return invalid();
    return { id, deliveryDate: row.deliveryDate === null ? null : date(row.deliveryDate), quantity: decimal(row.quantity),
      isDerivedDefault: row.isDerivedDefault, voidedAt: row.voidedAt as string | null };
  });
  const r = object(input.reconciliation); keys(r, ['dateStatus', 'planDates', 'quantityStatus']);
  if (typeof r.dateStatus !== 'string' || !['no_source_date', 'matched', 'drift'].includes(r.dateStatus) || !Array.isArray(r.planDates)
    || typeof r.quantityStatus !== 'string' || !['no_source_quantity', 'unplanned', 'short', 'matched', 'excess'].includes(r.quantityStatus)) return invalid();
  const planDates = r.planDates.map(date); if (new Set(planDates).size !== planDates.length) return invalid();
  return { salesOrderId, ownership: input.ownership as DeliveryPlanSetDto['ownership'], version: integer(input.version), plans,
    sourceDeliveryDate: input.sourceDeliveryDate === null ? null : date(input.sourceDeliveryDate),
    sourceQuantity: input.sourceQuantity === null ? null : decimal(input.sourceQuantity),
    reconciliation: { dateStatus: r.dateStatus as DeliveryPlanSetDto['reconciliation']['dateStatus'], planDates,
      quantityStatus: r.quantityStatus as DeliveryPlanSetDto['reconciliation']['quantityStatus'] } };
}
function sameQuantity(left: string, right: string): boolean {
  const normalize = (value: string) => value.includes('.') ? value.replace(/0+$/u, '').replace(/\.$/u, '') : value;
  return normalize(left) === normalize(right);
}
/** A terminal result must reflect the original intent, not merely its next CAS.
 * Newly allocated rows match one-to-one; an edited row cannot also satisfy an add. */
function assertApplied(set: DeliveryPlanSetDto, pending: DeliveryPlanPending) {
  if (set.ownership !== 'user_managed' || set.version !== pending.command.expectedVersion + 1) return mismatch();
  const rows = new Map(set.plans.map(row => [row.id, row])), consumed = new Set<string>();
  for (const change of pending.command.upserts) {
    if (change.id === null) continue;
    const row = rows.get(change.id);
    if (!row || row.voidedAt !== null || row.deliveryDate !== change.deliveryDate || !sameQuantity(row.quantity, change.quantity)) return mismatch();
    consumed.add(row.id);
  }
  for (const id of pending.command.voidIds) {
    const row = rows.get(id); if (!row || row.voidedAt === null) return mismatch();
    consumed.add(id);
  }
  for (const change of pending.command.upserts) {
    if (change.id !== null) continue;
    const row = set.plans.find(row => !consumed.has(row.id) && !row.isDerivedDefault && row.voidedAt === null
      && row.deliveryDate === change.deliveryDate && sameQuantity(row.quantity, change.quantity));
    if (!row) return mismatch(); consumed.add(row.id);
  }
}
export function parseDeliveryPlanReceipt(value: unknown, request: DeliveryPlanPending): DeliveryPlanReceipt {
  const pending = deliveryPlanPending(request), input = object(value);
  const common = ['schemaVersion', 'salesOrderId', 'requestId', 'requestMode', 'status'];
  if (input.schemaVersion !== 1 || input.requestMode !== 'explicit' || uuid(input.salesOrderId) !== pending.salesOrderId
    || uuid(input.requestId) !== pending.command.requestId) return mismatch();
  const identity = { schemaVersion: 1 as const, salesOrderId: pending.salesOrderId, requestId: pending.command.requestId, requestMode: 'explicit' as const };
  if (input.status === 'unknown') { keys(input, common); return { ...identity, status: 'unknown' }; }
  if (input.status === 'rejected') {
    keys(input, [...common, 'error']); const error = object(input.error); keys(error, ['status', 'code', 'message']);
    const rejectionStatus: Record<string, number> = { delivery_plan_version_conflict: 409, delivery_plan_row_conflict: 409,
      historical_duplicate_order_read_only: 409, delivery_plan_receipt_too_large: 422 };
    if (typeof error.code !== 'string' || !Object.hasOwn(rejectionStatus, error.code) || error.status !== rejectionStatus[error.code]
      || typeof error.message !== 'string') return invalid();
    return { ...identity, status: 'rejected', error: { status: error.status as 409 | 422,
      code: error.code as Extract<DeliveryPlanReceipt, { status: 'rejected' }>['error']['code'], message: messages[error.code] } };
  }
  if (input.status !== 'applied') return invalid();
  keys(input, [...common, 'deliveryPlanSet', 'operationId']);
  if (typeof input.operationId !== 'string' || !input.operationId.startsWith('operation-') || !UUID_PATTERN.test(input.operationId.slice(10))) return invalid();
  const set = parseDeliveryPlanSet(input.deliveryPlanSet, pending.salesOrderId);
  assertApplied(set, pending);
  return { ...identity, status: 'applied', deliveryPlanSet: set, operationId: input.operationId };
}

async function readBounded(response: Response, lease: DeliveryPlanLease): Promise<unknown> {
  owned(lease); const limit = DELIVERY_PLAN_RESPONSE_BYTES;
  const header = response.headers.get('content-length');
  if (header && /^\d+$/u.test(header) && Number(header) > limit) {
    void response.body?.cancel().catch(() => undefined); throw new DeliveryPlanClientError(502, 'delivery_plan_response_too_large');
  }
  if (!response.body) return invalid();
  const reader = response.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      owned(lease); const next = await reader.read(); owned(lease); if (next.done) break;
      size += next.value.byteLength;
      if (size > limit) throw new DeliveryPlanClientError(502, 'delivery_plan_response_too_large');
      chunks.push(next.value);
    }
    const bytes = new Uint8Array(size); let at = 0;
    for (const chunk of chunks) { bytes.set(chunk, at); at += chunk.byteLength; }
    owned(lease);
    try { return JSON.parse(new TextDecoder('utf8', { fatal: true }).decode(bytes)); } catch { return invalid(); }
  } catch (error) {
    void reader.cancel().catch(() => undefined);
    if (error instanceof DeliveryPlanClientError) throw error;
    owned(lease); throw new DeliveryPlanClientError(0, 'delivery_plan_outcome_unknown');
  } finally { reader.releaseLock(); }
}

export function createDeliveryPlanClient(options: { fetchImpl?: typeof fetch; baseUrl?: string } = {}) {
  const fetchImpl = options.fetchImpl ?? fetch, baseUrl = (options.baseUrl ?? '').replace(/\/$/u, '');
  async function request(method: 'GET' | 'PATCH' | 'POST', orderId: string, command: ExplicitDeliveryPlanCommand | undefined,
    lease: DeliveryPlanLease, signal?: AbortSignal) {
    owned(lease); const id = uuid(orderId), body = command ? JSON.stringify(explicitDeliveryPlanCommand(command)) : undefined;
    let response: Response;
    try { response = await fetchImpl(`${baseUrl}/api/v1/sales-orders/${id}/delivery-plans${method === 'POST' ? '/receipt' : ''}`, {
      method, credentials: 'include', cache: 'no-store', signal,
      ...(body ? { headers: { 'Content-Type': 'application/json', 'X-Zhixu-Request': '1' }, body } : {}),
    }); } catch { owned(lease); throw new DeliveryPlanClientError(0, 'delivery_plan_outcome_unknown'); }
    owned(lease); const payload = object(await readBounded(response, lease)); owned(lease);
    if (!response.ok) {
      const code = object(payload.error).code;
      throw new DeliveryPlanClientError(response.status, typeof code === 'string' && Object.hasOwn(messages, code) ? code
        : response.status === 401 ? 'authentication_required' : response.status === 403 ? 'permission_denied' : 'delivery_plan_request_failed');
    }
    return payload;
  }
  return {
    async read(orderId: string, lease: DeliveryPlanLease, signal?: AbortSignal) {
      const id = uuid(orderId), payload = await request('GET', id, undefined, lease, signal); keys(payload, ['deliveryPlanSet']);
      return parseDeliveryPlanSet(payload.deliveryPlanSet, id);
    },
    async save(input: DeliveryPlanPending, lease: DeliveryPlanLease, signal?: AbortSignal) {
      const pending = deliveryPlanPending(input), payload = await request('PATCH', pending.salesOrderId, pending.command, lease, signal);
      keys(payload, ['deliveryPlanSet']); const set = parseDeliveryPlanSet(payload.deliveryPlanSet, pending.salesOrderId);
      assertApplied(set, pending);
      return set;
    },
    async receipt(input: DeliveryPlanPending, lease: DeliveryPlanLease, signal?: AbortSignal) {
      const pending = deliveryPlanPending(input), payload = await request('POST', pending.salesOrderId, pending.command, lease, signal);
      keys(payload, ['receipt']); return parseDeliveryPlanReceipt(payload.receipt, pending);
    },
  };
}
