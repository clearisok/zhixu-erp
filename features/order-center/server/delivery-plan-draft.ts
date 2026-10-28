import type { DeliveryPlanDto, DeliveryPlanSetDto } from '../../../server/sales-orders/delivery-plan-model';
import { explicitDeliveryPlanCommand, type DeliveryPlanPending } from './delivery-plan-client';

export type DeliveryPlanDraftRow = { editorId: string; id: string | null; deliveryDate: string; quantity: string; voided: boolean };
export type DeliveryPlanChange = { kind: 'add' | 'edit' | 'void'; before: DeliveryPlanDto | null; after: { deliveryDate: string; quantity: string } | null };
export type DeliveryPlanPreview = { pending: DeliveryPlanPending; changes: DeliveryPlanChange[]; activePlans: Pick<DeliveryPlanDto, 'deliveryDate' | 'quantity'>[];
  total: string | null; quantityStatus: DeliveryPlanSetDto['reconciliation']['quantityStatus'] | 'unavailable' };
const fail = (): never => { throw new Error('invalid_delivery_plan_draft'); };
function canonicalQuantity(value: string): string {
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/u.test(value)) return fail();
  const [whole, fraction = ''] = value.split('.'), tail = fraction.replace(/0+$/u, '');
  return whole + (tail ? '.' + tail : '');
}
/** Only a convenience preview has a digit budget; stored facts stay untouched.
 * No rounded number or invented0 is supplied when a historical value exceeds it. */
function totalQuantities(values: string[]): string | null {
  if (values.some(value => value.length > 256)) return null;
  const parts = values.map(value => canonicalQuantity(value).split('.'));
  const scale = parts.reduce((maximum, value) => Math.max(maximum, value[1]?.length ?? 0), 0);
  const total = parts.reduce((sum, [whole, fraction = '']) => sum + BigInt(whole + fraction.padEnd(scale, '0')), BigInt(0));
  const digits = total.toString().padStart(scale + 1, '0');
  return canonicalQuantity(scale ? digits.slice(0, -scale) + '.' + digits.slice(-scale) : digits);
}
function compareQuantities(left: string, right: string): number {
  const [a, af = ''] = canonicalQuantity(left).split('.'), [b, bf = ''] = canonicalQuantity(right).split('.');
  const scale = Math.max(af.length, bf.length), x = BigInt(a + af.padEnd(scale, '0')), y = BigInt(b + bf.padEnd(scale, '0'));
  return x < y ? -1 : x > y ? 1 : 0;
}
export function deliveryPlanDraft(set: DeliveryPlanSetDto): DeliveryPlanDraftRow[] {
  return set.plans.filter(plan => plan.voidedAt === null).map(plan => ({ editorId: plan.id, id: plan.id,
    deliveryDate: plan.deliveryDate ?? '', quantity: plan.quantity, voided: false }));
}

/** Diff against the exact loaded collection. Omitting a row never implies void;
 * unchanged null/zero defaults are not accidentally submitted as manual rows. */
export function previewDeliveryPlanDraft(set: DeliveryPlanSetDto, rows: DeliveryPlanDraftRow[], requestId: string): DeliveryPlanPreview | null {
  const existing = new Map(set.plans.filter(plan => plan.voidedAt === null).map(plan => [plan.id, plan]));
  const seen = new Set<string>(), editorIds = new Set<string>(), changes: DeliveryPlanChange[] = [];
  const upserts: { id: string | null; deliveryDate: string; quantity: string }[] = [], voidIds: string[] = [];
  const activePlans: Pick<DeliveryPlanDto, 'deliveryDate' | 'quantity'>[] = [];
  for (const row of rows) {
    if (!row.editorId || editorIds.has(row.editorId) || typeof row.voided !== 'boolean') return fail(); editorIds.add(row.editorId);
    const before = row.id === null ? null : existing.get(row.id);
    if (row.id !== null && (!before || seen.has(row.id))) return fail();
    if (row.id !== null) seen.add(row.id);
    if (row.voided) {
      if (before) { voidIds.push(before.id); changes.push({ kind: 'void', before: structuredClone(before), after: null }); }
      continue;
    }
    const quantity = canonicalQuantity(row.quantity.trim()), deliveryDate = row.deliveryDate;
    const changed = !before || deliveryDate !== (before.deliveryDate ?? '') || quantity !== canonicalQuantity(before.quantity);
    if (changed) {
      upserts.push({ id: row.id, deliveryDate, quantity });
      changes.push({ kind: before ? 'edit' : 'add', before: before ? structuredClone(before) : null, after: { deliveryDate, quantity } });
      activePlans.push({ deliveryDate, quantity });
    } else activePlans.push({ deliveryDate: before!.deliveryDate, quantity: before!.quantity });
  }
  if (seen.size !== existing.size) return fail();
  if (!changes.length) return null;
  const command = explicitDeliveryPlanCommand({ requestId, expectedVersion: set.version, upserts, voidIds });
  const dated = activePlans.filter(plan => plan.deliveryDate !== null), total = totalQuantities(dated.map(plan => plan.quantity));
  const source = set.sourceQuantity;
  const quantityStatus = source === null ? 'no_source_quantity' : !dated.length ? 'unplanned' : total === null || source.length > 256 ? 'unavailable'
    : compareQuantities(total, source) < 0 ? 'short' : compareQuantities(total, source) > 0 ? 'excess' : 'matched';
  return { pending: { salesOrderId: set.salesOrderId, command }, changes, activePlans, total, quantityStatus };
}
