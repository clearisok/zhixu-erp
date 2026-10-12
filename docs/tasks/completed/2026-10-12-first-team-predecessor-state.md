# 首批团队接入前快照

2026-10-12归档，main 01694d723cd7b65fcc20e3e79941fef0d57439fc。以下当时原文的PR95待交付描述已过时，保留历史日期、hash及限制。

## docs/PROJECT_INDEX.md

# 项目知识索引

> 核实日期2026-10-12；main起点 `4adbc30845f99368caa77d3431cc67a6440ac623`。PR91/92/93/94均已合并；运行环境、人工验收和Source激活分别见[当前状态](CURRENT_STATE.md)与[机器可读清单](release/baseline.json)，不能从merge推断部署。原PR92 Draft等滚动状态完整保存在[前序快照](tasks/completed/2026-10-12-release-baseline-predecessor-state.md)。

> 当前开发任务：[Release baseline guard v2](features/RELEASE_BASELINE_GUARD.md) / [实施证据与PR95复审](tasks/active/release-baseline-guard.md)。v2补强UI输入、CSS AST、冻结Git证据及状态转换约束；只验证源码/历史证据契约，不代替真实UI/DB/发布验收。Git交付继续使用[PR94协议](tasks/active/git-delivery-resilience.md)。

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
| 发布基线/能力状态/最小阻断检查 | `features/RELEASE_BASELINE_GUARD.md` | `docs/release/baseline.json`、`scripts/check-release-baseline.mjs`、`tests/release-baseline-guard.test.mjs` |
| 当前进度/风险 | `CURRENT_STATE.md` | 当前工作树和验证结果 |

## 知识文件职责

按事实类型核实：用户已批准规则表达业务意图；目标SHA的代码/SQL/实际测试证明实现；GitHub证明合并；运行镜像/发布记录证明部署；明确用户记录证明人工验收。CURRENT_STATE是有时间戳的摘要。代码与批准规则冲突必须显式报告，不凭旧状态或AI推测改规则。AI_HANDOFF只说明恢复点。

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


---

## docs/CURRENT_STATE.md

# 当前状态

> 核实日期：2026-10-12。任务起点 / GitHub main：`4adbc30845f99368caa77d3431cc67a6440ac623`（PR94合并点）。这是有时间戳的状态快照；下一任务仍须实时核对main、PR与运行身份。

## 已合并工程与验收范围

- PR91、PR92、PR93、PR94均已MERGED；PR88为closed未merge。原“PR92 Draft”是历史状态，见[完整归档](tasks/completed/2026-10-12-release-baseline-predecessor-state.md)。
- PR91：D-102普通电脑直接保留草稿、制作方案→默认值、原版列表铺满与偏好保持；2026-10-11人工PASS只覆盖该候选范围。
- PR92：订单P6/精简详情/只读Control Tower有用户PASS及后续联合工程回归；**真实Source、可信账号/团队scope、生产路由未激活**。executionOnly不访问CCT，不回退Browser。
- PR93：D-103 sale/labor四键与成本/测算销售价/历史/导出/日志保护在main；不能据此声称运行环境已修复。
- PR94：单次Git交付、精确SHA核验和NETWORK_DEGRADED规则已合并；不改变ERP功能或运行环境。
- [基线/能力清单](release/baseline.json)分别记录实现、合并、隔离测试、两环境部署、人工验收和来源激活；[检查说明](features/RELEASE_BASELINE_GUARD.md)。

## 运行环境（沿用历史证据，本任务未访问）

| 环境 | 最后记录source / image | 范围 |
| --- | --- | --- |
| 18443 | 878de323d618b25fca1f51ccf3f024e932641742 / sha256:7a4812791968a24c8b8afedf0014d54ec62cc9db06d7bfd3559dc67b05bf4bd4 | 较早Quote试用；[2026-10-09更新证据](tasks/completed/2026-10-09-windows-quote-trial-ui-update.md) |
| 18444 | eb9530ac9a2e1b7f68299d97c4d424662a6622f7 / sha256:1707a8e54159928330b4d223f5db4646a6d4696e3684e9615055fb9bd9c33e23 | PR91已验收候选；[部署/恢复历史](tasks/active/quote-two-step-creation.md#second-acceptance-preview-deployment-pass-2026-10-10) |

可随仓恢复的环境日期采用上述2026-10-09/10部署记录；前轮本地审计不用于抬高仓内证据时间。本工程任务未重新核验runtime/ledger/账号/对象，不将旧计数称为当前值。两环境独立DB/对象与旧环境继续保留；合并不等于部署。两个记录镜像不含PR92/93。

## 当前任务与验证

PR95 `chore/release-baseline-guard`提供清单与隔离PR检查；合并前审查发现的五项缺口已按v2补强：TS/资源输入、CSS AST、Git blob冻结证据、分维度状态证明、非空状态文档。八个误通过场景已成为回归测试；本轮结果和复审见[任务证据](tasks/active/release-baseline-guard.md)。不改页面、权限业务规则、路由白名单、SQL或部署；不沿用旧测试数量冒充新PASS。

## 风险与下一步

先完成最小门禁，再独立建设真实构建的像素/几何回归和安全候选/兼容回退演练。D-023文字与600/1100/1440实际断点关系待收口，保持当前行为。Order/Material真实来源及团队scope、DeliveryPlan UI、Intake、已有报价类型切换、正式转单、生产/关账Server化仍有缺口，不增加D-098 Quote-first首版前置。关账币种汇总/文字冲突、双环境Cookie/TLS及正式账本归属保留为后续独立核查，不能在本任务顺便修复。

D-096历史导入NOT REQUIRED、D-097无Browser回退、D-099原版加后续批准变更、D-102/103保持。历史测试/部署/人工证据见归档和对应task；默认Browser与所有业务数据不变。


---

## docs/AI_HANDOFF.md

# AI handoff

## 当前恢复点 — Release baseline guard（2026-10-12）

- 任务起点main：`4adbc30845f99368caa77d3431cc67a6440ac623`；独立worktree `C:/Users/Administrator/.codex/worktrees/release-baseline-guard/zhixu-ainuoke-api`，分支 `chore/release-baseline-guard`，起始clean。
- 用户授权：基线与能力清单、状态对齐、最小阻断检查、测试和唯一PR；禁止UI重设计、生产路由/数据库/18443/18444变更，不自动merge。
- [清单](release/baseline.json) / [检查与更新契约](features/RELEASE_BASELINE_GUARD.md) / [本任务结果与网络证据](tasks/active/release-baseline-guard.md)。
- PR91/92/93/94已MERGED，旧PR92 Draft描述已归档；D103已入main，但两环境最后记录镜像尚未包含。P6/PR91人工PASS是历史范围；真实Order/Material Source和生产路由未激活。
- 本PR只提供source/evidence guard，不是新的浏览器像素、生产发布或人工验收。后续完整UI回归、安全候选与Source接线必须独立任务。
- PR95复审修复从clean `b5411b68618e663d97ca50ac5bb9f49bc688193e`继续，main仍为上述4adbc。v2修复五项缺口并纳入R95-1…8反例；状态事实和PNG不重写。测试/复审/交付状态见任务证据，不能把首轮CI绿灯视为修复后CI结果。
- 修复checkpoint `b111d8cd5dcaac93652656076ec050744c449083`后补齐HTML/路由AST同类遗漏，最终本地807/807（含69专项）PASS。交付预检pushes=0进入NETWORK_DEGRADED；最后独立核实远端仍b5411b6。遵循一条普通PowerShell恢复命令，收到exact SHA后才更新PR交付结论并核验新CI。
- 最终工程/commit/远端PR结果记录于任务证据和GitHub；不循环写入本文件自身SHA。遇NETWORK_DEGRADED遵循AGENTS/PR94工具，不无界重试。

原PR91部署、PR92联合回归/继承dirty、PR94交付的日期/hash/结果/限制完整保留在[前序快照](tasks/completed/2026-10-12-release-baseline-predecessor-state.md)。不将其他worktree的历史dirty套用到本任务，不清理或stage它们。
