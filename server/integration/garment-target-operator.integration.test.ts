import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync, unlinkSync, rmdirSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import pg, { type PoolClient } from "pg";
import { startDisposablePostgres } from "./postgres-container.js";
import { runMigrations } from "../db/migration-runner.js";
import { synchronizePermissionCatalog } from "../auth/permissions.js";
import { bootstrapAdmin } from "../auth/bootstrap.js";
import { loadExistingBootstrapActor } from "../sales-orders/bootstrap-runner.js";
import { createAinuokeSalesOrder } from "../sales-orders/service.js";
import { hash } from "../ainuoke-source/contract.js";
import { accountFingerprint } from "../ainuoke-source/collector.js";
import { validateGarmentFilterEvidence } from "../ainuoke-source/garment-filter-evidence.js";
import { garmentOperatorArguments, runGarmentOperator, garmentOperatorExitCode } from "../ainuoke-source/garment-operator-cli.js";
import { collectionRequest, configFor, workerFrame } from "./garment-collection-fixture.js";
import { paymentPrivateFixture } from "./payment-operator-private-fixture.js";

test("one protected operator owns separate target and collection commands without implicit source activation", { timeout: 300000 }, async t => {
  const db = await startDisposablePostgres(), databaseUrl = await db.createDatabase("garment_target_operator");
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 8 }), files = paymentPrivateFixture();
  t.after(async () => { try { files.close(); await pool.end(); } finally { await db.stop(); } });
  await runMigrations(pool, resolve("database/migrations")); await synchronizePermissionCatalog(pool);
  await bootstrapAdmin(pool, { username: "garment.collector", displayName: "合成目标操作员", password: "synthetic-password" });
  const actor = await loadExistingBootstrapActor(pool, "garment.collector"), config = configFor();
  await pool.query("INSERT INTO ainuoke_source_profiles(source_key,account_fingerprint) VALUES($1,$2)", [config.sourceKey, accountFingerprint(config)]);
  const toolingCommit = "a".repeat(40); let n = 0, clock = Date.now(), calls = 0;
  const now = () => clock;
  async function make() {
    const num = ++n; clock = Date.now(); const contract = "SYN-TARGET-OPERATOR-" + num;
    const orderId = (await createAinuokeSalesOrder(pool, actor, { source: { sourceId: contract, sourceRowIdentity: contract,
      salesContractNo: contract, insideOrderNo: "SYN-FACTORY-" + num, lifecycleStatusRaw: "生效", contractDate: "2026-10-01",
      contractDeliveryDate: "2026-11-01", styleNo: "SYN-STYLE", companyNameSnapshot: "合成公司", customerNameSnapshot: "合成客户",
      brandNameSnapshot: "合成品牌", quantity: 100, sourceHash: hash(num), fetchedAt: new Date(clock).toISOString() },
      colors: [{ sourceLineIdentity: "SYN-BLUE-" + num, colorName: "合成蓝", quantity: 100, deliveryDate: "2026-11-01", sourceHash: hash([num, "blue"]) }] })).salesOrder.id;
    const request = collectionRequest(orderId, contract, clock);
    const proof = files.write("proof-" + num + ".json", JSON.stringify({ ...validateGarmentFilterEvidence(request.verification.evidence,
      request.config, request.verification.selection, clock).privateReport, toolingCommit: "d".repeat(40) }));
    const { password, operatorUsername, ...source } = request.config;
    const key = files.write("key-" + num + ".txt", "账号：" + config.username + "\n密码：" + password + "\n");
    const intent = { schemaVersion: "ainuoke-garment-operator-job.v1", databaseUrl, operatorUsername, source, salesOrderId: orderId, verification: proof };
    const job = files.write("job-" + num + ".json", JSON.stringify(intent));
    return { orderId, request, proof, key, intent, job, requestId: randomUUID(), expiresAt: new Date(clock + 540000).toISOString() };
  }
  type Job = Awaited<ReturnType<typeof make>>;
  type Action = ReturnType<typeof garmentOperatorArguments>["action"];
  type Changes = { mode?: "enable" | "disable"; freshnessMs?: number; scopeHash?: string; job?: Job["job"]; requestId?: string; directory?: string };
  function args(job: Job, action: Action, changes: Changes = {}) {
    const file = changes.job ?? job.job, mode = changes.mode ?? "enable", target = action === "plan-target" || action === "apply-target";
    return garmentOperatorArguments(["--" + action + "=6086979", "--job=" + file.path, "--expected-job=" + file.sha256,
      "--private-output=" + (changes.directory ?? files.directory), "--request-id=" + (changes.requestId ?? job.requestId),
      ...(!["receipt", "target-receipt"].includes(action) ? ["--expires-at=" + job.expiresAt] : []),
      ...(target ? ["--target-action=" + mode, ...(mode === "enable" ? ["--freshness-ms=" + (changes.freshnessMs ?? 60000)] : [])] : []),
      ...(action === "apply-target" ? ["--scope-hash=" + changes.scopeHash, "--execute=I_CONFIRM_EXACT_TARGET"] : []),
      ...(action === "collect-once" ? ["--scope-hash=" + changes.scopeHash, "--execute=I_CONFIRM_EXACT_SCOPE", "--credential-file=" + job.key.path] : [])]);
  }
  async function run(job: Job, action: Action, changes: Changes = {}): Promise<Record<string, unknown> & { result: string }> {
    return runGarmentOperator(args(job, action, changes), toolingCommit, { now, collect: async (_input, range) => { calls++; clock += 100; return workerFrame(range, clock); } });
  }
  function scope(value: Awaited<ReturnType<typeof run>>) { assert.ok("scopeHash" in value && typeof value.scopeHash === "string"); return value.scopeHash; }
  const target = async (job: Job) => (await pool.query("SELECT enabled,version,freshness_ms FROM ainuoke_garment_shipment_targets WHERE sales_order_id=$1", [job.orderId])).rows[0];
  const counts = async () => (await pool.query(`SELECT (SELECT count(*)::int FROM ainuoke_garment_target_commands) target,
    (SELECT count(*)::int FROM ainuoke_garment_collection_commands) collection,
    (SELECT count(*)::int FROM ainuoke_garment_shipment_snapshots) snapshots,
    (SELECT count(*)::int FROM operation_logs) logs`)).rows[0];
  // A test-only transport fault around the real pg client's COMMIT response.
  // No production injection flag, alternate service or schema guard is added.
  async function afterTargetCommit<T>(effect: () => void, work: () => Promise<T>) {
    const originalConnect = pg.Pool.prototype.connect;
    pg.Pool.prototype.connect = function (this: pg.Pool, ...parameters: unknown[]) {
      const connection = Reflect.apply(originalConnect, this, parameters);
      if (parameters.length || this.options.application_name !== "zhixu-garment-operator") return connection;
      return (connection as Promise<PoolClient>).then(client => {
        const originalQuery = client.query, originalRelease = client.release; let targetWritten = false;
        client.query = function (this: PoolClient, ...query: unknown[]) {
          const response = Reflect.apply(originalQuery, this, query), text = query[0];
          if (typeof text === "string" && text.includes("INSERT INTO ainuoke_garment_target_commands")) targetWritten = true;
          return text === "COMMIT" && targetWritten ? Promise.resolve(response).then(value => { effect(); return value; }) : response;
        } as typeof client.query;
        client.release = (...releaseArgs) => { client.query = originalQuery; client.release = originalRelease; originalRelease(...releaseArgs); };
        return client;
      });
    } as typeof originalConnect;
    try { return await work(); } finally { pg.Pool.prototype.connect = originalConnect; }
  }

  await t.test("read-only target plan and explicit enable never invoke the collector; original collection stays separate", async () => {
    const job = await make(), before = await counts(), start = calls, planned = scope(await run(job, "plan-target"));
    assert.deepEqual(await counts(), before); assert.equal(await target(job), undefined); assert.equal(calls, start);
    const enabled = await run(job, "apply-target", { scopeHash: planned }); assert.equal(enabled.result, "TARGET_COMMAND_COMPLETED");
    assert.equal(garmentOperatorExitCode(enabled), 0); assert.equal((await target(job)).enabled, true); assert.equal(calls, start);
    assert.equal((await run(job, "receipt")).receiptState, "unknown");
    const collectionScope = scope(await run(job, "plan-collection"));
    assert.equal((await run(job, "collect-once", { scopeHash: collectionScope })).result, "COLLECTION_PUBLISHED");
    assert.equal(calls, start + 1); assert.equal((await run(job, "target-receipt")).result, "TARGET_COMMAND_COMPLETED");
    assert.equal((await run(job, "receipt")).result, "COLLECTION_PUBLISHED");
    for (const secret of [databaseUrl, config.username, config.password, job.request.verification.selection.salesContractNo, "合成蓝"])
      assert.equal(JSON.stringify(enabled).includes(secret), false);
  });
  await t.test("old apply validates intent and returns history without re-enabling a stopped target", async () => {
    const job = await make(), initial = scope(await run(job, "plan-target")); await run(job, "apply-target", { scopeHash: initial });
    for (const changes of [{ mode: "disable" as const }, { freshnessMs: 70000 }, { scopeHash: "0".repeat(64) }])
      await assert.rejects(() => run(job, "apply-target", { scopeHash: initial, ...changes }), { code: "garment_target_request_conflict" });
    const stopId = randomUUID(), stop = scope(await run(job, "plan-target", { mode: "disable", requestId: stopId }));
    await run(job, "apply-target", { mode: "disable", requestId: stopId, scopeHash: stop }); clock += 600000;
    const historical = await run(job, "apply-target", { scopeHash: initial }); assert.equal(historical.result, "TARGET_COMMAND_COMPLETED");
    assert.ok("receiptIsHistorical" in historical && historical.receiptIsHistorical); assert.equal((await target(job)).enabled, false);
  });
  await t.test("deleted proof, unhealthy profile and expired enable permit cannot block explicit stop or historical readback", async () => {
    const job = await make(), initial = scope(await run(job, "plan-target")); await run(job, "apply-target", { scopeHash: initial });
    unlinkSync(job.proof.path); unlinkSync(job.key.path); const beforeCalls = calls;
    await pool.query("UPDATE ainuoke_source_profiles SET enabled=false WHERE source_key=$1", [config.sourceKey]);
    try {
      const requestId = randomUUID(), stop = scope(await run(job, "plan-target", { mode: "disable", requestId }));
      assert.equal((await run(job, "apply-target", { mode: "disable", requestId, scopeHash: stop })).result, "TARGET_COMMAND_COMPLETED");
      clock += 600000; const before = await counts(), historical = await run(job, "target-receipt");
      assert.equal(historical.result, "TARGET_COMMAND_COMPLETED"); assert.equal(historical.receiptIsHistorical, true);
      assert.ok("enabledAtCompletion" in historical && historical.enabledAtCompletion); assert.equal((await target(job)).enabled, false);
      assert.deepEqual(await counts(), before); assert.equal(calls, beforeCalls);
    } finally { await pool.query("UPDATE ainuoke_source_profiles SET enabled=true WHERE source_key=$1", [config.sourceKey]); }
  });
  await t.test("fresh permission and changed target CAS are enforced by the original writer", async () => {
    const job = await make(), initial = scope(await run(job, "plan-target"));
    const otherId = randomUUID(), other = scope(await run(job, "plan-target", { requestId: otherId, freshnessMs: 70000 }));
    await run(job, "apply-target", { requestId: otherId, freshnessMs: 70000, scopeHash: other });
    await assert.rejects(() => run(job, "apply-target", { scopeHash: initial }), { code: "garment_target_scope_changed" });
    const user = (await pool.query("INSERT INTO app_users(username,password_hash,display_name,role) VALUES('target.revoked',crypt('synthetic',gen_salt('bf',4)),'合成撤权','viewer') RETURNING id::text")).rows[0];
    const role = "synthetic-target-operator-role"; await pool.query("INSERT INTO app_roles(id,name) VALUES($1,$1)", [role]);
    await pool.query("INSERT INTO app_user_roles(user_id,role_id) VALUES($1,$2)", [user.id, role]);
    for (const key of ["order.view", "ainuoke.view", "ainuoke.sync", "ainuoke.bind"])
      await pool.query("INSERT INTO app_role_permissions(role_id,permission_key) VALUES($1,$2)", [role, key]);
    const file = files.write("revoked-user-job.json", JSON.stringify({ ...job.intent, operatorUsername: "target.revoked" }));
    const requestId = randomUUID(), planned = scope(await run(job, "plan-target", { requestId, job: file })), before = await counts();
    await pool.query("DELETE FROM app_role_permissions WHERE role_id=$1 AND permission_key='ainuoke.bind'", [role]);
    await assert.rejects(() => run(job, "apply-target", { requestId, job: file, scopeHash: planned }), { code: "permission_denied" });
    assert.deepEqual(await counts(), before);
  });
  await t.test("a real committed target with a lost COMMIT response is unverified until independent receipt readback", async () => {
    const job = await make(), planned = scope(await run(job, "plan-target")), start = calls;
    const output = await afterTargetCommit(() => { throw Error("synthetic COMMIT reply lost"); }, () => run(job, "apply-target", { scopeHash: planned }));
    assert.equal(output.result, "TARGET_COMMAND_UNVERIFIED"); assert.equal(output.receiptState, "unverified_commit");
    assert.equal(garmentOperatorExitCode(output), 2); assert.equal("enabledAtCompletion" in output, false);
    unlinkSync(job.proof.path); const readback = await run(job, "target-receipt");
    assert.equal(readback.result, "TARGET_COMMAND_COMPLETED"); assert.equal((await target(job)).enabled, true); assert.equal(calls, start);
  });
  await t.test("report loss after real target commit does not invite a second operation", async () => {
    const job = await make(), planned = scope(await run(job, "plan-target")), outputFiles = paymentPrivateFixture();
    try {
      const output = await afterTargetCommit(() => rmdirSync(outputFiles.directory), () => run(job, "apply-target", { scopeHash: planned, directory: outputFiles.directory }));
      assert.equal(output.result, "PRIVATE_REPORT_UNAVAILABLE"); assert.equal(garmentOperatorExitCode(output), 2);
      unlinkSync(job.proof.path); const before = await counts();
      assert.equal((await run(job, "target-receipt")).result, "TARGET_COMMAND_COMPLETED"); assert.deepEqual(await counts(), before);
    } finally { outputFiles.close(); }
  });
  await t.test("clean committed executable can plan, apply and recover the exact target; dirty checkout refuses all writes", async () => {
    const job = await make(), dirty = execFileSync("git", ["status", "--porcelain", "--untracked-files=normal"], { encoding: "utf8", windowsHide: true }).trim();
    const child = (action: Action, changes: Changes = {}) => {
      const parsed = args(job, action, changes), rawArgs = [...parsed.values].map(([key, value]) => "--" + key + "=" + value);
      const output = spawnSync(process.execPath, ["--import", "tsx", "server/ainuoke-source/garment-operator-cli.ts", ...rawArgs],
        { encoding: "utf8", windowsHide: true, timeout: 60000, maxBuffer: 65536 });
      assert.equal(output.error, undefined); assert.equal(output.stderr, "");
      assert.equal(output.stdout.includes(databaseUrl), false); assert.equal(output.stdout.includes(config.password), false);
      return { status: output.status, value: JSON.parse(output.stdout) as Record<string, unknown> };
    };
    const plan = child("plan-target");
    if (dirty) { assert.equal(plan.status, 1); assert.equal(plan.value.code, "garment_operator_committed_clean_worktree_required"); assert.equal(await target(job), undefined); }
    else {
      assert.equal(plan.status, 0); assert.equal(plan.value.result, "READ_ONLY_TARGET_PLAN_RECORDED"); assert.equal(await target(job), undefined);
      const applied = child("apply-target", { scopeHash: String(plan.value.scopeHash) }); assert.equal(applied.status, 0); assert.equal(applied.value.result, "TARGET_COMMAND_COMPLETED");
      unlinkSync(job.proof.path); unlinkSync(job.key.path); const readback = child("target-receipt");
      assert.equal(readback.status, 0); assert.equal(readback.value.receiptIsHistorical, true); assert.equal(readback.value.sourceReadThisInvocation, "none");
      assert.ok("privateReportPath" in readback.value); assert.equal(JSON.parse(readFileSync(String(readback.value.privateReportPath), "utf8")).result.receiptState, "completed");
    }
    t.diagnostic(dirty ? "Dirty source correctly refused; clean executable positive path is still required." : "Clean source target plan/apply/receipt passed without Source IO.");
  });
});
