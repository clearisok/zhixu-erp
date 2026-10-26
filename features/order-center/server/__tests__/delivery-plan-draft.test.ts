import assert from 'node:assert/strict';
import test from 'node:test';
import { deliveryPlanDraft, previewDeliveryPlanDraft } from '../delivery-plan-draft';
import type { DeliveryPlanSetDto } from '../../../../server/sales-orders/delivery-plan-model';

const id = '00000000-0000-4000-8000-000000000001', requestId = '00000000-0000-4000-8000-000000000002';
const planId = '00000000-0000-4000-8000-000000000003';
const set = (): DeliveryPlanSetDto => ({ salesOrderId: id, ownership: 'source_derived', version: 7,
  plans: [{ id: planId, deliveryDate: null, quantity: '0', isDerivedDefault: true, voidedAt: null }],
  sourceDeliveryDate: '2026-11-01', sourceQuantity: '9007199254740993.3',
  reconciliation: { dateStatus: 'drift', planDates: [], quantityStatus: 'unplanned' } });
test('unchanged default null/zero rows do not create an upsert or claim manual ownership', () => {
  const base = set(), before = structuredClone(base), draft = deliveryPlanDraft(base);
  assert.equal(previewDeliveryPlanDraft(base, draft, requestId), null); assert.deepEqual(base, before);
  draft.push({ editorId: 'new1', id: null, deliveryDate: '2026-11-01', quantity: '1', voided: false });
  const preview = previewDeliveryPlanDraft(base, draft, requestId)!;
  assert.equal(preview.pending.command.upserts.length, 1); assert.equal(preview.pending.command.upserts[0].id, null);
  assert.deepEqual(preview.activePlans[0], { deliveryDate: null, quantity: '0' });
});
test('editing a default row still requires a valid date and strictly positive quantity', () => {
  const base = set(), draft = deliveryPlanDraft(base); draft[0].deliveryDate = '2026-11-01';
  assert.throws(() => previewDeliveryPlanDraft(base, draft, requestId));
  draft[0].quantity = '5'; assert.equal(previewDeliveryPlanDraft(base, draft, requestId)?.pending.command.upserts[0].id, planId);
});
test('numeric formatting alone does not submit an intervention; actual changes preserve stable identity', () => {
  const base = set(); base.plans[0] = { ...base.plans[0], deliveryDate: '2026-11-01', quantity: '1.000' };
  const draft = deliveryPlanDraft(base); draft[0].quantity = '1.0';
  assert.equal(previewDeliveryPlanDraft(base, draft, requestId), null);
  draft[0].deliveryDate = '2026-11-02';
  const result = previewDeliveryPlanDraft(base, draft, requestId)!;
  assert.equal(result.changes[0].kind, 'edit'); assert.equal(result.pending.command.upserts[0].id, planId);
  assert.equal(result.pending.command.upserts[0].quantity, '1');
});
test('voiding all active rows is explicit; retained history does not consume the100-change budget', () => {
  const base = set();
  base.plans.push(...Array.from({ length: 251 }, (_, index) => ({ id: `00000000-0000-4000-8000-${(index + 10).toString(16).padStart(12, '0')}`,
    deliveryDate: '2026-01-01', quantity: '2', isDerivedDefault: false, voidedAt: '2026-01-02T00:00:00Z' })));
  const draft = deliveryPlanDraft(base); assert.equal(draft.length, 1); draft[0].voided = true;
  const preview = previewDeliveryPlanDraft(base, draft, requestId)!;
  assert.deepEqual(preview.pending.command.voidIds, [planId]); assert.equal(preview.total, '0'); assert.equal(preview.quantityStatus, 'unplanned');
  assert.equal(base.plans.length, 252); assert.equal(base.plans[0].voidedAt, null);
});
test('removing an unsaved row is not a server void, while omission, duplicate or foreign saved rows are refused', () => {
  const base = set(), draft = deliveryPlanDraft(base);
  draft.push({ editorId: 'new1', id: null, deliveryDate: '', quantity: '', voided: true });
  assert.equal(previewDeliveryPlanDraft(base, draft, requestId), null);
  for (const rows of [[], [draft[0], draft[0]], [{ ...draft[0], id }]]) assert.throws(() => previewDeliveryPlanDraft(base, rows, requestId));
});
test('preview totals and warnings use decimal text beyond IEEE754 and never change contract quantities', () => {
  const base = set(), draft = deliveryPlanDraft(base);
  draft[0] = { ...draft[0], deliveryDate: '2026-11-01', quantity: '9007199254740993.1' };
  draft.push({ editorId: 'new1', id: null, deliveryDate: '2026-11-02', quantity: '0.2', voided: false });
  const preview = previewDeliveryPlanDraft(base, draft, requestId)!;
  assert.equal(preview.total, '9007199254740993.3'); assert.equal(preview.quantityStatus, 'matched');
  draft[1].quantity = '0.3'; assert.equal(previewDeliveryPlanDraft(base, draft, requestId)?.quantityStatus, 'excess');
  assert.equal(base.sourceQuantity, '9007199254740993.3');
});
test('historical oversized display values remain preserved while preview comparison is explicitly unavailable', () => {
  const base = set(); base.plans[0].quantity = '1'.repeat(300);
  const draft = deliveryPlanDraft(base); draft.push({ editorId: 'new1', id: null, deliveryDate: '2026-11-02', quantity: '1', voided: false });
  const preview = previewDeliveryPlanDraft(base, draft, requestId)!;
  assert.equal(preview.activePlans[0].quantity, base.plans[0].quantity);
  // An undated default is not counted, consistently with the Server projection.
  assert.equal(preview.total, '1');
  base.plans[0].deliveryDate = '2026-11-01';
  const next = previewDeliveryPlanDraft(base, deliveryPlanDraft(base).concat(draft[1]), requestId)!;
  assert.equal(next.total, null); assert.equal(next.quantityStatus, 'unavailable');
});
