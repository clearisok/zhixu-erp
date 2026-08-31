import assert from "node:assert/strict";
import test from "node:test";

import {
  applyMarkup,
  calculatePriceVersionMetrics,
  convertedLaborRmb,
  copyPriceVersion,
  laborCostInRmb,
  sumCostLines,
  totalPriceVersionQuantity,
} from "../features/quote-center/model/quote-calculations.ts";

function version(overrides = {}) {
  return {
    id: "price-source",
    name: "素色",
    quantity: 12000,
    description: "基础报价",
    pricingParameters: { manufacturingCountry: "中国", manufacturingPresetId: "preset-china", manufacturingPresetName: "中国制作", laborCurrency: "CNY", usdCnyRate: 7.2, markupRate: 20, includeFreight: false, freightName: "运费", freightAmount: null },
    fabrics: [{ id: "fabric-1", name: "棉布", specification: "200g", usage: 2, unit: "kg", lossRate: 10, unitPrice: 10 }],
    trims: [{ id: "trim-1", name: "拉链", specification: "20cm", usage: 3, unit: "条", lossRate: 0, unitPrice: 2 }],
    labor: { value: 15, description: "车缝" },
    otherCosts: [{ id: "other-1", name: "包装", specification: "单件", usage: 1, unit: "件", lossRate: 0, unitPrice: 4 }],
    confirmation: { confirmedAt: "2026-08-17", confirmedBy: "客户", confirmedGarmentPrice: 60, confirmedLaborPrice: 15, note: "已确认" },
    ...overrides,
  };
}

test("总数量严格等于所有价格版本数量之和", () => {
  assert.equal(totalPriceVersionQuantity([version(), version({ id: "price-2", quantity: 6600 })]), 18600);
});

test("CNY 工价直接按人民币计入且不改写输入", () => {
  assert.equal(laborCostInRmb(15, "CNY", 7.2), 15);
  const metrics = calculatePriceVersionMetrics(version());
  assert.equal(metrics.laborInput, 15);
  assert.equal(metrics.laborRmb, 15);
});

test("USD 工价按汇率与固定 1.13 系数折合人民币且不改写原值", () => {
  assert.ok(Math.abs(convertedLaborRmb(2.1, "USD", 6.7) - 15.8991) < 1e-10);
  assert.ok(Math.abs(laborCostInRmb(10, "USD", 7.2) - 81.36) < 1e-10);
  const source = version({ labor: { value: 2.1, description: "美元工价" }, pricingParameters: { ...version().pricingParameters, laborCurrency: "USD", usdCnyRate: 6.7, markupRate: 5 } });
  const metrics = calculatePriceVersionMetrics(source);
  assert.equal(metrics.laborInput, 2.1);
  assert.ok(Math.abs(metrics.laborRmb - 15.8991) < 1e-10);
  assert.equal(source.labor.value, 2.1);
  source.pricingParameters.usdCnyRate = 7;
  assert.ok(Math.abs(calculatePriceVersionMetrics(source).laborRmb - 16.611) < 1e-10);
});

test("0% 加成保持原始成本", () => {
  assert.equal(applyMarkup(100, 0), 100);
});

test("正常加成使用 cost × (1 + markupRate / 100)", () => {
  assert.equal(applyMarkup(100, 25), 125);
});

test("面料与辅料成本包含用量、单价和损耗", () => {
  assert.equal(sumCostLines(version().fabrics), 22);
  assert.equal(sumCostLines(version().trims), 6);
});

test("成衣销售单价由全部人民币成本统一加成", () => {
  const metrics = calculatePriceVersionMetrics(version());
  assert.equal(metrics.fabricCost, 22);
  assert.equal(metrics.trimCost, 6);
  assert.equal(metrics.preMarkupTotal, 47);
  assert.equal(metrics.garmentSellingPrice, 56.4);
});

test("价格版本成本互相隔离", () => {
  const first = version();
  const second = copyPriceVersion(first, { id: "price-2", name: "彩条", quantity: 6600, description: "复制" });
  second.fabrics[0].unitPrice = 99;
  second.labor.value = 22;
  assert.equal(first.fabrics[0].unitPrice, 10);
  assert.equal(first.labor.value, 15);
});

test("复制不会修改来源，也不会复制客户确认", () => {
  const source = version();
  const snapshot = structuredClone(source);
  const copied = copyPriceVersion(source, { id: "price-copy", name: "素色副本", quantity: 5000, description: "新说明" });
  assert.deepEqual(source, snapshot);
  assert.equal(copied.confirmation, null);
  assert.equal(copied.name, "素色副本");
  assert.equal(copied.quantity, 5000);
  assert.deepEqual(copied.pricingParameters, source.pricingParameters);
  assert.notEqual(copied.pricingParameters, source.pricingParameters);
  assert.notEqual(copied.fabrics[0], source.fabrics[0]);
});
