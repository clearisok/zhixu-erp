import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { bindingBundle, freshMaterialBundle } from "./ainuoke-binding-fixture.js";
import { runFullPreflight, PREFLIGHT_LIMITS, parsePreflightArguments, assertPrivateOutput, writePrivateReport } from "../ainuoke-source/live-preflight.js";
import { localDemoPlan, parseDemoPlanArguments } from "../ainuoke-source/demo-plan.js";
import { APPROVED_HTTP_ORIGIN, APPROVED_HTTP_POLICY } from "../ainuoke-source/collector.js";
import type { SourceBundle } from "../ainuoke-source/contract.js";
import { SourceError } from "../ainuoke-source/contract.js";

const config = { sourceKey: "synthetic", baseUrl: APPROVED_HTTP_ORIGIN, transportPolicy: APPROVED_HTTP_POLICY,
  username: "synthetic-private-account", password: "Synthetic-Only-Never-Print", operatorUsername: "not-db-authorized" } as const;
const timestamp = Date.now();
function fullBundles(count = 3) {
  const bindings = bindingBundle(timestamp, count), template = freshMaterialBundle(timestamp);
  const materials: SourceBundle = { schemaVersion: "ainuoke-server-source.v1", discoveryBefore: structuredClone(bindings.discoveryAfter),
    discoveryAfter: structuredClone(bindings.discoveryAfter), materials: {} };
  for (const row of bindings.discoveryAfter.flatMap(p => p.rows)) {
    const contract = String(row.values.BillNo), inside = String(row.values.InsideOrderNo);
    materials.materials[contract] = Object.values(template.materials)[0].map(page => ({ ...structuredClone(page), pageSize: 50, queryContext: { insideOrderNo: inside },
      rows: page.rows.map(r => ({ ...structuredClone(r), values: { ...r.values, ExpContractNo: contract, QtyUnit: "个" } })) }));
  }
  return { bindings, materials };
}
async function run(b = fullBundles(), options: { bindingElapsed?: number; materialElapsed?: number } = {}) {
  const calls: Array<{ contracts: string[]; mode?: string; timeout: number }> = [];
  let monotonicCalls = 0;
  const result = await runFullPreflight(config, { now: () => timestamp,
    monotonic: () => [0, options.bindingElapsed ?? 100, 100, 100 + (options.materialElapsed ?? 200), 1000][monotonicCalls++] ?? 1000,
    collect: async (_, contracts, scope) => {
      calls.push({ contracts, mode: scope.mode, timeout: scope.timeoutMs });
      return scope.mode === "bindings" ? b.bindings : b.materials;
    } });
  return { ...result, calls };
}

test("full read uses all lifecycle contracts, real binding mapper and same four-stream projection, without activation", async () => {
  const b = fullBundles(); const result = await run(b);
  assert.equal(result.summary.collectionValidation, "complete");
  assert.equal(result.summary.databaseAccess, "none"); assert.equal(result.summary.sourceActivation, "not-activated");
  assert.equal(result.summary.demoReady, false); assert.equal(result.summary.operatorAuthorization, "not-checked");
  assert.deepEqual(result.calls, [ { contracts: [], mode: "bindings", timeout: 600000 },
    { contracts: Object.keys(b.materials.materials), mode: undefined, timeout: 600000 } ]);
  assert.ok("materials" in result.summary); assert.equal(result.summary.materials.contracts, 3);
  assert.equal(result.summary.materials.allVisibleContracts, true);
  assert.ok(Object.values(result.summary.materials.streams).every(s => s.eventCount > 0));
  const publicText = JSON.stringify(result.summary);
  for (const secret of [config.username, config.password, "SYNTHETIC-IN", "PI-SYNTHETIC", "PO-SYNTHETIC", "protected-commercial-sentinel", "12.75"])
    assert.ok(!publicText.includes(secret));
  assert.ok(!JSON.stringify(result.privateReport).includes("protected-commercial-sentinel"));
  assert.equal(result.summary.stages[0].metrics?.httpAttempts, "not-instrumented");
  assert.equal(result.summary.stages[0].metrics?.returnedReportPages, 5);
  assert.ok(result.summary.materials.duplicateSourceRows > 0); assert.ok(result.summary.materials.duplicateEvents > 0);
});

test("missing/invalid colors remain enrichment gaps, never exclude main orders or invent colors", async () => {
  const b = fullBundles(); const pages = Object.values(b.bindings.colors);
  pages[0][0].rows = []; pages[0][0].total = 0; pages[1][0].rows[0].values.CnColor = "";
  const result = await run(b); assert.equal(result.summary.collectionValidation, "complete");
  assert.ok("bindingPreview" in result.summary);
  assert.equal(result.summary.bindingPreview.colors.missing, 1); assert.equal(result.summary.bindingPreview.colors.invalid, 1);
  assert.equal(result.summary.materials.contracts, 3);
});

test("partial scopes, foreign identity, incomplete pages and cross-stage changes cannot claim complete", async t => {
  const changes: Record<string, (b: ReturnType<typeof fullBundles>) => void> = {
    "missing material contract": b => { delete b.materials.materials[Object.keys(b.materials.materials)[0]]; },
    "foreign material": b => { Object.values(b.materials.materials)[0][0].rows[0].values.ExpContractNo = "FOREIGN"; },
    "partial material pages": b => { Object.values(b.materials.materials)[0][0].total++; },
    "changed production page budget": b => { Object.values(b.materials.materials)[0][0].pageSize = 200; },
    "partial color pages": b => { Object.values(b.bindings.colors)[0][0].total++; },
    "source disappears": b => { const key = Object.keys(b.materials.materials)[0]; delete b.materials.materials[key]; for (const p of [...b.materials.discoveryBefore, ...b.materials.discoveryAfter]) { p.rows.shift(); p.total--; } },
    "same BillNo changed source identity": b => { for (const p of [...b.materials.discoveryBefore, ...b.materials.discoveryAfter]) p.rows[0].values.id = "changed-id"; },
    "same identities changed raw facts": b => { for (const p of [...b.materials.discoveryBefore, ...b.materials.discoveryAfter]) p.rows[0].values.CustomerName = "changed-private-customer"; },
    "wrong InsideOrder transport": b => { Object.values(b.materials.materials)[0][0].queryContext.insideOrderNo = "FOREIGN"; },
    "stale binding": b => { b.bindings.discoveryBefore[0].fetchedAt = new Date(timestamp - 600001).toISOString(); },
    "future material": b => { Object.values(b.materials.materials)[0][0].fetchedAt = new Date(timestamp + 1).toISOString(); },
    "secret field": b => { b.bindings.discoveryBefore[0].rows[0].values.password = "must-not-print"; },
  };
  for (const [name, change] of Object.entries(changes)) await t.test(name, async () => {
    const b = fullBundles(); change(b); const result = await run(b);
    assert.equal(result.summary.collectionValidation, "incomplete"); assert.equal(result.summary.demoReady, false);
    const summary = JSON.stringify(result.summary);
    for (const hidden of ["FOREIGN", "changed-private-customer", "must-not-print"]) assert.ok(!summary.includes(hidden));
  });
});

test("no fresh complete readiness after either stage exceeds production worker budget", async () => {
  for (const elapsed of [{ bindingElapsed: 600001 }, { materialElapsed: 600001 }]) {
    const result = await run(fullBundles(), elapsed); assert.equal(result.summary.collectionValidation, "incomplete");
    assert.equal(result.summary.stages.at(-1)?.code, "source_timeout");
    if (elapsed.bindingElapsed) assert.equal(result.calls.length, 1);
  }
  assert.equal(PREFLIGHT_LIMITS.sourceMaxAgeMs, 600000);
});

test("unknown quantities, unit missing/conflict and duplicate events are reported through existing projection", async () => {
  const b = fullBundles(1), page = Object.values(b.materials.materials)[0][0];
  for (const row of page.rows) { row.values.cgnum = null; row.values.QtyUnit = ""; }
  const missing = await run(b); assert.equal(missing.summary.collectionValidation, "complete");
  assert.ok("materials" in missing.summary); assert.ok(missing.summary.materials.units.missing > 0);
  assert.ok(missing.summary.materials.streams.purchases.unknownQuantityItems > 0);
  assert.equal(missing.summary.materials.unknownQuantityRemainsUnknown, true);
  // Same demand and same procurement event across different source lines.
  const conflict = fullBundles(1), p = Object.values(conflict.materials.materials)[0][0];
  p.rows.find(row => row.sourceRowIdentity === "6087050:sha256:synthetic-partial-b")!.values.QtyUnit = "米";
  const c = await run(conflict); assert.ok("materials" in c.summary); assert.ok(c.summary.materials.units.conflict > 0);
  assert.ok(c.summary.materials.streams.purchases.unknownQuantityItems > 0);
  assert.ok("orders" in c.privateReport); assert.ok(c.privateReport.orders.flatMap(o => o.demands).some(d => d.unitStatus === "conflict" && d.unit === null));
});

test("collector failure vocabulary does not echo upstream errors, credentials or fabricated source codes", async () => {
  for (const error of [new Error("password=secret-private"), new SourceError("private-contract-error"), new SourceError("source_timeout")]) {
    const result = await runFullPreflight(config, { collect: async () => { throw error; } });
    assert.equal(result.summary.collectionValidation, "incomplete");
    assert.ok(!JSON.stringify(result.summary).includes("secret-private")); assert.ok(!JSON.stringify(result.summary).includes("private-contract-error"));
  }
  await assert.rejects(runFullPreflight({ ...config, baseUrl: "http://127.0.0.1:1", transportPolicy: undefined }));
});

test("repeated purchase source rows stay one 356 procurement event in the private projection", async () => {
  const b = fullBundles(1), page = Object.values(b.materials.materials)[0][0];
  const row = page.rows.find(r => r.values.GoodsNo === "SYNTHETIC-MAT-ready")!;
  Object.assign(row.values, { TotalNum: 356, cgnum: 356, rknum: 0, rkdh: null });
  page.rows.push({ ...structuredClone(row), sourceRowIdentity: "6087050:sha256:synthetic-356-second-source" }); page.total++;
  const result = await run(b); assert.equal(result.summary.collectionValidation, "complete");
  assert.ok("orders" in result.privateReport);
  const demand = result.privateReport.orders[0].demands.find(d => d.materialCode === "SYNTHETIC-MAT-ready")!;
  assert.equal(demand.unit, "个"); assert.equal(demand.purchases.length, 1); assert.equal(demand.purchases[0].quantity, 356);
});

test("preflight CLI requires explicit source-only action and has no database/scheduler/credential argument", () => {
  const directory = resolve("outputs/private");
  assert.equal(parsePreflightArguments(["--run-read-only", "--stdin-config", "--private-output=" + directory]).privateOutput, directory);
  for (const args of [[], ["--run-read-only"], ["--run-read-only", "--stdin-config", "--private-output=relative"],
    ["--run-read-only", "--stdin-config", "--private-output=" + directory, "--bind"],
    ["--run-read-only", "--run-read-only", "--private-output=" + directory], ["--check", "--stdin-config", "--private-output=" + directory]])
    assert.throws(() => parsePreflightArguments(args));
  const environment = { ...process.env, DATABASE_URL: "postgresql://never-connect.invalid:1/real-business" };
  const help = spawnSync(process.execPath, ["--import", "tsx", "server/ainuoke-source/live-preflight.ts", "--help"], { env: environment, encoding: "utf8", timeout: 15000 });
  assert.equal(help.status, 0); assert.match(help.stdout, /no database/);
});

test("complete and incomplete production reports persist in private targets without allowing credential fields", async () => {
  const output = resolve("outputs"); mkdirSync(output, { recursive: true });
  const directory = mkdtempSync(join(output, "live-preflight-synthetic-"));
  try {
    if (process.platform === "win32") {
      const sid = execFileSync("pwsh", ["-NoProfile", "-Command", "[Security.Principal.WindowsIdentity]::GetCurrent().User.Value"], { encoding: "utf8" }).trim();
      execFileSync("icacls", [directory, "/inheritance:r", "/grant:r", "*" + sid + ":(OI)(CI)F", "*S-1-5-18:(OI)(CI)F"], { stdio: "ignore" });
    } else chmodSync(directory, 0o700);
    assert.doesNotThrow(() => assertPrivateOutput(directory));
    const receipt = writePrivateReport(directory, { synthetic: true, privateFact: "synthetic-only" });
    assert.equal(JSON.parse(readFileSync(receipt.privateReportPath, "utf8")).privateFact, "synthetic-only");
    assert.equal(receipt.privateReportSha256, createHash("sha256").update(readFileSync(receipt.privateReportPath)).digest("hex"));
    const complete = await run(), incomplete = await runFullPreflight(config, { collect: async () => { throw new SourceError("source_timeout"); } });
    for (const result of [complete, incomplete]) {
      const productionReceipt = writePrivateReport(directory, result.privateReport);
      const persisted = JSON.parse(readFileSync(productionReceipt.privateReportPath, "utf8"));
      assert.deepEqual(persisted, result.privateReport);
      assert.equal(persisted.operatorAuthorization, "not-checked");
      assert.equal(persisted.databaseAccess, "none");
      assert.equal(productionReceipt.privateReportSha256, createHash("sha256").update(readFileSync(productionReceipt.privateReportPath)).digest("hex"));
    }
    for (const change of [{ operatorAuthorization: "Bearer synthetic-secret" }, { databaseAccess: "active" },
      { schemaVersion: "foreign" }, { sourceActivation: "activated" }, { facts: { operatorAuthorization: "not-checked" } },
      { authorization: "synthetic-secret" }, { password: "synthetic-secret" }, { facts: { token: "synthetic-secret" } }])
      assert.throws(() => writePrivateReport(directory, { ...complete.privateReport, ...change }), /source_secret_field/);
    assert.throws(() => writePrivateReport(directory, { password: "synthetic-forbidden" }), /source_secret_field/);
    assert.throws(() => assertPrivateOutput(output)); assert.throws(() => assertPrivateOutput(resolve("docs")));
    const linked = join(directory, "linked"); symlinkSync(directory, linked, process.platform === "win32" ? "junction" : "dir");
    assert.throws(() => assertPrivateOutput(linked));
    if (process.platform === "win32") execFileSync("icacls", [directory, "/grant", "*S-1-1-0:(OI)(CI)R"], { stdio: "ignore" });
    else chmodSync(directory, 0o755);
    assert.throws(() => assertPrivateOutput(directory));
  } finally {
    // Sole synthetic directory owned by this test, always inside outputs; no business report directory is enumerated.
    assert.ok(directory.startsWith(output + (process.platform === "win32" ? "\\" : "/")));
    if (existsSync(directory)) rmSync(directory, { recursive: true, force: true });
  }
});

test("actual CLI failures have a closed stage and code instead of an unusable worker error", () => {
  const failed = spawnSync(process.execPath, ["--import", "tsx", "server/ainuoke-source/live-preflight.ts", "--password=synthetic-secret"],
    { env: { ...process.env, DATABASE_URL: "postgresql://never-connect.invalid:1/real-business" }, encoding: "utf8", timeout: 15000 });
  assert.equal(failed.status, 1);
  const receipt = JSON.parse(failed.stdout);
  assert.equal(receipt.schemaVersion, "ainuoke-live-preflight.v1");
  assert.equal(receipt.code, "preflight_explicit_action_required"); assert.equal(receipt.stage, "arguments");
  assert.equal(receipt.databaseAccess, "none"); assert.equal(receipt.sourceActivation, "not-activated");
  assert.ok(!failed.stdout.includes("synthetic-secret"));
});

test("Windows private credential-file wrapper starts the actual Node CLI and preserves a safe failure receipt", { skip: process.platform !== "win32" }, () => {
  // An owned miniature Git repository permits a committed/clean wrapper test
  // while the implementation worktree is dirty. No production test bypass or
  // live network is used: the synthetic blank password fails before collection.
  const root = mkdtempSync(join(resolve(tmpdir()), "zhixu-preflight-wrapper-synthetic-"));
  try {
    const scriptDirectory = join(root, "scripts"), entryDirectory = join(root, "server/ainuoke-source");
    mkdirSync(scriptDirectory); mkdirSync(entryDirectory, { recursive: true });
    copyFileSync(resolve("scripts/ainuoke-live-preflight.ps1"), join(scriptDirectory, "ainuoke-live-preflight.ps1"));
    writeFileSync(join(entryDirectory, "live-preflight.ts"), "import {main} from " + JSON.stringify(pathToFileURL(resolve("server/ainuoke-source/live-preflight.ts")).href) + "; await main();\n");
    writeFileSync(join(root, "package.json"), '{"type":"module"}\n');
    writeFileSync(join(root, ".gitignore"), "/outputs/\n/node_modules/\n");
    symlinkSync(resolve("node_modules"), join(root, "node_modules"), "junction");
    execFileSync("git", ["init", "--quiet", root], { stdio: "ignore" });
    execFileSync("git", ["-C", root, "add", ".gitignore", "package.json", "scripts", "server"], { stdio: "ignore" });
    execFileSync("git", ["-C", root, "-c", "user.name=Synthetic Test", "-c", "user.email=synthetic@example.invalid", "-c", "commit.gpgsign=false", "commit", "--quiet", "-m", "synthetic wrapper baseline"], { stdio: "ignore" });
    const output = join(root, "outputs"); mkdirSync(output);
    const key = join(output, "synthetic-credential.txt");
    writeFileSync(key, "账号：合成测试\n密码： \n", "utf8");
    const sid = execFileSync("pwsh", ["-NoProfile", "-Command", "[Security.Principal.WindowsIdentity]::GetCurrent().User.Value"], { encoding: "utf8" }).trim();
    execFileSync("icacls", [key, "/inheritance:r", "/grant:r", "*" + sid + ":F", "*S-1-5-18:F"], { stdio: "ignore" });
    const result = spawnSync("pwsh", ["-NoProfile", "-NonInteractive", "-File", join(scriptDirectory, "ainuoke-live-preflight.ps1"), "-CredentialFile", key],
      { cwd: tmpdir(), env: { ...process.env, DATABASE_URL: "postgresql://never-connect.invalid:1/real-business" }, encoding: "utf8", timeout: 60000 });
    assert.equal(result.status, 1);
    const receipt = JSON.parse(result.stdout);
    assert.equal(receipt.schemaVersion, "ainuoke-live-preflight.v1");
    assert.equal(receipt.stage, "configuration"); assert.equal(receipt.code, "invalid_collector_configuration");
    assert.equal(receipt.databaseAccess, "none"); assert.equal(receipt.sourceActivation, "not-activated");
    assert.ok(!result.stdout.includes("合成测试")); assert.ok(!result.stdout.includes("Ainuoke username"));
    // Wide credential permissions fail in the wrapper before launching Node.
    execFileSync("icacls", [key, "/grant", "*S-1-1-0:R"], { stdio: "ignore" });
    const rejected = spawnSync("pwsh", ["-NoProfile", "-NonInteractive", "-File", join(scriptDirectory, "ainuoke-live-preflight.ps1"), "-CredentialFile", key],
      { cwd: tmpdir(), encoding: "utf8", timeout: 15000 });
    assert.equal(rejected.status, 1);
    const rejection = JSON.parse(rejected.stdout);
    assert.equal(rejection.stage, "credential_file_validation"); assert.equal(rejection.code, "private_credential_input_invalid");
  } finally {
    // Check the exact test-owned target before recursive cleanup. Junctions are
    // removed as links; no existing worktree or private business report is used.
    assert.equal(dirname(root), resolve(tmpdir())); assert.match(root, /zhixu-preflight-wrapper-synthetic-[^\\/]+$/u);
    rmSync(root, { recursive: true, force: true });
  }
});

const planInput = { instance: "local-demo-a1b2c3d4", sourceSha: "a".repeat(40), imageDigest: "sha256:" + "b".repeat(64), port: 63210 };
test("isolated demo plan has fresh ownership, loopback UI, no DB publishing or execution", () => {
  const plan = localDemoPlan(planInput); assert.equal(plan.mode, "plan-only"); assert.equal(plan.databaseAccess, "none");
  assert.equal(plan.web.bindAddress, "127.0.0.1"); assert.deepEqual(plan.database.publishedPorts, []);
  assert.equal(plan.existingEnvironmentAccess, false); assert.equal(plan.productionRoutesEnabled, false);
  assert.equal(plan.authority.identity, "session"); assert.match(plan.shutdown, /preserve-volume/);
  assert.deepEqual(parseDemoPlanArguments(["--plan", "--instance=" + planInput.instance, "--source-sha=" + planInput.sourceSha,
    "--image-digest=" + planInput.imageDigest, "--port=63210"]), planInput);
  for (const override of [{ instance: "zhixu-preview-d099-18444" }, { instance: "../prod" }, { port: 18443 }, { port: 3001 }, { port: 63210.5 },
    { sourceSha: "main" }, { imageDigest: "latest" }]) assert.throws(() => localDemoPlan({ ...planInput, ...override }));
  assert.throws(() => parseDemoPlanArguments(["--execute", "--instance=" + planInput.instance, "--source-sha=" + planInput.sourceSha,
    "--image-digest=" + planInput.imageDigest, "--port=63210"]));
});
