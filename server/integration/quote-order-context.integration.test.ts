import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import type { Pool } from "pg";
import { startContinuousFixture } from "./ainuoke-continuous-fixture.js";
import { loadExistingBootstrapActor } from "../sales-orders/bootstrap-runner.js";
import { createQuoteCreationService } from "../quotes/creation-workflows.js";
import { createQuoteRepository } from "../quotes/repository.js";
import { readCreationOrderContext, type CreationOrderContext } from "../quotes/creation-order-context.js";
import { createSyntheticQuoteFixture } from "./quote-fixture.js";
import { quoteSnapshotFromBrowser } from "../quotes/model.js";
import { createProcessingBatch, previewProcessingBatch, confirmProcessingBatch, consumeProcessingBatches } from "../sales-orders/processing-batch-service.js";
import { previewColorSource, adoptColorSource } from "../sales-orders/color-commercial.js";
import { createSalesOrder } from "../sales-orders/repository.js";
import { previewOrderNormalization } from "../sales-orders/normalization-preview.js";

test("source-context Quote creation composes trusted defaults, immutable reference and existing receipt", { timeout: 180000 }, async t => {
  const x = await startContinuousFixture(resolve("dist/client")); t.after(x.close);
  const actor = await loadExistingBootstrapActor(x.pool, x.users[0]);
  const otherOrder = await createSalesOrder(x.pool, { creationSource: "manual" });
  const cookie = await x.login(x.users[0]);
  const service = createQuoteCreationService(x.pool);
  const call = async (path: string, body?: unknown, auth = cookie, method = "POST") => {
    const response = await fetch(x.base + "/api/v1/quotes/" + path, { method: body === undefined ? "GET" : method,
      headers: { cookie: auth, Origin: x.base, "X-Zhixu-Request": "1", "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, body: await response.json() };
  };
  const context = async (): Promise<CreationOrderContext> => {
    const response = await call("creation-order-context/" + x.orderId); assert.equal(response.status, 200); return response.body;
  };
  const selection = (value: CreationOrderContext) => ({ salesOrderId: value.snapshot.salesOrderId, fingerprint: value.fingerprint });
  const count = async () => (await x.pool.query("SELECT count(*)::int AS n FROM quote_center_quotes")).rows[0].n;
  const unaffected = async () => {
    const tables = (await x.pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' AND (table_name LIKE 'sales_order%' OR table_name LIKE 'ainuoke_%' OR table_name LIKE 'processing_%' OR table_name LIKE 'confirmed_commercial%') ORDER BY table_name")).rows;
    const result: Record<string, unknown> = {};
    for (const { table_name: name } of tables) result[name] = (await x.pool.query(`SELECT to_jsonb(t) row FROM "${name}" t ORDER BY to_jsonb(t)::text`)).rows;
    return result;
  };
  let createdId = "", createdRequestId = "";
  await t.test("context GET is read-only, exact-identity and contains no costs or guessed masters", async () => {
    const before = await unaffected(), n = await count();
    const read = await context();
    assert.equal(read.snapshot.salesOrderId, x.orderId); assert.equal(read.snapshot.quoteType, "distribution");
    assert.equal(read.snapshot.fields.quantity, "100"); assert.ok(read.snapshot.contract.salesContractNo);
    assert.ok(read.snapshot.evidence.savedAt); assert.equal(read.snapshot.businessType, "ainuoke_contract");
    assert.doesNotMatch(JSON.stringify(read), /unitPrice|laborCurrency|confirmedGarment|brandId|salespersonId|password/);
    assert.deepEqual(await unaffected(), before); assert.equal(await count(), n);
    assert.equal((await call("creation-order-context/" + randomUUID())).status, 404);
    assert.equal((await call("creation-order-context/NOT-AN-ORDER")).status, 400);
    const preview = await previewOrderNormalization(x.pool, actor, [x.orderId, otherOrder.id]);
    assert.deepEqual(preview.unknownReferences, []);
  });
  await t.test("contract type overrides incompatible default explicitly, while exact quantity, null date and source snapshot survive", async () => {
    await x.pool.query("INSERT INTO quote_global_settings(singleton_id,default_labor_currency,default_labor_description,default_quote_type) VALUES(1,'CNY','','processing') ON CONFLICT(singleton_id) DO UPDATE SET default_quote_type='processing',version=quote_global_settings.version+1");
    await x.pool.query("UPDATE ainuoke_sales_order_contract_mirrors SET quantity=9007199254740993.123456789,contract_delivery_date=NULL WHERE sales_order_id=$1", [x.orderId]);
    const read = await context(), before = await unaffected(), n = await count(), requestId = randomUUID();
    const beforeReference = await previewOrderNormalization(x.pool, actor, [x.orderId, otherOrder.id]);
    const body = { clientRequestId: requestId, orderContext: selection(read) };
    createdRequestId = requestId;
    const [a, b] = await Promise.all([call("creation-defaults", body), call("creation-defaults", body)]);
    assert.deepEqual([a.status, b.status].sort(), [200, 201]); assert.equal(a.body.result.quoteId, b.body.result.quoteId);
    createdId = a.body.result.quoteId;
    const record = (await createQuoteRepository(x.pool).getById(createdId))!;
    const revision = record.quote.revisions[0], pv = revision.priceVersions[0];
    assert.equal(revision.baseInfo.quoteType, "distribution"); assert.equal(revision.baseInfo.quoteStyleNo, read.snapshot.fields.styleNo);
    assert.equal(revision.baseInfo.brandId, ""); assert.equal(revision.baseInfo.salespersonId, "");
    assert.equal(revision.baseInfo.garmentLeadDate, null); assert.equal(pv.quantity, "9007199254740993.123456789");
    assert.equal(pv.pricingParameters.configuration?.sources.find(s => s.field === "quoteType")?.source, "explicit");
    assert.equal(pv.confirmation, null); assert.equal(await count(), n + 1);
    const origin = await call(createdId + "/creation-origin"); assert.equal(origin.status, 200); assert.deepEqual(origin.body.context, read);
    assert.deepEqual((await call("creation-receipts/" + requestId)).body.result, a.body.result);
    assert.deepEqual(await unaffected(), before, "no SO, plan, source, batch or CCT write");
    assert.equal((await x.pool.query("SELECT count(*)::int n FROM operation_logs WHERE quote_id=$1 AND action='创建报价'", [createdId])).rows[0].n, 1);
    assert.equal((await call("creation-defaults", { clientRequestId: requestId })).body.error.code, "idempotency_payload_mismatch");
    assert.equal((await call("creation-defaults", { ...body, orderContext: { ...body.orderContext, salesOrderId: randomUUID() } })).body.error.code, "idempotency_payload_mismatch");
    const afterReference = await previewOrderNormalization(x.pool, actor, [x.orderId, otherOrder.id]);
    assert.notEqual(afterReference.reviewHash, beforeReference.reviewHash, "Reference changes the hash while source quantity/date remain the same");
    await x.pool.query("UPDATE ainuoke_sales_order_contract_mirrors SET quantity=100 WHERE sales_order_id=$1", [x.orderId]);
  });
  await t.test("immutable creation references remain original-order inventory, not production execution", async () => {
    const before = await unaffected();
    const preview = await previewOrderNormalization(x.pool, actor, [x.orderId, otherOrder.id]);
    assert.deepEqual(preview.unknownReferences, []);
    const order = preview.orders.find(row => row.order.id === x.orderId)!;
    const reference = order.inventory.find(row => row.relation === "quote_creation_order_contexts")!;
    assert.equal(reference.column, "sales_order_id"); assert.equal(reference.count, "1");
    assert.deepEqual(reference.sampleIds, [createdId]);
    assert.deepEqual(order.evidence.execution, { coverage: "unavailable", count: null });
    assert.equal(preview.assessment.executionAuthorized, false); assert.deepEqual(await unaffected(), before);
  });
  await t.test("ordinary defaults keep their old behavior and do not create an origin row", async () => {
    const result = await call("creation-defaults", { clientRequestId: randomUUID() }); assert.equal(result.status, 201);
    const record = (await createQuoteRepository(x.pool).getById(result.body.result.quoteId))!;
    assert.equal(record.quote.revisions[0].baseInfo.quoteType, "processing");
    assert.deepEqual((await call(record.quote.id + "/creation-origin")).body, { context: null });
  });
  await t.test("immutable context is not replaced by source refresh, generic Quote PUT or SQL update/delete", async () => {
    const old = (await call(createdId + "/creation-origin")).body;
    await x.pool.query("UPDATE ainuoke_sales_order_contract_mirrors SET style_no='SYNTHETIC-CHANGED' WHERE sales_order_id=$1", [x.orderId]);
    assert.deepEqual((await call(createdId + "/creation-origin")).body, old);
    const record = (await createQuoteRepository(x.pool).getById(createdId))!;
    assert.equal((await call(createdId, { quote: { ...record.quote, creationOrigin: { salesOrderId: randomUUID() } }, expectedVersion: record.version }, cookie, "PUT")).status, 400);
    const result = await call(createdId, { quote: record.quote, expectedVersion: record.version }, cookie, "PUT"); assert.equal(result.status, 200);
    assert.deepEqual((await call(createdId + "/creation-origin")).body, old);
    await assert.rejects(x.pool.query("UPDATE quote_creation_order_contexts SET snapshot=snapshot WHERE quote_id=$1", [createdId]), /immutable/);
    await assert.rejects(x.pool.query("DELETE FROM quote_creation_order_contexts WHERE quote_id=$1", [createdId]), /immutable/);
  });
  await t.test("client fields, stale context, wrong stable contract and missing source cannot allocate a Quote", async () => {
    const read = await context(), before = await count();
    assert.equal((await call("creation-defaults", { clientRequestId: randomUUID(), orderContext: { ...selection(read), quoteType: "processing" } })).status, 400);
    await x.pool.query("UPDATE ainuoke_sales_order_contract_mirrors SET quantity=quantity+1 WHERE sales_order_id=$1", [x.orderId]);
    const rejectedId = randomUUID();
    assert.equal((await call("creation-defaults", { clientRequestId: rejectedId, orderContext: selection(read) })).body.error.code, "creation_order_context_changed");
    assert.deepEqual((await call("creation-receipts/" + rejectedId)).body, { state: "rejected", errorCode: "creation_order_context_changed", retryable: false });
    const client = await x.pool.connect();
    try {
      await client.query("BEGIN");
      const id = (await client.query("INSERT INTO sales_orders(creation_source) VALUES('ainuoke') RETURNING id::text")).rows[0].id;
      await assert.rejects(readCreationOrderContext(client, id), { code: "trusted_contract_required" });
      await client.query("INSERT INTO sales_order_source_links(sales_order_id,source_system,source_entity_type,external_id,sales_contract_no) VALUES($1,'ainuoke','sales_contract','SYN-CONTEXT-EXPECTED','SYN-CONTEXT-WRONG')", [id]);
      await client.query(`INSERT INTO ainuoke_sales_order_contract_mirrors(sales_order_id,source_id,source_row_identity,sales_contract_no,inside_order_no,quantity,source_hash,fetched_at)
        VALUES($1,'SYN-CONTEXT-WRONG','SYN-CONTEXT-WRONG','SYN-CONTEXT-WRONG','SYN-CONTEXT',100,'synthetic',now())`, [id]);
      await assert.rejects(readCreationOrderContext(client, id), { code: "trusted_contract_required" });
    } finally { await client.query("ROLLBACK"); client.release(); }
    await x.pool.query("UPDATE ainuoke_sales_order_contract_mirrors SET quantity=100 WHERE sales_order_id=$1", [x.orderId]);
    assert.equal(await count(), before);
  });
  await t.test("fresh lifecycle checks reject new creation while historical receipt remains readable", async () => {
    for (const state of ["completed", "cancelled"]) {
      const read = await context(), before = await count();
      await x.pool.query("UPDATE sales_orders SET lifecycle_state=$2,version=version+1 WHERE id=$1", [x.orderId, state]);
      assert.equal((await call("creation-defaults", { clientRequestId: randomUUID(), orderContext: selection(read) })).body.error.code, "creation_order_frozen");
      assert.equal((await call("creation-receipts/" + createdRequestId)).body.result.quoteId, createdId);
      assert.equal(await count(), before);
      await x.pool.query("UPDATE sales_orders SET lifecycle_state='draft',version=version+1 WHERE id=$1", [x.orderId]);
    }
  });
  await t.test("source changed after durable registration is rejected in the final transaction", async () => {
    const read = await context(), before = await count(), requestId = randomUUID();
    // The reviewed snapshot is already read. Drift is committed with registration
    // and can only be detected by the second transaction's fresh source read.
    await x.pool.query(`CREATE FUNCTION synthetic_context_drift() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF EXISTS(SELECT 1 FROM quote_creation_receipts WHERE preview_id=NEW.id AND client_request_id='${requestId}'::uuid) THEN UPDATE ainuoke_sales_order_contract_mirrors SET quantity=quantity+1 WHERE sales_order_id='${x.orderId}'::uuid; END IF; RETURN NEW; END; $$;
      CREATE TRIGGER synthetic_context_drift AFTER UPDATE OF reviewed ON quote_creation_previews FOR EACH ROW EXECUTE FUNCTION synthetic_context_drift()`);
    try {
      const response = await call("creation-defaults", { clientRequestId: requestId, orderContext: selection(read) });
      assert.equal(response.body.error.code, "creation_order_context_changed"); assert.equal(await count(), before);
      assert.equal((await call("creation-receipts/" + requestId)).body.state, "rejected");
    } finally {
      await x.pool.query("DROP TRIGGER synthetic_context_drift ON quote_creation_previews; DROP FUNCTION synthetic_context_drift(); UPDATE ainuoke_sales_order_contract_mirrors SET quantity=100");
    }
  });
  await t.test("source observation SHARE lock survives validation until transaction completion", async () => {
    const reader = await x.pool.connect(), writer = await x.pool.connect();
    let update: Promise<unknown> | undefined;
    try {
      await reader.query("BEGIN"); await readCreationOrderContext(reader, x.orderId);
      await writer.query("SET lock_timeout='5s'");
      const pid = (await writer.query("SELECT pg_backend_pid() pid")).rows[0].pid;
      let settled = false;
      update = writer.query("UPDATE ainuoke_sales_order_contract_mirrors SET quantity=101 WHERE sales_order_id=$1", [x.orderId]).finally(() => { settled = true; });
      const deadline = Date.now() + 3000;
      while (!(await x.pool.query("SELECT 1 FROM pg_stat_activity WHERE pid=$1 AND wait_event_type='Lock'", [pid])).rowCount) {
        if (settled || Date.now() > deadline) throw new Error("expected source row lock was not held");
        await new Promise(done => setTimeout(done, 10));
      }
      assert.equal(settled, false);
      await reader.query("COMMIT"); await update;
      assert.equal(settled, true);
    } finally {
      try { await reader.query("ROLLBACK"); await update; }
      finally { reader.release(); writer.release(); }
      await x.pool.query("UPDATE ainuoke_sales_order_contract_mirrors SET quantity=100 WHERE sales_order_id=$1", [x.orderId]);
    }
  });
  await t.test("context persistence failure rolls back Quote, numbering and audit; same token retains one creation", async () => {
    const read = await context(), requestId = randomUUID(), before = await count();
    const auditCount = async () => (await x.pool.query("SELECT count(*)::int n FROM operation_logs")).rows[0].n;
    const logs = await auditCount();
    await x.pool.query("CREATE FUNCTION synthetic_context_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic failure'; END $$; CREATE TRIGGER synthetic_context_failure BEFORE INSERT ON quote_creation_order_contexts FOR EACH ROW EXECUTE FUNCTION synthetic_context_failure()");
    try {
      assert.equal((await call("creation-defaults", { clientRequestId: requestId, orderContext: selection(read) })).status, 500);
      assert.equal(await count(), before); assert.equal(await auditCount(), logs);
      assert.equal((await call("creation-receipts/" + requestId)).body.state, "pending");
    } finally { await x.pool.query("DROP TRIGGER synthetic_context_failure ON quote_creation_order_contexts; DROP FUNCTION synthetic_context_failure()"); }
    assert.equal((await call("creation-defaults", { clientRequestId: requestId, orderContext: selection(read) })).status, 201);
    assert.equal(await count(), before + 1);
  });
  await t.test("real COMMIT followed by lost response recovers only the original receipt", async () => {
    let commits = 0;
    const intercepted = new Proxy(x.pool, { get(target, property) {
      if (property !== "connect") return Reflect.get(target, property, target);
      return async () => {
        const client = await target.connect();
        return new Proxy(client, { get(connection, key) {
          if (key !== "query") { const value = Reflect.get(connection, key, connection); return typeof value === "function" ? value.bind(connection) : value; }
          return async (...args: Parameters<typeof client.query>) => {
            const result = await client.query(...args);
            if (args[0] === "COMMIT" && ++commits === 2) throw new Error("synthetic committed receipt lost");
            return result;
          };
        } });
      };
    } }) as Pool;
    const read = await context(), requestId = randomUUID(), before = await count();
    await assert.rejects(createQuoteCreationService(intercepted).executeDefaults(actor, requestId, {}, selection(read)), /receipt lost/);
    const receipt = await service.receipt(actor, requestId); assert.equal(receipt.state, "committed"); assert.ok(receipt.result);
    assert.equal(await count(), before + 1);
    assert.equal((await service.executeDefaults(actor, requestId, {}, selection(read))).receipt.result?.quoteId, receipt.result.quoteId);
    assert.equal(await count(), before + 1);
  });
  await t.test("fresh grants, session revocation and actor-bound receipt never inherit stale supplied permissions", async () => {
    const read = await context(), before = await count();
    await x.pool.query("DELETE FROM app_role_permissions WHERE role_id='role-server-admin' AND permission_key='order.view'");
    try {
      await assert.rejects(service.executeDefaults(actor, randomUUID(), {}, selection(read)), { code: "permission_denied" });
      await assert.rejects(service.orderContext(actor, x.orderId), { code: "permission_denied" });
      await assert.rejects(service.origin(actor, createdId), { code: "permission_denied" });
    } finally { await x.pool.query("INSERT INTO app_role_permissions(role_id,permission_key) VALUES('role-server-admin','order.view')"); }
    assert.equal(await count(), before);
    assert.equal((await call("creation-order-context/" + x.orderId, undefined, "")).status, 401);
    const limited = await x.login(x.users[3]);
    assert.equal((await call("creation-order-context/" + x.orderId, undefined, limited)).status, 403);
    const limitedOrigin = await call(createdId + "/creation-origin", undefined, limited);
    assert.equal(limitedOrigin.status, 200, "quote.view + order.view can read the nonmonetary reference without create/cost grants");
    assert.doesNotMatch(JSON.stringify(limitedOrigin.body), /laborPrice|garmentPrice|pricingParameters/);
    const pending = await call("creation-receipts/" + randomUUID()); assert.deepEqual(pending.body, { state: "pending", retryable: false });
  });
  await t.test("an adopted contract and a consumed processing order cannot reopen source creation", async () => {
    const quote = createSyntheticQuoteFixture("source-context-adoption", "distribution");
    for (const r of quote.revisions) { r.imageAttachmentIds = []; r.fileAttachmentIds = []; r.styleImageAttachmentId = null; }
    const revision = quote.revisions.find(r => r.revisionId === quote.defaultRevisionId)!, pv = revision.priceVersions[0];
    pv.confirmation = { quotedGarmentPrice: 99, quotedLaborPrice: 10, confirmedGarmentPrice: 99, confirmedLaborPrice: 10, note: "synthetic", confirmedAt: "2026-10-20T00:00:00Z" };
    await createQuoteRepository(x.pool).create(quoteSnapshotFromBrowser(quote));
    const chosen = { kind: "quote", quoteId: quote.id, revisionId: revision.revisionId, priceVersionId: pv.id };
    const preview = await previewColorSource(x.pool, actor, x.orderId, chosen);
    await adoptColorSource(x.pool, actor, x.orderId, { selection: chosen, requestId: randomUUID(), expectedVersion: preview.version, fingerprint: preview.fingerprint, reason: "synthetic adoption" });
    assert.equal((await call("creation-order-context/" + x.orderId)).body.error.code, "creation_order_already_adopted");
    assert.equal((await call("creation-receipts/" + createdRequestId)).body.result.quoteId, createdId);
    const processing = createSyntheticQuoteFixture("source-context-processing", "processing");
    for (const r of processing.revisions) { r.imageAttachmentIds = []; r.fileAttachmentIds = []; r.styleImageAttachmentId = null; }
    const r = processing.revisions.find(v => v.revisionId === processing.defaultRevisionId)!, p = r.priceVersions[0];
    p.confirmation = { ...pv.confirmation, confirmedGarmentPrice: null };
    await createQuoteRepository(x.pool).create(quoteSnapshotFromBrowser(processing));
    const batch = await createProcessingBatch(x.pool, actor, { requestId: randomUUID(), quoteId: processing.id, revisionId: r.revisionId, priceVersionId: p.id, customerName: "Synthetic", businessStyleNo: "SYN-CONTEXT-PROCESS", quantity: "10", orderDate: "2026-10-20", deliveryDate: null, customerReference: "", deliveryRequirements: "", referenceOrderId: null });
    const candidate = await previewProcessingBatch(x.pool, actor, batch.batchId);
    const confirmed = await confirmProcessingBatch(x.pool, actor, batch.batchId, { requestId: randomUUID(), expectedVersion: batch.version, sourceFingerprint: candidate.candidate.fingerprint });
    const consumed = await consumeProcessingBatches(x.pool, actor, { requestId: randomUUID(), items: [{ batchId: batch.batchId, expectedVersion: confirmed.version }] });
    assert.equal(consumed.results[0].status, "created");
    assert.equal((await call("creation-order-context/" + consumed.results[0].salesOrderId)).body.error.code, "processing_order_source_fixed_by_batch");
  });
  assert.equal(x.materialReads(), 0); assert.equal(x.errors.length, 1, "only the deliberately injected context INSERT failure reaches the server logger");
  assert.equal((x.errors[0] as { event: string }).event, "unhandled_request_error");
});
