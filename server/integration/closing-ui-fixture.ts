import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { closingFixture } from './closing-fixture.js';
import { readOrderClosingMonthPlan, previewClosingMonthMove, executeClosingMonthMove } from '../closing/month-plan-service.js';
import { previewOrderBusinessSource, adoptOrderBusinessSource } from '../sales-orders/business-source-service.js';
import { readOrderProductionPlans, previewProductionPlan, executeProductionPlan } from '../production-scheduling/service.js';
import type { ClosingMonthIntent } from '../closing/month-plan-model.js';

/** Only the caller-owned disposable synthetic fixture; no external DB, account,
 * Ainuoke collection, Browser store or existing demo is accepted as input. */
export async function prepareClosingUiFixture(f: Awaited<ReturnType<typeof closingFixture>>) {
  async function change(intent: ClosingMonthIntent) { const p = await previewClosingMonthMove(f.pool, f.editor.actor, intent);
    assert.equal((await executeClosingMonthMove(f.pool, f.editor.actor, { requestId: randomUUID(), intent: p.intent, previewHash: p.previewHash })).status, 'applied'); }
  async function adopted() {
    const order = await f.order(false), colors = (await readOrderProductionPlans(f.pool, f.editor.actor, order.id)).order.colors;
    const selection = { kind: 'quote', quoteId: f.distribution.q.id, revisionId: f.distribution.revision.revisionId,
      assignments: colors.map(color => ({ colorId: color.id, priceVersionId: f.distribution.revision.priceVersions[0].id })) };
    const p = await previewOrderBusinessSource(f.pool, f.editor.actor, order.id, selection);
    await adoptOrderBusinessSource(f.pool, f.editor.actor, order.id, { selection, requestId: randomUUID(), expectedVersion: 0, fingerprint: p.fingerprint, reason: 'Synthetic UI qualified USD terms' });
    return { ...order, colors };
  }
  const first = await adopted(), second = await adopted(), unpriced = await f.order(false), frozen = await f.order(), processing = await f.processing('USD');
  for (const month of ['2027-02', '2027-03', '2027-11', '2027-12']) await f.apply({ action: 'create_period', month, taxRatePercent: '13', taxRateConfirmed: true, remark: 'Explicit synthetic fixture tax, never an application default' });
  const factory = await f.resource('factories', { name: '合成外发厂', enabled: true, remark: '', shortName: '合成外发', contactPerson: '', phone: '' });
  async function assignment(orderId: string, colorId: string, quantity: string, outsource = false) {
    const current = await readOrderProductionPlans(f.pool, f.editor.actor, orderId), p = await previewProductionPlan(f.pool, f.editor.actor, {
      action: 'create', orderId, assignmentId: null, expectedVersion: 0, expectedPlanVersion: current.order.planVersion,
      data: { executionType: outsource ? 'outsource' : 'internal', executorId: outsource ? factory.id : f.group.id, colorId, plannedQuantity: quantity,
        duration: { mode: 'workdays', workdays: 1 }, dates: outsource ? { mode: 'manual_fixed', startDate: '2027-01-04', endDate: '2027-01-04' } : { mode: 'auto_queue', startDate: '2027-01-04' }, remark: 'Synthetic UI plan' } });
    const saved = await executeProductionPlan(f.pool, f.editor.actor, { requestId: randomUUID(), intent: p.intent, previewHash: p.previewHash });
    assert.equal(saved.status, 'applied'); if (saved.status !== 'applied') assert.fail(); return saved.assignments[0].id;
  }
  const blue = first.colors.find(row => row.colorName === 'Blue')!, internal = await assignment(first.id, blue.id, '30'), outsourced = await assignment(first.id, blue.id, '20', true);
  let plan = (await readOrderClosingMonthPlan(f.pool, f.editor.actor, first.id)).plan!;
  await change({ action: 'match_executors', orderId: first.id, expectedVersion: plan.version, reason: 'Synthetic explicit split',
    items: [{ lineId: plan.lines.find(row => row.colorId === blue.id)!.id, parts: [{ assignmentId: internal, quantity: '30' }, { assignmentId: outsourced, quantity: '20' }] }] });
  await f.completion(first.id, internal, '15');
  for (const color of second.colors) { const id = await assignment(second.id, color.id, '50'); await f.completion(second.id, id, '50'); }
  for (const [id, month] of [[processing.id, '2027-11'], [frozen.id, '2027-12']] as const) {
    plan = (await readOrderClosingMonthPlan(f.pool, f.editor.actor, id)).plan!;
    await change({ action: 'move_months', orderId: id, expectedVersion: plan.version, targetMonth: month, reason: 'Synthetic month scope', selection: { mode: 'whole' } });
  }
  const period = (await f.pool.query<{ id: string }>("SELECT id::text FROM server_closing_periods WHERE month='2027-12'")).rows[0];
  const applied = await f.apply({ action: 'sync_month_outputs', periodId: period.id, expectedPeriodVersion: 1, channels: { sales: true, work: false }, reason: 'Synthetic immutable sale snapshot' });
  const confirmed = await f.apply({ action: 'confirm_period', periodId: period.id, expectedPeriodVersion: applied.result.periodVersion, reason: '' });
  await f.apply({ action: 'lock_period', periodId: period.id, expectedPeriodVersion: confirmed.result.periodVersion, reason: '' });
  return { first, second, unpriced, frozen, processing, internal, outsourced };
}
