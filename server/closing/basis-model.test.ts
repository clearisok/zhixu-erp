import assert from 'node:assert/strict';
import test from 'node:test';
import { projectClosingPriceBasis, compareClosingExecutionReferences, closingExecutionFingerprint,
  type ClosingCommercialBasis, type ClosingExecutionReference } from './basis-model.js';

const permissions = ['commercial.sale.view', 'commercial.labor.view'] as const;
const colors = [{ id: 'blue', colorName: '蓝', quantity: '40', ambiguous: false }, { id: 'white', colorName: '白', quantity: '60', ambiguous: false }];
function commercial(): ClosingCommercialBasis {
  return { id: 'adopted-v1', version: 1, quoteId: 'quote', revisionId: 'revision', quoteType: 'distribution', scope: 'line_items', lines: [
    { colorId: 'blue', colorName: '蓝', priceVersionId: 'plain', salePrice: '128', laborPrice: '20.125', laborCurrency: 'USD' },
    { colorId: 'white', colorName: '白', priceVersionId: 'printed', salePrice: '138', laborPrice: '25', laborCurrency: 'CNY' },
  ] };
}
const project = (basis: ClosingCommercialBasis | null = commercial()) => projectClosingPriceBasis('ainuoke_contract', colors, basis, permissions);
function reference(): ClosingExecutionReference {
  return { assignmentId: 'assignment', salesOrderId: 'physical-order', assignmentVersion: 1, colorId: 'blue', executionType: 'internal',
    executorId: 'group', resourceSnapshotHash: 'original-resources', plannedQuantity: '40', planStatus: 'planned',
    execution: { version: 1, status: 'completed', completedQuantity: '30.125', actualStartDate: '2026-10-01', actualCompletedDate: '2026-10-11' } };
}
test('each stable color keeps its actual adopted version and independent prices/currencies', () => {
  const rows = project();
  assert.deepEqual(rows.map(row => [row.commercialVersionId, row.priceVersionId, row.garmentSale]), [
    ['adopted-v1', 'plain', { visibility: 'allowed', value: { price: '128', currency: 'CNY' }, requiredCurrency: 'CNY', eligibility: { state: 'eligible', reason: null }, bucket: 'garment_sales_cny' }],
    ['adopted-v1', 'printed', { visibility: 'allowed', value: { price: '138', currency: 'CNY' }, requiredCurrency: 'CNY', eligibility: { state: 'eligible', reason: null }, bucket: 'garment_sales_cny' }],
  ]);
  assert.equal(rows[0].workPrice.visibility, 'allowed');
  if (rows[1].workPrice.visibility !== 'allowed') assert.fail();
  assert.deepEqual(rows[1].workPrice.value, { price: '25', currency: 'CNY' });
  assert.deepEqual(rows[1].workPrice.eligibility, { state: 'blocked', reason: 'usd_labor_version_required' });
});
test('zero is confirmed; null is unknown; no default currency or amount is substituted', () => {
  const basis = commercial(); basis.lines[0].salePrice = '0.000'; basis.lines[0].laborPrice = '0';
  basis.lines[1].salePrice = null; basis.lines[1].laborPrice = null;
  const rows = project(basis);
  if (rows[0].workPrice.visibility !== 'allowed' || rows[0].garmentSale?.visibility !== 'allowed' || rows[1].workPrice.visibility !== 'allowed') assert.fail();
  assert.equal(rows[0].workPrice.value?.price, '0'); assert.equal(rows[0].garmentSale.value?.price, '0');
  assert.equal(rows[0].workPrice.eligibility.state, 'eligible');
  assert.deepEqual(rows[1].workPrice.eligibility, { state: 'blocked', reason: 'labor_price_unconfirmed' });
});
test('processing has only its service/labor bucket, with no garment sale field or duplicate total', () => {
  const basis = commercial(); basis.quoteType = 'processing'; basis.lines = [{ ...basis.lines[0], colorId: null, colorName: null, salePrice: null }];
  const rows = projectClosingPriceBasis('processing', [], basis, permissions);
  assert.equal(rows.length, 1); assert.equal(Object.hasOwn(rows[0], 'garmentSale'), false);
  assert.equal(rows[0].workPrice.bucket, 'processing_service_usd');
  assert.equal(/salePrice|garmentSale|garment_sales|total|cost|fxRate/u.test(JSON.stringify(rows)), false);
});

test('a processing batch confirms only its exact order-wide consumed snapshot', () => {
  const basis = commercial(); basis.quoteType = 'processing'; basis.scope = 'legacy_uniform';
  basis.lines = [{ ...basis.lines[0], colorId: null, colorName: null, salePrice: null, laborPrice: '0' }];
  let row = projectClosingPriceBasis('processing', [], basis, permissions)[0];
  assert.equal(row.scope, 'historical_uniform');
  basis.processingBatchId = 'immutable-consumption';
  row = projectClosingPriceBasis('processing', [], basis, permissions)[0];
  assert.equal(row.scope, 'order_wide'); if (row.workPrice.visibility !== 'allowed') assert.fail();
  assert.equal(row.workPrice.eligibility.state, 'eligible');
  basis.lines[0].laborCurrency = 'CNY';
  row = projectClosingPriceBasis('processing', [], basis, permissions)[0];
  if (row.workPrice.visibility !== 'allowed') assert.fail();
  assert.equal(row.workPrice.eligibility.reason, 'usd_labor_version_required');
  assert.equal(projectClosingPriceBasis('processing', colors, basis, permissions)[0].scope, 'historical_uniform');
});
test('sales and labor grants are independent, including currency/block reasons', () => {
  const basis = commercial();
  const hidden = projectClosingPriceBasis('ainuoke_contract', colors, basis, []);
  for (const row of hidden) { assert.deepEqual(row.garmentSale, { visibility: 'restricted' }); assert.deepEqual(row.workPrice, { visibility: 'restricted' }); }
  assert.equal(/128|138|20\.125|"CNY"|"USD"|usd_labor/u.test(JSON.stringify(hidden)), false);
  const saleOnly = projectClosingPriceBasis('ainuoke_contract', colors, basis, ['commercial.sale.view']);
  assert.equal(saleOnly[0].garmentSale?.visibility, 'allowed'); assert.deepEqual(saleOnly[0].workPrice, { visibility: 'restricted' });
  const laborOnly = projectClosingPriceBasis('ainuoke_contract', colors, basis, ['commercial.labor.view']);
  assert.deepEqual(laborOnly[0].garmentSale, { visibility: 'restricted' }); assert.equal(laborOnly[1].workPrice.visibility, 'allowed');
});
test('missing or historical uniform basis cannot fabricate current color confirmation', () => {
  const missing = project(null); if (missing[0].workPrice.visibility !== 'allowed') assert.fail();
  assert.deepEqual(missing[0].workPrice.eligibility, { state: 'blocked', reason: 'commercial_not_adopted' });
  const basis = commercial(); basis.scope = 'legacy_uniform'; basis.lines = [{ ...basis.lines[0], colorId: null }];
  const rows = project(basis); assert.equal(rows.length, 1); assert.equal(rows[0].colorId, null); assert.equal(rows[0].scope, 'historical_uniform');
  if (rows[0].workPrice.visibility !== 'allowed') assert.fail();
  assert.equal(rows[0].workPrice.eligibility.reason, 'historical_uniform_requires_review');
});
test('new/ambiguous/removed colors remain explicitly blocked rather than taking the first price', () => {
  const basis = commercial(); basis.lines[1].colorId = 'removed';
  const rows = projectClosingPriceBasis('ainuoke_contract', [{ ...colors[0], ambiguous: true }, colors[1]], basis, permissions);
  assert.deepEqual(rows.map(row => row.scope), ['current_color', 'unmatched_color', 'removed_color']);
  assert.deepEqual(rows.map(row => row.workPrice.visibility === 'allowed' ? row.workPrice.eligibility.reason : null),
    ['color_identity_ambiguous', 'color_price_mapping_required', 'removed_color_requires_review']);
});
test('different commercial versions preserve old values and exact large decimals without conversion', () => {
  const old = commercial(), saved = structuredClone(project(old)), next = structuredClone(old);
  next.id = 'adopted-v2'; next.version = 2; next.lines[0].salePrice = '9007199254740993.000000000001';
  const newRows = project(next); if (newRows[0].garmentSale?.visibility !== 'allowed') assert.fail();
  assert.equal(newRows[0].garmentSale.value?.price, '9007199254740993.000000000001'); assert.deepEqual(project(old), saved);
});
test('invalid, duplicate or wrong-business adopted data cannot become eligible', () => {
  const mismatch = commercial(); mismatch.quoteType = 'processing';
  const rows = project(mismatch); if (rows[0].workPrice.visibility !== 'allowed') assert.fail();
  assert.equal(rows[0].workPrice.eligibility.reason, 'commercial_business_type_mismatch');
  for (const value of ['-1', 'NaN', 'Infinity', 'invalid']) { const basis = commercial(); basis.lines[0].laborPrice = value; assert.throws(() => project(basis), { code: 'closing_commercial_basis_invalid' }); }
  const duplicate = commercial(); duplicate.lines.push(duplicate.lines[0]); assert.throws(() => project(duplicate), { code: 'closing_commercial_basis_invalid' });
});
test('unchanged references allow the appropriate next transition only', () => {
  const saved = [reference()];
  assert.equal(compareClosingExecutionReferences(saved, saved, 'open').canConfirm, true);
  assert.equal(compareClosingExecutionReferences(saved, saved, 'open').canLock, false);
  assert.equal(compareClosingExecutionReferences(saved, saved, 'confirmed').canLock, true);
  assert.equal(compareClosingExecutionReferences(saved, saved, 'locked').canConfirm, false);
});
test('completion quantity/date corrections require review for open and confirmed records', () => {
  const before = reference(), after = structuredClone(before); after.execution!.version++; after.execution!.completedQuantity = '29.125'; after.execution!.actualCompletedDate = '2026-10-12';
  for (const state of ['open', 'confirmed'] as const) {
    const result = compareClosingExecutionReferences([before], [after], state);
    assert.equal(result.status, 'review_required'); assert.equal(result.requiresReview, true); assert.equal(result.canConfirm, false); assert.equal(result.canLock, false);
    assert.deepEqual(result.changes[0].reasons, ['execution_version_changed', 'completed_quantity_changed', 'actual_dates_changed']);
  }
});
test('locked snapshots are retained and report later corrections without becoming editable', () => {
  const before = reference(), original = structuredClone(before), after = structuredClone(before); after.execution!.completedQuantity = '31'; after.execution!.version++;
  const result = compareClosingExecutionReferences([before], [after], 'locked');
  assert.equal(result.status, 'locked_snapshot_with_later_changes'); assert.equal(result.requiresReview, false); assert.equal(result.lockedSnapshotPreserved, true);
  assert.equal(result.canLock, false); assert.deepEqual(before, original);
});
test('first execution, removal and cancel-after-output remain reviewable without erasing actuals', () => {
  const current = reference(), before = { ...current, execution: null };
  assert.deepEqual(compareClosingExecutionReferences([before], [current], 'open').changes[0].reasons, ['production_execution_recorded']);
  assert.equal(compareClosingExecutionReferences([current], [], 'open').requiresReview, true);
  const cancelled = { ...current, assignmentVersion: 2, planStatus: 'cancelled' as const };
  assert.equal(compareClosingExecutionReferences([current], [cancelled], 'open').requiresReview, true);
  assert.deepEqual(cancelled.execution, current.execution);
});
test('a later correction returning to the same values still needs version review', () => {
  const before = reference(), after = structuredClone(before); after.execution!.version += 2;
  assert.deepEqual(compareClosingExecutionReferences([before], [after], 'open').changes[0].reasons, ['execution_version_changed']);
});
test('only referenced physical assignments affect drift; no matching across orders', () => {
  const before = reference(), unrelated = { ...reference(), assignmentId: 'unreferenced' };
  assert.equal(compareClosingExecutionReferences([before], [before, unrelated], 'open').status, 'unchanged');
  assert.throws(() => compareClosingExecutionReferences([before], [{ ...before, salesOrderId: 'other-physical' }], 'open'), { code: 'closing_execution_owner_changed' });
  assert.throws(() => closingExecutionFingerprint([before, { ...before }]), { code: 'closing_execution_reference_invalid' });
});
test('execution fingerprint is non-monetary, stable under ordering and changes on actual version', () => {
  const a = reference(), b = { ...reference(), assignmentId: 'second' }, changed = structuredClone(a); changed.execution!.version++;
  assert.equal(closingExecutionFingerprint([a, b]), closingExecutionFingerprint([b, a]));
  assert.notEqual(closingExecutionFingerprint([a]), closingExecutionFingerprint([changed]));
});
