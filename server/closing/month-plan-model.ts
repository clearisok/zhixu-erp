import { canonicalDecimal } from '../quotes/decimal-projection.js';
import { closingFail, closingQuantity, closingUuid } from './contract.js';

/** Quantity ownership only. Commercial versions remain the sole price authority. */
export type ClosingMonthLine = { id: string; colorId: string | null; assignmentId: string | null; month: string | null; quantity: string };
export type ClosingMonthMove = {
  action: 'move_months'; orderId: string; expectedVersion: number; targetMonth: string; reason: string;
  selection: { mode: 'whole' } | { mode: 'partial'; items: { lineId: string; quantity: string }[] };
};
export type ClosingMonthReconcile = {
  action: 'match_executors'; orderId: string; expectedVersion: number; reason: string;
  items: { lineId: string; parts: { assignmentId: string | null; quantity: string }[] }[];
};
export type ClosingSourceReconciliation = {
  action: 'reconcile_source'; orderId: string; expectedVersion: number; observedSourceFingerprint: string; reason: string;
  adjustments: { lineId: string; quantity: string }[];
  additions: { colorId: string | null; quantity: string }[];
};
export type ClosingExecutorRelease = {
  action: 'release_executors'; orderId: string; expectedVersion: number; reason: string;
  assignmentIds: string[]; observedExecutorFingerprint: string;
};
export type ClosingMonthIntent = ClosingMonthMove | ClosingMonthReconcile | ClosingSourceReconciliation | ClosingExecutorRelease;
export type ClosingMonthCommand = { requestId: string; intent: ClosingMonthIntent; previewHash: string };
const invalid = (): never => closingFail(400, 'invalid_closing_month_command');
function object(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid();
  const row = value as Record<string, unknown>;
  if (Object.keys(row).length !== keys.length || keys.some(key => !Object.hasOwn(row, key))) return invalid();
  return row;
}
export function closingMonth(value: unknown): string {
  if (typeof value !== 'string' || !/^(?:19|20|21)\d{2}-(?:0[1-9]|1[0-2])$/u.test(value)) return invalid();
  return value;
}
export function monthQuantity(value: unknown, zero = false): string {
  if (zero && typeof value === 'string' && /^\d{1,12}(?:\.\d{1,6})?$/u.test(value) && !/[1-9]/u.test(value)) return '0';
  return closingQuantity(value);
}
export function quantityUnits(value: string): bigint {
  const [whole, fraction = ''] = monthQuantity(value, true).split('.');
  return BigInt(whole) * BigInt(1000000) + BigInt(fraction.padEnd(6, '0'));
}
export function unitsQuantity(value: bigint): string {
  if (value < BigInt(0) || value >= BigInt('1000000000000000000')) return invalid();
  const digits = value.toString().padStart(7, '0');
  return canonicalDecimal(digits.slice(0, -6) + '.' + digits.slice(-6));
}
export function sumMonthQuantities(lines: readonly Pick<ClosingMonthLine, 'quantity'>[]): string {
  return unitsQuantity(lines.reduce((sum, line) => sum + quantityUnits(line.quantity), BigInt(0)));
}
export function parseClosingMonthMove(value: unknown): ClosingMonthMove {
  const row = object(value, ['action', 'orderId', 'expectedVersion', 'targetMonth', 'reason', 'selection']);
  if (row.action !== 'move_months' || !Number.isSafeInteger(row.expectedVersion) || Number(row.expectedVersion) < 1 || Number(row.expectedVersion) >= 2147483647) return invalid();
  if (typeof row.reason !== 'string' || !row.reason.trim() || row.reason.length > 2000 || row.reason.includes('\0')
    || new TextDecoder('utf-8', { ignoreBOM: true }).decode(new TextEncoder().encode(row.reason)) !== row.reason) return invalid();
  const raw = row.selection as { mode?: unknown } | null;
  let selection: ClosingMonthMove['selection'];
  if (raw?.mode === 'whole') { object(raw, ['mode']); selection = { mode: 'whole' }; }
  else {
    const part = object(raw, ['mode', 'items']);
    if (part.mode !== 'partial' || !Array.isArray(part.items) || part.items.length < 1 || part.items.length > 100) return invalid();
    const items = part.items.map(value => { const item = object(value, ['lineId', 'quantity']); return { lineId: closingUuid(item.lineId), quantity: monthQuantity(item.quantity) }; });
    if (new Set(items.map(item => item.lineId)).size !== items.length) return invalid();
    selection = { mode: 'partial', items };
  }
  return { action: 'move_months', orderId: closingUuid(row.orderId), expectedVersion: row.expectedVersion as number,
    targetMonth: closingMonth(row.targetMonth), reason: row.reason.trim(), selection };
}
export function parseClosingMonthCommand(value: unknown): ClosingMonthCommand {
  const row = object(value, ['requestId', 'intent', 'previewHash']);
  if (typeof row.previewHash !== 'string' || !/^[a-f0-9]{64}$/u.test(row.previewHash)) return invalid();
  return { requestId: closingUuid(row.requestId), intent: parseClosingMonthIntent(row.intent), previewHash: row.previewHash };
}
export function parseClosingMonthIntent(value: unknown): ClosingMonthIntent {
  if ((value as { action?: unknown } | null)?.action === 'release_executors') {
    const row = object(value, ['action', 'orderId', 'expectedVersion', 'reason', 'assignmentIds', 'observedExecutorFingerprint']);
    const base = parseClosingMonthMove({ action: 'move_months', orderId: row.orderId, expectedVersion: row.expectedVersion,
      reason: row.reason, targetMonth: '2000-01', selection: { mode: 'whole' } });
    if (!Array.isArray(row.assignmentIds) || !row.assignmentIds.length || row.assignmentIds.length > 500
      || typeof row.observedExecutorFingerprint !== 'string' || !/^[a-f0-9]{64}$/u.test(row.observedExecutorFingerprint)) return invalid();
    const assignmentIds = row.assignmentIds.map(closingUuid).sort();
    if (new Set(assignmentIds).size !== assignmentIds.length) return invalid();
    return { action: 'release_executors', orderId: base.orderId, expectedVersion: base.expectedVersion, reason: base.reason,
      assignmentIds, observedExecutorFingerprint: row.observedExecutorFingerprint };
  }
  if ((value as { action?: unknown } | null)?.action === 'reconcile_source') return parseClosingSourceReconciliation(value);
  if ((value as { action?: unknown } | null)?.action !== 'match_executors') return parseClosingMonthMove(value);
  const row = object(value, ['action', 'orderId', 'expectedVersion', 'reason', 'items']);
  if (!Number.isSafeInteger(row.expectedVersion) || Number(row.expectedVersion) < 1 || Number(row.expectedVersion) >= 2147483647) return invalid();
  // Reuse the exact existing reason/owner/version validation without accepting a caller's month.
  const base = parseClosingMonthMove({ action: 'move_months', orderId: row.orderId, expectedVersion: row.expectedVersion,
    reason: row.reason, targetMonth: '2000-01', selection: { mode: 'whole' } });
  if (!Array.isArray(row.items) || !row.items.length || row.items.length > 100) return invalid();
  const items = row.items.map(value => {
    const item = object(value, ['lineId', 'parts']);
    if (!Array.isArray(item.parts) || !item.parts.length || item.parts.length > 100) return invalid();
    const parts = item.parts.map(value => {
      const part = object(value, ['assignmentId', 'quantity']);
      return { assignmentId: part.assignmentId === null ? null : closingUuid(part.assignmentId), quantity: monthQuantity(part.quantity) };
    });
    if (new Set(parts.map(part => part.assignmentId)).size !== parts.length) return invalid();
    return { lineId: closingUuid(item.lineId), parts };
  });
  if (new Set(items.map(item => item.lineId)).size !== items.length || items.reduce((sum, item) => sum + item.parts.length, 0) > 100) return invalid();
  return { action: 'match_executors', orderId: base.orderId, expectedVersion: base.expectedVersion, reason: base.reason, items };
}

/** Explicitly remove only changed attribution. IDs, quantities, colors and months
 * survive exactly; authoritative service/SQL must prove zero actual output. */
export function releaseMonthExecutors(lines: readonly ClosingMonthLine[], intent: ClosingExecutorRelease) {
  const ids = new Set(intent.assignmentIds), affected = lines.filter(line => line.assignmentId !== null && ids.has(line.assignmentId));
  if (ids.size !== new Set(affected.map(line => line.assignmentId)).size) closingFail(409, 'closing_month_executor_unavailable');
  return { lines: validateMonthLines(lines.map(line => line.assignmentId !== null && ids.has(line.assignmentId) ? { ...line, assignmentId: null } : { ...line }), sumMonthQuantities(lines)),
    releasedQuantity: sumMonthQuantities(affected), touchedMonths: [...new Set(affected.flatMap(line => line.month ? [line.month] : []))].sort() };
}

export function parseClosingSourceReconciliation(value: unknown): ClosingSourceReconciliation {
  const row = object(value, ['action', 'orderId', 'expectedVersion', 'observedSourceFingerprint', 'reason', 'adjustments', 'additions']);
  if (row.action !== 'reconcile_source' || typeof row.observedSourceFingerprint !== 'string' || !/^[a-f0-9]{64}$/u.test(row.observedSourceFingerprint)) return invalid();
  const base = parseClosingMonthMove({ action: 'move_months', orderId: row.orderId, expectedVersion: row.expectedVersion, reason: row.reason, targetMonth: '2000-01', selection: { mode: 'whole' } });
  if (!Array.isArray(row.adjustments) || !Array.isArray(row.additions) || row.adjustments.length + row.additions.length > 100) return invalid();
  const adjustments = row.adjustments.map(value => { const item = object(value, ['lineId', 'quantity']); return { lineId: closingUuid(item.lineId), quantity: monthQuantity(item.quantity, true) }; });
  const additions = row.additions.map(value => { const item = object(value, ['colorId', 'quantity']); return { colorId: item.colorId === null ? null : closingUuid(item.colorId), quantity: monthQuantity(item.quantity) }; });
  if (new Set(adjustments.map(item => item.lineId)).size !== adjustments.length || new Set(additions.map(item => item.colorId)).size !== additions.length) return invalid();
  return { action: 'reconcile_source', orderId: base.orderId, expectedVersion: base.expectedVersion, observedSourceFingerprint: row.observedSourceFingerprint, reason: base.reason, adjustments, additions };
}

/** Only explicitly selected unassigned portions may acquire an actual assignment.
 * No production proportions, month changes, recoloring or reassignment of history. */
export function matchMonthExecutors(lines: readonly ClosingMonthLine[], intent: ClosingMonthReconcile, idForSplit: (seed: string) => string) {
  const items = new Map(intent.items.map(item => [item.lineId, item]));
  for (const item of intent.items) {
    const line = lines.find(line => line.id === item.lineId);
    if (!line) closingFail(409, 'closing_month_line_changed');
    if (line.assignmentId !== null) closingFail(409, 'closing_month_executor_already_matched');
    if (sumMonthQuantities(item.parts) !== line.quantity) closingFail(409, 'closing_month_executor_quantity_mismatch');
    if (item.parts.every(part => part.assignmentId === null)) closingFail(409, 'closing_month_no_change');
  }
  const next = lines.flatMap(line => {
    const item = items.get(line.id);
    if (!item) return [{ ...line }];
    return item.parts.map(part => ({ ...line, assignmentId: part.assignmentId, quantity: part.quantity,
      id: part.assignmentId === null ? line.id : closingUuid(idForSplit(line.id + ':' + part.assignmentId)) }));
  });
  if (next.length > 2000) closingFail(422, 'closing_month_plan_too_large');
  const result = validateMonthLines(next, sumMonthQuantities(lines));
  return { lines: result, touchedMonths: [...new Set(lines.filter(line => items.has(line.id)).flatMap(line => line.month === null ? [] : [line.month]))].sort(),
    matchedQuantity: sumMonthQuantities(intent.items.flatMap(item => item.parts.filter(part => part.assignmentId !== null))) };
}
export function validateMonthLines(value: unknown, quantity: string | null): ClosingMonthLine[] {
  if (!Array.isArray(value) || value.length > 2000) return invalid();
  const lines = value.map(value => {
    const row = object(value, ['id', 'colorId', 'assignmentId', 'month', 'quantity']);
    return { id: closingUuid(row.id), colorId: row.colorId === null ? null : closingUuid(row.colorId),
      assignmentId: row.assignmentId === null ? null : closingUuid(row.assignmentId), month: row.month === null ? null : closingMonth(row.month),
      quantity: monthQuantity(row.quantity) };
  });
  if (new Set(lines.map(line => line.id)).size !== lines.length) return invalid();
  if (quantity === null ? lines.length !== 0 : sumMonthQuantities(lines) !== monthQuantity(quantity, true)) return invalid();
  return lines.sort((a, b) => a.id.localeCompare(b.id));
}
/** No price/production edits. Every removal and addition is part of one result. */
export function moveMonthQuantities(lines: readonly ClosingMonthLine[], intent: ClosingMonthMove, idForSplit: (seed: string) => string) {
  const selected = intent.selection.mode === 'whole' ? new Map(lines.filter(line => line.month !== intent.targetMonth).map(line => [line.id, line.quantity]))
    : new Map(intent.selection.items.map(item => [item.lineId, item.quantity]));
  if (selected.size === 0) closingFail(409, 'closing_month_no_change');
  const byId = new Map(lines.map(line => [line.id, line])), touched = new Set<string>([intent.targetMonth]);
  for (const [id, amount] of selected) {
    const line = byId.get(id);
    if (!line) closingFail(409, 'closing_month_line_changed');
    if (line.month === intent.targetMonth) closingFail(409, 'closing_month_no_change');
    if (quantityUnits(amount) > quantityUnits(line.quantity)) closingFail(409, 'closing_month_quantity_exceeded');
    if (line.month !== null) touched.add(line.month);
  }
  const next: ClosingMonthLine[] = [];
  for (const line of lines) {
    const selectedQuantity = selected.get(line.id);
    if (!selectedQuantity) { next.push({ ...line }); continue; }
    const moved = quantityUnits(selectedQuantity), remaining = quantityUnits(line.quantity) - moved;
    if (remaining > BigInt(0)) next.push({ ...line, quantity: unitsQuantity(remaining) });
    next.push({ ...line, id: remaining > BigInt(0) ? closingUuid(idForSplit(line.id + ':' + intent.targetMonth)) : line.id,
      month: intent.targetMonth, quantity: unitsQuantity(moved) });
  }
  // Only the destination scopes receiving moved quantities may coalesce.
  // Unselected months can contain separately matched, frozen line identities.
  const destinations = new Set([...selected.keys()].map(id => {
    const line = byId.get(id)!;return JSON.stringify([line.colorId,line.assignmentId,intent.targetMonth]);
  }));
  const groups = new Map<string, ClosingMonthLine>(), untouched: ClosingMonthLine[] = [];
  for (const line of next.sort((a, b) => a.id.localeCompare(b.id))) {
    const key = JSON.stringify([line.colorId, line.assignmentId, line.month]);
    if(!destinations.has(key)){untouched.push(line);continue;}
    const prior = groups.get(key);
    if (prior) prior.quantity = unitsQuantity(quantityUnits(prior.quantity) + quantityUnits(line.quantity));
    else groups.set(key, { ...line });
  }
  if (groups.size+untouched.length > 2000) closingFail(422, 'closing_month_plan_too_large');
  const result = validateMonthLines([...untouched,...groups.values()], sumMonthQuantities(lines));
  return { lines: result, touchedMonths: [...touched].sort(), movedQuantity: sumMonthQuantities([...selected.values()].map(quantity => ({ quantity }))) };
}
