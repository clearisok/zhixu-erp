import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import type { PermissionKey } from "../../features/permissions/model/permissions.js";
import type { OperationLog, OperationLogAction, OperationLogData } from "../../features/operation-logs/model/operation-log.js";
import { requirePermission } from "../auth/permissions.js";
import type { TrustedIdentity } from "../auth/session.js";
import { HttpError } from "../http/errors.js";
import { appendOperationLog } from "../operation-logs/repository.js";
import type {
  BrandDto, FabricDto, GlobalQuoteSettingsDto, ManufacturingPresetDto, MasterStatus, QuoteDefaultsDto,
  QuoteDefaultsInput, ResolvedQuoteDefaultsDto, SalespersonDto, TrimDto,
} from "./model.js";
import { normalizeMasterName } from "./model.js";
import * as repository from "./repository.js";

export type MutationContext = { requestId?: string; method?: string; path?: string };
export type BrandWrite = { name: string; status: MasterStatus; defaults: QuoteDefaultsInput };
export type SalespersonWrite = BrandWrite & { brandId: string };
export type FabricWrite = Omit<FabricDto, "id" | "version" | "createdAt" | "updatedAt">;
export type TrimWrite = Omit<TrimDto, "id" | "version" | "createdAt" | "updatedAt">;
export type PresetWrite = Omit<ManufacturingPresetDto, "id" | "version" | "createdAt" | "updatedAt">;
export type SettingsWrite = Omit<GlobalQuoteSettingsDto, "version" | "createdAt" | "updatedAt">;
export type SettingsBundlePresetWrite = PresetWrite & (
  | { id: string; expectedVersion: number; clientId?: never }
  | { clientId: string; id?: never; expectedVersion?: never }
);
export type SettingsBundleWrite = {
  expectedSettingsVersion: number;
  settings: SettingsWrite;
  manufacturingPresets: SettingsBundlePresetWrite[];
};

async function transaction<T>(pool: Pool, work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try { await client.query("BEGIN"); const result = await work(client); await client.query("COMMIT"); return result; }
  catch (error) { await client.query("ROLLBACK").catch(() => undefined); throw translateDatabaseError(error); }
  finally { client.release(); }
}

function translateDatabaseError(error: unknown): unknown {
  const value = error as { code?: string; constraint?: string };
  if (value.code === "23505") return new HttpError(409, "quote_master_name_conflict", "A normalized master identity already exists");
  if (value.code === "23503") return new HttpError(409, "quote_master_reference_conflict", "A referenced Quote master does not exist or is still in use");
  if (value.code === "23514" || value.code === "22P02") return new HttpError(400, "invalid_quote_master_input", "Quote master input violates a data constraint");
  return error;
}

type AuditValue = string | number | null;
type AuditValues = Record<string, AuditValue>;

function defaultValues(defaults: QuoteDefaultsDto): AuditValues {
  const values: AuditValues = {
    defaultUsdCnyRate: defaults.defaultUsdCnyRate,
    "defaultOtherCost.name": defaults.defaultOtherCost?.name ?? null,
    "defaultOtherCost.amount": defaults.defaultOtherCost?.amount ?? null,
    defaultTrimCount: defaults.defaultTrims.length,
  };
  defaults.defaultTrims.forEach((trim, position) => {
    const prefix = `defaultTrims.${trim.trimLibraryItemId}`;
    values[`${prefix}.trimLibraryItemId`] = trim.trimLibraryItemId;
    values[`${prefix}.position`] = position;
    values[`${prefix}.overrideLossRate`] = trim.overrideLossRate;
    values[`${prefix}.overrideUnitPrice`] = trim.overrideUnitPrice;
  });
  return values;
}

function businessSnapshot(
  type: string,
  value: { id: string; name?: string; version: number } | null,
  values: AuditValues,
): OperationLogData | null {
  if (!value) return null;
  return {
    objectType: type,
    objectId: value.id,
    objectName: value.name,
    values: { version: value.version, ...values },
  };
}

function brandSnapshot(value: BrandDto | null): OperationLogData | null {
  return value ? businessSnapshot("QuoteMasterBrand", value, {
    name: value.name,
    status: value.status,
    ...defaultValues(value.defaults),
  }) : null;
}

function salespersonSnapshot(value: SalespersonDto | null): OperationLogData | null {
  return value ? businessSnapshot("QuoteMasterCustomerSalesperson", value, {
    name: value.name,
    brandId: value.brandId,
    status: value.status,
    ...defaultValues(value.defaults),
  }) : null;
}

function fabricSnapshot(value: FabricDto | null): OperationLogData | null {
  return value ? businessSnapshot("QuoteMasterFabric", value, {
    name: value.name,
    composition: value.composition,
    netWidthCm: value.netWidthCm,
    gsm: value.gsm,
    defaultLossRate: value.defaultLossRate,
    supplier: value.supplier,
    unitPrice: value.unitPrice,
    purchaseUnit: value.purchaseUnit,
  }) : null;
}

function trimSnapshot(value: TrimDto | null): OperationLogData | null {
  return value ? businessSnapshot("QuoteMasterTrim", value, {
    name: value.name,
    specification: value.specification,
    supplier: value.supplier,
    unit: value.unit,
    defaultLossRate: value.defaultLossRate,
    unitPrice: value.unitPrice,
  }) : null;
}

function presetSnapshot(value: ManufacturingPresetDto | null): OperationLogData | null {
  return value ? businessSnapshot("QuoteManufacturingPreset", value, {
    name: value.name,
    country: value.country,
    laborCurrency: value.laborCurrency,
    markupRate: value.markupRate,
    includeFreight: String(value.includeFreight),
    freightName: value.freightName,
    freightAmount: value.freightAmount,
    status: value.status,
  }) : null;
}

function settingsSnapshot(value: GlobalQuoteSettingsDto | null): OperationLogData | null {
  return value ? businessSnapshot("QuoteGlobalSettings", { id: "global", version: value.version }, {
    defaultUsdCnyRate: value.defaultUsdCnyRate,
    defaultMarkupRate: value.defaultMarkupRate,
    defaultLaborCurrency: value.defaultLaborCurrency,
    defaultLaborDescription: value.defaultLaborDescription,
    "defaultOtherCost.name": value.defaultOtherCost?.name ?? null,
    "defaultOtherCost.amount": value.defaultOtherCost?.amount ?? null,
    defaultManufacturingPresetId: value.defaultManufacturingPresetId,
    defaultQuoteType: value.defaultQuoteType ?? null,
    defaultManufacturingCountry: value.defaultManufacturingCountry ?? null,
  }) : null;
}

function changedBusinessValues(before: OperationLogData | null, after: OperationLogData | null) {
  const beforeValues = before?.values ?? {};
  const afterValues = after?.values ?? {};
  const fields = [...new Set([...Object.keys(beforeValues), ...Object.keys(afterValues)])];
  return fields
    .filter((field) => !Object.hasOwn(beforeValues, field)
      || !Object.hasOwn(afterValues, field)
      || beforeValues[field] !== afterValues[field])
    .map((field) => ({
      field,
      beforeValue: Object.hasOwn(beforeValues, field) ? beforeValues[field] : null,
      afterValue: Object.hasOwn(afterValues, field) ? afterValues[field] : null,
    }));
}

async function audit(client: PoolClient, actor: TrustedIdentity, action: OperationLogAction, type: OperationLog["entityType"], id: string, before: OperationLogData | null, after: OperationLogData | null, context: MutationContext): Promise<void> {
  await appendOperationLog(client, actor, {
    module: "基础设置", action, entityType: type, entityId: id, beforeData: before, afterData: after,
    changes: changedBusinessValues(before, after),
    context: { requestId: context.requestId ?? null, method: context.method ?? null, path: context.path ?? null },
    metadata: { domain: "QuoteMasterSettings" },
  });
}

function requireVersion<T>(before: T | null, after: T | null): T {
  if (!before) throw new HttpError(404, "quote_master_not_found", "Quote master was not found");
  if (!after) throw new HttpError(409, "quote_master_version_conflict", "Quote master version is stale");
  return after as T;
}

function uuidList(length: number): string[] { return Array.from({ length }, () => randomUUID()); }
function stableDefaultTrimIds(
  before: { defaults: { defaultTrims: Array<{ id: string; trimLibraryItemId: string }> } } | null,
  after: QuoteDefaultsInput,
): string[] {
  return after.defaultTrims.map((config) => before?.defaults.defaultTrims.find((item) => item.trimLibraryItemId === config.trimLibraryItemId)?.id ?? randomUUID());
}

function samePreset(before: ManufacturingPresetDto, after: PresetWrite): boolean {
  return before.name === after.name
    && before.country === after.country
    && before.laborCurrency === after.laborCurrency
    && before.markupRate === after.markupRate
    && before.includeFreight === after.includeFreight
    && before.freightName === after.freightName
    && before.freightAmount === after.freightAmount
    && before.status === after.status;
}

function invalidDefaultPreset(): HttpError {
  return new HttpError(400, "invalid_quote_master_input", "Default manufacturing preset must reference an active preset");
}

export function createQuoteMasterService(pool: Pool) {
  const ensure = (actor: TrustedIdentity, permission: PermissionKey) => requirePermission(actor.permissions, permission);
  return {
    listBrands: (status?: MasterStatus) => repository.listBrands(pool, status),
    getBrand: (id: string) => repository.getBrand(pool, id),
    listSalespeople: (filters?: { status?: MasterStatus; brandId?: string }) => repository.listSalespeople(pool, filters),
    getSalesperson: (id: string) => repository.getSalesperson(pool, id),
    listFabrics: (search?: string) => repository.listFabrics(pool, search),
    getFabric: (id: string) => repository.getFabric(pool, id),
    listTrims: (search?: string) => repository.listTrims(pool, search),
    getTrim: (id: string) => repository.getTrim(pool, id),
    listPresets: (status?: MasterStatus) => repository.listPresets(pool, status),
    getPreset: (id: string) => repository.getPreset(pool, id),
    getGlobalSettings: () => repository.getGlobalSettings(pool),
    supplierSuggestions: (search?: string) => repository.supplierSuggestions(pool, search),

    createBrand(actor: TrustedIdentity, input: BrandWrite, context: MutationContext = {}) {
      ensure(actor, "settings.brand.edit");
      return transaction(pool, async (client) => {
        const id = randomUUID();
        const after = await repository.insertBrand(client, { id, ...input, normalizedName: normalizeMasterName(input.name), defaultTrimIds: uuidList(input.defaults.defaultTrims.length) });
        await audit(client, actor, "新增品牌", "Brand", id, null, brandSnapshot(after), context);
        return after;
      });
    },
    updateBrand(actor: TrustedIdentity, id: string, expectedVersion: number, input: BrandWrite, context: MutationContext = {}) {
      ensure(actor, "settings.brand.edit");
      return transaction(pool, async (client) => {
        const before = await repository.getBrand(client, id, true);
        const after = requireVersion(before, await repository.updateBrand(client, { id, expectedVersion, ...input, normalizedName: normalizeMasterName(input.name), defaultTrimIds: stableDefaultTrimIds(before, input.defaults) }));
        await audit(client, actor, "修改品牌", "Brand", id, brandSnapshot(before), brandSnapshot(after), context);
        return after;
      });
    },
    createSalesperson(actor: TrustedIdentity, input: SalespersonWrite, context: MutationContext = {}) {
      ensure(actor, "settings.salesperson.edit");
      return transaction(pool, async (client) => {
        const id = randomUUID();
        const after = await repository.insertSalesperson(client, { id, ...input, normalizedName: normalizeMasterName(input.name), defaultTrimIds: uuidList(input.defaults.defaultTrims.length) });
        await audit(client, actor, "新增客户业务员", "CustomerSalesperson", id, null, salespersonSnapshot(after), context);
        return after;
      });
    },
    updateSalesperson(actor: TrustedIdentity, id: string, expectedVersion: number, input: SalespersonWrite, context: MutationContext = {}) {
      ensure(actor, "settings.salesperson.edit");
      return transaction(pool, async (client) => {
        const before = await repository.getSalesperson(client, id, true);
        const after = requireVersion(before, await repository.updateSalesperson(client, { id, expectedVersion, ...input, normalizedName: normalizeMasterName(input.name), defaultTrimIds: stableDefaultTrimIds(before, input.defaults) }));
        await audit(client, actor, "修改客户业务员", "CustomerSalesperson", id, salespersonSnapshot(before), salespersonSnapshot(after), context);
        return after;
      });
    },
    createFabric(actor: TrustedIdentity, input: FabricWrite, context: MutationContext = {}) {
      ensure(actor, "settings.fabric.edit");
      return transaction(pool, async (client) => { const id=randomUUID(); const after=await repository.insertFabric(client,{id,...input,normalizedName:normalizeMasterName(input.name)}); await audit(client,actor,"新增面料库项","FabricLibraryItem",id,null,fabricSnapshot(after),context); return after; });
    },
    updateFabric(actor: TrustedIdentity, id: string, expectedVersion: number, input: FabricWrite, context: MutationContext = {}) {
      ensure(actor, "settings.fabric.edit");
      return transaction(pool,async(client)=>{const before=await repository.getFabric(client,id,true);const after=requireVersion(before,await repository.updateFabric(client,{id,expectedVersion,version:expectedVersion,...input,normalizedName:normalizeMasterName(input.name)}));await audit(client,actor,"修改面料库项","FabricLibraryItem",id,fabricSnapshot(before),fabricSnapshot(after),context);return after;});
    },
    createTrim(actor: TrustedIdentity, input: TrimWrite, context: MutationContext = {}) {
      ensure(actor, "settings.trim.edit");
      return transaction(pool,async(client)=>{const id=randomUUID();const after=await repository.insertTrim(client,{id,...input,normalizedName:normalizeMasterName(input.name)});await audit(client,actor,"新增辅料库项","TrimLibraryItem",id,null,trimSnapshot(after),context);return after;});
    },
    updateTrim(actor: TrustedIdentity, id: string, expectedVersion: number, input: TrimWrite, context: MutationContext = {}) {
      ensure(actor, "settings.trim.edit");
      return transaction(pool,async(client)=>{const before=await repository.getTrim(client,id,true);const after=requireVersion(before,await repository.updateTrim(client,{id,expectedVersion,version:expectedVersion,...input,normalizedName:normalizeMasterName(input.name)}));await audit(client,actor,"修改辅料库项","TrimLibraryItem",id,trimSnapshot(before),trimSnapshot(after),context);return after;});
    },
    createPreset(actor: TrustedIdentity, input: PresetWrite, context: MutationContext = {}) {
      ensure(actor, "settings.global.edit");
      return transaction(pool,async(client)=>{const id=randomUUID();const after=await repository.insertPreset(client,{id,...input});await audit(client,actor,"新增制作预设","ManufacturingPreset",id,null,presetSnapshot(after),context);return after;});
    },
    updatePreset(actor: TrustedIdentity, id: string, expectedVersion: number, input: PresetWrite, context: MutationContext = {}) {
      ensure(actor, "settings.global.edit");
      return transaction(pool, async (client) => {
        await client.query("SELECT pg_advisory_xact_lock(hashtextextended('quote-global-settings',0))");
        const beforeSettings = await repository.getGlobalSettings(client, true);
        const before = await repository.getPreset(client, id, true);
        const after = requireVersion(before, await repository.updatePreset(client, { id, expectedVersion, version: expectedVersion, ...input }));
        await audit(client, actor, "修改制作预设", "ManufacturingPreset", id, presetSnapshot(before), presetSnapshot(after), context);
        if (before?.status === "active"
          && (after.status === "inactive" || (beforeSettings?.defaultManufacturingCountry != null && after.country !== beforeSettings.defaultManufacturingCountry))
          && beforeSettings?.defaultManufacturingPresetId === id) {
          const afterSettings = await repository.writeGlobalSettings(client, {
            expectedVersion: beforeSettings.version,
            defaultUsdCnyRate: beforeSettings.defaultUsdCnyRate,
            defaultMarkupRate: beforeSettings.defaultMarkupRate,
            defaultLaborCurrency: beforeSettings.defaultLaborCurrency,
            defaultLaborDescription: beforeSettings.defaultLaborDescription,
            defaultOtherCost: beforeSettings.defaultOtherCost,
            defaultManufacturingPresetId: null,
          });
          if (!afterSettings) throw new HttpError(409, "quote_settings_version_conflict", "Quote settings version is stale");
          await audit(client, actor, "修改报价设置", "QuoteSettings", "global", settingsSnapshot(beforeSettings), settingsSnapshot(afterSettings), context);
        }
        return after;
      });
    },
    updateGlobalSettings(actor: TrustedIdentity, expectedVersion: number, input: SettingsWrite, context: MutationContext = {}) {
      ensure(actor, "settings.global.edit");
      return transaction(pool, async (client) => {
        await client.query("SELECT pg_advisory_xact_lock(hashtextextended('quote-global-settings',0))");
        const before = await repository.getGlobalSettings(client, true);
        if ((before?.version ?? 0) !== expectedVersion) throw new HttpError(409, "quote_settings_version_conflict", "Quote settings version is stale");
        if (input.defaultManufacturingPresetId !== null) {
          const preset = await repository.getPreset(client, input.defaultManufacturingPresetId, true);
          if (preset?.status !== "active") throw invalidDefaultPreset();
          const country=input.defaultManufacturingCountry===undefined?before?.defaultManufacturingCountry:input.defaultManufacturingCountry;
          if ((input.defaultManufacturingCountry!==undefined || country!=null) && preset.country !== country) throw new HttpError(400,"preset_country_mismatch","Default preset country must match default country");
        }
        const after = await repository.writeGlobalSettings(client, { expectedVersion, ...input });
        if (!after) throw new HttpError(409, "quote_settings_version_conflict", "Quote settings version is stale");
        await audit(client, actor, "修改报价设置", "QuoteSettings", "global", settingsSnapshot(before), settingsSnapshot(after), context);
        return after;
      });
    },
    saveSettingsBundle(actor: TrustedIdentity, input: SettingsBundleWrite, context: MutationContext = {}) {
      ensure(actor, "settings.global.edit");
      return transaction(pool, async (client) => {
        await client.query("SELECT pg_advisory_xact_lock(hashtextextended('quote-global-settings',0))");
        const beforeSettings = await repository.getGlobalSettings(client, true);
        if ((beforeSettings?.version ?? 0) !== input.expectedSettingsVersion) {
          throw new HttpError(409, "quote_settings_bundle_conflict", "Quote settings bundle is stale");
        }
        const currentPresets = await repository.listPresets(client, undefined, true);
        const currentById = new Map(currentPresets.map((preset) => [preset.id, preset]));
        const existingInputs = input.manufacturingPresets.filter((preset): preset is PresetWrite & { id: string; expectedVersion: number } => "id" in preset);
        const submittedIds = new Set(existingInputs.map((preset) => preset.id));
        if (submittedIds.size !== existingInputs.length
          || submittedIds.size !== currentPresets.length
          || currentPresets.some((preset) => !submittedIds.has(preset.id))) {
          throw new HttpError(409, "quote_settings_bundle_conflict", "Manufacturing preset set is stale");
        }
        for (const preset of existingInputs) {
          if (currentById.get(preset.id)?.version !== preset.expectedVersion) {
            throw new HttpError(409, "quote_settings_bundle_conflict", "Manufacturing preset version is stale");
          }
        }
        const newInputs = input.manufacturingPresets.filter((preset): preset is PresetWrite & { clientId: string } => "clientId" in preset);
        const newIds = new Map<string, string>();
        for (const preset of newInputs) {
          if (newIds.has(preset.clientId) || currentById.has(preset.clientId)) {
            throw new HttpError(400, "invalid_quote_master_input", "New manufacturing preset client identity is duplicated");
          }
          newIds.set(preset.clientId, randomUUID());
        }
        const requestedDefault = input.settings.defaultManufacturingPresetId;
        const requestedExisting = requestedDefault === null ? undefined : existingInputs.find((preset) => preset.id === requestedDefault);
        const requestedNew = requestedDefault === null ? undefined : newInputs.find((preset) => preset.clientId === requestedDefault);
        const resolvedRequestedDefault = requestedDefault === null
          ? null
          : newIds.get(requestedDefault) ?? (currentById.has(requestedDefault) ? requestedDefault : null);
        if (requestedDefault !== null && resolvedRequestedDefault === null) {
          throw new HttpError(400, "invalid_quote_master_input", "Default manufacturing preset is not in the bundle");
        }
        const requestedStatus = requestedExisting?.status ?? requestedNew?.status;
        const deactivatesCurrentDefault = requestedExisting?.status === "inactive"
          && beforeSettings?.defaultManufacturingPresetId === requestedExisting.id
          && currentById.get(requestedExisting.id)?.status === "active";
        if (requestedDefault !== null && requestedStatus !== "active" && !deactivatesCurrentDefault) {
          throw invalidDefaultPreset();
        }
        const defaultManufacturingPresetId = deactivatesCurrentDefault ? null : resolvedRequestedDefault;
        const country=input.settings.defaultManufacturingCountry===undefined?beforeSettings?.defaultManufacturingCountry:input.settings.defaultManufacturingCountry;
        if(defaultManufacturingPresetId!==null && (input.settings.defaultManufacturingCountry!==undefined || country!=null) && (requestedExisting??requestedNew)?.country!==country)
          throw new HttpError(400,"preset_country_mismatch","Default preset country must match default country");

        const savedPresets: ManufacturingPresetDto[] = [];
        for (const preset of existingInputs) {
          const before = currentById.get(preset.id)!;
          if (samePreset(before, preset)) {
            savedPresets.push(before);
            continue;
          }
          const after = requireVersion(before, await repository.updatePreset(client, { ...preset, version: preset.expectedVersion }));
          await audit(client, actor, "修改制作预设", "ManufacturingPreset", after.id, presetSnapshot(before), presetSnapshot(after), context);
          savedPresets.push(after);
        }
        for (const preset of newInputs) {
          const id = newIds.get(preset.clientId)!;
          const after = await repository.insertPreset(client, { id, ...preset });
          await audit(client, actor, "新增制作预设", "ManufacturingPreset", id, null, presetSnapshot(after), context);
          savedPresets.push(after);
        }
        const afterSettings = await repository.writeGlobalSettings(client, {
          expectedVersion: input.expectedSettingsVersion,
          ...input.settings,
          defaultManufacturingPresetId,
        });
        if (!afterSettings) throw new HttpError(409, "quote_settings_bundle_conflict", "Quote settings bundle is stale");
        await audit(client, actor, "修改报价设置", "QuoteSettings", "global", settingsSnapshot(beforeSettings), settingsSnapshot(afterSettings), context);
        return {
          settings: afterSettings,
          manufacturingPresets: savedPresets.sort((left, right) => left.name.localeCompare(right.name, "zh-CN") || left.id.localeCompare(right.id)),
          createdPresetIds: Object.fromEntries(newIds),
        };
      });
    },
    async resolveDefaults(brandId?: string, salespersonId?: string): Promise<ResolvedQuoteDefaultsDto> {
      const system = await repository.getGlobalSettings(pool);
      const brand = brandId ? await repository.getBrand(pool, brandId) : null;
      const salesperson = salespersonId ? await repository.getSalesperson(pool, salespersonId) : null;
      const activeBrand = brand?.status === "active" ? brand : null;
      const activeSalesperson = salesperson?.status === "active" && salesperson.brandId === activeBrand?.id ? salesperson : null;
      const rate = activeSalesperson?.defaults.defaultUsdCnyRate ?? activeBrand?.defaults.defaultUsdCnyRate ?? system?.defaultUsdCnyRate ?? null;
      const cost = activeSalesperson?.defaults.defaultOtherCost ?? activeBrand?.defaults.defaultOtherCost ?? system?.defaultOtherCost ?? null;
      const trimOwner = activeSalesperson?.defaults.defaultTrims.length ? "salesperson" : activeBrand?.defaults.defaultTrims.length ? "brand" : null;
      const configs = trimOwner === "salesperson" ? activeSalesperson!.defaults.defaultTrims : trimOwner === "brand" ? activeBrand!.defaults.defaultTrims : [];
      const trims = (await Promise.all(configs.map(async(config)=>{const item=await repository.getTrim(pool,config.trimLibraryItemId);return item?{...config,name:item.name,specification:item.specification,supplier:item.supplier,unit:item.unit,lossRate:config.overrideLossRate??item.defaultLossRate,unitPrice:config.overrideUnitPrice??item.unitPrice}:null;}))).filter((item):item is NonNullable<typeof item>=>item!==null);
      const referencedManufacturingPreset = system?.defaultManufacturingPresetId
        ? await repository.getPreset(pool, system.defaultManufacturingPresetId)
        : null;
      const manufacturingPreset = referencedManufacturingPreset?.status === "active" ? referencedManufacturingPreset : null;
      return { usdCnyRate:rate,markupRate:system?.defaultMarkupRate??null,laborCurrency:system?.defaultLaborCurrency??null,laborDescription:system?.defaultLaborDescription??null,otherCost:cost,manufacturingPreset,trims,source:{usdCnyRate:activeSalesperson?.defaults.defaultUsdCnyRate!==null&&activeSalesperson?.defaults.defaultUsdCnyRate!==undefined?"salesperson":activeBrand?.defaults.defaultUsdCnyRate!==null&&activeBrand?.defaults.defaultUsdCnyRate!==undefined?"brand":system?.defaultUsdCnyRate!==null&&system?.defaultUsdCnyRate!==undefined?"system":null,otherCost:activeSalesperson?.defaults.defaultOtherCost?"salesperson":activeBrand?.defaults.defaultOtherCost?"brand":system?.defaultOtherCost?"system":null,trims:trimOwner} };
    },
  };
}
