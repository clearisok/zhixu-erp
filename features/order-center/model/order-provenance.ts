import type { SalesOrder } from "./order.ts";

export const UI_QA_DATASET_ID = "ui-redesign-qa-v1";

const normalized = (value: string | null | undefined) => value?.normalize("NFKC").trim().toLocaleLowerCase() ?? "";
const hasTechnicalPrefix = (value: string | null | undefined) => /^(uiqa|qa|seed|demo|fixture|test)(?:[-_:]|$)/i.test(normalized(value));

export function isUiQaDatasetOrder(order: Pick<SalesOrder, "id" | "orderNo" | "sourceQuoteId" | "remark" | "createdBy">): boolean {
  return normalized(order.remark).includes(UI_QA_DATASET_ID)
    || normalized(order.createdBy).includes("dev/qa 数据生成器")
    || normalized(order.id).startsWith("uiqa-order-")
    || normalized(order.sourceQuoteId).startsWith("uiqa-quote-")
    || normalized(order.orderNo).startsWith("qa-so-");
}

export function isNonBusinessOrder(order: Pick<SalesOrder, "id" | "orderNo" | "sourceQuoteId" | "remark" | "createdBy">): boolean {
  if (isUiQaDatasetOrder(order)) return true;
  const provenance = [order.remark, order.createdBy].map(normalized).join(" ");
  return hasTechnicalPrefix(order.id)
    || hasTechnicalPrefix(order.orderNo)
    || hasTechnicalPrefix(order.sourceQuoteId)
    || ["qa dataset", "seed dataset", "demo dataset", "test fixture"].some((marker) => provenance.includes(marker));
}

export function isEligibleAinuokeMatchOrder(order: Pick<SalesOrder, "id" | "orderNo" | "sourceQuoteId" | "remark" | "createdBy" | "salesContractNo">): boolean {
  return !order.salesContractNo && !isNonBusinessOrder(order);
}
