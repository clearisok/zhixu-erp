import { HttpError } from "../http/errors.js";
import { productionResourceDate, productionResourceUuid } from "../production-resources/contract.js";
import { canonicalDecimal } from "../quotes/decimal-projection.js";
import { projectExecutionQuantities, type ExecutionFacts } from "./execution-preview.js";
import { SCHEDULE_PLANNING_LIMITS } from "./planning-preview.js";
import type { Assignment } from "./repository.js";

type Demand = { id: string; date: string | null; quantity: string };
type Supply = Pick<Assignment, "id" | "status" | "plannedQuantity" | "plannedEndDate"> & { execution: ExecutionFacts | null };
export type DeliveryCoverage = {
  schemaVersion: "production-delivery-coverage.v1";
  basis: "current_registered_facts";
  assessment: "assessed" | "partially_assessed" | "unassessed";
  completedQuantity: string;
  outstandingPlannedQuantity: string;
  checkpoints: {
    date: string; planIds: string[]; demandQuantity: string; cumulativeDemandQuantity: string;
    expectedOutstandingQuantity: string; availableQuantity: string; gapQuantity: string;
  }[];
  undatedPlans: { id: string; quantity: string }[];
};
const fail = (status = 503, code = "production_delivery_coverage_invalid"): never => { throw new HttpError(status, code, code); };
function quantity(value: string): string {
  if (typeof value !== "string" || value.length > 2000 || !/^\d+(?:\.\d+)?$/u.test(value)) return fail();
  try { return canonicalDecimal(value); } catch { return fail(); }
}
function id(value: string): string { try { return productionResourceUuid(value); } catch { return fail(); } }
function date(value: string): string { try { return productionResourceDate(value); } catch { return fail(); } }
function arithmetic(a: string, b: string, subtract = false): string {
  const [aw, af = ""] = a.split("."), [bw, bf = ""] = b.split("."), scale = Math.max(af.length, bf.length);
  const left = BigInt(aw + af.padEnd(scale, "0")), right = BigInt(bw + bf.padEnd(scale, "0"));
  const n = subtract ? (left > right ? left - right : BigInt(0)) : left + right;
  const digits = n.toString().padStart(scale + 1, "0"), expanded = scale ? digits.slice(0, -scale) + "." + digits.slice(-scale) : digits;
  if (expanded.length > 2000) return fail(422, "production_delivery_coverage_limit");
  return canonicalDecimal(expanded);
}
/** Current cumulative output is available now, never reconstructed as dated production or inventory. */
export function projectDeliveryCoverage(plans: readonly Demand[], assignments: readonly Supply[]): DeliveryCoverage {
  if (!Array.isArray(plans) || plans.length > 1000) return fail(422, "production_delivery_projection_limit");
  if (!Array.isArray(assignments) || assignments.length > SCHEDULE_PLANNING_LIMITS.queueRows) return fail(422, "production_order_plan_limit");
  const demandByDate = new Map<string, { planIds: string[]; quantity: string }>(), undatedPlans: DeliveryCoverage["undatedPlans"] = [];
  const planIds = new Set<string>(), assignmentIds = new Set<string>();
  for (const plan of plans) {
    const planId = id(plan.id), amount = quantity(plan.quantity);
    if (planIds.has(planId)) return fail();
    planIds.add(planId);
    if (plan.date === null) { undatedPlans.push({ id: planId, quantity: amount }); continue; }
    const day = date(plan.date), group = demandByDate.get(day) ?? { planIds: [], quantity: "0" };
    group.planIds.push(planId); group.quantity = arithmetic(group.quantity, amount); demandByDate.set(day, group);
  }
  let completedQuantity = "0", outstandingPlannedQuantity = "0";
  const remainingByDate = new Map<string, string>();
  for (const assignment of assignments) {
    const assignmentId = id(assignment.id), day = date(assignment.plannedEndDate);
    if (assignmentIds.has(assignmentId)) return fail();
    assignmentIds.add(assignmentId);
    let totals;
    // Reuse D151, including cancelled output and completed-but-short release semantics.
    try { totals = projectExecutionQuantities([assignment]); } catch { return fail(); }
    completedQuantity = arithmetic(completedQuantity, totals.completedQuantity);
    outstandingPlannedQuantity = arithmetic(outstandingPlannedQuantity, totals.outstandingPlannedQuantity);
    remainingByDate.set(day, arithmetic(remainingByDate.get(day) ?? "0", totals.outstandingPlannedQuantity));
  }
  const remaining = [...remainingByDate].sort(([a], [b]) => a.localeCompare(b));
  let next = 0, expectedOutstandingQuantity = "0", cumulativeDemandQuantity = "0";
  const checkpoints = [...demandByDate].sort(([a], [b]) => a.localeCompare(b)).map(([day, group]) => {
    while (next < remaining.length && remaining[next][0] <= day) {
      expectedOutstandingQuantity = arithmetic(expectedOutstandingQuantity, remaining[next][1]); next++;
    }
    cumulativeDemandQuantity = arithmetic(cumulativeDemandQuantity, group.quantity);
    const availableQuantity = arithmetic(completedQuantity, expectedOutstandingQuantity);
    return { date: day, planIds: group.planIds.sort(), demandQuantity: group.quantity, cumulativeDemandQuantity,
      expectedOutstandingQuantity, availableQuantity, gapQuantity: arithmetic(cumulativeDemandQuantity, availableQuantity, true) };
  });
  return { schemaVersion: "production-delivery-coverage.v1", basis: "current_registered_facts",
    assessment: checkpoints.length ? undatedPlans.length ? "partially_assessed" : "assessed" : "unassessed",
    completedQuantity, outstandingPlannedQuantity, checkpoints, undatedPlans: undatedPlans.sort((a, b) => a.id.localeCompare(b.id)) };
}
