import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  COMPACT_WIDTH,
  MOBILE_WIDTH,
  resolveResponsiveMode,
  isCompactDesktop,
  isTrueMobile,
} from "../components/foundation/responsive.ts";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const fine = (width) => ({ width, hasHover: true, hasFinePointer: true, hasCoarsePointer: false });
const touch = (width) => ({ width, hasHover: false, hasFinePointer: false, hasCoarsePointer: true });

test("R1 Desktop 1920：不是 Mobile", () => {
  assert.equal(resolveResponsiveMode(fine(1920)), "desktop");
  assert.equal(isTrueMobile(fine(1920)), false);
});

test("R2 Desktop 1366：不是 Mobile", () => {
  assert.equal(resolveResponsiveMode(fine(1366)), "compact");
  assert.equal(isTrueMobile(fine(1366)), false);
});

for (const [rule, width] of [["R3", 1024], ["R4", 900], ["R5", 800], ["R6", 700], ["R7", 650]]) {
  test(`${rule} Fine pointer + ${width}px：Compact Desktop`, () => {
    assert.equal(resolveResponsiveMode(fine(width)), "compact");
    assert.equal(isCompactDesktop(fine(width)), true);
    assert.equal(isTrueMobile(fine(width)), false);
  });
}

test("R8 Compact Desktop 不显示 Bottom Navigation", async () => {
  const [shell, globalCss] = await Promise.all([read("components/foundation/app-shell.tsx"), read("app/globals.css")]);
  assert.match(shell, /viewportMode === "mobile" && <nav className="ops-mobile-nav"/);
  assert.match(shell, /data-responsive-mode=\{viewportMode\}/);
  assert.match(globalCss, /data-responsive-mode="mobile"[^}]*\.ops-mobile-nav/);
  assert.doesNotMatch(globalCss, /@media \(max-width:\s*767px\)[^{]*\{[\s\S]*?\.ops-mobile-nav[^}]*display:\s*grid/);
});

test("R9 Compact Desktop 保留完整报价操作", async () => {
  const editor = await read("features/quote-center/components/quote-editor.tsx");
  for (const label of ["返回列表", "报价版本", "创建价格版本", "客户确认", "导出报价", "删除报价", "保存草稿"]) {
    assert.match(editor, new RegExp(label));
  }
});

test("R10 Compact Desktop Quote Center 不切 Mobile Card List", async () => {
  const responsiveCss = await read("app/quote-center/responsive.css");
  assert.match(responsiveCss, /max-width:\s*1023px\) and \(hover:\s*hover\) and \(pointer:\s*fine\)/);
  assert.match(responsiveCss, /qc-desktop-quote-table[^}]*display:\s*block !important/);
  assert.match(responsiveCss, /qc-mobile-quote-list[^}]*display:\s*none !important/);
});

test("R11-R12 Search / Type / Status 始终同一行且比例为 6:2:2", async () => {
  const [list, responsiveCss] = await Promise.all([read("features/quote-center/components/quote-list.tsx"), read("app/quote-center/responsive.css")]);
  assert.match(list, /<Card className="qc-filter-card"><div className="qc-filter-search"/);
  assert.match(list, /<span>报价类型<\/span>/);
  assert.match(list, /<span>报价状态<\/span>/);
  assert.match(responsiveCss, /grid-template-columns:\s*minmax\(0,\s*6fr\)\s*minmax\(0,\s*2fr\)\s*minmax\(0,\s*2fr\)/);
  assert.doesNotMatch(responsiveCss, /\.qc-filter-card[^}]*grid-template-columns:\s*(?:1fr|repeat\(2)/);
});

test("R13 不存在筛选 Drawer", async () => {
  const [list, quoteCss, responsiveCss] = await Promise.all([read("features/quote-center/components/quote-list.tsx"), read("app/quote-center/quote-center.css"), read("app/quote-center/responsive.css")]);
  for (const source of [list, quoteCss, responsiveCss]) {
    assert.doesNotMatch(source, /mobileFiltersOpen|qc-mobile-filter|筛选报价/);
  }
  assert.match(list, /qc-list-result-count/);
});

test("R14 Mobile 390 + coarse pointer：Mobile Mode", () => {
  assert.equal(resolveResponsiveMode(touch(390)), "mobile");
  assert.equal(isTrueMobile(touch(390)), true);
  assert.equal(resolveResponsiveMode(touch(375)), "mobile");
  assert.equal(isTrueMobile(touch(375)), true);
});

test("R15 Mobile Bottom Navigation 正常", async () => {
  const [shell, globalCss] = await Promise.all([read("components/foundation/app-shell.tsx"), read("app/globals.css")]);
  assert.match(shell, /ops-mobile-nav/);
  assert.match(globalCss, /data-responsive-mode="mobile"[^}]*\.ops-mobile-nav[^}]*display:\s*grid/s);
});

test("R16 Mobile 相册 / Camera 不退化", async () => {
  const panel = await read("features/quote-center/components/attachment-panel.tsx");
  assert.match(panel, /accept="image\/\*" multiple/);
  assert.match(panel, /accept="image\/\*" capture="environment"/);
  assert.match(panel, /indexedDbAttachmentRepository/);
});

test("R17 Tablet touch mode 正常", () => {
  assert.equal(resolveResponsiveMode(touch(768)), "tablet");
  assert.equal(resolveResponsiveMode(touch(1023)), "tablet");
  assert.equal(resolveResponsiveMode(touch(1024)), "compact");
});

test("R18 Desktop Sidebar 不回归", async () => {
  const globalCss = await read("app/globals.css");
  assert.equal(MOBILE_WIDTH, 768);
  assert.equal(COMPACT_WIDTH, 1440);
  assert.match(globalCss, /\.ops-sidebar[^}]*position:\s*fixed[^}]*width:\s*186px[^}]*height:\s*100dvh/s);
  assert.match(globalCss, /data-responsive-mode="compact"[^}]*\.ops-sidebar[^}]*width:\s*78px/s);
});

test("R19 无 document-level horizontal overflow", async () => {
  const globalCss = await read("app/globals.css");
  assert.match(globalCss, /html, body[^}]*overflow-x:\s*hidden/s);
});

test("R20 Table horizontal scroll 只发生在 table container", async () => {
  const quoteCss = await read("app/quote-center/quote-center.css");
  assert.match(quoteCss, /\.qc-table-wrap[^}]*overflow-x:\s*auto/s);
  assert.match(quoteCss, /\.qc-cost-table-wrap[^}]*overflow-x:\s*auto/s);
  assert.doesNotMatch(quoteCss, /\.qc-page-container[^}]*overflow-x:\s*auto/s);
});
