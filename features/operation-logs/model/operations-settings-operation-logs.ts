import type {
  MonthlyProductionTarget,
  OperationsSettingsState,
  OutsourceFactory,
  ProductionGroup,
  ProductionCalendar,
  ProductionSite,
  SupplyHub,
  SupplyRoute,
  TransportMode,
} from "../../operations-settings/model/operations-settings.ts";
import {
  assignOperationMetadata,
  createOperationId,
  createOperationLogDraft,
  type OperationLogActor,
  type OperationLogData,
  type OperationLogDraft,
} from "./operation-log.ts";

type Values = NonNullable<OperationLogData["values"]>;

const same = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);

function changedValues(before: Values, after: Values): [Values, Values] {
  const beforeChanged: Values = {};
  const afterChanged: Values = {};
  for (const field of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (same(before[field], after[field])) continue;
    beforeChanged[field] = Object.hasOwn(before, field) ? before[field] : null;
    afterChanged[field] = Object.hasOwn(after, field) ? after[field] : null;
  }
  return [beforeChanged, afterChanged];
}

const productionGroupValues = (item: ProductionGroup): Values => ({
  "名称": item.name,
  "简称": item.shortName || null,
  "状态": item.enabled ? "启用" : "停用",
  "排序": item.sortOrder,
  "备注": item.remark || null,
});

const outsourceFactoryValues = (item: OutsourceFactory): Values => ({
  "名称": item.name,
  "简称": item.shortName || null,
  "状态": item.enabled ? "启用" : "停用",
  "联系人": item.contactPerson || null,
  "联系电话": item.phone || null,
  "备注": item.remark || null,
});

const monthlyTargetValues = (item: MonthlyProductionTarget): Values => ({
  "月份": item.month,
  "总加工产值目标（RMB）": item.totalProcessingOutputTargetRmb,
  "内部加工产值目标（RMB）": item.internalProcessingOutputTargetRmb,
  "备注": item.remark || null,
});

function objectData(type: string, id: string, name: string, values: Values): OperationLogData {
  return { objectType: type, objectId: id, objectName: name, values };
}

export function createOperationsSettingsOperationLogs(
  before: OperationsSettingsState,
  after: OperationsSettingsState,
  actor: OperationLogActor,
  createdAt = new Date().toISOString(),
  operationId = createOperationId(),
): OperationLogDraft[] {
  const logs: OperationLogDraft[] = [];

  const collectMasterData = <T extends ProductionGroup | OutsourceFactory>(
    kind: "production-group" | "outsource-factory",
    beforeRows: T[],
    afterRows: T[],
    valuesOf: (item: T) => Values,
  ) => {
    const beforeById = new Map(beforeRows.map((item) => [item.id, item]));
    const afterById = new Map(afterRows.map((item) => [item.id, item]));
    for (const id of new Set([...beforeById.keys(), ...afterById.keys()])) {
      const previous = beforeById.get(id);
      const next = afterById.get(id);
      if (!next || (previous && same(previous, next))) continue;
      const beforeValues = previous ? valuesOf(previous) : {};
      const afterValues = valuesOf(next);
      const [beforeChanged, afterChanged] = previous ? changedValues(beforeValues, afterValues) : [beforeValues, afterValues];
      const enabledOnly = previous && previous.enabled !== next.enabled
        && Object.keys(afterChanged).every((field) => field === "状态");
      const entityType = kind === "production-group" ? "ProductionGroup" : "OutsourceFactory";
      const action = kind === "production-group"
        ? previous ? enabledOnly ? next.enabled ? "启用生产组" : "停用生产组" : "编辑生产组" : "创建生产组"
        : previous ? enabledOnly ? next.enabled ? "启用外发厂" : "停用外发厂" : "编辑外发厂" : "创建外发厂";
      logs.push(createOperationLogDraft({
        actor,
        module: "生产基础资料",
        entityType,
        entityId: id,
        action,
        beforeData: previous ? objectData(entityType, id, previous.name, beforeChanged) : null,
        afterData: objectData(entityType, id, next.name, afterChanged),
        createdAt,
      }));
    }
  };

  collectMasterData("production-group", before.productionGroups, after.productionGroups, productionGroupValues);
  collectMasterData("outsource-factory", before.outsourceFactories, after.outsourceFactories, outsourceFactoryValues);

  const collectInfrastructure = <T extends { id: string; name: string }>(beforeRows: T[], afterRows: T[], entityType: "ProductionCalendar" | "ProductionSite" | "SupplyHub" | "SupplyRoute" | "TransportMode", action: "修改生产日历" | "修改生产地点" | "修改供应枢纽" | "修改供应路线" | "修改运输方式") => {
    const beforeById = new Map(beforeRows.map((item) => [item.id, item])); const afterById = new Map(afterRows.map((item) => [item.id, item]));
    for (const id of new Set([...beforeById.keys(), ...afterById.keys()])) { const previous = beforeById.get(id); const next = afterById.get(id); if (!next || (previous && same(previous, next))) continue; logs.push(createOperationLogDraft({ actor, module: "生产基础资料", entityType, entityId: id, action, beforeData: previous ? objectData(entityType, id, previous.name, { "配置": JSON.stringify(previous) }) : null, afterData: objectData(entityType, id, next.name, { "配置": JSON.stringify(next) }), createdAt })); }
  };
  collectInfrastructure<ProductionCalendar>(before.productionCalendars, after.productionCalendars, "ProductionCalendar", "修改生产日历");
  collectInfrastructure<ProductionSite>(before.productionSites, after.productionSites, "ProductionSite", "修改生产地点");
  collectInfrastructure<SupplyHub>(before.supplyHubs, after.supplyHubs, "SupplyHub", "修改供应枢纽");
  collectInfrastructure<SupplyRoute>(before.supplyRoutes, after.supplyRoutes, "SupplyRoute", "修改供应路线");
  collectInfrastructure<TransportMode>(before.transportModes, after.transportModes, "TransportMode", "修改运输方式");

  if (before.closingSettings.defaultSalesTaxRatePercent !== after.closingSettings.defaultSalesTaxRatePercent) {
    logs.push(createOperationLogDraft({
      actor,
      module: "关账设置",
      entityType: "ClosingSettings",
      entityId: "closing-settings",
      action: "修改关账默认税率",
      beforeData: objectData("ClosingSettings", "closing-settings", "关账默认规则", { "销售产值默认税率": before.closingSettings.defaultSalesTaxRatePercent }),
      afterData: objectData("ClosingSettings", "closing-settings", "关账默认规则", { "销售产值默认税率": after.closingSettings.defaultSalesTaxRatePercent }),
      createdAt,
    }));
  }

  const beforeTargets = new Map(before.closingSettings.monthlyProductionTargets.map((item) => [item.id, item]));
  const afterTargets = new Map(after.closingSettings.monthlyProductionTargets.map((item) => [item.id, item]));
  for (const id of new Set([...beforeTargets.keys(), ...afterTargets.keys()])) {
    const previous = beforeTargets.get(id);
    const next = afterTargets.get(id);
    if (previous && next && same(previous, next)) continue;
    const [beforeValues, afterValues] = previous && next
      ? changedValues(monthlyTargetValues(previous), monthlyTargetValues(next))
      : [previous ? monthlyTargetValues(previous) : {}, next ? monthlyTargetValues(next) : {}];
    logs.push(createOperationLogDraft({
      actor,
      module: "关账设置",
      entityType: "MonthlyProductionTarget",
      entityId: id,
      action: previous ? next ? "修改月度产值目标" : "删除月度产值目标" : "新增月度产值目标",
      beforeData: previous ? objectData("MonthlyProductionTarget", id, previous.month, beforeValues) : null,
      afterData: next ? objectData("MonthlyProductionTarget", id, next.month, afterValues) : null,
      createdAt,
    }));
  }

  return assignOperationMetadata(logs, operationId, createdAt);
}
