import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { previewMasterSettingsBackup } from "../../features/basic-settings/server/master-settings-backup-preview.js";
import { migrationContentFromPreview, QuoteMasterSettingsMigrationError } from "./quote-master-settings-migration-import.js";
import { runQuoteMasterSettingsDisposableRehearsal } from "./quote-master-settings-rehearsal.js";

const namespace = "zhixu.erp.synthetic-q3b2c";
const envelope = (data: Record<string, unknown>) => JSON.stringify({
  schemaVersion: 13,
  initializedAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-20T00:00:00.000Z",
  data,
});

function backupFixture(options: { inactiveDefault?: boolean } = {}): unknown {
  return {
    product: "zhixu-erp",
    backupVersion: 1,
    schemaVersion: 13,
    createdAt: "2026-09-22T03:16:14.008Z",
    environment: "test",
    origin: "http://127.0.0.1:3001",
    namespace,
    localRecords: {
      [`${namespace}.basic-settings`]: envelope({
        brands: [
          {
            id: "brand-a", name: "Brand A", status: "active",
            defaults: {
              defaultUsdCnyRate: 7.1,
              defaultOtherCost: { name: "Inspection", amount: 0 },
              defaultTrims: [{ id: "brand-trim-a", trimLibraryItemId: "trim-a", quantity: 3, overrideLossRate: null, overrideUnitPrice: 0 }],
            },
          },
          { id: "brand-b", name: "Brand B", status: "inactive", defaults: { defaultUsdCnyRate: null, defaultTrims: [], costs: [{ name: "Legacy first", amount: 0, enabled: true }, { name: "Legacy second", amount: 5, enabled: true }] } },
        ],
        customerSalespeople: [{
          id: "sales-a", name: "Sales A", brandId: "brand-a", status: "active",
          defaults: {
            defaultUsdCnyRate: 0,
            defaultOtherCost: null,
            defaultTrims: [{ id: "sales-trim-b", trimLibraryItemId: "trim-b", overrideLossRate: 0.25, overrideUnitPrice: null }],
          },
        }],
        fabricLibrary: [
          { id: "fabric-a", name: "Duplicate Fabric", composition: "Cotton", netWidthCm: 140, gsm: 180, defaultLossRate: 0, supplier: "Supplier A", unitPrice: 12.5, purchaseUnit: "kg", createdAt: "2026-01-01", updatedAt: "2026-01-01" },
          { id: "fabric-b", name: "Duplicate Fabric", composition: "Cotton", netWidthCm: null, gsm: 0, defaultLossRate: 3, supplier: "Supplier B", unitPrice: null, purchaseUnit: "meter", createdAt: "2026-01-01", updatedAt: "2026-01-01" },
        ],
        trimLibrary: [
          { id: "trim-a", name: "Duplicate Trim", specification: "A", supplier: "Supplier A", unit: "piece", defaultLossRate: 0, unitPrice: 0.1, createdAt: "2026-01-01", updatedAt: "2026-01-01" },
          { id: "trim-b", name: "Duplicate Trim", specification: "B", supplier: "Supplier B", unit: "piece", defaultLossRate: null, unitPrice: 0, createdAt: "2026-01-01", updatedAt: "2026-01-01" },
        ],
        systemDefaults: { usdCnyRate: 6.9, markupRate: 2, laborCurrency: "CNY", defaultOtherCost: null },
      }),
      [`${namespace}.quote-global-settings`]: envelope({
        defaultUsdCnyRate: 7.2,
        defaultMarkupRate: 0,
        defaultLaborCurrency: "CNY",
        defaultLaborDescription: "Sewing",
        defaultOtherCost: null,
        defaultManufacturingPresetId: options.inactiveDefault ? "preset-b" : "preset-a",
        manufacturingPresets: [
          { id: "preset-a", name: "China", country: "China", laborCurrency: "CNY", markupRate: 0, includeFreight: false, freightName: "Freight", freightAmount: null },
          { id: "preset-b", name: "Vietnam", country: "Vietnam", laborCurrency: "USD", markupRate: null, includeFreight: true, freightName: "Freight", freightAmount: 1.5, status: "inactive" },
        ],
      }),
    },
    attachments: [],
    templates: [],
  };
}

test("Q3B2C Preview projection is the only import input and legacy preset status remains active", async () => {
  const preview = await previewMasterSettingsBackup(backupFixture());
  const content = migrationContentFromPreview(preview);
  assert.equal(preview.preview.blockingErrors.length, 0);
  assert.equal(preview.sensitiveFieldPaths.length, 0);
  assert.equal(content.manufacturingPresets.find((item) => item.id === "preset-a")?.status, "active");
  assert.equal(content.brands[0].defaults.defaultTrims[0].id, "brand-trim-a");
  assert.equal(Object.hasOwn(content.brands[0].defaults.defaultTrims[0], "quantity"), false);
  assert.equal(content.fabrics[0].unitPrice, "12.5");
  assert.equal(content.fabrics[1].unitPrice, null);
  assert.equal(preview.preview.legacyMultipleDefaultCostCollapseCount, 1);
  assert.deepEqual(content.brands.find((item) => item.id === "brand-b")?.defaults.defaultOtherCost, { name: "Legacy first", amount: "0" });
});

test("Q3B2C refuses a source-hash mismatch before disposable PostgreSQL starts", async () => {
  const preview = await previewMasterSettingsBackup(backupFixture());
  await assert.rejects(
    () => runQuoteMasterSettingsDisposableRehearsal(preview, "0".repeat(64)),
    (error: unknown) => error instanceof QuoteMasterSettingsMigrationError && error.code === "preview_rejected",
  );
});

test("Q3B2C imports atomically into disposable PostgreSQL and exactly reconciles read-back", async () => {
  const preview = await previewMasterSettingsBackup(backupFixture());
  const report = await runQuoteMasterSettingsDisposableRehearsal(preview, preview.sourceHash);
  assert.equal(report.postgresVersion.split(".")[0], "16");
  assert.equal(report.migrations.through0007, true);
  assert.equal(report.migrations.pending.length, 0);
  assert.ok(report.migrations.ledgerApplied.includes("0007_quote_master_settings.sql"));
  assert.equal(report.tablesPresent, true);
  assert.equal(report.initialCounts.total, 0);
  assert.equal(report.rollback.triggered, true);
  assert.equal(report.rollback.counts.total, 0);
  assert.equal(report.secondImport.failedClosed, true);
  assert.equal(report.secondImport.code, "target_not_empty");
  assert.deepEqual(report.import.rowCounts, {
    brands: 2,
    customerSalespeople: 1,
    fabrics: 2,
    trims: 2,
    manufacturingPresets: 2,
    brandDefaultTrims: 1,
    salespersonDefaultTrims: 1,
    globalSettings: 1,
    total: 12,
  });
  assert.equal(report.import.contentHashesEqual, true);
  assert.equal(report.import.projectionContentHash, report.import.postgresContentHash);
  assert.deepEqual(report.legacySystemDefaults.differingFields, ["usdCnyRate", "markupRate"]);
  assert.equal(report.legacySystemDefaults.targetAuthority, "quote-global-settings");
  assert.equal(report.reconciliation.stableIdsPreserved, true);
  assert.equal(report.reconciliation.brokenSalespersonBrandReferences, 0);
  assert.equal(report.reconciliation.brokenDefaultTrimReferences, 0);
  assert.equal(report.reconciliation.invalidDefaultTrimOwnerScopes, 0);
  assert.equal(report.reconciliation.invalidDefaultOtherCostRows, 0);
  assert.equal(report.reconciliation.inactiveOrMissingDefaultPresetReferences, 0);
  assert.equal(report.reconciliation.defaultPresetId, "preset-a");
  assert.equal(report.schema.exact, true);
  assert.equal(report.schema.quantity, false);
  assert.equal(report.schema.usage, false);
  assert.equal(report.safety.unchanged, true);
  assert.deepEqual(report.safety.after, { quotes: 0, salesOrders: 0, operationLogs: 0 });
  assert.equal(report.disposed, true);
  assert.equal(report.ready, true);
  assert.deepEqual(report.failures, []);
});

test("Q3B2C D-090 clears an inactive default before disposable import", async () => {
  const preview = await previewMasterSettingsBackup(backupFixture({ inactiveDefault: true }));
  assert.equal(preview.preview.inactiveManufacturingPresetDefault, "preset-b");
  assert.equal(preview.preview.blockingErrors.length, 0);
  const report = await runQuoteMasterSettingsDisposableRehearsal(preview, preview.sourceHash);
  assert.equal(report.ready, true);
  assert.equal(report.reconciliation.defaultPresetId, null);
  assert.equal(report.reconciliation.inactiveOrMissingDefaultPresetReferences, 0);
});

test("Q3B2C runner exposes no external database selector and importer has no runtime writer authority", async () => {
  const [runner, rehearsal, importer] = await Promise.all([
    readFile("scripts/rehearse-quote-master-settings.ts", "utf8"),
    readFile("server/integration/quote-master-settings-rehearsal.ts", "utf8"),
    readFile("server/integration/quote-master-settings-migration-import.ts", "utf8"),
  ]);
  assert.doesNotMatch(runner, /DATABASE_URL|process\.env|--database|--postgres|--connection/iu);
  assert.doesNotMatch(rehearsal, /DATABASE_URL|process\.env/iu);
  assert.doesNotMatch(importer, /randomUUID|fetch\(|operation_logs|quote_center_quotes|sales_orders/iu);
});
