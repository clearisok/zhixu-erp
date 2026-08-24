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
  assert.match(detail, /QuoteDetailLoader/);
  assert.match(create, /QuoteNewLoader/);
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
  assert.match(editor, /openVersionModal\("copy", activeVersion\)\}>创建价格版本<\/Button>/);
  assert.doesNotMatch(`${selector}\n${editor}`, /新增价格版本/);
  assert.match(editor, /价格版本名称/);
  assert.match(editor, /数量/);
  assert.match(editor, /说明/);
  const versionModal = editor.slice(editor.indexOf('<Modal open={Boolean(versionModal)}'), editor.indexOf('<Modal open={Boolean(pendingNavigation)}'));
  assert.doesNotMatch(versionModal, /销售单价/);
});

test("报价详情顶部与窄屏固定操作区保持统一业务顺序", async () => {
  const editor = await read("features/quote-center/components/quote-editor.tsx");
  const expected = ["返回列表", "报价版本", "创建价格版本", "客户确认", "删除报价", "保存草稿"];
  const headerActions = editor.slice(editor.indexOf("const headerActions"), editor.indexOf("const stickyActions"));
  const stickyActions = editor.slice(editor.indexOf("const stickyActions"), editor.indexOf("return <AppShell"));
  for (const actions of [headerActions, stickyActions]) {
    let previous = -1;
    for (const label of expected) {
      const current = actions.indexOf(`>${label}</Button>`);
      assert.ok(current > previous, `${label} 应按要求排列`);
      previous = current;
    }
  }
  assert.doesNotMatch(headerActions, />报价设置<\/Button>/);
});

test("mock repository 与旧 API 隔离", async () => {
  const repository = await read("features/quote-center/repository/mock-quote-repository.ts");
  assert.match(repository, /sessionStorage/);
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
