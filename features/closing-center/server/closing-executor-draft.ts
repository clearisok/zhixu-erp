import { parseClosingMonthIntent, quantityUnits, unitsQuantity, type ClosingMonthReconcile } from '../../../server/closing/month-plan-model';
import type { ClosingMonthDisplayState } from './closing-month-display-projection';

export function closingExecutorCandidates(state: ClosingMonthDisplayState, lineId: string) {
  const line = state.plan?.lines.find(row => row.id === lineId);
  if (!line || line.assignmentId !== null) return [];
  return state.executorCandidates.filter(row => row.salesOrderId === state.plan!.orderId && (row.colorId === null || row.colorId === line.colorId));
}
export function closingExecutorAllocation(state: ClosingMonthDisplayState, lineId: string, quantities: Record<string, string>) {
  const line = state.plan?.lines.find(row => row.id === lineId);
  if (!line || line.assignmentId !== null) throw Error('closing_month_executor_already_matched');
  const candidates = closingExecutorCandidates(state, lineId), parts: { assignmentId: string | null; quantity: string }[] = [];
  let selected = BigInt(0);
  for (const [assignmentId, raw] of Object.entries(quantities)) {
    if (raw === '') continue;
    if (!candidates.some(row => row.assignmentId === assignmentId)) throw Error('closing_month_executor_unavailable');
    const units = quantityUnits(raw); if (units === BigInt(0)) continue;
    selected += units; parts.push({ assignmentId, quantity: unitsQuantity(units) });
  }
  const remainder = quantityUnits(line.quantity) - selected;
  if (remainder < BigInt(0)) throw Error('closing_month_executor_quantity_mismatch');
  if (remainder > BigInt(0)) parts.push({ assignmentId: null, quantity: unitsQuantity(remainder) });
  return { parts, selected: unitsQuantity(selected), remainder: unitsQuantity(remainder) };
}
export function closingExecutorDraft(state: ClosingMonthDisplayState, lineId: string, quantities: Record<string, string>, reason: string): ClosingMonthReconcile {
  if (!state.plan || state.plan.quantityState !== 'ready') throw Error('closing_month_quantity_unknown');
  if (state.sourceChanged) throw Error('closing_month_source_changed');
  if (state.executorChanges.length) throw Error('closing_month_executor_review_required');
  const line = state.plan.lines.find(row => row.id === lineId);
  if (!line) throw Error('closing_month_line_changed');
  if (line.month && state.display.periods.some(row => row.month === line.month && (row.status === 'confirmed' || row.status === 'locked')))
    throw Error('closing_month_period_not_open');
  const allocation = closingExecutorAllocation(state, lineId, quantities);
  if (allocation.selected === '0') throw Error('closing_month_no_change');
  const intent = parseClosingMonthIntent({ action: 'match_executors', orderId: state.plan.orderId, expectedVersion: state.plan.version,
    reason, items: [{ lineId, parts: allocation.parts }] });
  if (intent.action !== 'match_executors') throw Error('invalid_closing_month_command');
  return intent;
}
export function closingExecutorDraftError(value: unknown) {
  const code = (value as { code?: string })?.code ?? (value instanceof Error ? value.message : '');
  const messages: Record<string, string> = {
    closing_month_executor_already_matched: '请选择原本未分配的片段，已有归属在此保持只读。',
    closing_month_executor_unavailable: '请选择本单同颜色的有效排单。',
    closing_month_executor_quantity_mismatch: '匹配数量不能超过所选片段，余量会保留未分配。',
    closing_month_quantity_unknown: '月份数量尚不完整，暂不能匹配。', closing_month_source_changed: '来源已变化，请先复核来源数量。',
    closing_month_executor_review_required: '原执行归属已变化，请先核对并处理原归属。',
    closing_month_period_not_open: '本片段所在月份已确认或锁定，请先按原流程处理期间。',
    closing_month_line_changed: '原片段已变化，请重新读取。', closing_month_no_change: '请填写至少一个执行方的匹配数量。',
    invalid_closing_quantity: '请输入最多六位小数的有效数量。', invalid_closing_month_command: '请填写原因并核对数量；一次最多匹配100项。',
  };
  return messages[code] ?? '暂不能完成匹配，请核对后重新预览。';
}
