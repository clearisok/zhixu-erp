import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const [
  routeSource,
  writerSource,
  adapterSource,
  authoritySource,
  buttonSource,
  guardSource,
  bootstrapSource,
  detailSource,
  browserListRoute,
  browserDetailRoute,
  browserNewRoute,
  browserListSource,
  browserEditorSource,
] = await Promise.all([
  read("../app/quote-center/server-edit/page.tsx"),
  read("../features/quote-center/components/server-quote-writer-page.tsx"),
  read("../features/quote-center/server/quote-server-editor-adapter.ts"),
  read("../features/permissions/components/permission-authority.tsx"),
  read("../components/foundation/button.tsx"),
  read("../features/permissions/components/permission-guard.tsx"),
  read("../features/data-management/components/local-data-bootstrap.tsx"),
  read("../features/quote-center/components/server-quote-detail-page.tsx"),
  read("../app/quote-center/page.tsx"),
  read("../app/quote-center/detail/page.tsx"),
  read("../app/quote-center/new/page.tsx"),
  read("../features/quote-center/components/quote-list.tsx"),
  read("../features/quote-center/components/quote-editor.tsx"),
]);

test("Q2B2A mounts one isolated existing-Quote Server writer route", () => {
  assert.match(routeSource, /<ServerQuoteWriterPage\s*\/>/u);
  assert.match(writerSource, /Q2B2A · SERVER WRITER TEST WORKSPACE/u);
  assert.match(writerSource, /quoteServerEditorAdapter\.load/u);
  assert.match(writerSource, /quoteServerEditorAdapter\.save/u);
  assert.match(detailSource, /\/quote-center\/server-edit\?id=/u);
  assert.doesNotMatch(writerSource, /createDraft|quoteServerRepository\.create|quoteServerClient\.create/u);
});

test("writer permission scope uses trusted Server authority, never Browser permission decisions", () => {
  assert.match(writerSource, /PermissionAuthorityProvider can=\{serverSession\.hasPermission\}/u);
  assert.match(writerSource, /hasPermission\("quote\.view"\)/u);
  assert.match(writerSource, /hasPermission\("quote\.edit"\)/u);
  assert.match(writerSource, /hasPermission\("quote\.cost\.edit"\)/u);
  assert.match(writerSource, /hasPermission\("quote\.settings\.edit"\)/u);
  assert.match(writerSource, /serverSession\.logout\(\)/u);
  assert.doesNotMatch(writerSource, /usePermissions|currentUser|currentRole|Browser PermissionProvider/u);
  assert.match(authoritySource, /scoped \?\? browserCan/u);
  assert.match(buttonSource, /usePermissionAuthority/u);
  assert.match(guardSource, /usePermissionAuthority/u);
});

test("writer has no Browser repository, audit, attachment, master, or Order side effects", () => {
  assert.doesNotMatch(writerSource, /mockQuoteRepository|operationLogRepository|indexedDbAttachmentRepository|basicSettingsRepository|saveBasicSettings|orderRepository|QuoteToOrderModal/u);
  assert.doesNotMatch(adapterSource, /localStorage|sessionStorage|indexedDB|operationLogRepository|orderRepository/u);
  assert.match(writerSource, /Attachments = Server candidate/u);
  assert.match(writerSource, /QuoteAttachmentPanel/u);
  assert.match(writerSource, /删除、导出、生成订单、新建 Quote：不可用/u);
  assert.match(writerSource, /客户确认 mutation：不可用/u);
});

test("writer uses lossless decimal projection and fails unsafe values closed", () => {
  assert.match(adapterSource, /quoteSnapshotFromBrowser/u);
  assert.match(adapterSource, /canonicalDecimal\(String\(browserNumber\)\) !== canonicalSource/u);
  assert.match(adapterSource, /UnsafeServerQuoteDecimalError/u);
  assert.match(writerSource, /此 Quote 不能安全进入 Browser 数字编辑模型/u);
  assert.match(writerSource, /保存已禁用/u);
  assert.doesNotMatch(adapterSource, /epsilon|toFixed|Math\.round/u);
});

test("optimistic conflict preserves dirty state and requires explicit reload", () => {
  assert.match(writerSource, /nextError\.code === "quote_version_conflict"/u);
  assert.match(writerSource, /未覆盖、未自动重试/u);
  assert.match(writerSource, /重新读取 Server 当前版本/u);
  assert.match(writerSource, /确认放弃并重新读取/u);
  assert.match(writerSource, /expectedVersion/u);
  assert.doesNotMatch(writerSource, /expectedVersion\s*\+\s*1/u);
});

test("dirty navigation is guarded and Server save is the only save-and-leave path", () => {
  assert.match(writerSource, /beforeunload/u);
  assert.match(writerSource, /有未保存的 Server Quote 修改/u);
  assert.match(writerSource, /保存并离开/u);
  assert.match(writerSource, /void save\(pendingNavigation\)/u);
  assert.match(writerSource, /未写入 localStorage/u);
});

test("Server edit route skips Browser bootstrap exactly", () => {
  assert.match(bootstrapSource, /pathname !== "\/quote-center\/server-edit"/u);
  assert.doesNotMatch(bootstrapSource, /startsWith\("\/quote-center"\)/u);
});

test("production Quote routes remain Browser/local", () => {
  assert.match(browserListRoute, /<QuoteList\s*\/>/u);
  assert.match(browserDetailRoute, /<QuoteDetailLoader\s*\/>/u);
  assert.match(browserNewRoute, /<QuoteNewLoader\s*\/>/u);
  assert.match(browserListSource, /mockQuoteRepository\.list/u);
  assert.match(browserEditorSource, /mockQuoteRepository\.getById/u);
  assert.match(browserEditorSource, /mockQuoteRepository\.createDraft/u);
});
