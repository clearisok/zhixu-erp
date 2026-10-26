import { canonicalPlanJson } from "../../../server/production-scheduling/canonical-json";
import { projectDeliveryCoverage, type DeliveryCoverage } from "../../../server/production-scheduling/delivery-coverage";
import type { ExecutionFacts } from "../../../server/production-scheduling/execution-preview";
import type { Assignment } from "../../../server/production-scheduling/repository";

type Validation = {
  object(value: unknown): Record<string, unknown>;
  array(value: unknown, max?: number): unknown[];
  uuid(value: unknown): string;
  date(value: unknown): string;
  decimal(value: unknown): string;
  invalid(): never;
  mismatch(): never;
};
type Demand = { id: string; date: string | null; quantity: string };
type Supply = Assignment & { execution: ExecutionFacts | null };

/** The server remains the owner. This whitelist verifies its same-response facts
 * with the existing pure projection; absent coverage never triggers a fallback. */
export function createDeliveryCoverageProjection(v: Validation) {
  return function project(value: unknown, plans: readonly Demand[], assignments: readonly Supply[]): DeliveryCoverage | null {
    if (value === undefined || value === null) return null;
    const raw = v.object(value);
    if (raw.schemaVersion !== "production-delivery-coverage.v1" || raw.basis !== "current_registered_facts"
      || !["assessed", "partially_assessed", "unassessed"].includes(raw.assessment as string)) return v.invalid();
    const coverage: DeliveryCoverage = {
      schemaVersion: "production-delivery-coverage.v1", basis: "current_registered_facts",
      assessment: raw.assessment as DeliveryCoverage["assessment"],
      completedQuantity: v.decimal(raw.completedQuantity),
      outstandingPlannedQuantity: v.decimal(raw.outstandingPlannedQuantity),
      checkpoints: v.array(raw.checkpoints, 1000).map(value => {
        const row = v.object(value);
        return { date: v.date(row.date), planIds: v.array(row.planIds, 1000).map(v.uuid),
          demandQuantity: v.decimal(row.demandQuantity), cumulativeDemandQuantity: v.decimal(row.cumulativeDemandQuantity),
          expectedOutstandingQuantity: v.decimal(row.expectedOutstandingQuantity), availableQuantity: v.decimal(row.availableQuantity),
          gapQuantity: v.decimal(row.gapQuantity) };
      }),
      undatedPlans: v.array(raw.undatedPlans, 1000).map(value => {
        const row = v.object(value); return { id: v.uuid(row.id), quantity: v.decimal(row.quantity) };
      }),
    };
    let expected: DeliveryCoverage;
    try { expected = projectDeliveryCoverage(plans, assignments); } catch { return v.invalid(); }
    if (canonicalPlanJson(coverage) !== canonicalPlanJson(expected)) return v.mismatch();
    return coverage;
  };
}
