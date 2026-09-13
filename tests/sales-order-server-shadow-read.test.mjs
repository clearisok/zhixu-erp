import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const clientSource = await readFile(new URL("../features/order-center/server/sales-order-server-client.ts", import.meta.url), "utf8");
const repositorySource = await readFile(new URL("../features/order-center/server/server-sales-order-read-repository.ts", import.meta.url), "utf8");
const modelSource = await readFile(new URL("../features/order-center/server/sales-order-server-model.ts", import.meta.url), "utf8");
const previewSource = await readFile(new URL("../features/order-center/components/server-sales-order-preview-page.tsx", import.meta.url), "utf8");
const routeSource = await readFile(new URL("../app/order-center/server-preview/page.tsx", import.meta.url), "utf8");
const browserRepositorySource = await readFile(new URL("../features/order-center/repository/order-repository.ts", import.meta.url), "utf8");
const authClientSource = await readFile(new URL("../features/server-auth/server-auth-client.ts", import.meta.url), "utf8");
const sessionProviderSource = await readFile(new URL("../features/server-auth/components/server-session-provider.tsx", import.meta.url), "utf8");
const loginCardSource = await readFile(new URL("../features/server-auth/components/server-login-card.tsx", import.meta.url), "utf8");
const permissionProviderSource = await readFile(new URL("../features/permissions/components/permission-provider.tsx", import.meta.url), "utf8");
const layoutSource = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");

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
  assert.match(routeSource, /<ServerSalesOrderPreviewPage\s*\/>/u);
  assert.match(previewSource, /PostgreSQL 只读预览/u);
  assert.match(previewSource, /DEV SHADOW READ/u);
  assert.match(previewSource, /source = PostgreSQL/u);
  assert.match(previewSource, /serverSalesOrderReadRepository\.list/u);
  assert.match(previewSource, /serverSalesOrderReadRepository\.getById/u);
  assert.doesNotMatch(previewSource, /orderRepository|\.save\(|\.delete\(|\.saveAll\(/u);
  assert.match(browserRepositorySource, /export const orderRepository = createOrderRepository\(\)/u);
});

test("trusted ServerSession remains separate from Browser PermissionProvider", () => {
  assert.match(layoutSource, /<PermissionProvider><ServerSessionProvider>/u);
  assert.match(sessionProviderSource, /ServerSessionContext/u);
  assert.match(sessionProviderSource, /restoreServerSession/u);
  assert.match(permissionProviderSource, /permissionRepository\.load\(\)/u);
  assert.match(permissionProviderSource, /currentUser/u);
  assert.doesNotMatch(permissionProviderSource, /ServerSession|serverAuthClient/u);
});

test("auth client keeps the HttpOnly session opaque and uses same-origin credentialed requests", () => {
  assert.match(authClientSource, /baseUrl\s*=\s*\(options\.baseUrl\s*\?\?\s*""\)/u);
  assert.match(authClientSource, /credentials:\s*"include"/u);
  assert.match(authClientSource, /cache:\s*"no-store"/u);
  assert.match(authClientSource, /"X-Zhixu-Request":\s*"1"/u);
  assert.doesNotMatch(
    `${authClientSource}\n${sessionProviderSource}\n${loginCardSource}`,
    /localStorage|sessionStorage|indexedDB|document\.cookie|Cookie:/u,
  );
});

test("shadow preview has explicit checking, login-required, 403, expiry, and logout UX", () => {
  assert.match(previewSource, /serverSession\.status === "checking"/u);
  assert.match(previewSource, /serverSession\.status === "anonymous"/u);
  assert.match(previewSource, /请登录织序 Server 以读取 PostgreSQL 正式订单/u);
  assert.match(previewSource, /当前 Server 账号没有查看订单权限/u);
  assert.match(previewSource, /nextError\.status === 401/u);
  assert.match(previewSource, /serverSession\.invalidate\(\)/u);
  assert.match(previewSource, /nextError\.status === 403/u);
  assert.match(previewSource, /退出 Server 会话/u);
  assert.match(previewSource, /Server identity:/u);
  assert.match(loginCardSource, /type="password"/u);
  assert.match(loginCardSource, /autoComplete="current-password"/u);
  assert.match(loginCardSource, /setPassword\(""\)/u);
  assert.match(loginCardSource, /role="alert"/u);
  assert.match(loginCardSource, /disabled=\{submitting\}/u);
});
