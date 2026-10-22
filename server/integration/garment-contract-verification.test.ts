import assert from "node:assert/strict";
import { spawn, spawnSync, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { accountFingerprint, parseCollectorConfig } from "../ainuoke-source/collector.js";
import { hash } from "../ainuoke-source/contract.js";
import { strictExactSourceJson } from "../ainuoke-source/exact-source-json.js";
import { collectGarmentFilter, GARMENT_FILTER_ACTION, GARMENT_FILTER_LIMITS, parseGarmentFilterArguments,
  selectionFromGarmentCandidate, validateGarmentFilterEvidence, type GarmentFilterSelection } from "../ainuoke-source/garment-contract-verification.js";

const config = parseCollectorConfig({ sourceKey: "synthetic-filter", baseUrl: "http://61.164.81.194:9043", transportPolicy: "user-approved-http-d109",
  username: "synthetic-user", password: "Synthetic-Only-Private", operatorUsername: "readonly-no-db-authorization" });
const now = Date.parse("2026-10-22T00:00:03Z"), digest = (v: string) => createHash("sha256").update(v).digest("hex");
const row = { id: "9007199254740993", billno: "SYNTHETIC-D1", ExpContractNo: "SYNTHETIC-C1", insideorderno: "D1933",
  Num: "12345678901234567890.123456789", outdate: "2026-10-11", CnColor: "合成红", QtyUnit: "件" };
function raw(rows: unknown[] = [row], patch: Record<string, unknown> = {}) {
  return JSON.stringify({ reObj: { isOk: true }, dataList: JSON.stringify({ rows, total: rows.length }), dataCount: rows.length,
    pageIndex: 0, pageSize: 0, reportObj: JSON.stringify({ reportId: 6086979, cellList: [] }), ...patch });
}
function candidate(text = raw(), patch: Record<string, unknown> = {}) {
  return { schemaVersion: "ainuoke-garment-shipment-candidate-private.v1", reportId: "6086979", queryContext: { insideOrderNo: "D1933" },
    sourceFingerprint: accountFingerprint(config), databaseAccess: "none", sourceActivation: "not-activated", mappingVerified: false, businessMeaningVerified: false,
    capturedAt: "2026-10-21T00:00:00Z", page: 1, pageSize: 100, rawResponseSha256: digest(text), rawReportResponse: text,
    rawNumericTextIsAuthoritative: true, toolingCommit: "c".repeat(40), ...patch };
}
const selection = selectionFromGarmentCandidate(candidate(), "a".repeat(64));
function evidence(texts = [raw(), raw([]), raw()], patch: Record<string, unknown> = {}) {
  return { schemaVersion: "ainuoke-garment-filter-evidence.v1", result: "complete", code: null, workerStage: "validation",
    selectionHash: hash(selection), httpAttempts: 4, reportRequests: 3, pages: texts.map((text, i) => ({ sequence: i + 1, alias: i === 1 ? "C0" : "C1",
      capturedAt: new Date(now - 2000 + i * 1000).toISOString(), rawReportResponse: text, rawResponseSha256: digest(text) })), ...patch };
}
const validate = (input: unknown, target: GarmentFilterSelection = selection) => validateGarmentFilterEvidence(input, config, target, now);

test("lossless parser keeps number text and rejects decoded duplicate keys at any nesting", () => {
  assert.deepEqual(strictExactSourceJson('{"n":9007199254740993,"d":1.230000,"a":[{"x":-0}]}'), { n: "9007199254740993", d: "1.230000", a: [{ x: "-0" }] });
  for (const text of ['{"a":1,"a":2}', '{"a":1,"\\u0061":2}', '[{"x":1,"x":1}]', '{"a":{"b":0,"b":0}}', '{"a":NaN}', '{"a":1} trailing']) assert.throws(() => strictExactSourceJson(text));
});
test("old candidate chooses one exact contract and witness without applying new-capture freshness", () => {
  const original = candidate(), copy = structuredClone(original);
  assert.equal(selection.salesContractNo, row.ExpContractNo); assert.deepEqual(selection.witness, { id: row.id, billno: row.billno });
  assert.equal(selection.sourceFingerprint, accountFingerprint(config)); assert.deepEqual(original, copy);
  for (const changed of [candidate(raw([row, { ...row, id: "second", ExpContractNo: "OTHER" }])), candidate(raw([row, row])), candidate(raw([])),
    candidate(raw([{ ...row, ExpContractNo: "" }])), candidate(raw([{ ...row, insideorderno: "D1935" }])), candidate(raw(), { page: 2 }),
    candidate(raw(), { queryContext: { insideOrderNo: "D1933", salesContractNo: "EXTRA" } }), candidate(raw(), { rawResponseSha256: "0".repeat(64) })])
    assert.throws(() => selectionFromGarmentCandidate(changed, "a".repeat(64)));
});
test("public scoped proof contains aliases and hashes, never source rows or a publishable business snapshot", () => {
  const input = evidence(), original = structuredClone(input), result = validate(input);
  assert.deepEqual(input, original); assert.equal(result.summary.result, "SCOPED_FILTER_OBSERVED"); assert.equal(result.summary.positiveRows, 1);
  assert.equal(result.summary.businessSnapshotPublication, "not-performed"); assert.equal(result.summary.universalFilterSemanticsVerified, false);
  assert.equal(result.privateReport.evidence, input); assert.equal(result.privateReport.selection, selection);
  for (const privateText of [config.username, config.password, row.ExpContractNo, row.id, row.billno, row.Num, row.CnColor]) assert.ok(!JSON.stringify(result.summary).includes(privateText));
  assert.ok(!Object.hasOwn(result, "snapshotInputs"));
});
test("native JSON numbers in encoded source rows keep their exact decimal and identity text", () => {
  const response = JSON.parse(raw());
  response.dataList = response.dataList.replace('"id":"9007199254740993"', '"id":9007199254740993').replace('"Num":"12345678901234567890.123456789"', '"Num":12345678901234567890.123456789');
  const text = JSON.stringify(response), result = validate(evidence([text, raw([]), text]));
  assert.equal(result.summary.result, "SCOPED_FILTER_OBSERVED");
  assert.ok(JSON.stringify(result.privateReport).includes("12345678901234567890.123456789"));
});
test("ordinary bracket business labels remain text while valid encoded JSON is screened strictly", () => {
  for (const label of ["[待核]", "{测试款}", "[内层]", "{not-json"]) {
    const text = raw([{ ...row, remark: label }]);
    assert.equal(validate(evidence([text, raw([]), text])).summary.result, "SCOPED_FILTER_OBSERVED");
    assert.equal(selectionFromGarmentCandidate(candidate(text), "a".repeat(64)).salesContractNo, row.ExpContractNo);
  }
  assert.throws(() => validate(evidence([raw([{ ...row, remark: '{"x":1,"x":1}' }]), raw([]), raw()])));
});
function nestedMetadata(levels: number, leaf: unknown = "合成配置") {
  let layout = leaf;
  for (let index = 0; index < levels; index += 1) layout = index % 2 ? [layout] : { child: layout };
  return raw([row], { reportObj: JSON.stringify({ reportId: 6086979, cellList: [], layout: JSON.stringify(layout) }) });
}
test("encoded report configuration may reach object depth13 and combined depth19 without weakening scope", () => {
  const text = nestedMetadata(13), frozen = candidate(text), original = structuredClone(frozen);
  assert.equal(selectionFromGarmentCandidate(frozen, "a".repeat(64)).salesContractNo, row.ExpContractNo);
  assert.deepEqual(frozen, original);
  assert.equal(validate(evidence([text, raw([]), text])).summary.result, "SCOPED_FILTER_OBSERVED");
});
test("combined wrapper, object and encoded JSON depth is bounded at64 before credentials", () => {
  assert.equal(selectionFromGarmentCandidate(candidate(nestedMetadata(58)), "a".repeat(64)).salesContractNo, row.ExpContractNo);
  assert.throws(() => selectionFromGarmentCandidate(candidate(nestedMetadata(59)), "a".repeat(64)), { message: "garment_filter_structure_limit" });
});
test("deep report configuration still rejects secret keys, reflected secrets and decoded duplicate keys", () => {
  for (const leaf of [{ token: "SYNTHETIC-SECRET" }, [{ cookie: "SYNTHETIC-SECRET" }], { ordinary: config.password }, '{"a":1,"\\u0061":2}']) {
    const text = nestedMetadata(13, leaf);
    assert.throws(() => validate(evidence([text, raw([]), text])));
  }
  assert.throws(() => selectionFromGarmentCandidate(candidate(nestedMetadata(13, { authorization: "SYNTHETIC-SECRET" })), "a".repeat(64)), { message: "source_secret_field" });
});
test("encoded metadata numbers beyond interpreter conversion limits remain exact text", () => {
  const huge = "9".repeat(4500), metadata = '{"reportId":6086979,"cellList":[],"layout":"{\\"huge\\":' + huge + '}"}';
  const text = raw([row], { reportObj: metadata });
  assert.equal(selectionFromGarmentCandidate(candidate(text), "a".repeat(64)).salesContractNo, row.ExpContractNo);
  assert.equal(validate(evidence([text, raw([]), text])).summary.result, "SCOPED_FILTER_OBSERVED");
});
test("parent independently checks the full page, exact contract, control and second-pass contents", () => {
  for (const [texts, code] of [
    [[raw([{ ...row, ExpContractNo: "SYNTHETIC-C10" }]), raw([]), raw()], "garment_filter_contract_mismatch"],
    [[raw(), raw(), raw()], "garment_filter_control_nonempty"],
    [[raw(), raw([]), raw([{ ...row, Num: "123" }])], "garment_filter_source_changed"],
    [[raw(), raw([]), raw([{ ...row, id: "missing-witness" }])], "garment_filter_witness_missing"],
    [[raw([row, row]), raw([]), raw([row, row])], "garment_filter_duplicate_row"],
    [[raw([], { dataCount: null }), raw([]), raw()], "garment_filter_count_mismatch"],
    [[raw([], { dataCount: 101 }), raw([]), raw()], "garment_filter_count_mismatch"],
    [[raw([row], { pageIndex: 2 }), raw([]), raw()], "garment_filter_page_mismatch"],
    [[raw([row], { reportObj: '{"reportId":6086941}' }), raw([]), raw()], "garment_filter_report_mismatch"],
  ] as const) {
    const result = validate(evidence([...texts])); assert.equal(result.summary.result, "FAIL"); assert.equal(result.summary.code, code);
    assert.equal(result.privateReport.validationStatus, "rejected");
  }
  const rows = [row, { ...row, id: "second" }];
  assert.equal(validate(evidence([raw(rows), raw([]), raw([...rows].reverse())])).summary.result, "SCOPED_FILTER_OBSERVED");
});
test("safe failed pages retain actual request counts but not a success claim", () => {
  const frame = evidence([raw()], { result: "failed", code: "network_unavailable", httpAttempts: 3, reportRequests: 2, workerStage: "report" });
  const result = validate(frame);
  assert.equal(result.summary.code, "network_unavailable"); assert.equal(result.summary.reportRequests, 2); assert.equal(result.summary.retainedPages, 1);
  assert.equal(result.summary.positiveRows, null);
  for (const patch of [{ httpAttempts: 5 }, { reportRequests: 4 }, { selectionHash: "0".repeat(64) }, { actorId: "forged" }, { code: "PRIVATE" }, { workerStage: "invented" }]) assert.throws(() => validate({ ...frame, ...patch }));
});
test("frame scope, time, hash and secret checks cannot be bypassed by worker metadata", () => {
  for (const patch of [{ selectionHash: "0".repeat(64) }, { httpAttempts: 3 }, { result: "unknown" }, { pages: [] }, { workerStage: "not-started" }]) assert.throws(() => validate(evidence(undefined, patch)));
  for (const patch of [{ alias: "C0" }, { sequence: 2 }, { rawResponseSha256: "0".repeat(64) }, { capturedAt: new Date(now + 1).toISOString() }, { capturedAt: new Date(now - 180001).toISOString() }]) {
    const frame = evidence(); Object.assign(frame.pages[0], patch); assert.throws(() => validate(frame));
  }
  for (const text of [raw().replace('"dataCount":1', '"dataCount":1,"dataCount":1'), raw([ { ...row, remark: config.password } ]),
    raw([{ ...row, remark: '{"token":"PRIVATE"}' }]), raw([], { reportObj: '{"reportId":6086979,"reportId":6086979}' })]) assert.throws(() => validate(evidence([text, raw([]), raw()])));
});
const fakeWorker = (program: string): typeof spawn => ((_command: string, _args: readonly string[], options: Record<string, unknown>) =>
  spawn(process.execPath, ["-e", program], { ...options, cwd: process.cwd(), stdio: ["pipe", "pipe", "pipe"] })) as typeof spawn;
test("child receives fixed private stdin scope and parent discards stderr", async () => {
  const frame = evidence();
  const program = `let text='';process.stdin.on('data',b=>text+=b);process.stdin.on('end',()=>{const v=JSON.parse(text);if(v.action!==${JSON.stringify(GARMENT_FILTER_ACTION)}||Object.keys(v).sort().join(',')!=='action,baseUrl,password,selection,transportPolicy,username')process.exit(9);process.stderr.write('PRIVATE');process.stdout.write(${JSON.stringify(JSON.stringify(frame))});});`;
  assert.deepEqual(await collectGarmentFilter(config, selection, { spawnWorker: fakeWorker(program) }), frame);
  let spawned = false;
  await assert.rejects(collectGarmentFilter({ ...config, username: "wrong" }, selection, { spawnWorker: (() => { spawned = true; throw new Error(); }) as typeof spawn }), { message: "garment_filter_account_mismatch" });
  assert.equal(spawned, false);
});
test("actual Python worker under Windows GBK produces lossless UTF8-safe evidence without network", () => {
  const code = ["import sys", "from unittest.mock import patch", "sys.path.insert(0,'tests')",
    "import ainuoke_bridge.garment_contract_verification as module", "from test_garment_contract_verification import FakeTransport",
    "sys.argv=['verification','--stdin-request']", "with patch.object(module,'VerificationTransport',lambda _:FakeTransport()):",
    "    raise SystemExit(module.main())"].join("\n");
  const result = spawnSync(process.platform === "win32" ? "python" : "python3", ["-c", code], {
    cwd: resolve("tools/ainuoke-bridge"), input: JSON.stringify({ baseUrl: config.baseUrl, transportPolicy: config.transportPolicy, username: config.username,
      password: config.password, action: GARMENT_FILTER_ACTION, selection }), encoding: "utf8", timeout: 15000, maxBuffer: 1024 * 1024,
    env: { ...process.env, PYTHONIOENCODING: "gbk" } });
  assert.equal(result.status, 0, result.stderr);
  const received = validateGarmentFilterEvidence(JSON.parse(result.stdout), config, selection, Date.now());
  assert.equal(received.summary.result, "SCOPED_FILTER_OBSERVED"); assert.equal(received.summary.reportRequests, 3);
  assert.ok(!JSON.stringify(received.summary).includes(row.CnColor));
});
test("timeout, bad encoding, bad framing and worker output limit never retry or invent request counts", async () => {
  await assert.rejects(collectGarmentFilter(config, selection, { timeoutMs: 30, spawnWorker: fakeWorker("process.stdin.resume();setTimeout(()=>{},10000)") }), { message: "garment_filter_timeout" });
  for (const program of ["process.stdin.resume();process.stdin.on('end',()=>process.stdout.write(Buffer.from([255])))", "process.stdin.resume();process.stdin.on('end',()=>{process.stdout.write('{}');process.exitCode=1})"])
    await assert.rejects(collectGarmentFilter(config, selection, { spawnWorker: fakeWorker(program) }), { message: "garment_filter_worker_invalid" });
  await assert.rejects(collectGarmentFilter(config, selection, { spawnWorker: fakeWorker(`process.stdin.resume();process.stdin.on('end',()=>process.stdout.write('x'.repeat(${GARMENT_FILTER_LIMITS.workerBytes + 1})))`) }), { message: "garment_filter_worker_limit" });
});
test("CLI permits only frozen-candidate file paths, never arbitrary contracts/pages/hash/password", () => {
  const paths = ["candidate-file", "credential-file", "private-output"].map(name => "--" + name + "=" + resolve("outputs", name));
  assert.equal(parseGarmentFilterArguments(["--verify-d1933-contract-filter", ...paths]).candidateFile, resolve("outputs/candidate-file"));
  for (const args of [[], ["--verify-d1933-contract-filter", ...paths, "--page=2"], ["--verify-d1933-contract-filter", ...paths, "--expected-hash=" + "a".repeat(64)], ["--verify-d1933-contract-filter", ...paths.slice(0, 2), "--private-output=relative"]]) assert.throws(() => parseGarmentFilterArguments(args));
  const result = spawnSync(process.execPath, ["--import", "tsx", "server/ainuoke-source/garment-contract-verification.ts", "--password=PRIVATE"], { encoding: "utf8", timeout: 15000 });
  assert.equal(result.status, 1); const receipt = JSON.parse(result.stdout);
  assert.equal(receipt.code, "garment_filter_explicit_scope_required"); assert.equal(receipt.requestCounts, "not-started"); assert.ok(!result.stdout.includes("PRIVATE"));
});
test("Windows private launcher verifies the pinned candidate before touching a credential file", { skip: process.platform !== "win32" }, () => {
  const root = mkdtempSync(join(resolve(tmpdir()), "zhixu-garment-filter-synthetic-"));
  try {
    mkdirSync(join(root, "scripts")); mkdirSync(join(root, "server/ainuoke-source"), { recursive: true });
    for (const file of ["ainuoke-garment-contract-verification.ps1", "ainuoke-live-preflight.ps1", "payment-private-file-check.ps1"]) copyFileSync(resolve("scripts", file), join(root, "scripts", file));
    writeFileSync(join(root, "server/ainuoke-source/garment-contract-verification.ts"), "import {main} from " + JSON.stringify(pathToFileURL(resolve("server/ainuoke-source/garment-contract-verification.ts")).href) + "; await main();\n");
    writeFileSync(join(root, "package.json"), '{"type":"module"}\n'); writeFileSync(join(root, ".gitignore"), "/outputs/\n/node_modules/\n");
    symlinkSync(resolve("node_modules"), join(root, "node_modules"), "junction");
    execFileSync("git", ["init", "--quiet", root], { stdio: "ignore" }); execFileSync("git", ["-C", root, "add", "."], { stdio: "ignore" });
    execFileSync("git", ["-C", root, "-c", "user.name=Synthetic", "-c", "user.email=synthetic@example.invalid", "-c", "commit.gpgsign=false", "commit", "--quiet", "-m", "synthetic baseline"], { stdio: "ignore" });
    const privateDir = join(root, "outputs", "synthetic-private"); mkdirSync(privateDir, { recursive: true });
    const sid = execFileSync("pwsh", ["-NoProfile", "-Command", "[Security.Principal.WindowsIdentity]::GetCurrent().User.Value"], { encoding: "utf8" }).trim();
    execFileSync("icacls", [privateDir, "/inheritance:r", "/grant:r", "*" + sid + ":(OI)(CI)F", "*S-1-5-18:(OI)(CI)F"], { stdio: "ignore" });
    const path = join(privateDir, "synthetic.json"); writeFileSync(path, JSON.stringify(candidate()));
    const run = () => spawnSync("pwsh", ["-NoProfile", "-NonInteractive", "-File", join(root, "scripts/ainuoke-garment-contract-verification.ps1"),
      "-VerifyFilter", "-CandidateFile", path, "-CredentialFile", join(root, "DO-NOT-READ-MISSING-CREDENTIAL")], { cwd: tmpdir(), encoding: "utf8", timeout: 60000, env: { ...process.env, DATABASE_URL: "postgresql://must-not-connect.invalid:1/real" } });
    const result = run(); assert.equal(result.status, 1); const receipt = JSON.parse(result.stdout);
    assert.equal(receipt.stage, "candidate"); assert.equal(receipt.code, "garment_filter_candidate_invalid"); assert.equal(receipt.requestCounts, "not-started");
    assert.equal(receipt.httpAttempts, 0); assert.equal(receipt.reportRequests, 0); assert.ok(!result.stdout.includes(row.ExpContractNo));
    execFileSync("icacls", [path, "/grant", "*S-1-1-0:R"], { stdio: "ignore" });
    const broad = run(); assert.equal(broad.status, 1); assert.equal(JSON.parse(broad.stdout).code, "garment_filter_candidate_invalid");
    // An owned synthetic entry exercises the real launcher's success receipt and
    // private writer. The product CLI above still refuses every unpinned input.
    const probeModuleUrl = JSON.stringify(pathToFileURL(resolve("server/ainuoke-source/garment-contract-verification.ts")).href);
    const writer = JSON.stringify(pathToFileURL(resolve("server/ainuoke-source/live-preflight.ts")).href);
    const stub = `import {parseGarmentFilterArguments,validateGarmentFilterEvidence} from ${probeModuleUrl};import {writePrivateReport} from ${writer};
      const args=parseGarmentFilterArguments(process.argv.slice(2));const frame=${JSON.stringify(evidence())};frame.pages.forEach((p,i)=>p.capturedAt=new Date(Date.now()-2000+i*1000).toISOString());
      const result=validateGarmentFilterEvidence(frame,${JSON.stringify(config)},${JSON.stringify(selection)},Date.now());const receipt=writePrivateReport(args.privateOutput,result.privateReport,'garment-shipment');
      console.log(JSON.stringify({...result.summary,toolingCommit:'${"c".repeat(40)}',evidenceRetained:true,...receipt}));`;
    writeFileSync(join(root, "server/ainuoke-source/garment-contract-verification.ts"), stub);
    execFileSync("git", ["-C", root, "add", "server"], { stdio: "ignore" });
    execFileSync("git", ["-C", root, "-c", "user.name=Synthetic", "-c", "user.email=synthetic@example.invalid", "-c", "commit.gpgsign=false", "commit", "--quiet", "-m", "synthetic receipt entry"], { stdio: "ignore" });
    const accepted = run(); assert.equal(accepted.status, 0, accepted.stderr);
    const saved = JSON.parse(accepted.stdout); assert.equal(saved.result, "SCOPED_FILTER_OBSERVED");
    assert.equal(digest(readFileSync(saved.privateReportPath, "utf8")), saved.privateReportSha256);
    for (const value of [config.password, config.username, row.ExpContractNo, row.Num]) assert.ok(!accepted.stdout.includes(value));
  } finally {
    assert.equal(dirname(root), resolve(tmpdir())); assert.match(root, /zhixu-garment-filter-synthetic-[^\\/]+$/u); rmSync(root, { recursive: true, force: true });
  }
});
