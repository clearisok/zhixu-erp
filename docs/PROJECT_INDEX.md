# 项目知识索引

## 系统简介

织序（ZHIXU）是一个服装工厂业务系统仓库。当前工作树同时包含：

- 根路径 ERP：报价、订单、排单、用户和审计功能，使用 PostgreSQL 持久化，并由数据库函数提供 API。
- Quote Center：新报价中心、报价 Revision/PriceVersion、基础资料和统一 UI Foundation，当前仍使用浏览器 mock 持久化，与根路径 ERP 后端隔离。

两条路径都是真实现，但边界和成熟度不同。开始任务前必须先确认目标模块。

## 上下文恢复顺序

新的 Codex 会话或上下文压缩后，按顺序读取：

1. 根目录 `AGENTS.md`
2. 本文件
3. `docs/CURRENT_STATE.md`
4. 当前 `git status`、相关 diff
5. `docs/BUSINESS_RULES.md`
6. 任务对应的 `docs/features/*.md`
7. `docs/DECISION_LOG.md` 中相关 Active 条目
8. 实际代码、SQL、API 和测试

## 目录结构

| 路径 | 当前职责 |
| --- | --- |
| `app/` | Vinext/React 路由；根路径 ERP、Quote Center 和基础设置入口 |
| `features/quote-center/` | Quote Center 领域模型、mock repository、计算、工作流、页面组件和测试 |
| `features/basic-settings/` | 品牌、客户业务员、面料库、辅料库及默认资料逻辑 |
| `features/permissions/` | Quote Center 前端 User / Role / Permission、mock repository、权限上下文和用户权限页面 |
| `features/operation-logs/` | 统一追加式 OperationLog、差异生成、localStorage repository、报价时间线和系统全局查询页 |
| `features/global-search/` | ERP Command Palette、SearchProvider 注册表、Quote 搜索和最近访问 |
| `components/foundation/` | 共用页面、表单、Modal、选择器、表格、Toast 等 UI 基础组件 |
| `components/` | 根路径 ERP 使用的通用图标和品牌组件 |
| `database/` | PostgreSQL schema、`api_dispatch` API 函数和初始管理员脚本 |
| `worker/` | Cloudflare/Vinext 静态应用与图片请求入口；不包含业务 API |
| `db/`、`drizzle/` | 尚未承载业务数据的 D1/Drizzle scaffold |
| 根目录 `*.ps1`、`*.sh` | 本地 Docker 构建、启动、备份、恢复和静态服务脚本 |
| `tests/` | 根级源码契约/配置测试；业务模块测试也分布在 `features/**/__tests__` |
| `docs/features/` | 复杂模块的当前行为与边界 |
| `artifacts/` | 验证截图等生成物，不是业务事实源 |
| `templates/` | 正式业务文档模板；修改前必须核对对应 feature 文档与模板哈希 |
| `outputs/` | 可复验的导出验收文件，不是业务数据源 |

仓库当前没有独立的 `backend/`、`frontend/` 目录，也没有 Alembic migration 目录。

## 模块导航

| 要修改的模块 | 先读文档 | 主要代码/事实源 |
| --- | --- | --- |
| 根路径 ERP、登录、报价/订单/排单 | `features/LEGACY_ERP.md` | `app/page.tsx`、`database/001_schema.sql`、根目录 `docker-serve.sh` |
| Quote Center | `features/QUOTE_CENTER.md` | `app/quote-center/`、`features/quote-center/` |
| Quote Center 附件 | `features/ATTACHMENTS.md`、`features/QUOTE_CENTER.md` | `quote-attachments.ts`、`attachment-panel.tsx`、附件 repository |
| Quote Center Excel 导出 | `features/QUOTE_EXCEL_EXPORT.md`、`features/QUOTE_CENTER.md` | `features/quote-center/export/`、`quote-export-modal.tsx`、正式模板 |
| 模板设置 | `features/TEMPLATE_SETTINGS.md`、`features/QUOTE_EXCEL_EXPORT.md` | `features/template-settings/`、`app/basic-settings/templates/`、`templates/` |
| 报价批量导出 | `features/QUOTE_BATCH_EXPORT.md`、`features/QUOTE_CENTER.md` | `quote-list.tsx`、`batch-export-modal.tsx`、`quote-batch-exporter.ts` |
| 估算成本 | `features/ESTIMATE_COST.md`、`features/QUOTE_CENTER.md` | `model/estimate-cost.ts`、`estimate-cost-panel.tsx`、Revision 管理 Modal |
| 品牌、客户业务员、面辅料库 | `features/BASIC_SETTINGS.md` | `app/basic-settings/`、`features/basic-settings/` |
| 用户、角色与权限 | `features/PERMISSIONS.md`、`features/UI_FOUNDATION.md` | `features/permissions/`、`components/foundation/button.tsx`、用户权限路由 |
| Quote Center / 全局操作日志 | `features/OPERATION_LOGS.md`、`features/QUOTE_CENTER.md` | `features/operation-logs/`、`app/system-settings/operation-logs/`、`quote-editor.tsx`、日志测试 |
| ERP 全局搜索 | `features/GLOBAL_SEARCH.md`、`features/PERMISSIONS.md` | `features/global-search/`、`components/foundation/app-shell.tsx`、`tests/global-search.test.mjs` |
| 表单、Modal、选择器和 App Shell | `features/UI_FOUNDATION.md` | `components/foundation/`、`app/globals.css` |
| 数据库/API | `features/LEGACY_ERP.md`、`SYSTEM_OVERVIEW.md` | `database/*.sql`、根目录 `docker-serve.sh` |
| 本地 Docker/备份恢复 | `features/LEGACY_ERP.md`、README | `Dockerfile`、`docker-compose.yml`、根目录 `*.ps1`、`*.sh` |
| 部署/静态构建 | `SYSTEM_OVERVIEW.md` | `next.config.ts`、`vite.config.ts`、`worker/`、`.openai/hosting.json` |
| 业务规则 | `BUSINESS_RULES.md` + 对应 feature | 模型、validation、计算函数及测试 |
| 当前进度/风险 | `CURRENT_STATE.md` | 当前工作树和验证结果 |

## 知识文件职责

- `SYSTEM_OVERVIEW.md`：架构、技术栈、运行路径、数据流。
- `BUSINESS_RULES.md`：能够由代码、约束、测试或明确文档确认的规则。
- `CURRENT_STATE.md`：当前完成度、正在进行的工作、缺口、验证状态和不可破坏项。
- `DECISION_LOG.md`：重要决定及其 Active/Superseded/Deprecated 状态。
- `features/*.md`：单个复杂模块的行为、模型、接口、前端和约束。

## 历史资料

- `docs/ui-audit.md` 是 2026-08-17 时点的 UI 审计，其中“尚无 Foundation”等描述已经被当前代码取代。
- `docs/quote-ui-migration-plan.md` 是迁移规划和设计背景，不是当前行为的最终事实源。

历史资料可用于理解原因，但发生冲突时以当前代码、测试、CURRENT_STATE 和 Active 决策为准。
