import { resolveBrandByAlias, resolvePurchasedTrimCostRule, type BasicSettingsState } from "../../basic-settings/model/basic-settings.ts";
import { createOperationLogDraft, type OperationLogActor, type OperationLogDraft } from "../../operation-logs/model/operation-log.ts";
import { calculateFactorySettlementUnitPrice, getEffectiveQuantity, normalizeSalesOrderV10, type DeliveryPlan, type OrderColorLine, type SalesOrder } from "../../order-center/model/order.ts";
import { isEligibleAinuokeMatchOrder } from "../../order-center/model/order-provenance.ts";
import { changeOrderQuantity, createManualOrder, suggestOrderNo, type OrderActor } from "../../order-center/service/order-service.ts";
import type { AinuokeContractMirror, AinuokeImportReview, AinuokeSyncState } from "../model/ainuoke.ts";
import { normalizeStyleNo, styleSimilarity } from "../model/style-normalizer.ts";
import { stableSourceHash } from "../parser/ainuoke-excel-parser.ts";

export type AinuokeCandidate = { orderId: string; score: number; reasons: string[]; highConfidence: boolean };
export type AinuokeSyncReport = {
  contractsSeen: number;
  validContracts: number;
  mismatchCount: number;
  unchangedExistingCount: number;
  updatedExistingCount: number;
  autoBoundCount: number;
  manualReviewCount: number;
  autoCreatedCount: number;
  duplicatePreventedCount: number;
  quantityChangeCount: number;
  colorLineCount: number;
};

export type AinuokeSyncResult = {
  state: AinuokeSyncState;
  orders: SalesOrder[];
  report: AinuokeSyncReport;
  operationLogs: OperationLogDraft[];
};

const nowIso = () => new Date().toISOString();
const reviewId = (contractNo: string) => `ainuoke-review-${stableSourceHash([contractNo])}`;

export function candidateOrdersForContract(contract: AinuokeContractMirror, orders: SalesOrder[]): AinuokeCandidate[] {
  return orders.filter(isEligibleAinuokeMatchOrder).flatMap((order) => {
    const orderKeys = normalizeStyleNo(order.styleNo);
    const quantityMatches = getEffectiveQuantity(order) === contract.quantity;
    const exactBase = Boolean(orderKeys.baseStyleKey && orderKeys.baseStyleKey === contract.baseStyleKey);
    const exactStrict = Boolean(orderKeys.strictStyleKey && orderKeys.strictStyleKey === contract.strictStyleKey);
    const similarity = styleSimilarity(order.styleNo, contract.styleNoRaw);
    if (!exactBase && similarity < 0.62 && !quantityMatches) return [];
    const reasons: string[] = [];
    if (exactBase) reasons.push("标准化基础款号一致");
    else if (similarity >= 0.62) reasons.push(`款号相似度 ${Math.round(similarity * 100)}%`);
    if (quantityMatches) reasons.push("数量一致");
    if (order.factoryStyleNo && order.factoryStyleNo.normalize("NFKC") === contract.factoryStyleNo.normalize("NFKC")) reasons.push("工厂款号一致");
    const score = Math.min(1, (exactStrict ? 0.65 : exactBase ? 0.55 : similarity * 0.45) + (quantityMatches ? 0.35 : 0) + (reasons.includes("工厂款号一致") ? 0.1 : 0));
    return [{ orderId: order.id, score, reasons, highConfidence: exactBase && quantityMatches }];
  }).sort((left, right) => right.score - left.score);
}

function colorLinesForOrder(order: SalesOrder, contract: AinuokeContractMirror, timestamp: string): OrderColorLine[] {
  return contract.colorLines.map((line) => ({
    id: `order-color-${stableSourceHash([contract.salesContractNo, line.colorName])}`,
    salesOrderId: order.id,
    salesContractNo: contract.salesContractNo,
    colorName: line.colorName,
    quantity: line.quantity,
    deliveryDate: line.deliveryDate,
    source: "ainuoke_sync",
    sourceHash: stableSourceHash([contract.salesContractNo, line.colorName, line.quantity, line.deliveryDate]),
    createdAt: order.orderColorLines.find((item) => item.salesContractNo === contract.salesContractNo && item.colorName === line.colorName)?.createdAt ?? timestamp,
    updatedAt: timestamp,
  }));
}

function deliveryPlansForOrder(order: SalesOrder, contract: AinuokeContractMirror, timestamp: string): DeliveryPlan[] {
  const external = contract.deliveryLines.length
    ? contract.deliveryLines
    : contract.contractDeliveryDate ? [{ deliveryDate: contract.contractDeliveryDate, quantity: contract.quantity }] : [];
  const manual = order.deliveryPlans.filter((plan) => plan.source !== "ainuoke_sync");
  const synced = external.map((line) => {
    const id = `delivery-ainuoke-${stableSourceHash([contract.salesContractNo, line.deliveryDate])}`;
    const previous = order.deliveryPlans.find((plan) => plan.id === id);
    return { id, salesOrderId: order.id, deliveryDate: line.deliveryDate, quantity: line.quantity, remark: `艾诺科销售合同 ${contract.salesContractNo}`, createdAt: previous?.createdAt ?? timestamp, updatedAt: timestamp, voidedAt: null, source: "ainuoke_sync" as const, salesContractNo: contract.salesContractNo };
  });
  return [...manual, ...synced];
}

function applyContractToOrder(orderInput: SalesOrder, contract: AinuokeContractMirror, settings: BasicSettingsState, actor: OrderActor, timestamp: string): { order: SalesOrder; quantityChanged: boolean; colorsChanged: boolean } {
  let order = normalizeSalesOrderV10(orderInput);
  const beforeQuantity = getEffectiveQuantity(order);
  if (beforeQuantity !== contract.quantity) order = changeOrderQuantity(order, { afterQuantity: contract.quantity, changeType: contract.quantity > beforeQuantity ? "increase" : "decrease", reason: `艾诺科同步 ${contract.salesContractNo}`, actor, source: "ainuoke_sync" });
  const brand = resolveBrandByAlias(settings, contract.brandNormalized || contract.brandRaw);
  const nextColorLines = colorLinesForOrder(order, contract, timestamp);
  const colorsChanged = JSON.stringify(order.orderColorLines.map(({ sourceHash }) => sourceHash).sort()) !== JSON.stringify(nextColorLines.map(({ sourceHash }) => sourceHash).sort());
  const effectiveDate = contract.contractDate ?? order.orderDate;
  const rule = !order.purchasedTrimCostOverride ? resolvePurchasedTrimCostRule(settings, brand?.id ?? null, effectiveDate) : null;
  order = {
    ...order,
    salesContractNo: contract.salesContractNo,
    ainuokeSyncStatus: order.creationSource === "ainuoke" ? "created_from_ainuoke" : "synced",
    ainuokeLastSyncedAt: timestamp,
    customerId: order.customerId,
    customerNameSnapshot: contract.customerName || order.customerNameSnapshot,
    customerPoNo: contract.poNo || order.customerPoNo,
    brandId: brand?.id ?? order.brandId,
    brandNameSnapshot: brand?.name ?? contract.brandNormalized ?? contract.brandRaw,
    styleNo: contract.styleNoRaw,
    factoryStyleNo: contract.factoryStyleNo,
    contractDeliveryDate: contract.contractDeliveryDate,
    orderColorLines: nextColorLines,
    deliveryPlans: deliveryPlansForOrder(order, contract, timestamp),
    purchasedTrimUnitCostSnapshot: rule ? rule.unitCost : order.purchasedTrimUnitCostSnapshot,
    purchasedTrimCurrencySnapshot: rule ? rule.currency : order.purchasedTrimCurrencySnapshot,
    purchasedTrimRuleId: rule ? rule.id : order.purchasedTrimRuleId,
    updatedAt: timestamp,
    updatedBy: actor.name,
  };
  order.factorySettlementUnitPrice = calculateFactorySettlementUnitPrice(order);
  return { order, quantityChanged: beforeQuantity !== contract.quantity, colorsChanged };
}

function createOrderForContract(contract: AinuokeContractMirror, existingOrders: SalesOrder[], settings: BasicSettingsState, actor: OrderActor, timestamp: string): SalesOrder {
  const orderNo = suggestOrderNo(existingOrders, contract.contractDate ?? timestamp.slice(0, 10));
  let order = createManualOrder({
    header: { orderNo, customerId: null, customerNameSnapshot: contract.customerName || "艾诺科客户", customerPoNo: contract.poNo, orderDate: contract.contractDate ?? timestamp.slice(0, 10), salespersonId: null, salespersonNameSnapshot: "", merchandiserId: null, merchandiserNameSnapshot: "", orderType: "processing", remark: "艾诺科首次同步自动创建" },
    style: { styleNo: contract.styleNoRaw, styleName: "", brandId: null, brandNameSnapshot: contract.brandNormalized || contract.brandRaw, productionCountry: "柬埔寨", initialQuantity: contract.quantity },
    actor, createdAt: timestamp,
  });
  order = { ...order, sourceType: "ainuoke", creationSource: "ainuoke", ainuokeSyncStatus: "created_from_ainuoke" };
  return applyContractToOrder(order, contract, settings, actor, timestamp).order;
}

function logFor(input: { actor: OperationLogActor; order: SalesOrder; contract: AinuokeContractMirror; action: "艾诺科自动绑定" | "艾诺科手工绑定" | "艾诺科同步订单" | "艾诺科新增订单" | "艾诺科数量变更" | "艾诺科分色变更"; beforeValues?: Record<string, string | number | null>; afterValues?: Record<string, string | number | null> }): OperationLogDraft {
  const data = (values?: Record<string, string | number | null>) => ({ orderId: input.order.id, orderNo: input.order.orderNo, orderStyleNo: input.order.styleNo, objectSource: "order" as const, objectType: "AinuokeContract", objectId: input.contract.salesContractNo, objectName: input.contract.salesContractNo, values });
  return createOperationLogDraft({ actor: input.actor, module: "艾诺科同步", entityType: input.action === "艾诺科分色变更" ? "OrderColorLine" : "AinuokeContract", entityId: input.contract.salesContractNo, action: input.action, beforeData: input.beforeValues ? data(input.beforeValues) : null, afterData: input.afterValues ? data(input.afterValues) : null });
}

export function synchronizeAinuokeContracts(input: { state: AinuokeSyncState; contracts: AinuokeContractMirror[]; orders: SalesOrder[]; settings: BasicSettingsState; actor: OrderActor & OperationLogActor; timestamp?: string }): AinuokeSyncResult {
  const timestamp = input.timestamp ?? nowIso();
  let orders = input.orders.map(normalizeSalesOrderV10);
  const reports: AinuokeSyncReport = { contractsSeen: input.contracts.length, validContracts: 0, mismatchCount: 0, unchangedExistingCount: 0, updatedExistingCount: 0, autoBoundCount: 0, manualReviewCount: 0, autoCreatedCount: 0, duplicatePreventedCount: 0, quantityChangeCount: 0, colorLineCount: 0 };
  const reviewsById = new Map(input.state.reviews.map((review) => [review.id, review]));
  const logs: OperationLogDraft[] = [];
  const previousContracts = new Map(input.state.contracts.map((contract) => [contract.salesContractNo, contract]));
  const contracts: AinuokeContractMirror[] = [];

  for (const sourceContract of input.contracts) {
    let contract = { ...sourceContract, boundOrderId: previousContracts.get(sourceContract.salesContractNo)?.boundOrderId ?? null, lastDisposition: previousContracts.get(sourceContract.salesContractNo)?.lastDisposition ?? null };
    if (contract.validationStatus !== "valid") {
      reports.mismatchCount += 1;
      const review: AinuokeImportReview = { id: reviewId(contract.salesContractNo), kind: "data_anomaly", sourceKey: contract.salesContractNo, salesContractNo: contract.salesContractNo, candidateOrderIds: [], reason: contract.validationStatus === "quantity_mismatch" ? `分色与合同数量差异 ${contract.quantityDifference}` : "缺少分色明细", resolvedAt: null, resolvedBy: null, createdAt: timestamp };
      reviewsById.set(review.id, review); contract = { ...contract, lastDisposition: "blocked" }; contracts.push(contract); continue;
    }
    reports.validContracts += 1;
    const pendingOrderReviewId = reviewId(contract.salesContractNo);
    const exact = orders.filter((order) => order.salesContractNo === contract.salesContractNo);
    if (exact.length > 1) throw new Error(`销售合同号 ${contract.salesContractNo} 已绑定多张订单`);
    if (exact.length === 1) {
      reviewsById.delete(pendingOrderReviewId);
      const before = exact[0];
      const applied = applyContractToOrder(before, contract, input.settings, input.actor, timestamp);
      orders = orders.map((order) => order.id === applied.order.id ? applied.order : order);
      contract = { ...contract, boundOrderId: applied.order.id, lastDisposition: "synced" };
      const changed = before.updatedAt !== applied.order.updatedAt && (applied.quantityChanged || applied.colorsChanged || before.factoryStyleNo !== applied.order.factoryStyleNo || before.contractDeliveryDate !== applied.order.contractDeliveryDate);
      if (changed) { reports.updatedExistingCount += 1; logs.push(logFor({ actor: input.actor, order: applied.order, contract, action: "艾诺科同步订单", beforeValues: { "款号": before.styleNo, "数量": getEffectiveQuantity(before), "工厂款号": before.factoryStyleNo }, afterValues: { "款号": applied.order.styleNo, "数量": getEffectiveQuantity(applied.order), "工厂款号": applied.order.factoryStyleNo } })); }
      else reports.unchangedExistingCount += 1;
      if (applied.quantityChanged) { reports.quantityChangeCount += 1; logs.push(logFor({ actor: input.actor, order: applied.order, contract, action: "艾诺科数量变更", beforeValues: { "数量": getEffectiveQuantity(before) }, afterValues: { "数量": getEffectiveQuantity(applied.order) } })); }
      if (applied.colorsChanged) logs.push(logFor({ actor: input.actor, order: applied.order, contract, action: "艾诺科分色变更", beforeValues: { "颜色数": before.orderColorLines.length }, afterValues: { "颜色数": applied.order.orderColorLines.length } }));
      reports.colorLineCount += applied.order.orderColorLines.length; contracts.push(contract); continue;
    }
    const candidates = candidateOrdersForContract(contract, orders);
    const highConfidence = candidates.filter((candidate) => candidate.highConfidence);
    if (highConfidence.length === 1) {
      reviewsById.delete(pendingOrderReviewId);
      const before = orders.find((order) => order.id === highConfidence[0].orderId)!;
      const applied = applyContractToOrder(before, contract, input.settings, input.actor, timestamp);
      orders = orders.map((order) => order.id === applied.order.id ? applied.order : order);
      contract = { ...contract, boundOrderId: applied.order.id, lastDisposition: "auto_bound" };
      reports.autoBoundCount += 1; reports.duplicatePreventedCount += 1; reports.quantityChangeCount += applied.quantityChanged ? 1 : 0; reports.colorLineCount += applied.order.orderColorLines.length;
      logs.push(logFor({ actor: input.actor, order: applied.order, contract, action: "艾诺科自动绑定", beforeValues: { "销售合同号": null }, afterValues: { "销售合同号": contract.salesContractNo, "匹配原因": highConfidence[0].reasons.join(" + ") } }));
    } else if (candidates.length) {
      const review: AinuokeImportReview = { id: reviewId(contract.salesContractNo), kind: "order_match", sourceKey: contract.salesContractNo, salesContractNo: contract.salesContractNo, candidateOrderIds: candidates.map((candidate) => candidate.orderId), reason: highConfidence.length > 1 ? "存在多个同款同数量候选" : candidates[0].reasons.join(" + ") || "存在疑似候选", resolvedAt: null, resolvedBy: null, createdAt: timestamp };
      reviewsById.set(review.id, review); contract = { ...contract, lastDisposition: candidates.length === 1 ? "recommended" : "review_required" }; reports.manualReviewCount += 1; reports.duplicatePreventedCount += 1;
      for (const candidate of candidates) orders = orders.map((order) => order.id === candidate.orderId ? { ...order, ainuokeSyncStatus: candidates.length === 1 ? "recommended" : "review_required" } : order);
    } else {
      reviewsById.delete(pendingOrderReviewId);
      const order = createOrderForContract(contract, orders, input.settings, input.actor, timestamp);
      orders = [...orders, order]; contract = { ...contract, boundOrderId: order.id, lastDisposition: "auto_created" }; reports.autoCreatedCount += 1; reports.colorLineCount += order.orderColorLines.length;
      logs.push(logFor({ actor: input.actor, order, contract, action: "艾诺科新增订单", afterValues: { "销售合同号": contract.salesContractNo, "款号": order.styleNo, "数量": getEffectiveQuantity(order), "creationSource": "ainuoke" } }));
    }
    contracts.push(contract);
  }
  return { state: { ...input.state, contracts, reviews: [...reviewsById.values()] }, orders, report: reports, operationLogs: logs };
}

export function bindAinuokeContract(input: { state: AinuokeSyncState; orders: SalesOrder[]; contractNo: string; orderId: string; settings: BasicSettingsState; actor: OrderActor & OperationLogActor; timestamp?: string }): AinuokeSyncResult {
  const timestamp = input.timestamp ?? nowIso();
  const contract = input.state.contracts.find((item) => item.salesContractNo === input.contractNo);
  const order = input.orders.find((item) => item.id === input.orderId);
  if (!contract || !order) throw new Error("销售合同或订单不存在");
  if (contract.validationStatus !== "valid") throw new Error("该销售合同分色校验未通过，不能绑定并同步");
  if (contract.boundOrderId && contract.boundOrderId !== order.id || input.orders.some((item) => item.id !== order.id && item.salesContractNo === contract.salesContractNo)) throw new Error("该销售合同已经绑定其他订单");
  const applied = applyContractToOrder(order, contract, input.settings, input.actor, timestamp);
  const nextContract = { ...contract, boundOrderId: order.id, lastDisposition: "synced" as const };
  const review = input.state.reviews.find((item) => item.salesContractNo === contract.salesContractNo && !item.resolvedAt);
  const state = { ...input.state, contracts: input.state.contracts.map((item) => item.salesContractNo === contract.salesContractNo ? nextContract : item), reviews: input.state.reviews.map((item) => item.id === review?.id ? { ...item, resolvedAt: timestamp, resolvedBy: input.actor.name } : item) };
  const orders = input.orders.map((item) => item.id === order.id ? applied.order : item);
  const report: AinuokeSyncReport = { contractsSeen: 1, validContracts: 1, mismatchCount: 0, unchangedExistingCount: 0, updatedExistingCount: 1, autoBoundCount: 0, manualReviewCount: 0, autoCreatedCount: 0, duplicatePreventedCount: 1, quantityChangeCount: applied.quantityChanged ? 1 : 0, colorLineCount: applied.order.orderColorLines.length };
  const operationLogs = [logFor({ actor: input.actor, order: applied.order, contract: nextContract, action: "艾诺科手工绑定", beforeValues: { "销售合同号": order.salesContractNo }, afterValues: { "销售合同号": contract.salesContractNo, "匹配方式": "manual" } })];
  return { state, orders, report, operationLogs };
}

export function findAinuokeDuplicateRisk(order: Pick<SalesOrder, "styleNo" | "initialQuantity" | "quantityChanges">, contracts: AinuokeContractMirror[]) {
  const effectiveQuantity = order.initialQuantity + order.quantityChanges.reduce((sum, change) => sum + change.delta, 0);
  const style = normalizeStyleNo(order.styleNo);
  return contracts.filter((contract) => contract.baseStyleKey === style.baseStyleKey && contract.quantity === effectiveQuantity).map((contract) => ({ contract, reason: "标准化款号一致 + 数量一致" }));
}
