import test from 'node:test';
import assert from 'node:assert/strict';
import { closingMonthDisplayScope, projectClosingMonthDisplay, MONTH_DISPLAY_LIMITS } from './month-display-model.js';
import { planHash } from '../production-scheduling/repository.js';
import type { MonthPlan } from './month-plan-service.js';
import type { ClosingExecutionReference } from './basis-model.js';

const id = (n: number) => '10000000-0000-4000-8000-' + String(n).padStart(12, '0');
const colors = [{ id: id(2), colorName: ' BLUE ', ambiguous: false }, { id: id(3), colorName: 'New green', ambiguous: false }];
const facts = (name: string) => ({ schemaVersion: 'production-resource.v1', executionType: 'internal', group: { kind: 'groups', id: id(9), name,
  remark: 'Do not expose private resource details', phone: 'not-a-real-phone' } });
const old = facts('Recorded group'), current = facts('Current assignment snapshot');
const ref = (value: unknown): ClosingExecutionReference => ({ assignmentId: id(8), salesOrderId: id(1), assignmentVersion: 1, colorId: id(2),
  executionType: 'internal', executorId: id(9), resourceSnapshotHash: planHash(value), plannedQuantity: '50', planStatus: 'planned', execution: null });
const plan: MonthPlan = { orderId: id(1), defaultMonth: '2027-02', sourceDeliveryDate: '2027-02-01', versionId: id(10), version: 2,
  sourceQuantity: '100', quantityState: 'ready', sourceFingerprint: 'a'.repeat(64), executorBasis: [ref(old)],
  lines: [{ id: id(4), colorId: id(2), assignmentId: id(8), month: '2027-12', quantity: '50' }, { id: id(5), colorId: id(6), assignmentId: null, month: null, quantity: '50' }] };
const run = (snapshots = [{ hash: planHash(old), facts: old }, { hash: planHash(current), facts: current }]) => projectClosingMonthDisplay(
  closingMonthDisplayScope(plan, colors, [ref(current)]), colors, [{ id: id(2), name: 'Blue' }, { id: id(6), name: 'Removed white' }], snapshots,
  [{ month: '2027-12', id: id(12), status: 'locked', version: 4 }]);

test('display keeps immutable identity and hash-bound executor labels separate from current Source', () => {
  const result = run();
  assert.deepEqual(result.colors, [{ colorId: id(2), identityName: 'Blue', currentSourceName: ' BLUE ', currentSourceAmbiguous: false },
    { colorId: id(3), identityName: null, currentSourceName: 'New green', currentSourceAmbiguous: false },
    { colorId: id(6), identityName: 'Removed white', currentSourceName: null, currentSourceAmbiguous: null }]);
  assert.deepEqual(result.executors.map(row => row.name).sort(), ['Current assignment snapshot', 'Recorded group']);
  assert.deepEqual(result.periods, [{ month: '2027-02', periodId: null, version: null, status: 'not_created' },
    { month: '2027-12', periodId: id(12), version: 4, status: 'locked' }]);
  assert.equal(JSON.stringify(result).includes('phone'), false); assert.equal(JSON.stringify(result).includes('remark'), false);
  assert.equal(plan.executorBasis[0].resourceSnapshotHash, planHash(old));
});
test('ambiguous current colors and absent snapshot evidence remain unknown, never a first match or current-name substitute', () => {
  const ambiguous = [...colors, { id: id(2), colorName: 'blue', ambiguous: true }];
  const result = projectClosingMonthDisplay(closingMonthDisplayScope(plan, ambiguous, [ref(current)]), ambiguous, [], [], []);
  assert.equal(result.colors.find(row => row.colorId === id(2))?.currentSourceName, null);
  assert.equal(result.colors.find(row => row.colorId === id(2))?.currentSourceAmbiguous, true);
  assert(result.executors.every(row => row.name === null && row.nameEvidence === 'missing_snapshot'));
});
test('corrupt or unrelated names, snapshot hashes and period records fail closed', () => {
  const scope = closingMonthDisplayScope(plan, colors, [ref(current)]);
  const bad = (fn: () => unknown) => assert.throws(fn, (error: unknown) => (error as {code:string}).code === 'closing_month_display_evidence_invalid');
  bad(() => run([{ hash: planHash(old), facts: current }]));
  bad(() => projectClosingMonthDisplay(scope, colors, [{ id: id(99), name: 'Foreign' }], [], []));
  bad(() => projectClosingMonthDisplay(scope, colors, [], [], [{ month: '2027-03', id: id(13), status: 'open', version: 1 }]));
  bad(() => projectClosingMonthDisplay(scope, colors, [], [], [{ month: '2027-12', id: id(13), status: 'open', version: 0 }]));
  const wrong = { ...old, group: { ...old.group, id: id(98) } }, foreignRef = ref(wrong);
  bad(() => projectClosingMonthDisplay(closingMonthDisplayScope(null, [], [foreignRef]), [], [], [{hash:planHash(wrong),facts:wrong}], []));
});
test('display scope is bounded and does not initialize missing plans or invent processing colors', () => {
  assert.deepEqual(projectClosingMonthDisplay(closingMonthDisplayScope(null, [], []), [], [], [], []).periods, []);
  assert.throws(() => closingMonthDisplayScope(null, Array.from({ length: MONTH_DISPLAY_LIMITS.sourceColors + 1 }, (_, n) => ({ id: id(n + 100), colorName: 'Synthetic', ambiguous: false })), []),
    (error: unknown) => (error as {code:string}).code === 'closing_month_display_too_large');
});
