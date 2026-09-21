import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const [
  routeSource,
  newPageSource,
  previewSource,
  clientSource,
  bootstrapSource,
  productionNewRoute,
] = await Promise.all([
  read("../app/quote-center/server-new/page.tsx"),
  read("../features/quote-center/components/server-quote-new-page.tsx"),
  read("../features/quote-center/components/server-quote-preview-page.tsx"),
  read("../features/quote-center/server/quote-server-client.ts"),
  read("../features/data-management/components/local-data-bootstrap.tsx"),
  read("../app/quote-center/new/page.tsx"),
]);

test("Q2B2B mounts one isolated Server-owned lazy-create route", () => {
  assert.match(routeSource, /<ServerQuoteNewPage\s*\/>/u);
  assert.match(newPageSource, /Q2B2B · SERVER NEW QUOTE TEST WORKSPACE/u);
  assert.match(newPageSource, /Source = PostgreSQL/u);
  assert.match(newPageSource, /Identity = Server/u);
  assert.match(newPageSource, /Number = Server generated/u);
  assert.match(newPageSource, /Production cutover = NOT ACTIVE/u);
  assert.match(newPageSource, /编号将在创建时由 Server 自动生成/u);
});

test("create authority is the trusted Server session and caller sends an empty object", () => {
  assert.match(newPageSource, /PermissionAuthorityProvider can=\{serverSession\.hasPermission\}/u);
  assert.match(newPageSource, /hasPermission\("quote\.create"\)/u);
  assert.match(newPageSource, /permission="quote\.create"/u);
  assert.doesNotMatch(newPageSource, /usePermissions|currentUser|currentRole/u);
  assert.match(clientSource, /mutation\("POST", "\/api\/v1\/quotes", \{\}\)/u);
  assert.doesNotMatch(clientSource, /create\(quote/u);
});

test("opening the page performs no create and explicit pending-safe action performs one call", () => {
  assert.doesNotMatch(newPageSource, /useEffect/u);
  assert.equal((newPageSource.match(/quoteServerRepository\.create\(\)/gu) ?? []).length, 1);
  assert.match(newPageSource, /if \(creating \|\| serverSession\.status !== "authenticated"/u);
  assert.match(newPageSource, /disabled=\{creating \|\| creationUncertain\}/u);
  assert.match(newPageSource, /没有 Browser fallback，也不会自动重试/u);
  assert.match(newPageSource, /setCreationUncertain\(true\)/u);
});

test("successful create redirects by returned Server UUID and failures remain Server-only", () => {
  assert.match(newPageSource, /server-edit\?id=\$\{encodeURIComponent\(created\.quote\.id\)\}/u);
  assert.match(newPageSource, /nextError instanceof QuoteServerError && nextError\.status === 401/u);
  assert.match(newPageSource, /serverSession\.invalidate\(\)/u);
  assert.match(newPageSource, /nextError\.status === 403/u);
  assert.match(newPageSource, /Server 权限不足（403）/u);
  assert.doesNotMatch(newPageSource, /mockQuoteRepository|basicSettingsRepository|loadBasicSettings|loadGlobalQuoteSettings|operationLogRepository|indexedDbAttachmentRepository|orderRepository|localStorage|sessionStorage|indexedDB/u);
});

test("Server number is not editable and neutral draft ownership boundaries are visible", () => {
  assert.doesNotMatch(newPageSource, /<input|<Input|quoteCode\s*=|sequence suffix/u);
  assert.match(newPageSource, /不读取 Browser masters\/settings/u);
  assert.match(newPageSource, /附件、ConfirmedCommercialTerms、SalesOrder：不会创建/u);
});

test("preview link is quote.create-gated, local bootstrap skips exactly server-new, and production new stays Browser-owned", () => {
  assert.match(previewSource, /hasPermission\("quote\.create"\).*href="\/quote-center\/server-new"/su);
  assert.match(previewSource, /只导航到 lazy-create 准备页，不会在此处创建 Quote/u);
  assert.match(bootstrapSource, /pathname !== "\/quote-center\/server-new"/u);
  assert.doesNotMatch(bootstrapSource, /startsWith\("\/quote-center"\)/u);
  assert.match(productionNewRoute, /<QuoteNewLoader\s*\/>/u);
});
