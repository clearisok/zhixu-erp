import { masterReadCache } from "../../server-auth/session-read-cache";
import type {
  BrandDto,
  FabricDto,
  GlobalQuoteSettingsDto,
  ManufacturingPresetDto,
  SalespersonDto,
  TrimDto,
  QuoteDefaultsInput,
  ResolvedQuoteDefaultsDto,
} from "../../../server/quote-masters/model";

export class QuoteMasterServerError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
    this.name = "QuoteMasterServerError";
  }
}

type BrandWrite = { name: string; status: BrandDto["status"]; defaults: QuoteDefaultsInput };
type SalespersonWrite = { name: string; brandId: string; status: SalespersonDto["status"]; defaults: QuoteDefaultsInput };
type FabricWrite = Omit<FabricDto, "id" | "version" | "createdAt" | "updatedAt">;
type TrimWrite = Omit<TrimDto, "id" | "version" | "createdAt" | "updatedAt">;
type SettingsWrite = Omit<GlobalQuoteSettingsDto, "version" | "createdAt" | "updatedAt">;
type PresetWrite = Omit<ManufacturingPresetDto, "id" | "version" | "createdAt" | "updatedAt">;
export type SettingsBundlePreset = PresetWrite & ({ id: string; expectedVersion: number } | { clientId: string });

async function responsePayload(response: Response): Promise<Record<string, unknown>> {
  try {
    const payload = await response.json() as unknown;
    return payload && typeof payload === "object" && !Array.isArray(payload) ? payload as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

async function parseResponse<T>(response: Response): Promise<T> {
  const payload = await responsePayload(response);
  if (!response.ok) {
    const error = payload.error && typeof payload.error === "object" && !Array.isArray(payload.error)
      ? payload.error as Record<string, unknown>
      : {};
    throw new QuoteMasterServerError(
      response.status,
      typeof error.code === "string" ? error.code : "quote_master_request_failed",
      typeof error.message === "string" ? error.message : "Quote master Server request failed",
    );
  }
  return payload as T;
}

function requiredObject<T>(value: T, key: string): T[keyof T] {
  const field = value[key as keyof T];
  if (!field || typeof field !== "object" || Array.isArray(field)) throw new QuoteMasterServerError(0, "invalid_server_response", `Quote master Server ${key} response is invalid`);
  return field;
}

function requiredArray<T>(value: T, key: string): T[keyof T] {
  const field = value[key as keyof T];
  if (!Array.isArray(field)) throw new QuoteMasterServerError(0, "invalid_server_response", `Quote master Server ${key} response is invalid`);
  return field;
}

export type QuoteMasterServerClient = {
  listBrands(): Promise<BrandDto[]>;
  createBrand(input: BrandWrite): Promise<BrandDto>;
  updateBrand(id: string, expectedVersion: number, input: BrandWrite): Promise<BrandDto>;
  listSalespeople(): Promise<SalespersonDto[]>;
  createSalesperson(input: SalespersonWrite): Promise<SalespersonDto>;
  updateSalesperson(id: string, expectedVersion: number, input: SalespersonWrite): Promise<SalespersonDto>;
  listFabrics(): Promise<FabricDto[]>;
  createFabric(input: FabricWrite): Promise<FabricDto>;
  updateFabric(id: string, expectedVersion: number, input: FabricWrite): Promise<FabricDto>;
  listTrims(): Promise<TrimDto[]>;
  createTrim(input: TrimWrite): Promise<TrimDto>;
  updateTrim(id: string, expectedVersion: number, input: TrimWrite): Promise<TrimDto>;
  supplierSuggestions(): Promise<string[]>;
  getSettings(): Promise<GlobalQuoteSettingsDto | null>;
  listPresets(): Promise<ManufacturingPresetDto[]>;
  resolveDefaults(brandId?: string, salespersonId?: string): Promise<ResolvedQuoteDefaultsDto>;
  saveSettingsBundle(input: { expectedVersion: number; settings: SettingsWrite; manufacturingPresets: SettingsBundlePreset[] }): Promise<{ settings: GlobalQuoteSettingsDto; manufacturingPresets: ManufacturingPresetDto[]; createdPresetIds: Record<string,string> }>;
};

export function createQuoteMasterServerClient(options: { baseUrl?: string; fetchImpl?: typeof fetch; applicationCache?: boolean } = {}): QuoteMasterServerClient {
  const baseUrl = (options.baseUrl ?? "").replace(/\/$/u, "");
  const fetchImpl = options.fetchImpl ?? fetch;
  const transport = async <T>(path: string, init?: RequestInit): Promise<T> => {
    let response: Response;
    try {
      response = await fetchImpl(`${baseUrl}${path}`, { credentials: "include", cache: "no-store", ...init });
    } catch {
      throw new QuoteMasterServerError(0, "server_unavailable", "Quote master Server is unavailable");
    }
    return parseResponse<T>(response);
  };
  const request = <T>(path: string, init?: RequestInit): Promise<T> => {
    if (!options.applicationCache || init || path.includes("resolved-defaults")) return transport<T>(path, init);
    return masterReadCache.read(path, () => transport<T>(path), 120_000);
  };
  const mutation = <T>(method: "POST" | "PATCH", path: string, body: object) => {
    if (options.applicationCache) masterReadCache.clear();
    return request<T>(path, {
    method,
    headers: { "Content-Type": "application/json", "X-Zhixu-Request": "1" },
    body: JSON.stringify(body),
    }).finally(() => { if (options.applicationCache) masterReadCache.clear(); });
  };
  return {
    listBrands: () => request<{ brands: BrandDto[] }>("/api/v1/quote-masters/brands").then((value) => requiredArray(value,"brands")),
    createBrand: (input) => mutation<{ brand: BrandDto }>("POST","/api/v1/quote-masters/brands",input).then((value) => requiredObject(value,"brand")),
    updateBrand: (id,expectedVersion,input) => mutation<{ brand: BrandDto }>("PATCH",`/api/v1/quote-masters/brands/${encodeURIComponent(id)}`,{expectedVersion,...input}).then((value) => requiredObject(value,"brand")),
    listSalespeople: () => request<{ customerSalespeople: SalespersonDto[] }>("/api/v1/quote-masters/customer-salespeople").then((value) => requiredArray(value,"customerSalespeople")),
    createSalesperson: (input) => mutation<{ customerSalesperson: SalespersonDto }>("POST","/api/v1/quote-masters/customer-salespeople",input).then((value) => requiredObject(value,"customerSalesperson")),
    updateSalesperson: (id,expectedVersion,input) => mutation<{ customerSalesperson: SalespersonDto }>("PATCH",`/api/v1/quote-masters/customer-salespeople/${encodeURIComponent(id)}`,{expectedVersion,...input}).then((value) => requiredObject(value,"customerSalesperson")),
    listFabrics: () => request<{ fabrics: FabricDto[] }>("/api/v1/quote-masters/fabrics").then((value) => requiredArray(value,"fabrics")),
    createFabric: (input) => mutation<{ fabric: FabricDto }>("POST","/api/v1/quote-masters/fabrics",input).then((value) => requiredObject(value,"fabric")),
    updateFabric: (id,expectedVersion,input) => mutation<{ fabric: FabricDto }>("PATCH",`/api/v1/quote-masters/fabrics/${encodeURIComponent(id)}`,{expectedVersion,...input}).then((value) => requiredObject(value,"fabric")),
    listTrims: () => request<{ trims: TrimDto[] }>("/api/v1/quote-masters/trims").then((value) => requiredArray(value,"trims")),
    createTrim: (input) => mutation<{ trim: TrimDto }>("POST","/api/v1/quote-masters/trims",input).then((value) => requiredObject(value,"trim")),
    updateTrim: (id,expectedVersion,input) => mutation<{ trim: TrimDto }>("PATCH",`/api/v1/quote-masters/trims/${encodeURIComponent(id)}`,{expectedVersion,...input}).then((value) => requiredObject(value,"trim")),
    supplierSuggestions: () => request<{ suppliers: string[] }>("/api/v1/quote-masters/supplier-suggestions").then((value) => requiredArray(value,"suppliers")),
    getSettings: () => request<{ settings: GlobalQuoteSettingsDto | null }>("/api/v1/quote-settings").then((value) => {
      if (!Object.hasOwn(value,"settings")) throw new QuoteMasterServerError(0,"invalid_server_response","Quote settings response is invalid");
      if (value.settings !== null) requiredObject(value,"settings");
      return value.settings;
    }),
    listPresets: () => request<{ manufacturingPresets: ManufacturingPresetDto[] }>("/api/v1/quote-settings/manufacturing-presets").then((value) => requiredArray(value,"manufacturingPresets")),
    resolveDefaults: (brandId, salespersonId) => {
      const params = new URLSearchParams();
      if (brandId) params.set("brandId", brandId);
      if (salespersonId) params.set("salespersonId", salespersonId);
      return request<{ defaults: ResolvedQuoteDefaultsDto }>(`/api/v1/quote-settings/resolved-defaults?${params}`).then((value) => requiredObject(value,"defaults"));
    },
    saveSettingsBundle: (input) => mutation<{ settings: GlobalQuoteSettingsDto; manufacturingPresets: ManufacturingPresetDto[]; createdPresetIds: Record<string,string> }>("PATCH","/api/v1/quote-settings/bundle",input).then((value) => {
      requiredObject(value,"settings");
      requiredArray(value,"manufacturingPresets");
      requiredObject(value,"createdPresetIds");
      return value;
    }),
  };
}

export const quoteMasterServerClient = createQuoteMasterServerClient({ applicationCache: true });
