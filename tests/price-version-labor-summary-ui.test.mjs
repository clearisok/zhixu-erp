import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { copyPriceVersion } from "../features/quote-center/model/quote-calculations.ts";
import { quoteListColumnDefinitionMap } from "../features/quote-center/model/quote-list-column-definitions.ts";
import { createQuoteMetricsViewModel } from "../features/quote-center/model/quote-metrics-view-model.ts";
import { createQuoteDraft, getDefaultRevision } from "../features/quote-center/model/quote-view-model.ts";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

function laborQuote() {
  const quote = createQuoteDraft("labor-summary", "QT-LABOR", "2026-08-26");
  const revision = getDefaultRevision(quote);
  const first = revision.priceVersions[0];
  first.name = "V1";
  first.labor.value = 2.1;
  first.pricingParameters = {
    ...first.pricingParameters,
    manufacturingCountry: "柬埔寨",
    manufacturingPresetName: "柬埔寨制作",
    laborCurrency: "USD",
    usdCnyRate: 6.7,
    markupRate: 5,
  };
  return { quote, revision, first };
}

test("Quote Center 工价按 PriceVersion 真实币种显示，并对多币种分别聚合", () => {
  const { quote, revision, first } = laborQuote();
  assert.equal(quoteListColumnDefinitionMap.labor.value(quote, first), "$2.10");
  const second = copyPriceVersion(first, { id: "labor-cny", name: "V2", quantity: null, description: "" });
  second.labor.value = 12;
  second.pricingParameters = { ...second.pricingParameters, manufacturingCountry: "中国", manufacturingPresetName: "中国制作", laborCurrency: "CNY", markupRate: 13 };
  revision.priceVersions.push(second);
  assert.equal(quoteListColumnDefinitionMap.labor.value(quote), "USD $2.10 · CNY ¥12.00");
  second.pricingParameters = { ...second.pricingParameters, laborCurrency: "USD" };
  second.labor.value = 2.28;
  assert.equal(quoteListColumnDefinitionMap.labor.value(quote), "$2.10 – $2.28");
});

test("Quote Center 工价继续区分 null 与用户明确输入 0", () => {
  const { quote, first } = laborQuote();
  first.labor.value = null;
  assert.equal(quoteListColumnDefinitionMap.labor.value(quote), null);
  first.labor.value = 0;
  assert.equal(quoteListColumnDefinitionMap.labor.value(quote), "$0.00");
});

test("USD Header / Sticky 摘要显示原币工价、RMB折合及加成前后价格", () => {
  const { first } = laborQuote();
  first.fabrics = [{
    id: "fabric-usd",
    sourceLibraryItemId: null,
    name: "精梳棉",
    composition: "100% Cotton",
    segmentLengthCm: 100,
    netWidthCm: 100,
    gsm: 100,
    lossRate: 0,
    supplier: "测试供应商",
    unitPrice: 10,
    purchaseUnit: "kg",
  }];
  first.trims = [{
    id: "trim-usd",
    sourceLibraryItemId: null,
    name: "主唛",
    specification: "标准",
    supplier: "测试供应商",
    usage: 1,
    unit: "个",
    lossRate: 0,
    unitPrice: 1,
  }];

  const viewModel = createQuoteMetricsViewModel(first);
  const fabric = viewModel.find((item) => item.key === "fabric");
  const trim = viewModel.find((item) => item.key === "trim");
  const labor = viewModel.find((item) => item.key === "labor");
  const garment = viewModel.find((item) => item.key === "garment");

  assert.deepEqual(labor, {
    key: "labor",
    label: "工价",
    value: "$2.10",
    unit: "USD / 件",
    secondaryLabel: "RMB折合",
    secondaryValue: "¥15.90",
    primary: false,
  });
  assert.equal(fabric.secondaryLabel, "加成后");
  assert.notEqual(fabric.value, fabric.secondaryValue);
  assert.equal(trim.secondaryLabel, "加成后");
  assert.notEqual(trim.value, trim.secondaryValue);
  assert.equal(garment.unit, "RMB / 件");
  assert.equal(garment.secondaryLabel, "加成前");
  assert.notEqual(garment.value, garment.secondaryValue);
});

test("切换到 CNY PriceVersion 后共享摘要模型立即使用该版本快照", () => {
  const { first } = laborQuote();
  const second = copyPriceVersion(first, { id: "labor-cny", name: "V2 中国", quantity: null, description: "" });
  second.labor.value = 12;
  second.pricingParameters = {
    ...second.pricingParameters,
    manufacturingCountry: "中国",
    manufacturingPresetName: "中国制作",
    laborCurrency: "CNY",
    markupRate: 13,
  };

  const usdLabor = createQuoteMetricsViewModel(first).find((item) => item.key === "labor");
  const cnyLabor = createQuoteMetricsViewModel(second).find((item) => item.key === "labor");

  assert.equal(usdLabor.value, "$2.10");
  assert.equal(usdLabor.secondaryLabel, "RMB折合");
  assert.equal(cnyLabor.value, "¥12.00");
  assert.equal(cnyLabor.unit, "RMB / 件");
  assert.equal(cnyLabor.secondaryLabel, "加成后");
  assert.equal(cnyLabor.secondaryValue, "¥13.56");
});

test("常规 Header 保留价格摘要，Sticky 收敛为对象、版本与保存状态", async () => {
  const [editor, component, responsiveCss] = await Promise.all([
    read("features/quote-center/components/quote-editor.tsx"),
    read("features/quote-center/components/quote-metrics.tsx"),
    read("app/quote-center/responsive.css"),
  ]);

  assert.match(editor, /<QuoteCockpit version=\{activeVersion\}/);
  assert.match(editor, /qc-sticky-state/);
  assert.match(editor, /isDirty \? "有未保存修改" : "已保存"/);
  assert.match(component, /createQuoteMetricsViewModel\(version\)/);
  assert.match(component, /qc-quote-cockpit/);
  assert.match(responsiveCss, /\.qc-quote-cockpit/);
  assert.doesNotMatch(editor, /qc-price-version-context/);
});

test("报价设置只允许选择当前 PriceVersion 制作预设，其余参数只读展示", async () => {
  const settings = await read("features/quote-center/components/quote-pricing-settings.tsx");
  assert.match(settings, /只负责选择当前价格版本/);
  assert.match(settings, /<select[^>]+disabled=\{readOnly\}/);
  assert.match(settings, /qc-pricing-preset-summary/);
  assert.match(settings, /制作国家[\s\S]*加工币种[\s\S]*成本加成率[\s\S]*运费规则/);
  assert.doesNotMatch(settings, /NullableNumberInput|setPricing|onRevisionChange|制作国家[^\n]*<input/);
});

test("Header、Sticky、价格版本卡和加工费区均从当前 PriceVersion 展示制作与币种", async () => {
  const [editor, metrics, metricsViewModel, selector] = await Promise.all([
    read("features/quote-center/components/quote-editor.tsx"),
    read("features/quote-center/components/quote-metrics.tsx"),
    read("features/quote-center/model/quote-metrics-view-model.ts"),
    read("features/quote-center/components/price-version-selector.tsx"),
  ]);
  assert.match(editor, /activeProductionLabel/);
  assert.match(editor, /RMB \/ 件/);
  assert.match(editor, /固定折算系数/);
  assert.match(metrics, /createQuoteMetricsViewModel/);
  assert.match(metrics, /revisionLabel/);
  assert.match(metrics, /productionLabel/);
  assert.match(metricsViewModel, /RMB折合/);
  assert.match(metricsViewModel, /加成前/);
  assert.match(selector, /productionLabel/);
  assert.doesNotMatch(editor, /报价状态 <b>|当前默认<\/b>|客户确认版本/);
});

test("品牌与业务员共用的固定辅料行可在父容器内收缩且不依赖横向滚动", async () => {
  const [forms, css] = await Promise.all([
    read("features/basic-settings/components/master-data-forms.tsx"),
    read("app/quote-center/quote-center.css"),
  ]);
  assert.equal((forms.match(/className="qc-default-trim-item"/g) ?? []).length, 1);
  assert.match(css, /\.qc-default-trim-item \{[^}]*width: 100%;[^}]*min-width: 0;[^}]*minmax\(0, 1\.55fr\)[^}]*repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.qc-default-trim-item label \{ min-width: 0;/);
  assert.match(css, /\.qc-default-trim-item :is\(input, select, \.qc-control, \.qc-control-wrap\) \{ width: 100%; min-width: 0;/);
  assert.doesNotMatch(css, /\.qc-default-trim-item \{[^}]*overflow-x:\s*(?:auto|scroll)/);
});
