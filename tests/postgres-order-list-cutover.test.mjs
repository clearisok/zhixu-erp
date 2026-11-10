import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  initialServerOrderCenterQuery,
  loadServerOrderCenterDetail,
  loadServerOrderCenterPage,
  normalizeServerOrderSearch,
  SERVER_ORDER_CENTER_PAGE_SIZE,
  toServerSalesOrderListQuery,
} from "../features/order-center/server/server-order-center-query.ts";

const routeSource = await readFile(new URL("../app/order-center/page.tsx", import.meta.url), "utf8");
const productionSource = await readFile(new URL("../features/order-center/components/server-order-center-page.tsx", import.meta.url), "utf8");
const browserPageSource = await readFile(new URL("../features/order-center/components/order-pages.tsx", import.meta.url), "utf8");
const browserRepositorySource = await readFile(new URL("../features/order-center/repository/order-repository.ts", import.meta.url), "utf8");
const localBootstrapSource = await readFile(new URL("../features/data-management/components/local-data-bootstrap.tsx", import.meta.url), "utf8");
const permissionProviderSource = await readFile(new URL("../features/permissions/components/permission-provider.tsx", import.meta.url), "utf8");
const quoteToOrderSource = await readFile(new URL("../features/order-center/components/quote-to-order-modal.tsx", import.meta.url), "utf8");

const listItem = {
  id: "11111111-1111-4111-8111-111111111111",
  version: 1,
  orderNo: "SO-00000001",
  creationSource: "ainuoke",
  lifecycleState: "draft",
  billNo: "PI2601-001",
  factoryStyleNo: "INSIDE-001",
  styleNo: "STYLE-001",
  companyName: "COMPANY",
  customerName: "CUSTOMER",
  brandName: "BRAND",
  initialQuantity: 100,
  sourceLifecycleStatus: "生效",
  contractDate: "2026-01-01",
  contractDeliveryDate: "2026-02-01",
  colorCount: 0,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

test("production /order-center selects the dedicated PostgreSQL component", () => {
  assert.match(routeSource, /ServerOrderCenterPage/u);
  assert.doesNotMatch(routeSource, /<OrderCenterPage\s*\//u);
  assert.match(productionSource, /serverSalesOrderReadRepository/u);
  assert.match(productionSource, /数据源：PostgreSQL/u);
  assert.doesNotMatch(productionSource, /DEV SHADOW READ/u);
});

test("production query normalizes search and always requests a 50-row server page", () => {
  assert.equal(initialServerOrderCenterQuery.sortBy, "contractDate");
  assert.equal(initialServerOrderCenterQuery.sortDirection, "desc");
  assert.equal(SERVER_ORDER_CENTER_PAGE_SIZE, 50);
  assert.equal(normalizeServerOrderSearch("  ＳＯ－０００００００１  "), "SO-00000001");
  assert.deepEqual(toServerSalesOrderListQuery({
    ...initialServerOrderCenterQuery,
    offset: 50,
    search: "STYLE",
    lifecycleState: "draft",
    creationSource: "ainuoke",
    sortBy: "updatedAt",
    sortDirection: "desc",
  }), {
    followupMode: 'active',
    limit: 50,
    offset: 50,
    search: "STYLE",
    lifecycleState: "draft",
    creationSource: "ainuoke",
    sortBy: "updatedAt",
    sortDirection: "desc",
  });
});

test("production loader uses only the injected Server read repository", async () => {
  const calls = { serverList: 0, serverDetail: 0, browserList: 0, browserGet: 0, browserSave: 0, browserSaveAll: 0 };
  const browserRepository = {
    list: async () => { calls.browserList += 1; },
    getById: async () => { calls.browserGet += 1; },
    save: async () => { calls.browserSave += 1; },
    saveAll: async () => { calls.browserSaveAll += 1; },
  };
  const serverRepository = {
    list: async (query) => {
      calls.serverList += 1;
      assert.equal(query.limit, 50);
      return { items: [listItem], page: { limit: 50, offset: 0, total: 1, hasMore: false } };
    },
    getById: async (id) => {
      calls.serverDetail += 1;
      assert.equal(id, listItem.id);
      return { ...listItem, colors: [] };
    },
  };

  const page = await loadServerOrderCenterPage(serverRepository, initialServerOrderCenterQuery);
  const detail = await loadServerOrderCenterDetail(serverRepository, page.items[0].id);
  assert.equal(page.items[0].colorCount, 0);
  assert.deepEqual(detail.colors, []);
  assert.deepEqual(calls, { serverList: 1, serverDetail: 1, browserList: 0, browserGet: 0, browserSave: 0, browserSaveAll: 0 });
  assert.ok(browserRepository);
});

test("production list cannot route PostgreSQL UUIDs into the Browser editor", () => {
  assert.doesNotMatch(productionSource, /orderRepository|browserLocalDataStore/u);
  assert.doesNotMatch(productionSource, /\/order-center\/(?:detail|new)(?:[?`"'])/u);
  assert.doesNotMatch(productionSource, /\.(?:save|saveAll|delete|remove|update)\s*\(/u);
  assert.match(productionSource, /\/order-center\/server-detail\?id=\$\{encodeURIComponent\(item\.id\)\}/u);
  assert.doesNotMatch(productionSource, /loadServerOrderCenterDetail|<Drawer/u);
});

test("production states are explicit and never fall back to local orders", () => {
  assert.match(productionSource, /serverSession\.status === "checking"/u);
  assert.match(productionSource, /serverSession\.status === "anonymous"/u);
  assert.match(productionSource, /没有订单查看权限/u);
  assert.match(productionSource, /error\.status === 401/u);
  assert.match(productionSource, /serverSession\.invalidate\(\)/u);
  assert.match(productionSource, /error\.status === 403/u);
  assert.match(productionSource, /订单服务暂时不可用/u);
  assert.match(productionSource, /不会切换到 Browser 本地订单/u);
});

test("server search, filters, allowlisted sorting, and pagination stay server-side", () => {
  for (const token of [
    "normalizeServerOrderSearch",
    "lifecycleState",
    "creationSource",
    'value="orderNo"',
    'value="contractDate"',
    'value="updatedAt"',
    'value="contractDeliveryDate"',
    'value="salesContractNo"',
    "page.hasMore",
    "SERVER_ORDER_CENTER_PAGE_SIZE",
  ]) assert.match(productionSource, new RegExp(token));
  assert.doesNotMatch(productionSource, /items\.filter|items\.sort/u);
});

test("Browser repositories and legacy write routes remain preserved but isolated", () => {
  assert.match(localBootstrapSource, /pathname !== "\/order-center"/u);
  assert.match(localBootstrapSource, /pathname !== "\/order-center\/server-preview"/u);
  assert.match(localBootstrapSource, /pathname !== "\/order-center\/server-detail"/u);
  assert.match(browserPageSource, /export function OrderCenterPage/u);
  assert.match(browserPageSource, /export function OrderNewLoader/u);
  assert.match(browserPageSource, /export function OrderDetailLoader/u);
  assert.match(browserRepositorySource, /export const orderRepository = createOrderRepository\(\)/u);
  assert.match(quoteToOrderSource, /orderRepository\.save\(order\)/u);
  assert.match(permissionProviderSource, /permissionRepository\.load\(\)/u);
  assert.doesNotMatch(permissionProviderSource.slice(permissionProviderSource.indexOf("export function PermissionProvider(")), /useServerSession|serverAuthClient/u);
});

test("production columns contain only current PostgreSQL or lossless projection facts", () => {
  for (const label of [
    "正式订单 / BillNo",
    "款号 / 工厂款号",
    "客户 / 品牌",
    "订单数量",
    "生命周期 / 来源状态",
    "交期 / 颜色",
    "创建来源",
    "操作",
  ]) assert.match(productionSource, new RegExp(label));
  assert.doesNotMatch(productionSource, /customerPoNo|salesperson|merchandiser|productionCountry|priceVersions|deliveryPlans|averageDailyOutput|closing|scheduling/u);
});
