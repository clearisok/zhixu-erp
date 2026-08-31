import type { NullableNumber, PriceVersion, QuoteRevision } from "./quote-view-model.ts";

export type QuoteValidationTarget =
  | "base-info"
  | "price-versions"
  | "fabric-costs"
  | "trim-costs"
  | "labor-cost"
  | "confirmation-fields";

export type QuoteValidationIssue = {
  code: string;
  message: string;
  target: QuoteValidationTarget;
  priceVersionId?: string;
};

export type QuoteValidationResult = {
  valid: boolean;
  issues: QuoteValidationIssue[];
};

function result(issues: QuoteValidationIssue[]): QuoteValidationResult {
  return { valid: issues.length === 0, issues };
}

/** 草稿允许不完整；此入口用于明确区分草稿保存与业务节点校验。 */
export function validateDraft(revision: QuoteRevision): QuoteValidationResult {
  void revision;
  return result([]);
}

function validateBaseInfo(revision: QuoteRevision): QuoteValidationIssue[] {
  const issues: QuoteValidationIssue[] = [];
  if (!revision.baseInfo.brandId) issues.push({ code: "brand.required", message: "请选择品牌", target: "base-info" });
  if (!revision.baseInfo.salespersonId) issues.push({ code: "salesperson.required", message: "请选择客户业务员", target: "base-info" });
  if (!revision.baseInfo.quoteStyleNo.trim()) issues.push({ code: "styleNo.required", message: "请填写报价款号", target: "base-info" });
  if (!revision.baseInfo.styleName.trim()) issues.push({ code: "styleName.required", message: "请填写款式名称", target: "base-info" });
  return issues;
}

function validateVersion(version: PriceVersion): QuoteValidationIssue[] {
  const issues: QuoteValidationIssue[] = [];
  const common = { priceVersionId: version.id };
  if (!version.name.trim()) issues.push({ ...common, code: "priceVersion.name.required", message: "价格版本名称不能为空", target: "price-versions" });
  if (version.quantity === null) issues.push({ ...common, code: "priceVersion.quantity.required", message: `${version.name || "未命名价格版本"}：请填写数量`, target: "price-versions" });
  version.fabrics.forEach((line, index) => {
    if (!line.name.trim()) issues.push({ ...common, code: `fabric.${line.id}.name.required`, message: `${version.name}：第 ${index + 1} 条面料缺少名称`, target: "fabric-costs" });
    if (line.unitPrice === null) issues.push({ ...common, code: `fabric.${line.id}.unitPrice.required`, message: `${version.name}：${line.name || `第 ${index + 1} 条面料`}缺少单价`, target: "fabric-costs" });
  });
  version.trims.forEach((line, index) => {
    if (!line.name.trim()) issues.push({ ...common, code: `trim.${line.id}.name.required`, message: `${version.name}：第 ${index + 1} 条辅料缺少名称`, target: "trim-costs" });
    if (line.usage === null) issues.push({ ...common, code: `trim.${line.id}.usage.required`, message: `${version.name}：${line.name || `第 ${index + 1} 条辅料`}缺少数量/用量`, target: "trim-costs" });
    if (line.unitPrice === null) issues.push({ ...common, code: `trim.${line.id}.unitPrice.required`, message: `${version.name}：${line.name || `第 ${index + 1} 条辅料`}缺少单价`, target: "trim-costs" });
  });
  if (version.labor.value === null) issues.push({ ...common, code: "labor.required", message: `${version.name}：请填写工价`, target: "labor-cost" });
  return issues;
}

export function validateRevisionUpdate(revision: QuoteRevision): QuoteValidationResult {
  return result([
    ...validateBaseInfo(revision),
    ...revision.priceVersions.flatMap(validateVersion),
  ]);
}

/** 新建页只校验建立报价工作区所需的最小上下文；成本完整性仍由详情工作区的正式节点校验负责。 */
export function validateQuoteCreation(revision: QuoteRevision): QuoteValidationResult {
  const issues = [...validateBaseInfo(revision)];
  for (const version of revision.priceVersions) {
    const common = { priceVersionId: version.id };
    if (!version.name.trim()) issues.push({ ...common, code: "priceVersion.name.required", message: "请填写初始价格方案名称", target: "price-versions" });
    if (version.quantity === null) issues.push({ ...common, code: "priceVersion.quantity.required", message: `${version.name || "初始价格方案"}：请填写数量`, target: "price-versions" });
  }
  return result(issues);
}

export function validateCustomerConfirmation(
  revision: QuoteRevision,
  version: PriceVersion,
  confirmation: { labor: NullableNumber; garment: NullableNumber },
): QuoteValidationResult {
  const issues = [
    ...validateBaseInfo(revision),
    ...validateVersion(version),
  ];
  if (confirmation.labor === null) {
    issues.push({ code: "confirmation.labor.required", message: "请填写客户确认工价", target: "confirmation-fields", priceVersionId: version.id });
  }
  if (revision.baseInfo.quoteType === "distribution" && confirmation.garment === null) {
    issues.push({ code: "confirmation.garment.required", message: "经销报价请填写客户确认成衣价格", target: "confirmation-fields", priceVersionId: version.id });
  }
  return result(issues);
}

export function focusQuoteValidationIssue(issue: QuoteValidationIssue): void {
  if (typeof document === "undefined") return;
  const target = document.querySelector<HTMLElement>(`[data-validation-anchor="${issue.target}"]`);
  target?.scrollIntoView({ behavior: "smooth", block: "center" });
  window.setTimeout(() => target?.querySelector<HTMLElement>("input, select, textarea, button")?.focus(), 260);
}
