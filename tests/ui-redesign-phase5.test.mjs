import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { DEFAULT_PERMISSION_STATE, PERMISSION_DEFINITIONS } from "../features/permissions/model/permissions.ts";
import { groupOperationLogs, operationLogSections } from "../features/operation-logs/model/operation-log-presentation.ts";
import { defaultGlobalQuoteSettings, normalizeGlobalQuoteSettings } from "../features/quote-center/model/quote-settings.ts";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Phase 5 权限目录和分组计数动态派生，不硬编码权限总数", async () => {
  const state = DEFAULT_PERMISSION_STATE;
  const source = await read("features/permissions/components/user-permission-page.tsx");
  assert.ok(PERMISSION_DEFINITIONS.length > 0);
  assert.equal(state.roles.find((role) => role.id === "role-admin")?.permissions.length, PERMISSION_DEFINITIONS.length);
  assert.match(source, /PERMISSION_DEFINITIONS\.length/);
  assert.match(source, /Map\.groupBy\(PERMISSION_DEFINITIONS/);
  assert.doesNotMatch(source, /43\s*项权限|42\s*项权限/);
  assert.match(source, /saveState\(next\)/);
});

test("Phase 5 OperationLog 使用正式业务分组和 changes[] 详情", async () => {
  const now = "2026-08-31T08:00:00.000Z";
  const logs = [{ id: "log-1", createdAt: now, userId: "u1", userName: "用户", module: "权限管理", entityType: "Role", entityId: "role-1", action: "修改权限", beforeData: { values: { 权限: "未授权" } }, afterData: { values: { 权限: "已授权" } }, changes: [{ field: "权限", before: "未授权", after: "已授权" }] }];
  const groups = groupOperationLogs(logs);
  assert.equal(groups[0].action, "修改权限");
  assert.equal(operationLogSections(groups[0])[0].items[0].changes.length, 1);
  const source = await read("features/operation-logs/components/global-operation-log-page.tsx");
  assert.match(source, /OperationLog/);
  assert.match(source, /<Drawer/);
  assert.match(source, /operationLogSections/);
  assert.doesNotMatch(source, /OrderLog|ScheduleLog/);
});

test("Phase 5 生产与运输只表达正式基础事实，不新增风险算法", async () => {
  const source = await read("features/operations-settings/components/operations-settings-pages.tsx");
  for (const marker of ["state.productionSites", "state.productionCalendars", "state.supplyHubs", "state.supplyRoutes", "state.transportModes"]) assert.match(source, new RegExp(marker.replace(".", "\\.")));
  for (const heading of ["在哪里生产", "物料从哪里发", "仓库到工厂怎么走"]) assert.match(source, new RegExp(heading));
  assert.doesNotMatch(source, /calculateLogisticsRisk|newRiskThreshold|运输风险算法/);
});

test("Phase 5 制作预设可编辑且规范化不会触碰历史报价快照", async () => {
  const input = structuredClone(defaultGlobalQuoteSettings);
  input.manufacturingPresets[0].markupRate = 21;
  const normalized = normalizeGlobalQuoteSettings(input);
  assert.equal(normalized.manufacturingPresets[0].markupRate, 21);
  const source = await read("features/quote-center/components/global-quote-settings-page.tsx");
  assert.match(source, /默认仅表示新建时带入；当前预设仍可编辑/);
  assert.match(source, /不会改写已有 QuoteRevision \/ PriceVersion 快照/);
  assert.doesNotMatch(source, /mockQuoteRepository|save\(quote/);
});

test("Phase 5 模板管理复用正式 validator、repository 与 exporter", async () => {
  const source = await read("features/template-settings/components/template-settings-page.tsx");
  assert.match(source, /<DataTable/);
  assert.match(source, /validateQuoteCustomerTemplate/);
  assert.match(source, /indexedDbTemplateRepository/);
  assert.match(source, /buildQuoteRevisionExcelWithTemplate/);
  assert.match(source, /<Drawer/);
  assert.doesNotMatch(source, /function parseTemplate|const parseTemplate/);
});
