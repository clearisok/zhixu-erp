import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { closingFixture } from './closing-fixture.js';
import { CLOSING_READ_PERMISSIONS } from '../closing/contract.js';
import { createClosingClient } from '../../features/closing-center/server/closing-client.js';
import { previewClosingMonthMove, executeClosingMonthMove, readOrderClosingMonthDisplay } from '../closing/month-plan-service.js';
import { previewProductionPlan, executeProductionPlan, readOrderProductionPlans } from '../production-scheduling/service.js';
import type { Pool } from 'pg';
import { planHash } from '../production-scheduling/repository.js';
import { MONTH_DISPLAY_LIMITS } from '../closing/month-display-model.js';

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

test('owned PostgreSQL: repeated resource facts exceed the budget before any full-facts read', { timeout: 180000 }, async t => {
  const f = await closingFixture(t), order = await f.order(false), original = await f.assignment(order.id, null);
  const facts = (await f.pool.query(`SELECT s.facts FROM production_schedule_assignments a
    JOIN production_schedule_resource_snapshots s ON s.hash=a.resource_snapshot_hash WHERE a.id=$1`, [original])).rows[0].facts;
  // The SQL snapshot contract permits up to 1 MiB. Ten references to this one
  // immutable synthetic snapshot are small when deduplicated, but not on the wire.
  const largeFacts = { ...facts, syntheticBudgetEvidence: 'x'.repeat(900000) }, hash = planHash(largeFacts);
  await f.pool.query('INSERT INTO production_schedule_resource_snapshots(hash,facts) VALUES($1,$2)', [hash, JSON.stringify(largeFacts)]);
  const size = (await f.pool.query('SELECT octet_length(facts::text)::int AS bytes FROM production_schedule_resource_snapshots WHERE hash=$1', [hash])).rows[0].bytes;
  assert(size < 1048576); assert(size < MONTH_DISPLAY_LIMITS.snapshotBytes); assert(size * 10 > MONTH_DISPLAY_LIMITS.snapshotBytes);
  async function copies(targetOrderId: string, count: number) {
    const owned = await f.pool.connect();
    try {
      await owned.query('BEGIN');
      await owned.query(`WITH inserted AS (INSERT INTO production_schedule_assignments
      SELECT copied.* FROM production_schedule_assignments a CROSS JOIN unnest($3::uuid[]) n(id)
      CROSS JOIN LATERAL jsonb_populate_record(NULL::production_schedule_assignments,
        to_jsonb(a)||jsonb_build_object('id',n.id,'resource_snapshot_hash',$2::text,'sales_order_id',$4::uuid)) copied
      WHERE a.id=$1 RETURNING *)
      INSERT INTO production_schedule_plan_versions(assignment_id,sales_order_id,version,snapshot,actor_id,request_id,operation_id,reason)
      SELECT id,sales_order_id,version,production_plan_row_snapshot(inserted),created_by,gen_random_uuid(),'synthetic-display-budget:'||id::text,'' FROM inserted`, [original, hash, Array.from({ length: count }, () => randomUUID()), targetOrderId]);
      await owned.query('COMMIT');
    } catch (error) { await owned.query('ROLLBACK'); throw error; } finally { owned.release(); }
  }
  await copies(order.id, 10);
  const queries: string[] = [];
  const traced = { connect: async () => {
    const connection = await f.pool.connect();
    return new Proxy(connection, { get(target, key, receiver) {
      if (key === 'query') return async (...args: unknown[]) => {
        if (typeof args[0] === 'string') queries.push(args[0]);
        return Reflect.apply(target.query, target, args);
      };
      const value = Reflect.get(target, key, receiver); return typeof value === 'function' ? value.bind(target) : value;
    } });
  } } as unknown as Pool;
  await assert.rejects(readOrderClosingMonthDisplay(traced, f.editor.actor, order.id), { status: 422, code: 'closing_month_display_too_large' });
  assert(queries.some(sql => sql.includes('sum(octet_length(s.facts::text))')));
  assert.equal(queries.some(sql => sql.includes('s.facts AS "resourceFacts"') || sql.includes('SELECT hash,facts')), false);
  assert.equal(queries.at(-1), 'ROLLBACK');
  assert.equal((await f.request('/orders/' + order.id + '/month-plan?view=display')).response.status, 422);
  // Both load stages share one budget: the first repeated transfer alone fits,
  // but adding the deduplicated label read would exceed the same 8 MiB limit.
  const combined = await f.order(false); await copies(combined.id, 9); queries.length = 0;
  assert(size * 9 < MONTH_DISPLAY_LIMITS.snapshotBytes);
  await assert.rejects(readOrderClosingMonthDisplay(traced, f.editor.actor, combined.id), { status: 422, code: 'closing_month_display_too_large' });
  assert(queries.some(sql => sql.includes('s.facts AS "resourceFacts"')));
  assert.equal(queries.some(sql => sql.includes('SELECT hash,facts')), false);
  assert.equal(queries.at(-1), 'ROLLBACK');
  assert.deepEqual(f.errors, []);
});
