import assert from 'node:assert/strict';
import test from 'node:test';
import { PERMISSION_KEYS, type PermissionKey } from '../../../permissions/model/permissions';
import { parseClosingIntent, type ClosingCommand, type ClosingIntent } from '../../../../server/closing/contract';
import { projectClosingSnapshot, type ClosingSnapshot } from '../../../../server/closing/snapshot';
import { createClosingController, type ClosingControlState } from '../closing-controller';
import { closingCommandHash, createClosingClient } from '../closing-client';
import { closingPendingKey, readClosingPending, saveClosingPending } from '../closing-pending';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const userId = id(1), periodId = id(2), scope = { userId };
const month = (): ClosingIntent => ({ action: 'create_period', month: '2026-10', taxRatePercent: '13', taxRateConfirmed: true, remark: 'Explicit manual tax' });
const data = () => ({ quantity: '10', colorId: id(5), channels: { sales: true, work: true }, assignmentId: null, executor: null, remark: 'Manual assignment' });
const allocation = (): ClosingIntent => ({ action: 'create_allocation', periodId, expectedPeriodVersion: 2, orderId: id(4), data: data() });
const command = (intent = month()): ClosingCommand => ({ requestId: id(3), intent, previewHash: 'a'.repeat(64) });
const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
const status = (value: ClosingIntent) => value.action === 'confirm_period' ? 'confirmed' : value.action === 'lock_period' ? 'locked' : 'open';
function outcome(c: ClosingCommand) {
  const i = c.intent;
  return { requestId: c.requestId, status: 'applied', periodId: 'periodId' in i ? i.periodId : periodId,
    periodVersion: 'expectedPeriodVersion' in i ? i.expectedPeriodVersion + 1 : 1, periodStatus: status(i),
    ...(i.action.endsWith('_allocation') ? { allocationId: 'allocationId' in i ? i.allocationId : id(6), allocationVersion: 'expectedVersion' in i ? i.expectedVersion + 1 : 1 } : {}), operationId: 'operation-' + id(7) };
}
async function recorded(c: ClosingCommand) { return { state: 'recorded', requestId: c.requestId, commandHash: await closingCommandHash(c), result: outcome(c) }; }
const unknown = (c: ClosingCommand) => ({ state: 'unknown', requestId: c.requestId });
function snapshot(value = data()): ClosingSnapshot {
  return { schemaVersion: 'server-closing-allocation.v1', order: { id: id(4), orderNo: 'SO-SYN', businessType: 'ainuoke_contract' },
    commercial: { id: id(8), version: 1, quoteId: 'q', revisionId: 'r', priceVersionId: 'pv' }, colorId: value.colorId, colorName: 'Blue', assignmentId: value.assignmentId,
    quantity: value.quantity, channels: value.channels, taxRatePercent: '13', prices: { ...(value.channels.sales ? { sale: { price: '113', currency: 'CNY' as const } } : {}), ...(value.channels.work ? { work: { price: '0', currency: 'USD' as const } } : {}) },
    quantityBasis: { order: '100', color: '50', planned: null, completed: null }, executor: null, productionBasis: [], reviewBasis: [], remark: value.remark };
}
function preview(intent: ClosingIntent, permissions: readonly PermissionKey[] = PERMISSION_KEYS) {
  const actor = { internalUserId: '1', userId, username: 'synthetic', userName: 'Synthetic', permissions: [...permissions] };
  return { intent, previewHash: 'a'.repeat(64), period: intent.action === 'create_period' ? null : { id: intent.periodId, month: '2026-10', version: intent.expectedPeriodVersion, status: 'open', taxRatePercent: '13' },
    before: 'allocationId' in intent ? { version: intent.expectedVersion, status: 'active', snapshot: projectClosingSnapshot(snapshot(), actor) } : null,
    after: intent.action.endsWith('_allocation') ? { status: intent.action === 'void_allocation' ? 'voided' : 'active', snapshot: projectClosingSnapshot(snapshot('data' in intent ? intent.data as ReturnType<typeof data> : data()), actor) } : null,
    nextStatus: status(intent), allocationCount: 0, warnings: [], quantityConfirmation: 'manual', productionAndShipments: 'reference_only' };
}
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(yes => { resolve = yes; }); return { promise, resolve }; }
class MemoryStorage {
  values = new Map([['zhixu.erp.local.closing-center', 'KEEP']]); events: string[] = [];
  getItem(key: string) { this.events.push('read'); return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.events.push('write'); this.values.set(key, value); }
  removeItem(key: string) { this.events.push('remove'); this.values.delete(key); }
}
type Controller = ReturnType<typeof createClosingController>;
function rig(context: string | null = null) {
  const storage = new MemoryStorage(), calls: { url: string; init: RequestInit }[] = [], posts: ClosingCommand[] = [], changes: ClosingControlState[] = [], applied: unknown[] = [];
  let currentOwner: object | null = {}, permissions: PermissionKey[] = [...PERMISSION_KEYS], ids = 0, unauthorized = 0;
  const handlers = { post: null as null | ((value: ClosingCommand, signal?: AbortSignal | null) => Promise<Response>),
    receipt: null as null | ((value: ClosingCommand, signal?: AbortSignal | null) => Promise<Response>), preview: null as null | ((value: ClosingIntent) => Promise<Response>) };
  const client = createClosingClient({ visibility: () => ({ sale: permissions.includes('commercial.sale.view'), work: permissions.includes('commercial.labor.view') }), fetchImpl: (async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (String(url).endsWith('/preview')) { const value = JSON.parse(String(init.body)) as ClosingIntent; return handlers.preview ? handlers.preview(value) : response(preview(value, permissions)); }
    if (String(url).endsWith('/commands')) {
      const value = JSON.parse(String(init.body)) as ClosingCommand; assert.deepEqual(readClosingPending(storage, scope), value, 'exact original must be durable before POST');
      storage.events.push('POST'); posts.push(structuredClone(value)); return handlers.post ? handlers.post(value, init.signal) : response({ ...outcome(value), replayed: false });
    }
    assert.equal(init.method, 'GET'); storage.events.push('GET'); const value = posts.at(-1) ?? readClosingPending(storage, scope) ?? command();
    return handlers.receipt ? handlers.receipt(value, init.signal) : response(await recorded(value));
  }) as typeof fetch });
  function make(extra: Partial<Parameters<typeof createClosingController>[0]> = {}) {
    return createClosingController({ userId, periodId: context, owner: currentOwner!, currentOwner: () => currentOwner, permissions: () => permissions,
      storage: () => storage, client, requestId: () => { ids++; return id(3); }, onChange: value => changes.push(value),
      onUnauthorized: () => { unauthorized++; }, onApplied: value => applied.push(value), ...extra });
  }
  return { storage, calls, posts, changes, applied, handlers, make, ids: () => ids, unauthorized: () => unauthorized,
    setOwner(value: object | null) { currentOwner = value; }, setPermissions(value: readonly PermissionKey[]) { permissions = [...value]; } };
}
async function ready(c: Controller, intent = month()) { await c.preview(intent); assert.equal(c.snapshot().stage, 'preview'); }

test('durable original precedes POST; only exact GET terminal releases it, with detached state and callbacks', async () => {
  const r = rig(), c = r.make({ onApplied(value) { value.periodVersion = 99; } }); assert.equal(r.calls.length, 0); await ready(c);
  const state = c.snapshot(); state.preview!.intent = month(); if (state.preview!.intent.action === 'create_period') state.preview!.intent.remark = 'Mutated caller state';
  await c.apply(); assert.deepEqual(r.posts, [command()]); assert.equal(r.ids(), 1); assert.equal(c.snapshot().stage, 'saved'); assert.equal(c.snapshot().pending, null);
  assert.equal(c.snapshot().terminal?.result.status, 'applied'); if (c.snapshot().terminal?.result.status === 'applied') assert.equal((c.snapshot().terminal!.result as ReturnType<typeof outcome>).periodVersion, 1);
  assert.equal(c.snapshot().navigationBlocked, false); assert.equal(readClosingPending(r.storage, scope), null);
  const events = r.storage.events; assert.ok(events.indexOf('write') < events.indexOf('POST')); assert.ok(events.indexOf('POST') < events.indexOf('GET')); assert.ok(events.indexOf('GET') < events.indexOf('remove'));
  assert.equal(r.storage.getItem('zhixu.erp.local.closing-center'), 'KEEP');
});

test('storage failures and corrupt/future originals preserve bytes and cannot send or generate replacement commands', async () => {
  for (const mode of ['throw', 'noop', 'corrupt', 'get-throw']) {
    const r = rig(), c = r.make(); await ready(c);
    if (mode === 'throw') r.storage.setItem = () => { throw new Error('quota'); };
    if (mode === 'noop') r.storage.setItem = () => {};
    if (mode === 'corrupt') r.storage.setItem = key => { r.storage.values.set(key, '{broken'); };
    if (mode === 'get-throw') r.storage.getItem = () => { throw new Error('denied'); };
    await c.apply(); assert.equal(r.posts.length, 0, mode); assert.equal(c.snapshot().stage, 'storage-blocked'); assert.equal(c.snapshot().navigationBlocked, true);
    if (mode === 'corrupt') assert.equal(r.storage.values.get(closingPendingKey(scope)), '{broken');
  }
  for (const raw of ['{broken', JSON.stringify({ schemaVersion: 2 }), JSON.stringify({ schemaVersion: 1, extra: true })]) {
    const r = rig(); r.storage.setItem(closingPendingKey(scope), raw); const c = r.make(); await c.preview(month()); await c.apply(); await c.check(); await c.retry(true);
    assert.equal(r.calls.length, 0); assert.equal(r.ids(), 0); assert.equal(r.storage.getItem(closingPendingKey(scope)), raw);
  }
});

test('another-period original blocks new work but can be checked without changing its original scope', async () => {
  const r = rig(id(99)), original = command(allocation()); saveClosingPending(r.storage, scope, original); const c = r.make();
  await c.preview(month()); await c.apply(); assert.equal(r.calls.length, 0); assert.equal(c.snapshot().pending?.intent.action, 'create_allocation');
  await c.check(); assert.equal(c.snapshot().stage, 'saved'); assert.equal(r.posts.length, 0); assert.equal(r.ids(), 0); assert.deepEqual(r.applied, [outcome(original)]);
});

test('lost POST acknowledgement uses one original GET and never automatically sends again', async () => {
  const r = rig(), c = r.make(); r.handlers.post = async () => { throw new Error('Lost after commit'); }; await ready(c); await c.apply();
  assert.equal(r.posts.length, 1); assert.equal(r.calls.filter(x => x.init.method === 'GET').length, 1); assert.equal(c.snapshot().stage, 'saved');
});

test('refresh only restores; explicit unknown check and consent are required for exact original-ID retry', async () => {
  const r = rig(), c = r.make(); r.handlers.post = async () => { throw new Error('lost'); }; r.handlers.receipt = async value => response(unknown(value));
  await ready(c); await c.apply(); const original = structuredClone(r.posts[0]); assert.equal(c.snapshot().retryAllowed, true); c.dispose(); r.setOwner({});
  const next = r.make(), restored = r.calls.length; await next.retry(true); assert.equal(r.calls.length, restored); await next.check(); await next.retry(false); assert.equal(r.posts.length, 1);
  r.handlers.post = null; r.handlers.receipt = null; await next.retry(true); assert.equal(r.posts.length, 2); assert.deepEqual(r.posts[1], original); assert.equal(r.ids(), 1); assert.equal(next.snapshot().stage, 'saved');
});

test('wrong hash, request, period or CAS receipt cannot release pending or enable a retry', async () => {
  for (const patch of [{ commandHash: 'b'.repeat(64) }, { requestId: id(9) }, { result: { ...outcome(command()), periodVersion: 90 } }]) {
    const r = rig(), c = r.make(); r.handlers.receipt = async value => response({ ...await recorded(value), ...patch }); await ready(c); await c.apply(); await c.retry(true);
    assert.equal(r.posts.length, 1); assert.ok(readClosingPending(r.storage, scope)); assert.equal(c.snapshot().retryAllowed, false); assert.equal(r.applied.length, 0);
  }
  const r = rig(periodId), c = r.make(); r.handlers.receipt = async value => response({ ...await recorded(value), result: { ...outcome(value), periodId: id(99) } });
  await ready(c, allocation()); await c.apply(); assert.equal(c.snapshot().retryAllowed, false); assert.ok(readClosingPending(r.storage, scope)); assert.equal(r.applied.length, 0);
});

test('ABA owner changes suppress late responses and do not consume another actor slot', async () => {
  const r = rig(), wait = deferred<Response>(), entered = deferred<void>(), c = r.make(); r.handlers.post = async () => { entered.resolve(); return wait.promise; };
  await ready(c); const work = c.apply(); await entered.promise; const changes = r.changes.length; r.setOwner({}); r.setOwner({}); wait.resolve(response({ ...outcome(command()), replayed: false })); await work;
  assert.equal(c.snapshot().stage, 'inactive'); assert.equal(r.changes.length, changes); assert.equal(r.applied.length, 0); assert.ok(readClosingPending(r.storage, scope));
  const other = r.make({ userId: id(99) }); await other.check(); assert.equal(other.snapshot().pending, null); assert.ok(readClosingPending(r.storage, scope));
  const next = r.make(); await next.check(); assert.equal(next.snapshot().stage, 'saved'); assert.equal(r.posts.length, 1);
});

test('each action requires its own domain permission; edit does not grant confirm, lock or reopen', async () => {
  for (const [action, permission] of [['confirm_period', 'closing.confirm'], ['unconfirm_period', 'closing.confirm'], ['lock_period', 'closing.lock'], ['reopen_period', 'closing.reopen']] as const) {
    const r = rig(periodId), c = r.make(); r.setPermissions(PERMISSION_KEYS.filter(key => key !== permission));
    await c.preview({ action, periodId, expectedPeriodVersion: 1, reason: 'Explicit' }); await c.apply(); assert.equal(r.calls.length, 0); assert.equal(r.ids(), 0);
    r.setPermissions(PERMISSION_KEYS); await ready(c, parseClosingIntent({ action, periodId, expectedPeriodVersion: 1, reason: 'Explicit' }));
    r.setPermissions(PERMISSION_KEYS.filter(key => key !== permission)); await c.apply(); assert.equal(r.posts.length, 0); assert.equal(c.snapshot().preview, null);
  }
});

test('write revocation after durable save keeps read-only receipt checks; read revocation hides all state', async () => {
  const r = rig(), c = r.make({ onChange(value) { if (value.pending) r.setPermissions(PERMISSION_KEYS.filter(key => key !== 'closing.edit')); } });
  await ready(c); await c.apply(); assert.equal(r.posts.length, 0); assert.ok(c.snapshot().pending); await c.check(); assert.equal(c.snapshot().stage, 'saved');
  const r2 = rig(), wait = deferred<Response>(), entered = deferred<void>(), c2 = r2.make(); r2.handlers.receipt = async () => { entered.resolve(); return wait.promise; };
  await ready(c2); const work = c2.apply(); await entered.promise; r2.setPermissions(PERMISSION_KEYS.filter(key => key !== 'schedule.view')); wait.resolve(response(await recorded(command()))); await work;
  assert.equal(c2.snapshot().stage, 'inactive'); assert.equal(c2.snapshot().pending, null); assert.ok(readClosingPending(r2.storage, scope)); assert.equal(r2.applied.length, 0);
});

test('amount visibility changes hide an old priced preview and block its application or late publication', async () => {
  const r = rig(periodId), c = r.make(); await ready(c, allocation()); assert.ok(JSON.stringify(c.snapshot()).includes('113'));
  r.setPermissions(PERMISSION_KEYS.filter(key => key !== 'commercial.sale.view')); assert.equal(c.snapshot().preview, null); assert.ok(!JSON.stringify(c.snapshot()).includes('113'));
  await c.apply(); assert.equal(r.posts.length, 0); assert.equal(r.ids(), 0);
  const r2 = rig(periodId), wait = deferred<Response>(), entered = deferred<void>(), c2 = r2.make();
  r2.handlers.preview = async value => { entered.resolve(); return wait.promise.then(() => response(preview(value))); };
  const work = c2.preview(allocation()); await entered.promise; r2.setPermissions(PERMISSION_KEYS.filter(key => key !== 'commercial.labor.view')); wait.resolve(response({})); await work;
  assert.equal(c2.snapshot().preview, null); assert.equal(r2.posts.length, 0);
});

test('new allocation channel permissions stay independent, including a confirmed zero USD work-only output', async () => {
  for (const permission of ['commercial.sale.view', 'commercial.labor.view'] as const) {
    const r = rig(periodId), c = r.make(); r.setPermissions(PERMISSION_KEYS.filter(key => key !== permission));
    await c.preview(allocation()); await c.apply(); assert.equal(r.calls.length, 0); assert.equal(r.ids(), 0);
  }
  const r = rig(periodId), c = r.make(), intent = allocation(); assert.ok('data' in intent); intent.data.channels = { sales: false, work: true };
  r.setPermissions(PERMISSION_KEYS.filter(key => key !== 'commercial.sale.view')); await ready(c, intent); assert.ok(!JSON.stringify(c.snapshot()).includes('113'));
  await c.apply(); assert.equal(c.snapshot().stage, 'saved'); assert.deepEqual(r.posts[0].intent, intent);
});

test('double clicks are serialized; a competing valid original is never overwritten', async () => {
  const r = rig(), wait = deferred<Response>(), entered = deferred<void>(), c = r.make(); r.handlers.post = async () => { entered.resolve(); return wait.promise; }; await ready(c);
  const work = c.apply(); await entered.promise; await c.apply(); await c.check(); await c.retry(true); await c.preview(month()); assert.equal(r.posts.length, 1); assert.equal(r.ids(), 1);
  wait.resolve(response({ ...outcome(command()), replayed: false })); await work;
  const fresh = r.make(); await ready(fresh); const competing = { ...command(), requestId: id(90) }; saveClosingPending(r.storage, scope, competing); const raw = r.storage.getItem(closingPendingKey(scope)); await fresh.apply();
  assert.equal(r.posts.length, 1); assert.equal(r.storage.getItem(closingPendingKey(scope)), raw); assert.equal(fresh.snapshot().pending?.requestId, id(90)); assert.equal(fresh.snapshot().stage, 'storage-blocked');
});

test('only exact recorded rejection releases the original; failed acknowledgement remains read-only recoverable', async () => {
  const r = rig(), c = r.make(); r.handlers.receipt = async value => response({ ...await recorded(value), result: { requestId: value.requestId, status: 'rejected', error: { status: 409, code: 'closing_preview_changed' } } });
  await ready(c); await c.apply(); assert.equal(c.snapshot().stage, 'rejected'); assert.equal(readClosingPending(r.storage, scope), null); assert.equal(r.applied.length, 0);
  const r2 = rig(), c2 = r2.make(), remove = r2.storage.removeItem.bind(r2.storage); r2.storage.removeItem = () => { throw new Error('denied'); }; await ready(c2); await c2.apply();
  assert.equal(c2.snapshot().stage, 'storage-blocked'); assert.equal(c2.snapshot().terminal?.state, 'recorded'); assert.ok(c2.snapshot().pending); await c2.retry(true); assert.equal(r2.posts.length, 1);
  r2.storage.removeItem = remove; await c2.check(); assert.equal(c2.snapshot().stage, 'saved'); assert.equal(r2.applied.length, 1);
});

test('missing or changed originals after unknown cannot be recreated or replaced by retry', async () => {
  for (const mode of ['missing', 'changed']) {
    const r = rig(), c = r.make(); r.handlers.receipt = async value => response(unknown(value)); await ready(c); await c.apply();
    r.storage.values.delete(closingPendingKey(scope)); if (mode === 'changed') saveClosingPending(r.storage, scope, { ...command(), requestId: id(99) }); const raw = r.storage.getItem(closingPendingKey(scope));
    await c.retry(true); assert.equal(r.posts.length, 1); assert.equal(c.snapshot().stage, 'storage-blocked'); assert.equal(r.storage.getItem(closingPendingKey(scope)), raw);
  }
});

test('timeout and disposal cancel the lease even if transport ignores abort, preserving the durable original', async () => {
  for (const mode of ['timeout', 'dispose']) {
    const r = rig(), wait = deferred<Response>(), entered = deferred<void>(), c = r.make({ timeoutMs: mode === 'timeout' ? 50 : 60000 }); let signal: AbortSignal | null | undefined;
    r.handlers.receipt = async (_c, s) => { signal = s; entered.resolve(); return wait.promise; }; await ready(c); const work = c.apply(); await entered.promise; if (mode === 'dispose') c.dispose(); await work;
    assert.equal(signal?.aborted, true); assert.ok(readClosingPending(r.storage, scope)); const changes = r.changes.length; wait.resolve(response(await recorded(command()))); await new Promise(resolve => setTimeout(resolve, 5));
    assert.equal(r.changes.length, changes); assert.equal(r.applied.length, 0); assert.equal(c.snapshot().busy, false); assert.ok(readClosingPending(r.storage, scope));
    r.setOwner({}); r.handlers.receipt = null; const next = r.make(); await next.check(); assert.equal(next.snapshot().stage, 'saved'); assert.equal(r.posts.length, 1);
  }
});

test('unauthorized submission preserves pending; broken callbacks cannot alter durable state', async () => {
  const r = rig(), c = r.make({ onChange() { throw new Error('render'); }, onUnauthorized() { throw new Error('logout'); } });
  r.handlers.post = async () => response({ error: { code: 'authentication_required' } }, 401); await ready(c); await c.apply(); assert.ok(c.snapshot().pending); assert.equal(c.snapshot().busy, false);
  assert.equal(r.calls.filter(x => x.init.method === 'GET').length, 0); assert.equal(r.applied.length, 0);
  const r2 = rig(), c2 = r2.make({ onApplied() { throw new Error('refresh'); } }); await ready(c2); await c2.apply(); assert.equal(c2.snapshot().stage, 'saved'); assert.equal(readClosingPending(r2.storage, scope), null); assert.ok(c2.snapshot().message.includes('重新读取'));
});

test('new invalid input or wrong period revokes the old preview instead of reusing it', async () => {
  for (const input of [{ ...month(), taxRateConfirmed: false }, { ...month(), taxRatePercent: null }, { ...month(), foreignExchange: '7' }, allocation()]) {
    const r = rig(), c = r.make(); await ready(c); await c.preview(input); await c.apply(); assert.equal(c.snapshot().preview, null); assert.equal(r.posts.length, 0); assert.equal(r.ids(), 0);
  }
  const r = rig(periodId), c = r.make(); await c.preview({ ...allocation(), periodId: id(99) }); assert.equal(r.calls.length, 0);
});

test('publication callbacks cannot apply or log out a replacement owner, including disposal during publish', async () => {
  for (const mode of ['saved', 'unauthorized']) for (const action of ['replace', 'dispose']) {
    const r = rig(), holder: { controller?: Controller } = {}; const c = r.make({ onChange(value) {
      if (mode === 'saved' ? value.stage === 'saved' : Boolean(value.error)) { if (action === 'replace') r.setOwner({}); else holder.controller?.dispose(); }
    } }); holder.controller = c;
    if (mode === 'unauthorized') r.handlers.post = async () => response({ error: { code: 'authentication_required' } }, 401);
    await ready(c); await c.apply(); assert.equal(c.snapshot().stage, 'inactive'); assert.equal(r.applied.length, 0); assert.equal(r.unauthorized(), 0); assert.equal(Boolean(readClosingPending(r.storage, scope)), mode === 'unauthorized');
  }
});

test('busy publication disposal and repeated cleanup never create an unhandled cancellation or command', async () => {
  const unhandled: unknown[] = [], observe = (reason: unknown) => { unhandled.push(reason); }; process.on('unhandledRejection', observe);
  try {
    const r = rig(), holder: { controller?: Controller } = {}, c = r.make({ onChange(value) { if (value.busy) holder.controller?.dispose(); } }); holder.controller = c;
    await c.preview(month()); c.dispose(); await new Promise(resolve => setTimeout(resolve, 5));
    assert.equal(c.snapshot().stage, 'inactive'); assert.equal(r.calls.length, 0); assert.equal(r.ids(), 0); assert.deepEqual(unhandled, []);
  } finally { process.off('unhandledRejection', observe); }
});

test('all nine existing commands keep exact normalized manual input and original action-specific outcomes', async () => {
  const intents: ClosingIntent[] = [month(), allocation(), ...['update_allocation', 'review_allocation', 'void_allocation'].map(action => parseClosingIntent({ action, periodId, expectedPeriodVersion: 2, allocationId: id(6), expectedVersion: 1, reason: 'Explicit', ...(action === 'update_allocation' ? { data: data() } : {}) })),
    ...['confirm_period', 'unconfirm_period', 'lock_period', 'reopen_period'].map(action => parseClosingIntent({ action, periodId, expectedPeriodVersion: 2, reason: 'Explicit' }))];
  for (const intent of intents) { const r = rig(intent.action === 'create_period' ? null : intent.periodId), c = r.make(); await ready(c, intent); await c.apply(); assert.equal(c.snapshot().stage, 'saved', intent.action); assert.deepEqual(r.posts, [command(intent)]); assert.equal(r.applied.length, 1); }
});

test('a mutable preview input cannot change manual quantity or confirmed tax after asynchronous preview starts', async () => {
  const r = rig(), wait = deferred<Response>(), entered = deferred<void>(), input = month(), c = r.make({ onChange(value) { if (value.preview?.intent.action === 'create_period') value.preview.intent.remark = 'Render mutation'; } });
  r.handlers.preview = async value => { entered.resolve(); return wait.promise.then(() => response(preview(value))); }; const work = c.preview(input); await entered.promise;
  if (input.action === 'create_period') input.taxRatePercent = '0'; wait.resolve(response({})); await work; await c.apply(); assert.deepEqual(r.posts, [command()]);
});
