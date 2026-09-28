import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("all four formal Basic Settings routes and Quote Settings route select one authority boundary", async () => {
  const paths = ["brands", "customer-salespeople", "fabrics", "trims"];
  for (const path of paths) assert.match(await read(`../app/basic-settings/${path}/page.tsx`), /ProductionBasicSettingsPage/u);
  assert.match(await read("../app/system-settings/quote-settings/page.tsx"), /ProductionGlobalQuoteSettingsPage/u);
  const boundary = await read("../features/basic-settings/components/production-master-settings-page.tsx");
  assert.match(boundary, /authority === "server"/u);
  assert.match(boundary, /authority === "frozen"/u);
  assert.match(boundary, /PermissionAuthorityProvider/u);
  assert.match(boundary, /ServerBasicSettingsCandidatePage/u);
  assert.match(boundary, /ServerGlobalQuoteSettingsCandidatePage/u);
});

test("Quote Editor master writes and new-Quote defaults cannot silently fall back to Browser", async () => {
  const editor = await read("../features/quote-center/components/quote-editor.tsx");
  const quick = await read("../features/basic-settings/components/quick-master-data-create.tsx");
  const pricing = await read("../features/quote-center/components/quote-pricing-settings.tsx");
  const basic = await read("../features/basic-settings/repository/basic-settings-repository.ts");
  const global = await read("../features/quote-center/model/quote-settings.ts");
  assert.match(editor, /serverMasters\.persist\(scope, masterData, next\)/u);
  assert.match(editor, /serverMasters\.resolveDefaults\(brandId, salespersonId\)/u);
  assert.match(editor, /mockQuoteRepository\.createDraft\(today, settings\)/u);
  assert.match(editor, /settings=\{masterSettings \?\? undefined\}/u);
  assert.match(quick, /dispatchMasterMutation\(authority/u);
  assert.match(quick, /await persist\("trims"/u);
  assert.match(pricing, /settings \?\? loadGlobalQuoteSettings\(\)/u);
  assert.match(basic, /assertBrowserMasterWrite\(\)/u);
  assert.match(global, /assertBrowserMasterWrite\(\)/u);
});

test("frozen/server Q3 paths cannot bypass Browser persistence or Browser audit", async () => {
  const quick = await read("../features/basic-settings/components/quick-master-data-create.tsx");
  const editor = await read("../features/quote-center/components/quote-editor.tsx");
  const basicPages = await read("../features/basic-settings/components/basic-settings-pages.tsx");
  const globalPage = await read("../features/quote-center/components/global-quote-settings-page.tsx");
  const boundary = await read("../features/basic-settings/authority/master-settings-authority.ts");
  assert.match(quick,/dispatchMasterMutation\(authority/u);
  assert.match(boundary,/if \(authority === "frozen"\) throw/u);
  assert.match(boundary,/if \(authority === "server"\)/u);
  assert.match(editor,/if \(q3Authority === "frozen"\) throw/u);
  assert.match(editor,/serverMasters\.persist\(scope, masterData, next\)/u);
  assert.match(basicPages,/if \(scoped\) return scoped\.persist\(next\)/u);
  assert.match(globalPage,/serverController \? await serverController\.save\(settings\) : saveGlobalQuoteSettings\(settings\)/u);
  assert.match(quick,/operationLogRepository\.appendMany\(logs\)/u);
  assert.match(basicPages,/operationLogRepository\.appendMany\(logs\)/u);
  assert.match(globalPage,/if \(before\) \{/u);
});
