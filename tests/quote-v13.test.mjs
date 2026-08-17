import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  applyDefaultsToEmptyQuoteFields,
  copyCustomerSalesperson,
  customerSalespeopleForBrand,
  defaultBasicSettings,
  deleteBrand,
  deleteCustomerSalesperson,
  resolveQuoteDefaults,
  searchBrands,
  searchCustomerSalespeople,
  upsertBrand,
  upsertCustomerSalesperson,
} from "../features/basic-settings/model/basic-settings.ts";
import { createQuoteDraft, getCurrentRevision } from "../features/quote-center/model/quote-view-model.ts";

const clone = (value) => JSON.parse(JSON.stringify(value));

test("品牌主数据支持查询、新增、编辑和级联删除", () => {
  let state = clone(defaultBasicSettings);
  const brand = { id: "brand-test", name: "测试品牌", code: "TEST", status: "active", defaults: { usdCnyRate: 7.2, trims: [], otherCosts: [] } };
  state = upsertBrand(state, brand);
  assert.equal(searchBrands(state.brands, "test")[0].name, "测试品牌");
  state = upsertBrand(state, { ...brand, name: "测试品牌二" });
  state = upsertCustomerSalesperson(state, { id: "sales-test", name: "测试业务员", code: "ST", brandId: brand.id, status: "active", defaults: { usdCnyRate: null, trims: [], otherCosts: [] } });
  assert.equal(state.brands.find((item) => item.id === brand.id).name, "测试品牌二");
  state = deleteBrand(state, brand.id);
  assert.equal(state.brands.some((item) => item.id === brand.id), false);
  assert.equal(state.customerSalespeople.some((item) => item.brandId === brand.id), false);
});

test("客户业务员支持查询、复制、编辑、删除并按品牌过滤", () => {
  let state = clone(defaultBasicSettings);
  const zaraPeople = customerSalespeopleForBrand(state, "zara");
  assert.ok(zaraPeople.length >= 2);
  assert.ok(zaraPeople.every((item) => item.brandId === "zara"));
  assert.equal(searchCustomerSalespeople(state.customerSalespeople, state.brands, "ZARA").length, zaraPeople.length);
  state = copyCustomerSalesperson(state, zaraPeople[0].id, "sales-copy-test");
  assert.equal(state.customerSalespeople.find((item) => item.id === "sales-copy-test").name, `${zaraPeople[0].name}副本`);
  state = upsertCustomerSalesperson(state, { ...state.customerSalespeople.find((item) => item.id === "sales-copy-test"), name: "已编辑副本" });
  assert.equal(state.customerSalespeople.find((item) => item.id === "sales-copy-test").name, "已编辑副本");
  state = deleteCustomerSalesperson(state, "sales-copy-test");
  assert.equal(state.customerSalespeople.some((item) => item.id === "sales-copy-test"), false);
});

test("报价默认值按客户业务员、品牌、系统三级回退", () => {
  const state = clone(defaultBasicSettings);
  const salesperson = resolveQuoteDefaults(state, "zara", "sales-linqinghe");
  assert.equal(salesperson.usdCnyRate, 7.12);
  assert.equal(salesperson.trims[0].name, "透明自封袋");
  assert.equal(salesperson.otherCosts[0].name, "管理分摊");
  const brand = resolveQuoteDefaults(state, "massimo-dutti", "");
  assert.equal(brand.usdCnyRate, 7.08);
  const system = resolveQuoteDefaults(state, "pull-bear", "");
  assert.equal(system.usdCnyRate, 7.12);
});

test("自动默认值只补空字段，不覆盖手工录入内容", () => {
  const quote = createQuoteDraft("v13", "QT-V13", "2026-08-17");
  const revision = getCurrentRevision(quote);
  const price = revision.priceVersions[0];
  const filled = applyDefaultsToEmptyQuoteFields(revision, price.id, clone(defaultBasicSettings), "zara", "sales-linqinghe");
  assert.equal(filled.pricingParameters.usdCnyRate, 7.12);
  assert.equal(filled.priceVersions[0].trims[0].name, "透明自封袋");
  assert.equal(filled.priceVersions[0].otherCosts[0].name, "管理分摊");
  filled.pricingParameters.usdCnyRate = 6.88;
  filled.priceVersions[0].trims = [{ id: "manual", name: "手工辅料", specification: "", usage: 1, unit: "件", lossRate: 0, unitPrice: 1 }];
  const reapplied = applyDefaultsToEmptyQuoteFields(filled, price.id, clone(defaultBasicSettings), "massimo-dutti", "sales-chenxi");
  assert.equal(reapplied.pricingParameters.usdCnyRate, 6.88);
  assert.equal(reapplied.priceVersions[0].trims[0].name, "手工辅料");
});

test("复制价格版本名称为空、使用指定 Placeholder 并有必填校验", async () => {
  const source = await readFile(new URL("../features/quote-center/components/quote-editor.tsx", import.meta.url), "utf8");
  assert.match(source, /mode === "copy" \? "" : source\.name/);
  assert.match(source, /placeholder="请填写价格版本名称"/);
  assert.match(source, /setVersionError\("请填写价格版本名称"\)/);
});

test("详情信息架构、吸顶操作与页面设置移除符合 V1.3", async () => {
  const editor = await readFile(new URL("../features/quote-center/components/quote-editor.tsx", import.meta.url), "utf8");
  const list = await readFile(new URL("../features/quote-center/components/quote-list.tsx", import.meta.url), "utf8");
  assert.ok(editor.indexOf("<QuoteBaseInfo") < editor.indexOf("<QuotePricingSettings"));
  assert.ok(editor.indexOf("<QuotePricingSettings") < editor.indexOf("<QuoteMetrics"));
  assert.ok(editor.indexOf("<QuoteMetrics") < editor.indexOf("<CostTable"));
  assert.ok(editor.lastIndexOf("<CostTable") < editor.indexOf("<PriceVersionSelector"));
  assert.match(editor, /IntersectionObserver/);
  assert.match(editor, /qc-sticky-header/);
  assert.doesNotMatch(editor, /页面设置/);
  assert.doesNotMatch(list, /页面设置/);
});

