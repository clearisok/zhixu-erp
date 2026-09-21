import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const [
  previewSource,
  detailSource,
  previewRoute,
  detailRoute,
  localBootstrap,
  appShell,
  browserListRoute,
  browserDetailRoute,
  browserNewRoute,
  browserList,
  browserEditor,
] = await Promise.all([
  read("../features/quote-center/components/server-quote-preview-page.tsx"),
  read("../features/quote-center/components/server-quote-detail-page.tsx"),
  read("../app/quote-center/server-preview/page.tsx"),
  read("../app/quote-center/server-detail/page.tsx"),
  read("../features/data-management/components/local-data-bootstrap.tsx"),
  read("../components/foundation/app-shell.tsx"),
  read("../app/quote-center/page.tsx"),
  read("../app/quote-center/detail/page.tsx"),
  read("../app/quote-center/new/page.tsx"),
  read("../features/quote-center/components/quote-list.tsx"),
  read("../features/quote-center/components/quote-editor.tsx"),
]);

test("Q2B1 routes mount dedicated Server Quote read-only components", () => {
  assert.match(previewRoute, /<ServerQuotePreviewPage\s*\/>/u);
  assert.match(detailRoute, /<ServerQuoteDetailPage\s*\/>/u);
  assert.match(previewSource, /quoteServerRepository\.list/u);
  assert.match(detailSource, /quoteServerRepository\.getById/u);
  assert.doesNotMatch(`${previewSource}\n${detailSource}`, /mockQuoteRepository|indexedDbAttachmentRepository/u);
});

test("shadow routes skip Browser local-data bootstrap exactly", () => {
  assert.match(localBootstrap, /pathname !== "\/quote-center\/server-preview"/u);
  assert.match(localBootstrap, /pathname !== "\/quote-center\/server-detail"/u);
  assert.doesNotMatch(localBootstrap, /startsWith\("\/quote-center"\)/u);
});

test("trusted Server session and quote.view gate list and detail states", () => {
  for (const source of [previewSource, detailSource]) {
    assert.match(source, /useServerSession/u);
    assert.match(source, /hasPermission\("quote\.view"\)/u);
    assert.match(source, /status === "checking"/u);
    assert.match(source, /status === "anonymous"/u);
    assert.match(source, /ServerLoginCard/u);
    assert.match(source, /failure === "unauthorized"/u);
    assert.match(source, /serverSession\.invalidate\(\)/u);
    assert.match(source, /failure === "forbidden"/u);
    assert.match(source, /Server 权限不足（403）/u);
    assert.match(source, /未回退到 Browser 报价/u);
    assert.match(source, /identityMode="server"/u);
  }
});

test("Server shell hides Browser identity and permission-backed legacy controls", () => {
  assert.match(appShell, /identityMode\?: "browser" \| "server"/u);
  assert.match(appShell, /serverSession\.user\?\.name/u);
  assert.match(appShell, /serverIdentityMode \? <div className="qc-server-identity"/u);
  assert.match(appShell, /!serverIdentityMode && <GlobalSearchPalette/u);
  assert.match(appShell, /!serverIdentityMode && <><section><strong>基础设置/u);
  assert.doesNotMatch(`${previewSource}\n${detailSource}`, /usePermissions|currentUser|currentRole|setCurrentUser/u);
});

test("Q2B1 UI initiates no Quote mutation and no Browser attachment lookup", () => {
  for (const source of [previewSource, detailSource]) {
    assert.doesNotMatch(source, /quoteServerRepository\.(?:create|save)\s*\(/u);
    assert.doesNotMatch(source, /quoteServerClient\.(?:create|save)\s*\(/u);
    assert.doesNotMatch(source, /indexedDB|indexedDbAttachmentRepository/u);
  }
  assert.match(detailSource, /没有 Quote POST、PUT 或 DELETE/u);
  assert.match(detailSource, /Server attachment binary 尚未迁移/u);
});

test("detail proves aggregate fidelity without lossy decimal conversion", () => {
  assert.match(detailSource, /displayServerDecimal/u);
  assert.doesNotMatch(detailSource, /parseFloat|parseInt|Number\s*\(|toFixed\s*\(/u);
  for (const field of [
    "quoteCode", "aggregateStatus", "revisionId", "revisionLabel", "quoteType", "brandName",
    "salespersonName", "quoteStyleNo", "styleName", "priceVersions", "manufacturingCountry",
    "manufacturingPresetName", "laborCurrency", "fabrics", "trims", "otherCosts",
    "estimateCostHistory", "confirmation", "confirmedGarmentPrice", "confirmedLaborPrice",
  ]) assert.match(detailSource, new RegExp(field, "u"));
  assert.match(detailSource, /历史只读/u);
  assert.match(detailSource, /C4\.2 ConfirmedCommercialTerms 是独立的当前共享业务事实/u);
});

test("existing production Quote routes remain Browser repository workflows", () => {
  assert.match(browserListRoute, /<QuoteList\s*\/>/u);
  assert.match(browserDetailRoute, /<QuoteDetailLoader\s*\/>/u);
  assert.match(browserNewRoute, /<QuoteNewLoader\s*\/>/u);
  assert.match(browserList, /mockQuoteRepository\.list/u);
  assert.match(browserEditor, /mockQuoteRepository\.getById/u);
  assert.match(browserEditor, /mockQuoteRepository\.createDraft/u);
});
