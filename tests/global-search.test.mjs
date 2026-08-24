import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { SearchRegistry, nextSearchResultIndex } from "../features/global-search/model/global-search.ts";
import { createQuoteSearchProvider } from "../features/global-search/providers/quote-search-provider.ts";
import { createRecentSearchRepository } from "../features/global-search/repository/recent-search-repository.ts";
import { createQuoteDraft, getDefaultRevision } from "../features/quote-center/model/quote-view-model.ts";

function quoteFixture() {
  const quote = createQuoteDraft("quote-search-1", "QT-2026-0817-001", "2026-08-23");
  const revision = getDefaultRevision(quote);
  revision.revisionLabel = "V2";
  revision.baseInfo.quoteStyleNo = "T2337";
  revision.baseInfo.styleName = "精梳棉宽松圆领短袖";
  revision.baseInfo.brandName = "ZARA";
  revision.baseInfo.salespersonName = "林青禾";
  revision.priceVersions[0].fabrics.push({ id: "secret-fabric", sourceLibraryItemId: null, name: "成本面料", composition: "", segmentLengthCm: 100, netWidthCm: 145, gsm: 180, lossRate: 3, supplier: "", unitPrice: 9876.54, purchaseUnit: "kg" });
  return quote;
}

function repositoryWith(quotes) {
  return {
    async list() { return structuredClone(quotes); },
    async getById(id) { return structuredClone(quotes.find((quote) => quote.id === id) ?? null); },
    async save() {},
    async delete() {},
    async createDraft() { return quoteFixture(); },
  };
}

const allowed = { userId: "viewer", can: (permission) => permission === "quote.view" };
const denied = { userId: "blocked", can: () => false };

test("QuoteSearchProvider 支持报价号、款号、款式名称、品牌和客户业务员", async () => {
  const registry = new SearchRegistry([createQuoteSearchProvider(repositoryWith([quoteFixture()]))]);
  for (const query of ["QT-2026-0817-001", "T2337", "精梳棉宽松", "zara", "林青禾"]) {
    const groups = await registry.search(query, allowed);
    assert.equal(groups[0]?.results[0]?.title, "T2337", query);
    assert.equal(groups[0]?.results[0]?.href, "/quote-center/detail?id=quote-search-1", query);
  }
});

test("搜索结果只包含报价展示信息，不暴露成本字段或成本值", async () => {
  const registry = new SearchRegistry([createQuoteSearchProvider(repositoryWith([quoteFixture()]))]);
  const result = (await registry.search("T2337", allowed))[0].results[0];
  const serialized = JSON.stringify(result);
  assert.match(serialized, /ZARA/);
  assert.doesNotMatch(serialized, /QT-2026-0817-001/);
  assert.match(serialized, /V2/);
  assert.doesNotMatch(serialized, /9876\.54|secret-fabric|成本面料|unitPrice|fabrics/);
});

test("无 quote.view 权限时 Provider 不执行且搜索不到报价", async () => {
  let calls = 0;
  const repository = repositoryWith([quoteFixture()]);
  const originalList = repository.list;
  repository.list = async () => { calls += 1; return originalList(); };
  const registry = new SearchRegistry([createQuoteSearchProvider(repository)]);
  assert.deepEqual(await registry.search("T2337", denied), []);
  assert.equal(calls, 0);
});

test("SearchRegistry 可注册未来 Provider，并拒绝重复 Provider id", async () => {
  const future = (id, label) => ({
    id, label, canSearch: () => true,
    async search() { return [{ id: `${id}:1`, providerId: id, type: id, typeLabel: label, icon: "◇", title: label, subtitle: "未来模块", meta: [], href: `/${id}` }]; },
  });
  const registry = new SearchRegistry([future("orders", "订单"), future("production", "排单")]);
  assert.deepEqual((await registry.search("test", allowed)).map((group) => group.label), ["订单", "排单"]);
  assert.throws(() => new SearchRegistry([future("orders", "订单"), future("orders", "重复")]), /id 重复/);
});

test("最近访问按用户隔离、去重并保留最新顺序", () => {
  const repository = createRecentSearchRepository(null);
  const result = { id: "quote:1", providerId: "quotes", type: "quote", typeLabel: "报价", icon: "¥", title: "T2337", subtitle: "款式", meta: [], href: "/quote-center/detail?id=1" };
  repository.record("user-a", result);
  repository.record("user-a", { ...result, title: "更新标题" });
  repository.record("user-b", { ...result, id: "quote:2" });
  assert.equal(repository.list("user-a").length, 1);
  assert.equal(repository.list("user-a")[0].title, "更新标题");
  assert.equal(repository.list("user-b")[0].id, "quote:2");
});

test("键盘上下选择循环，空结果保持 -1", () => {
  assert.equal(nextSearchResultIndex(-1, 1, 3), 0);
  assert.equal(nextSearchResultIndex(0, -1, 3), 2);
  assert.equal(nextSearchResultIndex(2, 1, 3), 0);
  assert.equal(nextSearchResultIndex(0, 1, 0), -1);
});

test("AppShell 提供顶部搜索、Ctrl/Cmd+K，Palette 使用 Portal 并支持方向键、Enter、Esc", async () => {
  const shell = await readFile(new URL("../components/foundation/app-shell.tsx", import.meta.url), "utf8");
  const palette = await readFile(new URL("../features/global-search/components/global-search-palette.tsx", import.meta.url), "utf8");
  assert.match(shell, /event\.ctrlKey \|\| event\.metaKey/);
  assert.match(shell, /event\.key\.toLowerCase\(\) === "k"/);
  assert.match(shell, /打开全局搜索/);
  assert.match(palette, /createPortal/);
  assert.match(palette, /ArrowDown/);
  assert.match(palette, /ArrowUp/);
  assert.match(palette, /event\.key === "Enter"/);
  assert.match(palette, /event\.key === "Escape"/);
  assert.match(palette, /nativeEvent\.isComposing/);
  assert.match(palette, /openSearchResult/);
  assert.match(palette, /filterAccessible\(\[result\], context\)/);
});
