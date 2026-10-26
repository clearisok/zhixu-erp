import assert from "node:assert/strict";
import test from "node:test";
import { projectDeliveryCoverage } from "./delivery-coverage.js";
import type { ExecutionFacts } from "./execution-preview.js";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const plan = (n: number, quantity: string, date: string | null = "2027-01-10") => ({ id: id(n), date, quantity });
const execution = (quantity: string, status: "in_progress" | "completed" = "in_progress"): ExecutionFacts => ({ version: 1,
  completedQuantity: quantity, status, actualStartDate: null, actualCompletedDate: status === "completed" ? "2027-02-01" : null });
const assignment = (n: number, quantity: string, plannedEndDate = "2027-01-10", facts: ExecutionFacts | null = null, status: "planned" | "cancelled" = "planned") =>
  ({ id: id(n), status, plannedQuantity: quantity, plannedEndDate, execution: facts });
const code = (expected: string) => (error: unknown) => (error as { code: string }).code === expected;

test("same-day demand is grouped with deterministic identities; inputs remain intact", () => {
  const plans = [plan(2, "0.2"), plan(1, "0.1")], supplies = [assignment(10, "0.3")], before = structuredClone({ plans, supplies });
  const result = projectDeliveryCoverage(plans, supplies);
  assert.deepEqual(result, projectDeliveryCoverage([...plans].reverse(), supplies));
  assert.deepEqual(result.checkpoints, [{ date: "2027-01-10", planIds: [id(1), id(2)], demandQuantity: "0.3", cumulativeDemandQuantity: "0.3",
    expectedOutstandingQuantity: "0.3", availableQuantity: "0.3", gapQuantity: "0" }]);
  assert.equal(result.assessment, "assessed"); assert.equal(result.basis, "current_registered_facts");
  assert.deepEqual({ plans, supplies }, before);
});
test("dated checkpoints compare cumulative demand and supply without consuming either twice", () => {
  const result = projectDeliveryCoverage([plan(3, "20", "2027-01-12"), plan(2, "10", "2027-01-11"), plan(1, "10")],
    [assignment(10, "12", "2027-01-09", execution("2")), assignment(11, "15", "2027-01-12"), assignment(12, "20", "2027-01-13")]);
  assert.equal(result.completedQuantity, "2"); assert.equal(result.outstandingPlannedQuantity, "45");
  assert.deepEqual(result.checkpoints.map(row => [row.date, row.cumulativeDemandQuantity, row.expectedOutstandingQuantity, row.availableQuantity, row.gapQuantity]),
    [["2027-01-10", "10", "10", "12", "0"], ["2027-01-11", "20", "10", "12", "8"], ["2027-01-12", "40", "25", "27", "13"]]);
});
test("cancelled output is retained; cancelled and ended remainder are released", () => {
  const result = projectDeliveryCoverage([plan(1, "100")], [assignment(10, "100", "2027-01-01", execution("7"), "cancelled"),
    assignment(11, "100", "2027-01-01", execution("3", "completed")), assignment(12, "9", "2027-01-11", execution("1"))]);
  assert.equal(result.completedQuantity, "11"); assert.equal(result.outstandingPlannedQuantity, "8");
  // Registered cumulative facts count now; their single end date is not a daily-output ledger.
  assert.equal(result.checkpoints[0].availableQuantity, "11"); assert.equal(result.checkpoints[0].gapQuantity, "89");
});
test("zero corrections and overproduction never create negative expected quantity or demand", () => {
  const zero = projectDeliveryCoverage([plan(1, "0")], [assignment(10, "10", "2027-01-10", execution("0"), "cancelled")]);
  assert.equal(zero.completedQuantity, "0"); assert.equal(zero.outstandingPlannedQuantity, "0"); assert.equal(zero.checkpoints[0].gapQuantity, "0");
  const over = projectDeliveryCoverage([plan(1, "10")], [assignment(10, "2", "2027-02-01", execution("11.125"))]);
  assert.equal(over.completedQuantity, "11.125"); assert.equal(over.outstandingPlannedQuantity, "0"); assert.equal(over.checkpoints[0].gapQuantity, "0");
});
test("undated and missing demand stays explicitly unassessed; no calendar or source fallback", () => {
  assert.equal(projectDeliveryCoverage([], []).assessment, "unassessed");
  const unknown = projectDeliveryCoverage([plan(2, "10", null), plan(1, "0", null)], [assignment(10, "10")]);
  assert.equal(unknown.assessment, "unassessed"); assert.deepEqual(unknown.checkpoints, []);
  assert.deepEqual(unknown.undatedPlans, [{ id: id(1), quantity: "0" }, { id: id(2), quantity: "10" }]);
  const partial = projectDeliveryCoverage([plan(2, "10", null), plan(1, "5")], []);
  assert.equal(partial.assessment, "partially_assessed"); assert.equal(partial.checkpoints[0].gapQuantity, "5");
});
test("large and fractional quantities retain exact digits without Number conversion", () => {
  const amount = "900719925474099300000000000000.123456789012345678901";
  const result = projectDeliveryCoverage([plan(1, amount), plan(2, "0.000000000000000000009")], [assignment(10, amount)]);
  assert.equal(result.checkpoints[0].cumulativeDemandQuantity, "900719925474099300000000000000.12345678901234567891");
  assert.equal(result.checkpoints[0].gapQuantity, "0.000000000000000000009");
});
test("bounded complete inputs fail explicitly; no partial or invalid projection", () => {
  assert.throws(() => projectDeliveryCoverage(Array.from({ length: 1001 }, (_, i) => plan(i, "1")), []), code("production_delivery_projection_limit"));
  assert.throws(() => projectDeliveryCoverage([], Array.from({ length: 501 }, (_, i) => assignment(i, "1"))), code("production_order_plan_limit"));
  assert.throws(() => projectDeliveryCoverage([plan(1, "1"), plan(1, "2")], []), code("production_delivery_coverage_invalid"));
  assert.throws(() => projectDeliveryCoverage([], [assignment(1, "1"), assignment(1, "2")]), code("production_delivery_coverage_invalid"));
  for (const bad of ["-1", "1e3", "NaN", "", "Infinity"]) assert.throws(() => projectDeliveryCoverage([plan(1, bad)], []), code("production_delivery_coverage_invalid"));
  assert.throws(() => projectDeliveryCoverage([plan(1, "1", "2027-02-30")], []), code("production_delivery_coverage_invalid"));
  assert.throws(() => projectDeliveryCoverage([plan(1, "9".repeat(2000)), plan(2, "1")], []), code("production_delivery_coverage_limit"));
});
