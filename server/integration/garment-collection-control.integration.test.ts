import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import pg, { type Pool, type PoolClient } from "pg";
import { startDisposablePostgres } from "./postgres-container.js";
import { runMigrations } from "../db/migration-runner.js";
import { synchronizePermissionCatalog } from "../auth/permissions.js";
import { bootstrapAdmin } from "../auth/bootstrap.js";
import { loadExistingBootstrapActor } from "../sales-orders/bootstrap-runner.js";
import { createAinuokeSalesOrder } from "../sales-orders/service.js";
import { replaceCurrentAinuokeColorSlice } from "../sales-orders/repository.js";
import type { TrustedIdentity } from "../auth/session.js";
import { normalizationReferences } from "../sales-orders/normalization-preview.js";
import { collectFullNormalizationEvidence } from "../sales-orders/normalization-full-evidence.js";
import { parseAttributionProposal } from "../sales-orders/normalization-execution-model.js";
import { hash } from "../ainuoke-source/contract.js";
import { accountFingerprint } from "../ainuoke-source/collector.js";
import { collectGarmentOnce, planGarmentCollection, readGarmentCollectionReceipt, garmentCollectionProof } from "../ainuoke-source/garment-collection-control.js";
import { createGarmentShipmentReader, prepareGarmentPublication, publishGarmentObservation } from "../ainuoke-source/garment-shipment-store.js";
import { validateGarmentCollectionResult } from "../ainuoke-source/garment-collection-worker.js";
import { collectionRequest, configFor, workerFrame } from "./garment-collection-fixture.js";

test("durable garment commands, one worker, atomic publication and original request recovery", { timeout: 240000 }, async t => {
  const db = await startDisposablePostgres(), pool = new pg.Pool({ connectionString: await db.createDatabase("garment_commands"), max: 12 });
  t.after(async () => { try { await pool.end(); } finally { await db.stop(); } });
  await runMigrations(pool, resolve("database/migrations")); await synchronizePermissionCatalog(pool);
  await bootstrapAdmin(pool, { username: "garment.collector", displayName: "合成成衣采集管理员", password: "synthetic-collector" });
  const admin = await loadExistingBootstrapActor(pool, "garment.collector");
  const sourceKey = configFor().sourceKey, fingerprint = accountFingerprint(configFor());
  await pool.query("INSERT INTO ainuoke_source_profiles(source_key,account_fingerprint) VALUES($1,$2)", [sourceKey, fingerprint]);
  let clock = Date.now(), n = 0, calls = 0;
  const reader = createGarmentShipmentReader(pool, { sourceKey }, () => clock);
  async function make(actor = admin) {
    const num = ++n; clock += 100;
    const contract = "SYN-GARMENT-" + num;
    const order = (await createAinuokeSalesOrder(pool, admin, { source: { sourceId: "SYN-G-" + num, sourceRowIdentity: "SYN-G-" + num,
      salesContractNo: contract, insideOrderNo: "SYN-FACTORY-" + num, lifecycleStatusRaw: "生效", contractDate: "2026-10-01",
      contractDeliveryDate: "2026-11-01", styleNo: "SYN-STYLE", companyNameSnapshot: "合成公司", customerNameSnapshot: "合成客户",
      brandNameSnapshot: "合成品牌", quantity: 100, sourceHash: hash(num), fetchedAt: new Date(clock).toISOString() },
      colors: [{ sourceLineIdentity: "BLUE-" + num, colorName: "合成蓝", quantity: 100, deliveryDate: "2026-11-01", sourceHash: hash([num, "blue"]) }] })).salesOrder;
    const request = collectionRequest(order.id, contract, clock, actor.username), proof = garmentCollectionProof(request, clock);
    await pool.query("INSERT INTO ainuoke_garment_shipment_targets(source_key,sales_order_id,account_fingerprint,enabled,verification_sha256,freshness_ms) VALUES($1,$2,$3,true,$4,60000)",
      [sourceKey, order.id, fingerprint, proof.verificationSha256]);
    const permitInput = { requestId: randomUUID(), expiresAt: new Date(clock + 60000).toISOString() };
    const plan = await planGarmentCollection(pool, actor, request, permitInput, clock);
    const permit = { ...permitInput, scopeHash: plan.scopeHash };
    return { actor, orderId: order.id, request, permit, plan };
  }
  type Job = Awaited<ReturnType<typeof make>>;
  async function replan(job: Job) {
    const input = { requestId: randomUUID(), expiresAt: new Date(clock + 60000).toISOString() };
    const plan = await planGarmentCollection(pool, job.actor, job.request, input, clock);
    return { ...job, plan, permit: { ...input, scopeHash: plan.scopeHash } };
  }
  const receipt = (job: Job, actor = job.actor) => readGarmentCollectionReceipt(pool, actor, { sourceKey, salesOrderId: job.orderId, requestId: job.permit.requestId });
  const row = async (job: Job) => (await pool.query("SELECT state,result,scope,publication_id::text FROM ainuoke_garment_collection_commands WHERE actor_id=$1 AND request_id=$2",
    [job.actor.internalUserId, job.permit.requestId])).rows[0];
  const count = async (table: string, job: Job) => (await pool.query(`SELECT count(*)::int n FROM ${table} WHERE sales_order_id=$1`, [job.orderId])).rows[0].n as number;
  const collector = (before?: () => Promise<void>) => async (_config: unknown, scope: { sourceFingerprint: string; salesContractNo: string }) => {
    calls++; await before?.(); clock += 100; return workerFrame(scope, clock);
  };
  const collect = (job: Job, before?: () => Promise<void>, targetPool = pool) => collectGarmentOnce(targetPool, job.actor, job.request, job.permit,
    { now: () => clock, collect: collector(before) });

  await t.test("plan is read-only; started commits before the only worker and no locks span IO", async () => {
    const job = await make(); assert.equal(await count("ainuoke_garment_collection_commands", job), 0);
    assert.equal(job.plan.authorization, "not_granted_by_plan");
    const startCalls = calls;
    const result = await collect(job, async () => {
      assert.equal((await row(job)).state, "started");
      const locks = (await pool.query("SELECT count(*)::int n FROM pg_locks WHERE locktype='advisory' AND database=(SELECT oid FROM pg_database WHERE datname=current_database()) AND granted")).rows[0].n;
      assert.equal(locks, 0);
    });
    assert.equal(calls, startCalls + 1); assert.equal(result.receiptState, "completed"); assert.equal(result.result?.outcome, "published");
    assert.equal((await row(job)).publication_id, result.result && "publicationId" in result.result ? result.result.publicationId : null);
    assert.equal(await count("ainuoke_garment_shipment_snapshots", job), 1);
    const view = await reader.read(admin, job.orderId); assert.ok("rows" in view && view.rows.length === 1);
    for (const secret of [job.request.config.password, job.request.config.username, job.request.verification.selection.salesContractNo, "合成蓝", "9007199254740993"])
      assert.equal(JSON.stringify(result).includes(secret), false);
  });
  await t.test("same actor and request concurrently returns started and never invokes a second worker", async () => {
    const job = await make(); let enter!: () => void, release!: () => void;
    const entered = new Promise<void>(done => { enter = done; }), blocked = new Promise<void>(done => { release = done; });
    const pending = collect(job, async () => { enter(); await blocked; }); await entered;
    const startCalls = calls, duplicate = await collect(job); assert.equal(duplicate.receiptState, "unverified_started"); assert.equal(calls, startCalls);
    release(); assert.equal((await pending).result?.outcome, "published");
    assert.equal((await collect(job)).receiptState, "completed"); assert.equal(calls, startCalls);
  });
  await t.test("expired original request remains historical after later target and head changes", async () => {
    const job = await make(), result = await collect(job), before = calls;
    await pool.query("UPDATE ainuoke_garment_shipment_targets SET enabled=false,version=version+1 WHERE source_key=$1 AND sales_order_id=$2", [sourceKey, job.orderId]);
    clock += 61000; const restored = await collect(job); assert.equal(restored.receiptState, "completed"); assert.deepEqual(restored.result, result.result);
    assert.equal(restored.sourceReadThisInvocation, "none"); assert.equal(calls, before);
    assert.deepEqual((await receipt(job)).result, result.result);
  });
  await t.test("a failed new command preserves the already published head and old observation bytes", async () => {
    const first = await make(), result = await collect(first); assert.equal(result.result?.outcome, "published");
    const oldRows = (await pool.query("SELECT to_jsonb(s)::text payload FROM ainuoke_garment_shipment_snapshots s WHERE sales_order_id=$1", [first.orderId])).rows;
    const next = await replan(first);
    const failed = await collectGarmentOnce(pool, next.actor, next.request, next.permit, { now: () => clock, collect: async () => { calls++; throw Error("synthetic unknown transport"); } });
    assert.equal(failed.result?.outcome, "not_published"); assert.equal(await count("ainuoke_garment_shipment_snapshots", first), 1);
    assert.deepEqual((await pool.query("SELECT to_jsonb(s)::text payload FROM ainuoke_garment_shipment_snapshots s WHERE sales_order_id=$1", [first.orderId])).rows, oldRows);
    const current = await reader.read(admin, first.orderId); assert.ok("publicationId" in current);
    assert.equal(current.publicationId, result.result && "publicationId" in result.result ? result.result.publicationId : null);
  });
  await t.test("same UUID cannot accept a different permit, actor or order intent", async () => {
    const job = await make(); await collect(job); const before = calls;
    await assert.rejects(() => collectGarmentOnce(pool, job.actor, job.request, { ...job.permit, expiresAt: new Date(clock + 50000).toISOString() }, { now: () => clock, collect: collector() }), { code: "garment_collection_request_conflict" });
    const other = await make(); await assert.rejects(() => collectGarmentOnce(pool, job.actor, other.request, job.permit, { now: () => clock, collect: collector() }), { code: "garment_collection_request_conflict" });
    assert.equal(calls, before);
  });
  await t.test("a stale plan or changed verification hash stops before started and before collection", async () => {
    for (const changed of ["version", "proof"] as const) {
      const job = await make(), before = calls;
      await pool.query(`UPDATE ainuoke_garment_shipment_targets SET version=version+1${changed === "proof" ? ",verification_sha256='" + "0".repeat(64) + "'" : ""} WHERE source_key=$1 AND sales_order_id=$2`, [sourceKey, job.orderId]);
      await assert.rejects(() => collect(job)); assert.equal(calls, before); assert.equal(await count("ainuoke_garment_collection_commands", job), 0);
    }
  });
  await t.test("a different configured database channel cannot consume the preview", async () => {
    const job = await make(), before = calls;
    const wrong = { options: { ...pool.options, connectionString: pool.options.connectionString!.replace("127.0.0.1", "localhost") }, connect: () => pool.connect() } as unknown as Pool;
    await assert.rejects(() => collect(job, undefined, wrong), { code: "garment_collection_scope_changed" });
    assert.equal(calls, before); assert.equal(await count("ainuoke_garment_collection_commands", job), 0);
  });
  function alteredPool(hook: (text: string, values: unknown[] | undefined, run: () => Promise<unknown>) => Promise<unknown>): Pool {
    return { options: pool.options, connect: async () => {
      const client = await pool.connect(), query = client.query.bind(client);
      return { query: (text: string, values?: unknown[]) => hook(text, values, () => query(text, values)), release: () => client.release() } as unknown as PoolClient;
    } } as unknown as Pool;
  }
  await t.test("COMMIT success followed by lost started response never invokes upstream", async () => {
    const job = await make(); let inserted = false, lost = false;
    const broken = alteredPool(async (text, _values, run) => { if (text.startsWith("INSERT INTO ainuoke_garment_collection_commands")) inserted = true;
      const value = await run(); if (text === "COMMIT" && inserted && !lost) { lost = true; throw Error("synthetic started acknowledgement lost"); } return value; });
    const before = calls, result = await collect(job, undefined, broken); assert.equal(result.receiptState, "unverified_claim"); assert.equal(calls, before);
    assert.equal((await receipt(job)).receiptState, "unverified_started"); await collect(job); assert.equal(calls, before);
  });
  await t.test("publication and terminal receipt survive real COMMIT acknowledgement loss as one result", async () => {
    const job = await make(); let terminal = false, lost = false;
    const broken = alteredPool(async (text, values, run) => { if (text.startsWith("UPDATE ainuoke_garment_collection_commands") && String(values?.[5]).includes('"published"')) terminal = true;
      const value = await run(); if (text === "COMMIT" && terminal && !lost) { lost = true; throw Error("synthetic publication acknowledgement lost"); } return value; });
    const result = await collect(job, undefined, broken); assert.equal(result.receiptState, "unverified_commit");
    assert.equal(await count("ainuoke_garment_shipment_snapshots", job), 1); const stored = await receipt(job); assert.equal(stored.receiptState, "completed");
    assert.equal(stored.result?.outcome, "published"); const before = calls; assert.deepEqual((await collect(job)).result, stored.result); assert.equal(calls, before);
  });
  await t.test("lost failure COMMIT returns failure reconciliation, never a rolled-back publication candidate", async () => {
    const job = await make(); let terminal = false, lost = false;
    const broken = alteredPool(async (text, _values, run) => { if (text.startsWith("UPDATE ainuoke_garment_collection_commands")) terminal = true;
      const value = await run(); if (text === "COMMIT" && terminal && !lost) { lost = true; throw Error("synthetic failure acknowledgement lost"); } return value; });
    const result = await collect(job, async () => { await pool.query("UPDATE ainuoke_garment_shipment_targets SET enabled=false,version=version+1 WHERE source_key=$1 AND sales_order_id=$2", [sourceKey, job.orderId]); }, broken);
    assert.equal(result.receiptState, "unverified_commit"); assert.equal(result.result?.outcome, "not_published");
    assert.equal((await receipt(job)).result?.outcome, "not_published"); assert.equal(await count("ainuoke_garment_shipment_snapshots", job), 0);
  });
  await t.test("terminal write failure rolls back head, colors, snapshot and audit together", async () => {
    const job = await make();
    await pool.query("CREATE FUNCTION synthetic_reject_garment_receipt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic terminal write failure'; END $$");
    await pool.query("CREATE TRIGGER synthetic_garment_receipt BEFORE UPDATE ON ainuoke_garment_collection_commands FOR EACH ROW EXECUTE FUNCTION synthetic_reject_garment_receipt()");
    try { const result = await collect(job); assert.equal(result.receiptState, "unverified_started"); assert.equal(await count("ainuoke_garment_shipment_snapshots", job), 0);
      assert.equal(await count("ainuoke_garment_shipment_heads", job), 0); assert.equal((await row(job)).state, "started"); }
    finally { await pool.query("DROP TRIGGER synthetic_garment_receipt ON ainuoke_garment_collection_commands"); await pool.query("DROP FUNCTION synthetic_reject_garment_receipt()"); }
    const before = calls; await collect(job); assert.equal(calls, before);
  });
  await t.test("audit failure rolls back a successful publication and its terminal receipt", async () => {
    const job = await make();
    await pool.query("CREATE FUNCTION synthetic_reject_collection_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.entity_id='" + job.permit.requestId + "' THEN RAISE EXCEPTION 'synthetic command audit failure'; END IF; RETURN NEW; END $$");
    await pool.query("CREATE TRIGGER synthetic_collection_audit BEFORE INSERT ON operation_logs FOR EACH ROW EXECUTE FUNCTION synthetic_reject_collection_audit()");
    try { const result = await collect(job); assert.equal(result.receiptState, "unverified_started"); assert.equal(await count("ainuoke_garment_shipment_snapshots", job), 0); }
    finally { await pool.query("DROP TRIGGER synthetic_collection_audit ON operation_logs"); await pool.query("DROP FUNCTION synthetic_reject_collection_audit()"); }
  });
  await t.test("target, profile, source color and order changes during IO preserve the old head", async () => {
    for (const change of ["target", "profile", "account", "color", "order"] as const) {
      const job = await make(); const result = await collect(job, async () => {
        if (change === "target") await pool.query("UPDATE ainuoke_garment_shipment_targets SET enabled=false,version=version+1 WHERE source_key=$1 AND sales_order_id=$2", [sourceKey, job.orderId]);
        if (change === "profile") await pool.query("UPDATE ainuoke_source_profiles SET enabled=false WHERE source_key=$1", [sourceKey]);
        if (change === "account") await pool.query("UPDATE ainuoke_source_profiles SET account_fingerprint=$2 WHERE source_key=$1", [sourceKey, "b".repeat(64)]);
        if (change === "color") await replaceCurrentAinuokeColorSlice(pool, job.orderId, [{ sourceLineIdentity: "RENAMED", colorName: "合成红", quantity: 100, deliveryDate: "2026-11-01", sourceHash: hash("renamed") }]);
        if (change === "order") await pool.query("UPDATE sales_orders SET version=version+1 WHERE id=$1", [job.orderId]);
      });
      assert.equal(result.result?.outcome, "not_published"); assert.equal(await count("ainuoke_garment_shipment_snapshots", job), 0);
      assert.equal(await count("ainuoke_garment_shipment_heads", job), 0);
      if (change === "profile") await pool.query("UPDATE ainuoke_source_profiles SET enabled=true WHERE source_key=$1", [sourceKey]);
      if (change === "account") await pool.query("UPDATE ainuoke_source_profiles SET account_fingerprint=$2 WHERE source_key=$1", [sourceKey, fingerprint]);
    }
  });
  await t.test("an independently advanced head defeats the old command CAS without replacing that publication", async () => {
    const job = await make(); let accepted = "";
    const result = await collect(job, async () => {
      const context = await prepareGarmentPublication(pool, admin, sourceKey, job.orderId, clock); clock += 100;
      const scope = { sourceFingerprint: fingerprint, salesContractNo: context.salesContractNo };
      const frame = validateGarmentCollectionResult(workerFrame(scope, clock), job.request.config, scope, clock);
      accepted = (await publishGarmentObservation(pool, admin, context, frame.input, scope, clock)).publicationId;
    });
    assert.equal(result.result?.outcome, "not_published"); assert.equal(await count("ainuoke_garment_shipment_snapshots", job), 1);
    const view = await reader.read(admin, job.orderId); assert.ok("publicationId" in view); assert.equal(view.publicationId, accepted);
  });
  await t.test("empty second observation is saved independently and does not delete prior rows or become cancellation", async () => {
    const original = await make(); await collect(original); const next = await replan(original);
    const result = await collectGarmentOnce(pool, next.actor, next.request, next.permit, { now: () => clock, collect: async (_config, scope) => {
      calls++; clock += 100; return workerFrame(scope, clock, []);
    } });
    assert.equal(result.result?.outcome, "published"); assert.equal(await count("ainuoke_garment_shipment_snapshots", next), 2);
    const view = await reader.read(admin, next.orderId); assert.equal(view.sourceStatus, "observed_empty");
    assert.ok("disappearanceMeaning" in view); assert.equal(view.disappearanceMeaning, "unknown_not_cancellation");
  });
  await t.test("malformed worker output and unknown failures are durable failures without fake zero counts", async () => {
    for (const mode of ["malformed", "unknown", "known"] as const) {
      const job = await make(); const result = await collectGarmentOnce(pool, job.actor, job.request, job.permit, { now: () => clock, collect: async () => {
        calls++; if (mode === "unknown") throw Error("PRIVATE-DO-NOT-REFLECT");
        if (mode === "known") return { schemaVersion: "ainuoke-garment-collection-worker.v1", result: "failed", code: "network_unavailable", counts: { httpAttempts: 2, reportRequests: 1 } };
        return { result: "complete", captures: [] };
      } });
      assert.equal(result.receiptState, "completed"); assert.equal(result.result?.outcome, "not_published");
      assert.deepEqual(result.result?.requestCounts, mode === "known" ? { httpAttempts: 2, reportRequests: 1 } : "unknown");
      assert.equal(JSON.stringify(result).includes("PRIVATE"), false); const before = calls; await collect(job); assert.equal(calls, before);
    }
  });
  await t.test("permission revocation during collection blocks publication and receipt reads remain freshly authorized", async () => {
    const role = "synthetic-garment-role", user = (await pool.query("INSERT INTO app_users(username,password_hash,display_name,role) VALUES('garment.revoked',crypt('synthetic',gen_salt('bf',4)),'合成撤权','viewer') RETURNING id::text,public_id::text")).rows[0];
    await pool.query("INSERT INTO app_roles(id,name) VALUES($1,$1)", [role]); await pool.query("INSERT INTO app_user_roles(user_id,role_id) VALUES($1,$2)", [user.id, role]);
    for (const permission of ["order.view", "ainuoke.view", "ainuoke.sync"]) await pool.query("INSERT INTO app_role_permissions(role_id,permission_key) VALUES($1,$2)", [role, permission]);
    const actor: TrustedIdentity = { internalUserId: user.id, userId: user.public_id, username: "garment.revoked", userName: "FORGED", permissions: [] };
    const job = await make(actor), result = await collect(job, async () => { await pool.query("DELETE FROM app_role_permissions WHERE role_id=$1 AND permission_key='ainuoke.sync'", [role]); });
    assert.equal(result.result?.outcome, "not_published"); assert.equal(await count("ainuoke_garment_shipment_snapshots", job), 0);
    await assert.rejects(() => receipt(job), { status: 403 }); await pool.query("INSERT INTO app_role_permissions(role_id,permission_key) VALUES($1,'ainuoke.sync')", [role]);
    assert.equal((await receipt(job)).receiptState, "completed");
  });
  await t.test("SQL command identity/history and complete normalization references are protected", async () => {
    const job = await make(); await collect(job);
    for (const statement of ["DELETE FROM ainuoke_garment_collection_commands", "UPDATE ainuoke_garment_collection_commands SET scope_hash=scope_hash",
      "UPDATE ainuoke_garment_collection_commands SET state='started',result=NULL,completed_at=NULL,publication_id=NULL"])
      await assert.rejects(() => pool.query(statement), (error: unknown) => (error as { code: string }).code === "23514");
    const client = await pool.connect(); try { const references = await normalizationReferences(client);
      assert.ok(references.some(([table, column]) => table === "ainuoke_garment_collection_commands" && column === "sales_order_id"));
      assert.ok(references.some(([table, column]) => table === "ainuoke_garment_collection_commands" && column === "source_owner_order_id"));
    } finally { client.release(); }
  });
  await t.test("damaged stored receipts fail closed rather than expose arbitrary fields or invoke a worker", async () => {
    const job = await make(); await collect(job); const original = (await row(job)).result, before = calls;
    await pool.query("ALTER TABLE ainuoke_garment_collection_commands DISABLE TRIGGER garment_collection_command_guard");
    try {
      await pool.query("UPDATE ainuoke_garment_collection_commands SET result=$3 WHERE actor_id=$1 AND request_id=$2", [job.actor.internalUserId, job.permit.requestId,
        JSON.stringify({ ...original, password: "SYNTHETIC-PRIVATE-CORRUPTION" })]);
      await assert.rejects(() => receipt(job), { code: "garment_collection_receipt_integrity_failed" });
      await assert.rejects(() => collect(job), { code: "garment_collection_receipt_integrity_failed" });
      assert.equal(calls, before);
    } finally {
      await pool.query("UPDATE ainuoke_garment_collection_commands SET result=$3 WHERE actor_id=$1 AND request_id=$2", [job.actor.internalUserId, job.permit.requestId, JSON.stringify(original)]);
      await pool.query("ALTER TABLE ainuoke_garment_collection_commands ENABLE TRIGGER garment_collection_command_guard");
    }
    assert.deepEqual((await receipt(job)).result, original);
  });
  await t.test("started and terminal command bytes participate in the full normalization fingerprint", async () => {
    const job = await make(), other = await make(), pair = [job.orderId, other.orderId].sort();
    const caseId = (await pool.query("INSERT INTO sales_order_normalization_cases(first_order_id,second_order_id,created_by,request_id,payload_hash) VALUES($1,$2,$3,$4,$5) RETURNING id",
      [...pair, admin.internalUserId, randomUUID(), hash("synthetic-collection-case")])).rows[0].id;
    await pool.query("INSERT INTO sales_order_normalization_case_events(case_id,version,actor_id,request_id,payload_hash,event_type,reason,evidence) VALUES($1,1,$2,$3,$4,'opened','synthetic collection reference','{}')",
      [caseId, admin.internalUserId, randomUUID(), hash("synthetic-collection-event")]);
    const proposal = parseAttributionProposal({ changeType: "normalize", caseVersion: 1, assignments: pair.map(id => ({ originalOrderId: id, effectiveOrderId: job.orderId })),
      reason: "Synthetic collection fingerprint", recoveryPlanHash: hash("synthetic-recovery") });
    const full = async () => { const client = await pool.connect(); try { await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      const value = await collectFullNormalizationEvidence(client, caseId, proposal, { coverage: "unavailable", reason: "synthetic-no-ledger" });
      await client.query("COMMIT"); return value; } finally { await client.query("ROLLBACK"); client.release(); } };
    const before = await full(); let startedHash = "";
    await collect(job, async () => { const started = await full(); assert.deepEqual(started.unknownReferences, []);
      startedHash = started.evidenceHash; assert.notEqual(startedHash, before.evidenceHash);
      assert.ok(started.references.filter(r => r.relation === "ainuoke_garment_collection_commands" && r.orderId === job.orderId).every(r => r.count === 1));
    });
    const completed = await full(); assert.notEqual(completed.evidenceHash, startedHash);
    assert.ok(completed.blockers.includes("production_finance_coverage_unavailable"));
  });
});
