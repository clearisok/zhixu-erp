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
  | "修改进度设置"
  | "创建账号"
  | "修改账号"
  | "重置密码"
  | "创建报价"
  | "保存报价"
  | "删除报价"
  | "创建报价版本"
  | "更新报价版本"
  | "删除报价版本"
  | "创建价格版本"
  | "修改价格版本"
  | "修改价格版本制作预设"
  | "删除价格版本"
  | "确认报价"
  | "修改客户确认"
  | "修改面料成本"
  | "修改辅料成本"
  | "修改工价"
  | "修改报价工价"
  | "修改订单工价"
  | "修改关账工价"
  | "修改其他费用"
  | "同步价格版本成本"
  | "上传图片"
  | "上传文件"
  | "重命名附件"
  | "关联附件"
  | "移除附件引用"
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
  | "恢复历史估算成本"
  | "新增品牌"
  | "修改品牌"
  | "删除品牌"
  | "新增客户业务员"
  | "修改客户业务员"
  | "删除客户业务员"
  | "新增面料库项"
  | "修改面料库项"
  | "新增辅料库项"
  | "修改辅料库项"
  | "修改报价设置"
  | "新增制作预设"
  | "修改制作预设"
  | "删除制作预设"
  | "修改默认制作预设"
  | "创建生产组"
  | "编辑生产组"
  | "启用生产组"
  | "停用生产组"
  | "创建外发厂"
  | "编辑外发厂"
  | "启用外发厂"
  | "停用外发厂"
  | "修改生产日历"
  | "修改生产地点"
  | "修改供应枢纽"
  | "修改供应路线"
  | "修改运输方式"
  | "修改关账默认税率"
  | "新增月度产值目标"
  | "修改月度产值目标"
  | "删除月度产值目标"
  | "创建订单"
  | "创建手工订单"
  | "报价生成订单"
  | "翻单"
  | "翻单创建订单"
  | "确认订单"
  | "新增订单款式"
  | "修改订单数量"
  | "调整订单数量"
  | "部分取消订单数量"
  | "全部取消订单款式"
  | "部分取消订单"
  | "全部取消订单"
  | "取消订单"
  | "取消整张订单"
  | "修改订单价格"
  | "创建订单初始价格"
  | "调整订单销售价"
  | "调整订单工价"
  | "调整订单汇率依据"
  | "新增交期"
  | "采用订单商业版本"
  | "维护订单业务来源"
  | "登记加工批次"
  | "确认加工批次"
  | "取消加工批次"
  | "创建加工订单"
  | "维护订单身份"
  | "建立翻单准备"
  | "修改交期"
  | "作废交期"
  | "修改订单基础信息"
  | "确认商业条款"
  | "修改确认商业条款"
  | "创建生产计划"
  | "修改生产计划"
  | "取消生产计划"
  | "新增排单"
  | "新增内部排单"
  | "新增外发排单"
  | "修改排单"
  | "取消排单"
  | "修改完成数量"
  | "标记生产完成"
  | "仅记录结束"
  | "结束并更新后续排期"
  | "队列重排"
  | "修改物料到仓"
  | "更新订单执行跟进"
  | "新增关账归属"
  | "创建关账月份"
  | "修改关账归属"
  | "作废关账归属"
  | "同步排单快照"
  | "保留关账快照"
  | "调整关账月份"
  | "调整关账数量"
  | "调整关账销售价"
  | "调整关账汇率"
  | "调整关账税率"
  | "调整关账执行方"
  | "取消确认关账月份"
  | "确认关账月份"
  | "锁定关账月份"
  | "重新打开关账月份"
  | "艾诺科自动绑定"
  | "艾诺科手工绑定"
  | "首次绑定艾诺科订单"
  | "受控接纳新增合同"
  | "采集艾诺科来源"
  | "启停艾诺科货款来源"
  | "艾诺科同步订单"
  | "艾诺科新增订单"
  | "艾诺科数量变更"
  | "艾诺科分色变更"
  | "清理艾诺科旧迁移待确认"
  | "绑定艾诺科个人账号"
  | "更新艾诺科个人账号"
  | "解除艾诺科个人账号"
  | "修改品牌别名"
  | "修改代购辅料成本规则"
  | "手工覆盖代购辅料成本"
  | "导入面辅料跟进"
  | "修改当前预计到料日"
  | "恢复拟定交期"
  | "创建预计到料批次"
  | "修改预计到料批次"
  | "删除预计到料批次"
  | "调整预计到料分配"
  | "恢复使用来源计划";

export type OperationLogExportPriceVersionSnapshot = {
  priceVersionId: string;
  priceVersionName: string;
  productionPresetName: string;
  productionCountry: string;
};

export type OperationLogExportQuoteSnapshot = {
  quoteId: string;
  styleNo: string;
  styleName: string;
  revisionId: string;
  revisionLabel: string;
  priceVersions: OperationLogExportPriceVersionSnapshot[];
  exportStatus?: "success" | "failed";
  failureReason?: string;
};

export type OperationLogData = {
  quoteCode?: string;
  orderId?: string;
  orderItemId?: string;
  orderNo?: string;
  orderStyleNo?: string;
  salesContractNo?: string;
  canonicalMaterialKey?: string;
  materialDemandId?: string;
  sourceQuoteId?: string;
  sourceRevisionId?: string;
  sourcePriceVersionId?: string;
  productionPlanId?: string;
  scheduleAssignmentId?: string;
  orderExecutionTrackingId?: string;
  closingPeriodId?: string;
  closingAllocationId?: string;
  reason?: string;
  quoteStyleNo?: string;
  styleName?: string;
  revisionLabel?: string;
  revisionId?: string;
  priceVersionName?: string;
  priceVersionId?: string;
  rowName?: string;
  /** 业务对象来自具体报价、品牌默认资料或客户业务员默认资料。 */
  objectSource?: "quote" | "order" | "brand-default" | "salesperson-default";
  objectType?: string;
  objectId?: string;
  objectName?: string;
  brandId?: string;
  brandName?: string;
  salespersonId?: string;
  salespersonName?: string;
  presetId?: string;
  presetName?: string;
  beforePresetId?: string | null;
  beforePresetName?: string | null;
  afterPresetId?: string | null;
  afterPresetName?: string | null;
  laborCurrency?: "CNY" | "USD";
  attachmentId?: string | null;
  values?: Record<string, string | number | null>;
  /** Small business snapshots only. Never store Quote objects, attachments, or workbook blobs here. */
  exportQuotes?: OperationLogExportQuoteSnapshot[];
};

export type OperationLogChange = {
  field: string;
  beforeValue: string | number | null;
  afterValue: string | number | null;
};

export type OperationLog = {
  id: string;
  userId: string;
  /** 保存操作发生时的姓名快照，避免后续账号改名污染历史展示。 */
  userName: string;
  module: "报价中心" | "模板设置" | "权限管理" | "基础设置" | "系统设置" | "生产基础资料" | "订单中心" | "生产排单" | "关账中心" | "关账设置" | "艾诺科同步" | "艾诺科个人账号" | "款式进度";
  entityType: "AinuokePaymentTarget" | "MaterialProgressSettings" | "OrderNormalizationCase" | "ProcessingOrderBatch" | "OrderCommercialVersion" | "SalesOrderIdentity" | "OrderPreparation" | "AinuokeSourceBinding" | "AinuokeSourceAddition"
  | "AinuokeSourceRun" | "Quote" | "QuoteRevision" | "PriceVersion" | "FabricCostLine" | "TrimCostLine" | "FabricLibraryItem" | "TrimLibraryItem" | "LaborCost" | "OtherCostLine" | "Attachment" | "EstimateCost" | "Export" | "Template" | "User" | "Role" | "Brand" | "CustomerSalesperson" | "ManufacturingPreset" | "QuoteSettings" | "SalesOrder" | "OrderItem" | "DeliveryPlan" | "OrderQuantityChange" | "OrderPriceVersion" | "ConfirmedCommercialTerms" | "ProductionPlan" | "ScheduleAssignment" | "OrderExecutionTracking" | "ClosingPeriod" | "ClosingAllocation" | "ProductionGroup" | "OutsourceFactory" | "ProductionCalendar" | "ProductionSite" | "SupplyHub" | "SupplyRoute" | "TransportMode" | "MonthlyProductionTarget" | "ClosingSettings" | "AinuokeContract" | "AinuokeImportReview" | "AinuokeAccount" | "OrderColorLine" | "BrandAlias" | "PurchasedTrimCostRule" | "MaterialImportBatch" | "MaterialDemand" | "MaterialExpectedArrivalBatch";
  entityId: string;
  /** 独立索引字段，用于从报价详情聚合其 Revision、成本和附件日志。 */
  quoteId: string | null;
  /** 一次明确用户操作的稳定关联键；旧日志可为空。 */
  operationId?: string;
  /** 同一 operationId 内的稳定展示顺序；旧日志可为空。 */
  operationSequence?: number;
  action: OperationLogAction;
  /** 兼容早期直接保存原因的日志；新日志优先将原因写入 beforeData / afterData。 */
  reason?: string;
  beforeData: OperationLogData | null;
  afterData: OperationLogData | null;
  changes: OperationLogChange[];
  createdAt: string;
};

export type OperationLogActor = { userId: string; userName: string };
export type OperationLogDraft = Omit<OperationLog, "id" | "changes"> & { changes?: OperationLogChange[] };

const clone = <T>(value: T): T => structuredClone(value);
const equal = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);
const data = (revisionLabel: string, priceVersionName?: string, rowName?: string, values?: OperationLogData["values"]): OperationLogData => ({
  revisionLabel,
  ...(priceVersionName ? { priceVersionName } : {}),
  ...(rowName ? { rowName } : {}),
  ...(values && Object.keys(values).length ? { values } : {}),
});

export const createOperationId = () => globalThis.crypto?.randomUUID?.() ?? `operation-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

export function createBatchExportQuoteSnapshots(quotes: Quote[]): OperationLogExportQuoteSnapshot[] {
  return quotes.map((quote) => {
    const revision = quote.revisions.find((item) => item.revisionId === quote.defaultRevisionId)
      ?? quote.revisions[quote.revisions.length - 1];
    return {
      quoteId: quote.id,
      styleNo: revision?.baseInfo.quoteStyleNo ?? "",
      styleName: revision?.baseInfo.styleName ?? "",
      revisionId: revision?.revisionId ?? "",
      revisionLabel: revision?.revisionLabel ?? "",
      priceVersions: (revision?.priceVersions ?? []).map((version) => ({
        priceVersionId: version.id,
        priceVersionName: version.name,
        productionPresetName: version.pricingParameters.manufacturingPresetName,
        productionCountry: version.pricingParameters.manufacturingCountry,
      })),
    };
  });
}

export function assignOperationMetadata(logs: OperationLogDraft[], operationId: string, createdAt?: string): OperationLogDraft[] {
  return logs.map((log, operationSequence) => ({
    ...log,
    operationId,
    operationSequence,
    ...(createdAt ? { createdAt } : {}),
  }));
}

export function createOperationLogChanges(beforeData: OperationLogData | null, afterData: OperationLogData | null): OperationLogChange[] {
  const before = beforeData?.values ?? {};
  const after = afterData?.values ?? {};
  const fields = [...new Set([...Object.keys(before), ...Object.keys(after)])];
  const changes = fields.map((field) => ({
    field,
    beforeValue: Object.hasOwn(before, field) ? before[field] : null,
    afterValue: Object.hasOwn(after, field) ? after[field] : null,
  }));
  if (!fields.length && (beforeData?.attachmentId !== undefined || afterData?.attachmentId !== undefined)) {
    changes.push({ field: "附件", beforeValue: beforeData?.attachmentId ?? null, afterValue: afterData?.attachmentId ?? null });
  }
  return changes;
}

function draft(input: Omit<OperationLogDraft, "module" | "createdAt">, actor: OperationLogActor, createdAt: string): OperationLogDraft {
  return { ...input, changes: input.changes ?? createOperationLogChanges(input.beforeData, input.afterData), userId: actor.userId, userName: actor.userName, module: "报价中心", createdAt };
}

export function createOperationLogDraft(input: {
  actor: OperationLogActor;
  module: OperationLog["module"];
  entityType: OperationLog["entityType"];
  entityId: string;
  quoteId?: string | null;
  operationId?: string;
  operationSequence?: number;
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
    operationId: input.operationId ?? createOperationId(),
    operationSequence: input.operationSequence ?? 0,
    action: input.action,
    beforeData: input.beforeData ?? null,
    afterData: input.afterData ?? null,
    changes: createOperationLogChanges(input.beforeData ?? null, input.afterData ?? null),
    createdAt: input.createdAt ?? new Date().toISOString(),
  };
}

function quoteDisplayData(source: OperationLogData | null, quote: Quote | null, log: OperationLogDraft): OperationLogData | null {
  if (!source) return null;
  const revision = quote?.revisions.find((item) => item.revisionLabel === source.revisionLabel)
    ?? (quote ? quote.revisions.find((item) => item.revisionId === quote.defaultRevisionId) : undefined);
  const priceVersion = revision?.priceVersions.find((item) => item.name === source.priceVersionName);
  return {
    ...source,
    quoteCode: source.quoteCode ?? quote?.quoteCode ?? "",
    quoteStyleNo: source.quoteStyleNo ?? revision?.baseInfo.quoteStyleNo ?? "",
    styleName: source.styleName ?? revision?.baseInfo.styleName ?? "",
    revisionId: source.revisionId ?? revision?.revisionId,
    priceVersionId: source.priceVersionId ?? priceVersion?.id,
    objectSource: source.objectSource ?? "quote",
    objectType: source.objectType ?? log.entityType,
    objectId: source.objectId ?? log.entityId,
    objectName: source.objectName ?? source.rowName ?? source.priceVersionName ?? source.revisionLabel,
    laborCurrency: source.laborCurrency ?? priceVersion?.pricingParameters.laborCurrency ?? revision?.priceVersions[0]?.pricingParameters.laborCurrency,
  };
}

function attachQuoteDisplayContext(logs: OperationLogDraft[], before: Quote | null, after: Quote): OperationLogDraft[] {
  return logs.map((log) => ({
    ...log,
    beforeData: quoteDisplayData(log.beforeData, before ?? after, log),
    afterData: quoteDisplayData(log.afterData, after, log),
  }));
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
    if (beforeRow && afterRow && !Object.keys(beforeValues).length && !Object.keys(afterValues).length) continue;
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
  };
}

function comparableRevisionMetadata(revision: QuoteRevision) {
  return {
    baseInfo: revision.baseInfo,
    versions: revision.priceVersions.map(({ id, name, quantity, description, pricingParameters }) => ({ id, name, quantity, description, pricingParameters })),
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
  const [beforePricingValues, afterPricingValues] = changedValues(before.pricingParameters, after.pricingParameters, {
    manufacturingPresetId: "制作预设 ID",
    manufacturingPresetName: "制作预设",
    manufacturingCountry: "制作国家",
    laborCurrency: "加工币种",
    usdCnyRate: "USD/CNY汇率",
    markupRate: "成本加成率",
    includeFreight: "包含运费",
    freightName: "运费名称",
    freightAmount: "运费金额",
  });
  if (Object.keys(beforePricingValues).length) logs.push(draft({
    userId: actor.userId,
    userName: actor.userName,
    quoteId,
    entityType: "PriceVersion",
    entityId: after.id,
    action: before.pricingParameters.manufacturingPresetId !== after.pricingParameters.manufacturingPresetId
      || before.pricingParameters.manufacturingPresetName !== after.pricingParameters.manufacturingPresetName
      ? "修改价格版本制作预设"
      : "修改价格版本",
    beforeData: {
      ...data(revision.revisionLabel, before.name, undefined, beforePricingValues),
      revisionId: revision.revisionId,
      priceVersionId: before.id,
      objectType: "PriceVersion",
      objectId: before.id,
      objectName: before.name,
      beforePresetId: before.pricingParameters.manufacturingPresetId,
      beforePresetName: before.pricingParameters.manufacturingPresetName,
      afterPresetId: after.pricingParameters.manufacturingPresetId,
      afterPresetName: after.pricingParameters.manufacturingPresetName,
    },
    afterData: {
      ...data(revision.revisionLabel, after.name, undefined, afterPricingValues),
      revisionId: revision.revisionId,
      priceVersionId: after.id,
      objectType: "PriceVersion",
      objectId: after.id,
      objectName: after.name,
      beforePresetId: before.pricingParameters.manufacturingPresetId,
      beforePresetName: before.pricingParameters.manufacturingPresetName,
      afterPresetId: after.pricingParameters.manufacturingPresetId,
      afterPresetName: after.pricingParameters.manufacturingPresetName,
    },
  }, actor, createdAt));
  if (!equal(before.labor, after.labor)) {
    const [beforeValues, afterValues] = changedValues(before.labor, after.labor, { value: "工价", description: "工价说明" });
    logs.push(draft({
      userId: actor.userId, userName: actor.userName, quoteId, entityType: "LaborCost", entityId: `${revision.revisionId}:${after.id}:labor`, action: "修改报价工价",
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

export function createQuoteOperationLogs(
  before: Quote | null,
  after: Quote,
  actor: OperationLogActor,
  createdAt = new Date().toISOString(),
  operationId = createOperationId(),
): OperationLogDraft[] {
  const revision = after.revisions.find((item) => item.revisionId === after.defaultRevisionId);
  const saved = draft({
    userId: actor.userId, userName: actor.userName, quoteId: after.id, entityType: "Quote", entityId: after.id, action: "保存报价",
    beforeData: null,
    afterData: { revisionLabel: revision?.revisionLabel, values: { "款号": revision?.baseInfo.quoteStyleNo ?? "", "款式名称": revision?.baseInfo.styleName ?? "" } },
  }, actor, createdAt);
  if (!before) return assignOperationMetadata(attachQuoteDisplayContext([draft({
    userId: actor.userId, userName: actor.userName, quoteId: after.id, entityType: "Quote", entityId: after.id, action: "创建报价", beforeData: null,
    afterData: { revisionLabel: revision?.revisionLabel, values: { "报价编号": after.quoteCode, "款号": revision?.baseInfo.quoteStyleNo ?? "", "款式名称": revision?.baseInfo.styleName ?? "" } },
  }, actor, createdAt), saved], null, after), operationId, createdAt);

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
  return assignOperationMetadata(attachQuoteDisplayContext([...logs.map(clone), saved], before, after), operationId, createdAt);
}

export function createQuoteDeletionLog(quote: Quote, actor: OperationLogActor, createdAt = new Date().toISOString(), operationId = createOperationId()): OperationLogDraft {
  const revision = quote.revisions.find((item) => item.revisionId === quote.defaultRevisionId);
  const log = draft({
    userId: actor.userId, userName: actor.userName, quoteId: quote.id, entityType: "Quote", entityId: quote.id, action: "删除报价",
    beforeData: { quoteStyleNo: revision?.baseInfo.quoteStyleNo ?? "", styleName: revision?.baseInfo.styleName ?? "", revisionLabel: revision?.revisionLabel, laborCurrency: revision?.priceVersions[0]?.pricingParameters.laborCurrency, values: { "报价编号": quote.quoteCode, "款号": revision?.baseInfo.quoteStyleNo ?? "", "款式名称": revision?.baseInfo.styleName ?? "" } }, afterData: null,
  }, actor, createdAt);
  return assignOperationMetadata([log], operationId, createdAt)[0];
}
