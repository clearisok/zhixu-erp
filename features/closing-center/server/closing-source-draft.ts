import { parseClosingSourceReconciliation, quantityUnits, unitsQuantity, type ClosingSourceReconciliation } from '../../../server/closing/month-plan-model';
import { reconcileClosingSource } from '../../../server/closing/source-reconciliation-model';
import type { ClosingMonthDisplayState } from './closing-month-display-projection';

/** Drafts are derived from the complete physical order; annual filters never enter. */
export function closingSourceChanges(state: ClosingMonthDisplayState) {
  if (!state.plan || state.observedSource.quantityState !== 'ready' || state.observedSource.quantity === null)
    throw new Error('closing_month_quantity_unknown');
  const source = state.observedSource, current = new Map<string | null, bigint>();
  if (source.businessType === 'processing') current.set(null, quantityUnits(source.quantity!));
  else {
    if (source.colors.some(row => row.ambiguous) || new Set(source.colors.map(row => row.id)).size !== source.colors.length)
      throw new Error('closing_month_source_colors_require_review');
    for (const row of source.colors) current.set(row.id, quantityUnits(row.quantity));
    if ([...current.values()].reduce((sum, value) => sum + value, BigInt(0)) !== quantityUnits(source.quantity!))
      throw new Error('closing_month_source_colors_require_review');
  }
  const prior = new Map<string | null, bigint>();
  for (const line of state.plan.lines) prior.set(line.colorId, (prior.get(line.colorId) ?? BigInt(0)) + quantityUnits(line.quantity));
  const colors = [...new Set([...prior.keys(), ...current.keys()])].map(colorId => {
    const before = prior.get(colorId) ?? BigInt(0), after = current.get(colorId) ?? BigInt(0), delta = after - before;
    return { colorId, before: unitsQuantity(before), after: unitsQuantity(after),
      delta: (delta < BigInt(0) ? '-' : '') + unitsQuantity(delta < BigInt(0) ? -delta : delta), decreasing: delta < BigInt(0) };
  });
  const additions = colors.filter(row => !row.decreasing && row.delta !== '0').map(row => ({ colorId: row.colorId, quantity: row.delta }));
  return { colors, additions };
}

export function closingSourceDraft(state: ClosingMonthDisplayState, quantities: Record<string, string>, reason: string): ClosingSourceReconciliation {
  if (!state.plan || !state.sourceChanged) throw new Error('closing_month_source_unchanged');
  const changes = closingSourceChanges(state);
  const adjustments = Object.entries(quantities).filter(([, quantity]) => quantity !== '').map(([lineId, quantity]) => ({ lineId, quantity }));
  const intent = parseClosingSourceReconciliation({ action: 'reconcile_source', orderId: state.plan.orderId,
    expectedVersion: state.plan.version, observedSourceFingerprint: state.observedSource.fingerprint, reason,
    adjustments, additions: changes.additions });
  let index = 0; const taken = new Set(state.plan.lines.map(line => line.id));
  const id = () => { let value: string; do { value = 'ffffffff-ffff-4fff-8fff-' + String(++index).padStart(12, '0'); } while (taken.has(value)); taken.add(value); return value; };
  const frozen = state.display.periods.filter(row => row.status === 'confirmed' || row.status === 'locked').map(row => row.month);
  reconcileClosingSource(state.plan, intent, state.observedSource, id, frozen);
  return intent;
}

export function closingSourceDraftError(value: unknown) {
  const code = (value as { code?: string })?.code ?? (value instanceof Error ? value.message : '');
  const messages: Record<string, string> = {
    invalid_closing_month_command: '请填写原因，并使用最多六位小数的有效数量；单次最多修改100项。',
    invalid_closing_quantity: '请输入有效数量，最多十二位整数和六位小数。',
    closing_month_quantity_unknown: '来源数量尚不完整，暂不能复核。',
    closing_month_source_unchanged: '来源尚未变化，无需复核。',
    closing_month_source_colors_require_review: '来源颜色或逐色数量不完整，请先核对来源。',
    closing_month_source_quantity_mismatch: '请明确减少原片段，使复核后总量与来源一致。',
    closing_month_source_color_quantity_mismatch: '请逐颜色核对减量；每种颜色都须与来源数量一致。',
    closing_month_period_not_open: '确认或锁定月份的数量不能在此修改，请先按原流程处理期间。',
    closing_month_source_increase_requires_addition: '原片段只允许减量；新增量统一进入待分月、未分配。',
    closing_month_source_scope_replacement_forbidden: '同一颜色不能同时减旧量再新增，以免覆盖原归属。',
    closing_month_line_changed: '原月份片段已变化，请关闭并重新读取。',
  };
  return messages[code] ?? '暂时无法完成复核，请核对数量后重新预览。';
}
