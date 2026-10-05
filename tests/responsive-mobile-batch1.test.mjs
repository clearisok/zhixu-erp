import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  COMPACT_WIDTH,
  MOBILE_WIDTH,
  PRIMARY_WIDTH,
  WIDE_WIDTH,
  resolveResponsiveMode,
  isCompactDesktop,
  isTrueMobile,
} from "../components/foundation/responsive.ts";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const fine = (width) => ({ width, hasHover: true, hasFinePointer: true, hasCoarsePointer: false });
const touch = (width) => ({ width, hasHover: false, hasFinePointer: false, hasCoarsePointer: true });

test("R1 Desktop 1920：不是 Mobile", () => {
  assert.equal(resolveResponsiveMode(fine(1920)), "wide");
  assert.equal(isTrueMobile(fine(1920)), false);
});

test("R2 Desktop 1366：不是 Mobile", () => {
  assert.equal(resolveResponsiveMode(fine(1366)), "primary");
  assert.equal(isTrueMobile(fine(1366)), false);
});

for (const [rule, width] of [["R3", 1099], ["R4", 900], ["R5", 800], ["R6", 700], ["R7", 600]]) {
  test(`${rule} Fine pointer + ${width}px：Compact Desktop`, () => {
    assert.equal(resolveResponsiveMode(fine(width)), "compact");
    assert.equal(isCompactDesktop(fine(width)), true);
    assert.equal(isTrueMobile(fine(width)), false);
  });
}

test("R8 Compact Desktop 不显示 Mobile Navigation Drawer trigger", async () => {
  const [shell, foundationCss] = await Promise.all([read("components/foundation/app-shell.tsx"), read("app/foundation.css")]);
  assert.match(shell, /touchNavigation = viewportMode === "tablet" \|\| viewportMode === "mobile"/);
  assert.match(shell, /data-responsive-mode=\{viewportMode\}/);
  assert.match(shell, /<Drawer open=\{navigationOpen && touchNavigation\}/);
  assert.doesNotMatch(shell, /<nav className="ops-mobile-nav"/);
  assert.match(foundationCss, /data-responsive-mode="compact"[^}]*\.ops-sidebar[^}]*display:\s*flex/s);
});

test("R9 Compact Desktop 保留完整报价操作", async () => {
  const editor = await read("features/quote-center/components/quote-editor.tsx");
  for (const label of ["返回报价中心", "报价版本", "创建价格版本", "客户确认", "导出报价", "删除报价", "保存草稿"]) {
    assert.match(editor, new RegExp(label));
  }
  assert.match(editor, /backTarget=\{\{ href: "\/quote-center", label: "返回报价中心" \}\}/);
});

test("R10 Phase 4 Compact Desktop Quote Center 使用 Compact Record，不强撑宽表", async () => {
  const quoteCss = await read("app/quote-center/quote-center.css");
  assert.match(quoteCss, /data-responsive-mode="compact"[^}]*qc-desktop-quote-table[^}]*display:\s*none !important/s);
  assert.match(quoteCss, /data-responsive-mode="compact"[^}]*qc-mobile-quote-list[^}]*display:\s*grid !important/s);
});

test("R11-R12 Phase 4 报价列表使用统一 Toolbar 与既有真实筛选字段", async () => {
  const list = await read("features/quote-center/components/quote-list.tsx");
  assert.match(list, /<Toolbar className="qc-quote-toolbar"/);
  assert.match(list, /<QuoteSearchField/);
  assert.match(list, /QUOTE_STRUCTURED_SEARCH_FIELDS/);
  assert.match(list, /label="报价类型"/);
  assert.match(list, /label="报价状态"/);
  assert.match(list, /resultSummary=\{`显示 \$\{rows\.length\} \/ \$\{quotes\.length\} 条`\}/);
});

test("R13 Phase 4 Mobile 筛选复用 Foundation MobileSheet", async () => {
  const [list, toolbar] = await Promise.all([read("features/quote-center/components/quote-list.tsx"), read("components/foundation/toolbar.tsx")]);
  assert.match(list, /mobileFilterTitle="报价筛选"/);
  assert.match(toolbar, /<MobileSheet/);
  assert.match(toolbar, /qc-toolbar-more-filters/);
  assert.doesNotMatch(list, /mobileFiltersOpen|qc-mobile-filter/);
});

test("R14 Mobile <600：pointer / hover 不得阻止 Mobile Mode", () => {
  assert.equal(resolveResponsiveMode(touch(390)), "mobile");
  assert.equal(isTrueMobile(touch(390)), true);
  assert.equal(resolveResponsiveMode(fine(402)), "mobile");
  assert.equal(resolveResponsiveMode(fine(440)), "mobile");
  assert.equal(resolveResponsiveMode(fine(599)), "mobile");
});

test("R15 Mobile App Header 与 Navigation Drawer 正常", async () => {
  const [shell, foundationCss] = await Promise.all([read("components/foundation/app-shell.tsx"), read("app/foundation.css")]);
  assert.match(shell, /ops-mobile-menu-trigger/);
  assert.match(shell, /className="ops-navigation-drawer"/);
  assert.match(foundationCss, /data-responsive-mode="mobile"[^}]*\.ops-sidebar[^}]*display:\s*none/s);
  assert.match(foundationCss, /data-responsive-mode="mobile"[^}]*\.ops-topbar/s);
});

test("R16 Mobile 相册 / Camera 不退化", async () => {
  const panel = await read("features/quote-center/components/attachment-panel.tsx");
  assert.match(panel, /accept="image\/\*" multiple/);
  assert.match(panel, /accept="image\/\*" capture="environment"/);
  assert.match(panel, /browserQuoteAttachmentController/);
});

test("R17 Tablet touch mode 正常", () => {
  assert.equal(resolveResponsiveMode(touch(600)), "tablet");
  assert.equal(resolveResponsiveMode(touch(1099)), "tablet");
  assert.equal(resolveResponsiveMode(touch(1100)), "primary");
});

test("R18 Desktop Sidebar 不回归", async () => {
  const foundationCss = await read("app/foundation.css");
  assert.equal(MOBILE_WIDTH, 600);
  assert.equal(PRIMARY_WIDTH, 1100);
  assert.equal(WIDE_WIDTH, 1440);
  assert.equal(COMPACT_WIDTH, 1440);
  assert.match(foundationCss, /data-responsive-mode="primary"[^}]*\.ops-sidebar[^}]*width:\s*186px/s);
  assert.match(foundationCss, /data-responsive-mode="compact"[^}]*\.ops-sidebar[^}]*width:\s*78px/s);
});

test("R18.1 AppShell 在浏览器首帧前解析真实模式，路由切换不闪出展开侧栏", async () => {
  const responsive = await read("components/foundation/responsive.ts");
  assert.match(responsive, /useLayoutEffect\(\(\) => \{/);
  assert.doesNotMatch(responsive, /useEffect\(\(\) => \{[\s\S]*?updateMode\(\)/);
});

test("R19 无 document-level horizontal overflow", async () => {
  const [globalCss, foundationCss] = await Promise.all([read("app/globals.css"), read("app/foundation.css")]);
  assert.match(globalCss, /html, body[^}]*overflow-x:\s*hidden/s);
  assert.match(foundationCss, /ops-shell\.qc-app-shell[^}]*overflow:\s*hidden/s);
});

test("R20 Table horizontal scroll 只发生在 table container", async () => {
  const quoteCss = await read("app/quote-center/quote-center.css");
  assert.match(quoteCss, /\.qc-table-wrap[^}]*overflow-x:\s*auto/s);
  assert.match(quoteCss, /\.qc-cost-table-wrap[^}]*overflow-x:\s*auto/s);
  assert.doesNotMatch(quoteCss, /\.qc-page-container[^}]*overflow-x:\s*auto/s);
});
