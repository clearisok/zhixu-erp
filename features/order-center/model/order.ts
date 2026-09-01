import type { LaborCurrency, NullableNumber } from "../../quote-center/model/quote-view-model.ts";
import type { OrderType } from "../../shared-domain/model/operations.ts";

export type OrderSourceType = "quote" | "reorder" | "manual" | "ainuoke";
export type SalesOrderStatus = "draft" | "confirmed" | "active" | "completed" | "cancelled";
export type OrderQuantityChangeType = "increase" | "decrease" | "partial_cancel" | "full_cancel";
export type DeliveryPlanBalanceStatus = "unplanned" | "short" | "matched" | "excess";
export type AinuokeOrderSyncStatus = "synced" | "unlinked" | "recommended" | "review_required" | "changed" | "created_from_ainuoke";

export type FabricExecutionSnapshot = {
  id: string;
  sourceFabricLineId: string | null;
  name: string;
  composition: string;
  specification: string;
  supplierNameSnapshot: string;
  remark: string;
};

export type TrimExecutionSnapshot = {
  id: string;
  sourceTrimLineId: string | null;
  name: string;
  specification: string;
  supplierNameSnapshot: string;
  remark: string;
};

export type OrderPriceVersion = {
  id: string;
  salesOrderId: string;
  versionNo: number;
  displayLabel: string;
  salePrice: NullableNumber;
  processingUnitPrice: NullableNumber;
  processingCurrency: LaborCurrency;
  exchangeRateSnapshot: NullableNumber;
  effectiveDate: string;
  reason: string;
  createdAt: string;
  createdBy: string;
};

export type OrderQuantityChange = {
  id: string;
  salesOrderId: string;
  beforeQuantity: number;
  afterQuantity: number;
  delta: number;
  changeType: OrderQuantityChangeType;
  reason: string;
  createdAt: string;
  createdBy: string;
  source?: "manual" | "ainuoke_sync" | "system";
};

export type DeliveryPlan = {
  id: string;
  salesOrderId: string;
  deliveryDate: string;
  quantity: number;
  remark: string;
  createdAt: string;
  updatedAt: string;
  voidedAt: string | null;
  source?: "manual" | "ainuoke_sync";
  salesContractNo?: string | null;
};

export type OrderColorLine = {
  id: string;
  salesOrderId: string;
  salesContractNo: string;
  colorName: string;
  quantity: number;
  deliveryDate: string | null;
  source: "ainuoke_sync";
  sourceHash: string;
  createdAt: string;
  updatedAt: string;
};

/** A SalesOrder is both the commercial order and its single-style execution unit. */
export type SalesOrder = {
  id: string;
  orderNo: string;
  customerId: string | null;
  customerNameSnapshot: string;
  customerPoNo: string;
  sourceType: OrderSourceType;
  creationSource: OrderSourceType;
  sourceOrderId: string | null;
  sourceQuoteId: string | null;
  sourceRevisionId: string | null;
  sourcePriceVersionId: string | null;
  orderDate: string;
  salespersonId: string | null;
  salespersonNameSnapshot: string;
  merchandiserId: string | null;
  merchandiserNameSnapshot: string;
  orderType: OrderType;
  status: SalesOrderStatus;
  salesContractNo: string | null;
  ainuokeSyncStatus: AinuokeOrderSyncStatus;
  ainuokeLastSyncedAt: string | null;
  styleNo: string;
  factoryStyleNo: string;
  styleName: string;
  brandId: string | null;
  brandNameSnapshot: string;
  productionCountry: string;
  processDescription: string;
  customerRequirement: string;
  remark: string;
  businessConfirmedDeliveryDate: string | null;
  contractDeliveryDate: string | null;
  inspectionDate: string | null;
  initialQuantity: number;
  orderColorLines: OrderColorLine[];
  purchasedTrimUnitCostSnapshot: number | null;
  purchasedTrimCurrencySnapshot: LaborCurrency | null;
  purchasedTrimRuleId: string | null;
  purchasedTrimCostOverride: boolean;
  factorySettlementUnitPrice: number | null;
  averageDailyOutput?: number | null;
  fabricExecutionSnapshots: FabricExecutionSnapshot[];
  trimExecutionSnapshots: TrimExecutionSnapshot[];
  quantityChanges: OrderQuantityChange[];
  deliveryPlans: DeliveryPlan[];
  priceVersions: OrderPriceVersion[];
  currentPriceVersionId: string;
  imageAttachmentIds: string[];
  fileAttachmentIds: string[];
  styleImageAttachmentId: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
};

export type OrderIntegrityIssue = { code: string; message: string; salesOrderId?: string };

export const createOrderId = (prefix: string) => globalThis.crypto?.randomUUID?.()
  ?? `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

export function normalizeOrderNo(value: string): string {
  return value.normalize("NFKC").trim().toLocaleUpperCase();
}

export function getEffectiveQuantity(order: SalesOrder): number {
  return order.initialQuantity + order.quantityChanges.reduce((sum, change) => sum + change.delta, 0);
}

export function activeDeliveryPlans(order: SalesOrder): DeliveryPlan[] {
  return order.deliveryPlans.filter((plan) => plan.voidedAt === null);
}

export function getDeliveryPlannedQuantity(order: SalesOrder): number {
  return activeDeliveryPlans(order).reduce((sum, plan) => sum + plan.quantity, 0);
}

export function getDeliveryDifference(order: SalesOrder): number {
  return getDeliveryPlannedQuantity(order) - getEffectiveQuantity(order);
}

export function getDeliveryBalanceStatus(order: SalesOrder): DeliveryPlanBalanceStatus {
  const planned = getDeliveryPlannedQuantity(order);
  if (!activeDeliveryPlans(order).length) return "unplanned";
  const difference = planned - getEffectiveQuantity(order);
  if (difference < 0) return "short";
  if (difference > 0) return "excess";
  return "matched";
}

export function getCurrentPriceVersion(order: SalesOrder): OrderPriceVersion {
  const current = order.priceVersions.find((version) => version.id === order.currentPriceVersionId && version.salesOrderId === order.id);
  if (!current) throw new Error(`订单 ${order.orderNo || order.id} · ${order.styleNo || "未填写款号"} 的当前价格版本指针无效`);
  return current;
}

export function calculateFactorySettlementUnitPrice(order: SalesOrder): number | null {
  const processing = getCurrentPriceVersion(order).processingUnitPrice;
  return processing == null || order.purchasedTrimUnitCostSnapshot == null ? processing ?? null : processing + order.purchasedTrimUnitCostSnapshot;
}

export function getNearestDeliveryDate(order: SalesOrder): string | null {
  return activeDeliveryPlans(order).map((plan) => plan.deliveryDate).sort()[0] ?? null;
}

export function getLatestDeliveryDate(order: SalesOrder): string | null {
  return activeDeliveryPlans(order).map((plan) => plan.deliveryDate).sort().at(-1) ?? null;
}

export const getOrderNearestDeliveryDate = getNearestDeliveryDate;
export const getOrderLatestDeliveryDate = getLatestDeliveryDate;


export function validateOrderIntegrity(order: SalesOrder): OrderIntegrityIssue[] {
  const issues: OrderIntegrityIssue[] = [];
  if (!normalizeOrderNo(order.orderNo)) issues.push({ code: "order.orderNo.required", message: "请填写订单号", salesOrderId: order.id });
  if (!order.customerNameSnapshot.trim()) issues.push({ code: "order.customer.required", message: "请填写客户", salesOrderId: order.id });
  if (!order.styleNo.trim()) issues.push({ code: "order.styleNo.required", message: "请填写款号", salesOrderId: order.id });
  if (!Number.isFinite(order.initialQuantity) || order.initialQuantity < 0) issues.push({ code: "order.quantity.invalid", message: `${order.styleNo || "订单"}的原始数量无效`, salesOrderId: order.id });
  try { getCurrentPriceVersion(order); } catch { issues.push({ code: "order.price.pointer", message: `${order.styleNo || "订单"}的当前价格版本无效`, salesOrderId: order.id }); }
  const current = order.priceVersions.find((version) => version.id === order.currentPriceVersionId && version.salesOrderId === order.id);
  if (order.orderType === "processing" && (current?.processingUnitPrice === null || !current?.processingCurrency)) issues.push({ code: "order.processingPrice.required", message: `${order.styleNo || "订单"}缺少加工工价`, salesOrderId: order.id });
  return issues;
}

function assertUnique(values: string[], label: string): void {
  if (new Set(values).size !== values.length) throw new Error(`${label}存在重复 ID`);
}

export function validateOrderCollection(value: unknown): SalesOrder[] {
  if (!Array.isArray(value)) throw new Error("订单本地数据格式无效");
  const orders = value as SalesOrder[];
  assertUnique(orders.map((order) => order?.id), "订单");
  const normalizedOrderNos = orders.map((order) => normalizeOrderNo(order?.orderNo ?? ""));
  if (new Set(normalizedOrderNos).size !== normalizedOrderNos.length) throw new Error("订单号存在重复值");
  const salesContractNos = orders.map((order) => order?.salesContractNo?.normalize("NFKC").trim().toLocaleUpperCase()).filter((value): value is string => Boolean(value));
  if (new Set(salesContractNos).size !== salesContractNos.length) throw new Error("销售合同号存在重复值");
  for (const order of orders) {
    if (!order || typeof order !== "object") throw new Error("订单本地数据格式无效");
    if (!Array.isArray(order.priceVersions) || !Array.isArray(order.quantityChanges) || !Array.isArray(order.deliveryPlans) || !Array.isArray(order.orderColorLines)) throw new Error(`订单 ${order.orderNo || order.id} 的历史集合结构无效`);
    if (!order.priceVersions.some((version) => version.id === order.currentPriceVersionId && version.salesOrderId === order.id)) throw new Error(`订单 ${order.orderNo || order.id} 的当前价格版本指针损坏`);
    if (order.priceVersions.some((version) => version.salesOrderId !== order.id)) throw new Error(`订单 ${order.orderNo || order.id} 的价格历史归属损坏`);
    if (order.quantityChanges.some((change) => change.salesOrderId !== order.id)) throw new Error(`订单 ${order.orderNo || order.id} 的数量历史归属损坏`);
    if (order.deliveryPlans.some((plan) => plan.salesOrderId !== order.id)) throw new Error(`订单 ${order.orderNo || order.id} 的交期历史归属损坏`);
    if (order.orderColorLines.some((line) => line.salesOrderId !== order.id || line.salesContractNo !== order.salesContractNo)) throw new Error(`订单 ${order.orderNo || order.id} 的颜色数量归属损坏`);
    assertUnique(order.priceVersions.map((version) => version.id), `订单 ${order.orderNo} 的价格版本`);
    assertUnique(order.quantityChanges.map((change) => change.id), `订单 ${order.orderNo} 的数量变更`);
    assertUnique(order.deliveryPlans.map((plan) => plan.id), `订单 ${order.orderNo} 的交期`);
    assertUnique(order.orderColorLines.map((line) => line.id), `订单 ${order.orderNo} 的颜色数量`);
  }
  return structuredClone(orders);
}

export function normalizeSalesOrderV10(order: SalesOrder): SalesOrder {
  const sourceType = order.sourceType === "quote" || order.sourceType === "reorder" || order.sourceType === "ainuoke" ? order.sourceType : "manual";
  const normalized: SalesOrder = {
    ...structuredClone(order),
    sourceType,
    creationSource: order.creationSource ?? sourceType,
    salesContractNo: order.salesContractNo?.normalize("NFKC").trim().toLocaleUpperCase() || null,
    ainuokeSyncStatus: order.ainuokeSyncStatus ?? (order.salesContractNo ? "synced" : "unlinked"),
    ainuokeLastSyncedAt: order.ainuokeLastSyncedAt ?? null,
    factoryStyleNo: order.factoryStyleNo ?? "",
    businessConfirmedDeliveryDate: order.businessConfirmedDeliveryDate ?? null,
    contractDeliveryDate: order.contractDeliveryDate ?? null,
    inspectionDate: order.inspectionDate ?? null,
    orderColorLines: Array.isArray(order.orderColorLines) ? order.orderColorLines : [],
    purchasedTrimUnitCostSnapshot: order.purchasedTrimUnitCostSnapshot ?? null,
    purchasedTrimCurrencySnapshot: order.purchasedTrimCurrencySnapshot ?? null,
    purchasedTrimRuleId: order.purchasedTrimRuleId ?? null,
    purchasedTrimCostOverride: order.purchasedTrimCostOverride ?? false,
    factorySettlementUnitPrice: order.factorySettlementUnitPrice ?? null,
  };
  return normalized;
}

export function orderReferencesAttachment(order: SalesOrder, attachmentId: string): boolean {
  return order.styleImageAttachmentId === attachmentId || order.imageAttachmentIds.includes(attachmentId) || order.fileAttachmentIds.includes(attachmentId);
}
