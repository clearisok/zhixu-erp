import test from 'node:test';
import assert from 'node:assert/strict';
import { closingExecutorAllocation, closingExecutorCandidates, closingExecutorDraft, closingExecutorDraftError } from '../closing-executor-draft';
import type { ClosingMonthDisplayState } from '../closing-month-display-projection';
const id = (n: number) => '40000000-0000-4000-8000-' + String(n).padStart(12, '0');
const blue = id(2), white = id(3), lineId = id(4), internal = id(5), outsourced = id(6);
const code = (expected: string) => (error: unknown) => ((error as { code?: string }).code ?? (error as Error).message) === expected;
function fixture(): ClosingMonthDisplayState {
  const reference = (assignmentId: string, colorId: string | null, executionType: 'internal' | 'outsource' = 'internal') => ({ assignmentId, salesOrderId: id(1),
    assignmentVersion: 2, colorId, executionType, executorId: id(20), resourceSnapshotHash: 'b'.repeat(64), plannedQuantity: '30', planStatus: 'planned' as const, execution: null });
  return { plan: { orderId: id(1), defaultMonth: '2027-01', sourceDeliveryDate: '2027-01-20', versionId: id(8), version: 4,
    sourceQuantity: '100', quantityState: 'ready', sourceFingerprint: 'a'.repeat(64), executorBasis: [],
    lines: [{ id: lineId, colorId: blue, assignmentId: null, month: '2027-02', quantity: '50' }, { id: id(7), colorId: white, assignmentId: null, month: '2027-03', quantity: '50' }] },
    currentDeliveryDate: '2027-01-20', sourceChanged: false, meaning: 'unpriced_quantity_month_plan',
    observedSource: { fingerprint: 'a'.repeat(64), businessType: 'ainuoke_contract', quantity: '100', quantityState: 'ready', colors: [{ id: blue, quantity: '50', ambiguous: false }, { id: white, quantity: '50', ambiguous: false }] },
    executorChanges: [], executorWarnings: [], executorCandidates: [reference(internal, blue), reference(outsourced, blue, 'outsource'), reference(id(9), white), { ...reference(id(10), blue), salesOrderId: id(99) }],
    display: { schemaVersion: 'server-closing-month-display.v1', meaning: 'non_monetary_reference_not_financial_snapshot', colors: [], executors: [],
      periods: [{ month: '2027-02', periodId: id(11), version: 1, status: 'open' }] } };
}
test('executor candidates belong to the physical order and selected color', () => {
  assert.deepEqual(closingExecutorCandidates(fixture(), lineId).map(row => row.assignmentId), [internal, outsourced]);
  assert.deepEqual(closingExecutorCandidates(fixture(), id(88)), []);
});
test('matching conserves exact decimals and explicitly leaves the remainder unassigned', () => {
  const state = fixture(); state.plan!.lines[0].quantity = '0.3'; const before = structuredClone(state);
  const intent = closingExecutorDraft(state, lineId, { [internal]: '0.1', [outsourced]: '0.1' }, ' 明确匹配 ');
  assert.deepEqual(intent.items[0].parts, [{ assignmentId: internal, quantity: '0.1' }, { assignmentId: outsourced, quantity: '0.1' }, { assignmentId: null, quantity: '0.1' }]);
  assert.equal(intent.expectedVersion, 4); assert.equal(intent.reason, '明确匹配'); assert.deepEqual(state, before);
  assert.equal(Object.hasOwn(intent, 'price'), false); assert.equal(Object.hasOwn(intent, 'targetMonth'), false);
});
test('reference plan quantity is not a cap and cancelled plans remain selectable for explicit warnings', () => {
  const state = fixture(); state.executorCandidates[0].planStatus = 'cancelled';
  assert.deepEqual(closingExecutorDraft(state, lineId, { [internal]: '50' }, '参考量只提示').items[0].parts, [{ assignmentId: internal, quantity: '50' }]);
});
test('over-allocation, unknown assignment and an empty actual match are rejected', () => {
  assert.throws(() => closingExecutorAllocation(fixture(), lineId, { [internal]: '50.000001' }), code('closing_month_executor_quantity_mismatch'));
  assert.throws(() => closingExecutorAllocation(fixture(), lineId, { [id(10)]: '1' }), code('closing_month_executor_unavailable'));
  assert.throws(() => closingExecutorDraft(fixture(), lineId, { [internal]: '0' }, '没有新增归属'), code('closing_month_no_change'));
});
test('existing attribution cannot be replaced by this matching draft', () => {
  const state = fixture(); state.plan!.lines[0].assignmentId = internal;
  assert.throws(() => closingExecutorDraft(state, lineId, { [outsourced]: '50' }, '不能覆盖'), code('closing_month_executor_already_matched'));
});
test('confirmed and locked periods block matching even when the quantities conserve', () => {
  for (const status of ['confirmed', 'locked'] as const) {
    const state = fixture(); state.display.periods[0].status = status;
    assert.throws(() => closingExecutorDraft(state, lineId, { [internal]: '50' }, '需先处理期间'), code('closing_month_period_not_open'));
  }
});
test('Source changes or executor drift must be resolved before a new match', () => {
  const source = fixture(); source.sourceChanged = true;
  assert.throws(() => closingExecutorDraft(source, lineId, { [internal]: '10' }, '先复核'), code('closing_month_source_changed'));
  const executor = fixture(); executor.executorChanges = [{ assignmentId: internal, reason: 'attribution_changed' }];
  assert.throws(() => closingExecutorDraft(executor, lineId, { [internal]: '10' }, '先恢复'), code('closing_month_executor_review_required'));
});
test('an uncolored processing portion uses only uncolored candidates', () => {
  const state = fixture(); state.plan!.lines[0].colorId = null; state.executorCandidates[0].colorId = null;
  assert.deepEqual(closingExecutorCandidates(state, lineId).map(row => row.assignmentId), [internal]);
});
test('invalid precision and missing reasons do not create a command or echo arbitrary payloads', () => {
  assert.throws(() => closingExecutorDraft(fixture(), lineId, { [internal]: '1.0000001' }, '小数越界'));
  assert.throws(() => closingExecutorDraft(fixture(), lineId, { [internal]: '1' }, ''), code('invalid_closing_month_command'));
  assert.equal(closingExecutorDraftError(Error('PRIVATE_PAYLOAD')), '暂不能完成匹配，请核对后重新预览。');
});
