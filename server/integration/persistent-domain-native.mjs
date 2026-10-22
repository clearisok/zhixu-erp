// Serialized into `docker exec node` by the opt-in rehearsal. Imports below are
// the pinned image's original compiled services, never the checkout's TS code.
export async function persistentDomainNative(mode, input) {
  let pool, stage = 'scope';
  try {
    const { default: assert } = await import('node:assert/strict');
    const { randomUUID, createHash } = await import('node:crypto');
    const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
    assert.ok(['seed', 'read', 'continue'].includes(mode));
    assert.match(input.project, /^zhixu-quote-trial-(?:it|recovery)-[a-f0-9]{10}$/);
    assert.equal(process.env.ZHIXU_GIT_COMMIT, input.commit);
    assert.equal(process.env.DB_HOST, 'database'); assert.equal(process.env.DB_NAME, 'quote_trial');
    assert.equal(process.env.DB_USER, 'quote_trial'); assert.equal(process.env.DB_PORT, '5432');
    const { loadServerConfig } = await import('./dist/server/server/config.js');
    const { createDatabasePool } = await import('./dist/server/server/db/pool.js');
    pool = createDatabasePool({ connectionString: loadServerConfig().databaseUrl, max: 2, applicationName: 'synthetic-domain-rehearsal' });
    assert.deepEqual((await pool.query('SELECT current_database() AS db,current_user AS actor')).rows[0], { db: 'quote_trial', actor: 'quote_trial' });
    const { loadExistingBootstrapActor } = await import('./dist/server/server/sales-orders/bootstrap-runner.js');
    const actor = await loadExistingBootstrapActor(pool, 'local.admin');
    const { createAinuokeSalesOrder } = await import('./dist/server/server/sales-orders/service.js');
    const { readDeliveryPlanSet } = await import('./dist/server/server/sales-orders/delivery-plan-repository.js');
    const { updateDeliveryPlans, readDeliveryPlanRequestReceipt } = await import('./dist/server/server/sales-orders/delivery-plan-service.js');
    const { createQuoteRepository } = await import('./dist/server/server/quotes/repository.js');
    const { quoteSnapshotFromBrowser } = await import('./dist/server/server/quotes/model.js');
    const { readPricingColors } = await import('./dist/server/server/sales-orders/color-commercial.js');
    const { previewOrderBusinessSource, adoptOrderBusinessSource, readOrderBusinessSource } = await import('./dist/server/server/sales-orders/business-source-service.js');
    const { createProcessingBatch, previewProcessingBatch, confirmProcessingBatch, consumeProcessingBatches } = await import('./dist/server/server/sales-orders/processing-batch-service.js');
    const { executeProductionResourceCommand } = await import('./dist/server/server/production-resources/service.js');
    const { parseProductionResourceCommand } = await import('./dist/server/server/production-resources/contract.js');
    const plan = await import('./dist/server/server/production-scheduling/service.js');
    const execution = await import('./dist/server/server/production-scheduling/execution-service.js');
    const { captureSource } = await import('./dist/server/server/ainuoke-source/service.js');
    const { createPersistedMaterialPorts } = await import('./dist/server/server/ainuoke-source/reader.js');
    const { createOrderMaterialReader } = await import('./dist/server/features/ainuoke-material-progress/read-service.js');
    const payment = await import('./dist/server/server/ainuoke-source/payment-request-store.js');
    const garment = await import('./dist/server/server/ainuoke-source/garment-shipment-store.js');
    const repo = createQuoteRepository(pool);
    const sourceKey = 'synthetic-domain-recovery', fingerprint = 'a'.repeat(64);
    let saved = input.saved;
    async function createBatch(referenceOrderId = null) {
      const quote = saved.processingQuote, revision = quote.revisions.find(r => r.revisionId === quote.defaultRevisionId);
      const draft = await createProcessingBatch(pool, actor, { requestId: randomUUID(), quoteId: quote.id,
        revisionId: revision.revisionId, priceVersionId: revision.priceVersions[0].id, customerName: '合成恢复客户',
        businessStyleNo: 'SYN-RECOVERY-PROCESS', quantity: '10', orderDate: '2026-10-23', deliveryDate: '2027-01-12',
        customerReference: 'SYNTHETIC-RECOVERY', deliveryRequirements: '合成隔离恢复验证', referenceOrderId });
      const preview = await previewProcessingBatch(pool, actor, draft.batchId);
      const confirmed = await confirmProcessingBatch(pool, actor, draft.batchId, { requestId: randomUUID(),
        expectedVersion: draft.version, sourceFingerprint: preview.candidate.fingerprint });
      const command = { requestId: randomUUID(), items: [{ batchId: draft.batchId, expectedVersion: confirmed.version }] };
      const result = await consumeProcessingBatches(pool, actor, command);
      assert.equal(result.results[0].status, 'created');
      return { command, result, orderId: result.results[0].salesOrderId };
    }
    async function applyPlan(intent) {
      const preview = await plan.previewProductionPlan(pool, actor, intent);
      const command = { requestId: randomUUID(), intent: preview.intent, previewHash: preview.previewHash };
      const result = await plan.executeProductionPlan(pool, actor, command); assert.equal(result.status, 'applied');
      saved.planRequests.push(command.requestId); return result;
    }
    async function newAssignment(kind, executorId, colorId, quantity) {
      const order = await plan.readOrderProductionPlans(pool, actor, saved.orderId);
      const result = await applyPlan({ action: 'create', orderId: saved.orderId, assignmentId: null,
        expectedVersion: 0, expectedPlanVersion: order.order.planVersion, data: { executionType: kind, executorId, colorId,
          plannedQuantity: quantity, duration: { mode: 'workdays', workdays: 2 },
          dates: { mode: 'manual_fixed', startDate: '2027-01-04', endDate: '2027-01-06' }, remark: '合成恢复排单' } });
      assert.equal(result.assignments.length, 1); return result.assignments[0].id;
    }
    async function recordExecution(id, quantity, status) {
      const row = await plan.readProductionAssignment(pool, actor, id), order = await plan.readOrderProductionPlans(pool, actor, saved.orderId);
      const preview = await execution.previewProductionExecution(pool, actor, { action: 'record_execution', orderId: saved.orderId,
        assignmentId: id, expectedAssignmentVersion: row.assignment.version, expectedExecutionVersion: row.execution?.version ?? 0,
        expectedPlanVersion: order.order.planVersion, data: { status, completedQuantity: quantity,
          actualStartDate: '2027-01-04', actualCompletedDate: status === 'completed' ? '2027-01-05' : null },
        reason: '合成恢复实际完成', replan: null });
      const requestId = randomUUID(), result = await execution.executeProductionExecution(pool, actor,
        { requestId, intent: preview.intent, previewHash: preview.previewHash });
      assert.equal(result.status, 'applied'); saved.planRequests.push(requestId); return result;
    }
    async function checkedPasses(context, report) {
      // These are newly generated synthetic captures, not retimestamped evidence.
      const row = report === '6086979'
        ? { id: 'SYN-GARMENT-1', ExpContractNo: context.salesContractNo, billno: 'SYN-OUT-1', CnColor: '蓝色', QtyUnit: '件',
          Num: '25', outdate: '2026-10-11', FDate: '2026-10-07', indate: '2026-10-07', styleNum: '100', ycyNum: '10', UsableNum: '90' }
        : { id: 'SYN-PAY-1', BillNo: 'SYN-APP-1', ExpContractNo: context.salesContractNo, PurContractNo: 'SYN-PUR-1',
          CnName: '合成标签', Num: '6300', OutStoreNum: '6302', QtyUnit: '个', Price: '0.90', cgGoodsAmount: '5671.80',
          AdditionalPrice: '0', tzamount: '-80', PayAmount: '5591.80', YFAmount: '0', GoodsAmount: '5591.80' };
      const page = () => ({ schemaVersion: report === '6086979' ? 'ainuoke-garment-shipment-page.v1' : 'ainuoke-payment-observation-page.v2',
        reportId: report, sourceFingerprint: fingerprint, ...(report === '6086979' ? { queryContext: { match: 'exact', salesContractNo: context.salesContractNo } } : {}),
        capturedAt: new Date().toISOString(), page: 1, pageSize: 100, reportedTotal: 1, rawResponseSha256: hash([report, randomUUID()]), rows: [row] });
      const firstPass = [page()]; await new Promise(resolve => setTimeout(resolve, 2)); const secondPass = [page()];
      return { schemaVersion: report === '6086979' ? 'ainuoke-garment-shipment-input.v1' : 'ainuoke-payment-contract-snapshot-input.v1', firstPass, secondPass };
    }
    if (mode === 'seed') {
      stage = 'quotes';
      assert.equal((await pool.query('SELECT count(*)::int n FROM sales_orders')).rows[0].n, 0);
      saved = { processingQuote: input.quotes.processing, planRequests: [] };
      for (const quote of Object.values(input.quotes)) await repo.create(quoteSnapshotFromBrowser(quote));
      stage = 'contract';
      const currentTime = new Date().toISOString(), contract = input.syntheticOrder.salesContractNo;
      const made = await createAinuokeSalesOrder(pool, actor, { source: { sourceId: 'synthetic-1', sourceRowIdentity: 'synthetic-order',
        salesContractNo: contract, insideOrderNo: 'SYNTHETIC-IN-OLD', lifecycleStatusRaw: '生效', contractDate: '2026-10-01',
        contractDeliveryDate: '2027-01-10', styleNo: input.syntheticOrder.styleNo, companyNameSnapshot: '合成公司',
        customerNameSnapshot: '合成恢复客户', brandNameSnapshot: '合成品牌', quantity: 100, sourceHash: hash('synthetic-order'), fetchedAt: currentTime },
        colors: [{ sourceLineIdentity: 'synthetic-blue', colorName: '蓝色', quantity: 60, deliveryDate: '2027-01-10', sourceHash: hash('blue') },
          { sourceLineIdentity: 'synthetic-red', colorName: '红色', quantity: 40, deliveryDate: '2027-01-10', sourceHash: hash('red') }] });
      saved.orderId = made.salesOrder.id;
      stage = 'delivery';
      const initial = await readDeliveryPlanSet(pool, saved.orderId);
      saved.deliveryCommand = { requestId: randomUUID(), expectedVersion: initial.version,
        upserts: [{ id: null, deliveryDate: '2027-01-10', quantity: '60' }, { id: null, deliveryDate: '2027-01-20', quantity: '40' }],
        voidIds: initial.plans.filter(p => p.voidedAt === null).map(p => p.id) };
      const first = await updateDeliveryPlans(pool, actor, saved.orderId, saved.deliveryCommand);
      const manual = first.plans.filter(p => !p.isDerivedDefault && p.voidedAt === null);
      assert.equal(manual.length, 2);
      await updateDeliveryPlans(pool, actor, saved.orderId, { requestId: randomUUID(), expectedVersion: first.version,
        upserts: [{ id: manual[0].id, deliveryDate: '2027-01-11', quantity: manual[0].quantity }], voidIds: [manual[1].id] });
      stage = 'commercial';
      const quote = input.quotes.distribution, revision = quote.revisions.find(r => r.revisionId === quote.defaultRevisionId);
      const colors = await readPricingColors(pool, saved.orderId); assert.equal(colors.length, 2);
      saved.blueId = colors.find(c => c.colorName === '蓝色').id; saved.redId = colors.find(c => c.colorName === '红色').id;
      const selection = { kind: 'quote', quoteId: quote.id, revisionId: revision.revisionId,
        assignments: colors.map(c => ({ colorId: c.id, priceVersionId: revision.priceVersions[c.colorName === '蓝色' ? 0 : 1].id })) };
      const preview = await previewOrderBusinessSource(pool, actor, saved.orderId, selection);
      await adoptOrderBusinessSource(pool, actor, saved.orderId, { selection, requestId: randomUUID(), expectedVersion: preview.version,
        fingerprint: preview.fingerprint, reason: '合成颜色价格恢复验证' });
      // Existing CCT commands require a formal association. Create it only after
      // adoption, and prove that a later quote confirmation does not rewrite SO.
      const { updateConfirmedCommercialTermsByQuote } = await import('./dist/server/server/confirmed-commercial-terms/service.js');
      await updateConfirmedCommercialTermsByQuote(pool, actor, { quoteId: quote.id, revisionId: revision.revisionId, priceVersionId: revision.priceVersions[0].id },
        { expectedVersion: 0, expectedQuoteVersion: (await repo.getById(quote.id)).version,
          customerConfirmedPrice: '125', confirmedLaborPrice: '10', laborCurrency: 'CNY' });
      stage = 'processing'; saved.processing = await createBatch();
      stage = 'resources';
      const resource = async (kind, data) => {
        const result = await executeProductionResourceCommand(pool, actor, parseProductionResourceCommand({ requestId: randomUUID(),
          action: 'create', kind, resourceId: null, expectedVersion: 0, data: { name: '合成恢复-' + kind, enabled: true, remark: '', ...data } }));
        assert.equal(result.status, 'applied'); return result.resource;
      };
      const calendar = await resource('calendars', { workingWeekdays: [1, 2, 3, 4, 5], exceptions: [] });
      const site = await resource('sites', { countryCode: null, productionCalendarId: calendar.id, preProductionSampleLeadDays: 0 });
      const group = await resource('groups', { shortName: '合成组', productionSiteId: site.id, sortOrder: 1 });
      const factory = await resource('factories', { shortName: '合成厂', contactPerson: '', phone: '' });
      saved.groupId = group.id; saved.factoryId = factory.id;
      stage = 'production'; saved.originalAssignment = await newAssignment('internal', group.id, saved.blueId, '60');
      await recordExecution(saved.originalAssignment, '10', 'in_progress');
      await recordExecution(saved.originalAssignment, '25', 'completed');
      const row = await plan.readProductionAssignment(pool, actor, saved.originalAssignment), order = await plan.readOrderProductionPlans(pool, actor, saved.orderId);
      await applyPlan({ action: 'cancel', orderId: saved.orderId, assignmentId: saved.originalAssignment,
        expectedVersion: row.assignment.version, expectedPlanVersion: order.order.planVersion, reason: '合成取消剩余任务，保留原执行方25件' });
      saved.remainingAssignment = await newAssignment('internal', group.id, saved.blueId, '35');
      saved.outsourceAssignment = await newAssignment('outsource', factory.id, saved.redId, '40');
      stage = 'material';
      const bundle = input.materialBundle;
      for (const page of [...bundle.discoveryBefore, ...bundle.discoveryAfter, ...Object.values(bundle.materials).flat()]) page.fetchedAt = new Date().toISOString();
      await captureSource(pool, actor, { sourceKey, accountFingerprint: fingerprint, maxAgeMs: 86400000, collect: async () => bundle });
      stage = 'payment';
      await pool.query('INSERT INTO ainuoke_payment_source_targets(source_key,sales_order_id,account_fingerprint) VALUES($1,$2,$3)', [sourceKey, saved.orderId, fingerprint]);
      await pool.query('UPDATE ainuoke_payment_source_targets SET enabled=true,verification_sha256=$3,version=version+1 WHERE source_key=$1 AND sales_order_id=$2', [sourceKey, saved.orderId, hash('synthetic-filter-proof')]);
      const payContext = await payment.preparePaymentPublication(pool, actor, sourceKey, saved.orderId);
      saved.paymentPublication = await payment.publishPaymentSnapshot(pool, actor, payContext, await checkedPasses(payContext, '6086941'),
        { sourceFingerprint: fingerprint, salesContractNo: contract, witness: { id: 'SYN-PAY-1', BillNo: 'SYN-APP-1', PurContractNo: 'SYN-PUR-1' } });
      stage = 'garment';
      await pool.query('INSERT INTO ainuoke_garment_shipment_targets(source_key,sales_order_id,account_fingerprint,freshness_ms,enabled,verification_sha256) VALUES($1,$2,$3,60000,true,$4)', [sourceKey, saved.orderId, fingerprint, hash('synthetic-filter-proof')]);
      saved.garmentPublications = [];
      for (let generation = 0; generation < 2; generation++) {
        const context = await garment.prepareGarmentPublication(pool, actor, sourceKey, saved.orderId);
        saved.garmentPublications.push(await garment.publishGarmentObservation(pool, actor, context, await checkedPasses(context, '6086979'),
          { sourceFingerprint: fingerprint, salesContractNo: contract }));
      }
    }
    stage = 'business-read'; assert.ok(saved);
    const delivery = await readDeliveryPlanSet(pool, saved.orderId);
    const receipt = await readDeliveryPlanRequestReceipt(pool, actor, saved.orderId, saved.deliveryCommand);
    assert.equal(receipt.status, 'applied'); assert.notEqual(receipt.deliveryPlanSet.version, delivery.version);
    const commercial = await readOrderBusinessSource(pool, actor, saved.orderId);
    const assignments = await plan.readOrderProductionPlans(pool, actor, saved.orderId);
    const original = await plan.readProductionAssignment(pool, actor, saved.originalAssignment);
    const history = await execution.readProductionExecutionHistory(pool, actor, saved.originalAssignment);
    assert.equal(original.assignment.status, 'cancelled'); assert.equal(original.assignment.productionGroupId, saved.groupId);
    assert.equal(history.execution.completedQuantity, '25'); assert.equal(history.history.length, 2);
    assert.equal(assignments.assignments.length, 3); assert.equal(commercial.commercial.current.lines.length, 2);
    assert.equal(commercial.commercial.current.lines.find(line => line.colorId === saved.blueId).sale.value.price, '120');
    const requestReceipts = [];
    for (const id of saved.planRequests) { const result = await plan.readProductionPlanReceipt(pool, actor, id); assert.equal(result.state, 'known'); requestReceipts.push(result); }
    assert.deepEqual(await consumeProcessingBatches(pool, actor, saved.processing.command), saved.processing.result);
    const material = await createOrderMaterialReader(createPersistedMaterialPorts(pool, { sourceKey, maxAgeMs: 86400000 }))(actor, { salesOrderId: saved.orderId });
    assert.equal(material.status, 200); assert.equal(material.body.provenance, 'server_snapshot');
    assert.equal(material.body.progress.sourceStatus, 'ready');
    for (const stream of ['purchases', 'inbounds', 'shipments', 'outbounds']) assert.ok(material.body.progress.rows.some(row => row[stream].length));
    assert.ok(!JSON.stringify(material).includes('protected-commercial-sentinel'));
    const paymentRead = await payment.createPaymentSnapshotReader(pool, { sourceKey })(actor, saved.orderId);
    assert.ok(['observed', 'stale'].includes(paymentRead.sourceStatus));
    if (paymentRead.sourceStatus === 'observed') { assert.equal(paymentRead.snapshotId, saved.paymentPublication.snapshotId); assert.equal(paymentRead.rows.length, 1); }
    const garmentReader = garment.createGarmentShipmentReader(pool, { sourceKey });
    const garments = [];
    for (const publication of saved.garmentPublications) {
      const view = await garmentReader.read(actor, saved.orderId, publication.publicationId);
      assert.equal(view.rows.length, 1); assert.equal(view.rows[0].colorMatch.orderColorId, saved.blueId);
      const { evaluatedAt: _time, freshness: _freshness, ...stable } = view;
      void _time; void _freshness; garments.push(stable);
    }
    const proof = { delivery, receipt, commercial, assignments, original, history, requestReceipts,
      processing: saved.processing.result, material, garments, garmentHistory: await garmentReader.history(actor, saved.orderId) };
    // No invented clock: financial rows can legitimately be hidden after expiry.
    const sourceStatus = { payment: paymentRead.sourceStatus, paymentRows: paymentRead.rows.length,
      garment: (await garmentReader.read(actor, saved.orderId)).freshness };
    if (mode === 'continue') {
      stage = 'continued-commands';
      const next = await createBatch(saved.processing.orderId);
      assert.notEqual(next.orderId, saved.processing.orderId); assert.notEqual(next.orderId, saved.orderId);
      const continued = await recordExecution(saved.remainingAssignment, '5', 'in_progress');
      assert.equal(continued.execution.completedQuantity, '5');
      assert.equal((await execution.readProductionExecutionHistory(pool, actor, saved.originalAssignment)).execution.completedQuantity, '25');
      return { status: 'passed', proof, sourceStatus, continued: { newOrderId: next.orderId, originalOrderId: saved.orderId, originalCompleted: '25', newCompleted: '5' } };
    }
    return { status: 'passed', ...(mode === 'seed' ? { saved } : {}), proof, sourceStatus };
  } catch (error) {
    // No SQL, stack, input, account credentials or protected values in errors.
    return { status: 'failed', stage, code: /^[a-zA-Z0-9_]+$/.test(error?.code || '') ? error.code : 'synthetic_domain_failed' };
  } finally { if (pool) await pool.end(); }
}
