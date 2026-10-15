import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn, spawnSync, execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, copyFileSync, writeFileSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { resolve, join, dirname } from "node:path";
import { CANDIDATE_FIELDS, PAYMENT_LIMITS, validatePaymentEvidence, parsePaymentArguments, runPaymentProbe, collectPaymentPage } from "../ainuoke-source/payment-request-probe.js";
import { writePrivateReport } from "../ainuoke-source/live-preflight.js";
import { APPROVED_HTTP_ORIGIN, APPROVED_HTTP_POLICY } from "../ainuoke-source/collector.js";
const config = { sourceKey: "payment-probe-test", baseUrl: APPROVED_HTTP_ORIGIN, transportPolicy: APPROVED_HTTP_POLICY,
  username: "Synthetic-Private-Account", password: "Synthetic-Password-Never-Print", operatorUsername: "not-db-authorized" } as const;
const now = Date.now();
function sample(rows: Array<Record<string, unknown>> = [{ id: 7, BillNo: "SYNTHETIC-PRIVATE-DOC", CnName: "SYNTHETIC-PRIVATE-MATERIAL", Num: 3045, OutStoreNum: 3396, QtyUnit: "个" }], total = 17247) {
  const raw = { reObj: { isOk: true }, dataList: JSON.stringify({ rows }), dataCount: total, pageIndex: 0, pageSize: 0,
    reportObj: { reportId: 6086941, cellList: [{ fieldName: "QtyUnit", title: "采购单位" }] }, totalInfo: { Num: null } };
  return { schemaVersion: "ainuoke-payment-page-evidence.v1", reportId: "6086941", page: 1, pageSize: 100,
    reportedTotal: total, returnedRows: rows.length, fetchedAt: new Date(now).toISOString(), httpAttempts: 2, reportRequests: 1,
    rawReportResponse: JSON.stringify(raw), rawResponseSha256: "" };
}
function seal(evidence: ReturnType<typeof sample>) {
  evidence.rawResponseSha256 = createHash("sha256").update(evidence.rawReportResponse).digest("hex"); return evidence;
}
function changeRaw(evidence: ReturnType<typeof sample>, change: (raw: Record<string, unknown>) => void) {
  const raw: Record<string, unknown> = JSON.parse(evidence.rawReportResponse); change(raw);
  evidence.rawReportResponse = JSON.stringify(raw); return seal(evidence);
}
test("first page summary does not claim mapping, full collection, formula or bank payment", () => {
  const result = validatePaymentEvidence(seal(sample()), config, now);
  assert.equal(CANDIDATE_FIELDS.length, 50); assert.equal(new Set(CANDIDATE_FIELDS).size, 50);
  assert.equal(result.summary.returnedRows, 1); assert.equal(result.summary.allVisibleRecordsRead, false);
  assert.equal(result.summary.firstPageMatchesReportedSize, false); assert.equal(result.summary.mappingVerified, false);
  assert.equal(result.summary.reportIdentityReturned, true); assert.equal(result.summary.columnMetadataReturned, true);
  assert.equal(result.summary.formulaValidation, "not-performed"); assert.equal(result.summary.bankPaymentStatus, "not-inferred");
  assert.deepEqual(result.summary.candidateFieldCoverage.QtyUnit, { present: 1, nonblank: 1 });
  const text = JSON.stringify(result.summary);
  for (const privateValue of [config.username, config.password, "SYNTHETIC-PRIVATE-DOC", "SYNTHETIC-PRIVATE-MATERIAL", "3045", "3396"])
    assert.ok(!text.includes(privateValue), privateValue);
  assert.ok(result.privateReport.rawReportResponse.includes("SYNTHETIC-PRIVATE-DOC"));
});
test("unknown, zero, negative, repeated identities and independent quantity/amount fields retained verbatim", () => {
  const row = { id: 7, QtyUnit: null, bgQtyUnit: "米", Num: 10, OutStoreNum: 12, bgNum: 13, kpNum: 14,
    cgGoodsAmount: "10.010", GoodsAmount: "-1.00", PayAmount: null, YFAmount: 0 };
  const result = validatePaymentEvidence(seal(sample([row, row])), config, now);
  const rows = JSON.parse(JSON.parse(result.privateReport.rawReportResponse).dataList).rows;
  assert.deepEqual(rows, [row, row]); assert.equal(result.privateReport.rowTrace.length, 2);
  assert.deepEqual(result.summary.candidateFieldCoverage.QtyUnit, { present: 2, nonblank: 0 });
  assert.deepEqual(result.summary.candidateFieldCoverage.bgQtyUnit, { present: 2, nonblank: 2 });
  assert.equal(result.summary.unitSemantics, "not-verified");
});
test("original numeric lexemes are authoritative, no float arithmetic performed", () => {
  const evidence = sample(); evidence.rawReportResponse = evidence.rawReportResponse.replace('"Num":null', '"Num":12345678901234567890.12345678901234567890');
  const result = validatePaymentEvidence(seal(evidence), config, now);
  assert.ok(result.privateReport.rawReportResponse.includes("12345678901234567890.12345678901234567890"));
});
test("unknown source field names and values never appear in public receipt", () => {
  const result = validatePaymentEvidence(seal(sample([{ PRIVATE_UNKNOWN_LABEL: "PRIVATE_UNKNOWN_VALUE" }])), config, now);
  assert.equal(result.summary.unrecognizedRowFieldCount, 1);
  assert.ok(!JSON.stringify(result.summary).includes("PRIVATE_UNKNOWN"));
});
test("metadata absence remains absence; exact returned identity mismatches rejected", () => {
  const absent = changeRaw(sample(), raw => { delete raw.reportObj; });
  const summary = validatePaymentEvidence(absent, config, now).summary;
  assert.equal(summary.reportIdentityReturned, false); assert.equal(summary.columnMetadataReturned, false);
  for (const modify of [(raw: Record<string, unknown>) => { raw.reportId = 6087050; },
    (raw: Record<string, unknown>) => { raw.reportObj = { reportId: "6087050" }; }])
    assert.throws(() => validatePaymentEvidence(changeRaw(sample(), modify), config, now), /report_mismatch/);
});
test("bounded evidence blocks malformed, changed page/count, stale/future/hash and excess rows", async t => {
  const changes: Record<string, (e: ReturnType<typeof sample>) => void> = {
    "wrong schema": e => { e.schemaVersion = "foreign"; }, "wrong report": e => { e.reportId = "6087050"; },
    "extra property": e => { Object.assign(e, { extra: "private" }); }, "page2": e => { e.page = 2; },
    "wrong size": e => { e.pageSize = 50; }, "extra request": e => { e.reportRequests = 2; },
    "bad total": e => { e.reportedTotal = -1; }, "fraction total": e => { e.reportedTotal = 1.5; },
    "wrong row count": e => { e.returnedRows = 2; }, "future": e => { e.fetchedAt = new Date(now + 1).toISOString(); },
    "stale": e => { e.fetchedAt = new Date(now - PAYMENT_LIMITS.timeoutMs - 1).toISOString(); },
    "hash mismatch": e => { e.rawResponseSha256 = "0".repeat(64); },
    "raw page2": e => { changeRaw(e, raw => { raw.pageIndex = 2; }); },
    "raw page50": e => { changeRaw(e, raw => { raw.pageSize = 50; }); },
    "raw total": e => { changeRaw(e, raw => { raw.dataCount = 2; }); },
    "bad rows": e => { changeRaw(e, raw => { raw.dataList = '{"rows":[null]}'; }); },
    "bad metadata": e => { changeRaw(e, raw => { raw.reportObj = { cellList: {} }; }); },
    "failed response": e => { changeRaw(e, raw => { raw.reObj = { isOk: false }; }); },
    "oversize": e => { e.rawReportResponse = "x".repeat(PAYMENT_LIMITS.responseBytes + 1); },
  };
  for (const [name, change] of Object.entries(changes)) await t.test(name, () => {
    const e = seal(sample()); change(e); assert.throws(() => validatePaymentEvidence(e, config, now));
  });
  assert.throws(() => validatePaymentEvidence(seal(sample(Array.from({ length: 101 }, () => ({})), 101)), config, now));
});
test("embedded JSON cannot hide secret keys, reflected password or nonfinite values", () => {
  for (const row of [{ token: "private" }, { id: config.password }, { nested: { authorization: "private" } }])
    assert.throws(() => validatePaymentEvidence(seal(sample([row])), config, now), /secret/);
  assert.throws(() => validatePaymentEvidence(changeRaw(sample(), raw => { raw.reportObj = JSON.stringify({ session: "private" }); }), config, now), /secret/);
});
test("approved origin and exact CLI arguments are required before collection", async () => {
  let called = false;
  await assert.rejects(runPaymentProbe({ ...config, baseUrl: "https://example.invalid", transportPolicy: undefined }, { collect: async () => { called = true; return seal(sample()); } }));
  assert.equal(called, false);
  const output = resolve("outputs/synthetic-unused");
  assert.equal(parsePaymentArguments(["--run-read-only", "--stdin-config", "--private-output=" + output]).privateOutput, output);
  for (const args of [[], ["--run-read-only"], ["--run-read-only", "--stdin-config", "--private-output=relative"],
    ["--run-read-only", "--stdin-config", "--private-output=" + output, "--page=2"]])
    assert.throws(() => parsePaymentArguments(args), /explicit_action/);
});
test("collector failures are bounded and do not reflect credentials", async () => {
  await assert.rejects(collectPaymentPage(config, { pythonCommand: "missing-synthetic-python-command", timeoutMs: 2000 }), /worker_unavailable/);
});
test("actual Node/PowerShell help and missing action do not read credentials or connect", () => {
  for (const args of [["--help"], ["--password=" + config.password]]) {
    const result = spawnSync(process.execPath, ["--import", "tsx", "server/ainuoke-source/payment-request-probe.ts", ...args],
      { encoding: "utf8", timeout: 15000, input: "" });
    assert.equal(result.status, args[0] === "--help" ? 0 : 1); assert.ok(!result.stdout.includes(config.password));
    if (args[0] !== "--help") assert.equal(JSON.parse(result.stdout).stage, "arguments");
  }
  if (process.platform !== "win32") return;
  const result = spawnSync("pwsh", ["-NoProfile", "-NonInteractive", "-File", "scripts/ainuoke-payment-request-probe.ps1", "-CredentialFile", "does-not-exist-private"],
    { encoding: "utf8", timeout: 15000 });
  assert.equal(result.status, 1); assert.equal(JSON.parse(result.stdout).code, "payment_explicit_scope_required");
  assert.ok(!result.stdout.includes("does-not-exist-private"));
});
test("private writer uses separate prefix, immutable files and existing ACL checks", () => {
  const parent = resolve("outputs"); mkdirSync(parent, { recursive: true });
  const directory = mkdtempSync(join(parent, "payment-probe-synthetic-"));
  try {
    if (process.platform === "win32") {
      const sid = execFileSync("pwsh", ["-NoProfile", "-Command", "[Security.Principal.WindowsIdentity]::GetCurrent().User.Value"], { encoding: "utf8" }).trim();
      execFileSync("icacls", [directory, "/inheritance:r", "/grant:r", "*" + sid + ":(OI)(CI)F", "*S-1-5-18:(OI)(CI)F"], { stdio: "ignore" });
    } else execFileSync("chmod", ["700", directory]);
    const report = validatePaymentEvidence(seal(sample()), config, now).privateReport;
    const receipt = writePrivateReport(directory, report, "payment-request");
    assert.match(receipt.privateReportPath, /ainuoke-payment-request-private-/);
    assert.equal(receipt.privateReportSha256, createHash("sha256").update(readFileSync(receipt.privateReportPath)).digest("hex"));
    assert.deepEqual(JSON.parse(readFileSync(receipt.privateReportPath, "utf8")), report);
    const second = writePrivateReport(directory, report, "payment-request");
    assert.notEqual(second.privateReportPath, receipt.privateReportPath);
    assert.throws(() => writePrivateReport(directory, report, "untrusted" as "payment-request"));
    assert.throws(() => writePrivateReport(directory, { password: "forbidden" }, "payment-request"));
    const legacy = writePrivateReport(directory, { schemaVersion: "synthetic" });
    assert.match(legacy.privateReportPath, /ainuoke-live-preflight-private-/);
  } finally {
    assert.equal(dirname(directory), parent); assert.match(directory, /payment-probe-synthetic-[^\\/]+$/u);
    rmSync(directory, { recursive: true, force: true });
  }
});

test("actual Python process pipe has fixed arguments, bounded output, timeout and sanitized failure", async t => {
  for (const mode of ["valid", "timeout", "oversize", "invalid-json", "failure"] as const) await t.test(mode, async () => {
    let killed = false, requestedArgs: readonly string[] = [], stdinText = "";
    const child = new EventEmitter() as EventEmitter & { stdout: PassThrough; stderr: PassThrough; stdin: PassThrough; kill: () => boolean };
    child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.stdin = new PassThrough();
    child.kill = () => { killed = true; return true; };
    child.stdin.on("data", value => { stdinText += value; });
    const start = ((_command: string, args: readonly string[]) => {
      requestedArgs = args;
      setImmediate(() => {
        if (mode === "timeout") return;
        if (mode === "oversize") child.stdout.write(Buffer.alloc(PAYMENT_LIMITS.workerBytes + 1));
        else child.stdout.write(mode === "valid" ? JSON.stringify(seal(sample())) : mode === "failure" ? config.password : "invalid");
        child.emit("close", mode === "failure" ? 1 : 0);
      });
      return child;
    }) as unknown as typeof spawn;
    const promise = collectPaymentPage(config, { spawnWorker: start, timeoutMs: 50 });
    if (mode === "valid") assert.deepEqual(await promise, seal(sample()));
    else await assert.rejects(promise, error => error instanceof Error && !error.message.includes(config.password));
    assert.deepEqual(requestedArgs, ["-m", "ainuoke_bridge.payment_request_probe", "--stdin-request"]);
    assert.equal(JSON.parse(stdinText).action, "read-first-page-only");
    assert.ok(!requestedArgs.join(" ").includes(config.password));
    if (mode === "timeout" || mode === "oversize") assert.equal(killed, true);
  });
});
test("actual Windows private wrapper consumes only synthetic protected file and reaches Node validation", { skip: process.platform !== "win32" }, () => {
  const root = mkdtempSync(join(resolve(tmpdir()), "zhixu-payment-wrapper-synthetic-"));
  try {
    const scripts = join(root, "scripts"), entry = join(root, "server/ainuoke-source");
    mkdirSync(scripts); mkdirSync(entry, { recursive: true });
    for (const name of ["ainuoke-live-preflight.ps1", "ainuoke-payment-request-probe.ps1"]) copyFileSync(resolve("scripts", name), join(scripts, name));
    writeFileSync(join(entry, "payment-request-probe.ts"), "import {main} from " + JSON.stringify(pathToFileURL(resolve("server/ainuoke-source/payment-request-probe.ts")).href) + "; await main();\n");
    writeFileSync(join(root, "package.json"), '{"type":"module"}\n');
    writeFileSync(join(root, ".gitignore"), "/outputs/\n/node_modules/\n");
    symlinkSync(resolve("node_modules"), join(root, "node_modules"), "junction");
    execFileSync("git", ["init", "--quiet", root], { stdio: "ignore" });
    execFileSync("git", ["-C", root, "add", ".gitignore", "package.json", "scripts", "server"], { stdio: "ignore" });
    execFileSync("git", ["-C", root, "-c", "user.name=Synthetic", "-c", "user.email=synthetic@example.invalid", "-c", "commit.gpgsign=false", "commit", "--quiet", "-m", "synthetic baseline"], { stdio: "ignore" });
    const output = join(root, "outputs"); mkdirSync(output);
    const key = join(output, "synthetic-key.txt"); writeFileSync(key, "账号：合成\n密码： \n");
    const sid = execFileSync("pwsh", ["-NoProfile", "-Command", "[Security.Principal.WindowsIdentity]::GetCurrent().User.Value"], { encoding: "utf8" }).trim();
    execFileSync("icacls", [key, "/inheritance:r", "/grant:r", "*" + sid + ":F", "*S-1-5-18:F"], { stdio: "ignore" });
    const run = () => spawnSync("pwsh", ["-NoProfile", "-NonInteractive", "-File", join(scripts, "ainuoke-payment-request-probe.ps1"), "-ReadFirstPage", "-CredentialFile", key],
      { encoding: "utf8", timeout: 30000, env: { ...process.env, DATABASE_URL: "postgresql://never-connect.invalid:1/no-real-db" } });
    const result = run();
    assert.equal(result.status, 1); assert.equal(JSON.parse(result.stdout).stage, "configuration");
    assert.equal(JSON.parse(result.stdout).code, "invalid_collector_configuration");
    assert.ok(!result.stdout.includes("合成")); assert.ok(!result.stdout.includes(key));
    // Exercise only the wrapper's closed failure forwarding; this stub never imports a collector or makes HTTP calls.
    const simulatedFailure = { schemaVersion: "ainuoke-payment-request-probe.v1", result: "FAIL", code: "network_unavailable",
      stage: "collection", workerStage: "login", httpAttempts: 1, reportRequests: 0, databaseAccess: "none", sourceActivation: "not-activated", unsafeRaw: config.password };
    writeFileSync(join(entry, "payment-request-probe.ts"), "process.stdout.write(" + JSON.stringify(JSON.stringify(simulatedFailure) + "\n") + "); process.exitCode=1;\n");
    execFileSync("git", ["-C", root, "add", "server"], { stdio: "ignore" });
    execFileSync("git", ["-C", root, "-c", "user.name=Synthetic", "-c", "user.email=synthetic@example.invalid", "-c", "commit.gpgsign=false", "commit", "--quiet", "-m", "synthetic failure protocol"], { stdio: "ignore" });
    const diagnostic = run(); const details = JSON.parse(diagnostic.stdout);
    assert.equal(diagnostic.status, 1); assert.equal(details.code, "network_unavailable");
    assert.equal(details.workerStage, "login"); assert.equal(details.httpAttempts, 1); assert.equal(details.reportRequests, 0);
    assert.ok(!diagnostic.stdout.includes(config.password)); assert.equal("unsafeRaw" in details, false);
    execFileSync("icacls", [key, "/grant", "*S-1-1-0:R"], { stdio: "ignore" });
    const rejected = run(); assert.equal(rejected.status, 1); assert.equal(JSON.parse(rejected.stdout).stage, "credential_file");
  } finally {
    assert.equal(dirname(root), resolve(tmpdir())); assert.match(root, /zhixu-payment-wrapper-synthetic-[^\\/]+$/u);
    rmSync(root, { recursive: true, force: true });
  }
});

test("closed worker failures preserve useful categories and reject forged/private details", async () => {
  const getError = async (value: unknown) => {
    const child = new EventEmitter() as EventEmitter & { stdout: PassThrough; stderr: PassThrough; stdin: PassThrough; kill: () => boolean };
    child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.stdin = new PassThrough(); child.kill = () => true; child.stdin.resume();
    const start = (() => { setImmediate(() => { child.stdout.write(JSON.stringify(value)); child.emit("close", 1); }); return child; }) as unknown as typeof spawn;
    try { await collectPaymentPage(config, { spawnWorker: start, timeoutMs: 1000 }); assert.fail("must fail"); }
    catch (error) { assert.ok(error instanceof Error); return error; }
  };
  const baseline = { schemaVersion: "ainuoke-payment-page-failure.v1", code: "network_unavailable", workerStage: "login", httpAttempts: 1, reportRequests: 0 };
  const valid = await getError(baseline); assert.equal(valid.message, "network_unavailable");
  for (const change of [{ code: config.password }, { httpAttempts: 3 }, { reportRequests: 2 }, { extra: config.password }, { workerStage: config.password }, { httpAttempts: 0 }]) {
    const invalid = await getError({ ...baseline, ...change }); assert.equal(invalid.message, "payment_probe_failed");
    assert.ok(!invalid.message.includes(config.password));
  }
});

test("optional/encoded report and column metadata are representation only, original raw remains authoritative", () => {
  const cases: unknown[] = [null, "", "   ", { cellList: null }, { cellList: "" }, { cellList: " [] " },
    { reportId: 6086941, cellList: JSON.stringify([{ fieldName: "QtyUnit" }]) },
    JSON.stringify({ reportId: 6086941, cellList: JSON.stringify([{ fieldName: "QtyUnit" }]) })];
  for (const value of cases) {
    const evidence = changeRaw(sample(), raw => { raw.reportObj = value; });
    const result = validatePaymentEvidence(evidence, config, now);
    assert.equal(result.privateReport.rawReportResponse, evidence.rawReportResponse);
    assert.equal(result.summary.mappingVerified, false);
    assert.equal(result.summary.columnMetadataReturned, Boolean(value && (typeof value === "string" && value.trim() || typeof value === "object" && (value as Record<string, unknown>).cellList && String((value as Record<string, unknown>).cellList).trim())) );
  }
});
test("malformed metadata stays blocked with precise codes, encoded identity and secrets cannot bypass", () => {
  for (const [value, code] of [["invalid", "payment_probe_report_metadata_invalid_json"], [[], "payment_probe_report_metadata_shape"],
    [{ cellList: "invalid" }, "payment_probe_column_metadata_invalid_json"], [{ cellList: {} }, "payment_probe_column_metadata_shape"]] as const) {
    assert.throws(() => validatePaymentEvidence(changeRaw(sample(), raw => { raw.reportObj = value; }), config, now), new RegExp(code));
  }
  assert.throws(() => validatePaymentEvidence(changeRaw(sample(), raw => { raw.reportObj = JSON.stringify({ reportId:6087050, cellList:"[]" }); }), config, now), /report_mismatch/);
  assert.throws(() => validatePaymentEvidence(changeRaw(sample(), raw => { raw.reportObj = { cellList: JSON.stringify([{ password:"must-not-pass" }]) }; }), config, now), /secret/);
});
