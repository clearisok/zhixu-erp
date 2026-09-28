import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  createTrimCostLineFromLibrary,
  defaultBasicSettings,
  resolveQuoteDefaults,
  upsertBrand,
  upsertCustomerSalesperson,
  upsertTrimLibraryItem,
  validateBrandName,
  validateCustomerSalespersonName,
} from "../features/basic-settings/model/basic-settings.ts";

const emptyDefaults = () => ({ defaultUsdCnyRate: null, defaultTrims: [], defaultOtherCost: null });

test("R1-R9 Brand Quick Create 复用唯一校验、允许仅名称并保留可选 defaults", () => {
  let state = structuredClone(defaultBasicSettings);
  assert.match(validateBrandName(state, " zArA "), /已存在/);
  assert.equal(validateBrandName(state, "TEST BRAND 2026"), null);
  state = upsertBrand(state, { id: "brand-test-2026", name: "TEST BRAND 2026", status: "active", defaults: emptyDefaults() });
  assert.equal(state.brands.at(-1).name, "TEST BRAND 2026");
  assert.deepEqual(state.brands.at(-1).defaults, emptyDefaults());
});

test("R10-R16 CustomerSalesperson 固定归属 Brand、全局唯一并可立即按品牌检索", () => {
  let state = structuredClone(defaultBasicSettings);
  assert.match(validateCustomerSalespersonName(state, " 林青禾 "), /已存在/);
  state = upsertCustomerSalesperson(state, { id: "sales-test-2026", name: "TEST BUYER 2026", brandId: "zara", status: "active", defaults: emptyDefaults() });
  assert.equal(state.customerSalespeople.find((item) => item.id === "sales-test-2026")?.brandId, "zara");
  assert.equal(state.customerSalespeople.filter((item) => item.brandId === "zara").some((item) => item.name === "TEST BUYER 2026"), true);
});

test("R17-R25 Fixed Trim 写入正式 Library、允许同名且配置保存 nullable quantity 与 override", () => {
  let state = structuredClone(defaultBasicSettings);
  const item = { id: "trim-test-special", name: "主唛", specification: "特殊吊牌", supplier: "测试供应商", unit: "枚", defaultLossRate: 4, unitPrice: 0.42, createdAt: "2026-08-24T00:00:00.000Z", updatedAt: "2026-08-24T00:00:00.000Z" };
  state = upsertTrimLibraryItem(state, item);
  assert.equal(state.trimLibrary.filter((entry) => entry.name === "主唛").length >= 3, true);
  const config = { id: "default-test", trimLibraryItemId: item.id, quantity: null, overrideLossRate: 6, overrideUnitPrice: 0.5 };
  assert.deepEqual(Object.keys(config).sort(), ["id", "overrideLossRate", "overrideUnitPrice", "quantity", "trimLibraryItemId"]);
  assert.equal("usage" in config, false);
  const row = createTrimCostLineFromLibrary(item, "quote-row-new", config);
  assert.equal(row.id, "quote-row-new");
  assert.equal(row.sourceLibraryItemId, item.id);
  assert.equal(row.usage, null);
  assert.equal(row.lossRate, 6);
  assert.equal(row.unitPrice, 0.5);
});

test("R26-R32 Defaults 保持 Salesperson > Brand > System 且固定辅料整组不 merge", () => {
  const state = structuredClone(defaultBasicSettings);
  state.systemDefaults.defaultOtherCost = { name: "系统费", amount: 0.2 };
  const salesperson = resolveQuoteDefaults(state, "zara", "sales-linqinghe");
  assert.equal(salesperson.usdCnyRate, 7.12);
  assert.deepEqual(salesperson.trims.map((item) => item.sourceLibraryItemId), ["trim-zip-bag"]);
  assert.deepEqual(salesperson.otherCost, { name: "测试费", amount: 1.5 });
  const brand = resolveQuoteDefaults(state, "zara", "sales-zhouyan");
  assert.deepEqual(brand.trims.map((item) => item.sourceLibraryItemId), ["trim-main-label", "trim-hangtag"]);
  const system = resolveQuoteDefaults(state, "pull-bear", "");
  assert.equal(system.usdCnyRate, state.systemDefaults.usdCnyRate);
  assert.deepEqual(system.otherCost, state.systemDefaults.defaultOtherCost);
});

test("R33-R40 Quote 切换继续使用三向保护、生成新 row.id 并替换默认资料快照", async () => {
  const editor = await readFile(new URL("../features/quote-center/components/quote-editor.tsx", import.meta.url), "utf8");
  const editedDataGuard = editor.match(/const hasUserDefaultData = \(\) => Boolean\([\s\S]*?\n  \);/)?.[0] ?? "";
  assert.match(editedDataGuard, /activeVersion\.trims/);
  assert.match(editedDataGuard, /activeVersion\.otherCosts/);
  assert.doesNotMatch(editedDataGuard, /activeVersion\.fabrics|activeVersion\.labor/);
  assert.match(editor, /setMasterSwitchIntent\(intent\)/);
  assert.match(editor, /performMasterSwitch\(masterSwitchIntent, "keep"\)/);
  assert.match(editor, /performMasterSwitch\(masterSwitchIntent, "apply"\)/);
  assert.match(editor, /setMasterSwitchIntent\(null\)/);
  assert.match(editor, /id: createMasterDataId\(`\$\{version\.id\}-default-trim`\)/);
  assert.doesNotMatch(editor, /usage: null/);
  assert.match(editor, /otherCosts: defaults\.otherCost \? \[defaultOtherCostLine/);
});

test("R41-R44 权限与历史只读不会暴露 Quick Create mutation", async () => {
  const base = await readFile(new URL("../features/quote-center/components/quote-base-info.tsx", import.meta.url), "utf8");
  const editor = await readFile(new URL("../features/quote-center/components/quote-editor.tsx", import.meta.url), "utf8");
  const quick = await readFile(new URL("../features/basic-settings/components/quick-master-data-create.tsx", import.meta.url), "utf8");
  assert.match(base, /!readOnly && onCreateBrand/);
  assert.match(base, /!readOnly && base\.brandId && onCreateSalesperson/);
  assert.match(editor, /canCreateBrand=\{canQ3\("settings\.brand\.edit"\)\}/);
  assert.match(editor, /canCreateSalesperson=\{canQ3\("settings\.salesperson\.edit"\)\}/);
  assert.match(quick, /can\("settings\.trim\.edit"\)/);
  assert.match(quick, /if \(!brandDraft \|\| !can\("settings\.brand\.edit"\)\) return/);
});

test("R45-R46 Master Data Quick Create 不调用 Quote save，空白 Draft 仍保持 Lazy Create", async () => {
  const quick = await readFile(new URL("../features/basic-settings/components/quick-master-data-create.tsx", import.meta.url), "utf8");
  const editor = await readFile(new URL("../features/quote-center/components/quote-editor.tsx", import.meta.url), "utf8");
  const repository = await readFile(new URL("../features/quote-center/repository/mock-quote-repository.ts", import.meta.url), "utf8");
  assert.doesNotMatch(quick, /mockQuoteRepository|quoteRepository|\.save\(quote/);
  assert.match(quick, /saveBasicSettings/);
  assert.match(repository, /async createDraft/);
  assert.doesNotMatch(repository.match(/async createDraft[\s\S]*?\n  },/)?.[0] ?? "", /writeQuotes|\.save\(/);
  assert.match(editor, /mockQuoteRepository\.createDraft/);
  assert.match(editor, /await mockQuoteRepository\.save\(next\)/);
});

test("Creatable Master Data 支持 Portal、Arrow/Enter、IME 与嵌套 Drawer", async () => {
  const select = await readFile(new URL("../components/foundation/searchable-select.tsx", import.meta.url), "utf8");
  const drawer = await readFile(new URL("../components/foundation/drawer.tsx", import.meta.url), "utf8");
  const overlay = await readFile(new URL("../components/foundation/overlay.ts", import.meta.url), "utf8");
  const forms = await readFile(new URL("../features/basic-settings/components/master-data-forms.tsx", import.meta.url), "utf8");
  assert.match(select, /createAction/);
  assert.match(select, /createPortal/);
  assert.match(select, /event\.nativeEvent\.isComposing/);
  assert.match(select, /event\.key === "ArrowDown"/);
  assert.match(select, /activeIndex === filtered\.length/);
  assert.match(drawer, /<FormShell/);
  assert.match(drawer, /qc-drawer-backdrop qc-foundation-portal/);
  assert.match(drawer, /useOverlayLifecycle/);
  assert.match(overlay, /event\.stopPropagation\(\)/);
  assert.match(overlay, /overlayStack\.at\(-1\)/);
  assert.match(forms, /保存并选用/);
  assert.match(forms, /CreatableCombobox/);
});
