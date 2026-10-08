import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("报价中心三个静态路由均存在并共享独立样式", async () => {
  const [list, detail, create, layout] = await Promise.all([
    read("app/quote-center/page.tsx"),
    read("app/quote-center/detail/page.tsx"),
    read("app/quote-center/new/page.tsx"),
    read("app/quote-center/layout.tsx"),
  ]);
  assert.match(list, /QuoteList/);
  assert.match(detail, /ProductionQuoteDetail/);
  assert.match(create, /ProductionQuoteNew/);
  assert.match(layout, /quote-center\.css/);
});

test("详情使用兼容静态导出的 query 路由", async () => {
  const [list, editor] = await Promise.all([
    read("features/quote-center/components/quote-list.tsx"),
    read("features/quote-center/components/quote-editor.tsx"),
  ]);
  assert.match(list, /\/quote-center\/detail\?id=/);
  assert.match(editor, /useSearchParams\(\)/);
  assert.match(editor, /\[quoteId\]/);
  assert.doesNotMatch(`${list}\n${editor}`, /\/quote-center\/\$\{quote\.id\}/);
});

test("价格版本操作在顶部统一使用创建文案，弹窗只编辑名称、数量、说明", async () => {
  const [selector, editor] = await Promise.all([
    read("features/quote-center/components/price-version-selector.tsx"),
    read("features/quote-center/components/quote-editor.tsx"),
  ]);
  assert.doesNotMatch(selector, /复制当前价格版本/);
  assert.match(editor, /id: "create-price-version", label: "创建价格版本"[\s\S]*openVersionModal\("copy", activeVersion\)/);
  assert.doesNotMatch(`${selector}\n${editor}`, /新增价格版本/);
  assert.match(editor, /价格版本名称/);
  assert.match(editor, /数量/);
  assert.match(editor, /说明/);
  const versionModal = editor.slice(editor.indexOf('<Modal open={Boolean(versionModal)}'), editor.indexOf('<Modal open={Boolean(pendingNavigation)}'));
  assert.doesNotMatch(versionModal, /销售单价/);
});

test("报价详情顶部维持业务顺序，Sticky 使用克制的保存与生成订单入口", async () => {
  const editor = await read("features/quote-center/components/quote-editor.tsx");
  const expectedIds = ["revisions", "operation-log", "create-price-version", "confirmation", "export", "delete"];
  const currentActions = editor.slice(editor.indexOf("const contextualActions"), editor.indexOf("const primaryAction"));
  let previous = -1;
  for (const id of expectedIds) {
    const current = currentActions.lastIndexOf(`id: "${id}"`);
    assert.ok(current > previous, `${id} 应按要求排列`);
    previous = current;
  }
  assert.match(editor, /const quoteActionBarProps/);
  assert.equal((editor.match(/<QuoteActionBar \{\.\.\.quoteActionBarProps\}/g) ?? []).length, 1);
  assert.match(editor, /className="qc-sticky-actions"/);
  assert.doesNotMatch(editor.slice(editor.indexOf("const headerActions"), editor.indexOf("return <AppShell")), />报价设置<\/Button>/);
});

test("顶部和 Sticky 操作区按容器测量，不再使用四列等宽 Grid", async () => {
  const [css, actionBar] = await Promise.all([
    read("app/quote-center/responsive.css"),
    read("features/quote-center/components/quote-action-bar.tsx"),
  ]);
  assert.doesNotMatch(css, /qc-header-actions-desktop[\s\S]{0,180}repeat\(4/);
  assert.doesNotMatch(css, /qc-sticky-actions[\s\S]{0,180}repeat\(4/);
  assert.match(actionBar, /ResizeObserver/);
  assert.match(actionBar, /resolveQuoteActionBarMode/);
  assert.match(actionBar, /<FloatingMenu[^>]*label="更多报价操作"/);
});

test("mock repository 与旧 API 隔离", async () => {
  const repository = await read("features/quote-center/repository/mock-quote-repository.ts");
  assert.match(repository, /browserLocalDataStore/);
  assert.match(repository, /legacySessionStorage/);
  assert.match(repository, /LEGACY_QUOTE_STORAGE_KEY/);
  assert.doesNotMatch(repository, /fetch\(|\/api\/quotes|drizzle|database/);
});

test("成本输入使用 Placeholder、稳定 Row ID 与可空数字组件", async () => {
  const [table, editor] = await Promise.all([
    read("features/quote-center/components/cost-table.tsx"),
    read("features/quote-center/components/quote-editor.tsx"),
  ]);
  assert.match(table, /placeholder=\{namePlaceholder\}/);
  assert.match(table, /placeholder="请输入规格"/);
  assert.match(table, /data-row-id=\{line\.id\}/);
  assert.match(table, /key=\{line\.id\}/);
  assert.match(table, /NullableNumberInput/);
  assert.doesNotMatch(editor, /name:\s*"新增面料"|specification:\s*"待填写"/);
});

test("详情编辑器包含 Dirty Guard 与 beforeunload 保护", async () => {
  const editor = await read("features/quote-center/components/quote-editor.tsx");
  assert.match(editor, /isDirty/);
  assert.match(editor, /beforeunload/);
  assert.match(editor, /有未保存的修改/);
  assert.match(editor, /保存并返回/);
  assert.match(editor, /放弃修改/);
  assert.match(editor, /继续编辑/);
});
