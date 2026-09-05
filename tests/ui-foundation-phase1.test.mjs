import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Phase 1 Overlay 统一 Portal、焦点、ESC、恢复与滚动锁定", async () => {
  const [overlay, modal, drawer, sheet] = await Promise.all([
    read("components/foundation/overlay.ts"),
    read("components/foundation/modal.tsx"),
    read("components/foundation/drawer.tsx"),
    read("components/foundation/mobile-sheet.tsx"),
  ]);
  assert.match(overlay, /overlayStack/);
  assert.match(overlay, /event\.key === "Escape"/);
  assert.match(overlay, /event\.key !== "Tab"/);
  assert.match(overlay, /restoreFocusRef\.current\?\.focus/);
  assert.match(overlay, /document\.body\.style\.overflow = "hidden"/);
  for (const source of [modal, drawer, sheet]) {
    assert.match(source, /useOverlayLifecycle/);
    assert.match(source, /createPortal/);
    assert.match(source, /aria-labelledby/);
  }
});

test("Phase 1 DataTable 提供业务表格公共能力但不包含业务字段", async () => {
  const table = await read("components/foundation/data-table.tsx");
  for (const capability of ["minWidth", "responsivePriority", "selectedRowKey", "renderRecord", "loading", "error", "ariaLabel", "sticky"]) {
    assert.match(table, new RegExp(capability));
  }
  assert.doesNotMatch(table, /Quote|SalesOrder|PriceVersion|PermissionKey|ProductionGroup/);
  const css = await read("app/foundation.css");
  assert.match(css, /font-variant-numeric:\s*tabular-nums/);
  assert.match(css, /\.qc-data-table th[^}]*position:\s*sticky/s);
  assert.match(css, /\.qc-responsive-record-list/);
});

test("Phase 1 页面保持一个主纵向滚动容器", async () => {
  const css = await read("app/foundation.css");
  assert.match(css, /ops-shell\.qc-app-shell[^}]*overflow:\s*hidden/s);
  assert.match(css, /ops-shell\.qc-app-shell \.ops-workspace[^}]*overflow-y:\s*auto/s);
  assert.match(css, /\.qc-table-wrap[^}]*overflow:\s*visible/s);
  assert.match(css, /\.qc-data-table[^}]*table-layout:\s*fixed/s);
  assert.doesNotMatch(css, /\.qc-data-table[^}]*min-width:\s*max-content/s);
  assert.match(css, /\.qc-drawer-body[^}]*overflow-y:\s*auto/s);
  assert.match(css, /\.qc-mobile-sheet-body[^}]*overflow-y:\s*auto/s);
});

test("Phase 1 代表页使用 PageHeader、Toolbar、DataTable 和 ResponsiveRecordList", async () => {
  const page = await read("features/basic-settings/components/basic-settings-pages.tsx");
  assert.match(page, /<PageHeader[^>]*title="品牌设置"[^>]*count=/);
  assert.match(page, /<Toolbar/);
  assert.match(page, /<DataTable rows=\{rows\}/);
  assert.match(page, /renderRecord=/);
});
