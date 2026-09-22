import { canonicalDecimal } from "../../../server/quotes/decimal-projection";

type UnknownRecord = Record<string, unknown>;
type CountKey = "brands" | "customerSalespeople" | "fabrics" | "trims" | "manufacturingPresets" | "brandDefaultTrims" | "salespersonDefaultTrims";

export type MasterSettingsMigrationSource = {
  basicSettings: {
    brands: UnknownRecord[];
    customerSalespeople: UnknownRecord[];
    fabricLibrary: UnknownRecord[];
    trimLibrary: UnknownRecord[];
    systemDefaults?: UnknownRecord;
  };
  globalQuoteSettings?: UnknownRecord | null;
};

export type ScopedIdentityCollision = {
  scope: "brand" | "salesperson" | "fabric" | "trim" | "manufacturingPreset" | "brandDefaultTrim" | "salespersonDefaultTrim";
  ownerId?: string;
  id: string;
  count: number;
};

export type MasterSettingsMigrationPreview = {
  sourceCounts: Record<CountKey, number>;
  projectedCounts: Record<CountKey, number>;
  projectedServerRows: Record<CountKey | "globalSettings" | "total", number>;
  duplicateNormalizedBrandNames: string[][];
  duplicateNormalizedSalespersonNames: string[][];
  duplicateFabricNameGroups: string[][];
  duplicateTrimNameGroups: string[][];
  duplicateStableIds: string[];
  scopedIdentityCollisions: ScopedIdentityCollision[];
  missingBrandReferences: Array<{ salespersonId: string; brandId: string }>;
  missingTrimReferences: Array<{ ownerType: "brand" | "salesperson"; ownerId: string; trimLibraryItemId: string }>;
  danglingManufacturingPresetDefault: string | null;
  inactiveManufacturingPresetDefault: string | null;
  discardedLegacyDefaultTrimQuantityCount: number;
  discardedLegacyDefaultTrimUsageCount: number;
  legacyMultipleDefaultCostCollapseCount: number;
  nullDecimalValuesPreserved: number;
  zeroDecimalValuesPreserved: number;
  canonicalDecimalValuesProjected: number;
  invalidNumericValues: string[];
  supplierMasterRows: 0;
  warnings: string[];
  blockingErrors: string[];
  projection: MasterSettingsMigrationSource;
};

const record = (value: unknown): UnknownRecord => value && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : {};
const list = (value: unknown): UnknownRecord[] => Array.isArray(value) ? value.map(record) : [];
const text = (value: unknown): string => typeof value === "string" ? value : "";
const normalized = (value: unknown): string => text(value).normalize("NFKC").trim().toLocaleLowerCase("zh-CN");
const clone = <T>(value: T): T => structuredClone(value);

function duplicateNameGroups(items: UnknownRecord[]): string[][] {
  const groups = new Map<string, string[]>();
  for (const item of items) {
    const key = normalized(item.name);
    if (!key) continue;
    groups.set(key, [...(groups.get(key) ?? []), text(item.id)]);
  }
  return [...groups.values()].filter((ids) => ids.length > 1);
}

function own(owner: UnknownRecord, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(owner, key);
}

function projectDecimal(value: unknown, path: string, output: MasterSettingsMigrationPreview): unknown {
  if (value === null || value === undefined) {
    output.nullDecimalValuesPreserved += 1;
    return null;
  }
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    output.invalidNumericValues.push(path);
    return clone(value);
  }
  const projected = canonicalDecimal(String(value));
  output.canonicalDecimalValuesProjected += 1;
  if (value === 0) output.zeroDecimalValuesPreserved += 1;
  return projected;
}

function projectDecimalFields(owner: UnknownRecord, fields: readonly string[], path: string, output: MasterSettingsMigrationPreview): UnknownRecord {
  const projected = clone(owner);
  for (const field of fields) projected[field] = projectDecimal(owner[field], `${path}.${field}`, output);
  return projected;
}

function legacyCosts(owner: UnknownRecord): UnknownRecord[] {
  if (Array.isArray(owner.costs)) return list(owner.costs);
  if (Array.isArray(owner.otherCosts)) return list(owner.otherCosts);
  if (typeof owner.otherCost === "number") return [{ name: "默认其他费用", amount: owner.otherCost }];
  if (owner.otherCost !== undefined) return [record(owner.otherCost)];
  return [];
}

function validLegacyCost(cost: UnknownRecord): boolean {
  if (cost.enabled === false) return false;
  const amount = cost.amount ?? cost.unitPrice;
  const amountValid = amount === null || amount === undefined || typeof amount === "number" && Number.isFinite(amount) && amount >= 0;
  return amountValid && Boolean(text(cost.name).trim() || typeof amount === "number");
}

function projectDefaultOtherCost(owner: UnknownRecord, path: string, output: MasterSettingsMigrationPreview): unknown {
  let value: unknown;
  if (own(owner, "defaultOtherCost")) value = owner.defaultOtherCost;
  else {
    const valid = legacyCosts(owner).filter(validLegacyCost);
    if (valid.length > 1) output.legacyMultipleDefaultCostCollapseCount += valid.length - 1;
    if (valid.length) output.warnings.push(`${path} legacy costs projected to the first enabled valid DefaultOtherCost under D-089`);
    value = valid[0] ? { name: text(valid[0].name).trim() || "默认其他费用", amount: valid[0].amount ?? valid[0].unitPrice ?? null } : null;
  }
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return { name: "默认其他费用", amount: projectDecimal(value, `${path}.defaultOtherCost.amount`, output) };
  const projected = record(clone(value));
  projected.amount = projectDecimal(projected.amount, `${path}.defaultOtherCost.amount`, output);
  return projected;
}

function inspectDefaults(owner: UnknownRecord, ownerType: "brand" | "salesperson", trimIds: Set<string>, output: MasterSettingsMigrationPreview): UnknownRecord {
  const defaults = record(owner.defaults);
  const trims = list(defaults.defaultTrims).map((trim, index) => {
    const trimId = text(trim.trimLibraryItemId);
    if (!trimIds.has(trimId)) output.missingTrimReferences.push({ ownerType, ownerId: text(owner.id), trimLibraryItemId: trimId });
    if (trim.quantity !== null && trim.quantity !== undefined) output.discardedLegacyDefaultTrimQuantityCount += 1;
    if (trim.usage !== null && trim.usage !== undefined) output.discardedLegacyDefaultTrimUsageCount += 1;
    return {
      id: trim.id,
      trimLibraryItemId: trimId,
      overrideLossRate: projectDecimal(trim.overrideLossRate, `${ownerType}.${text(owner.id)}.defaultTrims[${index}].overrideLossRate`, output),
      overrideUnitPrice: projectDecimal(trim.overrideUnitPrice, `${ownerType}.${text(owner.id)}.defaultTrims[${index}].overrideUnitPrice`, output),
    };
  });
  const projected = projectDecimalFields(defaults, ["defaultUsdCnyRate"], `${ownerType}.${text(owner.id)}`, output);
  return { ...projected, defaultTrims: trims, defaultOtherCost: projectDefaultOtherCost(defaults, `${ownerType}.${text(owner.id)}.defaults`, output) };
}

function collectCollisions(scope: ScopedIdentityCollision["scope"], items: UnknownRecord[], output: MasterSettingsMigrationPreview, ownerId?: string): void {
  const counts = new Map<string, number>();
  for (const item of items) {
    const id = text(item.id);
    if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  for (const [id, count] of counts) if (count > 1) output.scopedIdentityCollisions.push({ scope, ...(ownerId ? { ownerId } : {}), id, count });
}

function defaultTrimCount(items: UnknownRecord[]): number {
  return items.reduce((sum, item) => sum + list(record(item.defaults).defaultTrims).length, 0);
}

export function previewMasterSettingsMigration(source: MasterSettingsMigrationSource): MasterSettingsMigrationPreview {
  const brands = list(source.basicSettings.brands);
  const salespeople = list(source.basicSettings.customerSalespeople);
  const fabrics = list(source.basicSettings.fabricLibrary);
  const trims = list(source.basicSettings.trimLibrary);
  const global = record(source.globalQuoteSettings);
  const presets = list(global.manufacturingPresets);
  const sourceCounts = {
    brands: brands.length,
    customerSalespeople: salespeople.length,
    fabrics: fabrics.length,
    trims: trims.length,
    manufacturingPresets: presets.length,
    brandDefaultTrims: defaultTrimCount(brands),
    salespersonDefaultTrims: defaultTrimCount(salespeople),
  };
  const result: MasterSettingsMigrationPreview = {
    sourceCounts,
    projectedCounts: { ...sourceCounts },
    projectedServerRows: { ...sourceCounts, globalSettings: source.globalQuoteSettings ? 1 : 0, total: 0 },
    duplicateNormalizedBrandNames: duplicateNameGroups(brands),
    duplicateNormalizedSalespersonNames: duplicateNameGroups(salespeople),
    duplicateFabricNameGroups: duplicateNameGroups(fabrics),
    duplicateTrimNameGroups: duplicateNameGroups(trims),
    duplicateStableIds: [],
    scopedIdentityCollisions: [],
    missingBrandReferences: [],
    missingTrimReferences: [],
    danglingManufacturingPresetDefault: null,
    inactiveManufacturingPresetDefault: null,
    discardedLegacyDefaultTrimQuantityCount: 0,
    discardedLegacyDefaultTrimUsageCount: 0,
    legacyMultipleDefaultCostCollapseCount: 0,
    nullDecimalValuesPreserved: 0,
    zeroDecimalValuesPreserved: 0,
    canonicalDecimalValuesProjected: 0,
    invalidNumericValues: [],
    supplierMasterRows: 0,
    warnings: [],
    blockingErrors: [],
    projection: clone(source),
  };
  result.projectedServerRows.total = Object.entries(result.projectedServerRows)
    .filter(([key]) => key !== "total")
    .reduce((sum, [, count]) => sum + count, 0);

  for (const [scope, items] of [["brand", brands], ["salesperson", salespeople], ["fabric", fabrics], ["trim", trims], ["manufacturingPreset", presets]] as const) collectCollisions(scope, items, result);
  for (const brand of brands) collectCollisions("brandDefaultTrim", list(record(brand.defaults).defaultTrims), result, text(brand.id));
  for (const salesperson of salespeople) collectCollisions("salespersonDefaultTrim", list(record(salesperson.defaults).defaultTrims), result, text(salesperson.id));
  result.duplicateStableIds = result.scopedIdentityCollisions.map((collision) => `${collision.scope}${collision.ownerId ? `:${collision.ownerId}` : ""}:${collision.id}`);

  const brandIds = new Set(brands.map((item) => text(item.id)));
  const trimIds = new Set(trims.map((item) => text(item.id)));
  result.missingBrandReferences = salespeople.filter((item) => !brandIds.has(text(item.brandId))).map((item) => ({ salespersonId: text(item.id), brandId: text(item.brandId) }));
  const projectedBrands = brands.map((item) => ({ ...clone(item), defaults: inspectDefaults(item, "brand", trimIds, result) }));
  const projectedSalespeople = salespeople.map((item) => ({ ...clone(item), defaults: inspectDefaults(item, "salesperson", trimIds, result) }));
  const projectedFabrics = fabrics.map((item, index) => projectDecimalFields(item, ["netWidthCm", "gsm", "defaultLossRate", "unitPrice"], `fabric.${text(item.id) || index}`, result));
  const projectedTrims = trims.map((item, index) => projectDecimalFields(item, ["defaultLossRate", "unitPrice"], `trim.${text(item.id) || index}`, result));
  const projectedPresets = presets.map((item, index) => projectDecimalFields(item, ["markupRate", "freightAmount"], `manufacturingPreset.${text(item.id) || index}`, result));

  const systemDefaults = record(source.basicSettings.systemDefaults);
  const projectedSystemDefaults = projectDecimalFields(systemDefaults, ["usdCnyRate", "markupRate"], "systemDefaults", result);
  projectedSystemDefaults.defaultOtherCost = projectDefaultOtherCost(systemDefaults, "systemDefaults", result);
  const projectedGlobal = projectDecimalFields(global, ["defaultUsdCnyRate", "defaultMarkupRate"], "globalQuoteSettings", result);
  projectedGlobal.defaultOtherCost = projectDefaultOtherCost(global, "globalQuoteSettings", result);
  projectedGlobal.manufacturingPresets = projectedPresets;

  if (!source.globalQuoteSettings || !Array.isArray(global.manufacturingPresets)) result.warnings.push("Manufacturing preset configuration is absent");
  const defaultPresetId = global.defaultManufacturingPresetId;
  const referencedPreset = presets.find((preset) => preset.id === defaultPresetId);
  if (defaultPresetId !== null && defaultPresetId !== undefined && !referencedPreset) {
    result.danglingManufacturingPresetDefault = text(defaultPresetId);
    result.blockingErrors.push("defaultManufacturingPresetId does not reference a projected preset");
  }
  if (referencedPreset?.status === "inactive") {
    result.inactiveManufacturingPresetDefault = text(defaultPresetId);
    projectedGlobal.defaultManufacturingPresetId = null;
    result.warnings.push("Default manufacturing preset references an inactive preset and will be cleared under D-090");
  }
  if (result.duplicateFabricNameGroups.length) result.warnings.push("Duplicate Fabric names are preserved as distinct stable IDs");
  if (result.duplicateTrimNameGroups.length) result.warnings.push("Duplicate Trim names are preserved as distinct stable IDs");
  if (result.discardedLegacyDefaultTrimQuantityCount || result.discardedLegacyDefaultTrimUsageCount) result.warnings.push("Legacy DefaultTrim quantity/usage is intentionally discarded");
  result.warnings.push("Supplier values remain free strings; no Supplier master rows are projected");
  if (result.duplicateNormalizedBrandNames.length) result.blockingErrors.push("Duplicate normalized Brand names");
  if (result.duplicateNormalizedSalespersonNames.length) result.blockingErrors.push("Duplicate normalized CustomerSalesperson names");
  if (result.scopedIdentityCollisions.length) result.blockingErrors.push("Duplicate scoped stable IDs");
  if (result.missingBrandReferences.length) result.blockingErrors.push("CustomerSalesperson has a missing Brand reference");
  if (result.missingTrimReferences.length) result.blockingErrors.push("DefaultTrimConfig has a missing Trim reference");
  if (result.invalidNumericValues.length) result.blockingErrors.push("Invalid decimal values");
  result.projection = {
    basicSettings: {
      ...clone(source.basicSettings),
      brands: projectedBrands,
      customerSalespeople: projectedSalespeople,
      fabricLibrary: projectedFabrics,
      trimLibrary: projectedTrims,
      systemDefaults: projectedSystemDefaults,
    },
    globalQuoteSettings: source.globalQuoteSettings ? projectedGlobal : source.globalQuoteSettings,
  };
  return result;
}
