// Explicit opt-in synthetic data for the existing owned persistent-image test.
// No production recovery implementation, Source IO or existing target is used.
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';

const closing = '/api/v1/closing', labor = '/api/v1/quotes/order-labor-adoptions', months = closing + '/month-plans';
export const financialRecoveryTables = [
  'server_closing_commands', 'server_closing_periods', 'server_closing_period_versions', 'server_closing_period_heads',
  'server_closing_allocations', 'server_closing_allocation_versions', 'server_closing_allocation_heads', 'order_labor_adoption_commands',
  'server_closing_month_plans', 'server_closing_month_plan_versions', 'server_closing_month_plan_heads', 'server_closing_month_commands', 'server_closing_month_financial_links',
];
function owned(state) {
  assert.equal(state.prepared, true, 'financial recovery requires successful owned preparation');
  assert.match(state.project, /^zhixu-quote-trial-(?:it|recovery)-[0-9a-f]{10}$/);
}
// These test inputs contain JSON values only. Both existing command digests use
// this recursively sorted JSON representation; never hash a replacement intent.
function commandHash(command) {
  const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
    ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, item]) => [key, canonical(item)])) : value;
  return createHash('sha256').update(JSON.stringify(canonical(command))).digest('hex');
}
async function json(state, cookie, path, body, method = 'POST') {
  const response = await state.request(path, { cookie, ...(body === undefined ? {} : { method, body }) });
  assert.equal(response.status, 200, `synthetic_financial_http:${path}:${response.status}:${response.bytes.toString().slice(0, 240)}`);
  return response.json();
}
function originalResult(result) { const value = { ...result }; delete value.replayed; return value; }

export function assertFinancialRecoveryReceipt(expected, reply) {
  assert.ok(['closing', 'labor', 'month'].includes(expected.kind));
  assert.equal(expected.command.requestId, expected.result.requestId);
  assert.equal(expected.result.status, 'applied');
  assert.equal(reply.state, 'recorded', 'HTTP 200 unknown is not recovery proof');
  assert.equal(reply.requestId, expected.command.requestId);
  assert.equal(reply.commandHash, commandHash(expected.command), 'receipt must bind the exact original command');
  if (expected.kind === 'labor') assert.equal(reply.orderId, expected.command.intent.orderId);
  else if (expected.kind === 'month') assert.equal(reply.result.orderId, expected.command.intent.orderId);
  else if ('periodId' in expected.command.intent) assert.equal(expected.result.periodId, expected.command.intent.periodId);
  assert.deepEqual(reply.result, expected.result, 'receipt must preserve the original applied IDs, versions and result');
}

export async function seedPersistentFinancialRecovery(state, cookie, domain, run) {
  owned(state); assert.match(state.project, /^zhixu-quote-trial-it-[0-9a-f]{10}$/);
  assert.ok(domain.orderId && domain.assignments.length === 2);
  const quoteUrl = new URL('./quote-fixture.ts', import.meta.url).href;
  const workflowUrl = new URL('../../features/quote-center/model/quote-workflows.ts', import.meta.url).href;
  const input = await run(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', `
    import {createSyntheticQuoteFixture} from ${JSON.stringify(quoteUrl)};
    import {summarizeRevisionConfirmations} from ${JSON.stringify(workflowUrl)};
    const quotes=['distribution','processing'].map(type=>{
      const q=createSyntheticQuoteFixture(crypto.randomUUID(),type);
      for(const revision of q.revisions){
        revision.imageAttachmentIds=[];revision.fileAttachmentIds=[];revision.styleImageAttachmentId=null;revision.garmentMedia=[];
        revision.baseInfo.quoteStyleNo='SYN-RECOVERY-'+type;revision.baseInfo.styleName='Synthetic recovery '+type;
        for(const pv of revision.priceVersions){
          pv.quantity=50;pv.pricingParameters.laborCurrency=type==='processing'?'USD':'CNY';
          for(const trim of pv.trims)trim.usage=0;
          pv.confirmation={quotedGarmentPrice:999,quotedLaborPrice:999,confirmedGarmentPrice:type==='processing'?null:113,
            confirmedLaborPrice:type==='processing'?0:1.125,note:'Synthetic recovery confirmed',confirmedAt:'2026-10-26T00:00:00Z'};
        }
        revision.confirmationSummary=summarizeRevisionConfirmations(revision);
      }
      return q;
    });process.stdout.write(JSON.stringify(quotes));`]);
  // Import generated synthetic quotes using the same repository/aggregate
  // adapter as existing fixtures. All subsequent business writes use HTTP.
  const script = `
    import pg from 'pg';import {loadServerConfig} from './dist/server/server/config.js';
    import {createQuoteRepository} from './dist/server/server/quotes/repository.js';
    import {quoteSnapshotFromBrowser} from './dist/server/server/quotes/model.js';
    const pool=new pg.Pool({connectionString:loadServerConfig().databaseUrl});
    try{const repository=createQuoteRepository(pool),quotes=${input};
      for(const q of quotes)await repository.create(quoteSnapshotFromBrowser(q));
      process.stdout.write(JSON.stringify(quotes.map(q=>{const r=q.revisions.find(r=>r.revisionId===q.defaultRevisionId);
        return {id:q.id,revisionId:r.revisionId,priceVersionId:r.priceVersions[0].id};})));
    }finally{await pool.end();}`;
  const [distribution, processing] = JSON.parse(await state.compose(['exec', '-T', 'app', 'node', '--input-type=module'], script));
  const plans = await json(state, cookie, '/api/v1/production-scheduling/orders/' + domain.orderId);
  assert.equal(plans.order.colors.length, 1);
  const colorId = plans.order.colors[0].id, sourcePath = '/api/v1/sales-orders/' + domain.orderId + '/business-source';
  const selection = { kind: 'quote', quoteId: distribution.id, revisionId: distribution.revisionId,
    assignments: [{ colorId, priceVersionId: distribution.priceVersionId }] };
  const sourcePreview = await json(state, cookie, sourcePath + '/preview', selection);
  await json(state, cookie, sourcePath, { selection, requestId: randomUUID(), expectedVersion: 0,
    fingerprint: sourcePreview.fingerprint, reason: 'Synthetic initial recovery terms' });
  const originalBasis = await json(state, cookie, closing + '/orders/' + domain.orderId + '/basis');
  assert.equal(originalBasis.priceLines[0].workPrice.value.currency, 'CNY');
  assert.equal(originalBasis.priceLines[0].workPrice.value.price, '1.125');
  assert.equal(originalBasis.priceLines[0].workPrice.eligibility.reason, 'usd_labor_version_required');
  const batchPrefix = '/api/v1/processing-order-batches';
  const batch = await json(state, cookie, batchPrefix, { requestId: randomUUID(), quoteId: processing.id,
    revisionId: processing.revisionId, priceVersionId: processing.priceVersionId, customerName: 'Synthetic recovery',
    businessStyleNo: 'SYN-RECOVERY-PROCESSING', quantity: '10', orderDate: '2026-10-26', deliveryDate: null,
    customerReference: '', deliveryRequirements: '', referenceOrderId: null });
  const batchPreview = await json(state, cookie, batchPrefix + '/' + batch.batchId + '/preview', {});
  const confirmed = await json(state, cookie, batchPrefix + '/' + batch.batchId + '/confirm', { requestId: randomUUID(),
    expectedVersion: batch.version, sourceFingerprint: batchPreview.candidate.fingerprint });
  const consumed = await json(state, cookie, batchPrefix + '/consume', { requestId: randomUUID(), items: [{ batchId: batch.batchId, expectedVersion: confirmed.version }] });
  assert.equal(consumed.results.length, 1); assert.equal(consumed.results[0].status, 'created');
  const processingOrderId = consumed.results[0].salesOrderId;
  const fixture = { orderId: domain.orderId, processingOrderId, batchId: batch.batchId, quoteIds: [distribution.id, processing.id], receipts: [], readPaths: [], originalBasis };
  async function save(prefix, intent, kind) {
    const preview = await json(state, cookie, prefix + '/preview', intent);
    const command = { requestId: randomUUID(), intent: preview.intent, previewHash: preview.previewHash };
    const result = originalResult(await json(state, cookie, prefix + '/commands', command));
    assert.equal(result.status, 'applied');
    const receipt = { kind, path: prefix + '/commands/' + command.requestId, command, result };
    assertFinancialRecoveryReceipt(receipt, await json(state, cookie, receipt.path)); fixture.receipts.push(receipt); return result;
  }
  const period = async id => json(state, cookie, closing + '/periods/' + id);
  const plan = async id => (await json(state, cookie, closing + '/orders/' + id + '/month-plan')).plan;
  const units = value => { const [whole, fraction = ''] = value.split('.'); assert.ok(fraction.length <= 6); return BigInt(whole) * 1000000n + BigInt(fraction.padEnd(6, '0')); };
  const quantityText = value => { const fraction = (value % 1000000n).toString().padStart(6, '0').replace(/0+$/u, ''); return (value / 1000000n).toString() + (fraction ? '.' + fraction : ''); };
  // Real unpriced month commands supply every quantity. No retired manual
  // financial writer, test-only product switch or free amount is involved.
  for (const orderId of [domain.orderId, processingOrderId]) {
    const current = await plan(orderId); assert.ok(current);
    await save(months, { action: 'move_months', orderId, expectedVersion: current.version, targetMonth: '2027-03', selection: { mode: 'whole' }, reason: 'Synthetic explicit preparation month' }, 'month');
  }
  async function add(periodId, orderId, colorId, quantity, channels, assignmentId = null) {
    let current = await plan(orderId);
    const source = current.lines.find(row => row.month === '2027-03' && row.assignmentId === null && row.colorId === colorId && units(row.quantity) >= units(quantity)); assert.ok(source);
    let lineId = source.id;
    if (assignmentId !== null) {
      const rest = units(source.quantity) - units(quantity);
      await save(months, { action: 'match_executors', orderId, expectedVersion: current.version, reason: 'Synthetic explicit assignment match', items: [{ lineId, parts: [{ assignmentId, quantity }, ...(rest > 0n ? [{ assignmentId: null, quantity: quantityText(rest) }] : [])] }] }, 'month');
      current = await plan(orderId); lineId = current.lines.find(row => row.month === source.month && row.assignmentId === assignmentId && row.colorId === colorId && row.quantity === quantity).id;
    }
    await save(months, { action: 'move_months', orderId, expectedVersion: current.version, targetMonth: (await period(periodId)).period.month, selection: { mode: 'partial', items: [{ lineId, quantity }] }, reason: 'Synthetic explicit month portion' }, 'month');
    const result = await save(closing, { action: 'sync_month_outputs', periodId, expectedPeriodVersion: (await period(periodId)).period.version, channels, reason: 'Explicitly adopt the complete current month plan' }, 'closing');
    const rows = (await period(periodId)).items.filter(row => row.status === 'active' && row.snapshot.order.id === orderId && row.snapshot.colorId === colorId);
    const selected = rows.find(row => channels.sales ? row.snapshot.channels.sales : row.snapshot.channels.work); assert.ok(selected);
    return { ...result, allocationId: selected.id, allocationIds: rows.map(row => row.id) };
  }
  async function lock(periodId) {
    for (const action of ['confirm_period', 'lock_period']) await save(closing, { action, periodId,
      expectedPeriodVersion: (await period(periodId)).period.version, reason: 'Explicit synthetic confirmation' }, 'closing');
  }
  const before = await save(closing, { action: 'create_period', month: '2027-01', taxRatePercent: '13', taxRateConfirmed: true, remark: 'Explicit synthetic tax' }, 'closing');
  const oldAllocation = await add(before.periodId, domain.orderId, colorId, '1.125', { sales: true, work: false }, domain.assignments[0]);
  const blocked = await state.request(closing + '/preview', { cookie, method: 'POST', body: { action: 'sync_month_outputs', periodId: before.periodId,
    expectedPeriodVersion: (await period(before.periodId)).period.version, channels: { sales: false, work: true }, reason: 'USD adoption is still required' } });
  assert.equal(blocked.status, 409); assert.equal(blocked.json().error.code, 'closing_usd_work_basis_required');
  await lock(before.periodId);
  const lockedBefore = await period(before.periodId);
  assert.equal(lockedBefore.period.status, 'locked'); assert.equal(lockedBefore.summary.garmentSalesCny.amount.decimal, '112.5');
  assert.equal(lockedBefore.items[0].snapshot.commercial.id, originalBasis.commercial.id);
  // Explicit trusted successor confirmation changes work only. 9999 is a
  // deliberate new quote sale that must never replace the order's adopted 113.
  const quotePath = '/api/v1/quotes/' + distribution.id;
  const quote = async () => (await json(state, cookie, quotePath)).quote;
  let record = await quote();
  await json(state, cookie, quotePath + '/version-workflows', { action: 'revision.create', expectedVersion: record.version,
    sourceRevisionId: distribution.revisionId, reason: '工价调整', note: 'Synthetic recovery USD successor' });
  record = await quote(); const revision = record.quote.revisions.find(row => row.revisionId === record.quote.defaultRevisionId);
  for (const pv of revision.priceVersions) pv.pricingParameters.laborCurrency = 'USD';
  await json(state, cookie, quotePath, { quote: record.quote, expectedVersion: record.version }, 'PUT');
  for (const pv of revision.priceVersions) {
    record = await quote();
    await json(state, cookie, quotePath + '/confirmation-workflows', { action: 'confirmation.save', expectedVersion: record.version,
      revisionId: revision.revisionId, priceVersionId: pv.id, confirmedLaborPrice: '4.25', confirmedGarmentPrice: '9999', note: 'Synthetic explicit USD confirmation' });
  }
  const adopted = await save(labor, { orderId: domain.orderId, expectedVersion: originalBasis.commercial.version,
    targetRevisionId: revision.revisionId, colorIds: [colorId], productUnchangedConfirmed: true, reason: 'Synthetic explicit USD adoption, no FX' }, 'labor');
  const newBasis = await json(state, cookie, closing + '/orders/' + domain.orderId + '/basis');
  assert.equal(newBasis.commercial.id, adopted.commercialVersionId); assert.equal(newBasis.commercial.version, originalBasis.commercial.version + 1);
  assert.equal(newBasis.priceLines[0].garmentSale.value.price, '113'); assert.equal(newBasis.priceLines[0].workPrice.value.currency, 'USD');
  assert.equal(newBasis.priceLines[0].workPrice.value.price, '4.25');
  assert.deepEqual(await period(before.periodId), lockedBefore, 'new adoption must not rewrite a locked period');
  const after = await save(closing, { action: 'create_period', month: '2027-02', taxRatePercent: '0', taxRateConfirmed: true, remark: 'Explicit zero tax' }, 'closing');
  const newAllocation = await add(after.periodId, domain.orderId, colorId, '7.25', { sales: true, work: true }, domain.assignments[0]);
  const processAllocation = await add(after.periodId, processingOrderId, null, '3.125', { sales: false, work: true });
  await lock(after.periodId); const lockedAfter = await period(after.periodId);
  assert.equal(lockedAfter.summary.registeredQuantity, '10.375'); assert.equal(lockedAfter.summary.garmentSalesCny.amount.decimal, '819.25');
  assert.equal(lockedAfter.summary.distributionLaborUsd.amount.decimal, '30.8125');
  assert.equal(lockedAfter.summary.processingServiceUsd.amount.decimal, '0');
  const processingRow = lockedAfter.items.find(row => row.id === processAllocation.allocationId);
  assert.equal(processingRow.snapshot.outputs.work.bucket, 'processing_service'); assert.equal(Object.hasOwn(processingRow.snapshot.outputs, 'garmentSale'), false);
  fixture.periodIds = [before.periodId, after.periodId]; fixture.allocationIds = [...oldAllocation.allocationIds, ...newAllocation.allocationIds, ...processAllocation.allocationIds];
  fixture.lockedVersions = [lockedBefore.period.version, lockedAfter.period.version];
  fixture.readPaths = [sourcePath, ...[domain.orderId, processingOrderId].flatMap(id => [closing + '/orders/' + id + '/basis', closing + '/orders/' + id + '/month-plan']),
    ...fixture.periodIds.flatMap((id, index) => [closing + '/periods/' + id, closing + '/periods/' + id + '?version=' + fixture.lockedVersions[index], closing + '/periods/' + id + '/history']),
    ...fixture.allocationIds.map(id => closing + '/allocations/' + id + '/history'), labor + '/history?orderId=' + domain.orderId,
    ...fixture.quoteIds.map(id => '/api/v1/quotes/' + id)];
  return fixture;
}

export async function snapshotPersistentFinancialRecovery(state, cookie, fixture) {
  owned(state); const responses = {}, counts = {};
  for (const name of financialRecoveryTables) {
    counts[name] = Number(await state.sql('SELECT count(*) FROM ' + name));
    assert.ok(Number.isSafeInteger(counts[name]) && counts[name] > 0, 'nonempty_financial_recovery_required:' + name);
  }
  for (const path of fixture.readPaths) responses[path] = await json(state, cookie, path);
  for (const expected of fixture.receipts) {
    const reply = await json(state, cookie, expected.path); assertFinancialRecoveryReceipt(expected, reply); responses[expected.path] = reply;
  }
  return { counts, responses };
}
