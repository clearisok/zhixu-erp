import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import pg from 'pg';
import { createApp } from '../server/app.js';
import { synchronizePermissionCatalog } from '../server/auth/permissions.js';
import type { TrustedIdentity } from '../server/auth/session.js';
import { runMigrations } from '../server/db/migration-runner.js';
import { startDisposablePostgres } from '../server/integration/postgres-container.js';
import type { DeliveryPlanSetDto } from '../server/sales-orders/delivery-plan-model.js';
import { readDeliveryPlanSet } from '../server/sales-orders/delivery-plan-repository.js';
import { refreshAinuokeSalesOrderSource } from '../server/sales-orders/delivery-plan-source-refresh.js';
import { createAinuokeSalesOrder, type CreateAinuokeSalesOrderInput } from '../server/sales-orders/service.js';

/** Synthetic-only driver. Never imports configuration or reads environment DB URLs. */
async function main() {
  const postgres = await startDisposablePostgres();
  let pool: pg.Pool | undefined;
  let server: ReturnType<typeof createServer> | undefined;
  try {
    pool = new pg.Pool({ connectionString: await postgres.createDatabase('delivery_plan_demo') });
    const database = pool;
    await runMigrations(database, resolve('database/migrations'));
    await synchronizePermissionCatalog(database);
    const username = `demo-${randomUUID()}`;
    const password = `synthetic-${randomUUID()}`;
    const user = (await database.query<{ id: string; public_id: string }>(`INSERT INTO app_users(username,password_hash,display_name,role)
      VALUES ($1,crypt($2,gen_salt('bf',4)),'Synthetic DeliveryPlan actor','admin') RETURNING id::text,public_id::text`, [username, password])).rows[0];
    const actor: TrustedIdentity = { internalUserId: user.id, userId: user.public_id, username,
      userName: 'Synthetic DeliveryPlan actor', permissions: ['order.view', 'order.edit', 'ainuoke.sync'] };
    await database.query("INSERT INTO app_roles(id,name,description) VALUES ('plan-demo','Synthetic plan demo','Disposable only')");
    for (const key of actor.permissions) await database.query("INSERT INTO app_role_permissions(role_id,permission_key) VALUES ('plan-demo',$1)", [key]);
    await database.query("INSERT INTO app_user_roles(user_id,role_id) VALUES ($1,'plan-demo')", [user.id]);
    const origin = 'http://delivery-plan-demo.invalid';
    server = createServer(createApp({ pool: database, allowedOrigins: [origin], security: { secureCookies: false, sessionTtlSeconds: 3600 } }));
    await new Promise<void>(done => server!.listen(0, '127.0.0.1', done));
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    assert.ok(![18443, 18444, 3000, 3001, 3002].includes(address.port));
    const base = `http://127.0.0.1:${address.port}`;
    const headers = { Origin: origin, 'Content-Type': 'application/json', 'X-Zhixu-Request': '1' };
    const login = await fetch(`${base}/api/v1/auth/login`, { method: 'POST', headers, body: JSON.stringify({ username, password }) });
    assert.equal(login.status, 200);
    const cookie = login.headers.get('set-cookie')!.split(';')[0];
    const sessionHeaders = { ...headers, Cookie: cookie };
    const path = (id: string) => `${base}/api/v1/sales-orders/${id}/delivery-plans`;
    const get = async (id: string): Promise<DeliveryPlanSetDto> => {
      const response = await fetch(path(id), { headers: sessionHeaders });
      assert.equal(response.status, 200);
      return (await response.json()).deliveryPlanSet;
    };
    const patchResponse = (id: string, command: Record<string, unknown>) => fetch(path(id), {
      method: 'PATCH', headers: sessionHeaders, body: JSON.stringify(command),
    });
    const patch = async (id: string, upserts: Array<{ id: string | null; deliveryDate: string; quantity: string }>) => {
      const before = await get(id);
      const response = await patchResponse(id, { expectedVersion: before.version, upserts, voidIds: [] });
      assert.equal(response.status, 200);
      return (await response.json()).deliveryPlanSet as DeliveryPlanSetDto;
    };
    let serial = 0;
    const create = async (date: string | null = '2026-11-01', quantity = 100) => {
      const n = ++serial;
      const input: CreateAinuokeSalesOrderInput = {
        source: { sourceId: `demo-source-${n}`, sourceRowIdentity: `demo-row-${n}`, salesContractNo: `SYNTHETIC-DEMO-${n}`,
          insideOrderNo: `DEMO-IN-${n}`, lifecycleStatusRaw: '生效', contractDate: '2026-10-01', contractDeliveryDate: date,
          styleNo: 'SYNTHETIC-ONLY', companyNameSnapshot: 'Synthetic', customerNameSnapshot: 'Synthetic', brandNameSnapshot: 'Synthetic',
          quantity, sourceHash: `demo-hash-${n}`, fetchedAt: '2026-10-09T00:00:00Z' }, colors: [],
      };
      return { id: (await createAinuokeSalesOrder(database, actor, input)).salesOrder.id, input };
    };
    const source = async (order: Awaited<ReturnType<typeof create>>, date: string | null, quantity = order.input.source.quantity) => {
      const before = await readDeliveryPlanSet(database, order.id);
      const input = { ...order.input, source: { ...order.input.source, contractDeliveryDate: date, quantity, sourceHash: `${order.input.source.sourceHash}-next` } };
      await refreshAinuokeSalesOrderSource(database, actor, order.id, { ...input, expectedSourceHash: order.input.source.sourceHash, expectedPlanVersion: before.version });
      order.input = input;
    };
    const emit = async (step: string, id: string, expected: { total: string; difference: string; ownership?: string; status?: string }, evidence: Record<string, unknown> = {}) => {
      const plans = await get(id); // All displayed plan snapshots use the real trusted GET API.
      // PostgreSQL NUMERIC computes exact Decimal sums and differences. No Number/parseFloat arithmetic.
      const quantities = (await database.query<{ total: string; difference: string }>(`SELECT
        coalesce(sum(p.quantity) FILTER (WHERE p.voided_at IS NULL AND p.delivery_date IS NOT NULL),0)::text AS total,
        (coalesce(sum(p.quantity) FILTER (WHERE p.voided_at IS NULL AND p.delivery_date IS NOT NULL),0)-m.quantity)::text AS difference
        FROM ainuoke_sales_order_contract_mirrors m LEFT JOIN sales_order_delivery_plans p ON p.sales_order_id=m.sales_order_id
        WHERE m.sales_order_id=$1 GROUP BY m.quantity`, [id])).rows[0];
      assert.equal(quantities.total, expected.total);
      assert.equal(quantities.difference, expected.difference);
      if (expected.ownership) assert.equal(plans.ownership, expected.ownership);
      if (expected.status) assert.equal(plans.reconciliation.quantityStatus, expected.status);
      const logs = (await database.query(`SELECT id::text,actor_public_id::text,actor_name,module,action,before_data,after_data,metadata
        FROM operation_logs WHERE entity_id=$1 ORDER BY created_at,id`, [id])).rows;
      for (const log of logs) assert.equal(log.actor_public_id, actor.userId);
      process.stdout.write(`${JSON.stringify({ step, salesOrderId: id, source: { deliveryDate: plans.sourceDeliveryDate, quantity: plans.sourceQuantity },
        plans: plans.plans, ownership: plans.ownership, version: plans.version, quantities, reconciliation: plans.reconciliation, operationLogs: logs, ...evidence })}\n`);
      return plans;
    };

    const order = await create();
    let plans = await emit('1 default 11-01 / 100', order.id, { total: '100', difference: '0', ownership: 'source_derived', status: 'matched' });
    const defaultId = plans.plans[0].id;
    await patch(order.id, [{ id: defaultId, deliveryDate: '2026-11-05', quantity: '100' }]);
    await emit('2 human 11-05 / 100', order.id, { total: '100', difference: '0', ownership: 'user_managed' });
    await source(order, '2026-11-10', 120);
    plans = await emit('3 source 11-10 / 120; short 20', order.id, { total: '100', difference: '-20', ownership: 'user_managed', status: 'short' });
    assert.equal(plans.plans[0].deliveryDate, '2026-11-05');
    assert.equal(plans.reconciliation.dateStatus, 'drift');
    await patch(order.id, [{ id: defaultId, deliveryDate: '2026-11-05', quantity: '40' }, { id: null, deliveryDate: '2026-11-15', quantity: '60' }]);
    plans = await emit('4 split 40 + 60', order.id, { total: '100', difference: '-20', ownership: 'user_managed', status: 'short' });
    const secondId = plans.plans.find(row => row.id !== defaultId)!.id;
    await patch(order.id, [{ id: secondId, deliveryDate: '2026-11-15', quantity: '80' }]);
    await emit('5 second row 80; matched 120', order.id, { total: '120', difference: '0', ownership: 'user_managed', status: 'matched' });
    await source(order, '2026-11-10', 90);
    plans = await emit('6 source 90; excess 30', order.id, { total: '120', difference: '30', ownership: 'user_managed', status: 'excess' });
    assert.deepEqual(new Set(plans.plans.map(row => row.id)), new Set([defaultId, secondId]));

    const noDate = await create(null);
    await emit('boundary no initial date', noDate.id, { total: '0', difference: '-100', ownership: 'source_derived', status: 'unplanned' });
    await source(noDate, '2026-11-01');
    plans = await emit('boundary later date does not fabricate default', noDate.id, { total: '0', difference: '-100' });
    assert.equal(plans.plans.length, 0);

    const zero = await create('2026-11-01', 0);
    plans = await emit('boundary generated zero', zero.id, { total: '0', difference: '0', ownership: 'source_derived', status: 'matched' });
    const rejectedZero = await patchResponse(zero.id, { expectedVersion: plans.version, upserts: [{ id: plans.plans[0].id, deliveryDate: '2026-11-05', quantity: '0' }], voidIds: [] });
    assert.equal(rejectedZero.status, 400);
    assert.deepEqual(await get(zero.id), plans);
    await emit('boundary manual zero rejected', zero.id, { total: '0', difference: '0', ownership: 'source_derived' }, { httpStatus: rejectedZero.status });
    // Also prove a fractional quantity survives GET/PATCH and Decimal summation exactly.
    await patch(zero.id, [{ id: plans.plans[0].id, deliveryDate: '2026-11-05', quantity: '0.000000000000000001' }]);
    await emit('boundary exact decimal', zero.id, { total: '0.000000000000000001', difference: '0.000000000000000001', ownership: 'user_managed', status: 'excess' });

    const suspended = await create();
    const originalId = (await get(suspended.id)).plans[0].id;
    await source(suspended, null);
    plans = await emit('boundary default date null', suspended.id, { total: '0', difference: '-100', ownership: 'source_derived' });
    assert.equal(plans.plans[0].id, originalId);
    assert.equal(plans.plans[0].deliveryDate, null);
    await source(suspended, '2026-11-15');
    plans = await emit('boundary default date restored', suspended.id, { total: '100', difference: '0', ownership: 'source_derived' });
    assert.equal(plans.plans[0].id, originalId);
    assert.equal(plans.plans[0].deliveryDate, '2026-11-15');

    const competing = await create();
    const snapshot = await get(competing.id);
    const command = { expectedVersion: snapshot.version, upserts: [{ id: snapshot.plans[0].id, deliveryDate: '2026-11-05', quantity: '100' }], voidIds: [] };
    const responses = await Promise.all([patchResponse(competing.id, command), patchResponse(competing.id, command)]);
    const statuses = responses.map(response => response.status).sort();
    assert.deepEqual(statuses, [200, 409]);
    plans = await emit('boundary competing old versions', competing.id, { total: '100', difference: '0', ownership: 'user_managed' }, { httpStatuses: statuses });
    assert.equal(plans.version, snapshot.version + 1);
    const logout = await fetch(`${base}/api/v1/auth/logout`, { method: 'POST', headers: sessionHeaders });
    assert.equal(logout.status, 200);
    process.stdout.write(`${JSON.stringify({ result: 'PASS', syntheticOnly: true, apiPort: address.port, containerName: postgres.containerName })}\n`);
  } finally {
    try {
      if (server?.listening) await new Promise<void>((done, reject) => server!.close(error => error ? reject(error) : done()));
    } finally {
      try { await pool?.end(); } finally {
        await postgres.stop();
        const { stdout } = await promisify(execFile)('docker', ['ps', '--all', '--filter', `name=^/${postgres.containerName}$`, '--format', '{{.Names}}'], { windowsHide: true, timeout: 10_000 });
        assert.equal(stdout.trim(), '');
        process.stdout.write(`${JSON.stringify({ cleanup: 'PASS', containerName: postgres.containerName, containerRemoved: true, apiClosed: true, poolClosed: true })}\n`);
      }
    }
  }
}

main().catch(error => { process.stderr.write(`${error instanceof Error ? error.stack : 'Synthetic demo failed'}\n`); process.exitCode = 1; });
