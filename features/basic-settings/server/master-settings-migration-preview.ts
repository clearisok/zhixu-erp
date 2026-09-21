type UnknownRecord = Record<string, unknown>;

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

export type MasterSettingsMigrationPreview = {
  sourceCounts: Record<"brands"|"customerSalespeople"|"fabrics"|"trims"|"manufacturingPresets",number>;
  projectedCounts: Record<"brands"|"customerSalespeople"|"fabrics"|"trims"|"manufacturingPresets",number>;
  duplicateNormalizedBrandNames: string[][];
  duplicateNormalizedSalespersonNames: string[][];
  duplicateStableIds: string[];
  missingBrandReferences: Array<{ salespersonId: string; brandId: string }>;
  missingTrimReferences: Array<{ ownerType: "brand"|"salesperson"; ownerId: string; trimLibraryItemId: string }>;
  discardedLegacyDefaultTrimQuantityCount: number;
  legacyMultipleDefaultCostCollapseCount: number;
  invalidNumericValues: string[];
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
  const groups = new Map<string,string[]>();
  for (const item of items) {
    const key = normalized(item.name);
    if (!key) continue;
    groups.set(key,[...(groups.get(key)??[]),text(item.id)]);
  }
  return [...groups.values()].filter((ids)=>ids.length>1);
}

function invalidNumbers(value: unknown, path: string, output: string[]): void {
  if (value === null || value === undefined) return;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) output.push(path);
}

function projectDefaultOtherCost(owner: UnknownRecord, path: string, output: MasterSettingsMigrationPreview): unknown {
  if (owner.defaultOtherCost !== undefined) return clone(owner.defaultOtherCost);
  const legacy = Array.isArray(owner.costs) ? owner.costs.map(record) : [];
  const valid = legacy.filter((cost) => cost.enabled !== false && (text(cost.name).trim() || cost.amount === 0 || typeof cost.amount === "number" && Number.isFinite(cost.amount)));
  if (valid.length > 1) output.legacyMultipleDefaultCostCollapseCount += valid.length - 1;
  if (valid.length) output.warnings.push(`${path}.costs projected to the first enabled valid DefaultOtherCost under D-089`);
  return valid[0] ? { name: text(valid[0].name).trim() || "默认其他费用", amount: valid[0].amount ?? null } : null;
}

function inspectDefaults(owner: UnknownRecord, ownerType: "brand"|"salesperson", trimIds: Set<string>, output: MasterSettingsMigrationPreview): UnknownRecord {
  const defaults = record(owner.defaults);
  const trims = list(defaults.defaultTrims).map((trim,index) => {
    const trimId = text(trim.trimLibraryItemId);
    if (!trimIds.has(trimId)) output.missingTrimReferences.push({ ownerType, ownerId:text(owner.id), trimLibraryItemId:trimId });
    if (trim.quantity !== null && trim.quantity !== undefined) output.discardedLegacyDefaultTrimQuantityCount += 1;
    invalidNumbers(trim.overrideLossRate,`${ownerType}.${text(owner.id)}.defaultTrims[${index}].overrideLossRate`,output.invalidNumericValues);
    invalidNumbers(trim.overrideUnitPrice,`${ownerType}.${text(owner.id)}.defaultTrims[${index}].overrideUnitPrice`,output.invalidNumericValues);
    return { id:trim.id, trimLibraryItemId:trimId, overrideLossRate:trim.overrideLossRate??null, overrideUnitPrice:trim.overrideUnitPrice??null };
  });
  invalidNumbers(defaults.defaultUsdCnyRate,`${ownerType}.${text(owner.id)}.defaultUsdCnyRate`,output.invalidNumericValues);
  const defaultOtherCost=projectDefaultOtherCost(defaults,`${ownerType}.${text(owner.id)}.defaults`,output);
  invalidNumbers(record(defaultOtherCost).amount,`${ownerType}.${text(owner.id)}.defaultOtherCost.amount`,output.invalidNumericValues);
  return {...clone(defaults),defaultTrims:trims,defaultOtherCost};
}

export function previewMasterSettingsMigration(source: MasterSettingsMigrationSource): MasterSettingsMigrationPreview {
  const brands=list(source.basicSettings.brands);
  const salespeople=list(source.basicSettings.customerSalespeople);
  const fabrics=list(source.basicSettings.fabricLibrary);
  const trims=list(source.basicSettings.trimLibrary);
  const global=record(source.globalQuoteSettings);
  const presets=list(global.manufacturingPresets);
  const result:MasterSettingsMigrationPreview={
    sourceCounts:{brands:brands.length,customerSalespeople:salespeople.length,fabrics:fabrics.length,trims:trims.length,manufacturingPresets:presets.length},
    projectedCounts:{brands:brands.length,customerSalespeople:salespeople.length,fabrics:fabrics.length,trims:trims.length,manufacturingPresets:presets.length},
    duplicateNormalizedBrandNames:duplicateNameGroups(brands),duplicateNormalizedSalespersonNames:duplicateNameGroups(salespeople),duplicateStableIds:[],missingBrandReferences:[],missingTrimReferences:[],discardedLegacyDefaultTrimQuantityCount:0,legacyMultipleDefaultCostCollapseCount:0,invalidNumericValues:[],warnings:[],blockingErrors:[],projection:clone(source),
  };
  for(const [kind,items] of [["brand",brands],["salesperson",salespeople],["fabric",fabrics],["trim",trims],["manufacturingPreset",presets]] as const){
    const idCounts=new Map<string,number>();
    for(const item of items){const id=text(item.id);if(id)idCounts.set(id,(idCounts.get(id)??0)+1);}
    result.duplicateStableIds.push(...[...idCounts].filter(([,count])=>count>1).map(([id])=>`${kind}:${id}`));
  }
  const brandIds=new Set(brands.map((item)=>text(item.id)));
  const trimIds=new Set(trims.map((item)=>text(item.id)));
  result.missingBrandReferences=salespeople.filter((item)=>!brandIds.has(text(item.brandId))).map((item)=>({salespersonId:text(item.id),brandId:text(item.brandId)}));
  const projectedBrands=brands.map((item)=>({...clone(item),defaults:inspectDefaults(item,"brand",trimIds,result)}));
  const projectedSalespeople=salespeople.map((item)=>({...clone(item),defaults:inspectDefaults(item,"salesperson",trimIds,result)}));
  for(const [index,item] of fabrics.entries())for(const key of ["netWidthCm","gsm","defaultLossRate","unitPrice"])invalidNumbers(item[key],`fabric.${text(item.id)||index}.${key}`,result.invalidNumericValues);
  for(const [index,item] of trims.entries())for(const key of ["defaultLossRate","unitPrice"])invalidNumbers(item[key],`trim.${text(item.id)||index}.${key}`,result.invalidNumericValues);
  for(const [index,item] of presets.entries())for(const key of ["markupRate","freightAmount"])invalidNumbers(item[key],`manufacturingPreset.${text(item.id)||index}.${key}`,result.invalidNumericValues);
  const systemDefaults=record(source.basicSettings.systemDefaults);
  const projectedGlobal={...clone(global),defaultOtherCost:projectDefaultOtherCost(global,"globalQuoteSettings",result)};
  const projectedSystemDefaults={...clone(systemDefaults),defaultOtherCost:projectDefaultOtherCost(systemDefaults,"systemDefaults",result)};
  for(const key of ["usdCnyRate","markupRate"])invalidNumbers(systemDefaults[key],`systemDefaults.${key}`,result.invalidNumericValues);
  for(const key of ["defaultUsdCnyRate","defaultMarkupRate"])invalidNumbers(global[key],`globalQuoteSettings.${key}`,result.invalidNumericValues);
  invalidNumbers(record(projectedGlobal.defaultOtherCost).amount,"globalQuoteSettings.defaultOtherCost.amount",result.invalidNumericValues);
  invalidNumbers(record(projectedSystemDefaults.defaultOtherCost).amount,"systemDefaults.defaultOtherCost.amount",result.invalidNumericValues);
  if(!source.globalQuoteSettings||!Array.isArray(global.manufacturingPresets))result.warnings.push("Manufacturing preset configuration is absent");
  const defaultPresetId=global.defaultManufacturingPresetId;
  if(defaultPresetId!==null&&defaultPresetId!==undefined&&!presets.some((preset)=>preset.id===defaultPresetId))result.blockingErrors.push("defaultManufacturingPresetId does not reference a projected preset");
  if(result.duplicateNormalizedBrandNames.length)result.blockingErrors.push("Duplicate normalized Brand names");
  if(result.duplicateNormalizedSalespersonNames.length)result.blockingErrors.push("Duplicate normalized CustomerSalesperson names");
  if(result.duplicateStableIds.length)result.blockingErrors.push("Duplicate stable IDs");
  if(result.missingBrandReferences.length)result.blockingErrors.push("CustomerSalesperson has a missing Brand reference");
  if(result.missingTrimReferences.length)result.blockingErrors.push("DefaultTrimConfig has a missing Trim reference");
  if(result.invalidNumericValues.length)result.blockingErrors.push("Invalid numeric values");
  result.projection={basicSettings:{...clone(source.basicSettings),brands:projectedBrands,customerSalespeople:projectedSalespeople,fabricLibrary:clone(fabrics),trimLibrary:clone(trims),systemDefaults:projectedSystemDefaults},globalQuoteSettings:projectedGlobal};
  return result;
}
