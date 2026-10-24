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
import type { TrustedIdentity } from "../auth/session.js";
import { createAinuokeSalesOrder } from "../sales-orders/service.js";
import { createSalesOrder } from "../sales-orders/repository.js";
import { writeAttributionHeadInTransaction } from "../sales-orders/effective-attribution.js";
import { collectFullNormalizationEvidence } from "../sales-orders/normalization-full-evidence.js";
import { parseAttributionProposal } from "../sales-orders/normalization-execution-model.js";
import { hash } from "../ainuoke-source/contract.js";
import { accountFingerprint } from "../ainuoke-source/collector.js";
import { collectGarmentOnce, planGarmentCollection } from "../ainuoke-source/garment-collection-control.js";
import { createGarmentShipmentReader } from "../ainuoke-source/garment-shipment-store.js";
import { applyGarmentTarget, parseGarmentTargetRequest, planGarmentTarget, readGarmentTargetReceipt,
  type GarmentTargetRequest } from "../ainuoke-source/garment-target-control.js";
import { collectionRequest, configFor, workerFrame } from "./garment-collection-fixture.js";

test("garment target input requires a scoped proof and explicit policy; stopping needs neither", () => {
  const orderId = randomUUID(), request = collectionRequest(orderId, "SYN-PARSE-C1", Date.now());
  for (const freshnessMs of [undefined, 0, 999, 86400001, 1000.5, "60000", null])
    assert.throws(() => parseGarmentTargetRequest({ action: "enable", request, freshnessMs } as GarmentTargetRequest), { code: "garment_target_freshness_required" });
  assert.equal(parseGarmentTargetRequest({ action: "enable", request, freshnessMs: 1000 }).desired?.freshnessMs, 1000);
  assert.equal(parseGarmentTargetRequest({ action: "enable", request, freshnessMs: 86400000 }).desired?.freshnessMs, 86400000);
  const disable: GarmentTargetRequest = { action: "disable", sourceKey: request.config.sourceKey, salesOrderId: orderId.toUpperCase(), operatorUsername: request.config.operatorUsername };
  assert.equal(parseGarmentTargetRequest(disable).salesOrderId, orderId);
  for (const field of ["request", "freshnessMs", "verification", "password"])
    assert.throws(() => parseGarmentTargetRequest({ ...disable, [field]: "not-allowed" }), { code: "garment_target_invalid_request" });
  const wrong = structuredClone(request); wrong.verification.selection.salesContractNo = "SYN-OTHER";
  assert.throws(() => parseGarmentTargetRequest({ action: "enable", request: wrong, freshnessMs: 60000 }));
});

test("DB-only garment target lifecycle, historical receipts and original publication guards", { timeout: 180000 }, async t => {
  const db = await startDisposablePostgres(), pool = new pg.Pool({ connectionString: await db.createDatabase("garment_targets"), max: 12 });
  t.after(async () => { try { await pool.end(); } finally { await db.stop(); } });
  await runMigrations(pool, resolve("database/migrations")); await synchronizePermissionCatalog(pool);
  await bootstrapAdmin(pool, { username: "garment.collector", displayName: "合成成衣来源管理员", password: "synthetic-target-control" });
  const admin = await loadExistingBootstrapActor(pool, "garment.collector"), config = configFor(), sourceKey = config.sourceKey;
  await pool.query("INSERT INTO ainuoke_source_profiles(source_key,account_fingerprint) VALUES($1,$2)", [sourceKey, accountFingerprint(config)]);
  let n = 0, clock = Date.now(), workerCalls = 0;
  const now = () => clock;
  async function make() {
    const number = ++n; clock = Date.now(); const contract = "SYN-TARGET-" + number;
    const orderId = (await createAinuokeSalesOrder(pool, admin, { source: { sourceId: contract, sourceRowIdentity: contract, salesContractNo: contract,
      insideOrderNo: "SYN-FACTORY-" + number, lifecycleStatusRaw: "生效", contractDate: "2026-10-01", contractDeliveryDate: "2026-11-01",
      styleNo: "SYN-STYLE", companyNameSnapshot: "合成公司", customerNameSnapshot: "合成客户", brandNameSnapshot: "合成品牌",
      quantity: 100, sourceHash: hash(number), fetchedAt: new Date(clock).toISOString() },
      colors: [{ sourceLineIdentity: "SYN-BLUE-" + number, colorName: "合成蓝", quantity: 100, deliveryDate: "2026-11-01", sourceHash: hash([number, "blue"]) }] })).salesOrder.id;
    return { orderId, request: collectionRequest(orderId, contract, clock) };
  }
  type Job = Awaited<ReturnType<typeof make>>;
  const enable = (job: Job, freshnessMs = 60000, actor = admin): GarmentTargetRequest => ({ action: "enable",
    request: { ...job.request, config: { ...job.request.config, operatorUsername: actor.username } }, freshnessMs });
  const disable = (job: Job, actor = admin): GarmentTargetRequest => ({ action: "disable", sourceKey, salesOrderId: job.orderId, operatorUsername: actor.username });
  async function planned(input: GarmentTargetRequest, actor = admin) {
    const preview = { requestId: randomUUID(), expiresAt: new Date(clock + 540000).toISOString() };
    const plan = await planGarmentTarget(pool, actor, input, preview, now);
    return { input, actor, plan, permit: { ...preview, scopeHash: plan.scopeHash } };
  }
  type Command = Awaited<ReturnType<typeof planned>>;
  const apply = (command: Command, targetPool = pool) => applyGarmentTarget(targetPool, command.actor, command.input, command.permit, now);
  const target = async (job: Job) => (await pool.query("SELECT account_fingerprint,enabled,verification_sha256,freshness_ms,version FROM ainuoke_garment_shipment_targets WHERE source_key=$1 AND sales_order_id=$2", [sourceKey, job.orderId])).rows[0];
  const receipt = (command: Command, job: Job, actor = command.actor) => readGarmentTargetReceipt(pool, actor, { sourceKey, salesOrderId: job.orderId, requestId: command.permit.requestId });
  const counts = async () => (await pool.query(`SELECT (SELECT count(*)::int FROM ainuoke_garment_target_commands) commands,
    (SELECT count(*)::int FROM operation_logs WHERE entity_type='AinuokeGarmentTarget') logs,
    (SELECT count(*)::int FROM ainuoke_garment_shipment_snapshots) snapshots`)).rows[0];
  function alteredPool(hook: (text: string, values: unknown[] | undefined, run: () => Promise<unknown>) => Promise<unknown>): Pool {
    return { options: pool.options, connect: async () => {
      const client = await pool.connect(), query = client.query.bind(client);
      return { query: (text: string, values?: unknown[]) => hook(text, values, () => query(text, values)), release: () => client.release() } as unknown as PoolClient;
    } } as unknown as Pool;
  }
  async function currentActor(username: string) {
    const row = (await pool.query("INSERT INTO app_users(username,password_hash,display_name,role) VALUES($1,crypt('synthetic',gen_salt('bf',4)),$1,'viewer') RETURNING id::text,public_id::text", [username])).rows[0];
    const role = "synthetic-" + username;
    await pool.query("INSERT INTO app_roles(id,name) VALUES($1,$1)", [role]);
    await pool.query("INSERT INTO app_user_roles(user_id,role_id) VALUES($1,$2)", [row.id, role]);
    for (const key of ["order.view", "ainuoke.view", "ainuoke.sync", "ainuoke.bind"])
      await pool.query("INSERT INTO app_role_permissions(role_id,permission_key) VALUES($1,$2)", [role, key]);
    return { actor: { internalUserId: row.id, userId: row.public_id, username, userName: username, permissions: [] } as TrustedIdentity, role };
  }
  async function untilBlocked(pid: number) {
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline) {
      if ((await pool.query("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE $1::int=ANY(pg_blocking_pids(pid))) blocked", [pid])).rows[0].blocked) return;
      await new Promise(done => setTimeout(done, 25));
    }
    assert.fail("synthetic command did not reach the expected real database lock");
  }
  const other = await currentActor("garment.target.other");

  await t.test("coerced or empty filter proofs cannot create a target, audit or command", async () => {
    const job = await make(), before = await counts();
    for (const patch of [
      { result: ["complete"], workerStage: "not-started", httpAttempts: 0, reportRequests: 0, pages: [] },
      { result: [["complete"]], workerStage: "not-started", httpAttempts: 0, reportRequests: 0, pages: [] },
      { result: "complete", workerStage: "not-started", httpAttempts: 0, reportRequests: 0, pages: [] },
      { workerStage: ["validation"] },
    ]) {
      const input = structuredClone(enable(job)) as Extract<GarmentTargetRequest, { action: "enable" }>;
      Object.assign(input.request.verification.evidence as Record<string, unknown>, patch);
      await assert.rejects(() => planned(input));
      await assert.rejects(() => applyGarmentTarget(pool, admin, input, {
        requestId: randomUUID(), scopeHash: "0".repeat(64), expiresAt: new Date(clock + 540000).toISOString(),
      }, now));
      assert.equal(await target(job), undefined);
      assert.deepEqual(await counts(), before);
    }
  });
  await t.test("historical receipts need fresh grants but never current source-chain reads", async () => {
    const current = await currentActor("garment.target.receipt"), job = await make();
    const command = await planned(enable(job, 60000, current.actor), current.actor), original = await apply(command);
    const independent = alteredPool(async (text, _values, run) => {
      assert.equal(/\bainuoke_source_profiles\b|\bainuoke_garment_shipment_targets\b|\bainuoke_garment_shipment_heads\b|\bainuoke_sales_order_contract_mirrors\b|\bainuoke_sales_order_color_mirrors\b|\bsales_order_source_links\b/iu.test(text), false);
      return run();
    });
    const read = () => readGarmentTargetReceipt(independent, current.actor, {
      sourceKey, salesOrderId: job.orderId, requestId: command.permit.requestId,
    });
    assert.deepEqual((await read()).result, original.result);
    await pool.query("DELETE FROM app_role_permissions WHERE role_id=$1 AND permission_key='ainuoke.bind'", [current.role]);
    try { await assert.rejects(read, { code: "permission_denied" }); }
    finally { await pool.query("INSERT INTO app_role_permissions(role_id,permission_key) VALUES($1,'ainuoke.bind')", [current.role]); }
  });
  await t.test("preview is read only; enable creates one target, audit and immutable receipt", async () => {
    const job = await make(), before = await counts(), command = await planned(enable(job));
    assert.deepEqual(await counts(), before); assert.equal(await target(job), undefined); assert.equal(command.plan.humanApproval, "still_required");
    const result = await apply(command); assert.equal(result.receiptState, "completed"); assert.equal(result.result?.changed, true);
    assert.equal((await target(job)).version, 1); assert.equal((await target(job)).enabled, true);
    assert.deepEqual(await counts(), { ...before, commands: before.commands + 1, logs: before.logs + 1 });
    assert.deepEqual((await receipt(command, job)).result, result.result);
    for (const secret of [config.password, config.username, job.request.verification.selection.salesContractNo, "合成蓝"])
      assert.equal(JSON.stringify(result).includes(secret), false);
    await assert.rejects(() => pool.query("UPDATE ainuoke_garment_target_commands SET result=result WHERE request_id=$1", [command.permit.requestId]), { code: "23514" });
    await assert.rejects(() => pool.query("DELETE FROM ainuoke_garment_target_commands WHERE request_id=$1", [command.permit.requestId]), { code: "23514" });
  });
  await t.test("identical current policy is a no-op and original enable replay never reverses a later disable", async () => {
    const job = await make(), original = await planned(enable(job)); await apply(original);
    const same = await planned(enable(job)); assert.equal((await apply(same)).result?.changed, false); assert.equal((await target(job)).version, 1);
    const stop = await planned(disable(job)); await apply(stop); assert.equal((await target(job)).version, 2);
    clock = Date.parse(original.permit.expiresAt) + 1;
    const replay = await apply(original); assert.equal(replay.receiptState, "completed"); assert.ok("replayed" in replay && replay.replayed);
    assert.equal(replay.result?.enabled, true); assert.equal((await target(job)).enabled, false); assert.equal((await target(job)).version, 2);
    assert.equal((await receipt(original, job)).result?.enabled, true);
  });
  await t.test("a nonexistent target can be stopped without creating one or requiring a source profile", async () => {
    const job = await make(), input = { ...disable(job), sourceKey: "synthetic-absent-profile" } as GarmentTargetRequest;
    const command = await planned(input), result = await apply(command);
    assert.equal(result.result?.changed, false); assert.equal(result.result?.version, 0); assert.equal(await target(job), undefined);
    assert.equal((await pool.query("SELECT count(*)::int n FROM ainuoke_garment_shipment_targets WHERE sales_order_id=$1", [job.orderId])).rows[0].n, 0);
  });
  await t.test("disabled profile, unavailable binding reader and missing colors do not prevent stopping a known target", async () => {
    const job = await make(); await apply(await planned(enable(job)));
    await pool.query("UPDATE ainuoke_source_profiles SET enabled=false WHERE source_key=$1", [sourceKey]);
    try {
      await pool.query("DELETE FROM ainuoke_sales_order_color_mirrors WHERE sales_order_id=$1", [job.orderId]);
      const unavailable = alteredPool(async (text, _values, run) => {
        assert.equal(/\bainuoke_sales_order_contract_mirrors\b|\bainuoke_source_profiles\b|\bFROM\s+ainuoke_garment_shipment_heads\b/iu.test(text), false);
        return run();
      });
      const input = disable(job), permit = { requestId: randomUUID(), expiresAt: new Date(clock + 540000).toISOString() };
      const plan = await planGarmentTarget(unavailable, admin, input, permit, now);
      assert.equal(plan.scope.profile, null); assert.equal(plan.scope.binding, null);
      const stopped = await applyGarmentTarget(unavailable, admin, input, { ...permit, scopeHash: plan.scopeHash }, now);
      assert.equal(stopped.result?.enabled, false); assert.equal((await target(job)).enabled, false);
    } finally { await pool.query("UPDATE ainuoke_source_profiles SET enabled=true WHERE source_key=$1", [sourceKey]); }
  });
  await t.test("target, order, database and operator changes defeat the exact preview", async () => {
    for (const change of ["target", "order", "database", "operator"] as const) {
      const job = await make(); await apply(await planned(enable(job))); const command = await planned(enable(job, 120000));
      const before = await counts();
      if (change === "target") await pool.query("UPDATE ainuoke_garment_shipment_targets SET enabled=false,version=version+1 WHERE sales_order_id=$1", [job.orderId]);
      if (change === "order") await pool.query("UPDATE sales_orders SET version=version+1 WHERE id=$1", [job.orderId]);
      const targetPool = change === "database" ? { options: { ...pool.options, connectionString: pool.options.connectionString!.replace("127.0.0.1", "localhost") }, connect: () => pool.connect() } as unknown as Pool : pool;
      if (change === "operator") command.actor = other.actor;
      await assert.rejects(() => apply(command, targetPool), { code: change === "operator" ? "garment_target_operator_mismatch" : "garment_target_scope_changed" });
      assert.deepEqual(await counts(), before);
    }
  });
  await t.test("profile mismatch and proof for another contract cannot enable or replace target identity", async () => {
    const job = await make(), before = await counts();
    const wrong = { ...job, request: collectionRequest(job.orderId, "SYN-WRONG-CONTRACT", clock) };
    await assert.rejects(() => planned(enable(wrong)), { code: "garment_target_binding_mismatch" });
    await pool.query("UPDATE ainuoke_source_profiles SET account_fingerprint=$2 WHERE source_key=$1", [sourceKey, "b".repeat(64)]);
    try { await assert.rejects(() => planned(enable(job)), { code: "garment_target_profile_mismatch" }); }
    finally { await pool.query("UPDATE ainuoke_source_profiles SET account_fingerprint=$2 WHERE source_key=$1", [sourceKey, accountFingerprint(config)]); }
    assert.deepEqual(await counts(), before); assert.equal(await target(job), undefined);
  });
  await t.test("same actor and UUID is consumed once; different actors cannot consume the same target CAS", async () => {
    const job = await make(), command = await planned(enable(job)), before = await counts();
    const same = await Promise.all([apply(command), apply(command)]);
    assert.equal(same.filter(value => "replayed" in value && value.replayed).length, 1);
    assert.equal((await counts()).commands, before.commands + 1); assert.equal((await target(job)).version, 1);
    const another = await make(), first = await planned(enable(another)), second = await planned(enable(another, 60000, other.actor), other.actor);
    const competing = await Promise.allSettled([apply(first), apply(second)]);
    assert.equal(competing.filter(value => value.status === "fulfilled").length, 1);
    const rejected = competing.find(value => value.status === "rejected"); assert.ok(rejected && rejected.status === "rejected");
    assert.equal(rejected.reason.code, "garment_target_scope_changed"); assert.equal((await target(another)).version, 1);
  });
  await t.test("two actors may use the same UUID on different orders without joining audit groups", async () => {
    const firstJob = await make(), secondJob = await make(), shared = { requestId: randomUUID(), expiresAt: new Date(clock + 540000).toISOString() };
    const firstInput = enable(firstJob), secondInput = enable(secondJob, 60000, other.actor);
    const firstPlan = await planGarmentTarget(pool, admin, firstInput, shared, now), secondPlan = await planGarmentTarget(pool, other.actor, secondInput, shared, now);
    const results = await Promise.all([
      applyGarmentTarget(pool, admin, firstInput, { ...shared, scopeHash: firstPlan.scopeHash }, now),
      applyGarmentTarget(pool, other.actor, secondInput, { ...shared, scopeHash: secondPlan.scopeHash }, now),
    ]);
    assert.ok(results.every(result => result.receiptState === "completed"));
    const receipts = (await pool.query("SELECT actor_id::text,sales_order_id::text FROM ainuoke_garment_target_commands WHERE request_id=$1 ORDER BY actor_id", [shared.requestId])).rows;
    assert.equal(receipts.length, 2); assert.equal(new Set(receipts.map(row => row.actor_id)).size, 2);
    const audits = (await pool.query("SELECT operation_id,actor_user_id::text,entity_id FROM operation_logs WHERE entity_type='AinuokeGarmentTarget' AND metadata->>'requestId'=$1", [shared.requestId])).rows;
    assert.equal(audits.length, 2); assert.equal(new Set(audits.map(row => row.operation_id)).size, 2);
    for (const audit of audits) assert.equal((await pool.query("SELECT count(*)::int n FROM operation_logs WHERE operation_id=$1", [audit.operation_id])).rows[0].n, 1);
    assert.deepEqual(new Set(audits.map(row => row.entity_id)), new Set([firstJob.orderId, secondJob.orderId]));
  });
  await t.test("revocation committed while the command waits is enforced with fresh database grants", async () => {
    const current = await currentActor("garment.target.revoke"), job = await make(), command = await planned(enable(job, 60000, current.actor), current.actor);
    const blocker = await pool.connect(); let pending: ReturnType<typeof apply> | undefined;
    try {
      await blocker.query("BEGIN"); const pid = (await blocker.query("SELECT pg_backend_pid() pid")).rows[0].pid;
      await blocker.query("SELECT id FROM app_users WHERE id=$1 FOR UPDATE", [current.actor.internalUserId]);
      pending = apply(command); const checked = assert.rejects(pending, { code: "permission_denied" }); await untilBlocked(pid);
      await blocker.query("DELETE FROM app_role_permissions WHERE role_id=$1 AND permission_key='ainuoke.bind'", [current.role]);
      await blocker.query("COMMIT"); await checked; assert.equal(await target(job), undefined);
    } finally { await blocker.query("ROLLBACK"); blocker.release(); await pending?.catch(() => undefined); }
  });
  await t.test("real publication-lock waiting cannot extend a permit past its expiry", async () => {
    const job = await make(), command = await planned(enable(job)), blocker = await pool.connect(); let pending: ReturnType<typeof apply> | undefined;
    const key = "garment-publication:" + sourceKey + ":" + job.orderId;
    try {
      const pid = (await blocker.query("SELECT pg_backend_pid() pid")).rows[0].pid;
      await blocker.query("SELECT pg_advisory_lock(hashtextextended($1,0))", [key]);
      pending = apply(command); const checked = assert.rejects(pending, { code: "garment_target_permit_expired" }); await untilBlocked(pid);
      clock = Date.parse(command.permit.expiresAt) + 1;
      await blocker.query("SELECT pg_advisory_unlock(hashtextextended($1,0))", [key]); await checked; assert.equal(await target(job), undefined);
    } finally { await blocker.query("SELECT pg_advisory_unlock_all()"); blocker.release(); await pending?.catch(() => undefined); }
  });
  await t.test("audit or receipt failure rolls back the complete target change", async () => {
    for (const relation of ["operation_logs", "ainuoke_garment_target_commands"] as const) {
      const job = await make(), command = await planned(enable(job)), before = await counts();
      await pool.query("CREATE FUNCTION synthetic_reject_target_write() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic target write failure'; END $$");
      await pool.query("CREATE TRIGGER synthetic_target_write BEFORE INSERT ON " + relation + " FOR EACH ROW EXECUTE FUNCTION synthetic_reject_target_write()");
      try { await assert.rejects(() => apply(command)); assert.equal(await target(job), undefined); assert.deepEqual(await counts(), before); }
      finally { await pool.query("DROP TRIGGER synthetic_target_write ON " + relation); await pool.query("DROP FUNCTION synthetic_reject_target_write()"); }
    }
  });
  await t.test("actual COMMIT acknowledgement loss returns only unverified; original receipt confirms exact history", async () => {
    const job = await make(), command = await planned(enable(job)); let inserted = false, lost = false;
    const broken = alteredPool(async (text, _values, run) => {
      if (text.startsWith("INSERT INTO ainuoke_garment_target_commands")) inserted = true;
      const value = await run(); if (text === "COMMIT" && inserted && !lost) { lost = true; throw Error("synthetic acknowledgement lost"); } return value;
    });
    const result = await apply(command, broken); assert.equal(result.receiptState, "unverified_commit"); assert.equal(result.result, null);
    assert.equal((await target(job)).enabled, true); const original = await receipt(command, job); assert.equal(original.receiptState, "completed");
    await apply(await planned(disable(job))); await apply(command); assert.equal((await target(job)).enabled, false);
    await assert.rejects(() => readGarmentTargetReceipt(pool, admin, { sourceKey, salesOrderId: randomUUID(), requestId: command.permit.requestId }), { code: "garment_target_request_conflict" });
    assert.equal((await receipt(command, job, other.actor)).receiptState, "unknown");
    const changed = { ...command, input: enable(job, 120000) }; await assert.rejects(() => apply(changed), { code: "garment_target_request_conflict" });
  });
  await t.test("stop then re-enable invalidates old collection scope; historical observation policy stays frozen", async () => {
    const job = await make(); await apply(await planned(enable(job)));
    const permit = { requestId: randomUUID(), expiresAt: new Date(clock + 540000).toISOString() };
    const plan = await planGarmentCollection(pool, admin, job.request, permit, clock);
    const result = await collectGarmentOnce(pool, admin, job.request, { ...permit, scopeHash: plan.scopeHash }, { now, collect: async (_config, scope) => {
      workerCalls++; clock += 100;
      await apply(await planned(disable(job))); await apply(await planned(enable(job)));
      return workerFrame(scope, clock);
    } });
    assert.equal(result.result?.outcome, "not_published");
    const nextPermit = { requestId: randomUUID(), expiresAt: new Date(clock + 540000).toISOString() };
    const next = await planGarmentCollection(pool, admin, job.request, nextPermit, clock);
    await collectGarmentOnce(pool, admin, job.request, { ...nextPermit, scopeHash: next.scopeHash }, { now, collect: async (_config, scope) => {
      workerCalls++; clock += 100; return workerFrame(scope, clock);
    } });
    const reader = createGarmentShipmentReader(pool, { sourceKey }, now), before = await reader.read(admin, job.orderId);
    assert.ok("expiresAt" in before); await apply(await planned(enable(job, 120000)));
    const after = await reader.read(admin, job.orderId); assert.ok("expiresAt" in after);
    assert.equal(after.expiresAt, before.expiresAt); assert.equal(after.targetPolicyChanged, true); assert.equal(workerCalls, 2);
  });
  await t.test("historical physical aliases can still be stopped; new enable cannot target an alias", async () => {
    const job = await make(); await apply(await planned(enable(job)));
    // A synthetic historical manual SO, not a new public creation path. Two
    // distinct trusted contracts must remain impossible to normalize together.
    const primary = (await createSalesOrder(pool, { creationSource: "manual" })).id;
    const pair = [job.orderId, primary].sort(), mapping = await pool.connect();
    try {
      await mapping.query("BEGIN"); await mapping.query("SELECT lock_order_attribution_write_guard()");
      const caseId = (await mapping.query("INSERT INTO sales_order_normalization_cases(first_order_id,second_order_id,created_by,request_id,payload_hash) VALUES($1,$2,$3,$4,$5) RETURNING id", [...pair, admin.internalUserId, randomUUID(), hash("synthetic-target-alias")])).rows[0].id;
      await mapping.query("INSERT INTO sales_order_normalization_case_events(case_id,version,actor_id,request_id,payload_hash,event_type,reason,evidence) VALUES($1,1,$2,$3,$4,'opened','synthetic target alias','{}')", [caseId, admin.internalUserId, randomUUID(), hash("synthetic-target-alias-event")]);
      const changeId = (await mapping.query("INSERT INTO sales_order_attribution_changes(case_id,case_version,change_type,actor_id,request_id,payload_hash,evidence_hash,evidence_basis,reason) VALUES($1,1,'normalize',$2,$3,$4,$4,'{}','synthetic target alias') RETURNING id", [caseId, admin.internalUserId, randomUUID(), hash("synthetic-target-change")])).rows[0].id;
      for (const id of pair) await mapping.query("INSERT INTO sales_order_attribution_members(change_id,sales_order_id,effective_order_id,previous_change_id,previous_version) VALUES($1,$2,$3,NULL,0)", [changeId, id, primary]);
      for (const id of pair) await writeAttributionHeadInTransaction(mapping, changeId, id);
      await mapping.query("COMMIT");
    } finally { await mapping.query("ROLLBACK"); mapping.release(); }
    assert.equal((await apply(await planned(disable(job)))).result?.enabled, false);
    await assert.rejects(() => planned(enable(job)), { code: "garment_target_order_unavailable" });
  });
  await t.test("new receipt references and all row bytes participate in full normalization evidence", async () => {
    const job = await make(), otherJob = await make(), pair = [job.orderId, otherJob.orderId].sort();
    const caseId = (await pool.query("INSERT INTO sales_order_normalization_cases(first_order_id,second_order_id,created_by,request_id,payload_hash) VALUES($1,$2,$3,$4,$5) RETURNING id", [...pair, admin.internalUserId, randomUUID(), hash("synthetic-target-case")])).rows[0].id;
    await pool.query("INSERT INTO sales_order_normalization_case_events(case_id,version,actor_id,request_id,payload_hash,event_type,reason,evidence) VALUES($1,1,$2,$3,$4,'opened','synthetic target reference','{}')", [caseId, admin.internalUserId, randomUUID(), hash("synthetic-target-event")]);
    const proposal = parseAttributionProposal({ changeType: "normalize", caseVersion: 1, assignments: pair.map(id => ({ originalOrderId: id, effectiveOrderId: job.orderId })), reason: "Synthetic target fingerprint", recoveryPlanHash: hash("synthetic-recovery") });
    const full = async () => { const client = await pool.connect(); try { await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      return await collectFullNormalizationEvidence(client, caseId, proposal, { coverage: "unavailable", reason: "synthetic-no-ledger" });
    } finally { await client.query("ROLLBACK"); client.release(); } };
    const before = await full(); const command = await planned(enable(job)); await apply(command); const after = await full();
    assert.deepEqual(after.unknownReferences, []); assert.notEqual(after.evidenceHash, before.evidenceHash);
    const commandReferences = after.references.filter(ref => ref.relation === "ainuoke_garment_target_commands" && ref.orderId === job.orderId);
    assert.equal(commandReferences.length, 2);
    assert.deepEqual(commandReferences.map(ref => ref.column).sort(), ["sales_order_id", "source_owner_order_id"]);
    assert.ok(commandReferences.every(ref => ref.count === 1));
    assert.ok(after.blockers.includes("production_finance_coverage_unavailable"));
    const original = await receipt(command, job);
    await pool.query("ALTER TABLE ainuoke_garment_target_commands DISABLE TRIGGER garment_target_command_guard");
    try {
      await pool.query("UPDATE ainuoke_garment_target_commands SET result=result||'{\"version\":999}'::jsonb WHERE request_id=$1", [command.permit.requestId]);
      await assert.rejects(() => receipt(command, job), { code: "garment_target_receipt_integrity_failed" });
      await pool.query("UPDATE ainuoke_garment_target_commands SET result=$2 WHERE request_id=$1", [command.permit.requestId, JSON.stringify(original.result)]);
    } finally { await pool.query("ALTER TABLE ainuoke_garment_target_commands ENABLE TRIGGER garment_target_command_guard"); }
  });
});
