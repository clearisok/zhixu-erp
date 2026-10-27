import assert from 'node:assert/strict';
import test from 'node:test';
import { reconcileClosingSource, type ObservedClosingSource } from './source-reconciliation-model.js';
import { parseClosingSourceReconciliation, type ClosingMonthLine } from './month-plan-model.js';

const id = (n: number) => '10000000-0000-4000-8000-' + String(n).padStart(12, '0'), blue = id(2), white = id(3), fingerprint = 'a'.repeat(64);
const lines: ClosingMonthLine[] = [{ id: id(4), colorId: blue, assignmentId: id(5), month: '2027-01', quantity: '40' }, { id: id(6), colorId: blue, assignmentId: null, month: '2027-02', quantity: '60' }];
const prior = { sourceQuantity: '100', quantityState: 'ready' as const, lines };
const source = (quantity = '120'): ObservedClosingSource => ({ fingerprint, quantity, quantityState: 'ready', businessType: 'ainuoke_contract', colors: [{ id: blue, quantity, ambiguous: false }] });
const intent = (patch: Record<string, unknown> = {}) => parseClosingSourceReconciliation({ action: 'reconcile_source', orderId: id(1), expectedVersion: 1, observedSourceFingerprint: fingerprint, reason: 'Explicit observed Source reconciliation', adjustments: [], additions: [{ colorId: blue, quantity: '20' }], ...patch });
const code = (value: string) => (error: unknown) => (error as { code: string }).code === value;

test('increased Source quantity needs an explicit pending/unassigned addition and preserves frozen/current lines', () => {
  const before = structuredClone(prior), result = reconcileClosingSource(prior, intent(), source(), () => id(7), ['2027-01']);
  assert.deepEqual(prior, before); assert.deepEqual(result.lines.slice(0, 2), lines);
  assert.deepEqual(result.lines[2], { id: id(7), colorId: blue, assignmentId: null, month: null, quantity: '20' });
  assert.equal(result.sourceQuantity, '120'); assert.equal(result.quantityDelta, '20'); assert.deepEqual(result.touchedMonths, []);
});
test('same total can explicitly acknowledge changed Source evidence without rewriting lines', () => {
  const result = reconcileClosingSource(prior, intent({ additions: [] }), source('100'), () => id(7), ['2027-01', '2027-02']);
  assert.deepEqual(result.lines, lines); assert.equal(result.quantityDelta, '0'); assert.equal(result.changedLines, 0);
});

test('increasing an existing month or executor line cannot bypass pending additions', () => {
  assert.throws(() => reconcileClosingSource(prior, intent({ additions: [], adjustments: [{ lineId: id(6), quantity: '80' }] }), source(), () => id(7)), code('closing_month_source_increase_requires_addition'));
});

test('same-color reduction and addition cannot erase existing month or executor attribution', () => {
  for (const quantity of ['100','120']) assert.throws(() => reconcileClosingSource(prior,
    intent({ adjustments: [{ lineId: id(4), quantity: '0' }], additions: [{ colorId: blue, quantity: quantity === '100' ? '40' : '60' }] }),
    source(quantity), () => id(7)), code('closing_month_source_scope_replacement_forbidden'));
});

test('oversized proposals and unrepresentable Source color precision are safely rejected', () => {
  assert.throws(() => reconcileClosingSource(prior, intent({ additions: [{ colorId: blue, quantity: '999999999999' }] }), source(), () => id(7)), code('closing_month_source_quantity_mismatch'));
  assert.throws(() => reconcileClosingSource(prior, intent(), { ...source(), colors: [{ id: blue, quantity: '120.0000001', ambiguous: false }] }, () => id(7)), code('closing_month_source_colors_require_review'));
});
test('a decrease only affects explicitly selected open portions; completed assignment facts are retained', () => {
  const result = reconcileClosingSource(prior, intent({ additions: [], adjustments: [{ lineId: id(6), quantity: '40' }] }), source('80'), () => id(7), ['2027-01']);
  assert.deepEqual(result.lines[0], lines[0]); assert.deepEqual(result.lines[1], { ...lines[1], quantity: '40' }); assert.equal(result.quantityDelta, '-20'); assert.deepEqual(result.touchedMonths, ['2027-02']);
});
test('changing or removing a confirmed/locked portion is rejected', () => {
  for (const quantity of ['0', '20']) assert.throws(() => reconcileClosingSource(prior, intent({ additions: [], adjustments: [{ lineId: id(4), quantity }, { lineId: id(6), quantity: quantity === '0' ? '60' : '40' }] }), source('60'), () => id(7), ['2027-01']), code('closing_month_period_not_open'));
});
test('zero explicitly removes a current line without deleting historical input', () => {
  const result = reconcileClosingSource(prior, intent({ additions: [], adjustments: [{ lineId: id(6), quantity: '0' }] }), source('40'), () => id(7));
  assert.deepEqual(result.lines, [lines[0]]); assert.equal(prior.lines.length, 2); assert.equal(result.changedLines, 1);
});
test('per-color equality is required even when the total matches', () => {
  assert.throws(() => reconcileClosingSource(prior, intent({ additions: [{ colorId: white, quantity: '20' }] }), source(), () => id(7)), code('closing_month_source_color_quantity_mismatch'));
  const observed = { ...source(), colors: [{ id: blue, quantity: '100', ambiguous: false }, { id: white, quantity: '20', ambiguous: false }] };
  const result = reconcileClosingSource(prior, intent({ additions: [{ colorId: white, quantity: '20' }] }), observed, () => id(7)); assert.equal(result.lines[2].colorId, white);
});
test('source total cannot be invented, omitted, or changed after preview', () => {
  assert.throws(() => reconcileClosingSource(prior, intent({ additions: [] }), source(), () => id(7)), code('closing_month_source_quantity_mismatch'));
  assert.throws(() => reconcileClosingSource(prior, intent(), { ...source(), fingerprint: 'b'.repeat(64) }, () => id(7)), code('closing_month_source_preview_changed'));
});
test('unknown, unsupported, ambiguous and incomplete Source data are never guessed', () => {
  assert.throws(() => reconcileClosingSource(prior, intent(), { ...source(), quantity: null, quantityState: 'unknown' }, () => id(7)), code('closing_month_quantity_unknown'));
  assert.throws(() => reconcileClosingSource(prior, intent(), { ...source(), quantity: '1000000000000', quantityState: 'unsupported' }, () => id(7)), code('closing_month_quantity_unrepresentable'));
  for (const colors of [[], [{ id: blue, quantity: '120', ambiguous: true }], [{ id: blue, quantity: '110', ambiguous: false }], [{ id: blue, quantity: '60', ambiguous: false }, { id: blue, quantity: '60', ambiguous: false }]])
    assert.throws(() => reconcileClosingSource(prior, intent(), { ...source(), colors }, () => id(7)), code('closing_month_source_colors_require_review'));
});
test('processing uses only uncolored current quantity and does not invent sale or work prices', () => {
  const initial = { sourceQuantity: '10', quantityState: 'ready' as const, lines: [{ ...lines[0], colorId: null, assignmentId: null, quantity: '10' }] };
  const observed = { ...source('15'), businessType: 'processing' as const, colors: [] }, command = intent({ additions: [{ colorId: null, quantity: '5' }] });
  const result = reconcileClosingSource(initial, command, observed, () => id(7)); assert.equal(result.quantityDelta, '5'); assert.equal(result.lines[1].month, null); assert.equal(Object.hasOwn(result, 'price'), false);
});
test('formerly unknown quantity stays unknown in the before/delta explanation', () => {
  const result = reconcileClosingSource({ sourceQuantity: null, quantityState: 'unknown', lines: [] }, intent({ additions: [{ colorId: blue, quantity: '120' }] }), source(), () => id(7));
  assert.equal(result.beforeQuantity, null); assert.equal(result.quantityDelta, null); assert.equal(result.lines[0].quantity, '120');
});
test('exact fractional differences do not use floating point or round quantities', () => {
  const initial = { sourceQuantity: '0.000001', quantityState: 'ready' as const, lines: [{ ...lines[0], quantity: '0.000001' }] };
  const result = reconcileClosingSource(initial, intent({ additions: [{ colorId: blue, quantity: '0.000002' }] }), source('0.000003'), () => id(7)); assert.equal(result.quantityDelta, '0.000002');
});
test('strict parser refuses amount, month, executor, recolor and Source override fields', () => {
  const valid = intent();
  for (const patch of [{ price: '1' }, { sourceQuantity: '120' }, { targetMonth: '2027-03' }, { additions: [{ colorId: blue, quantity: '20', assignmentId: id(5) }] }, { additions: [{ colorId: blue, quantity: '20', month: '2027-03' }] }, { adjustments: [{ lineId: id(6), quantity: '60', colorId: white }] }]) assert.throws(() => parseClosingSourceReconciliation({ ...valid, ...patch }), code('invalid_closing_month_command'));
});
test('duplicates, empty reasons, precision and input bounds are rejected', () => {
  for (const patch of [{ reason: ' ' }, { expectedVersion: 0 }, { observedSourceFingerprint: 'A'.repeat(64) }, { adjustments: [{ lineId: id(6), quantity: '40' }, { lineId: id(6), quantity: '40' }] }, { additions: [{ colorId: blue, quantity: '10' }, { colorId: blue, quantity: '10' }] }, { additions: [{ colorId: blue, quantity: '0' }] }, { additions: [{ colorId: blue, quantity: '0.0000001' }] }, { additions: Array.from({ length: 101 }, (_, index) => ({ colorId: id(100 + index), quantity: '1' })) }]) assert.throws(() => intent(patch));
  assert.throws(() => reconcileClosingSource(prior, intent({ adjustments: [{ lineId: id(99), quantity: '0' }] }), source(), () => id(7)), code('closing_month_line_changed'));
  assert.throws(() => reconcileClosingSource(prior, intent(), source(), () => id(4)), code('invalid_closing_month_command'));
});
