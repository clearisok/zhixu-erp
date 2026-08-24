import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  applyDefaultsToEmptyQuoteFields,
  createTrimCostLineFromLibrary,
  customerSalespeopleForBrand,
  defaultBasicSettings,
  resolveQuoteDefaults,
  upsertFabricLibraryItem,
  upsertTrimLibraryItem,
  validateBrandName,
  validateCustomerSalespersonName,
} from "../features/basic-settings/model/basic-settings.ts";
import {
  defaultQuoteSettingsForUser,
  normalizeQuoteSettings,
  quoteSettingsStorageKey,
} from "../features/quote-center/model/quote-settings.ts";
import { createQuoteDraft, getCurrentRevision } from "../features/quote-center/model/quote-view-model.ts";
import { createRevisionSnapshot } from "../features/quote-center/model/quote-workflows.ts";

const cloneState = () => structuredClone(defaultBasicSettings);

test("1. Brand 名称经过 trim 与大小写归一后唯一", () => {
  const state = cloneState();
  assert.match(validateBrandName(state, " zara "), /存在/);
  assert.match(validateBrandName(state, "ZARA"), /存在/);
  assert.equal(validateBrandName(state, "ZARA", "zara"), null);
});

test("2. CustomerSalesperson 姓名在整个系统唯一", () => {
  const state = cloneState();
  assert.match(validateCustomerSalespersonName(state, " 林青禾 "), /存在/);
  assert.equal(validateCustomerSalespersonName(state, "林青禾", "sales-linqinghe"), null);
});

test("3/17. Fabric 与 Trim 名称允许重复，仅 ID 唯一", () => {
  let state = cloneState();
  const fabric = { ...state.fabricLibrary[0], id: "same-fabric-test", supplier: "另一家面料商" };
  const trim = { ...state.trimLibrary[0], id: "same-trim-test", supplier: "另一家辅料商" };
  state = upsertFabricLibraryItem(state, fabric, "2026-08-21T00:00:00.000Z");
  state = upsertTrimLibraryItem(state, trim, "2026-08-21T00:00:00.000Z");
  assert.ok(state.fabricLibrary.filter((item) => item.name === fabric.name).length >= 2);
  assert.ok(state.trimLibrary.filter((item) => item.name === trim.name).length >= 2);
});

test("4/5. Brand 1:N CustomerSalesperson 且报价选择按品牌过滤", () => {
  const state = cloneState();
  const people = customerSalespeopleForBrand(state, "zara");
  assert.ok(people.length >= 2);
  assert.ok(people.every((person) => person.brandId === "zara"));
  assert.equal(people.some((person) => person.brandId === "massimo-dutti"), false);
});

test("6/9. DefaultTrimConfig 引用辅料库且不包含本次报价数量", () => {
  const config = cloneState().brands.find((brand) => brand.id === "zara").defaults.defaultTrims[0];
  assert.equal(typeof config.trimLibraryItemId, "string");
  assert.equal("quantity" in config, false);
  assert.equal("usage" in config, false);
});

test("7/8. DefaultTrimConfig 的单价与损耗率 override 生效", () => {
  const item = cloneState().trimLibrary.find((entry) => entry.id === "trim-hangtag");
  const line = createTrimCostLineFromLibrary(item, "quote-row", {
    id: "config-1",
    trimLibraryItemId: item.id,
    overrideLossRate: 6,
    overrideUnitPrice: 0.88,
  });
  assert.equal(line.lossRate, 6);
  assert.equal(line.unitPrice, 0.88);
  assert.equal(line.usage, null);
});

test("10. 汇率优先级为 Salesperson > Brand > System", () => {
  const state = cloneState();
  assert.equal(resolveQuoteDefaults(state, "zara", "sales-linqinghe").usdCnyRate, 7.12);
  state.customerSalespeople.find((person) => person.id === "sales-linqinghe").defaults.defaultUsdCnyRate = null;
  assert.equal(resolveQuoteDefaults(state, "zara", "sales-linqinghe").usdCnyRate, 7.1);
  state.brands.find((brand) => brand.id === "zara").defaults.defaultUsdCnyRate = null;
  assert.equal(resolveQuoteDefaults(state, "zara", "sales-linqinghe").usdCnyRate, state.systemDefaults.usdCnyRate);
});

test("11/16. 其他费用保留名称和金额，优先级为 Salesperson > Brand > System", () => {
  const state = cloneState();
  assert.deepEqual(resolveQuoteDefaults(state, "zara", "sales-linqinghe").otherCost, { name: "测试费", amount: 1.5 });
  state.customerSalespeople.find((person) => person.id === "sales-linqinghe").defaults.defaultOtherCost = null;
  assert.deepEqual(resolveQuoteDefaults(state, "zara", "sales-linqinghe").otherCost, { name: "包装杂费", amount: 1.25 });
  state.brands.find((brand) => brand.id === "zara").defaults.defaultOtherCost = null;
  state.systemDefaults.defaultOtherCost = { name: "系统费用", amount: 0.5 };
  assert.deepEqual(resolveQuoteDefaults(state, "zara", "sales-linqinghe").otherCost, { name: "系统费用", amount: 0.5 });

  const quote = createQuoteDraft("other-cost", "QT-OTHER", "2026-08-21");
  const revision = getCurrentRevision(quote);
  const filled = applyDefaultsToEmptyQuoteFields(revision, revision.priceVersions[0].id, cloneState(), "zara", "sales-linqinghe");
  assert.deepEqual(
    { name: filled.priceVersions[0].otherCosts[0].name, amount: filled.priceVersions[0].otherCosts[0].amount },
    { name: "测试费", amount: 1.5 },
  );
});

test("12. Salesperson 有默认辅料时整组优先于 Brand，不自动合并", () => {
  const state = cloneState();
  const salesperson = resolveQuoteDefaults(state, "zara", "sales-linqinghe");
  const brand = resolveQuoteDefaults(state, "zara", "sales-zhouyan");
  assert.deepEqual(salesperson.trims.map((line) => line.sourceLibraryItemId), ["trim-zip-bag"]);
  assert.deepEqual(brand.trims.map((line) => line.sourceLibraryItemId), ["trim-main-label", "trim-hangtag"]);
});

test("13/14. 默认辅料进入报价后生成新 row.id，修改报价不污染辅料库", () => {
  const state = cloneState();
  const quote = createQuoteDraft("snapshot-a", "QT-SNAPSHOT-A", "2026-08-21");
  const original = getCurrentRevision(quote);
  const filled = applyDefaultsToEmptyQuoteFields(original, original.priceVersions[0].id, state, "zara", "sales-zhouyan");
  const configIds = new Set(state.brands.find((brand) => brand.id === "zara").defaults.defaultTrims.map((config) => config.id));
  assert.ok(filled.priceVersions[0].trims.every((line) => !configIds.has(line.id)));
  assert.ok(filled.priceVersions[0].trims.every((line) => line.usage === null));
  const libraryPrice = state.trimLibrary.find((item) => item.id === "trim-main-label").unitPrice;
  filled.priceVersions[0].trims[0].unitPrice = 99;
  assert.equal(state.trimLibrary.find((item) => item.id === "trim-main-label").unitPrice, libraryPrice);
});

test("15. 修改 Trim Library 不污染已有 Quote Revision 快照", () => {
  const state = cloneState();
  const quote = createQuoteDraft("snapshot-b", "QT-SNAPSHOT-B", "2026-08-21");
  const revision = getCurrentRevision(quote);
  const filledRevision = applyDefaultsToEmptyQuoteFields(revision, revision.priceVersions[0].id, state, "zara", "sales-zhouyan");
  quote.revisions[0] = filledRevision;
  const snapshotted = createRevisionSnapshot(quote, "锁定历史", "tester", "2026-08-21T01:00:00.000Z", "revision-v2");
  const oldPrice = snapshotted.revisions[0].priceVersions[0].trims[0].unitPrice;
  state.trimLibrary.find((item) => item.id === "trim-main-label").unitPrice = 77;
  assert.equal(snapshotted.revisions[0].priceVersions[0].trims[0].unitPrice, oldPrice);
  assert.equal("trimLibrary" in snapshotted.revisions[0], false);
});

test("18. QuoteListViewPreferences 按 userId 生成隔离存储键", () => {
  assert.notEqual(quoteSettingsStorageKey("user-a"), quoteSettingsStorageKey("user-b"));
  const a = normalizeQuoteSettings({ ...defaultQuoteSettingsForUser("user-a"), visibleColumns: ["quote"] }, "user-a");
  const b = normalizeQuoteSettings({ ...defaultQuoteSettingsForUser("user-b"), visibleColumns: ["style"] }, "user-b");
  assert.equal(a.userId, "user-a");
  assert.equal(b.userId, "user-b");
  assert.deepEqual(a.visibleColumns, ["quote"]);
  assert.deepEqual(b.visibleColumns, ["style"]);
});

test("切换品牌或客户业务员时提供保留、应用、取消三种数据保护选择", async () => {
  const editor = await readFile(new URL("../features/quote-center/components/quote-editor.tsx", import.meta.url), "utf8");
  assert.match(editor, /保留当前报价资料/);
  assert.match(editor, /应用新的默认资料/);
  assert.match(editor, /取消切换/);
  assert.match(editor, /const salespersonId = intent\.kind === "brand" \? "" : intent\.value/);
  assert.match(editor, /activeVersion\.trims\.length && !defaultsStateRef\.current\.trimsAuto/);
});

test("报价软删除契约已在模型和 repository interface 预留", async () => {
  const quote = createQuoteDraft("soft-delete", "QT-SOFT", "2026-08-21");
  assert.equal(quote.deletedAt, null);
  const repository = await readFile(new URL("../features/quote-center/repository/quote-repository.ts", import.meta.url), "utf8");
  assert.match(repository, /mode\?: "hard" \| "soft"/);
  assert.match(repository, /deletedAt\?: string/);
});
