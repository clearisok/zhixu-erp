import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { resolveResponsiveMode } from "../components/foundation/responsive.ts";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("R1-R3 成本区域使用内容宽度 Container Query，并定义 Wide / Compact / Narrow 三档", async () => {
  const css = await read("app/quote-center/quote-center.css");
  assert.match(css, /container-name:\s*qc-cost-section/);
  assert.match(css, /@container qc-cost-section \(max-width:\s*1039px\)/);
  assert.match(css, /@container qc-cost-section \(max-width:\s*699px\)/);
  assert.match(css, /\.qc-cost-wide-renderer\s*\{\s*display:\s*block/);
  assert.match(css, /\.qc-cost-compact-renderer, \.qc-cost-mobile-renderer\s*\{\s*display:\s*none/);
});

test("R31-R33 报价明细以 1040 内容宽度进入 Wide，窄桌面保持 Compact", async () => {
  const css = await read("app/quote-center/responsive.css");
  const baseCss = await read("app/quote-center/quote-center.css");
  assert.match(baseCss, /@container qc-cost-section \(max-width:\s*1039px\)/);
  assert.match(css, /@media \(min-width:\s*700px\) and \(max-width:\s*1099px\)/);
  assert.match(css, /qc-cost-section \.qc-cost-wide-renderer[^}]*display:\s*none !important/s);
  assert.match(css, /qc-cost-section \.qc-cost-compact-renderer[^}]*display:\s*grid !important/s);
});

test("R34-R36 Compact 面料严格按三字段首行与六字段次行分组", async () => {
  const css = await read("app/quote-center/quote-center.css");
  assert.match(css, /qc-fabric-compact-grid \.is-name[^}]*grid-column:\s*span 4/s);
  assert.match(css, /qc-fabric-compact-grid \.is-segment[^}]*grid-column:\s*span 2/s);
  assert.match(css, /qc-fabric-compact-grid \.is-loss[^}]*grid-column:\s*span 2/s);
});

test("R37-R40 Compact 辅料与其他费用完整填满两行，Narrow 为单列", async () => {
  const css = await read("app/quote-center/quote-center.css");
  assert.match(css, /qc-trim-compact-grid \.is-name[^}]*grid-column:\s*span 4/s);
  assert.match(css, /qc-trim-compact-grid \.is-usage[^}]*grid-column:\s*span 3/s);
  assert.match(css, /qc-other-compact-grid \.is-name[^}]*grid-column:\s*span 6/s);
  assert.match(css, /qc-other-compact-grid \.is-usage[^}]*grid-column:\s*span 3/s);
  assert.match(css, /@container qc-cost-section \(max-width:\s*699px\)[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
});

test("R4-R7 Wide Table 保留现有面料与辅料宽表、固定列和 sticky header", async () => {
  const [component, css] = await Promise.all([
    read("features/quote-center/components/cost-table.tsx"),
    read("app/quote-center/quote-center.css"),
  ]);
  assert.match(component, /qc-cost-wide-renderer qc-desktop-cost-table/);
  assert.match(component, /qc-fabric-cost-table/);
  assert.match(component, /qc-trim-cost-table/);
  assert.match(css, /\.qc-erp-cost-table th[^}]*position:\s*sticky/);
  assert.match(css, /\.qc-fabric-cost-table, \.qc-trim-cost-table, \.qc-other-cost-table[^}]*table-layout:\s*fixed/s);
});

test("R8-R12 Compact 面料卡完整可编辑并复用同一行 ID、回调和计算函数", async () => {
  const source = await read("features/quote-center/components/cost-table.tsx");
  for (const label of ["面料名称", "成分", "供应商", "段长 cm", "净门幅 cm", "克重 gsm", "损耗率 %", "单价", "采购单位", "单耗", "面料成本"]) {
    assert.match(source, new RegExp(`label=\"${label.replace("/", "\\/")}`));
  }
  assert.match(source, /function FabricCompactCard/);
  assert.match(source, /key=\{line\.id\} line=\{line\}/);
  assert.match(source, /fabricConsumptionValue\(line\)/);
  assert.match(source, /fabricCostValue\(line\)/);
  assert.match(source, /onPurchaseUnitChange\(line\.id/);
});

test("R13-R16 Compact 辅料卡包含全部录入字段、来源、结果和操作", async () => {
  const source = await read("features/quote-center/components/cost-table.tsx");
  assert.match(source, /function TrimCompactCard/);
  for (const label of ["辅料名称", "规格", "供应商", "数量 / 用量", "单位", "损耗率 %", "单价", "单件金额"]) {
    assert.match(source, new RegExp(label.replace("/", "\\/")));
  }
  assert.match(source, /status=\{trimStatus\(line, library\)\}/);
  assert.match(source, /<RowActions type="辅料"/);
  assert.match(source, /value=\{costLineValue\(line\)\}/);
});

test("R17-R20 工价复用 nullable metrics，其他费用保留来源并只显示一个小计", async () => {
  const [component, editor] = await Promise.all([
    read("features/quote-center/components/cost-table.tsx"),
    read("features/quote-center/components/quote-editor.tsx"),
  ]);
  assert.match(editor, /qc-page-section-anchor qc-cost-section/);
  assert.match(editor, /metrics\?\.laborRmb/);
  assert.doesNotMatch(editor, /activeVersion\.labor\.value\)\s*\*\s*numberOrZero/);
  assert.match(component, /function OtherCostCompactCard/);
  assert.match(component, /line\.source === "global"/);
  assert.match(component, /const subtotal = lines\.some\(\(line\) => costLineValue\(line\) !== null\) \? sumCostLines\(lines\) : null/);
  assert.match(component, /\{title\}小计/);
});

test("R21-R24 Compact 卡共享同一设计骨架，结果为只读文本且没有横向滚动容器", async () => {
  const [component, css] = await Promise.all([
    read("features/quote-center/components/cost-table.tsx"),
    read("app/quote-center/quote-center.css"),
  ]);
  assert.match(component, /qc-compact-cost-card/);
  assert.match(component, /qc-compact-cost-grid/);
  assert.match(component, /function CompactResult/);
  assert.match(css, /\.qc-cost-compact-renderer[^}]*display:\s*grid/);
  assert.doesNotMatch(css, /\.qc-cost-compact-renderer[^}]*overflow-x:\s*auto/);
  assert.match(css, /\.qc-compact-cost-field input[^}]*height:\s*36px/);
});

test("R25-R27 Material 与 Supplier 下拉继续使用 body Portal，Row key 不使用 index/random", async () => {
  const [component, supplier] = await Promise.all([
    read("features/quote-center/components/cost-table.tsx"),
    read("components/foundation/creatable-combobox.tsx"),
  ]);
  assert.match(component, /createPortal/);
  assert.match(component, /document\.body/);
  assert.match(supplier, /createPortal/);
  assert.match(supplier, /document\.body/);
  assert.doesNotMatch(component, /key=\{index\}|Math\.random\(\)/);
});

test("R28-R30 650 fine pointer 保持 Compact App；True Mobile 才切轻量面辅料摘要", async () => {
  const responsiveCss = await read("app/quote-center/responsive.css");
  assert.equal(resolveResponsiveMode({ width: 650, hasHover: true, hasFinePointer: true, hasCoarsePointer: false }), "compact");
  assert.equal(resolveResponsiveMode({ width: 390, hasHover: false, hasFinePointer: false, hasCoarsePointer: true }), "mobile");
  assert.match(responsiveCss, /data-responsive-mode="mobile"[^}]*qc-fabric-cost-card[^}]*qc-cost-compact-renderer/s);
  assert.match(responsiveCss, /data-responsive-mode="mobile"[^}]*qc-fabric-cost-card[^}]*qc-cost-mobile-renderer/s);
  assert.doesNotMatch(responsiveCss, /qc-desktop-cost-table[^}]*display:\s*block !important/);
});
