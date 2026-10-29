import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { closingFixture } from './closing-fixture.js';
import type { ClosingAllocationData, ClosingIntent } from '../closing/contract.js';
import { readClosingPeriod } from '../closing/repository.js';
import { executeClosingMonthMove, previewClosingMonthMove, readOrderClosingMonthPlan } from '../closing/month-plan-service.js';
import { quantityUnits, unitsQuantity, type ClosingMonthIntent } from '../closing/month-plan-model.js';

type Fixture = Awaited<ReturnType<typeof closingFixture>>;
/** Current target setup, not a legacy writer or a test-only product switch.
 * Every quantity comes from a real initialized plan via move/match commands;
 * callers still preview/submit the returned sync intent through their real API. */
export async function prepareFixtureMonthPortion(f: Fixture, periodId: string, orderId: string, data: ClosingAllocationData): Promise<Extract<ClosingIntent, { action: 'sync_month_outputs' }>> {
  const client = await f.pool.connect();
  let month: string;
  try { month = (await readClosingPeriod(client, periodId)).month; } finally { client.release(); }
  const read = async () => { const value = (await readOrderClosingMonthPlan(f.pool, f.editor.actor, orderId)).plan; assert.ok(value); return value; };
  const change = async (intent: ClosingMonthIntent) => {
    const p = await previewClosingMonthMove(f.pool, f.editor.actor, intent), result = await executeClosingMonthMove(f.pool, f.editor.actor, { requestId: randomUUID(), intent: p.intent, previewHash: p.previewHash });
    assert.equal(result.status, 'applied');
  };
  let plan = await read();
  const source = plan.lines.find(line => line.colorId === data.colorId && line.assignmentId === null && line.month !== month && quantityUnits(line.quantity) >= quantityUnits(data.quantity));
  assert.ok(source, 'Fixture must move existing quantity, never invent a manual closing quantity');
  let lineId = source.id;
  if (data.assignmentId !== null) {
    const rest = quantityUnits(source.quantity) - quantityUnits(data.quantity);
    await change({ action: 'match_executors', orderId, expectedVersion: plan.version, reason: 'Synthetic explicit fixture executor match', items: [{ lineId, parts: [
      { assignmentId: data.assignmentId, quantity: data.quantity }, ...(rest > BigInt(0) ? [{ assignmentId: null, quantity: unitsQuantity(rest) }] : [])] }] });
    plan = await read(); const assigned = plan.lines.find(line => line.colorId === data.colorId && line.assignmentId === data.assignmentId && line.month === source.month && line.quantity === data.quantity);
    assert.ok(assigned); lineId = assigned.id;
  }
  await change({ action: 'move_months', orderId, expectedVersion: plan.version, targetMonth: month, reason: 'Synthetic explicit fixture partial month move', selection: { mode: 'partial', items: [{ lineId, quantity: data.quantity }] } });
  const connection = await f.pool.connect();
  try { const period = await readClosingPeriod(connection, periodId); return { action: 'sync_month_outputs', periodId, expectedPeriodVersion: period.version, channels: data.channels, reason: data.remark || 'Synthetic explicit month adoption' }; }
  finally { connection.release(); }
}
