import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import pg from 'pg';
import { resolve } from 'node:path';
import { closingFixture, closingCode } from './closing-fixture.js';
import { executeClosingCommand, readClosingCommandReceipt } from '../closing/service.js';
import { readClosingPeriodDetail } from '../closing/read-service.js';
import { runMigrations } from '../db/migration-runner.js';
import { previewSaleAdjustment, commitSaleAdjustment } from '../sales-orders/sale-adjustment-service.js';
import { collectFullNormalizationEvidence } from '../sales-orders/normalization-full-evidence.js';
import { collectNormalizationEvidenceInTransaction, normalizationReferences } from '../sales-orders/normalization-preview.js';
import { parseAttributionProposal } from '../sales-orders/normalization-execution-model.js';
import type { ClosingAllocationData } from '../closing/contract.js';

const execFileAsync = promisify(execFile);
test('Gate8B closing: race fences, first completion, inventory and exact nonempty restore', { timeout: 180000 }, async t => {
  const x = await closingFixture(t), { pool, editor } = x;
  const a = await x.order(), b = await x.order(), colorId = a.basis.priceLines.find(row => row.colorName === 'Blue')!.colorId!;
  const data = (patch: Partial<ClosingAllocationData> = {}): ClosingAllocationData => ({ quantity: '1.000001', colorId,
    channels: { sales: true, work: true }, assignmentId: null, executor: null, remark: 'Synthetic exact restore', ...patch });
  async function period(month: string) { return (await x.apply({ action: 'create_period', month, taxRatePercent: '7.125', taxRateConfirmed: true, remark: '' })).result.periodId; }
  const state = (id: string) => readClosingPeriodDetail(pool, editor.actor, id, new URLSearchParams({ includeVoided: 'true' }));
  async function add(id: string, values = data()) { return x.apply({ action: 'create_allocation', periodId: id, expectedPeriodVersion: (await state(id)).period.version, orderId: a.id, data: values }); }
  async function transition(id: string, action: 'confirm_period' | 'lock_period' | 'reopen_period') {
    return x.apply({ action, periodId: id, expectedPeriodVersion: (await state(id)).period.version, reason: 'Synthetic explicit action' });
  }
  await t.test('confirm competing with a new allocation cannot approve unseen rows or insert into a confirmed period', async () => {
    const id = await period('2026-11'), version = (await state(id)).period.version;
    const confirm = await x.prepared({ action: 'confirm_period', periodId: id, expectedPeriodVersion: version, reason: '' });
    const allocation = await x.prepared({ action: 'create_allocation', periodId: id, expectedPeriodVersion: version, orderId: a.id, data: data() });
    const results = await Promise.all([executeClosingCommand(pool, editor.actor, confirm), executeClosingCommand(pool, editor.actor, allocation)]);
    assert.deepEqual(results.map(row => row.status).sort(), ['applied', 'rejected']);
    const rejected = results.find(row => row.status === 'rejected')!; if (rejected.status !== 'rejected') assert.fail();
    assert.equal(rejected.error.code, 'closing_period_version_conflict');
    const after = await state(id); assert.equal(after.period.version, 2);
    assert.equal(after.total, after.period.status === 'confirmed' ? 0 : 1);
    for (const command of [confirm, allocation]) assert.equal((await readClosingCommandReceipt(pool, editor.actor, command.requestId)).state, 'recorded');
  });
  await t.test('a command waiting on the production fence rereads the newly adopted price before writing', async () => {
    const id = await period('2026-12'), command = await x.prepared({ action: 'create_allocation', periodId: id, expectedPeriodVersion: 1, orderId: a.id, data: data() });
    const holder = await pool.connect(); let result: ReturnType<typeof executeClosingCommand> | null = null;
    try {
      await holder.query('BEGIN'); await holder.query("SELECT pg_advisory_xact_lock(hashtextextended('production-planning-write-v1',0))");
      result = executeClosingCommand(pool, editor.actor, command);
      const deadline = Date.now() + 2000; let waiting = false;
      while (Date.now() < deadline) {
        waiting = (await pool.query("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name='synthetic-closing-commands' AND wait_event_type='Lock' AND query LIKE '%production-planning-write-v1%') waiting")).rows[0].waiting;
        if (waiting) break; await new Promise(done => setTimeout(done, 20));
      }
      assert.equal(waiting, true, 'The real PostgreSQL writer must be observed waiting, not a timer assumption');
      const rule = { kind: 'amount', value: '1' }, preview = await previewSaleAdjustment(pool, editor.actor, { rule, items: [{ salesOrderId: a.id }] }), row = preview.items[0];
      if (row.status !== 'ready') assert.fail();
      const adjusted = await commitSaleAdjustment(pool, editor.actor, { requestId: randomUUID(), reason: 'Synthetic concurrent negotiation', rule,
        items: [{ salesOrderId: a.id, expectedVersion: row.expectedVersion, fingerprint: row.fingerprint }] });
      assert.equal(adjusted.items[0].status, 'updated');
    } finally { await holder.query('ROLLBACK'); holder.release(); }
    assert.ok(result); const outcome = await result;
    assert.equal(outcome.status, 'rejected'); if (outcome.status !== 'rejected') assert.fail(); assert.equal(outcome.error.code, 'closing_preview_changed');
    assert.equal((await state(id)).total, 0); assert.equal((await state(id)).period.version, 1);
    const fresh = await add(id); assert.equal((await state(id)).items[0].snapshot.outputs.garmentSale?.price, '114');
    assert.equal(fresh.result.allocationVersion, 1);
  });
  const retainedPeriod = await period('2027-01'), assignmentId = await x.assignment(a.id, colorId);
  const retained = await add(retainedPeriod, data({ assignmentId })); const allocationId = retained.result.allocationId!;
  await t.test('the first recorded completion is a version change and review never replaces manually confirmed terms', async () => {
    const original = (await state(retainedPeriod)).items[0].snapshot;
    assert.equal(original.productionBasis[0].execution, null);
    await x.completion(a.id, assignmentId, '9.005');
    assert.equal((await state(retainedPeriod)).reviewRequiredCount, 1);
    await assert.rejects(() => transition(retainedPeriod, 'confirm_period'), closingCode('closing_execution_review_required'));
    await x.apply({ action: 'review_allocation', periodId: retainedPeriod, expectedPeriodVersion: (await state(retainedPeriod)).period.version,
      allocationId, expectedVersion: 1, reason: 'Synthetic explicit first-completion review' });
    const reviewed = (await state(retainedPeriod)).items[0].snapshot;
    assert.deepEqual({ ...reviewed, reviewBasis: [] }, { ...original, reviewBasis: [] });
    assert.equal(reviewed.quantity, '1.000001'); assert.equal(reviewed.reviewBasis[0].execution?.completedQuantity, '9.005');
    await transition(retainedPeriod, 'confirm_period'); await transition(retainedPeriod, 'lock_period');
  });
  await t.test('disabled renamed resources reject new manual assignments but never prevent void or reopening old snapshots', async () => {
    const id = await period('2027-02'), created = await add(id, data({ executor: { type: 'internal', id: x.group.id } }));
    const frozen = (await state(id)).items[0].snapshot;
    await transition(id, 'confirm_period'); await transition(id, 'lock_period');
    await x.resource('groups', { ...x.groupData, name: 'Synthetic renamed disabled group', enabled: false }, x.group.id, x.group.version);
    await transition(id, 'reopen_period');
    await assert.rejects(() => add(id, data({ executor: { type: 'internal', id: x.group.id } })), closingCode('closing_executor_disabled'));
    await x.apply({ action: 'void_allocation', periodId: id, expectedPeriodVersion: (await state(id)).period.version,
      allocationId: created.result.allocationId!, expectedVersion: 1, reason: 'Synthetic cancellation retains executor facts' });
    const after = await state(id); assert.equal(after.items[0].status, 'voided'); assert.deepEqual(after.items[0].snapshot, frozen);
    assert.equal(frozen.executor?.name, x.groupData.name); assert.equal(frozen.executor?.version, 1);
  });
  await t.test('full order inventory includes closing identities, heads, commands and locked history without authorizing normalization', async () => {
    const pair = [a.id, b.id].sort(), caseId = (await pool.query('INSERT INTO sales_order_normalization_cases(first_order_id,second_order_id,created_by,request_id,payload_hash) VALUES($1,$2,$3,$4,$5) RETURNING id',
      [...pair, editor.actor.internalUserId, randomUUID(), 'a'.repeat(64)])).rows[0].id;
    await pool.query("INSERT INTO sales_order_normalization_case_events(case_id,version,actor_id,request_id,payload_hash,event_type,reason,evidence) VALUES($1,1,$2,$3,$4,'opened','synthetic closing inventory','{}')", [caseId, editor.actor.internalUserId, randomUUID(), 'b'.repeat(64)]);
    const proposal = parseAttributionProposal({ changeType: 'normalize', caseVersion: 1, assignments: pair.map(id => ({ originalOrderId: id, effectiveOrderId: a.id })), reason: 'Synthetic', recoveryPlanHash: 'a'.repeat(64) });
    const read = async () => { const client = await pool.connect(); try { await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const full = await collectFullNormalizationEvidence(client, caseId, proposal, { coverage: 'unavailable', reason: 'Synthetic no external coverage' });
      const counts = await collectNormalizationEvidenceInTransaction(client, pair); await client.query('COMMIT'); return { full, counts };
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); } };
    const before = await read(); assert.deepEqual(before.full.unknownReferences, []); assert.equal(before.full.executionAuthorized, false);
    assert.ok(before.full.blockers.includes('production_finance_coverage_unavailable')); assert.ok(before.full.requiredReviews.includes('finance'));
    for (const [relation, column] of [['server_closing_allocations', 'sales_order_id'], ['server_closing_allocation_versions', 'sales_order_id'],
      ['server_closing_allocation_heads', 'closing_head'], ['server_closing_period_heads', 'closing_period_head'], ['server_closing_commands', 'declared_closing_order'],
      ['server_closing_commands', 'scoped_closing'], ['server_closing_period_versions', 'locked_period'], ['operation_logs', 'scoped_closing_audit']]) {
      assert.ok(before.full.references.some(row => row.relation === relation && row.column === column && row.orderId === a.id && row.count > 0), relation + ':' + column);
    }
    assert.equal(JSON.stringify(before.full).includes('Synthetic exact restore'), false, 'Only digests leave the all-row inventory');
    await transition(retainedPeriod, 'reopen_period');
    const after = await read(); assert.notEqual(after.full.evidenceHash, before.full.evidenceHash);
    const head = (value: typeof before) => value.full.references.find(row => row.relation === 'server_closing_period_heads' && row.orderId === a.id)!.fingerprint;
    assert.notEqual(head(after), head(before)); assert.ok(after.full.requiredReviews.includes('finance'), 'Historical locked versions retain financial review');
    const client = await pool.connect(); try {
      await client.query('BEGIN'); await client.query('ALTER TABLE server_closing_allocation_heads RENAME TO synthetic_closing_heads_hidden');
      await assert.rejects(() => normalizationReferences(client), closingCode('closing_reference_schema_incomplete'));
    } finally { await client.query('ROLLBACK'); client.release(); }
  });
  await t.test('a nonempty dump restored only into a new owned empty database preserves every row, sequence and closing receipt', async () => {
    assert.match(x.postgres.containerName, /^zhixu-pg-it-[a-f0-9]{12}$/u);
    const source = (await pool.query('SELECT current_database() name')).rows[0].name as string;
    const targetUrl = await x.postgres.createDatabase('closing_restore'), target = new URL(targetUrl).pathname.slice(1);
    assert.match(source, /^zhixu_it_closing_commands_[a-f0-9]{8}$/u); assert.match(target, /^zhixu_it_closing_restore_[a-f0-9]{8}$/u); assert.notEqual(source, target);
    const restored = new pg.Pool({ connectionString: targetUrl, max: 2 });
    async function fingerprint(db: pg.Pool) {
      const tables = (await db.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows.map(row => row.tablename as string);
      const rows: Record<string, { count: number; digest: string }> = {}, sequences: Record<string, unknown> = {};
      for (const name of tables) { assert.match(name, /^[a-z0-9_]+$/u); rows[name] = (await db.query(`SELECT count(*)::int count,md5(coalesce(jsonb_agg(to_jsonb(r) ORDER BY to_jsonb(r)::text)::text,'[]')) digest FROM public."${name}" r`)).rows[0]; }
      for (const { name } of (await db.query("SELECT c.relname name FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='S' ORDER BY c.relname")).rows) {
        assert.match(name, /^[a-z0-9_]+$/u); sequences[name] = (await db.query(`SELECT last_value::text,is_called FROM public."${name}"`)).rows[0];
      }
      return { rows, sequences };
    }
    try {
      assert.equal((await restored.query("SELECT count(*)::int n FROM pg_tables WHERE schemaname='public'")).rows[0].n, 0);
      const original = await fingerprint(pool);
      const docker = (args: string[]) => execFileAsync('docker', ['exec', x.postgres.containerName, ...args], { encoding: 'utf8', timeout: 60000, windowsHide: true });
      await docker(['pg_dump', '-U', 'postgres', '-d', source, '-Fc', '-f', '/tmp/closing-owned-synthetic.dump']);
      await docker(['pg_restore', '-U', 'postgres', '--exit-on-error', '--no-owner', '-d', target, '/tmp/closing-owned-synthetic.dump']);
      assert.deepEqual(await fingerprint(restored), original);
      assert.deepEqual((await runMigrations(restored, resolve('database/migrations'))).applied, []);
      const originalState = await state(retainedPeriod), restoredState = await readClosingPeriodDetail(restored, editor.actor, retainedPeriod, new URLSearchParams({ includeVoided: 'true' }));
      assert.deepEqual(restoredState, originalState);
      assert.deepEqual(await readClosingCommandReceipt(restored, editor.actor, retained.command.requestId), await readClosingCommandReceipt(pool, editor.actor, retained.command.requestId));
      assert.deepEqual(await fingerprint(restored), original, 'Read validation must not regenerate identities, write logins or advance sequences');
    } finally { await restored.end(); }
  });
  assert.deepEqual(x.errors, []);
});
