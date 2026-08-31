import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { isDraftChanged } from "../components/foundation/draft-state.ts";
import {
  createFabricCostLineFromLibrary,
  defaultBasicSettings,
  upsertFabricLibraryItem,
} from "../features/basic-settings/model/basic-settings.ts";
import { productionGroupsForMasterData } from "../features/operations-settings/model/master-data-presentation.ts";
import {
  defaultOperationsSettings,
  normalizeOperationsSettings,
  upsertMonthlyProductionTarget,
  upsertProductionGroup,
} from "../features/operations-settings/model/operations-settings.ts";

const now = "2026-08-31T00:00:00.000Z";
const group = (id, name, sortOrder = 10) => ({
  id,
  name,
  shortName: "",
  productionSiteId: "production-site-cambodia-default",
  enabled: true,
  sortOrder,
  remark: "",
  createdAt: now,
  updatedAt: now,
});

test("Phase 6 生产组使用稳定 ID、数字自然顺序，且非数字名称仍合法", () => {
  const input = [group("g-10", "10组"), group("g-one", "一组"), group("g-2", "2组"), group("g-1", "1组")];
  const projected = productionGroupsForMasterData(input);
  assert.deepEqual(projected.filter((item) => /^\d+组$/.test(item.name)).map((item) => item.name), ["1组", "2组", "10组"]);
  assert.equal(projected.some((item) => item.name === "一组"), true);
  assert.deepEqual(input.map((item) => item.name), ["10组", "一组", "2组", "1组"], "display projection must not mutate repository order");

  let state = structuredClone(defaultOperationsSettings);
  state = upsertProductionGroup(state, group("stable-group", "一组"), now);
  state = upsertProductionGroup(state, { ...state.productionGroups[0], name: "针织一组" }, "2026-08-31T01:00:00.000Z");
  assert.equal(state.productionGroups[0].id, "stable-group");
  assert.equal(state.productionGroups.some((item) => item.name === "14组"), false);
});

test("Phase 6 Master Data 修改不会反向污染报价面料快照", () => {
  const state = structuredClone(defaultBasicSettings);
  const master = state.fabricLibrary[0];
  const snapshot = createFabricCostLineFromLibrary(master, "quote-fabric-snapshot");
  const changed = upsertFabricLibraryItem(state, { ...master, netWidthCm: 999, gsm: 888, supplier: "新供应商", unitPrice: 77 }, now);
  assert.equal(changed.fabricLibrary.find((item) => item.id === master.id).unitPrice, 77);
  assert.equal(snapshot.netWidthCm, master.netWidthCm);
  assert.equal(snapshot.gsm, master.gsm);
  assert.equal(snapshot.supplier, master.supplier);
  assert.equal(snapshot.unitPrice, master.unitPrice);
});

test("Phase 6 Drawer 只有真实字段变化才产生 dirty", () => {
  const original = { id: "fabric-1", name: "针织布", price: null };
  assert.equal(isDraftChanged(original, structuredClone(original)), false);
  assert.equal(isDraftChanged(original, { ...original, name: "针织布" }), false);
  assert.equal(isDraftChanged(original, { ...original, price: 0 }), true, "null and explicit zero remain distinct");
  assert.equal(isDraftChanged(null, original), false);
});

test("Phase 6 关账设置保留空值与 0，并用稳定目标 ID 更新", () => {
  const target = { id: "target-2026-10", month: "2026-10", totalProcessingOutputTargetRmb: null, internalProcessingOutputTargetRmb: 0, remark: "", createdAt: now, updatedAt: now };
  let state = upsertMonthlyProductionTarget(structuredClone(defaultOperationsSettings), target, now);
  const normalized = normalizeOperationsSettings(state, now).closingSettings.monthlyProductionTargets[0];
  assert.equal(normalized.totalProcessingOutputTargetRmb, null);
  assert.equal(normalized.internalProcessingOutputTargetRmb, 0);
  state = upsertMonthlyProductionTarget(state, { ...normalized, remark: "更新" }, "2026-08-31T02:00:00.000Z");
  assert.equal(state.closingSettings.monthlyProductionTargets[0].id, target.id);
});

test("Phase 6 正式页面共享 DataTable、移动投影、Drawer 与危险操作层级", async () => {
  const [basic, operations, dataManagement, foundation] = await Promise.all([
    readFile(new URL("../features/basic-settings/components/basic-settings-pages.tsx", import.meta.url), "utf8"),
    readFile(new URL("../features/operations-settings/components/operations-settings-pages.tsx", import.meta.url), "utf8"),
    readFile(new URL("../features/data-management/components/data-management-page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/foundation/master-data-actions.tsx", import.meta.url), "utf8"),
  ]);
  assert.equal((basic.match(/<DataTable/g) ?? []).length, 4);
  assert.equal((basic.match(/renderRecord=/g) ?? []).length, 4);
  assert.equal((basic.match(/<Drawer/g) ?? []).length, 4);
  assert.equal((operations.match(/<DataTable/g) ?? []).length >= 3, true);
  assert.equal((operations.match(/renderRecord=/g) ?? []).length >= 3, true);
  assert.equal((operations.match(/<Drawer/g) ?? []).length >= 3, true);
  assert.match(foundation, /<summary aria-label=\{label\}>更多<\/summary>/);
  assert.match(basic, /variant="danger"[\s\S]{0,200}删除品牌/);
  assert.match(operations, /variant=\{item\.enabled \? "danger" : "text"\}/);
  assert.match(dataManagement, /title="备份与恢复"/);
  assert.match(dataManagement, /title="危险操作"/);
});
