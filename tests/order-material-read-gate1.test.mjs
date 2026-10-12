import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { projectMaterialProgress } from '../features/ainuoke-material-progress/projection.ts';
import { createOrderMaterialReader } from '../features/ainuoke-material-progress/read-service.ts';
import { orderMaterialNavigation } from '../features/ainuoke-material-progress/order-navigation.ts';
import { createSyntheticMaterialSource, syntheticOrder } from '../features/ainuoke-material-progress/synthetic-source.ts';
import { deriveMaterialStatuses } from '../features/style-progress/service/style-progress-service.ts';

const idA = 'aaaaaaaa-1111-4111-8111-111111111111';
const idB = 'bbbbbbbb-2222-4222-8222-222222222222';
const actor = (permissions = ['order.view', 'style_progress.read']) => ({ internalUserId: '1',
  userId: 'cccccccc-3333-4333-8333-333333333333', username: 'synthetic-tracker', userName: '合成跟单员', permissions });
const scope = (id = idA, contract = syntheticOrder.salesContractNo) => ({ id, version: 3,
  salesContractNo: contract, styleNo: syntheticOrder.styleNo, insideOrderNo: syntheticOrder.insideOrderNo });
const binding = (snapshots = createSyntheticMaterialSource(), order = scope()) => ({ salesOrderId: order.id,
  salesContractNo: order.salesContractNo, provenance: 'synthetic', snapshots });
const request = { salesOrderId: idA };
function reader(overrides = {}) {
  return createOrderMaterialReader({ resolveVisibleOrder: async () => scope(),
    loadSource: async () => binding(), ...overrides });
}
const protectedValues = ['87654321.123', '87654322.234', '87654323.345', '87654324.456'];
const protectedFields = ['quoteInternalCost', 'customerConfirmedPrice', 'confirmedLaborPrice', 'futureProfit'];
function withProtectedFields(pages = createSyntheticMaterialSource()) {
  for (const page of pages) for (const row of page.rows) {
    protectedFields.forEach((key, index) => { row.values[key] = protectedValues[index]; });
    row.values.CurrencyName = 'CNY'; row.values.cgprice = '12.75'; row.values.goodsamount = '255.00';
  }
  return pages;
}
function assertNoProtectedValues(value) {
  const serialized = typeof value === 'string' ? value : JSON.stringify(value);
  for (const item of [...protectedValues, ...protectedFields]) assert.ok(!serialized.includes(item), `protected item leaked: ${item}`);
}

test('one allowlisted projection serves summary and detail with identical Demand item states', async () => {
  const result = await reader()(actor(), request); assert.equal(result.status, 200);
  const { progress } = result.body;
  assert.equal(progress.schemaVersion, 'order-material-read.v1'); assert.equal(result.body.provenance, 'synthetic');
  assert.equal(progress.summary.basis, 'demand_items'); assert.equal(progress.summary.quantitiesAggregatedAcrossDemands, false);
  assert.equal(progress.summary.factoryExcluded, 1);
  assert.equal(progress.groups.flatMap(group => group.rows).length, progress.rows.length);
  for (const type of ['fabric', 'trim']) {
    const rows = progress.rows.filter(row => row.demand.materialType === type);
    const counts = progress.summary[type];
    assert.equal(counts.demands, rows.length); assert.equal(counts.groups, progress.groups.filter(group => group.type === type).length);
    assert.equal(counts.unknown, rows.filter(row => row.status === null).length);
    for (const state of ['not_purchased', 'purchasing', 'pending_inbound', 'ready']) {
      assert.equal(counts.states[state], rows.filter(row => row.status === state).length);
    }
    for (const row of rows) if (row.status !== null) assert.equal(row.status,
      deriveMaterialStatuses(row.demand.requiredQuantity, row.purchased, row.inbound, 0, 0).readinessStatus);
  }
  for (const group of progress.groups) for (const row of group.rows) assert.strictEqual(row, progress.rows.find(item => item.demand.id === row.demand.id));
});

test('BillNo uses the established normalization; Inside drift never rebinds UUID', async () => {
  const resolved = scope(); resolved.salesContractNo = ' ＳＣ-ＳＹＮＴＨＥＴＩＣ-００１ ';
  const result = await reader({ resolveVisibleOrder: async () => resolved })(actor(), request);
  assert.equal(result.status, 200); assert.equal(result.body.salesOrderId, idA);
  assert.equal(result.body.progress.order.salesContractNo, syntheticOrder.salesContractNo);
  assert.equal(result.body.progress.insideOrderDrift, true);
  assert.ok(result.body.progress.rows.every(row => row.demand.salesContractNo === syntheticOrder.salesContractNo));
});

test('missing source adapter returns unconnected without invoking any Browser fallback', async () => {
  const result = await createOrderMaterialReader({ resolveVisibleOrder: async () => scope() })(actor(), request);
  assert.equal(result.status, 200); assert.equal(result.body.provenance, 'not_connected');
  assert.equal(result.body.progress.sourceStatus, 'not_connected'); assert.equal(result.body.progress.rows.length, 0);
  assert.equal(result.body.progress.fetchedAt, null); assert.match(result.body.progress.message, /不会读取 Browser/);
});

test('null source and orders without a source contract remain explicitly unconnected', async () => {
  for (const options of [{ loadSource: async () => null },
    { resolveVisibleOrder: async () => ({ ...scope(), salesContractNo: null }), loadSource: async () => { assert.fail('must not load an unbound source'); } }]) {
    const result = await reader(options)(actor(), request); assert.equal(result.status, 200);
    assert.equal(result.body.progress.sourceStatus, 'not_connected');
  }
});

test('anonymous and missing Order/Material permissions are rejected before order or source reads', async () => {
  let reads = 0; const read = reader({ resolveVisibleOrder: async () => { reads++; return scope(); },
    loadSource: async () => { reads++; return binding(withProtectedFields()); } });
  assert.equal((await read(null, request)).status, 401);
  for (const permissions of [[], ['order.view'], ['style_progress.read'], ['quote.view', 'quote.cost.view']]) {
    const result = await read(actor(permissions), request); assert.equal(result.status, 403); assertNoProtectedValues(result);
  }
  assert.equal(reads, 0);
});

test('team visibility denial has the same response as an absent order and never loads source', async () => {
  const read = reader({ resolveVisibleOrder: async () => null, loadSource: async () => { assert.fail('not authorized'); } });
  const result = await read(actor(), request); assert.equal(result.status, 404);
  assert.deepEqual(result.error, { code: 'order_not_available', message: '订单不存在或不在授权范围内。' });
});

test('returned order UUID must match the requested UUID before source can be read', async () => {
  const result = await reader({ resolveVisibleOrder: async () => scope(idB), loadSource: async () => { assert.fail('scope mismatch'); } })(actor(), request);
  assert.equal(result.status, 503); assert.equal(result.error.code, 'order_scope_invalid');
});

test('snapshot envelope must match both resolved UUID and stable BillNo', async () => {
  for (const patch of [{ salesOrderId: idB }, { salesContractNo: 'SC-OTHER' }, { provenance: 'browser_local' }]) {
    const result = await reader({ loadSource: async () => ({ ...binding(withProtectedFields()), ...patch }) })(actor(), request);
    assert.equal(result.status, 503); assert.equal(result.error.code, 'source_binding_invalid'); assertNoProtectedValues(result);
  }
});

test('matching envelope cannot smuggle rows from a different order', async () => {
  const result = await reader({ loadSource: async () => binding(createSyntheticMaterialSource('identity_mismatch')) })(actor(), request);
  assert.equal(result.status, 200); assert.equal(result.body.progress.sourceStatus, 'identity_mismatch');
  assert.equal(result.body.progress.rows.length, 0);
});

test('concurrent orders remain isolated with a stateless reader', async () => {
  const b = scope(idB, 'SC-SYNTHETIC-002');
  const bPages = createSyntheticMaterialSource(); for (const page of bPages) for (const row of page.rows) row.values.ExpContractNo = b.salesContractNo;
  const read = createOrderMaterialReader({ resolveVisibleOrder: async (_identity, id) => id === idA ? scope() : b,
    loadSource: async order => { await Promise.resolve(); return order.id === idA ? binding() : binding(bPages, b); } });
  const [aResult, bResult] = await Promise.all([read(actor(), request), read(actor(), { salesOrderId: idB })]);
  assert.equal(aResult.status, 200); assert.equal(bResult.status, 200);
  assert.equal(aResult.body.salesOrderId, idA); assert.equal(bResult.body.salesOrderId, idB);
  assert.ok(aResult.body.progress.rows.every(row => row.demand.salesContractNo === syntheticOrder.salesContractNo));
  assert.ok(bResult.body.progress.rows.every(row => row.demand.salesContractNo === b.salesContractNo));
  assert.notEqual(aResult.body.navigation.returnHref, bResult.body.navigation.returnHref);
});

test('only a formal UUID is accepted; client BillNo/account/return URL/identity selectors are rejected', async () => {
  let calls = 0; const read = reader({ resolveVisibleOrder: async () => { calls++; return scope(); } });
  for (const input of [null, [], {}, { salesOrderId: 'SC-SYNTHETIC-001' },
    { ...request, salesContractNo: syntheticOrder.salesContractNo }, { ...request, accountId: 'another-account' },
    { ...request, returnTo: 'https://example.invalid/' }, { ...request, identity: actor() }, { ...request, amount: protectedValues[0] }]) {
    const result = await read(actor(), input); assert.equal(result.status, 400); assertNoProtectedValues(result);
  }
  assert.equal(calls, 0);
});

test('navigation returns to the exact formal order and rejects redirect/path injection', () => {
  assert.deepEqual(orderMaterialNavigation(idA.toUpperCase()), { salesOrderId: idA,
    detailHref: `/order-center/style-progress/detail?orderId=${idA}`, returnHref: `/order-center/server-detail?id=${idA}` });
  for (const value of ['https://example.invalid', `//example.invalid/${idA}`, `${idA}&returnTo=x`, `${idA}/../`, `${idA}%0a`, ` ${idA}`, 'browser-order-1', null]) {
    assert.equal(orderMaterialNavigation(value), null);
  }
});

test('shared procurement source prices require only the existing Order and Material read permissions', async () => {
  const result = await reader({ loadSource: async () => binding(withProtectedFields()) })(actor(), request);
  assert.equal(result.status, 200); const purchase = result.body.progress.rows.flatMap(row => row.purchases)[0];
  assert.deepEqual(purchase.sourcePricing, { ownership: 'ainuoke_source', currency: 'CNY', unitPrice: 12.75, amount: 255 });
  assertNoProtectedValues(result);
  assert.ok(!JSON.stringify(result).includes('zhixu_maintained'));
});

test('response and serialized export/cache consumers see only the allowlisted DTO, never Quote/sales/labor/profit', async () => {
  const resolved = { ...scope(), customerConfirmedPrice: protectedValues[1], confirmedLaborPrice: protectedValues[2], futureProfit: protectedValues[3] };
  const source = { ...binding(withProtectedFields()), quoteInternalCost: protectedValues[0], rawPayload: protectedValues };
  const result = await reader({ resolveVisibleOrder: async () => resolved, loadSource: async () => source })(actor(), request);
  assert.equal(result.status, 200);
  const responseBytes = JSON.stringify(result.body);
  const exportBytes = JSON.stringify(result.body.progress.rows);
  const cacheConsumer = new Map([[idA, JSON.parse(responseBytes)]]);
  for (const value of [result, responseBytes, exportBytes, cacheConsumer.get(idA)]) assertNoProtectedValues(value);
  const purchase = result.body.progress.rows.flatMap(row => row.purchases)[0];
  assert.deepEqual(Object.keys(purchase).sort(), ['id','purchaseOrderNo','purchaseDate','supplier','quantity','color','specification','sourcePricing'].sort());
  assert.ok(!responseBytes.includes('rawFields')); assert.ok(!responseBytes.includes('sourceReferences'));
  assert.ok(!responseBytes.includes('sourceMetadata')); assert.ok(!responseBytes.includes('sourceArtifactHash'));
});

test('protected exception content never reaches error payloads, whether from order resolver or source adapter', async () => {
  for (const options of [{ resolveVisibleOrder: async () => { throw new Error(protectedValues.join('|')); } },
    { loadSource: async () => { throw new Error(protectedValues.join('|')); } }]) {
    const result = await reader(options)(actor(), request); assert.equal(result.status, 503); assertNoProtectedValues(result);
  }
  const pages = withProtectedFields(); pages[0].rows[0].values[`token-${protectedValues[0]}`] = protectedValues[0];
  const result = await reader({ loadSource: async () => binding(pages) })(actor(), request);
  assert.equal(result.body.progress.sourceStatus, 'incomplete'); assertNoProtectedValues(result);
});

test('partial/overfull/compensated short pages and malformed timestamps never produce procurement states', () => {
  const cases = [pages => { pages[0].total++; }, pages => { pages[0].fetchedAt = protectedValues[0]; },
    pages => { pages[0].pageSize = 2; }, pages => { pages[0].page = 2; }];
  for (const mutate of cases) {
    const pages = withProtectedFields(); mutate(pages); const view = projectMaterialProgress(syntheticOrder, pages);
    assert.equal(view.sourceStatus, 'incomplete'); assert.equal(view.rows.length, 0); assertNoProtectedValues(view);
  }
  const pages = createSyntheticMaterialSource(); const all = pages[0].rows;
  const split = [{ ...pages[0], pageSize: 5, rows: all.slice(0, 4) }, { ...pages[0], page: 2, pageSize: 5, rows: all.slice(4) }];
  assert.equal(projectMaterialProgress(syntheticOrder, split).sourceStatus, 'incomplete');
});

test('unknown quantities and explicit zeros remain distinct in summary/detail', () => {
  const view = projectMaterialProgress(syntheticOrder, createSyntheticMaterialSource());
  assert.equal(view.rows.find(row => row.demand.materialCode.endsWith('unbought')).purchased, 0);
  assert.equal(view.rows.find(row => row.demand.materialCode.endsWith('unknown')).purchased, null);
  assert.equal(view.rows.find(row => row.demand.materialCode.endsWith('zero')).status, 'ready');
  assert.equal(view.summary.trim.unknown, 1);
  assert.ok(view.rows.every(row => row.unit === null));
});

test('dedup and color/spec child variants reuse the existing pipeline without factory demands in metrics', () => {
  const view = projectMaterialProgress(syntheticOrder, createSyntheticMaterialSource());
  assert.equal(view.factoryExcluded, 1); assert.equal(view.duplicateSourceRows, 1); assert.equal(view.duplicateEvents, 1);
  const cotton = view.groups.find(group => group.name === '合成棉布'); assert.equal(cotton.rows.length, 3);
  assert.equal(new Set(cotton.rows.map(row => row.demand.specification)).size, 2);
  assert.equal(new Set(cotton.rows.map(row => row.demand.materialColor)).size, 2);
  assert.equal(cotton.rows.find(row => row.purchased === 40).purchases.length, 2);
  assert.equal(cotton.rows.find(row => row.purchased === 40).purchaseShortfall, 60);
});

test('material shipment/outbound are separately deduped facts, not substitutions for inbound or garment shipping', () => {
  const pages = createSyntheticMaterialSource();
  for (const row of pages[0].rows) {
    row.values.CYNum = 0; row.values.OutStoreNum = 0;
    if (row.values.GoodsNo === 'SYNTHETIC-COTTON-BLUE') Object.assign(row.values,
      { CYNum: 10, cydh: 'SHIP-SYNTHETIC', cyrq: '2026-10-09', TransType: '合成海运', OutStoreNum: 5, ckdh: 'OUT-SYNTHETIC', ckrq: '2026-10-09' });
  }
  const row = projectMaterialProgress(syntheticOrder, pages).rows.find(item => item.demand.materialCode === 'SYNTHETIC-COTTON-BLUE');
  assert.equal(row.shipped, 10); assert.equal(row.shipments.length, 1); assert.equal(row.outbound, 5); assert.equal(row.outbounds.length, 1);
  assert.equal(row.inbound, 0); assert.equal(row.status, 'purchasing');
  assert.equal(row.shipments[0].transportMode, '合成海运');
  assert.ok(!JSON.stringify(row).includes('garmentShipment'));
  const original = projectMaterialProgress(syntheticOrder, createSyntheticMaterialSource()).rows[0];
  assert.equal(original.shipped, null); assert.equal(original.outbound, null);
});

test('unknown procurement pricing stays null and zero source pricing is not discarded', () => {
  const pages = createSyntheticMaterialSource(); const first = pages[0].rows.find(row => row.values.cgnum > 0);
  for (const row of pages[0].rows) if (row.values.cgdh === first.values.cgdh) Object.assign(row.values, { cgprice: 0, goodsamount: 0, CurrencyName: '' });
  const pricing = projectMaterialProgress(syntheticOrder, pages).rows.flatMap(row => row.purchases).map(event => event.sourcePricing);
  assert.ok(pricing.some(item => item.unitPrice === 0 && item.amount === 0 && item.currency === null));
  assert.ok(pricing.some(item => item.unitPrice === null && item.amount === null));
});

test('safe DTO detached from input and successive reads have no cached or inherited source', async () => {
  const pages = withProtectedFields(); const original = structuredClone(pages); let fetches = 0;
  const read = reader({ loadSource: async () => ++fetches === 1 ? binding(pages) : null });
  const first = await read(actor(), request); assert.deepEqual(pages, original);
  pages[0].rows[0].values.CnName = 'CHANGED AFTER READ';
  assert.ok(!JSON.stringify(first).includes('CHANGED AFTER READ'));
  const second = await read(actor(), request); assert.equal(second.body.provenance, 'not_connected');
  assert.equal(second.body.progress.rows.length, 0); assert.equal(fetches, 2);
});

test('preparation modules wire no network, persistence, cache, export writer or shared commercial domain', () => {
  for (const file of ['projection.ts', 'read-service.ts', 'order-navigation.ts']) {
    const source = readFileSync(new URL(`../features/ainuoke-material-progress/${file}`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /fetch\(|indexedDB|localStorage|sessionStorage|commitImport\(|commitAinuokeMaterialApiPreview\(|\.query\(|readConfirmedCommercialTerms|createTrustedQuoteService|new Map\(.*cache/);
  }
});

test('request accessors are never executed or reflected in errors', async () => {
  const requestWithGetter = Object.defineProperty({}, 'salesOrderId', { enumerable: true,
    get() { throw new Error(protectedValues.join('|')); } });
  const result = await reader()(actor(), requestWithGetter);
  assert.equal(result.status, 400); assertNoProtectedValues(result);
});

test('blank/boolean/invalid procurement prices remain unknown rather than false zero', () => {
  for (const value of ['   ', false, true, 'not-a-number', null]) {
    const pages = createSyntheticMaterialSource();
    for (const row of pages[0].rows) if (row.values.cgnum > 0) Object.assign(row.values, { cgprice: value, goodsamount: value });
    const view = projectMaterialProgress(syntheticOrder, pages); assert.equal(view.sourceStatus, 'ready');
    for (const event of view.rows.flatMap(row => row.purchases)) {
      assert.equal(event.sourcePricing.unitPrice, null); assert.equal(event.sourcePricing.amount, null);
    }
  }
});
