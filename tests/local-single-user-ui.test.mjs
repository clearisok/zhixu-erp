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
  assert.match(shell, /serverIdentityMode \|\| localSingleUser \? <div className="qc-server-identity"/u);
  assert.match(shell, /route.href !== "\/basic-settings\/user-permissions"/u);
  assert.match(permissions, /Browser user management is disabled in local single-user mode/u);
  assert.match(userPage, /当前开发阶段不提供账号或权限管理/u);
});
