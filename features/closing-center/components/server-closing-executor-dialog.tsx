"use client";
import { useState } from 'react';
import { Button, FormItem, Modal } from '@/components/foundation';
import { useServerNavigationProtection } from '@/components/foundation/server-navigation-protection';
import { closingExecutorAllocation, closingExecutorCandidates, closingExecutorDraft, closingExecutorDraftError } from '../server/closing-executor-draft';
import type { ClosingYear } from '../server/closing-year-projection';
import { closingNumber, productionLabel } from './closing-ui-owner';
import { useClosingMonthEditor } from './use-closing-month-editor';
import { parseClosingMonthIntent } from '../../../server/closing/month-plan-model';
import { closingRequestHash } from '../server/closing-request-hash';

export function ServerClosingExecutorDialog({ row, context, onClose, onChanged }: {
  row: ClosingYear['items'][number]; context: string; onClose: () => void; onChanged: () => void;
}) {
  const editor = useClosingMonthEditor(row.order.id, context + ':executor:' + row.order.id, onChanged);
  const { data, state, blocked, done, controller } = editor;
  const [selected, setSelected] = useState(''), [quantities, setQuantities] = useState<Record<string, string>>({});
  const [reason, setReason] = useState(''), [error, setError] = useState('');
  const recovering = Boolean(data?.executorChanges.length);
  const dirty = !done && Boolean(reason || Object.values(quantities).some(Boolean) || state?.preview);
  useServerNavigationProtection({ blocked, dirty, message: '执行方匹配结果尚未核实，请先核对原请求。' });
  const plan = data?.plan, unassigned = plan?.lines.filter(line => line.assignmentId === null) ?? [];
  const lineId = selected || unassigned[0]?.id || '', candidates = data ? closingExecutorCandidates(data, lineId) : [];
  const line = plan?.lines.find(value => value.id === lineId);
  const color = (id: string | null) => id === null ? '整单 / 未分颜色' : data?.display.colors.find(value => value.colorId === id)?.currentSourceName
    ?? data?.display.colors.find(value => value.colorId === id)?.identityName ?? '当时未记录';
  const executor = (id: string | null, current = false) => {
    if (id === null) return '未分配';
    const ref = current ? data?.executorCandidates.find(value => value.assignmentId === id) : plan?.executorBasis.find(value => value.assignmentId === id);
    const display = ref && data?.display.executors.find(value => value.assignmentId === id && value.resourceSnapshotHash === ref.resourceSnapshotHash
      && value.executionType === ref.executionType && value.executorId === ref.executorId);
    return display?.name ? (display.executionType === 'internal' ? '内制 · ' : '外发 · ') + display.name : '当时未记录';
  };
  const frozen = (month: string | null) => month !== null && data?.display.periods.some(value => value.month === month && (value.status === 'confirmed' || value.status === 'locked'));
  let allocation: ReturnType<typeof closingExecutorAllocation> | undefined, allocationError = '';
  if (data && line) try { allocation = closingExecutorAllocation(data, lineId, quantities); } catch (value) { allocationError = closingExecutorDraftError(value); }
  const unavailable = Boolean(data?.sourceChanged || data?.executorChanges.length || frozen(line?.month ?? null));
  const edit = (run: () => void) => { if (blocked || done) return; controller.current?.discardPreview(); setError(''); run(); };
  const close = () => { if (blocked || dirty && !window.confirm('放弃本次未保存的执行方匹配输入？')) return; controller.current?.discardPreview(); onClose(); };
  const preview = async () => {
    if (!data || !editor.owns() || blocked || done) return;
    try {
      const intent = recovering ? parseClosingMonthIntent({ action: 'release_executors', orderId: row.order.id, expectedVersion: data.plan!.version, reason,
        assignmentIds: data.executorChanges.map(value => value.assignmentId), observedExecutorFingerprint: await closingRequestHash([...data.executorCandidates].sort((a,b) => a.assignmentId.localeCompare(b.assignmentId))) })
        : closingExecutorDraft(data, lineId, quantities, reason);
      if (!editor.owns()) return; setError(''); await controller.current?.preview(intent); }
    catch (value) { if (editor.owns()) setError(closingExecutorDraftError(value)); }
  };
  return <Modal open title="匹配执行方" description={row.order.factoryStyleNo || row.order.styleNo || row.order.orderNo}
    className="sc-adjustment-dialog" onClose={close} closeDisabled={blocked} footer={<>
      <div className="sc-command-status" aria-live="polite">{(error || editor.readError) && <p role="alert">{error || editor.readError}</p>}
        {state?.error && <p role="alert">{state.error}</p>}{state?.message && <p>{state.message}</p>}
        {(state?.pending || state?.pendingUnavailable) && <Button variant="secondary" size="compact" disabled={state.busy} onClick={() => void controller.current?.check()}>核对原请求</Button>}
        {state?.retryAllowed && <Button variant="secondary" size="compact" disabled={state.busy} onClick={() => { if (window.confirm('仅重试完全相同的原请求？')) void controller.current?.retry(true); }}>重试原请求</Button>}
      </div><div className="sc-footer-actions"><Button variant="secondary" disabled={blocked} onClick={close}>{done ? '完成' : '取消'}</Button>
        {!done && (state?.preview ? <Button disabled={blocked} onClick={() => void controller.current?.apply()}>{recovering ? '确认恢复未分配' : '确认匹配'}</Button>
          : <Button disabled={blocked || !plan || (!recovering && (!line || unavailable)) || !editor.session.hasPermission('closing.edit')} onClick={() => void preview()}>{recovering ? '预览恢复未分配' : '预览匹配'}</Button>)}
      </div></>}>
      {!data ? <p role="status">{editor.readError ? '未能读取完整资料，请关闭后重新读取。' : '正在读取整单月份与执行资料…'}</p> : !plan ? <p>本单尚无正式月份计划。</p> : <>
        <p className="sc-scope-note">只匹配原本未分配的数量，不改变颜色、月份或生产。排单量及完成量仅供参考，剩余数量保持未分配。</p>
        {data.sourceChanged && <p role="alert" className="sc-alert">{recovering ? '执行归属和来源均已变化：先恢复未分配，再复核来源数量，最后重新匹配。' : '来源数量或颜色已变化，请先复核来源数量。'}</p>}
        {recovering && <section className="sc-alert" aria-label="执行归属恢复"><h3>原执行归属已变化</h3><p>仅将以下变动归属恢复为未分配；原片段、颜色、数量和月份保持。有过实际产出或月份已确认 / 锁定时禁止恢复。</p>
          {data.executorChanges.map(value => <p key={value.assignmentId}>{executor(value.assignmentId)} → {executor(value.assignmentId, true)}</p>)}</section>}
        <fieldset disabled={blocked || done || !editor.session.hasPermission('closing.edit')} className="sc-adjustment-fields">
          {!recovering && <><FormItem label="未分配片段"><select aria-label="待匹配月份片段" value={lineId} onChange={event => edit(() => { setSelected(event.target.value); setQuantities({}); })}>
            {unassigned.map(value => <option key={value.id} value={value.id}>{color(value.colorId)} · {value.month ?? '待分月'} · {closingNumber(value.quantity)}{frozen(value.month) ? '（已确认 / 锁定）' : ''}</option>)}
          </select></FormItem>
          {!unassigned.length ? <p>本单数量均已明确归属，此处只读查看。</p> : <>
            {frozen(line?.month ?? null) && <p role="alert">该片段所在月份已确认或锁定，请先按原流程处理期间。</p>}
            <div className="sc-table-scroll"><table aria-label="执行方匹配候选"><thead><tr><th>执行方</th><th>颜色</th><th>排单量</th><th>实际完成量</th><th>状态</th><th>本次匹配量</th></tr></thead><tbody>
              {candidates.map(value => <tr key={value.assignmentId}><td>{executor(value.assignmentId, true)}</td><td>{color(value.colorId)}</td><td>{closingNumber(value.plannedQuantity)}</td>
                <td>{value.execution ? closingNumber(value.execution.completedQuantity) : '暂无完成记录'}</td><td>{value.planStatus === 'cancelled' ? '排单已取消' : value.execution ? productionLabel[value.execution.status] : '未制作'}</td>
                <td><input inputMode="decimal" aria-label={'匹配数量 ' + value.assignmentId} disabled={unavailable} value={quantities[value.assignmentId] ?? ''} placeholder="0" onChange={event => edit(() => setQuantities(current => ({ ...current, [value.assignmentId]: event.target.value })))} /></td></tr>)}
            </tbody></table></div>
            {!candidates.length && <p>暂无本单同颜色的排单，请先建立真实排单。</p>}
            {allocationError ? <p role="alert">{allocationError}</p> : <p>本次匹配 {allocation?.selected ?? '0'}；余量 {allocation?.remainder ?? line?.quantity ?? '0'} 保持未分配。</p>}
          </>}</>}
          <FormItem label={recovering ? '恢复原因' : '匹配原因'} required><input aria-label="执行方匹配原因" maxLength={2000} value={reason} onChange={event => edit(() => setReason(event.target.value))} /></FormItem>
        </fieldset>
        {plan.lines.some(value => value.assignmentId !== null) && <details><summary>查看已有归属（只读）</summary><div className="sc-table-scroll"><table><thead><tr><th>颜色</th><th>月份</th><th>执行方</th><th>数量</th></tr></thead><tbody>
          {plan.lines.filter(value => value.assignmentId !== null).map(value => <tr key={value.id}><td>{color(value.colorId)}</td><td>{value.month ?? '待分月'}</td><td>{executor(value.assignmentId)}</td><td>{closingNumber(value.quantity)}</td></tr>)}
        </tbody></table></div></details>}
        {state?.preview && <section className="sc-preview" aria-label="执行方匹配预览"><h3>{recovering ? '恢复后完整月份分配' : '匹配后完整月份分配'}</h3>
          {state.preview.warnings.map(value => <p className="sc-alert" key={value.assignmentId + value.code}>{executor(value.assignmentId, true)}：{value.code === 'executor_plan_cancelled' ? '排单已取消' : '归属量超过排单 / 完成参考量'}；参考 {closingNumber(value.referenceQuantity)}，拟归属 {closingNumber(value.quantity)}。仅提示，数量不截断。</p>)}
          <div className="sc-table-scroll"><table><thead><tr><th>颜色</th><th>月份</th><th>执行方</th><th>数量</th></tr></thead><tbody>{state.preview.after.map(value => <tr key={value.id}><td>{color(value.colorId)}</td><td>{value.month ?? '待分月'}</td><td>{executor(value.assignmentId, true)}</td><td>{closingNumber(value.quantity)}</td></tr>)}</tbody></table></div>
        </section>}
      </>}
  </Modal>;
}
