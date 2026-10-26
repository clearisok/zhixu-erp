import assert from 'node:assert/strict';
import test from 'node:test';
import { createLaborAdoptionController, type LaborControlState } from '../labor-adoption-controller';
import { createLaborAdoptionClient, laborCommandHash, type LaborPending } from '../labor-adoption-client';
import { laborPendingKey, readLaborPending, saveLaborPending } from '../labor-adoption-pending';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const actor = id(4), quoteId = 'quote-usd';
const intent = () => ({ orderId: id(2), expectedVersion: 4, targetRevisionId: 'r-usd', colorIds: [id(3)] as (string | null)[], productUnchangedConfirmed: true as const, reason: 'Explicit USD confirmation' });
const pending = (): LaborPending => ({ quoteId, command: { requestId: id(1), intent: intent(), previewHash: 'a'.repeat(64) } });
const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
const outcome = (value: LaborPending) => ({ requestId: value.command.requestId, status: 'applied', commercialVersionId: id(6), version: value.command.intent.expectedVersion + 1, operationId: 'operation-' + id(7) });
async function recorded(value: LaborPending) { return { state: 'recorded', requestId: value.command.requestId, orderId: value.command.intent.orderId,
  commandHash: await laborCommandHash(value.command), result: outcome(value) }; }
const unknown = (value: LaborPending) => ({ state: 'unknown', requestId: value.command.requestId });
function preview(value: ReturnType<typeof intent>, quote = quoteId) {
  const lines = value.colorIds.map(colorId => ({ colorId, colorName: colorId ? 'Blue' : null, quantity: colorId ? '5' : null,
    priceVersionId: 'pv-1', priceVersionName: 'Plain', laborPrice: '8', laborCurrency: 'CNY', confirmation: null }));
  return { intent: value, previewHash: 'a'.repeat(64), currentVersion: 4, currentVersionId: id(6), quoteId: quote, quoteCode: 'Q-USD', targetRevisionId: 'r-usd', revisionLabel: 'R2', before: lines,
    after: lines.map(line => ({ ...line, laborPrice: '0', laborCurrency: 'USD', confirmation: { quoteId: quote, revisionId: 'r-usd', priceVersionId: 'pv-1', quoteVersion: 9,
      sourceKind: 'quote_confirmation', sourceCctId: null, sourceCctVersion: null, confirmedAt: '2026-10-27T00:00:00Z' } })), unchanged: false, warnings: [],
    preserved: ['garment_sale', 'product_snapshot', 'creation_source', 'processing_batch', 'closing_history', 'unselected_colors'] };
}
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(yes => { resolve = yes; }); return { promise, resolve }; }
class MemoryStorage {
  values = new Map([['zhixu.erp.local.quotes', 'KEEP']]); events: string[] = [];
  getItem(key: string) { this.events.push('read'); return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.events.push('write'); this.values.set(key, value); }
  removeItem(key: string) { this.events.push('remove'); this.values.delete(key); }
}
type Controller = ReturnType<typeof createLaborAdoptionController>;
function rig() {
  const storage = new MemoryStorage(), calls: { url: string; init: RequestInit }[] = [], posts: LaborPending[] = [], changes: LaborControlState[] = [], applied: string[][] = [];
  let currentOwner: object | null = {}, access = { read: true, write: true }, ids = 0, unauthorized = 0;
  const handlers = { post: null as null | ((value: LaborPending, signal?: AbortSignal | null) => Promise<Response>),
    receipt: null as null | ((value: LaborPending, signal?: AbortSignal | null) => Promise<Response>),
    preview: null as null | ((value: ReturnType<typeof intent>) => Promise<Response>) };
  const fetchImpl = (async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (String(url).endsWith('/preview')) {
      const value = JSON.parse(String(init.body)) as ReturnType<typeof intent>;
      return handlers.preview ? handlers.preview(value) : response(preview(value));
    }
    if (String(url).endsWith('/commands')) {
      const command = JSON.parse(String(init.body)) as LaborPending['command'];
      const stored = readLaborPending(storage, { userId: actor });
      assert.ok(stored, 'a durable original must exist before the command POST'); assert.deepEqual(stored.command, command);
      storage.events.push('POST'); posts.push(structuredClone(stored));
      return handlers.post ? handlers.post(stored, init.signal) : response({ ...outcome(stored), replayed: false });
    }
    assert.equal(init.method, 'GET'); storage.events.push('GET');
    const value = posts.at(-1) ?? readLaborPending(storage, { userId: actor }) ?? pending();
    return handlers.receipt ? handlers.receipt(value, init.signal) : response(await recorded(value));
  }) as typeof fetch;
  const client = createLaborAdoptionClient({ fetchImpl });
  function make(extra: Partial<Parameters<typeof createLaborAdoptionController>[0]> = {}) {
    const owner = currentOwner!;
    return createLaborAdoptionController({ userId: actor, quoteId, owner, currentOwner: () => currentOwner, access: () => access,
      storage: () => storage, client, requestId: () => { ids++; return id(1); },
      onChange: value => changes.push(value), onUnauthorized: () => { unauthorized++; }, onApplied: (...value) => applied.push(value), ...extra });
  }
  return { storage, calls, posts, changes, applied, handlers, make, ids: () => ids, unauthorized: () => unauthorized,
    setOwner(value: object | null) { currentOwner = value; }, setAccess(value: typeof access) { access = value; } };
}
async function ready(controller: Controller) { await controller.preview(intent()); assert.equal(controller.snapshot().stage, 'preview'); }

test('persists the exact command before POST, verifies terminal receipt before clearing, and isolates returned state', async () => {
  const r = rig(), c = r.make(); assert.equal(r.calls.length, 0); assert.equal(c.snapshot().navigationBlocked, false);
  await ready(c); const state = c.snapshot(); assert.equal(state.navigationBlocked, true); state.preview!.intent.reason = 'mutated snapshot';
  state.preview!.after[0].laborPrice = '900';
  await c.apply(); assert.equal(r.posts.length, 1); assert.deepEqual(r.posts[0], pending()); assert.equal(r.ids(), 1);
  assert.equal(c.snapshot().stage, 'saved'); assert.equal(c.snapshot().navigationBlocked, false); assert.equal(c.snapshot().pending, null);
  assert.equal(readLaborPending(r.storage, { userId: actor }), null); assert.deepEqual(r.applied, [[id(2), id(6)]]);
  const events = r.storage.events; assert.ok(events.indexOf('write') < events.indexOf('POST')); assert.ok(events.indexOf('POST') < events.indexOf('GET')); assert.ok(events.indexOf('GET') < events.indexOf('remove'));
  assert.equal(r.storage.getItem('zhixu.erp.local.quotes'), 'KEEP');
});

test('write, readback, quota and unavailable-storage failures never send a command or pretend to have saved it', async () => {
  for (const mode of ['throw', 'noop', 'corrupt', 'get-throw']) {
    const r = rig(), c = r.make(); await ready(c); const key = laborPendingKey({ userId: actor });
    if (mode === 'throw') r.storage.setItem = () => { throw new Error('quota'); };
    if (mode === 'noop') r.storage.setItem = () => {};
    if (mode === 'corrupt') r.storage.setItem = k => { r.storage.values.set(k, '{preserve-corrupt'); };
    if (mode === 'get-throw') r.storage.getItem = () => { throw new Error('unavailable'); };
    await c.apply(); assert.equal(r.posts.length, 0, mode); assert.equal(c.snapshot().stage, 'storage-blocked', mode);
    assert.equal(c.snapshot().pendingUnavailable, true); assert.equal(c.snapshot().navigationBlocked, true); assert.ok(c.snapshot().error);
    if (mode === 'corrupt') assert.equal(r.storage.values.get(key), '{preserve-corrupt');
    assert.equal(r.storage.values.get('zhixu.erp.local.quotes'), 'KEEP');
  }
});

test('corrupt or future restored bytes are preserved and block new preview, UUID creation, sending and acknowledgement', async () => {
  for (const raw of ['{broken', JSON.stringify({ schemaVersion: 2 }), JSON.stringify({ schemaVersion: 1, extra: true })]) {
    const r = rig(), key = laborPendingKey({ userId: actor }); r.storage.setItem(key, raw); const c = r.make();
    await c.preview(intent()); await c.apply(); await c.check(); await c.retry(true);
    assert.equal(r.calls.length, 0); assert.equal(r.ids(), 0); assert.equal(r.storage.getItem(key), raw); assert.equal(c.snapshot().stage, 'storage-blocked');
  }
});

test('an unresolved original in another Quote blocks new work, but can be checked without changing its scope', async () => {
  const r = rig(); saveLaborPending(r.storage, { userId: actor }, pending()); const c = r.make({ quoteId: 'another-quote' });
  assert.equal(c.snapshot().pending?.quoteId, quoteId); assert.equal(r.calls.length, 0);
  await c.preview(intent()); await c.apply(); assert.equal(r.calls.length, 0);
  await c.check(); assert.equal(r.posts.length, 0); assert.equal(c.snapshot().stage, 'saved');
  assert.ok(r.calls[0].url.endsWith('/commands/' + id(1))); assert.equal(r.ids(), 0);
});

test('lost POST acknowledgement is followed by one original GET, never a second POST', async () => {
  const r = rig(), c = r.make(); r.handlers.post = async () => { throw new Error('connection lost after commit'); };
  await ready(c); await c.apply(); assert.equal(r.posts.length, 1); assert.equal(r.calls.filter(x => x.init.method === 'GET').length, 1);
  assert.equal(c.snapshot().stage, 'saved'); assert.equal(c.snapshot().error, ''); assert.equal(r.applied.length, 1);
});

test('refresh restores without replay; unknown requires an explicit same-command retry after checking', async () => {
  const r = rig(), c = r.make(); r.handlers.post = async () => { throw new Error('lost'); }; r.handlers.receipt = async value => response(unknown(value));
  await ready(c); await c.apply(); assert.equal(c.snapshot().retryAllowed, true); const original = structuredClone(r.posts[0]);
  c.dispose(); r.setOwner({}); const refreshed = r.make(), atRestore = r.calls.length;
  assert.equal(refreshed.snapshot().pending?.command.requestId, id(1)); await refreshed.retry(true); assert.equal(r.calls.length, atRestore);
  await refreshed.check(); assert.equal(refreshed.snapshot().retryAllowed, true); await refreshed.retry(false); assert.equal(r.posts.length, 1);
  r.handlers.post = null; r.handlers.receipt = null; await refreshed.retry(true);
  assert.equal(r.posts.length, 2); assert.deepEqual(r.posts[1], original); assert.equal(r.ids(), 1); assert.equal(refreshed.snapshot().stage, 'saved');
});

test('mismatched receipts and malformed responses preserve the original and cannot permit a retry', async () => {
  for (const change of [{ commandHash: 'b'.repeat(64) }, { orderId: id(8) }, { requestId: id(9) }, { result: { ...outcome(pending()), version: 9 } }]) {
    const r = rig(), c = r.make(); r.handlers.receipt = async value => response({ ...await recorded(value), ...change });
    await ready(c); await c.apply(); assert.equal(c.snapshot().pending?.command.requestId, id(1)); assert.equal(c.snapshot().retryAllowed, false);
    await c.retry(true); assert.equal(r.posts.length, 1); assert.ok(readLaborPending(r.storage, { userId: actor })); assert.equal(r.applied.length, 0);
  }
});

test('same-user A→B→A is a new owner; a late original response cannot clear pending or update the new owner', async () => {
  const r = rig(), wait = deferred<Response>(), entered = deferred<void>(), c = r.make();
  r.handlers.post = async () => { entered.resolve(); return wait.promise; }; await ready(c); const writing = c.apply(); await entered.promise;
  const oldEvents = r.changes.length; r.setOwner({}); r.setOwner({}); assert.equal(c.snapshot().stage, 'inactive');
  wait.resolve(response({ ...outcome(pending()), replayed: false })); await writing;
  assert.equal(r.changes.length, oldEvents); assert.equal(r.applied.length, 0); assert.ok(readLaborPending(r.storage, { userId: actor }));
  const newSession = r.make(); assert.equal(newSession.snapshot().stage, 'pending'); assert.equal(r.calls.filter(x => x.init.method === 'GET').length, 0);
  await newSession.check(); assert.equal(newSession.snapshot().stage, 'saved');
});

test('different actors cannot view or consume the original actor slot', async () => {
  const r = rig(); saveLaborPending(r.storage, { userId: actor }, pending()); const raw = r.storage.getItem(laborPendingKey({ userId: actor }));
  r.setOwner({}); const other = r.make({ userId: id(9) }); assert.equal(other.snapshot().pending, null); await other.check();
  assert.equal(r.calls.length, 0); assert.equal(r.storage.getItem(laborPendingKey({ userId: actor })), raw);
});

test('losing write permission preserves a saved original and still permits read-only receipt verification', async () => {
  const r = rig(), c = r.make({ onChange(state) { if (state.pending) r.setAccess({ read: true, write: false }); } });
  await ready(c); await c.apply(); assert.equal(r.posts.length, 0); assert.ok(c.snapshot().pending); assert.equal(c.snapshot().navigationBlocked, true);
  await c.retry(true); assert.equal(r.posts.length, 0); await c.check(); assert.equal(c.snapshot().stage, 'saved'); assert.equal(r.applied.length, 1);
});

test('losing read access hides state and late responses cannot acknowledge an old command', async () => {
  const r = rig(), wait = deferred<Response>(), entered = deferred<void>(), c = r.make();
  r.handlers.receipt = async () => { entered.resolve(); return wait.promise; }; await ready(c); const work = c.apply(); await entered.promise;
  r.setAccess({ read: false, write: false }); wait.resolve(response(await recorded(pending()))); await work;
  assert.equal(c.snapshot().stage, 'inactive'); assert.equal(c.snapshot().pending, null); assert.ok(readLaborPending(r.storage, { userId: actor })); assert.equal(r.applied.length, 0);
});

test('double clicks share one in-flight command; a concurrent different original is never overwritten', async () => {
  const r = rig(), wait = deferred<Response>(), entered = deferred<void>(), c = r.make();
  r.handlers.post = async () => { entered.resolve(); return wait.promise; }; await ready(c); const work = c.apply(); await entered.promise;
  await c.apply(); await c.preview(intent()); await c.check(); await c.retry(true); assert.equal(r.posts.length, 1); assert.equal(r.ids(), 1);
  wait.resolve(response({ ...outcome(pending()), replayed: false })); await work;
  const fresh = r.make(); await ready(fresh); const different = pending(); different.command.requestId = id(10);
  saveLaborPending(r.storage, { userId: actor }, different); const raw = r.storage.getItem(laborPendingKey({ userId: actor }));
  await fresh.apply(); assert.equal(r.posts.length, 1); assert.equal(fresh.snapshot().pending?.command.requestId, id(10));
  assert.equal(fresh.snapshot().pendingUnavailable, true); assert.equal(r.storage.getItem(laborPendingKey({ userId: actor })), raw);
});

test('terminal rejection releases only the verified original and never invokes applied callbacks', async () => {
  const r = rig(), c = r.make(); r.handlers.receipt = async value => response({ ...await recorded(value), result: { requestId: id(1), status: 'rejected', error: { status: 409, code: 'labor_product_changed' } } });
  await ready(c); await c.apply(); assert.equal(c.snapshot().stage, 'rejected'); assert.equal(c.snapshot().pending, null); assert.equal(r.applied.length, 0);
  await c.retry(true); assert.equal(r.posts.length, 1);
});

test('a terminal server result with a failed local acknowledgement stays recoverable and never resends', async () => {
  const r = rig(), c = r.make(), remove = r.storage.removeItem.bind(r.storage); r.storage.removeItem = () => { throw new Error('storage locked'); };
  await ready(c); await c.apply(); assert.equal(c.snapshot().stage, 'storage-blocked'); assert.equal(c.snapshot().terminal?.state, 'recorded'); assert.ok(c.snapshot().pending);
  assert.equal(r.applied.length, 0); await c.retry(true); assert.equal(r.posts.length, 1);
  r.storage.removeItem = remove; await c.check(); assert.equal(c.snapshot().stage, 'saved'); assert.equal(r.posts.length, 1); assert.equal(r.applied.length, 1);
});

test('an absent or changed original slot after unknown cannot be silently recreated by retry', async () => {
  const r = rig(), c = r.make(); r.handlers.receipt = async value => response(unknown(value)); await ready(c); await c.apply();
  r.storage.values.delete(laborPendingKey({ userId: actor })); await c.retry(true);
  assert.equal(r.posts.length, 1); assert.equal(c.snapshot().stage, 'storage-blocked'); assert.equal(c.snapshot().pendingUnavailable, true);
  await c.check(); assert.equal(c.snapshot().retryAllowed, false); assert.equal(r.posts.length, 1);
});

test('timeout and disposal suppress late writes even when the transport ignores AbortSignal', async () => {
  for (const mode of ['timeout', 'dispose']) {
    const r = rig(), wait = deferred<Response>(), entered = deferred<void>(), c = r.make({ timeoutMs: mode === 'timeout' ? 40 : 60000 });
    let signal: AbortSignal | null | undefined; r.handlers.receipt = async (_value, value) => { signal = value; entered.resolve(); return wait.promise; };
    await ready(c); const work = c.apply(); await entered.promise; if (mode === 'dispose') c.dispose(); await work;
    assert.equal(signal?.aborted, true); assert.ok(readLaborPending(r.storage, { userId: actor })); const changes = r.changes.length;
    wait.resolve(response(await recorded(pending()))); await new Promise(resolve => setTimeout(resolve, 5));
    assert.equal(r.changes.length, changes); assert.equal(r.applied.length, 0); assert.ok(readLaborPending(r.storage, { userId: actor }));
    assert.equal(c.snapshot().stage, mode === 'dispose' ? 'inactive' : 'pending'); assert.equal(c.snapshot().busy, false);
    r.setOwner({}); r.handlers.receipt = null; const next = r.make(); await next.check(); assert.equal(next.snapshot().stage, 'saved'); assert.equal(r.posts.length, 1);
  }
});

test('unauthorized submit preserves the original; broken callbacks cannot erase it or keep the controller busy', async () => {
  const r = rig(), c = r.make({ onChange() { throw new Error('subscriber'); }, onUnauthorized() { throw new Error('logout callback'); } });
  r.handlers.post = async () => response({ error: { code: 'authentication_required' } }, 401);
  await ready(c); await c.apply(); assert.equal(c.snapshot().busy, false); assert.ok(c.snapshot().pending); assert.equal(r.calls.filter(x => x.init.method === 'GET').length, 0);
  assert.equal(r.posts.length, 1); assert.ok(c.snapshot().error); assert.equal(r.applied.length, 0);
});

test('forbidden submit can still check a pre-existing terminal receipt without write permission', async () => {
  const r = rig(), c = r.make(); r.handlers.post = async () => { r.setAccess({ read: true, write: false }); return response({ error: { code: 'permission_denied' } }, 403); };
  await ready(c); await c.apply(); assert.equal(r.posts.length, 1); assert.equal(c.snapshot().stage, 'saved');
});

test('mutable preview inputs and render callbacks cannot substitute the original command', async () => {
  const r = rig(), wait = deferred<Response>(), entered = deferred<void>(), input = intent(), c = r.make({ onChange(state) { if (state.preview) state.preview.intent.reason = 'callback mutation'; } });
  r.handlers.preview = async value => { entered.resolve(); return wait.promise.then(() => response(preview(value))); };
  const work = c.preview(input); await entered.promise; input.reason = 'mutated input'; input.colorIds.push(id(11)); wait.resolve(response({})); await work;
  assert.equal(c.snapshot().preview?.intent.reason, intent().reason); await c.apply(); assert.deepEqual(r.posts[0], pending());
});

test('processing whole-order null color and confirmed zero USD pass through without amount conversion', async () => {
  const r = rig(), c = r.make(); const value = intent(); value.colorIds = [null]; await c.preview(value);
  assert.equal(c.snapshot().preview?.after[0].laborPrice, '0'); assert.equal(c.snapshot().preview?.after[0].laborCurrency, 'USD');
  await c.apply(); assert.deepEqual(r.posts[0].command.intent.colorIds, [null]); assert.equal(c.snapshot().stage, 'saved');
});

test('invalid new intent revokes the old preview before parsing and cannot submit the previous selection', async () => {
  for (const change of [{ productUnchangedConfirmed: false }, { expectedVersion: 0 }, { colorIds: [] }]) {
    const r = rig(), c = r.make(); await ready(c); await c.preview({ ...intent(), ...change });
    assert.equal(c.snapshot().preview, null); assert.ok(c.snapshot().error); await c.apply(); assert.equal(r.posts.length, 0); assert.equal(r.ids(), 0);
  }
});

test('callbacks after state publication cannot affect a replacement owner or disposed controller', async () => {
  for (const result of ['saved', 'unauthorized']) for (const action of ['replace', 'dispose']) {
    const r = rig(), lifecycle: { controller?: Controller } = {};
    const c = r.make({ onChange(state) {
      if (result === 'saved' ? state.stage === 'saved' : Boolean(state.error)) {
        if (action === 'replace') r.setOwner({}); else lifecycle.controller?.dispose();
      }
    } }); lifecycle.controller = c;
    if (result === 'unauthorized') r.handlers.post = async () => response({ error: { code: 'authentication_required' } }, 401);
    await ready(c); await c.apply(); assert.equal(c.snapshot().stage, 'inactive'); assert.equal(r.applied.length, 0); assert.equal(r.unauthorized(), 0);
    assert.equal(Boolean(readLaborPending(r.storage, { userId: actor })), result === 'unauthorized');
  }
});
