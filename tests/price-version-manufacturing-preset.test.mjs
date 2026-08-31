import assert from "node:assert/strict";
import test from "node:test";

import { LOCAL_DATA_SCHEMA_VERSION } from "../features/data-management/repository/local-data-store.ts";
import { calculatePriceVersionMetrics, copyPriceVersion } from "../features/quote-center/model/quote-calculations.ts";
import {
  applyManufacturingPresetToPriceVersion,
  defaultManufacturingPresets,
} from "../features/quote-center/model/quote-settings.ts";
import { createRevisionFromSnapshot } from "../features/quote-center/model/quote-workflows.ts";
import { createQuoteDraft, getDefaultRevision } from "../features/quote-center/model/quote-view-model.ts";
import { normalizeQuote } from "../features/quote-center/repository/mock-quote-repository.ts";

const chinaPreset = defaultManufacturingPresets.find((preset) => preset.id === "preset-china");
const cambodiaPreset = defaultManufacturingPresets.find((preset) => preset.id === "preset-cambodia");

function twoVersionRevision() {
  const quote = createQuoteDraft("preset-independent", "QT-PRESET-INDEPENDENT", "2026-08-26", { usdCnyRate: 7.12 });
  const revision = getDefaultRevision(quote);
  const v1 = applyManufacturingPresetToPriceVersion(revision.priceVersions[0], cambodiaPreset);
  v1.name = "柬埔寨价格";
  v1.labor.value = 10;
  const v2 = applyManufacturingPresetToPriceVersion(copyPriceVersion(v1, {
    id: "preset-independent-price-v2",
    name: "中国价格",
    quantity: 1000,
    description: "中国制作",
  }), chinaPreset);
  revision.priceVersions = [v1, v2];
  return { quote, revision, v1, v2 };
}

test("同一 Revision 的 V1 柬埔寨与 V2 中国拥有独立制作快照和计算口径", () => {
  const { v1, v2 } = twoVersionRevision();
  assert.equal(v1.pricingParameters.manufacturingPresetName, "柬埔寨制作");
  assert.equal(v1.pricingParameters.laborCurrency, "USD");
  assert.equal(v1.pricingParameters.markupRate, 5);
  assert.equal(v2.pricingParameters.manufacturingPresetName, "中国制作");
  assert.equal(v2.pricingParameters.laborCurrency, "CNY");
  assert.equal(v2.pricingParameters.markupRate, 13);
  assert.equal(calculatePriceVersionMetrics(v1).garmentSellingPrice, 10 * 7.12 * 1.13 * 1.05);
  assert.equal(calculatePriceVersionMetrics(v2).garmentSellingPrice, 10 * 1.13);
});

test("修改 V2 或系统预设对象不会污染 V1 已保存快照", () => {
  const { v1: sourceV1, v2 } = twoVersionRevision();
  const editableSystemPreset = structuredClone(cambodiaPreset);
  const v1 = applyManufacturingPresetToPriceVersion(sourceV1, editableSystemPreset);
  const v1Snapshot = structuredClone(v1.pricingParameters);
  v2.pricingParameters.markupRate = 20;
  editableSystemPreset.markupRate = 7;
  editableSystemPreset.country = "已修改国家";
  assert.deepEqual(v1.pricingParameters, v1Snapshot);
  assert.equal(v1.pricingParameters.markupRate, 5);
  assert.equal(v1.pricingParameters.manufacturingCountry, "柬埔寨");
});

test("复制 PriceVersion 深复制制作快照但不复制客户确认", () => {
  const { v1 } = twoVersionRevision();
  v1.confirmation = { quotedGarmentPrice: 74.76, confirmedGarmentPrice: 74, quotedLaborPrice: 10, confirmedLaborPrice: 10, note: "已确认", confirmedAt: "2026-08-26T10:00:00.000Z" };
  const copied = copyPriceVersion(v1, { id: "copied", name: "复制", quantity: 500, description: "" });
  assert.deepEqual(copied.pricingParameters, v1.pricingParameters);
  assert.notEqual(copied.pricingParameters, v1.pricingParameters);
  assert.equal(copied.confirmation, null);
});

test("创建新 QuoteRevision 保留各 PriceVersion 快照且历史 Revision 只读", () => {
  const { quote, revision } = twoVersionRevision();
  const nextQuote = createRevisionFromSnapshot(quote, {
    sourceRevisionId: revision.revisionId,
    reason: "客户调价",
    note: "新版本",
    createdBy: "测试用户",
    nowIso: "2026-08-26T11:00:00.000Z",
    revisionId: "preset-independent-revision-v2",
  });
  const historical = nextQuote.revisions.find((item) => item.revisionId === revision.revisionId);
  const current = getDefaultRevision(nextQuote);
  assert.equal(historical.readOnly, true);
  assert.deepEqual(current.priceVersions.map((version) => version.pricingParameters.manufacturingPresetId), ["preset-cambodia", "preset-china"]);
  current.priceVersions[1].pricingParameters.markupRate = 99;
  assert.equal(historical.priceVersions[1].pricingParameters.markupRate, 13);
});

test("v2 Revision 级制作参数非破坏迁移到每个 PriceVersion", () => {
  const legacy = structuredClone(createQuoteDraft("legacy-preset", "QT-LEGACY-PRESET", "2026-08-26"));
  const revision = legacy.revisions[0];
  const second = copyPriceVersion(revision.priceVersions[0], { id: "legacy-price-2", name: "价格二", quantity: 200, description: "" });
  revision.priceVersions.push(second);
  revision.pricingParameters = { manufacturingCountry: "柬埔寨", manufacturingPresetId: "preset-cambodia", laborCurrency: "USD", usdCnyRate: 7.12, markupRate: 5 };
  for (const version of revision.priceVersions) {
    delete version.pricingParameters;
    version.labor.value = 2;
  }

  const migrated = normalizeQuote(legacy);
  const migratedRevision = getDefaultRevision(migrated);
  assert.equal(LOCAL_DATA_SCHEMA_VERSION, 9);
  assert.equal("pricingParameters" in migratedRevision, false);
  assert.deepEqual(migratedRevision.priceVersions.map((version) => version.pricingParameters.manufacturingPresetId), ["preset-cambodia", "preset-cambodia"]);
  assert.deepEqual(migratedRevision.priceVersions.map((version) => version.pricingParameters.laborCurrency), ["USD", "USD"]);
  assert.equal(calculatePriceVersionMetrics(migratedRevision.priceVersions[0]).garmentSellingPrice, 2 * 7.12 * 1.13 * 1.05);
});
