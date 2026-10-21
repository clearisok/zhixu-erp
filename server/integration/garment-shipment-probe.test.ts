import assert from "node:assert/strict";
import { spawn, spawnSync, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { parseCollectorConfig } from "../ainuoke-source/collector.js";
import {
  collectGarmentCandidate, GARMENT_PROBE_ACTION, GARMENT_PROBE_LIMITS, parseGarmentProbeArguments,
  rejectedGarmentCandidate, validateGarmentCandidate,
} from "../ainuoke-source/garment-shipment-probe.js";

const config = parseCollectorConfig({ sourceKey: "synthetic-garment-probe", baseUrl: "http://61.164.81.194:9043", transportPolicy: "user-approved-http-d109",
  username: "synthetic-account", password: "Synthetic-Secret-Only", operatorUsername: "readonly-no-db-authorization" });
const now = Date.parse("2026-10-21T00:00:00Z");
function evidence(patch: Record<string, unknown> = {}, rawPatch: Record<string, unknown> = {}) {
  const raw = { reObj: { isOk: true }, dataList: JSON.stringify({ rows: [{ id: 1, InsideOrderNo: "D1935-other-contract", CandidateQty: null,
    CandidateDate: "", CandidateDecimal: "12345678901234567890.123456789" }] }), dataCount: 200, pageIndex: 0, pageSize: 0,
    reportObj: JSON.stringify({ reportId: 6086979, cellList: JSON.stringify([{ fieldName: "CandidateQty" }]) }), ...rawPatch };
  const text = JSON.stringify(raw);
  return { schemaVersion: "ainuoke-garment-shipment-candidate-page.v1", reportId: "6086979", queryContext: { insideOrderNo: "D1935" },
    page: 1, pageSize: 100, reportedTotal: 200, returnedRows: 1, fetchedAt: new Date(now).toISOString(), httpAttempts: 2, reportRequests: 1,
    rawReportResponse: text, rawResponseSha256: createHash("sha256").update(text).digest("hex"), ...patch };
}

test("candidate evidence does not promote a contains result to contract, quantity or shipment semantics", () => {
  const input = evidence(), original = structuredClone(input);
  const result = validateGarmentCandidate(input, config, now);
  assert.deepEqual(input, original);
  assert.equal(result.summary.reportedTotal, 200); assert.equal(result.summary.returnedRows, 1);
  assert.equal(result.summary.allVisibleRecordsRead, false);
  assert.equal(result.summary.stableContractIdentity, "not-verified"); assert.equal(result.summary.shipmentDateMeaning, "not-verified");
  assert.equal(result.summary.shipmentQuantityMeaning, "not-verified"); assert.equal(result.summary.mappingVerified, false);
  assert.equal(result.privateReport.rawReportResponse, input.rawReportResponse);
  const summary = JSON.stringify(result.summary);
  for (const privateValue of ["D1935-other-contract", "12345678901234567890.123456789", config.password, config.username]) assert.ok(!summary.includes(privateValue));
  assert.ok(result.summary.rowFields.includes("CandidateQty"));
  assert.equal(result.summary.databaseAccess, "none"); assert.equal(result.summary.sourceActivation, "not-activated");
});

test("exact scope, counts, timestamps, pagination and hash cannot be changed by a worker frame", () => {
  for (const patch of [{ reportId: "6087050" }, { page: 2 }, { pageSize: 101 }, { queryContext: { insideOrderNo: "D19350" } },
    { queryContext: { insideOrderNo: "D1935", salesContractNo: "PRIVATE" } }, { httpAttempts: 3 }, { reportRequests: 2 },
    { rawResponseSha256: "0".repeat(64) }, { reportedTotal: 1 }, { returnedRows: 0 }, { returnedRows: true },
    { fetchedAt: new Date(now + 1).toISOString() }, { fetchedAt: new Date(now - 120001).toISOString() }, { actorId: "forged" }])
    assert.throws(() => validateGarmentCandidate(evidence(patch), config, now));
  for (const patch of [{ reportObj: { reportId: 6087050 } }, { pageIndex: 2 }, { pageSize: 50 }, { reObj: { isOk: false } },
    { dataList: '{"rows":null}' }, { reportObj: { cellList: "PRIVATE-NOT-JSON" } }]) {
    assert.throws(() => validateGarmentCandidate(evidence({}, patch), config, now), error => error instanceof Error && !error.message.includes("PRIVATE-NOT-JSON"));
  }
});

test("missing metadata and unknown values remain unknown; duplicate rows are not deduplicated", () => {
  const dataList = JSON.stringify({ rows: [{ id: 1, Qty: 0, Date: null }, { id: 1, Qty: 0, Date: null }] });
  const input = evidence({ returnedRows: 2 }, { dataList, reportObj: "" });
  const result = validateGarmentCandidate(input, config, now);
  assert.equal(result.summary.reportIdentityReturned, false); assert.equal(result.summary.columnCount, null);
  assert.equal(result.summary.returnedRows, 2); assert.equal(result.privateReport.rawReportResponse, input.rawReportResponse);
  assert.equal(result.summary.businessMeaningVerified, false);
});

test("an explicit unknown total cannot fall back to a different count", () => {
  const dataList = JSON.stringify({ rows: [{ id: 1 }], total: "200" });
  assert.throws(() => validateGarmentCandidate(evidence({}, { dataList, dataCount: null }), config, now));
  const input = evidence({}, { dataList });
  const raw = JSON.parse(input.rawReportResponse) as Record<string, unknown>;
  delete raw.dataCount;
  input.rawReportResponse = JSON.stringify(raw);
  input.rawResponseSha256 = createHash("sha256").update(input.rawReportResponse).digest("hex");
  assert.equal(validateGarmentCandidate(input, config, now).summary.reportedTotal, 200);
});

test("blank or JSON-encoded column metadata follows Python semantics without changing raw evidence", () => {
  for (const cellList of ["", " \t\r\n", null]) {
    const input = evidence({}, { reportObj: JSON.stringify({ reportId: 6086979, cellList }) });
    const result = validateGarmentCandidate(input, config, now);
    assert.equal(result.summary.columnCount, null);
    assert.equal(result.privateReport.rawReportResponse, input.rawReportResponse);
    assert.equal(rejectedGarmentCandidate(input, config, "shipment_probe_invalid_evidence").rawReportResponse, input.rawReportResponse);
  }
});

test("secrets and forbidden fields cannot hide in encoded rows, columns or metadata", () => {
  for (const raw of [{ dataList: JSON.stringify({ rows: [{ password: "PRIVATE" }] }) },
    { dataList: JSON.stringify({ rows: [{ id: config.password }] }) }, { reportObj: JSON.stringify({ reportId: 6086979, cookie: "PRIVATE" }) },
    { reportObj: { reportId: 6086979, cellList: JSON.stringify([{ sessionId: "PRIVATE" }]) } }])
    assert.throws(() => validateGarmentCandidate(evidence({}, raw), config, now));
});

test("bounded safe rejected evidence can be retained for offline repair without another upstream request", () => {
  const input = evidence({ reportedTotal: 999 });
  assert.throws(() => validateGarmentCandidate(input, config, now));
  const rejected = rejectedGarmentCandidate(input, config, "shipment_probe_invalid_evidence");
  assert.equal(rejected.validationStatus, "rejected"); assert.equal(rejected.mappingVerified, false);
  assert.equal(rejected.rawReportResponse, input.rawReportResponse);
  for (const patch of [{ queryContext: { insideOrderNo: "OTHER" } }, { rawResponseSha256: "0".repeat(64) },
    { rawReportResponse: "not-json" }, { reportId: "6086941" }])
    assert.throws(() => rejectedGarmentCandidate({ ...input, ...patch }, config, "shipment_probe_invalid_evidence"));
  assert.throws(() => rejectedGarmentCandidate(evidence({}, { dataList: JSON.stringify({ rows: [{ id: config.password }] }) }), config, "shipment_probe_invalid_evidence"));
});

const fakeWorker = (program: string): typeof spawn => ((_command: string, _args: readonly string[], options: Record<string, unknown>) =>
  spawn(process.execPath, ["-e", program], { ...options, cwd: process.cwd(), stdio: ["pipe", "pipe", "pipe"] })) as typeof spawn;

test("child receives only stdin credentials and fixed action, not a caller report or page", async () => {
  const frame = evidence();
  const program = `let input='';process.stdin.on('data',b=>input+=b);process.stdin.on('end',()=>{const v=JSON.parse(input);
    if(v.action!==${JSON.stringify(GARMENT_PROBE_ACTION)} || Object.keys(v).sort().join(',')!=='action,baseUrl,password,transportPolicy,username')process.exit(9);
    process.stdout.write(${JSON.stringify(JSON.stringify(frame))});});`;
  const received = await collectGarmentCandidate(config, { spawnWorker: fakeWorker(program) });
  assert.deepEqual(received, frame);
});

test("worker failures have closed metadata and no raw stderr or exception text", async () => {
  const frame = { schemaVersion: "ainuoke-garment-shipment-candidate-failure.v1", code: "auth_expired", workerStage: "report", httpAttempts: 2, reportRequests: 1 };
  const program = `process.stdin.resume();process.stdin.on('end',()=>{process.stderr.write('PRIVATE-MUST-NOT-REFLECT');process.stdout.write(${JSON.stringify(JSON.stringify(frame))});process.exitCode=1;});`;
  await assert.rejects(collectGarmentCandidate(config, { spawnWorker: fakeWorker(program) }), error => error instanceof Error && error.message === "auth_expired");
  for (const changed of [{ ...frame, code: "PRIVATE" }, { ...frame, httpAttempts: 3 }, { ...frame, workerStage: "validation", reportRequests: 0 }]) {
    const script = `process.stdin.resume();process.stdin.on('end',()=>{process.stdout.write(${JSON.stringify(JSON.stringify(changed))});process.exitCode=1;});`;
    await assert.rejects(collectGarmentCandidate(config, { spawnWorker: fakeWorker(script) }), { message: "shipment_probe_worker_failed" });
  }
});

test("timeout, invalid UTF-8 and oversized child output stop without retry", async () => {
  await assert.rejects(collectGarmentCandidate(config, { timeoutMs: 50, spawnWorker: fakeWorker("process.stdin.resume();setTimeout(()=>{},10000)") }), { message: "shipment_probe_timeout" });
  await assert.rejects(collectGarmentCandidate(config, { spawnWorker: fakeWorker("process.stdin.resume();process.stdin.on('end',()=>process.stdout.write(Buffer.from([255])))") }), { message: "shipment_probe_worker_encoding" });
  await assert.rejects(collectGarmentCandidate(config, { spawnWorker: fakeWorker(`process.stdin.resume();process.stdin.on('end',()=>process.stdout.write('x'.repeat(${GARMENT_PROBE_LIMITS.workerBytes + 1})))`) }), { message: "shipment_probe_output_limit" });
});

test("CLI scope is fixed, explicit and private; unsupported password flags never reach collection", () => {
  const output = resolve("outputs/synthetic-garment-private");
  assert.equal(parseGarmentProbeArguments(["--read-6086979-d1935-first-page", "--stdin-config", "--private-output=" + output]).privateOutput, output);
  for (const args of [[], ["--run-read-only", "--stdin-config", "--private-output=" + output],
    ["--read-6086979-d1935-first-page", "--stdin-config", "--private-output=relative"],
    ["--read-6086979-d1935-first-page", "--stdin-config", "--private-output=" + output, "--page=2"]]) assert.throws(() => parseGarmentProbeArguments(args));
  const result = spawnSync(process.execPath, ["--import", "tsx", "server/ainuoke-source/garment-shipment-probe.ts", "--password=PRIVATE"], { encoding: "utf8", timeout: 15000 });
  assert.equal(result.status, 1);
  const receipt = JSON.parse(result.stdout);
  assert.equal(receipt.code, "shipment_probe_explicit_action_required"); assert.equal(receipt.databaseAccess, "none");
  assert.ok(!result.stdout.includes("PRIVATE"));
});

test("Windows private wrapper uses actual Node validation before network and rejects broad credential ACL", { skip: process.platform !== "win32" }, () => {
  const root = mkdtempSync(join(resolve(tmpdir()), "zhixu-garment-wrapper-synthetic-"));
  try {
    const scripts = join(root, "scripts"), entry = join(root, "server/ainuoke-source");
    mkdirSync(scripts); mkdirSync(entry, { recursive: true });
    for (const file of ["ainuoke-garment-shipment-probe.ps1", "ainuoke-live-preflight.ps1"]) copyFileSync(resolve("scripts", file), join(scripts, file));
    writeFileSync(join(entry, "garment-shipment-probe.ts"), "import {main} from " + JSON.stringify(pathToFileURL(resolve("server/ainuoke-source/garment-shipment-probe.ts")).href) + "; await main();\n");
    writeFileSync(join(root, "package.json"), '{"type":"module"}\n'); writeFileSync(join(root, ".gitignore"), "/outputs/\n/node_modules/\n");
    symlinkSync(resolve("node_modules"), join(root, "node_modules"), "junction");
    execFileSync("git", ["init", "--quiet", root], { stdio: "ignore" });
    execFileSync("git", ["-C", root, "add", ".gitignore", "package.json", "scripts", "server"], { stdio: "ignore" });
    execFileSync("git", ["-C", root, "-c", "user.name=Synthetic Test", "-c", "user.email=synthetic@example.invalid", "-c", "commit.gpgsign=false", "commit", "--quiet", "-m", "synthetic baseline"], { stdio: "ignore" });
    const output = join(root, "outputs"); mkdirSync(output);
    const key = join(output, "synthetic-credential.txt"); writeFileSync(key, "账号：合成测试\n密码： \n", "utf8");
    const sid = execFileSync("pwsh", ["-NoProfile", "-Command", "[Security.Principal.WindowsIdentity]::GetCurrent().User.Value"], { encoding: "utf8" }).trim();
    execFileSync("icacls", [key, "/inheritance:r", "/grant:r", "*" + sid + ":F", "*S-1-5-18:F"], { stdio: "ignore" });
    const run = () => spawnSync("pwsh", ["-NoProfile", "-NonInteractive", "-File", join(scripts, "ainuoke-garment-shipment-probe.ps1"), "-ReadFirstPage", "-CredentialFile", key],
      { cwd: tmpdir(), env: { ...process.env, DATABASE_URL: "postgresql://never-connect.invalid:1/real-business" }, encoding: "utf8", timeout: 60000 });
    const first = run(); assert.equal(first.status, 1);
    const receipt = JSON.parse(first.stdout);
    assert.equal(receipt.code, "invalid_collector_configuration"); assert.equal(receipt.stage, "configuration");
    assert.equal(receipt.databaseAccess, "none"); assert.equal(receipt.sourceActivation, "not-activated"); assert.ok(!first.stdout.includes("合成测试"));
    execFileSync("icacls", [key, "/grant", "*S-1-1-0:R"], { stdio: "ignore" });
    const second = run(); assert.equal(second.status, 1);
    const rejected = JSON.parse(second.stdout);
    assert.equal(rejected.code, "shipment_private_credential_invalid"); assert.equal(rejected.stage, "credential_file");
  } finally {
    assert.equal(dirname(root), resolve(tmpdir())); assert.match(root, /zhixu-garment-wrapper-synthetic-[^\\/]+$/u);
    rmSync(root, { recursive: true, force: true });
  }
});
