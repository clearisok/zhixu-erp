import assert from 'node:assert/strict';
import type { TestContext } from 'node:test';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdtemp, readdir, copyFile, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import pg from 'pg';
import { createApp } from '../app.js';
import { PERMISSION_KEYS, type PermissionKey } from '../../features/permissions/model/permissions.js';
import type { TrustedIdentity } from '../auth/session.js';
import { synchronizePermissionCatalog } from '../auth/permissions.js';
import { runMigrations } from '../db/migration-runner.js';
import { createQuoteRepository } from '../quotes/repository.js';
import { quoteSnapshotFromBrowser } from '../quotes/model.js';
import { createAinuokeSalesOrder } from '../sales-orders/service.js';
import { previewOrderBusinessSource, adoptOrderBusinessSource } from '../sales-orders/business-source-service.js';
import { createProcessingBatch, previewProcessingBatch, confirmProcessingBatch, consumeProcessingBatches } from '../sales-orders/processing-batch-service.js';
import { readOrderProductionPlans, previewProductionPlan, executeProductionPlan } from '../production-scheduling/service.js';
import { previewProductionExecution, executeProductionExecution } from '../production-scheduling/execution-service.js';
import type { ExecutionIntent } from '../production-scheduling/execution-contract.js';
import { parseProductionResourceCommand, type ProductionResourceType } from '../production-resources/contract.js';
import { executeProductionResourceCommand } from '../production-resources/service.js';
import { previewClosingCommand, executeClosingCommand } from '../closing/service.js';
import { readClosingOrderBasis } from '../closing/basis-service.js';
import { startDisposablePostgres } from './postgres-container.js';
import { createSyntheticQuoteFixture } from './quote-fixture.js';
import { summarizeRevisionConfirmations } from '../../features/quote-center/model/quote-workflows.js';

export const closingCode = (code: string) => (error: unknown) => (error as { code: string }).code === code;
export async function closingFixture(t: TestContext, legacy44: boolean | 45 | 47 | 48 | 49 = false, completeQuotes = false, ui: { staticDirectory?: string } = {}) {
  const postgres = await startDisposablePostgres();
  const pool = new pg.Pool({ connectionString: await postgres.createDatabase('closing_commands'), max: 14, application_name: 'synthetic-closing-commands' });
  const origins: string[] = [], errors: unknown[] = [], server = createServer(createApp({ pool, ...ui, allowedOrigins: origins, security: { secureCookies: false, sessionTtlSeconds: 3600 }, logger: { error: value => errors.push(value) } }));
  t.after(async () => { await new Promise<void>(done => server.close(() => done())); try { await pool.end(); } finally { await postgres.stop(); } });
  if (legacy44) {
    const parent = await realpath(tmpdir()), directory = await mkdtemp(join(parent, 'zhixu-closing-upgrade-'));
    t.after(async () => { const path = await realpath(directory); assert.equal(dirname(path), parent); assert.ok(basename(path).startsWith('zhixu-closing-upgrade-')); await rm(path, { recursive: true }); });
    for (const file of await readdir(resolve('database/migrations'))) if (/^\d+_.*\.sql$/u.test(file) && Number(file.slice(0, 4)) <= (typeof legacy44 === 'number' ? legacy44 : 44)) await copyFile(resolve('database/migrations', file), join(directory, file));
    await runMigrations(pool, directory);
  } else await runMigrations(pool, resolve('database/migrations'));
  await synchronizePermissionCatalog(pool);
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done)); const address = server.address(); assert.ok(address && typeof address === 'object');
  const base = `http://127.0.0.1:${address.port}`; origins.push(base);
  async function user(name: string, permissions: readonly PermissionKey[]) {
    const row = (await pool.query("INSERT INTO app_users(username,password_hash,display_name,role) VALUES($1,crypt('synthetic-closing',gen_salt('bf',4)),$1,'viewer') RETURNING id::text,public_id::text", [name])).rows[0];
    await pool.query('INSERT INTO app_roles(id,name) VALUES($1,$1)', [name]); await pool.query('INSERT INTO app_user_roles VALUES($1,$2)', [row.id, name]);
    for (const key of permissions) await pool.query('INSERT INTO app_role_permissions VALUES($1,$2)', [name, key]);
    const response = await fetch(base + '/api/v1/auth/login', { method: 'POST', headers: { Origin: base, 'X-Zhixu-Request': '1', 'Content-Type': 'application/json' }, body: JSON.stringify({ username: name, password: 'synthetic-closing' }) });
    assert.equal(response.status, 200);
    return { actor: { internalUserId: row.id, userId: row.public_id, username: name, userName: 'Untrusted caller', permissions: [...PERMISSION_KEYS] } as TrustedIdentity,
      cookie: response.headers.get('set-cookie')!.split(';')[0], role: name };
  }
  const editor = await user('closing.editor', PERMISSION_KEYS), repository = createQuoteRepository(pool);
  async function quote(id: string, type: 'distribution' | 'processing' = 'distribution', currency: 'USD' | 'CNY' = 'USD') {
    const q = createSyntheticQuoteFixture(id, type);
    for (const revision of q.revisions) { revision.imageAttachmentIds = []; revision.fileAttachmentIds = []; revision.styleImageAttachmentId = null; }
    const revision = q.revisions.find(row => row.revisionId === q.defaultRevisionId)!;
    if (completeQuotes) { revision.baseInfo.quoteStyleNo = 'SYN-USD'; revision.baseInfo.styleName = 'Synthetic USD'; }
    for (const [index, version] of revision.priceVersions.entries()) {
      version.quantity = 50; version.pricingParameters.laborCurrency = index ? 'CNY' : currency;
      if (completeQuotes) for (const trim of version.trims) trim.usage = 0;
      version.confirmation = { quotedGarmentPrice: 999, quotedLaborPrice: 999, confirmedGarmentPrice: type === 'processing' ? null : 113 * (index + 1),
        confirmedLaborPrice: type === 'processing' ? 0 : 2.5 + index, note: 'Synthetic confirmed terms', confirmedAt: '2026-10-26T00:00:00Z' };
    }
    if (completeQuotes) for (const row of q.revisions) row.confirmationSummary = summarizeRevisionConfirmations(row);
    await repository.create(quoteSnapshotFromBrowser(q)); return { q, revision };
  }
  const distribution = await quote('closing-shared'); let serial = 0;
  async function adoptQuote(id:string, unifiedUsd = false){
    const colors = (await readOrderProductionPlans(pool, editor.actor, id)).order.colors;
    const selection = { kind: 'quote', quoteId: distribution.q.id, revisionId: distribution.revision.revisionId,
      assignments: colors.map(color => ({ colorId: color.id, priceVersionId: distribution.revision.priceVersions[unifiedUsd || color.colorName === 'Blue' ? 0 : 1].id })) };
    const preview = await previewOrderBusinessSource(pool, editor.actor, id, selection);
    await adoptOrderBusinessSource(pool, editor.actor, id, { selection, requestId: randomUUID(), expectedVersion: 0, fingerprint: preview.fingerprint, reason: 'Synthetic initial adoption' });
  }
  async function order(adopt = true) {
    const n = ++serial;
    const result = await createAinuokeSalesOrder(pool, editor.actor, { source: { sourceId: 'CLOSE-' + n, sourceRowIdentity: 'ROW-' + n, salesContractNo: 'SYN-CLOSE-' + n,
      insideOrderNo: 'SYN-CLOSE-STYLE-' + n, lifecycleStatusRaw: '生效', contractDate: '2026-10-01', contractDeliveryDate: '2027-02-01', styleNo: 'SYN-CLOSE',
      companyNameSnapshot: 'Synthetic', customerNameSnapshot: 'Synthetic', brandNameSnapshot: 'Synthetic', quantity: 100, sourceHash: 'HASH-' + n, fetchedAt: '2026-10-26T00:00:00Z' },
    colors: [{ sourceLineIdentity: 'blue', colorName: 'Blue', quantity: 50, deliveryDate: null, sourceHash: 'blue' }, { sourceLineIdentity: 'white', colorName: 'White', quantity: 50, deliveryDate: null, sourceHash: 'white' }] });
    const id = result.salesOrder.id;
    if (adopt) await adoptQuote(id);
    return { id, basis: await readClosingOrderBasis(pool, editor.actor, id) };
  }
  async function processing(currency: 'USD' | 'CNY') {
    const { q, revision } = await quote('closing-process-' + currency + '-' + ++serial, 'processing', currency), version = revision.priceVersions[0];
    const batch = await createProcessingBatch(pool, editor.actor, { requestId: randomUUID(), quoteId: q.id, revisionId: revision.revisionId, priceVersionId: version.id,
      customerName: 'Synthetic', businessStyleNo: 'SYN-CLOSE-PROCESS', quantity: '10', orderDate: '2026-10-26', deliveryDate: null, customerReference: '', deliveryRequirements: '', referenceOrderId: null });
    const preview = await previewProcessingBatch(pool, editor.actor, batch.batchId), confirmed = await confirmProcessingBatch(pool, editor.actor, batch.batchId,
      { requestId: randomUUID(), expectedVersion: batch.version, sourceFingerprint: preview.candidate.fingerprint });
    const consumed = (await consumeProcessingBatches(pool, editor.actor, { requestId: randomUUID(), items: [{ batchId: batch.batchId, expectedVersion: confirmed.version }] })).results[0];
    assert.equal(consumed.status, 'created'); if (consumed.status !== 'created') assert.fail(); return { id: String(consumed.salesOrderId), batchId: batch.batchId };
  }
  async function usdOrder() { const value = await order(false); await adoptQuote(value.id, true); return { id: value.id, basis: await readClosingOrderBasis(pool, editor.actor, value.id) }; }
  async function resource(kind: ProductionResourceType, data: unknown, id: string | null = null, expectedVersion = 0) {
    const result = await executeProductionResourceCommand(pool, editor.actor, parseProductionResourceCommand({ requestId: randomUUID(), action: id ? 'update' : 'create', kind, resourceId: id, expectedVersion, data }));
    assert.equal(result.status, 'applied'); if (result.status !== 'applied') assert.fail(); return result.resource;
  }
  const calendar = await resource('calendars', { name: '合成关账日历', enabled: true, remark: '', workingWeekdays: [1, 2, 3, 4, 5], exceptions: [] });
  const site = await resource('sites', { name: '合成关账地点', enabled: true, remark: '', countryCode: null, productionCalendarId: calendar.id, preProductionSampleLeadDays: 0 });
  const groupData = { name: '合成关账生产组', enabled: true, remark: '', shortName: '合成', productionSiteId: site.id, sortOrder: 0 };
  const group = await resource('groups', groupData);
  async function assignment(orderId: string, colorId: string | null) {
    const state = await readOrderProductionPlans(pool, editor.actor, orderId);
    const intent = { action: 'create', orderId, assignmentId: null, expectedVersion: 0, expectedPlanVersion: state.order.planVersion,
      data: { executionType: 'internal', executorId: group.id, colorId, plannedQuantity: '30', duration: { mode: 'workdays', workdays: 2 }, dates: { mode: 'auto_queue', startDate: '2027-01-04' }, remark: '' } };
    const preview = await previewProductionPlan(pool, editor.actor, intent), saved = await executeProductionPlan(pool, editor.actor, { requestId: randomUUID(), intent: preview.intent, previewHash: preview.previewHash });
    assert.equal(saved.status, 'applied'); if (saved.status !== 'applied') assert.fail(); return saved.assignments[0].id;
  }
  async function completion(orderId: string, assignmentId: string, quantity: string, date = '2027-01-06', reason = '') {
    const state = await readOrderProductionPlans(pool, editor.actor, orderId), row = state.assignments.find(row => row.id === assignmentId)!;
    const intent: ExecutionIntent = { action: 'record_execution', orderId, assignmentId, expectedAssignmentVersion: row.version,
      expectedExecutionVersion: state.executions[assignmentId]?.version ?? 0, expectedPlanVersion: state.order.planVersion,
      data: { status: 'completed', completedQuantity: quantity, actualStartDate: '2027-01-04', actualCompletedDate: date }, reason, replan: null };
    const preview = await previewProductionExecution(pool, editor.actor, intent), saved = await executeProductionExecution(pool, editor.actor, { requestId: randomUUID(), intent: preview.intent, previewHash: preview.previewHash });
    assert.equal(saved.status, 'applied'); return saved;
  }
  async function prepared(intent: unknown, who = editor) {
    const preview = await previewClosingCommand(pool, who.actor, intent);
    return { requestId: randomUUID(), intent: preview.intent, previewHash: preview.previewHash };
  }
  async function apply(intent: unknown, who = editor) {
    const command = await prepared(intent, who), result = await executeClosingCommand(pool, who.actor, command);
    assert.equal(result.status, 'applied'); if (result.status !== 'applied') assert.fail(); return { command, result };
  }
  async function request(path: string, body?: unknown, cookie: string | null = editor.cookie, headers: Record<string, string> = {}) {
    const response = await fetch(base + '/api/v1/closing' + path, { method: body === undefined ? 'GET' : 'POST', headers: { ...(cookie ? { Cookie: cookie } : {}),
      ...(body === undefined ? {} : { Origin: base, 'X-Zhixu-Request': '1', 'Content-Type': 'application/json' }), ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const text = await response.text(); return { response, text, body: JSON.parse(text) };
  }
  return { postgres, pool, server, base, origins, errors, editor, user, order, usdOrder, adopt:adoptQuote, processing, distribution, repository, resource, group, groupData, assignment, completion, prepared, apply, request };
}
