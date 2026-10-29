import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import pg from 'pg';
import { createApp } from '../app.js';
import { createIdentityAuthority } from '../auth/identity-authority.js';
import { synchronizePermissionCatalog } from '../auth/permissions.js';
import type { TrustedIdentity } from '../auth/session.js';
import { PERMISSION_KEYS, type PermissionKey } from '../../features/permissions/model/permissions.js';
import { runMigrations } from '../db/migration-runner.js';
import { readClosingOrderBasis } from '../closing/basis-service.js';
import { compareClosingExecutionReferences } from '../closing/basis-model.js';
import { createQuoteRepository } from '../quotes/repository.js';
import { quoteSnapshotFromBrowser } from '../quotes/model.js';
import { createAinuokeSalesOrder } from '../sales-orders/service.js';
import { createSalesOrder } from '../sales-orders/repository.js';
import { writeAttributionHeadInTransaction } from '../sales-orders/effective-attribution.js';
import { previewOrderBusinessSource, adoptOrderBusinessSource } from '../sales-orders/business-source-service.js';
import { createProcessingBatch, previewProcessingBatch, confirmProcessingBatch, consumeProcessingBatches } from '../sales-orders/processing-batch-service.js';
import { previewSaleAdjustment, commitSaleAdjustment } from '../sales-orders/sale-adjustment-service.js';
import { parseProductionResourceCommand, type ProductionResourceType } from '../production-resources/contract.js';
import { executeProductionResourceCommand } from '../production-resources/service.js';
import { readOrderProductionPlans, previewProductionPlan, executeProductionPlan } from '../production-scheduling/service.js';
import { previewProductionExecution, executeProductionExecution } from '../production-scheduling/execution-service.js';
import type { PlanIntent } from '../production-scheduling/contract.js';
import type { ExecutionIntent } from '../production-scheduling/execution-contract.js';
import { startDisposablePostgres } from './postgres-container.js';
import { createSyntheticQuoteFixture } from './quote-fixture.js';

const errorCode = (code: string) => (error: unknown) => (error as { code: string }).code === code;

test('Gate8A closing basis: adopted color prices, real execution references and trusted read-only HTTP', { timeout: 180000 }, async t => {
  const database = await startDisposablePostgres();
  const pool = new pg.Pool({ connectionString: await database.createDatabase('closing_basis') });
  const origins: string[] = [], errors: unknown[] = [];
  const server = createServer(createApp({ pool, allowedOrigins: origins, security: { secureCookies: false, sessionTtlSeconds: 3600 }, logger: { error: value => errors.push(value) } }));
  t.after(async () => { await new Promise<void>(done => server.close(() => done())); try { await pool.end(); } finally { await database.stop(); } });
  await runMigrations(pool, resolve('database/migrations')); await synchronizePermissionCatalog(pool);
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done));
  const address = server.address(); assert.ok(address && typeof address === 'object');
  const base = `http://127.0.0.1:${address.port}`; origins.push(base);
  async function user(name: string, permissions: PermissionKey[]) {
    const row = (await pool.query("INSERT INTO app_users(username,password_hash,display_name,role) VALUES($1,crypt('synthetic-closing',gen_salt('bf',4)),$1,'viewer') RETURNING id::text,public_id::text", [name])).rows[0];
    await pool.query('INSERT INTO app_roles(id,name) VALUES($1,$1)', [name]);
    await pool.query('INSERT INTO app_user_roles VALUES($1,$2)', [row.id, name]);
    for (const key of permissions) await pool.query('INSERT INTO app_role_permissions VALUES($1,$2)', [name, key]);
    const response = await fetch(base + '/api/v1/auth/login', { method: 'POST', headers: { Origin: base, 'X-Zhixu-Request': '1', 'Content-Type': 'application/json' }, body: JSON.stringify({ username: name, password: 'synthetic-closing' }) });
    assert.equal(response.status, 200);
    return { actor: { internalUserId: row.id, userId: row.public_id, username: name, userName: 'Untrusted caller', permissions: [...PERMISSION_KEYS] } as TrustedIdentity,
      cookie: response.headers.get('set-cookie')!.split(';')[0], roleId: name };
  }
  const readerPermissions: PermissionKey[] = ['closing.view', 'order.view', 'schedule.view'];
  const editor = await user('closing.editor', [...PERMISSION_KEYS]);
  const reader = await user('closing.reader', readerPermissions), saleReader = await user('closing.sale', [...readerPermissions, 'commercial.sale.view']),
    laborReader = await user('closing.labor', [...readerPermissions, 'commercial.labor.view']);
  async function call(id: string, cookie: string | null = editor.cookie, suffix = '', method = 'GET') {
    const response = await fetch(`${base}/api/v1/closing/orders/${id}/basis${suffix}`, { method, headers: { ...(cookie ? { Cookie: cookie } : {}),
      ...(method === 'GET' ? {} : { Origin: base, 'X-Zhixu-Request': '1', 'Content-Type': 'application/json' }) } });
    const text = await response.text(); return { response, text, body: JSON.parse(text) };
  }
  const quotes = createQuoteRepository(pool);
  async function quote(id: string, type: 'distribution' | 'processing', currency: 'CNY' | 'USD' = 'USD') {
    const q = createSyntheticQuoteFixture(id, type);
    for (const revision of q.revisions) { revision.imageAttachmentIds = []; revision.fileAttachmentIds = []; revision.styleImageAttachmentId = null; }
    const revision = q.revisions.find(row => row.revisionId === q.defaultRevisionId)!;
    for (const [i, version] of revision.priceVersions.entries()) {
      version.quantity = 100; version.pricingParameters.laborCurrency = i ? 'CNY' : currency;
      version.confirmation = { quotedGarmentPrice: 999, quotedLaborPrice: 999, confirmedGarmentPrice: type === 'processing' ? null : 128 + i * 10,
        confirmedLaborPrice: type === 'processing' ? 0 : 20.125 + i, note: 'Synthetic closing basis', confirmedAt: '2026-10-26T00:00:00Z' };
    }
    await quotes.create(quoteSnapshotFromBrowser(q)); return { q, revision };
  }
  const distribution = await quote('closing-distribution', 'distribution');
  let serial = 0;
  async function order(adopt = true) {
    const n = ++serial;
    const created = await createAinuokeSalesOrder(pool, editor.actor, { source: { sourceId: 'CLOSE-' + n, sourceRowIdentity: 'CLOSE-ROW-' + n,
      salesContractNo: 'SYN-CLOSE-' + n, insideOrderNo: 'SYN-CLOSE-STYLE-' + n, lifecycleStatusRaw: '生效', contractDate: '2027-01-01', contractDeliveryDate: '2027-02-01',
      styleNo: 'SYN-CLOSE', companyNameSnapshot: 'Synthetic', customerNameSnapshot: 'Synthetic', brandNameSnapshot: 'Synthetic', quantity: 100, sourceHash: 'CLOSE-HASH-' + n, fetchedAt: '2026-10-26T00:00:00Z' },
    colors: [{ sourceLineIdentity: 'blue', colorName: '蓝', quantity: 40, deliveryDate: null, sourceHash: 'blue' }, { sourceLineIdentity: 'white', colorName: '白', quantity: 60, deliveryDate: null, sourceHash: 'white' }] });
    const id = created.salesOrder.id;
    if (adopt) {
      const colors = (await readOrderProductionPlans(pool, editor.actor, id)).order.colors;
      const selection = { kind: 'quote', quoteId: distribution.q.id, revisionId: distribution.revision.revisionId,
        assignments: colors.map((color, i) => ({ colorId: color.id, priceVersionId: distribution.revision.priceVersions[i].id })) };
      const preview = await previewOrderBusinessSource(pool, editor.actor, id, selection);
      await adoptOrderBusinessSource(pool, editor.actor, id, { selection, requestId: randomUUID(), expectedVersion: 0, fingerprint: preview.fingerprint, reason: 'Synthetic closing basis' });
    }
    return id;
  }
  const a = await order(), b = await order(), missing = await order(false);
  const initial = await readClosingOrderBasis(pool, editor.actor, a);
  await t.test('two prices retain stable color and adopted USD/CNY facts; no implicit monthly or tax recognition', async () => {
    assert.equal(initial.order.businessType, 'ainuoke_contract'); assert.equal(initial.readOnly, true);
    assert.deepEqual(initial.priceLines.map(line => line.garmentSale?.visibility === 'allowed' ? line.garmentSale.value?.price : null), ['128', '138']);
    assert.deepEqual(initial.priceLines.map(line => line.workPrice.visibility === 'allowed' ? line.workPrice.eligibility.reason : null), [null, 'usd_labor_version_required']);
    assert.equal(initial.executionFactsMeaning, 'cumulative_actual_not_monthly_events'); assert.deepEqual(initial.executionReferences, []);
    assert.ok(initial.unperformed.includes('tax_calculation')); assert.ok(initial.unperformed.includes('closing_lock'));
    const noBasis = await readClosingOrderBasis(pool, editor.actor, missing); assert.equal(noBasis.commercial, null);
    assert.equal(noBasis.priceLines[0].workPrice.visibility === 'allowed' && noBasis.priceLines[0].workPrice.eligibility.reason, 'commercial_not_adopted');
  });
  await t.test('negotiating one order appends its basis and never changes another order or saved basis', async () => {
    const saved = structuredClone(initial), rule = { kind: 'amount', value: '-2' };
    const preview = await previewSaleAdjustment(pool, editor.actor, { rule, items: [{ salesOrderId: a }] });
    const item = preview.items[0]; assert.equal(item.status, 'ready'); if (item.status !== 'ready') assert.fail();
    const result = await commitSaleAdjustment(pool, editor.actor, { requestId: randomUUID(), reason: 'Synthetic negotiation', rule,
      items: [{ salesOrderId: a, expectedVersion: item.expectedVersion, fingerprint: item.fingerprint }] });
    assert.equal(result.items[0].status, 'updated');
    const current = await readClosingOrderBasis(pool, editor.actor, a), other = await readClosingOrderBasis(pool, editor.actor, b);
    assert.equal(current.commercial?.version, 2); assert.equal(other.commercial?.version, 1);
    assert.deepEqual(current.priceLines.map(line => line.garmentSale?.visibility === 'allowed' ? line.garmentSale.value?.price : null), ['126', '136']);
    assert.deepEqual(other.priceLines, saved.priceLines.map(line => ({ ...line, colorId: other.priceLines.find(row => row.colorName === line.colorName)!.colorId, commercialVersionId: other.commercial!.id })));
    assert.deepEqual(initial, saved);
    assert.equal((await pool.query('SELECT count(*)::int n FROM confirmed_commercial_terms')).rows[0].n, 0);
  });
  await t.test('formal processing batch consumption has only a service basis, and CNY blocks without relabeling', async () => {
    for (const currency of ['USD', 'CNY'] as const) {
      const { q, revision } = await quote('closing-process-' + currency, 'processing', currency), version = revision.priceVersions[0];
      const batch = await createProcessingBatch(pool, editor.actor, { requestId: randomUUID(), quoteId: q.id, revisionId: revision.revisionId, priceVersionId: version.id,
        customerName: 'Synthetic', businessStyleNo: 'SYN-CLOSE-PROCESS', quantity: '10', orderDate: '2026-10-26', deliveryDate: null, customerReference: 'same-po', deliveryRequirements: '', referenceOrderId: null });
      const preview = await previewProcessingBatch(pool, editor.actor, batch.batchId);
      const confirmed = await confirmProcessingBatch(pool, editor.actor, batch.batchId, { requestId: randomUUID(), expectedVersion: batch.version, sourceFingerprint: preview.candidate.fingerprint });
      const consumed = (await consumeProcessingBatches(pool, editor.actor, { requestId: randomUUID(), items: [{ batchId: batch.batchId, expectedVersion: confirmed.version }] })).results[0];
      assert.equal(consumed.status, 'created'); if (consumed.status !== 'created') assert.fail();
      const basis = await readClosingOrderBasis(pool, editor.actor, String(consumed.salesOrderId)), row = basis.priceLines[0];
      assert.equal(basis.order.businessType, 'processing'); assert.equal(basis.commercial?.processingBatchId, batch.batchId);
      assert.equal(row.scope, 'order_wide'); assert.equal(Object.hasOwn(row, 'garmentSale'), false);
      if (row.workPrice.visibility !== 'allowed') assert.fail();
      assert.equal(row.workPrice.bucket, 'processing_service_usd'); assert.deepEqual(row.workPrice.value, { price: '0', currency });
      assert.equal(row.workPrice.eligibility.reason, currency === 'USD' ? null : 'usd_labor_version_required');
      assert.equal(/garmentSale|garment_sales|costSnapshot|productSnapshot/u.test(JSON.stringify(basis)), false);
    }
  });
  await t.test('real execution quantity/date corrections require review; cancelled output and locked evidence remain', async () => {
    async function resource(kind: ProductionResourceType, data: unknown) {
      const result = await executeProductionResourceCommand(pool, editor.actor, parseProductionResourceCommand({ requestId: randomUUID(), action: 'create', kind, resourceId: null, expectedVersion: 0, data }));
      assert.equal(result.status, 'applied'); if (result.status !== 'applied') assert.fail(); return result.resource;
    }
    const calendar = await resource('calendars', { name: '合成关账日历', enabled: true, remark: '', workingWeekdays: [1, 2, 3, 4, 5], exceptions: [] });
    const site = await resource('sites', { name: '合成关账地点', enabled: true, remark: '', countryCode: null, productionCalendarId: calendar.id, preProductionSampleLeadDays: 0 });
    const group = await resource('groups', { name: '合成关账组', enabled: true, remark: '', shortName: '合成', productionSiteId: site.id, sortOrder: 0 });
    async function plan(intent: PlanIntent) {
      const preview = await previewProductionPlan(pool, editor.actor, intent);
      const result = await executeProductionPlan(pool, editor.actor, { requestId: randomUUID(), intent: preview.intent, previewHash: preview.previewHash });
      assert.equal(result.status, 'applied'); if (result.status !== 'applied') assert.fail(); return result;
    }
    const current = await readOrderProductionPlans(pool, editor.actor, a);
    const created = await plan({ action: 'create', orderId: a, assignmentId: null, expectedVersion: 0, expectedPlanVersion: current.order.planVersion,
      data: { executionType: 'internal', executorId: group.id, colorId: current.order.colors[0].id, plannedQuantity: '30', duration: { mode: 'workdays', workdays: 2 }, dates: { mode: 'auto_queue', startDate: '2027-01-04' }, remark: '' } });
    const assignmentId = created.assignments[0].id, beforeExecution = await readClosingOrderBasis(pool, editor.actor, a);
    async function completion(quantity: string, date: string, reason: string) {
      const state = await readClosingOrderBasis(pool, editor.actor, a), row = state.executionReferences[0];
      const order = await readOrderProductionPlans(pool, editor.actor, a);
      const intent: ExecutionIntent = { action: 'record_execution', orderId: a, assignmentId, expectedAssignmentVersion: row.assignmentVersion,
        expectedExecutionVersion: row.execution?.version ?? 0, expectedPlanVersion: order.order.planVersion, data: { status: 'completed', completedQuantity: quantity,
          actualStartDate: '2027-01-04', actualCompletedDate: date }, reason, replan: null };
      const preview = await previewProductionExecution(pool, editor.actor, intent);
      const result = await executeProductionExecution(pool, editor.actor, { requestId: randomUUID(), intent: preview.intent, previewHash: preview.previewHash });
      assert.equal(result.status, 'applied');
    }
    await completion('20.125', '2027-01-06', '');
    const first = await readClosingOrderBasis(pool, editor.actor, a), frozen = structuredClone(first.executionReferences);
    assert.equal(compareClosingExecutionReferences(beforeExecution.executionReferences, first.executionReferences, 'open').requiresReview, true);
    await completion('19.005', '2027-01-07', '合成数量日期更正');
    const corrected = await readClosingOrderBasis(pool, editor.actor, a);
    assert.equal(compareClosingExecutionReferences(frozen, corrected.executionReferences, 'confirmed').canLock, false);
    assert.equal(compareClosingExecutionReferences(frozen, corrected.executionReferences, 'locked').status, 'locked_snapshot_with_later_changes');
    assert.equal(frozen[0].execution?.completedQuantity, '20.125'); assert.equal(corrected.executionReferences[0].execution?.completedQuantity, '19.005');
    const state = await readOrderProductionPlans(pool, editor.actor, a);
    await plan({ action: 'cancel', orderId: a, assignmentId, expectedVersion: state.assignments[0].version, expectedPlanVersion: state.order.planVersion, reason: '剩余另排' });
    const cancelled = await readClosingOrderBasis(pool, editor.actor, a);
    assert.equal(cancelled.executionReferences[0].planStatus, 'cancelled'); assert.equal(cancelled.executionReferences[0].executorId, group.id);
    assert.equal(cancelled.executionReferences[0].execution?.completedQuantity, '19.005');
    assert.notEqual(cancelled.executionFingerprint, first.executionFingerprint);
  });
  await t.test('trusted HTTP keeps amount grants independent and does not write business facts', async () => {
    const before = (await pool.query(`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename<>'app_sessions' ORDER BY tablename`)).rows.map(row => row.tablename as string);
    async function digest() {
      const result: Record<string, string> = {};
      for (const table of before) {
        assert.match(table, /^[a-z0-9_]+$/u);
        result[table] = (await pool.query(`SELECT md5(coalesce(jsonb_agg(to_jsonb(r) ORDER BY to_jsonb(r)::text)::text,'[]')) AS digest FROM public."${table}" r`)).rows[0].digest;
      }
      return result;
    }
    const saved = await digest();
    for (const [who, sale, labor] of [[reader, false, false], [saleReader, true, false], [laborReader, false, true], [editor, true, true]] as const) {
      const result = await call(a, who.cookie); assert.equal(result.response.status, 200, result.text); assert.equal(result.response.headers.get('cache-control'), 'no-store');
      for (const row of result.body.priceLines) {
        if (!sale) assert.deepEqual(row.garmentSale, { visibility: 'restricted' });
        if (!labor) assert.deepEqual(row.workPrice, { visibility: 'restricted' });
      }
      assert.equal(/"(?:costSnapshot|productSnapshot|sourceSnapshot|confirmedGarmentPrice|fxRate)"\s*:/u.test(result.text), false);
    }
    assert.deepEqual(await digest(), saved); // Existing authentication alone updates app_sessions.last_seen_at.
  });
  await t.test('fresh grants and active identity are authoritative, even with forged caller permissions', async () => {
    for (const permission of readerPermissions) {
      await pool.query('DELETE FROM app_role_permissions WHERE role_id=$1 AND permission_key=$2', [reader.roleId, permission]);
      await assert.rejects(() => readClosingOrderBasis(pool, reader.actor, a), errorCode('permission_denied'));
      assert.equal((await call(a, reader.cookie)).response.status, 403);
      await pool.query('INSERT INTO app_role_permissions VALUES($1,$2)', [reader.roleId, permission]);
    }
    await pool.query('UPDATE app_users SET active=false WHERE id=$1', [reader.actor.internalUserId]);
    await assert.rejects(() => readClosingOrderBasis(pool, reader.actor, a), errorCode('authentication_required'));
    assert.equal((await call(a, reader.cookie)).response.status, 401);
    await pool.query('UPDATE app_users SET archived_at=now() WHERE id=$1', [reader.actor.internalUserId]);
    await assert.rejects(() => readClosingOrderBasis(pool, reader.actor, a), errorCode('authentication_required'));
  });
  await t.test('historical aliases never redirect closing to a different physical order', async () => {
    const original = await order(false);
    const primary = (await createSalesOrder(pool, { creationSource: 'quote', sourceQuoteId: distribution.q.id,
      sourceRevisionId: distribution.revision.revisionId, sourcePriceVersionId: distribution.revision.priceVersions[0].id })).id;
    const pair = [original, primary].sort(), client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended('order-effective-attribution',0))");
      // Internal synthetic historical fixture; no public normalization command is enabled.
      const caseId = (await client.query('INSERT INTO sales_order_normalization_cases(first_order_id,second_order_id,created_by,request_id,payload_hash) VALUES($1,$2,$3,$4,$5) RETURNING id',
        [...pair, editor.actor.internalUserId, randomUUID(), 'a'.repeat(64)])).rows[0].id;
      await client.query("INSERT INTO sales_order_normalization_case_events(case_id,version,actor_id,request_id,payload_hash,event_type,reason,evidence) VALUES($1,1,$2,$3,$4,'opened','synthetic closing fixture','{}')",
        [caseId, editor.actor.internalUserId, randomUUID(), 'b'.repeat(64)]);
      const change = (await client.query("INSERT INTO sales_order_attribution_changes(case_id,case_version,change_type,actor_id,request_id,payload_hash,evidence_hash,evidence_basis,reason) VALUES($1,1,'normalize',$2,$3,$4,$4,'{}','synthetic closing fixture') RETURNING id",
        [caseId, editor.actor.internalUserId, randomUUID(), 'c'.repeat(64)])).rows[0].id;
      for (const id of pair) await client.query('INSERT INTO sales_order_attribution_members(change_id,sales_order_id,effective_order_id,previous_change_id,previous_version) VALUES($1,$2,$3,NULL,0)', [change, id, primary]);
      for (const id of pair) await writeAttributionHeadInTransaction(client, change, id);
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
    const current = await readClosingOrderBasis(pool, editor.actor, primary);
    assert.equal(current.order.id, primary);
    assert.deepEqual(await readClosingOrderBasis(pool, editor.actor, primary.toUpperCase()), current);
    for (const id of [original, original.toUpperCase()]) {
      await assert.rejects(() => readClosingOrderBasis(pool, editor.actor, id), errorCode('closing_physical_order_required'));
      const response = await call(id); assert.equal(response.response.status, 409); assert.equal(response.body.error.code, 'closing_physical_order_required');
    }
  });
  await t.test('no mutation, query override, anonymous or local-authority fallback is exposed', async () => {
    assert.deepEqual(await readClosingOrderBasis(pool, editor.actor, a.toUpperCase()), await readClosingOrderBasis(pool, editor.actor, a));
    const upper = await call(a.toUpperCase()); assert.equal(upper.response.status, 200, upper.text); assert.equal(upper.body.order.id, a);
    assert.equal((await call(a, null)).response.status, 401);
    assert.equal((await call('invalid')).body.error.code, 'invalid_closing_order_id');
    assert.equal((await call(a, editor.cookie, '?month=2027-01')).body.error.code, 'invalid_closing_basis_query');
    assert.equal((await call(a, editor.cookie, '', 'POST')).response.status, 405);
    assert.equal((await call(randomUUID())).response.status, 404);
    const local = createServer(createApp({ pool, identityAuthority: createIdentityAuthority(pool, 'local-single-user') }));
    try {
      await new Promise<void>(done => local.listen(0, '127.0.0.1', done)); const address = local.address(); assert.ok(address && typeof address === 'object');
      assert.equal((await fetch(`http://127.0.0.1:${address.port}/api/v1/closing/orders/${a}/basis`)).status, 404);
    } finally { await new Promise<void>(done => local.close(() => done())); }
    assert.deepEqual(errors, []);
  });
});
