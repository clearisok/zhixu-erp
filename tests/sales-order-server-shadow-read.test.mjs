import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const clientSource = await readFile(new URL("../features/order-center/server/sales-order-server-client.ts", import.meta.url), "utf8");
const repositorySource = await readFile(new URL("../features/order-center/server/server-sales-order-read-repository.ts", import.meta.url), "utf8");
const modelSource = await readFile(new URL("../features/order-center/server/sales-order-server-model.ts", import.meta.url), "utf8");
const previewSource = await readFile(new URL("../features/order-center/components/server-sales-order-preview-page.tsx", import.meta.url), "utf8");
const routeSource = await readFile(new URL("../app/order-center/server-preview/page.tsx", import.meta.url), "utf8");
const browserRepositorySource = await readFile(new URL("../features/order-center/repository/order-repository.ts", import.meta.url), "utf8");

test("shadow client and repository expose only list/detail reads", () => {
  assert.match(clientSource, /list\(query\?/u);
  assert.match(clientSource, /getById\(id:/u);
  assert.match(clientSource, /credentials:\s*"include"/u);
  assert.doesNotMatch(clientSource, /method:\s*"(?:POST|PUT|PATCH|DELETE)"/u);
  assert.doesNotMatch(repositorySource, /\b(?:save|saveAll|delete|remove|update)\s*\(/u);
  assert.doesNotMatch(repositorySource, /order-repository|orderRepository/u);
});

test("server adapter keeps an honest dedicated view model", () => {
  assert.match(modelSource, /OrderCenterServerListViewModel/u);
  assert.match(modelSource, /factoryStyleNo:\s*dto\.insideOrderNo/u);
  assert.match(modelSource, /initialQuantity:\s*dto\.quantity/u);
  assert.match(modelSource, /billNo:\s*dto\.salesContractNo/u);
  assert.doesNotMatch(modelSource, /\bas SalesOrder\b|customerPoNo|priceVersions|deliveryPlans/u);
});

test("DEV shadow route is read-only and leaves Browser OrderRepository unchanged", () => {
  assert.match(routeSource, /process\.env\.NODE_ENV\s*!==\s*"development"/u);
  assert.match(previewSource, /PostgreSQL 只读预览/u);
  assert.match(previewSource, /source = PostgreSQL/u);
  assert.match(previewSource, /serverSalesOrderReadRepository\.list/u);
  assert.match(previewSource, /serverSalesOrderReadRepository\.getById/u);
  assert.doesNotMatch(previewSource, /orderRepository|\.save\(|\.delete\(|\.saveAll\(/u);
  assert.match(browserRepositorySource, /export const orderRepository = createOrderRepository\(\)/u);
});
