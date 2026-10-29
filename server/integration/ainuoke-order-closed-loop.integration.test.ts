import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { closingFixture } from './closing-fixture.js';
import { bindingBundle, freshMaterialBundle } from './ainuoke-binding-fixture.js';
import { collectionEvidence, collectionSelection } from './payment-collection-fixture.js';
import { collectionRequest, configFor, sourceRow, workerFrame } from './garment-collection-fixture.js';
import { bindOrders, previewBindings } from '../ainuoke-source/binding.js';
import { accountFingerprint } from '../ainuoke-source/collector.js';
import { hash, type SourceBundle } from '../ainuoke-source/contract.js';
import { captureSource } from '../ainuoke-source/service.js';
import { createPersistedMaterialPorts } from '../ainuoke-source/reader.js';
import { createOrderMaterialReader } from '../../features/ainuoke-material-progress/read-service.js';
import { planPaymentCollection, collectAndPublishPaymentContracts } from '../ainuoke-source/payment-request-collection.js';
import { createPaymentSnapshotReader } from '../ainuoke-source/payment-request-store.js';
import { planGarmentTarget, applyGarmentTarget } from '../ainuoke-source/garment-target-control.js';
import { planGarmentCollection, collectGarmentOnce } from '../ainuoke-source/garment-collection-control.js';
import { createGarmentShipmentReader } from '../ainuoke-source/garment-shipment-store.js';
import { previewBoundOrderRefresh, applyBoundOrderRefresh } from '../ainuoke-source/bound-order-refresh.js';
import { getSalesOrderById } from '../sales-orders/repository.js';
import { readDeliveryPlanSet } from '../sales-orders/delivery-plan-repository.js';
import { updateDeliveryPlans } from '../sales-orders/delivery-plan-service.js';
import { readOrderProductionPlans, previewProductionPlan, executeProductionPlan } from '../production-scheduling/service.js';
import { readOrderClosingMonthPlan, previewClosingMonthMove, executeClosingMonthMove } from '../closing/month-plan-service.js';
import { readClosingPeriodDetail } from '../closing/read-service.js';
import type { ClosingMonthIntent } from '../closing/month-plan-model.js';

test('one trusted SO keeps independent material, payment, shipment, production and locked closing facts', { timeout: 180000 }, async t => {
  const f = await closingFixture(t, false, true), actor = f.editor.actor;
  assert.match(f.postgres.containerName, /^zhixu-pg-it-[a-f0-9]{12}$/u);
  let clock = Date.now();
  const now = () => clock, config = configFor(actor.username);
  const source = { sourceKey: config.sourceKey, accountFingerprint: accountFingerprint(config) };
  const input = bindingBundle(clock, 2);
  for (const row of input.discoveryBefore[0].rows) row.values.DeliveryDate = '2027-02-01';
  input.discoveryAfter = structuredClone(input.discoveryBefore);
  for (const pages of Object.values(input.colors)) pages[0].rows[0].values.DeliveryDate = '2027-02-01';
  const contracts = input.discoveryBefore[0].rows.map(row => String(row.values.BillNo));
  const reviewed = await previewBindings(input, clock);
  const bound = await bindOrders(f.pool, actor, { ...source, expectedPreview: reviewed.reviewHash, collect: async () => input, now });
  assert.equal(bound.created, 2);
  const [orderId, secondOrderId] = bound.orderIds;
  const initialOrder = (await getSalesOrderById(f.pool, orderId))!;
  const colorId = (await readOrderProductionPlans(f.pool, actor, orderId)).order.colors[0].id;
  const plan = () => readOrderClosingMonthPlan(f.pool, actor, orderId);
  async function move(intent: ClosingMonthIntent) {
    const preview = await previewClosingMonthMove(f.pool, actor, intent);
    assert.equal((await executeClosingMonthMove(f.pool, actor, { requestId: randomUUID(), intent: preview.intent, previewHash: preview.previewHash })).status, 'applied');
  }
  // These are snapshots of this test's owned database, never existing business data.
  const protectedTables = ['sales_orders', 'sales_order_source_links', 'sales_order_commercial_versions',
    'sales_order_commercial_heads', 'sales_order_commercial_lines', 'sales_order_business_source_snapshots',
    'sales_order_delivery_plans', 'production_schedule_assignments', 'production_schedule_executions',
    'production_schedule_execution_versions', 'server_closing_month_plan_versions', 'server_closing_allocation_versions',
    'server_closing_month_financial_links', 'server_closing_period_versions'];
  const rows = async (table: string) => (await f.pool.query(`SELECT to_jsonb(t) value FROM ${table} t ORDER BY to_jsonb(t)::text`)).rows;
  const protectedState = () => Promise.all(protectedTables.map(rows));
  const count = async (table: string) => (await f.pool.query(`SELECT count(*)::int n FROM ${table}`)).rows[0].n as number;

  await t.test('binding retry returns the same UUIDs and default closing month; no Quote is created implicitly', async () => {
    const quotes = await count('quote_center_quotes');
    const replay = await bindOrders(f.pool, actor, { ...source, expectedPreview: reviewed.reviewHash, collect: async () => input, now });
    assert.equal(replay.replayed, true); assert.deepEqual(replay.orderIds, bound.orderIds);
    assert.equal(await count('sales_orders'), 2); assert.equal(await count('quote_center_quotes'), quotes);
    assert.equal((await plan()).plan!.defaultMonth, '2027-02');
    assert.equal((await plan()).plan!.lines[0].quantity, '100');
  });

  let assignmentId = '';
  await t.test('explicit Quote, delivery, scheduling and completion commands keep their own quantities', async () => {
    await f.adopt(orderId, true);
    await move({ action: 'move_months', orderId: secondOrderId, expectedVersion: 1, targetMonth: '2027-03', reason: 'Separate synthetic control order', selection: { mode: 'whole' } });
    const delivery = await readDeliveryPlanSet(f.pool, orderId);
    const updated = await updateDeliveryPlans(f.pool, actor, orderId, { requestId: randomUUID(), expectedVersion: delivery.version,
      upserts: [{ id: delivery.plans[0].id, deliveryDate: '2027-04-01', quantity: '100' }], voidIds: [] });
    assert.equal(updated.ownership, 'user_managed');
    assert.equal((await plan()).plan!.defaultMonth, '2027-02');
    const state = await readOrderProductionPlans(f.pool, actor, orderId);
    const intent = { action: 'create', orderId, assignmentId: null, expectedVersion: 0, expectedPlanVersion: state.order.planVersion,
      data: { executionType: 'internal', executorId: f.group.id, colorId, plannedQuantity: '100',
        duration: { mode: 'workdays', workdays: 2 }, dates: { mode: 'auto_queue', startDate: '2027-01-04' }, remark: 'Synthetic same-contract chain' } };
    const preview = await previewProductionPlan(f.pool, actor, intent);
    const saved = await executeProductionPlan(f.pool, actor, { requestId: randomUUID(), intent: preview.intent, previewHash: preview.previewHash });
    assert.equal(saved.status, 'applied'); if (saved.status !== 'applied') assert.fail();
    assignmentId = saved.assignments[0].id;
    await f.completion(orderId, assignmentId, '20');
    const current = (await plan()).plan!;
    await move({ action: 'match_executors', orderId, expectedVersion: current.version, reason: 'Explicit same-color executor',
      items: [{ lineId: current.lines[0].id, parts: [{ assignmentId, quantity: '100' }] }] });
    assert.equal((await readOrderProductionPlans(f.pool, actor, orderId)).executions[assignmentId].completedQuantity, '20');
    assert.equal(await count('server_closing_allocations'), 0);
  });

  let materialCalls = 0;
  const materialInput = (): SourceBundle => {
    const first = freshMaterialBundle(clock);
    const materials: SourceBundle['materials'] = {};
    for (const [index, contract] of contracts.entries()) {
      const pages = structuredClone(Object.values(first.materials)[0]);
      const insideOrderNo = String(input.discoveryBefore[0].rows[index].values.InsideOrderNo);
      for (const page of pages) {
        page.queryContext = { insideOrderNo };
        for (const row of page.rows) { row.values.ExpContractNo = contract; row.values.insideorderno = insideOrderNo; }
      }
      materials[contract] = pages;
    }
    return { schemaVersion: 'ainuoke-server-source.v1', discoveryBefore: structuredClone(input.discoveryBefore),
      discoveryAfter: structuredClone(input.discoveryAfter), materials };
  };
  const materialReader = createOrderMaterialReader(createPersistedMaterialPorts(f.pool, { sourceKey: source.sourceKey, maxAgeMs: 600000 }, now));
  await t.test('one persisted collection publishes all four material streams without advancing other ledgers', async () => {
    const before = await protectedState();
    const captured = await captureSource(f.pool, actor, { ...source, now, maxAgeMs: 600000, collect: async scope => {
      materialCalls++; assert.deepEqual([...scope].sort(), [...contracts].sort()); return materialInput();
    } });
    assert.equal(captured.orders, 2);
    const view = await materialReader(actor, { salesOrderId: orderId });
    assert.equal(view.status, 200); if (view.status !== 200) assert.fail();
    assert.equal(view.body.progress.sourceStatus, 'ready');
    for (const stream of ['purchases', 'inbounds', 'shipments', 'outbounds'] as const)
      assert.ok(view.body.progress.rows.some(row => row[stream].length > 0), stream);
    assert.deepEqual(await protectedState(), before);
  });

  const paymentReader = createPaymentSnapshotReader(f.pool, { sourceKey: source.sourceKey }, now);
  await t.test('6086941 publishes against the same two bound contracts; applications never become bank payments or closing entries', async () => {
    const selection = collectionSelection(); selection.sourceFingerprint = source.accountFingerprint;
    for (const [index, target] of selection.targets.entries()) target.salesContractNo = contracts[index];
    for (const id of bound.orderIds) await f.pool.query(`INSERT INTO ainuoke_payment_source_targets
      (source_key,sales_order_id,account_fingerprint,enabled,verification_sha256) VALUES($1,$2,$3,true,$4)`,
    [source.sourceKey, id, source.accountFingerprint, hash(['synthetic-proof', id])]);
    const request = { config, selection, targets: bound.orderIds.map((id, index) => ({ alias: 'S' + (index + 1), salesOrderId: id })) };
    const preview = await planPaymentCollection(f.pool, actor, request, now), before = await protectedState();
    let calls = 0;
    const result = await collectAndPublishPaymentContracts(f.pool, actor, request, preview.scopeHash, { now, collect: async (_config, selected) => {
      calls++; const frame = collectionEvidence(selected, clock + 10, 2); clock += 100; return frame;
    } });
    assert.equal(result.result, 'PAYMENT_COLLECTION_PUBLISHED'); assert.equal(result.published, 2); assert.equal(calls, 1);
    const observed = await paymentReader(actor, orderId);
    assert.equal(observed.sourceStatus, 'observed'); assert.equal(observed.rows.length, 2);
    assert.equal(observed.bankPaymentStatus, 'not_inferred');
    assert.deepEqual(await protectedState(), before);
    assert.equal(await count('server_closing_allocations'), 0);
  });

  const garmentReader = createGarmentShipmentReader(f.pool, { sourceKey: source.sourceKey }, now);
  await t.test('6086979 matches the same stable color; seven shipped is distinct from twenty completed and one hundred planned', async () => {
    const request = collectionRequest(orderId, contracts[0], clock, actor.username);
    assert.deepEqual(request.config, config);
    const target = { action: 'enable' as const, request, freshnessMs: 60000 };
    const permit = { requestId: randomUUID(), expiresAt: new Date(clock + 60000).toISOString() };
    const targetPlan = await planGarmentTarget(f.pool, actor, target, permit, now);
    const enabled = await applyGarmentTarget(f.pool, actor, target, { ...permit, scopeHash: targetPlan.scopeHash }, now);
    assert.equal(enabled.result?.enabled, true);
    const collectionPermit = { requestId: randomUUID(), expiresAt: new Date(clock + 60000).toISOString() };
    const preview = await planGarmentCollection(f.pool, actor, request, collectionPermit, clock), before = await protectedState();
    let calls = 0;
    const result = await collectGarmentOnce(f.pool, actor, request, { ...collectionPermit, scopeHash: preview.scopeHash }, { now,
      collect: async (_config, scope) => {
        calls++; clock += 100;
        return workerFrame(scope, clock, [sourceRow(contracts[0], { CnColor: '蓝色', Num: '7', outdate: '2027-01-10' })]);
      } });
    assert.equal(result.result?.outcome, 'published'); assert.equal(calls, 1);
    const view = await garmentReader.read(actor, orderId);
    assert.equal(view.sourceStatus, 'observed'); if (!('publicationId' in view)) assert.fail();
    assert.equal(view.rows[0].quantity.state, 'known');
    if (view.rows[0].quantity.state === 'known') assert.equal(view.rows[0].quantity.value, '7');
    assert.equal(view.rows[0].colorMatch.state, 'matched'); assert.equal(view.rows[0].colorMatch.orderColorId, colorId);
    assert.equal((await readOrderProductionPlans(f.pool, actor, orderId)).executions[assignmentId].completedQuantity, '20');
    assert.equal((await plan()).plan!.lines[0].quantity, '100');
    assert.deepEqual(await protectedState(), before);
  });

  let periodId = '';
  const detail = () => readClosingPeriodDetail(f.pool, actor, periodId, new URLSearchParams());
  await t.test('only explicit month adoption creates CNY sales and USD work snapshots; lock preserves the original order and quantities', async () => {
    periodId = (await f.apply({ action: 'create_period', month: '2027-02', taxRatePercent: '13', taxRateConfirmed: true, remark: 'Synthetic explicit month' })).result.periodId;
    const saved = await f.apply({ action: 'sync_month_outputs', periodId, expectedPeriodVersion: 1, channels: { sales: true, work: true }, reason: 'Explicitly adopt the month plan' });
    assert.equal((await f.request('/commands/' + saved.command.requestId)).response.status, 200);
    const current = await detail();
    assert.equal(current.summary.registeredQuantity, '100');
    assert.equal(current.summary.garmentSalesCny.amount?.decimal, '10000');
    assert.equal(current.summary.distributionLaborUsd.amount?.decimal, '250');
    assert.ok(current.items.length > 0); assert.ok(current.items.every(row => row.snapshot.order.id === orderId && row.snapshot.colorId === colorId));
    for (const action of ['confirm_period', 'lock_period'] as const)
      await f.apply({ action, periodId, expectedPeriodVersion: (await detail()).period.version, reason: 'Explicit synthetic transition' });
    assert.equal((await detail()).period.status, 'locked');
    assert.equal((await getSalesOrderById(f.pool, orderId))!.orderNo, initialOrder.orderNo);
  });

  await t.test('later contract quantity changes retain UUID, stable color, manual delivery, execution and locked finance; failed material refresh recovers separately', async () => {
    const frozen = await protectedState(), finance = (await detail()).items.map(row => row.snapshot);
    clock += 1000;
    const refreshed = structuredClone(input);
    for (const page of [...refreshed.discoveryBefore, ...refreshed.discoveryAfter, ...Object.values(refreshed.colors).flat()]) page.fetchedAt = new Date(clock).toISOString();
    refreshed.discoveryBefore[0].rows[0].values.Num = 120;
    refreshed.discoveryBefore[0].rows[0].values.DeliveryDate = '2027-05-01';
    refreshed.discoveryAfter = structuredClone(refreshed.discoveryBefore);
    refreshed.colors[contracts[0]][0].rows[0].values.SizeNum = 120;
    refreshed.colors[contracts[0]][0].rows[0].values.Size1 = 50;
    refreshed.colors[contracts[0]][0].rows[0].values.Size2 = 70;
    delete refreshed.colors[contracts[1]];
    const evidence = { ...refreshed, schemaVersion: 'ainuoke-order-addition.v1' }, scope = { ...source, salesOrderId: orderId };
    const preview = await previewBoundOrderRefresh(f.pool, actor, scope, evidence, clock);
    const applied = await applyBoundOrderRefresh(f.pool, actor, scope, evidence, { requestId: randomUUID(), expectedPreview: preview.previewHash }, clock);
    assert.equal(applied.result.salesOrderId, orderId); assert.equal(preview.incoming.quantity, '120');
    const updated = (await getSalesOrderById(f.pool, orderId))!;
    assert.equal(updated.orderNo, initialOrder.orderNo);
    assert.equal(updated.quantity, 120);
    const productionOrder = (await readOrderProductionPlans(f.pool, actor, orderId)).order;
    assert.equal(productionOrder.quantity, '120');
    assert.equal(productionOrder.colors[0].id, colorId); assert.equal(productionOrder.colors[0].quantity, '120');
    const after = await protectedState();
    // The source refresh increments only the order concurrency version; its
    // original identity/creation fields and all downstream execution bytes stay.
    const originalIdentity = (await rows('sales_orders')).map(row => {
      const value = { ...row.value }; delete value.version; delete value.updated_at; return value;
    });
    assert.deepEqual(originalIdentity, frozen[0].map(row => { const value = { ...row.value }; delete value.version; delete value.updated_at; return value; }));
    assert.deepEqual(after.slice(1), frozen.slice(1));
    assert.equal((await plan()).sourceChanged, true); assert.equal((await plan()).plan!.lines[0].quantity, '100');
    assert.deepEqual((await detail()).items.map(row => row.snapshot), finance);
    await assert.rejects(captureSource(f.pool, actor, { ...source, now, maxAgeMs: 600000, collect: async () => {
      materialCalls++; throw Error('synthetic transport failure');
    } }));
    const failed = await materialReader(actor, { salesOrderId: orderId });
    assert.equal(failed.status, 200); if (failed.status === 200) assert.equal(failed.body.progress.sourceStatus, 'source_failed');
    input.discoveryBefore = refreshed.discoveryBefore; input.discoveryAfter = refreshed.discoveryAfter;
    await captureSource(f.pool, actor, { ...source, now, maxAgeMs: 600000, collect: async () => { materialCalls++; return materialInput(); } });
    const recovered = await materialReader(actor, { salesOrderId: orderId });
    assert.equal(recovered.status, 200); if (recovered.status === 200) assert.equal(recovered.body.progress.sourceStatus, 'ready');
    assert.deepEqual((await detail()).items.map(row => row.snapshot), finance);
    assert.equal(await count('sales_orders'), 2); assert.equal(materialCalls, 3);
  });
  assert.deepEqual(f.errors, []);
});
