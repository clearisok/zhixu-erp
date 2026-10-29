import { canonicalPlanJson } from '../../../server/production-scheduling/canonical-json';
import {
  createLaborAdoptionClient, LaborAdoptionClientError, laborIntent, laborPending, parseLaborReceipt,
  type LaborPending, type LaborPreview, type LaborReceipt, type LaborLease,
} from './labor-adoption-client';
import { acknowledgeLaborPending, readLaborPending, saveLaborPending } from './labor-adoption-pending';

type Stage = 'inactive' | 'idle' | 'preview' | 'pending' | 'storage-blocked' | 'saved' | 'rejected';
type Recorded = Extract<LaborReceipt, { state: 'recorded' }>;
type PendingStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export type LaborControlState = {
  stage: Stage; busy: boolean; preview: LaborPreview | null; pending: LaborPending | null;
  pendingUnavailable: boolean; retryAllowed: boolean; terminal: Recorded | null;
  error: string; message: string; navigationBlocked: boolean;
};
const initial = (stage: Stage = 'idle'): LaborControlState => ({ stage, busy: false, preview: null, pending: null,
  pendingUnavailable: false, retryAllowed: false, terminal: null, error: '', message: '', navigationBlocked: false });
const storageError = '本机原请求无法安全读取或保存，未发送新的采用命令；请保留现场并核对原请求。';
const unknownMessage = '暂未查到原请求回执，不等于未提交。可再次核对；重试必须明确确认完全相同的原命令。';
const same = (left: unknown, right: unknown) => canonicalPlanJson(left) === canonicalPlanJson(right);

/** Renderless orchestration. The caller must create a new owner token for every
 * actual session/permission/Quote generation, including same-user A→B→A, and
 * dispose this instance on departure. It does not install UI or navigation hooks. */
export function createLaborAdoptionController(options: {
  userId: string; quoteId: string; owner: object; currentOwner: () => object | null;
  access: () => { read: boolean; write: boolean }; storage: () => PendingStorage;
  client?: Pick<ReturnType<typeof createLaborAdoptionClient>, 'preview' | 'submit' | 'receipt'>;
  requestId?: () => string; timeoutMs?: number;
  onChange?: (state: LaborControlState) => void; onUnauthorized?: () => void; onForbidden?: () => void;
  onApplied?: (orderId: string, commercialVersionId: string) => void;
}) {
  const { userId, quoteId, owner } = options, scope = { userId }, client = options.client ?? createLaborAdoptionClient();
  const timeoutMs = options.timeoutMs ?? 60000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120000) throw new Error('invalid_labor_controller_timeout');
  let state = initial(), alive = true, sequence = 0, locked = false;
  let abort: AbortController | null = null, cancel: (() => void) | null = null;
  const owns = () => alive && options.currentOwner() === owner && options.access().read;
  const snapshot = () => owns() ? structuredClone({ ...state, navigationBlocked: state.busy || Boolean(state.pending) || state.pendingUnavailable || Boolean(state.preview) }) : initial('inactive');
  function patch(update: Partial<LaborControlState>, current: LaborLease = owns) {
    if (!current()) return; state = { ...state, ...update };
    // A rendering subscriber cannot control durable command or receipt handling.
    try { options.onChange?.(snapshot()); } catch { /* The Server result remains authoritative. */ }
  }
  function guardedStorage(current: LaborLease): PendingStorage {
    const check = () => { if (!current()) throw new LaborAdoptionClientError(0, 'labor_owner_changed'); };
    check(); const storage = options.storage(); check();
    return {
      getItem(key) { check(); const value = storage.getItem(key); check(); return value; },
      setItem(key, value) { check(); storage.setItem(key, value); check(); },
      removeItem(key) { check(); storage.removeItem(key); check(); },
    };
  }
  function recover(current: LaborLease = owns) {
    if (!current()) return false;
    try {
      const stored = readLaborPending(guardedStorage(current), scope);
      if (state.pending && stored && !same(state.pending, stored)) throw new Error('labor_pending_locked');
      if (stored) patch({ pending: stored, pendingUnavailable: false, preview: null, retryAllowed: false, stage: 'pending', error: '', message: '存在原请求，请先核对回执；刷新不会自动重新采用。' }, current);
      else if (state.pending) patch({ pendingUnavailable: true, retryAllowed: false, stage: 'storage-blocked', error: storageError }, current);
      else patch({ pendingUnavailable: false, stage: state.preview ? 'preview' : 'idle', error: '' }, current);
      return !stored && !state.pending && !state.pendingUnavailable;
    } catch {
      patch({ pendingUnavailable: true, preview: null, retryAllowed: false, stage: 'storage-blocked', error: storageError }, current); return false;
    }
  }
  recover(); // Only storage restoration. Never fetch, preview or POST on construction.

  async function run(operation: (current: LaborLease, signal: AbortSignal) => Promise<void>) {
    if (!owns() || locked) return;
    locked = true; const ticket = ++sequence, controller = new AbortController(); abort = controller;
    let expired = false, timer: ReturnType<typeof setTimeout> | null = null;
    const current = () => owns() && sequence === ticket && !expired;
    patch({ busy: true, error: '' }, current);
    const interrupted = new Promise<never>((_resolve, reject) => {
      cancel = () => reject(new LaborAdoptionClientError(0, 'labor_owner_changed'));
      timer = setTimeout(() => { expired = true; controller.abort(); reject(new LaborAdoptionClientError(0, 'labor_outcome_unknown')); }, timeoutMs);
    });
    try { await Promise.race([operation(current, controller.signal), interrupted]); }
    catch (error) {
      if (owns() && sequence === ticket) {
        patch({ retryAllowed: false, error: error instanceof LaborAdoptionClientError ? error.message : '采用结果尚未核实，请保留原请求并重新核对。' });
        if (current() && error instanceof LaborAdoptionClientError && error.status === 401) {
          try { options.onUnauthorized?.(); } catch { /* A subscriber cannot discard the pending command. */ }
        }
        if (current() && error instanceof LaborAdoptionClientError && error.status === 403) {
          patch({ preview: null });
          try { options.onForbidden?.(); } catch { /* Keep the original pending command. */ }
        }
      }
    } finally {
      if (timer !== null) clearTimeout(timer);
      if (sequence === ticket) { locked = false; abort = null; cancel = null; patch({ busy: false }); }
    }
  }
  async function settle(pending: LaborPending, receipt: LaborReceipt, current: LaborLease) {
    const verified = await parseLaborReceipt(receipt, pending); if (!current()) return;
    if (verified.state === 'unknown') { patch({ stage: 'pending', retryAllowed: !state.pendingUnavailable, message: unknownMessage, terminal: null }, current); return; }
    try { acknowledgeLaborPending(guardedStorage(current), scope, pending); }
    catch { patch({ pending, pendingUnavailable: true, retryAllowed: false, terminal: verified, stage: 'storage-blocked', error: '服务端结果已核实，本机原请求未能安全释放；请再次核对，勿建立新命令。' }, current); return; }
    if (!current()) return;
    const success = verified.result.status !== 'rejected';
    patch({ pending: null, pendingUnavailable: false, preview: null, retryAllowed: false, terminal: verified,
      stage: success ? 'saved' : 'rejected', error: '', message: success ? '原请求已核实，工价采用结果已保存。' : '原请求已核实为未采用，请重新读取依据并预览。' }, current);
    if (current() && success && verified.result.status !== 'rejected') {
      try { options.onApplied?.(pending.command.intent.orderId, verified.result.commercialVersionId); }
      catch { patch({ message: '原请求已核实；页面刷新尚未完成，请重新读取当前订单。' }, current); }
    }
  }
  async function readReceipt(pending: LaborPending, current: LaborLease, signal: AbortSignal) {
    patch({ retryAllowed: false, terminal: null }, current);
    const receipt = await client.receipt(pending, current, signal); if (!current()) return;
    await settle(pending, receipt, current);
  }
  async function send(pending: LaborPending, current: LaborLease, signal: AbortSignal, retry: boolean) {
    if (!current() || !options.access().write) return;
    try {
      const storage = guardedStorage(current);
      if (retry) { const stored = readLaborPending(storage, scope); if (!stored || !same(stored, pending)) throw new Error('labor_pending_locked'); }
      saveLaborPending(storage, scope, pending);
    } catch {
      // A competing valid command takes precedence; corrupt bytes remain untouched.
      // Do not turn a failed write/readback into an idle state just because the slot is empty.
      let prior = state.pending;
      try { prior = readLaborPending(guardedStorage(current), scope) ?? prior; } catch { /* Preserve the failure. */ }
      patch({ pending: prior, preview: null, retryAllowed: false, pendingUnavailable: true, stage: 'storage-blocked', error: storageError }, current);
      return;
    }
    if (!current()) return;
    patch({ pending, pendingUnavailable: false, preview: null, stage: 'pending', retryAllowed: false, terminal: null, error: '', message: '' }, current);
    if (!current() || !options.access().write) return;
    try { await client.submit(pending, current, signal); }
    catch (error) {
      if (!current()) return;
      if (error instanceof LaborAdoptionClientError && error.status === 401) throw error;
      patch({ error: error instanceof LaborAdoptionClientError ? error.message : '提交结果未确认，正在核对原请求。' }, current);
    }
    if (current()) await readReceipt(pending, current, signal); // GET only, even after a lost acknowledgement.
  }
  return {
    snapshot,
    async preview(value: unknown) {
      if (!owns() || !options.access().write || locked || !recover()) return;
      await run(async (current, signal) => {
        patch({ preview: null, terminal: null, retryAllowed: false, message: '', stage: 'idle' }, current);
        const intent = laborIntent(value);
        const preview = await client.preview(quoteId, intent, current, signal); if (!current()) return;
        patch({ preview: structuredClone(preview), stage: 'preview', error: '' }, current);
      });
    },
    async apply() {
      if (!owns() || !options.access().write || locked || !state.preview || state.pending || state.pendingUnavailable) return;
      const preview = structuredClone(state.preview);
      await run(async (current, signal) => {
        const pending = laborPending({ quoteId, command: { requestId: (options.requestId ?? (() => crypto.randomUUID()))(), intent: preview.intent, previewHash: preview.previewHash } });
        await send(pending, current, signal, false);
      });
    },
    async check() {
      if (!owns() || locked) return;
      await run(async (current, signal) => {
        recover(current); const pending = state.pending;
        if (!current() || !pending) return;
        // A corrupt or different slot must not be acknowledged as the original.
        const stored = readLaborPending(guardedStorage(current), scope);
        if (stored && !same(stored, pending)) throw new Error('labor_pending_locked');
        await readReceipt(pending, current, signal);
      });
    },
    async retry(confirmed: boolean) {
      if (!owns() || !options.access().write || locked || confirmed !== true || !state.retryAllowed || !state.pending || state.pendingUnavailable) return;
      const pending = structuredClone(state.pending);
      await run((current, signal) => send(pending, current, signal, true));
    },
    discardPreview() { if (owns() && !locked && !state.pending && !state.pendingUnavailable) patch({ preview: null, stage: 'idle', terminal: null, error: '', message: '' }); },
    dispose() { alive = false; sequence++; abort?.abort(); cancel?.(); abort = null; cancel = null; locked = false; state = initial('inactive'); },
  };
}
