import type { OperationLog, OperationLogChange, OperationLogData } from "./operation-log";

export type OperationLogQuoteTarget = {
  quoteStyleNo: string;
  styleName: string;
};

export type OperationLogGroup = {
  id: string;
  operationId: string | null;
  createdAt: string;
  userId: string;
  userName: string;
  action: OperationLog["action"];
  badge: string;
  targetLabel: string;
  events: OperationLog[];
};

export type OperationLogPresentationItem = {
  id: string;
  category: string;
  title: string;
  mode: "change" | "create" | "delete" | "summary";
  changes: OperationLogChange[];
  values: [string, string | number | null][];
  data: OperationLogData | null;
  log: OperationLog;
};

export type OperationLogSection = {
  category: string;
  items: OperationLogPresentationItem[];
};

const sectionOrder = ["报价基础信息", "报价参数", "报价版本", "价格版本", "面料成本", "辅料成本", "工价", "其他费用", "客户确认", "附件", "品牌", "客户业务员", "生产组", "外发厂", "关账设置", "月度产值目标", "制作预设", "报价设置", "订单", "排单", "关账", "导出", "估算成本", "模板", "权限", "报价"];
const pricingFields = new Set(["制作国家", "制作预设 ID", "加工币种", "USD/CNY汇率", "成本加成率"]);

export function operationLogCategory(log: OperationLog): string {
  if (log.module === "模板设置" || log.entityType === "Template") return "模板";
  if (log.module === "权限管理" || log.entityType === "User" || log.entityType === "Role") return "权限";
  if (log.entityType === "Brand") return "品牌";
  if (log.entityType === "CustomerSalesperson") return "客户业务员";
  if (log.entityType === "ManufacturingPreset") return "制作预设";
  if (log.entityType === "QuoteSettings") return "报价设置";
  if (log.entityType === "ProductionGroup") return "生产组";
  if (log.entityType === "OutsourceFactory") return "外发厂";
  if (log.entityType === "ClosingSettings") return "关账设置";
  if (log.entityType === "MonthlyProductionTarget") return "月度产值目标";
  if (["SalesOrder", "OrderItem", "DeliveryPlan", "OrderQuantityChange", "OrderPriceVersion"].includes(log.entityType)) return "订单";
  if (["ProductionPlan", "ScheduleAssignment", "OrderExecutionTracking"].includes(log.entityType)) return "排单";
  if (["ClosingPeriod", "ClosingAllocation"].includes(log.entityType)) return "关账";
  if (log.entityType === "FabricCostLine") return "面料成本";
  if (log.entityType === "TrimCostLine") return "辅料成本";
  if (log.entityType === "LaborCost") return "工价";
  if (log.entityType === "OtherCostLine") return "其他费用";
  if (log.entityType === "Attachment") return "附件";
  if (log.entityType === "EstimateCost") return "估算成本";
  if (log.entityType === "Export") return "导出";
  if (log.entityType === "QuoteRevision") return "报价版本";
  if (log.entityType === "PriceVersion") return log.action === "确认报价" || log.action === "修改客户确认" ? "客户确认" : "价格版本";
  return "报价";
}

const explicitGroupActions: OperationLog["action"][] = [
  "删除报价", "创建报价", "创建报价版本", "删除报价版本", "创建价格版本", "删除价格版本",
  "确认报价", "修改客户确认", "导出报价单", "批量导出", "导出报价汇总表", "上传图片", "上传文件",
  "删除附件", "设置款式图", "生成估算成本", "恢复历史估算成本", "上传模板", "设为默认模板",
  "修改模板状态", "修改角色", "修改权限", "修改账号状态", "同步价格版本成本",
  "新增品牌", "删除品牌", "新增客户业务员", "删除客户业务员", "新增制作预设", "删除制作预设", "修改默认制作预设",
  "创建生产组", "启用生产组", "停用生产组", "创建外发厂", "启用外发厂", "停用外发厂",
  "新增月度产值目标", "删除月度产值目标", "锁定关账月份", "重新打开关账月份",
];

function groupAction(events: OperationLog[]): OperationLog["action"] {
  const explicit = explicitGroupActions.find((action) => events.some((event) => event.action === action));
  if (explicit) return explicit;
  if (events.some((event) => event.action === "保存报价")) return "保存报价";
  return events[0].action;
}

function displayData(events: OperationLog[]): OperationLogData | null {
  for (const event of events) {
    const data = event.afterData ?? event.beforeData;
    if (data?.quoteStyleNo || data?.styleName || data?.revisionLabel || data?.priceVersionName) return data;
  }
  return events[0]?.afterData ?? events[0]?.beforeData ?? null;
}

function groupTargetLabel(events: OperationLog[], target?: OperationLogQuoteTarget): string {
  const data = displayData(events);
  const styleNo = data?.quoteStyleNo?.trim() || target?.quoteStyleNo.trim() || "";
  const styleName = data?.styleName?.trim() || target?.styleName.trim() || "";
  const quoteIdentity = styleNo ? `Quote ${styleNo}` : data?.quoteCode?.trim() ? `Quote ${data.quoteCode.trim()}` : "";
  const quoteParts = [quoteIdentity, styleName, data?.revisionLabel, data?.priceVersionName].filter(Boolean);
  if (quoteParts.length) return [...new Set(quoteParts)].join(" · ");
  const values = data?.values ?? {};
  const businessName = data?.objectName ?? values["模板名称"] ?? values["用户"] ?? values["角色"];
  if (typeof businessName === "string" && businessName.trim()) {
    const category = operationLogCategory(events[0]);
    return ["生产组", "外发厂", "关账设置", "月度产值目标", "订单", "排单", "关账"].includes(category)
      ? `${category} · ${businessName}`
      : businessName;
  }
  return operationLogCategory(events[0]);
}

export function groupOperationLogs(logs: OperationLog[], targets: Map<string, OperationLogQuoteTarget> = new Map()): OperationLogGroup[] {
  const grouped = new Map<string, { events: { event: OperationLog; inputIndex: number }[]; operationId: string | null }>();
  logs.forEach((event, inputIndex) => {
    const key = event.operationId ? `operation:${event.operationId}` : `legacy:${event.id}`;
    const current = grouped.get(key) ?? { events: [], operationId: event.operationId ?? null };
    current.events.push({ event, inputIndex });
    grouped.set(key, current);
  });

  return [...grouped.entries()].map(([id, value]) => {
    const events = value.events.sort((left, right) => {
      const leftSequence = left.event.operationSequence;
      const rightSequence = right.event.operationSequence;
      if (leftSequence !== undefined && rightSequence !== undefined && leftSequence !== rightSequence) return leftSequence - rightSequence;
      return left.inputIndex - right.inputIndex;
    }).map(({ event }) => event);
    const action = groupAction(events);
    const actionEvent = events.find((event) => event.action === action) ?? events[0];
    const quoteId = events.find((event) => event.quoteId)?.quoteId ?? null;
    return {
      id,
      operationId: value.operationId,
      createdAt: events.reduce((latest, event) => event.createdAt > latest ? event.createdAt : latest, events[0].createdAt),
      userId: events[0].userId,
      userName: events[0].userName,
      action,
      badge: action === "保存报价" || action === "创建报价" || action === "删除报价" ? "报价" : operationLogCategory(actionEvent),
      targetLabel: groupTargetLabel(events, quoteId ? targets.get(quoteId) : undefined),
      events,
    };
  }).sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

const rowNames: Partial<Record<OperationLog["entityType"], string>> = {
  FabricCostLine: "面料",
  TrimCostLine: "辅料",
  OtherCostLine: "其他费用",
  Brand: "品牌",
  CustomerSalesperson: "客户业务员",
  ManufacturingPreset: "制作预设",
  ProductionGroup: "生产组",
  OutsourceFactory: "外发厂",
  MonthlyProductionTarget: "月度产值目标",
};

function presentationItem(log: OperationLog, category: string, changes = log.changes): OperationLogPresentationItem {
  const data = log.afterData ?? log.beforeData;
  const rowType = rowNames[log.entityType];
  const isCreate = Boolean(rowType && !log.beforeData && log.afterData);
  const isDelete = Boolean(rowType && log.beforeData && !log.afterData);
  const isLifecycleAction = /^(创建|新增|删除|上传|导出|设置|生成|恢复|保存|确认)/.test(log.action);
  const rowName = data?.rowName?.trim() || data?.objectName?.trim();
  const mode = isCreate ? "create" : isDelete ? "delete" : !isLifecycleAction && log.beforeData && log.afterData && changes.length ? "change" : "summary";
  const contextParts = [data?.revisionLabel, data?.priceVersionName, rowName].filter(Boolean);
  const contextualTitle = contextParts.length ? `${log.action}｜${contextParts.join("｜")}` : log.action;
  const title = isCreate
    ? `新增${rowType}「${rowName || "未命名"}」｜${[data?.revisionLabel, data?.priceVersionName].filter(Boolean).join("｜")}`
    : isDelete
      ? `删除${rowType}「${rowName || "未命名"}」｜${[data?.revisionLabel, data?.priceVersionName].filter(Boolean).join("｜")}`
      : contextualTitle;
  const valuesSource = isDelete ? log.beforeData?.values : log.afterData?.values ?? log.beforeData?.values;
  const values = Object.entries(valuesSource ?? {}).filter(([field]) => !(rowName && ["面料名称", "辅料名称", "费用名称"].includes(field)));
  return {
    id: `${log.id}:${category}`,
    category,
    title,
    mode,
    changes,
    values,
    data,
    log,
  };
}

export function operationLogSections(group: OperationLogGroup): OperationLogSection[] {
  const byCategory = new Map<string, OperationLogPresentationItem[]>();
  const add = (item: OperationLogPresentationItem) => byCategory.set(item.category, [...(byCategory.get(item.category) ?? []), item]);
  for (const log of group.events) {
    if (log.action === "保存报价") {
      if (group.events.length > 1) continue;
      add(presentationItem({ ...log, changes: [] }, "报价", []));
      continue;
    }
    if (log.entityType === "QuoteRevision" && log.changes.length) {
      const parameters = log.changes.filter((change) => pricingFields.has(change.field));
      const baseInfo = log.changes.filter((change) => !pricingFields.has(change.field));
      if (baseInfo.length) add(presentationItem(log, "报价基础信息", baseInfo));
      if (parameters.length) add(presentationItem(log, "报价参数", parameters));
      continue;
    }
    if (!log.changes.length && log.action === "更新报价版本" && group.events.length > 1) continue;
    add(presentationItem(log, operationLogCategory(log)));
  }
  return [...byCategory.entries()].map(([category, items]) => ({ category, items })).sort((left, right) => {
    const leftIndex = sectionOrder.indexOf(left.category);
    const rightIndex = sectionOrder.indexOf(right.category);
    return (leftIndex < 0 ? sectionOrder.length : leftIndex) - (rightIndex < 0 ? sectionOrder.length : rightIndex);
  });
}

export function operationLogGroupSearchText(group: OperationLogGroup): string {
  return [group.userName, group.userId, group.action, group.badge, group.targetLabel, ...group.events.flatMap((event) => [
    event.action,
    event.module,
    operationLogCategory(event),
    event.afterData?.rowName,
    event.beforeData?.rowName,
    event.afterData?.quoteCode,
    event.afterData?.objectName,
    event.beforeData?.objectName,
    JSON.stringify(event.beforeData),
    JSON.stringify(event.afterData),
  ])].filter(Boolean).join(" ").toLocaleLowerCase();
}

export function formatOperationLogValue(field: string, value: string | number | null | undefined, data?: OperationLogData | null): string {
  if (value === null || value === undefined || value === "") return "空";
  if (typeof value !== "number" || !Number.isFinite(value)) return String(value);
  if (/损耗率|成本加成率|税率/.test(field)) return `${new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 4 }).format(value)}%`;
  if (/单价|单件金额|确认成衣价|产值目标/.test(field)) return `¥${value.toFixed(2)}`;
  if (/工价|确认工价/.test(field)) return `${data?.laborCurrency === "USD" ? "$" : "¥"}${value.toFixed(2)}`;
  return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 4 }).format(value);
}
