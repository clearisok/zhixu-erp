import { resolve } from "node:path";
import pg from "pg";
import type { MasterSettingsBackupPreviewReport } from "../../features/basic-settings/server/master-settings-backup-preview.js";
import { discoverMigrations, inspectMigrationStatus, runMigrations } from "../db/migration-runner.js";
import {
  importQuoteMasterSettingsProjection,
  inspectDefaultTrimSchema,
  migrationContentFromPreview,
  QuoteMasterSettingsMigrationError,
  readQuoteMasterSettingsRowCounts,
  type QuoteMasterSettingsRowCounts,
} from "./quote-master-settings-migration-import.js";
import { startDisposablePostgres } from "./postgres-container.js";

const { Pool } = pg;
const migrationsDirectory = resolve("database/migrations");

type SafetyCounts = {
  quotes: number;
  salesOrders: number;
  operationLogs: number;
};

export type QuoteMasterSettingsRehearsalReport = {
  sourceHash: string;
  expectedSourceHash: string;
  sourceHashMatches: boolean;
  blockingErrors: number;
  sensitiveFields: number;
  postgresVersion: string;
  migrations: {
    applied: string[];
    ledgerApplied: string[];
    pending: string[];
    migration0007Checksum: string;
    through0007: boolean;
  };
  tablesPresent: boolean;
  initialCounts: QuoteMasterSettingsRowCounts;
  rollback: { triggered: boolean; counts: QuoteMasterSettingsRowCounts };
  import: Awaited<ReturnType<typeof importQuoteMasterSettingsProjection>>;
  secondImport: { failedClosed: boolean; code: string | null };
  schema: Awaited<ReturnType<typeof inspectDefaultTrimSchema>>;
  reconciliation: {
    stableIdsPreserved: boolean;
    brokenSalespersonBrandReferences: number;
    brokenDefaultTrimReferences: number;
    invalidDefaultTrimOwnerScopes: number;
    invalidDefaultOtherCostRows: number;
    inactiveOrMissingDefaultPresetReferences: number;
    defaultPresetId: string | null;
    defaultPresetActiveOrNull: boolean;
  };
  duplicateEvidence: {
    fabricIds: string[];
    trimIds: string[];
  };
  legacySystemDefaults: {
    targetAuthority: "quote-global-settings";
    excludedDecimalFields: string[];
    differingFields: string[];
  };
  safety: {
    before: SafetyCounts;
    after: SafetyCounts;
    unchanged: boolean;
    browserWrites: 0;
    realPostgresReads: 0;
    realPostgresWrites: 0;
  };
  disposed: boolean;
  ready: boolean;
  failures: string[];
};

function legacySystemDefaultsEvidence(report: MasterSettingsBackupPreviewReport): QuoteMasterSettingsRehearsalReport["legacySystemDefaults"] {
  const basic = report.preview.projection.basicSettings.systemDefaults ?? {};
  const global = report.preview.projection.globalQuoteSettings ?? {};
  const comparisons = [
    ["usdCnyRate", "defaultUsdCnyRate"],
    ["markupRate", "defaultMarkupRate"],
    ["laborCurrency", "defaultLaborCurrency"],
    ["defaultOtherCost", "defaultOtherCost"],
  ] as const;
  return {
    targetAuthority: "quote-global-settings",
    excludedDecimalFields: ["basicSettings.systemDefaults.usdCnyRate", "basicSettings.systemDefaults.markupRate"],
    differingFields: comparisons
      .filter(([basicField, globalField]) => JSON.stringify(basic[basicField]) !== JSON.stringify(global[globalField]))
      .map(([basicField]) => basicField),
  };
}

async function safetyCounts(pool: pg.Pool): Promise<SafetyCounts> {
  const result = await pool.query<{ quotes: number; sales_orders: number; operation_logs: number }>(`SELECT
    (SELECT count(*)::int FROM quote_center_quotes) AS quotes,
    (SELECT count(*)::int FROM sales_orders) AS sales_orders,
    (SELECT count(*)::int FROM operation_logs) AS operation_logs`);
  return {
    quotes: result.rows[0].quotes,
    salesOrders: result.rows[0].sales_orders,
    operationLogs: result.rows[0].operation_logs,
  };
}

async function applyAndVerifyMigrations(pool: pg.Pool): Promise<QuoteMasterSettingsRehearsalReport["migrations"]> {
  const run = await runMigrations(pool, migrationsDirectory);
  const status = await inspectMigrationStatus(pool, migrationsDirectory);
  const discovered = await discoverMigrations(migrationsDirectory);
  const migration0007 = discovered.find((item) => item.filename === "0007_quote_master_settings.sql");
  if (!migration0007) throw new Error("Migration 0007 is missing");
  return {
    applied: run.applied,
    ledgerApplied: status.applied,
    pending: status.pending,
    migration0007Checksum: migration0007.checksum,
    through0007: status.pending.length === 0 && status.applied.includes(migration0007.filename),
  };
}

async function targetTablesPresent(pool: pg.Pool): Promise<boolean> {
  const tables = [
    "quote_master_brands",
    "quote_master_customer_salespeople",
    "quote_master_fabrics",
    "quote_master_trims",
    "quote_master_default_trim_configs",
    "quote_manufacturing_presets",
    "quote_global_settings",
  ];
  const result = await pool.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema='public' AND table_name = ANY($1::text[])`,
    [tables],
  );
  return result.rows.length === tables.length;
}

async function reconciliation(pool: pg.Pool, report: MasterSettingsBackupPreviewReport): Promise<QuoteMasterSettingsRehearsalReport["reconciliation"]> {
  const expected = migrationContentFromPreview(report);
  const expectedIds = [
    ...expected.brands.map((item) => `brand:${item.id}`),
    ...expected.customerSalespeople.map((item) => `salesperson:${item.id}`),
    ...expected.fabrics.map((item) => `fabric:${item.id}`),
    ...expected.trims.map((item) => `trim:${item.id}`),
    ...expected.manufacturingPresets.map((item) => `preset:${item.id}`),
    ...expected.brands.flatMap((item) => item.defaults.defaultTrims.map((trim) => `brand-trim:${item.id}:${trim.id}`)),
    ...expected.customerSalespeople.flatMap((item) => item.defaults.defaultTrims.map((trim) => `salesperson-trim:${item.id}:${trim.id}`)),
  ].sort();
  const actualIds = await pool.query<{ identity: string }>(`SELECT identity FROM (
    SELECT 'brand:'||id AS identity FROM quote_master_brands
    UNION ALL SELECT 'salesperson:'||id FROM quote_master_customer_salespeople
    UNION ALL SELECT 'fabric:'||id FROM quote_master_fabrics
    UNION ALL SELECT 'trim:'||id FROM quote_master_trims
    UNION ALL SELECT 'preset:'||id FROM quote_manufacturing_presets
    UNION ALL SELECT 'brand-trim:'||brand_id||':'||id FROM quote_master_default_trim_configs WHERE brand_id IS NOT NULL
    UNION ALL SELECT 'salesperson-trim:'||customer_salesperson_id||':'||id FROM quote_master_default_trim_configs WHERE customer_salesperson_id IS NOT NULL
  ) identities ORDER BY identity`);
  const checks = await pool.query<{
    broken_salesperson_brand_references: number;
    broken_default_trim_references: number;
    invalid_default_trim_owner_scopes: number;
    invalid_default_other_cost_rows: number;
    invalid_default_preset_references: number;
    default_preset_id: string | null;
  }>(`SELECT
    (SELECT count(*)::int FROM quote_master_customer_salespeople s LEFT JOIN quote_master_brands b ON b.id=s.brand_id WHERE b.id IS NULL) AS broken_salesperson_brand_references,
    (SELECT count(*)::int FROM quote_master_default_trim_configs d LEFT JOIN quote_master_trims t ON t.id=d.trim_library_item_id WHERE t.id IS NULL) AS broken_default_trim_references,
    (SELECT count(*)::int FROM quote_master_default_trim_configs WHERE num_nonnulls(brand_id,customer_salesperson_id)<>1) AS invalid_default_trim_owner_scopes,
    ((SELECT count(*)::int FROM quote_master_brands WHERE default_other_cost_name IS NULL AND default_other_cost_amount IS NOT NULL)
      +(SELECT count(*)::int FROM quote_master_customer_salespeople WHERE default_other_cost_name IS NULL AND default_other_cost_amount IS NOT NULL)
      +(SELECT count(*)::int FROM quote_global_settings WHERE default_other_cost_name IS NULL AND default_other_cost_amount IS NOT NULL)) AS invalid_default_other_cost_rows,
    (SELECT count(*)::int FROM quote_global_settings g LEFT JOIN quote_manufacturing_presets p ON p.id=g.default_manufacturing_preset_id
      WHERE g.default_manufacturing_preset_id IS NOT NULL AND (p.id IS NULL OR p.status<>'active')) AS invalid_default_preset_references,
    (SELECT default_manufacturing_preset_id FROM quote_global_settings WHERE singleton_id=1) AS default_preset_id`);
  const row = checks.rows[0];
  return {
    stableIdsPreserved: JSON.stringify(expectedIds) === JSON.stringify(actualIds.rows.map((item) => item.identity)),
    brokenSalespersonBrandReferences: row.broken_salesperson_brand_references,
    brokenDefaultTrimReferences: row.broken_default_trim_references,
    invalidDefaultTrimOwnerScopes: row.invalid_default_trim_owner_scopes,
    invalidDefaultOtherCostRows: row.invalid_default_other_cost_rows,
    inactiveOrMissingDefaultPresetReferences: row.invalid_default_preset_references,
    defaultPresetId: row.default_preset_id,
    defaultPresetActiveOrNull: row.invalid_default_preset_references === 0,
  };
}

async function duplicateEvidence(pool: pg.Pool): Promise<QuoteMasterSettingsRehearsalReport["duplicateEvidence"]> {
  const [fabrics, trims] = await Promise.all([
    pool.query<{ id: string }>("SELECT id FROM quote_master_fabrics WHERE id = ANY($1::text[]) ORDER BY id", [["fabric-combed-cotton-a", "fabric-combed-cotton-b"]]),
    pool.query<{ id: string }>("SELECT id FROM quote_master_trims WHERE id = ANY($1::text[]) ORDER BY id", [["trim-main-label", "trim-main-label-alt", "trim-1788857901655-sdpid", "trim-1789096865139-sog2v"]]),
  ]);
  return { fabricIds: fabrics.rows.map((item) => item.id), trimIds: trims.rows.map((item) => item.id) };
}

export async function runQuoteMasterSettingsDisposableRehearsal(
  report: MasterSettingsBackupPreviewReport,
  expectedSourceHash: string,
): Promise<QuoteMasterSettingsRehearsalReport> {
  if (report.sourceHash !== expectedSourceHash || report.preview.blockingErrors.length || report.sensitiveFieldPaths.length) {
    throw new QuoteMasterSettingsMigrationError("preview_rejected", "Backup identity or Preview safety gate failed");
  }

  let disposable: Awaited<ReturnType<typeof startDisposablePostgres>> | null = null;
  let successPool: pg.Pool | null = null;
  let failurePool: pg.Pool | null = null;
  let result: QuoteMasterSettingsRehearsalReport | null = null;
  try {
    disposable = await startDisposablePostgres();
    const [successUrl, failureUrl] = await Promise.all([
      disposable.createDatabase("quote_master_settings_rehearsal"),
      disposable.createDatabase("quote_master_settings_rollback"),
    ]);
    successPool = new Pool({ connectionString: successUrl, max: 4 });
    failurePool = new Pool({ connectionString: failureUrl, max: 2 });
    const migrations = await applyAndVerifyMigrations(successPool);
    await applyAndVerifyMigrations(failurePool);
    const postgresVersion = (await successPool.query<{ server_version: string }>("SHOW server_version")).rows[0].server_version;
    const tablesPresent = await targetTablesPresent(successPool);
    const initialCounts = await readQuoteMasterSettingsRowCounts(successPool);
    const safetyBefore = await safetyCounts(successPool);

    let rollbackTriggered = false;
    try {
      await importQuoteMasterSettingsProjection(failurePool, report, { intentionalFailureAfterBrands: true });
    } catch (error) {
      rollbackTriggered = error instanceof QuoteMasterSettingsMigrationError && error.code === "intentional_rehearsal_failure";
      if (!rollbackTriggered) throw error;
    }
    const rollbackCounts = await readQuoteMasterSettingsRowCounts(failurePool);

    const imported = await importQuoteMasterSettingsProjection(successPool, report);
    let secondImportCode: string | null = null;
    try {
      await importQuoteMasterSettingsProjection(successPool, report);
    } catch (error) {
      if (error instanceof QuoteMasterSettingsMigrationError) secondImportCode = error.code;
      else throw error;
    }
    const schema = await inspectDefaultTrimSchema(successPool);
    const reconciled = await reconciliation(successPool, report);
    const duplicates = await duplicateEvidence(successPool);
    const safetyAfter = await safetyCounts(successPool);
    const expectedCounts = report.preview.projectedServerRows;
    const failures = [
      !postgresVersion.startsWith("16.") && "PostgreSQL is not version 16",
      !migrations.through0007 && "Migration ledger is not current through 0007",
      !tablesPresent && "Q3 target tables are missing",
      initialCounts.total !== 0 && "Q3 target was not initially empty",
      !rollbackTriggered && "Intentional rollback did not trigger",
      rollbackCounts.total !== 0 && "Intentional rollback left target rows",
      !imported.contentHashesEqual && "Projection/PostgreSQL content differs",
      !secondImportCode || secondImportCode !== "target_not_empty" ? "Second import did not fail closed" : false,
      !schema.exact && "DefaultTrim target schema differs",
      !reconciled.stableIdsPreserved && "Stable IDs changed",
      reconciled.brokenSalespersonBrandReferences !== 0 && "Salesperson Brand FK differs",
      reconciled.brokenDefaultTrimReferences !== 0 && "DefaultTrim reference differs",
      reconciled.invalidDefaultTrimOwnerScopes !== 0 && "DefaultTrim owner scope differs",
      reconciled.invalidDefaultOtherCostRows !== 0 && "DefaultOtherCost is invalid",
      reconciled.inactiveOrMissingDefaultPresetReferences !== 0 && "Default preset is inactive or missing",
      JSON.stringify(safetyBefore) !== JSON.stringify(safetyAfter) && "Quote/SalesOrder/OperationLog state changed",
      ...(["brands", "customerSalespeople", "fabrics", "trims", "manufacturingPresets", "brandDefaultTrims", "salespersonDefaultTrims", "globalSettings", "total"] as const)
        .map((key) => imported.rowCounts[key] !== expectedCounts[key] && `${key} row count differs`),
    ].filter((value): value is string => typeof value === "string");

    result = {
      sourceHash: report.sourceHash,
      expectedSourceHash,
      sourceHashMatches: report.sourceHash === expectedSourceHash,
      blockingErrors: report.preview.blockingErrors.length,
      sensitiveFields: report.sensitiveFieldPaths.length,
      postgresVersion,
      migrations,
      tablesPresent,
      initialCounts,
      rollback: { triggered: rollbackTriggered, counts: rollbackCounts },
      import: imported,
      secondImport: { failedClosed: secondImportCode === "target_not_empty", code: secondImportCode },
      schema,
      reconciliation: reconciled,
      duplicateEvidence: duplicates,
      legacySystemDefaults: legacySystemDefaultsEvidence(report),
      safety: {
        before: safetyBefore,
        after: safetyAfter,
        unchanged: JSON.stringify(safetyBefore) === JSON.stringify(safetyAfter),
        browserWrites: 0,
        realPostgresReads: 0,
        realPostgresWrites: 0,
      },
      disposed: false,
      ready: failures.length === 0,
      failures,
    };
  } finally {
    if (successPool) await successPool.end().catch(() => undefined);
    if (failurePool) await failurePool.end().catch(() => undefined);
    if (disposable) {
      await disposable.stop();
    }
  }
  if (!result) throw new Error("Disposable rehearsal did not produce a result");
  result.disposed = true;
  return result;
}
