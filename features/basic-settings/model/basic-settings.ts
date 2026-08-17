import type { CostLine, LaborCurrency, NullableNumber, QuoteRevision } from "../../quote-center/model/quote-view-model";

export type RecordStatus = "active" | "inactive";

export type DefaultQuoteConfiguration = {
  usdCnyRate: NullableNumber;
  trims: CostLine[];
  otherCosts: CostLine[];
};

export type BrandRecord = {
  id: string;
  name: string;
  code: string;
  status: RecordStatus;
  defaults: DefaultQuoteConfiguration;
};

export type CustomerSalespersonRecord = {
  id: string;
  name: string;
  code: string;
  brandId: string;
  status: RecordStatus;
  defaults: DefaultQuoteConfiguration;
};

export type BasicSettingsState = {
  systemDefaults: {
    usdCnyRate: NullableNumber;
    markupRate: NullableNumber;
    laborCurrency: LaborCurrency;
  };
  brands: BrandRecord[];
  customerSalespeople: CustomerSalespersonRecord[];
};

const line = (id: string, name: string, specification: string, unit: string, unitPrice: number): CostLine => ({
  id, name, specification, usage: 1, unit, lossRate: 0, unitPrice,
});

export const defaultBasicSettings: BasicSettingsState = {
  systemDefaults: { usdCnyRate: 7.12, markupRate: 8, laborCurrency: "CNY" },
  brands: [
    { id: "zara", name: "ZARA", code: "ZARA", status: "active", defaults: { usdCnyRate: 7.1, trims: [line("zara-trim", "主唛 / 洗水唛", "缎面印字 · 2件套", "套", 0.72)], otherCosts: [line("zara-other", "管理分摊", "单件分摊", "件", 1.25)] } },
    { id: "zara-man", name: "ZARA MAN", code: "ZRM", status: "active", defaults: { usdCnyRate: 7.1, trims: [], otherCosts: [] } },
    { id: "massimo-dutti", name: "Massimo Dutti", code: "MD", status: "active", defaults: { usdCnyRate: 7.08, trims: [line("md-trim", "纽扣", "18L 四眼扣", "粒", 0.18)], otherCosts: [line("md-other", "包装", "单件包装", "件", 0.8)] } },
    { id: "bershka", name: "Bershka", code: "BSK", status: "active", defaults: { usdCnyRate: null, trims: [], otherCosts: [] } },
    { id: "pull-bear", name: "Pull&Bear", code: "PB", status: "active", defaults: { usdCnyRate: null, trims: [], otherCosts: [] } },
  ],
  customerSalespeople: [
    { id: "sales-linqinghe", name: "林青禾", code: "LQH", brandId: "zara", status: "active", defaults: { usdCnyRate: 7.12, trims: [line("lqh-trim", "透明自封袋", "28×38cm", "个", 0.34)], otherCosts: [] } },
    { id: "sales-zhouyan", name: "周妍", code: "ZY", brandId: "zara", status: "active", defaults: { usdCnyRate: null, trims: [], otherCosts: [] } },
    { id: "sales-chenxi", name: "陈曦", code: "CX", brandId: "massimo-dutti", status: "active", defaults: { usdCnyRate: null, trims: [], otherCosts: [line("cx-other", "质检分摊", "AQL 2.5", "件", 0.35)] } },
    { id: "sales-sunyu", name: "孙宇", code: "SY", brandId: "bershka", status: "active", defaults: { usdCnyRate: 7.09, trims: [], otherCosts: [] } },
  ],
};

function validNumber(value: unknown): NullableNumber {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeCostLines(value: unknown): CostLine[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is CostLine => Boolean(item && typeof item === "object" && typeof item.id === "string" && typeof item.name === "string")).map((item) => ({
    id: item.id,
    name: item.name,
    specification: typeof item.specification === "string" ? item.specification : "",
    usage: validNumber(item.usage),
    unit: typeof item.unit === "string" ? item.unit : "件",
    lossRate: validNumber(item.lossRate),
    unitPrice: validNumber(item.unitPrice),
  }));
}

function normalizeDefaults(value: Partial<DefaultQuoteConfiguration> | null | undefined): DefaultQuoteConfiguration {
  return { usdCnyRate: validNumber(value?.usdCnyRate), trims: normalizeCostLines(value?.trims), otherCosts: normalizeCostLines(value?.otherCosts) };
}

export function normalizeBasicSettings(value: Partial<BasicSettingsState> | null | undefined): BasicSettingsState {
  const brands = Array.isArray(value?.brands) ? value.brands.map((brand) => ({
    id: String(brand.id), name: String(brand.name), code: String(brand.code || ""), status: brand.status === "inactive" ? "inactive" as const : "active" as const, defaults: normalizeDefaults(brand.defaults),
  })).filter((brand) => brand.id && brand.name) : defaultBasicSettings.brands;
  const brandIds = new Set(brands.map((brand) => brand.id));
  const customerSalespeople = Array.isArray(value?.customerSalespeople) ? value.customerSalespeople.map((person) => ({
    id: String(person.id), name: String(person.name), code: String(person.code || ""), brandId: String(person.brandId), status: person.status === "inactive" ? "inactive" as const : "active" as const, defaults: normalizeDefaults(person.defaults),
  })).filter((person) => person.id && person.name && brandIds.has(person.brandId)) : defaultBasicSettings.customerSalespeople;
  return {
    systemDefaults: {
      usdCnyRate: validNumber(value?.systemDefaults?.usdCnyRate ?? defaultBasicSettings.systemDefaults.usdCnyRate),
      markupRate: validNumber(value?.systemDefaults?.markupRate ?? defaultBasicSettings.systemDefaults.markupRate),
      laborCurrency: value?.systemDefaults?.laborCurrency === "USD" ? "USD" : "CNY",
    },
    brands,
    customerSalespeople,
  };
}

export function searchBrands(brands: BrandRecord[], query: string): BrandRecord[] {
  const token = query.trim().toLowerCase();
  return token ? brands.filter((brand) => `${brand.name} ${brand.code}`.toLowerCase().includes(token)) : brands;
}

export function searchCustomerSalespeople(records: CustomerSalespersonRecord[], brands: BrandRecord[], query: string): CustomerSalespersonRecord[] {
  const token = query.trim().toLowerCase();
  if (!token) return records;
  const brandNames = new Map(brands.map((brand) => [brand.id, brand.name]));
  return records.filter((record) => `${record.name} ${record.code} ${brandNames.get(record.brandId) || ""}`.toLowerCase().includes(token));
}

export function upsertBrand(state: BasicSettingsState, brand: BrandRecord): BasicSettingsState {
  const exists = state.brands.some((item) => item.id === brand.id);
  return { ...state, brands: exists ? state.brands.map((item) => item.id === brand.id ? brand : item) : [...state.brands, brand] };
}

export function deleteBrand(state: BasicSettingsState, brandId: string): BasicSettingsState {
  return { ...state, brands: state.brands.filter((brand) => brand.id !== brandId), customerSalespeople: state.customerSalespeople.filter((person) => person.brandId !== brandId) };
}

export function upsertCustomerSalesperson(state: BasicSettingsState, record: CustomerSalespersonRecord): BasicSettingsState {
  const exists = state.customerSalespeople.some((item) => item.id === record.id);
  return { ...state, customerSalespeople: exists ? state.customerSalespeople.map((item) => item.id === record.id ? record : item) : [...state.customerSalespeople, record] };
}

export function deleteCustomerSalesperson(state: BasicSettingsState, id: string): BasicSettingsState {
  return { ...state, customerSalespeople: state.customerSalespeople.filter((record) => record.id !== id) };
}

export function copyCustomerSalesperson(state: BasicSettingsState, sourceId: string, id: string): BasicSettingsState {
  const source = state.customerSalespeople.find((record) => record.id === sourceId);
  if (!source) return state;
  const copy: CustomerSalespersonRecord = { ...source, id, name: `${source.name}副本`, code: source.code ? `${source.code}-COPY` : "", defaults: JSON.parse(JSON.stringify(source.defaults)) as DefaultQuoteConfiguration };
  return { ...state, customerSalespeople: [...state.customerSalespeople, copy] };
}

export function customerSalespeopleForBrand(state: BasicSettingsState, brandId: string): CustomerSalespersonRecord[] {
  return state.customerSalespeople.filter((record) => record.brandId === brandId && record.status === "active");
}

function copyLines(lines: CostLine[], prefix: string): CostLine[] {
  return lines.map((item, index) => ({ ...item, id: `${prefix}-${index + 1}` }));
}

export function resolveQuoteDefaults(state: BasicSettingsState, brandId: string, salespersonId: string): DefaultQuoteConfiguration {
  const brand = state.brands.find((item) => item.id === brandId);
  const salesperson = state.customerSalespeople.find((item) => item.id === salespersonId && item.brandId === brandId);
  return {
    usdCnyRate: salesperson?.defaults.usdCnyRate ?? brand?.defaults.usdCnyRate ?? state.systemDefaults.usdCnyRate,
    trims: salesperson?.defaults.trims.length ? salesperson.defaults.trims : brand?.defaults.trims ?? [],
    otherCosts: salesperson?.defaults.otherCosts.length ? salesperson.defaults.otherCosts : brand?.defaults.otherCosts ?? [],
  };
}

export function applyDefaultsToEmptyQuoteFields(revision: QuoteRevision, priceVersionId: string, state: BasicSettingsState, brandId: string, salespersonId: string): QuoteRevision {
  const defaults = resolveQuoteDefaults(state, brandId, salespersonId);
  return {
    ...revision,
    pricingParameters: { ...revision.pricingParameters, usdCnyRate: revision.pricingParameters.usdCnyRate ?? defaults.usdCnyRate },
    priceVersions: revision.priceVersions.map((version) => version.id !== priceVersionId ? version : ({
      ...version,
      trims: version.trims.length ? version.trims : copyLines(defaults.trims, `${version.id}-default-trim`),
      otherCosts: version.otherCosts.length ? version.otherCosts : copyLines(defaults.otherCosts, `${version.id}-default-other`),
    })),
  };
}
