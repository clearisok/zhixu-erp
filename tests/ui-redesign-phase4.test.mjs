import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createLocalDataStore } from "../features/data-management/repository/local-data-store.ts";
import { createNavigationIntent } from "../features/quote-center/model/quote-editor-state.ts";
import { validateQuoteCreation } from "../features/quote-center/model/quote-validation.ts";
import { getDefaultRevision } from "../features/quote-center/model/quote-view-model.ts";
import { createMockQuoteRepository } from "../features/quote-center/repository/mock-quote-repository.ts";
import { validateOrderIntegrity } from "../features/order-center/model/order.ts";
import { createOrderRepository } from "../features/order-center/repository/order-repository.ts";
import { createManualOrder } from "../features/order-center/service/order-service.ts";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

class MemoryStorage {
  values = new Map();
  get length() { return this.values.size; }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
  key(index) { return [...this.values.keys()][index] ?? null; }
}

const createTestStore = (namespace) => createLocalDataStore({
  storage: new MemoryStorage(),
  namespace,
  environment: "test",
  now: () => "2026-08-30T08:00:00.000Z",
});

test("Phase 4 有效新建报价写入独立测试 namespace 并指向详情路由", async () => {
  const repository = createMockQuoteRepository({ store: createTestStore("zhixu.erp.test.phase4.quote"), legacySessionStorage: null });
  const draft = await repository.createDraft("2026-08-30");
  const revision = getDefaultRevision(draft);
  const completedRevision = {
    ...revision,
    baseInfo: {
      ...revision.baseInfo,
      brandId: "brand-test",
      brandName: "测试品牌",
      salespersonId: "sales-test",
      salespersonName: "测试客户",
      quoteStyleNo: "PH4-Q-001",
      styleName: "Phase 4 报价款",
    },
    priceVersions: revision.priceVersions.map((version) => ({ ...version, quantity: 1200 })),
  };
  assert.deepEqual(validateQuoteCreation(completedRevision).issues, []);
  const quote = { ...draft, revisions: draft.revisions.map((item) => item.revisionId === completedRevision.revisionId ? completedRevision : item) };
  await repository.save(quote);
  assert.equal((await repository.getById(quote.id))?.id, quote.id);
  const source = await read("features/quote-center/components/quote-editor.tsx");
  assert.match(source, /router\.replace\(`\/quote-center\/detail\?id=/);
});

test("Phase 4 有效新建订单写入独立测试 namespace 并指向详情路由", async () => {
  const repository = createOrderRepository(createTestStore("zhixu.erp.test.phase4.order"));
  const order = createManualOrder({
    id: "phase4-order-001",
    createdAt: "2026-08-30T08:00:00.000Z",
    actor: { id: "phase4-user", name: "Phase 4 QA" },
    header: { orderNo: "SO-PH4-001", customerId: null, customerNameSnapshot: "测试客户", customerPoNo: "PO-PH4", orderDate: "2026-08-30", salespersonId: null, salespersonNameSnapshot: "", merchandiserId: null, merchandiserNameSnapshot: "", orderType: "processing", remark: "" },
    style: { styleNo: "PH4-O-001", styleName: "Phase 4 订单款", initialQuantity: 800 },
  });
  const currentPrice = order.priceVersions[0];
  const validOrder = { ...order, priceVersions: [{ ...currentPrice, processingUnitPrice: 18.5 }] };
  assert.deepEqual(validateOrderIntegrity(validOrder), []);
  await repository.save(validOrder);
  assert.equal((await repository.getById(validOrder.id))?.id, validOrder.id);
  const source = await read("features/order-center/components/order-pages.tsx");
  assert.match(source, /router\.replace\(\s*`\/order-center\/detail\?id=/);
});

test("Phase 4 新建页初始 clean、用户修改后 dirty，只有 dirty 离开才拦截", async () => {
  const [quoteSource, orderSource] = await Promise.all([
    read("features/quote-center/components/quote-editor.tsx"),
    read("features/order-center/components/order-pages.tsx"),
  ]);
  assert.match(quoteSource, /const \[isDirty, setIsDirty\] = useState\(false\)/);
  assert.match(orderSource, /const \[dirty, setDirty\] = useState\(false\)/);
  assert.match(quoteSource, /setIsDirty\(true\)/);
  assert.match(orderSource, /setDirty\(true\)/);
  assert.deepEqual(createNavigationIntent(false, "/quote-center"), { navigateTo: "/quote-center", pendingTarget: null });
  assert.deepEqual(createNavigationIntent(true, "/quote-center"), { navigateTo: null, pendingTarget: "/quote-center" });
  assert.match(orderSource, /if \(dirty\)\s*setPendingListNavigation\(true\);\s*else\s*router\.push\("\/order-center"\)/);
});

test("Phase 4 dirty guard 提供继续编辑与放弃路径，创建提交防重复", async () => {
  const [quoteSource, orderSource, formShell] = await Promise.all([
    read("features/quote-center/components/quote-editor.tsx"),
    read("features/order-center/components/order-pages.tsx"),
    read("components/foundation/form-shell.tsx"),
  ]);
  for (const source of [quoteSource, orderSource]) {
    assert.match(source, /继续编辑/);
    assert.match(source, /放弃|不保存/);
  }
  assert.match(quoteSource, /创建并返回/);
  assert.match(orderSource, /保存并返回/);
  assert.match(formShell, /if \(submittingRef\.current\) return/);
  assert.match(formShell, /submittingRef\.current = true/);
});

test("Phase 4 三页使用 Foundation 并具有真实 Compact 与 Mobile 任务布局", async () => {
  const [quoteList, quoteEditor, orderPages, quoteCss, orderCss] = await Promise.all([
    read("features/quote-center/components/quote-list.tsx"),
    read("features/quote-center/components/quote-editor.tsx"),
    read("features/order-center/components/order-pages.tsx"),
    read("app/quote-center/quote-center.css"),
    read("app/order-center/order-center.css"),
  ]);
  for (const marker of ["<PageHeader", "<Toolbar", "<DataTable", "QuoteRevision", "PriceVersion", "最终报价"]) assert.match(quoteList, new RegExp(marker.replace("<", "\\<")));
  for (const marker of ["CREATE QUOTE", "<FormShell", "<FormSection", "validateQuoteCreation", "创建报价"]) assert.match(quoteEditor, new RegExp(marker.replace("<", "\\<")));
  for (const marker of ["CREATE ORDER", "<FormShell", "<FormSection", "validateOrderIntegrity", "系统订单号", "DeliveryPlan"]) assert.match(orderPages, new RegExp(marker.replace("<", "\\<")));
  assert.match(quoteCss, /data-responsive-mode="compact"[\s\S]*qc-mobile-quote-list/);
  assert.match(quoteCss, /data-responsive-mode="primary"[\s\S]*table-layout:\s*fixed/);
  assert.match(quoteCss, /data-responsive-mode="mobile"[\s\S]*qc-quote-create-page \.qc-base-layout/);
  assert.match(orderCss, /data-responsive-mode="mobile"[\s\S]*oc-create-page/);
  assert.match(quoteEditor, /initiallyExpanded=\{createAttempted\}/);
});
