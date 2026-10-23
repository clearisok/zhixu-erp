import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { HttpError } from '../http/errors.js';
import { parseDeliveryPlanCommand } from './delivery-plan-model.js';
import { deliveryPlanReceipt, prepareDeliveryPlanRequest, readSavedDeliveryPlanResult, stableDeliveryPlanRejection } from './delivery-plan-request.js';

const order = '12345678-abcd-abcd-abcd-123456789abc';
const rowId = '12345678-bcde-bcde-bcde-123456789abc';
const command = () => ({ expectedVersion: 1, upserts: [{ id: rowId, deliveryDate: '2026-12-01', quantity: '1.000000000000000001' }], voidIds: [] as string[] });
test('canonical request owns every nested input before awaiting and normalizes UUID case', () => {
  const original = command(); original.voidIds.push(randomUUID());
  const saved = prepareDeliveryPlanRequest(order.toUpperCase(), original), copy = structuredClone(saved);
  original.upserts[0].quantity = '200'; original.upserts.push({ id: randomUUID(), deliveryDate: '2027-01-01', quantity: '2' });
  original.voidIds[0] = randomUUID();
  assert.deepEqual(saved, copy);
  const { expectedVersion, upserts, voidIds } = copy.command;
  assert.deepEqual(prepareDeliveryPlanRequest(order, { expectedVersion, upserts, voidIds }), saved);
});
test('new and old requests share intent, with distinct explicit and legacy namespaces', () => {
  const legacy = prepareDeliveryPlanRequest(order, command()), id = randomUUID();
  const explicit = prepareDeliveryPlanRequest(order, { ...command(), requestId: id.toUpperCase() });
  assert.equal(explicit.commandHash, legacy.commandHash); assert.deepEqual(explicit.command, legacy.command);
  assert.equal(explicit.requestKey, 'uuid:' + id); assert.equal(legacy.requestKey, 'legacy:' + legacy.commandHash);
  assert.deepEqual(prepareDeliveryPlanRequest(order.toUpperCase(), { ...command(), upserts: [{ ...command().upserts[0], id: rowId.toUpperCase() }] }), legacy);
  assert.equal(deliveryPlanReceipt(legacy).status, 'unknown');
  assert.equal('deliveryPlanSet' in deliveryPlanReceipt(legacy), false);
});
test('case-variant duplicate IDs, source fields, invalid request IDs and more than 100 effects fail closed', () => {
  assert.throws(() => parseDeliveryPlanCommand({ ...command(), voidIds: [rowId.toUpperCase()] }), { code: 'invalid_delivery_plan_command' });
  for (const extra of [{ requestId: null }, { requestId: 'not-uuid' }, { actor: {} }, { salesOrderId: order }, { ownership: 'user_managed' }])
    assert.throws(() => prepareDeliveryPlanRequest(order, { ...command(), ...extra }), { code: 'invalid_delivery_plan_command' });
  assert.throws(() => parseDeliveryPlanCommand({ expectedVersion: 1, upserts: Array.from({ length: 101 }, () => ({ id: null, deliveryDate: '2026-12-01', quantity: '1' })), voidIds: [] }));
});
test('only the exact writer-defined stable errors can become terminal rejections', () => {
  for (const e of [new Error('database fault'), new HttpError(409, 'unknown_conflict', 'untrusted'), new HttpError(500, 'delivery_plan_version_conflict', 'untrusted')])
    assert.equal(stableDeliveryPlanRejection(e), null);
  assert.deepEqual(stableDeliveryPlanRejection(new HttpError(409, 'delivery_plan_version_conflict', 'do not reflect this')),
    { status: 'rejected', error: { status: 409, code: 'delivery_plan_version_conflict', message: 'DeliveryPlan collection version is stale' } });
});
test('receipt validates original actor-scoped intent and never reflects arbitrary stored fields', () => {
  const request = prepareDeliveryPlanRequest(order, command());
  const result = { status: 'applied', operationId: 'operation-' + randomUUID(), deliveryPlanSet: { salesOrderId: order, ownership: 'user_managed', version: 2,
    plans: [{ id: rowId, deliveryDate: '2026-12-01', quantity: '1.000000000000000001', isDerivedDefault: true, voidedAt: null }],
    sourceDeliveryDate: null, sourceQuantity: '0', reconciliation: { dateStatus: 'drift', planDates: ['2026-12-01'], quantityStatus: 'excess' } } };
  const row = { sales_order_id: order, command_hash: request.commandHash, command: request.command, result, outcome: 'applied', audit_log_id: 'operation-log-' + randomUUID() };
  assert.deepEqual(readSavedDeliveryPlanResult(request, row), result);
  assert.throws(() => readSavedDeliveryPlanResult(request, { ...row, command: { ...request.command, expectedVersion: 2 } }), { code: 'delivery_plan_request_conflict' });
  for (const bad of [{ ...result, price: '100' }, { ...result, deliveryPlanSet: { ...result.deliveryPlanSet, sourceMetadata: {} } }, { ...result, operationId: 'raw-user-id' }])
    assert.throws(() => readSavedDeliveryPlanResult(request, { ...row, result: bad }), { status: 503, code: 'delivery_plan_receipt_invalid' });
});
