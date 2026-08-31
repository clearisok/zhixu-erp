import assert from "node:assert/strict";
import test from "node:test";

import {
  applyDefaultsToEmptyQuoteFields,
  defaultBasicSettings,
  normalizeUniqueName,
  resolveQuoteDefaults,
  upsertBrand,
  upsertCustomerSalesperson,
  validateBrandName,
  validateCustomerSalespersonName,
} from "../features/basic-settings/model/basic-settings.ts";
import { createQuoteDraft, getCurrentRevision } from "../features/quote-center/model/quote-view-model.ts";

const cloneState = () => structuredClone(defaultBasicSettings);
const emptyDefaults = () => ({ defaultUsdCnyRate: null, defaultTrims: [], defaultOtherCost: null });

test("品牌与客户业务员不再暴露编码字段", () => {
  assert.equal("code" in defaultBasicSettings.brands[0], false);
  assert.equal("code" in defaultBasicSettings.customerSalespeople[0], false);
});

test("品牌名称按 trim、NFKC 和大小写规范化后保持唯一", () => {
  const state = cloneState();
  assert.equal(normalizeUniqueName("  ＺＡＲＡ  "), "zara");
  assert.match(validateBrandName(state, " zara "), /已存在/);
  assert.match(validateBrandName(state, "ＺＡＲＡ"), /已存在/);
  assert.equal(validateBrandName(state, "ZARA", "zara"), null);

  const rejected = upsertBrand(state, {
    id: "brand-duplicate",
    name: " ZARA ",
    status: "active",
    defaults: emptyDefaults(),
  });
  assert.equal(rejected, state);
  assert.equal(rejected.brands.some((item) => item.id === "brand-duplicate"), false);
});

test("客户业务员姓名在全系统内唯一，而不是只在品牌内唯一", () => {
  const state = cloneState();
  assert.match(validateCustomerSalespersonName(state, " 林青禾 "), /已存在/);
  assert.equal(validateCustomerSalespersonName(state, "林青禾", "sales-linqinghe"), null);

  const rejected = upsertCustomerSalesperson(state, {
    id: "sales-duplicate",
    name: "林青禾",
    brandId: "massimo-dutti",
    status: "active",
    defaults: emptyDefaults(),
  });
  assert.equal(rejected, state);
  assert.equal(rejected.customerSalespeople.some((item) => item.id === "sales-duplicate"), false);
});

test("默认汇率、辅料和其他费用按业务员、品牌、系统规则分别回退", () => {
  const state = cloneState();
  state.systemDefaults.defaultOtherCost = { name: "系统杂费", amount: 0.55 };

  const salesperson = resolveQuoteDefaults(state, "zara", "sales-linqinghe");
  assert.equal(salesperson.usdCnyRate, 7.12);
  assert.deepEqual(salesperson.trims.map((item) => item.name), ["透明自封袋"]);
  assert.deepEqual(salesperson.otherCost, { name: "测试费", amount: 1.5 });

  const brandFallback = resolveQuoteDefaults(state, "zara", "sales-zhouyan");
  assert.equal(brandFallback.usdCnyRate, 7.1);
  assert.deepEqual(brandFallback.trims.map((item) => item.name), ["主唛", "吊牌"]);
  assert.deepEqual(brandFallback.otherCost, { name: "包装杂费", amount: 1.25 });

  const salespersonOtherCost = resolveQuoteDefaults(state, "massimo-dutti", "sales-chenxi");
  assert.equal(salespersonOtherCost.usdCnyRate, 7.08);
  assert.deepEqual(salespersonOtherCost.trims.map((item) => item.name), ["18L 四眼扣"]);
  assert.deepEqual(salespersonOtherCost.otherCost, { name: "质检分摊", amount: 0.35 });

  const systemFallback = resolveQuoteDefaults(state, "pull-bear", "");
  assert.equal(systemFallback.usdCnyRate, 7.12);
  assert.deepEqual(systemFallback.trims, []);
  assert.deepEqual(systemFallback.otherCost, { name: "系统杂费", amount: 0.55 });
});

test("品牌支持多条默认辅料，带入报价后每条 usage 都保持 null", () => {
  const state = cloneState();
  const zara = state.brands.find((brand) => brand.id === "zara");
  assert.equal(zara.defaults.defaultTrims.length, 2);

  const quote = createQuoteDraft("defaults-v15", "QT-V15", "2026-08-17");
  const revision = getCurrentRevision(quote);
  const version = revision.priceVersions[0];
  const filled = applyDefaultsToEmptyQuoteFields(revision, version.id, state, "zara", "sales-zhouyan");
  const filledVersion = filled.priceVersions[0];

  assert.deepEqual(filledVersion.trims.map((item) => item.name), ["主唛", "吊牌"]);
  assert.ok(filledVersion.trims.every((item) => item.usage === null));
  assert.equal(filledVersion.otherCosts[0].unitPrice, 1.25);
  assert.equal(filledVersion.pricingParameters.usdCnyRate, 7.1);

  filledVersion.trims[0].unitPrice = 99;
  assert.equal(state.trimLibrary.find((item) => item.id === "trim-main-label").unitPrice, 0.28);
});

test("重新应用默认资料只补空字段，不覆盖人工辅料、汇率和其他费用", () => {
  const state = cloneState();
  const quote = createQuoteDraft("manual-v15", "QT-MANUAL", "2026-08-17");
  const revision = getCurrentRevision(quote);
  const version = revision.priceVersions[0];
  version.pricingParameters.usdCnyRate = 6.88;
  version.trims = [{
    id: "manual-trim",
    sourceLibraryItemId: null,
    name: "手工辅料",
    specification: "",
    supplier: "手工供应商",
    usage: 0,
    unit: "件",
    lossRate: 0,
    unitPrice: 1,
  }];
  version.otherCosts = [{ id: "manual-other", name: "手工费用", specification: "", usage: 1, unit: "件", lossRate: 0, unitPrice: 2 }];

  const reapplied = applyDefaultsToEmptyQuoteFields(revision, version.id, state, "zara", "sales-linqinghe");
  assert.equal(reapplied.priceVersions[0].pricingParameters.usdCnyRate, 6.88);
  assert.equal(reapplied.priceVersions[0].trims[0].name, "手工辅料");
  assert.equal(reapplied.priceVersions[0].trims[0].usage, 0);
  assert.equal(reapplied.priceVersions[0].otherCosts[0].name, "手工费用");
});
