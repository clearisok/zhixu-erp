import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn, spawnSync, execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, copyFileSync, writeFileSync, readFileSync, symlinkSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { accountFingerprint, APPROVED_HTTP_ORIGIN, APPROVED_HTTP_POLICY } from "../ainuoke-source/collector.js";
import { hash } from "../ainuoke-source/contract.js";
import { selectionFromPrivateSamples, validateContractEvidence as validate, contractProbeArguments, collectPaymentContracts } from "../ainuoke-source/payment-request-contract-probe.js";

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const config = { sourceKey: "payment-request-diagnostic", baseUrl: APPROVED_HTTP_ORIGIN, transportPolicy: APPROVED_HTTP_POLICY,
  username: "synthetic-contract-account", password: "synthetic-contract-secret", operatorUsername: "readonly-no-db-authorization" } as const;
const now = Date.now();
function samples() {
  return { schemaVersion: "ainuoke-payment-row-confirmation-private.v1", scope: "two-exact-source-observations-only",
    originalPrivateReportSha256: sha("synthetic-capture"), rows: [1, 2].map(i => ({ alias: "S" + i, reportId: "6086941",
      sourceFingerprint: accountFingerprint(config), rawResponseSha256: sha("raw"), rowContentHash: sha("row" + i),
      sourceRecordId: { state: "known", raw: String(i * 1000) }, applicationNo: "SYN-APP-" + i,
      purchaseContractNo: "SYN-PUR-" + i, salesContractNo: "SYN-SALES-" + i })) };
}
const selection = () => selectionFromPrivateSamples(samples(), "a".repeat(64));
function evidence(total = 2) {
  const selected = selection(), pages = [];
  for (const pass of [1, 2]) for (const [i, target] of selected.targets.entries()) for (let page = 1; page <= Math.ceil(total / 100); page++) {
    const offset = (page - 1) * 100;
    const rows = Array.from({ length: Math.min(100, total - offset) }, (_, n) => ({
      id: (i + 1) * 1000 + offset + n, BillNo: target.witness.BillNo, PurContractNo: target.witness.PurContractNo,
      ExpContractNo: target.salesContractNo, CnName: "合成物料", Num: 10, OutStoreNum: 12, QtyUnit: "个", Price: 1.25,
    }));
    const rawReportResponse = JSON.stringify({ reObj: { isOk: true }, dataList: JSON.stringify({ rows }),
      reportObj: { reportId: 6086941, cellList: "[]" }, dataCount: total, pageIndex: 0, pageSize: 0 });
    pages.push({ alias: target.alias, pass, page, capturedAt: new Date(now).toISOString(), rawReportResponse, rawResponseSha256: sha(rawReportResponse) });
  }
  return { schemaVersion: "ainuoke-payment-contract-evidence.v1", result: "complete", code: null, workerStage: "validation",
    selectionHash: hash(selected), httpAttempts: pages.length + 1, reportRequests: pages.length, pages };
}
function mutateRaw(e: ReturnType<typeof evidence>, index: number, change: (raw: Record<string, unknown>) => void) {
  const page = e.pages[index], raw = JSON.parse(page.rawReportResponse); change(raw);
  page.rawReportResponse = JSON.stringify(raw); page.rawResponseSha256 = sha(page.rawReportResponse);
}
function mutateRows(e: ReturnType<typeof evidence>, index: number, change: (rows: Array<Record<string, unknown>>) => void) {
  mutateRaw(e, index, raw => { const data = JSON.parse(raw.dataList as string); change(data.rows); raw.dataList = JSON.stringify(data); });
}
test("two selected positive contracts and both passes are complete, public receipt has no business values", () => {
  const result = validate(evidence(), config, selection(), now);
  assert.equal(result.summary.result, "READ_ONLY_CONTRACT_PROBE_RECORDED");
  assert.equal(result.summary.httpAttempts, 5); assert.equal(result.summary.reportRequests, 4);
  assert.equal(result.privateReport.validationStatus, "accepted");
  for (const value of [config.username, config.password, "SYN-APP", "SYN-SALES", "SYN-PUR", "合成物料"])
    assert.ok(!JSON.stringify(result.summary).includes(value));
  assert.ok("mappingVerified" in result.summary);
  assert.equal(result.summary.mappingVerified, false);
  assert.equal(result.summary.sourceActivation, "not-activated");
});
test("101 rows force two full pages twice, not first-page completeness", () => {
  const result = validate(evidence(101), config, selection(), now);
  assert.equal(result.summary.result, "READ_ONLY_CONTRACT_PROBE_RECORDED");
  assert.equal(result.summary.reportRequests, 8); assert.equal(result.summary.httpAttempts, 9);
  assert.ok("contractSummaries" in result.summary);
  assert.deepEqual(result.summary.contractSummaries?.map(c => [c.rowCount, c.pageCount]), [[101, 2], [101, 2]]);
});
test("mixed contracts, missing witnesses, ignored filtering and changed source fail without dropping rows", () => {
  for (const mode of ["wrong-contract", "missing-witness", "changed"] as const) {
    const e = evidence(), index = mode === "changed" ? 2 : 0;
    mutateRows(e, index, rows => { rows[0][mode === "wrong-contract" ? "ExpContractNo" : mode === "missing-witness" ? "id" : "Price"] = mode === "changed" ? 99 : "OTHER"; });
    const result = validate(e, config, selection(), now);
    assert.equal(result.summary.result, "FAIL"); assert.equal(result.privateReport.validationStatus, "rejected");
    assert.ok(result.privateReport.evidence);
    assert.ok(!JSON.stringify(result.summary).includes("OTHER"));
  }
});
test("truncated, reordered, repeated, extra pages and false counters cannot pass", () => {
  const cases: Array<(e: ReturnType<typeof evidence>) => void> = [
    e => { e.pages.pop(); e.reportRequests--; e.httpAttempts--; },
    e => { [e.pages[0], e.pages[1]] = [e.pages[1], e.pages[0]]; },
    e => { e.pages[1] = { ...e.pages[0] }; }, e => { e.pages.push({ ...e.pages[0] }); e.reportRequests++; e.httpAttempts++; },
    e => { e.reportRequests = 0; }, e => { e.httpAttempts = 10; },
    e => mutateRows(e, 0, rows => { rows.pop(); }),
    e => mutateRaw(e, 0, raw => { raw.pageIndex = 2; }),
    e => mutateRaw(e, 0, raw => { raw.dataCount = 201; }),
  ];
  for (const change of cases) { const e = evidence(); change(e); try { assert.equal(validate(e, config, selection(), now).summary.result, "FAIL"); } catch (error) { assert.match(String(error), /payment_contract_/); } }
  const e = evidence(200); e.pages[1] = { ...e.pages[0], page: 2 };
  const failed = validate(e, config, selection(), now).summary;
  assert.ok("code" in failed); assert.equal(failed.code, "payment_contract_repeated_page");
});
test("invalid hash, stale/future timestamp and secret reflection cannot be retained", () => {
  for (const mode of ["hash", "stale", "future", "secret", "secret-metadata"] as const) {
    const e = evidence();
    if (mode === "hash") e.pages[0].rawResponseSha256 = "b".repeat(64);
    if (mode === "stale") e.pages[0].capturedAt = new Date(now - 180001).toISOString();
    if (mode === "future") e.pages[0].capturedAt = new Date(now + 1).toISOString();
    if (mode === "secret") mutateRows(e, 0, rows => { rows[0].CnName = config.password; });
    if (mode === "secret-metadata") mutateRaw(e, 0, raw => { raw.reportObj = { reportId: 6086941, cellList: JSON.stringify([{ token: "must-not-escape" }]) }; });
    assert.throws(() => validate(e, config, selection(), now));
  }
});
test("duplicate source rows are retained and exact decimal text is not rounded", () => {
  const e = evidence();
  for (let i = 0; i < e.pages.length; i++) mutateRows(e, i, rows => { rows[1] = { ...rows[0] }; rows[0].Price = rows[1].Price = "12345678901234567890.12345678901234567890"; });
  const result = validate(e, config, selection(), now);
  assert.equal(result.summary.result, "READ_ONLY_CONTRACT_PROBE_RECORDED");
  assert.ok("contracts" in result.privateReport);
  assert.equal(result.privateReport.contracts?.[0].rows.length, 2);
  assert.equal(result.privateReport.contracts?.[0].rows[0].Price, "12345678901234567890.12345678901234567890");
});
test("selection requires exact two distinct samples from the correct account before worker spawn", async () => {
  for (const bad of [{ ...selection(), targets: [] }, { ...selection(), targets: [selection().targets[0], selection().targets[0]] }]) {
    let called = false;
    await assert.rejects(collectPaymentContracts(config, bad, { spawnWorker: (() => { called = true; throw Error("not reached"); }) as never }));
    assert.equal(called, false);
  }
  assert.throws(() => validate(evidence(), { ...config, username: "another" }, selection(), now), /account_mismatch/);
  const malformed = samples(); malformed.rows[1].salesContractNo = malformed.rows[0].salesContractNo;
  assert.throws(() => selectionFromPrivateSamples(malformed, "a".repeat(64)));
});
test("closed worker failure can retain safe partial pages but not arbitrary error text", () => {
  const e = { ...evidence(), result: "failed", code: "payment_contract_identity_mismatch" };
  const result = validate(e, config, selection(), now);
  assert.ok("code" in result.summary);
  assert.equal(result.summary.code, "payment_contract_identity_mismatch");
  assert.equal(result.privateReport.validationStatus, "rejected");
  assert.throws(() => validate({ ...e, code: config.password }, config, selection(), now));
});
test("exact CLI action and sample hash are required, help/missing action cannot read private files", () => {
  const args = ["--run-read-contracts", "--stdin-config", "--private-output=" + resolve("outputs/synthetic"),
    "--samples-file=" + resolve("outputs/synthetic-samples.json"), "--expected-samples=" + "a".repeat(64)];
  assert.equal(contractProbeArguments(args).expectedSamples, "a".repeat(64));
  for (const a of [[], args.slice(0, 4), [...args, "--page=3"], args.map(s => s === "--run-read-contracts" ? "--run-read-only" : s)])
    assert.throws(() => contractProbeArguments(a));
  const run = spawnSync(process.execPath, ["--import", "tsx", "server/ainuoke-source/payment-request-contract-probe.ts", "--help"], { encoding: "utf8", timeout: 15000 });
  assert.equal(run.status, 0); assert.ok(!run.stdout.includes(config.password));
});
test("actual Python CLI under GBK feeds Node exact contract validation without network", () => {
  const input = { baseUrl: config.baseUrl, transportPolicy: config.transportPolicy, username: config.username, password: config.password,
    action: "read-two-verified-contracts", selection: selection() };
  const code = [
    "import json,sys", "from unittest.mock import patch", "sys.path.insert(0,'tests')",
    "import ainuoke_bridge.payment_request_contract_probe as module", "from test_payment_request_contract_probe import FakeTransport",
    "sys.argv=['contract-probe','--stdin-request']", "with patch.object(module,'ContractTransport',lambda _:FakeTransport(total=101)):",
    "    raise SystemExit(module.main())",
  ].join("\n");
  const result = spawnSync("python", ["-c", code], { cwd: resolve("tools/ainuoke-bridge"), input: JSON.stringify(input), encoding: "utf8",
    env: { ...process.env, PYTHONIOENCODING: "gbk" }, timeout: 15000, maxBuffer: 5 * 1024 * 1024 });
  assert.equal(result.status, 0, result.stderr);
  const accepted = validate(JSON.parse(result.stdout), config, selection(), Date.now());
  assert.equal(accepted.summary.result, "READ_ONLY_CONTRACT_PROBE_RECORDED");
  assert.equal(accepted.summary.reportRequests, 8);
  assert.ok(!JSON.stringify(accepted.summary).includes(config.password));
});
test("existing Windows wrapper rejects absent/conflicting contract scope before credentials", { skip: process.platform !== "win32" }, () => {
  for (const args of [[], ["-ReadContracts"], ["-ReadContracts", "-ReadFirstPage", "-CredentialFile", "not-read"]]) {
    const run = spawnSync("pwsh", ["-NoProfile", "-NonInteractive", "-File", "scripts/ainuoke-payment-request-probe.ps1", ...args],
      { encoding: "utf8", timeout: 15000 });
    assert.equal(run.status, 1); assert.equal(JSON.parse(run.stdout).code, "payment_explicit_scope_required");
  }
});
test("actual protected Windows contract wrapper reaches validated private receipt with synthetic data", { skip: process.platform !== "win32" }, () => {
  const root = mkdtempSync(join(resolve(tmpdir()), "zhixu-contract-wrapper-synthetic-"));
  try {
    const scripts = join(root, "scripts"), entry = join(root, "server/ainuoke-source");
    mkdirSync(scripts); mkdirSync(entry, { recursive: true });
    for (const name of ["ainuoke-live-preflight.ps1", "ainuoke-payment-request-probe.ps1"]) copyFileSync(resolve("scripts", name), join(scripts, name));
    // Diagnostic detail is confined to this owned synthetic fixture, never the product wrapper.
    const wrapper = join(scripts, "ainuoke-payment-request-probe.ps1");
    writeFileSync(wrapper, readFileSync(wrapper, "utf8").replace(/\r\n/g, "\n").replace("} catch {\n    $failureReceipt", () => "} catch {\n    [Console]::Error.WriteLine($_.Exception.GetType().FullName + \u0027: \u0027 + $_.Exception.Message)\n    $failureReceipt"));
    const probeModule = JSON.stringify(pathToFileURL(resolve("server/ainuoke-source/payment-request-contract-probe.ts")).href);
    const writer = JSON.stringify(pathToFileURL(resolve("server/ainuoke-source/live-preflight.ts")).href);
    const hashing = JSON.stringify(pathToFileURL(resolve("server/ainuoke-source/contract.ts")).href);
    const stub = "import {contractProbeArguments,readPrivateSamples,validateContractEvidence} from " + probeModule + ";import {writePrivateReport} from " + writer
      + ";import {hash} from " + hashing + ";const args=contractProbeArguments(process.argv.slice(2));let text='';for await(const c of process.stdin)text+=c;const cfg=JSON.parse(text);"
      + "const selected=readPrivateSamples(args.samplesFile,args.expectedSamples);const captured=" + JSON.stringify(evidence())
      + ";captured.selectionHash=hash(selected);const result=validateContractEvidence(captured,cfg,selected,Date.now());"
      + "const receipt=writePrivateReport(args.privateOutput,result.privateReport,'payment-request');"
      + "console.log(JSON.stringify({...result.summary,toolingCommit:'" + "b".repeat(40) + "',...receipt,evidenceRetained:true}));if(result.summary.result==='FAIL')process.exitCode=1;";
    writeFileSync(join(entry, "payment-request-contract-probe.ts"), stub);
    writeFileSync(join(root, "package.json"), '{"type":"module"}\n'); writeFileSync(join(root, ".gitignore"), "/outputs/\n/node_modules/\n");
    symlinkSync(resolve("node_modules"), join(root, "node_modules"), "junction");
    execFileSync("git", ["init", "--quiet", root], { stdio: "ignore" });
    execFileSync("git", ["-C", root, "add", "."], { stdio: "ignore" });
    execFileSync("git", ["-C", root, "-c", "user.name=Synthetic", "-c", "user.email=synthetic@example.invalid", "-c", "commit.gpgsign=false", "commit", "--quiet", "-m", "synthetic baseline"], { stdio: "ignore" });
    const output = join(root, "outputs"), privateDir = join(output, "synthetic-private"); mkdirSync(privateDir, { recursive: true });
    const sid = execFileSync("pwsh", ["-NoProfile", "-Command", "[Security.Principal.WindowsIdentity]::GetCurrent().User.Value"], { encoding: "utf8" }).trim();
    execFileSync("icacls", [privateDir, "/inheritance:r", "/grant:r", "*" + sid + ":(OI)(CI)F", "*S-1-5-18:(OI)(CI)F"], { stdio: "ignore" });
    const key = join(privateDir, "synthetic-key.txt"), samplePath = join(privateDir, "synthetic-samples.json"), content = JSON.stringify(samples());
    writeFileSync(key, "账号：" + config.username + "\n密码：" + config.password + "\n"); writeFileSync(samplePath, content);
    const run = spawnSync("pwsh", ["-NoProfile", "-NonInteractive", "-File", join(scripts, "ainuoke-payment-request-probe.ps1"),
      "-ReadContracts", "-CredentialFile", key, "-SamplesFile", samplePath, "-ExpectedSamplesHash", sha(content)], { encoding: "utf8", timeout: 30000 });
    const receipt = JSON.parse(run.stdout);
    assert.equal(run.status, 0, JSON.stringify(receipt) + "\n" + run.stderr); assert.equal(receipt.result, "READ_ONLY_CONTRACT_PROBE_RECORDED");
    assert.equal(receipt.evidenceRetained, true); assert.equal(sha(readFileSync(receipt.privateReportPath, "utf8")), receipt.privateReportSha256);
    for (const value of [config.username, config.password, "SYN-APP", "SYN-SALES", "SYN-PUR"]) assert.ok(!run.stdout.includes(value));
  } finally {
    assert.equal(dirname(root), resolve(tmpdir())); assert.match(root, /zhixu-contract-wrapper-synthetic-[^\\/]+$/u); rmSync(root, { recursive: true, force: true });
  }
});

test("JSON numeric lexemes inside encoded dataList survive long decimal precision", () => {
  const e = evidence();
  for (let i = 0; i < e.pages.length; i++) mutateRaw(e, i, raw => {
    raw.dataList = (raw.dataList as string).replaceAll('"Price":1.25', '"Price":12345678901234567890.12345678901234567890');
  });
  const result = validate(e, config, selection(), now);
  assert.ok("contracts" in result.privateReport);
  assert.equal(result.privateReport.contracts[0].rows[0].Price, "12345678901234567890.12345678901234567890");
  assert.throws(() => validate(e, config, selection(), Number.NaN));
});
test("worker result and exit status must agree; malformed and timed-out workers stop", async t => {
  for (const mode of ["success", "bad-exit", "malformed", "timeout"] as const) await t.test(mode, async () => {
    let killed = false, supplied = "";
    const child = new EventEmitter() as EventEmitter & { stdout: PassThrough; stderr: PassThrough; stdin: PassThrough; kill: () => boolean };
    child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.stdin = new PassThrough();
    child.kill = () => { killed = true; return true; };
    child.stdin.on("data", value => { supplied += value; });
    const start = ((_command: string, args: readonly string[]) => {
      assert.deepEqual(args, ["-m", "ainuoke_bridge.payment_request_contract_probe", "--stdin-request"]);
      assert.ok(!args.join(" ").includes(config.password));
      setImmediate(() => {
        if (mode === "timeout") return;
        child.stdout.emit("data", Buffer.from(mode === "malformed" ? "not-json" : JSON.stringify(evidence())));
        child.emit("close", mode === "bad-exit" ? 1 : 0);
      });
      return child;
    }) as unknown as typeof spawn;
    const work = collectPaymentContracts(config, selection(), { spawnWorker: start, timeoutMs: mode === "timeout" ? 10 : 2000 });
    if (mode === "success") assert.equal(validate(await work, config, selection(), now).summary.result, "READ_ONLY_CONTRACT_PROBE_RECORDED");
    else { await assert.rejects(work, /payment_contract_(worker_invalid|timeout)/); assert.equal(killed, true); }
    assert.equal(JSON.parse(supplied).selection.targets.length, 2);
  });
});

test("safe error replies without row metadata remain rejected private evidence", () => {
  const e = { ...evidence(), result: "failed", code: "upstream_schema_error" }; e.pages = e.pages.slice(0, 1); e.httpAttempts=2; e.reportRequests=1;
  const raw=JSON.stringify({reObj:{isOk:false,msg:"SYNTHETIC-PRIVATE-QUERY-ERROR"}});
  e.pages[0].rawReportResponse=raw;e.pages[0].rawResponseSha256=sha(raw);
  const result=validate(e,config,selection(),now);
  assert.equal(result.summary.result,"FAIL");assert.equal(result.privateReport.validationStatus,"rejected");
  assert.ok(!JSON.stringify(result.summary).includes("SYNTHETIC-PRIVATE-QUERY-ERROR"));
});
