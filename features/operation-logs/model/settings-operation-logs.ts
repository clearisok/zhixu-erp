import type {
  BasicSettingsState,
  BrandRecord,
  CustomerSalespersonRecord,
  DefaultQuoteConfiguration,
} from "../../basic-settings/model/basic-settings.ts";
import type {
  GlobalQuoteSettings,
  ManufacturingPreset,
} from "../../quote-center/model/quote-settings.ts";
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

function defaultValues(defaults: DefaultQuoteConfiguration, state: BasicSettingsState): Values {
  const values: Values = {
    "默认 USD/CNY 汇率": defaults.defaultUsdCnyRate,
    "默认其他费用名称": defaults.defaultOtherCost?.name ?? null,
    "默认其他费用金额": defaults.defaultOtherCost?.amount ?? null,
  };
  const library = new Map(state.trimLibrary.map((item) => [item.id, item]));
  defaults.defaultTrims.forEach((config, index) => {
    const trim = library.get(config.trimLibraryItemId);
    const prefix = `固定辅料 ${index + 1} · ${trim?.name || config.trimLibraryItemId}`;
    values[`${prefix} ID`] = config.trimLibraryItemId;
    values[`${prefix} 数量/用量`] = config.quantity;
    values[`${prefix} 覆盖损耗率`] = config.overrideLossRate;
    values[`${prefix} 覆盖单价`] = config.overrideUnitPrice;
  });
  return values;
}

function brandValues(brand: BrandRecord, state: BasicSettingsState): Values {
  return { "品牌名称": brand.name, "状态": brand.status, ...defaultValues(brand.defaults, state) };
}

function salespersonValues(salesperson: CustomerSalespersonRecord, state: BasicSettingsState): Values {
  const brand = state.brands.find((item) => item.id === salesperson.brandId);
  return {
    "客户业务员姓名": salesperson.name,
    "归属品牌 ID": salesperson.brandId,
    "归属品牌": brand?.name ?? salesperson.brandId,
    "状态": salesperson.status,
    ...defaultValues(salesperson.defaults, state),
  };
}

function masterData(
  kind: "brand" | "salesperson",
  record: BrandRecord | CustomerSalespersonRecord,
  state: BasicSettingsState,
  values: Values,
): OperationLogData {
  if (kind === "brand") return {
    objectSource: "brand-default",
    objectType: "Brand",
    objectId: record.id,
    objectName: record.name,
    brandId: record.id,
    brandName: record.name,
    values,
  };
  const salesperson = record as CustomerSalespersonRecord;
  const brand = state.brands.find((item) => item.id === salesperson.brandId);
  return {
    objectSource: "salesperson-default",
    objectType: "CustomerSalesperson",
    objectId: salesperson.id,
    objectName: salesperson.name,
    salespersonId: salesperson.id,
    salespersonName: salesperson.name,
    brandId: salesperson.brandId,
    brandName: brand?.name ?? salesperson.brandId,
    values,
  };
}

export function createBasicSettingsOperationLogs(
  before: BasicSettingsState,
  after: BasicSettingsState,
  actor: OperationLogActor,
  createdAt = new Date().toISOString(),
  operationId = createOperationId(),
): OperationLogDraft[] {
  const logs: OperationLogDraft[] = [];
  const collect = <T extends BrandRecord | CustomerSalespersonRecord>(
    kind: "brand" | "salesperson",
    beforeRows: T[],
    afterRows: T[],
  ) => {
    const beforeById = new Map(beforeRows.map((item) => [item.id, item]));
    const afterById = new Map(afterRows.map((item) => [item.id, item]));
    for (const id of new Set([...beforeById.keys(), ...afterById.keys()])) {
      const previous = beforeById.get(id);
      const next = afterById.get(id);
      if (previous && next && same(previous, next)) continue;
      const previousValues = previous
        ? kind === "brand" ? brandValues(previous as BrandRecord, before) : salespersonValues(previous as CustomerSalespersonRecord, before)
        : {};
      const nextValues = next
        ? kind === "brand" ? brandValues(next as BrandRecord, after) : salespersonValues(next as CustomerSalespersonRecord, after)
        : {};
      const [beforeChanged, afterChanged] = previous && next
        ? changedValues(previousValues, nextValues)
        : [previousValues, nextValues];
      const entityType = kind === "brand" ? "Brand" : "CustomerSalesperson";
      const action = kind === "brand"
        ? previous ? next ? "修改品牌" : "删除品牌" : "新增品牌"
        : previous ? next ? "修改客户业务员" : "删除客户业务员" : "新增客户业务员";
      logs.push(createOperationLogDraft({
        actor,
        module: "基础设置",
        entityType,
        entityId: id,
        action,
        beforeData: previous ? masterData(kind, previous, before, beforeChanged) : null,
        afterData: next ? masterData(kind, next, after, afterChanged) : null,
        createdAt,
      }));
    }
  };
  collect("brand", before.brands, after.brands);
  collect("salesperson", before.customerSalespeople, after.customerSalespeople);
  return assignOperationMetadata(logs, operationId, createdAt);
}

function presetValues(preset: ManufacturingPreset): Values {
  return {
    "预设名称": preset.name,
    "制作国家": preset.country,
    "加工币种": preset.laborCurrency,
    "成本加成率": preset.markupRate,
    "包含运费": preset.includeFreight ? "是" : "否",
    "运费名称": preset.freightName,
    "运费金额": preset.freightAmount,
  };
}

function presetData(preset: ManufacturingPreset, values: Values): OperationLogData {
  return {
    objectType: "ManufacturingPreset",
    objectId: preset.id,
    objectName: preset.name,
    presetId: preset.id,
    presetName: preset.name,
    values,
  };
}

function globalValues(settings: GlobalQuoteSettings): Values {
  return {
    "默认 USD/CNY 汇率": settings.defaultUsdCnyRate,
    "默认成本加成率": settings.defaultMarkupRate,
    "默认加工币种": settings.defaultLaborCurrency,
    "默认其他费用名称": settings.defaultOtherCost?.name ?? null,
    "默认其他费用金额": settings.defaultOtherCost?.amount ?? null,
    "默认工序说明": settings.defaultLaborDescription,
  };
}

export function createGlobalQuoteSettingsOperationLogs(
  before: GlobalQuoteSettings,
  after: GlobalQuoteSettings,
  actor: OperationLogActor,
  createdAt = new Date().toISOString(),
  operationId = createOperationId(),
): OperationLogDraft[] {
  const logs: OperationLogDraft[] = [];
  const [beforeGlobal, afterGlobal] = changedValues(globalValues(before), globalValues(after));
  if (Object.keys(beforeGlobal).length) logs.push(createOperationLogDraft({
    actor,
    module: "系统设置",
    entityType: "QuoteSettings",
    entityId: "global-quote-settings",
    action: "修改报价设置",
    beforeData: { objectType: "QuoteSettings", objectId: "global-quote-settings", objectName: "报价设置", values: beforeGlobal },
    afterData: { objectType: "QuoteSettings", objectId: "global-quote-settings", objectName: "报价设置", values: afterGlobal },
    createdAt,
  }));

  if (before.defaultManufacturingPresetId !== after.defaultManufacturingPresetId) {
    const beforePreset = before.manufacturingPresets.find((item) => item.id === before.defaultManufacturingPresetId);
    const afterPreset = after.manufacturingPresets.find((item) => item.id === after.defaultManufacturingPresetId);
    logs.push(createOperationLogDraft({
      actor,
      module: "系统设置",
      entityType: "QuoteSettings",
      entityId: "global-quote-settings",
      action: "修改默认制作预设",
      beforeData: { objectType: "QuoteSettings", objectId: "global-quote-settings", objectName: "报价设置", presetId: beforePreset?.id, presetName: beforePreset?.name, values: { "默认制作预设 ID": beforePreset?.id ?? null, "默认制作预设": beforePreset?.name ?? null } },
      afterData: { objectType: "QuoteSettings", objectId: "global-quote-settings", objectName: "报价设置", presetId: afterPreset?.id, presetName: afterPreset?.name, values: { "默认制作预设 ID": afterPreset?.id ?? null, "默认制作预设": afterPreset?.name ?? null } },
      createdAt,
    }));
  }

  const beforeById = new Map(before.manufacturingPresets.map((item) => [item.id, item]));
  const afterById = new Map(after.manufacturingPresets.map((item) => [item.id, item]));
  for (const id of new Set([...beforeById.keys(), ...afterById.keys()])) {
    const previous = beforeById.get(id);
    const next = afterById.get(id);
    if (previous && next && same(previous, next)) continue;
    const previousValues = previous ? presetValues(previous) : {};
    const nextValues = next ? presetValues(next) : {};
    const [beforeChanged, afterChanged] = previous && next ? changedValues(previousValues, nextValues) : [previousValues, nextValues];
    logs.push(createOperationLogDraft({
      actor,
      module: "系统设置",
      entityType: "ManufacturingPreset",
      entityId: id,
      action: previous ? next ? "修改制作预设" : "删除制作预设" : "新增制作预设",
      beforeData: previous ? presetData(previous, beforeChanged) : null,
      afterData: next ? presetData(next, afterChanged) : null,
      createdAt,
    }));
  }
  return assignOperationMetadata(logs, operationId, createdAt);
}
