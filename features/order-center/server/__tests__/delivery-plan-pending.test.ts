import assert from 'node:assert/strict';
import test from 'node:test';
import { acknowledgeDeliveryPlanPending, deliveryPlanPendingKey, readDeliveryPlanPending, saveDeliveryPlanPending } from '../delivery-plan-pending';

const scope = { userId: '00000000-0000-4000-8000-000000000001' };
const other = { userId: '00000000-0000-4000-8000-000000000002' };
const pending = () => ({ salesOrderId: '00000000-0000-4000-8000-000000000003', command: {
  requestId: '00000000-0000-4000-8000-000000000004', expectedVersion: 7,
  upserts: [{ id: null, deliveryDate: '2026-11-01', quantity: '1.0001' }], voidIds: [] as string[] } });
class MemoryStorage {
  values = new Map<string, string>([['zhixu.erp.local.quotes', 'KEEP']]);
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}
test('pending is actor/tab scoped and preserves the original body without storing business snapshots', () => {
  const storage = new MemoryStorage(), value = pending();
  saveDeliveryPlanPending(storage, scope, value); value.command.upserts[0].quantity = '2';
  assert.equal(readDeliveryPlanPending(storage, scope)?.command.upserts[0].quantity, '1.0001');
  assert.equal(readDeliveryPlanPending(storage, other), null);
  const raw = storage.getItem(deliveryPlanPendingKey(scope))!;
  for (const field of ['password', 'token', 'price', 'deliveryPlanSet']) assert.ok(!raw.includes(field));
  assert.equal(storage.getItem('zhixu.erp.local.quotes'), 'KEEP');
});
test('an unresolved order cannot be replaced by another request or another order', () => {
  const storage = new MemoryStorage(); saveDeliveryPlanPending(storage, scope, pending());
  const before = storage.getItem(deliveryPlanPendingKey(scope));
  for (const value of [{ ...pending(), salesOrderId: other.userId }, { ...pending(), command: { ...pending().command, requestId: other.userId } },
    { ...pending(), command: { ...pending().command, expectedVersion: 8 } }]) {
    assert.throws(() => saveDeliveryPlanPending(storage, scope, value), /delivery_plan_pending_locked/u);
    assert.equal(storage.getItem(deliveryPlanPendingKey(scope)), before);
  }
  assert.deepEqual(saveDeliveryPlanPending(storage, scope, pending()), pending());
});
test('corrupt/future/extra-key records remain byte-for-byte and block new sends', () => {
  for (const raw of ['{broken', JSON.stringify({ schemaVersion: 2 }), JSON.stringify({ schemaVersion: 1, userId: scope.userId,
    savedAt: new Date().toISOString(), pending: { ...pending(), price: 'PRIVATE' } })]) {
    const storage = new MemoryStorage(); storage.setItem(deliveryPlanPendingKey(scope), raw);
    assert.throws(() => readDeliveryPlanPending(storage, scope)); assert.throws(() => saveDeliveryPlanPending(storage, scope, pending()));
    assert.equal(storage.getItem(deliveryPlanPendingKey(scope)), raw);
  }
});
test('write and readback failures are not replaced by an in-memory promise of recovery', () => {
  const storage = new MemoryStorage(); storage.setItem = () => {};
  assert.throws(() => saveDeliveryPlanPending(storage, scope, pending()), /delivery_plan_pending_unavailable/u);
  const denied = { getItem() { throw new Error('storage denied'); }, setItem() {} };
  assert.throws(() => saveDeliveryPlanPending(denied, scope, pending()));
});
test('only the matching original pending slot may be acknowledged', () => {
  const storage = new MemoryStorage(); saveDeliveryPlanPending(storage, scope, pending()); saveDeliveryPlanPending(storage, other, pending());
  const bad = pending(); bad.command.upserts[0].quantity = '3';
  assert.throws(() => acknowledgeDeliveryPlanPending(storage, scope, bad)); assert.ok(readDeliveryPlanPending(storage, scope));
  acknowledgeDeliveryPlanPending(storage, scope, pending()); assert.equal(readDeliveryPlanPending(storage, scope), null);
  assert.ok(readDeliveryPlanPending(storage, other)); assert.equal(storage.getItem('zhixu.erp.local.quotes'), 'KEEP');
});
