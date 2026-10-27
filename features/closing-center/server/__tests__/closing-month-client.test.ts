import test from 'node:test';
import assert from 'node:assert/strict';
import { parseClosingYearQuery } from '../../../../server/closing/annual-contract';
import { closingAmount } from '../../../../server/closing/contract';
import { summarizeYearAmounts } from '../../../../server/closing/annual-model';
import { moveMonthQuantities, type ClosingMonthCommand, type ClosingMonthIntent, type ClosingMonthLine } from '../../../../server/closing/month-plan-model';
import { createClosingClient } from '../closing-client';
import { parseClosingYear } from '../closing-year-projection';
import { closingMonthCommandHash, parseClosingMonthPreview, parseClosingMonthReceipt, parseClosingMonthState } from '../closing-month-projection';

const id = (n: number) => '10000000-0000-4000-8000-' + String(n).padStart(12, '0');
const view = { sale: true, work: true }, query = parseClosingYearQuery(new URLSearchParams('year=2027'));
const before: ClosingMonthLine[] = [{ id: id(2), colorId: id(3), assignmentId: null, month: '2027-02', quantity: '10' }, { id: id(4), colorId: id(5), assignmentId: null, month: '2027-12', quantity: '5' }];
const intent = (): Extract<ClosingMonthIntent, { action: 'move_months' }> => ({ action: 'move_months', orderId: id(1), expectedVersion: 1, targetMonth: '2027-03', reason: 'A real partial move', selection: { mode: 'partial', items: [{ lineId: id(2), quantity: '2' }] } });
function preview() { const next = moveMonthQuantities(before, intent(), () => id(9)); return { intent: intent(), version: 1, before, after: next.lines, movedQuantity: next.movedQuantity,
  touchedMonths: next.touchedMonths, beforeExecutorBasis: [], executorBasis: [], warnings: [], previewHash: 'a'.repeat(64) }; }
function monthState() { return { plan: { orderId: id(1), defaultMonth: '2027-02', sourceDeliveryDate: '2027-02-20', versionId: id(10), version: 1, sourceQuantity: '15', quantityState: 'ready',
  sourceFingerprint: 'b'.repeat(64), lines: before, executorBasis: [] }, currentDeliveryDate: '2027-02-20', sourceChanged: false, executorChanges: [], executorWarnings: [], executorCandidates: [], meaning: 'unpriced_quantity_month_plan' }; }
function annual() {
  const amount = { visibility: 'allowed' as const, state: 'known' as const, currency: 'CNY' as const, price: '113', amount: closingAmount('10', '113', '13') };
  const work = { visibility: 'allowed' as const, state: 'known' as const, currency: 'USD' as const, price: '0', amount: closingAmount('10', '0', null) };
  const totals = { garmentSalesCny: summarizeYearAmounts([amount], 'CNY', true), processingUsd: summarizeYearAmounts([work], 'USD', true) };
  return { schemaVersion: 'server-closing-year.v1', readOnly: true, query, months: Array.from({ length: 12 }, (_, i) => ({ month: '2027-' + String(i + 1).padStart(2, '0'), period: i === 1 ? { id: id(11), version: 1, status: 'open', taxRatePercent: '13' } : null,
    basis: 'current_adopted_order_reference', portions: i === 1 ? 1 : 0, ...(i === 1 ? totals : { garmentSalesCny: summarizeYearAmounts([], 'CNY', true), processingUsd: summarizeYearAmounts([], 'USD', true) }) })), totals,
    pendingPortions: 0, pendingNotAssignedToYear: true, productionReference: 'current_cumulative_not_monthly_recognition', orderMetadata: 'current_reference_except_frozen_identity', summaryScope: 'same_filtered_portions_before_pagination', total: 1, offset: 0, limit: 25,
    items: [{ id: id(2), order: { id: id(1), orderNo: 'SO-ONE', businessType: 'ainuoke_contract', styleNo: 'B-1', factoryStyleNo: null, customerName: 'Client', brandName: null, quantity: '10', completedQuantity: '0', deliveryDate: '2027-02-20', productionStatus: 'not_started' },
      month: '2027-02', quantity: '10', colorId: id(3), colorName: 'Blue', executor: null, basis: { kind: 'current_adopted_order_reference', monthVersion: 1, financialVersions: [] }, issues: [], executionReview: null, garmentSale: amount, processing: work }] };
}
test('annual strict projection preserves two dimensions, explicit zero and same filtered totals before pagination', () => {
  const good = annual(); assert.equal(parseClosingYear(good, query, view).items[0].processing.visibility, 'allowed');
  for (const mutate of [
    (x: ReturnType<typeof annual>) => { x.months.pop(); },
    (x: ReturnType<typeof annual>) => { x.months[1].portions = 0; },
    (x: ReturnType<typeof annual>) => { x.items[0].month = '2028-02'; },
    (x: ReturnType<typeof annual>) => { x.items[0].order.id = 'not-an-id'; },
    (x: ReturnType<typeof annual>) => { x.query = { ...query, scope: 'outsource' }; },
    (x: ReturnType<typeof annual>) => { Object.assign(x.items[0].basis, { currentQuotePrice: '113' }); },
    (x: ReturnType<typeof annual>) => { x.months[1].garmentSalesCny = { ...x.months[1].garmentSalesCny, state: 'incomplete' } as typeof x.months[1]['garmentSalesCny']; },
  ]) { const value = structuredClone(good); mutate(value); assert.throws(() => parseClosingYear(value, query, view)); }
  assert.throws(() => parseClosingYear(good, query, { sale: false, work: true }));
  assert.throws(() => parseClosingYear(good, { ...query, scope: 'internal' }, view));
});
test('annual unknown is not zero; blocked subtotal and missing-currency fields cannot masquerade as complete', () => {
  const data = annual(), incomplete = summarizeYearAmounts([{ visibility: 'allowed', currency: 'CNY', state: 'blocked', reason: 'period_tax_required' }], 'CNY', true);
  Object.assign(data.items[0], { garmentSale: { visibility: 'allowed', currency: 'CNY', state: 'blocked', reason: 'period_tax_required' } });
  data.months[1].garmentSalesCny = incomplete; data.totals.garmentSalesCny = incomplete;
  const parsed = parseClosingYear(data, query, view); if (parsed.totals.garmentSalesCny.visibility !== 'allowed') assert.fail();
  assert.equal(parsed.totals.garmentSalesCny.amount, null);
  const falseZero = structuredClone(data); Object.assign(falseZero.totals.garmentSalesCny, { amount: closingAmount('0', '1', null) });
  assert.throws(() => parseClosingYear(falseZero, query, view));
  const hiddenMonth = annual(); hiddenMonth.months[1].garmentSalesCny = incomplete;
  assert.throws(() => parseClosingYear(hiddenMonth, query, view), 'complete year cannot conceal a blocked month');
  const hiddenYear = annual(); hiddenYear.totals.garmentSalesCny = incomplete;
  assert.throws(() => parseClosingYear(hiddenYear, query, view), 'annual blockers must come from the same monthly portion set');
  const wrongSubtotal = annual(), current = wrongSubtotal.totals.garmentSalesCny; if (current.visibility !== 'allowed') assert.fail();
  wrongSubtotal.totals.garmentSalesCny = { ...current, amount: closingAmount('1', '1', null), knownSubtotal: closingAmount('1', '1', null) };
  assert.throws(() => parseClosingYear(wrongSubtotal, query, view), 'exact provided monthly subtotals must reconcile without recalculating price');
});
test('annual frozen rows require exact financial references and separate correction flags from preserved locks', () => {
  const value = annual(); Object.assign(value.months[1], { basis: 'frozen_financial_snapshot', period: { id: id(11), version: 4, status: 'locked', taxRatePercent: '13' } });
  Object.assign(value.items[0], { basis: { kind: 'frozen_financial_snapshot', monthVersion: 1, financialVersions: [{ id: id(31), version: 1, versionId: id(32), channel: 'sales' }, { id: id(33), version: 1, versionId: id(34), channel: 'work' }] },
    executionReview: { requiresReview: false, laterCorrection: false, lockedSnapshotPreserved: true, changes: [] } });
  assert.equal(parseClosingYear(value, query, view).items[0].basis.kind, 'frozen_financial_snapshot');
  const changed = structuredClone(value); Object.assign(changed.items[0], { executionReview: { requiresReview: false, laterCorrection: true, lockedSnapshotPreserved: true, changes: [{ assignmentId: id(35), reasons: ['completed_quantity_changed'] }] } });
  assert.equal(parseClosingYear(changed, query, view).items[0].executionReview!.laterCorrection, true);
  const unanchored = structuredClone(value); unanchored.items[0].basis.financialVersions = []; assert.throws(() => parseClosingYear(unanchored, query, view));
  const mixed = annual(); Object.assign(mixed.months[1], { basis: 'frozen_financial_snapshot', period: { id: id(11), version: 4, status: 'locked', taxRatePercent: '13' } });
  assert.throws(() => parseClosingYear(mixed, query, view), 'frozen monthly header cannot contain current-price detail');
  const falseCorrection = structuredClone(value); Object.assign(falseCorrection.items[0], { executionReview: { requiresReview: true, laterCorrection: false, lockedSnapshotPreserved: true, changes: [] } });
  assert.throws(() => parseClosingYear(falseCorrection, query, view));
});
test('month state and preview reject foreign owners, quantity drift, altered targets and price fields', () => {
  assert.equal(parseClosingMonthState(monthState(), id(1)).plan!.lines.length, 2);
  assert.throws(() => parseClosingMonthState(monthState(), id(99)));
  const bad = monthState(); bad.plan.sourceQuantity = '16'; assert.throws(() => parseClosingMonthState(bad, id(1)));
  const p = preview(), parsed = parseClosingMonthPreview(p, intent()); assert('movedQuantity' in parsed); assert.equal(parsed.movedQuantity, '2');
  const inflated = structuredClone(p); inflated.after[0].quantity = '99'; assert.throws(() => parseClosingMonthPreview(inflated, intent()));
  const wrong = structuredClone(p); wrong.after.find(row => row.month === '2027-03')!.month = '2027-04'; assert.throws(() => parseClosingMonthPreview(wrong, intent()));
  assert.throws(() => parseClosingMonthPreview({ ...p, salePrice: '9' }, intent()));
});
test('month receipt validates the exact original hash, physical SO, version and request-scoped operation', async () => {
  const c: ClosingMonthCommand = { requestId: id(20), intent: intent(), previewHash: 'a'.repeat(64) };
  const receipt = { state: 'recorded', requestId: c.requestId, commandHash: await closingMonthCommandHash(c), result: { requestId: c.requestId, status: 'applied', orderId: id(1), version: 2, versionId: id(21), operationId: 'closing-month:' + id(22) + ':' + c.requestId } };
  assert.equal((await parseClosingMonthReceipt(receipt, c)).state, 'recorded');
  for (const wrong of [{ ...receipt, commandHash: 'b'.repeat(64) }, { ...receipt, result: { ...receipt.result, orderId: id(2) } },
    { ...receipt, result: { ...receipt.result, version: 3 } }, { ...receipt, result: { ...receipt.result, operationId: 'closing-month:' + id(22) + ':' + id(23) } }]) await assert.rejects(() => parseClosingMonthReceipt(wrong, c));
});
test('month and annual transport have bounded session-only reads, strict owner leases and no automatic writes', async () => {
  let live = true, calls = 0; const client = createClosingClient({ visibility: () => view, fetchImpl: (async (_url, init) => { calls++; assert.equal(init?.cache, 'no-store'); assert.equal(init?.credentials, 'include'); live = false; return new Response(JSON.stringify(annual())); }) as typeof fetch });
  await assert.rejects(() => client.year(new URLSearchParams('year=2027'), () => live)); assert.equal(calls, 1);
  await assert.rejects(() => client.year(new URLSearchParams('year=2027&year=2028'), () => true)); assert.equal(calls, 1);
  await assert.rejects(() => client.monthPlan('bad-id', () => true)); assert.equal(calls, 1);
  const lost = createClosingClient({ visibility: () => view, fetchImpl: (async () => { calls++; throw Error('lost'); }) as typeof fetch });
  await assert.rejects(() => lost.monthSubmit({ requestId: id(20), intent: intent(), previewHash: 'a'.repeat(64) }, () => true)); assert.equal(calls, 2);
});
