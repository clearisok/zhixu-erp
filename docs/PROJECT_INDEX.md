# 项目知识索引

2026-10-24；实际main e01a11952b648024c0bd6bf4259de429374981e2，#123已获准合并，#121/#122随祖先自动收口、原分支保留。当前优先：[G6C当前执行](tasks/active/server-production-execution-current-2026-10-24.md)、[G6B当前排单](tasks/active/server-production-planning-current-2026-10-24.md)、[G6A当前生产资源](tasks/active/server-production-resources-current-2026-10-24.md)、[G5当前创建报价](tasks/active/order-context-quote-current-2026-10-24.md)、[Gate4B当前展示](tasks/active/order-source-disclosure-current-2026-10-24.md)、[Gate4A当前读取链](tasks/active/order-source-readchain-current-2026-10-24.md)、[导航前向整合](tasks/active/server-navigation-main-forward-2026-10-24.md)、[PR125前向](tasks/active/pr125-main-forward-2026-10-23.md)、[交付诊断](tasks/active/git-delivery-diagnostics-main-2026-10-24.md)。先读CURRENT_STATE与AI_HANDOFF恢复精确状态。

原Gate3仅本地向当前基线前移；237/46旧证据完整，38定向、66现行UI、双构建/产物、134发布及0db精确守卫已PASS。后续[当前Quote验收前移](tasks/active/quote-server-current-acceptance-2026-10-24.md)仅维护三个测试/驱动；2bd8在同ca53前端实际87/87 PASS，导出/设置缺口已补，旧失败日志保留；不据此宣称全量Server闭环。[加工Estimate API保护](tasks/active/processing-estimate-current-2026-10-24.md)已按原8ce窄切片本地前移，edf6的28单元/API、类型/Node/lint PASS；最终精确main守卫另记，不声称全Goal完成。Gate4A c77的103单元/API与类型/Node/lint已本地PASS。当前Gate4B 6ef的新双构建/产物、before2/after9/P6来源20、811根非发布/9API及类型/Node/lint PASS；冻结6d53新证据，旧237/46保留，新增到247/47。只读展示不等于4C编辑、真实来源激活或用户接受，fdad发布134/134也已PASS，与97文件811联合覆盖标准根945项；最终精确main守卫另记。不新增累计PR或付费CI。#125于07:01Z经新批准API快进至精确4f草稿；4f远端exact与actual push exit1/STOP并存，精确API快进例外已于07:01Z按新答复完成。其余不自动merge/close、部署、账号/业务库操作、Source读取或旧入口替换。

G5当前源码68a：创建/引用68、根非发布811、before2/after9、原Quote/P6/来源107与类型/Node/lint/双构建产物全部PASS；[新冻结证明](tasks/completed/2026-10-24-order-context-quote-engineering.md)为53c9。清单前向258/48，原247/47不变；61e上发布134/134已PASS，与68a根811联合99文件945；最终精确守卫回执单列，不重复811或用旧54/aaf结果替代。只创建参考，不自动采用商业依据或写SO/CCT；未合并/部署/人工接受。

G6A当前从干净530只前移原d717四资源25路径（全部输入blob已核相同）。实际f441类型/Node/import/lint、73API、根811、before2/after14/导航18及双构建产物PASS，proof d69f冻结8图/2geometry。容量P2红24/4→工作绿28/28→冻结73绿；不扩大1MiB或重写0034。清单269/49保留旧对象，三条既有路由按D147接通；0d22886a1fc35eea0dbebfaabb315b3967f45440发布134/134 PASS（312533ms），与f441根811分阶段联合945；最终精确守卫另记，不借旧d717结果。新范围不含生产排单/完成/物流或目标升级。

## 系统简介

并行订单 C4.3 DeliveryPlan Server 领域/API 已实现并 disposable PG87/87 验证；规则 D-083/D-100、0009 集合所有权/CAS、稳定行与 drift 见 [独立交付报告](tasks/completed/2026-10-09-order-c43-delivery-plan.md)。未真实激活、未接计划 UI，不增加 D-098 报价上线前置。

织序（ZHIXU）是一个服装工厂业务系统仓库。当前工作树同时包含：

- 根路径 ERP：报价、订单、排单、用户和审计功能，使用 PostgreSQL 持久化，并由数据库函数提供 API。
- Quote Center 路径：默认 Browser mock 持久化；显式 Server 模式的正式报价/资料 UI 使用可信 Node `/api/v1` 与 PostgreSQL，已有报价工作流/附件/导出/日志。旧实际运行态与最新工程能力分开记录，与 legacy `/api/quotes` 隔离。
- Server Persistence 路径：Node/TypeScript、forward-only PostgreSQL migration、可信 Auth/RBAC/OperationLog。旧环境的 511 单 bootstrap 与后续只读 Order 接线属于历史证据；新系统 D-096 从空开始，不导入旧订单；D105/106允许受控来源与显式首次绑定；D112受控新增已在#107合并，但不自动接纳或真实激活。报价之外模块不因试用候选而自动 production-ready。

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
| `features/permissions/` | User / Role / Permission、默认Browser mock与显式Server session账号管理，复用用户权限页面 |
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

## 当前宁波方案

[宁波上线方案](ops/ningbo-rollout-plan.md)已按D105重排；[原现场快照](tasks/completed/2026-10-12-ningbo-readonly-preflight.md)仍只证明其原观察时刻。PR98修订不部署、不重查真实DB。

## 当前来源任务

[Server Source](features/AINUOKE_SERVER_SOURCE.md)：默认关闭的服务端快照/固定采集CLI，按已有正式订单读取四流。用户要求持续展示后才上线Ubuntu；D106首次绑定/调度/原P6接线已在PR100合并、合成体验获用户接受。D109已批准HTTP且认证成功；D110有真实完整可见合同发现及80物料抽样。目标三行单位/身份获人工确认、QtyUnit工程已合并；全量颜色/物料规模、数量未知原因及持续运行/部署仍待Gate。

[准备在合同后的采用](features/ORDER_PREPARATION_ADOPTION.md)已补后台与现有Foundation新入口，[页面阶段](tasks/active/order-preparation-adoption-ui.md)精确证据待收口；加工标签必须核实合法批次，不回填历史类型。

[独立复核后台工作区](features/ORDER_NORMALIZATION_REVIEW.md)已本地完成，[岗位UI与默认执行关闭原因](tasks/active/order-normalization-review-ui.md)已精确合成验证/截图及24项门禁收口，完整G4/远端交付继续；不表示真实归一获授权。

Gate4本地有效归属/消费者、受控执行及SQL防绕过恢复入口：[有效归属任务](tasks/active/order-effective-attribution.md)与[执行边界](tasks/active/order-normalization-controlled-execution.md)；[新命令暂停与回退](features/ORDER_COMMAND_CONTROL.md)已本地演练；[历史Source只读查询](features/ORDER_SOURCE_HISTORY.md)已本地实现；[历史UI原身份接线](tasks/active/order-source-history-ui.md)已本地验收；独立复核/完整G4、真实覆盖/授权及远端交付仍待。

Gate4本地只读归一/案件恢复入口：[归一模块](features/ORDER_NORMALIZATION.md)及[Gate4任务](tasks/active/order-normalization-preview.md)。归一执行及真实操作尚未授权。

Gate3本地加工批次实现恢复入口：[加工下单批次](features/PROCESSING_ORDER_BATCHES.md)。未合并/部署，剩余验收见对应阶段任务。

## 模块导航

| 要修改的模块 | 先读文档 | 主要代码/事实源 |
| --- | --- | --- |
| 根路径 ERP、登录、报价/订单/排单 | `features/LEGACY_ERP.md` | `app/page.tsx`、`database/001_schema.sql`、根目录 `docker-serve.sh` |
| Quote Intake / 手机款式收集（计划，NOT IMPLEMENTED） | `features/QUOTE_INTAKE.md`、`tasks/active/quote-intake-v1-implementation-contract.md` | 计划独立 `server/quote-intakes/` / `features/quote-intake/`，现有 Quote writer 复用 |
| Quote Center | `features/QUOTE_CENTER.md` | `app/quote-center/`、`features/quote-center/` |
| Quote production、Server migration 与 progressive rollout | `features/QUOTE_PRODUCTION.md`、`features/QUOTE_CUTOVER_READINESS.md`、`features/QUOTE_MIGRATION_RUNBOOK.md`、`features/QUOTE_MASTER_SETTINGS_ACTIVATION.md`、`features/Q3B2I_CUTOVER_RUNBOOK.md`、`features/QUOTE_CENTER.md`、`features/DATA_LIFECYCLE.md`、`features/ATTACHMENTS.md`、`features/SERVER_PERSISTENCE.md`、`features/PERMISSIONS.md` | Route B、Server foundation、Q2B2C Quote aggregate cutover dependency map、Q5-A/B historical Quote preview/guarded operational boundary，以及 Q3B2I-C2 已完成的 master/settings Server authority；C0/C1 runbook 为历史执行证据，实现事实仍以 Quote/Server/master/attachment 代码和测试为准 |
| 新订单中心、报价转订单、翻单、交期、订单价格历史与 PostgreSQL SalesOrder foundation/bootstrap/shadow read | `features/ORDER_CENTER.md`、`features/SALES_ORDER_PERSISTENCE.md`、`features/SALES_ORDER_BOOTSTRAP_PREVIEW.md`、`features/SALES_ORDER_BROWSER_CUTOVER.md`、`features/AINUOKE_GARMENT_COLOR_SIZE_SOURCE.md`、`features/SERVER_PERSISTENCE.md`、`features/OPERATIONS_FOUNDATION.md`、`features/DATA_LIFECYCLE.md` | Browser runtime：`app/order-center/`、`features/order-center/`；server foundation/read：`server/sales-orders/`、`features/order-center/server/`、`features/ainuoke-sync/service/sales-order-final-bootstrap-preview.ts`、`features/ainuoke-sync/source/ainuoke-garment-color-size-adapter.ts`、`database/migrations/0002_sales_order_foundation.sql`、`0003_sales_order_number_sequence.sql` |
| 生产队列、排单中心、物料运输、订单预警与交期风险 | `features/SERVER_PRODUCTION_EXECUTION.md`、`features/SERVER_PRODUCTION_PLANNING.md`、`features/PRODUCTION_SCHEDULING.md`、`features/ORDER_CENTER.md`、`features/OPERATIONS_FOUNDATION.md`、`features/PERMISSIONS.md` | `app/production-scheduling/`、`features/production-scheduling/`、`tests/production-scheduling.test.mjs` |
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

历史共享CI输入见[PR123原摘要](tasks/completed/2026-10-23-pr123-ci-context-inputs/)与[PR125原摘要](tasks/completed/2026-10-23-pr125-ci-context-inputs/)；旧be9日期/结果仍仅属于其原阶段，当前比较锚点为上述e01a。

2026-10-24 07:01Z：单独获准的#125 expected-CA/force=false→4f API已执行一次，独立API核SHA/tree/双父。GitHub临时PR合并预览dd5700的父为当前main e01a及4f，代码树等于已验收4f；未合并main。Source40072506615、Team40072506633、Baseline40072506617均success、pull_request、attempt1，仅自动各一次，无rerun/dispatch；#125说明已更新且仍open draft，不借旧CI。G6A新源码尚未远端交付；没有扩大新push/其他PR/部署/真实数据许可。回执outputs/pr125-api-lease-20261024。

G6A最终6fd/main守卫PASS79777ms/clean，0d发布134/134；仅1次正常push后独立API核6fd/tree/父，Actions=0，无新累计PR。G6B已由受保护输入/50路径预核完成受控前移，并有独立cd737冻结QA；详见下段，不借旧结果。旧#125/工具STOP历史与各阶段source事实不混用。

G6B产品已按原919受控前移，49输入一致/1资源容量三方保留；新增完整Server排单契约/D150、12路径V1和两个CI兼容用例。实际快照P2红32/2→工作态资源+排单52/52绿（22679ms），不是冻结QA。下一步新源码冻结/本机验收，269/49及新路由/文档绑定待后续证明，不借旧919或#125绿灯。

G6B源码cd73726babfaa86ffef671cbbe3a37fd542dace6实际268相关API/升级、根811、类型/Node/import/lint、before2/after17/资源14/导航18/登录11/P6 14及双构建/产物全部PASS；[新证明](tasks/completed/2026-10-24-production-planning-current-engineering.md)冻结17图/2geometry，11图主控查看。COMMIT未知恢复文档P2已修，仅docs变化。proof692774已冻结、清单前向292/50，原269/49/runtime完整；51a366244c822bb4dc157201a9d5bb133ab11f11发布134/134 PASS（319203ms），与C根811联合945；最终精确main守卫及远端按终态回执核定，不预写PASS，Actions0。

G6B最终b6af/main守卫PASS78047ms（11/50/47/errors[]），51a发布134/134；唯一上传uncertain_transport、工具+独立API确认TARGET_NOT_DELIVERED，保留NETWORK_DEGRADED，不借本地PASS冒称远端。G6C从核实main新建后FF到干净b6af，仅30路径只读预核（28输入一致/2保留修复），尚无产品/新QA；见当前任务。原完整输入三摘要/hash受保护，Goal active。

G6C当前30路径已受控前移，28输入一致/2三方，driver真冲突在0写入停后明确保留新旧保护；snapshot PG容量保护未改。单一[执行契约](features/SERVER_PRODUCTION_EXECUTION.md)/D151、8路径V1与单条CI增量已同步。尚待新源码冻结QA，292/50原清单及旧图不改；Git仍degraded不重推。

G6C当前9c2f5bc536f9e5023a32b2e93cfd292984f00abe实际313相关API/升级、根811、before2/after28/导航18及类型/Node/import/lint/双构建全部PASS；[新证明](tasks/completed/2026-10-24-production-execution-current-engineering.md)冻结23图/2JSON，11张已查看。未改资源/登录/P6不重复，不借旧C或27b结果。proof6184及D151/新feature/能力已前向绑定320/51，原292/50/runtime/21路由保持；35f659cea3d0ec0944ba1e6ef8971efa16c0949b发布134/134 PASS（340872ms），与9c2根811分阶段联合945；最终main守卫另按终态核定，Gitdegraded不重推，Actions0。

2026-10-24 G6C最终cab72/main守卫实际PASS87550ms（11/51/50/errors[]），35f发布134/134；完整回执已保护于[下一阶段输入](tasks/completed/2026-10-24-logistics-resources-input-state/)。当前进入[G6D物流资料](tasks/active/server-logistics-resources-current-2026-10-24.md)，只读预核23路径19相同/4差异，尚未写产品/新QA；网络degraded不重推/CI，Goal active。

G6D [Server物流资料契约](features/SERVER_LOGISTICS_RESOURCES.md)：同一资源命令扩展hubs/transport-plans及0037，现行4处冲突已明确保留容量/CAS/owned清理；后续按新冻结source验收，不借原e223结果。

G6D当前07d实际356相关API/升级、根811、43浏览器、类型NodeLint和双build/产物全部PASS；[proof1b8](tasks/completed/2026-10-24-logistics-resources-current-engineering.md)冻结14PNG/2JSON，7张已查看。清单338/52前向保留320旧证据/51能力/runtime/21路由；发布134和最终精确守卫另记，不预写PASS或借旧e223。Git仍degraded不重推/CI。

64f03a8ad54633a32d1ea17ccaa1d439339d0f9e发布134/134实际PASS（356242ms），0fail/cancel/skip；与07d根811分阶段联合99文件945，不是一轮单次执行。64f之后只有当前状态文档增量，产品/测试/清单/proof/截图不改，最终clean精确main守卫仍以随后实际回执核定。

G6D最终4f3/main守卫实际PASS96017ms，64f发布134/134，独立最终review无P1/P2，clean；完整回执已保护于[后续输入](tasks/completed/2026-10-24-order-tracking-input-state/)。当前[订单物流上下文](tasks/active/server-order-tracking-current-2026-10-24.md)14路径预核13同/1差异，尚无新产品/QA；网络degraded不重推/CI。

[Server订单物流上下文](features/SERVER_ORDER_LOGISTICS_CONTEXT.md)为D054/D147后台独立切片：0038、同一production命令/权限与原物理SO、明确仓/备注/历史，不是物料日期或页面闭环。当前任务server-order-tracking-current-2026-10-24，原ffef结果不借作新证据。

订单物流上下文当前source 45f30070abeb1d70211eb10eab7841be10e8f894实际36文件379相关API/升级（213201ms）、97根811（26879ms）、类型36595/Node20091/import2377/lint54513ms全PASS，0fail/cancel/skip；proof f676b85dd644ffb6ab1877b414e6bb05223671fe冻结精确证据，SQL/审计提交前回滚和COMMIT未知须核对的文档边界已收窄。清单340/53前向保留原338/52/runtime/21routes；本轮无前端/新截图/新Vite构建或浏览器PASS声明，未变07d产物及43UI仅作用域复用。发布134/精确守卫后续实跑，不借原ffef。

fd36ef1dacb9b08fc57539ab7cf02c9eadb4e711发布134/134实际PASS（352688ms），0fail/cancel/skip；与45f根811分阶段联合99文件945，不是一轮执行。metadata以后只有4份状态文档，产品/测试/proof/清单不变，最终clean精确main守卫以随后实际回执核定。

0038后台最终4a/main守卫实际PASS85215ms、fd36发布134/134，独立终审无P1/P2，完整输入已保护于[对话框前置](tasks/completed/2026-10-24-order-logistics-dialog-input-state/)。当前[物料与运输对话框](tasks/active/server-order-logistics-dialog-current-2026-10-24.md)11路径只读预核9同/2差异，尚无本轮新产品/QA，网络degraded不重推/CI。

[Server订单物流对话框](features/SERVER_ORDER_LOGISTICS_DIALOG.md)为当前0038后台的独立UI接线，8路径V1、原请求/身份owner/历史和未保存保护；逐物料到仓/运输建议尚待0039，不宣称完整物流闭环。

当前订单物流对话框 source e2cf 实际386相关API/升级、根811、before2/after37/资源23/导航18、类型NodeLint/双构建及产物PASS；[新proof](tasks/completed/2026-10-24-order-logistics-dialog-current-engineering.md)冻结17PNG/2JSON、42几何、查看8图。清单361/54前向保留旧340/53/runtime/21路由，发布134及最后守卫后续另核，不借旧2a0或#125CI。

7f0d4c77f05a0afb12ae36fb0fc71ea51119785c上发布134/134实际PASS（381564ms），0fail/cancel/skip；与e2cf根811分阶段联合945。product/API/根未改，after由2c286f测试等待修复驱动，原34/2失败保留；不把范围复用称新全量。metadata后仅本次四状态文档，proof/产品/测试/清单保持；最终clean精确main守卫以随后实际回执核定。

订单物流UI83a最终守卫实际PASS96789ms，7f0d发布134/134、独立终审P2关闭；完整输入保护于[后续前置](tasks/completed/2026-10-24-material-arrivals-input-state/)。当前[人工预计到仓后台](tasks/active/server-material-arrivals-current-2026-10-24.md)22路径只读预核20代码同/2文档配置差异，尚无产品/新QA；网络degraded不重推/CI。

[当前人工预计到仓后台契约](features/SERVER_MATERIAL_ARRIVALS.md)复用已有Source快照事务和D054 Hub，0039不生成来源日期或实际事件；工程结果按当前任务新source核定。

当前人工预计到仓后台c994实际217/218相关检查（1既有Linux CLI在Windows平台SKIP，0fail/cancel，不称PASS）、根811/类型NodeLoadLint通过；[新proof](tasks/completed/2026-10-24-material-arrivals-current-engineering.md)冻结容量真实红绿与7326正控，清单363/55前向保留旧361/54/runtime/21routes。无新UI/Vite/截图；该条初始记录时发布/守卫待跑，实际终态见后续557ce记录。

发布测试实际终态：49aa9b16111ad972ab7e8228bfc73ce1875a47ea上134/134 PASS（372749ms），0fail/cancel/skip；与c994根811分阶段联合945。相关API仍明确218总数/217通过/1既有Linux CLI平台SKIP，不借134覆盖该缺口。metadata后只更新本次四状态文档，proof/feature/产品/测试/清单未变；最终clean精确main守卫以随后本机回执核定，未合并/部署/真实采集/新UI或人工接受。

前阶段后台最终557ce对main守卫实际PASS93213ms（11/55/54/errors[]），49aa发布134/134（372749ms）；c994相关218项217通过/1既有Windows跳过、根811、类型NodeLoadLint通过，proof761267，清单363/55，独立终审无P1/P2。Linux CLI缺口不称PASS；原Source/SQL/UI与历史失败证据完整。当前[分批到料界面任务](tasks/active/server-material-arrival-ui-current-2026-10-24.md)从clean557ce继续，15路径预核14相同/package手工，尚无新UI/QA；完整输入保护于[前置](tasks/completed/2026-10-24-material-arrival-ui-input-state/)。

当前[物料分批UI工程证明](tasks/completed/2026-10-24-material-arrival-ui-current-engineering.md)：a0c3实际97/811/类型NodeLint/双构建、before3/abf3 after17/物料10/导航18 PASS，18PNG/3JSON及8图查看；清单386/56。原363/55/runtime/21routes保持，发布134与最终守卫尚待，不借旧f287或#125 CI。

[当前UI契约](features/SERVER_MATERIAL_ARRIVAL_UI.md)使用独立文档根，后台761原字节保留；f7元数据候选已归档，18PNG审批补引用但不改图/hash。清单387/56，旧363/55/runtime/21routes保持，产品/QA未变，修正后发布与最终守卫仍待。

修正后发布实际终态：9d5da934caecc37d1d8089e05307bd18d0527ad6上134/134 PASS（400362ms），0fail/cancel/skip；与a0c3根811分阶段联合945。f7候选134/134的398161ms仍独立保留，不替代本次修正清单结果。metadata后仅4状态文档，产品a0c3/driver abf3/证明e2a/新UI契约eb2/图片/清单保持；最终clean精确main守卫随后以本机回执核定。旧Source Linux CLI平台缺口仍独立未验证，不称Goal完成/合并/部署/人工接受。

前阶段分批到料UI最终5f/main守卫PASS103116ms（11/56/64/errors[]），9d修正发布134/134（400362ms），产品a0c3相关97/根811、driver abf3及before3/after17/物料10/导航18共48浏览器、类型NodeLint/双构建PASS；清单387/56、proof e2a，独立终审无新增P1/P2。旧Linux CLI平台缺口独立保留，945为分阶段联合，不借#125三CI。当前[0040观察后台](tasks/active/server-garment-observations-current-2026-10-24.md)从clean5f继续，预核16路径13同/3手工，原完整输入保护于[前置](tasks/completed/2026-10-24-garment-observations-input-state/)。尚无新产品/QA，网络degraded不重推。

[Server成衣出货观察](features/SERVER_GARMENT_SHIPMENT_OBSERVATIONS.md)当前仅0040后台受控前移，默认关闭、Num/outdate/稳定颜色/不可变快照与DB-only读取；当前新验收未跑，不借旧b652或#125 CI。

当前0040 source d1930实际173/174相关API（1既有Linux CLI Windows跳过，不称PASS）、根811/Python139/类型NodeLint通过；[proof696](tasks/completed/2026-10-24-garment-observations-current-engineering.md)冻结口径/范围，清单390/57保留原387/56/runtime/21routes。0039非空Source升级不冒称人工计划非空恢复；无新UI/Vite/截图，发布134及最终守卫另按后置回执。

发布测试实际终态：4e8232007f5d06a6a09def3baee20cd8143a85de上134/134 PASS（406504ms），0fail/cancel/skip；与d1930根811分阶段联合945，不是一轮执行。当前API174总/173通过/1既有Linux CLI Windows跳过仍独立未验证，不借发布覆盖。metadata后仅本次4状态文档，产品/测试/proof/feature/决策/清单不变；最终clean精确main守卫随后以实际回执核定，不称Hosted CI/合并/部署/真实来源或人工接受。

前阶段0040最终aad/main守卫PASS96831ms（11/57/64/errors[]），4e发布134/134（406504ms）；产品d1930相关174总/173通过/1既有Linux CLI Windows跳过、根811/Python139/类型NodeLint通过，proof696，清单390/57。旧Linux缺口不称PASS，无新Vite/browser；独立终审无新增P1/P2，不借#125 CI。当前[0041离线刷新](tasks/active/server-bound-refresh-current-2026-10-24.md)从clean aad继续，12路径8同/4手工预核；完整输入保护于[前置](tasks/completed/2026-10-24-bound-refresh-input-state/)。尚无新产品/QA，网络degraded不重推。

[已绑定合同离线刷新](tasks/active/server-bound-refresh-current-2026-10-24.md)当前0041受控前移，12路径8同/4手工，不创建SO/Source请求/自动绑定；沿[订单持久化](features/SALES_ORDER_PERSISTENCE.md)同一事务与明确原owner，当前新验收待跑。

当前0041 df5bed [proof da5b](tasks/completed/2026-10-24-bound-refresh-current-engineering.md)：API联合184/185（1既有平台跳过；初182/2失败/1skip及Git归档前置诊断保留，affected16根工作树补跑全过），根811/类型NodeLint PASS。清单393/58保留旧390/57/runtime/21routes；Python139/UI215只复用，无新Vite/browser，发布134和最终守卫另核。

发布测试实际终态：4cc15c9c7b07d12ca50fa5e61f7007436bfac64c上134/134 PASS（412214ms），0fail/cancel/skip；与df5bed根811分阶段联合945，不是一轮。API联合184/185仍含1既有Linux CLI Windows跳过；初185的182pass/2fail与受影响16补跑均保留，不借发布改写旧失败或填补平台缺口。metadata后仅4状态文档，产品/测试/proof/两feature/清单不变；最后clean精确main守卫由随后实际回执核定，不称Hosted CI/合并/部署/真实来源或人工接受。

前阶段0041最终b97/main守卫PASS98302ms（11/58/64/errors[]），4cc发布134/134（412214ms），source df5bed、proof da5b；清单393/58。API分阶段联合184/185、1既有Linux CLI Windows跳过，初185的182pass/2fail/1skip及16补跑保持；根811/类型NodeLint通过，139Python/215静态产物仅复用。独立终审无新增P1/P2，不冒称单轮185全绿、Linux通过或Hosted CI。当前[成衣只读UI](tasks/active/server-garment-read-ui-current-2026-10-24.md)从clean b97继续，15路径11同/1已应用/3手工预核；完整前阶段输入保护[前置](tasks/completed/2026-10-24-garment-read-ui-input-state/)。尚无新UI/QA，旧后台696冻结文档不改。

[Server成衣只读UI](features/SERVER_GARMENT_SHIPMENT_UI.md)当前在原订单详情接线，后台696原文冻结保持；新source/driver/六宽浏览器证据待跑，不借旧UI结果。

当前成衣只读UI source922 [proof c710](tasks/completed/2026-10-24-garment-read-ui-current-engineering.md)：实际102相关/811根/类型NodeLint/双build产物、before3/after14/物料10/导航18共45浏览器PASS，23PNG/3JSON、9图查看；lint旧产物误扫原失败及仅lint补跑保留。清单421/59保留旧393/58/runtime/21routes；发布134和最终守卫另核，不借旧4066或#125CI。

发布测试实际终态：1ae89745c148e03272e7e8f17bc3b1475010650d上134/134 PASS（432059ms），0fail/cancel/skip；与922488根811分阶段联合945，不是一轮执行。当前102相关检查和45浏览器均在922488本轮运行；lint首败/仅lint补跑保留，旧Linux CLI平台缺口及139Python范围复用不冒称填补。metadata后仅本次4状态文档，产品/测试/proof/新UIfeature/清单/图片保持；最后clean精确main守卫随后按实际回执核定，不称Hosted CI/合并/部署/真实来源或人工接受。

首次最终精确守卫178ee3/main实际FAIL（108416ms），唯一UI_CHANGE_PAGE：本轮V1清单误写order，真实登记ID为order-detail。现仅修正该ID及本状态说明，产品922/proofc710/新UI契约/421清单/图片/守卫实现和测试均未变；原FAIL完整保留outputs/server-garment-read-ui-current-20261024/initial-final-guard-result.json及log。134在1ae的432059ms PASS仅按未变工具/fixture范围复用，不冒称修正后重跑；只重新运行对新最终提交的精确main守卫覆盖该注册修复，结果后置，不预写PASS。

前阶段成衣只读UI最终9a/main守卫PASS102122ms（11/59/68/errors[]），1ae发布134/134（432059ms），source922488、proofc710；清单421/59。102相关API/811根/45浏览器/类型NodeLint/双build全部本轮通过；lint原误扫失败+仅lint补跑、初178守卫唯一页面ID错误及9a修正保留，134仅按未变工具/fixture复用不称9a重跑。23PNG/3JSON、9图查看；独立终审无新增P1/P2。旧Linux CLI缺口/Python139复用独立，不冒称Hosted CI或人工接受。当前[0042可靠请求后台](tasks/active/server-delivery-plan-requests-current-2026-10-24.md)从clean9a继续，13路径10同/1已存在/2手工预核；完整输入保护[前置](tasks/completed/2026-10-24-delivery-plan-requests-input-state/)。尚无新产品/QA；只读UI和da5b冻结契约保持。

[Server交期可靠请求](features/SERVER_DELIVERY_PLAN_REQUESTS.md)为D154后台，原PATCH/业务所有权保持，独立actor回执与只读核对；当前source/QA后续冻结，不引UI或0043。

当前0042 source62693 [proof3e869](tasks/completed/2026-10-24-delivery-plan-requests-current-engineering.md)：16文件两组185/185、根811/类型NodeLint PASS；215前端产物和Python仅范围复用。清单424/60保留421/59/runtime/21routes，本地无PR Gate不重复未变134工具回归，不称本轮134通过；最终累计PR前两命令仍须重跑，新精确守卫后置。

前阶段0042最终c70aa15b/main守卫PASS104753ms（11/60/68/errors[]），source62693、proof3e869，清单424/60。16文件两组185/185、根811/类型NodeLint PASS；无新Vite/browser/Python，215产物hash同922，139Python仅旧范围。1ae134工具回归仅范围复用，不称本Gate134新PASS/所有输入未变/完整945；最终累计PR交付前两命令仍必须重新跑。独立终审无新增P1/P2，无新CI/远端/真实环境操作。当前[交期维护UI](tasks/active/server-delivery-plan-ui-current-2026-10-24.md)从clean c70继续，17路径16同/1手工预核；[原V2批准](tasks/completed/2026-10-22-delivery-plan-maintenance-ui-approval.md)原字节和HTMLhash已核。完整输入保护[前置](tasks/completed/2026-10-24-delivery-plan-ui-input-state/)。当前仅prep无新产品/QA，不借旧2a。
