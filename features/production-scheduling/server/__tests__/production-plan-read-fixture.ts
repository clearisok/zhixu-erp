import type { Assignment, PlanOrderRead, PlanOrderSummary } from "../production-plan-client";
export const orderId = "11111111-1111-4111-8111-111111111111", groupId = "22222222-2222-4222-8222-222222222222";
export const assignmentId = "33333333-3333-4333-8333-333333333333", requestId = "44444444-4444-4444-8444-444444444444";
export const time = "2026-10-20T00:00:00.000Z", resourceHash = "a".repeat(64);
export const orderSummary: PlanOrderSummary = { id: orderId, orderNo: "SO-SYNTHETIC", lifecycleState: "active", businessType: "ainuoke_contract", effectiveOrderId: orderId,
  quantity: "100", plannedQuantity: "30", completedQuantity: "0", outstandingPlannedQuantity: "30", accountedQuantity: "30", remainingQuantity: "70", overassignedQuantity: "0", allocationState: "partial", assignmentCount: 1, planVersion: 2,
  styleNo: "SYNTHETIC", factoryStyleNo: "SYN-FACTORY", customerName: "合成客户", brandName: "合成品牌", contractNo: "SYN-CONTRACT", customerReference: null, deliveryDate: "2027-02-01", eligible: true };
export const savedAssignment: Assignment = { id: assignmentId, orderId, version: 1, executionType: "internal", productionGroupId: groupId, outsourceFactoryId: null,
  colorId: null, colorNameSnapshot: null, plannedQuantity: "30", durationMode: "workdays", dailyOutputSnapshot: "15", requiredWorkdays: 2, dateMode: "auto_queue",
  plannedStartDate: "2027-01-04", firstProductionDate: "2027-01-04", plannedEndDate: "2027-01-05", nonWorkingDayCount: 0, queueSequence: 1, resourceSnapshotHash: resourceHash,
  status: "planned", remark: "合成计划", createdBy: "10", updatedBy: "10", createdAt: time, updatedAt: time };
export const resources: PlanOrderRead["resources"] = { [resourceHash]: { executionType: "internal", group: { id: groupId, name: "采用的原组名", version: 1 },
  site: { id: orderId, name: "地点", version: 1 }, calendar: { id: requestId, name: "日历", version: 1 } } };
export const orderRead: PlanOrderRead = { summary: orderSummary, order: { id: orderId, orderNo: orderSummary.orderNo, planVersion: 2, colors: [], deliveryPlans: [] },
  assignments: [savedAssignment], executions: {}, resources, canCreate: true, canEdit: true, canComplete: true };
