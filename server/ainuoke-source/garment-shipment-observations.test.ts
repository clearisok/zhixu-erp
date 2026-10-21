import test from "node:test";
import assert from "node:assert/strict";
import { buildGarmentObservationSnapshot, garmentQuantity, garmentBusinessDate } from "./garment-shipment-observations.js";
import { hash } from "./contract.js";

const scope = { sourceFingerprint: "a".repeat(64), salesContractNo: "SYN-SC-1" }, start = Date.parse("2026-10-21T10:00:00.000Z");
export function syntheticShipmentInput(total = 127, offset = 0) {
  const page = (pass: number, n: number) => ({ schemaVersion: "ainuoke-garment-shipment-page.v1", reportId: "6086979",
    sourceFingerprint: scope.sourceFingerprint, queryContext: { match: "exact", salesContractNo: scope.salesContractNo },
    capturedAt: new Date(start + pass * 1000 + n + offset).toISOString(), page: n, pageSize: 100, reportedTotal: total,
    rawResponseSha256: hash([pass, n, offset]), rows: Array.from({ length: Math.min(100, total - (n - 1) * 100) }, (_, index) => ({
      id: "SYN-ROW-" + ((n - 1) * 100 + index), ExpContractNo: scope.salesContractNo, billno: "SYN-OUT-1", CnColor: "黑色",
      QtyUnit: "件", Num: "9007199254740993.000000000001", outdate: "2026-10-11", FDate: "2026-10-07", indate: "2026-10-07",
      ycyNum: "888", UsableNum: "999", styleNum: "1000", wxprice: "HIDDEN-PRICE-SENTINEL", remark: "HIDDEN-NOTES-SENTINEL" })) });
  return { schemaVersion: "ainuoke-garment-shipment-input.v1", firstPass: Array.from({ length: Math.max(1, Math.ceil(total / 100)) }, (_, i) => page(1, i + 1)),
    secondPass: Array.from({ length: Math.max(1, Math.ceil(total / 100)) }, (_, i) => page(2, i + 1)) };
}
const run = (input: unknown) => buildGarmentObservationSnapshot(input, scope, start + 10000);
const code = (expected: string) => (error: unknown) => (error as { code?: string }).code === expected;

test("garment snapshot preserves exact Num/outdate, independent dates and observation-only provenance", () => {
  const input = syntheticShipmentInput(), snapshot = run(input);
  assert.equal(snapshot.rows.length, 127); assert.equal(snapshot.rows[100].trace.page, 2);
  assert.equal(snapshot.rows[0].quantity.state, "known");
  assert.equal(snapshot.rows[0].quantity.state === "known" && snapshot.rows[0].quantity.value, "9007199254740993.000000000001");
  assert.deepEqual(snapshot.rows[0].businessDate, { state: "known", raw: "2026-10-11", value: "2026-10-11" });
  assert.deepEqual(snapshot.rows[0].fields.FDate, { state: "known", raw: "2026-10-07" });
  assert.equal(snapshot.aggregation, "none_observations_not_event_ledger"); assert.equal(snapshot.disappearanceMeaning, "unknown_not_cancellation");
  assert.equal(snapshot.completeness.contractFilterExecution, "requires_separate_verification");
  assert.equal(JSON.stringify(snapshot).includes("HIDDEN-"), false); assert.equal(JSON.stringify(snapshot).includes("wxprice"), false);
  assert.equal(snapshot.rows[0].trace.stableBusinessEventIdentity, "unverified");
  assert.deepEqual(run(JSON.parse(JSON.stringify(input))), snapshot);
});

test("empty exact query is an empty observation, never cancellation or automatic zero shipment fact", () => {
  const value = run(syntheticShipmentInput(0)); assert.equal(value.rows.length, 0); assert.equal(value.completeness.queryRows, 0);
  assert.equal(value.disappearanceMeaning, "unknown_not_cancellation"); assert.equal(value.closingAdoption, "not_performed");
});

test("complete two-pass snapshots compare row contents independently of returned order", () => {
  const input = syntheticShipmentInput(2); input.secondPass[0].rows.reverse(); assert.equal(run(input).rows.length, 2);
  input.secondPass[0].rows[0].Num = "12"; assert.throws(() => run(input), code("shipment_observation_source_changed"));
});

test("scope, pagination, totals, duplicate IDs and independently captured passes fail closed", async t => {
  const cases: [string, (input: ReturnType<typeof syntheticShipmentInput>) => void, string][] = [
    ["contains", x => { x.firstPass[0].queryContext.match = "contains"; }, "shipment_observation_scope_mismatch"],
    ["report", x => { x.firstPass[0].reportId = "6086941"; }, "shipment_observation_scope_mismatch"],
    ["account", x => { x.firstPass[0].sourceFingerprint = "b".repeat(64); }, "shipment_observation_scope_mismatch"],
    ["contract", x => { x.firstPass[0].rows[0].ExpContractNo = "SYN-OTHER"; }, "shipment_observation_contract_mismatch"],
    ["missing page", x => { x.firstPass.pop(); }, "shipment_observation_incomplete"],
    ["order", x => { x.firstPass.reverse(); }, "shipment_observation_page_order"],
    ["row count", x => { x.firstPass[0].rows.pop(); }, "shipment_observation_invalid_page"],
    ["total drift", x => { x.secondPass[0].reportedTotal = 128; }, "shipment_observation_source_changed"],
    ["duplicate ID", x => { x.firstPass[1].rows[0].id = x.firstPass[0].rows[0].id; }, "shipment_observation_duplicate_row_id"],
    ["blank ID", x => { x.firstPass[0].rows[0].id = " "; }, "shipment_observation_row_identity_missing"],
    ["replay", x => { x.secondPass = structuredClone(x.firstPass); }, "shipment_observation_invalid_capture_time"],
    ["bad hash", x => { x.firstPass[0].rawResponseSha256 = "invalid"; }, "shipment_observation_invalid_page"],
    ["future", x => { x.firstPass[0].capturedAt = new Date(start + 30000).toISOString(); }, "shipment_observation_invalid_capture_time"],
    ["unknown field", x => { Object.assign(x.firstPass[0].rows[0], { Password: "never" }); }, "shipment_observation_unknown_field"],
    ["unsafe Number", x => { Object.assign(x.firstPass[0].rows[0], { Num: 9007199254740992 }); }, "shipment_observation_exact_strings_required"],
  ];
  for (const [name, change, expected] of cases) await t.test(name, () => { const input = syntheticShipmentInput(); change(input); assert.throws(() => run(input), code(expected)); });
  assert.throws(() => buildGarmentObservationSnapshot(syntheticShipmentInput(), scope, start + 200000), code("shipment_observation_capture_expired"));
  assert.throws(() => run(syntheticShipmentInput(2001)), code("shipment_observation_input_limit"));
  const single = syntheticShipmentInput(1); single.secondPass = structuredClone(single.firstPass);
  assert.throws(() => run(single), code("shipment_observation_replayed_capture"));
});

test("quantity distinguishes zero, signed evidence, unknown and invalid without currency or reversal assumptions", () => {
  for (const [raw, value] of [["0", "0"], ["-0.000", "0"], ["-12.500", "-12.5"], ["1e2", "100"]])
    assert.deepEqual(garmentQuantity({ state: "known", raw }), { state: "known", raw, value });
  for (const raw of ["1,000", "NaN", "1e1000", "1e-1000", "01", "+1"])
    assert.equal(garmentQuantity({ state: "known", raw }).state, "invalid");
  assert.deepEqual(garmentQuantity({ state: "unknown", reason: "missing" }), { state: "unknown", reason: "missing" });
});

test("invalid or missing outdate never borrows FDate, indate or planned delivery", () => {
  for (const raw of ["2026-02-30", "2026-13-01", "2026-10-11T12:00:00Z", "2026/10/11", "0000-01-01"])
    assert.equal(garmentBusinessDate({ state: "known", raw }).state, "invalid");
  const input = syntheticShipmentInput(1); for (const pass of [input.firstPass, input.secondPass]) pass[0].rows[0].outdate = "";
  assert.deepEqual(run(input).rows[0].businessDate, { state: "unknown", reason: "blank" });
  assert.deepEqual(garmentBusinessDate({ state: "known", raw: "2024-02-29" }), { state: "known", raw: "2024-02-29", value: "2024-02-29" });
});
