import type {
  FabricCostLine,
  OtherCostLine,
  PriceVersion,
  PriceVersionConfirmation,
  Quote,
  QuoteRevision,
  TrimCostLine,
} from "../../quote-center/model/quote-view-model";

export type OperationLogAction =
  | "创建报价"
  | "保存报价"
  | "删除报价"
  | "创建报价版本"
  | "更新报价版本"
  | "删除报价版本"
  | "创建价格版本"
  | "修改价格版本"
  | "删除价格版本"
  | "确认报价"
  | "修改客户确认"
  | "修改面料成本"
  | "修改辅料成本"
  | "修改工价"
  | "修改其他费用"
  | "上传图片"
  | "上传文件"
  | "删除附件"
  | "设置款式图"
  | "导出报价单"
  | "批量导出"
  | "导出报价汇总表"
  | "上传模板"
  | "设为默认模板"
  | "修改模板状态"
  | "修改角色"
  | "修改权限"
  | "修改账号状态"
  | "生成估算成本"
  | "恢复历史估算成本";

export type OperationLogData = {
  revisionLabel?: string;
  priceVersionName?: string;
  rowName?: string;
  attachmentId?: string | null;
  values?: Record<string, string | number | null>;
};

export type OperationLog = {
  id: string;
  userId: string;
  /** 保存操作发生时的姓名快照，避免后续账号改名污染历史展示。 */
  userName: string;
  module: "报价中心" | "模板设置" | "权限管理";
  entityType: "Quote" | "QuoteRevision" | "PriceVersion" | "FabricCostLine" | "TrimCostLine" | "LaborCost" | "OtherCostLine" | "Attachment" | "EstimateCost" | "Export" | "Template" | "User" | "Role";
  entityId: string;
  /** 独立索引字段，用于从报价详情聚合其 Revision、成本和附件日志。 */
  quoteId: string | null;
  action: OperationLogAction;
  beforeData: OperationLogData | null;
  afterData: OperationLogData | null;
  createdAt: string;
};

export type OperationLogActor = { userId: string; userName: string };
export type OperationLogDraft = Omit<OperationLog, "id">;

const clone = <T>(value: T): T => structuredClone(value);
const equal = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);
const data = (revisionLabel: string, priceVersionName?: string, rowName?: string, values?: OperationLogData["values"]): OperationLogData => ({
  revisionLabel,
  ...(priceVersionName ? { priceVersionName } : {}),
  ...(rowName ? { rowName } : {}),
  ...(values && Object.keys(values).length ? { values } : {}),
});

function draft(input: Omit<OperationLogDraft, "module" | "createdAt">, actor: OperationLogActor, createdAt: string): OperationLogDraft {
  return { ...input, userId: actor.userId, userName: actor.userName, module: "报价中心", createdAt };
}

export function createOperationLogDraft(input: {
  actor: OperationLogActor;
  module: OperationLog["module"];
  entityType: OperationLog["entityType"];
  entityId: string;
  quoteId?: string | null;
  action: OperationLogAction;
  beforeData?: OperationLogData | null;
  afterData?: OperationLogData | null;
  createdAt?: string;
}): OperationLogDraft {
  return {
    userId: input.actor.userId,
    userName: input.actor.userName,
    module: input.module,
    entityType: input.entityType,
    entityId: input.entityId,
    quoteId: input.quoteId ?? null,
    action: input.action,
    beforeData: input.beforeData ?? null,
    afterData: input.afterData ?? null,
    createdAt: input.createdAt ?? new Date().toISOString(),
  };
}

function changedValues<T extends object>(
  before: T,
  after: T,
  labels: Partial<Record<keyof T, string>>,
): [NonNullable<OperationLogData["values"]>, NonNullable<OperationLogData["values"]>] {
  const beforeValues: NonNullable<OperationLogData["values"]> = {};
  const afterValues: NonNullable<OperationLogData["values"]> = {};
  for (const key of Object.keys(labels) as (keyof T)[]) {
    if (equal(before[key], after[key])) continue;
    const label = labels[key];
    if (!label) continue;
    beforeValues[label] = (before[key] ?? null) as string | number | null;
    afterValues[label] = (after[key] ?? null) as string | number | null;
  }
  return [beforeValues, afterValues];
}

const fabricLabels: Partial<Record<keyof FabricCostLine, string>> = {
  name: "面料名称", composition: "成分", segmentLengthCm: "段长", netWidthCm: "净门幅", gsm: "克重",
  lossRate: "损耗率", supplier: "供应商", unitPrice: "单价", purchaseUnit: "采购单位",
};
const trimLabels: Partial<Record<keyof TrimCostLine, string>> = {
  name: "辅料名称", specification: "规格", supplier: "供应商", usage: "数量/用量", unit: "单位", lossRate: "损耗率", unitPrice: "单价",
};
const otherLabels: Partial<Record<keyof OtherCostLine, string>> = {
  name: "费用名称", specification: "规格", usage: "数量/用量", unit: "单位", lossRate: "损耗率", unitPrice: "单价", amount: "单件金额",
};

function diffRows<T extends { id: string; name: string }>(input: {
  before: T[];
  after: T[];
  labels: Partial<Record<keyof T, string>>;
  action: OperationLogAction;
  entityType: OperationLog["entityType"];
  quoteId: string;
  revisionLabel: string;
  priceVersionName: string;
  actor: OperationLogActor;
  createdAt: string;
}): OperationLogDraft[] {
  const beforeById = new Map(input.before.map((row) => [row.id, row]));
  const afterById = new Map(input.after.map((row) => [row.id, row]));
  const rowIds = new Set([...beforeById.keys(), ...afterById.keys()]);
  const result: OperationLogDraft[] = [];
  for (const rowId of rowIds) {
    const beforeRow = beforeById.get(rowId);
    const afterRow = afterById.get(rowId);
    if (beforeRow && afterRow && equal(beforeRow, afterRow)) continue;
    const [beforeValues, afterValues] = beforeRow && afterRow
      ? changedValues(beforeRow, afterRow, input.labels)
      : [
        beforeRow ? Object.fromEntries(Object.entries(input.labels).map(([key, label]) => [label, beforeRow[key as keyof T] ?? null])) : {},
        afterRow ? Object.fromEntries(Object.entries(input.labels).map(([key, label]) => [label, afterRow[key as keyof T] ?? null])) : {},
      ];
    const rowName = afterRow?.name || beforeRow?.name || "未命名行";
    result.push(draft({
      userId: input.actor.userId,
      userName: input.actor.userName,
      quoteId: input.quoteId,
      entityType: input.entityType,
      entityId: rowId,
      action: input.action,
      beforeData: beforeRow ? data(input.revisionLabel, input.priceVersionName, rowName, beforeValues) : null,
      afterData: afterRow ? data(input.revisionLabel, input.priceVersionName, rowName, afterValues) : null,
    }, input.actor, input.createdAt));
  }
  return result;
}

function diffConfirmation(before: PriceVersionConfirmation | null, after: PriceVersionConfirmation | null) {
  if (equal(before, after)) return null;
  const values = (item: PriceVersionConfirmation | null): OperationLogData["values"] => item ? {
    "确认工价": item.confirmedLaborPrice,
    "确认成衣价": item.confirmedGarmentPrice,
    "确认备注": item.note,
  } : {};
  return [values(before), values(after)] as const;
}

function revisionMetadataValues(revision: QuoteRevision) {
  return {
    "版本": revision.revisionLabel,
    "款号": revision.baseInfo.quoteStyleNo,
    "款式名称": revision.baseInfo.styleName,
    "品牌": revision.baseInfo.brandName,
    "客户业务员": revision.baseInfo.salespersonName,
    "报价类型": revision.baseInfo.quoteType,
    "报价日期": revision.baseInfo.quoteDate,
    "面料交期": revision.baseInfo.fabricLeadDate,
    "成衣交期": revision.baseInfo.garmentLeadDate,
    "备注": revision.baseInfo.note,
    "加工币种": revision.pricingParameters.laborCurrency,
    "USD/CNY汇率": revision.pricingParameters.usdCnyRate,
    "成本加成率": revision.pricingParameters.markupRate,
  };
}

function comparableRevisionMetadata(revision: QuoteRevision) {
  return {
    baseInfo: revision.baseInfo,
    pricingParameters: revision.pricingParameters,
    versions: revision.priceVersions.map(({ id, name, quantity, description }) => ({ id, name, quantity, description })),
  };
}

function diffPriceVersion(before: PriceVersion, after: PriceVersion, revision: QuoteRevision, quoteId: string, actor: OperationLogActor, createdAt: string) {
  const shared = { quoteId, revisionLabel: revision.revisionLabel, priceVersionName: after.name || before.name, actor, createdAt };
  const logs: OperationLogDraft[] = [
    ...diffRows({ before: before.fabrics, after: after.fabrics, labels: fabricLabels, action: "修改面料成本", entityType: "FabricCostLine", ...shared }),
    ...diffRows({ before: before.trims, after: after.trims, labels: trimLabels, action: "修改辅料成本", entityType: "TrimCostLine", ...shared }),
    ...diffRows({ before: before.otherCosts, after: after.otherCosts, labels: otherLabels, action: "修改其他费用", entityType: "OtherCostLine", ...shared }),
  ];
  const [beforeVersionValues, afterVersionValues] = changedValues(before, after, { name: "价格版本名称", quantity: "数量", description: "说明" });
  if (Object.keys(beforeVersionValues).length) logs.push(draft({
    userId: actor.userId, userName: actor.userName, quoteId, entityType: "PriceVersion", entityId: after.id, action: "修改价格版本",
    beforeData: data(revision.revisionLabel, before.name, undefined, beforeVersionValues), afterData: data(revision.revisionLabel, after.name, undefined, afterVersionValues),
  }, actor, createdAt));
  if (!equal(before.labor, after.labor)) {
    const [beforeValues, afterValues] = changedValues(before.labor, after.labor, { value: "工价", description: "工价说明" });
    logs.push(draft({
      userId: actor.userId, userName: actor.userName, quoteId, entityType: "LaborCost", entityId: `${revision.revisionId}:${after.id}:labor`, action: "修改工价",
      beforeData: data(revision.revisionLabel, after.name, "工价", beforeValues), afterData: data(revision.revisionLabel, after.name, "工价", afterValues),
    }, actor, createdAt));
  }
  const confirmation = diffConfirmation(before.confirmation, after.confirmation);
  if (confirmation) logs.push(draft({
    userId: actor.userId, userName: actor.userName, quoteId, entityType: "PriceVersion", entityId: after.id, action: before.confirmation && after.confirmation ? "修改客户确认" : "确认报价",
    beforeData: before.confirmation ? data(revision.revisionLabel, after.name, undefined, confirmation[0]) : null,
    afterData: after.confirmation ? data(revision.revisionLabel, after.name, undefined, confirmation[1]) : null,
  }, actor, createdAt));
  return logs;
}

function diffAttachments(before: QuoteRevision, after: QuoteRevision, quoteId: string, actor: OperationLogActor, createdAt: string) {
  const logs: OperationLogDraft[] = [];
  const beforeIds = new Set([...before.imageAttachmentIds, ...before.fileAttachmentIds]);
  const afterIds = new Set([...after.imageAttachmentIds, ...after.fileAttachmentIds]);
  for (const attachmentId of after.imageAttachmentIds) {
    if (beforeIds.has(attachmentId)) continue;
    logs.push(draft({
      userId: actor.userId, userName: actor.userName, quoteId, entityType: "Attachment", entityId: attachmentId,
      action: "上传图片",
      beforeData: null,
      afterData: { revisionLabel: after.revisionLabel, attachmentId, values: { "附件类型": "图片" } },
    }, actor, createdAt));
  }
  for (const attachmentId of after.fileAttachmentIds) {
    if (beforeIds.has(attachmentId)) continue;
    logs.push(draft({
      userId: actor.userId, userName: actor.userName, quoteId, entityType: "Attachment", entityId: attachmentId,
      action: "上传文件",
      beforeData: null,
      afterData: { revisionLabel: after.revisionLabel, attachmentId, values: { "附件类型": "文件" } },
    }, actor, createdAt));
  }
  for (const attachmentId of beforeIds) {
    if (afterIds.has(attachmentId)) continue;
    logs.push(draft({
      userId: actor.userId, userName: actor.userName, quoteId, entityType: "Attachment", entityId: attachmentId, action: "删除附件",
      beforeData: { revisionLabel: before.revisionLabel, attachmentId }, afterData: null,
    }, actor, createdAt));
  }
  if (before.styleImageAttachmentId !== after.styleImageAttachmentId) {
    logs.push(draft({
      userId: actor.userId, userName: actor.userName, quoteId, entityType: "Attachment", entityId: after.styleImageAttachmentId ?? before.styleImageAttachmentId ?? `${after.revisionId}:style-image`, action: "设置款式图",
      beforeData: { revisionLabel: before.revisionLabel, attachmentId: before.styleImageAttachmentId },
      afterData: { revisionLabel: after.revisionLabel, attachmentId: after.styleImageAttachmentId },
    }, actor, createdAt));
  }
  return logs;
}

function diffRevision(before: QuoteRevision, after: QuoteRevision, quoteId: string, actor: OperationLogActor, createdAt: string) {
  const logs: OperationLogDraft[] = [];
  if (!equal(comparableRevisionMetadata(before), comparableRevisionMetadata(after))) {
    const beforeValues = revisionMetadataValues(before);
    const afterValues = revisionMetadataValues(after);
    const changedBefore: NonNullable<OperationLogData["values"]> = {};
    const changedAfter: NonNullable<OperationLogData["values"]> = {};
    for (const label of Object.keys(beforeValues) as (keyof typeof beforeValues)[]) {
      if (equal(beforeValues[label], afterValues[label])) continue;
      changedBefore[label] = beforeValues[label];
      changedAfter[label] = afterValues[label];
    }
    logs.push(draft({
      userId: actor.userId, userName: actor.userName, quoteId, entityType: "QuoteRevision", entityId: after.revisionId, action: "更新报价版本",
      beforeData: data(before.revisionLabel, undefined, undefined, changedBefore), afterData: data(after.revisionLabel, undefined, undefined, changedAfter),
    }, actor, createdAt));
  }
  const beforeVersions = new Map(before.priceVersions.map((version) => [version.id, version]));
  const afterVersions = new Map(after.priceVersions.map((version) => [version.id, version]));
  for (const version of after.priceVersions) {
    const previous = beforeVersions.get(version.id);
    if (!previous) {
      logs.push(draft({
        userId: actor.userId, userName: actor.userName, quoteId, entityType: "PriceVersion", entityId: version.id, action: "创建价格版本",
        beforeData: null, afterData: data(after.revisionLabel, version.name, undefined, { "数量": version.quantity, "说明": version.description }),
      }, actor, createdAt));
      continue;
    }
    logs.push(...diffPriceVersion(previous, version, after, quoteId, actor, createdAt));
  }
  for (const version of before.priceVersions) {
    if (afterVersions.has(version.id)) continue;
    logs.push(draft({
      userId: actor.userId, userName: actor.userName, quoteId, entityType: "PriceVersion", entityId: version.id, action: "删除价格版本",
      beforeData: data(before.revisionLabel, version.name, undefined, { "数量": version.quantity, "说明": version.description }), afterData: null,
    }, actor, createdAt));
  }
  logs.push(...diffAttachments(before, after, quoteId, actor, createdAt));
  return logs;
}

export function createQuoteOperationLogs(before: Quote | null, after: Quote, actor: OperationLogActor, createdAt = new Date().toISOString()): OperationLogDraft[] {
  const revision = after.revisions.find((item) => item.revisionId === after.defaultRevisionId);
  const saved = draft({
    userId: actor.userId, userName: actor.userName, quoteId: after.id, entityType: "Quote", entityId: after.id, action: "保存报价",
    beforeData: null,
    afterData: { revisionLabel: revision?.revisionLabel, values: { "款号": revision?.baseInfo.quoteStyleNo ?? "", "款式名称": revision?.baseInfo.styleName ?? "" } },
  }, actor, createdAt);
  if (!before) return [draft({
    userId: actor.userId, userName: actor.userName, quoteId: after.id, entityType: "Quote", entityId: after.id, action: "创建报价", beforeData: null,
    afterData: { revisionLabel: revision?.revisionLabel, values: { "报价编号": after.quoteCode, "款号": revision?.baseInfo.quoteStyleNo ?? "", "款式名称": revision?.baseInfo.styleName ?? "" } },
  }, actor, createdAt), saved];

  const logs: OperationLogDraft[] = [];
  const beforeRevisions = new Map(before.revisions.map((revision) => [revision.revisionId, revision]));
  const afterRevisions = new Map(after.revisions.map((revision) => [revision.revisionId, revision]));
  for (const revision of after.revisions) {
    const previous = beforeRevisions.get(revision.revisionId);
    if (!previous) {
      const source = revision.parentRevisionId ? beforeRevisions.get(revision.parentRevisionId) : undefined;
      logs.push(draft({
        userId: actor.userId, userName: actor.userName, quoteId: after.id, entityType: "QuoteRevision", entityId: revision.revisionId, action: "创建报价版本",
        beforeData: source ? data(source.revisionLabel, undefined, undefined, { "来源版本": source.revisionLabel }) : null,
        afterData: data(revision.revisionLabel, undefined, undefined, { "新版本": revision.revisionLabel, "原因": revision.reason, "说明": revision.note }),
      }, actor, createdAt));
      continue;
    }
    logs.push(...diffRevision(previous, revision, after.id, actor, createdAt));
  }
  for (const revision of before.revisions) {
    if (afterRevisions.has(revision.revisionId)) continue;
    logs.push(draft({
      userId: actor.userId, userName: actor.userName, quoteId: after.id, entityType: "QuoteRevision", entityId: revision.revisionId, action: "删除报价版本",
      beforeData: data(revision.revisionLabel, undefined, undefined, { "版本": revision.revisionLabel }), afterData: null,
    }, actor, createdAt));
  }
  return [...logs.map(clone), saved];
}

export function createQuoteDeletionLog(quote: Quote, actor: OperationLogActor, createdAt = new Date().toISOString()): OperationLogDraft {
  const revision = quote.revisions.find((item) => item.revisionId === quote.defaultRevisionId);
  return draft({
    userId: actor.userId, userName: actor.userName, quoteId: quote.id, entityType: "Quote", entityId: quote.id, action: "删除报价",
    beforeData: { revisionLabel: revision?.revisionLabel, values: { "报价编号": quote.quoteCode, "款号": revision?.baseInfo.quoteStyleNo ?? "", "款式名称": revision?.baseInfo.styleName ?? "" } }, afterData: null,
  }, actor, createdAt);
}
