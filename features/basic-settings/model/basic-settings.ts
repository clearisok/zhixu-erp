import {
  createCostLineGroupId,
  type FabricCostLine,
  type FabricPurchaseUnit,
  type LaborCurrency,
  type NullableNumber,
  type OtherCostLine,
  type QuoteRevision,
  type TrimCostLine,
} from "../../quote-center/model/quote-view-model.ts";

export type RecordStatus = "active" | "inactive";

export type DefaultOtherCost = {
  name: string;
  amount: NullableNumber;
};

export type FabricLibraryItem = {
  id: string;
  name: string;
  composition: string;
  netWidthCm: NullableNumber;
  gsm: NullableNumber;
  defaultLossRate: NullableNumber;
  supplier: string;
  unitPrice: NullableNumber;
  purchaseUnit: FabricPurchaseUnit;
  createdAt: string;
  updatedAt: string;
};

export type TrimLibraryItem = {
  id: string;
  name: string;
  specification: string;
  supplier: string;
  unit: string;
  defaultLossRate: NullableNumber;
  unitPrice: NullableNumber;
  createdAt: string;
  updatedAt: string;
};

export type DefaultTrimConfig = {
  id: string;
  trimLibraryItemId: string;
  quantity: NullableNumber;
  overrideLossRate: NullableNumber;
  overrideUnitPrice: NullableNumber;
};

export type DefaultQuoteConfiguration = {
  defaultUsdCnyRate: NullableNumber;
  defaultTrims: DefaultTrimConfig[];
  defaultOtherCost: DefaultOtherCost | null;
};

export type BrandRecord = {
  id: string;
  name: string;
  status: RecordStatus;
  defaults: DefaultQuoteConfiguration;
};

export type CustomerSalespersonRecord = {
  id: string;
  name: string;
  brandId: string;
  status: RecordStatus;
  defaults: DefaultQuoteConfiguration;
};

export type BrandAliasRecord = {
  id: string;
  brandId: string;
  alias: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type BrandPurchasedTrimCostRule = {
  id: string;
  brandId: string;
  unitCost: number;
  currency: LaborCurrency;
  effectiveFrom: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type BasicSettingsState = {
  systemDefaults: {
    usdCnyRate: NullableNumber;
    markupRate: NullableNumber;
    laborCurrency: LaborCurrency;
    defaultOtherCost: DefaultOtherCost | null;
  };
  brands: BrandRecord[];
  customerSalespeople: CustomerSalespersonRecord[];
  fabricLibrary: FabricLibraryItem[];
  trimLibrary: TrimLibraryItem[];
  brandAliases: BrandAliasRecord[];
  purchasedTrimCostRules: BrandPurchasedTrimCostRule[];
};

const FIXTURE_TIME = "2026-08-17T00:00:00.000Z";

const trimItem = (
  id: string,
  name: string,
  specification: string,
  supplier: string,
  unit: string,
  defaultLossRate: number,
  unitPrice: number,
): TrimLibraryItem => ({ id, name, specification, supplier, unit, defaultLossRate, unitPrice, createdAt: FIXTURE_TIME, updatedAt: FIXTURE_TIME });

const defaultTrim = (id: string, trimLibraryItemId: string, overrides: Partial<Pick<DefaultTrimConfig, "quantity" | "overrideLossRate" | "overrideUnitPrice">> = {}): DefaultTrimConfig => ({
  id,
  trimLibraryItemId,
  quantity: overrides.quantity ?? null,
  overrideLossRate: overrides.overrideLossRate ?? null,
  overrideUnitPrice: overrides.overrideUnitPrice ?? null,
});

const otherCost = (name: string, amount: number): DefaultOtherCost => ({ name, amount });

export const defaultBasicSettings: BasicSettingsState = {
  systemDefaults: { usdCnyRate: 7.12, markupRate: 8, laborCurrency: "CNY", defaultOtherCost: null },
  fabricLibrary: [
    { id: "fabric-combed-cotton-a", name: "精梳棉 40S", composition: "100% Cotton", netWidthCm: 145, gsm: 180, defaultLossRate: 3, supplier: "XX纺织", unitPrice: 23.5, purchaseUnit: "kg", createdAt: FIXTURE_TIME, updatedAt: FIXTURE_TIME },
    { id: "fabric-combed-cotton-b", name: "精梳棉 40S", composition: "100% Cotton", netWidthCm: 148, gsm: 180, defaultLossRate: 4, supplier: "华东针织", unitPrice: 24.2, purchaseUnit: "kg", createdAt: FIXTURE_TIME, updatedAt: FIXTURE_TIME },
    { id: "fabric-rib", name: "1×1 罗纹", composition: "95% Cotton 5% Spandex", netWidthCm: 120, gsm: 260, defaultLossRate: 5, supplier: "苏州针织", unitPrice: 46.5, purchaseUnit: "kg", createdAt: FIXTURE_TIME, updatedAt: FIXTURE_TIME },
  ],
  trimLibrary: [
    trimItem("trim-main-label", "主唛", "缎面印字", "织序辅料", "枚", 2, 0.28),
    trimItem("trim-main-label-alt", "主唛", "织唛", "ABC辅料", "枚", 3, 0.31),
    trimItem("trim-care-label", "洗标", "尼龙带印字", "织序辅料", "枚", 2, 0.16),
    trimItem("trim-hangtag", "吊牌", "350g 双面四色", "品牌包装", "套", 1, 0.35),
    trimItem("trim-zip-bag", "透明自封袋", "28×38cm", "苏州包装", "个", 1, 0.34),
    trimItem("trim-button-18l", "18L 四眼扣", "18L", "ABC辅料", "粒", 2, 0.18),
  ],
  brands: [
    { id: "zara", name: "ZARA", status: "active", defaults: { defaultUsdCnyRate: 7.1, defaultTrims: [defaultTrim("zara-main", "trim-main-label"), defaultTrim("zara-hangtag", "trim-hangtag", { overrideUnitPrice: 0.38 })], defaultOtherCost: otherCost("包装杂费", 1.25) } },
    { id: "zara-man", name: "ZARA MAN", status: "active", defaults: { defaultUsdCnyRate: 7.1, defaultTrims: [], defaultOtherCost: null } },
    { id: "massimo-dutti", name: "Massimo Dutti", status: "active", defaults: { defaultUsdCnyRate: 7.08, defaultTrims: [defaultTrim("md-button", "trim-button-18l")], defaultOtherCost: otherCost("包装费", 0.8) } },
    { id: "bershka", name: "Bershka", status: "active", defaults: { defaultUsdCnyRate: null, defaultTrims: [], defaultOtherCost: null } },
    { id: "pull-bear", name: "Pull&Bear", status: "active", defaults: { defaultUsdCnyRate: null, defaultTrims: [], defaultOtherCost: null } },
  ],
  customerSalespeople: [
    { id: "sales-linqinghe", name: "林青禾", brandId: "zara", status: "active", defaults: { defaultUsdCnyRate: 7.12, defaultTrims: [defaultTrim("lqh-bag", "trim-zip-bag")], defaultOtherCost: otherCost("测试费", 1.5) } },
    { id: "sales-zhouyan", name: "周妍", brandId: "zara", status: "active", defaults: { defaultUsdCnyRate: null, defaultTrims: [], defaultOtherCost: null } },
    { id: "sales-chenxi", name: "陈曦", brandId: "massimo-dutti", status: "active", defaults: { defaultUsdCnyRate: null, defaultTrims: [], defaultOtherCost: otherCost("质检分摊", 0.35) } },
    { id: "sales-sunyu", name: "孙宇", brandId: "bershka", status: "active", defaults: { defaultUsdCnyRate: 7.09, defaultTrims: [], defaultOtherCost: null } },
  ],
  brandAliases: [
    { id: "alias-oysho", brandId: "brand-oysho", alias: "OYSHO", enabled: true, createdAt: FIXTURE_TIME, updatedAt: FIXTURE_TIME },
    { id: "alias-oysho-export", brandId: "brand-oysho", alias: "OYSHO-外销", enabled: true, createdAt: FIXTURE_TIME, updatedAt: FIXTURE_TIME },
    { id: "alias-ms", brandId: "brand-ms", alias: "M&S", enabled: true, createdAt: FIXTURE_TIME, updatedAt: FIXTURE_TIME },
  ],
  purchasedTrimCostRules: [
    { id: "purchased-trim-ms-20260801", brandId: "brand-ms", unitCost: 0.28, currency: "USD", effectiveFrom: "2026-08-01", enabled: true, createdAt: FIXTURE_TIME, updatedAt: FIXTURE_TIME },
    { id: "purchased-trim-oysho-20260801", brandId: "brand-oysho", unitCost: 0.10, currency: "USD", effectiveFrom: "2026-08-01", enabled: true, createdAt: FIXTURE_TIME, updatedAt: FIXTURE_TIME },
  ],
};

function validNumber(value: unknown): NullableNumber {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function isoText(value: unknown): string {
  return text(value) || FIXTURE_TIME;
}

function normalizeOtherCost(value: unknown, fallbackName = "默认其他费用"): DefaultOtherCost | null {
  if (typeof value === "number" && Number.isFinite(value)) return { name: fallbackName, amount: value };
  const item = record(value);
  const amount = validNumber(item.amount ?? item.unitPrice);
  const name = text(item.name).trim();
  if (!name && amount === null) return null;
  return { name: name || fallbackName, amount };
}

export function normalizeUniqueName(value: string): string {
  return value.normalize("NFKC").trim().toLocaleLowerCase("zh-CN");
}

export function validateBrandName(state: BasicSettingsState, name: string, currentId = ""): string | null {
  const normalized = normalizeUniqueName(name);
  if (!normalized) return "请填写品牌名称";
  return state.brands.some((item) => item.id !== currentId && normalizeUniqueName(item.name) === normalized)
    ? `品牌名称“${name.trim()}”已存在`
    : null;
}

export function validateCustomerSalespersonName(state: BasicSettingsState, name: string, currentId = ""): string | null {
  const normalized = normalizeUniqueName(name);
  if (!normalized) return "请填写客户业务员姓名";
  return state.customerSalespeople.some((item) => item.id !== currentId && normalizeUniqueName(item.name) === normalized)
    ? `客户业务员姓名“${name.trim()}”已存在`
    : null;
}

function normalizeFabric(value: unknown): FabricLibraryItem | null {
  const item = record(value);
  const id = text(item.id);
  const name = text(item.name).trim();
  if (!id || !name) return null;
  return {
    id,
    name,
    composition: text(item.composition),
    netWidthCm: validNumber(item.netWidthCm),
    gsm: validNumber(item.gsm),
    defaultLossRate: validNumber(item.defaultLossRate ?? item.lossRate),
    supplier: text(item.supplier),
    unitPrice: validNumber(item.unitPrice),
    purchaseUnit: item.purchaseUnit === "meter" ? "meter" : "kg",
    createdAt: isoText(item.createdAt),
    updatedAt: isoText(item.updatedAt ?? item.createdAt),
  };
}

function normalizeTrim(value: unknown): TrimLibraryItem | null {
  const item = record(value);
  const id = text(item.id);
  const name = text(item.name).trim();
  if (!id || !name) return null;
  return {
    id,
    name,
    specification: text(item.specification),
    supplier: text(item.supplier),
    unit: text(item.unit) || "件",
    defaultLossRate: validNumber(item.defaultLossRate ?? item.lossRate),
    unitPrice: validNumber(item.unitPrice),
    createdAt: isoText(item.createdAt),
    updatedAt: isoText(item.updatedAt ?? item.createdAt),
  };
}

function normalizeDefaultTrim(value: unknown): DefaultTrimConfig | null {
  const item = record(value);
  const id = text(item.id);
  const trimLibraryItemId = text(item.trimLibraryItemId);
  if (!id || !trimLibraryItemId) return null;
  return { id, trimLibraryItemId, quantity: validNumber(item.quantity ?? item.usage), overrideLossRate: validNumber(item.overrideLossRate), overrideUnitPrice: validNumber(item.overrideUnitPrice) };
}

function uniqueByNormalizedName<T extends { id: string; name: string }>(items: T[]): T[] {
  const names = new Set<string>();
  return items.filter((item) => {
    const normalized = normalizeUniqueName(item.name);
    if (!normalized || names.has(normalized)) return false;
    names.add(normalized);
    return true;
  });
}

export function normalizeBasicSettings(value: Partial<BasicSettingsState> | null | undefined): BasicSettingsState {
  if (!value) return structuredClone(defaultBasicSettings);
  const source = record(value);
  const explicitTrims = Array.isArray(source.trimLibrary) ? source.trimLibrary.map(normalizeTrim).filter((item): item is TrimLibraryItem => item !== null) : [];
  const trimLibrary = Array.isArray(source.trimLibrary) ? [...explicitTrims] : structuredClone(defaultBasicSettings.trimLibrary);

  const normalizeDefaults = (rawValue: unknown, prefix: string): DefaultQuoteConfiguration => {
    const raw = record(rawValue);
    const configs = Array.isArray(raw.defaultTrims) ? raw.defaultTrims.map(normalizeDefaultTrim).filter((item): item is DefaultTrimConfig => item !== null) : [];
    if (!configs.length && Array.isArray(raw.trims)) {
      raw.trims.forEach((legacyValue, index) => {
        const legacy = record(legacyValue);
        const name = text(legacy.name).trim();
        if (!name) return;
        const libraryItem: TrimLibraryItem = {
          id: `${prefix}-legacy-trim-${index + 1}`,
          name,
          specification: text(legacy.specification),
          supplier: text(legacy.supplier),
          unit: text(legacy.unit) || "件",
          defaultLossRate: validNumber(legacy.lossRate),
          unitPrice: validNumber(legacy.unitPrice),
          createdAt: FIXTURE_TIME,
          updatedAt: FIXTURE_TIME,
        };
        trimLibrary.push(libraryItem);
        configs.push(defaultTrim(`${prefix}-default-trim-${index + 1}`, libraryItem.id));
      });
    }
    const legacyOtherCosts = Array.isArray(raw.otherCosts) ? raw.otherCosts : [];
    return {
      defaultUsdCnyRate: validNumber(raw.defaultUsdCnyRate ?? raw.usdCnyRate),
      defaultTrims: configs.filter((config) => trimLibrary.some((item) => item.id === config.trimLibraryItemId)),
      defaultOtherCost: normalizeOtherCost(raw.defaultOtherCost ?? legacyOtherCosts[0]),
    };
  };

  const brands = Array.isArray(source.brands) ? source.brands.map((value, index) => {
    const item = record(value);
    return { id: text(item.id), name: text(item.name).trim(), status: item.status === "inactive" ? "inactive" as const : "active" as const, defaults: normalizeDefaults(item.defaults, text(item.id) || `brand-${index + 1}`) };
  }).filter((item) => item.id && item.name) : structuredClone(defaultBasicSettings.brands);
  const uniqueBrands = uniqueByNormalizedName(brands);
  const ensureBrand = (id: string, name: string) => {
    const existing = uniqueBrands.find((item) => normalizeUniqueName(item.name) === normalizeUniqueName(name));
    if (existing) return existing;
    const created = { id, name, status: "active" as const, defaults: { defaultUsdCnyRate: null, defaultTrims: [], defaultOtherCost: null } };
    uniqueBrands.push(created);
    return created;
  };
  const msBrand = ensureBrand("brand-ms", "M&S");
  const oyshoBrand = ensureBrand("brand-oysho", "OYSHO");
  const brandIds = new Set(uniqueBrands.map((brand) => brand.id));
  const customerSalespeople = Array.isArray(source.customerSalespeople) ? source.customerSalespeople.map((value, index) => {
    const item = record(value);
    return { id: text(item.id), name: text(item.name).trim(), brandId: text(item.brandId), status: item.status === "inactive" ? "inactive" as const : "active" as const, defaults: normalizeDefaults(item.defaults, text(item.id) || `sales-${index + 1}`) };
  }).filter((item) => item.id && item.name && brandIds.has(item.brandId)) : structuredClone(defaultBasicSettings.customerSalespeople);
  const systemDefaults = record(source.systemDefaults);
  const fabricLibrary = Array.isArray(source.fabricLibrary) ? source.fabricLibrary.map(normalizeFabric).filter((item): item is FabricLibraryItem => item !== null) : structuredClone(defaultBasicSettings.fabricLibrary);
  const defaultAliases: BrandAliasRecord[] = [
    { id: "alias-ms", brandId: msBrand.id, alias: "M&S", enabled: true, createdAt: FIXTURE_TIME, updatedAt: FIXTURE_TIME },
    { id: "alias-oysho", brandId: oyshoBrand.id, alias: "OYSHO", enabled: true, createdAt: FIXTURE_TIME, updatedAt: FIXTURE_TIME },
    { id: "alias-oysho-export", brandId: oyshoBrand.id, alias: "OYSHO-外销", enabled: true, createdAt: FIXTURE_TIME, updatedAt: FIXTURE_TIME },
  ];
  const brandAliases = (Array.isArray(source.brandAliases) ? source.brandAliases : defaultAliases).flatMap((value) => {
    const item = record(value); const id = text(item.id).trim(); const brandId = text(item.brandId).trim(); const alias = text(item.alias).trim();
    return id && brandId && alias && uniqueBrands.some((brand) => brand.id === brandId) ? [{ id, brandId, alias, enabled: item.enabled !== false, createdAt: isoText(item.createdAt), updatedAt: isoText(item.updatedAt ?? item.createdAt) }] : [];
  });
  const defaultRules: BrandPurchasedTrimCostRule[] = [
    { id: "purchased-trim-ms-20260801", brandId: msBrand.id, unitCost: 0.28, currency: "USD", effectiveFrom: "2026-08-01", enabled: true, createdAt: FIXTURE_TIME, updatedAt: FIXTURE_TIME },
    { id: "purchased-trim-oysho-20260801", brandId: oyshoBrand.id, unitCost: 0.10, currency: "USD", effectiveFrom: "2026-08-01", enabled: true, createdAt: FIXTURE_TIME, updatedAt: FIXTURE_TIME },
  ];
  const purchasedTrimCostRules = (Array.isArray(source.purchasedTrimCostRules) ? source.purchasedTrimCostRules : defaultRules).flatMap((value) => {
    const item = record(value); const id = text(item.id).trim(); const brandId = text(item.brandId).trim(); const unitCost = validNumber(item.unitCost); const effectiveFrom = text(item.effectiveFrom);
    return id && brandId && unitCost !== null && unitCost >= 0 && /^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom) && uniqueBrands.some((brand) => brand.id === brandId)
      ? [{ id, brandId, unitCost, currency: item.currency === "CNY" ? "CNY" as const : "USD" as const, effectiveFrom, enabled: item.enabled !== false, createdAt: isoText(item.createdAt), updatedAt: isoText(item.updatedAt ?? item.createdAt) }]
      : [];
  });

  return {
    systemDefaults: {
      usdCnyRate: validNumber(systemDefaults.usdCnyRate ?? defaultBasicSettings.systemDefaults.usdCnyRate),
      markupRate: validNumber(systemDefaults.markupRate ?? defaultBasicSettings.systemDefaults.markupRate),
      laborCurrency: systemDefaults.laborCurrency === "USD" ? "USD" : "CNY",
      defaultOtherCost: normalizeOtherCost(systemDefaults.defaultOtherCost ?? systemDefaults.otherCost),
    },
    brands: uniqueBrands,
    customerSalespeople: uniqueByNormalizedName(customerSalespeople),
    fabricLibrary,
    trimLibrary,
    brandAliases,
    purchasedTrimCostRules,
  };
}

export function resolveBrandByAlias(state: BasicSettingsState, value: string): BrandRecord | null {
  const normalized = normalizeUniqueName(value);
  const direct = state.brands.find((brand) => normalizeUniqueName(brand.name) === normalized);
  if (direct) return direct;
  const alias = state.brandAliases.find((item) => item.enabled && normalizeUniqueName(item.alias) === normalized);
  return state.brands.find((brand) => brand.id === alias?.brandId) ?? null;
}

export function resolvePurchasedTrimCostRule(state: BasicSettingsState, brandId: string | null, effectiveDate: string): BrandPurchasedTrimCostRule | null {
  if (!brandId) return null;
  return state.purchasedTrimCostRules
    .filter((item) => item.enabled && item.brandId === brandId && item.effectiveFrom <= effectiveDate)
    .sort((left, right) => right.effectiveFrom.localeCompare(left.effectiveFrom))[0] ?? null;
}

export function searchBrands(items: BrandRecord[], query: string): BrandRecord[] {
  const token = normalizeUniqueName(query);
  return token ? items.filter((item) => normalizeUniqueName(item.name).includes(token)) : items;
}

export function searchCustomerSalespeople(items: CustomerSalespersonRecord[], brands: BrandRecord[], query: string): CustomerSalespersonRecord[] {
  const token = normalizeUniqueName(query);
  if (!token) return items;
  const brandNames = new Map(brands.map((brand) => [brand.id, brand.name]));
  return items.filter((item) => normalizeUniqueName(`${item.name} ${brandNames.get(item.brandId) ?? ""}`).includes(token));
}

export function searchFabricLibrary(items: FabricLibraryItem[], query: string): FabricLibraryItem[] {
  const token = normalizeUniqueName(query);
  return token ? items.filter((item) => normalizeUniqueName(`${item.name} ${item.composition} ${item.supplier}`).includes(token)) : items;
}

export function searchTrimLibrary(items: TrimLibraryItem[], query: string): TrimLibraryItem[] {
  const token = normalizeUniqueName(query);
  return token ? items.filter((item) => normalizeUniqueName(`${item.name} ${item.specification} ${item.supplier}`).includes(token)) : items;
}

export function findFabricByName(items: FabricLibraryItem[], name: string): FabricLibraryItem | undefined {
  const normalized = normalizeUniqueName(name);
  return items.find((item) => normalizeUniqueName(item.name) === normalized);
}

export function findTrimByName(items: TrimLibraryItem[], name: string): TrimLibraryItem | undefined {
  const normalized = normalizeUniqueName(name);
  return items.find((item) => normalizeUniqueName(item.name) === normalized);
}

export function supplierSuggestions(state: BasicSettingsState, query = ""): string[] {
  const token = normalizeUniqueName(query);
  const seen = new Set<string>();
  return [...state.fabricLibrary, ...state.trimLibrary].flatMap((item) => {
    const supplier = item.supplier.trim();
    const normalized = normalizeUniqueName(supplier);
    if (!supplier || seen.has(normalized) || (token && !normalized.includes(token))) return [];
    seen.add(normalized);
    return [supplier];
  });
}

export function upsertBrand(state: BasicSettingsState, brand: BrandRecord): BasicSettingsState {
  if (validateBrandName(state, brand.name, brand.id)) return state;
  const normalized = { ...brand, name: brand.name.trim() };
  const exists = state.brands.some((item) => item.id === brand.id);
  return { ...state, brands: exists ? state.brands.map((item) => item.id === brand.id ? normalized : item) : [...state.brands, normalized] };
}

export function deleteBrand(state: BasicSettingsState, brandId: string): BasicSettingsState {
  return { ...state, brands: state.brands.filter((item) => item.id !== brandId), customerSalespeople: state.customerSalespeople.filter((item) => item.brandId !== brandId) };
}

export function upsertCustomerSalesperson(state: BasicSettingsState, item: CustomerSalespersonRecord): BasicSettingsState {
  if (validateCustomerSalespersonName(state, item.name, item.id)) return state;
  const normalized = { ...item, name: item.name.trim() };
  const exists = state.customerSalespeople.some((recordItem) => recordItem.id === item.id);
  return { ...state, customerSalespeople: exists ? state.customerSalespeople.map((recordItem) => recordItem.id === item.id ? normalized : recordItem) : [...state.customerSalespeople, normalized] };
}

export function deleteCustomerSalesperson(state: BasicSettingsState, id: string): BasicSettingsState {
  return { ...state, customerSalespeople: state.customerSalespeople.filter((item) => item.id !== id) };
}

export function copyCustomerSalesperson(state: BasicSettingsState, sourceId: string, id: string): BasicSettingsState {
  const source = state.customerSalespeople.find((item) => item.id === sourceId);
  if (!source) return state;
  let suffix = 2;
  let name = `${source.name} 副本`;
  while (validateCustomerSalespersonName(state, name)) name = `${source.name} 副本 ${suffix++}`;
  return { ...state, customerSalespeople: [...state.customerSalespeople, { ...structuredClone(source), id, name }] };
}

export function upsertFabricLibraryItem(state: BasicSettingsState, item: FabricLibraryItem, now = new Date().toISOString()): BasicSettingsState {
  const existing = state.fabricLibrary.find((recordItem) => recordItem.id === item.id);
  const normalized = { ...item, name: item.name.trim(), createdAt: existing?.createdAt || item.createdAt || now, updatedAt: now };
  return { ...state, fabricLibrary: existing ? state.fabricLibrary.map((recordItem) => recordItem.id === item.id ? normalized : recordItem) : [...state.fabricLibrary, normalized] };
}

export function deleteFabricLibraryItem(state: BasicSettingsState, id: string): BasicSettingsState {
  return { ...state, fabricLibrary: state.fabricLibrary.filter((item) => item.id !== id) };
}

export function upsertTrimLibraryItem(state: BasicSettingsState, item: TrimLibraryItem, now = new Date().toISOString()): BasicSettingsState {
  const existing = state.trimLibrary.find((recordItem) => recordItem.id === item.id);
  const normalized = { ...item, name: item.name.trim(), createdAt: existing?.createdAt || item.createdAt || now, updatedAt: now };
  return { ...state, trimLibrary: existing ? state.trimLibrary.map((recordItem) => recordItem.id === item.id ? normalized : recordItem) : [...state.trimLibrary, normalized] };
}

export function deleteTrimLibraryItem(state: BasicSettingsState, id: string): BasicSettingsState {
  return {
    ...state,
    trimLibrary: state.trimLibrary.filter((item) => item.id !== id),
    brands: state.brands.map((brand) => ({ ...brand, defaults: { ...brand.defaults, defaultTrims: brand.defaults.defaultTrims.filter((config) => config.trimLibraryItemId !== id) } })),
    customerSalespeople: state.customerSalespeople.map((person) => ({ ...person, defaults: { ...person.defaults, defaultTrims: person.defaults.defaultTrims.filter((config) => config.trimLibraryItemId !== id) } })),
  };
}

export function customerSalespeopleForBrand(state: BasicSettingsState, brandId: string): CustomerSalespersonRecord[] {
  return state.customerSalespeople.filter((item) => item.brandId === brandId && item.status === "active");
}

export function createFabricCostLineFromLibrary(item: FabricLibraryItem, id: string, lineGroupId = createCostLineGroupId()): FabricCostLine {
  return { id, lineGroupId, sourceLibraryItemId: item.id, name: item.name, composition: item.composition, segmentLengthCm: null, netWidthCm: item.netWidthCm, gsm: item.gsm, lossRate: item.defaultLossRate, supplier: item.supplier, unitPrice: item.unitPrice, purchaseUnit: item.purchaseUnit };
}

export function createTrimCostLineFromLibrary(item: TrimLibraryItem, id: string, config?: DefaultTrimConfig, lineGroupId = createCostLineGroupId()): TrimCostLine {
  return { id, lineGroupId, sourceLibraryItemId: item.id, name: item.name, specification: item.specification, supplier: item.supplier, usage: config?.quantity ?? null, unit: item.unit, lossRate: config?.overrideLossRate ?? item.defaultLossRate, unitPrice: config?.overrideUnitPrice ?? item.unitPrice };
}

export function fabricLibraryItemFromCostLine(line: FabricCostLine, id: string, existing?: FabricLibraryItem, now = new Date().toISOString()): FabricLibraryItem {
  return { id, name: line.name.trim(), composition: line.composition, netWidthCm: line.netWidthCm, gsm: line.gsm, defaultLossRate: line.lossRate, supplier: line.supplier, unitPrice: line.unitPrice, purchaseUnit: line.purchaseUnit, createdAt: existing?.createdAt ?? now, updatedAt: now };
}

export function trimLibraryItemFromCostLine(line: TrimCostLine, id: string, existing?: TrimLibraryItem, now = new Date().toISOString()): TrimLibraryItem {
  return { id, name: line.name.trim(), specification: line.specification, supplier: line.supplier, unit: line.unit, defaultLossRate: line.lossRate, unitPrice: line.unitPrice, createdAt: existing?.createdAt ?? now, updatedAt: now };
}

export type ResolvedQuoteDefaults = {
  usdCnyRate: NullableNumber;
  trims: TrimCostLine[];
  otherCost: DefaultOtherCost | null;
  sourceLabel: string;
};

export function resolveQuoteDefaults(
  state: BasicSettingsState,
  brandId: string,
  salespersonId: string,
  systemDefaults: { usdCnyRate: NullableNumber; defaultOtherCost: DefaultOtherCost | null } = state.systemDefaults,
): ResolvedQuoteDefaults {
  const brand = state.brands.find((item) => item.id === brandId);
  const salesperson = state.customerSalespeople.find((item) => item.id === salespersonId && item.brandId === brandId);
  const trimConfigs = salesperson?.defaults.defaultTrims.length ? salesperson.defaults.defaultTrims : brand?.defaults.defaultTrims ?? [];
  const trims = trimConfigs.flatMap((config, index) => {
    const item = state.trimLibrary.find((libraryItem) => libraryItem.id === config.trimLibraryItemId);
    return item ? [createTrimCostLineFromLibrary(item, `resolved-default-trim-${index + 1}`, config)] : [];
  });
  return {
    usdCnyRate: salesperson?.defaults.defaultUsdCnyRate ?? brand?.defaults.defaultUsdCnyRate ?? systemDefaults.usdCnyRate,
    trims,
    otherCost: salesperson?.defaults.defaultOtherCost ?? brand?.defaults.defaultOtherCost ?? systemDefaults.defaultOtherCost,
    sourceLabel: salesperson?.name ?? brand?.name ?? "系统",
  };
}

export function defaultOtherCostLine(id: string, value: DefaultOtherCost): OtherCostLine {
  return { id, lineGroupId: createCostLineGroupId(), name: value.name, amount: value.amount, specification: "基础设置自动带入", usage: 1, unit: "件", lossRate: 0, unitPrice: value.amount, source: "manual" };
}

export function applyDefaultsToEmptyQuoteFields(revision: QuoteRevision, priceVersionId: string, state: BasicSettingsState, brandId: string, salespersonId: string, systemDefaults?: { usdCnyRate: NullableNumber; defaultOtherCost: DefaultOtherCost | null }): QuoteRevision {
  const defaults = resolveQuoteDefaults(state, brandId, salespersonId, systemDefaults);
  return {
    ...revision,
    priceVersions: revision.priceVersions.map((version) => version.id !== priceVersionId ? version : ({
      ...version,
      pricingParameters: {
        ...version.pricingParameters,
        usdCnyRate: version.pricingParameters.usdCnyRate ?? defaults.usdCnyRate,
      },
      trims: version.trims.length ? version.trims : defaults.trims.map((item, index) => ({ ...item, id: `${version.id}-default-trim-${index + 1}` })),
      otherCosts: version.otherCosts.length || defaults.otherCost === null ? version.otherCosts : [defaultOtherCostLine(`${version.id}-default-other`, defaults.otherCost)],
    })),
  };
}
