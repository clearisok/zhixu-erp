import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { projectPaymentRequestObservations as project, type ConfirmedPaymentContext } from "../ainuoke-source/payment-request-observations.js";

const sha = (value: string) => createHash("sha256").update(value).digest("hex");
function page(rows: Array<Record<string, string | null>> = [{ id: "7", BillNo: "SYN-APPLICATION", ExpContractNo: "SYN-SALES",
  PurContractNo: "SYN-PURCHASE", QtyUnit: "个", Num: "10", OutStoreNum: "12", bgNum: "13", kpNum: "14" }]) {
  return { schemaVersion: "ainuoke-payment-observation-page.v1", reportId: "6086941", sourceFingerprint: sha("synthetic-source"),
    capturedAt: "2026-10-15T09:00:00.123456Z", rawResponseSha256: sha("synthetic-response"),
    page: 1, pageSize: 100, reportedTotal: 1000, rows };
}
function confirmation(input = page(), rowIndex = 0): ConfirmedPaymentContext {
  const row = project(input).rows[rowIndex];
  return { observationId: row.observationId, rowContentHash: row.trace.rowContentHash,
    purchaseContractNo: "SYN-PURCHASE", evidenceSha256: sha("synthetic-human-confirmation"),
    currency: "CNY", allocatedShipmentUnit: "个" };
}
test("independent quantities, amounts and unknown fields do not become totals or bank payment", () => {
  const result = project(page([{ id: "1", PurContractNo: "SYN-PURCHASE", Num: "10", OutStoreNum: "12", bgNum: "13", kpNum: "14",
    Price: "0.90", cgGoodsAmount: "10.80", PayAmount: "9.80", GoodsAmount: "8.80", YFAmount: null, tzamount: "-1.00" }]));
  assert.deepEqual(Object.fromEntries(Object.entries(result.rows[0].quantities).map(([key, field]) => [key, field.state === "known" ? field.raw : null])),
    { Num: "10", OutStoreNum: "12", bgNum: "13", kpNum: "14" });
  assert.deepEqual(result.rows[0].amounts.YFAmount, { state: "unknown", reason: "null" });
  assert.equal(result.rows[0].amounts.tzamount.state, "known");
  assert.equal(result.rows[0].bankPaymentStatus, "not_inferred");
  assert.equal(result.rows[0].quantityMeanings.OutStoreNum, "application_allocated_material_shipment");
  assert.equal(result.aggregation, "none");
  assert.equal(result.completeness.orderComplete, false);
  assert.equal(result.completeness.allVisibleRecordsRead, false);
});
test("missing, null, blank, zero, negative and invalid decimal values stay distinct", () => {
  const row = project(page([{ Num: "0", OutStoreNum: "-2.50", bgNum: "", kpNum: "bad", YFAmount: null }])).rows[0];
  assert.deepEqual(row.quantities.Num, { state: "known", raw: "0" });
  assert.deepEqual(row.quantities.OutStoreNum, { state: "known", raw: "-2.50" });
  assert.deepEqual(row.quantities.bgNum, { state: "unknown", reason: "blank" });
  assert.deepEqual(row.quantities.kpNum, { state: "invalid", reason: "invalid_decimal", raw: "bad" });
  assert.deepEqual(row.amounts.YFAmount, { state: "unknown", reason: "null" });
  assert.deepEqual(row.amounts.gnsk, { state: "unknown", reason: "missing" });
});
test("exact decimals never round, including large values, scale and exponent", () => {
  const values = ["12345678901234567890.12345678901234567890", "0.00", "-0.00", "1.23400e-20", " 1.60 "];
  for (const raw of values) assert.deepEqual(project(page([{ Price: raw }])).rows[0].amounts.Price, { state: "known", raw });
  for (const raw of ["NaN", "Infinity", "1,000", "01", "1e1001", "9".repeat(257)])
    assert.equal(project(page([{ Price: raw }])).rows[0].amounts.Price.state, "invalid");
  assert.throws(() => project(page([{ Price: 0.1 } as unknown as Record<string, string> ])), /exact_strings_required/);
});
test("duplicate ids and repeated rows remain separate observations, never doubled totals", () => {
  const row = page().rows[0];
  const result = project(page([row, row, { ...row, OutStoreNum: "13" }]));
  assert.equal(result.rows.length, 3);
  assert.equal(new Set(result.rows.map(item => item.observationId)).size, 3);
  assert.equal(result.duplicateSourceIdGroups, 1);
  assert.equal(result.repeatedRowGroups, 1);
  assert.equal(result.deduplication, "none_unverified_event_identity");
  assert.equal(result.rows[0].trace.stableBusinessEventIdentity, "unverified");
});
test("currency and allocated shipment unit require exact row evidence, no default or contract-wide spreading", () => {
  const row = page().rows[0], input = page([row, row]);
  const result = project(input, [confirmation(input)]);
  assert.deepEqual(result.rows[0].currency, { state: "known", value: "CNY", evidenceSha256: [sha("synthetic-human-confirmation")] });
  assert.equal(result.rows[0].allocatedShipmentUnit.state, "known");
  assert.equal(result.rows[1].currency.state, "unknown");
  assert.equal(result.rows[1].allocatedShipmentUnit.state, "unknown");
  assert.equal(result.rows[0].sourceUnits.purchase.state, "known");
});
test("RMB and Chinese RMB label normalize to CNY without any currency conversion", () => {
  for (const currency of ["RMB", "人民币", "CNY"]) {
    const result = project(page(), [{ ...confirmation(), currency }]);
    assert.equal(result.rows[0].currency.state, "known");
    if (result.rows[0].currency.state === "known") assert.equal(result.rows[0].currency.value, "CNY");
    assert.deepEqual(result.rows[0].quantities.Num, { state: "known", raw: "10" });
  }
});
test("conflicting unit or currency evidence blocks a resolved qualifier without changing source amounts", () => {
  const proof = confirmation();
  const result = project(page(), [proof, { ...proof, currency: "USD", allocatedShipmentUnit: "米", evidenceSha256: sha("second-proof") }]);
  assert.equal(result.rows[0].currency.state, "conflict");
  assert.equal(result.rows[0].allocatedShipmentUnit.state, "conflict");
  assert.deepEqual(result.rows[0].quantities.OutStoreNum, { state: "known", raw: "12" });
  const sourceConflict = project(page(), [{ ...proof, allocatedShipmentUnit: "米" }]);
  assert.equal(sourceConflict.rows[0].allocatedShipmentUnit.state, "conflict");
});
test("evidence cannot survive changed source, time, row content, row index or purchase identity", () => {
  const proof = confirmation();
  for (const input of [
    { ...page(), rawResponseSha256: sha("changed") }, { ...page(), sourceFingerprint: sha("another-account") },
    { ...page(), capturedAt: "2026-10-15T09:01:00Z" },
    page([{ ...page().rows[0], Num: "11" }]),
    page([{}, page().rows[0]]),
  ]) assert.throws(() => project(input, [proof]), /confirmation_mismatch/);
  assert.throws(() => project(page(), [{ ...proof, purchaseContractNo: "OTHER" }]), /confirmation_mismatch/);
  assert.throws(() => project(page(), [{ ...proof, observationId: proof.observationId.replace("6086941:", "6087050:") }]), /confirmation_mismatch/);
});
test("wrong report, page, partial capture, unsafe field types and confirmation shapes fail closed", () => {
  for (const changes of [
    { reportId: "6087050" }, { page: 2 }, { pageSize: 50 }, { sourceFingerprint: "" },
    { capturedAt: "2026-02-30T09:00:00Z" }, { reportedTotal: null }, { reportedTotal: -1 },
    { rawResponseSha256: "bad" }, { unknown: "private" }, { rows: Array(101).fill({}) },
    { rows: [{ token: "synthetic-secret" }] }, { rows: [{ Num: { nested: "value" } }] },
  ]) assert.throws(() => project({ ...page(), ...changes }));
  const proof = confirmation();
  for (const changes of [{ currency: "" }, { currency: "cny" }, { allocatedShipmentUnit: " " },
    { allocatedShipmentUnit: "个\n" }, { evidenceSha256: "" }, { allow: true }])
    assert.throws(() => project(page(), [{ ...proof, ...changes }]));
});
test("source field order does not change row hash; missing and null do change it", () => {
  const a = project(page([{ id: "1", Num: null }])).rows[0].trace.rowContentHash;
  const b = project(page([{ Num: null, id: "1" }])).rows[0].trace.rowContentHash;
  const c = project(page([{ id: "1" }])).rows[0].trace.rowContentHash;
  assert.equal(a, b); assert.notEqual(a, c);
});
test("even a fully read first page does not claim completeness for any order", () => {
  const result = project({ ...page(), reportedTotal: 1 });
  assert.equal(result.completeness.allVisibleRecordsRead, true);
  assert.equal(result.completeness.orderComplete, false);
});

function privateCapture(dataList: string) {
  const raw = '{"reObj":{"isOk":true},"dataList":' + dataList + ',"reportObj":{"reportId":6086941},"dataCount":1000,"pageIndex":0,"pageSize":0}';
  return { schemaVersion: "ainuoke-payment-request-private.v1", reportId: "6086941", page: 1, pageSize: 100,
    sourceFingerprint: sha("synthetic-source"), capturedAt: "2026-10-15T09:00:00Z", rawResponseSha256: sha(raw), rawReportResponse: raw };
}
test("actual Python to Node offline boundary preserves exact UTF8 numeric text in both dataList representations", () => {
  const inner = '{"rows":[{"id":9007199254740993,"CnName":"合成物料","QtyUnit":"个","Price":12345678901234567890.12345678901234567890,"Num":0,"tzamount":-1.00}]}';
  for (const raw of [inner, JSON.stringify(inner)]) {
    const capture = privateCapture(raw);
    const run = spawnSync("python", ["-c",
      "import json,sys;from ainuoke_bridge.payment_request_observations import extract_payment_observation_page;print(json.dumps(extract_payment_observation_page(json.loads(sys.stdin.buffer.read().decode('utf-8'))),ensure_ascii=True))"],
      { cwd: resolve("tools/ainuoke-bridge"), input: JSON.stringify(capture), encoding: "utf8", timeout: 10000, maxBuffer: 2 * 1024 * 1024 });
    assert.equal(run.status, 0, run.stderr);
    const input = JSON.parse(run.stdout), result = project(input), row = result.rows[0];
    assert.deepEqual(row.trace.sourceRecordId, { state: "known", raw: "9007199254740993" });
    assert.deepEqual(row.amounts.Price, { state: "known", raw: "12345678901234567890.12345678901234567890" });
    assert.deepEqual(row.amounts.tzamount, { state: "known", raw: "-1.00" });
    assert.deepEqual(row.sourceFields.CnName, { state: "known", raw: "合成物料" });
    assert.equal(result.sourceActivation, "not_activated");
    assert.equal(result.rows[0].currency.state, "unknown");
  }
});
