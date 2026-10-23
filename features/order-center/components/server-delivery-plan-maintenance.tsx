"use client";

import { useLayoutEffect, useRef } from 'react';
import { AlertBanner, Button, DescriptionList, LoadingState, Modal, UnsavedDraftDialog } from '@/components/foundation';
import { useServerDeliveryPlanMaintenance } from './use-server-delivery-plan-maintenance';
import './server-delivery-plan-maintenance.css';

const changeLabels = { add: '新增', edit: '修改', void: '作废' };
const balances = { no_source_quantity: '合同数量未记录，按实际计划维护。', unplanned: '尚无有效日期计划。',
  short: '计划数量少于合同数量，请核对剩余安排。', matched: '计划数量与合同数量一致。', excess: '计划数量超出合同数量，请核对。',
  unavailable: '历史数量较长，请逐项核对；未以近似值汇总。' };

export function ServerDeliveryPlanMaintenance({ orderId, processing = false, readOnly = false, onGuardChange, onSaved }: {
  orderId: string; processing?: boolean; readOnly?: boolean;
  onGuardChange: (blocked: boolean) => void; onSaved: (orderId: string) => void;
}) {
  const controller = useServerDeliveryPlanMaintenance({ orderId, readOnly, onGuardChange, onSaved });
  const { view, canView, canWrite, editable, closeDisabled } = controller;
  const focusAnchor = useRef<HTMLSpanElement>(null);
  const previousRetry = useRef<{ lease: object; open: boolean } | null>(null);
  const retryOpen = view.open && view.retryConfirmation && !view.busy && Boolean(view.pending) && view.verifiedUnknown === view.pending?.command.requestId;
  useLayoutEffect(() => {
    const previous = previousRetry.current;
    previousRetry.current = { lease: view.lease, open: retryOpen };
    if (!canView || !view.open || retryOpen || !previous?.open || previous.lease !== view.lease) return;
    // The retry trigger disappears after sending. Restore only this still-owned
    // panel, after the nested overlay has attempted its normal focus return.
    let frame = window.requestAnimationFrame(() => {
      frame = window.requestAnimationFrame(() => {
        const panel = focusAnchor.current?.closest<HTMLElement>('.oc-delivery-modal');
        if (!panel?.isConnected || [...document.querySelectorAll('[role="dialog"]')].at(-1) !== panel || panel.contains(document.activeElement)) return;
        panel.focus({ preventScroll: true });
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [canView, retryOpen, view.lease, view.open]);
  if (!canView) return null;
  const unresolved = Boolean(view.pending) || view.pendingUnavailable;
  const foreign = view.pending && view.pending.salesOrderId !== orderId;
  const activeRows = view.rows.filter(row => !row.voided);
  const oldVoids = view.data?.plans.filter(row => row.voidedAt !== null) ?? [];
  const stagedVoids = view.rows.filter(row => row.voided && row.id !== null);
  const stage = view.stage;
  const submit = stage === 'preview' ? controller.save : stage === 'edit' ? controller.preview : undefined;
  return <>
    <Button variant="secondary" size="compact" disabled={!view.ready || !canWrite || readOnly && !unresolved}
      title={!canWrite ? '需要订单编辑权限' : readOnly ? '历史订单只读；原请求仍可核对' : undefined}
      onClick={controller.open} data-maintain-delivery-plans>维护交期{unresolved ? ' · 待核对' : ''}</Button>
    <Modal open={view.open && canView} title="维护交期" description={stage === 'preview' ? '确认本次交付计划变更' : '维护每期交付日期和数量'}
      className="oc-delivery-modal" closeDisabled={closeDisabled} onClose={controller.close} onSubmit={submit}
      footer={<>
        <Button variant="secondary" disabled={closeDisabled} onClick={controller.close}>{stage === 'edit' ? '取消' : '关闭'}</Button>
        {unresolved ? <><Button disabled={view.busy || !view.pending || !canWrite} onClick={controller.check}>{view.busy ? '正在核对…' : '核对保存结果'}</Button>
          {view.pending && view.verifiedUnknown === view.pending.command.requestId && <Button variant="secondary" disabled={view.busy || !canWrite} onClick={controller.requestRetry}>重发完全相同的原请求</Button>}</>
          : stage === 'preview' ? <><Button variant="secondary" disabled={view.busy} onClick={controller.edit}>返回修改</Button><Button type="submit" disabled={view.busy || !view.preview}>{view.busy ? '正在保存…' : '确认保存'}</Button></>
          : stage === 'conflict' ? <Button disabled={view.busy} onClick={controller.reload}>重新读取计划</Button>
          : stage === 'saved' ? <Button disabled={view.busy} onClick={controller.resume}>返回交付计划</Button>
          : view.error || !view.data ? <Button disabled={view.busy} onClick={controller.reload}>重新读取计划</Button>
          : <Button type="submit" disabled={!editable}>预览变更</Button>}
      </>}>
      <span hidden ref={focusAnchor} />
      {view.error && <AlertBanner tone="danger" title="交付计划暂未完成核对">{view.error}</AlertBanner>}
      {view.notice && <p className="oc-delivery-notice" role="status">{view.notice}</p>}
      {unresolved ? <section className="oc-delivery-result" aria-live="polite">
        <h3>保存结果暂未确认</h3>
        <p>{foreign ? '另一张订单仍有待核对请求，请先核对完成，再维护本单交期。' : '请先核对本次保存结果，避免重复提交。'}</p>
        <p>不会自动再次保存；原日期、数量和请求编号保持。</p>
        {view.pending && <details><summary>本次请求信息</summary><p>订单编号：{view.pending.salesOrderId}</p><p>请求编号：{view.pending.command.requestId}</p></details>}
      </section> : view.busy ? <LoadingState compact label="读取或保存交付计划" rows={2} />
        : stage === 'saved' ? <section className="oc-delivery-result"><h3>交付计划已保存</h3><p>来源合同、生产排单和历史记录保持独立。</p>{view.data && <p>当前有 {view.data.plans.filter(row => !row.voidedAt).length} 条有效计划。</p>}</section>
        : stage === 'conflict' ? <section className="oc-delivery-result"><h3>本次变更未保存</h3><p>请重新读取计划，核对后再决定是否修改。</p></section>
        : view.data && <>
          {processing ? <p className="oc-delivery-note">加工订单无艾诺科合同对照。</p> : <DescriptionList columns={2} compact items={[
            { key: 'date', label: '艾诺科合同交期（只读）', value: view.data.sourceDeliveryDate ?? '未记录' },
            { key: 'quantity', label: '合同数量（对照）', value: view.data.sourceQuantity ?? '未记录' },
          ]} />}
          {stage === 'preview' && view.preview ? <>
            <h3>确认本次计划</h3>
            <div className="oc-delivery-table oc-delivery-preview-table" role="region" aria-label="交付计划变更预览" tabIndex={0}>
              <table><thead><tr><th>变更</th><th>修改前</th><th>修改后</th></tr></thead><tbody>{view.preview.changes.map((change, index) => <tr key={index}>
                <td data-label="变更">{changeLabels[change.kind]}</td><td data-label="修改前">{change.before ? `${change.before.deliveryDate ?? '日期未记录'} · ${change.before.quantity} 件` : '—'}</td>
                <td data-label="修改后">{change.after ? `${change.after.deliveryDate} · ${change.after.quantity} 件` : '作废，历史保留'}</td>
              </tr>)}</tbody></table>
            </div>
            <div className="oc-delivery-balance"><strong>有效日期计划合计：{view.preview.total ?? '暂无法汇总'} 件</strong><span>{processing && view.data.sourceQuantity === null ? '加工订单无艾诺科合同对照。' : balances[view.preview.quantityStatus]}</span></div>
            <p className="oc-delivery-note">差异仅作提示，不会修改合同数量或自动重分配计划。{view.data.ownership !== 'user_managed' && ' 保存后交付计划由织序维护，后续来源交期变化仅作对照。'}</p>
          </> : <>
            <div className="oc-delivery-toolbar"><h3>交付计划</h3><Button variant="secondary" size="compact" disabled={!editable} onClick={controller.add}>＋ 新增一期</Button></div>
            {activeRows.length ? <div className="oc-delivery-table" role="region" aria-label="交付计划编辑" tabIndex={0}>
              <table><thead><tr><th>交付日期</th><th>计划数量（件）</th><th>操作</th></tr></thead><tbody>{activeRows.map((row, index) => <tr key={row.editorId}>
                <td data-label="交付日期"><input className="qc-control" type="date" aria-label={`交付日期 ${index + 1}`} value={row.deliveryDate} disabled={!editable} onChange={event => controller.change(row.editorId, { deliveryDate: event.target.value })} /></td>
                <td data-label="计划数量（件）"><input className="qc-control" type="text" inputMode="decimal" aria-label={`计划数量 ${index + 1}`} maxLength={Math.max(64, row.quantity.length)} value={row.quantity} disabled={!editable} onChange={event => controller.change(row.editorId, { quantity: event.target.value })} /></td>
                <td>{view.voiding === row.editorId ? <div className="oc-delivery-void-confirm"><span>作废本期？</span><Button variant="danger" size="compact" disabled={!editable} onClick={controller.confirmVoid}>确认作废</Button><Button variant="text" size="compact" disabled={!editable} onClick={controller.cancelVoid}>取消</Button></div>
                  : <Button variant="text" size="compact" disabled={!editable} onClick={() => controller.requestVoid(row.editorId)}>{row.id ? '作废' : '移除'}</Button>}</td>
              </tr>)}</tbody></table>
            </div> : <p className="oc-delivery-empty">暂无有效计划，可新增一期；已保存的作废记录仍保留。</p>}
            {(oldVoids.length + stagedVoids.length > 0) && <details className="oc-delivery-history"><summary>作废记录（{oldVoids.length + stagedVoids.length}）</summary>
              {stagedVoids.map(row => <p key={row.editorId}>{row.deliveryDate || '日期未记录'} · {row.quantity} 件 · 待保存作废</p>)}
              {oldVoids.map(row => <p key={row.id}>{row.deliveryDate ?? '日期未记录'} · {row.quantity} 件 · 已作废（历史保留）</p>)}
            </details>}
            <p className="oc-delivery-note">修改交付计划不会改变来源事实；未改动的系统默认计划保持原值。</p>
          </>}
        </>}
    </Modal>
    <Modal open={retryOpen}
      title="确认重发原请求" description="服务端暂未查到已完成记录；这不是修改后重新保存。" onClose={controller.cancelRetry}
      footer={<><Button variant="secondary" onClick={controller.cancelRetry}>继续核对</Button><Button onClick={controller.retry}>确认重发同一请求</Button></>}>
      <p>将完全沿用原订单、请求编号、日期、数量及版本。系统按同一请求核对，不会新建另一份计划。</p>
    </Modal>
    <UnsavedDraftDialog open={Boolean(view.discard) && view.open && !closeDisabled} entityLabel="交付计划" onKeepEditing={controller.keepEditing} onDiscard={controller.discard} />
  </>;
}
