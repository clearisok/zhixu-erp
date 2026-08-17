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
  assert.match(editor, /URLSearchParams\(window\.location\.search\)/);
  assert.doesNotMatch(`${list}\n${editor}`, /\/quote-center\/\$\{quote\.id\}/);
});

test("价格版本只暴露复制入口，弹窗只编辑名称、数量、说明", async () => {
  const [selector, editor] = await Promise.all([
    read("features/quote-center/components/price-version-selector.tsx"),
    read("features/quote-center/components/quote-editor.tsx"),
  ]);
  assert.match(selector, /复制当前价格版本/);
  assert.doesNotMatch(`${selector}\n${editor}`, /新增价格版本/);
  assert.match(editor, /价格版本名称/);
  assert.match(editor, /数量/);
  assert.match(editor, /说明/);
  const versionModal = editor.slice(editor.indexOf('<Modal open={Boolean(versionModal)}'), editor.indexOf('<Modal open={Boolean(pendingNavigation)}'));
  assert.doesNotMatch(versionModal, /销售单价/);
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
