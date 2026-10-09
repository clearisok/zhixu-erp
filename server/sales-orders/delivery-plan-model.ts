import { HttpError } from '../http/errors.js';

export type DeliveryPlanDto = {
  id: string;
  deliveryDate: string | null;
  quantity: string;
  isDerivedDefault: boolean;
  voidedAt: string | null;
};
export type DeliveryPlanSetDto = {
  salesOrderId: string;
  ownership: 'source_derived' | 'user_managed' | 'uninitialized';
  version: number;
  plans: DeliveryPlanDto[];
  sourceDeliveryDate: string | null;
  sourceQuantity: string | null;
  reconciliation: {
    dateStatus: 'no_source_date' | 'matched' | 'drift';
    planDates: string[];
    quantityStatus: 'no_source_quantity' | 'unplanned' | 'short' | 'matched' | 'excess';
  };
};
export type DeliveryPlanCommand = {
  expectedVersion: number;
  upserts: { id: string | null; deliveryDate: string; quantity: string }[];
  voidIds: string[];
};
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function validDeliveryDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.slice(0, 4) === '0000') return false;
  const date = new Date(value + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function parseDeliveryPlanCommand(value: Record<string, unknown>): DeliveryPlanCommand {
  const invalid = () => { throw new HttpError(400, 'invalid_delivery_plan_command', 'Invalid DeliveryPlan command'); };
  if (Object.keys(value).some(key => !['expectedVersion', 'upserts', 'voidIds'].includes(key))
      || !Number.isSafeInteger(value.expectedVersion) || (value.expectedVersion as number) < 0
      || !Array.isArray(value.upserts) || !Array.isArray(value.voidIds)
      || value.upserts.length + value.voidIds.length === 0
      || value.upserts.length + value.voidIds.length > 100) invalid();
  const upserts = (value.upserts as unknown[]).map(row => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return invalid();
    const input = row as Record<string, unknown>;
    if (Object.keys(input).some(key => !['id', 'deliveryDate', 'quantity'].includes(key))
        || !(input.id === null || typeof input.id === 'string' && UUID_PATTERN.test(input.id))
        || !validDeliveryDate(input.deliveryDate) || typeof input.quantity !== 'string'
        || input.quantity.length > 64 || !/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(input.quantity)) return invalid();
    return { id: input.id as string | null, deliveryDate: input.deliveryDate as string, quantity: input.quantity as string };
  });
  const voidIds = value.voidIds as string[];
  if (voidIds.some(id => typeof id !== 'string' || !UUID_PATTERN.test(id))) invalid();
  const ids = [...upserts.flatMap(row => row.id ? [row.id] : []), ...voidIds];
  if (new Set(ids).size !== ids.length) invalid();
  return { expectedVersion: value.expectedVersion as number, upserts, voidIds };
}
