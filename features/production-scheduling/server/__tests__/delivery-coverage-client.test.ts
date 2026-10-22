import assert from "node:assert/strict";
import test from "node:test";
import { createProductionPlanClient, ProductionPlanError, type DeliveryCoverage } from "../production-plan-client";
import { groupId, orderId, orderRead, savedAssignment, time } from "./production-plan-read-fixture";

const first = "55555555-5555-4555-8555-555555555555", second = "66666666-6666-4666-8666-666666666666";
const third = "77777777-7777-4777-8777-777777777777", undated = "88888888-8888-4888-8888-888888888888";
function sample() {
  const deliveryCoverage: DeliveryCoverage = {
    schemaVersion: "production-delivery-coverage.v1", basis: "current_registered_facts", assessment: "partially_assessed",
    completedQuantity: "0", outstandingPlannedQuantity: "30",
    checkpoints: [
      { date: "2027-01-10", planIds: [first, second], demandQuantity: "30", cumulativeDemandQuantity: "30", expectedOutstandingQuantity: "30", availableQuantity: "30", gapQuantity: "0" },
      { date: "2027-01-12", planIds: [third], demandQuantity: "70", cumulativeDemandQuantity: "100", expectedOutstandingQuantity: "30", availableQuantity: "30", gapQuantity: "70" },
    ], undatedPlans: [{ id: undated, quantity: "0" }],
  };
  return { ...structuredClone(orderRead), deliveryCoverage,
    order: { ...structuredClone(orderRead.order), deliveryPlans: [
      { id: first, date: "2027-01-10", quantity: "20.1" }, { id: second, date: "2027-01-10", quantity: "9.9" },
      { id: third, date: "2027-01-12", quantity: "70" }, { id: undated, date: null, quantity: "0" },
    ] } };
}
function client(value: unknown, calls: { path: string; init?: RequestInit }[] = []) {
  return createProductionPlanClient((async (path, init) => { calls.push({ path: String(path), init }); return Response.json(value); }) as typeof fetch);
}
const invalid = (error: unknown) => error instanceof ProductionPlanError && error.status === 502
  && ["plan_response_invalid", "plan_receipt_mismatch"].includes(error.code);

test("coverage stays a non-monetary same-order whitelist on the existing session GET", async () => {
  const value = sample(), calls: { path: string; init?: RequestInit }[] = [];
  const raw = { ...value, confirmedSale: "secret-sale", deliveryCoverage: { ...value.deliveryCoverage, currency: "secret-currency",
    checkpoints: value.deliveryCoverage.checkpoints.map(row => ({ ...row, laborPrice: "secret-labor" })),
    undatedPlans: value.deliveryCoverage.undatedPlans.map(row => ({ ...row, cost: "secret-cost" })) } };
  const result = await client(raw, calls).order(orderId);
  assert.deepEqual(result.deliveryCoverage, value.deliveryCoverage);
  assert.equal(/secret-|currency|laborPrice|confirmedSale|cost/u.test(JSON.stringify(result)), false);
  assert.equal(calls.length, 1); assert.equal(calls[0].path, "/api/v1/production-scheduling/orders/" + orderId);
  assert.equal(calls[0].init?.credentials, "include"); assert.equal(calls[0].init?.cache, "no-store");
  assert.equal(calls[0].init?.body, undefined); assert.equal(calls[0].init?.method, "GET");
});

test("legacy missing or null coverage is unavailable, never locally synthesized from plans or source date", async () => {
  const { deliveryCoverage: _coverage, ...legacy } = sample(); void _coverage;
  assert.equal((await client(legacy).order(orderId)).deliveryCoverage, null);
  assert.equal((await client({ ...legacy, deliveryCoverage: null }).order(orderId)).deliveryCoverage, null);
  const empty = { ...structuredClone(orderRead), deliveryCoverage: { schemaVersion: "production-delivery-coverage.v1", basis: "current_registered_facts",
    assessment: "unassessed", completedQuantity: "0", outstandingPlannedQuantity: "30", checkpoints: [], undatedPlans: [] } };
  assert.equal(empty.summary.deliveryDate, "2027-02-01");
  const result = await client(empty).order(orderId);
  assert.equal(result.deliveryCoverage?.assessment, "unassessed"); assert.deepEqual(result.deliveryCoverage?.checkpoints, []);
});

test("large fractional demand remains exact and missing dates do not become zero risk", async () => {
  const value = sample(), amount = "9007199254740993.1234567890123456789";
  value.order.deliveryPlans = [{ id: first, date: "2027-01-10", quantity: amount }];
  value.deliveryCoverage.assessment = "assessed"; value.deliveryCoverage.undatedPlans = [];
  value.deliveryCoverage.checkpoints = [{ date: "2027-01-10", planIds: [first], demandQuantity: amount, cumulativeDemandQuantity: amount,
    expectedOutstandingQuantity: "30", availableQuantity: "30", gapQuantity: "9007199254740963.1234567890123456789" }];
  const result = await client(value).order(orderId);
  assert.equal(result.deliveryCoverage?.checkpoints[0].gapQuantity, "9007199254740963.1234567890123456789");
  value.order.deliveryPlans = [{ id: first, date: null, quantity: amount }];
  value.deliveryCoverage.assessment = "unassessed"; value.deliveryCoverage.checkpoints = [];
  value.deliveryCoverage.undatedPlans = [{ id: first, quantity: amount }];
  assert.deepEqual((await client(value).order(orderId)).deliveryCoverage, value.deliveryCoverage);
});

test("coverage cannot refer to another plan, omit demand, invent a date, duplicate supply or alter the gap", async t => {
  const cases: [string, (value: ReturnType<typeof sample>) => void][] = [
    ["wrong plan", value => { value.deliveryCoverage.checkpoints[0].planIds[0] = orderId; }],
    ["missing plan", value => { value.deliveryCoverage.checkpoints[0].planIds.pop(); }],
    ["duplicate plan", value => { value.deliveryCoverage.checkpoints[0].planIds.push(first); }],
    ["reordered checkpoints", value => { value.deliveryCoverage.checkpoints.reverse(); }],
    ["invented date", value => { value.deliveryCoverage.checkpoints[0].date = "2027-01-09"; }],
    ["omitted checkpoint", value => { value.deliveryCoverage.checkpoints.pop(); }],
    ["bad day sum", value => { value.deliveryCoverage.checkpoints[0].demandQuantity = "29.9"; }],
    ["reused supply", value => { value.deliveryCoverage.checkpoints[1].expectedOutstandingQuantity = "60"; }],
    ["bad cumulative demand", value => { value.deliveryCoverage.checkpoints[1].cumulativeDemandQuantity = "70"; }],
    ["bad available", value => { value.deliveryCoverage.checkpoints[0].availableQuantity = "100"; }],
    ["forged zero gap", value => { value.deliveryCoverage.checkpoints[1].gapQuantity = "0"; }],
    ["missing undated", value => { value.deliveryCoverage.undatedPlans = []; }],
    ["false assessment", value => { value.deliveryCoverage.assessment = "assessed"; }],
    ["bad undated amount", value => { value.deliveryCoverage.undatedPlans[0].quantity = "1"; }],
    ["wrong completed", value => { value.deliveryCoverage.completedQuantity = "1"; }],
    ["wrong outstanding", value => { value.deliveryCoverage.outstandingPlannedQuantity = "0"; }],
    ["mismatched summary", value => { value.summary.completedQuantity = "1"; }],
  ];
  for (const [name, mutate] of cases) await t.test(name, async () => { const value = sample(); mutate(value); await assert.rejects(() => client(value).order(orderId), invalid); });
});

test("unknown schemas, invalid dates, numeric quantities and over-budget coverage are rejected", async t => {
  const base = sample();
  const cases: [string, unknown][] = [
    ["future schema", { ...base.deliveryCoverage, schemaVersion: "production-delivery-coverage.v2" }],
    ["inventory basis", { ...base.deliveryCoverage, basis: "available_inventory" }],
    ["invented risk label", { ...base.deliveryCoverage, assessment: "safe" }],
    ["number quantity", { ...base.deliveryCoverage, completedQuantity: 0 }],
    ["negative quantity", { ...base.deliveryCoverage, completedQuantity: "-1" }],
    ["exponential quantity", { ...base.deliveryCoverage, completedQuantity: "1e10" }],
    ["oversized decimal", { ...base.deliveryCoverage, completedQuantity: "1".repeat(2001) }],
    ["invalid date", { ...base.deliveryCoverage, checkpoints: [{ ...base.deliveryCoverage.checkpoints[0], date: "2027-02-30" }] }],
    ["oversized checkpoints", { ...base.deliveryCoverage, checkpoints: Array(1001).fill(base.deliveryCoverage.checkpoints[0]) }],
    ["oversized identifiers", { ...base.deliveryCoverage, checkpoints: [{ ...base.deliveryCoverage.checkpoints[0], planIds: Array(1001).fill(first) }] }],
    ["oversized undated", { ...base.deliveryCoverage, undatedPlans: Array(1001).fill({ id: first, quantity: "0" }) }],
    ["oversized response", { ...base.deliveryCoverage, unexpectedPrivateField: "not-rendered".repeat(100_000) }],
  ];
  for (const [name, deliveryCoverage] of cases) await t.test(name, async () => {
    await assert.rejects(() => client({ ...base, deliveryCoverage }).order(orderId), invalid);
  });
});

test("cancelled output and ended short output stay with the physical order; their unused remainder is excluded", async () => {
  const value = sample(), cancelledId = first, endedId = second;
  const cancelled = { ...savedAssignment, id: cancelledId, version: 2, status: "cancelled" as const, plannedQuantity: "40", dailyOutputSnapshot: "20", queueSequence: 2 };
  const ended = { ...savedAssignment, id: endedId, plannedQuantity: "50", dailyOutputSnapshot: "25", queueSequence: 3 };
  const savedExecution = (row: typeof savedAssignment, amount: string, completed: boolean) => ({ version: 1, status: completed ? "completed" as const : "in_progress" as const,
    completedQuantity: amount, actualStartDate: null, actualCompletedDate: completed ? "2027-01-06" : null,
    assignmentId: row.id, orderId, assignmentVersion: 1, createdAt: time, updatedAt: time,
    attribution: { assignmentId: row.id, orderId, executionType: row.executionType, productionGroupId: row.productionGroupId,
      outsourceFactoryId: row.outsourceFactoryId, colorId: row.colorId, colorNameSnapshot: row.colorNameSnapshot, resourceSnapshotHash: row.resourceSnapshotHash } });
  value.assignments = [savedAssignment, cancelled, ended];
  value.executions = { [cancelledId]: savedExecution(cancelled, "7", false), [endedId]: savedExecution(ended, "20", true) };
  value.summary = { ...value.summary, plannedQuantity: "80", completedQuantity: "27", accountedQuantity: "57", remainingQuantity: "43", assignmentCount: 2 };
  value.order.deliveryPlans = [{ id: third, date: "2027-01-10", quantity: "100" }];
  value.deliveryCoverage = { schemaVersion: "production-delivery-coverage.v1", basis: "current_registered_facts", assessment: "assessed", completedQuantity: "27", outstandingPlannedQuantity: "30",
    checkpoints: [{ date: "2027-01-10", planIds: [third], demandQuantity: "100", cumulativeDemandQuantity: "100", expectedOutstandingQuantity: "30", availableQuantity: "57", gapQuantity: "43" }], undatedPlans: [] };
  const result = await client(value).order(orderId);
  assert.equal(result.deliveryCoverage?.completedQuantity, "27"); assert.equal(result.deliveryCoverage?.checkpoints[0].gapQuantity, "43");
  value.summary = { ...value.summary, effectiveOrderId: groupId, eligible: false }; value.canCreate = value.canEdit = value.canComplete = false;
  const historical = await client(value).order(orderId);
  assert.equal(historical.order.id, orderId); assert.equal(historical.summary.effectiveOrderId, groupId);
  assert.equal(historical.executions[cancelledId].attribution.orderId, orderId);
  assert.equal(historical.deliveryCoverage?.completedQuantity, "27");
  assert.equal(historical.assignments.find(row => row.id === cancelledId)?.status, "cancelled");
});

test("a late coverage response cannot cross the original session lease or cause a second GET", async () => {
  let finish!: (response: Response) => void, current = true, calls = 0;
  const reader = createProductionPlanClient((() => { calls++; return new Promise<Response>(resolve => { finish = resolve; }); }) as typeof fetch);
  const pending = reader.order(orderId, () => current);
  current = false; finish(Response.json(sample()));
  await assert.rejects(() => pending, (error: unknown) => error instanceof ProductionPlanError && error.code === "plan_owner_changed");
  assert.equal(calls, 1);
});
