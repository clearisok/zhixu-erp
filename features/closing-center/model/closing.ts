import type { LaborCurrency } from "../../quote-center/model/quote-view-model.ts";
import type { OrderType } from "../../shared-domain/model/operations.ts";
import type { ExecutionType } from "../../shared-domain/model/operations.ts";

export type ClosingPeriodStatus = "open" | "confirmed" | "locked";
export type ClosingAllocationStatus = "active" | "voided";
export type ClosingStatusProjection = "unclosed" | "partially_closed" | "closed" | "over_allocated";

export type ScheduleBasisSnapshot = {
  scheduleAssignmentId: string;
  assignmentUpdatedAt: string;
  executionType: ExecutionType;
  productionGroupId: string | null;
  productionGroupName: string | null;
  outsourceFactoryId: string | null;
  outsourceFactoryName: string | null;
  plannedQuantity: number;
};

export type ClosingPeriod = {
  id: string;
  month: string;
  status: ClosingPeriodStatus;
  taxRateSnapshot: number;
  remark: string;
  confirmedAt: string | null;
  confirmedBy: string | null;
  confirmedByName: string | null;
  lockedAt: string | null;
  lockedBy: string | null;
  lockedByName: string | null;
  reopenedAt: string | null;
  reopenedBy: string | null;
  reopenedByName: string | null;
  reopenReason: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  createdByName: string;
  updatedBy: string;
  updatedByName: string;
};

export type ClosingAllocation = {
  id: string;
  closingPeriodId: string;
  salesOrderId: string;
  scheduleAssignmentId: string | null;
  quantity: number;
  orderTypeSnapshot: OrderType;
  salePriceSnapshot: number | null;
  closingProcessingUnitPrice: number;
  processingCurrencySnapshot: LaborCurrency;
  fxRateSnapshot: number | null;
  currencySnapshot: LaborCurrency;
  legacyFxRateApplied: boolean;
  salesContractNoSnapshot: string | null;
  customerProcessingUnitPriceSnapshot: number;
  purchasedTrimUnitCostSnapshot: number | null;
  factorySettlementUnitPriceSnapshot: number;
  taxRateSnapshot: number;
  executionTypeSnapshot: ExecutionType | null;
  productionGroupIdSnapshot: string | null;
  productionGroupNameSnapshot: string | null;
  outsourceFactoryIdSnapshot: string | null;
  outsourceFactoryNameSnapshot: string | null;
  scheduleBasisSnapshot: ScheduleBasisSnapshot | null;
  staleAcknowledgedFingerprint: string | null;
  staleAcknowledgedAt: string | null;
  staleAcknowledgedBy: string | null;
  staleAcknowledgedByName: string | null;
  staleAcknowledgedReason: string | null;
  remark: string;
  status: ClosingAllocationStatus;
  voidedAt: string | null;
  voidedBy: string | null;
  voidedByName: string | null;
  voidReason: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  createdByName: string;
  updatedBy: string;
  updatedByName: string;
};

export type ClosingState = { periods: ClosingPeriod[]; allocations: ClosingAllocation[] };
export const emptyClosingState = (): ClosingState => ({ periods: [], allocations: [] });

const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/;
const unique = (values: string[], label: string) => { if (new Set(values).size !== values.length) throw new Error(`${label}存在重复 ID`); };

export function validateClosingState(value: unknown, context?: { orderIds?: Set<string>; assignmentIds?: Set<string> }): ClosingState {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("关账本地数据格式无效");
  const source = value as Partial<ClosingState>;
  if (!Array.isArray(source.periods) || !Array.isArray(source.allocations)) throw new Error("关账集合结构无效");
  const state = structuredClone(source) as ClosingState;
  state.allocations = state.allocations.map((allocation) => {
    const legacyAllocation = allocation as Partial<ClosingAllocation>;
    const legacyFxRateApplied = legacyAllocation.legacyFxRateApplied ?? (legacyAllocation.currencySnapshot === undefined && allocation.processingCurrencySnapshot === "USD" && Number.isFinite(allocation.fxRateSnapshot) && (allocation.fxRateSnapshot ?? 0) > 0);
    const customerProcessingUnitPriceSnapshot = allocation.customerProcessingUnitPriceSnapshot ?? allocation.closingProcessingUnitPrice;
    return {
      ...allocation,
      currencySnapshot: allocation.currencySnapshot ?? allocation.processingCurrencySnapshot,
      legacyFxRateApplied,
      salesContractNoSnapshot: allocation.salesContractNoSnapshot ?? null,
      customerProcessingUnitPriceSnapshot,
      purchasedTrimUnitCostSnapshot: allocation.purchasedTrimUnitCostSnapshot ?? null,
      factorySettlementUnitPriceSnapshot: allocation.factorySettlementUnitPriceSnapshot ?? customerProcessingUnitPriceSnapshot,
    };
  });
  unique(state.periods.map((item) => item.id), "关账期间");
  unique(state.periods.map((item) => item.month), "关账月份");
  unique(state.allocations.map((item) => item.id), "关账归属");
  const periodIds = new Set(state.periods.map((item) => item.id));
  for (const period of state.periods) {
    if (!period.id || !monthPattern.test(period.month) || !["open", "confirmed", "locked"].includes(period.status)) throw new Error("关账期间字段无效");
    if (!Number.isFinite(period.taxRateSnapshot) || period.taxRateSnapshot < 0) throw new Error("关账税率不能小于 0");
  }
  for (const allocation of state.allocations) {
    if (!allocation.id || !periodIds.has(allocation.closingPeriodId)) throw new Error("关账归属的月份不存在");
    if (!allocation.salesOrderId || context?.orderIds && !context.orderIds.has(allocation.salesOrderId)) throw new Error("关账归属的订单不存在");
    if (!Number.isFinite(allocation.quantity) || allocation.quantity < 0) throw new Error("关账数量不能小于 0");
    if (!Number.isFinite(allocation.closingProcessingUnitPrice) || allocation.closingProcessingUnitPrice < 0) throw new Error("关账工价不能小于 0");
    if (!Number.isFinite(allocation.taxRateSnapshot) || allocation.taxRateSnapshot < 0) throw new Error("关账税率不能小于 0");
    if (allocation.legacyFxRateApplied && allocation.processingCurrencySnapshot === "USD" && (!Number.isFinite(allocation.fxRateSnapshot) || (allocation.fxRateSnapshot ?? 0) <= 0)) throw new Error("旧版 USD 关账必须保留有效汇率快照");
    if (!Number.isFinite(allocation.customerProcessingUnitPriceSnapshot) || allocation.customerProcessingUnitPriceSnapshot < 0 || !Number.isFinite(allocation.factorySettlementUnitPriceSnapshot) || allocation.factorySettlementUnitPriceSnapshot < 0) throw new Error("关账结算单价快照无效");
    if (allocation.orderTypeSnapshot === "distribution" && (!Number.isFinite(allocation.salePriceSnapshot) || allocation.salePriceSnapshot === null || allocation.salePriceSnapshot < 0)) throw new Error("经销订单关账必须保存销售价快照");
    if (allocation.scheduleAssignmentId && context?.assignmentIds && !context.assignmentIds.has(allocation.scheduleAssignmentId) && !allocation.scheduleBasisSnapshot) throw new Error("关账归属引用了不存在的排单且缺少历史快照");
    if (allocation.executionTypeSnapshot === "internal" && (!allocation.productionGroupIdSnapshot || allocation.outsourceFactoryIdSnapshot)) throw new Error("内部关账归属执行方快照无效");
    if (allocation.executionTypeSnapshot === "outsource" && (!allocation.outsourceFactoryIdSnapshot || allocation.productionGroupIdSnapshot)) throw new Error("外发关账归属执行方快照无效");
    if (allocation.executionTypeSnapshot === null && (allocation.productionGroupIdSnapshot || allocation.outsourceFactoryIdSnapshot)) throw new Error("未分配关账归属不能保存执行方");
  }
  return state;
}

export const activeClosingAllocations = (state: ClosingState) => state.allocations.filter((item) => item.status !== "voided" && item.voidedAt === null);
