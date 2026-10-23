import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { copyFile, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, resolve } from 'node:path';
import pg from 'pg';
import { startDisposablePostgres, type DisposablePostgres } from './postgres-container.js';
import { runMigrations, verifyMigrationsCurrent, PendingMigrationsError } from '../db/migration-runner.js';
import { CURRENT_MIGRATION_FILES } from './current-migration-ledger-fixture.js';
import { synchronizePermissionCatalog } from '../auth/permissions.js';
import type { TrustedIdentity } from '../auth/session.js';
import { createAinuokeSalesOrder, type CreateAinuokeSalesOrderInput } from '../sales-orders/service.js';
import { createSalesOrder } from '../sales-orders/repository.js';
import { readDeliveryPlanSet } from '../sales-orders/delivery-plan-repository.js';
import { updateDeliveryPlans, readDeliveryPlanRequestReceipt } from '../sales-orders/delivery-plan-service.js';
import { DELIVERY_PLAN_RECEIPT_MAX_BYTES } from '../sales-orders/delivery-plan-request.js';
import { refreshAinuokeSalesOrderSource } from '../sales-orders/delivery-plan-source-refresh.js';
import { writeAttributionHeadInTransaction } from '../sales-orders/effective-attribution.js';
import { collectNormalizationEvidenceInTransaction, normalizationReferences } from '../sales-orders/normalization-preview.js';
import { createApp } from '../app.js';
import type { DeliveryPlanSetDto } from '../sales-orders/delivery-plan-model.js';

const code = (expected: string) => (error: unknown) => (error as { code: string }).code === expected;
const planCommand = (version = 1) => ({ requestId: randomUUID(), expectedVersion: version,
  upserts: [{ id: null as string | null, deliveryDate: '2026-12-01', quantity: '1.000000000000000001' }], voidIds: [] as string[] });

test('DeliveryPlan exact receipts use only owned disposable PostgreSQL', { timeout: 240000 }, async t => {
  const db = await startDisposablePostgres(), pool = new pg.Pool({ connectionString: await db.createDatabase('delivery_receipts'), max: 8 });
  t.after(async () => { try { await pool.end(); } finally { await db.stop(); } });
  await runMigrations(pool, resolve('database/migrations')); await synchronizePermissionCatalog(pool);
  const main = await syntheticActor(pool), actor = main.actor;
  let serial = 0;
  const create = async () => {
    const n = ++serial;
    const input: CreateAinuokeSalesOrderInput = { source: { sourceId: `receipt-source-${n}`, sourceRowIdentity: `receipt-row-${n}`,
      salesContractNo: `SYN-RECEIPT-${n}`, insideOrderNo: `SYN-INSIDE-${n}`, lifecycleStatusRaw: '生效', contractDate: '2026-10-01',
      contractDeliveryDate: '2026-11-01', styleNo: 'SYNTHETIC', companyNameSnapshot: '合成', customerNameSnapshot: '合成', brandNameSnapshot: '合成',
      quantity: 100, sourceHash: `synthetic-${n}`, fetchedAt: '2026-10-21T00:00:00Z' }, colors: [] };
    return { id: (await createAinuokeSalesOrder(pool, actor, input)).salesOrder.id, input };
  };
  const receipts = async (id: string) => (await pool.query('SELECT to_jsonb(r) row FROM sales_order_delivery_plan_requests r WHERE sales_order_id=$1 ORDER BY id', [id])).rows;
  const physical = async (id: string) => ({ plans: await readDeliveryPlanSet(pool, id),
    order: (await pool.query('SELECT to_jsonb(o) row FROM sales_orders o WHERE id=$1', [id])).rows,
    mirror: (await pool.query('SELECT to_jsonb(o) row FROM ainuoke_sales_order_contract_mirrors o WHERE sales_order_id=$1', [id])).rows,
    logs: (await pool.query('SELECT to_jsonb(o) row FROM operation_logs o WHERE entity_id=$1 ORDER BY id', [id])).rows });

  await t.test('explicit replay returns the exact original rows after subsequent manual and source changes', async () => {
    const order = await create(), command = planCommand(), first = await updateDeliveryPlans(pool, actor, order.id, command);
    assert.equal(first.plans.length, 2);
    const row = first.plans.find(p => !p.isDerivedDefault)!;
    await updateDeliveryPlans(pool, actor, order.id, { ...planCommand(first.version), upserts: [{ id: row.id, deliveryDate: '2027-01-01', quantity: '3' }] });
    const current = await readDeliveryPlanSet(pool, order.id);
    await refreshAinuokeSalesOrderSource(pool, actor, order.id, { ...order.input,
      source: { ...order.input.source, sourceHash: 'receipt-refreshed', contractDeliveryDate: '2027-02-01', quantity: 150 },
      expectedSourceHash: order.input.source.sourceHash, expectedPlanVersion: current.version });
    const before = await physical(order.id), beforeReceipts = await receipts(order.id);
    assert.deepEqual(await updateDeliveryPlans(pool, actor, order.id.toUpperCase(), { ...command, requestId: command.requestId.toUpperCase() }), first);
    const receipt = await readDeliveryPlanRequestReceipt(pool, actor, order.id, command);
    assert.equal(receipt.status, 'applied'); assert.equal(receipt.requestId, command.requestId);
    if (receipt.status === 'applied') assert.deepEqual(receipt.deliveryPlanSet, first);
    assert.deepEqual(await physical(order.id), before); assert.deepEqual(await receipts(order.id), beforeReceipts);
    for (const changed of [{ ...command, expectedVersion: first.version }, { ...command, upserts: [{ ...command.upserts[0], quantity: '9' }] }]) {
      await assert.rejects(() => updateDeliveryPlans(pool, actor, order.id, changed), code('delivery_plan_request_conflict'));
      await assert.rejects(() => readDeliveryPlanRequestReceipt(pool, actor, order.id, changed), code('delivery_plan_request_conflict'));
    }
    const other = await create();
    await assert.rejects(() => readDeliveryPlanRequestReceipt(pool, actor, other.id, command), code('delivery_plan_request_conflict'));
    assert.equal((await readDeliveryPlanRequestReceipt(pool, (await syntheticActor(pool)).actor, order.id, command)).status, 'unknown');
  });

  await t.test('legacy commands share one identity, explicit IDs remain independent and retain durable CAS rejection', async () => {
    const order = await create(), original = planCommand();
    const legacy = { expectedVersion: original.expectedVersion, upserts: original.upserts, voidIds: original.voidIds };
    const first = await Promise.all([updateDeliveryPlans(pool, actor, order.id, legacy), updateDeliveryPlans(pool, actor, order.id, legacy)]);
    assert.deepEqual(first[0], first[1]); assert.equal((await receipts(order.id)).length, 1);
    const receipt = await readDeliveryPlanRequestReceipt(pool, actor, order.id, legacy);
    assert.equal(receipt.requestMode, 'legacy'); assert.equal(receipt.requestId, null); assert.equal(receipt.status, 'applied');
    const different = { ...legacy, requestId: randomUUID() };
    await assert.rejects(() => updateDeliveryPlans(pool, actor, order.id, different), code('delivery_plan_version_conflict'));
    const saved = await receipts(order.id), before = await physical(order.id);
    await assert.rejects(() => updateDeliveryPlans(pool, actor, order.id, different), code('delivery_plan_version_conflict'));
    assert.equal((await readDeliveryPlanRequestReceipt(pool, actor, order.id, different)).status, 'rejected');
    assert.deepEqual(await receipts(order.id), saved); assert.deepEqual(await physical(order.id), before);
  });

  await t.test('same explicit request races once and the same UUID belongs independently to another actor', async () => {
    const order = await create(), command = planCommand();
    const result = await Promise.all([updateDeliveryPlans(pool, actor, order.id, command), updateDeliveryPlans(pool, actor, order.id, command)]);
    assert.deepEqual(result[0], result[1]); assert.equal((await receipts(order.id)).length, 1);
    const who = await syntheticActor(pool), next = { ...command, expectedVersion: result[0].version };
    await updateDeliveryPlans(pool, who.actor, order.id, next);
    assert.equal((await receipts(order.id)).length, 2);
    const original = await readDeliveryPlanRequestReceipt(pool, actor, order.id, command), other = await readDeliveryPlanRequestReceipt(pool, who.actor, order.id, next);
    assert.equal(original.status, 'applied'); assert.equal(other.status, 'applied');
    if (original.status === 'applied' && other.status === 'applied') { assert.equal(original.deliveryPlanSet.version, 2); assert.equal(other.deliveryPlanSet.version, 3); }
  });

  await t.test('history beyond 100 rows is included in a successful original receipt without a first-page approximation', async () => {
    const order = await create();
    await pool.query(`INSERT INTO sales_order_delivery_plans(sales_order_id,delivery_date,quantity,voided_at)
      SELECT $1::uuid,'2026-01-01'::date,0,now() FROM generate_series(1,250)`, [order.id]);
    const command = planCommand(), saved = await updateDeliveryPlans(pool, actor, order.id, command);
    assert.equal(saved.plans.length, 252); assert.equal(saved.plans.filter(p => p.voidedAt !== null).length, 250);
    const receipt = await readDeliveryPlanRequestReceipt(pool, actor, order.id, command);
    assert.equal(receipt.status, 'applied'); if (receipt.status === 'applied') assert.deepEqual(receipt.deliveryPlanSet, saved);
  });

  await t.test('existing completed and cancelled lifecycle behavior is retained without changing SO history', async () => {
    for (const state of ['completed', 'cancelled']) {
      const order = await create(); await pool.query('UPDATE sales_orders SET lifecycle_state=$2,version=version+1 WHERE id=$1', [order.id, state]);
      const before = (await physical(order.id)).order;
      await updateDeliveryPlans(pool, actor, order.id, planCommand());
      assert.deepEqual((await physical(order.id)).order, before);
    }
  });

  await t.test('unknown lookup performs no domain/ledger/audit writes, even while the original commit is in flight', async () => {
    const order = await create(), command = planCommand(), before = await physical(order.id);
    const held = pauseQuery(pool, sql => sql === 'COMMIT', 'before');
    const pending = updateDeliveryPlans(held.pool, actor, order.id, command); void pending.catch(() => undefined);
    try {
      await reached(held, pending);
      assert.equal((await readDeliveryPlanRequestReceipt(pool, actor, order.id, command)).status, 'unknown');
      assert.deepEqual(await receipts(order.id), []); assert.deepEqual(await physical(order.id), before);
    } finally { held.resume(); }
    const saved = await pending;
    const result = await readDeliveryPlanRequestReceipt(pool, actor, order.id, command);
    assert.equal(result.status, 'applied'); if (result.status === 'applied') assert.deepEqual(result.deliveryPlanSet, saved);
  });

  await t.test('COMMIT succeeds but acknowledgement is lost: only original receipt is recovered, no second plan or audit', async () => {
    const order = await create(), command = planCommand();
    let lost = false;
    const broken = queryProxy(pool, async (query, values, run) => {
      const result = await run(query, values);
      if (query === 'COMMIT' && !lost) { lost = true; throw new Error('synthetic acknowledgement lost after committed database transaction'); }
      return result;
    });
    await assert.rejects(() => updateDeliveryPlans(broken, actor, order.id, command), /synthetic acknowledgement lost/);
    const before = await physical(order.id), rows = await receipts(order.id);
    assert.equal(rows.length, 1); assert.equal(before.plans.version, 2); assert.equal(before.plans.plans.length, 2);
    const receipt = await readDeliveryPlanRequestReceipt(pool, actor, order.id, command);
    assert.equal(receipt.status, 'applied');
    assert.deepEqual(await updateDeliveryPlans(pool, actor, order.id, command), before.plans);
    assert.deepEqual(await physical(order.id), before); assert.deepEqual(await receipts(order.id), rows);
  });

  await t.test('caller mutation while waiting cannot change stored command, void targets or request identity', async () => {
    const order = await create(), command = planCommand(), original = structuredClone(command);
    const held = pauseQuery(pool, sql => sql === 'BEGIN', 'before');
    const pending = updateDeliveryPlans(held.pool, actor, order.id, command); void pending.catch(() => undefined);
    try {
      await reached(held, pending);
      command.upserts[0].quantity = '900'; command.voidIds.push((await readDeliveryPlanSet(pool, order.id)).plans[0].id); command.requestId = randomUUID();
    } finally { held.resume(); }
    const saved = await pending;
    assert.equal(saved.plans.find(p => !p.isDerivedDefault)?.quantity, original.upserts[0].quantity);
    assert.equal(saved.plans[0].voidedAt, null);
    assert.equal((await readDeliveryPlanRequestReceipt(pool, actor, order.id, original)).status, 'applied');
    assert.equal((await readDeliveryPlanRequestReceipt(pool, actor, order.id, command)).status, 'unknown');
  });

  await t.test('fresh identity, archival and role-grant checks protect save, replay and receipt', async () => {
    const who = await syntheticActor(pool), order = await create(), command = planCommand();
    await updateDeliveryPlans(pool, who.actor, order.id, command);
    const unchanged = await physical(order.id), oldReceipts = await receipts(order.id);
    for (const mode of ['revoke', 'disabled', 'archived'] as const) {
      if (mode === 'revoke') await pool.query('DELETE FROM app_role_permissions WHERE role_id=$1 AND permission_key=$2', [who.role, 'order.edit']);
      else await pool.query('UPDATE app_users SET active=false,archived_at=$2 WHERE id=$1', [who.actor.internalUserId, mode === 'archived' ? new Date() : null]);
      const error = mode === 'revoke' ? 'permission_denied' : 'authentication_required';
      await assert.rejects(() => updateDeliveryPlans(pool, who.actor, order.id, command), code(error));
      await assert.rejects(() => readDeliveryPlanRequestReceipt(pool, who.actor, order.id, command), code(error));
      if (mode === 'revoke') await pool.query('INSERT INTO app_role_permissions VALUES($1,$2)', [who.role, 'order.edit']);
      else await pool.query('UPDATE app_users SET active=true,archived_at=NULL WHERE id=$1', [who.actor.internalUserId]);
    }
    assert.deepEqual(await physical(order.id), unchanged); assert.deepEqual(await receipts(order.id), oldReceipts);
  });

  for (const revoke of ['user', 'role'] as const) await t.test(`fresh ${revoke} authorization is re-read after waiting on administration locks`, async () => {
    const who = await syntheticActor(pool), order = await create(), command = planCommand(), lock = await pool.connect();
    const name = 'delivery-auth-' + randomUUID(), pendingPool = new pg.Pool({ ...pool.options, application_name: name, max: 1 });
    let pending: Promise<unknown> | undefined;
    try {
      await lock.query('BEGIN');
      if (revoke === 'user') await lock.query('SELECT id FROM app_users WHERE id=$1 FOR UPDATE', [who.actor.internalUserId]);
      else await lock.query('SELECT id FROM app_roles WHERE id=$1 FOR UPDATE', [who.role]);
      pending = updateDeliveryPlans(pendingPool, who.actor, order.id, command); void pending.catch(() => undefined);
      await waitForLock(pool, name);
      if (revoke === 'user') await lock.query('UPDATE app_users SET active=false WHERE id=$1', [who.actor.internalUserId]);
      else await lock.query('DELETE FROM app_role_permissions WHERE role_id=$1 AND permission_key=$2', [who.role, 'order.edit']);
      await lock.query('COMMIT');
      await assert.rejects(pending, code(revoke === 'user' ? 'authentication_required' : 'permission_denied'));
      assert.deepEqual(await receipts(order.id), []); assert.equal((await readDeliveryPlanSet(pool, order.id)).ownership, 'source_derived');
    } finally { await lock.query('ROLLBACK'); lock.release(); await pending?.catch(() => undefined); await pendingPool.end(); }
  });

  await t.test('audit and database failures never produce a terminal receipt or partial plan', async () => {
    const order = await create(), command = planCommand(), before = await physical(order.id);
    await pool.query("CREATE FUNCTION synthetic_receipt_audit_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='修改交期' THEN RAISE EXCEPTION 'synthetic audit fault' USING ERRCODE='23503'; END IF; RETURN NEW; END $$");
    await pool.query('CREATE TRIGGER synthetic_receipt_audit_fault BEFORE INSERT ON operation_logs FOR EACH ROW EXECUTE FUNCTION synthetic_receipt_audit_fault()');
    try { await assert.rejects(() => updateDeliveryPlans(pool, actor, order.id, command), code('23503')); }
    finally { await pool.query('DROP TRIGGER synthetic_receipt_audit_fault ON operation_logs'); await pool.query('DROP FUNCTION synthetic_receipt_audit_fault()'); }
    assert.deepEqual(await physical(order.id), before); assert.deepEqual(await receipts(order.id), []);
    assert.equal((await readDeliveryPlanRequestReceipt(pool, actor, order.id, command)).status, 'unknown');
    const broken = queryProxy(pool, async (sql, values, run) => { if (sql.startsWith('INSERT INTO sales_order_delivery_plan_requests')) throw new Error('synthetic ledger failure'); return run(sql, values); });
    await assert.rejects(() => updateDeliveryPlans(broken, actor, order.id, command), /synthetic ledger failure/);
    assert.deepEqual(await physical(order.id), before); assert.deepEqual(await receipts(order.id), []);
    await updateDeliveryPlans(pool, actor, order.id, command); assert.equal((await receipts(order.id)).length, 1);
  });

  await t.test('real root lock timeout remains an unconfirmed failure, with no durable rejected receipt', async () => {
    const order = await create(), command = planCommand(), before = await physical(order.id), lock = await pool.connect();
    try {
      await lock.query('BEGIN'); await lock.query('SELECT id FROM sales_orders WHERE id=$1 FOR UPDATE', [order.id]);
      await assert.rejects(() => updateDeliveryPlans(pool, actor, order.id, command), code('55P03'));
    } finally { await lock.query('ROLLBACK'); lock.release(); }
    assert.deepEqual(await physical(order.id), before); assert.deepEqual(await receipts(order.id), []);
    assert.equal((await readDeliveryPlanRequestReceipt(pool, actor, order.id, command)).status, 'unknown');
  });

  await t.test('historical aliases retain original results but cannot receive a fresh plan command', async () => {
    const order = await create(), primary = (await createSalesOrder(pool, { creationSource: 'manual' })).id, command = planCommand();
    const saved = await updateDeliveryPlans(pool, actor, order.id, command);
    await syntheticAlias(pool, actor, order.id, primary);
    const before = await physical(order.id), rootBefore = await physical(primary);
    assert.deepEqual(await updateDeliveryPlans(pool, actor, order.id, command), saved);
    assert.equal((await readDeliveryPlanRequestReceipt(pool, actor, order.id, command)).status, 'applied');
    const next = planCommand(saved.version);
    await assert.rejects(() => updateDeliveryPlans(pool, actor, order.id, next), code('historical_duplicate_order_read_only'));
    assert.equal((await readDeliveryPlanRequestReceipt(pool, actor, order.id, next)).status, 'rejected');
    assert.deepEqual(await physical(order.id), before); assert.deepEqual(await physical(primary), rootBefore);
  });

  await t.test('receipts are immutable, audit-linked and registered as complete original-order reference evidence', async () => {
    const order = await create(), other = await create(); await updateDeliveryPlans(pool, actor, order.id, planCommand());
    const row = (await pool.query('SELECT * FROM sales_order_delivery_plan_requests WHERE sales_order_id=$1', [order.id])).rows[0];
    assert.ok((await pool.query('SELECT 1 FROM operation_logs WHERE id=$1 AND entity_id=$2', [row.audit_log_id, order.id])).rowCount);
    await assert.rejects(() => pool.query("UPDATE sales_order_delivery_plan_requests SET result='{}' WHERE id=$1", [row.id]), code('23514'));
    await assert.rejects(() => pool.query('DELETE FROM sales_order_delivery_plan_requests WHERE id=$1', [row.id]), code('23514'));
    const client = await pool.connect();
    try {
      const refs = await normalizationReferences(client); assert.ok(refs.some(([table, column, key]) => table === 'sales_order_delivery_plan_requests' && column === 'sales_order_id' && key === 'id'));
      await client.query('BEGIN');
      const evidence = await collectNormalizationEvidenceInTransaction(client, [order.id, other.id]);
      assert.ok(JSON.stringify(evidence).includes(row.id)); await client.query('ROLLBACK');
    } finally { client.release(); }
  });

  await httpReceipts(t, pool, actor, main.password, create, physical, receipts);
  await capacityReceipts(t, pool, actor, create, physical, receipts);
  await upgradeReceipts(t, db);
});

async function syntheticActor(pool: pg.Pool, permissions: TrustedIdentity['permissions'] = ['order.view', 'order.edit', 'ainuoke.sync']) {
  const username = 'synthetic-' + randomUUID(), password = 'synthetic-receipts', role = 'role-' + randomUUID();
  const u = (await pool.query("INSERT INTO app_users(username,password_hash,display_name,role) VALUES($1,crypt($2,gen_salt('bf',4)),'合成计划用户','viewer') RETURNING id::text,public_id::text", [username, password])).rows[0];
  await pool.query('INSERT INTO app_roles(id,name) VALUES($1,$2)', [role, '合成角色-' + randomUUID()]);
  for (const permission of permissions) await pool.query('INSERT INTO app_role_permissions VALUES($1,$2)', [role, permission]);
  await pool.query('INSERT INTO app_user_roles VALUES($1,$2)', [u.id, role]);
  const actor: TrustedIdentity = { internalUserId: u.id, userId: u.public_id, username, userName: '合成计划用户', permissions };
  return { actor, role, password };
}
type SqlRun = (sql: string, values?: unknown[]) => Promise<pg.QueryResult>;
function queryProxy(pool: pg.Pool, intercept: (sql: string, values: unknown[] | undefined, run: SqlRun) => Promise<pg.QueryResult>) {
  return new Proxy(pool, { get(target, property) {
    if (property === 'connect') return async () => {
      const client = await target.connect();
      return new Proxy(client, { get(connection, key) {
        if (key === 'query') return (sql: string, values?: unknown[]) => intercept(sql, values, (q, v) => connection.query(q, v));
        const value = Reflect.get(connection, key); return typeof value === 'function' ? value.bind(connection) : value;
      } });
    };
    const value = Reflect.get(target, property); return typeof value === 'function' ? value.bind(target) : value;
  } });
}
function pauseQuery(pool: pg.Pool, predicate: (sql: string) => boolean, when: 'before' | 'after') {
  let announce!: () => void, resume!: () => void, paused = false;
  const locked = new Promise<void>(done => { announce = done; }), continued = new Promise<void>(done => { resume = done; });
  return { locked, resume, pool: queryProxy(pool, async (sql, values, run) => {
    const hold = !paused && predicate(sql); if (hold) paused = true;
    if (hold && when === 'before') { announce(); await continued; }
    const result = await run(sql, values);
    if (hold && when === 'after') { announce(); await continued; } return result;
  }) };
}
async function reached(held: { locked: Promise<void> }, pending: Promise<unknown>) {
  await Promise.race([held.locked, pending.then(() => { throw new Error('expected barrier was not reached'); })]);
}
async function waitForLock(pool: pg.Pool, name: string) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if ((await pool.query("SELECT 1 FROM pg_stat_activity WHERE application_name=$1 AND wait_event_type='Lock' AND cardinality(pg_blocking_pids(pid))>0", [name])).rowCount) return;
    await new Promise(done => setTimeout(done, 15));
  }
  throw new Error('controlled authorization lock was not observed');
}
async function syntheticAlias(pool: pg.Pool, actor: TrustedIdentity, alias: string, primary: string) {
  const pair = [alias, primary].sort(), caseId = (await pool.query('INSERT INTO sales_order_normalization_cases(first_order_id,second_order_id,created_by,request_id,payload_hash) VALUES($1,$2,$3,$4,$5) RETURNING id', [...pair, actor.internalUserId, randomUUID(), 'a'.repeat(64)])).rows[0].id;
  await pool.query("INSERT INTO sales_order_normalization_case_events(case_id,version,actor_id,request_id,payload_hash,event_type,reason,evidence) VALUES($1,1,$2,$3,$4,'opened','synthetic only','{}')", [caseId, actor.internalUserId, randomUUID(), 'b'.repeat(64)]);
  const client = await pool.connect();
  try {
    await client.query('BEGIN'); await client.query("SELECT pg_advisory_xact_lock(hashtextextended('order-effective-attribution',0))");
    const change = (await client.query("INSERT INTO sales_order_attribution_changes(case_id,case_version,change_type,actor_id,request_id,payload_hash,evidence_hash,evidence_basis,reason) VALUES($1,1,'normalize',$2,$3,$4,$4,'{}','synthetic only') RETURNING id", [caseId, actor.internalUserId, randomUUID(), 'c'.repeat(64)])).rows[0].id;
    for (const id of pair) await client.query('INSERT INTO sales_order_attribution_members(change_id,sales_order_id,effective_order_id,previous_version) VALUES($1,$2,$3,0)', [change, id, primary]);
    for (const id of pair) await writeAttributionHeadInTransaction(client, change, id); await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}

type CreateFixture = () => Promise<{ id: string; input: CreateAinuokeSalesOrderInput }>;
type Physical = (id: string) => Promise<{ plans: DeliveryPlanSetDto; order: unknown; mirror: unknown; logs: unknown }>;
type Receipts = (id: string) => Promise<unknown[]>;
async function httpReceipts(t: TestContext, pool: pg.Pool, actor: TrustedIdentity, password: string,
  create: CreateFixture, physical: Physical, receipts: Receipts) {
  await t.test('HTTP original PATCH and read-only POST receipt keep session, origin, no-store and field boundaries', async () => {
    const origin = 'http://delivery-receipts.invalid', server = createServer(createApp({ pool, allowedOrigins: [origin], security: { secureCookies: false, sessionTtlSeconds: 3600 } }));
    await new Promise<void>(done => server.listen(0, '127.0.0.1', done)); const address = server.address(); assert.ok(address && typeof address === 'object');
    const base = `http://127.0.0.1:${address.port}`, order = await create(), path = `/api/v1/sales-orders/${order.id}/delivery-plans`, command = planCommand();
    const call = (method: string, path: string, body: unknown, cookie = '', headers: Record<string, string> = {}) => fetch(base + path, {
      method, headers: { Cookie: cookie, Origin: origin, 'Content-Type': 'application/json', 'X-Zhixu-Request': '1', ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const login = async (who: string, password: string) => { const r = await call('POST', '/api/v1/auth/login', { username: who, password }); assert.equal(r.status, 200); return r.headers.get('set-cookie')!.split(';')[0]; };
    try {
      const cookie = await login(actor.username, password), view = await syntheticActor(pool, ['order.view']), viewCookie = await login(view.actor.username, view.password);
      assert.equal((await call('POST', path + '/receipt', command)).status, 401);
      assert.equal((await call('POST', path + '/receipt', command, viewCookie)).status, 403);
      assert.equal((await call('POST', path + '/receipt', command, cookie, { Origin: 'http://evil.invalid' })).status, 403);
      assert.equal((await call('POST', path + '/receipt', command, cookie, { 'X-Zhixu-Request': '0' })).status, 403);
      assert.equal((await call('POST', path + '/receipt?actor=other', command, cookie)).status, 400);
      const before = await physical(order.id);
      let response = await call('POST', path + '/receipt', command, cookie);
      assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store'); assert.equal((await response.json()).receipt.status, 'unknown');
      assert.deepEqual(await receipts(order.id), []); assert.deepEqual(await physical(order.id), before);
      for (const extra of [{ actor: actor.userId }, { sourceDeliveryDate: '2027-01-01' }, { ownership: 'source_derived' }, { requestId: 'bad' }])
        assert.equal((await call('POST', path + '/receipt', { ...command, ...extra }, cookie)).status, 400);
      assert.equal((await call('POST', '/api/v1/sales-orders/not-uuid/delivery-plans/receipt', command, cookie)).status, 400);
      response = await call('PATCH', path, command, cookie); assert.equal(response.status, 200);
      const saved = (await response.json()).deliveryPlanSet;
      response = await call('POST', path + '/receipt', command, cookie); const receipt = (await response.json()).receipt;
      assert.equal(receipt.status, 'applied'); assert.deepEqual(receipt.deliveryPlanSet, saved);
      assert.equal(/sourceHash|sourceMetadata|customerConfirmedPrice|confirmedLaborPrice|costSummary/.test(JSON.stringify(receipt)), false);
      response = await call('PATCH', path, command, cookie); assert.equal(response.status, 200); assert.deepEqual((await response.json()).deliveryPlanSet, saved);
      assert.equal((await receipts(order.id)).length, 1);
      const stale = { ...command, requestId: randomUUID() };
      assert.equal((await call('PATCH', path, stale, cookie)).status, 409);
      assert.equal((await (await call('POST', path + '/receipt', stale, cookie)).json()).receipt.status, 'rejected');
      assert.equal((await call('GET', path + '/receipt', undefined, cookie)).status, 404);
      assert.equal((await call('PATCH', path + '/source-refresh', command, cookie)).status, 404);
      const missing = randomUUID(); assert.equal((await call('PATCH', `/api/v1/sales-orders/${missing}/delivery-plans`, { ...command, requestId: randomUUID() }, cookie)).status, 404);
      assert.deepEqual(await receipts(missing), []);
    } finally { await new Promise<void>((done, reject) => server.close(error => error ? reject(error) : done())); }
  });
}

async function capacityReceipts(t: TestContext, pool: pg.Pool, actor: TrustedIdentity, create: CreateFixture, physical: Physical, receipts: Receipts) {
  await t.test('full void history is never truncated; compact and actual jsonb capacity failures roll back plans and audit', async () => {
    const order = await create(), n = 10000;
    const initial = await readDeliveryPlanSet(pool, order.id), row = initial.plans[0];
    // A valid, retained historical collection can exceed one command's 100-row limit.
    // Select digit length from the real DTO shape, without a production limit override.
    const template = { id: randomUUID(), deliveryDate: '2026-01-01', quantity: '1', isDerivedDefault: false, voidedAt: '2026-01-01T00:00:00+00:00' };
    const sample = { status: 'applied', operationId: 'operation-' + randomUUID(), deliveryPlanSet: { ...initial, ownership: 'user_managed', version: 3,
      plans: [{ ...row, quantity: '2' }, ...Array.from({ length: n }, () => template)], reconciliation: { ...initial.reconciliation, quantityStatus: 'short' } } };
    const baseBytes = Buffer.byteLength(JSON.stringify(sample));
    const digits = 1 + Math.floor((DELIVERY_PLAN_RECEIPT_MAX_BYTES - 5000 - baseBytes) / n); assert.ok(digits > 1000);
    await pool.query("UPDATE sales_order_delivery_plan_sets SET ownership='user_managed',version=version+1 WHERE sales_order_id=$1", [order.id]);
    await pool.query(`INSERT INTO sales_order_delivery_plans(sales_order_id,delivery_date,quantity,voided_at)
      SELECT $1::uuid,'2026-01-01'::date,repeat('9',$2::int)::numeric,'2026-01-01T00:00:00Z'::timestamptz FROM generate_series(1,$3::int)`, [order.id, digits, n]);
    let before = await physical(order.id), beforeReceipts = await receipts(order.id);
    const intended = { status: 'applied', operationId: 'operation-' + randomUUID(), deliveryPlanSet: { ...before.plans, version: 3,
      plans: before.plans.plans.map(p => p.id === row.id ? { ...p, quantity: '2' } : p), reconciliation: { ...before.plans.reconciliation, quantityStatus: 'short' } } };
    assert.equal(intended.deliveryPlanSet.plans.length, n + 1);
    assert.ok(Buffer.byteLength(JSON.stringify(intended)) < DELIVERY_PLAN_RECEIPT_MAX_BYTES);
    assert.ok((await pool.query('SELECT octet_length($1::jsonb::text) bytes', [JSON.stringify(intended)])).rows[0].bytes > DELIVERY_PLAN_RECEIPT_MAX_BYTES);
    let command = { ...planCommand(2), upserts: [{ id: row.id, deliveryDate: row.deliveryDate!, quantity: '2' }] };
    await assert.rejects(() => updateDeliveryPlans(pool, actor, order.id, command), code('delivery_plan_receipt_too_large'));
    assert.deepEqual(await physical(order.id), before); assert.equal((await receipts(order.id)).length, beforeReceipts.length + 1);
    assert.equal((await readDeliveryPlanRequestReceipt(pool, actor, order.id, command)).status, 'rejected');
    beforeReceipts = await receipts(order.id);
    await assert.rejects(() => updateDeliveryPlans(pool, actor, order.id, command), code('delivery_plan_receipt_too_large'));
    assert.deepEqual(await receipts(order.id), beforeReceipts);
    await pool.query(`INSERT INTO sales_order_delivery_plans(sales_order_id,delivery_date,quantity,voided_at)
      SELECT $1::uuid,'2026-01-01'::date,repeat('9',$2::int)::numeric,'2026-01-01T00:00:00Z'::timestamptz FROM generate_series(1,100)`, [order.id, digits]);
    before = await physical(order.id);
    assert.ok(Buffer.byteLength(JSON.stringify(before.plans)) > DELIVERY_PLAN_RECEIPT_MAX_BYTES);
    command = { ...command, requestId: randomUUID() };
    await assert.rejects(() => updateDeliveryPlans(pool, actor, order.id, command), code('delivery_plan_receipt_too_large'));
    assert.deepEqual(await physical(order.id), before); assert.equal((await readDeliveryPlanSet(pool, order.id)).plans.length, n + 101);
  });
}

async function upgradeReceipts(t: TestContext, db: DisposablePostgres) {
  await t.test('populated 0041 schema upgrades additively, preserves every old row and refuses unreceipted fallback', async () => {
    const pool = new pg.Pool({ connectionString: await db.createDatabase('delivery_receipt_upgrade') }), prefix = await mkdtemp(join(tmpdir(), 'zhixu-delivery-receipt-prefix-'));
    try {
      for (const file of await readdir('database/migrations')) if (/^\d{4}_.+\.sql$/.test(file) && Number(file.slice(0, 4)) <= 41)
        await copyFile(join('database/migrations', file), join(prefix, file));
      await runMigrations(pool, prefix); await synchronizePermissionCatalog(pool); const who = await syntheticActor(pool);
      const id = (await createSalesOrder(pool, { creationSource: 'manual' })).id;
      await pool.query("INSERT INTO sales_order_delivery_plan_sets(sales_order_id,ownership) VALUES($1,'user_managed')", [id]);
      await pool.query("INSERT INTO sales_order_delivery_plans(sales_order_id,delivery_date,quantity) VALUES($1,'2026-12-01',0)", [id]);
      const tables = (await pool.query<{ tablename: string }>("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows.map(r => r.tablename);
      const snapshot = () => Promise.all(tables.map(async table => ({ table, rows: (await pool.query(`SELECT to_jsonb(r)::text row FROM "${table}" r ORDER BY row`)).rows })));
      const before = await snapshot(), command = planCommand();
      await assert.rejects(() => verifyMigrationsCurrent(pool, resolve('database/migrations')), PendingMigrationsError);
      await assert.rejects(() => updateDeliveryPlans(pool, who.actor, id, command), code('42P01'));
      await assert.rejects(() => readDeliveryPlanRequestReceipt(pool, who.actor, id, command), code('42P01'));
      assert.deepEqual(await snapshot(), before);
      const client = await pool.connect(); try { assert.equal((await normalizationReferences(client)).some(([table]) => table === 'sales_order_delivery_plan_requests'), false); } finally { client.release(); }
      assert.deepEqual((await runMigrations(pool, resolve('database/migrations'))).applied,
        CURRENT_MIGRATION_FILES.filter(file => Number(file.slice(0, 4)) > 41));
      const oldRows = await snapshot(); assert.deepEqual(oldRows.filter(r => r.table !== 'schema_migrations'), before.filter(r => r.table !== 'schema_migrations'));
      const previousLedger = before.find(r => r.table === 'schema_migrations')!.rows;
      const nowLedger = oldRows.find(r => r.table === 'schema_migrations')!.rows.filter(r => Number(JSON.parse(r.row).version) <= 41);
      assert.deepEqual(nowLedger, previousLedger);
      assert.equal((await pool.query('SELECT count(*)::int n FROM sales_order_delivery_plan_requests')).rows[0].n, 0);
      assert.equal((await pool.query('SELECT count(*)::int n FROM ainuoke_garment_collection_commands')).rows[0].n, 0);
      await verifyMigrationsCurrent(pool, resolve('database/migrations')); assert.deepEqual((await runMigrations(pool, resolve('database/migrations'))).applied, []);
      await assert.rejects(() => verifyMigrationsCurrent(pool, prefix), /Applied migration 42 .*missing from the migration directory/);
      const saved = await updateDeliveryPlans(pool, who.actor, id, command); assert.equal(saved.plans.length, 2); assert.equal(saved.plans[0].quantity, '0');
      assert.equal((await readDeliveryPlanRequestReceipt(pool, who.actor, id, command)).status, 'applied');
    } finally {
      await pool.end(); const distance = relative(resolve(tmpdir()), resolve(prefix)); assert.ok(distance && !distance.startsWith('..') && !isAbsolute(distance)); await rm(prefix, { recursive: true });
    }
  });
}
