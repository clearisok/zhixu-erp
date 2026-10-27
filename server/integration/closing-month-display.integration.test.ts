import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { closingFixture } from './closing-fixture.js';
import { CLOSING_READ_PERMISSIONS } from '../closing/contract.js';
import { createClosingClient } from '../../features/closing-center/server/closing-client.js';
import { previewClosingMonthMove, executeClosingMonthMove, readOrderClosingMonthDisplay } from '../closing/month-plan-service.js';
import { previewProductionPlan, executeProductionPlan, readOrderProductionPlans } from '../production-scheduling/service.js';
import type { Pool } from 'pg';

test('owned PostgreSQL/HTTP: opt-in month labels are read-only, evidence-bound and permission-safe', { timeout: 180000 }, async t => {
  const f = await closingFixture(t), order = await f.order(false), reader = await f.user('closing.labels.reader', CLOSING_READ_PERMISSIONS);
  const client = createClosingClient({ baseUrl: f.base, visibility: () => ({ sale: false, work: false }), fetchImpl: (async (url, init) => {
    const headers = new Headers(init?.headers); headers.set('Cookie', reader.cookie); return fetch(url, { ...init, headers });
  }) as typeof fetch });
  const initial = await client.monthDisplay(order.id, () => true), blue = initial.display.colors.find(row => row.identityName === 'Blue')!;
  const assignment = await f.assignment(order.id, blue.colorId), line = initial.plan!.lines.find(row => row.colorId === blue.colorId)!;
  const match = await previewClosingMonthMove(f.pool, f.editor.actor, { action: 'match_executors', orderId: order.id, expectedVersion: 1,
    reason: 'Synthetic label evidence', items: [{ lineId: line.id, parts: [{ assignmentId: assignment, quantity: '20' }, { assignmentId: null, quantity: '30' }] }] });
  assert.equal((await executeClosingMonthMove(f.pool, f.editor.actor, { requestId: randomUUID(), intent: match.intent, previewHash: match.previewHash })).status, 'applied');
  await t.test('old and opt-in reads agree on quantity and versions; new reads create no records or commercial access', async () => {
    const before = (await f.pool.query('SELECT id,version,lines,executor_basis FROM server_closing_month_plan_versions ORDER BY id')).rows;
    const legacy = await client.monthPlan(order.id, () => true), shown = await client.monthDisplay(order.id, () => true);
    assert.deepEqual(shown.plan, legacy.plan); assert.equal(Object.hasOwn(legacy, 'display'), false);
    assert.equal(shown.display.executors[0].name, f.groupData.name); assert.equal(shown.display.periods[0].status, 'not_created');
    assert.equal(JSON.stringify(shown).includes('confirmed_sale_price'), false); assert.equal(JSON.stringify(shown).includes('phone'), false);
    assert.deepEqual((await f.pool.query('SELECT id,version,lines,executor_basis FROM server_closing_month_plan_versions ORDER BY id')).rows, before);
    assert.equal((await f.request('/orders/' + order.id + '/month-plan?view=display&view=display')).response.status, 400);
    assert.equal((await f.request('/orders/' + order.id + '/month-plan?view=unknown')).response.status, 400);
    assert.equal((await f.request('/orders/' + order.id + '/month-plan?view=display', undefined, null)).response.status, 401);
  });
  await t.test('current Source spelling and ambiguity do not rewrite immutable identity names', async () => {
    await f.pool.query("UPDATE ainuoke_sales_order_color_mirrors SET color_name=' BLUE ' WHERE sales_order_id=$1 AND color_name='Blue'", [order.id]);
    const shown = await client.monthDisplay(order.id, () => true), color = shown.display.colors.find(row => row.colorId === blue.colorId)!;
    assert.deepEqual(color, { colorId: blue.colorId, identityName: 'Blue', currentSourceName: ' BLUE ', currentSourceAmbiguous: false });
    assert.equal(shown.sourceChanged, false);
    await f.pool.query("UPDATE ainuoke_sales_order_color_mirrors SET color_name='blue' WHERE sales_order_id=$1 AND color_name='White'", [order.id]);
    const ambiguous = await client.monthDisplay(order.id, () => true);
    assert.equal(ambiguous.display.colors.find(row => row.colorId === blue.colorId)?.currentSourceName, null);
    assert.equal(ambiguous.display.colors.find(row => row.colorId === blue.colorId)?.currentSourceAmbiguous, true);
    assert.equal(ambiguous.sourceChanged, true);
    await f.pool.query("UPDATE ainuoke_sales_order_color_mirrors SET color_name=CASE source_line_identity WHEN 'blue' THEN 'Blue' ELSE 'White' END WHERE sales_order_id=$1", [order.id]);
  });
  await t.test('master renames and an explicit executor change never substitute for the recorded executor name', async () => {
    const recorded = (await client.monthDisplay(order.id, () => true)).display.executors[0];
    await f.resource('groups', { ...f.groupData, name: 'Renamed synthetic group' }, f.group.id, f.group.version);
    assert.deepEqual((await client.monthDisplay(order.id, () => true)).display.executors[0], recorded);
    const replacement = await f.resource('groups', { ...f.groupData, name: 'Replacement synthetic group', shortName: '新组', sortOrder: 1 });
    const state = await readOrderProductionPlans(f.pool, f.editor.actor, order.id), row = state.assignments.find(row => row.id === assignment)!;
    const update = await previewProductionPlan(f.pool, f.editor.actor, { action: 'update', orderId: order.id, assignmentId: assignment,
      expectedVersion: row.version, expectedPlanVersion: state.order.planVersion, reason: 'Explicit synthetic assignment refresh',
      data: { executionType: 'internal', executorId: replacement.id, colorId: blue.colorId, plannedQuantity: '30',
        duration: { mode: 'workdays', workdays: 2 }, dates: { mode: 'auto_queue', startDate: '2027-01-04' }, remark: '' } });
    assert.equal((await executeProductionPlan(f.pool, f.editor.actor, { requestId: randomUUID(), intent: update.intent, previewHash: update.previewHash })).status, 'applied');
    const after = await client.monthDisplay(order.id, () => true);
    assert.deepEqual(after.display.executors.find(row => row.resourceSnapshotHash === recorded.resourceSnapshotHash), recorded);
    assert(after.display.executors.some(row => row.name === 'Replacement synthetic group'));
    assert.equal(after.display.executors.some(row => row.name === 'Renamed synthetic group'), false);
    assert.deepEqual(after.executorChanges, [{ assignmentId: assignment, reason: 'attribution_changed' }]);
    assert.equal(after.plan!.version, 2);
  });
  let periodId: string;
  await t.test('a concurrent Source edit and period creation cannot mix reference labels from different snapshots', async () => {
    let reached!: () => void, resume!: () => void;
    const paused = new Promise<void>(resolve => { reached = resolve; }), gate = new Promise<void>(resolve => { resume = resolve; });
    const isolated = { connect: async () => {
      const owned = await f.pool.connect(); let intercepted = false;
      return new Proxy(owned, { get(target, key, receiver) {
        if (key === 'query') return async (...args: unknown[]) => {
          const result = await Reflect.apply(target.query, target, args);
          if (!intercepted && typeof args[0] === 'string' && args[0].includes('color_name AS name')) { intercepted = true; reached(); await gate; }
          return result;
        };
        const value = Reflect.get(target, key, receiver); return typeof value === 'function' ? value.bind(target) : value;
      } });
    } } as unknown as Pool;
    const reading = readOrderClosingMonthDisplay(isolated, f.editor.actor, order.id);
    await Promise.race([paused, reading.then(() => { throw Error('Synthetic read did not reach its label-query barrier'); })]);
    try {
      await f.pool.query("UPDATE ainuoke_sales_order_color_mirrors SET color_name='BLUE' WHERE sales_order_id=$1 AND color_name='Blue'", [order.id]);
      const p = await f.apply({ action: 'create_period', month: '2027-02', taxRatePercent: '0', taxRateConfirmed: true, remark: '' });
      periodId = p.result.periodId;
    } finally { resume(); }
    const held = await reading, fresh = await client.monthDisplay(order.id, () => true);
    assert.equal(held.display.colors.find(row => row.colorId === blue.colorId)?.currentSourceName, 'Blue');
    assert.equal(fresh.display.colors.find(row => row.colorId === blue.colorId)?.currentSourceName, 'BLUE');
    assert.equal(held.display.periods[0].status, 'not_created'); assert.equal(fresh.display.periods[0].status, 'open');
  });
  await t.test('referenced period absence is explicit and amount fields are absent', async () => {
    const shown = await client.monthDisplay(order.id, () => true);
    assert.deepEqual(shown.display.periods, [{ month: '2027-02', periodId, version: 1, status: 'open' }]);
    assert.equal(JSON.stringify(shown.display).includes('taxRate'), false);
    const processing = await f.processing('USD'), uncolored = await client.monthDisplay(processing.id, () => true);
    assert.deepEqual(uncolored.display.colors, []); assert.deepEqual(uncolored.display.periods, []);
  });
  await t.test('fresh read revocation blocks the view without granting any amount permission', async () => {
    await f.pool.query('DELETE FROM app_role_permissions WHERE role_id=$1 AND permission_key=$2', [reader.role, CLOSING_READ_PERMISSIONS[0]]);
    await assert.rejects(client.monthDisplay(order.id, () => true), { status: 403 });
    await assert.rejects(readOrderClosingMonthDisplay(f.pool, reader.actor, order.id), { status: 403 });
  });
  assert.deepEqual(f.errors, []);
});
