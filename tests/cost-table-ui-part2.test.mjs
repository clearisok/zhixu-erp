import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const componentUrl = new URL("../features/quote-center/components/cost-table.tsx", import.meta.url);
const editorUrl = new URL("../features/quote-center/components/quote-editor.tsx", import.meta.url);
const cssUrl = new URL("../app/quote-center/quote-center.css", import.meta.url);

test("面料与辅料使用可搜索、可自由输入且支持键盘的真实下拉选择", async () => {
  const source = await readFile(componentUrl, "utf8");
  assert.match(source, /role="combobox"/);
  assert.match(source, /ArrowDown/);
  assert.match(source, /ArrowUp/);
  assert.match(source, /库中无匹配项，可继续自由输入/);
  assert.match(source, /item\.composition/);
  assert.match(source, /item\.netWidthCm/);
  assert.match(source, /item\.gsm/);
  assert.match(source, /item\.supplier/);
  assert.match(source, /item\.unitPrice/);
  assert.match(source, /createPortal/);
  assert.match(source, /document\.body/);
});

test("来源状态改为浮动 badge，不再渲染来自面料库快照说明行", async () => {
  const source = await readFile(componentUrl, "utf8");
  assert.match(source, /来自面料库/);
  assert.match(source, /来自辅料库/);
  assert.match(source, /本报价已修改/);
  assert.match(source, /手工输入/);
  assert.doesNotMatch(source, /来自面料库快照/);
  assert.doesNotMatch(source, /来自辅料库快照/);
});

test("采购单位使用 Segmented Control，计算结果使用只读展示", async () => {
  const source = await readFile(componentUrl, "utf8");
  const editor = await readFile(editorUrl, "utf8");
  assert.match(source, /qc-unit-segment/);
  assert.match(source, /aria-pressed/);
  assert.doesNotMatch(source, /<select[^>]*采购单位/);
  assert.match(source, /function ReadOnlyMetric/);
  assert.match(source, /qc-readonly-metric/);
  assert.match(source, /RMB\/kg · RMB\/m/);
  assert.match(source, /kg\/件 · m\/件/);
  assert.match(source, /qc-unit-heading/);
  assert.match(source, /suffix="RMB\/件"/);
  assert.match(editor, /采购单位已改变，请确认对应单价/);
  assert.match(editor, /系统未进行 RMB\/kg 与 RMB\/m 换算/);
});

test("ERP 宽表使用比例列宽铺满内容区，并保留 sticky 表头与统一输入高度", async () => {
  const [css, source] = await Promise.all([
    readFile(cssUrl, "utf8"),
    readFile(new URL("../features/quote-center/components/cost-table.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(css, /\.qc-cost-table-wrap[^}]*overflow-x:\s*auto/);
  assert.match(css, /\.qc-erp-cost-table th[^}]*position:\s*sticky/);
  assert.match(css, /\.qc-erp-cost-table input[^}]*height:\s*36px/);
  assert.match(css, /\.qc-fabric-cost-table, \.qc-trim-cost-table, \.qc-other-cost-table[^}]*min-width:\s*0[^}]*table-layout:\s*fixed/s);
  assert.match(source, /const fabricColumns:[\s\S]*key: "name"[\s\S]*weight: 18/);
  assert.match(source, /const trimColumns:[\s\S]*key: "supplier"[\s\S]*weight: 21/);
  assert.match(source, /const otherCostColumns:[\s\S]*key: "name"[\s\S]*weight: 21/);
  assert.match(source, /style=\{\{ width: `\$\{\(column\.weight \/ totalWeight\) \* 100\}%` \}\}/);
  assert.match(css, /\.qc-material-popover[^}]*position:\s*fixed/);
  assert.match(css, /\.qc-material-popover[^}]*width:\s*400px/);
  assert.match(css, /\.qc-material-popover[^}]*max-height:\s*300px/);
  assert.match(css, /\.qc-readonly-metric[^}]*background:\s*transparent/);
});

test("供应商建议使用 body Portal，并按输入框宽度定位", async () => {
  const source = await readFile(new URL("../components/foundation/creatable-combobox.tsx", import.meta.url), "utf8");
  assert.match(source, /createPortal/);
  assert.match(source, /document\.body/);
  assert.match(source, /anchor\.width/);
  assert.match(source, /qc-creatable-options-portal/);
});

test("空计算值显示破折号，明确的零仍格式化显示", async () => {
  const source = await readFile(componentUrl, "utf8");
  assert.match(source, /value === null \? "—"/);
  assert.match(source, /value\.toFixed\(prefix \? 2 : 4\)/);
  assert.match(source, /line\.usage === null \|\| line\.unitPrice === null \? null/);
  assert.match(source, /line\.segmentLengthCm === null/);
});

test("操作列使用紧凑图标按钮并保留保存到库与删除能力", async () => {
  const source = await readFile(componentUrl, "utf8");
  const css = await readFile(cssUrl, "utf8");
  assert.match(source, /保存到\$\{type\}库/);
  assert.match(source, /删除本行/);
  assert.match(source, /qc-compact-actions/);
  assert.match(css, /\.qc-compact-actions button[^}]*width:\s*30px/);
});
