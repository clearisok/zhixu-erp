import { HttpError } from "../http/errors.js";

export type DecimalString = string;
export type NullableDecimalString = DecimalString | null;
export type MasterStatus = "active" | "inactive";
export type LaborCurrency = "CNY" | "USD";

export type DefaultOtherCostDto = { name: string; amount: NullableDecimalString };
export type DefaultTrimDto = {
  id: string;
  trimLibraryItemId: string;
  overrideLossRate: NullableDecimalString;
  overrideUnitPrice: NullableDecimalString;
};
export type DefaultTrimInput = Omit<DefaultTrimDto, "id">;
export type QuoteDefaultsDto = {
  defaultUsdCnyRate: NullableDecimalString;
  defaultOtherCost: DefaultOtherCostDto | null;
  defaultTrims: DefaultTrimDto[];
};
export type QuoteDefaultsInput = Omit<QuoteDefaultsDto, "defaultTrims"> & { defaultTrims: DefaultTrimInput[] };

export type VersionedRecord = { version: number; createdAt: string; updatedAt: string };
export type BrandDto = VersionedRecord & { id: string; name: string; status: MasterStatus; defaults: QuoteDefaultsDto };
export type SalespersonDto = VersionedRecord & { id: string; name: string; brandId: string; status: MasterStatus; defaults: QuoteDefaultsDto };
export type FabricDto = VersionedRecord & {
  id: string; name: string; composition: string; netWidthCm: NullableDecimalString; gsm: NullableDecimalString;
  defaultLossRate: NullableDecimalString; supplier: string; unitPrice: NullableDecimalString; purchaseUnit: "kg" | "meter";
};
export type TrimDto = VersionedRecord & {
  id: string; name: string; specification: string; supplier: string; unit: string;
  defaultLossRate: NullableDecimalString; unitPrice: NullableDecimalString;
};
export type ManufacturingPresetDto = VersionedRecord & {
  id: string; name: string; country: string; laborCurrency: LaborCurrency; markupRate: NullableDecimalString;
  includeFreight: boolean; freightName: string; freightAmount: NullableDecimalString; status: MasterStatus;
};
export type GlobalQuoteSettingsDto = VersionedRecord & {
  defaultUsdCnyRate: NullableDecimalString;
  defaultMarkupRate: NullableDecimalString;
  defaultLaborCurrency: LaborCurrency;
  defaultLaborDescription: string;
  defaultOtherCost: DefaultOtherCostDto | null;
  defaultManufacturingPresetId: string | null;
};
export type ResolvedQuoteDefaultsDto = {
  usdCnyRate: NullableDecimalString;
  markupRate: NullableDecimalString;
  laborCurrency: LaborCurrency | null;
  laborDescription: string | null;
  otherCost: DefaultOtherCostDto | null;
  manufacturingPreset: ManufacturingPresetDto | null;
  trims: Array<DefaultTrimDto & { name: string; specification: string; supplier: string; unit: string; lossRate: NullableDecimalString; unitPrice: NullableDecimalString }>;
  source: { usdCnyRate: "system" | "brand" | "salesperson" | null; otherCost: "system" | "brand" | "salesperson" | null; trims: "brand" | "salesperson" | null };
};

const decimalPattern = /^(?:0|[1-9]\d*)(?:\.\d+)?$/u;

export function normalizeMasterName(value: string): string {
  return value.normalize("NFKC").trim().toLocaleLowerCase("zh-CN");
}

export function text(value: unknown, field: string, options: { required?: boolean; max?: number } = {}): string {
  if (typeof value !== "string") throw new HttpError(400, "invalid_quote_master_input", `${field} must be a string`);
  const result = value.normalize("NFKC").trim();
  if (options.required && !result) throw new HttpError(400, "invalid_quote_master_input", `${field} is required`);
  if (result.length > (options.max ?? 500)) throw new HttpError(400, "invalid_quote_master_input", `${field} is too long`);
  return result;
}

export function decimal(value: unknown, field: string): NullableDecimalString {
  if (value === null) return null;
  if (typeof value !== "string" || value.length > 128 || !decimalPattern.test(value)) {
    throw new HttpError(400, "invalid_quote_master_input", `${field} must be a non-negative decimal string or null`);
  }
  return value;
}

export function status(value: unknown): MasterStatus {
  if (value !== "active" && value !== "inactive") throw new HttpError(400, "invalid_quote_master_input", "status is invalid");
  return value;
}

export function expectedVersion(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new HttpError(400, "invalid_quote_master_input", "expectedVersion must be a non-negative integer");
  }
  return value as number;
}

export function exactObject(body: Record<string, unknown>, allowed: readonly string[]): void {
  const allow = new Set(allowed);
  if (Object.keys(body).some((key) => !allow.has(key))) {
    throw new HttpError(400, "invalid_quote_master_input", "Request contains unsupported fields");
  }
}

export function defaultOtherCost(value: unknown): DefaultOtherCostDto | null {
  if (value === null) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new HttpError(400, "invalid_quote_master_input", "defaultOtherCost must be an object or null");
  }
  const item = value as Record<string, unknown>;
  exactObject(item, ["name", "amount"]);
  return { name: text(item.name, "defaultOtherCost.name", { required: true, max: 200 }), amount: decimal(item.amount, "defaultOtherCost.amount") };
}

export function defaultTrims(value: unknown): DefaultTrimInput[] {
  if (!Array.isArray(value) || value.length > 100) throw new HttpError(400, "invalid_quote_master_input", "defaultTrims must be a bounded array");
  const seen = new Set<string>();
  return value.map((raw, index) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new HttpError(400, "invalid_quote_master_input", `defaultTrims[${index}] is invalid`);
    const item = raw as Record<string, unknown>;
    exactObject(item, ["trimLibraryItemId", "overrideLossRate", "overrideUnitPrice"]);
    const trimLibraryItemId = text(item.trimLibraryItemId, `defaultTrims[${index}].trimLibraryItemId`, { required: true, max: 256 });
    if (seen.has(trimLibraryItemId)) throw new HttpError(400, "invalid_quote_master_input", "defaultTrims cannot contain duplicate trim identities");
    seen.add(trimLibraryItemId);
    return {
      trimLibraryItemId,
      overrideLossRate: decimal(item.overrideLossRate, `defaultTrims[${index}].overrideLossRate`),
      overrideUnitPrice: decimal(item.overrideUnitPrice, `defaultTrims[${index}].overrideUnitPrice`),
    };
  });
}

export function quoteDefaults(value: unknown): QuoteDefaultsInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new HttpError(400, "invalid_quote_master_input", "defaults must be an object");
  const item = value as Record<string, unknown>;
  exactObject(item, ["defaultUsdCnyRate", "defaultOtherCost", "defaultTrims"]);
  return {
    defaultUsdCnyRate: decimal(item.defaultUsdCnyRate, "defaults.defaultUsdCnyRate"),
    defaultOtherCost: defaultOtherCost(item.defaultOtherCost),
    defaultTrims: defaultTrims(item.defaultTrims),
  };
}
