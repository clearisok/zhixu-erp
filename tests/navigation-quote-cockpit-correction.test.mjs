import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("AppShell topbar back uses an explicit parent target and the guarded navigation callback", async () => {
  const [shell, legacyBack] = await Promise.all([
    read("components/foundation/app-shell.tsx"),
    read("components/foundation/page-back-button.tsx"),
  ]);
  assert.match(shell, /backTarget\?: AppShellBackTarget/);
  assert.match(shell, /className="ops-topbar-back"[\s\S]*?navigateRequest\(backTarget\.href\)/);
  assert.doesNotMatch(shell, /history\.back|router\.back/);
  assert.doesNotMatch(legacyBack, /history\.length|router\.back/);
});

test("formal detail workspaces declare topbar parents and remove content-level back controls", async () => {
  const [quote, order, closing, progress, tower] = await Promise.all([
    read("features/quote-center/components/quote-editor.tsx"),
    read("features/order-center/components/order-pages.tsx"),
    read("features/closing-center/components/closing-center-page.tsx"),
    read("features/style-progress/components/style-progress-pages.tsx"),
    read("features/style-progress/components/material-control-tower.tsx"),
  ]);
  assert.match(quote, /backTarget=\{\{ href: "\/quote-center", label: "返回报价中心" \}\} onRequestNavigation=\{requestNavigation\}/);
  assert.match(order, /backTarget=\{\{ href: "\/order-center", label: "返回订单中心" \}\} onRequestNavigation=\{requestNavigation\}/);
  assert.match(closing, /backTarget=\{\{ href: "\/closing-center", label: "返回关账中心" \}\}/);
  assert.match(progress, /backTarget=\{backTarget\}/);
  for (const source of [quote, order, closing, tower]) assert.doesNotMatch(source, /← 返回/);
});

test("More trigger is lightweight, single-line and keeps the formal portal menu", async () => {
  const [menu, css, quoteCss] = await Promise.all([
    read("components/foundation/floating-menu.tsx"),
    read("app/foundation.css"),
    read("app/quote-center/responsive.css"),
  ]);
  assert.match(menu, /trigger = "··· 更多"/);
  assert.match(menu, /createPortal/);
  assert.match(css, /\.qc-floating-menu-trigger[^}]*white-space:\s*nowrap/);
  assert.match(quoteCss, /qc-quote-action-more[^}]*border-color:\s*transparent[^}]*background:\s*transparent/);
  assert.doesNotMatch(quoteCss, /qc-quote-action-more \.qc-floating-menu-trigger::after/);
});

test("Quote Cockpit owns one final garment price and one compact context strip", async () => {
  const [editor, cockpit, css] = await Promise.all([
    read("features/quote-center/components/quote-editor.tsx"),
    read("features/quote-center/components/quote-metrics.tsx"),
    read("app/quote-center/responsive.css"),
  ]);
  assert.match(editor, /<QuoteCockpit version=\{activeVersion\}/);
  assert.doesNotMatch(editor, /qc-price-version-context|<QuoteMetrics/);
  assert.equal((cockpit.match(/\{garment\.value\}/g) ?? []).length, 1);
  for (const contract of ["revisionLabel", "priceVersionLabel", "productionLabel", "confirmationLabel", "differenceCount", "settingsAction"]) assert.match(cockpit, new RegExp(contract));
  assert.match(css, /\.qc-quote-cockpit[^}]*grid-template-columns:[^}]*minmax\(168px,1\.25fr\)[^}]*overflow:\s*hidden/);
  assert.match(css, /@container qc-quote-header \(max-width: 720px\)/);
});
