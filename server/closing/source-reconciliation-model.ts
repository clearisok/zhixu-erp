import { closingFail, closingUuid } from './contract.js';
import { monthQuantity, quantityUnits, unitsQuantity, validateMonthLines, type ClosingMonthLine, type ClosingSourceReconciliation } from './month-plan-model.js';

/** Proposed changes to unpriced month ownership, never financial quantities.
 * The current Source basis below is supplied only by the trusted service. */
export type ObservedClosingSource = {
  fingerprint: string; quantity: string | null; quantityState: 'ready' | 'unknown' | 'unsupported';
  businessType: 'ainuoke_contract' | 'processing'; colors: { id: string; quantity: string; ambiguous: boolean }[];
};
type Prior = { sourceQuantity: string | null; quantityState: ObservedClosingSource['quantityState']; lines: ClosingMonthLine[] };
function sourceQuantities(source: ObservedClosingSource) {
  if (source.quantityState !== 'ready') closingFail(409, source.quantityState === 'unknown' ? 'closing_month_quantity_unknown' : 'closing_month_quantity_unrepresentable');
  if (source.quantity === null) closingFail(503, 'closing_month_source_invalid');
  const quantity = monthQuantity(source.quantity, true), expected = new Map<string | null, bigint>();
  if (source.businessType === 'processing') {
    if (source.colors.length) closingFail(503, 'closing_month_source_invalid');
    expected.set(null, quantityUnits(quantity));
  } else {
    if (source.colors.length > 2000 || source.colors.some(color => color.ambiguous) || new Set(source.colors.map(color => color.id)).size !== source.colors.length) closingFail(409, 'closing_month_source_colors_require_review');
    if (!source.colors.length && quantity !== '0') closingFail(409, 'closing_month_source_colors_require_review');
    let total = BigInt(0);
    for (const color of source.colors) {
      if (!/^\d{1,12}(?:\.\d{1,6})?$/u.test(color.quantity)) closingFail(409, 'closing_month_source_colors_require_review');
      closingUuid(color.id); const value = quantityUnits(monthQuantity(color.quantity, true)); expected.set(color.id, value); total += value;
    }
    if (total !== quantityUnits(quantity)) closingFail(409, 'closing_month_source_colors_require_review');
  }
  return { quantity, expected };
}
/** Retained IDs/attributes stay exact; additions are pending and unassigned.
 * No move, recolor, executor inference, price adoption or history overwrite. */
export function reconcileClosingSource(prior: Prior, intent: ClosingSourceReconciliation, source: ObservedClosingSource, idForAddition: (seed: string) => string, frozenMonths: readonly string[] = []) {
  if (source.fingerprint !== intent.observedSourceFingerprint) closingFail(409, 'closing_month_source_preview_changed');
  const old = validateMonthLines(prior.lines, prior.quantityState === 'ready' ? prior.sourceQuantity : null), observed = sourceQuantities(source);
  const adjustments = new Map(intent.adjustments.map(item => [item.lineId, item.quantity])), touchedMonths = new Set<string>();
  for (const item of intent.adjustments) if (!old.some(line => line.id === item.lineId)) closingFail(409, 'closing_month_line_changed');
  const addedColors = new Set(intent.additions.map(item => item.colorId));
  let changed = 0;
  const next = old.flatMap(line => {
    const quantity = adjustments.get(line.id); if (quantity === undefined || quantity === line.quantity) return [{ ...line }];
    if (quantityUnits(quantity) > quantityUnits(line.quantity)) closingFail(409, 'closing_month_source_increase_requires_addition');
    if (addedColors.has(line.colorId)) closingFail(409, 'closing_month_source_scope_replacement_forbidden');
    if (line.month !== null) {
      if (frozenMonths.includes(line.month)) closingFail(409, 'closing_month_period_not_open');
      touchedMonths.add(line.month);
    }
    changed++; return quantity === '0' ? [] : [{ ...line, quantity }];
  });
  for (const addition of intent.additions) next.push({ id: closingUuid(idForAddition(addition.colorId ?? 'uncolored')), colorId: addition.colorId, assignmentId: null, month: null, quantity: addition.quantity });
  if (next.length > 2000) closingFail(422, 'closing_month_plan_too_large');
  if (next.reduce((sum, line) => sum + quantityUnits(line.quantity), BigInt(0)) !== quantityUnits(observed.quantity)) closingFail(409, 'closing_month_source_quantity_mismatch');
  const actual = new Map<string | null, bigint>();
  for (const line of next) actual.set(line.colorId, (actual.get(line.colorId) ?? BigInt(0)) + quantityUnits(line.quantity));
  for (const [color, quantity] of actual) if (!observed.expected.has(color) || observed.expected.get(color) !== quantity) closingFail(409, 'closing_month_source_color_quantity_mismatch');
  for (const [color, quantity] of observed.expected) if ((actual.get(color) ?? BigInt(0)) !== quantity) closingFail(409, 'closing_month_source_color_quantity_mismatch');
  const lines = validateMonthLines(next, observed.quantity), delta = prior.quantityState === 'ready' && prior.sourceQuantity !== null ? quantityUnits(observed.quantity) - quantityUnits(prior.sourceQuantity) : null;
  return { lines, touchedMonths: [...touchedMonths].sort(), changedLines: changed, addedLines: intent.additions.length,
    beforeQuantity: prior.sourceQuantity, sourceQuantity: observed.quantity, sourceFingerprint: source.fingerprint,
    quantityDelta: delta === null ? null : (delta < BigInt(0) ? '-' : '') + unitsQuantity(delta < BigInt(0) ? -delta : delta) };
}
