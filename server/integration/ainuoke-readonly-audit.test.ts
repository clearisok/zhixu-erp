import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, relative, isAbsolute } from "node:path";
import { analyzeReadonlyAudit, selectedContracts } from "../ainuoke-source/readonly-audit.js";
import { bundle, syntheticOrder, syntheticFetchedAt } from "./ainuoke-source-fixture.js";

function audit(count = 4) {
  const source = bundle();
  const rows = Array.from({ length: count }, (_, i) => ({ sourceRowIdentity: "d-" + i,
    values: { ...source.discoveryBefore[0].rows[0].values, id: "id-" + i, BillNo: "SC-" + i, InsideOrderNo: "IN-" + i } }));
  const discovery = [{ ...source.discoveryBefore[0], total: count, rows }];
  const materials = Object.fromEntries(rows.map((r, i) => ["SC-" + i, source.materials[syntheticOrder.salesContractNo].map(p => ({ ...structuredClone(p),
    queryContext: { insideOrderNo: "IN-" + i }, rows: p.rows.map(row => ({ ...structuredClone(row), values: { ...row.values, ExpContractNo: "SC-" + i } })) }))]));
  return { schemaVersion: "ainuoke-readonly-audit.v1", discoveryBefore: discovery, discoveryAfter: structuredClone(discovery), materials,
    selection: { strategy: "sorted-contract-even-spread-v1", maximumContracts: 80 }, reportRequests: 2 + count };
}
const now = Date.parse(syntheticFetchedAt);

test("complete discovery and actual four-stream projection find three distinct representative contracts", async () => {
  const value = audit(); const result = await analyzeReadonlyAudit(value, now);
  assert.equal(result.summary.discovery.complete, true);
  assert.equal(result.summary.discovery.total, 4);
  assert.equal(result.summary.materials.sampledContracts, 4);
  for (const stream of Object.values(result.summary.materials.streams)) assert.equal(stream.representatives.length, 3);
  const redacted = JSON.stringify(result.summary);
  for (const hidden of ["SC-0", "IN-0", "protected-commercial-sentinel", "PO-SYNTHETIC", "12.75"]) assert.ok(!redacted.includes(hidden));
  assert.equal(result.summary.materials.unitSemantics, "not-mapped-not-verified");
  assert.equal(result.summary.sourceActivation, "not-activated");
  assert.ok(JSON.stringify(result.privateReport).includes("SC-0"));
  assert.ok(!JSON.stringify(result.privateReport).includes("protected-commercial-sentinel"));
});

test("empty first contract does not mask later streams; empty discovery never claims representatives", async () => {
  const value = audit();
  value.materials["SC-0"] = [{ ...value.materials["SC-0"][0], total: 0, rows: [] }];
  const result = await analyzeReadonlyAudit(value, now);
  assert.equal(result.summary.materials.emptyContracts, 1);
  assert.ok(Object.values(result.summary.materials.streams).every(x => x.representatives.length === 3 && !x.representatives.includes("R01")));
  const empty = await analyzeReadonlyAudit(audit(0), now);
  assert.equal(empty.summary.assessment, "needs-follow-up");
  assert.ok(Object.values(empty.summary.materials.streams).every(x => x.missingRepresentatives === 3));
});

test("558 contracts select exactly 80 spread samples including both endpoints", () => {
  const keys = Array.from({ length: 558 }, (_, i) => "SC-" + String(i).padStart(4, "0"));
  const selected = selectedContracts(keys.reverse());
  assert.equal(selected.length, 80); assert.equal(new Set(selected).size, 80);
  assert.equal(selected[0], "SC-0000"); assert.equal(selected.at(-1), "SC-0557");
});

test("duplicate identities, incomplete discovery, snapshot drift and missing sample cannot pass", async () => {
  for (const edit of [
    (b: ReturnType<typeof audit>) => { b.discoveryBefore[0].rows[1].values.id = "id-0"; },
    (b: ReturnType<typeof audit>) => { b.discoveryBefore[0].rows[1].values.BillNo = "SC-0"; },
    (b: ReturnType<typeof audit>) => { b.discoveryBefore[0].total++; },
    (b: ReturnType<typeof audit>) => { b.discoveryAfter[0].rows[0].values.InsideOrderNo = "CHANGED"; },
    (b: ReturnType<typeof audit>) => { delete b.materials["SC-1"]; },
    (b: ReturnType<typeof audit>) => { b.materials["SC-1"][0].queryContext.insideOrderNo = "FOREIGN"; },
  ]) { const b = audit(); edit(b); await assert.rejects(analyzeReadonlyAudit(b, now)); }
});

test("foreign rows and partial material pages are reported as invalid, never representatives", async () => {
  const b = audit(); b.materials["SC-0"][0].rows[0].values.ExpContractNo = "FOREIGN";
  b.materials["SC-1"][0].total++;
  const result = await analyzeReadonlyAudit(b, now);
  assert.equal(result.summary.materials.invalidContracts, 2);
  assert.equal(result.summary.assessment, "needs-follow-up");
  for (const s of Object.values(result.summary.materials.streams)) assert.ok(s.representatives.every(x => !["R01", "R02"].includes(x)));
});

test("unknown quantities remain unknown, undated events do not satisfy representative evidence", async () => {
  const b = audit(1);
  for (const p of b.materials["SC-0"]) for (const row of p.rows) Object.assign(row.values, { rknum: null, cyrq: null });
  const result = await analyzeReadonlyAudit(b, now);
  assert.ok(result.summary.materials.streams.inbounds.unknownQuantityItems > 0);
  assert.equal(result.summary.materials.streams.shipments.representatives.length, 0);
});

test("secrets, stale evidence and uncontrolled budgets fail closed", async () => {
  await assert.rejects(analyzeReadonlyAudit({ ...audit(), password: "SECRET" }, now));
  await assert.rejects(analyzeReadonlyAudit(audit(), now + 1800001));
  await assert.rejects(analyzeReadonlyAudit({ ...audit(), reportRequests: 2001 }, now));
  await assert.rejects(analyzeReadonlyAudit({ ...audit(), selection: { strategy: "arbitrary", maximumContracts: 1000 } }, now));
});

test("actual offline CLI writes only private allowlisted report and prints redacted receipt", () => {
  const dir = mkdtempSync(join(tmpdir(), "zhixu-readonly-audit-test-"));
  try {
    const b = audit();
    for (const p of [...b.discoveryBefore, ...b.discoveryAfter, ...Object.values(b.materials).flat()]) p.fetchedAt = new Date().toISOString();
    const args = ["--import", import.meta.resolve("tsx"), resolve("server/ainuoke-source/readonly-audit.ts"), "--analyze-stdin"];
    const result = spawnSync(process.execPath, args, { cwd: dir, input: JSON.stringify(b), encoding: "utf8", timeout: 30000 });
    assert.equal(result.status, 0, result.stderr + result.stdout);
    const receipt = JSON.parse(result.stdout);
    assert.equal(receipt.result, "READ_ONLY_AUDIT_RECORDED");
    const distance = relative(dir, receipt.privateReportPath); assert.ok(distance && !distance.startsWith("..") && !isAbsolute(distance));
    assert.equal(readdirSync(join(dir, "outputs")).length, 1);
    assert.ok(readFileSync(receipt.privateReportPath, "utf8").includes("SC-0"));
    assert.ok(!result.stdout.includes("SC-0"));
    const invalid = spawnSync(process.execPath, args, { cwd: dir, input: '{"password":"never-reflect"}', encoding: "utf8", timeout: 30000 });
    assert.equal(invalid.status, 1); assert.equal(invalid.stdout.trim(), '{"error":"audit_invalid_or_unavailable"}');
    assert.equal(readdirSync(join(dir, "outputs")).length, 1);
  } finally {
    const distance = relative(resolve(tmpdir()), resolve(dir)); assert.ok(distance && !distance.startsWith("..") && !isAbsolute(distance));
    rmSync(dir, { recursive: true, force: true });
  }
});
