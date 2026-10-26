import type { PermissionKey } from '../../features/permissions/model/permissions.js';
import { canonicalDecimal } from '../quotes/decimal-projection.js';
import { HttpError } from '../http/errors.js';

export type ClosingChannels = { sales: boolean; work: boolean };
export type ClosingAllocationData = {
  quantity: string; colorId: string | null; channels: ClosingChannels; assignmentId: string | null;
  executor: { type: 'internal' | 'outsource'; id: string } | null; remark: string;
};
type PeriodTarget = { periodId: string; expectedPeriodVersion: number };
type AllocationTarget = PeriodTarget & { allocationId: string; expectedVersion: number; reason: string };
export type ClosingIntent =
  | { action: 'create_period'; month: string; taxRatePercent: string; taxRateConfirmed: true; remark: string }
  | (PeriodTarget & { action: 'create_allocation'; orderId: string; data: ClosingAllocationData })
  | (AllocationTarget & { action: 'update_allocation'; data: ClosingAllocationData })
  | (AllocationTarget & { action: 'review_allocation' | 'void_allocation' })
  | (PeriodTarget & { action: 'confirm_period' | 'unconfirm_period' | 'lock_period' | 'reopen_period'; reason: string });
export type ClosingCommand = { requestId: string; intent: ClosingIntent; previewHash: string };
export const CLOSING_READ_PERMISSIONS = ['closing.view', 'order.view', 'schedule.view'] as const;
/** Browser-safe contract shared with the Server client; no repository or Node runtime. */
export function closingFail(status: number, code: string): never { throw new HttpError(status, code, code); }
function invalid(): never { return closingFail(400, 'invalid_closing_command'); }
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
  return value as Record<string, unknown>;
}
function exact(raw: Record<string, unknown>, keys: readonly string[]) {
  if (Object.keys(raw).length !== keys.length || keys.some(key => !Object.hasOwn(raw, key))) invalid();
}
export function closingUuid(value: unknown) {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)) invalid();
  return value.toLowerCase();
}
function version(value: unknown) {
  if (!Number.isSafeInteger(value) || Number(value) < 1 || Number(value) >= 2147483647) invalid();
  return value as number;
}
function text(value: unknown, required = false) {
  if (typeof value !== 'string' || value.length > 2000 || value.includes('\0')
    || new TextDecoder('utf-8', { ignoreBOM: true }).decode(new TextEncoder().encode(value)) !== value || required && !value.trim()) invalid();
  return value.trim();
}
export function closingQuantity(value: unknown) {
  if (typeof value !== 'string' || !/^\d{1,12}(?:\.\d{1,6})?$/u.test(value) || !/[1-9]/u.test(value)) invalid();
  return canonicalDecimal(value);
}
export function closingTaxRate(value: unknown) {
  if (typeof value !== 'string' || !/^\d{1,3}(?:\.\d{1,6})?$/u.test(value)) invalid();
  const normalized = canonicalDecimal(value);
  if (compareDecimals(normalized, '100') > 0) invalid();
  return normalized;
}
export function closingChannels(value: unknown): ClosingChannels {
  const raw = object(value); exact(raw, ['sales', 'work']);
  if (typeof raw.sales !== 'boolean' || typeof raw.work !== 'boolean' || !raw.sales && !raw.work) invalid();
  return { sales: raw.sales, work: raw.work };
}
function allocationData(value: unknown): ClosingAllocationData {
  const raw = object(value); exact(raw, ['quantity', 'colorId', 'channels', 'assignmentId', 'executor', 'remark']);
  let executor: ClosingAllocationData['executor'] = null;
  if (raw.executor !== null) {
    const row = object(raw.executor); exact(row, ['type', 'id']);
    if (row.type !== 'internal' && row.type !== 'outsource') invalid();
    executor = { type: row.type, id: closingUuid(row.id) };
  }
  if (raw.assignmentId !== null && executor !== null) invalid();
  return { quantity: closingQuantity(raw.quantity), colorId: raw.colorId === null ? null : closingUuid(raw.colorId), channels: closingChannels(raw.channels),
    assignmentId: raw.assignmentId === null ? null : closingUuid(raw.assignmentId), executor, remark: text(raw.remark) };
}
export function parseClosingIntent(value: unknown): ClosingIntent {
  const raw = object(value);
  if (raw.action === 'create_period') {
    exact(raw, ['action', 'month', 'taxRatePercent', 'taxRateConfirmed', 'remark']);
    if (typeof raw.month !== 'string' || !/^(?:19|20|21)\d{2}-(?:0[1-9]|1[0-2])$/u.test(raw.month) || raw.taxRateConfirmed !== true) invalid();
    return { action: raw.action, month: raw.month, taxRatePercent: closingTaxRate(raw.taxRatePercent), taxRateConfirmed: true, remark: text(raw.remark) };
  }
  if (raw.action === 'create_allocation') {
    exact(raw, ['action', 'periodId', 'expectedPeriodVersion', 'orderId', 'data']);
    return { action: raw.action, periodId: closingUuid(raw.periodId), expectedPeriodVersion: version(raw.expectedPeriodVersion), orderId: closingUuid(raw.orderId), data: allocationData(raw.data) };
  }
  if (raw.action === 'update_allocation' || raw.action === 'review_allocation' || raw.action === 'void_allocation') {
    exact(raw, ['action', 'periodId', 'expectedPeriodVersion', 'allocationId', 'expectedVersion', 'reason', ...(raw.action === 'update_allocation' ? ['data'] : [])]);
    const common = { periodId: closingUuid(raw.periodId), expectedPeriodVersion: version(raw.expectedPeriodVersion), allocationId: closingUuid(raw.allocationId),
      expectedVersion: version(raw.expectedVersion), reason: text(raw.reason, true) };
    return raw.action === 'update_allocation' ? { action: raw.action, ...common, data: allocationData(raw.data) } : { action: raw.action, ...common };
  }
  if (raw.action === 'confirm_period' || raw.action === 'unconfirm_period' || raw.action === 'lock_period' || raw.action === 'reopen_period') {
    exact(raw, ['action', 'periodId', 'expectedPeriodVersion', 'reason']);
    return { action: raw.action, periodId: closingUuid(raw.periodId), expectedPeriodVersion: version(raw.expectedPeriodVersion), reason: text(raw.reason, raw.action === 'unconfirm_period' || raw.action === 'reopen_period') };
  }
  return invalid();
}
export function parseClosingCommand(value: unknown): ClosingCommand {
  const raw = object(value); exact(raw, ['requestId', 'intent', 'previewHash']);
  if (typeof raw.previewHash !== 'string' || !/^[a-f0-9]{64}$/u.test(raw.previewHash)) invalid();
  return { requestId: closingUuid(raw.requestId), intent: parseClosingIntent(raw.intent), previewHash: raw.previewHash };
}
export function closingActionPermission(intent: ClosingIntent): PermissionKey {
  if (intent.action === 'confirm_period' || intent.action === 'unconfirm_period') return 'closing.confirm';
  if (intent.action === 'lock_period') return 'closing.lock';
  if (intent.action === 'reopen_period') return 'closing.reopen';
  return 'closing.edit';
}
export function closingChannelPermissions(...channels: ClosingChannels[]): PermissionKey[] {
  return [...(channels.some(x => x.sales) ? ['commercial.sale.view' as const] : []), ...(channels.some(x => x.work) ? ['commercial.labor.view' as const] : [])];
}

function parts(value: string) {
  if (!/^\d+(?:\.\d+)?$/u.test(value) || value.length > 2000) closingFail(503, 'closing_decimal_invalid');
  const [whole, fraction = ''] = value.split('.'); return { numerator: BigInt(whole + fraction), denominator: BigInt(10) ** BigInt(fraction.length) };
}
export function compareDecimals(a: string, b: string) {
  const x = parts(a), y = parts(b), left = x.numerator * y.denominator, right = y.numerator * x.denominator;
  return left < right ? -1 : left > right ? 1 : 0;
}
export type ExactClosingAmount = { numerator: string; denominator: string; decimal: string; scale: 6; rounding: 'half_up' };
function gcd(a: bigint, b: bigint): bigint { while (b) { const next = a % b; a = b; b = next; } return a; }
function exactAmount(numerator: bigint, denominator: bigint): ExactClosingAmount {
  const factor = gcd(numerator, denominator); numerator /= factor; denominator /= factor;
  const scaled = numerator * BigInt(1000000), rounded = scaled / denominator + (scaled % denominator * BigInt(2) >= denominator ? BigInt(1) : BigInt(0));
  const digits = rounded.toString().padStart(7, '0');
  return { numerator: numerator.toString(), denominator: denominator.toString(), decimal: canonicalDecimal(digits.slice(0, -6) + '.' + digits.slice(-6)), scale: 6, rounding: 'half_up' };
}
/** Authoritative rational is exact; six-decimal rounding is presentation only. No FX. */
export function closingAmount(quantity: string, price: string, taxRatePercent: string | null): ExactClosingAmount {
  const q = parts(quantity), p = parts(price);
  if (taxRatePercent === null) return exactAmount(q.numerator * p.numerator, q.denominator * p.denominator);
  const tax = parts(taxRatePercent);
  return exactAmount(q.numerator * p.numerator * BigInt(100) * tax.denominator,
    q.denominator * p.denominator * (BigInt(100) * tax.denominator + tax.numerator));
}
export function sumClosingAmounts(values: readonly ExactClosingAmount[]): ExactClosingAmount {
  let n = BigInt(0), d = BigInt(1);
  for (const value of values) {
    const a = BigInt(value.numerator), b = BigInt(value.denominator), factor = gcd(d, b);
    n = n * (b / factor) + a * (d / factor); d *= b / factor;
    const reduce = gcd(n, d); n /= reduce; d /= reduce;
  }
  return exactAmount(n, d);
}
