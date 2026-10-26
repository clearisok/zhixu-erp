import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { readdir } from 'node:fs/promises';
import pg from 'pg';
import { runMigrations } from '../db/migration-runner.js';
import { previewClosingCommand, executeClosingCommand, readClosingCommandReceipt } from '../closing/service.js';
import { readClosingHistory, readClosingPeriodDetail, listClosingPeriods } from '../closing/read-service.js';
import { readClosingAllocation } from '../closing/repository.js';
import { previewSaleAdjustment, commitSaleAdjustment } from '../sales-orders/sale-adjustment-service.js';
import type { ClosingAllocationData } from '../closing/contract.js';
import type { PermissionKey } from '../../features/permissions/model/permissions.js';
import { closingFixture, closingCode } from './closing-fixture.js';
import { CURRENT_MIGRATION_FILES } from './current-migration-ledger-fixture.js';

test('Gate8B manual closing: nonempty upgrade, immutable snapshots, trusted HTTP and transactional commands', { timeout: 180000 }, async t => {
  const x = await closingFixture(t, true), { pool, editor } = x;
  const a = await x.order(), b = await x.order(), blue = a.basis.priceLines.find(row => row.colorName === 'Blue')!.colorId!, white = a.basis.priceLines.find(row => row.colorName === 'White')!.colorId!;
  const assignmentId = await x.assignment(a.id, blue); await x.completion(a.id, assignmentId, '20.125');
  const tableNames = (await pool.query("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename<>'schema_migrations' ORDER BY tablename")).rows.map(row => row.tablename as string);
  async function digests() {
    const values: Record<string, string> = {};
    for (const name of tableNames) { assert.match(name, /^[a-z0-9_]+$/u);
      // 0046 adds one nullable evidence column; compare every pre-upgrade field.
      const row = name === 'sales_order_commercial_lines' ? "to_jsonb(r)-'labor_confirmation_source'" : 'to_jsonb(r)';
      values[name] = (await pool.query(`SELECT md5(coalesce(jsonb_agg(${row} ORDER BY ${row}::text)::text,'[]')) digest FROM public."${name}" r`)).rows[0].digest; }
    return values;
  }
  const before = await digests();
  const ledger = (await pool.query('SELECT * FROM schema_migrations ORDER BY version')).rows;
  const upgrade = await runMigrations(pool, resolve('database/migrations'));
  assert.deepEqual(upgrade.applied, ['0045_server_closing_snapshots.sql', '0046_order_usd_labor_adoptions.sql']);
  assert.deepEqual(await digests(), before); assert.deepEqual((await pool.query('SELECT * FROM schema_migrations WHERE version<=44 ORDER BY version')).rows, ledger);
  assert.equal((await pool.query('SELECT count(*)::int n FROM sales_order_commercial_lines WHERE labor_confirmation_source IS NOT NULL')).rows[0].n, 0);
  await t.test('0045 adds empty tables without changing old nonempty rows and is idempotent', async () => {
    assert.deepEqual(CURRENT_MIGRATION_FILES, (await readdir(resolve('database/migrations'))).filter(name => /^\d+_.*\.sql$/u.test(name)).sort());
    assert.deepEqual((await runMigrations(pool, resolve('database/migrations'))).applied, []);
    for (const name of ['commands', 'periods', 'period_versions', 'period_heads', 'allocations', 'allocation_versions', 'allocation_heads']) {
      assert.equal((await pool.query(`SELECT count(*)::int n FROM server_closing_${name}`)).rows[0].n, 0);
    }
    assert.equal((await pool.query('SELECT count(*)::int n FROM production_schedule_execution_versions')).rows[0].n, 1);
  });
  const initialIntent = { action: 'create_period', month: '2026-10', taxRatePercent: '13', taxRateConfirmed: true, remark: '合成验收' };
  const initialCommand = await x.prepared(initialIntent);
  const concurrent = await Promise.all([executeClosingCommand(pool, editor.actor, initialCommand), executeClosingCommand(pool, editor.actor, initialCommand)]);
  assert.equal(concurrent[0].status, 'applied'); if (concurrent[0].status !== 'applied') assert.fail();
  const periodId = concurrent[0].periodId;
  const state = (id = periodId) => readClosingPeriodDetail(pool, editor.actor, id, new URLSearchParams({ includeVoided: 'true' }));
  const makeData = (patch: Partial<ClosingAllocationData> = {}): ClosingAllocationData => ({ quantity: '3', colorId: blue, channels: { sales: true, work: true }, assignmentId, executor: null, remark: 'PRIVATE-CLOSING-MONEY-NOTE', ...patch });
  async function add(orderId: string, data: ClosingAllocationData, id = periodId) {
    return x.apply({ action: 'create_allocation', periodId: id, expectedPeriodVersion: (await state(id)).period.version, orderId, data });
  }
  async function mutation(action: 'review_allocation' | 'void_allocation' | 'update_allocation', allocationId: string, data?: ClosingAllocationData) {
    const current = await state(), row = (await pool.query<{ version: number }>('SELECT version FROM server_closing_allocation_heads WHERE allocation_id=$1', [allocationId])).rows[0];
    return { action, periodId, expectedPeriodVersion: current.period.version, allocationId, expectedVersion: row.version, reason: '合成明确复核', ...(data ? { data } : {}) };
  }
  async function transition(action: 'confirm_period' | 'unconfirm_period' | 'lock_period' | 'reopen_period', id = periodId) {
    return x.apply({ action, periodId: id, expectedPeriodVersion: (await state(id)).period.version, reason: action === 'reopen_period' ? '合成修正后重新打开' : '合成确认' });
  }
  let allocationId = '', lockedVersion = 0, allocationCommand: Awaited<ReturnType<typeof x.prepared>> | null = null;
  await t.test('one month and one request are unique; retry mismatch never creates another period', async () => {
    assert.deepEqual(concurrent.map(row => row.status), ['applied', 'applied']);
    assert.deepEqual(concurrent.map(row => 'replayed' in row && row.replayed).sort(), [false, true]);
    assert.equal((await pool.query('SELECT count(*)::int n FROM server_closing_periods')).rows[0].n, 1);
    await assert.rejects(() => executeClosingCommand(pool, editor.actor, { ...initialCommand, intent: { ...initialCommand.intent, remark: 'different' } }), closingCode('closing_request_conflict'));
    await assert.rejects(() => x.prepared(initialIntent), closingCode('closing_period_already_exists'));
    assert.equal((await readClosingCommandReceipt(pool, editor.actor, initialCommand.requestId)).state, 'recorded');
    assert.equal((await state()).period.actorName, editor.actor.username);
  });
  await t.test('color prices and one manual quantity are frozen, without changing production/month or shared Quote', async () => {
    const quoteBefore = await x.repository.getById(x.distribution.q.id);
    const created = await add(a.id, makeData()); allocationId = created.result.allocationId!; allocationCommand = created.command;
    const detail = await state(), row = detail.items.find(row => row.id === allocationId)!;
    assert.equal(detail.period.month, '2026-10'); assert.equal(row.snapshot.quantity, '3');
    assert.equal(row.snapshot.productionBasis[0].execution?.actualCompletedDate, '2027-01-06');
    assert.equal(row.snapshot.outputs.garmentSale?.amount?.decimal, '300'); assert.equal(row.snapshot.outputs.work?.amount?.decimal, '7.5');
    assert.equal(detail.summary.registeredQuantity, '3'); assert.equal(detail.summary.salesQuantity, '3'); assert.equal(detail.summary.distributionWorkQuantity, '3');
    assert.equal(row.snapshot.commercial.id, a.basis.commercial!.id);
    assert.deepEqual(await x.repository.getById(x.distribution.q.id), quoteBefore);
    assert.equal((await pool.query('SELECT completed_quantity::text q FROM production_schedule_executions WHERE assignment_id=$1', [assignmentId])).rows[0].q, '20.125');
  });
  await t.test('CNY labor blocks work only; processing has a separate USD service amount and no garment sale', async () => {
    const current = await state(), intent = { action: 'create_allocation', periodId, expectedPeriodVersion: current.period.version, orderId: a.id,
      data: makeData({ colorId: white, assignmentId: null }) };
    await assert.rejects(() => x.prepared(intent), closingCode('closing_usd_work_basis_required'));
    await add(a.id, makeData({ colorId: white, quantity: '2', assignmentId: null, channels: { sales: true, work: false } }));
    const usd = await x.processing('USD'), cny = await x.processing('CNY');
    await add(usd.id, makeData({ colorId: null, quantity: '10', assignmentId: null, channels: { sales: false, work: true }, remark: '' }));
    await assert.rejects(async () => x.prepared({ ...intent, expectedPeriodVersion: (await state()).period.version, orderId: cny.id,
      data: makeData({ colorId: null, assignmentId: null, channels: { sales: false, work: true } }) }), closingCode('closing_usd_work_basis_required'));
    const detail = await state(); assert.equal(detail.summary.garmentSalesCny.amount?.decimal, '700');
    assert.equal(detail.summary.distributionLaborUsd.amount?.decimal, '7.5'); assert.equal(detail.summary.processingServiceUsd.amount?.decimal, '0');
    const row = detail.items.find(row => row.snapshot.order.id === usd.id)!;
    assert.equal(Object.hasOwn(row.snapshot.outputs, 'garmentSale'), false); assert.equal(row.snapshot.outputs.work?.bucket, 'processing_service');
    assert.equal(detail.summary.registeredQuantity, '15');
  });
  const common: PermissionKey[] = ['closing.view', 'order.view', 'schedule.view', 'closing.edit', 'closing.confirm', 'closing.lock', 'closing.reopen'];
  const sale = await x.user('closing.sale', [...common, 'commercial.sale.view']), labor = await x.user('closing.labor', [...common, 'commercial.labor.view']), reader = await x.user('closing.reader', common);
  await t.test('old/new channel grants protect indirect changes, confirmations, reads, history and receipts', async () => {
    const update = await mutation('update_allocation', allocationId, makeData({ channels: { sales: true, work: false } }));
    for (const intent of [update, await mutation('void_allocation', allocationId), await mutation('review_allocation', allocationId),
      { action: 'confirm_period', periodId, expectedPeriodVersion: (await state()).period.version, reason: '' }]) {
      await assert.rejects(() => previewClosingCommand(pool, sale.actor, intent), closingCode('permission_denied'));
    }
    for (const who of [sale, labor, reader]) {
      const result = await x.request('/periods/' + periodId, undefined, who.cookie); assert.equal(result.response.status, 200, result.text);
      const row = result.body.items.find((row: { id: string }) => row.id === allocationId);
      if (who !== sale) assert.deepEqual(row.snapshot.outputs.garmentSale, { visibility: 'restricted' });
      if (who !== labor) assert.deepEqual(row.snapshot.outputs.work, { visibility: 'restricted' });
      assert.equal(Object.hasOwn(row.snapshot, 'remark'), false);
      assert.equal(JSON.stringify(row).includes('PRIVATE-CLOSING-MONEY-NOTE'), false);
      if (who === sale) assert.equal(result.body.items.find((item: { snapshot: { channels: { sales: boolean; work: boolean } } }) => item.snapshot.channels.sales && !item.snapshot.channels.work).snapshot.remark, 'PRIVATE-CLOSING-MONEY-NOTE');
      const history = await readClosingHistory(pool, who.actor, 'allocation', allocationId);
      assert.equal(Object.hasOwn(history.items[0], 'reason'), false);
    }
    await pool.query("DELETE FROM app_role_permissions WHERE role_id=$1 AND permission_key='commercial.labor.view'", [editor.role]);
    try { await assert.rejects(() => executeClosingCommand(pool, editor.actor, allocationCommand!), closingCode('permission_denied')); }
    finally { await pool.query("INSERT INTO app_role_permissions VALUES($1,'commercial.labor.view')", [editor.role]); }
  });
  await t.test('first/corrected production facts require explicit review; stale previews are durably rejected', async () => {
    const original = (await state()).items.find(row => row.id === allocationId)!.snapshot;
    await x.completion(a.id, assignmentId, '18.005', '2027-01-07', '合成数量日期更正');
    assert.equal((await state()).reviewRequiredCount, 1);
    await assert.rejects(async () => x.prepared({ action: 'confirm_period', periodId, expectedPeriodVersion: (await state()).period.version, reason: '' }), closingCode('closing_execution_review_required'));
    const oldReview = await x.prepared(await mutation('review_allocation', allocationId));
    await x.completion(a.id, assignmentId, '17.005', '2027-01-08', '再次更正');
    const rejected = await executeClosingCommand(pool, editor.actor, oldReview); assert.equal(rejected.status, 'rejected');
    if (rejected.status !== 'rejected') assert.fail(); assert.equal(rejected.error.code, 'closing_preview_changed');
    assert.equal((await readClosingCommandReceipt(pool, editor.actor, oldReview.requestId)).state, 'recorded');
    await x.apply(await mutation('review_allocation', allocationId));
    const reviewed = (await state()).items.find(row => row.id === allocationId)!.snapshot;
    const withoutReview = (value: typeof reviewed) => ({ ...value, reviewBasis: [] });
    assert.deepEqual(withoutReview(reviewed), withoutReview(original));
    assert.equal(reviewed.reviewBasis[0].execution?.completedQuantity, '17.005'); assert.equal((await state()).reviewRequiredCount, 0);
  });
  await t.test('confirmed months cannot be edited; lock revalidates, and locked snapshots survive later corrections', async () => {
    await transition('confirm_period');
    await assert.rejects(async () => x.prepared(await mutation('void_allocation', allocationId)), closingCode('closing_period_not_open'));
    await x.completion(a.id, assignmentId, '16.005', '2027-01-09', '确认后更正');
    await assert.rejects(async () => x.prepared({ action: 'lock_period', periodId, expectedPeriodVersion: (await state()).period.version, reason: '' }), closingCode('closing_execution_review_required'));
    await transition('unconfirm_period'); await x.apply(await mutation('review_allocation', allocationId)); await transition('confirm_period'); await transition('lock_period');
    const locked = await state(); lockedVersion = locked.period.version;
    const frozen = locked.items.find(row => row.id === allocationId)!.snapshot;
    await x.completion(a.id, assignmentId, '15.005', '2027-01-10', '锁定后更正');
    const after = await state(); assert.equal(after.reviewRequiredCount, 0); assert.equal(after.laterCorrectionCount, 1);
    assert.deepEqual(after.items.find(row => row.id === allocationId)!.snapshot, frozen);
    assert.equal(after.items.find(row => row.id === allocationId)!.executionReview.status, 'locked_snapshot_with_later_changes');
  });
  await t.test('new negotiated prices stay independent from frozen closing; reopen retains the full prior locked version', async () => {
    const rule = { kind: 'amount', value: '10' }, preview = await previewSaleAdjustment(pool, editor.actor, { rule, items: [{ salesOrderId: a.id }] }), row = preview.items[0];
    if (row.status !== 'ready') assert.fail();
    await commitSaleAdjustment(pool, editor.actor, { requestId: randomUUID(), reason: '合成后续议价', rule, items: [{ salesOrderId: a.id, expectedVersion: row.expectedVersion, fingerprint: row.fingerprint }] });
    assert.equal((await state()).items.find(row => row.id === allocationId)!.snapshot.outputs.garmentSale?.price, '113');
    await transition('reopen_period'); await x.apply(await mutation('review_allocation', allocationId));
    assert.equal((await state()).items.find(row => row.id === allocationId)!.snapshot.outputs.garmentSale?.price, '113');
    const locked = await readClosingPeriodDetail(pool, editor.actor, periodId, new URLSearchParams({ version: String(lockedVersion), limit: '1' }));
    assert.equal(locked.period.status, 'locked'); assert.equal(locked.total, 3);
    const next = await readClosingPeriodDetail(pool, editor.actor, periodId, new URLSearchParams({ version: String(lockedVersion), limit: '1', offset: '1' }));
    assert.notEqual(next.items[0].id, locked.items[0].id);
    await x.apply(await mutation('update_allocation', allocationId, makeData({ quantity: '4' })));
    assert.equal((await state()).items.find(row => row.id === allocationId)!.snapshot.outputs.garmentSale?.price, '123');
    const oldRows = await readClosingPeriodDetail(pool, editor.actor, periodId, new URLSearchParams({ version: String(lockedVersion) }));
    assert.equal(oldRows.items.find(row => row.id === allocationId)!.snapshot.outputs.garmentSale?.price, '113');
    const history = await readClosingHistory(pool, editor.actor, 'allocation', allocationId, new URLSearchParams({ limit: '1', version: '1' }));
    const oldRow = history.items[0]; assert.ok('snapshot' in oldRow);
    assert.equal(oldRow.snapshot.quantity, '3'); assert.equal(oldRow.snapshot.outputs.garmentSale?.price, '113');
    assert.equal(oldRow.executionReview.requiresReview, false);
  });
  await t.test('lost COMMIT acknowledgement is unknown until the original receipt proves exactly one mutation', async () => {
    const otherBlue = b.basis.priceLines.find(row => row.colorName === 'Blue')!.colorId!;
    const command = await x.prepared({ action: 'create_allocation', periodId, expectedPeriodVersion: (await state()).period.version, orderId: b.id,
      data: makeData({ colorId: otherBlue, assignmentId: null, channels: { sales: true, work: false } }) });
    const original = pool.connect.bind(pool);
    const controlled = new Proxy(pool, { get(target, key) { if (key !== 'connect') { const value = Reflect.get(target, key); return typeof value === 'function' ? value.bind(target) : value; }
      return async () => { const connection = await original(), query = connection.query.bind(connection); let armed = false;
        return new Proxy(connection, { get(target, key) { if (key !== 'query') { const value = Reflect.get(target, key); return typeof value === 'function' ? value.bind(target) : value; }
          return async (sql: string, params: unknown[]) => { if (sql.startsWith('INSERT INTO server_closing_commands')) armed = true; const result = await query(sql, params);
            if (sql === 'COMMIT' && armed) { armed = false; throw Error('Synthetic lost acknowledgement'); } return result; }; } }); }; } }) as pg.Pool;
    const first = await executeClosingCommand(controlled, editor.actor, command); assert.equal(first.status, 'unverified');
    const receipt = await readClosingCommandReceipt(pool, editor.actor, command.requestId); assert.equal(receipt.state, 'recorded');
    const retry = await executeClosingCommand(pool, editor.actor, command); assert.equal(retry.status, 'applied'); assert.equal('replayed' in retry && retry.replayed, true);
    assert.equal((await pool.query('SELECT count(*)::int n FROM server_closing_allocation_versions WHERE actor_id=$1 AND request_id=$2', [editor.actor.internalUserId, command.requestId])).rows[0].n, 1);
  });
  await t.test('audit failure rolls back version, head and receipt; explicit original retry applies once', async () => {
    const command = await x.prepared(await mutation('update_allocation', allocationId, makeData({ quantity: '5' })));
    const version = (await state()).period.version;
    await pool.query("CREATE FUNCTION fail_closing_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.module='关账中心' THEN RAISE EXCEPTION 'synthetic audit failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER fail_closing_audit BEFORE INSERT ON operation_logs FOR EACH ROW EXECUTE FUNCTION fail_closing_audit()");
    try { await assert.rejects(() => executeClosingCommand(pool, editor.actor, command)); }
    finally { await pool.query('DROP TRIGGER fail_closing_audit ON operation_logs; DROP FUNCTION fail_closing_audit()'); }
    assert.equal((await state()).period.version, version); assert.equal((await readClosingCommandReceipt(pool, editor.actor, command.requestId)).state, 'unknown');
    assert.equal((await executeClosingCommand(pool, editor.actor, command)).status, 'applied');
  });
  await t.test('SQL guards preserve all original identities and reject mutation outside command context', async () => {
    const client = await pool.connect();
    try {
      const allocation = await readClosingAllocation(client, allocationId);
      for (const sql of ['UPDATE server_closing_allocation_versions SET quantity=1', 'UPDATE server_closing_period_versions SET status=\'open\'',
        'DELETE FROM server_closing_commands', 'DELETE FROM server_closing_allocation_heads', 'UPDATE server_closing_allocations SET sales_order_id=sales_order_id']) await assert.rejects(() => client.query(sql), { code: '23514' });
      await assert.rejects(() => client.query("INSERT INTO server_closing_periods(month,created_by) VALUES('2026-12',$1)", [editor.actor.internalUserId]), { code: '23514' });
      assert.equal(allocation.orderId, a.id); assert.equal(allocation.periodId, periodId);
    } finally { client.release(); }
  });
  await t.test('trusted HTTP enforces authority, mutation origin, strict input and no browser fallback', async () => {
    assert.equal((await x.request('/periods', undefined, null)).response.status, 401);
    assert.equal((await x.request('/preview', initialIntent, editor.cookie, { Origin: 'https://invalid.example' })).response.status, 403);
    assert.equal((await x.request('/preview?spoof=1', initialIntent)).response.status, 400);
    assert.equal((await x.request('/preview', { ...initialIntent, actorId: editor.actor.userId })).response.status, 400);
    assert.equal((await x.request('/periods?limit=0')).response.status, 400);
    assert.equal((await x.request('/periods/' + periodId + '?quotePrice=1')).response.status, 400);
    const listed = await listClosingPeriods(pool, editor.actor); assert.equal(listed.total, 1);
    const history = await x.request('/periods/' + periodId + '/history?limit=1'); assert.equal(history.response.status, 200); assert.equal(history.body.hasMore, true);
    assert.equal((await x.request('/commands/' + initialCommand.requestId)).body.state, 'recorded');
    assert.deepEqual(x.errors, []);
  });
  await t.test('canonical PostgreSQL receipt size is checked before mutation, including escaped Unicode and control characters', async () => {
    const intent = await mutation('update_allocation', allocationId, makeData({ remark: '\u0001'.repeat(2000) }));
    let command = { requestId: randomUUID(), intent, previewHash: '0'.repeat(64) };
    for (let count = 1; count <= 2000; count++) {
      const candidate = { ...command, intent: { ...intent, reason: '\u0001'.repeat(count) } };
      if (Buffer.byteLength(JSON.stringify(candidate)) > 16384) break; command = candidate;
    }
    assert.ok(Buffer.byteLength(JSON.stringify(command)) <= 16384);
    assert.ok((await pool.query('SELECT octet_length($1::jsonb::text)::int n', [JSON.stringify(command)])).rows[0].n > 16384);
    const version = (await state()).period.version;
    assert.equal((await x.request('/preview', command.intent)).response.status, 422);
    const submitted = await x.request('/commands', command); assert.equal(submitted.response.status, 422); assert.equal(submitted.body.error.code, 'closing_command_too_large');
    assert.equal((await state()).period.version, version); assert.equal((await readClosingCommandReceipt(pool, editor.actor, command.requestId)).state, 'unknown');
    for (const remark of ['\u0000', '\ud800', '\udfff']) assert.equal((await x.request('/preview', { ...initialIntent, month: '2026-12', remark })).response.status, 400);
    const small = { ...initialIntent, month: '2026-12', remark: '中文\u0001备注' };
    const preview = await x.request('/preview', small); assert.equal(preview.response.status, 200);
    const saved = await x.request('/commands', { requestId: randomUUID(), intent: preview.body.intent, previewHash: preview.body.previewHash }); assert.equal(saved.response.status, 200);
    assert.equal((await readClosingPeriodDetail(pool, editor.actor, saved.body.periodId)).period.remark, small.remark);
    assert.deepEqual(x.errors, []);
  });
});
