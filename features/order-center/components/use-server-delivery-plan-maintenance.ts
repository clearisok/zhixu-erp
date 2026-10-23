"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useServerSession } from '../../server-auth';
import type { DeliveryPlanSetDto } from '../../../server/sales-orders/delivery-plan-model';
import { createDeliveryPlanClient, DeliveryPlanClientError, type DeliveryPlanLease, type DeliveryPlanPending } from '../server/delivery-plan-client';
import { deliveryPlanDraft, previewDeliveryPlanDraft, type DeliveryPlanDraftRow, type DeliveryPlanPreview } from '../server/delivery-plan-draft';
import { acknowledgeDeliveryPlanPending, readDeliveryPlanPending, saveDeliveryPlanPending } from '../server/delivery-plan-pending';
import { canonicalPlanJson } from '../../../server/production-scheduling/canonical-json';

type Stage = 'edit' | 'preview' | 'unknown' | 'saved' | 'conflict';
type View = { lease: object; ready: boolean; open: boolean; busy: boolean; data: DeliveryPlanSetDto | null;
  rows: DeliveryPlanDraftRow[]; preview: DeliveryPlanPreview | null; pending: DeliveryPlanPending | null;
  pendingUnavailable: boolean; verifiedUnknown: string | null; retryConfirmation: boolean;
  stage: Stage; error: string; notice: string; discard: 'close' | 'reload' | null; voiding: string | null };
const initial = (lease: object): View => ({ lease, ready: false, open: false, busy: false, data: null, rows: [], preview: null,
  pending: null, pendingUnavailable: false, verifiedUnknown: null, retryConfirmation: false, stage: 'edit', error: '', notice: '', discard: null, voiding: null });
const client = createDeliveryPlanClient();
const pendingError = '本机待核对记录暂时无法读取，未发送新的保存请求；原记录保留，请联系管理员核对。';
const draftError = '请为新增或修改的计划填写有效日期和大于0的数量，每次最多变更100条。';

export function useServerDeliveryPlanMaintenance({ orderId, readOnly, onGuardChange, onSaved }: {
  orderId: string; readOnly: boolean; onGuardChange: (blocked: boolean) => void; onSaved: (orderId: string) => void;
}) {
  const session = useServerSession();
  // The actual session object is part of the owner, including same-user A→B→A.
  const lease = useMemo(() => ({ orderId, session, readOnly }), [orderId, session, readOnly]);
  const life = useRef<{ lease: object; alive: boolean; locked: boolean; sequence: number; abort: AbortController | null } | null>(null);
  const [stored, setStored] = useState<View | null>(null);
  const view = stored?.lease === lease ? stored : initial(lease);
  const canView = session.status === 'authenticated' && session.hasPermission('order.view');
  const canWrite = canView && session.hasPermission('order.edit');
  const dirty = Boolean(view.data && JSON.stringify(view.rows) !== JSON.stringify(deliveryPlanDraft(view.data)));
  const blocked = canWrite && (!view.ready || view.busy || Boolean(view.pending) || view.pendingUnavailable || view.open && dirty);

  useLayoutEffect(() => {
    const owner = { lease, alive: true, locked: false, sequence: 0, abort: null as AbortController | null };
    life.current = owner;
    return () => { owner.alive = false; owner.sequence++; owner.abort?.abort(); };
  }, [lease]);
  useLayoutEffect(() => { onGuardChange(blocked); return () => onGuardChange(false); }, [blocked, onGuardChange]);
  useEffect(() => {
    if (!canView) return;
    const owner = life.current;
    if (!owner || owner.lease !== lease || !owner.alive) return;
    let pending: DeliveryPlanPending | null = null, pendingUnavailable = false;
    try { pending = readDeliveryPlanPending(window.sessionStorage, { userId: session.user!.id }); }
    catch { pendingUnavailable = true; }
    setStored({ ...initial(lease), ready: true, pending, pendingUnavailable,
      stage: pending ? 'unknown' : 'edit', error: pendingUnavailable ? pendingError : '' });
  }, [canView, lease, session]);

  const patch = useCallback((update: Partial<View>) => {
    setStored(previous => previous?.lease === lease ? { ...previous, ...update } : previous);
  }, [lease]);
  const currentOwner = () => life.current?.lease === lease && life.current.alive;
  async function run(operation: (current: DeliveryPlanLease, signal: AbortSignal) => Promise<void>) {
    const owner = life.current;
    if (!owner || owner.lease !== lease || !owner.alive || owner.locked || !canView || !view.ready) return;
    owner.locked = true; const ticket = ++owner.sequence;
    owner.abort = new AbortController();
    const timeout = window.setTimeout(() => owner.abort?.abort(), 60000);
    const current = () => life.current === owner && owner.alive && owner.sequence === ticket;
    patch({ busy: true, error: '' });
    try { await operation(current, owner.abort.signal); }
    catch (error) {
      if (current()) {
        patch({ error: error instanceof DeliveryPlanClientError ? error.message : '交付计划暂时不可用，请稍后核对。' });
        if (error instanceof DeliveryPlanClientError && error.status === 401) session.invalidate();
      }
    } finally { window.clearTimeout(timeout); if (current()) { owner.locked = false; patch({ busy: false }); } }
  }
  async function load(current: DeliveryPlanLease, signal: AbortSignal, notice = '') {
    patch({ data: null, rows: [], preview: null, voiding: null, discard: null });
    const data = await client.read(orderId, current, signal);
    if (current()) patch({ data, rows: deliveryPlanDraft(data), stage: 'edit', notice });
  }
  function open() {
    if (!currentOwner() || view.open || !view.ready) return;
    patch({ open: true, notice: '', discard: null });
    if (!view.pending && !view.pendingUnavailable) void run((current, signal) => load(current, signal));
  }
  function close() {
    if (!currentOwner() || life.current?.locked || view.pending || view.pendingUnavailable) return;
    if (dirty) { patch({ discard: 'close' }); return; }
    patch({ open: false, error: '', notice: '', voiding: null });
  }
  function reload() {
    if (!currentOwner() || life.current?.locked || view.pending || view.pendingUnavailable) return;
    if (dirty) { patch({ discard: 'reload' }); return; }
    void run((current, signal) => load(current, signal, '已重新读取，请核对后再保存。'));
  }
  function discard() {
    if (!currentOwner() || life.current?.locked || view.pending || view.pendingUnavailable) return;
    if (view.discard === 'reload') void run((current, signal) => load(current, signal, '已重新读取，请核对后再保存。'));
    else patch({ open: false, rows: view.data ? deliveryPlanDraft(view.data) : [], preview: null, stage: 'edit', discard: null, error: '', voiding: null });
  }
  const editable = canWrite && !readOnly && view.ready && Boolean(view.data) && !view.busy && !view.pending && !view.pendingUnavailable
    && view.stage === 'edit' && !view.error;
  function update(rows: DeliveryPlanDraftRow[]) {
    if (!editable || !currentOwner() || life.current?.locked) return;
    patch({ rows, preview: null, notice: '', voiding: null });
  }
  function preview() {
    if (!editable || !view.data || !currentOwner() || life.current?.locked) return;
    try {
      const result = previewDeliveryPlanDraft(view.data, view.rows, crypto.randomUUID());
      if (!result) { patch({ notice: '没有实际变更，未发送保存请求。' }); return; }
      patch({ preview: result, stage: 'preview', notice: '', voiding: null });
    } catch { patch({ notice: draftError }); }
  }
  async function settle(pending: DeliveryPlanPending, applied: boolean, current: DeliveryPlanLease, signal: AbortSignal, reason = '') {
    if (!current()) return;
    try { acknowledgeDeliveryPlanPending(window.sessionStorage, { userId: session.user!.id }, pending); }
    catch { patch({ error: '服务端结果已核实，但本机核对记录未能释放，请再核对原请求。', stage: 'unknown' }); return; }
    patch({ pending: null, preview: null, verifiedUnknown: null, retryConfirmation: false,
      stage: applied ? 'saved' : 'conflict', error: '', notice: applied ? '交付计划已保存。' : reason });
    if (!applied) return;
    onSaved(pending.salesOrderId);
    patch({ data: null, rows: [] });
    // A historical receipt is proof of that request, not the current collection.
    if (pending.salesOrderId === orderId) {
      const data = await client.read(orderId, current, signal);
      if (current()) patch({ data, rows: deliveryPlanDraft(data) });
    }
  }
  async function sendOriginal(pending: DeliveryPlanPending, current: DeliveryPlanLease, signal: AbortSignal, requireExisting = false) {
      try {
        if (requireExisting) {
          const original = readDeliveryPlanPending(window.sessionStorage, { userId: session.user!.id });
          if (!original || canonicalPlanJson(original) !== canonicalPlanJson(pending)) throw new Error('delivery_plan_pending_locked');
        }
        saveDeliveryPlanPending(window.sessionStorage, { userId: session.user!.id }, pending);
      }
      catch {
        let original: DeliveryPlanPending | null = null;
        try { original = readDeliveryPlanPending(window.sessionStorage, { userId: session.user!.id }); } catch { /* Preserve original bytes. */ }
        patch({ pending: original, pendingUnavailable: !original, verifiedUnknown: null, retryConfirmation: false, stage: 'unknown', preview: null, error: pendingError }); return;
      }
      patch({ pending, stage: 'unknown', preview: null, notice: '', verifiedUnknown: null, retryConfirmation: false });
      // One explicit action, one identical PATCH. Errors retain the original intent.
      await client.save(pending, current, signal);
      await settle(pending, true, current, signal);
  }
  function save() {
    if (!canWrite || readOnly || view.stage !== 'preview' || !view.preview || view.pending || view.pendingUnavailable) return;
    const pending = view.preview.pending;
    void run((current, signal) => sendOriginal(pending, current, signal));
  }
  function check() {
    if (!canWrite || !view.pending) return;
    const pending = view.pending;
    void run(async (current, signal) => {
      patch({ verifiedUnknown: null, retryConfirmation: false });
      const receipt = await client.receipt(pending, current, signal);
      if (!current()) return;
      if (receipt.status === 'unknown') { patch({ stage: 'unknown', verifiedUnknown: pending.command.requestId,
        notice: '暂未查到已完成的原请求，可稍后再核对；如需重发，必须确认完全相同的原请求。' }); return; }
      await settle(pending, receipt.status === 'applied', current, signal, receipt.status === 'rejected' ? receipt.error.message : '');
    });
  }
  function retry() {
    if (!canWrite || !view.retryConfirmation || !view.pending || view.pendingUnavailable || view.verifiedUnknown !== view.pending.command.requestId) return;
    const pending = view.pending;
    void run((current, signal) => sendOriginal(pending, current, signal, true));
  }
  return { view, session, canView, canWrite, editable, dirty, closeDisabled: view.busy || Boolean(view.pending) || view.pendingUnavailable,
    open, close, reload, discard, save, check, preview, retry,
    requestRetry: () => { if (canWrite && !life.current?.locked && view.pending && view.verifiedUnknown === view.pending.command.requestId) patch({ retryConfirmation: true }); },
    cancelRetry: () => patch({ retryConfirmation: false }),
    keepEditing: () => patch({ discard: null }),
    edit: () => { if (!life.current?.locked && !view.pending) patch({ stage: 'edit', preview: null }); },
    resume: () => { if (view.data) patch({ stage: 'edit', notice: '' }); else reload(); },
    add: () => update([...view.rows, { editorId: crypto.randomUUID(), id: null, deliveryDate: '', quantity: '', voided: false }]),
    change: (editorId: string, value: Partial<Pick<DeliveryPlanDraftRow, 'deliveryDate' | 'quantity'>>) => update(view.rows.map(row => row.editorId === editorId ? { ...row, ...value } : row)),
    requestVoid: (editorId: string) => { if (editable && !life.current?.locked) patch({ voiding: editorId }); },
    cancelVoid: () => patch({ voiding: null }),
    confirmVoid: () => update(view.rows.map(row => row.editorId === view.voiding ? { ...row, voided: true } : row)),
  };
}
