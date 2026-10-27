import type { ClosingIntent } from '../../../server/closing/contract';
import { closingChannels, closingQuantity, closingTaxRate, closingUuid } from '../../../server/closing/contract';
import type { readClosingOrderBasis } from '../../../server/closing/basis-service';
import type { listClosingPeriods, readClosingHistory, readClosingPeriodDetail } from '../../../server/closing/read-service';
import type { previewClosingCommand } from '../../../server/closing/service';
import type { ClosingReadQuery } from '../../../server/closing/read-contract';
import { canonicalPlanJson } from '../../../server/production-scheduling/canonical-json';
import { ServerAuthError } from '../../server-auth/server-auth-client';

export type ClosingVisibility = { sale: boolean; work: boolean };
export type ClosingPreview = Awaited<ReturnType<typeof previewClosingCommand>>;
export type ClosingBasis = Awaited<ReturnType<typeof readClosingOrderBasis>>;
export type ClosingPeriods = Awaited<ReturnType<typeof listClosingPeriods>>;
export type ClosingDetail = Awaited<ReturnType<typeof readClosingPeriodDetail>>;
export type ClosingHistory = Awaited<ReturnType<typeof readClosingHistory>>;
export const CLOSING_RESPONSE_LIMIT = 1048576;
export class ClosingClientError extends ServerAuthError {
  constructor(status: number, code: string) { super(status, code, messages[code]); }
}
export const messages: Record<string, string> = {
  closing_response_invalid: '返回内容无法完整核对，请保留原请求。', closing_receipt_mismatch: '回执与原关账命令不一致，原请求仍保留。',
  closing_response_too_large: '记录较多，无法完整读取，请缩小查询范围。', closing_owner_changed: '登录身份或操作范围已变化，原请求仍保留。',
  closing_outcome_unknown: '关账结果尚未确认，请先核对原请求。', closing_request_failed: '关账暂不可用，请保留原请求并稍后核对。',
  invalid_closing_command: '请核对月份、税率确认、数量和归属；价格由订单已采用版本提供。', invalid_closing_query: '查询条件无效，请重新选择。',
  closing_period_version_conflict: '月份已更新，请重新读取并预览。', closing_allocation_version_conflict: '关账记录已更新，请重新读取并预览。',
  closing_preview_changed: '关账依据已变化，请重新读取并预览。', closing_execution_review_required: '生产依据已更正，请先人工复核。',
  closing_period_not_open: '月份当前不开放，请先取消确认或按权限重开。', closing_period_state_conflict: '月份状态已变化，请重新读取。',
  closing_usd_work_basis_required: '缺少已采用的 USD 工价，请先在报价中心明确确认和采用。', closing_sale_basis_required: '缺少可用的已采用 CNY 成交价。',
  closing_details_restricted: '当前无权查看原拒绝的金额详情，原请求未被采用。', closing_period_already_exists: '该月份已存在，请打开已有月份。',
  invalid_closing_year_query: '请选择有效年份和筛选范围。', closing_year_order_limit: '匹配订单较多，请缩小搜索范围。',
  closing_year_portion_limit: '月份片段较多，请缩小搜索范围。', closing_year_response_too_large: '记录较多，请缩小范围后读取。',
  invalid_closing_month_command: '请核对原月份片段、调整数量、目标月份和原因。', closing_month_version_conflict: '本单月份已更新，请重新读取并预览。',
  closing_month_preview_changed: '月份或执行依据已变化，请重新读取并预览。', closing_month_request_conflict: '原请求内容不一致，请保留现场并核对。',
  closing_month_source_changed: '订单来源数量或颜色已变化，请先核对月份依据。', closing_month_period_not_open: '源月或目标月已确认或锁定，请先按权限处理。',
  closing_month_quantity_unknown: '来源数量尚未明确，暂不能调月。', closing_month_quantity_unrepresentable: '来源数量超出当前调月范围，请先核对。',
  closing_month_quantity_exceeded: '本次调入数量超过原片段的可调数量。', closing_month_no_change: '本次选择没有改变月份或执行归属。',
  closing_month_executor_review_required: '执行归属已变化，请先核对，原月份量保持。', closing_month_not_initialized: '本单没有正式月份计划，未自动补造历史记录。',
  closing_month_legacy_allocations_require_review: '本单有既有手工关账记录，请先核对，不能重复计量。',
};
export const invalidClosingResponse = (): never => { throw new ClosingClientError(502, 'closing_response_invalid'); };
export function obj(value: unknown): Record<string, unknown> { if (!value || typeof value !== 'object' || Array.isArray(value)) return invalidClosingResponse(); return value as Record<string, unknown>; }
export function keys(row: Record<string, unknown>, required: string[], optional: string[] = []) {
  if (required.some(key => !Object.hasOwn(row, key)) || Object.keys(row).some(key => !required.includes(key) && !optional.includes(key))) invalidClosingResponse();
}
export function str(value: unknown, empty = false, max = 2000): string {
  if (typeof value !== 'string' || !empty && !value || value.length > max || value.includes('\0')
    || new TextDecoder('utf8', { ignoreBOM: true }).decode(new TextEncoder().encode(value)) !== value) return invalidClosingResponse(); return value;
}
export function num(value: unknown, min = 0, max = 2147483647): number { if (!Number.isSafeInteger(value) || Number(value) < min || Number(value) > max) return invalidClosingResponse(); return value as number; }
export function bool(value: unknown): boolean { if (typeof value !== 'boolean') return invalidClosingResponse(); return value; }
export function arr(value: unknown, max: number): unknown[] { if (!Array.isArray(value) || value.length > max) return invalidClosingResponse(); return value; }
export function member(value: unknown, values: readonly string[]): string { if (typeof value !== 'string' || !values.includes(value)) return invalidClosingResponse(); return value; }
export function nullable(value: unknown, parse: (value: unknown) => unknown) { if (value !== null) parse(value); }
export function same(left: unknown, right: unknown) { if (canonicalPlanJson(left) !== canonicalPlanJson(right)) throw new ClosingClientError(502, 'closing_receipt_mismatch'); }
export function uid(value: unknown) { try { const id = closingUuid(value); if (id !== value) return invalidClosingResponse(); return id; } catch { return invalidClosingResponse(); } }
export function hash(value: unknown) { if (typeof value !== 'string' || !/^[a-f0-9]{64}$/u.test(value)) return invalidClosingResponse(); return value; }
export function decimal(value: unknown) { const text = str(value, false, CLOSING_RESPONSE_LIMIT); if (!/^\d+(?:\.\d+)?$/u.test(text)) return invalidClosingResponse(); return text; }
export function tax(value: unknown) { try { same(closingTaxRate(value), value); } catch { invalidClosingResponse(); } }
export function date(value: unknown) { const text = str(value); if (!/^\d{4}-\d{2}-\d{2}$/u.test(text) || !Number.isFinite(Date.parse(text)) || new Date(text).toISOString().slice(0, 10) !== text) invalidClosingResponse(); }
function time(value: unknown) { const text = str(value); if (!Number.isFinite(Date.parse(text)) || new Date(text).toISOString() !== text) invalidClosingResponse(); }
export function exactAmount(value: unknown) {
  const row = obj(value); keys(row, ['numerator', 'denominator', 'decimal', 'scale', 'rounding']);
  if (!/^(0|[1-9]\d*)$/u.test(str(row.numerator, false, CLOSING_RESPONSE_LIMIT)) || !/^[1-9]\d*$/u.test(str(row.denominator, false, CLOSING_RESPONSE_LIMIT))) invalidClosingResponse();
  decimal(row.decimal); same(row.scale, 6); same(row.rounding, 'half_up');
}
function output(value: unknown, allowed: boolean, currency: string, withPrice = false, bucket?: string) {
  const row = obj(value); if (row.visibility === 'restricted') { keys(row, ['visibility']); return false; }
  same(row.visibility, 'allowed'); if (!allowed) return invalidClosingResponse();
  keys(row, ['visibility', 'currency', 'amount', ...(withPrice ? ['price'] : []), ...(bucket ? ['bucket'] : [])]);
  same(row.currency, currency); if (bucket) same(row.bucket, bucket); if (withPrice) decimal(row.price); exactAmount(row.amount); return true;
}
export function references(value: unknown, ownerId: string, max = 500) {
  const seen = new Set<string>(); for (const item of arr(value, max)) {
    const row = obj(item); keys(row, ['assignmentId', 'salesOrderId', 'assignmentVersion', 'colorId', 'executionType', 'executorId', 'resourceSnapshotHash', 'plannedQuantity', 'planStatus', 'execution']);
    const id = uid(row.assignmentId); if (seen.has(id)) invalidClosingResponse(); seen.add(id); same(row.salesOrderId, ownerId);
    num(row.assignmentVersion, 1); nullable(row.colorId, uid); member(row.executionType, ['internal', 'outsource']); uid(row.executorId); hash(row.resourceSnapshotHash); decimal(row.plannedQuantity); member(row.planStatus, ['planned', 'cancelled']);
    if (row.execution !== null) {
      const e = obj(row.execution); keys(e, ['version', 'status', 'completedQuantity', 'actualStartDate', 'actualCompletedDate']); num(e.version, 1);
      member(e.status, ['in_progress', 'completed']); decimal(e.completedQuantity); nullable(e.actualStartDate, date); nullable(e.actualCompletedDate, date);
    }
  }
}
function order(value: unknown, full = false) {
  const row = obj(value); keys(row, ['id', 'orderNo', 'businessType', ...(full ? ['version', 'lifecycleState', 'quantity', 'attributionVersion'] : [])]);
  uid(row.id); str(row.orderNo); member(row.businessType, ['ainuoke_contract', 'processing']);
  if (full) { num(row.version, 1); str(row.lifecycleState); nullable(row.quantity, decimal); num(row.attributionVersion); }
  return row;
}
function snapshot(value: unknown, view: ClosingVisibility) {
  const row = obj(value); keys(row, ['schemaVersion', 'order', 'commercial', 'colorId', 'colorName', 'assignmentId', 'quantity', 'channels', 'taxRatePercent', 'quantityBasis', 'executor', 'productionBasis', 'reviewBasis', 'outputs'], ['remark']);
  same(row.schemaVersion, 'server-closing-allocation.v1'); const o = order(row.order), owner = uid(o.id), c = obj(row.commercial);
  keys(c, ['id', 'version', 'quoteId', 'revisionId', 'priceVersionId']); uid(c.id); num(c.version, 1); str(c.quoteId); str(c.revisionId); str(c.priceVersionId);
  nullable(row.colorId, uid); nullable(row.colorName, value => str(value)); nullable(row.assignmentId, uid); same(closingQuantity(row.quantity), row.quantity); tax(row.taxRatePercent);
  const channels = closingChannels(row.channels); if (o.businessType === 'processing' && channels.sales) invalidClosingResponse();
  const q = obj(row.quantityBasis); keys(q, ['order', 'color', 'planned', 'completed']); for (const value of Object.values(q)) nullable(value, decimal);
  if (row.executor !== null) {
    const e = obj(row.executor); keys(e, ['type', 'id', 'name', 'resourceSnapshotHash', 'version']); member(e.type, ['internal', 'outsource']); uid(e.id); str(e.name); nullable(e.resourceSnapshotHash, hash); nullable(e.version, value => num(value, 1));
  }
  references(row.productionBasis, owner, 1); references(row.reviewBasis, owner, 1);
  same(arr(row.productionBasis, 1).length, arr(row.reviewBasis, 1).length);
  for (const ref of [...arr(row.productionBasis, 1), ...arr(row.reviewBasis, 1)]) same(obj(ref).assignmentId, row.assignmentId);
  same(arr(row.productionBasis, 1).length === 0, row.assignmentId === null);
  const out = obj(row.outputs); keys(out, [...(channels.sales ? ['garmentSale'] : []), ...(channels.work ? ['work'] : [])]);
  const saleVisible = !channels.sales || output(out.garmentSale, view.sale, 'CNY', true);
  const workVisible = !channels.work || output(out.work, view.work, 'USD', true, o.businessType === 'processing' ? 'processing_service' : 'distribution_labor');
  if (Object.hasOwn(row, 'remark')) { if (!saleVisible || !workVisible) invalidClosingResponse(); str(row.remark, true); }
  return { row, fullyVisible: saleVisible && workVisible };
}
const periodActions = ['create_period', 'allocation_change', 'confirm_period', 'unconfirm_period', 'lock_period', 'reopen_period'];
function period(value: unknown, view: ClosingVisibility) {
  const row = obj(value); keys(row, ['id', 'month', 'versionId', 'version', 'status', 'taxRatePercent', 'actorName', 'action', 'recordedAt'], ['remark', 'reason']);
  uid(row.id); if (!/^(19|20|21)\d{2}-(0[1-9]|1[0-2])$/u.test(str(row.month))) invalidClosingResponse(); uid(row.versionId); num(row.version, 1);
  member(row.status, ['open', 'confirmed', 'locked']); tax(row.taxRatePercent); str(row.actorName, true); member(row.action, periodActions); time(row.recordedAt);
  for (const key of ['remark', 'reason']) if (Object.hasOwn(row, key)) { if (!view.sale || !view.work) invalidClosingResponse(); str(row[key], true); }
  return row;
}
function allocation(value: unknown, view: ClosingVisibility, periodId?: string) {
  const row = obj(value); keys(row, ['id', 'periodId', 'versionId', 'version', 'status', 'actorName', 'action', 'recordedAt', 'snapshot', 'executionReview'], ['reason']);
  uid(row.id); uid(row.periodId); if (periodId) same(row.periodId, periodId); uid(row.versionId); num(row.version, 1); member(row.status, ['active', 'voided']);
  str(row.actorName, true); member(row.action, ['create_allocation', 'update_allocation', 'review_allocation', 'void_allocation']); time(row.recordedAt);
  const s = snapshot(row.snapshot, view); if (Object.hasOwn(row, 'reason')) { if (!s.fullyVisible) invalidClosingResponse(); str(row.reason, true); }
  const review = obj(row.executionReview);
  if (row.status === 'voided') { keys(review, ['status', 'requiresReview', 'changes']); same(review.status, 'not_evaluated_voided'); same(review.requiresReview, false); same(review.changes, null); }
  else {
    keys(review, ['status', 'changes', 'requiresReview', 'lockedSnapshotPreserved']); member(review.status, ['unchanged', 'locked_snapshot_with_later_changes', 'review_required', 'historical_snapshot_with_later_changes', 'historical_snapshot']); bool(review.requiresReview); bool(review.lockedSnapshotPreserved);
    for (const change of arr(review.changes, 1)) {
      const c = obj(change); keys(c, ['assignmentId', 'reasons']); same(c.assignmentId, s.row.assignmentId);
      for (const reason of arr(c.reasons, 8)) member(reason, ['referenced_assignment_unavailable', 'assignment_basis_changed', 'production_execution_recorded', 'production_execution_unavailable', 'execution_version_changed', 'completed_quantity_changed', 'actual_dates_changed', 'execution_status_changed']);
    }
  }
  return row;
}
function page(row: Record<string, unknown>, query: ClosingReadQuery) {
  same(row.offset, query.offset); same(row.limit, query.limit); num(row.total); const items = arr(row.items, query.limit);
  same(items.length, Math.min(query.limit, Math.max(0, Number(row.total) - query.offset))); return items;
}
export function parseClosingPeriods(value: unknown, query: ClosingReadQuery, view: ClosingVisibility): ClosingPeriods {
  const row = obj(value); keys(row, ['items', 'total', 'offset', 'limit']); const seen = new Set<string>(); let prior = '9999-99';
  for (const value of page(row, query)) { const p = period(value, view); if (seen.has(uid(p.id)) || String(p.month) >= prior) invalidClosingResponse(); seen.add(uid(p.id)); prior = String(p.month);
    if (query.year) same(String(p.month).slice(0, 4), query.year); if (query.status) same(p.status, query.status); }
  return row as unknown as ClosingPeriods;
}
export function parseClosingDetail(value: unknown, periodId: string, query: ClosingReadQuery, view: ClosingVisibility): ClosingDetail {
  const row = obj(value); keys(row, ['period', 'summary', 'total', 'offset', 'limit', 'reviewRequiredCount', 'laterCorrectionCount', 'items', 'source', 'automaticMonthAllocation', 'currentPeriodVersion'],['monthFinancial']);
  const p = period(row.period, view); same(p.id, periodId); if (query.version !== null) same(p.version, query.version); num(row.currentPeriodVersion, Number(p.version));
  same(row.source, 'server_closing_snapshots'); same(row.automaticMonthAllocation, false); num(row.reviewRequiredCount); num(row.laterCorrectionCount);
  const seen = new Set<string>(); for (const item of page(row, query)) { const a = allocation(item, view, periodId); if (seen.has(uid(a.id))) invalidClosingResponse(); seen.add(uid(a.id)); if (!query.includeVoided) same(a.status, 'active'); }
  const s = obj(row.summary); keys(s, ['activeCount', 'voidedCount', 'registeredQuantity', 'salesQuantity', 'distributionWorkQuantity', 'processingServiceQuantity', 'quantityMeaning', 'garmentSalesCny', 'distributionLaborUsd', 'processingServiceUsd']);
  num(s.activeCount); num(s.voidedCount); member(s.quantityMeaning,['one_manual_quantity_per_record_channels_are_not_added','distinct_month_portions_manual_records_separate','inconsistent_financial_portions_requires_sync']);
  same(row.total, Number(s.activeCount) + (query.includeVoided ? Number(s.voidedCount) : 0)); num(row.reviewRequiredCount, 0, Number(s.activeCount)); num(row.laterCorrectionCount, 0, Number(s.activeCount));
  if(s.quantityMeaning==='inconsistent_financial_portions_requires_sync')same(s.registeredQuantity,null);else decimal(s.registeredQuantity);
  for (const key of ['salesQuantity', 'distributionWorkQuantity', 'processingServiceQuantity']) decimal(s[key]);
  output(s.garmentSalesCny, view.sale, 'CNY'); output(s.distributionLaborUsd, view.work, 'USD'); output(s.processingServiceUsd, view.work, 'USD');
  if(Object.hasOwn(row,'monthFinancial')){const m=obj(row.monthFinancial);keys(m,['meaning','adoptedChannels','links']);same(m.meaning,'financial_snapshots_not_live_month_plan');
    const c=obj(m.adoptedChannels);keys(c,['sales','work']);bool(c.sales);bool(c.work);const ids=new Set<string>();
    for(const value of arr(m.links,5000)){const link=obj(value);keys(link,['allocationId','lineId','channel']);const id=uid(link.allocationId);if(ids.has(id))invalidClosingResponse();ids.add(id);uid(link.lineId);member(link.channel,['sales','work']);}
  }else same(s.quantityMeaning,'one_manual_quantity_per_record_channels_are_not_added');
  return row as unknown as ClosingDetail;
}
export function parseClosingHistory(value: unknown, kind: 'period' | 'allocation', id: string, query: ClosingReadQuery, view: ClosingVisibility): ClosingHistory {
  const row = obj(value); keys(row, ['entityType', 'entityId', 'asOfVersion', 'items', 'hasMore', 'offset', 'limit']); same(row.entityType, kind); same(row.entityId, id);
  num(row.asOfVersion, 1); if (query.version !== null) same(row.asOfVersion, query.version); same(row.offset, query.offset); same(row.limit, query.limit); bool(row.hasMore);
  const items = arr(row.items, query.limit); if (row.hasMore && items.length < query.limit) invalidClosingResponse(); let prior = Number(row.asOfVersion) + 1;
  for (const value of items) { const item = kind === 'period' ? period(value, view) : allocation(value, view); same(item.id, id); if (Number(item.version) >= prior) invalidClosingResponse(); prior = Number(item.version); }
  return row as unknown as ClosingHistory;
}
export function parseClosingPreview(value: unknown, intent: ClosingIntent, view: ClosingVisibility): ClosingPreview {
  const syncing=intent.action==='sync_month_outputs';
  const row = obj(value); keys(row, ['intent', 'previewHash', 'period', 'before', 'after', 'nextStatus', 'allocationCount', 'warnings', 'quantityConfirmation', 'productionAndShipments',...(syncing?['monthSync']:[])]);
  same(row.intent, intent); hash(row.previewHash); same(row.quantityConfirmation, syncing?'order_month_plan':'manual'); same(row.productionAndShipments, 'reference_only'); num(row.allocationCount, 0, 5000);
  for (const warning of arr(row.warnings, 6)) member(warning, ['exceeds_order_quantity', 'exceeds_color_quantity', 'exceeds_planned_quantity', 'exceeds_completed_quantity', 'executor_unassigned','no_applicable_month_portions']);
  same(row.nextStatus, intent.action === 'confirm_period' ? 'confirmed' : intent.action === 'lock_period' ? 'locked' : 'open');
  if (intent.action === 'create_period') { same(row.period, null); same(row.before, null); same(row.after, null); same(row.allocationCount, 0); }
  else { const p = obj(row.period); keys(p, ['id', 'month', 'version', 'status', 'taxRatePercent']); same(p.id, intent.periodId); same(p.version, intent.expectedPeriodVersion); str(p.month); tax(p.taxRatePercent); member(p.status, ['open', 'confirmed', 'locked']); }
  const allocationAction = intent.action.endsWith('_allocation');
  if (row.before !== null) { if (!('allocationId' in intent)) return invalidClosingResponse(); const b = obj(row.before); keys(b, ['version', 'status', 'snapshot']); same(b.version, intent.expectedVersion); same(b.status, 'active'); snapshot(b.snapshot, view); }
  else if ('allocationId' in intent) invalidClosingResponse();
  if (allocationAction) { const a = obj(row.after); keys(a, ['status', 'snapshot']); same(a.status, intent.action === 'void_allocation' ? 'voided' : 'active'); const s = snapshot(a.snapshot, view).row;
    if (intent.action === 'create_allocation') same(obj(s.order).id, intent.orderId);
    if ('data' in intent) { same(s.quantity, intent.data.quantity); same(s.colorId, intent.data.colorId); same(s.assignmentId, intent.data.assignmentId); same(s.channels, intent.data.channels); }
    if (row.before !== null) same(obj(obj(row.before).snapshot).order, s.order);
  } else same(row.after, null);
  if(syncing){
    const m=obj(row.monthSync);keys(m,['meaning','channelsAreNotAddedToPhysicalQuantity','counts','items']);
    same(m.meaning,'explicit_month_plan_adoption');same(m.channelsAreNotAddedToPhysicalQuantity,true);
    const counts=obj(m.counts);keys(counts,['created','updated','voided','unchanged']);for(const count of Object.values(counts))num(count,0,5000);
    const items=arr(m.items,10000),seen=new Set<string>(),actual={created:0,updated:0,voided:0,unchanged:0};
    for(const value of items){const item=obj(value);keys(item,['kind','lineId','channel','before','after']);
      const kind=member(item.kind,['create','update','void','keep']),lineId=uid(item.lineId),channel=member(item.channel,['sales','work']);
      if(!intent.channels[channel as 'sales'|'work'])invalidClosingResponse();
      const identity=JSON.stringify([lineId,channel,kind]);if(seen.has(identity))invalidClosingResponse();seen.add(identity);
      actual[kind==='create'?'created':kind==='update'?'updated':kind==='void'?'voided':'unchanged']++;
      if(kind==='create')same(item.before,null);else if(item.before===null)invalidClosingResponse();
      if(kind==='void')same(item.after,null);else if(item.after===null)invalidClosingResponse();
      let owner:unknown=null;
      for(const value of [item.before,item.after])if(value!==null){const parsed=snapshot(value,view).row;
        same(parsed.channels,{sales:channel==='sales',work:channel==='work'});if(owner!==null)same(parsed.order,owner);owner=parsed.order;}
    }
    same(counts,actual);
  }
  return row as unknown as ClosingPreview;
}

export function parseClosingBasis(value: unknown, orderId: string, view: ClosingVisibility): ClosingBasis {
  const row = obj(value); keys(row, ['schemaVersion', 'readOnly', 'order', 'commercial', 'priceLines', 'executionReferences', 'executionFingerprint', 'executionFactsMeaning', 'unperformed']);
  same(row.schemaVersion, 'server-closing-basis.v1'); same(row.readOnly, true); const o = order(row.order, true); same(o.id, orderId);
  if (row.commercial !== null) { const c = obj(row.commercial); keys(c, ['id', 'version', 'quoteId', 'revisionId', 'scope', 'processingBatchId']); uid(c.id); num(c.version, 1); str(c.quoteId); str(c.revisionId); member(c.scope, ['legacy_uniform', 'line_items']); nullable(c.processingBatchId, uid); }
  // The Server combines up to 1000 current colors and 1000 removed commercial
  // lines; ambiguous source colors deliberately remain visible as blocked rows.
  const byColor = new Map<unknown, Record<string, unknown>[]>();
  for (const value of arr(row.priceLines, 2000)) {
    const p = obj(value); keys(p, ['colorId', 'colorName', 'quantity', 'scope', 'commercialVersionId', 'priceVersionId', 'workPrice', ...(o.businessType === 'processing' ? [] : ['garmentSale'])]);
    nullable(p.colorId, uid); byColor.set(p.colorId, [...(byColor.get(p.colorId) ?? []), p]); nullable(p.colorName, value => str(value)); nullable(p.quantity, decimal); member(p.scope, ['current_color', 'order_wide', 'removed_color', 'historical_uniform', 'unmatched_color']); nullable(p.commercialVersionId, uid); nullable(p.priceVersionId, value => str(value, true));
    for (const [key, allowed, currency, bucket] of [['garmentSale', view.sale, 'CNY', 'garment_sales_cny'], ['workPrice', view.work, 'USD', o.businessType === 'processing' ? 'processing_service_usd' : 'distribution_labor_usd']] as const) {
      if (!Object.hasOwn(p, key)) continue; const v = obj(p[key]); if (v.visibility === 'restricted') { keys(v, ['visibility']); continue; }
      keys(v, ['visibility', 'value', 'requiredCurrency', 'eligibility', 'bucket']); same(v.visibility, 'allowed'); if (!allowed) invalidClosingResponse(); same(v.requiredCurrency, currency); same(v.bucket, bucket);
      if (v.value !== null) { const price = obj(v.value); keys(price, ['price', 'currency']); nullable(price.price, decimal); member(price.currency, key === 'garmentSale' ? ['CNY'] : ['CNY', 'USD']); }
      const e = obj(v.eligibility); keys(e, ['state', 'reason']); if (e.state === 'eligible') { same(e.reason, null); if (v.value === null || obj(v.value).price === null) invalidClosingResponse(); same(obj(v.value).currency, currency); }
      else { same(e.state, 'blocked'); member(e.reason, ['commercial_not_adopted', 'commercial_business_type_mismatch', 'historical_uniform_requires_review', 'color_identity_ambiguous', 'color_price_mapping_required', 'removed_color_requires_review', 'sale_price_unconfirmed', 'labor_price_unconfirmed', 'usd_labor_version_required']); }
    }
  }
  for (const lines of byColor.values()) if (lines.length > 1) for (const line of lines) {
    member(line.scope, ['current_color', 'unmatched_color']);
    for (const key of ['garmentSale', 'workPrice']) if (Object.hasOwn(line, key)) {
      const price = obj(line[key]); if (price.visibility === 'allowed') same(obj(price.eligibility).state, 'blocked');
    }
  }
  references(row.executionReferences, orderId); hash(row.executionFingerprint); same(row.executionFactsMeaning, 'cumulative_actual_not_monthly_events');
  same(row.unperformed, ['period_assignment', 'tax_calculation', 'foreign_exchange', 'output_recognition', 'closing_confirmation', 'closing_lock']); return row as unknown as ClosingBasis;
}
