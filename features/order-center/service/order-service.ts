import { calculatePriceVersionMetrics } from "../../quote-center/model/quote-calculations.ts";
import { truncateFinalQuoteValue } from "../../quote-center/model/final-quote-format.ts";
import type { PriceVersion, Quote, QuoteRevision } from "../../quote-center/model/quote-view-model.ts";
import {
  activeDeliveryPlans,
  createOrderId,
  getCurrentPriceVersion,
  getEffectiveQuantity,
  normalizeOrderNo,
  type DeliveryPlan,
  type OrderPriceVersion,
  type OrderQuantityChangeType,
  type SalesOrder,
} from "../model/order.ts";

export type OrderActor = { id: string; name: string };
export type OrderHeaderInput = Pick<SalesOrder, "orderNo" | "customerId" | "customerNameSnapshot" | "customerPoNo" | "orderDate" | "salespersonId" | "salespersonNameSnapshot" | "merchandiserId" | "merchandiserNameSnapshot" | "orderType" | "remark">;
export type OrderStyleInput = Pick<SalesOrder, "styleNo" | "styleName" | "brandId" | "brandNameSnapshot" | "productionCountry" | "processDescription" | "customerRequirement" | "initialQuantity" | "averageDailyOutput" | "fabricExecutionSnapshots" | "trimExecutionSnapshots" | "imageAttachmentIds" | "fileAttachmentIds" | "styleImageAttachmentId">;

const nowIso = () => new Date().toISOString();

export function suggestOrderNo(existing: ReadonlyArray<Pick<SalesOrder, "orderNo">>, date: string): string {
  const compactDate = date.replaceAll("-", "") || new Date().toISOString().slice(0, 10).replaceAll("-", "");
  let sequence = existing.length + 1;
  let candidate = `SO-${compactDate}-${String(sequence).padStart(3, "0")}`;
  const used = new Set(existing.map((order) => normalizeOrderNo(order.orderNo)));
  while (used.has(normalizeOrderNo(candidate))) candidate = `SO-${compactDate}-${String(++sequence).padStart(3, "0")}`;
  return candidate;
}

export function createInitialOrderPriceVersion(input: {
  salesOrderId: string;
  salePrice: number | null;
  processingUnitPrice: number | null;
  processingCurrency: "CNY" | "USD";
  exchangeRateSnapshot: number | null;
  effectiveDate: string;
  reason: string;
  actor: OrderActor;
  createdAt?: string;
}): OrderPriceVersion {
  return {
    id: createOrderId("order-price"),
    salesOrderId: input.salesOrderId,
    versionNo: 1,
    displayLabel: "P1",
    salePrice: input.salePrice,
    processingUnitPrice: input.processingUnitPrice,
    processingCurrency: input.processingCurrency,
    exchangeRateSnapshot: input.exchangeRateSnapshot,
    effectiveDate: input.effectiveDate,
    reason: input.reason,
    createdAt: input.createdAt ?? nowIso(),
    createdBy: input.actor.name,
  };
}

const emptyStyle = (input: Partial<OrderStyleInput> = {}): OrderStyleInput => ({
  styleNo: input.styleNo ?? "",
  styleName: input.styleName ?? "",
  brandId: input.brandId ?? null,
  brandNameSnapshot: input.brandNameSnapshot ?? "",
  productionCountry: input.productionCountry ?? "",
  processDescription: input.processDescription ?? "",
  customerRequirement: input.customerRequirement ?? "",
  initialQuantity: input.initialQuantity ?? 0,
  averageDailyOutput: input.averageDailyOutput ?? null,
  fabricExecutionSnapshots: structuredClone(input.fabricExecutionSnapshots ?? []),
  trimExecutionSnapshots: structuredClone(input.trimExecutionSnapshots ?? []),
  imageAttachmentIds: [...(input.imageAttachmentIds ?? [])],
  fileAttachmentIds: [...(input.fileAttachmentIds ?? [])],
  styleImageAttachmentId: input.styleImageAttachmentId ?? null,
});

export function createManualOrder(input: { header: OrderHeaderInput; style?: Partial<OrderStyleInput>; actor: OrderActor; id?: string; createdAt?: string }): SalesOrder {
  const timestamp = input.createdAt ?? nowIso();
  const id = input.id ?? createOrderId("sales-order");
  const style = emptyStyle(input.style);
  const price = createInitialOrderPriceVersion({ salesOrderId: id, salePrice: null, processingUnitPrice: null, processingCurrency: "CNY", exchangeRateSnapshot: null, effectiveDate: input.header.orderDate, reason: "初始订单价格", actor: input.actor, createdAt: timestamp });
  return {
    id,
    ...input.header,
    ...style,
    orderNo: input.header.orderNo.trim(),
    sourceType: "manual",
    sourceOrderId: null,
    sourceQuoteId: null,
    sourceRevisionId: null,
    sourcePriceVersionId: null,
    status: "draft",
    quantityChanges: [],
    deliveryPlans: [],
    priceVersions: [price],
    currentPriceVersionId: price.id,
    createdAt: timestamp,
    updatedAt: timestamp,
    createdBy: input.actor.name,
    updatedBy: input.actor.name,
  };
}

export function createOrderFromQuote(input: { quote: Quote; revision: QuoteRevision; priceVersion: PriceVersion; header: OrderHeaderInput; initialQuantity: number; actor: OrderActor }): SalesOrder {
  const { quote, revision, priceVersion, header, initialQuantity, actor } = input;
  const timestamp = nowIso();
  const id = createOrderId("sales-order");
  const metrics = calculatePriceVersionMetrics(priceVersion);
  const initialPrice = createInitialOrderPriceVersion({
    salesOrderId: id,
    salePrice: header.orderType === "distribution" ? truncateFinalQuoteValue(metrics.garmentSellingPrice, 1) : null,
    processingUnitPrice: priceVersion.labor.value,
    processingCurrency: priceVersion.pricingParameters.laborCurrency,
    exchangeRateSnapshot: priceVersion.pricingParameters.usdCnyRate,
    effectiveDate: header.orderDate,
    reason: "报价生成订单初始价格",
    actor,
    createdAt: timestamp,
  });
  return {
    id,
    ...header,
    orderNo: header.orderNo.trim(),
    sourceType: "quote",
    sourceOrderId: null,
    sourceQuoteId: quote.id,
    sourceRevisionId: revision.revisionId,
    sourcePriceVersionId: priceVersion.id,
    status: "draft",
    styleNo: revision.baseInfo.quoteStyleNo,
    styleName: revision.baseInfo.styleName,
    brandId: revision.baseInfo.brandId || null,
    brandNameSnapshot: revision.baseInfo.brandName,
    productionCountry: priceVersion.pricingParameters.manufacturingCountry,
    processDescription: priceVersion.labor.description,
    customerRequirement: priceVersion.description,
    remark: revision.baseInfo.note || header.remark,
    initialQuantity,
    averageDailyOutput: null,
    fabricExecutionSnapshots: priceVersion.fabrics.map((line) => ({ id: createOrderId("fabric-execution"), sourceFabricLineId: line.id, name: line.name, composition: line.composition, specification: [line.netWidthCm === null ? "" : `${line.netWidthCm}cm`, line.gsm === null ? "" : `${line.gsm}gsm`].filter(Boolean).join(" / "), supplierNameSnapshot: line.supplier, remark: "" })),
    trimExecutionSnapshots: priceVersion.trims.map((line) => ({ id: createOrderId("trim-execution"), sourceTrimLineId: line.id, name: line.name, specification: line.specification, supplierNameSnapshot: line.supplier, remark: "" })),
    quantityChanges: [],
    deliveryPlans: [],
    priceVersions: [initialPrice],
    currentPriceVersionId: initialPrice.id,
    imageAttachmentIds: [...revision.imageAttachmentIds],
    fileAttachmentIds: [...revision.fileAttachmentIds],
    styleImageAttachmentId: revision.styleImageAttachmentId,
    createdAt: timestamp,
    updatedAt: timestamp,
    createdBy: actor.name,
    updatedBy: actor.name,
  };
}

export function createReorder(input: { source: SalesOrder; orderNo: string; orderDate: string; actor: OrderActor }): SalesOrder {
  const timestamp = nowIso();
  const id = createOrderId("sales-order");
  const current = getCurrentPriceVersion(input.source);
  const price = createInitialOrderPriceVersion({ salesOrderId: id, salePrice: current.salePrice, processingUnitPrice: current.processingUnitPrice, processingCurrency: current.processingCurrency, exchangeRateSnapshot: current.exchangeRateSnapshot, effectiveDate: input.orderDate, reason: "翻单初始价格", actor: input.actor, createdAt: timestamp });
  return {
    ...structuredClone(input.source),
    id,
    orderNo: input.orderNo.trim(),
    customerPoNo: "",
    sourceType: "reorder",
    sourceOrderId: input.source.id,
    orderDate: input.orderDate,
    status: "draft",
    initialQuantity: getEffectiveQuantity(input.source),
    quantityChanges: [],
    deliveryPlans: [],
    priceVersions: [price],
    currentPriceVersionId: price.id,
    createdAt: timestamp,
    updatedAt: timestamp,
    createdBy: input.actor.name,
    updatedBy: input.actor.name,
  };
}

export function createOrderPriceVersion(order: SalesOrder, input: { salePrice: number | null; processingUnitPrice: number | null; processingCurrency: "CNY" | "USD"; exchangeRateSnapshot: number | null; effectiveDate: string; reason: string; actor: OrderActor }): SalesOrder {
  if (!input.reason.trim()) throw new Error("调整价格必须填写原因");
  getCurrentPriceVersion(order);
  const timestamp = nowIso();
  const versionNo = Math.max(0, ...order.priceVersions.map((version) => version.versionNo)) + 1;
  const next: OrderPriceVersion = { id: createOrderId("order-price"), salesOrderId: order.id, versionNo, displayLabel: `P${versionNo}`, salePrice: input.salePrice, processingUnitPrice: input.processingUnitPrice, processingCurrency: input.processingCurrency, exchangeRateSnapshot: input.exchangeRateSnapshot, effectiveDate: input.effectiveDate, reason: input.reason.trim(), createdAt: timestamp, createdBy: input.actor.name };
  return { ...order, priceVersions: [...order.priceVersions, next], currentPriceVersionId: next.id, updatedAt: timestamp, updatedBy: input.actor.name };
}

export function changeOrderQuantity(order: SalesOrder, input: { afterQuantity: number; changeType: OrderQuantityChangeType; reason: string; actor: OrderActor; operationId?: string }): SalesOrder {
  const beforeQuantity = getEffectiveQuantity(order);
  if (!Number.isFinite(input.afterQuantity) || input.afterQuantity < 0) throw new Error("调整后数量必须大于或等于 0");
  const delta = input.afterQuantity - beforeQuantity;
  if (delta === 0) throw new Error("调整后数量没有变化");
  if ((input.changeType === "partial_cancel" || input.changeType === "full_cancel") && !input.reason.trim()) throw new Error("取消数量必须填写原因");
  if ((input.changeType === "increase" && delta < 0) || (input.changeType !== "increase" && delta > 0)) throw new Error("数量变化方向与调整类型不一致");
  if (input.changeType === "full_cancel" && input.afterQuantity !== 0) throw new Error("全部取消后的有效数量必须为 0");
  const timestamp = nowIso();
  const change = { id: createOrderId("quantity-change"), salesOrderId: order.id, beforeQuantity, afterQuantity: input.afterQuantity, delta, changeType: input.changeType, reason: input.reason.trim(), createdAt: timestamp, createdBy: input.actor.name };
  return { ...order, quantityChanges: [...order.quantityChanges, change], updatedAt: timestamp, updatedBy: input.actor.name };
}

export function cancelOrder(order: SalesOrder, reason: string, actor: OrderActor): SalesOrder {
  if (!reason.trim()) throw new Error("取消整张订单必须填写原因");
  const quantity = getEffectiveQuantity(order);
  const next = quantity > 0 ? changeOrderQuantity(order, { afterQuantity: 0, changeType: "full_cancel", reason, actor }) : structuredClone(order);
  return { ...next, status: "cancelled", updatedAt: nowIso(), updatedBy: actor.name };
}

export function confirmOrder(order: SalesOrder, actor: OrderActor): SalesOrder {
  return { ...order, status: "confirmed", updatedAt: nowIso(), updatedBy: actor.name };
}

export function upsertDeliveryPlan(order: SalesOrder, input: Omit<DeliveryPlan, "salesOrderId" | "createdAt" | "updatedAt" | "voidedAt"> & Partial<Pick<DeliveryPlan, "createdAt" | "voidedAt">>, actor: OrderActor): SalesOrder {
  if (!input.deliveryDate || !Number.isFinite(input.quantity) || input.quantity <= 0) throw new Error("请填写有效交期和数量");
  const timestamp = nowIso();
  const existing = order.deliveryPlans.find((plan) => plan.id === input.id);
  const plan: DeliveryPlan = { id: input.id, salesOrderId: order.id, deliveryDate: input.deliveryDate, quantity: input.quantity, remark: input.remark, createdAt: existing?.createdAt ?? input.createdAt ?? timestamp, updatedAt: timestamp, voidedAt: input.voidedAt ?? null };
  return { ...order, deliveryPlans: existing ? order.deliveryPlans.map((row) => row.id === plan.id ? plan : row) : [...order.deliveryPlans, plan], updatedAt: timestamp, updatedBy: actor.name };
}

export function voidDeliveryPlan(order: SalesOrder, deliveryPlanId: string, actor: OrderActor): SalesOrder {
  const timestamp = nowIso();
  return { ...order, deliveryPlans: order.deliveryPlans.map((plan) => plan.id === deliveryPlanId ? { ...plan, voidedAt: timestamp, updatedAt: timestamp } : plan), updatedAt: timestamp, updatedBy: actor.name };
}

export function orderDeliveryWarning(order: SalesOrder): string | null {
  const planned = activeDeliveryPlans(order).reduce((sum, plan) => sum + plan.quantity, 0);
  const effective = getEffectiveQuantity(order);
  if (!activeDeliveryPlans(order).length) return "尚未安排交期";
  if (planned < effective) return `尚有 ${(effective - planned).toLocaleString("zh-CN")} 件未安排交期`;
  if (planned > effective) return `交期计划超过有效订单数量 ${(planned - effective).toLocaleString("zh-CN")} 件`;
  return null;
}
