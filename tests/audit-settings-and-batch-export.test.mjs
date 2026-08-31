import assert from "node:assert/strict";
import test from "node:test";

import { defaultBasicSettings } from "../features/basic-settings/model/basic-settings.ts";
import {
  createBasicSettingsOperationLogs,
  createBatchExportQuoteSnapshots,
  createGlobalQuoteSettingsOperationLogs,
  createQuoteOperationLogs,
} from "../features/operation-logs/index.ts";
import { quoteFixtures } from "../features/quote-center/fixtures/quote-fixtures.ts";
import { defaultGlobalQuoteSettings } from "../features/quote-center/model/quote-settings.ts";

const actor = { userId: "admin", userName: "系统管理员" };
const clone = (value) => structuredClone(value);

test("品牌和客户业务员 CRUD/default/fixed trim changes use field-level OperationLog changes", () => {
  const before = clone(defaultBasicSettings);
  const after = clone(before);
  after.brands[0].defaults.defaultUsdCnyRate = 6.8;
  after.brands[0].defaults.defaultTrims[0].overrideUnitPrice = 0.42;
  after.customerSalespeople.push({
    id: "sales-yangzhan",
    name: "杨展",
    brandId: after.brands[0].id,
    status: "active",
    defaults: { defaultUsdCnyRate: null, defaultTrims: [], defaultOtherCost: null },
  });
  const logs = createBasicSettingsOperationLogs(before, after, actor, "2026-08-26T12:00:00.000Z", "operation-master-data");
  const brand = logs.find((log) => log.entityType === "Brand");
  const salesperson = logs.find((log) => log.entityId === "sales-yangzhan");
  assert.equal(brand.action, "修改品牌");
  assert.equal(brand.afterData.brandId, before.brands[0].id);
  assert.equal(brand.afterData.brandName, before.brands[0].name);
  assert.ok(brand.changes.some((change) => change.field === "默认 USD/CNY 汇率" && change.afterValue === 6.8));
  assert.ok(brand.changes.some((change) => change.field.includes("固定辅料") && change.field.includes("覆盖单价") && change.afterValue === 0.42));
  assert.equal(salesperson.action, "新增客户业务员");
  assert.equal(salesperson.afterData.salespersonId, "sales-yangzhan");
  assert.equal(salesperson.afterData.brandId, after.brands[0].id);
  assert.ok(logs.every((log) => log.operationId === "operation-master-data"));
});

test("global quote settings and manufacturing preset changes are distinct audit events", () => {
  const before = clone(defaultGlobalQuoteSettings);
  const after = clone(before);
  after.defaultUsdCnyRate = 6.8;
  after.defaultManufacturingPresetId = "preset-cambodia";
  after.manufacturingPresets.find((preset) => preset.id === "preset-cambodia").markupRate = 7;
  const logs = createGlobalQuoteSettingsOperationLogs(before, after, actor, "2026-08-26T12:00:00.000Z", "operation-settings");
  assert.ok(logs.some((log) => log.action === "修改报价设置" && log.changes.some((change) => change.field === "默认 USD/CNY 汇率")));
  assert.ok(logs.some((log) => log.action === "修改默认制作预设"));
  const preset = logs.find((log) => log.action === "修改制作预设");
  assert.equal(preset.entityId, "preset-cambodia");
  assert.equal(preset.afterData.presetName, after.manufacturingPresets.find((item) => item.id === "preset-cambodia").name);
  assert.ok(preset.changes.some((change) => change.field === "成本加成率" && change.beforeValue === 5 && change.afterValue === 7));
});

test("PriceVersion preset selection records quote/revision/version and both preset snapshots", () => {
  const before = clone(quoteFixtures[0]);
  const after = clone(before);
  const revision = after.revisions.find((item) => item.revisionId === after.defaultRevisionId);
  const version = revision.priceVersions[0];
  const previousPresetId = version.pricingParameters.manufacturingPresetId;
  version.pricingParameters = {
    ...version.pricingParameters,
    manufacturingPresetId: "preset-china",
    manufacturingPresetName: "中国制作",
    manufacturingCountry: "中国",
    laborCurrency: "CNY",
    markupRate: 13,
  };
  const log = createQuoteOperationLogs(before, after, actor).find((item) => item.action === "修改价格版本制作预设");
  assert.ok(log);
  assert.equal(log.quoteId, after.id);
  assert.equal(log.afterData.revisionId, revision.revisionId);
  assert.equal(log.afterData.priceVersionId, version.id);
  assert.equal(log.beforeData.beforePresetId, previousPresetId);
  assert.equal(log.afterData.afterPresetId, "preset-china");
  assert.ok(log.changes.some((change) => change.field === "制作预设"));
});

test("batch export stores complete minimal quote and PriceVersion business snapshots", () => {
  const snapshots = createBatchExportQuoteSnapshots(quoteFixtures);
  assert.equal(snapshots.length, quoteFixtures.length);
  assert.ok(snapshots.every((item) => item.quoteId && item.revisionId && Array.isArray(item.priceVersions)));
  assert.ok(snapshots.flatMap((item) => item.priceVersions).every((version) => (
    typeof version.priceVersionId === "string"
    && typeof version.priceVersionName === "string"
    && typeof version.productionCountry === "string"
  )));
  assert.equal(JSON.stringify(snapshots).includes("imageAttachmentIds"), false);
  assert.equal(JSON.stringify(snapshots).includes("fabrics"), false);
});
