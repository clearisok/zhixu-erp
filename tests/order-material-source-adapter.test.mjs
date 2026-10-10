import assert from 'node:assert/strict';
import test from 'node:test';
import { createMaterialSourceLoader } from '../features/ainuoke-material-progress/source-adapter.ts';
import { createOrderMaterialReader } from '../features/ainuoke-material-progress/read-service.ts';
import { projectMaterialProgress } from '../features/ainuoke-material-progress/projection.ts';
import { createSyntheticMaterialSource, syntheticOrder, syntheticFetchedAt } from '../features/ainuoke-material-progress/synthetic-source.ts';
const id = 'aaaaaaaa-1111-4111-8111-111111111111';
const idB = 'bbbbbbbb-2222-4222-8222-222222222222';
const identity = { internalUserId: '1', userId: idB, username: 'synthetic', userName: 'Synthetic', permissions: ['order.view', 'style_progress.read'] };
const order = { id, version: 1, ...syntheticOrder };
const now = Date.parse(syntheticFetchedAt);
function discovery(contract = order.salesContractNo, inside = 'SYNTHETIC-IN-OLD') {
  return [{ schemaVersion: 'ainuoke-direct-read.v2', reportId: '6086103', fetchedAt: syntheticFetchedAt,
    page: 1, pageSize: 50, total: 1, queryContext: {}, snapshotHash: 'synthetic', rows: [{ sourceRowIdentity: 'discovery:synthetic',
      values: { id: 'source:synthetic', InsideOrderNo: inside, BillNo: contract, Status: '生效', GoodsDesc: order.styleNo } }] }];
}
function harness(overrides = {}) {
  const calls = [];
  const resolveVisibleOrder = async (_actor, uuid) => uuid === id ? order : null;
  const ports = { resolveVisibleOrder, readDiscovery: async () => discovery(),
    readMaterial: async (_actor, key, query) => { calls.push({ key, query }); return createSyntheticMaterialSource(); },
    provenance: 'synthetic', maxAgeMs: 1000, now: () => now, ...overrides };
  const load = createMaterialSourceLoader(ports);
  return { calls, load, read: (actor = identity, request = { salesOrderId: id }) => createOrderMaterialReader({ resolveVisibleOrder: ports.resolveVisibleOrder, loadSource: load })(actor, request) };
}
const progress = async h => (await h.read()).body.progress;
test('Discovery BillNo resolves current InsideOrderNo with fixed catalog key and reuses exact projection', async () => {
  const h = harness(); const result = await h.read();
  assert.equal(result.status, 200); assert.equal(result.body.progress.sourceStatus, 'ready');
  assert.deepEqual(h.calls, [{ key: 'material_purchase_statistics', query: { insideOrderNo: 'SYNTHETIC-IN-OLD' } }]);
  assert.equal(result.body.progress.insideOrderDrift, true);
  assert.deepEqual(result.body.progress, projectMaterialProgress(order, createSyntheticMaterialSource()));
});
test('InsideOrderNo drift uses Discovery rather than old formal order query attribute', async () => {
  const pages = createSyntheticMaterialSource(); pages[0].queryContext.insideOrderNo = 'SYNTHETIC-NEW';
  const h = harness({ readDiscovery: async () => discovery(order.salesContractNo, 'SYNTHETIC-NEW'),
    readMaterial: async (_actor, key, query) => { assert.equal(key, 'material_purchase_statistics'); assert.equal(query.insideOrderNo, 'SYNTHETIC-NEW'); return pages; } });
  assert.equal((await progress(h)).sourceStatus, 'ready');
});
for (const kind of ['duplicate', 'missing', 'incomplete']) test(`Discovery ${kind} contract fails closed before material fetch`, async () => {
  const pages = discovery();
  if (kind === 'duplicate') { pages[0].rows.push({ sourceRowIdentity: 'another', values: { ...pages[0].rows[0].values, id: 'another' } }); pages[0].total = 2; }
  if (kind === 'missing') pages[0].rows[0].values.BillNo = 'OTHER';
  if (kind === 'incomplete') pages[0].total = 51;
  const h = harness({ readDiscovery: async () => pages });
  assert.equal((await progress(h)).sourceStatus, kind === 'missing' ? 'source_missing' : 'incomplete'); assert.equal(h.calls.length, 0);
});
for (const stage of ['readDiscovery', 'readMaterial']) {
  test(`${stage} failure returns fixed message without raw response or secrets`, async () => {
    const h = harness({ [stage]: async () => { throw new Error('TOKEN-secret quoteInternalCost-999 confirmedLaborPrice-888'); } });
    const result = await h.read(); assert.equal(result.body.progress.sourceStatus, 'source_failed');
    assert.ok(!JSON.stringify(result).includes('secret')); assert.ok(!JSON.stringify(result).includes('999'));
  });
  test(`${stage} unconnected does not reuse another snapshot`, async () => {
    assert.equal((await progress(harness({ [stage]: async () => null }))).sourceStatus, 'not_connected');
  });
  test(`${stage} stale source is explicit and has no rows`, async () => {
    const pages = stage === 'readDiscovery' ? discovery() : createSyntheticMaterialSource(); pages[0].fetchedAt = new Date(now - 1001).toISOString();
    const result = await progress(harness({ [stage]: async () => pages })); assert.equal(result.sourceStatus, 'stale'); assert.deepEqual(result.rows, []);
  });
}
test('complete legal empty material page differs from missing snapshot and incomplete pagination', async () => {
  const empty = createSyntheticMaterialSource(); empty[0].rows = []; empty[0].total = 0;
  assert.equal((await progress(harness({ readMaterial: async () => empty }))).sourceStatus, 'ready');
  assert.equal((await progress(harness({ readMaterial: async () => [] }))).sourceStatus, 'source_missing');
  assert.equal((await progress(harness({ readMaterial: async () => createSyntheticMaterialSource('incomplete') }))).sourceStatus, 'incomplete');
});
test('multi-page complete material succeeds; dropped page fails', async () => {
  const pages = createSyntheticMaterialSource('large', 401);
  assert.equal((await progress(harness({ readMaterial: async () => pages }))).rows.length, 401);
  assert.equal((await progress(harness({ readMaterial: async () => pages.slice(0, 2) }))).sourceStatus, 'incomplete');
});
for (const kind of ['report', 'query', 'contract']) test(`material ${kind} identity conflict returns no data`, async () => {
  const pages = createSyntheticMaterialSource();
  if (kind === 'report') pages[0].reportId = '6087105';
  if (kind === 'query') pages[0].queryContext = { insideOrderNo: 'OTHER' };
  if (kind === 'contract') pages[0].rows[0].values.ExpContractNo = 'OTHER';
  const result = await progress(harness({ readMaterial: async () => pages })); assert.equal(result.sourceStatus, 'identity_mismatch'); assert.deepEqual(result.rows, []);
});
test('order visibility and version revalidation precede all source reads, including direct loader calls', async () => {
  const h = harness(); assert.equal((await h.read(identity, { salesOrderId: idB })).status, 404);
  await assert.rejects(h.load({ ...order, id: idB }, identity), /order_scope_unavailable/);
  await assert.rejects(h.load({ ...order, version: 2 }, identity), /order_scope_unavailable/);
  assert.equal(h.calls.length, 0);
});
test('insufficient permissions prevent reader and direct-loader Source access', async () => {
  let count = 0; const h = harness({ readDiscovery: async () => { count++; return discovery(); } });
  const actor = { ...identity, permissions: ['order.view'] };
  assert.equal((await h.read(actor)).status, 403); await assert.rejects(h.load(order, actor), /material_read_forbidden/); assert.equal(count, 0);
});
test('client account/report/contract selectors are rejected', async () => {
  const h = harness(); assert.equal((await h.read(identity, { salesOrderId: id, account: 'admin', reportId: '6087050' })).status, 400); assert.equal(h.calls.length, 0);
});
test('concurrent A/B reads retain separate scope and material rows', async () => {
  const b = { ...order, id: idB, salesContractNo: 'SC-B' };
  const resolver = async (_actor, uuid) => uuid === id ? order : b;
  const load = createMaterialSourceLoader({ resolveVisibleOrder: resolver,
    readDiscovery: async () => { const a = discovery(); const row = discovery('SC-B', 'IN-B')[0].rows[0]; row.sourceRowIdentity = 'b'; row.values.id = 'b'; a[0].rows.push(row); a[0].total = 2; return a; },
    readMaterial: async (_actor, _key, query) => { const pages = createSyntheticMaterialSource();
      if (query.insideOrderNo === 'IN-B') { pages[0].queryContext.insideOrderNo = 'IN-B'; for (const row of pages[0].rows) row.values.ExpContractNo = 'SC-B'; } return pages; },
    provenance: 'synthetic', now: () => now, maxAgeMs: 1000 });
  const read = createOrderMaterialReader({ resolveVisibleOrder: resolver, loadSource: load });
  const results = await Promise.all([read(identity, { salesOrderId: id }), read(identity, { salesOrderId: idB })]);
  results.forEach((result, index) => { assert.equal(result.body.salesOrderId, index ? idB : id); assert.equal(result.body.progress.sourceStatus, 'ready');
    assert.ok(result.body.progress.rows.every(row => row.demand.salesContractNo === (index ? 'SC-B' : order.salesContractNo))); });
});
test('explicit zero, unknown, exclusion, dedup and shared source pricing survive adapter without protected fields', async () => {
  const pages = createSyntheticMaterialSource();
  for (const row of pages[0].rows) Object.assign(row.values, { cgprice: 0, goodsamount: 0, CurrencyName: 'CNY', quoteInternalCost: 'PROTECTED-SENTINEL' });
  const before = structuredClone(pages); const result = await progress(harness({ readMaterial: async () => pages }));
  assert.equal(result.sourceStatus, 'ready'); assert.equal(result.factoryExcluded, 1); assert.ok(result.duplicateEvents > 0); assert.ok(result.duplicateSourceRows > 0);
  assert.ok(result.rows.some(row => row.purchased === 0)); assert.ok(result.rows.some(row => row.purchased === null));
  assert.ok(result.rows.flatMap(row => row.purchases).some(purchase => purchase.sourcePricing.unitPrice === 0));
  assert.ok(!JSON.stringify(result).includes('SENTINEL')); assert.deepEqual(pages, before);
});
test('freshness policy must be explicit and malformed/future timestamps fail closed', async () => {
  assert.throws(() => harness({ maxAgeMs: undefined }), /invalid_material_freshness_policy/);
  for (const time of ['invalid', new Date(now + 1).toISOString()]) {
    const pages = createSyntheticMaterialSource(); pages[0].fetchedAt = time;
    assert.equal((await progress(harness({ readMaterial: async () => pages }))).sourceStatus, time === 'invalid' ? 'incomplete' : 'stale');
  }
});

test('unsanitized credentials fail existing Material validation without disclosure', async () => {
  const pages = createSyntheticMaterialSource(); pages[0].rows[0].values.password = 'CREDENTIAL-SENTINEL';
  const result = await harness({ readMaterial: async () => pages }).read();
  assert.equal(result.body.progress.sourceStatus, 'incomplete'); assert.ok(!JSON.stringify(result).includes('SENTINEL'));
});
test('purchase, inbound and shipment duplicate join events retain one event per identity', async () => {
  const pages = createSyntheticMaterialSource();
  for (const row of pages[0].rows.filter(row => row.values.GoodsNo === 'SYNTHETIC-COTTON-BLUE')) {
    Object.assign(row.values, { rkdh: 'IN-ONE', rknum: 10, rkrq: '2026-10-02', cydh: 'SHIP-ONE', CYNum: 8, cyrq: '2026-10-03', TransType: '汽运' });
  }
  const result = await progress(harness({ readMaterial: async () => pages }));
  assert.equal(result.sourceStatus, 'ready'); const row = result.rows.find(row => row.purchased === 40);
  assert.equal(row.purchases.length, 2); assert.equal(row.inbounds.length, 1); assert.equal(row.shipments.length, 1);
  assert.equal(row.inbound, 10); assert.equal(row.shipped, 8);
});

for (const stage of ['readDiscovery', 'readMaterial']) test(`${stage} validates fetchedAt against clock after async read`, async () => {
  let clock = now;
  const h = harness({ now: () => clock, [stage]: async () => {
    await Promise.resolve(); clock += 100;
    const pages = stage === 'readDiscovery' ? discovery() : createSyntheticMaterialSource();
    for (const page of pages) page.fetchedAt = new Date(clock).toISOString();
    return pages;
  } });
  assert.equal((await progress(h)).sourceStatus, 'ready');
});

for (const kind of ['expired', 'future', 'invalid_clock']) test(`Material post-read validation remains fail-closed for ${kind}`, async () => {
  let clock = now;
  const h = harness({ now: () => clock, readMaterial: async () => {
    await Promise.resolve(); clock += 1001;
    const pages = createSyntheticMaterialSource();
    if (kind === 'future') pages[0].fetchedAt = new Date(clock + 1).toISOString();
    if (kind === 'invalid_clock') clock = NaN;
    return pages;
  } });
  assert.equal((await progress(h)).sourceStatus, kind === 'invalid_clock' ? 'source_failed' : 'stale');
});
