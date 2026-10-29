import test from 'node:test';
import assert from 'node:assert/strict';
import { PERMISSION_KEYS, type PermissionKey } from '../../../permissions/model/permissions';
import { moveMonthQuantities, type ClosingMonthCommand, type ClosingMonthIntent, type ClosingMonthMove } from '../../../../server/closing/month-plan-model';
import { createClosingClient } from '../closing-client';
import { closingMonthCommandHash } from '../closing-month-projection';
import { closingPendingKey } from '../closing-pending';
import { closingMonthPendingKey, createClosingMonthController, readClosingMonthPending, saveClosingMonthPending } from '../closing-month-controller';
const id = (n: number) => '20000000-0000-4000-8000-' + String(n).padStart(12, '0');
const userId = id(1), orderId = id(2), scope = { userId };
const intent = (): ClosingMonthMove => ({ action: 'move_months', orderId, expectedVersion: 1, targetMonth: '2027-12', reason: 'Whole SO including hidden outsourced portions', selection: { mode: 'whole' } });
const original = (): ClosingMonthCommand => ({ requestId: id(3), intent: intent(), previewHash: 'a'.repeat(64) });
const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
function preview(input: ClosingMonthIntent) {
  assert.equal(input.action, 'move_months'); if (input.action !== 'move_months') assert.fail();
  const before = [{ id: id(4), colorId: null, assignmentId: null, month: '2027-11', quantity: '1000' }], next = moveMonthQuantities(before, input, () => id(5));
  return { intent: input, version: 1, before, after: next.lines, touchedMonths: next.touchedMonths, movedQuantity: next.movedQuantity, beforeExecutorBasis: [], executorBasis: [], warnings: [], previewHash: 'a'.repeat(64) };
}
const result = (c: ClosingMonthCommand) => ({ requestId: c.requestId, status: 'applied', orderId: c.intent.orderId, version: c.intent.expectedVersion + 1, versionId: id(6), operationId: 'closing-month:' + userId + ':' + c.requestId });
const receipt = async (c: ClosingMonthCommand) => ({ state: 'recorded', requestId: c.requestId, commandHash: await closingMonthCommandHash(c), result: result(c) });
class MemoryStorage {
  values = new Map([['zhixu.erp.local.closing-center', 'KEEP'], [closingPendingKey(scope), 'UNCHANGED FINANCIAL ORIGINAL']]);
  events: string[] = [];
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.events.push('save'); this.values.set(key, value); }
  removeItem(key: string) { this.events.push('ack'); this.values.delete(key); }
}
function rig() {
  const storage = new MemoryStorage(), posts: ClosingMonthCommand[] = [], calls: string[] = [];
  let owner: object | null = {}, permissions: PermissionKey[] = [...PERMISSION_KEYS], unknown = false, lose = false, held: (() => void) | null = null;
  const client = createClosingClient({ visibility: () => ({ sale: true, work: true }), fetchImpl: (async (url, init) => {
    const path = String(url); calls.push(path);
    if (path.endsWith('/preview')) return response(preview(JSON.parse(String(init!.body))));
    if (path.endsWith('/commands')) {
      const command = JSON.parse(String(init!.body)) as ClosingMonthCommand; assert.deepEqual(readClosingMonthPending(storage, scope), command); storage.events.push('POST'); posts.push(command);
      if (held !== null) await new Promise<void>(resolve => { held = resolve; });
      if (lose) throw Error('Lost result'); return response({ ...result(command), replayed: false });
    }
    storage.events.push('GET'); const c = readClosingMonthPending(storage, scope)!;
    return response(unknown ? { state: 'unknown', requestId: c.requestId } : await receipt(c));
  }) as typeof fetch });
  const make = (extra: Partial<Parameters<typeof createClosingMonthController>[0]> = {}) => createClosingMonthController({ userId, orderId, owner: owner!, currentOwner: () => owner, permissions: () => permissions,
    storage: () => storage, client, requestId: () => id(3), ...extra });
  return { storage, posts, calls, make, owner: (next: object | null) => { owner = next; }, permissions: (next: PermissionKey[]) => { permissions = next; },
    unknown: (next: boolean) => { unknown = next; }, lose: () => { lose = true; }, hold: () => { held = () => undefined; }, release: () => held?.() };
}
test('month command uses the shared durable-before-POST lifecycle; lost acknowledgement resolves by exact original GET', async () => {
  const r = rig(), c = r.make(); assert.equal(r.calls.length, 0); await c.preview(intent()); const p = c.snapshot().preview!; assert('movedQuantity' in p); assert.equal(p.movedQuantity, '1000');
  r.lose(); await c.apply(); assert.equal(r.posts.length, 1); assert.equal(c.snapshot().stage, 'saved'); assert.equal(c.snapshot().pending, null);
  assert.deepEqual(r.storage.events, ['save', 'POST', 'GET', 'ack']); assert.equal(r.storage.getItem(closingPendingKey(scope)), 'UNCHANGED FINANCIAL ORIGINAL');
  assert.equal(r.storage.getItem('zhixu.erp.local.closing-center'), 'KEEP');
});
test('refresh restores only; unknown receipt requires explicit same-original retry and never a replacement ID', async () => {
  const r = rig(); saveClosingMonthPending(r.storage, scope, original()); r.unknown(true); const c = r.make(); assert.equal(c.snapshot().stage, 'pending'); assert.equal(r.calls.length, 0);
  await c.preview(intent()); assert.equal(r.calls.length, 0); await c.check(); assert.equal(c.snapshot().retryAllowed, true); assert.equal(r.posts.length, 0);
  await c.retry(false); assert.equal(r.posts.length, 0); await c.retry(true); assert.deepEqual(r.posts, [original()]); assert.deepEqual(readClosingMonthPending(r.storage, scope), original());
  r.unknown(false); await c.check(); assert.equal(c.snapshot().stage, 'saved'); assert.equal(r.posts.length, 1);
});
test('identity/context changes, permission loss and ignored abort cannot publish old results or discard originals', async () => {
  const r = rig(), c = r.make(); await c.preview(intent()); r.hold(); const pending = c.apply(); await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(r.posts.length, 1); r.owner({}); c.dispose(); r.release(); await pending; assert.equal(c.snapshot().stage, 'inactive'); assert.deepEqual(readClosingMonthPending(r.storage, scope), original());
  const next = r.make(); await next.check(); assert.equal(next.snapshot().stage, 'saved');
  const p = rig(), denied = p.make(); await denied.preview(intent()); p.permissions(PERMISSION_KEYS.filter(key => key !== 'closing.edit')); await denied.apply(); assert.equal(p.posts.length, 0); assert.equal(denied.snapshot().preview, null);
  const wrong = rig(), foreign = wrong.make(); await foreign.preview({ ...intent(), orderId: id(99) }); assert.equal(wrong.calls.length, 0);
});
test('corrupt storage and failed readback prevent submission without overwriting a financial or Browser record', async () => {
  const r = rig(); r.storage.values.set(closingMonthPendingKey(scope), '{bad'); const c = r.make(); assert.equal(c.snapshot().stage, 'storage-blocked'); await c.preview(intent()); assert.equal(r.calls.length, 0); assert.equal(r.storage.getItem(closingMonthPendingKey(scope)), '{bad');
  const w = rig(), writer = w.make(); await writer.preview(intent()); w.storage.setItem = () => undefined; await writer.apply(); assert.equal(w.posts.length, 0); assert.equal(writer.snapshot().pendingUnavailable, true);
});
