import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import pg from 'pg';
import { startDisposablePostgres } from './postgres-container.js';
import { runMigrations } from '../db/migration-runner.js';
import { synchronizePermissionCatalog } from '../auth/permissions.js';
import { bootstrapAdmin } from '../auth/bootstrap.js';
import { loadExistingBootstrapActor } from '../sales-orders/bootstrap-runner.js';
import { createAinuokeSalesOrder } from '../sales-orders/service.js';
import { hash, SourceError } from '../ainuoke-source/contract.js';
import { planPaymentCollection, collectAndPublishPaymentContracts, type PaymentCollectionRequest } from '../ainuoke-source/payment-request-collection.js';
import { createPaymentSnapshotReader } from '../ainuoke-source/payment-request-store.js';
import { parsePaymentView } from '../../features/ainuoke-payment-requests/client';
import { collectionConfig, collectionSelection, collectionEvidence } from './payment-collection-fixture.js';

const matches = (code: string) => (error: unknown) => (error as { code?: string }).code === code;
test('controlled payment collection: owned PG, exact scope, complete capture and explicit partial publication', { timeout: 180000 }, async t => {
  const db = await startDisposablePostgres();
  assert.match(db.containerName, /^zhixu-pg-it-[a-f0-9]{12}$/u);
  const pool = new pg.Pool({ connectionString: await db.createDatabase('payment_collection'), max: 6 });
  t.after(async () => { await pool.end(); await db.stop(); });
  await runMigrations(pool, resolve('database/migrations'));
  await synchronizePermissionCatalog(pool);
  await bootstrapAdmin(pool, { username: collectionConfig.operatorUsername, displayName: '合成采集管理员', password: 'Synthetic-Collection-Admin-2026' });
  const actor = await loadExistingBootstrapActor(pool, collectionConfig.operatorUsername);
  await pool.query('INSERT INTO ainuoke_source_profiles(source_key,account_fingerprint) VALUES($1,$2)',
    [collectionConfig.sourceKey, collectionSelection().sourceFingerprint]);
  let sequence = 0, clock = Date.now();
  const now = () => clock;
  async function pair(): Promise<PaymentCollectionRequest> {
    const selection = collectionSelection(String(++sequence)), targets = [];
    for (const target of selection.targets) {
      const id = (await createAinuokeSalesOrder(pool, actor, { source: { sourceId: target.salesContractNo, sourceRowIdentity: target.salesContractNo,
        salesContractNo: target.salesContractNo, insideOrderNo: 'SYN-FACTORY-' + sequence, lifecycleStatusRaw: '生效', contractDate: '2026-10-01',
        contractDeliveryDate: '2026-11-01', styleNo: 'SYN-STYLE', companyNameSnapshot: '合成公司', customerNameSnapshot: '合成客户',
        brandNameSnapshot: '合成品牌', quantity: 100, sourceHash: hash(target), fetchedAt: new Date(clock).toISOString() }, colors: [] })).salesOrder.id;
      await pool.query(`INSERT INTO ainuoke_payment_source_targets(source_key,sales_order_id,account_fingerprint,enabled,verification_sha256)
        VALUES($1,$2,$3,true,$4)`, [collectionConfig.sourceKey, id, selection.sourceFingerprint, hash(['synthetic-filter-proof', target])]);
      targets.push({ alias: target.alias, salesOrderId: id });
    }
    return { config: { ...collectionConfig }, selection, targets };
  }
  const count = async (request: PaymentCollectionRequest) => (await pool.query(`SELECT count(*)::int n FROM ainuoke_payment_snapshots
    WHERE sales_order_id=ANY($1::uuid[])`, [request.targets.map(target => target.salesOrderId)])).rows[0].n as number;
  const collect = async (_config: unknown, selection: PaymentCollectionRequest['selection']) => {
    const evidence = collectionEvidence(selection, clock + 10); clock += 5000; return evidence;
  };
  const reader = createPaymentSnapshotReader(pool, { sourceKey: collectionConfig.sourceKey }, now);

  await t.test('read-only plan performs no capture, mutation or implicit target activation', async () => {
    const request = await pair(), before = (await pool.query('SELECT count(*)::int n FROM operation_logs')).rows[0].n;
    const plan = await planPaymentCollection(pool, actor, request, now);
    assert.match(plan.scopeHash, /^[a-f0-9]{64}$/u); assert.match(plan.databaseFingerprint, /^[a-f0-9]{64}$/u);
    assert.equal(plan.targets.length, 2); assert.equal(plan.databaseWrites, 'none'); assert.equal(plan.sourceRead, 'none');
    assert.equal(plan.authorization, 'not_granted_by_plan'); assert.equal(plan.limits.httpAttempts, 9);
    assert.equal(await count(request), 0); assert.equal((await pool.query('SELECT count(*)::int n FROM operation_logs')).rows[0].n, before);
    assert.ok(!JSON.stringify(plan).includes(collectionConfig.password));
    await pool.query('UPDATE ainuoke_payment_source_targets SET enabled=false,version=version+1 WHERE sales_order_id=$1', [request.targets[1].salesOrderId]);
    await assert.rejects(() => planPaymentCollection(pool, actor, request, now), matches('payment_source_not_connected'));
  });
  await t.test('wrong SO, old target version, changed actor or wrong plan stop before the sole worker call', async () => {
    const request = await pair(), plan = await planPaymentCollection(pool, actor, request, now);
    let calls = 0;
    const forbiddenCollect = async () => { calls++; assert.fail('must not collect'); };
    await assert.rejects(() => collectAndPublishPaymentContracts(pool, actor, request, '0'.repeat(64), { now, collect: forbiddenCollect }), matches('payment_collection_scope_mismatch'));
    // Same owned connection, deliberately changed connection-target metadata.
    // This isolates the database fingerprint check from differing SO identities.
    const changedConnection = new Proxy(pool, { get(target, property) {
      if (property === 'options') return { ...pool.options, connectionString: pool.options.connectionString!.replace('127.0.0.1', 'changed-test-target.invalid') };
      const value = Reflect.get(target, property); return typeof value === 'function' ? value.bind(target) : value;
    } });
    await assert.rejects(() => collectAndPublishPaymentContracts(changedConnection, actor, request, plan.scopeHash,
      { now, collect: forbiddenCollect }), matches('payment_collection_scope_mismatch'));
    const swapped = { ...request, targets: request.targets.map((target, i) => ({ ...target, salesOrderId: request.targets[1-i].salesOrderId })) };
    await assert.rejects(() => collectAndPublishPaymentContracts(pool, actor, swapped, plan.scopeHash, { now, collect: forbiddenCollect }), matches('payment_collection_binding_mismatch'));
    await assert.rejects(() => planPaymentCollection(pool, actor, { ...request, config: { ...request.config, operatorUsername: 'another-synthetic-operator' } }, now), matches('payment_collection_operator_mismatch'));
    await assert.rejects(() => collectAndPublishPaymentContracts(pool, { ...actor, userId: randomUUID() }, request, plan.scopeHash,
      { now, collect: forbiddenCollect }), matches('source_actor_unavailable'));
    await pool.query('UPDATE ainuoke_payment_source_targets SET version=version+1 WHERE sales_order_id=$1', [request.targets[1].salesOrderId]);
    await assert.rejects(() => collectAndPublishPaymentContracts(pool, actor, request, plan.scopeHash, { now, collect: forbiddenCollect }), matches('payment_collection_scope_mismatch'));
    assert.equal(calls, 0); assert.equal(await count(request), 0);
  });
  await t.test('one capture feeds exact per-contract publication, DB reader and strict UI client', async () => {
    const request = await pair(), plan = await planPaymentCollection(pool, actor, request, now);
    let calls = 0;
    const result = await collectAndPublishPaymentContracts(pool, actor, request, plan.scopeHash, { now, collect: async (cfg, selected) => {
      calls++; assert.equal(cfg.sourceKey, request.config.sourceKey); return collect(cfg, selected);
    } });
    assert.equal(calls, 1); assert.equal(result.result, 'PAYMENT_COLLECTION_PUBLISHED'); assert.equal(result.published, 2);
    assert.equal(result.automaticRetry, false); assert.equal(await count(request), 2);
    for (const [index, target] of request.targets.entries()) {
      const body = await reader(actor, target.salesOrderId), parsed = parsePaymentView(body, target.salesOrderId, request.selection.targets[index].salesContractNo);
      assert.equal(parsed.sourceStatus, 'observed'); assert.equal(parsed.rows.length, 127);
      const first = parsed.rows[0]; assert.equal(first.amounts.Price.state, 'known');
      if (first.amounts.Price.state === 'known') assert.equal(first.amounts.Price.raw, '9007199254740993.000000000001');
      assert.equal(first.allocatedShipmentUnit.state, 'unknown'); assert.equal(first.amountCurrencies.GoodsAmount.state, 'unknown');
      assert.equal(first.bankPaymentStatus, 'not_inferred'); assert.equal(parsed.rows[100].trace.page, 2);
    }
    for (const value of [collectionConfig.username, collectionConfig.password, 'SYN-SC', 'SYN-PUR', '合成货款物料', '9007199254740993'])
      assert.equal(JSON.stringify(result).includes(value), false);
    await assert.rejects(() => collectAndPublishPaymentContracts(pool, actor, request, plan.scopeHash, { now, collect }), matches('payment_collection_scope_mismatch'));
    assert.equal(await count(request), 2);
  });
  await t.test('all contracts validate before either publication: failed/partial/old/raw-secret captures write nothing', async () => {
    const mutations: Array<(e: ReturnType<typeof collectionEvidence>) => void> = [
      e => { e.result = 'failed'; e.code = 'network_unavailable'; e.workerStage = 'report'; },
      e => { e.pages.pop(); e.reportRequests--; e.httpAttempts--; },
      e => { e.pages[0].capturedAt = new Date(clock - 1000).toISOString(); },
      e => { e.pages[2].rawReportResponse += collectionConfig.password; },
    ];
    for (const mutate of mutations) {
      const request = await pair(), plan = await planPaymentCollection(pool, actor, request, now);
      const result = await collectAndPublishPaymentContracts(pool, actor, request, plan.scopeHash, { now, collect: async (_cfg, selected) => {
        const evidence = collectionEvidence(selected, clock + 10); mutate(evidence); clock += 5000; return evidence;
      } });
      assert.equal(result.result, 'PAYMENT_COLLECTION_NOT_PUBLISHED'); assert.equal(result.collection.validated, false);
      assert.equal(await count(request), 0); assert.ok(result.outcomes.every(outcome => outcome.status === 'not_attempted'));
      assert.equal(JSON.stringify(result).includes(collectionConfig.password), false);
    }
  });
  await t.test('target or permission change during collection blocks both before first publication', async () => {
    for (const mode of ['target', 'actor'] as const) {
      const request = await pair(), plan = await planPaymentCollection(pool, actor, request, now);
      try {
        const result = await collectAndPublishPaymentContracts(pool, actor, request, plan.scopeHash, { now, collect: async (cfg, selected) => {
          const evidence = await collect(cfg, selected);
          if (mode === 'target') await pool.query('UPDATE ainuoke_payment_source_targets SET enabled=false,version=version+1 WHERE sales_order_id=$1', [request.targets[1].salesOrderId]);
          else await pool.query('UPDATE app_users SET active=false WHERE id=$1', [actor.internalUserId]);
          return evidence;
        } });
        assert.equal(result.published, 0); assert.equal(result.collection.validated, true); assert.equal(await count(request), 0);
        assert.equal(result.collection.code, mode === 'target' ? 'payment_source_not_connected' : 'source_actor_unavailable');
      } finally { await pool.query('UPDATE app_users SET active=true WHERE id=$1', [actor.internalUserId]); }
    }
  });
  await t.test('caller mutations cannot change a running scope or send a new credential/target to the worker', async () => {
    const request = await pair(), originalIds = request.targets.map(target => target.salesOrderId);
    const plan = await planPaymentCollection(pool, actor, request, now);
    const result = await collectAndPublishPaymentContracts(pool, actor, request, plan.scopeHash, { now, collect: async (cfg, selected) => {
      request.config.password = 'Changed-Caller-Secret'; request.selection.targets[0].salesContractNo = 'OTHER-SYN-SC';
      (request.targets as Array<{alias:string;salesOrderId:string}>)[0].salesOrderId = randomUUID();
      assert.equal(cfg.password, collectionConfig.password); return collect(cfg, selected);
    } });
    assert.equal(result.published, 2);
    assert.equal((await pool.query('SELECT count(*)::int n FROM ainuoke_payment_snapshots WHERE sales_order_id=ANY($1::uuid[])', [originalIds])).rows[0].n, 2);
  });
  await t.test('concurrent distinct captures cannot advance the same accepted generations twice', async () => {
    const request = await pair(), plan = await planPaymentCollection(pool, actor, request, now);
    let calls = 0, release!: () => void;
    const gate = new Promise<void>(done => { release = done; }), start = clock;
    const concurrent = async (_cfg: unknown, selected: PaymentCollectionRequest['selection']) => {
      const evidence = collectionEvidence(selected, start + (++calls) * 200);
      if (calls === 2) { clock += 5000; release(); } await gate; return evidence;
    };
    const results = await Promise.all([1, 2].map(() => collectAndPublishPaymentContracts(pool, actor, request, plan.scopeHash, { now, collect: concurrent })));
    assert.equal(calls, 2); assert.equal(await count(request), 2);
    assert.equal(results.filter(result => result.result === 'PAYMENT_COLLECTION_PUBLISHED').length, 1);
    assert.ok(results.some(result => result.published === 0));
    const heads = (await pool.query('SELECT generation FROM ainuoke_payment_heads WHERE sales_order_id=ANY($1::uuid[])', [request.targets.map(target => target.salesOrderId)])).rows;
    assert.deepEqual(heads.map(head => head.generation), [1, 1]);
  });
  await t.test('later target change reports partial success and retains the first accepted snapshot', async () => {
    const request = await pair(), plan = await planPaymentCollection(pool, actor, request, now);
    const [first, second] = request.targets.map(target => target.salesOrderId);
    // Owned disposable fixture simulates a change after the first transaction starts.
    await pool.query(`CREATE FUNCTION synthetic_payment_target_race() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.sales_order_id='${first}'::uuid THEN UPDATE ainuoke_payment_source_targets SET enabled=false,version=version+1
        WHERE sales_order_id='${second}'::uuid; END IF; RETURN NEW; END; $$`);
    await pool.query('CREATE TRIGGER synthetic_payment_target_race AFTER INSERT ON ainuoke_payment_snapshots FOR EACH ROW EXECUTE FUNCTION synthetic_payment_target_race()');
    try {
      const result = await collectAndPublishPaymentContracts(pool, actor, request, plan.scopeHash, { now, collect });
      assert.equal(result.result, 'PAYMENT_COLLECTION_PARTIAL'); assert.equal(result.published, 1); assert.equal(await count(request), 1);
      assert.equal(result.outcomes[0].status, 'published'); assert.deepEqual(result.outcomes[1], { alias: 'S2', status: 'failed', code: 'payment_source_not_connected' });
      assert.equal((await reader(actor, first)).sourceStatus, 'observed'); assert.equal((await reader(actor, second)).sourceStatus, 'not_connected');
      assert.equal(result.automaticRetry, false);
    } finally {
      await pool.query('DROP TRIGGER synthetic_payment_target_race ON ainuoke_payment_snapshots');
      await pool.query('DROP FUNCTION synthetic_payment_target_race()');
    }
  });
  await t.test('worker failures emit closed codes without raw exception messages or retries', async () => {
    const request = await pair(), plan = await planPaymentCollection(pool, actor, request, now);
    for (const error of [new SourceError('payment_contract_worker_unavailable'), new Error(collectionConfig.password)]) {
      let calls = 0;
      const result = await collectAndPublishPaymentContracts(pool, actor, request, plan.scopeHash, { now, collect: async () => { calls++; throw error; } });
      assert.equal(calls, 1); assert.equal(result.published, 0); assert.equal(await count(request), 0);
      assert.equal(result.collection.code, error instanceof SourceError ? error.code : 'payment_collection_validation_failed');
      assert.equal(JSON.stringify(result).includes(collectionConfig.password), false);
    }
  });
  await t.test('lost COMMIT acknowledgement is unresolved even when the snapshot really committed', async () => {
    const request = await pair(), plan = await planPaymentCollection(pool, actor, request, now);
    let acknowledgementLost = false, workerCalls = 0;
    const uncertainPool = new Proxy(pool, { get(target, property) {
      if (property !== 'connect') { const value = Reflect.get(target, property); return typeof value === 'function' ? value.bind(target) : value; }
      return async () => {
        const client = await pool.connect(); let inserted = false;
        return new Proxy(client, { get(connection, key) {
          if (key !== 'query') { const value = Reflect.get(connection, key); return typeof value === 'function' ? value.bind(connection) : value; }
          return async (text: string, values?: unknown[]) => {
            const result = await client.query(text, values);
            if (text.startsWith('INSERT INTO ainuoke_payment_snapshots')) inserted = true;
            if (text === 'COMMIT' && inserted && !acknowledgementLost) { acknowledgementLost = true; throw new Error(collectionConfig.password); }
            return result;
          };
        } });
      };
    } });
    const result = await collectAndPublishPaymentContracts(uncertainPool, actor, request, plan.scopeHash, { now, collect: async (cfg, selected) => {
      workerCalls++; return collect(cfg, selected);
    } });
    assert.equal(acknowledgementLost, true); assert.equal(workerCalls, 1);
    assert.equal(result.result, 'PAYMENT_COLLECTION_UNVERIFIED'); assert.equal(result.published, 0); assert.equal(result.unresolved, 1);
    assert.equal(result.requiresPublicationReconciliation, true); assert.equal(result.automaticRetry, false);
    assert.equal(result.outcomes[0].status, 'unresolved'); assert.equal(result.outcomes[1].status, 'not_attempted');
    assert.equal(await count(request), 1); assert.equal((await reader(actor, request.targets[0].salesOrderId)).sourceStatus, 'observed');
    if (result.outcomes[0].status === 'unresolved') {
      const stored = (await pool.query('SELECT snapshot_id FROM ainuoke_payment_snapshots WHERE sales_order_id=$1', [request.targets[0].salesOrderId])).rows[0];
      assert.equal(result.outcomes[0].candidateSnapshotId, stored.snapshot_id); assert.equal(result.outcomes[0].expectedGeneration, 1);
    }
    assert.equal(JSON.stringify(result).includes(collectionConfig.password), false);
  });
  await t.test('actual Python worker with mocked transport reaches publication, DB read and UI parse without network', async () => {
    clock = Date.now();
    const request = await pair(), plan = await planPaymentCollection(pool, actor, request, Date.now);
    const result = await collectAndPublishPaymentContracts(pool, actor, request, plan.scopeHash, { collect: async (config, selection) => {
      const code = ["import sys", "from unittest.mock import patch", "sys.path.insert(0,'tests')",
        "import ainuoke_bridge.payment_request_contract_probe as module", "from test_payment_request_contract_probe import FakeTransport",
        "sys.argv=['contract-probe','--stdin-request']", "with patch.object(module,'ContractTransport',lambda _:FakeTransport(total=127)):",
        "    raise SystemExit(module.main())"].join('\n');
      const run = spawnSync(process.platform === 'win32' ? 'python' : 'python3', ['-c', code], { cwd: resolve('tools/ainuoke-bridge'),
        input: JSON.stringify({ baseUrl: config.baseUrl, transportPolicy: config.transportPolicy, username: config.username, password: config.password,
          action: 'read-two-verified-contracts', selection }), encoding: 'utf8', timeout: 15000, maxBuffer: 5 * 1024 * 1024,
        env: { ...process.env, PYTHONIOENCODING: 'gbk', PYTHONDONTWRITEBYTECODE: '1' } });
      assert.equal(run.status, 0, run.stderr); const evidence = JSON.parse(run.stdout);
      assert.equal(evidence.httpAttempts, 9); assert.equal(evidence.reportRequests, 8); return evidence;
    } });
    assert.equal(result.result, 'PAYMENT_COLLECTION_PUBLISHED'); assert.equal(await count(request), 2); clock = Date.now();
    const body = await reader(actor, request.targets[0].salesOrderId);
    assert.equal(parsePaymentView(body, request.targets[0].salesOrderId, request.selection.targets[0].salesContractNo).rows.length, 127);
  });
});
