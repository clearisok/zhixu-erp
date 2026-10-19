# Live demo readiness 前的状态文档快照

归档日期：2026-10-13；来源main：064e3afaf7d08b3cb62907d4402f97d9c292f1e5。以下为该提交的原文，含旧PR状态，不是当前状态。更新时机：历史快照不原地更新；实际工程以GitHub/代码和当前摘要为准。原文用代码块保留，避免历史相对链接被误当当前位置的有效链接。

## 原文：docs/CURRENT_STATE.md

[原提交文件](https://github.com/clearisok/zhixu-erp/blob/064e3afaf7d08b3cb62907d4402f97d9c292f1e5/docs/CURRENT_STATE.md)

````````markdown
# 当前状态

2026-10-13 / GitHub main `957fe1a6eedfd6a92020ef2cf82d710a4162cda0`：PR #106 QtyUnit 已按用户授权合并，三项精确 head CI 成功；真实 Source 仍未激活。D-112 在独立 `feat/ainuoke-controlled-contract-intake` 工程分支实现完整 Discovery 差异、显式选择新合同、只读预览、重取确认、同事务创建/审计与精确重试；此分支尚未合并，未操作真实账号、DB 或宁波环境。本机已通过 817 项 root 测试、71 项发布基线回归、Python 25 项、合成 PostgreSQL 定向验证、typecheck、lint、Server/UI build，最终 PR CI 待远端运行。[工程边界与测试](tasks/active/ainuoke-controlled-new-contracts.md)。宁波上线仍缺真实持续四流、受控新增合同业务验收、隔离候选/备份回退与人工批准。下文旧 SHA、PR 状态与样本数字仅作历史快照。

核实2026-10-13；GitHub main：8b3f3d811d05182ea1a7f3214eae9d530056fa04（PR103已按用户授权合并）。GitHub是实时事实源；随main/PR/测试/探测/验收/环境变化更新。

- D109原艾诺科HTTP长期接受及私密首页probe已合并；PR103精确head1de3078三项CI成功，无行级审查问题。此前source的Chrome启动超时、同提交重跑通过记录保留。
- D110当前分支feat/ainuoke-readonly-validation，PR104开放未合并；只读工具、测试及证据。[任务](tasks/active/ainuoke-readonly-validation.md)。
- PR104仍开放未合并。其精确head派生的独立诊断分支已有草稿PR105；用户在普通PowerShell成功完成一次定向只读采集，私有报告已与三行截图对照。[脱敏真实证据](tasks/active/evidence/ainuoke-targeted-diagnostic/real-results.md)。一遍558合同/12页Discovery仅为身份定位，三个指定合同完整物料18次固定报表请求；目标采购单四来源行归并三采购事件，118/356/6均找到对应字段。人工业务确认0/3、API单位映射0/3，unknown保持未知。曾因Set-Acl权限失败的包装已改成只读核对预受限ACL，普通终端重试成功；最终PR精确head CI需随本次证据提交复核。
- 本机新受保护报告已出现6087050原始QtyUnit候选：目标采购四来源行均为“个”，三物料身份/数量及356归并事件与旧报告一致；来源行身份随字段增加变化。[脱敏复核](tasks/active/evidence/ainuoke-targeted-diagnostic/qtyunit-followup-2026-10-13.md)。报告仍标记单位语义及人工业务验收未确认；IT/业务方须确认QtyUnit与TotalNum、cgnum及四流口径的关系，未实施正式映射。
- 用户真实执行回执已与本机私有文件核对：558个可见合同两遍完整且一致；抽查80合同完整物料分页，1空/0无效；采购79、其余三流各75个合同有合格样例，四流共享R01–R03三个代表合同。[真实结果](tasks/active/evidence/ainuoke-readonly-validation/real-validation-results.md)。不是558合同物料全量或全公司权限证明。
- 62合同有数量未知；四流未知需求项184/250/341/258，不能相加为独立问题数。单位未映射；旧80合同报告缺物料维度/原始字段；新三合同诊断能分类少量观察，但仍不能确定62合同总体根因或完成逐物料业务验收。既有unknown保护保持，不填零、不跨物料加总。全量6087105颜色仍未核对。
- 新诊断仅对指定三行及最多两个旧问题合同给出来源行级观察、归并事件和单位候选；即使真实运行，也不能直接推断62合同总体根因。任何单位映射/正式计算修改待来源字段与界面业务含义确认后另行PR。
- 现有UI、SQL、Source/orderRead默认开关与生产路由不变。未修改真实账号/业务DB，不部署宁波/18443/18444，未绑定或启动持续写入，新PR不自动合并。
- 工程head5d77355568913f96d91c2ff37541b1ee6a9c3adf：审计8/8、Python66/66、root810/810、类型/lint/server/build、本机基线71/71及守卫PASS；来源20/1skip、continuous29/1skip、readiness9/1skip。该head三CI成功，Ubuntu已补Linux分支；本次仅补真实证据/状态，最终CI以PR104精确head为准。
- D105持续展示后才上线宁波。当前草稿PR105提供只读数量/单位/逐物料诊断；其后仍需人工字段语义确认、真实规模/颜色核对与独立目标首绑方案；具体写入授权、持续运行及人工验收仍待。新增合同自动建单、主信息/颜色增量及完整分码UI未实现。宁波隔离、备份恢复、候选和上线授权仍独立Gate。
- 历史Quote扩展UI的8项失败及父测试失败未处理，不声明全项目全绿。旧冻结截图、现场观察与历史提交保留。

功能：[来源](features/AINUOKE_SERVER_SOURCE.md)；决策D105–110；[宁波方案](ops/ningbo-rollout-plan.md)。
````````

## 原文：docs/AI_HANDOFF.md

[原提交文件](https://github.com/clearisok/zhixu-erp/blob/064e3afaf7d08b3cb62907d4402f97d9c292f1e5/docs/AI_HANDOFF.md)

````````markdown
# AI handoff

2026-10-13 / 最新接力：用户授权合并 PR #106，GitHub main `957fe1a6eedfd6a92020ef2cf82d710a4162cda0`。独立工作树 `ainuoke-controlled-new-contracts`、分支 `feat/ainuoke-controlled-contract-intake` 从该精确提交开始，D-112 工程与本机验证已完成：root 817/817、发布基线 71/71、Python 25/25、持续来源 43 PASS / 1 Windows 跳过、typecheck/lint/Server/UI build 通过。精确重试现校验已存 Contract/Color Mirror，避免只凭审计收据误通过。只添加显式新合同，旧订单主信息/颜色不自动刷新；真实来源、业务 DB、宁波/18443/18444 均未操作。交付与合并前复审须以该分支唯一 PR 的精确远端 SHA 和 CI 结果核实，尤其 Linux CLI 全流程；本任务不自动合并。[任务](tasks/active/ainuoke-controlled-new-contracts.md)。下文为历史接力。


核实：2026-10-13；GitHub main 8b3f3d811d05182ea1a7f3214eae9d530056fa04。此工作树在 feat/ainuoke-targeted-diagnostics，草稿 PR #105 以开放 PR #104 head b43b78bee72a496219bd4872245ad28109f421c4 为 base。开始前重新核对 PR/head、git status 和当前代码；不要把聊天记录当事实源。

本轮范围只有定向只读诊断：一遍 6086103 精确销售合同号查当前 InsideOrderNo，最多三个指定合同完整 6087050。用户在普通 PowerShell 隐藏输入凭据，2026-10-13 回传成功。助手核对本机受限、Git 忽略的报告和仅三行的截图对照表；公开脱敏结果见 [真实证据](tasks/active/evidence/ainuoke-targeted-diagnostic/real-results.md)，执行边界见 [任务](tasks/active/ainuoke-targeted-diagnostic.md)。不要提交 outputs/ 的合同号、来源身份、物料或凭据。

目标三行 118/356/6 均找到对应名称、颜色、规格、采购单号、日期；356 两来源行归并同一采购事件，不能相加为 712。物料编码仅在私有 API 报告，截图未显示，仍待上游界面核对。三行无可信 API 单位，截图“个”不自动成为正式映射；人工业务确认 0/3，正式单位映射 0/3。62 合同未知数量的总体根因仍未知，投影保持 unknown/null。

后续受保护报告出现QtyUnit候选：目标采购四来源行均为“个”，原三物料身份/数量与归并事件不变，四来源行身份因新字段改变。该报告mtime 2026-10-13T03:24:45.2988793Z，来源语义仍未确认；不能据字段名改正式映射。公开脱敏证据见 [QtyUnit 复核](tasks/active/evidence/ainuoke-targeted-diagnostic/qtyunit-followup-2026-10-13.md)。本机后续私有请求已缩至目标单，若无证据缺口无需再要求用户重复读取。
首次普通终端运行在 Set-Acl 因缺 SeSecurityPrivilege 而于登录前失败；修复为只读检查受限 ACL 后真实重试成功。工程修复 head cef2e5653524bb65a80b8f9787e0ab937390d88b 已精确推送，手动 Source CI run 38339696861 全成功。此次真实证据文档提交后仍需按最终 head 复核 CI。PR #104/#105 不自动合并；未改正式计算、UI、真实账号/数据库、Source 激活或部署。

下一步：完成本次脱敏证据提交与最终 CI/PR #105 复审；用户在本机三行表核对物料编码/规格，确认界面“个”的业务含义。若 6087050 没有可信单位字段，另找受授权只读字段来源；只在字段身份与业务语义确认后另开最小映射 PR 和负向测试。真实绑定、持续采集、全量颜色/规模与宁波上线各需独立 Gate。
````````

## 原文：docs/PROJECT_INDEX.md

[原提交文件](https://github.com/clearisok/zhixu-erp/blob/064e3afaf7d08b3cb62907d4402f97d9c292f1e5/docs/PROJECT_INDEX.md)

````````markdown
# 项目知识索引

2026-10-13 / GitHub main `957fe1a6eedfd6a92020ef2cf82d710a4162cda0` 已合并 PR #104/#105/#106。D-112 受控新增合同在独立 `feat/ainuoke-controlled-contract-intake` 工程分支实施，仍未合并、未真实执行；恢复入口为[Server Source](features/AINUOKE_SERVER_SOURCE.md)、[D-112 工程任务](tasks/active/ainuoke-controlled-new-contracts.md)及 Active 决策。下文旧 SHA/PR 状态仅按历史时点阅读。


> 核实2026-10-13；main 8b3f3d811d05182ea1a7f3214eae9d530056fa04（PR103已合并）。当前PR104：[全合同只读核对](tasks/active/ainuoke-readonly-validation.md)；[真实结果](tasks/active/evidence/ainuoke-readonly-validation/real-validation-results.md)：558可见合同完整稳定、80物料抽样四流有代表；62合同数量存在未知，单位未核实。D109永久HTTP接受保持；持续Source未激活、人工业务验收未完成。GitHub是实时事实源；随main/来源/环境/验收变化更新。

> [基线门禁](features/RELEASE_BASELINE_GUARD.md)仍执行源码/冻结证据检查，不代替UI/DB/发布验收；[交付协议](tasks/active/git-delivery-resilience.md)保持。六角色管理基于可信session，未部署或激活Source。[少量订单定向诊断](tasks/active/ainuoke-targeted-diagnostic.md)是依赖 PR104 的草稿 PR105：合成与用户私密定向只读运行已完成，[脱敏真实证据](tasks/active/evidence/ainuoke-targeted-diagnostic/real-results.md)显示三行技术对照找到；[QtyUnit 后续复核](tasks/active/evidence/ainuoke-targeted-diagnostic/qtyunit-followup-2026-10-13.md)已见目标行候选“个”，人工身份/单位语义仍待确认。

## 系统简介

并行订单 C4.3 DeliveryPlan Server 领域/API 已实现并 disposable PG87/87 验证；规则 D-083/D-100、0009 集合所有权/CAS、稳定行与 drift 见 [独立交付报告](tasks/completed/2026-10-09-order-c43-delivery-plan.md)。未真实激活、未接计划 UI，不增加 D-098 报价上线前置。

织序（ZHIXU）是一个服装工厂业务系统仓库。当前工作树同时包含：

- 根路径 ERP：报价、订单、排单、用户和审计功能，使用 PostgreSQL 持久化，并由数据库函数提供 API。
- Quote Center 路径：默认 Browser mock 持久化；显式 Server 模式的正式报价/资料 UI 使用可信 Node `/api/v1` 与 PostgreSQL，已有报价工作流/附件/导出/日志。旧实际运行态与最新工程能力分开记录，与 legacy `/api/quotes` 隔离。
- Server Persistence 路径：Node/TypeScript、forward-only PostgreSQL migration、可信 Auth/RBAC/OperationLog。旧环境的 511 单 bootstrap 与后续只读 Order 接线属于历史证据；新系统 D-096 从空开始，不导入旧订单；D-105/106允许受控来源与显式首次绑定开发，不自动追加合同或真实激活。报价之外模块不因试用候选而自动 production-ready。

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

[Server Source](features/AINUOKE_SERVER_SOURCE.md)：默认关闭的服务端快照/固定采集CLI，按已有正式订单读取四流。用户要求持续展示后才上线Ubuntu；D106首次绑定/调度/原P6接线已在PR100合并、合成体验获用户接受。D109已批准HTTP且认证成功；D110有真实完整可见合同发现及80物料抽样。数量/单位/逐物料业务核对、全量颜色/规模、持续运行/部署仍待Gate。

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
````````

## 原文：docs/features/AINUOKE_SERVER_SOURCE.md

[原提交文件](https://github.com/clearisok/zhixu-erp/blob/064e3afaf7d08b3cb62907d4402f97d9c292f1e5/docs/features/AINUOKE_SERVER_SOURCE.md)

````````markdown
# 艾诺科 Server Source：首次订单绑定与持续物料展示
2026-10-13 / D-112 工程分支 `feat/ainuoke-controlled-contract-intake`：基于 main `957fe1a6eedfd6a92020ef2cf82d710a4162cda0` 增加受控新合同发现、显式最多 25 个 BillNo 预览与确认、事务内正式订单创建/审计、同一审查凭据精确重试。复用现有正式 mapper、绑定与来源模型；不自动接纳、不中断/改写既有订单，不刷新旧主信息或颜色；当前未合并、未真实执行、未部署。[工程与执行边界](../tasks/active/ainuoke-controlled-new-contracts.md)。下文旧 PR 状态按历史时点阅读。

2026-10-13 / D-111：固定 6087050 的 QtyUnit 在只读物料 Projection 按需求展示一致来源单位；旧快照缺单位仍未知，冲突停止该需求汇总。不改正式计算、数据库、Source 调度或部署。[单位证据](../tasks/active/evidence/ainuoke-targeted-diagnostic/qtyunit-confirmed-2026-10-13.md)。

D-112：用户要求首轮上线前受控接纳新增艾诺科合同。现有调度只刷新已绑定订单；新增合同 Discovery、预览、确认、幂等绑定和主信息/颜色策略须另行实现验收。#104/#105 已合并至 main 6abc4bebc59954b98a6e3f79f038f9574588390d，#106 未合并；无真实 Source 激活或部署。[合并记录](../tasks/active/evidence/ainuoke-targeted-diagnostic/pr105-merge-reconcile-2026-10-13.md)。

核实日期：2026-10-13；main 基线：8b3f3d811d05182ea1a7f3214eae9d530056fa04（PR103 HTTP扩展已合并；D110全合同只读audit在独立分支实施）。
GitHub/代码为实时事实源；本文件随来源契约、权限、命令、构建、调度、真实激活及验收变化更新。PR99阶段证据保留在原任务/冻结证据，本轮见[任务](../tasks/active/ainuoke-continuous-material-display.md)。

## 用户决定
D105：报价当前暂时OK；艾诺科采购、入库、物料出运和出库按正式订单持续展示后再上线宁波Ubuntu，不做独立库存台账。
D106：实现首次绑定、持续调度、现有页面接线；合成测试、PR与复审。保持D099/P6；不执行真实账号、数据库、来源激活或部署，不自动合并新PR。
D104：六角色同见已授权来源及采购价，织序售价/确认工价/成本继续D103。D110已完整发现当前账号可见558合同，但仍不证明上游全公司权限范围。

## 实现与边界
1. 既有正式 UUID/order_no、Source Link、Contract Mirror、6087105 Color Mirror 复用；不引入第二套订单/库存模型。
2. 首次绑定固定完整6086103 Discovery → 当前全部BillNo的6087105 → 再次Discovery。包含草拟/生效等所有可见状态，不按状态排除，不固定历史合同数。
3. 复用Final Bootstrap Preview mapper。颜色missing/invalid是enrichment状态，仍创建主订单且不猜颜色；未知Num不能转零，非法日历日期拒绝。6086997不再作正式颜色源；6087050不得生成订单。
4. --preview-bind只读来源和DB。--bind重新采集，必须匹配目标与reviewHash；事务内重新检查权限/来源/时效。reviewHash涵盖映射的客户、品牌、数量、日期和颜色元数据，忽略读取时间。
5. 一次事务创建完整订单集合及逐单/整批可信审计；中途任何失败全部回滚。编号序列可留gap，不能回收。无新migration，0001–0012不变。
6. 首次只接受空订单账本；重试必须有相同来源profile、首绑审计reviewHash和精确同一绑定集合/镜像。不能把已有旧订单、部分账本或同BillNo新sourceId冒充重试。当前没有新增合同的自动建单或订单镜像更新命令。
7. 采集使用PR99的固定6086103→6087050→6086103。已有绑定订单与当前InsideOrderNo解析，整代来源快照/日志/current pointer原子提交；失败保留历史并取消当前事实判定，过期不冒充零。
8. 调度显式启动，单次完成后等待；不并发追赶。默认建议间隔5分钟、退避上限30分钟，成功归零；错误凭据/账号变化/用户停用/权限撤销停止。每轮重验migration ledger但不应用migration。SIGTERM/SIGINT完成当前有界采集/发布后退出，等待阶段立即停止。
9. 原API启动绝不启动采集。GET只查持久快照，不读来源密码、不访问上游、不写业务表。页面每30秒及回到窗口时刷新GET，无重叠；按订单/当前用户/权限隔离响应、取消旧请求。故障时清掉已显示判定，不回退Browser。
10. 本轮修复发现的DATE偏移：订单/颜色日期在SQL读取时保持YYYY-MM-DD，避免东八区被toISOString减一天。没有改任何数据库日期。

## 凭据与命令
Linux操作端读取仓库外的普通文件，当前执行用户拥有、0600/0400；拒绝symlink、宽权限、非法UTF8/未知字段。D109另有本机不落盘的私密终端首页探测，Windows原Bridge Credential Manager不变。
必填字段：sourceKey、baseUrl、username、password、operatorUsername；已批准HTTP额外指定transportPolicy=user-approved-http-d109。实际绑定/采集操作人必须是已有active织序用户，具备ainuoke.view/order.view/style_progress.read/ainuoke.sync/style_progress.import；首绑额外ainuoke.bind。不自动授予权限或创建真实账号。

HTTPS origin、已核实安全通道的字面量loopback HTTP继续支持；D109长期允许原地址http://61.164.81.194:9043与显式policy的组合。其他公网HTTP拒绝；禁止重定向、ambient proxy，不关闭TLS。该例外仍是明文，不称为安全隧道。凭据经匿名stdin交给短命Python worker，不进入argv/env/DB/日志；上游登录协议含query参数，未来代理不得记录敏感query。
密码只在用户本机私下输入或未来受控Linux私密配置，不发聊天/GitHub。同一HTTP风险不再重复确认；未来绑定/持续写入/部署仍需具体执行授权。

以下仅是已实现命令说明，不是本轮真实执行授权：
~~~text
npm run source:ainuoke -- --check --config=/private/source.json
npm run source:ainuoke -- --preview-bind=<key> --expected-target=<check返回的完整指纹> --config=/private/source.json
npm run source:ainuoke -- --bind=<key> --expected-target=<完整指纹> --expected-preview=<reviewHash> --config=/private/source.json
npm run source:ainuoke -- --execute=<key> --expected-target=<完整指纹> --config=/private/source.json
npm run source:ainuoke -- --schedule=<key> --expected-target=<完整指纹> --config=/private/source.json --interval-ms=300000 --max-backoff-ms=1800000
~~~
镜像中使用node dist/server/server/ainuoke-source/cli.js。同一动作不接受重复/未知参数。--check不访问来源或写DB；preview会读取来源但不写DB。调度只更新快照，不重复首绑。
目标指纹包括实际DB名/用户/address/port、DSN host/port、sourceKey及来源origin/账号指纹。密码轮换可在同账号下私下更新；换账号/来源/操作人会停止，不能静默换源。

## 页面与发布开关
默认NEXT_PUBLIC_ZHIXU_ORDER_READ=disabled。仅显式snapshot候选启用：
- /order-center：既有Server列表。
- /order-center/server-detail?id=<UUID>：原P6 executionOnly详情、颜色与物料汇总。
- /order-center/style-progress/detail?orderId=<UUID>：既有只读Control Tower、四流和采购价。

Server材料路由即使缺orderId也不进入Browser组件。原导航位置/样式/断点/CSS保持；未接通款式总览/风险预警入口disabled。生产、关账、旧订单新增/编辑、Browser导入没有被放开。executionOnly不开放商业条款编辑；织序金额安全服务保持原权限。

必须同时Quote=server、masters=server、writer=writable、identity=session。构建元数据记录orderRead，生产启动校验build/runtime一致且来源reader=snapshot；源码中的serverRoutes是候选能力上界，实际边界与导航使用isEnabledServerRoute，默认关闭。
reader另需ZHIXU_AINUOKE_SOURCE_KEY、ZHIXU_AINUOKE_SOURCE_MAX_AGE_MS（1000–86400000）；建议30分钟过期。Dockerfile支持默认disabled的同名build arg；仅构建不等于部署。

## 合成演示与验收
~~~powershell
$env:NEXT_PUBLIC_ZHIXU_QUOTE_AUTHORITY='server'
$env:NEXT_PUBLIC_ZHIXU_MASTER_SETTINGS_AUTHORITY='server'
$env:NEXT_PUBLIC_ZHIXU_QUOTE_WRITER_MODE='writable'
$env:NEXT_PUBLIC_ZHIXU_IDENTITY_MODE='session'
$env:NEXT_PUBLIC_ZHIXU_ORDER_READ='snapshot'
npm run build
npm run demo:ainuoke-continuous
~~~
脚本忽略真实DATABASE_URL，自己创建随机名loopback/tmpfs PostgreSQL，合成六角色/首次绑定/快照；输出临时网址、合成账号和密码。每60秒生成下一轮合成快照，页面30秒读取。两小时自动关闭并删除仅本脚本创建的临时容器；Ctrl+C也清理。绝不连接真实艾诺科或18443/18444。演示密码仅用于这个临时本机账本。

自动验收：test:ainuoke-continuous（Preview/事务/权限/调度/实际Python/LinuxCLI/构建开关），test:ainuoke-continuous-ui（真实构建、真实session/PG、六角色、P6 1440/1280/390、自动刷新/故障/陈旧/恢复、禁止Browser写入）、既有来源/Python/订单/bootstrap/基础门禁。
截图为新路径的新工程证据；不是用户人工PASS。旧P6截图不覆盖。

## 上线仍需的Gate及已知限制
- 已批准HTTP认证成功，D110当前账号558合同两遍完整稳定，80合同物料抽样四流有代表。62合同数量存在未知，单位与逐物料/去重语义、全合同颜色、真实全规模速率仍未验明；不能将抽样升级为首绑/上线PASS。缺/异常颜色必须如实呈现；目前颜色汇总可见，完整分码UI仍未接线。
- **只持续刷新已绑定订单的四流。** 首绑后新增合同不会自动建单，已存在订单主信息/颜色不会自动改写。后续需独立增量绑定/来源镜像刷新设计与冲突/消失策略；真实验收不能把本轮当作全合同自动生命周期完成。
- 最大1000订单、每报表200页/50行、整次100000行及32MiB、worker600秒。真实采集超过边界要设计按范围代际发布/限速，不截断假成功。没有真实规模性能承诺。
- Snapshot保留历史，无自动清理；哈希防误改，不是抗DB管理员的签名账本。上游没有跨报告事务快照，前后Discovery一致不证明物料完全同时。
- 调度输出机器可读captured/retrying/stopped供未来运维监控；尚未安装systemd/容器restart、外部告警接收或凭据轮换服务。终止窗口应允许当前采集600秒+发布完成，不能配置几秒强杀后谎称优雅退出。
- 连续24小时、多次新增/变动四流、断网/重启恢复、至少各3张真实单核对为AI建议验收，未实际完成。未来需验证新增合同处理范围，不能把合成轮询当作24小时真实运行。
- 宁波独立DB/卷/对象归属、完整ledger、备份恢复、外网域名/Origin/TLS、候选镜像SHA与回退仍独立Gate。PR98已修复并合并，当前[上线方案](../ops/ningbo-rollout-plan.md)按D105执行。
- 最后用户在原UI完成人工业务验收，再单独授权真实初始化/部署。生产/关账Server及独立库存台账不追加为本轮前置。

回退：暂停采集、关闭orderRead/reader，保留绑定和来源历史；不可删除ledger/订单/快照来回退。候选镜像须验证兼容既有0012；DB恢复只到另一个明确授权目标。首绑回滚只针对未提交事务，不提供已提交订单的自动删除命令。

2026-10-12统一本机演示：PR100已整合获用户视觉确认的PR101正式/login；报价/订单/物料共用一个临时Origin/session/PG，原布局保持。用户已接受本机合成体验，并另行授权合并PR100；main为上述SHA。历史组合证据见[统一演示](../tasks/active/unified-local-demo.md)，最新验收/合并范围见[真实接入](../tasks/active/ainuoke-live-readiness.md)。真实来源/账号/数据库/部署未操作。

## D108：无数据库的来源准备检查

新增 `npm run source:ainuoke:readiness -- --check --config=<私密Linux文件>`，不读取DB、不访问来源；给出来源指纹，不承诺凭据或通道有效。`--probe --expected-source=<该指纹>` 只做一次登录、三份固定报表的首页，每页50行，90秒总限，不翻页/重试/重登。空Discovery时后二报表明确not-probed；输出固定ID/数量/范围，不含任何合同明细或秘密。loopback还要求独立核实通道后显式 `--verified-tunnel`；该参数自身不能证明隧道安全。

探测不校验织序操作人RBAC，输出not-checked；不证明全合同覆盖/字段语义，不启动原scheduler或绑定writer。后续写入仍走原CLI的DB/权限/目标守卫。D108原传输观察及步骤保留于[历史接入任务](../tasks/active/ainuoke-live-readiness.md)，该HTTP限制由D109更新。

## D109：已批准HTTP与本机私密探测

用户永久接受原HTTP来源风险，Node配置和Python worker均要求原origin及policy，不需到期续批。Linux readiness指纹包含policy；既有HTTPS/loopback指纹不变。配置兼容现有首次绑定/采集CLI，但没有因此执行任何DB命令。

Windows普通PowerShell私下运行（用户名可输入中文，密码隐藏且不保存）：
~~~powershell
pwsh -NoProfile -File (Join-Path $env:USERPROFILE '.codex\worktrees\ainuoke-approved-http\zhixu-ainuoke-api\scripts\ainuoke-readonly-probe.ps1')
~~~
该工作树路径为本机本任务入口；其他检出位置运行其scripts/ainuoke-readonly-probe.ps1。仅真实终端输入，非交互/回显降级拒绝；复用固定probe并限制90秒，无DB、无账号变更。

2026-10-13用户回传：认证成功、6086103=50/558（不完整），首合同6087105=5/5、6087050=0/0。不把首合同0行推广至所有合同，不把首次连接证明写成持续Source激活。脱敏回执、工程测试、下一步见[本轮任务](../tasks/active/ainuoke-approved-http.md)。

## D110：全合同与四流代表合同只读核对

PR103已按用户授权合并；新增独立`scripts/ainuoke-readonly-audit.ps1`私密终端命令，原首页probe不变。两遍完整6086103核对分页/唯一sourceId/BillNo/前后内容，当前账号可见全集不等于全公司权限证明。按合同号排序均匀选最多80合同，完整6087050后由原`projectMaterialProgress`生成四流、厂供排除/去重/未知量状态，每类寻找3个有正数量/日期/单号的不同合同。

900秒来源读取、2000报告请求、每报告200页/50行、100000行/32MiB；Node离线分析另限90秒。只有允许字段的代表单号/日期/数量与问题合同写本机ignored私有JSON，不保存原始来源或密码；stdout为脱敏回执及本机路径。`unit`尚未映射/核实，不跨物料加总。样例存在不等于业务人工验收/全合同物料覆盖/持续激活。测试、真实回执与限制见[只读核对任务](../tasks/active/ainuoke-readonly-validation.md)。本功能不读取业务DB、绑定、调度或部署。

2026-10-13真实结果：558唯一可见合同/每遍12页，前后一致；80物料抽样1空0无效，125次报表请求。采购79合同、入库/出运/出库各75合同有正数量/日期/单号样例；四流均取同一组R01–R03。数量未知需求项184/250/341/258，涉及62不同合同，不能跨流水去重或加总为问题总数。当前报告缺物料身份/原始字段，无法判断未知根因或完成逐物料人工对照；下一步建议定向只读诊断。详见[真实证据](../tasks/active/evidence/ainuoke-readonly-validation/real-validation-results.md)。

## 后续定向诊断（只读已执行，人工语义待确认）

从 PR #104 head 派生的草稿 PR #105 提供固定 6086103 一次当前可见合同索引定位，以及最多三合同 6087050 完整分页的显式私密诊断。合成测试和用户普通终端真实读取均已完成；目标三行118/356/6找到对应来源物料/采购字段，356两来源行归并一事件。API单位候选为空，人工业务身份确认0/3，正式单位映射0/3。少量样本的空值/零值/重复观察不能推广至旧统计62合同；unknown仍保持未知。见[任务](../tasks/active/ainuoke-targeted-diagnostic.md)和[脱敏真实证据](../tasks/active/evidence/ainuoke-targeted-diagnostic/real-results.md)。未激活 Source、读取业务DB、绑定、调度或部署。

2026-10-13 后续受保护报告显示目标四条来源行的 QtyUnit 候选均为“个”，三物料身份/采购归并与旧报告相同；业务语义尚未由 IT/用户确认，正式 Adapter/Projection 单位仍未映射。[脱敏证据](../tasks/active/evidence/ainuoke-targeted-diagnostic/qtyunit-followup-2026-10-13.md)。不得据此改变 TotalNum、cgnum 或齐套计算。
````````

## 原文：docs/ops/ningbo-rollout-plan.md

[原提交文件](https://github.com/clearisok/zhixu-erp/blob/064e3afaf7d08b3cb62907d4402f97d9c292f1e5/docs/ops/ningbo-rollout-plan.md)

````````markdown
# 宁波首批团队上线方案
2026-10-13 / GitHub main `957fe1a6eedfd6a92020ef2cf82d710a4162cda0` 已合并 #106；D-112 受控新增合同仅在独立工程分支实施，尚未合并或用于真实业务。首轮上线条件仍是艾诺科四流持续展示、受控新增业务验收、隔离候选/备份回退与单独部署授权。此文件下文旧 SHA/PR 状态保留为历史观察。


2026-10-13 / 更新：用户决定上线前支持受控接纳新增合同，该能力仍未实现。#104/#105 已合并至 main 6abc4bebc59954b98a6e3f79f038f9574588390d，#106 是未合并的单位映射 Draft；宁波旧 staging/production 与公网健康响应只读复核见[预检](../tasks/active/evidence/ainuoke-targeted-diagnostic/pr104-merge-reconcile-2026-10-13.md)，PR105 合并证据见[本次记录](../tasks/active/evidence/ainuoke-targeted-diagnostic/pr105-merge-reconcile-2026-10-13.md)。旧容器不等于隔离新候选，未部署。

核实2026-10-13；工程main：`8b3f3d811d05182ea1a7f3214eae9d530056fa04`（PR98、103亦已合并，PR104未合并）。本文件区分用户决定、工程事实、AI建议和待执行Gate，不是部署授权。随main、来源策略、候选、现场版本、验收变化更新。

现场证据仍是[2026-10-12 15:32–15:43预检](../tasks/completed/2026-10-12-ningbo-readonly-preflight.md)及其[原始脱敏观察](../tasks/active/evidence/ningbo-readonly-preflight/observations.json)。本轮没有重查真实DB/账号/服务，旧计数/健康/403/502不得改写成最新观察。

## 已确认目标与边界

D105：报价当前暂时OK；**艾诺科采购、入库、物料出运、出库按正式订单持续展示后，再上线宁波Ubuntu**。原Quote-first先发布、Source以后再做的时间安排已由D105替代；不再作为当前方案。暂不做独立库存台账，也不把完整生产/关账Server化追加为首版前置。

首批六角色：系统管理员、管理者、报价经理、物控经理、生产经理、财务经理。登录团队共享已授权来源及采购价，织序售价/工价/成本仍按D103/D104区分。空新账本、独立DB/卷、管理员以后自行创建成员、旧账本不导入的边界保持；数据没有价值不等于已删除或授权本轮清理。

用户明确“我永远接受 HTTP 接入的风险，直接推进”，同时要求保持UI、不修改真实账号或数据库、不部署。D109显式HTTP支持已在PR103合并，真实只读认证已验证；不授权数据库首绑/持续写入/发布或把所有HTTP目标全局放开。专用只读账号仍是建议，不新增强制改账号前置。

## 当前工程事实与缺口

- PR97六角色、PR99来源快照、PR100首次绑定/调度/P6接线、PR101登录、PR102无DB探测、PR103已批准HTTP均已合并。用户接受本机合成体验；真实完整可见合同发现已有回执，持续运行和业务人工验收未完成。
- main含0001–0012；旧现场staging仅0001–0007是原观察，不能直接用旧0001–0011候选初始化方案。实际执行前重新校验目标ledger及全部canonical SQL checksum。
- 已实现的调度只刷新已绑定订单四流；新增合同自动建单、主信息/颜色增量刷新、完整分码UI未实现。不得把固定绑定集合说成全合同生命周期已完成。
- Source/orderRead默认关闭；真实账号、业务DB及宁波/18443/18444未因合并改变。生产/关账入口仍不开放，UI沿用D099/P6和已批准登录页。
- D110真实只读回执与本机报告已核对：558可见合同两遍完整且一致；80合同物料抽样四流有代表，62合同有数量未知、单位未映射，完整颜色/规模与逐物料业务口径仍待。[真实结论](../tasks/active/evidence/ainuoke-readonly-validation/real-validation-results.md)。宁波公网403/502和Cloudflare映射仍需新的只读核实；来源可读不证明宁波入口正常。

## 版本晋升选择（AI建议）

| 方案 | 工作与风险 | 建议 |
| --- | --- | --- |
| 独立新Compose/DB/卷/候选入口，通过后切域名 | 目标能锁定，保留旧镜像/入口/数据，符合D096 | 推荐；复用现有server镜像和运维能力 |
| 原地升级旧staging | 需重新核实ledger、显式授权缺失迁移/账号/配置；旧环境回退复杂 | 暂不选；主表为空不构成覆盖授权 |
| Preview与旧业务共库或替换legacy模型 | 模型、权限及测试写入混杂 | 不采用 |

候选命名可用zhixu-ningbo-v1，独立backend网络及对象存储归属。应用仅loopback，DB不发布公网端口；3003只是旧预检时未监听的候选，执行前重查。Cloudflare hostname到origin映射先核实，不擅自关闭Access/WAF。新DB不恢复旧dump，不回退Browser数据。

对象存储要用实际adapter支持的独立namespace/授权；不支持prefix隔离时选独立bucket或先做最小工程修改。仅文档写“隔离”不能替代key/权限证据。

## 先后顺序和上线Gate

| 顺序 | Gate | 完成证据及授权边界 |
| --- | --- | --- |
| G0 来源连接 | 显式HTTP策略支持、私密凭据、一次登录/固定报表只读probe | 已完成用户执行回传与本机报告核对；无业务DB访问。不代表持续Source激活 |
| G1 来源范围 | 完整合同范围、6086103/6087105/6087050字段/单位/分页/速率核对 | 部分完成：558可见合同完整、80物料抽样可解析；剩数量/单位/逐物料对照、全量颜色及真实规模预算。不能把抽样当全量 |
| G2 隔离演练 | 完整候选镜像、0001–0012、六角色、首次空账本绑定、连续四流、过期/断网/重启恢复 | 先用一次性合成环境；真实空目标初始化/首绑及采集持久化须具体授权。本轮不执行 |
| G3 持续来源验收 | 已授权目标真实四流持续显示、样本对照、明确新增合同处理范围 | D105宁波上线前置；建议24小时及各流3张单据，数量/时长是AI建议，未实际完成 |
| G4 宁波候选就绪 | hostname/origin/TLS、镜像SHA/authority/session/build与runtime一致、DB/对象隔离、备份和隔离恢复读回 | 复核旧403/502根因；服务启动会同步权限目录，不能作为只读检查；真实改动另授权 |
| G5 受控试用 | 在具体授权的新候选完成真实登录、来源/报价/保存/附件/导出与六角色金额验收 | 管理员创建真实成员；合成账号不入正式账本。不是要求未部署前做线上验收 |
| G6 晋升 | 人工签收后单独批准域名切换或扩大团队使用 | 记录源码/镜像/ledger/备份/回退目标；未完成前不宣称正式上线 |

来源在宁波正式上线前的真实验收目标须单独明确；本方案不以“为了验收”为由擅自部署到宁波、修改现有数据库或创建账号。G0/G1可在无DB的本机只读工具完成；G2/G3的真实持久化目标仍需具体执行计划。

优先P0：G0–G5与首批真实数据前的备份恢复底线。P1：持续监控、告警、明确新增合同同步方案、凭据轮换操作。P2：资源限额、独立review/required checks、运维便利。P3：完整生产/关账、利润分析、Intake、DeliveryPlan UI、完整像素黄金集。不要用延期模块阻塞这轮已批准范围。

## 下一开发顺序（AI建议）

优先`feat/ainuoke-source-diagnostics`，对少量代表/问题合同补逐物料身份、未知数量原因及单位候选，再由用户核对上游语义。已完成的HTTP连接和完整可见合同发现不重复作为前置；未知项不强行清零，也不要求所有历史合同数据完美。随后核对全量颜色/实际规模预算并明确新增合同处理范围，准备具体首绑/持续运行目标。`chore/ningbo-release-candidate`可在来源工程稳定后提交可复验的Linux候选配置与一次性演练，但构建配置不等于授权安装或启动真实候选。

候选应锁定source SHA/image digest，显式Quote=server、masters=server、writer=writable、identity=session；按已批准范围显式orderRead=snapshot及匹配的reader。默认关闭值不擅改。preflight/init/migrate/bootstrap/start/switch/backup/restore严格区分读写，执行工具防误指旧zhixu-prod、zhixu-staging及18443/18444。

## 停止和回退

checksum漂移、目标共库、未知dirty、authority不一致、来源分页不完整/身份错配都停止；用户接受HTTP不等于取消这些校验。HTTP结果结构校验不能保证链路未遭篡改，残余风险如实保留。

- 切入口前失败：停止候选晋升，保留证据及旧服务/卷，不能删库“恢复干净”。
- 尚无新业务写入：另行授权后恢复已核实旧origin，保留候选数据。
- 已有新写入：维护模式停止继续写入，保全DB/对象/审计，按兼容性回退镜像或前向修复。旧系统没有新账本，切回旧页面不等于无损回退。
- migration不自动down；restore只针对明确独立目标、已核实备份及单独授权。回退须验版本/认证/数据/附件/权限，不以healthy替代。

## 后续最少输入

真实凭据仅用户本地私密输入，不发聊天/GitHub，不要求改真实账号。后续需要Cloudflare实际origin/策略只读信息（不含token）、新候选及存储归属、受控试用窗口、备份/故障接收人和旧宁波环境保留策略。HTTP风险已获用户持续接受，不反复要求同一授权；新目的地、真实写入或部署不由此自动获授权。
````````
