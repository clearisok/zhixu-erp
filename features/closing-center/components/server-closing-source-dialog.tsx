"use client";
import { useState } from 'react';
import { Button, FormItem, Modal } from '@/components/foundation';
import { useServerNavigationProtection } from '@/components/foundation/server-navigation-protection';
import { closingSourceChanges, closingSourceDraft, closingSourceDraftError } from '../server/closing-source-draft';
import type { ClosingYear } from '../server/closing-year-projection';
import { closingNumber } from './closing-ui-owner';
import { useClosingMonthEditor } from './use-closing-month-editor';

export function ServerClosingSourceDialog({ row, context, onClose, onChanged }: {
  row: ClosingYear['items'][number]; context: string; onClose: () => void; onChanged: () => void;
}) {
  const editor = useClosingMonthEditor(row.order.id, context + ':source:' + row.order.id, onChanged);
  const { data, state, blocked, done, controller } = editor;
  const [quantities, setQuantities] = useState<Record<string, string>>({}), [reason, setReason] = useState(''), [error, setError] = useState('');
  const dirty = !done && Boolean(reason || Object.values(quantities).some(Boolean) || state?.preview);
  useServerNavigationProtection({ blocked, dirty, message: '来源复核结果尚未核实，请先核对原请求。' });
  let changes: ReturnType<typeof closingSourceChanges> | undefined, sourceError = '';
  if (data?.plan) try { changes = closingSourceChanges(data); } catch (value) { sourceError = closingSourceDraftError(value); }
  const plan = data?.plan;
  const color = (id: string | null) => id === null ? '整单 / 未分颜色' : data?.display.colors.find(item => item.colorId === id)?.currentSourceName
    ?? data?.display.colors.find(item => item.colorId === id)?.identityName ?? '当时未记录';
  const executor = (id: string | null) => {
    if (id === null) return '未分配';
    const ref = plan?.executorBasis.find(item => item.assignmentId === id);
    const display = ref && data?.display.executors.find(item => item.assignmentId === id && item.resourceSnapshotHash === ref.resourceSnapshotHash
      && item.executionType === ref.executionType && item.executorId === ref.executorId);
    return display?.name ? (display.executionType === 'internal' ? '内制 · ' : '外发 · ') + display.name : '当时未记录';
  };
  const frozen = (month: string | null) => month !== null && data?.display.periods.some(item => item.month === month && (item.status === 'confirmed' || item.status === 'locked'));
  const edit = (run: () => void) => { if (blocked || done) return; controller.current?.discardPreview(); setError(''); run(); };
  const close = () => { if (blocked || dirty && !window.confirm('放弃本次未保存的来源复核输入？')) return; controller.current?.discardPreview(); onClose(); };
  const preview = async () => {
    if (!data || !editor.owns() || blocked || done) return;
    try { const intent = closingSourceDraft(data, quantities, reason); setError(''); await controller.current?.preview(intent); }
    catch (value) { if (editor.owns()) setError(closingSourceDraftError(value)); }
  };
  return <Modal open title="复核来源数量" description={row.order.factoryStyleNo || row.order.styleNo || row.order.orderNo}
    className="sc-adjustment-dialog" onClose={close} closeDisabled={blocked} footer={<>
      <div className="sc-command-status" aria-live="polite">{(error || editor.readError) && <p role="alert">{error || editor.readError}</p>}
        {state?.error && <p role="alert">{state.error}</p>}{state?.message && <p>{state.message}</p>}
        {(state?.pending || state?.pendingUnavailable) && <Button variant="secondary" size="compact" disabled={state.busy} onClick={() => void controller.current?.check()}>核对原请求</Button>}
        {state?.retryAllowed && <Button variant="secondary" size="compact" disabled={state.busy} onClick={() => { if (window.confirm('仅重试完全相同的原请求？')) void controller.current?.retry(true); }}>重试原请求</Button>}
      </div><div className="sc-footer-actions"><Button variant="secondary" disabled={blocked} onClick={close}>{done ? '完成' : '取消'}</Button>
        {!done && (state?.preview ? <Button disabled={blocked} onClick={() => void controller.current?.apply()}>确认复核</Button>
          : <Button disabled={blocked || !plan || !changes || !data?.sourceChanged || !editor.session.hasPermission('closing.edit')} onClick={() => void preview()}>预览复核</Button>)}
      </div></>}>
      {!data ? <p role="status">{editor.readError ? '未能读取完整资料，请关闭后重新读取。' : '正在读取整单来源与月份分配…'}</p> : !plan ? <p>此单尚无正式月份计划，不自动补造历史数据。</p> : <>
        <div className="sc-order-reference"><strong>{row.order.orderNo}</strong><span>原计划量 {closingNumber(plan.sourceQuantity)}</span><span>当前来源量 {closingNumber(data.observedSource.quantity)}</span></div>
        <p className="sc-scope-note">核对整张订单，不受外层筛选影响。新增量进入待分月、未分配；原片段只能减量，确认或锁定月份保持。</p>
        {sourceError && <p role="alert" className="sc-alert">{sourceError}</p>}{!data.sourceChanged && <p className="sc-alert">来源尚未变化，无需复核。</p>}
        <fieldset className="sc-adjustment-fields" disabled={blocked || done || !editor.session.hasPermission('closing.edit')}>
          <div className="sc-table-scroll"><table aria-label="逐颜色来源差异"><thead><tr><th>颜色</th><th>原计划量</th><th>当前来源量</th><th>增减</th></tr></thead><tbody>
            {changes?.colors.map(item => <tr key={item.colorId ?? 'whole'}><td>{color(item.colorId)}</td><td>{closingNumber(item.before)}</td><td>{closingNumber(item.after)}</td><td>{item.delta}</td></tr>)}
          </tbody></table></div>
          <div className="sc-table-scroll"><table aria-label="来源复核原片段"><thead><tr><th>颜色</th><th>原月份</th><th>执行方</th><th>原数量</th><th>复核后数量</th></tr></thead><tbody>
            {plan.lines.map(line => <tr key={line.id}><td>{color(line.colorId)}</td><td>{line.month ?? '待分月'}{frozen(line.month) && <small>确认 / 锁定，只读</small>}</td><td>{executor(line.assignmentId)}</td><td>{closingNumber(line.quantity)}</td><td>
              {frozen(line.month) ? closingNumber(line.quantity) : <input inputMode="decimal" aria-label={'复核后数量 ' + line.id} value={quantities[line.id] ?? ''} placeholder={'保持 ' + line.quantity} onChange={event => edit(() => setQuantities(current => ({ ...current, [line.id]: event.target.value })))} />}
            </td></tr>)}
          </tbody></table></div>
          {!!changes?.additions.length && <section aria-label="新增待分月数量"><h3>新增待分月 / 未分配</h3>{changes.additions.map(item => <p key={item.colorId ?? 'whole'}>{color(item.colorId)} · {closingNumber(item.quantity)}</p>)}</section>}
          <FormItem label="复核原因" required><input aria-label="来源复核原因" value={reason} maxLength={2000} onChange={event => edit(() => setReason(event.target.value))} /></FormItem>
        </fieldset>
        {state?.preview && <section className="sc-preview" aria-label="来源复核预览"><h3>复核后完整月份分配</h3><p>原交期、生产事实、价格及已采用财务快照保持；开放期间财务另行明确同步。</p>
          <div className="sc-table-scroll"><table><thead><tr><th>颜色</th><th>月份</th><th>执行方</th><th>数量</th></tr></thead><tbody>{state.preview.after.map(line => <tr key={line.id}><td>{color(line.colorId)}</td><td>{line.month ?? '待分月'}</td><td>{executor(line.assignmentId)}</td><td>{closingNumber(line.quantity)}</td></tr>)}</tbody></table></div>
        </section>}
      </>}
  </Modal>;
}
