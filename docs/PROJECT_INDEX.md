# 项目知识索引

## 系统简介

织序（ZHIXU）是一个服装工厂业务系统仓库。当前工作树同时包含：

- 根路径 ERP：报价、订单、排单、用户和审计功能，使用 PostgreSQL 持久化，并由数据库函数提供 API。
- Quote Center 路径：新报价中心、报价 Revision/PriceVersion、新订单中心、基础资料和统一 UI Foundation，当前仍使用浏览器 mock 持久化，与根路径 ERP 后端隔离。
- Server Persistence 路径：Phase 1 Node/TypeScript API、PostgreSQL versioned migrations、可信 Auth/RBAC 与 server OperationLog、Phase 2B1 PostgreSQL SalesOrder server foundation、Phase 2B2/2B2.1/2B2.2 source Preview/validation/identity，以及 Phase 2B2.3 formal order number + final fresh disposable dry-run。当前 `SalesContractNo` / `BillNo` 是稳定跨报表关联，6087105 是 Active color/size source；真实 PostgreSQL 已完成 511 单首次 bootstrap，正式编号为 `SO-00000001`…`SO-00000511`。Browser Order Center runtime 仍未接管该数据。

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
| Quote Center | `features/QUOTE_CENTER.md` | `app/quote-center/`、`features/quote-center/` |
| Quote production、Server migration 与 progressive rollout | `features/QUOTE_PRODUCTION.md`、`features/QUOTE_CUTOVER_READINESS.md`、`features/QUOTE_MASTER_SETTINGS_ACTIVATION.md`、`features/Q3B2I_CUTOVER_RUNBOOK.md`、`features/QUOTE_CENTER.md`、`features/DATA_LIFECYCLE.md`、`features/ATTACHMENTS.md`、`features/SERVER_PERSISTENCE.md`、`features/PERMISSIONS.md` | Route B、当前 Server foundation、Q2B2C production-cutover dependency map，以及 Q3B2I-C0 blocked preflight / C1 draft runbook；实现事实仍以 Quote/Server/master/attachment 代码和测试为准 |
| 新订单中心、报价转订单、翻单、交期、订单价格历史与 PostgreSQL SalesOrder foundation/bootstrap/shadow read | `features/ORDER_CENTER.md`、`features/SALES_ORDER_PERSISTENCE.md`、`features/SALES_ORDER_BOOTSTRAP_PREVIEW.md`、`features/SALES_ORDER_BROWSER_CUTOVER.md`、`features/AINUOKE_GARMENT_COLOR_SIZE_SOURCE.md`、`features/SERVER_PERSISTENCE.md`、`features/OPERATIONS_FOUNDATION.md`、`features/DATA_LIFECYCLE.md` | Browser runtime：`app/order-center/`、`features/order-center/`；server foundation/read：`server/sales-orders/`、`features/order-center/server/`、`features/ainuoke-sync/service/sales-order-final-bootstrap-preview.ts`、`features/ainuoke-sync/source/ainuoke-garment-color-size-adapter.ts`、`database/migrations/0002_sales_order_foundation.sql`、`0003_sales_order_number_sequence.sql` |
| 生产队列、排单中心、物料运输、订单预警与交期风险 | `features/PRODUCTION_SCHEDULING.md`、`features/ORDER_CENTER.md`、`features/OPERATIONS_FOUNDATION.md`、`features/PERMISSIONS.md` | `app/production-scheduling/`、`features/production-scheduling/`、`tests/production-scheduling.test.mjs` |
| 款式进度、面辅料跟进、逐物料物流与真实 Excel 导入 | `features/STYLE_PROGRESS.md`、`features/ORDER_CENTER.md`、`features/PRODUCTION_SCHEDULING.md`、`features/DATA_LIFECYCLE.md` | `app/order-center/style-progress/`、`features/style-progress/`、`tests/style-progress.test.mjs` |
| 关账月份、关账归属、月度产值与锁账 | `features/CLOSING_CENTER.md`、`features/ORDER_CENTER.md`、`features/PRODUCTION_SCHEDULING.md`、`features/PERMISSIONS.md` | `app/closing-center/`、`features/closing-center/`、`tests/closing-center.test.mjs` |
| Quote Center 附件 | `features/ATTACHMENTS.md`、`features/QUOTE_CENTER.md` | `quote-attachments.ts`、`attachment-panel.tsx`、附件 repository |
| Quote Center Excel 导出 | `features/QUOTE_EXCEL_EXPORT.md`、`features/QUOTE_CENTER.md` | `features/quote-center/export/`、`quote-export-modal.tsx`、正式模板 |
| 模板设置 | `features/TEMPLATE_SETTINGS.md`、`features/QUOTE_EXCEL_EXPORT.md` | `features/template-settings/`、`app/basic-settings/templates/`、`templates/` |
| 报价批量导出 | `features/QUOTE_BATCH_EXPORT.md`、`features/QUOTE_CENTER.md` | `quote-list.tsx`、`batch-export-modal.tsx`、`quote-batch-exporter.ts` |
| 估算成本 | `features/ESTIMATE_COST.md`、`features/QUOTE_CENTER.md` | `model/estimate-cost.ts`、`estimate-cost-panel.tsx`、Revision 管理 Modal |
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
