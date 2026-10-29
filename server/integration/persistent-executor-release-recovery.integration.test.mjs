import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { closingFixture } from './closing-fixture.ts';
import { assertFinancialRecoveryReceipt } from './persistent-financial-recovery-fixture.mjs';
import { assertPersistentDomainRecovery, readPersistentDomainReceipts } from './persistent-domain-recovery-fixture.mjs';
import { readPersistentExecutorReleaseProtection, seedPersistentExecutorReleaseRecovery } from './persistent-executor-release-recovery-fixture.mjs';

test('executor recovery refuses unrelated or unprepared targets before any IO', async () => {
  for (const state of [{ prepared: false, project: 'zhixu-quote-trial-it-0052000001' }, { prepared: true, project: 'existing-user-target' }]) {
    state.sql = state.request = () => assert.fail('no IO before owned preparation');
    await assert.rejects(readPersistentExecutorReleaseProtection(state), { name: 'AssertionError' });
    await assert.rejects(seedPersistentExecutorReleaseRecovery(state, 'synthetic', {}, {}, () => assert.fail(), () => assert.fail()), { name: 'AssertionError' });
  }
});

test('owned PostgreSQL: persistent recovery input uses exact 0052 guard and real original HTTP commands', { timeout: 180000 }, async t => {
  const f = await closingFixture(t), execute = promisify(execFile);
  const state = { prepared: true, project: 'zhixu-quote-trial-it-0052000001',
    sql: async query => Object.values((await f.pool.query(query)).rows[0])[0],
    request: async (path, { cookie, method = 'GET', body } = {}) => {
      const response = await fetch(f.base + path, { method, headers: { Cookie: cookie, Origin: f.base, 'X-Zhixu-Request': '1',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      const bytes = Buffer.from(await response.arrayBuffer());
      return { status: response.status, bytes, json: () => JSON.parse(bytes.toString()) };
    } };
  const json = async (path, body) => {
    const response = await state.request(path, { cookie: f.editor.cookie, ...(body === undefined ? {} : { method: 'POST', body }) });
    assert.equal(response.status, 200, response.bytes.toString()); return response.json();
  };
  const domain = { orderId: (await f.usdOrder()).id, assignments: [], receipts: [] }, financial = { periodIds: [], receipts: [] };
  const production = '/api/v1/production-scheduling', months = '/api/v1/closing/month-plans';
  const save = async (prefix, intent, kind = 'month') => {
    const preview = await json(prefix + '/preview', intent), command = { requestId: randomUUID(), intent: preview.intent, previewHash: preview.previewHash };
    const result = { ...await json(prefix + '/commands', command) }; delete result.replayed;
    assert.equal(result.status, 'applied');
    if (kind !== 'production') {
      const expected = { kind, path: prefix + '/commands/' + command.requestId, command, result };
      assertFinancialRecoveryReceipt(expected, await json(expected.path)); financial.receipts.push(expected);
    }
    return result;
  };
  const plans = await json(production + '/orders/' + domain.orderId);
  const color = plans.order.colors.find(row => row.colorName === 'Blue'), other = plans.order.colors.find(row => row.id !== color.id);
  domain.assignments.push(await f.assignment(domain.orderId, other.id));
  const factory = await f.resource('factories', { name: '合成旧恢复外发厂', enabled: true, remark: '', shortName: '旧', contactPerson: '', phone: '' });
  const assignment = await save(production, { action: 'create', orderId: domain.orderId, assignmentId: null, expectedVersion: 0,
    expectedPlanVersion: (await json(production + '/orders/' + domain.orderId)).order.planVersion,
    data: { executionType: 'outsource', executorId: factory.id, colorId: color.id, plannedQuantity: '25',
      duration: { mode: 'workdays', workdays: 2 }, dates: { mode: 'manual_fixed', startDate: '2027-01-04', endDate: '2027-01-06' }, remark: '' } }, 'production');
  domain.assignments.push(assignment.assignments[0].id);
  const month = (await json('/api/v1/closing/orders/' + domain.orderId + '/month-plan')).plan;
  await save(months, { action: 'move_months', orderId: domain.orderId, expectedVersion: month.version,
    targetMonth: '2027-03', selection: { mode: 'whole' }, reason: 'Synthetic recovery open month' });
  // Exercise preservation against a real locked fragment, not an empty list.
  const openPlan = (await json('/api/v1/closing/orders/' + domain.orderId + '/month-plan')).plan;
  const frozenLine = openPlan.lines.find(row => row.colorId === other.id && row.assignmentId === null);
  await save(months, { action: 'move_months', orderId: domain.orderId, expectedVersion: openPlan.version, targetMonth: '2027-01',
    selection: { mode: 'partial', items: [{ lineId: frozenLine.id, quantity: '1.25' }] }, reason: 'Synthetic exact frozen control quantity' });
  let period = await save('/api/v1/closing', { action: 'create_period', month: '2027-01', taxRatePercent: '0',
    taxRateConfirmed: true, remark: 'Synthetic recovery frozen control' }, 'closing');
  const periodId = period.periodId;
  period = await save('/api/v1/closing', { action: 'sync_month_outputs', periodId, expectedPeriodVersion: period.periodVersion,
    channels: { sales: true, work: true }, reason: 'Synthetic frozen financial basis' }, 'closing');
  for (const action of ['confirm_period', 'lock_period']) period = await save('/api/v1/closing', {
    action, periodId, expectedPeriodVersion: period.periodVersion, reason: 'Synthetic explicit frozen control' }, 'closing');
  assert.equal((await json('/api/v1/closing/periods/' + periodId)).period.status, 'locked');
  financial.periodIds.push(periodId);
  const run = async (binary, args) => (await execute(binary, args, { encoding: 'utf8', windowsHide: true, timeout: 30000 })).stdout.trim();
  const seeded = await seedPersistentExecutorReleaseRecovery(state, f.editor.cookie, domain, financial, run, save);
  assert.equal(seeded.releasedQuantity, '2.125'); assert.equal(financial.receipts.at(-1).command.intent.action, 'release_executors');
  assert.equal(domain.receipts.length, 2);
  await readPersistentDomainReceipts(state, f.editor.cookie, domain.receipts);
  const exact = await readPersistentExecutorReleaseProtection(state);
  assert.equal(exact.enabled, 'O'); assert.equal(exact.type, 5); assert.equal(exact.deferrable, true); assert.equal(exact.initiallyDeferred, true);
  assert.match(exact.functionDefinitionSha256, /^[a-f0-9]{64}$/u);
  for (const [sql, error] of [
    ['ALTER TABLE server_closing_month_plan_versions DISABLE TRIGGER month_executor_release_validation', /executor_release_trigger_identity:enabled/u],
    ['DROP TRIGGER month_executor_release_validation ON server_closing_month_plan_versions', /executor_release_trigger_required/u],
    ['ALTER FUNCTION validate_closing_executor_release() SECURITY DEFINER', /executor_release_trigger_identity:securityDefiner/u],
    ["ALTER FUNCTION validate_closing_executor_release() SET search_path TO pg_catalog", /executor_release_trigger_identity:hasConfiguration/u],
    ["CREATE OR REPLACE FUNCTION validate_closing_executor_release() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END; $$", /executor_release_function_body/u],
    ['DROP TRIGGER month_executor_release_validation ON server_closing_month_plan_versions; CREATE CONSTRAINT TRIGGER month_executor_release_validation AFTER INSERT ON server_closing_month_plan_versions NOT DEFERRABLE FOR EACH ROW EXECUTE FUNCTION validate_closing_executor_release()', /executor_release_trigger_identity:deferrable/u],
  ]) await t.test('catalog negative control: ' + error.source, async () => {
    const client = await f.pool.connect();
    try {
      await client.query('BEGIN'); await client.query(sql);
      const transactionState = { ...state, sql: async query => Object.values((await client.query(query)).rows[0])[0] };
      await assert.rejects(readPersistentExecutorReleaseProtection(transactionState), error);
    } finally { await client.query('ROLLBACK'); client.release(); }
    assert.deepEqual(await readPersistentExecutorReleaseProtection(state), exact);
  });
  const before = { closingExecutorProtection: exact };
  assert.doesNotThrow(() => assertPersistentDomainRecovery(before, structuredClone(before)));
  for (const changed of [null, { ...exact, deferrable: false }, { ...exact, bodySha256: '0'.repeat(64) }])
    assert.throws(() => assertPersistentDomainRecovery(before, { closingExecutorProtection: changed }), { name: 'AssertionError' });
  assert.deepEqual(f.errors, []);
});
