// Serialized into `docker exec node` by the opt-in rehearsal. Imports below are
// the pinned image's original compiled services, never the checkout's TS code.
export async function persistentDomainNative(mode, input, databaseGuard) {
  let pool, stage = 'scope';
  try {
    const { default: assert } = await import('node:assert/strict');
    const { randomUUID, createHash } = await import('node:crypto');
    const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
    assert.ok(['seed', 'read', 'continue'].includes(mode));
    assert.match(input.project, /^zhixu-quote-trial-(?:it|recovery)-[a-f0-9]{10}$/);
    databaseGuard(process.env, input.commit);
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
    const collection = await import('./dist/server/server/ainuoke-source/garment-collection-control.js');
    const targetControl = await import('./dist/server/server/ainuoke-source/garment-target-control.js');
    const { parseCollectorConfig, accountFingerprint, APPROVED_HTTP_ORIGIN, APPROVED_HTTP_POLICY } = await import('./dist/server/server/ainuoke-source/collector.js');
    const { hash: sourceHash } = await import('./dist/server/server/ainuoke-source/contract.js');
    const repo = createQuoteRepository(pool);
    const sourceKey = 'synthetic-domain-recovery', fingerprint = 'a'.repeat(64);
    // The fixed verifier requires its approved origin/policy. Credentials and
    // every counted worker below are synthetic; the harness first verifies that
    // this owned app has only an internal Docker network and no external route.
    const commandSourceKey = 'synthetic-garment-command-recovery';
    const commandConfig = parseCollectorConfig({ sourceKey: commandSourceKey, baseUrl: APPROVED_HTTP_ORIGIN, transportPolicy: APPROVED_HTTP_POLICY,
      username: 'synthetic-recovery-source', password: 'Synthetic-No-Transport', operatorUsername: 'local.admin' });
    const commandFingerprint = accountFingerprint(commandConfig);
    let saved = input.saved;
    const digest = value => createHash('sha256').update(value).digest('hex');
    const commandRow = contract => ({ id: 'SYN-COMMAND-ROW', billno: 'SYN-COMMAND-OUT', ExpContractNo: contract,
      CnColor: '蓝色', QtyUnit: '件', Num: '25', outdate: '2026-10-11' });
    const rawCommandPage = rows => JSON.stringify({ reObj: { isOk: true }, dataList: JSON.stringify({ rows, total: rows.length }),
      dataCount: rows.length, pageIndex: 1, pageSize: 100, reportObj: JSON.stringify({ reportId: 6086979, cellList: [] }) });
    function commandRequest(contract) {
      const now = Date.now(), positive = rawCommandPage([commandRow(contract)]);
      const selection = { schemaVersion: 'ainuoke-garment-filter-selection.v1', sourceFingerprint: commandFingerprint,
        candidateSha256: sourceHash('synthetic-recovery-candidate'), rawResponseSha256: digest(positive), toolingCommit: input.commit,
        salesContractNo: contract, witness: { id: 'SYN-COMMAND-ROW', billno: 'SYN-COMMAND-OUT' } };
      return { config: commandConfig, salesOrderId: saved.orderId, verification: { selection, checkedAt: new Date(now).toISOString(),
        evidence: { schemaVersion: 'ainuoke-garment-filter-evidence.v1', result: 'complete', code: null, workerStage: 'validation',
          selectionHash: sourceHash(selection), httpAttempts: 4, reportRequests: 3,
          pages: [positive, rawCommandPage([]), positive].map((text, i) => ({ sequence: i + 1, alias: i === 1 ? 'C0' : 'C1',
            capturedAt: new Date(now - 2 + i).toISOString(), rawReportResponse: text, rawResponseSha256: digest(text) })) } } };
    }
    async function syntheticCommandWorker(_config, scope) {
      // Actual capture times follow the service's prepared scope, without a forged clock.
      await new Promise(resolve => setTimeout(resolve, 25));
      const captures = [];
      for (let i = 0; i < 2; i++) {
        const text = rawCommandPage([commandRow(scope.salesContractNo)]);
        captures.push({ schemaVersion: 'ainuoke-garment-shipment-capture.v1', reportId: '6086979',
          sourceFingerprint: scope.sourceFingerprint, queryContext: { match: 'exact', salesContractNo: scope.salesContractNo },
          page: 1, pageSize: 100, capturedAt: new Date().toISOString(), rawResponseSha256: digest(text), rawReportResponse: text });
        await new Promise(resolve => setTimeout(resolve, 2));
      }
      return { schemaVersion: 'ainuoke-garment-collection-worker.v1', result: 'complete',
        counts: { httpAttempts: 3, reportRequests: 2 }, captures };
    }
    async function plannedCommand(request) {
      const preview = { requestId: randomUUID(), expiresAt: new Date(Date.now() + 600000).toISOString() };
      const result = await collection.planGarmentCollection(pool, actor, request, preview);
      return { request, permit: { ...preview, scopeHash: result.scopeHash }, databaseFingerprint: result.scope.databaseFingerprint };
    }
    async function commandHistory() {
      const jobs = saved.collectionJobs, receipts = [];
      assert.deepEqual(Object.keys(jobs).sort(), ['failed', 'published', 'started']);
      let replayCalls = 0;
      for (const key of ['published', 'failed', 'started']) {
        const job = jobs[key];
        const view = await collection.readGarmentCollectionReceipt(pool, actor,
          { sourceKey: commandSourceKey, salesOrderId: saved.orderId, requestId: job.permit.requestId });
        assert.equal(view.receiptState, key === 'started' ? 'unverified_started' : 'completed');
        assert.equal(view.result?.outcome ?? null, key === 'published' ? 'published' : key === 'failed' ? 'not_published' : null);
        assert.equal(view.sourceReadThisInvocation, 'none'); assert.equal(view.automaticRetry, false);
        const replay = await collection.collectGarmentOnce(pool, actor, job.request, job.permit,
          { collect: async () => { replayCalls++; throw Error('unexpected_synthetic_recollection'); } });
        assert.deepEqual(replay, view); receipts.push(view);
      }
      assert.equal(replayCalls, 0);
      assert.ok(!JSON.stringify(receipts).includes(commandConfig.password));
      return { receipts, replayCalls, realSourceRequests: 0 };
    }
    async function plannedTarget(request) {
      const preview = { requestId: randomUUID(), expiresAt: new Date(Date.now() + 600000).toISOString() };
      const result = await targetControl.planGarmentTarget(pool, actor, request, preview);
      return { request, permit: { ...preview, scopeHash: result.scopeHash }, databaseFingerprint: result.scope.databaseFingerprint };
    }
    async function applyTarget(job) {
      const receipt = await targetControl.applyGarmentTarget(pool, actor, job.request, job.permit);
      assert.equal(receipt.receiptState, 'completed'); assert.equal(receipt.result.sourceRead, 'none');
      return receipt;
    }
    async function currentCommandTarget() {
      return (await pool.query('SELECT enabled,version FROM ainuoke_garment_shipment_targets WHERE source_key=$1 AND sales_order_id=$2',
        [commandSourceKey, saved.orderId])).rows[0];
    }
    async function targetHistory() {
      const receipts = [];
      for (const [key, enabled, version] of [['enabled', true, 1], ['disabled', false, 2], ['reenabled', true, 3]]) {
        const job = saved.targetJobs[key];
        const receipt = await targetControl.readGarmentTargetReceipt(pool, actor,
          { sourceKey: commandSourceKey, salesOrderId: saved.orderId, requestId: job.permit.requestId });
        assert.equal(receipt.receiptState, 'completed'); assert.equal(receipt.result.enabled, enabled);
        assert.equal(receipt.result.version, version); assert.equal(receipt.receiptIsHistorical, true);
        assert.equal(receipt.sourceReadThisInvocation, 'none'); assert.equal(receipt.automaticRetry, false);
        receipts.push(receipt);
      }
      assert.ok(!JSON.stringify(receipts).includes(commandConfig.password));
      return { receipts, realSourceRequests: 0 };
    }
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
      saved.cctProvenance = { quoteId: quote.id, revisionId: revision.revisionId, priceVersionId: revision.priceVersions[0].id };
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
      await updateConfirmedCommercialTermsByQuote(pool, actor, saved.cctProvenance,
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
      stage = 'garment-command-published';
      await pool.query('INSERT INTO ainuoke_source_profiles(source_key,account_fingerprint) VALUES($1,$2)', [commandSourceKey, commandFingerprint]);
      const request = commandRequest(contract);
      stage = 'garment-target-commands'; saved.targetJobs = {};
      const enable = { action: 'enable', request, freshnessMs: 60000 };
      const disable = { action: 'disable', sourceKey: commandSourceKey, salesOrderId: saved.orderId, operatorUsername: 'local.admin' };
      const enabled = saved.targetJobs.enabled = await plannedTarget(enable);
      assert.equal((await applyTarget(enabled)).result.version, 1);
      const disabled = saved.targetJobs.disabled = await plannedTarget(disable);
      assert.equal((await applyTarget(disabled)).result.enabled, false);
      const replay = await applyTarget(enabled);
      assert.equal(replay.receiptIsHistorical, true); assert.equal(replay.result.enabled, true);
      assert.deepEqual(await currentCommandTarget(), { enabled: false, version: 2 });
      const reenabled = saved.targetJobs.reenabled = await plannedTarget(enable);
      assert.equal((await applyTarget(reenabled)).result.version, 3);
      stage = 'garment-command-published';
      saved.collectionJobs = {};
      let workerCalls = 0;
      const published = saved.collectionJobs.published = await plannedCommand(request);
      const firstReceipt = await collection.collectGarmentOnce(pool, actor, published.request, published.permit,
        { collect: async (...args) => { workerCalls++; return syntheticCommandWorker(...args); } });
      assert.equal(firstReceipt.receiptState, 'completed'); assert.equal(firstReceipt.result.outcome, 'published');
      saved.collectionPublicationId = firstReceipt.result.publicationId;
      stage = 'garment-command-failed';
      const failed = saved.collectionJobs.failed = await plannedCommand(request);
      const failedReceipt = await collection.collectGarmentOnce(pool, actor, failed.request, failed.permit,
        { collect: async () => { workerCalls++; throw Error('synthetic_worker_failure_before_any_transport'); } });
      assert.equal(failedReceipt.receiptState, 'completed'); assert.equal(failedReceipt.result.outcome, 'not_published');
      assert.equal(failedReceipt.result.requestCounts, 'unknown');
      stage = 'garment-command-claim-reply-loss';
      const started = saved.collectionJobs.started = await plannedCommand(request);
      let lost = false;
      // Execute the real claim COMMIT, then lose only its reply. No fabricated
      // command row or terminal outcome is inserted by the fixture.
      const claimReplyLoss = new Proxy(pool, { get(target, key) {
        if (key === 'connect') return async () => {
          const client = await target.connect(); let armed = false;
          return new Proxy(client, { get(connection, property) {
            if (property === 'query') return async (...args) => {
              const text = typeof args[0] === 'string' ? args[0] : args[0]?.text ?? '';
              const result = await connection.query(...args);
              if (text.includes('INSERT INTO ainuoke_garment_collection_commands')) armed = true;
              if (text.trim() === 'COMMIT' && armed && !lost) { lost = true; throw Error('synthetic_claim_reply_lost'); }
              return result;
            };
            const value = Reflect.get(connection, property, connection);
            return typeof value === 'function' ? value.bind(connection) : value;
          } });
        };
        const value = Reflect.get(target, key, target);
        return typeof value === 'function' ? value.bind(target) : value;
      } });
      const uncertain = await collection.collectGarmentOnce(claimReplyLoss, actor, started.request, started.permit,
        { collect: async () => { workerCalls++; throw Error('claim_loss_must_not_reach_worker'); } });
      assert.equal(lost, true); assert.equal(uncertain.receiptState, 'unverified_claim'); assert.equal(workerCalls, 2);
      assert.equal((await pool.query('SELECT count(*)::int n FROM ainuoke_garment_collection_commands WHERE source_key=$1', [commandSourceKey])).rows[0].n, 3);
      // The unconsumed preview is not permission to run against another DB.
      saved.unconsumedCollection = await plannedCommand(request);
      saved.unconsumedTarget = await plannedTarget(disable);
    }
    stage = 'business-read'; assert.ok(saved);
    const delivery = await readDeliveryPlanSet(pool, saved.orderId);
    const receipt = await readDeliveryPlanRequestReceipt(pool, actor, saved.orderId, saved.deliveryCommand);
    assert.equal(receipt.status, 'applied'); assert.notEqual(receipt.deliveryPlanSet.version, delivery.version);
    const commercial = await readOrderBusinessSource(pool, actor, saved.orderId);
    const { readConfirmedCommercialTermsByQuote } = await import('./dist/server/server/confirmed-commercial-terms/service.js');
    const cct = await readConfirmedCommercialTermsByQuote(pool, saved.cctProvenance); assert.equal(cct.current.customerConfirmedPrice, '125');
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
    stage = 'garment-command-history';
    const garmentCommands = await commandHistory();
    const garmentTargets = await targetHistory();
    const proof = { delivery, receipt, commercial, cct, assignments, original, history, requestReceipts,
      processing: saved.processing.result, material, garments, garmentHistory: await garmentReader.history(actor, saved.orderId), garmentCommands, garmentTargets };
    // No invented clock: financial rows can legitimately be hidden after expiry.
    const sourceStatus = { payment: paymentRead.sourceStatus, paymentRows: paymentRead.rows.length,
      garment: (await garmentReader.read(actor, saved.orderId)).freshness };
    if (mode === 'continue') {
      stage = 'continued-commands';
      const oldPreview = saved.unconsumedCollection;
      assert.ok(Date.parse(oldPreview.permit.expiresAt) > Date.now(), 'old_preview_expired_before_database_fence_test');
      const freshPreview = await plannedCommand(oldPreview.request);
      assert.notEqual(freshPreview.databaseFingerprint, oldPreview.databaseFingerprint);
      let collectedAfterRestore = 0;
      const collectAfterRestore = async (...args) => { collectedAfterRestore++; return syntheticCommandWorker(...args); };
      await assert.rejects(collection.collectGarmentOnce(pool, actor, oldPreview.request, oldPreview.permit,
        { collect: collectAfterRestore }), error => error.code === 'garment_collection_scope_changed');
      const oldPreviewWorkerCalls = collectedAfterRestore;
      assert.equal(oldPreviewWorkerCalls, 0);
      const continuedCollection = await collection.collectGarmentOnce(pool, actor, freshPreview.request, freshPreview.permit,
        { collect: collectAfterRestore });
      assert.equal(continuedCollection.receiptState, 'completed'); assert.equal(continuedCollection.result.outcome, 'published');
      assert.equal(collectedAfterRestore, 1); assert.notEqual(continuedCollection.result.publicationId, saved.collectionPublicationId);
      stage = 'continued-target-commands';
      const oldTarget = saved.unconsumedTarget;
      assert.ok(Date.parse(oldTarget.permit.expiresAt) > Date.now(), 'old_target_preview_expired_before_database_fence_test');
      const freshTarget = await plannedTarget(oldTarget.request);
      assert.notEqual(freshTarget.databaseFingerprint, oldTarget.databaseFingerprint);
      const beforeTarget = await currentCommandTarget();
      await assert.rejects(targetControl.applyGarmentTarget(pool, actor, oldTarget.request, oldTarget.permit),
        error => error.code === 'garment_target_scope_changed');
      assert.deepEqual(await currentCommandTarget(), beforeTarget);
      const disabledTarget = await applyTarget(freshTarget);
      assert.equal(disabledTarget.result.enabled, false); assert.equal(disabledTarget.result.version, 4);
      // A restored completed enable remains historical; replay cannot undo a later disable.
      const originalEnable = await applyTarget(saved.targetJobs.enabled);
      assert.equal(originalEnable.receiptIsHistorical, true); assert.equal(originalEnable.result.enabled, true);
      assert.deepEqual(await currentCommandTarget(), { enabled: false, version: 4 });
      assert.equal((await pool.query('SELECT count(*)::int n FROM ainuoke_garment_target_commands WHERE source_key=$1',
        [commandSourceKey])).rows[0].n, 4);
      stage = 'continued-production-commands';
      const next = await createBatch(saved.processing.orderId);
      assert.notEqual(next.orderId, saved.processing.orderId); assert.notEqual(next.orderId, saved.orderId);
      const continued = await recordExecution(saved.remainingAssignment, '5', 'in_progress');
      assert.equal(continued.execution.completedQuantity, '5');
      assert.equal((await execution.readProductionExecutionHistory(pool, actor, saved.originalAssignment)).execution.completedQuantity, '25');
      return { status: 'passed', proof, sourceStatus, continued: { newOrderId: next.orderId, originalOrderId: saved.orderId,
        originalCompleted: '25', newCompleted: '5', garmentCollection: { publicationId: continuedCollection.result.publicationId,
          oldPreviewWorkerCalls, freshPreviewWorkerCalls: collectedAfterRestore, realSourceRequests: 0 },
          garmentTarget: { receiptState: disabledTarget.receiptState, enabled: false, version: 4,
            oldPreviewWrote: false, originalEnableIsHistorical: true, realSourceRequests: 0 } } };
    }
    return { status: 'passed', ...(mode === 'seed' ? { saved } : {}), proof, sourceStatus };
  } catch (error) {
    // No SQL, stack, input, account credentials or protected values in errors.
    return { status: 'failed', stage, code: /^[a-zA-Z0-9_]+$/.test(error?.code || '') ? error.code : 'synthetic_domain_failed' };
  } finally { if (pool) await pool.end(); }
}
