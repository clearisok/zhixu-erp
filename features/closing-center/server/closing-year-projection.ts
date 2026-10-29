import type { readClosingYear } from '../../../server/closing/annual-service';
import type { ClosingYearQuery } from '../../../server/closing/annual-contract';
import { sumClosingAmounts, type ExactClosingAmount } from '../../../server/closing/contract';
import { arr, bool, date, decimal, exactAmount, invalidClosingResponse, keys, member, nullable, num, obj, same, str, tax, uid, type ClosingVisibility } from './closing-projection';

export type ClosingYear = Awaited<ReturnType<typeof readClosingYear>>;
const code = (value: unknown) => { if (!/^[a-z][a-z0-9_]{1,100}$/u.test(str(value))) invalidClosingResponse(); };
function yearAmount(value: unknown, currency: 'CNY' | 'USD', allowed: boolean, notApplicable = false) {
  const row = obj(value);
  if (row.visibility === 'restricted') { keys(row, ['visibility']); return; }
  same(row.visibility, 'allowed'); same(row.currency, currency);
  if (notApplicable) { keys(row, ['visibility', 'currency', 'state']); same(row.state, 'not_applicable'); return; }
  if (!allowed) invalidClosingResponse();
  if (row.state === 'known') { keys(row, ['visibility', 'currency', 'state', 'price', 'amount']); decimal(row.price); exactAmount(row.amount); }
  else { keys(row, ['visibility', 'currency', 'state', 'reason']); same(row.state, 'blocked'); code(row.reason); }
}
function summary(value: unknown, currency: 'CNY' | 'USD', allowed: boolean, portions: number) {
  const row = obj(value);
  if (row.visibility === 'restricted') { keys(row, ['visibility']); return; }
  if (!allowed) invalidClosingResponse();
  keys(row, ['visibility', 'currency', 'state', 'amount', 'knownSubtotal', 'applicablePortions', 'blockedPortions', 'blockers']);
  same(row.visibility, 'allowed'); same(row.currency, currency); member(row.state, ['complete', 'incomplete']);
  const applicable = num(row.applicablePortions, 0, portions), blocked = num(row.blockedPortions, 0, applicable);
  exactAmount(row.knownSubtotal);
  if (blocked) { same(row.state, 'incomplete'); same(row.amount, null); }
  else { same(row.state, 'complete'); exactAmount(row.amount); same(row.amount, row.knownSubtotal); }
  let count = 0; const seen = new Set<string>();
  for (const entry of arr(row.blockers, 100)) { const b = obj(entry); keys(b, ['reason', 'count']); code(b.reason); const reason = str(b.reason);
    if (seen.has(reason)) invalidClosingResponse(); seen.add(reason); count += num(b.count, 1, blocked); }
  same(count, blocked);
}
/** Reconcile provided exact subtotals, never derive prices or amounts from
 * order quantity. Pagination may not turn an incomplete year into complete. */
function annualTotal(value: unknown, monthValues: unknown[]) {
  const total = obj(value), monthly = monthValues.map(obj);
  if (total.visibility === 'restricted') { for (const month of monthly) same(month, { visibility: 'restricted' }); return; }
  let applicable = 0, blocked = 0; const amounts: ExactClosingAmount[] = [], blockers = new Map<string, number>();
  for (const month of monthly) {
    same(month.visibility, 'allowed'); applicable += num(month.applicablePortions); blocked += num(month.blockedPortions);
    amounts.push(month.knownSubtotal as ExactClosingAmount);
    for (const value of arr(month.blockers, 100)) { const item = obj(value), reason = str(item.reason); blockers.set(reason, (blockers.get(reason) ?? 0) + num(item.count)); }
  }
  same(total.applicablePortions, applicable); same(total.blockedPortions, blocked); same(total.knownSubtotal, sumClosingAmounts(amounts));
  const normalized = (entries: [string, number][]) => entries.sort(([a], [b]) => a.localeCompare(b)).map(([reason, count]) => ({ reason, count }));
  same(normalized(arr(total.blockers, 100).map(value => { const item = obj(value); return [str(item.reason), num(item.count)] as [string, number]; })), normalized([...blockers]));
}
/** Rejects a partial/foreign-year/permission-leaking response before it reaches a page. */
export function parseClosingYear(value: unknown, query: ClosingYearQuery, view: ClosingVisibility): ClosingYear {
  const row = obj(value); keys(row, ['schemaVersion', 'readOnly', 'query', 'months', 'totals', 'pendingPortions', 'pendingNotAssignedToYear',
    'productionReference', 'orderMetadata', 'summaryScope', 'total', 'offset', 'limit', 'items']);
  same(row.schemaVersion, 'server-closing-year.v1'); same(row.readOnly, true); same(row.query, query);
  same(row.productionReference, 'current_cumulative_not_monthly_recognition'); same(row.orderMetadata, 'current_reference_except_frozen_identity');
  same(row.summaryScope, 'same_filtered_portions_before_pagination'); same(row.pendingNotAssignedToYear, true);
  const total = num(row.total, 0, 5000), pending = num(row.pendingPortions, 0, total); same(row.offset, query.offset); same(row.limit, query.limit);
  const months = arr(row.months, 12); same(months.length, 12); let assigned = 0; const periods = new Set<string>();
  for (const [index, value] of months.entries()) {
    const month = obj(value); keys(month, ['month', 'period', 'basis', 'portions', 'garmentSalesCny', 'processingUsd']);
    same(month.month, query.year + '-' + String(index + 1).padStart(2, '0')); const portions = num(month.portions, 0, total); assigned += portions;
    let frozen = false;
    if (month.period !== null) { const p = obj(month.period); keys(p, ['id', 'version', 'status', 'taxRatePercent']);
      const id = uid(p.id); if (periods.has(id)) invalidClosingResponse(); periods.add(id); num(p.version, 1); member(p.status, ['open', 'confirmed', 'locked']); tax(p.taxRatePercent); frozen = p.status !== 'open'; }
    same(month.basis, frozen ? 'frozen_financial_snapshot' : 'current_adopted_order_reference');
    summary(month.garmentSalesCny, 'CNY', view.sale, portions); summary(month.processingUsd, 'USD', view.work, portions);
  }
  same(assigned + pending, total); const totals = obj(row.totals); keys(totals, ['garmentSalesCny', 'processingUsd']);
  summary(totals.garmentSalesCny, 'CNY', view.sale, assigned); summary(totals.processingUsd, 'USD', view.work, assigned);
  annualTotal(totals.garmentSalesCny, months.map(value => obj(value).garmentSalesCny));
  annualTotal(totals.processingUsd, months.map(value => obj(value).processingUsd));
  const items = arr(row.items, query.limit); same(items.length, Math.min(query.limit, Math.max(0, total - query.offset))); const seen = new Set<string>();
  for (const value of items) {
    const item = obj(value); keys(item, ['id', 'order', 'month', 'quantity', 'colorId', 'colorName', 'executor', 'basis', 'issues', 'executionReview', 'garmentSale', 'processing']);
    const order = obj(item.order); keys(order, ['id', 'orderNo', 'businessType', 'styleNo', 'factoryStyleNo', 'customerName', 'brandName', 'quantity', 'completedQuantity', 'deliveryDate', 'productionStatus']);
    const owner = uid(order.id); str(order.orderNo); member(order.businessType, ['ainuoke_contract', 'processing']);
    for (const key of ['styleNo', 'factoryStyleNo', 'customerName', 'brandName']) nullable(order[key], value => str(value, true));
    nullable(order.quantity, decimal); decimal(order.completedQuantity); nullable(order.deliveryDate, date);
    member(order.productionStatus, ['not_started', 'in_progress', 'completed']); if (query.production !== 'all') same(order.productionStatus, query.production);
    const id = uid(item.id), identity = JSON.stringify([owner, id, item.month]); if (seen.has(identity)) invalidClosingResponse(); seen.add(identity);
    if (item.month !== null && !new RegExp('^' + query.year + '-(?:0[1-9]|1[0-2])$','u').test(str(item.month))) invalidClosingResponse();
    nullable(item.quantity, decimal); nullable(item.colorId, uid); nullable(item.colorName, value => str(value, true));
    if (item.executor !== null) { const e = obj(item.executor); keys(e, ['type', 'id', 'name']); member(e.type, ['internal', 'outsource']); uid(e.id); nullable(e.name, value => str(value, true)); }
    if (query.scope === 'unassigned') same(item.executor, null);
    else if (query.scope !== 'all') { if (item.executor === null) invalidClosingResponse(); same(obj(item.executor).type, query.scope); }
    for (const issue of arr(item.issues, 20)) code(issue);
    const basis = obj(item.basis); keys(basis, ['kind', 'monthVersion', 'financialVersions']); member(basis.kind, ['current_adopted_order_reference', 'frozen_financial_snapshot']); nullable(basis.monthVersion, value => num(value, 1));
    if (item.month === null) same(basis.kind, 'current_adopted_order_reference');
    else same(basis.kind, obj(months[Number(str(item.month).slice(5)) - 1]).basis);
    const refs = arr(basis.financialVersions, 2), channels = new Set<string>();
    for (const value of refs) { const ref = obj(value); keys(ref, ['id', 'version', 'versionId', 'channel']); uid(ref.id); num(ref.version, 1); uid(ref.versionId); const channel = member(ref.channel, ['sales', 'work']); if (channels.has(channel)) invalidClosingResponse(); channels.add(channel); }
    if (basis.kind === 'current_adopted_order_reference') { same(refs.length, 0); same(item.executionReview, null); if (basis.monthVersion === null) invalidClosingResponse(); }
    else {
      if (item.month === null || refs.length === 0 || item.quantity === null) invalidClosingResponse();
      const month = obj(months[Number(str(item.month).slice(5)) - 1]);
      const r = obj(item.executionReview); keys(r, ['requiresReview', 'laterCorrection', 'lockedSnapshotPreserved', 'changes']);
      bool(r.requiresReview); bool(r.laterCorrection); bool(r.lockedSnapshotPreserved); const changes = arr(r.changes, 500); same(r.laterCorrection, changes.length > 0);
      const changeIds = new Set<string>(); for (const value of changes) { const c = obj(value); keys(c, ['assignmentId', 'reasons']); const id = uid(c.assignmentId); if (changeIds.has(id)) invalidClosingResponse(); changeIds.add(id);
        for (const reason of arr(c.reasons, 8)) code(reason); }
      if (obj(month.period).status === 'locked') { same(r.requiresReview, false); same(r.lockedSnapshotPreserved, true); }
    }
    yearAmount(item.garmentSale, 'CNY', view.sale, order.businessType === 'processing'); yearAmount(item.processing, 'USD', view.work);
  }
  return row as unknown as ClosingYear;
}
