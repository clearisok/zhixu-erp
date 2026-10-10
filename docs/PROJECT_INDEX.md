# 项目知识索引

> 2026-10-10 D-102：默认设置/直接新建已实施，18444已有0011及b7c2080候选。两处挂载别名精确核验与identity记录PASS；随后只读HTTPS请求异常STOP，独立复核身份/数据/健康PASS但Chromium尚未开始，**PREVIEW UPDATE BLOCKED**。见[当前STOP](tasks/active/quote-two-step-creation.md#authorized-exact-path-closure--https-request-stop-2026-10-10)、[领域契约](features/QUOTE_INTAKE.md)。D-101其余目标保留；Intake/手机/转换及已有类型切换 **NOT IMPLEMENTED**。单主Codex/main84c8c5b；18443/订单工作树未动，USER ACCEPTANCE PENDING。

> PR #89 D-099 列表/100px/受保护Server缩略图已合并；原工程、18444更新和人工验收历史见[宽度/图片契约、测试与Preview备份恢复](tasks/active/d099-list-acceptance.md)，[合成像素证据](tasks/assets/d099-list-acceptance/README.md)。普通手机大图已通过工程验证，不再是原图大小占位路径。本轮未复核环境或新增人工验收结论，18443及旧环境不操作。

> 当前：D-099 Quote 原版 UI / Server 工程已由 PR #86 合并，人工 UI 验收 PENDING；PR #85 Source/Bridge 修复也已合并。PR #84 已 MERGED 于 `49a82c9f970e158ded589300b4aa04fc4c809038`；原 Windows 更新有[备份/运行身份/持久数据验收证据](tasks/completed/2026-10-09-windows-quote-trial-ui-update.md)，合并不代表新的运行更新。PR #88 D-099 新候选准备不等于已部署。当前摘要见 CURRENT_STATE，恢复点见 AI_HANDOFF；[UI审计](tasks/active/quote-original-ui-convergence.md)、[合成视觉索引](tasks/assets/quote-original-convergence/README.md)、[部署历史归档](tasks/completed/2026-10-09-windows-trial-delivery-history.md)与[操作说明](../ops/quote-trial/README.md)均保留。本轮不复核或更新真实环境，不重新 setup/init。
> PR #87 已合并至 `7ed9204d552384730bf93c992b500c530d639c38`；[历史补测、合成 API 演示与0009发布风险](tasks/completed/2026-10-10-pr87-delivery-plan-integration.md)保留。真实业务环境0009未获本轮授权，只有隔离18444 Preview通过安全检查后可以前向迁移。

> D-097 工程阶段历史：Fresh Start **正式 Quote Server 基本闭环工程/隔离验收完成，当时未真实部署**；本次 win01 已部署事实见上方及 CURRENT_STATE。显式 Quote authority=server（默认 browser）接原地 list/new/detail、正式 Editor/附件；全局 Browser bootstrap/mock identity 与未支持 URL 隔离。支持/未接动作、实际 Chromium 与质量证据见 `features/FRESH_START_FOUNDATION.md`、CURRENT_STATE/AI_HANDOFF。旧 runtime 与旧数据不变，历史导入 NOT REQUIRED。

> **当前新系统上线方向：D-096，全部业务数据从空开始。** 旧环境保留，Q5 historical import NOT REQUIRED；功能/安全/Quote-first 顺序不变，不代表正式 UI 已全接 Server。空库验证、技术初始化白名单、隔离部署说明与剩余接线文件见 [Fresh Start Foundation](features/FRESH_START_FOUNDATION.md)。下面既有部署/数据数量只描述旧环境，不是新系统的数据源或初始化指令。COS real Node preflight 已 PASS（PR #73 用户证据），不是 runtime storage activation。

> 最后确认的旧开发运行态（本轮未复核，非新候选）：Q3B2I-C2 CLOSED / PASS。PR #64 的 Local Single-User UI 修复已部署至真实本机 `127.0.0.1:3001` 并经用户真实浏览器验收；Q3 master/settings 为 Server authority 且编辑已重开，旧 3002 最后确认停止，旧 Quote aggregate 与附件仍由 Browser 持有。真实 0008/对象存储未激活；D-093 Active、B3/B3-R 已被取代。这不是新 session 试用候选的部署或登录指引。见 CURRENT_STATE 与 Q3B2I_CUTOVER_RUNBOOK 的历史执行证据。

## 系统简介

并行订单 C4.3 DeliveryPlan Server 领域/API 已实现并 disposable PG87/87 验证；规则 D-083/D-100、0009 集合所有权/CAS、稳定行与 drift 见 [独立交付报告](tasks/completed/2026-10-09-order-c43-delivery-plan.md)。未真实激活、未接计划 UI，不增加 D-098 报价上线前置。

织序（ZHIXU）是一个服装工厂业务系统仓库。当前工作树同时包含：

- 根路径 ERP：报价、订单、排单、用户和审计功能，使用 PostgreSQL 持久化，并由数据库函数提供 API。
- Quote Center 路径：默认 Browser mock 持久化；显式 Server 模式的正式报价/资料 UI 使用可信 Node `/api/v1` 与 PostgreSQL，已有报价工作流/附件/导出/日志。旧实际运行态与最新工程能力分开记录，与 legacy `/api/quotes` 隔离。
- Server Persistence 路径：Node/TypeScript、forward-only PostgreSQL migration、可信 Auth/RBAC/OperationLog。旧环境的 511 单 bootstrap 与后续只读 Order 接线属于历史证据；新系统 D-096 从空开始，不导入旧订单或自动同步。报价之外模块不因试用候选而自动 production-ready。

两条路径都是真实现，但边界和成熟度不同。开始任务前必须先确认目标模块。

## 上下文恢复顺序

新的 Codex 会话或上下文压缩后，按顺序读取：

1. 根目录 `AGENTS.md`
2. 本文件
3. `docs/AI_HANDOFF.md`（当前接力棒，不是长期业务事实源）
4. `docs/CURRENT_STATE.md`
5. 当前 `git status`、相关 diff
6. `docs/BUSINESS_RULES.md`
7. 任务对应的 `docs/features/*.md`
8. `docs/DECISION_LOG.md` 中相关 Active 条目
9. 实际代码、SQL、API 和测试

## 目录结构

| 路径 | 当前职责 |
| --- | --- |
| `app/` | Vinext/React 路由；根路径 ERP、Quote Center 和基础设置入口 |
| `features/quote-center/` | Quote Center 领域模型、mock repository、计算、工作流、页面组件和测试 |
| `features/order-center/` | 单款 SalesOrder 订单领域、v5→v6 LegacyOrderItem 迁移、Repository、服务、页面、附件引用和测试 |
| `features/production-scheduling/` | 直接归属订单的排单、内部生产队列、完成数量、物料运输、订单预警与交期风险投影 |
| `features/style-progress/` | Excel/API 共用的面辅料 Normalize / Dedup / Validate、ImportBatch / Raw Snapshot / 需求与事件、Source/Effective/Actual、齐套风险与逐物料物流投影 |
| `features/closing-center/` | 月度关账、归属快照、产值投影、锁账生命周期与关账搜索 |
| `features/basic-settings/` | 品牌、客户业务员、面料库、辅料库及默认资料逻辑 |
| `features/operations-settings/` | 生产组、外发厂、生产地点/日历、供应枢纽/路线/运输方式及关账设置基础设施 |
| `features/permissions/` | Quote Center 前端 User / Role / Permission、mock repository、权限上下文和用户权限页面 |
| `features/operation-logs/` | 统一追加式 OperationLog、差异生成、localStorage repository、报价时间线和系统全局查询页 |
| `server/` | Node/TypeScript API runtime、PostgreSQL pool/migration、可信 Auth/RBAC、server OperationLog，以及 PostgreSQL SalesOrder repository/transactional service/read API 与集成测试 |
| `features/global-search/` | ERP Command Palette、SearchProvider 注册表、Quote/Order 搜索和最近访问 |
| `features/data-management/` | 浏览器长期数据 schema、非破坏性迁移、测试隔离、备份恢复和危险重置 |
| `features/ainuoke-api/` | Local Bridge 的浏览器客户端、个人账号设置、固定订单 Discovery 与 typed `empty/sales_contract/inside_order` 只读 Source DTO，包括正式 6087105 BillNo 成衣分色分码读取；不承载订单/物料 mutation |
| `tools/ainuoke-bridge/` | loopback-only Python Bridge、Windows Credential Manager 接入、内存会话/token 与固定只读 Report Catalog |
| `components/foundation/` | 共用页面、表单、Modal、选择器、表格、Toast 等 UI 基础组件 |
| `components/` | 根路径 ERP 使用的通用图标和品牌组件 |
| `database/` | Legacy PostgreSQL schema/`api_dispatch`/初始化管理员，以及独立 `migrations/` forward-only server migrations；`0002` 建立 SalesOrder foundation 四表，`0003` 建立正式 SalesOrder sequence/allocator |
| `worker/` | Cloudflare/Vinext 静态应用与图片请求入口；不包含业务 API |
| `db/`、`drizzle/` | 尚未承载业务数据的 D1/Drizzle scaffold |
| 根目录 `*.ps1`、`*.sh` | 本地 Docker 构建、启动、备份、恢复和静态服务脚本 |
| `tests/` | 根级源码契约/配置测试；业务模块测试也分布在 `features/**/__tests__` |
| `docs/features/` | 复杂模块的当前行为与边界 |
| `docs/tasks/` | active 保存当前正式任务规格，completed 保存已完成任务的追溯映射；不替代 CURRENT_STATE |
| `artifacts/` | 验证截图等生成物，不是业务事实源 |
| `templates/` | 正式业务文档模板；修改前必须核对对应 feature 文档与模板哈希 |
| `outputs/` | 可复验的导出验收文件，不是业务数据源 |

仓库当前没有独立的 `backend/`、`frontend/` 目录，也没有 Alembic；正式 Node backend 位于 `server/`，PostgreSQL migration 位于 `database/migrations/`。

## 模块导航

| 要修改的模块 | 先读文档 | 主要代码/事实源 |
| --- | --- | --- |
| 根路径 ERP、登录、报价/订单/排单 | `features/LEGACY_ERP.md` | `app/page.tsx`、`database/001_schema.sql`、根目录 `docker-serve.sh` |
| Quote Intake / 手机款式收集（计划，NOT IMPLEMENTED） | `features/QUOTE_INTAKE.md`、`tasks/active/quote-intake-v1-implementation-contract.md` | 计划独立 `server/quote-intakes/` / `features/quote-intake/`，现有 Quote writer 复用 |
| Quote Center | `features/QUOTE_CENTER.md` | `app/quote-center/`、`features/quote-center/` |
| Quote production、Server migration 与 progressive rollout | `features/QUOTE_PRODUCTION.md`、`features/QUOTE_CUTOVER_READINESS.md`、`features/QUOTE_MIGRATION_RUNBOOK.md`、`features/QUOTE_MASTER_SETTINGS_ACTIVATION.md`、`features/Q3B2I_CUTOVER_RUNBOOK.md`、`features/QUOTE_CENTER.md`、`features/DATA_LIFECYCLE.md`、`features/ATTACHMENTS.md`、`features/SERVER_PERSISTENCE.md`、`features/PERMISSIONS.md` | Route B、Server foundation、Q2B2C Quote aggregate cutover dependency map、Q5-A/B historical Quote preview/guarded operational boundary，以及 Q3B2I-C2 已完成的 master/settings Server authority；C0/C1 runbook 为历史执行证据，实现事实仍以 Quote/Server/master/attachment 代码和测试为准 |
| 新订单中心、报价转订单、翻单、交期、订单价格历史与 PostgreSQL SalesOrder foundation/bootstrap/shadow read | `features/ORDER_CENTER.md`、`features/SALES_ORDER_PERSISTENCE.md`、`features/SALES_ORDER_BOOTSTRAP_PREVIEW.md`、`features/SALES_ORDER_BROWSER_CUTOVER.md`、`features/AINUOKE_GARMENT_COLOR_SIZE_SOURCE.md`、`features/SERVER_PERSISTENCE.md`、`features/OPERATIONS_FOUNDATION.md`、`features/DATA_LIFECYCLE.md` | Browser runtime：`app/order-center/`、`features/order-center/`；server foundation/read：`server/sales-orders/`、`features/order-center/server/`、`features/ainuoke-sync/service/sales-order-final-bootstrap-preview.ts`、`features/ainuoke-sync/source/ainuoke-garment-color-size-adapter.ts`、`database/migrations/0002_sales_order_foundation.sql`、`0003_sales_order_number_sequence.sql` |
| 生产队列、排单中心、物料运输、订单预警与交期风险 | `features/PRODUCTION_SCHEDULING.md`、`features/ORDER_CENTER.md`、`features/OPERATIONS_FOUNDATION.md`、`features/PERMISSIONS.md` | `app/production-scheduling/`、`features/production-scheduling/`、`tests/production-scheduling.test.mjs` |
| 款式进度、面辅料跟进、逐物料物流与真实 Excel 导入 | `features/STYLE_PROGRESS.md`、`features/ORDER_CENTER.md`、`features/PRODUCTION_SCHEDULING.md`、`features/DATA_LIFECYCLE.md` | `app/order-center/style-progress/`、`features/style-progress/`、`tests/style-progress.test.mjs` |
| 关账月份、关账归属、月度产值与锁账 | `features/CLOSING_CENTER.md`、`features/ORDER_CENTER.md`、`features/PRODUCTION_SCHEDULING.md`、`features/PERMISSIONS.md` | `app/closing-center/`、`features/closing-center/`、`tests/closing-center.test.mjs` |
| Quote Center 附件 | `features/ATTACHMENTS.md`、`features/QUOTE_CENTER.md` | `quote-attachments.ts`、`attachment-panel.tsx`、附件 repository |
| Quote Center Excel 导出 | `features/QUOTE_EXCEL_EXPORT.md`、`features/QUOTE_CENTER.md` | `features/quote-center/export/`、`quote-export-modal.tsx`、正式模板 |
| 模板设置 | `features/TEMPLATE_SETTINGS.md`、`features/QUOTE_EXCEL_EXPORT.md` | `features/template-settings/`、`app/basic-settings/templates/`、`templates/` |
| 报价批量导出 | `features/QUOTE_BATCH_EXPORT.md`、`features/QUOTE_CENTER.md` | `quote-list.tsx`、`batch-export-modal.tsx`、`quote-batch-exporter.ts` |
| 估算成本 | `features/ESTIMATE_COST.md`、`features/QUOTE_CENTER.md`、`features/PERMISSIONS.md` | `model/estimate-cost.ts`、`estimate-cost-panel.tsx`、Revision 管理 Modal；显式 Server 命令 `server/quotes/estimate-workflows.ts`、service 与共用 Editor persistence；工程接线已验证，未真实部署 |
| 品牌、客户业务员、面辅料库 | `features/BASIC_SETTINGS.md` | `app/basic-settings/`、`features/basic-settings/` |
| 生产组、外发厂、生产地点/日历、物流路线、关账设置 | `features/OPERATIONS_FOUNDATION.md`、`features/PERMISSIONS.md`、`features/DATA_LIFECYCLE.md` | `features/operations-settings/`、对应基础/系统设置路由、`tests/operations-infrastructure.test.mjs` |
| 用户、角色与权限 | `features/PERMISSIONS.md`、`features/UI_FOUNDATION.md` | `features/permissions/`、`components/foundation/button.tsx`、用户权限路由 |
| 艾诺科个人账号、订单 Discovery、SalesContractNo 稳定关联、6087105 正式颜色/分码 Source 与只读 Direct API | `features/AINUOKE_API_SYNC.md`、`features/AINUOKE_ORDER_DISCOVERY.md`、`features/AINUOKE_GARMENT_COLOR_SIZE_SOURCE.md`、`features/PERMISSIONS.md`、`features/DATA_LIFECYCLE.md`、`features/OPERATION_LOGS.md` | `tools/ainuoke-bridge/`、`features/ainuoke-api/`、`features/ainuoke-sync/` 与 `features/style-progress/` |
| Quote Center / 全局操作日志 | `features/OPERATION_LOGS.md`、`features/QUOTE_CENTER.md` | `features/operation-logs/`、`app/system-settings/operation-logs/`、`quote-editor.tsx`、日志测试 |
| ERP 全局搜索 | `features/GLOBAL_SEARCH.md`、`features/PERMISSIONS.md` | `features/global-search/`、`components/foundation/app-shell.tsx`、`tests/global-search.test.mjs` |
| 浏览器数据生命周期、迁移、备份恢复 | `features/DATA_LIFECYCLE.md` | `features/data-management/`、各 browser repository、`tests/data-lifecycle.test.mjs` |
| 表单、Modal、选择器和 App Shell | `features/UI_FOUNDATION.md` | `components/foundation/`、`app/globals.css` |
| 数据库/API | `features/LEGACY_ERP.md`、`SYSTEM_OVERVIEW.md` | `database/*.sql`、根目录 `docker-serve.sh` |
| Node server、migration、可信认证/RBAC、server OperationLog、SalesOrder foundation/bootstrap preview | `features/SERVER_PERSISTENCE.md`、`features/SALES_ORDER_PERSISTENCE.md`、`features/SALES_ORDER_BOOTSTRAP_PREVIEW.md`、`features/PERMISSIONS.md`、`features/OPERATION_LOGS.md` | `server/`、`features/ainuoke-sync/service/sales-order-bootstrap-preview.ts`、`database/migrations/`、`Dockerfile.server` |
| 本地 Docker/备份恢复 | `features/LEGACY_ERP.md`、README | `Dockerfile`、`docker-compose.yml`、根目录 `*.ps1`、`*.sh` |
| 部署/静态构建 | `SYSTEM_OVERVIEW.md` | `next.config.ts`、`vite.config.ts`、`worker/`、`.openai/hosting.json` |
| 业务规则 | `BUSINESS_RULES.md` + 对应 feature | 模型、validation、计算函数及测试 |
| 当前进度/风险 | `CURRENT_STATE.md` | 当前工作树和验证结果 |

## 知识文件职责

事实优先级：当前用户明确要求 > `CURRENT_STATE` > Active `BUSINESS_RULES` / `DECISION_LOG` > 旧讨论 > AI 推测。`AI_HANDOFF` 只说明从哪里接着做，不构成第四个长期业务事实源。

- `SYSTEM_OVERVIEW.md`：架构、技术栈、运行路径、数据流。
- `BUSINESS_RULES.md`：能够由代码、约束、测试或明确文档确认的规则。
- `CURRENT_STATE.md`：当前完成度、正在进行的工作、缺口、验证状态和不可破坏项。
- `DECISION_LOG.md`：重要决定及其 Active/Superseded/Deprecated 状态。
- `features/*.md`：单个复杂模块的行为、模型、接口、前端和约束。

## 历史资料

- 2026-09-01 Full UI / Workflow Correction 的 Page 1–16 映射、Gate commits、响应式与截图索引见 `docs/tasks/completed/2026-09-01-full-ui-workflow-correction.md`。
- `docs/ui-audit.md` 是 2026-08-17 时点的 UI 审计，其中“尚无 Foundation”等描述已经被当前代码取代。
- `docs/quote-ui-migration-plan.md` 是迁移规划和设计背景，不是当前行为的最终事实源。

历史资料可用于理解原因，但发生冲突时以当前代码、测试、CURRENT_STATE 和 Active 决策为准。
