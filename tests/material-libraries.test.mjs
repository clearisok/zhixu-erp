import assert from "node:assert/strict";
import test from "node:test";

import {
  createFabricCostLineFromLibrary,
  createTrimCostLineFromLibrary,
  defaultBasicSettings,
  deleteFabricLibraryItem,
  deleteTrimLibraryItem,
  fabricLibraryItemFromCostLine,
  searchFabricLibrary,
  searchTrimLibrary,
  supplierSuggestions,
  trimLibraryItemFromCostLine,
  upsertFabricLibraryItem,
  upsertTrimLibraryItem,
} from "../features/basic-settings/model/basic-settings.ts";

const cloneState = () => structuredClone(defaultBasicSettings);
const t0 = "2026-08-20T00:00:00.000Z";
const t1 = "2026-08-21T00:00:00.000Z";

const fabric = {
  id: "fabric-linen",
  name: "亚麻混纺",
  composition: "55% Linen 45% Cotton",
  netWidthCm: 142,
  gsm: 155,
  defaultLossRate: 4,
  supplier: "绍兴新供应商",
  unitPrice: 28.5,
  purchaseUnit: "meter",
  createdAt: t0,
  updatedAt: t0,
};

const trim = {
  id: "trim-snap",
  name: "五爪扣",
  specification: "12mm",
  supplier: "广州新供应商",
  unit: "粒",
  defaultLossRate: 2,
  unitPrice: 0.26,
  createdAt: t0,
  updatedAt: t0,
};

test("面料库支持新增、编辑、查询和删除，并保留创建时间", () => {
  const initial = cloneState();
  const added = upsertFabricLibraryItem(initial, fabric, t0);
  assert.equal(initial.fabricLibrary.some((item) => item.id === fabric.id), false);
  assert.equal(searchFabricLibrary(added.fabricLibrary, "新供应商")[0].id, fabric.id);
  assert.equal(searchFabricLibrary(added.fabricLibrary, "55% linen")[0].id, fabric.id);

  const edited = upsertFabricLibraryItem(added, { ...fabric, name: " 亚麻棉混纺 ", unitPrice: 30 }, t1);
  assert.equal(added.fabricLibrary.find((item) => item.id === fabric.id).unitPrice, 28.5);
  assert.equal(edited.fabricLibrary.find((item) => item.id === fabric.id).name, "亚麻棉混纺");
  assert.equal(edited.fabricLibrary.find((item) => item.id === fabric.id).createdAt, t0);
  assert.equal(edited.fabricLibrary.find((item) => item.id === fabric.id).updatedAt, t1);

  const deleted = deleteFabricLibraryItem(edited, fabric.id);
  assert.equal(deleted.fabricLibrary.some((item) => item.id === fabric.id), false);
});

test("面料名称允许重复，只通过 libraryItem.id 区分", () => {
  const initial = cloneState();
  const first = { ...fabric, id: "fabric-same-a", name: "主面料", supplier: "A供应商" };
  const second = { ...fabric, id: "fabric-same-b", name: " 主面料 ", supplier: "B供应商" };
  const state = upsertFabricLibraryItem(upsertFabricLibraryItem(initial, first, t0), second, t0);
  const matches = state.fabricLibrary.filter((item) => item.name === "主面料");
  assert.deepEqual(matches.map((item) => item.id), ["fabric-same-a", "fabric-same-b"]);
});

test("面料库与报价成本使用快照，保存回库时排除报价动态字段", () => {
  const item = cloneState().fabricLibrary.find((entry) => entry.id === "fabric-combed-cotton-a");
  const quoteLine = createFabricCostLineFromLibrary(item, "quote-fabric-1");
  assert.equal(quoteLine.sourceLibraryItemId, item.id);
  assert.equal(quoteLine.segmentLengthCm, null);

  quoteLine.unitPrice = 99;
  quoteLine.lossRate = 8;
  quoteLine.supplier = "本次报价供应商";
  quoteLine.segmentLengthCm = 138;
  assert.equal(item.unitPrice, 23.5);
  assert.equal(item.defaultLossRate, 3);
  assert.equal(item.supplier, "XX纺织");

  const saved = fabricLibraryItemFromCostLine({ ...quoteLine, name: " 新面料快照 " }, "fabric-saved", undefined, t1);
  assert.equal(saved.name, "新面料快照");
  assert.equal(saved.unitPrice, 99);
  assert.equal("segmentLengthCm" in saved, false);
  assert.equal("consumption" in saved, false);
  assert.equal("cost" in saved, false);
});

test("辅料库支持重名、供应商查询、CRUD，并在删除时清理默认引用", () => {
  const initial = cloneState();
  let state = upsertTrimLibraryItem(initial, trim, t0);
  state = upsertTrimLibraryItem(state, { ...trim, id: "trim-snap-b", supplier: "B供应商" }, t0);
  assert.equal(state.trimLibrary.filter((item) => item.name === "五爪扣").length, 2);
  assert.equal(searchTrimLibrary(state.trimLibrary, "广州新供应商")[0].id, trim.id);
  assert.equal(searchTrimLibrary(state.trimLibrary, "12mm").length >= 2, true);

  const edited = upsertTrimLibraryItem(state, { ...trim, name: " 五爪暗扣 ", unitPrice: 0.3 }, t1);
  assert.equal(state.trimLibrary.find((item) => item.id === trim.id).unitPrice, 0.26);
  assert.equal(edited.trimLibrary.find((item) => item.id === trim.id).name, "五爪暗扣");

  const deleted = deleteTrimLibraryItem(edited, "trim-main-label");
  assert.equal(deleted.trimLibrary.some((item) => item.id === "trim-main-label"), false);
  assert.ok(deleted.brands.every((brand) => brand.defaults.defaultTrims.every((config) => config.trimLibraryItemId !== "trim-main-label")));
  assert.ok(deleted.customerSalespeople.every((person) => person.defaults.defaultTrims.every((config) => config.trimLibraryItemId !== "trim-main-label")));

  const fullyDeleted = deleteTrimLibraryItem(deleted, trim.id);
  assert.equal(fullyDeleted.trimLibrary.some((item) => item.id === trim.id), false);
});

test("辅料快照数量为空，且报价修改不污染辅料库", () => {
  const item = cloneState().trimLibrary.find((entry) => entry.id === "trim-button-18l");
  const quoteLine = createTrimCostLineFromLibrary(item, "quote-trim-1");
  assert.equal(quoteLine.usage, null);
  assert.equal(quoteLine.supplier, "ABC辅料");
  quoteLine.usage = 6;
  quoteLine.unitPrice = 0.2;
  quoteLine.supplier = "本次报价供应商";
  assert.equal(item.unitPrice, 0.18);
  assert.equal(item.supplier, "ABC辅料");

  const saved = trimLibraryItemFromCostLine({ ...quoteLine, name: " 四眼扣新资料 " }, "trim-saved", undefined, t1);
  assert.equal(saved.name, "四眼扣新资料");
  assert.equal(saved.supplier, "本次报价供应商");
  assert.equal("usage" in saved, false);
  assert.equal("sourceLibraryItemId" in saved, false);
});

test("供应商建议合并面料与辅料历史值，大小写归一去重并允许筛选", () => {
  const state = cloneState();
  state.fabricLibrary.push({ ...fabric, id: "supplier-a", supplier: " Shared Supplier " });
  state.trimLibrary.push({ ...trim, id: "supplier-b", supplier: "shared supplier" });
  assert.equal(supplierSuggestions(state).filter((item) => item.toLowerCase() === "shared supplier").length, 1);
  assert.deepEqual(supplierSuggestions(state, "shared"), ["Shared Supplier"]);
});
