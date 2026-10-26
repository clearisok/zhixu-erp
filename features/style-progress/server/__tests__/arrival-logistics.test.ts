import assert from "node:assert/strict";
import test from "node:test";
import { recommendMaterialTransport } from "../../../production-scheduling/service/material-logistics-service.ts";
import { projectArrivalBatchLogistics, type ArrivalLogisticsContext } from "../../model/server-arrival-logistics.ts";

const context = (): ArrivalLogisticsContext => ({ schemaVersion: "material-arrival-logistics.v1", orderId: "order", status: "ready", planVersion: 2,
  assignment: { id: "assignment", version: 1, executionType: "internal", productionGroupId: "group", plannedStartDate: "2027-02-01", resourceSnapshotHash: "a".repeat(64) },
  supplyHubId: "hub", versions: { hub: 1, route: 1, modes: [] }, issues: [], settings: {
    productionGroups: [{ id: "group", productionSiteId: "site" }], productionSites: [{ id: "site", name: "采用地点", enabled: true, preProductionSampleLeadDays: 5 }],
    supplyHubs: [{ id: "hub", name: "明确仓", enabled: true }], supplyRoutes: [{ id: "route", name: "路线", enabled: true, supplyHubId: "hub", productionSiteId: "site" }],
    transportModes: [{ id: "sea", routeId: "route", name: "海运", enabled: true, transitDays: 20, sortOrder: 1 },
      { id: "land", routeId: "route", name: "陆运", enabled: true, transitDays: 12, sortOrder: 2 },
      { id: "fast", routeId: "route", name: "快运", enabled: true, transitDays: 8, sortOrder: 3 }] } });

test("Server batches reuse the original slowest-feasible calculator independently, keeping lead time and buffer distinct", () => {
  const c = context(), early = projectArrivalBatchLogistics(c, "2027-01-01"), later = projectArrivalBatchLogistics(c, "2027-01-15");
  assert.equal(early.recommendation?.recommendedMode?.name, "海运"); assert.equal(early.daysToProduction, 31); assert.equal(early.recommendation?.bufferDays, 6); assert.equal(early.bufferRisk, "yellow");
  assert.equal(later.recommendation?.recommendedMode?.name, "陆运"); assert.equal(later.recommendation?.bufferDays, 0); assert.equal(later.daysToProduction, 17);
  assert.deepEqual(early.recommendation, recommendMaterialTransport({ assignment: c.assignment, settings: c.settings, supplyHubId: c.supplyHubId, expectedMaterialReadyDate: "2027-01-01" }));
  assert.equal(projectArrivalBatchLogistics(c, "2026-12-31").bufferRisk, "yellow");
  assert.equal(projectArrivalBatchLogistics(c, "2026-12-30").bufferRisk, "green");
  const late = projectArrivalBatchLogistics(c, "2027-01-20"); assert.equal(late.recommendation?.status, "late"); assert.equal(late.recommendation?.bufferDays, -1); assert.equal(late.bufferRisk, "red");
});
test("missing prerequisites and earliest outsource retain precise original reasons; invalid historical plans never move to a new Hub", () => {
  const cases = [
    ["pending_schedule", (c: ArrivalLogisticsContext) => { c.assignment = null; }],
    ["hub_missing", (c: ArrivalLogisticsContext) => { c.supplyHubId = null; }],
    ["site_missing", (c: ArrivalLogisticsContext) => { c.assignment!.executionType = "outsource"; c.assignment!.productionGroupId = null; }],
    ["route_missing", (c: ArrivalLogisticsContext) => { c.settings.supplyRoutes = []; }],
    ["modes_missing", (c: ArrivalLogisticsContext) => { c.settings.transportModes = []; }],
  ] as const;
  for (const [reason, change] of cases) { const c = context(); change(c); assert.equal(projectArrivalBatchLogistics(c, "2027-01-01").recommendation?.status, reason); }
  for (const issue of ["hub_changed", "unit_changed", "source_unavailable", "overallocated", "demand_unavailable"]) {
    const result = projectArrivalBatchLogistics(context(), "2027-01-01", [issue]); assert.equal(result.status, "blocked"); assert.equal(result.recommendation, null);
  }
  const disabled = context(); disabled.issues = ["hub_disabled"]; assert.match(projectArrivalBatchLogistics(disabled, "2027-01-01").message, /停用/u);
  const ambiguous = context(); ambiguous.issues = ["route_ambiguous"]; assert.equal(projectArrivalBatchLogistics(ambiguous, "2027-01-01").recommendation, null);
  assert.equal(projectArrivalBatchLogistics(context(), "2027-02-30").status, "blocked");
});
