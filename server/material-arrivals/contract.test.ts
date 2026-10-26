import assert from "node:assert/strict";
import test from "node:test";
import { createSyntheticMaterialSource, syntheticOrder } from "../../features/ainuoke-material-progress/synthetic-source.js";
import { projectMaterialProgress } from "../../features/ainuoke-material-progress/projection.js";
import { compareArrivalQuantities, parseArrivalCommand, parseArrivalHistoryQuery, parseArrivalIntent, sumArrivalQuantities } from "./contract.js";
import { materialArrivalDemandIdentity } from "./demand-identity.js";
import { projectArrivalDemand } from "./source.js";

const orderId = "82516f58-2bb5-48ed-a566-b6df313d5589", batchId = "c1fe7513-c41b-4d49-be18-34dec18da3cc", demandId = "dd91d611-c5ea-4427-b8d6-87584269e2c1";
const intent = { action: "replace_arrival_plan", orderId, canonicalKey: "material-trim-123abc", expectedVersion: 0,
  batches: [{ id: batchId, expectedArrivalAtHubDate: "2028-02-29", allocations: [{ materialDemandId: demandId, quantity: "00.3000" }] }] };
test("arrival strict intent keeps partial allocations and exact decimals, never accepts client facts or actor", () => {
  assert.equal(parseArrivalIntent(intent).batches[0].allocations[0].quantity, "0.3");
  assert.deepEqual(parseArrivalIntent({ ...intent, batches: [] }).batches, []);
  const command = { requestId: batchId, intent, previewHash: "a".repeat(64) };
  assert.equal(parseArrivalCommand(command).intent.batches[0].expectedArrivalAtHubDate, "2028-02-29");
  for (const key of ["actor", "supplyHubId", "sourceRunId", "requiredQuantity", "unit", "price", "dateSource", "actualDate", "purchaseEventId"]) assert.throws(() => parseArrivalIntent({ ...intent, [key]: "forged" }));
  for (const date of ["2026-02-29", "2026-02-30", "0000-01-01", "2026-1-1", "2026-10-21T00:00:00Z", null])
    assert.throws(() => parseArrivalIntent({ ...intent, batches: [{ ...intent.batches[0], expectedArrivalAtHubDate: date }] }));
  for (const quantity of [0, 1, "0", "-1", "1e2", " 1", "1,000", "1.", "NaN", null, "9".repeat(129)])
    assert.throws(() => parseArrivalIntent({ ...intent, batches: [{ ...intent.batches[0], allocations: [{ materialDemandId: demandId, quantity }] }] }));
  assert.throws(() => parseArrivalIntent({ ...intent, batches: [intent.batches[0], intent.batches[0]] }));
  assert.throws(() => parseArrivalIntent({ ...intent, batches: [{ ...intent.batches[0], allocations: [intent.batches[0].allocations[0], intent.batches[0].allocations[0]] }] }));
  for (const value of [-1, 0.2, "0", null, 2147483647]) assert.throws(() => parseArrivalIntent({ ...intent, expectedVersion: value }));
});
test("allocation capacity arithmetic is exact beyond IEEE precision and rejects invalid history queries", () => {
  assert.equal(sumArrivalQuantities(["0.1", "0.2"]), "0.3");
  assert.equal(sumArrivalQuantities(["9007199254740993.123456789", "0.000000001"]), "9007199254740993.12345679");
  assert.equal(compareArrivalQuantities("9007199254740993", "9007199254740992"), 1);
  assert.equal(compareArrivalQuantities("0.30", "0.3"), 0); assert.equal(sumArrivalQuantities([]), "0");
  assert.deepEqual(parseArrivalHistoryQuery(new URLSearchParams("offset=25&asOfVersion=2")), { offset: 25, asOfVersion: 2 });
  for (const value of ["offset=-1", "offset=100001", "asOfVersion=2147483648", "offset=0&offset=0", "price=1", "offset=1.1"])
    assert.throws(() => parseArrivalHistoryQuery(new URLSearchParams(value)));
});
test("Server demand identity survives source quantity/date/event changes, retains variant/order boundaries and excludes prices", () => {
  const pages = createSyntheticMaterialSource()!;
  const before = projectMaterialProgress(syntheticOrder, pages).rows.find(row => row.demand.materialCode === "SYNTHETIC-MAT-ready")!;
  const changed = structuredClone(pages);
  for (const page of changed) for (const row of page.rows) if (row.values.GoodsNo === "SYNTHETIC-MAT-ready") Object.assign(row.values, { TotalNum: 80, cgrq: "2028-01-01", cgprice: 9000, cgdh: "NEW-PO" });
  const after = projectMaterialProgress(syntheticOrder, changed).rows.find(row => row.demand.materialCode === "SYNTHETIC-MAT-ready")!;
  assert.notEqual(before.demand.id, after.demand.id, "the old source hash changes with capacity");
  assert.deepEqual(materialArrivalDemandIdentity(orderId, before), materialArrivalDemandIdentity(orderId, after));
  assert.notEqual(materialArrivalDemandIdentity(batchId, before).id, materialArrivalDemandIdentity(orderId, before).id);
  assert.notEqual(materialArrivalDemandIdentity(orderId, { ...before, demand: { ...before.demand, specification: "changed" } }).id, materialArrivalDemandIdentity(orderId, before).id);
  const projected = projectArrivalDemand(orderId, before, ["9007199254740993.123456789"]);
  assert.equal(projected.requiredQuantity, "9007199254740993.123456789");
  assert.equal(projectArrivalDemand(orderId, before, [9007199254740992]).eligibility, "quantity_unknown");
  assert.equal(projectArrivalDemand(orderId, before, ["0.3", "0.30"]).requiredQuantity, "0.3");
  assert.equal(projectArrivalDemand(orderId, before, ["10", "11"]).eligibility, "quantity_unknown");
  assert.equal(projectArrivalDemand(orderId, { ...before, procurementResponsibility: "factory_confirmed" }, ["100"]).eligibility, "factory_confirmed");
  for (const protectedName of ["sourcePricing", "unitPrice", "purchases", "cgprice", "amount", "confirmedGarmentPrice"]) assert.equal(JSON.stringify(projected).includes(protectedName), false);
});
