import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { analyzeTargetedDiagnostic } from "../ainuoke-source/targeted-diagnostic.js";
import { bundle } from "./ainuoke-source-fixture.js";

function synthetic() {
  const source = bundle();
  const discovery = structuredClone(source.discoveryBefore);
  const contract = discovery[0].rows[0].values.BillNo as string;
  const materials = structuredClone(source.materials[contract]);
  const template = structuredClone(materials[0].rows[0]);
  const rows = [11, 22, 3].map((amount, index) => ({ ...structuredClone(template),
    sourceRowIdentity: `6087050:sha256:target-synthetic-${index}`,
    values: { ...structuredClone(template.values), id: `TARGET-${index}`, GoodsNo: `MAT-${index}`,
      CnName: `合成物料${index}`, cgdh: "PO-TARGET-SYNTHETIC", cgrq: "2026-10-13",
      cgnum: amount, rknum: null, rkdh: null, CYNum: -1, cydh: "SHIP-SYNTHETIC",
      OutStoreNum: amount, ckdh: null, UnitName: index === 1 ? "个" : null,
      customerConfirmedPrice: "protected-commercial-sentinel" } }));
  materials[0].rows = rows;
  materials[0].total = rows.length;
  const fetchedAt = new Date().toISOString();
  discovery[0].fetchedAt = fetchedAt;
  materials[0].fetchedAt = fetchedAt;
  return { schemaVersion: "ainuoke-targeted-diagnostic.v1", discovery, materials: { [contract]: materials },
    targetSalesContractNo: contract, targetPurchaseOrderNo: "PO-TARGET-SYNTHETIC",
    expectedQuantities: [11, 22, 3], reportRequests: 2, authRenewals: 0 };
}

test("three quantity slots retain material identity and unverified unit candidates in private only", async () => {
  const result = await analyzeTargetedDiagnostic(synthetic());
  assert.equal(result.summary.targetPurchaseSourceRows, 3);
  assert.equal(result.summary.lineIdentityVerified, 0);
  assert.ok(result.privateReport.slots.every(slot => slot.status === "pending_human_identity_confirmation"));
  const target = result.privateReport.orders[0];
  assert.equal(target.targetPurchaseRows.length, 3);
  assert.equal(target.targetPurchaseRows[1].unitCandidates[0].field, "UnitName");
  assert.equal(target.targetPurchaseRows[1].unitCandidates[0].status, "unverified_candidate");
  assert.ok(target.targetPurchaseRows.every(row => row.sourceRowIdentity && row.normalizedEvents.length === 1));
  assert.equal(target.streamReasons.inbounds.unknownDemandItems, 3);
  assert.equal(target.streamReasons.shipments.sourceRowsByObservation.source_quantity_negative, 3);
  assert.equal(target.streamReasons.outbounds.sourceRowsByObservation.positive_quantity_without_document, 3);
  for (const value of ["PO-TARGET-SYNTHETIC", "MAT-0", "protected-commercial-sentinel", "UnitName", "个"])
    assert.ok(!JSON.stringify(result.summary).includes(value));
  assert.ok(!JSON.stringify(result.privateReport).includes("protected-commercial-sentinel"));
});

test("quantity equality never proves three material lines; unknown stays unknown", async () => {
  const b = synthetic();
  b.materials[b.targetSalesContractNo][0].rows.splice(0, 1);
  b.materials[b.targetSalesContractNo][0].total = 2;
  const result = await analyzeTargetedDiagnostic(b);
  assert.equal(result.privateReport.slots[0].quantityMatchedSourceRows.length, 0);
  assert.equal(result.summary.lineIdentityVerified, 0);
  assert.equal(result.summary.unknownQuantityRemainsUnknown, true);
});

test("blank, invalid, literal zero, dedup and conflicting unit candidates remain separate observations", async () => {
  const b = synthetic();
  const rows = b.materials[b.targetSalesContractNo][0].rows;
  rows[0].values.cgnum = null;
  rows[0].values.cgdh = "PO-TARGET-SYNTHETIC";
  rows[1].values.rknum = "not-a-number";
  rows[1].values.rkdh = "IN-SYNTHETIC";
  rows[2].values.rknum = 0;
  rows[2].values.rkdh = null;
  rows[2].values.UnitName = "米";
  const duplicate = structuredClone(rows[1]);
  duplicate.sourceRowIdentity = "6087050:sha256:separate-source-same-event";
  duplicate.values.id = "OTHER-UPSTREAM-ID";
  duplicate.values.UnitName = "米";
  rows.push(duplicate);
  b.materials[b.targetSalesContractNo][0].total = rows.length;
  const result = await analyzeTargetedDiagnostic(b);
  const order = result.privateReport.orders[0];
  assert.equal(order.streamReasons.purchases.sourceRowsByObservation.source_quantity_blank_with_document, 1);
  assert.equal(order.streamReasons.inbounds.sourceRowsByObservation.source_quantity_invalid, 2);
  assert.equal(order.streamReasons.inbounds.sourceRowsByObservation.literal_zero_observed_not_unknown, 1);
  assert.equal(order.streamReasons.purchases.mappingFieldError, "not_determinable_without_upstream_field_confirmation");
  assert.equal(order.unitCandidateConflictsWithinDemand, 1);
  assert.ok(order.duplicateEvents > 0);
  assert.equal(result.summary.lineIdentityVerified, 0);
});

test("identity drift, partial pages, stale evidence, secrets and bad request count fail closed", async () => {
  for (const change of [
    (b: ReturnType<typeof synthetic>) => { b.materials[b.targetSalesContractNo][0].rows[0].values.ExpContractNo = "FOREIGN"; },
    (b: ReturnType<typeof synthetic>) => { b.materials[b.targetSalesContractNo][0].queryContext.insideOrderNo = "FOREIGN"; },
    (b: ReturnType<typeof synthetic>) => { b.materials[b.targetSalesContractNo][0].total++; },
    (b: ReturnType<typeof synthetic>) => { b.discovery[0].fetchedAt = "2020-01-01T00:00:00Z"; },
    (b: ReturnType<typeof synthetic>) => { b.reportRequests++; },
    (b: ReturnType<typeof synthetic>) => { Object.assign(b, { password: "never-reflect-secret" }); },
  ]) { const b = synthetic(); change(b); await assert.rejects(analyzeTargetedDiagnostic(b)); }
});

test("offline CLI creates one ignored private report and redacted receipt", () => {
  const dir = mkdtempSync(join(tmpdir(), "zhixu-targeted-test-"));
  try {
    const args = ["--import", import.meta.resolve("tsx"), resolve("server/ainuoke-source/targeted-diagnostic.ts"), "--analyze-stdin"];
    const result = spawnSync(process.execPath, args, { cwd: dir, input: JSON.stringify(synthetic()), encoding: "utf8", timeout: 30000 });
    assert.equal(result.status, 0, result.stderr + result.stdout);
    const receipt = JSON.parse(result.stdout);
    assert.equal(receipt.result, "READ_ONLY_TARGETED_DIAGNOSTIC_RECORDED");
    assert.equal(readdirSync(join(dir, "outputs")).length, 1);
    assert.ok(readFileSync(receipt.privateReportPath, "utf8").includes("PO-TARGET-SYNTHETIC"));
    assert.ok(!result.stdout.includes("PO-TARGET-SYNTHETIC"));
    assert.ok(!result.stdout.includes("protected-commercial-sentinel"));
    const invalid = spawnSync(process.execPath, args, { cwd: dir, input: '{"password":"never-reflect-secret"}', encoding: "utf8", timeout: 30000 });
    assert.equal(invalid.status, 1); assert.equal(invalid.stdout.trim(), '{"error":"target_invalid_or_unavailable"}');
    assert.equal(readdirSync(join(dir, "outputs")).length, 1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
