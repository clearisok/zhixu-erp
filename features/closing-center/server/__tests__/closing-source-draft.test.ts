import test from 'node:test';
import assert from 'node:assert/strict';
import { closingSourceChanges, closingSourceDraft, closingSourceDraftError } from '../closing-source-draft';
import type { ClosingMonthDisplayState } from '../closing-month-display-projection';
const id = (n: number) => '10000000-0000-4000-8000-' + String(n).padStart(12, '0');
const blue = id(2), white = id(3), green = id(4), frozen = id(5), open = id(6), whiteLine = id(7);
const code = (expected: string) => (error: unknown) => ((error as { code?: string }).code ?? (error as Error).message) === expected;
function fixture(): ClosingMonthDisplayState {
  return { plan: { orderId: id(1), defaultMonth: '2027-01', sourceDeliveryDate: '2027-01-20', versionId: id(8), version: 4,
    sourceQuantity: '100', quantityState: 'ready', sourceFingerprint: '0'.repeat(64), executorBasis: [],
    lines: [{ id: frozen, colorId: blue, assignmentId: null, month: '2027-01', quantity: '20' },
      { id: open, colorId: blue, assignmentId: null, month: '2027-02', quantity: '30' },
      { id: whiteLine, colorId: white, assignmentId: null, month: '2027-02', quantity: '50' }] },
    currentDeliveryDate: '2027-01-20', sourceChanged: true, meaning: 'unpriced_quantity_month_plan',
    observedSource: { fingerprint: 'a'.repeat(64), businessType: 'ainuoke_contract', quantity: '110', quantityState: 'ready',
      colors: [{ id: blue, quantity: '40', ambiguous: false }, { id: white, quantity: '50', ambiguous: false }, { id: green, quantity: '20', ambiguous: false }] },
    executorChanges: [], executorWarnings: [], executorCandidates: [], display: { schemaVersion: 'server-closing-month-display.v1',
      meaning: 'non_monetary_reference_not_financial_snapshot', colors: [], executors: [],
      periods: [{ month: '2027-01', periodId: id(9), version: 1, status: 'locked' }, { month: '2027-02', periodId: id(10), version: 2, status: 'open' }] } };
}
test('the complete order diff proposes only net new pending quantity, never chooses a reduction', () => {
  const state = fixture(), before = structuredClone(state), changes = closingSourceChanges(state);
  assert.deepEqual(changes.additions, [{ colorId: green, quantity: '20' }]);
  assert.equal(changes.colors.find(row => row.colorId === blue)?.delta, '-10');
  assert.throws(() => closingSourceDraft(state, {}, '明确核对'), code('closing_month_source_quantity_mismatch'));
  assert.deepEqual(state, before);
});
test('an explicit open reduction and new color keep the original frozen quantities and exact source fingerprint', () => {
  const state = fixture(), before = structuredClone(state), draft = closingSourceDraft(state, { [open]: '20' }, ' 来源明确变动 ');
  assert.equal(draft.expectedVersion, 4); assert.equal(draft.observedSourceFingerprint, 'a'.repeat(64));
  assert.deepEqual(draft.adjustments, [{ lineId: open, quantity: '20' }]);
  assert.deepEqual(draft.additions, [{ colorId: green, quantity: '20' }]); assert.equal(draft.reason, '来源明确变动');
  assert.deepEqual(state, before); assert.equal(Object.hasOwn(draft, 'price'), false); assert.equal(Object.hasOwn(draft, 'targetMonth'), false);
});
test('a mathematically valid reduction of a frozen portion is still rejected', () => {
  assert.throws(() => closingSourceDraft(fixture(), { [frozen]: '10' }, '不能动冻结片段'), code('closing_month_period_not_open'));
});
test('decimal additions are exact, not floating-point approximations', () => {
  const state = fixture(); state.plan!.lines = [{ id: open, colorId: blue, assignmentId: null, month: '2027-02', quantity: '0.3' }];
  state.plan!.sourceQuantity = '0.3'; state.observedSource.quantity = '0.4'; state.observedSource.colors = [{ id: blue, quantity: '0.4', ambiguous: false }];
  assert.deepEqual(closingSourceDraft(state, {}, '明确小数新增').additions, [{ colorId: blue, quantity: '0.1' }]);
});
test('zero is an explicit removed-color choice and does not rewrite retained lines', () => {
  const state = fixture(); state.observedSource.quantity = '50'; state.observedSource.colors = [{ id: blue, quantity: '50', ambiguous: false }];
  assert.deepEqual(closingSourceDraft(state, { [whiteLine]: '0' }, '明确删除来源已无的颜色').adjustments, [{ lineId: whiteLine, quantity: '0' }]);
});
test('processing uses one uncolored quantity with no garment or material fields', () => {
  const state = fixture(); state.plan!.lines = [{ id: open, colorId: null, assignmentId: null, month: '2027-02', quantity: '10' }];
  state.plan!.sourceQuantity = '10'; state.observedSource = { ...state.observedSource, businessType: 'processing', quantity: '15', colors: [] };
  const draft = closingSourceDraft(state, {}, '加工数量新增'); assert.deepEqual(draft.additions, [{ colorId: null, quantity: '5' }]);
  assert.equal(/price|currency|material/iu.test(JSON.stringify(draft)), false);
});
test('unknown, ambiguous and mismatched source facts cannot be guessed into a draft', () => {
  for (const mutate of [(s: ClosingMonthDisplayState) => { s.observedSource.quantity = null; s.observedSource.quantityState = 'unknown'; },
    (s: ClosingMonthDisplayState) => { s.observedSource.colors[0].ambiguous = true; },
    (s: ClosingMonthDisplayState) => { s.observedSource.colors[0].quantity = '39'; }]) {
    const state = fixture(); mutate(state); assert.throws(() => closingSourceChanges(state));
  }
});
test('unchanged evidence, missing reason and a foreign line are rejected before a preview request', () => {
  const state = fixture(); state.sourceChanged = false;
  assert.throws(() => closingSourceDraft(state, {}, '无需重复'), code('closing_month_source_unchanged'));
  state.sourceChanged = true;
  assert.throws(() => closingSourceDraft(state, { [open]: '20' }, ' '), code('invalid_closing_month_command'));
  assert.throws(() => closingSourceDraft(state, { [id(99)]: '0' }, '错误片段'), code('closing_month_line_changed'));
});
test('temporary preview identities do not collide with legal retained identifiers', () => {
  const state = fixture(); state.plan!.lines[0].id = 'ffffffff-ffff-4fff-8fff-000000000001';
  assert.doesNotThrow(() => closingSourceDraft(state, { [open]: '20' }, '临时身份不覆盖旧片段'));
});
test('draft messages explain the business correction without printing payloads or amounts', () => {
  assert.match(closingSourceDraftError({ code: 'closing_month_source_color_quantity_mismatch' }), /逐颜色/u);
  assert.equal(closingSourceDraftError(Error('private payload and price')), '暂时无法完成复核，请核对数量后重新预览。');
});
