import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { hash } from "./contract.js";
import { assertExactSourceJsonRuntime, strictExactSourceJson } from "./exact-source-json.js";
import { garmentFilterConfig, screen, validateGarmentFilterEvidence } from "./garment-filter-evidence.js";
import { garmentCollectionProof } from "./garment-collection-control.js";
import { collectionRequest, digest, rawPage, sourceRow } from "../integration/garment-collection-fixture.js";

const now = Date.parse("2026-10-23T00:00:03Z"), request = collectionRequest(randomUUID(), "SYN-C1", now);
const { config, verification: { selection } } = request;
const row = sourceRow(selection.salesContractNo);
function frame(texts = [rawPage([row]), rawPage([]), rawPage([row])], patch: Record<string, unknown> = {}) {
  return { schemaVersion: "ainuoke-garment-filter-evidence.v1", result: "complete", code: null, workerStage: "validation",
    selectionHash: hash(selection), httpAttempts: 4, reportRequests: 3,
    pages: texts.map((text, i) => ({ sequence: i + 1, alias: i === 1 ? "C0" : "C1", capturedAt: new Date(now - 2000 + i * 1000).toISOString(),
      rawReportResponse: text, rawResponseSha256: digest(text) })), ...patch };
}
const validate = (input: unknown) => validateGarmentFilterEvidence(input, config, selection, now);

test("strict source JSON preserves number lexemes and rejects decoded duplicate keys at every depth", () => {
  assertExactSourceJsonRuntime();
  assert.deepEqual(strictExactSourceJson('{"x":9007199254740993.1234567890123456789}'), { x: "9007199254740993.1234567890123456789" });
  for (const text of ['{"a":1,"\\u0061":2}', '{"x":[{"k":0,"k":1}]}', '[{"a":1},]', '{"x":NaN}'])
    assert.throws(() => strictExactSourceJson(text));
});
test("full filter proof is reconstructed without mutation and its summary exposes no source row", () => {
  const input = frame(), before = structuredClone(input), result = validate(input);
  assert.deepEqual(input, before); assert.equal(result.summary.result, "SCOPED_FILTER_OBSERVED");
  assert.equal(result.summary.proofScope, "this-account-contract-complete-first-page-only");
  assert.equal(result.summary.universalFilterSemanticsVerified, false); assert.equal(result.summary.positiveRows, 1);
  assert.equal(result.summary.businessSnapshotPublication, "not-performed");
  for (const privateValue of [config.username, config.password, row.Num, row.billno, row.CnColor]) assert.equal(JSON.stringify(result.summary).includes(privateValue), false);
});
test("account, selection shape and raw-page scope cannot be replaced by a hash or another contract", () => {
  assert.throws(() => garmentFilterConfig({ ...config, username: "other" }, selection));
  assert.throws(() => garmentFilterConfig(config, { ...selection, page: 2 } as typeof selection));
  for (const [texts, code] of [
    [[rawPage([{ ...row, ExpContractNo: "OTHER" }]), rawPage([]), rawPage([row])], "garment_filter_contract_mismatch"],
    [[rawPage([row]), rawPage([row]), rawPage([row])], "garment_filter_control_nonempty"],
    [[rawPage([row]), rawPage([]), rawPage([{ ...row, Num: "2" }])], "garment_filter_source_changed"],
    [[rawPage([row, row]), rawPage([]), rawPage([row, row])], "garment_filter_duplicate_row"],
    [[rawPage([row]), rawPage([]), rawPage([{ ...row, id: "new-witness" }])], "garment_filter_witness_missing"],
  ] as const) assert.equal(validate(frame([...texts])).summary.code, code);
});
test("native numeric rows remain exact and two-pass order changes do not invent a difference", () => {
  const root = JSON.parse(rawPage([row])) as { dataList: string };
  root.dataList = root.dataList.replace('"Num":"' + row.Num + '"', '"Num":' + row.Num);
  const text = JSON.stringify(root); assert.equal(validate(frame([text, rawPage([]), text])).summary.result, "SCOPED_FILTER_OBSERVED");
  const rows = [row, { ...row, id: "second" }];
  assert.equal(validate(frame([rawPage(rows), rawPage([]), rawPage([...rows].reverse())])).summary.result, "SCOPED_FILTER_OBSERVED");
});
test("encoded metadata keeps ordinary bracket labels but rejects duplicate keys and hidden secrets", () => {
  for (const remark of ["[内层]", "{not-json", "[待核]"]) {
    const text = rawPage([{ ...row, remark }]); assert.equal(validate(frame([text, rawPage([]), text])).summary.result, "SCOPED_FILTER_OBSERVED");
  }
  for (const remark of [config.password, '{"token":"PRIVATE"}', '{"a":1,"\\u0061":2}'])
    assert.throws(() => validate(frame([rawPage([{ ...row, remark }]), rawPage([]), rawPage([row])])));
});
test("combined object and encoded JSON depth remains bounded at64", () => {
  const nested = (levels: number) => { let value: unknown = "safe"; for (let i = 0; i < levels; i++) value = { child: value }; return value; };
  assert.doesNotThrow(() => screen(nested(64)));
  assert.throws(() => screen(nested(65)), { message: "garment_filter_structure_limit" });
  assert.throws(() => screen({ value: JSON.stringify(nested(64)) }), { message: "garment_filter_structure_limit" });
});
test("proof envelope enforces exact time, counts, order, bytes and source hashes", () => {
  for (const patch of [{ selectionHash: "0".repeat(64) }, { reportRequests: 4 }, { httpAttempts: 3 }, { result: "invented" }, { pages: [] }, { workerStage: "not-started" }])
    assert.throws(() => validate(frame(undefined, patch)));
  for (const patch of [{ alias: "C0" }, { sequence: 2 }, { capturedAt: new Date(now + 1).toISOString() },
    { capturedAt: new Date(now - 180001).toISOString() }, { rawResponseSha256: "0".repeat(64) }]) {
    const input = frame(); Object.assign(input.pages[0], patch); assert.throws(() => validate(input));
  }
  const oversized = rawPage([{ ...row, remark: "a".repeat(4 * 1024 * 1024) }]);
  assert.throws(() => validate(frame([oversized, rawPage([]), oversized])));
});
test("failed proof retains bounded actual counts and never reports a complete observed range", () => {
  const value = validate(frame([rawPage([row])], { result: "failed", code: "network_unavailable", workerStage: "report", httpAttempts: 3, reportRequests: 2 }));
  assert.equal(value.summary.result, "FAIL"); assert.equal(value.summary.reportRequests, 2); assert.equal(value.summary.positiveRows, null);
  assert.throws(() => validate(frame([rawPage([row])], { result: "failed", code: "PRIVATE", workerStage: "report", httpAttempts: 3, reportRequests: 2 })));
});
test("non-string filter envelope enums reject arrays, nested arrays and empty zero-request proofs", () => {
  for (const result of [["complete"], [["complete"]], ["failed"], [["failed"]], null, true, 1]) {
    assert.throws(() => validate(frame([], { result, workerStage: "not-started", httpAttempts: 0, reportRequests: 0 })));
  }
  for (const workerStage of [["not-started"], [["report"]], null, false, 1]) {
    assert.throws(() => validate(frame([], { result: "failed", code: "network_unavailable", workerStage, httpAttempts: 0, reportRequests: 0 })));
  }
});
test("garment proof cannot accept a coerced complete marker without three real proof pages", () => {
  for (const result of [["complete"], [["complete"]], ["failed"]]) {
    const changed = { ...request, verification: { ...request.verification,
      evidence: frame([], { result, workerStage: "not-started", httpAttempts: 0, reportRequests: 0 }) } };
    assert.throws(() => garmentCollectionProof(changed, now));
  }
});
