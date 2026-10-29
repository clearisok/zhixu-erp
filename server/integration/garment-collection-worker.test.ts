import test from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { accountFingerprint } from "../ainuoke-source/collector.js";
import { collectGarmentObservationPages, validateGarmentCollectionResult, garmentCollectionFailureCounts,
  GARMENT_COLLECTION_ACTION } from "../ainuoke-source/garment-collection-worker.js";
import { garmentCollectionProof } from "../ainuoke-source/garment-collection-control.js";
import { configFor, collectionRequest, sourceRow, rawPage, workerFrame, workerFrameV2, digest } from "./garment-collection-fixture.js";
import { restoreGarmentObservationSnapshot, buildGarmentObservationSnapshot } from "../ainuoke-source/garment-shipment-observations.js";

const config = configFor(), now = Date.parse("2026-10-23T00:00:10.000Z"), scope = { sourceFingerprint: accountFingerprint(config), salesContractNo: "SYN-C1" };
const valid = (value: unknown) => validateGarmentCollectionResult(value, config, scope, now);
test("exact raw quantities and dates survive independent extraction and empty observations remain valid", () => {
  const frame = workerFrame(scope, now), original = structuredClone(frame), result = valid(frame);
  assert.deepEqual(frame, original); assert.equal(result.snapshot.rows[0].quantity.state, "known");
  assert.ok(JSON.stringify(result.snapshot).includes("9007199254740993.000000000001"));
  assert.equal(result.snapshot.rows[0].trace.stableBusinessEventIdentity, "unverified");
  assert.equal(valid(workerFrame(scope, now, [])).snapshot.rows.length, 0);
  assert.equal(result.snapshot.aggregation, "none_observations_not_event_ledger");
});
test("scoped proof is reconstructed and cannot be widened by a hash, contract or control substitution", () => {
  const request = collectionRequest(randomUUID(), scope.salesContractNo, now), proof = garmentCollectionProof(request, now);
  assert.equal(proof.maxPages, 1); assert.equal(proof.maxRows, 100); assert.equal(proof.salesContractNo, scope.salesContractNo);
  const modified = structuredClone(request); modified.verification.selection.salesContractNo = "SYN-C2";
  assert.throws(() => garmentCollectionProof(modified, now));
  const control = structuredClone(request) as typeof request & { verification: { evidence: { pages: { rawReportResponse: string; rawResponseSha256: string }[] } } };
  control.verification.evidence.pages[1].rawReportResponse = rawPage([sourceRow(scope.salesContractNo)]);
  control.verification.evidence.pages[1].rawResponseSha256 = digest(control.verification.evidence.pages[1].rawReportResponse);
  assert.throws(() => garmentCollectionProof(control, now));
  assert.throws(() => garmentCollectionProof({ ...request, verification: { ...request.verification, evidence: { verificationSha256: proof.verificationSha256 } } }, now));
});
test("legacy formal captures still reject zero sentinels, inconsistent totals, wrong reports and unproven page 2", () => {
  for (const patch of [{ pageIndex: 0 }, { pageSize: 0 }, { dataCount: 2 }, { dataCount: null }, { pageIndex: 2 },
    { reportObj: JSON.stringify({ reportId: 6086941 }) }, { dataList: JSON.stringify({ rows: [sourceRow(scope.salesContractNo)], total: null }) }]) {
    const frame = workerFrame(scope, now), text = rawPage([sourceRow(scope.salesContractNo)], patch);
    frame.captures[0].rawReportResponse = text; frame.captures[0].rawResponseSha256 = digest(text); assert.throws(() => valid(frame));
  }
  const large = workerFrame(scope, now, Array.from({ length: 101 }, (_, i) => sourceRow(scope.salesContractNo, { id: "R" + i })));
  assert.throws(() => valid(large));
});
test("v2 accepts only complete proven first pages and preserves sentinel provenance across restore", () => {
  for (const sentinel of [true, false]) for (const total of [0, 1, 100]) {
    const rows = Array.from({ length: total }, (_, i) => sourceRow(scope.salesContractNo, { id: "R" + i }));
    const frame = workerFrameV2(scope, now, rows, sentinel), before = structuredClone(frame), result = valid(frame);
    assert.deepEqual(frame, before); assert.equal(result.snapshot.rows.length, total);
    assert.deepEqual(result.snapshot.trace.map(x => [x.pagingEvidence?.reportRequestNumber, x.pagingEvidence?.responsePageIndex, x.pagingEvidence?.responsePageSize]),
      [[1, sentinel ? 0 : 1, sentinel ? 0 : 100], [2, sentinel ? 0 : 1, sentinel ? 0 : 100]]);
    assert.deepEqual(restoreGarmentObservationSnapshot(JSON.parse(JSON.stringify(result.input)), scope), result.snapshot);
    assert.throws(() => buildGarmentObservationSnapshot(result.input, scope, now + 180001));
    const tampered = structuredClone(result.input); tampered.firstPass[0].pagingEvidence!.requestBodySha256 = "0".repeat(64);
    assert.throws(() => restoreGarmentObservationSnapshot(tampered, scope));
  }
});
test("v2 request substitutions, ordinal replay, mixed metadata and incomplete first pages fail closed", () => {
  const edits: ((frame: ReturnType<typeof workerFrameV2>) => void)[] = [
    x => { x.captures[0].executedRequest.reportRequestNumber = 2; },
    x => { x.captures[0].executedRequest.body.sqlCdtn.conditionList[0].compareType = "contains"; },
    x => { x.captures[0].executedRequest.body.sqlCdtn.conditionList[0].compareValue = "OTHER"; },
    x => { x.captures[0].executedRequest.body.sqlCdtn.currentPage = 2; },
    x => { x.captures[0].executedRequest.body.sqlCdtn.pageSize = 101; },
    x => { x.captures[0].schemaVersion = "ainuoke-garment-shipment-capture.v1"; },
  ];
  for (const edit of edits) { const frame = workerFrameV2(scope, now); edit(frame); assert.throws(() => valid(frame)); }
  for (const patch of [{ pageIndex: 0, pageSize: 100 }, { pageIndex: 1, pageSize: 0 }, { pageIndex: 2, pageSize: 100 },
    { dataCount: 2 }, { dataCount: 101, dataList: JSON.stringify({ rows: [sourceRow(scope.salesContractNo)], total: 101 }) }]) {
    const frame = workerFrameV2(scope, now), text = rawPage([sourceRow(scope.salesContractNo)], patch);
    frame.captures[0].rawReportResponse = text; frame.captures[0].rawResponseSha256 = digest(text); assert.throws(() => valid(frame));
  }
  const extra = workerFrameV2(scope, now); Object.assign(extra.captures[0].executedRequest.body.sqlCdtn, { untrusted: true });
  assert.throws(() => valid(extra));
  const changed = workerFrameV2(scope, now); changed.captures[1].rawReportResponse = rawPage([sourceRow(scope.salesContractNo, { Num: "2" })], { pageIndex: 0, pageSize: 0 });
  changed.captures[1].rawResponseSha256 = digest(changed.captures[1].rawReportResponse); assert.throws(() => valid(changed));
});
test("observed private createTime is retained in evidence without becoming outdate or a public field", () => {
  const result = valid(workerFrameV2(scope, now, [sourceRow(scope.salesContractNo,
    { createTime: "2026-10-07 12:34:56", outdate: null })]));
  assert.equal(result.snapshot.rows[0].businessDate.state, "unknown");
  const evidenceRows = result.input.firstPass[0].rows;
  assert.ok(Array.isArray(evidenceRows));
  assert.equal(Object.hasOwn(evidenceRows[0], "createTime"), true);
  assert.equal(JSON.stringify(result.snapshot).includes("createTime"), false);
  assert.throws(() => valid(workerFrameV2(scope, now, [sourceRow(scope.salesContractNo, { newUnknownField: "not-approved" })])));
});
test("duplicate keys, hash mismatch, wrong contract, duplicate row IDs and two-pass changes fail closed", () => {
  const changes = [rawPage([sourceRow("SYN-C2")]), rawPage([sourceRow(scope.salesContractNo), sourceRow(scope.salesContractNo)]),
    rawPage([sourceRow(scope.salesContractNo)]).replace('"dataCount":1', '"dataCount":1,"dataCount":1')];
  for (const text of changes) { const frame = workerFrame(scope, now); frame.captures[0].rawReportResponse = text;
    frame.captures[0].rawResponseSha256 = digest(text); assert.throws(() => valid(frame)); }
  const hash = workerFrame(scope, now); hash.captures[0].rawResponseSha256 = "0".repeat(64); assert.throws(() => valid(hash));
  const changed = workerFrame(scope, now); changed.captures[1].rawReportResponse = rawPage([sourceRow(scope.salesContractNo, { Num: "2" })]);
  changed.captures[1].rawResponseSha256 = digest(changed.captures[1].rawReportResponse); assert.throws(() => valid(changed));
});
test("source secrets, extra framing and unverified failure counts cannot enter results", () => {
  for (const row of [sourceRow(scope.salesContractNo, { remark: config.password }), sourceRow(scope.salesContractNo, { remark: '{"token":"secret"}' })])
    assert.throws(() => valid(workerFrame(scope, now, [row])));
  assert.throws(() => valid({ ...workerFrame(scope, now), rawToken: "secret" }));
  assert.throws(() => valid({ schemaVersion: "ainuoke-garment-collection-worker.v1", result: "failed", code: "PRIVATE", counts: { httpAttempts: 3, reportRequests: 2 } }));
  for (const counts of [{ httpAttempts: 4, reportRequests: 2 }, { httpAttempts: 0, reportRequests: 1 }, { httpAttempts: 2.1, reportRequests: 1 }])
    assert.throws(() => valid({ schemaVersion: "ainuoke-garment-collection-worker.v1", result: "failed", code: "network_unavailable", counts }));
  try { valid({ schemaVersion: "ainuoke-garment-collection-worker.v1", result: "failed", code: "network_unavailable", counts: { httpAttempts: 2, reportRequests: 1 } }); }
  catch (error) { assert.deepEqual(garmentCollectionFailureCounts(error), { httpAttempts: 2, reportRequests: 1 }); }
  assert.equal(garmentCollectionFailureCounts(Error("unknown")), null);
});
const fakeWorker = (program: string): typeof spawn => ((_command: string, _args: readonly string[], options: Record<string, unknown>) =>
  spawn(process.execPath, ["-e", program], { ...options, cwd: process.cwd(), stdio: ["pipe", "pipe", "pipe"] })) as typeof spawn;
test("private child stdin has only fixed scope and stderr is discarded", async () => {
  const frame = workerFrame(scope, now), program = `let t='';process.stdin.on('data',b=>t+=b);process.stdin.on('end',()=>{const v=JSON.parse(t);if(v.action!==${JSON.stringify(GARMENT_COLLECTION_ACTION)}||Object.keys(v).sort().join(',')!=='action,baseUrl,password,scope,transportPolicy,username')process.exit(9);process.stderr.write('PRIVATE');process.stdout.write(${JSON.stringify(JSON.stringify(frame))});});`;
  assert.deepEqual(await collectGarmentObservationPages(config, scope, { spawnWorker: fakeWorker(program) }), frame);
  await assert.rejects(collectGarmentObservationPages(config, scope, { spawnWorker: fakeWorker("process.stdout.write('{bad')") }));
  await assert.rejects(collectGarmentObservationPages(config, scope, { spawnWorker: fakeWorker("setInterval(()=>{},1000)"), timeoutMs: 30 }));
});
test("actual Python adapter on a FakeTransport emits precise, valid captures without network", () => {
  for (const sentinel of [false, true]) {
  const program = ["import sys", "from unittest.mock import patch", "sys.path.insert(0,'tests')",
    "import ainuoke_bridge.garment_collection as module", "from test_garment_collection import FakeTransport",
    "from test_garment_collection import response",
    `factory = ${sentinel ? "lambda: FakeTransport([response(pageIndex=0,pageSize=0),response(pageIndex=0,pageSize=0)])" : "FakeTransport"}`,
    "sys.argv=['collection','--stdin-request']", "with patch.object(module,'GarmentCollectionTransport',factory):",
    "    raise SystemExit(module.main())"].join("\n");
  const result = spawnSync(process.platform === "win32" ? "python" : "python3", ["-c", program], { cwd: "tools/ainuoke-bridge", encoding: "utf8", windowsHide: true,
    env: { ...process.env, PYTHONIOENCODING: "gbk", PYTHONDONTWRITEBYTECODE: "1" }, input: JSON.stringify({ baseUrl: config.baseUrl,
      transportPolicy: config.transportPolicy, username: config.username, password: config.password, action: GARMENT_COLLECTION_ACTION, scope }), timeout: 10000 });
  assert.equal(result.status, 0, result.stderr); const evidence = JSON.parse(result.stdout);
  assert.equal(evidence.captures[0].schemaVersion, "ainuoke-garment-shipment-capture.v2");
  const checked = validateGarmentCollectionResult(evidence, config, scope, Date.now());
  assert.equal(checked.snapshot.rows[0].fields.Num.state, "known");
  assert.equal(checked.snapshot.trace[0].pagingEvidence?.responsePageSize, sentinel ? 0 : 100);
  }
});
