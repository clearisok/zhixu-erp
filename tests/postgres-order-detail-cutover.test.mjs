import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { loadServerOrderCenterDetail } from "../features/order-center/server/server-order-center-query.ts";

const routeSource = await readFile(new URL("../app/order-center/server-detail/page.tsx", import.meta.url), "utf8");
const listSource = await readFile(new URL("../features/order-center/components/server-order-center-page.tsx", import.meta.url), "utf8");
const detailSource = await readFile(new URL("../features/order-center/components/server-sales-order-detail-page.tsx", import.meta.url), "utf8");
const modelSource = await readFile(new URL("../features/order-center/server/sales-order-server-model.ts", import.meta.url), "utf8");
const clientSource = await readFile(new URL("../features/order-center/server/sales-order-server-client.ts", import.meta.url), "utf8");
const serverRepositorySource = await readFile(new URL("../features/order-center/server/server-sales-order-read-repository.ts", import.meta.url), "utf8");
const browserRepositorySource = await readFile(new URL("../features/order-center/repository/order-repository.ts", import.meta.url), "utf8");
const browserDetailRouteSource = await readFile(new URL("../app/order-center/detail/page.tsx", import.meta.url), "utf8");
const localBootstrapSource = await readFile(new URL("../features/data-management/components/local-data-bootstrap.tsx", import.meta.url), "utf8");

const id = "11111111-1111-4111-8111-111111111111";
const detail = {
  id,
  version: 1,
  orderNo: "SO-00000001",
  creationSource: "ainuoke",
  lifecycleState: "draft",
  billNo: "PI2601-001",
  insideOrderNo: "INSIDE-001",
  styleNo: "STYLE-001",
  companyName: "AINUOKE COMPANY",
  customerName: "AINUOKE CUSTOMER",
  brandName: "AINUOKE BRAND",
  quantity: 100,
  sourceLifecycleStatus: "生效",
  contractDate: "2026-01-01",
  contractDeliveryDate: "2026-02-01",
  colorCount: 0,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  colors: [],
};

test("production list opens the dedicated static Server detail route with the PostgreSQL UUID", () => {
  assert.match(routeSource, /ServerSalesOrderDetailPage/u);
  assert.match(listSource, /useRouter/u);
  assert.match(listSource, /\/order-center\/server-detail\?id=\$\{encodeURIComponent\(item\.id\)\}/u);
  assert.doesNotMatch(listSource, /\/order-center\/detail\?id=/u);
  assert.doesNotMatch(routeSource, /OrderDetailLoader|order-pages/u);
  assert.match(browserDetailRouteSource, /OrderDetailLoader/u);
});

test("production detail loader uses only the injected Server read repository", async () => {
  const calls = { serverGet: 0, browserList: 0, browserGet: 0, browserSave: 0 };
  const browserRepository = {
    list: async () => { calls.browserList += 1; },
    getById: async () => { calls.browserGet += 1; },
    save: async () => { calls.browserSave += 1; },
  };
  const serverRepository = {
    list: async () => { throw new Error("list not expected"); },
    getById: async (actualId) => {
      calls.serverGet += 1;
      assert.equal(actualId, id);
      return detail;
    },
  };

  assert.deepEqual(await loadServerOrderCenterDetail(serverRepository, id), detail);
  assert.deepEqual(calls, { serverGet: 1, browserList: 0, browserGet: 0, browserSave: 0 });
  assert.ok(browserRepository);
});

test("production detail has trusted-session 401, order.view 403, 404, and unavailable states", () => {
  assert.match(detailSource, /serverSession\.status === "checking"/u);
  assert.match(detailSource, /serverSession\.status === "anonymous"/u);
  assert.match(detailSource, /nextError\.status === 401/u);
  assert.match(detailSource, /serverSession\.invalidate\(\)/u);
  assert.match(detailSource, /nextError\.status === 403/u);
  assert.match(detailSource, /order\.view/u);
  assert.match(detailSource, /Server 权限不足（403）/u);
  assert.match(detailSource, /nextError\.status === 404/u);
  assert.match(detailSource, /正式订单不存在（404）/u);
  assert.match(detailSource, /订单服务暂时不可用/u);
  assert.match(detailSource, /不会切换到 Browser 本地订单/u);
});

test("detail uses exact Server source fields and presents source quantity as read-only", () => {
  for (const token of [
    "detail.billNo",
    "detail.insideOrderNo",
    "detail.styleNo",
    "detail.companyName",
    "detail.customerName",
    "detail.brandName",
    "detail.quantity",
    "detail.contractDate",
    "detail.contractDeliveryDate",
    "detail.sourceLifecycleStatus",
    "detail.colorCount",
    "订单数量（来源只读）",
    "来源权威 · 不可编辑",
  ]) assert.match(detailSource, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
  assert.match(modelSource, /insideOrderNo:\s*dto\.insideOrderNo/u);
  assert.match(modelSource, /quantity:\s*dto\.quantity/u);
  assert.doesNotMatch(detailSource, /factoryStyleNo|initialQuantity/u);
});

test("color detail displays only source color and quantity and accepts an empty slice", () => {
  assert.match(detailSource, /color\.sourceLineIdentity/u);
  assert.match(detailSource, /color\.colorName/u);
  assert.match(detailSource, /color\.quantity/u);
  assert.doesNotMatch(detailSource, /color\.deliveryDate/u);
  assert.match(detailSource, /当前订单主档有效；颜色明细暂无有效数据。/u);
  assert.match(detailSource, /颜色 enrichment 为空不影响 SalesOrder master 有效性/u);
  assert.match(modelSource, /deliveryDate:\s*string \| null/u);
});

test("formal detail exposes independent Server adoption while blocked Browser fields stay absent", () => {
  for (const blocked of [
    "customerPoNo",
    "customerId",
    "brandId",
    "salespersonId",
    "salespersonNameSnapshot",
    "merchandiser",
    "orderDate",
    "productionCountry",
    "deliveryPlans",
    "businessConfirmedDeliveryDate",
    "quantityChanges",
    "colorAdjustments",
    "priceVersions",
    "attachment",
    "executionSnapshots",
    "inspectionDate",
    "customerRequirement",
    "processDescription",
  ]) assert.doesNotMatch(detailSource, new RegExp(blocked, "iu"));
  assert.match(detailSource, /OrderBusinessSourceButton/u);
  assert.doesNotMatch(detailSource, /confirmedCommercialTermsServerClient\.updateBySalesOrder/u);
  assert.doesNotMatch(detailSource, /orderRepository|OrderPriceVersion|salePrice|processingUnitPrice/u);
  assert.doesNotMatch(detailSource, /\.(?:saveAll|deleteSalesOrder|removeSalesOrder|updateSalesOrder|createSalesOrder|cancelSalesOrder)\s*\(/u);
  assert.doesNotMatch(detailSource, /<Button[^>]*>\s*(?:删除|取消订单|创建订单|编辑订单|保存订单)\s*<\/Button>/u);
});

test("Server detail route skips Browser local-data initialization without changing legacy routes", () => {
  assert.match(localBootstrapSource, /pathname !== "\/order-center\/server-detail"/u);
  assert.doesNotMatch(localBootstrapSource, /pathname !== "\/order-center\/detail"/u);
  assert.doesNotMatch(localBootstrapSource, /pathname !== "\/order-center\/new"/u);
  assert.doesNotMatch(`${detailSource}\n${routeSource}\n${serverRepositorySource}`, /orderRepository|order-repository/u);
  assert.match(browserRepositorySource, /export const orderRepository/u);
  assert.doesNotMatch(clientSource, /method:\s*"(?:POST|PUT|PATCH|DELETE)"/u);
});
