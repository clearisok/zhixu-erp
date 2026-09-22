import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read=(path)=>readFile(new URL(path,import.meta.url),"utf8");
const [candidate,ui,globalUi,globalModel,preview,backupPreview,backupRunner,packageJson,basicAdapter,globalAdapter,client,bootstrap,appShell,...routes]=await Promise.all([
  read("../features/basic-settings/components/server-basic-settings-candidate-page.tsx"),
  read("../features/basic-settings/components/basic-settings-pages.tsx"),
  read("../features/quote-center/components/global-quote-settings-page.tsx"),
  read("../features/quote-center/model/quote-settings.ts"),
  read("../features/basic-settings/server/master-settings-migration-preview.ts"),
  read("../features/basic-settings/server/master-settings-backup-preview.ts"),
  read("../scripts/preview-quote-master-settings-backup.ts"),
  read("../package.json"),
  read("../features/basic-settings/server/server-basic-settings-adapter.ts"),
  read("../features/basic-settings/server/server-global-quote-settings-adapter.ts"),
  read("../features/basic-settings/server/quote-master-server-client.ts"),
  read("../features/data-management/components/local-data-bootstrap.tsx"),
  read("../components/foundation/app-shell.tsx"),
  ...[
    "../app/basic-settings/server/brands/page.tsx","../app/basic-settings/server/customer-salespeople/page.tsx","../app/basic-settings/server/fabrics/page.tsx","../app/basic-settings/server/trims/page.tsx","../app/system-settings/server/quote-settings/page.tsx",
    "../app/basic-settings/brands/page.tsx","../app/basic-settings/customer-salespeople/page.tsx","../app/basic-settings/fabrics/page.tsx","../app/basic-settings/trims/page.tsx","../app/system-settings/quote-settings/page.tsx",
  ].map(read),
]);

test("five isolated Server routes reuse the accepted production UI components",()=>{
  for(const name of ["BrandSettingsPage","CustomerSalespeopleSettingsPage","FabricLibraryPage","TrimLibraryPage"])assert.match(candidate,new RegExp(`<${name} serverCandidate`));
  assert.match(candidate,/<GlobalQuoteSettingsPage serverController=/u);
  for(const [index,name] of ["ServerBasicSettingsCandidatePage","ServerBasicSettingsCandidatePage","ServerBasicSettingsCandidatePage","ServerBasicSettingsCandidatePage","ServerGlobalQuoteSettingsCandidatePage"].entries())assert.match(routes[index],new RegExp(name));
  assert.match(ui,/useScopedBasicSettingsController/u);assert.match(globalUi,/serverController/u);
});

test("production settings routes remain Browser/local and do not opt into Server controller",()=>{
  for(const [index,name] of ["BrandSettingsPage","CustomerSalespeopleSettingsPage","FabricLibraryPage","TrimLibraryPage","GlobalQuoteSettingsPage"].entries()){
    assert.match(routes[index+5],new RegExp(`<${name}`));assert.doesNotMatch(routes[index+5],/serverCandidate|serverController/u);
  }
  assert.match(ui,/loadBasicSettings/u);assert.match(ui,/saveBasicSettings/u);assert.match(globalUi,/loadGlobalQuoteSettings/u);assert.match(globalUi,/saveGlobalQuoteSettings/u);
});

test("candidate authority is trusted Server-only and fail closed",()=>{
  assert.match(candidate,/PermissionAuthorityProvider can=\{session\.hasPermission\}/u);
  assert.match(candidate,/identityMode="server"/u);assert.match(candidate,/session\.invalidate\(\)/u);assert.match(candidate,/session\.logout\(\)/u);
  assert.match(candidate,/未回退到 Browser/u);assert.doesNotMatch(candidate,/saveBasicSettings|operationLogRepository|createBasicSettingsOperationLogs|localStorage|indexedDB/u);
  assert.doesNotMatch(basicAdapter,/saveBasicSettings|operationLogRepository|localStorage|indexedDB/u);
  assert.doesNotMatch(globalAdapter,/saveGlobalQuoteSettings|operationLogRepository|localStorage|indexedDB/u);
});

test("Server adapter uses optimistic versions, Server IDs, exact decimals and no legacy quantity",()=>{
  assert.match(basicAdapter,/expectedVersion|versions\./u);assert.match(globalAdapter,/expectedVersion/u);
  assert.match(basicAdapter,/browserNumberFromExactDecimal/u);assert.match(basicAdapter,/canonicalDecimal/u);assert.match(globalAdapter,/browserNumberFromExactDecimal/u);
  assert.doesNotMatch(basicAdapter,/createMasterDataId/u);
  const outboundDefaults=basicAdapter.slice(basicAdapter.indexOf("function defaultsToServer"),basicAdapter.indexOf("const brandFromServer"));
  assert.doesNotMatch(outboundDefaults,/quantity/u);
  assert.match(client,/credentials: "include"/u);assert.match(client,/X-Zhixu-Request/u);
  assert.match(globalAdapter,/saveSettingsBundle/u);
});

test("candidate hides hard delete, uses supplier endpoint and bounded Server navigation",()=>{
  assert.match(ui,/!serverCandidate&&<PermissionButton[^>]+variant="danger"/u);
  assert.match(globalUi,/selectedPreset\.status==="inactive"\?"启用预设":"停用预设"/u);
  assert.match(globalUi,/activeManufacturingPresets\(settings\)\.map/u);
  assert.match(globalUi,/setManufacturingPresetStatus\(current, id, status\)/u);
  assert.match(globalModel,/preset\.id === requestedPresetId && preset\.status !== "inactive"/u);
  assert.match(globalModel,/status === "inactive" && settings\.defaultManufacturingPresetId === presetId/u);
  assert.match(preview,/Default manufacturing preset references an inactive preset and will be cleared/u);
  assert.match(basicAdapter,/client\.supplierSuggestions\(\)/u);
  assert.match(appShell,/serverBasicRoutes/u);assert.match(appShell,/serverSystemRoutes/u);assert.match(appShell,/serverSettingsMode/u);
});

test("Q3B2A backup preview reuses the standard backup envelope and stays storage/database read-only",()=>{
  assert.match(backupPreview,/LocalDataBackup|LOCAL_DATA_BACKUP_VERSION/u);
  assert.match(backupPreview,/localDataKeys\(namespace\)/u);
  assert.match(backupPreview,/excludedRecordPolicy/u);
  assert.match(backupPreview,/databaseReads: 0/u);assert.match(backupPreview,/databaseWrites: 0/u);assert.match(backupPreview,/browserWrites: 0/u);
  assert.match(backupPreview,/previewMasterSettingsMigration\(source\)/u);
  assert.doesNotMatch(backupPreview,/localStorage|indexedDB|fetch\(|Pool|db\.query|saveBasicSettings|saveGlobalQuoteSettings/u);
  assert.match(backupRunner,/readFile/u);assert.doesNotMatch(backupRunner,/writeFile|localStorage|fetch\(|db:migrate/u);
  assert.match(packageJson,/preview:quote-master-settings/u);
});

test("Browser local-data bootstrap skips only the five candidate settings routes",()=>{
  for(const path of ["/basic-settings/server/brands","/basic-settings/server/customer-salespeople","/basic-settings/server/fabrics","/basic-settings/server/trims","/system-settings/server/quote-settings"])assert.match(bootstrap,new RegExp(`pathname !== "${path}"`));
  assert.doesNotMatch(bootstrap,/pathname !== "\/basic-settings\/brands"/u);
  assert.doesNotMatch(bootstrap,/startsWith\("\/basic-settings"\)/u);
});
