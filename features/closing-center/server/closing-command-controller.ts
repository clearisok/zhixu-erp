import type { PermissionKey } from '../../permissions/model/permissions';
import { canonicalPlanJson } from '../../../server/production-scheduling/canonical-json';
import { CLOSING_READ_PERMISSIONS } from '../../../server/closing/contract';
import { ClosingClientError, type ClosingVisibility } from './closing-projection';
import type { ClosingLease } from './closing-client';

type Stage = 'inactive' | 'idle' | 'preview' | 'pending' | 'storage-blocked' | 'saved' | 'rejected';
export type ClosingRequest<I> = { requestId: string; intent: I; previewHash: string };
export type ClosingRequestPreview<I> = { intent: I; previewHash: string };
export type ClosingRequestOutcome = { requestId: string; status: 'applied' | 'rejected' };
export type ClosingRequestReceipt<O> = { state: 'unknown'; requestId: string } | { state: 'recorded'; requestId: string; commandHash: string; result: O };
export type PendingStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export type ClosingRequestControlState<P, C, O> = {
  stage: Stage; busy: boolean; preview: P | null; pending: C | null; pendingUnavailable: boolean; retryAllowed: boolean;
  terminal: Extract<ClosingRequestReceipt<O>, { state: 'recorded' }> | null; error: string; message: string; navigationBlocked: boolean;
};

const storageError = '本机原请求无法安全读取或保存，未发送新的关账命令；请保留现场并核对原请求。';
const unknownMessage = '暂未查到原请求回执，不等于未提交。可再次核对；重试必须明确确认完全相同的原命令。';
const same = (left: unknown, right: unknown) => canonicalPlanJson(left) === canonicalPlanJson(right);

/** One state machine for financial commands and unpriced month commands.
 * Domain codecs remain separate; storage restores never post automatically. */
export function createClosingCommandController<I, C extends ClosingRequest<I>, P extends ClosingRequestPreview<I>, O extends ClosingRequestOutcome>(options: {
  userId: string; owner: object; currentOwner: () => object | null; permissions: () => readonly PermissionKey[];
  storage: () => PendingStorage; requestId?: () => string; timeoutMs?: number;
  client: { preview: (intent: I, lease: ClosingLease, signal?: AbortSignal) => Promise<P>;
    submit: (command: C, lease: ClosingLease, signal?: AbortSignal) => Promise<unknown>;
    receipt: (command: C, lease: ClosingLease, signal?: AbortSignal) => Promise<ClosingRequestReceipt<O>> };
  parseIntent: (value: unknown) => I; parseCommand: (value: unknown) => C;
  parsePreview: (value: unknown, intent: I, view: ClosingVisibility) => P;
  parseReceipt: (value: unknown, command: C) => Promise<ClosingRequestReceipt<O>>;
  accepts: (intent: I) => boolean; canWrite: (intent: I, permissions: readonly PermissionKey[]) => boolean;
  store: { read: (storage: PendingStorage) => C | null; save: (storage: PendingStorage, command: C) => unknown; acknowledge: (storage: PendingStorage, command: C) => void };
  onChange?: (state: ClosingRequestControlState<P, C, O>) => void; onUnauthorized?: () => void;
  onApplied?: (result: Extract<O, { status: 'applied' }>) => void;
}) {
  const { owner, client } = options, timeoutMs = options.timeoutMs ?? 60000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120000) throw new Error('invalid_closing_controller_timeout');
  const visibility = (): ClosingVisibility => { const permissions = options.permissions(); return { sale: permissions.includes('commercial.sale.view'), work: permissions.includes('commercial.labor.view') }; };
  const initial = (stage: Stage = 'idle'): ClosingRequestControlState<P, C, O> => ({ stage, busy: false, preview: null, pending: null,
    pendingUnavailable: false, retryAllowed: false, terminal: null, error: '', message: '', navigationBlocked: false });
  let state = initial(), previewVisibility: ClosingVisibility | null = null, alive = true, sequence = 0, locked = false;
  let abort: AbortController | null = null, cancel: (() => void) | null = null;
  const owns = () => alive && options.currentOwner() === owner && CLOSING_READ_PERMISSIONS.every(key => options.permissions().includes(key));
  const previewVisible = () => previewVisibility !== null && same(previewVisibility, visibility());
  const canWrite = (intent: I) => owns() && options.canWrite(intent, options.permissions());
  function snapshot(): ClosingRequestControlState<P, C, O> {
    if (!owns()) return initial('inactive');
    const next = structuredClone(state);
    if (next.preview && !previewVisible()) { next.preview = null; next.stage = 'idle'; next.error = '金额查看权限已变化，请重新读取并预览。'; }
    next.navigationBlocked = next.busy || Boolean(next.pending) || next.pendingUnavailable || Boolean(next.preview);
    return next;
  }
  function patch(update: Partial<ClosingRequestControlState<P, C, O>>, current: ClosingLease = owns) {
    if (!current()) return; state = { ...state, ...update };
    try { options.onChange?.(snapshot()); } catch { /* Rendering cannot change the durable outcome. */ }
  }
  function guardedStorage(current: ClosingLease): PendingStorage {
    const check = () => { if (!current()) throw new ClosingClientError(0, 'closing_owner_changed'); };
    check(); const storage = options.storage(); check();
    return {
      getItem(key) { check(); const value = storage.getItem(key); check(); return value; },
      setItem(key, value) { check(); storage.setItem(key, value); check(); },
      removeItem(key) { check(); storage.removeItem(key); check(); },
    };
  }
  function recover(current: ClosingLease = owns) {
    if (!current()) return false;
    try {
      const stored = options.store.read(guardedStorage(current));
      if (state.pending && stored && !same(state.pending, stored)) throw new Error('closing_pending_locked');
      if (stored) patch({ pending: stored, pendingUnavailable: false, preview: null, retryAllowed: false, stage: 'pending', error: '', message: '存在原请求，请先核对回执；刷新不会自动再次提交。' }, current);
      else if (state.pending) patch({ pendingUnavailable: true, retryAllowed: false, stage: 'storage-blocked', error: storageError }, current);
      else patch({ pendingUnavailable: false, stage: state.preview ? 'preview' : 'idle', error: '' }, current);
      return !stored && !state.pending && !state.pendingUnavailable;
    } catch {
      patch({ pendingUnavailable: true, preview: null, retryAllowed: false, stage: 'storage-blocked', error: storageError }, current); return false;
    }
  }
  recover(); // Restore storage only. Construction never fetches or sends a command.

  async function run(operation: (current: ClosingLease, signal: AbortSignal) => Promise<void>) {
    if (!owns() || locked) return;
    locked = true; const ticket = ++sequence, controller = new AbortController(); abort = controller;
    let expired = false, timer: ReturnType<typeof setTimeout> | null = null;
    const current = () => owns() && sequence === ticket && !expired;
    try {
      patch({ busy: true, error: '' }, current);
      if (!current()) return;
      const interrupted = new Promise<never>((_resolve, reject) => {
        cancel = () => reject(new ClosingClientError(0, 'closing_owner_changed'));
        timer = setTimeout(() => { expired = true; controller.abort(); reject(new ClosingClientError(0, 'closing_outcome_unknown')); }, timeoutMs);
      });
      await Promise.race([operation(current, controller.signal), interrupted]);
    }
    catch (error) {
      if (owns() && sequence === ticket) {
        patch({ retryAllowed: false, error: error instanceof ClosingClientError ? error.message : '关账操作尚未核实，请核对输入并保留原请求。' });
        if (current() && error instanceof ClosingClientError && error.status === 401) {
          try { options.onUnauthorized?.(); } catch { /* Preserve the original request. */ }
        }
      }
    } finally {
      if (timer !== null) clearTimeout(timer);
      if (sequence === ticket) { locked = false; abort = null; cancel = null; patch({ busy: false }); }
    }
  }
  async function settle(command: C, receipt: ClosingRequestReceipt<O>, current: ClosingLease) {
    const verified = await options.parseReceipt(receipt, command); if (!current()) return;
    if (verified.state === 'unknown') { patch({ stage: 'pending', retryAllowed: !state.pendingUnavailable, message: unknownMessage, terminal: null }, current); return; }
    try { options.store.acknowledge(guardedStorage(current), command); }
    catch { patch({ pending: command, pendingUnavailable: true, retryAllowed: false, terminal: verified, stage: 'storage-blocked', error: '服务端结果已核实，本机原请求未能安全释放；请再次核对，勿建立新命令。' }, current); return; }
    if (!current()) return;
    const success = verified.result.status === 'applied';
    patch({ pending: null, pendingUnavailable: false, preview: null, retryAllowed: false, terminal: verified,
      stage: success ? 'saved' : 'rejected', error: '', message: success ? '原请求已核实，关账结果已保存。' : '原请求已核实为未应用，请重新读取并预览。' }, current);
    if (current() && verified.result.status === 'applied') {
      try { options.onApplied?.(structuredClone(verified.result) as Extract<O, { status: 'applied' }>); }
      catch { patch({ message: '原请求已核实；页面刷新尚未完成，请重新读取当前月份。' }, current); }
    }
  }
  async function readReceipt(command: C, current: ClosingLease, signal: AbortSignal) {
    patch({ retryAllowed: false, terminal: null }, current);
    const receipt = await client.receipt(command, current, signal); if (current()) await settle(command, receipt, current);
  }
  async function send(command: C, current: ClosingLease, signal: AbortSignal, retry: boolean) {
    if (!current() || !canWrite(command.intent)) return;
    try {
      const storage = guardedStorage(current);
      if (retry) { const stored = options.store.read(storage); if (!stored || !same(stored, command)) throw new Error('closing_pending_locked'); }
      options.store.save(storage, command);
    } catch {
      let prior = state.pending;
      try { prior = options.store.read(guardedStorage(current)) ?? prior; } catch { /* Preserve failed readback and original bytes. */ }
      patch({ pending: prior, preview: null, retryAllowed: false, pendingUnavailable: true, stage: 'storage-blocked', error: storageError }, current); return;
    }
    if (!current()) return;
    patch({ pending: command, pendingUnavailable: false, preview: null, stage: 'pending', retryAllowed: false, terminal: null, error: '', message: '' }, current);
    if (!current() || !canWrite(command.intent)) return;
    try { await client.submit(command, current, signal); }
    catch (error) {
      if (!current()) return;
      if (error instanceof ClosingClientError && error.status === 401) throw error;
      patch({ error: error instanceof ClosingClientError ? error.message : '提交结果未确认，正在核对原请求。' }, current);
    }
    if (current()) await readReceipt(command, current, signal);
  }
  return {
    snapshot,
    async preview(value: unknown) {
      if (!owns() || locked || !recover()) return;
      await run(async (current, signal) => {
        patch({ preview: null, terminal: null, retryAllowed: false, message: '', stage: 'idle' }, current); previewVisibility = null;
        const intent = options.parseIntent(value);
        if (!options.accepts(intent)) throw new ClosingClientError(0, 'closing_owner_changed');
        if (!current() || !canWrite(intent)) throw new ClosingClientError(403, 'permission_denied');
        const view = visibility(), preview = await client.preview(intent, current, signal);
        if (!current() || !same(view, visibility())) return;
        const verified = options.parsePreview(preview, intent, view); previewVisibility = view;
        patch({ preview: structuredClone(verified), stage: 'preview', error: '' }, current);
      });
    },
    async apply() {
      if (!owns() || locked || !state.preview || state.pending || state.pendingUnavailable) return;
      if (!previewVisible() || !canWrite(state.preview.intent)) { patch({ preview: null, stage: 'idle', error: '权限已变化，请重新读取并预览。' }); return; }
      const preview = structuredClone(state.preview);
      await run(async (current, signal) => {
        const command = options.parseCommand({ requestId: (options.requestId ?? (() => crypto.randomUUID()))(), intent: preview.intent, previewHash: preview.previewHash });
        await send(command, current, signal, false);
      });
    },
    async check() {
      if (!owns() || locked) return;
      await run(async (current, signal) => {
        recover(current); const command = state.pending;
        if (!current() || !command) return;
        const stored = options.store.read(guardedStorage(current));
        if (stored && !same(stored, command)) throw new Error('closing_pending_locked');
        await readReceipt(command, current, signal);
      });
    },
    async retry(confirmed: boolean) {
      if (!owns() || locked || confirmed !== true || !state.retryAllowed || !state.pending || state.pendingUnavailable || !canWrite(state.pending.intent)) return;
      const command = structuredClone(state.pending);
      await run((current, signal) => send(command, current, signal, true));
    },
    discardPreview() { if (owns() && !locked && !state.pending && !state.pendingUnavailable) { previewVisibility = null; patch({ preview: null, stage: 'idle', terminal: null, error: '', message: '' }); } },
    dispose() { alive = false; sequence++; abort?.abort(); cancel?.(); abort = null; cancel = null; locked = false; state = initial('inactive'); previewVisibility = null; },
  };
}
