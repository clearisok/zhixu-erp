import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { resolveQuoteActionBarMode } from "../features/quote-center/components/quote-action-layout.ts";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("操作区按实际可用宽度依次降级，不依赖固定 viewport breakpoint", () => {
  const required = { full: 900, "compact-navigation": 430, compact: 330, minimal: 220 };
  assert.equal(resolveQuoteActionBarMode(940, required), "full");
  assert.equal(resolveQuoteActionBarMode(600, required), "compact-navigation");
  assert.equal(resolveQuoteActionBarMode(360, required), "compact");
  assert.equal(resolveQuoteActionBarMode(250, required), "minimal");
});

test("普通 Header 使用完整 QuoteActionBar，Sticky 只保留最小业务操作", async () => {
  const editor = await read("features/quote-center/components/quote-editor.tsx");
  assert.match(editor, /const quoteActionBarProps = \{ actions: quoteFrozen \? contextualActions.filter/);
  assert.match(editor, /primaryAction: quoteFrozen \? undefined : primaryAction, quickNavigationItems/);
  assert.match(editor, /backTarget=\{\{ href: "\/quote-center", label: "返回报价中心" \}\} onRequestNavigation=\{requestNavigation\}/);
  assert.doesNotMatch(editor, /<PageHeader[^>]+back=/);
  assert.match(editor, /<QuoteActionBar \{\.\.\.quoteActionBarProps\} onModeChange=\{setHeaderActionMode\}/);
  assert.match(editor, /className="qc-sticky-actions"/);
  assert.match(editor, />保存<\/Button>/);
  assert.match(editor, />生成订单<\/Button>/);
});

test("完整模式按业务优先级直接显示全部按钮，删除保持 danger", async () => {
  const editor = await read("features/quote-center/components/quote-editor.tsx");
  const ids = ["revisions", "operation-log", "create-price-version", "confirmation", "export", "delete"];
  let previous = -1;
  for (const id of ids) {
    const next = editor.indexOf(`id: "${id}"`, previous + 1);
    assert.ok(next > previous, `${id} 应按指定顺序定义`);
    previous = next;
  }
  assert.match(editor, /id: "delete"[\s\S]*?variant: "danger"/);
  assert.match(editor, /id: "save"[\s\S]*?variant: "primary"/);
});

test("不再使用固定四列操作网格或修改 Button 尺寸", async () => {
  const [responsive, component] = await Promise.all([
    read("app/quote-center/responsive.css"),
    read("features/quote-center/components/quote-action-bar.tsx"),
  ]);
  assert.doesNotMatch(responsive, /qc-header-actions-desktop[\s\S]{0,180}repeat\(4/);
  assert.doesNotMatch(responsive, /qc-sticky-actions[\s\S]{0,180}repeat\(4/);
  assert.match(component, /ResizeObserver/);
  assert.match(component, /getBoundingClientRect\(\)\.width/);
  assert.match(component, /data-action-mode=\{mode\}/);
});

test("面料、辅料、其他费用分别只有一套列定义并由 colgroup 同时约束表头和数据行", async () => {
  const source = await read("features/quote-center/components/cost-table.tsx");
  assert.match(source, /const fabricColumns:/);
  assert.match(source, /const trimColumns:/);
  assert.match(source, /const otherCostColumns:/);
  assert.match(source, /function CostColumnLayout/);
  assert.match(source, /<colgroup>\{columns\.map/);
  assert.match(source, /<thead><tr>\{columns\.map/);
  assert.equal((source.match(/<CostColumnLayout columns=\{columns\}/g) ?? []).length, 3);
});

test("宽表移除旧 sticky 像素偏移，紧凑卡字段与输入控件居中", async () => {
  const css = await read("app/quote-center/quote-center.css");
  assert.doesNotMatch(css, /qc-(?:fabric|trim)-cost-table[^}]*left:\s*(?:180|220)px/);
  assert.doesNotMatch(css, /qc-(?:fabric|trim)-cost-table[^}]*right:\s*(?:70|100|170)px/);
  assert.match(css, /qc-cost-wide-renderer \.qc-erp-cost-table thead th[^}]*left:\s*auto[^}]*right:\s*auto/);
  assert.match(css, /\.qc-compact-cost-field[^}]*justify-items:\s*center[^}]*text-align:\s*center/);
});
