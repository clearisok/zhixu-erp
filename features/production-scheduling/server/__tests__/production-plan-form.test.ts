import assert from "node:assert/strict";
import test from "node:test";
import { editPlanForm, newPlanForm, planFormDuration, planFormIntent } from "../production-plan-form";
import { groupId, orderRead, savedAssignment } from "./production-plan-read-fixture";
test("new forms copy known remaining quantity but never invent a date, executor or daily output", () => {
  const form = newPlanForm(orderRead); assert.equal(form.plannedQuantity, "70"); assert.equal(form.executorId, ""); assert.equal(form.startDate, ""); assert.equal(form.dailyOutput, "");
  assert.equal(planFormDuration(form), null); assert.throws(() => planFormIntent(form));
  assert.equal(newPlanForm({ ...orderRead, summary: { ...orderRead.summary, remainingQuantity: null } }).plannedQuantity, "");
});
test("zero and large decimal inputs use the existing exact ceil instead of JS number arithmetic", () => {
  const form = { ...newPlanForm(orderRead, groupId), plannedQuantity: "9007199254740993.25", dailyOutput: "9007199254740992", startDate: "2027-01-04" };
  assert.equal(planFormDuration(form)?.requiredWorkdays, 2); const intent = planFormIntent(form); assert.equal(intent.action, "create"); if (intent.action === "create") assert.equal(intent.data.plannedQuantity, form.plannedQuantity);
  assert.deepEqual(planFormDuration({ ...form, plannedQuantity: "0", durationMode: "workdays", workdays: "3" }), { requiredWorkdays: 3, dailyOutputSnapshot: "0" });
});
test("editing preserves saved quantity, color, executor and versions rather than adopting new source defaults", () => {
  const form = editPlanForm(orderRead, savedAssignment); assert.equal(form.plannedQuantity, "30"); assert.equal(form.executorId, groupId); assert.equal(form.expectedPlanVersion, 2); assert.equal(form.expectedVersion, 1);
  assert.equal(form.dailyOutput, "15"); assert.equal(form.workdays, "2"); assert.equal(form.startDate, "2027-01-04"); assert.equal(planFormIntent(form).action, "update");
  const intent = planFormIntent({ ...form, reason: "明确修改" }); assert.equal(intent.action, "update");
  assert.throws(() => editPlanForm(orderRead, { ...savedAssignment, status: "cancelled" }));
});
test("blank/fractional/huge workdays and missing external fixed dates cannot become valid by coercion", () => {
  const form = { ...newPlanForm(orderRead, groupId), plannedQuantity: "1", durationMode: "workdays" as const, workdays: "1", startDate: "2027-01-04" };
  for (const workdays of ["", "1.5", "0", "36601", "NaN", "1e2"]) { assert.equal(planFormDuration({ ...form, workdays }), null); assert.throws(() => planFormIntent({ ...form, workdays })); }
  assert.throws(() => planFormIntent({ ...form, executionType: "outsource" }));
  const external = { ...form, executionType: "outsource" as const, dateMode: "manual_fixed" as const, endDate: "2027-01-05" };
  assert.equal(planFormIntent(external).action, "create"); assert.throws(() => planFormIntent({ ...external, endDate: "" }));
});
