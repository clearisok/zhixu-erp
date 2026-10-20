import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("local build identifies mode and retains a fail-closed session-mode default", async () => {
  const vite = await read("vite.config.ts");
  const dockerfile = await read("Dockerfile.server");
  const config = await read("server/config.ts");
  assert.match(vite, /identityMode: buildIdentityMode\(\)/u);
  assert.match(dockerfile, /ARG ZHIXU_IDENTITY_MODE=session/u);
  assert.match(config, /ZHIXU_LOCAL_SINGLE_USER_ACK/u);
  assert.match(config, /loopback Browser origins/u);
});

test("current local UI removes login and Browser test-user management surfaces", async () => {
  const loginCard = await read("features/server-auth/components/server-login-card.tsx");
  const logoutAction = await read("features/server-auth/components/server-logout-action.tsx");
  const shell = await read("components/foundation/app-shell.tsx");
  const permissions = await read("features/permissions/components/permission-provider.tsx");
  const userPage = await read("app/basic-settings/user-permissions/page.tsx");
  assert.match(loginCard, /browserIdentityMode\(\) === "local-single-user"/u);
  assert.match(logoutAction, /browserIdentityMode\(\) === "local-single-user"\) return null/u);
  assert.match(shell, /serverIdentityMode \|\| localSingleUser \? <ServerUserMenu/u);
  assert.match(shell, /canLogout=\{!localSingleUser && serverSession.status === "authenticated"\}/u);
  assert.match(await read("components/foundation/server-user-menu.tsx"), /if \(!canLogout\) return <div/u);
  assert.match(shell, /route.href !== "\/basic-settings\/user-permissions"/u);
  assert.match(permissions, /Browser user management is disabled in local single-user mode/u);
  assert.match(userPage, /当前开发阶段不提供账号或权限管理/u);
});

test("local root enters Quote Center before the legacy ERP login or bootstrap runs", async () => {
  const root = await read("app/page.tsx");
  const landing = root.slice(root.indexOf("function LocalSingleUserLanding()"), root.indexOf("function LegacyHome()"));
  assert.match(landing, /router\.replace\("\/quote-center"\)/u);
  assert.match(landing, /browserIdentityMode\(\) === "local-single-user" \? <LocalSingleUserLanding \/> : <LegacyHome \/>/u);
  assert.doesNotMatch(landing, /登录工厂工作台|安全登录|\/api\/login|\/api\/bootstrap|type="password"/u);
  assert.match(root, /function LegacyHome\(\)/u);
  assert.match(root, /request\("\/api\/login"/u);
});

test("local Server production pages retain unified navigation and hide user management", async () => {
  const shell = await read("components/foundation/app-shell.tsx");
  assert.match(shell, /const serverSettingsMode = !freshServer && identityMode === "server" && \(pathname\.startsWith\("\/basic-settings\/server\/"\) \|\| pathname === "\/system-settings\/server\/quote-settings" \|\| pathname === "\/system-settings\/progress-settings"\)/u);
  assert.match(shell, /const showSettingsNavigation = freshServer \|\| localSingleUser \|\| !serverIdentityMode \|\| serverSettingsMode/u);
  assert.equal((shell.match(/\{showSettingsNavigation &&/gu) ?? []).length, 3);
  for (const label of ["经营工作台", "报价中心", "基础设置", "订单中心", "生产排单", "关账中心", "系统设置"]) {
    assert.match(shell, new RegExp(label, "u"));
  }
  for (const path of ["brands", "customer-salespeople", "fabrics", "trims", "production-groups", "outsource-factories"]) {
    assert.match(shell, new RegExp(`/basic-settings/${path}`, "u"));
  }
  assert.match(shell, /route\.href !== "\/basic-settings\/user-permissions"/u);
  assert.match(shell, /serverIdentityMode \|\| localSingleUser \? <ServerUserMenu/u);
});

test("formal Q3 pages stay on Server adapters while Quote aggregates stay in Browser storage", async () => {
  const boundary = await read("features/basic-settings/components/production-master-settings-page.tsx");
  const server = await read("features/basic-settings/components/server-basic-settings-candidate-page.tsx");
  const basicPages = await read("features/basic-settings/components/basic-settings-pages.tsx");
  const quoteSettings = await read("features/quote-center/components/global-quote-settings-page.tsx");
  const editor = await read("features/quote-center/components/quote-editor.tsx");
  assert.match(boundary, /authority === "server"\) return <ServerBasicSettingsCandidatePage scope=\{scope\} production/u);
  assert.match(boundary, /authority === "server"\) return <ServerGlobalQuoteSettingsCandidatePage production/u);
  assert.match(server, /createServerBasicSettingsAdapter/u);
  assert.match(server, /const next = await adapter\.load\(\)/u);
  assert.match(server, /await adapter\.persist\(state, next\)/u);
  assert.match(basicPages, /production \? "基础资料来源：PostgreSQL" : "Server candidate/u);
  assert.match(quoteSettings, /serverProduction \? "报价默认值来源：PostgreSQL" : "Server candidate/u);
  assert.match(editor, /mockQuoteRepository\.createDraft\(today, settings\)/u);
  assert.match(editor, /serverMasters\.persist\(scope, masterData, next\)/u);
});
