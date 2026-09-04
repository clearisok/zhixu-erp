import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createLocalDataStore } from "../features/data-management/repository/local-data-store.ts";
import { createTablePreferenceRepository, normalizeColumnOrder } from "../components/foundation/table-preference.ts";
import { createSidebarPreferenceRepository } from "../components/foundation/sidebar-preference.ts";

class MemoryStorage {
  values = new Map();
  get length() { return this.values.size; }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, value); }
  removeItem(key) { this.values.delete(key); }
  key(index) { return [...this.values.keys()][index] ?? null; }
}

test("TablePreference 向前迁移列顺序并保持用户隔离与完整重置", () => {
  const store = createLocalDataStore({ storage: new MemoryStorage(), namespace: "zhixu.erp.second-acceptance-table", environment: "test" });
  const repository = createTablePreferenceRepository(store);
  const widths = { styleImage: 64, styleIdentity: 156, brand: 132 };
  const order = ["styleImage", "styleIdentity", "brand"];
  repository.save("user-a", { moduleKey: "quote-center", tableKey: "quote", columnWidths: widths, columnOrder: ["brand", "style"] }, widths, order, { style: ["styleImage", "styleIdentity"] });
  assert.deepEqual(repository.load("user-a", "quote-center", "quote", widths, order, { style: ["styleImage", "styleIdentity"] }).columnOrder, ["brand", "styleImage", "styleIdentity"]);
  const expanded = { ...widths, date: 92 };
  assert.deepEqual(repository.load("user-a", "quote-center", "quote", expanded, [...order, "date"], { style: ["styleImage", "styleIdentity"] }).columnOrder, ["brand", "styleImage", "styleIdentity", "date"]);
  assert.deepEqual(normalizeColumnOrder(["removed", "brand"], order), ["brand", "styleImage", "styleIdentity"]);
  assert.deepEqual(repository.load("user-b", "quote-center", "quote", widths, order).columnOrder, order);
  repository.save("user-a", { moduleKey: "quote-center", tableKey: "quote", columnWidths: widths, columnOrder: order }, widths, order);
  assert.deepEqual(repository.load("user-a", "quote-center", "quote", widths, order).columnOrder, order);
});

test("DataTable 提供边缘拖拽、键盘列宽、顺序持久化和安全行点击", () => {
  const source = readFileSync(new URL("../components/foundation/data-table.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../app/foundation.css", import.meta.url), "utf8");
  for (const marker of ["qc-column-resize-handle", "onPointerDown", "pointermove", "pointerup", "ArrowLeft", "ArrowRight", "draggable", "onDrop", "saveTablePreference", "isInteractiveTarget"]) assert.match(source, new RegExp(marker));
  assert.match(source, /Math\.min\(max, Math\.max\(min, nextWidth\)\)/);
  assert.match(css, /th:last-child \.qc-column-resize-handle \{[^}]*right:\s*0/s);
});

test("Sidebar 折叠状态按用户持久化且基础设置路由不会自动展开菜单", () => {
  const store = createLocalDataStore({ storage: new MemoryStorage(), namespace: "zhixu.erp.second-acceptance-sidebar", environment: "test" });
  const repository = createSidebarPreferenceRepository(store);
  repository.save({ userId: "user-a", collapsed: true });
  assert.equal(repository.load("user-a").collapsed, true);
  assert.equal(repository.load("user-b").collapsed, false);
  const source = readFileSync(new URL("../components/foundation/app-shell.tsx", import.meta.url), "utf8");
  assert.match(source, /useState\(false\)/);
  assert.doesNotMatch(source, /useState\(basicActive\)|useState\(systemActive\)/);
  assert.match(source, /data-sidebar-state=/);
  assert.match(source, /saveSidebarPreference/);
});

test("Quote 使用独立款式图和款式身份、摘要列、单行更多与增强 Sticky", () => {
  const list = readFileSync(new URL("../features/quote-center/components/quote-list.tsx", import.meta.url), "utf8");
  const editor = readFileSync(new URL("../features/quote-center/components/quote-editor.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../app/quote-center/quote-center.css", import.meta.url), "utf8");
  assert.ok(list.indexOf('key: "styleImage"') < list.indexOf('key: "styleIdentity"'));
  for (const label of ["成本摘要", "成衣价 / 客户确认", "报价历史 / 价格方案"]) assert.match(list, new RegExp(label));
  assert.match(editor, /activeProductionLabel/);
  assert.match(editor, /activeVersion\.quantity/);
  assert.match(editor, /garmentSellingPrice/);
  assert.match(css, /qc-list-more-actions[^}]*white-space:\s*nowrap/s);
  assert.doesNotMatch(css, /data-column-key="revision"\][^}]*display:\s*none/s);
});
