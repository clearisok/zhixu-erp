import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync, unlinkSync, rmdirSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import pg from "pg";
import { startDisposablePostgres } from "./postgres-container.js";
import { runMigrations } from "../db/migration-runner.js";
import { synchronizePermissionCatalog } from "../auth/permissions.js";
import { bootstrapAdmin } from "../auth/bootstrap.js";
import { loadExistingBootstrapActor } from "../sales-orders/bootstrap-runner.js";
import { createAinuokeSalesOrder } from "../sales-orders/service.js";
import { hash } from "../ainuoke-source/contract.js";
import { accountFingerprint } from "../ainuoke-source/collector.js";
import { garmentCollectionProof } from "../ainuoke-source/garment-collection-control.js";
import { validateGarmentFilterEvidence } from "../ainuoke-source/garment-filter-evidence.js";
import { garmentOperatorArguments, runGarmentOperator, garmentOperatorExitCode } from "../ainuoke-source/garment-operator-cli.js";
import { collectionRequest, configFor, workerFrame } from "./garment-collection-fixture.js";
import { paymentPrivateFixture } from "./payment-operator-private-fixture.js";

test("garment operator composes exact preview, one-shot collection and credential-independent recovery", { timeout: 300000 }, async t => {
  const db = await startDisposablePostgres(), databaseUrl = await db.createDatabase("garment_operator");
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 8 }), files = paymentPrivateFixture();
  t.after(async () => { try { files.close(); await pool.end(); } finally { await db.stop(); } });
  await runMigrations(pool, resolve("database/migrations")); await synchronizePermissionCatalog(pool);
  await bootstrapAdmin(pool, { username: "garment.collector", displayName: "合成操作员", password: "synthetic-password" });
  const actor = await loadExistingBootstrapActor(pool, "garment.collector"), config = configFor();
  await pool.query("INSERT INTO ainuoke_source_profiles(source_key,account_fingerprint) VALUES($1,$2)", [config.sourceKey, accountFingerprint(config)]);
  const toolingCommit = "a".repeat(40); let n = 0, clock = Date.now(), calls = 0;
  const now = () => clock;
  const count = async (table: string) => (await pool.query(`SELECT count(*)::int n FROM ${table}`)).rows[0].n as number;
  async function make() {
    const num = ++n; clock = Date.now(); const contract = "SYN-OPERATOR-" + num;
    const orderId = (await createAinuokeSalesOrder(pool, actor, { source: { sourceId: contract, sourceRowIdentity: contract,
      salesContractNo: contract, insideOrderNo: "SYN-FACTORY-" + num, lifecycleStatusRaw: "生效", contractDate: "2026-10-01",
      contractDeliveryDate: "2026-11-01", styleNo: "SYN-STYLE", companyNameSnapshot: "合成公司", customerNameSnapshot: "合成客户",
      brandNameSnapshot: "合成品牌", quantity: 100, sourceHash: hash(num), fetchedAt: new Date(clock).toISOString() },
      colors: [{ sourceLineIdentity: "SYN-BLUE-" + num, colorName: "合成蓝", quantity: 100, deliveryDate: "2026-11-01", sourceHash: hash([num, "blue"]) }] })).salesOrder.id;
    const request = collectionRequest(orderId, contract, clock), proofHash = garmentCollectionProof(request, clock).verificationSha256;
    // Synthetic collection fixture only; the CLI never implicitly enables its target.
    await pool.query("INSERT INTO ainuoke_garment_shipment_targets(source_key,sales_order_id,account_fingerprint,enabled,verification_sha256,freshness_ms) VALUES($1,$2,$3,true,$4,60000)",
      [config.sourceKey, orderId, accountFingerprint(config), proofHash]);
    const report = { ...validateGarmentFilterEvidence(request.verification.evidence, request.config, request.verification.selection, clock).privateReport,
      toolingCommit: "d".repeat(40) };
    const proof = files.write("proof-" + num + ".json", JSON.stringify(report));
    const { password, operatorUsername, ...source } = request.config;
    const key = files.write("key-" + num + ".txt", "账号：" + config.username + "\n密码：" + password + "\n");
    const intent = { schemaVersion: "ainuoke-garment-operator-job.v1", databaseUrl, operatorUsername, source, salesOrderId: orderId, verification: proof };
    const job = files.write("job-" + num + ".json", JSON.stringify(intent));
    const permit = { requestId: randomUUID(), expiresAt: new Date(clock + 540000).toISOString() };
    return { orderId, request, proof, report, key, intent, job, permit };
  }
  type Job = Awaited<ReturnType<typeof make>>;
  function args(job: Job, action: "receipt" | "plan-collection" | "collect-once", scopeHash?: string,
    overrides: { job?: Job["job"]; keyPath?: string; directory?: string; expiresAt?: string } = {}) {
    const file = overrides.job ?? job.job;
    return garmentOperatorArguments(["--" + action + "=6086979", "--job=" + file.path, "--expected-job=" + file.sha256,
      "--private-output=" + (overrides.directory ?? files.directory), "--request-id=" + job.permit.requestId,
      ...(action !== "receipt" ? ["--expires-at=" + (overrides.expiresAt ?? job.permit.expiresAt)] : []),
      ...(action === "collect-once" ? ["--scope-hash=" + scopeHash, "--execute=I_CONFIRM_EXACT_SCOPE", "--credential-file=" + (overrides.keyPath ?? job.key.path)] : [])]);
  }
  const plan = (job: Job) => runGarmentOperator(args(job, "plan-collection"), toolingCommit, { now });
  function scope(output: Awaited<ReturnType<typeof runGarmentOperator>>) {
    assert.ok("scopeHash" in output && typeof output.scopeHash === "string"); return output.scopeHash;
  }
  const collect = (job: Job, scopeHash: string, before?: () => Promise<void>, overrides: Parameters<typeof args>[3] = {}) =>
    runGarmentOperator(args(job, "collect-once", scopeHash, overrides), toolingCommit, { now, collect: async (input, range) => {
      assert.equal(input.password, config.password); calls++; await before?.(); clock += 100; return workerFrame(range, clock);
    } });
  const receipt = (job: Job, overrides: Parameters<typeof args>[3] = {}) => runGarmentOperator(args(job, "receipt", undefined, overrides), toolingCommit, { now });

  await t.test("plan performs no source or database mutation and retains original checkedAt", async () => {
    const job = await make(), before = [await count("operation_logs"), await count("ainuoke_garment_collection_commands")];
    const output = await plan(job); assert.equal(output.result, "READ_ONLY_PLAN_RECORDED"); assert.equal(garmentOperatorExitCode(output), 0);
    assert.deepEqual([await count("operation_logs"), await count("ainuoke_garment_collection_commands")], before); assert.equal(calls, 0);
    assert.ok("privateReportPath" in output); const report = JSON.parse(readFileSync(output.privateReportPath!, "utf8"));
    assert.equal(report.result.humanApproval, "still_required"); assert.equal("authorization" in report.result, false);
    assert.equal(readFileSync(job.proof.path, "utf8"), JSON.stringify(job.report));
    assert.equal(output.sourceReadThisInvocation, "none");
  });

  await t.test("non-string proof enums fail before worker, credentials or either command ledger", async () => {
    const job = await make(), start = calls;
    const tables = ["ainuoke_garment_collection_commands", "ainuoke_garment_target_commands", "ainuoke_garment_shipment_snapshots", "operation_logs"];
    const before = await Promise.all(tables.map(count));
    const changes = [{ result: ["complete"] }, { result: [["complete"]] }, { workerStage: ["validation"] },
      { result: ["complete"], workerStage: "not-started", pages: [], httpAttempts: 0, reportRequests: 0 }];
    for (const [index, change] of changes.entries()) {
      const evidence = { ...(job.request.verification.evidence as Record<string, unknown>), ...change };
      const proof = files.write("invalid-enum-proof-" + index + ".json", JSON.stringify({ ...job.report, evidence }));
      const badJob = files.write("invalid-enum-job-" + index + ".json", JSON.stringify({ ...job.intent, verification: proof }));
      await assert.rejects(() => collect(job, "0".repeat(64), undefined, { job: badJob, keyPath: job.key.path + ".absent" }),
        { code: "garment_operator_verification_invalid" });
      assert.equal(calls, start); assert.deepEqual(await Promise.all(tables.map(count)), before);
    }
  });

  await t.test("scope, proof, expiry, target, actor and database mismatch stop before a missing credential is opened", async () => {
    const job = await make(), planned = scope(await plan(job)), before = calls, rows = await count("ainuoke_garment_collection_commands");
    const missing = job.key.path + ".absent";
    await assert.rejects(() => collect(job, "0".repeat(64), undefined, { keyPath: missing }), { code: "garment_operator_scope_changed" });
    await assert.rejects(() => collect(job, planned, undefined, { keyPath: missing, expiresAt: new Date(clock - 1).toISOString() }), { code: "garment_collection_permit_expired" });
    const badProof = files.write("wrong-proof-job.json", JSON.stringify({ ...job.intent, verification: { ...job.proof, sha256: "0".repeat(64) } }));
    await assert.rejects(() => collect(job, planned, undefined, { keyPath: missing, job: badProof }), { code: "payment_operator_private_file_invalid" });
    const badActor = files.write("wrong-actor-job.json", JSON.stringify({ ...job.intent, operatorUsername: "absent.operator" }));
    await assert.rejects(() => collect(job, planned, undefined, { keyPath: missing, job: badActor }), { code: "garment_operator_actor_unavailable" });
    const otherChannel = files.write("other-channel-job.json", JSON.stringify({ ...job.intent, databaseUrl: databaseUrl.replace("127.0.0.1", "localhost") }));
    await assert.rejects(() => collect(job, planned, undefined, { keyPath: missing, job: otherChannel }), { code: "garment_operator_scope_changed" });
    await pool.query("UPDATE ainuoke_garment_shipment_targets SET enabled=false,version=version+1 WHERE sales_order_id=$1", [job.orderId]);
    await assert.rejects(() => collect(job, planned, undefined, { keyPath: missing }), { code: "garment_source_not_connected" });
    assert.equal(calls, before); assert.equal(await count("ainuoke_garment_collection_commands"), rows);
  });

  await t.test("bad job hash and missing migrations never bootstrap an account or apply SQL", async () => {
    const job = await make(), parsed = args(job, "receipt"); parsed.values.set("expected-job", "0".repeat(64));
    await assert.rejects(() => runGarmentOperator(parsed, toolingCommit, { now }), { code: "payment_operator_private_file_invalid" });
    const blankUrl = await db.createDatabase("garment_operator_blank"), blank = new pg.Pool({ connectionString: blankUrl, max: 1 });
    try {
      const empty = files.write("empty-db-job.json", JSON.stringify({ ...job.intent, databaseUrl: blankUrl, verification: null }));
      await assert.rejects(() => receipt(job, { job: empty }), { code: "pending_migrations" });
      assert.equal((await blank.query("SELECT count(*)::int n FROM information_schema.tables WHERE table_schema='public'")).rows[0].n, 0);
    } finally { await blank.end(); }
  });

  await t.test("freshly revoked sync permission rejects the entry before a missing credential and without a command", async () => {
    const role = "synthetic-garment-operator-role";
    const user = (await pool.query("INSERT INTO app_users(username,password_hash,display_name,role) VALUES('garment.revoked',crypt('synthetic',gen_salt('bf',4)),'合成撤权操作员','viewer') RETURNING id::text")).rows[0];
    await pool.query("INSERT INTO app_roles(id,name) VALUES($1,$1)", [role]);
    await pool.query("INSERT INTO app_user_roles(user_id,role_id) VALUES($1,$2)", [user.id, role]);
    for (const permission of ["order.view", "ainuoke.view", "ainuoke.sync"]) await pool.query("INSERT INTO app_role_permissions(role_id,permission_key) VALUES($1,$2)", [role, permission]);
    const job = await make();
    job.job = files.write("revoked-actor-job.json", JSON.stringify({ ...job.intent, operatorUsername: "garment.revoked" }));
    const planned = scope(await plan(job)), before = calls, commands = await count("ainuoke_garment_collection_commands");
    await pool.query("DELETE FROM app_role_permissions WHERE role_id=$1 AND permission_key='ainuoke.sync'", [role]);
    try {
      await assert.rejects(() => collect(job, planned, undefined, { keyPath: job.key.path + ".absent" }), { code: "permission_denied" });
      assert.equal(calls, before); assert.equal(await count("ainuoke_garment_collection_commands"), commands);
    } finally {
      await pool.query("INSERT INTO app_role_permissions(role_id,permission_key) VALUES($1,'ainuoke.sync')", [role]);
    }
  });

  await t.test("same actor/request concurrent command returns started and cannot invoke a second worker", async () => {
    const job = await make(), planned = scope(await plan(job)), startCalls = calls;
    let entered!: () => void, release!: () => void;
    const begun = new Promise<void>(done => { entered = done; }), wait = new Promise<void>(done => { release = done; });
    const pending = collect(job, planned, async () => { entered(); await wait; });
    try {
      await begun;
      const duplicate = await collect(job, planned, undefined, { keyPath: job.key.path + ".absent" });
      assert.equal(duplicate.result, "COLLECTION_UNVERIFIED"); assert.equal(duplicate.receiptState, "unverified_started");
      assert.equal(garmentOperatorExitCode(duplicate), 2); assert.equal(calls, startCalls + 1);
    } finally { release(); }
    const output = await pending; assert.equal(output.result, "COLLECTION_PUBLISHED"); assert.equal(garmentOperatorExitCode(output), 0);
    const replayed = await collect(job, planned, undefined, { keyPath: job.key.path + ".absent" });
    assert.ok("replayed" in replayed); assert.equal(replayed.replayed, true); assert.equal(calls, startCalls + 1);
    await assert.rejects(() => collect(job, "0".repeat(64), undefined, { keyPath: job.key.path + ".absent" }), { code: "garment_collection_request_conflict" });
    for (const secret of [config.password, config.username, databaseUrl, job.request.verification.selection.salesContractNo, "合成蓝", "9007199254740993"])
      assert.equal(JSON.stringify([output, replayed]).includes(secret), false);
    assert.ok("privateReportPath" in output); const privateText = readFileSync(output.privateReportPath!, "utf8");
    for (const secret of [config.password, config.username, databaseUrl]) assert.equal(privateText.includes(secret), false);
  });

  await t.test("receipt survives deleted proof/secret, expired permit and disabled target without database writes", async () => {
    const job = await make(), planned = scope(await plan(job)); assert.equal((await collect(job, planned)).result, "COLLECTION_PUBLISHED");
    unlinkSync(job.proof.path); unlinkSync(job.key.path);
    await pool.query("UPDATE ainuoke_garment_shipment_targets SET enabled=false,version=version+1 WHERE sales_order_id=$1", [job.orderId]); clock += 600000;
    const before = [await count("operation_logs"), await count("ainuoke_garment_collection_commands"), await count("ainuoke_garment_shipment_snapshots")], beforeCalls = calls;
    const output = await receipt(job); assert.equal(output.result, "COLLECTION_PUBLISHED"); assert.equal(output.receiptState, "completed");
    assert.ok("sourceReadThisInvocation" in output); assert.equal(output.sourceReadThisInvocation, "none");
    assert.deepEqual([await count("operation_logs"), await count("ainuoke_garment_collection_commands"), await count("ainuoke_garment_shipment_snapshots")], before);
    assert.equal(calls, beforeCalls);
    const noProof = files.write("receipt-null-proof-job.json", JSON.stringify({ ...job.intent, verification: null }));
    assert.equal((await receipt(job, { job: noProof })).result, "COLLECTION_PUBLISHED");
  });

  await t.test("report write loss after publication is unresolved until original receipt readback, never a retry", async () => {
    const job = await make(), planned = scope(await plan(job)), outputFiles = paymentPrivateFixture(), startCalls = calls;
    try {
      const output = await collect(job, planned, async () => { rmdirSync(outputFiles.directory); }, { directory: outputFiles.directory });
      assert.equal(output.result, "PRIVATE_REPORT_UNAVAILABLE"); assert.equal(garmentOperatorExitCode(output), 2); assert.equal(calls, startCalls + 1);
      assert.equal((await receipt(job)).result, "COLLECTION_PUBLISHED"); assert.equal(calls, startCalls + 1);
    } finally { outputFiles.close(); }
  });

  await t.test("unknown request does not prove no prior work and source failures preserve the prior head", async () => {
    const job = await make(); const unknown = await receipt(job); assert.equal(unknown.result, "COLLECTION_UNVERIFIED");
    assert.ok("absenceProvesNoPriorWork" in unknown); assert.equal(unknown.absenceProvesNoPriorWork, false); assert.equal(garmentOperatorExitCode(unknown), 2);
    const planned = scope(await plan(job)); assert.equal((await collect(job, planned)).result, "COLLECTION_PUBLISHED");
    const head = (await pool.query("SELECT * FROM ainuoke_garment_shipment_heads WHERE sales_order_id=$1", [job.orderId])).rows;
    clock = Date.now(); job.permit = { requestId: randomUUID(), expiresAt: new Date(clock + 540000).toISOString() }; const nextPlan = scope(await plan(job));
    const failed = await runGarmentOperator(args(job, "collect-once", nextPlan), toolingCommit, { now, collect: async () => { calls++; throw Error(config.password); } });
    assert.equal(failed.result, "COLLECTION_NOT_PUBLISHED"); assert.equal(garmentOperatorExitCode(failed), 2);
    assert.deepEqual((await pool.query("SELECT * FROM ainuoke_garment_shipment_heads WHERE sales_order_id=$1", [job.orderId])).rows, head);
    assert.equal(JSON.stringify(failed).includes(config.password), false);
  });

  await t.test("source executable performs clean-checkout readback or explicitly refuses a dirty checkout", async () => {
    const job = await make(), planned = scope(await plan(job)); await collect(job, planned);
    const parsed = args(job, "receipt"), rawArgs = [...parsed.values].map(([key, value]) => "--" + key + "=" + value);
    const dirty = execFileSync("git", ["status", "--porcelain", "--untracked-files=normal"], { encoding: "utf8", windowsHide: true }).trim();
    const child = spawnSync(process.execPath, ["--import", "tsx", "server/ainuoke-source/garment-operator-cli.ts", ...rawArgs],
      { encoding: "utf8", windowsHide: true, timeout: 60000, maxBuffer: 65536 });
    assert.equal(child.error, undefined); const output = JSON.parse(child.stdout);
    if (dirty) { assert.equal(child.status, 1); assert.equal(output.code, "garment_operator_committed_clean_worktree_required"); }
    else { assert.equal(child.status, 0); assert.equal(output.result, "COLLECTION_PUBLISHED"); assert.equal(output.sourceReadThisInvocation, "none"); }
    t.diagnostic(dirty ? "Dirty source executable correctly refused; positive executable acceptance requires clean checkpoint." : "Clean committed source executable durable readback passed.");
    assert.equal(child.stderr, ""); assert.equal(child.stdout.includes(config.password), false); assert.equal(child.stdout.includes(databaseUrl), false);
  });
});
