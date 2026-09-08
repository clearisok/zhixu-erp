import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { createAinuokeBridgeClient } from "../features/ainuoke-api/client/ainuoke-bridge-client.ts";
import { createAinuokeAccountOperationLog } from "../features/ainuoke-api/model/account-operation-log.ts";
import { AINUOKE_REPORT_CATALOG } from "../features/ainuoke-api/model/ainuoke-api.ts";
import { DEFAULT_PERMISSION_STATE, userHasPermission } from "../features/permissions/model/permissions.ts";

const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

test("浏览器客户端只在内存维护 bridge session，账号 GET 不暴露 secret", async () => {
  const calls = [];
  const responses = [
    jsonResponse({ csrfToken: "csrf-memory-only", expiresAt: 1, identitySecurity: "browser_local_mock" }, 201),
    jsonResponse({ username: "alice", configured: true, status: "verified", lastVerifiedAt: null, lastSuccessfulLoginAt: null, lastErrorCode: null }),
  ];
  const client = createAinuokeBridgeClient({ fetchImpl: async (url, init) => { calls.push({ url, init }); return responses.shift(); } });
  const account = await client.getAccount("user-a");
  assert.equal(account.username, "alice");
  assert.equal(Object.hasOwn(account, "password"), false);
  assert.equal(Object.hasOwn(account, "token"), false);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].init.credentials, "include");
  assert.equal(calls[1].init.body, undefined);
});

test("切换 mock user 会建立新 bridge session，不复用其他用户 CSRF", async () => {
  const calls = [];
  const responses = [
    jsonResponse({ csrfToken: "csrf-a" }, 201),
    jsonResponse({ username: null, configured: false, status: "not_configured", lastVerifiedAt: null, lastSuccessfulLoginAt: null, lastErrorCode: null }),
    jsonResponse({ csrfToken: "csrf-b" }, 201),
    jsonResponse({ username: null, configured: false, status: "not_configured", lastVerifiedAt: null, lastSuccessfulLoginAt: null, lastErrorCode: null }),
  ];
  const client = createAinuokeBridgeClient({ fetchImpl: async (url, init) => { calls.push({ url, init }); return responses.shift(); } });
  await client.getAccount("user-a");
  await client.getAccount("user-b");
  const sessionBodies = calls.filter((call) => call.url.endsWith("/v1/session")).map((call) => JSON.parse(call.init.body));
  assert.deepEqual(sessionBodies, [{ userId: "user-a" }, { userId: "user-b" }]);
});

test("个人账号 OperationLog 只保留 actor/action/result/time", () => {
  const log = createAinuokeAccountOperationLog({ actor: { userId: "user-a", userName: "用户 A" }, action: "绑定艾诺科个人账号", result: "success", createdAt: "2026-09-08T00:00:00Z" });
  const encoded = JSON.stringify(log);
  assert.equal(log.entityId, "user-a");
  assert.deepEqual(log.afterData?.values, { "结果": "success" });
  assert.doesNotMatch(encoded.toLowerCase(), /password|jwttoken|session|credential-secret|jwt-secret/);
});

test("Report Catalog 只公开三个只读 source key，不接受 raw report selector", () => {
  assert.deepEqual(Object.keys(AINUOKE_REPORT_CATALOG), ["sales_contracts", "sales_contract_color_sizes", "material_purchase_statistics"]);
  assert.deepEqual(new Set(Object.values(AINUOKE_REPORT_CATALOG).map((item) => item.reportId)), new Set(["6086103", "6086997", "6087050"]));
  const clientSource = fs.readFileSync("features/ainuoke-api/client/ainuoke-bridge-client.ts", "utf8");
  assert.doesNotMatch(clientSource, /createSalesOrder|orderRepository|styleProgressRepository|commitImport/);
});

test("Secret Leakage contract excludes browser repositories, backup and console/file logging", () => {
  const clientSource = fs.readFileSync("features/ainuoke-api/client/ainuoke-bridge-client.ts", "utf8");
  const uiSource = fs.readFileSync("features/ainuoke-api/components/ainuoke-account-settings-page.tsx", "utf8");
  const backupSource = fs.readFileSync("features/data-management/service/data-management-service.ts", "utf8");
  const accountLogSource = fs.readFileSync("features/ainuoke-api/model/account-operation-log.ts", "utf8");
  for (const source of [clientSource, uiSource, accountLogSource]) {
    assert.doesNotMatch(source, /localStorage|sessionStorage|indexedDB|console\.|telemetry|fileLog/);
  }
  assert.doesNotMatch(backupSource, /ainuoke-api|AinuokeAccount|personal-account/);
  assert.doesNotMatch(accountLogSource, /username|password|token|session|raw server/i);
});

test("既有业务权限与个人 self-scoped capability 保持分离", () => {
  const permissions = fs.readFileSync("features/permissions/model/permissions.ts", "utf8");
  assert.match(permissions, /"ainuoke\.account\.bind_self"/);
  assert.match(permissions, /"ainuoke\.bind"/);
  assert.match(permissions, /将艾诺科销售合同绑定到织序订单/);
  assert.equal(userHasPermission(DEFAULT_PERMISSION_STATE, "user-admin", "ainuoke.account.bind_self"), true);
  assert.equal(userHasPermission(DEFAULT_PERMISSION_STATE, "user-quote-operator", "ainuoke.account.bind_self"), false);
  assert.equal(userHasPermission(DEFAULT_PERMISSION_STATE, "user-viewer", "ainuoke.account.bind_self"), false);
  assert.equal(userHasPermission(DEFAULT_PERMISSION_STATE, "user-quote-operator", "ainuoke.sync"), false);
});
