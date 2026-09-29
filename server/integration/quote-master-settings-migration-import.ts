import { createHash } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import type { MasterSettingsBackupPreviewReport } from "../../features/basic-settings/server/master-settings-backup-preview.js";
import type {
  DefaultOtherCostDto,
  DefaultTrimDto,
  FabricDto,
  GlobalQuoteSettingsDto,
  LaborCurrency,
  ManufacturingPresetDto,
  MasterStatus,
  QuoteDefaultsDto,
  SalespersonDto,
  TrimDto,
} from "../quote-masters/model.js";
import { normalizeMasterName } from "../quote-masters/model.js";
import * as repository from "../quote-masters/repository.js";

type UnknownRecord = Record<string, unknown>;

export type QuoteMasterSettingsRowCounts = {
  brands: number;
  customerSalespeople: number;
  fabrics: number;
  trims: number;
  manufacturingPresets: number;
  brandDefaultTrims: number;
  salespersonDefaultTrims: number;
  globalSettings: number;
  total: number;
};

type MigrationDefaults = QuoteDefaultsDto;
type MigrationBrand = { id: string; name: string; status: MasterStatus; defaults: MigrationDefaults };
type MigrationSalesperson = Omit<SalespersonDto, "version" | "createdAt" | "updatedAt">;
type MigrationFabric = Omit<FabricDto, "version" | "createdAt" | "updatedAt">;
type MigrationTrim = Omit<TrimDto, "version" | "createdAt" | "updatedAt">;
type MigrationPreset = Omit<ManufacturingPresetDto, "version" | "createdAt" | "updatedAt">;
type MigrationGlobalSettings = Omit<GlobalQuoteSettingsDto, "version" | "createdAt" | "updatedAt">;

export type QuoteMasterSettingsMigrationContent = {
  brands: MigrationBrand[];
  customerSalespeople: MigrationSalesperson[];
  fabrics: MigrationFabric[];
  trims: MigrationTrim[];
  manufacturingPresets: MigrationPreset[];
  globalSettings: MigrationGlobalSettings | null;
};

export type QuoteMasterSettingsDecimalEvidence = {
  fields: number;
  nulls: number;
  zeroes: number;
  canonicalStrings: number;
};

export type QuoteMasterSettingsImportResult = {
  rowCounts: QuoteMasterSettingsRowCounts;
  projectionContentHash: string;
  postgresContentHash: string;
  contentHashesEqual: boolean;
  decimalEvidence: QuoteMasterSettingsDecimalEvidence;
};

export class QuoteMasterSettingsMigrationError extends Error {
  readonly code: "preview_rejected" | "target_not_empty" | "invalid_projection" | "reconciliation_failed" | "intentional_rehearsal_failure";

  constructor(code: QuoteMasterSettingsMigrationError["code"], message: string) {
    super(message);
    this.name = "QuoteMasterSettingsMigrationError";
    this.code = code;
  }
}

/** The transaction committed; callers must KEEP FREEZE and must never label this rolled back. */
export class QuoteMasterSettingsPostCommitError extends Error {
  readonly code = "committed_unverified";
  constructor(readonly committedCounts: QuoteMasterSettingsRowCounts, cause: unknown) {
    super("Quote master/settings transaction committed, but post-commit readback did not verify", { cause });
    this.name = "QuoteMasterSettingsPostCommitError";
  }
}

export class QuoteMasterSettingsCommitUnknownError extends Error {
  readonly code = "commit_outcome_unknown";
  constructor(cause: unknown) {
    super("Quote master/settings COMMIT outcome is unknown; keep all writers frozen", { cause });
    this.name = "QuoteMasterSettingsCommitUnknownError";
  }
}

const record = (value: unknown): UnknownRecord => value !== null && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : {};
const list = (value: unknown): UnknownRecord[] => Array.isArray(value) ? value.map(record) : [];

function requiredText(value: unknown, path: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new QuoteMasterSettingsMigrationError("invalid_projection", `${path} must be a non-empty string`);
  }
  return value;
}

function optionalText(value: unknown, path: string): string {
  if (value === undefined) return "";
  if (typeof value !== "string") {
    throw new QuoteMasterSettingsMigrationError("invalid_projection", `${path} must be a string`);
  }
  return value;
}

function nullableDecimal(value: unknown, path: string): string | null {
  if (value === null) return null;
  if (typeof value !== "string" || !/^(?:0|[1-9]\d*)(?:\.\d+)?$/u.test(value)) {
    throw new QuoteMasterSettingsMigrationError("invalid_projection", `${path} must be a canonical non-negative decimal string or null`);
  }
  return value;
}

function status(value: unknown, path: string): MasterStatus {
  // Legacy Browser manufacturing presets predate an explicit status; their established semantic is active.
  if (value === undefined) return "active";
  if (value !== "active" && value !== "inactive") {
    throw new QuoteMasterSettingsMigrationError("invalid_projection", `${path} is invalid`);
  }
  return value;
}

function currency(value: unknown, path: string): LaborCurrency {
  if (value !== "CNY" && value !== "USD") {
    throw new QuoteMasterSettingsMigrationError("invalid_projection", `${path} is invalid`);
  }
  return value;
}

function booleanValue(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") {
    throw new QuoteMasterSettingsMigrationError("invalid_projection", `${path} must be boolean`);
  }
  return value;
}

function defaultOtherCost(value: unknown, path: string): DefaultOtherCostDto | null {
  if (value === null) return null;
  const item = record(value);
  return {
    name: requiredText(item.name, `${path}.name`),
    amount: nullableDecimal(item.amount, `${path}.amount`),
  };
}

function defaultTrims(value: unknown, path: string): DefaultTrimDto[] {
  return list(value).map((item, index) => ({
    id: requiredText(item.id, `${path}[${index}].id`),
    trimLibraryItemId: requiredText(item.trimLibraryItemId, `${path}[${index}].trimLibraryItemId`),
    overrideLossRate: nullableDecimal(item.overrideLossRate, `${path}[${index}].overrideLossRate`),
    overrideUnitPrice: nullableDecimal(item.overrideUnitPrice, `${path}[${index}].overrideUnitPrice`),
  }));
}

function defaults(value: unknown, path: string): MigrationDefaults {
  const item = record(value);
  return {
    defaultUsdCnyRate: nullableDecimal(item.defaultUsdCnyRate, `${path}.defaultUsdCnyRate`),
    defaultOtherCost: defaultOtherCost(item.defaultOtherCost, `${path}.defaultOtherCost`),
    defaultTrims: defaultTrims(item.defaultTrims, `${path}.defaultTrims`),
  };
}

function sortById<T extends { id: string }>(items: T[]): T[] {
  return [...items].sort((left, right) => left.id.localeCompare(right.id));
}

export function migrationContentFromPreview(report: MasterSettingsBackupPreviewReport): QuoteMasterSettingsMigrationContent {
  if (report.sensitiveFieldPaths.length || report.preview.blockingErrors.length) {
    throw new QuoteMasterSettingsMigrationError("preview_rejected", "Preview contains sensitive fields or blocking errors");
  }
  const source = report.preview.projection;
  const basic = source.basicSettings;
  const global = source.globalQuoteSettings === null || source.globalQuoteSettings === undefined
    ? null
    : record(source.globalQuoteSettings);

  const brands = sortById(list(basic.brands).map((item, index) => ({
    id: requiredText(item.id, `brands[${index}].id`),
    name: requiredText(item.name, `brands[${index}].name`),
    status: status(item.status, `brands[${index}].status`),
    defaults: defaults(item.defaults, `brands[${index}].defaults`),
  })));
  const customerSalespeople = sortById(list(basic.customerSalespeople).map((item, index) => ({
    id: requiredText(item.id, `customerSalespeople[${index}].id`),
    name: requiredText(item.name, `customerSalespeople[${index}].name`),
    brandId: requiredText(item.brandId, `customerSalespeople[${index}].brandId`),
    status: status(item.status, `customerSalespeople[${index}].status`),
    defaults: defaults(item.defaults, `customerSalespeople[${index}].defaults`),
  })));
  const fabrics = sortById(list(basic.fabricLibrary).map((item, index) => {
    const purchaseUnit = item.purchaseUnit;
    if (purchaseUnit !== "kg" && purchaseUnit !== "meter") {
      throw new QuoteMasterSettingsMigrationError("invalid_projection", `fabrics[${index}].purchaseUnit is invalid`);
    }
    return {
      id: requiredText(item.id, `fabrics[${index}].id`),
      name: requiredText(item.name, `fabrics[${index}].name`),
      composition: optionalText(item.composition, `fabrics[${index}].composition`),
      netWidthCm: nullableDecimal(item.netWidthCm, `fabrics[${index}].netWidthCm`),
      gsm: nullableDecimal(item.gsm, `fabrics[${index}].gsm`),
      defaultLossRate: nullableDecimal(item.defaultLossRate, `fabrics[${index}].defaultLossRate`),
      supplier: optionalText(item.supplier, `fabrics[${index}].supplier`),
      unitPrice: nullableDecimal(item.unitPrice, `fabrics[${index}].unitPrice`),
      purchaseUnit: purchaseUnit as "kg" | "meter",
    };
  }));
  const trims = sortById(list(basic.trimLibrary).map((item, index) => ({
    id: requiredText(item.id, `trims[${index}].id`),
    name: requiredText(item.name, `trims[${index}].name`),
    specification: optionalText(item.specification, `trims[${index}].specification`),
    supplier: optionalText(item.supplier, `trims[${index}].supplier`),
    unit: requiredText(item.unit, `trims[${index}].unit`),
    defaultLossRate: nullableDecimal(item.defaultLossRate, `trims[${index}].defaultLossRate`),
    unitPrice: nullableDecimal(item.unitPrice, `trims[${index}].unitPrice`),
  })));
  const manufacturingPresets = sortById(list(global?.manufacturingPresets).map((item, index) => ({
    id: requiredText(item.id, `manufacturingPresets[${index}].id`),
    name: requiredText(item.name, `manufacturingPresets[${index}].name`),
    country: requiredText(item.country, `manufacturingPresets[${index}].country`),
    laborCurrency: currency(item.laborCurrency, `manufacturingPresets[${index}].laborCurrency`),
    markupRate: nullableDecimal(item.markupRate, `manufacturingPresets[${index}].markupRate`),
    includeFreight: booleanValue(item.includeFreight, `manufacturingPresets[${index}].includeFreight`),
    freightName: optionalText(item.freightName, `manufacturingPresets[${index}].freightName`),
    freightAmount: nullableDecimal(item.freightAmount, `manufacturingPresets[${index}].freightAmount`),
    status: status(item.status, `manufacturingPresets[${index}].status`),
  })));
  const globalSettings = global === null ? null : {
    defaultUsdCnyRate: nullableDecimal(global.defaultUsdCnyRate, "globalSettings.defaultUsdCnyRate"),
    defaultMarkupRate: nullableDecimal(global.defaultMarkupRate, "globalSettings.defaultMarkupRate"),
    defaultLaborCurrency: currency(global.defaultLaborCurrency, "globalSettings.defaultLaborCurrency"),
    defaultLaborDescription: optionalText(global.defaultLaborDescription, "globalSettings.defaultLaborDescription"),
    defaultOtherCost: defaultOtherCost(global.defaultOtherCost, "globalSettings.defaultOtherCost"),
    defaultManufacturingPresetId: global.defaultManufacturingPresetId === null
      ? null
      : requiredText(global.defaultManufacturingPresetId, "globalSettings.defaultManufacturingPresetId"),
  };

  const defaultPresetId = globalSettings?.defaultManufacturingPresetId;
  if (defaultPresetId && manufacturingPresets.find((item) => item.id === defaultPresetId)?.status !== "active") {
    throw new QuoteMasterSettingsMigrationError("invalid_projection", "Global default preset must reference an active projected preset");
  }
  return { brands, customerSalespeople, fabrics, trims, manufacturingPresets, globalSettings };
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.entries(value as UnknownRecord)
    .filter(([, item]) => item !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
    .join(",")}}`;
}

export function migrationContentHash(content: QuoteMasterSettingsMigrationContent): string {
  return createHash("sha256").update(canonicalJson(content), "utf8").digest("hex");
}

export function decimalEvidence(content: QuoteMasterSettingsMigrationContent): QuoteMasterSettingsDecimalEvidence {
  const values: Array<string | null> = [];
  const addOther = (item: DefaultOtherCostDto | null) => { if (item) values.push(item.amount); };
  const addDefaults = (item: MigrationDefaults) => {
    values.push(item.defaultUsdCnyRate);
    addOther(item.defaultOtherCost);
    for (const trim of item.defaultTrims) values.push(trim.overrideLossRate, trim.overrideUnitPrice);
  };
  for (const item of content.brands) addDefaults(item.defaults);
  for (const item of content.customerSalespeople) addDefaults(item.defaults);
  for (const item of content.fabrics) values.push(item.netWidthCm, item.gsm, item.defaultLossRate, item.unitPrice);
  for (const item of content.trims) values.push(item.defaultLossRate, item.unitPrice);
  for (const item of content.manufacturingPresets) values.push(item.markupRate, item.freightAmount);
  if (content.globalSettings) {
    values.push(content.globalSettings.defaultUsdCnyRate, content.globalSettings.defaultMarkupRate);
    addOther(content.globalSettings.defaultOtherCost);
  }
  return {
    fields: values.length,
    nulls: values.filter((value) => value === null).length,
    zeroes: values.filter((value) => value === "0").length,
    canonicalStrings: values.filter((value) => value !== null).length,
  };
}

export async function readQuoteMasterSettingsRowCounts(db: Pick<Pool | PoolClient, "query">): Promise<QuoteMasterSettingsRowCounts> {
  const result = await db.query<{
    brands: number; customer_salespeople: number; fabrics: number; trims: number; manufacturing_presets: number;
    brand_default_trims: number; salesperson_default_trims: number; global_settings: number;
  }>(`SELECT
    (SELECT count(*)::int FROM quote_master_brands) AS brands,
    (SELECT count(*)::int FROM quote_master_customer_salespeople) AS customer_salespeople,
    (SELECT count(*)::int FROM quote_master_fabrics) AS fabrics,
    (SELECT count(*)::int FROM quote_master_trims) AS trims,
    (SELECT count(*)::int FROM quote_manufacturing_presets) AS manufacturing_presets,
    (SELECT count(*)::int FROM quote_master_default_trim_configs WHERE brand_id IS NOT NULL) AS brand_default_trims,
    (SELECT count(*)::int FROM quote_master_default_trim_configs WHERE customer_salesperson_id IS NOT NULL) AS salesperson_default_trims,
    (SELECT count(*)::int FROM quote_global_settings) AS global_settings`);
  const row = result.rows[0];
  const counts = {
    brands: row.brands,
    customerSalespeople: row.customer_salespeople,
    fabrics: row.fabrics,
    trims: row.trims,
    manufacturingPresets: row.manufacturing_presets,
    brandDefaultTrims: row.brand_default_trims,
    salespersonDefaultTrims: row.salesperson_default_trims,
    globalSettings: row.global_settings,
    total: 0,
  };
  counts.total = Object.entries(counts).filter(([key]) => key !== "total").reduce((sum, [, count]) => sum + count, 0);
  return counts;
}

function stripDefaults(value: QuoteDefaultsDto): MigrationDefaults {
  return {
    defaultUsdCnyRate: value.defaultUsdCnyRate,
    defaultOtherCost: value.defaultOtherCost,
    defaultTrims: value.defaultTrims.map((item) => ({ ...item })),
  };
}

export async function readQuoteMasterSettingsMigrationContent(pool: Pool | PoolClient): Promise<QuoteMasterSettingsMigrationContent> {
  const [brands, salespeople, fabrics, trims, presets, settings] = await Promise.all([
    repository.listBrands(pool),
    repository.listSalespeople(pool),
    repository.listFabrics(pool),
    repository.listTrims(pool),
    repository.listPresets(pool),
    repository.getGlobalSettings(pool),
  ]);
  return {
    brands: sortById(brands.map((item) => ({ id: item.id, name: item.name, status: item.status, defaults: stripDefaults(item.defaults) }))),
    customerSalespeople: sortById(salespeople.map((item) => ({ id: item.id, name: item.name, brandId: item.brandId, status: item.status, defaults: stripDefaults(item.defaults) }))),
    fabrics: sortById(fabrics.map((item) => ({
      id: item.id, name: item.name, composition: item.composition, netWidthCm: item.netWidthCm,
      gsm: item.gsm, defaultLossRate: item.defaultLossRate, supplier: item.supplier,
      unitPrice: item.unitPrice, purchaseUnit: item.purchaseUnit,
    }))),
    trims: sortById(trims.map((item) => ({
      id: item.id, name: item.name, specification: item.specification, supplier: item.supplier,
      unit: item.unit, defaultLossRate: item.defaultLossRate, unitPrice: item.unitPrice,
    }))),
    manufacturingPresets: sortById(presets.map((item) => ({
      id: item.id, name: item.name, country: item.country, laborCurrency: item.laborCurrency,
      markupRate: item.markupRate, includeFreight: item.includeFreight, freightName: item.freightName,
      freightAmount: item.freightAmount, status: item.status,
    }))),
    globalSettings: settings === null ? null : {
      defaultUsdCnyRate: settings.defaultUsdCnyRate,
      defaultMarkupRate: settings.defaultMarkupRate,
      defaultLaborCurrency: settings.defaultLaborCurrency,
      defaultLaborDescription: settings.defaultLaborDescription,
      defaultOtherCost: settings.defaultOtherCost,
      defaultManufacturingPresetId: settings.defaultManufacturingPresetId,
    },
  };
}

async function assertEmptyTarget(client: PoolClient): Promise<void> {
  const counts = await readQuoteMasterSettingsRowCounts(client);
  if (counts.total !== 0) {
    throw new QuoteMasterSettingsMigrationError("target_not_empty", "Quote master/settings import requires an empty target");
  }
}

export async function importQuoteMasterSettingsProjection(
  pool: Pool,
  report: MasterSettingsBackupPreviewReport,
  options: { intentionalFailureAfterBrands?: boolean; intentionalPostCommitReadbackFailure?: boolean } = {},
): Promise<QuoteMasterSettingsImportResult> {
  const content = migrationContentFromPreview(report);
  const projectionContentHash = migrationContentHash(content);
  const client = await pool.connect();
  let committedCounts: QuoteMasterSettingsRowCounts | null = null;
  let commitAttempted = false;
  try {
    await client.query("BEGIN");
    try {
      await client.query("SELECT pg_advisory_xact_lock($1::bigint)", ["873215970215"]);
      await assertEmptyTarget(client);

      for (const item of content.brands) {
        await repository.insertBrand(client, {
          ...item,
          normalizedName: normalizeMasterName(item.name),
          defaults: { ...item.defaults, defaultTrims: [] },
        });
      }
      if (options.intentionalFailureAfterBrands) {
        throw new QuoteMasterSettingsMigrationError("intentional_rehearsal_failure", "Intentional disposable rollback rehearsal");
      }
      for (const item of content.fabrics) await repository.insertFabric(client, { ...item, normalizedName: normalizeMasterName(item.name) });
      for (const item of content.trims) await repository.insertTrim(client, { ...item, normalizedName: normalizeMasterName(item.name) });
      for (const item of content.customerSalespeople) {
        await repository.insertSalesperson(client, {
          ...item,
          normalizedName: normalizeMasterName(item.name),
          defaults: { ...item.defaults, defaultTrims: [] },
        });
      }
      for (const item of content.manufacturingPresets) await repository.insertPreset(client, item);
      for (const item of content.brands) {
        await repository.replaceDefaultTrims(client, { kind: "brand", id: item.id }, item.defaults.defaultTrims, item.defaults.defaultTrims.map((trim) => trim.id));
      }
      for (const item of content.customerSalespeople) {
        await repository.replaceDefaultTrims(client, { kind: "salesperson", id: item.id }, item.defaults.defaultTrims, item.defaults.defaultTrims.map((trim) => trim.id));
      }
      if (content.globalSettings) {
        const saved = await repository.writeGlobalSettings(client, { expectedVersion: 0, ...content.globalSettings });
        if (!saved) throw new QuoteMasterSettingsMigrationError("invalid_projection", "Global settings insert failed");
      }
      const inTransactionContentHash = migrationContentHash(await readQuoteMasterSettingsMigrationContent(client));
      const inTransactionCounts = await readQuoteMasterSettingsRowCounts(client);
      const expectedCounts = report.preview.projectedServerRows;
      if (inTransactionContentHash !== projectionContentHash ||
        (["brands", "customerSalespeople", "fabrics", "trims", "manufacturingPresets", "brandDefaultTrims", "salespersonDefaultTrims", "globalSettings", "total"] as const)
          .some((key) => inTransactionCounts[key] !== expectedCounts[key])) {
        throw new QuoteMasterSettingsMigrationError("reconciliation_failed", "Imported target differs from Preview projection");
      }
      commitAttempted = true;
      await client.query("COMMIT");
      committedCounts = inTransactionCounts;
    } catch (error) {
      if (commitAttempted) throw new QuoteMasterSettingsCommitUnknownError(error);
      await client.query("ROLLBACK");
      throw error;
    }
  } finally {
    client.release();
  }

  try {
    if (options.intentionalPostCommitReadbackFailure) throw new Error("intentional_disposable_post_commit_readback_failure");
    const postgresContent = await readQuoteMasterSettingsMigrationContent(pool);
    const postgresContentHash = migrationContentHash(postgresContent);
    const rowCounts = await readQuoteMasterSettingsRowCounts(pool);
    if (postgresContentHash !== projectionContentHash || !committedCounts ||
      (Object.keys(rowCounts) as Array<keyof QuoteMasterSettingsRowCounts>).some((key) => rowCounts[key] !== committedCounts[key])) {
      throw new Error("post_commit_reconciliation_mismatch");
    }
    return {
      rowCounts,
      projectionContentHash,
      postgresContentHash,
      contentHashesEqual: true,
      decimalEvidence: decimalEvidence(postgresContent),
    };
  } catch (cause) {
    if (!committedCounts) throw cause;
    throw new QuoteMasterSettingsPostCommitError(committedCounts, cause);
  }
}

export async function inspectDefaultTrimSchema(pool: Pool): Promise<{ columns: string[]; exact: boolean; quantity: boolean; usage: boolean }> {
  const rows = await pool.query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema='public' AND table_name='quote_master_default_trim_configs'
     ORDER BY ordinal_position`,
  );
  const columns = rows.rows.map((row) => row.column_name);
  const expected = ["id", "brand_id", "customer_salesperson_id", "position", "trim_library_item_id", "override_loss_rate", "override_unit_price"];
  return {
    columns,
    exact: JSON.stringify(columns) === JSON.stringify(expected),
    quantity: columns.includes("quantity"),
    usage: columns.includes("usage"),
  };
}
