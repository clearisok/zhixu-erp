import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { DEFAULT_PERMISSION_STATE, userHasPermission } from "../features/permissions/model/permissions.ts";
import { defaultQuoteSettingsForUser } from "../features/quote-center/model/quote-settings.ts";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("常规报价 UI 隐藏 quoteNo，但保留可配置列与搜索字段", async () => {
  const [editor, list, provider] = await Promise.all([
    read("features/quote-center/components/quote-editor.tsx"),
    read("features/quote-center/components/quote-list.tsx"),
    read("features/global-search/providers/quote-search-provider.ts"),
  ]);
  assert.doesNotMatch(editor, /title=\{`\$\{quote\.quoteCode\}/);
  assert.doesNotMatch(editor, /qc-sticky-summary[^\n]*quote\.quoteCode/);
  assert.doesNotMatch(list, /<small>\{quote\.quoteCode\}<\/small>/);
  assert.doesNotMatch(provider, /label: "报价号"/);
  assert.match(provider, /const searchable = \[quote\.quoteCode/);
  assert.match(list, /quote: \{ key: "quote"/);
  assert.equal(defaultQuoteSettingsForUser("user-a").visibleColumns.includes("quote"), false);
});

test("Sidebar 将基础资料与系统设置分组，并固定头尾、隐藏导航滚动条", async () => {
  const [shell, css] = await Promise.all([read("components/foundation/app-shell.tsx"), read("app/globals.css")]);
  const basic = shell.slice(shell.indexOf("const basicRoutes"), shell.indexOf("const systemRoutes"));
  const system = shell.slice(shell.indexOf("const systemRoutes"), shell.indexOf("export function AppShell"));
  for (const label of ["品牌设置", "客户业务员设置", "面料库", "辅料库"]) assert.match(basic, new RegExp(label));
  assert.doesNotMatch(basic, /模板设置|用户权限/);
  for (const label of ["报价设置", "模板设置", "用户权限", "操作日志"]) assert.match(system, new RegExp(label));
  assert.doesNotMatch(shell, /核心业务|返回原 ERP|系统入口/);
  assert.match(shell, /systemOpen && expandedSidebar/);
  assert.match(css, /\.ops-sidebar \{[^}]*overflow: hidden/);
  assert.match(css, /\.ops-sidebar nav \{[^}]*overflow-y: auto/);
  assert.match(css, /scrollbar-width: none/);
  assert.match(css, /\.ops-sidebar nav::\-webkit-scrollbar/);
  assert.match(css, /\.ops-user \{[^}]*flex: 0 0 auto/);
});

test("全局操作日志复用现有 repository，支持查询筛选详情且保持 append-only", async () => {
  const [page, repository, route] = await Promise.all([
    read("features/operation-logs/components/global-operation-log-page.tsx"),
    read("features/operation-logs/repository/operation-log-repository.ts"),
    read("app/system-settings/operation-logs/page.tsx"),
  ]);
  assert.match(route, /GlobalOperationLogPage/);
  assert.match(page, /operationLogRepository\.list\(\)/);
  assert.match(page, /audit_log\.view/);
  for (const field of ["开始日期", "结束日期", "用户", "模块", "操作"]) assert.match(page, new RegExp(field));
  assert.match(page, /<Drawer/);
  assert.match(page, /技术详情与原始 Before \/ After/);
  assert.doesNotMatch(page, /编辑日志|删除日志/);
  assert.match(repository, /list\(\): Promise<OperationLog\[\]>/);
  assert.doesNotMatch(repository, /update\(|delete\(/);
});

test("报价设置与操作日志 Header 使用同一纵向左对齐标题容器", async () => {
  const [settings, audit, foundation, css] = await Promise.all([
    read("features/quote-center/components/global-quote-settings-page.tsx"),
    read("features/operation-logs/components/global-operation-log-page.tsx"),
    read("components/foundation/page.tsx"),
    read("app/globals.css"),
  ]);
  assert.match(settings, /eyebrow="SYSTEM SETTINGS" title="报价设置"/);
  assert.match(audit, /eyebrow="OPERATION LOG" title="操作日志"/);
  assert.match(foundation, /className="qc-page-identity">\{eyebrow/);
  assert.match(css, /\.module-head > \.qc-page-actions/);
});

test("audit_log.view 只默认授予管理员", () => {
  assert.equal(userHasPermission(DEFAULT_PERMISSION_STATE, "user-admin", "audit_log.view"), true);
  assert.equal(userHasPermission(DEFAULT_PERMISSION_STATE, "user-quote-operator", "audit_log.view"), false);
  assert.equal(userHasPermission(DEFAULT_PERMISSION_STATE, "user-viewer", "audit_log.view"), false);
});

test("搜索结果统一打开并让 query id 变化触发详情重载", async () => {
  const [palette, editor] = await Promise.all([
    read("features/global-search/components/global-search-palette.tsx"),
    read("features/quote-center/components/quote-editor.tsx"),
  ]);
  assert.match(palette, /const openSearchResult/);
  assert.match(palette, /onChoose=\{\(\) => openSearchResult\(result\)\}/);
  assert.match(palette, /openSearchResult\(displayed\[activeIndex\]\)/);
  assert.match(palette, /inputRef\.current\?\.blur\(\)/);
  assert.match(editor, /const quoteId = searchParams\.get\("id"\)/);
  assert.match(editor, /\}, \[quoteId\]\)/);
  assert.match(editor, /<QuoteEditor key=\{quote\.id\}/);
});

test("Quote Detail 连续功能区使用共享间距容器", async () => {
  const [editor, css, responsive] = await Promise.all([
    read("features/quote-center/components/quote-editor.tsx"),
    read("app/quote-center/quote-center.css"),
    read("app/quote-center/responsive.css"),
  ]);
  assert.match(editor, /qc-quote-functional-stack/);
  assert.match(css, /\.qc-quote-functional-stack \{[^}]*gap: 12px/);
  assert.match(css, /\.qc-quote-functional-stack :is\(\.qc-quick-navigation, \.qc-quote-version-bar, \.qc-validation-summary\)/);
  assert.match(responsive, /\.qc-quote-functional-stack \{ gap: 10px/);
  assert.doesNotMatch(`${css}\n${responsive}`, /qc-quote-functional-stack[^}]*margin-top:\s*-/);
});
