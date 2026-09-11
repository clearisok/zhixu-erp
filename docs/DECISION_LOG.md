# 决策日志

状态说明：

- **Active**：当前实现仍遵守的决定。
- **Superseded**：已被新的实现或决定替代，仅保留背景。
- **Deprecated**：为兼容仍可能存在，但新代码不应继续依赖。

### D-043 ScheduleAssignment 直接归属 SalesOrder，生产计划层退出 Runtime

- 日期：2026-08-28
- 状态：Active；替代 D-041 的三层关系，但保留其数量分离、混合执行、Service Projection 与权限边界。
- 决定：正式关系改为 `SalesOrder → ScheduleAssignment[]`。Assignment 保存 `salesOrderId`、队列、工期口径、日产量快照、工作日、计划/实际日期与 dateMode；ProductionPlan 只留在 v8→v9 legacy migration、迁移测试、旧日志兼容和已替代文档。
- 迁移：v8 ProductionPlan 只用于解析 owner，原 ScheduleAssignment ID 不变，确保 ClosingAllocation.scheduleAssignmentId、锁账快照和产值不变；稳定 namespace 不变，schemaVersion 升为 9。
- 排期：内部生产组按 ProductionSite 的可编辑 ProductionCalendar 串行排队；同日交接不计完整工作日；manual_fixed、已开工和已完成记录不自动移动。完成后用户明确选择是否重排后续，联动日志共享 operationId。
- 物流：物料齐套要求面辅料均到 SupplyHub；SupplyRoute/TransportMode 按自然日给出满足时效的最慢运输建议，不反向修改排期。报价 ManufacturingPreset 与实际 ProductionSite 分离。
- 证据：`features/production-scheduling/`、`features/operations-settings/`、schema v9 migration、订单/排单页面和 `tests/production-scheduling.test.mjs`。

## Active

### D-078 正式 SalesOrder 编号、bootstrap scope、source disappearance 与 retention policy

- 日期：2026-09-11
- 状态：Active；补充 D-076/D-077 在真实 bootstrap 前待确认的业务政策，但不授权真实 bootstrap、Browser cutover 或 6087105 source replacement。
- `order_no`：由 server/PostgreSQL 全局递增生成 `SO-00000001`、`SO-00000002`……，用户不可编辑。PostgreSQL UUID 仍是真正技术 identity；InsideOrderNo 与 SalesContractNo 是独立 source facts，不得代替 UUID 或互相推导。
- Scope：正式 bootstrap 组织范围为 `current_account_visible`。每次必须使用 fresh complete Discovery；505、507、511 等历史/当前 total 都只是观察快照，不是固定业务常量，Status 继续不参与 inclusion/exclusion。
- Disappearance：正式 SalesOrder 建立后，source 从 Discovery 消失不触发 hard delete、auto-cancel、UUID replacement 或 source unbind。系统标记 missing、保留历史；source 重新出现后恢复 seen。
- Retention：长期保存 normalized current source mirror、source/discovery hash、fetchedAt/lastSeen/missing 等必要时间和 reconciliation metadata；默认不长期保存完整 raw upstream payload。
- 证据：用户对 Phase 2B2.1 的明确规则确认、`docs/BUSINESS_RULES.md`、`docs/features/SALES_ORDER_PERSISTENCE.md`。具体 sequence/tombstone schema 与真实 bootstrap 写入仍属于后续独立实现 Gate。

### D-077 PostgreSQL SalesOrder 采用稳定 aggregate + immutable source binding + current source mirrors

- 日期：2026-09-11
- 状态：Active；落实 D-076 的逐领域 server persistence 与 clean-bootstrap 方向，但不授权真实 bootstrap 或 Browser cutover。
- 决定：Phase 2B1 使用 PostgreSQL UUID 作为正式 SalesOrder identity；`sales_orders` 保存规范化唯一 `order_no`、不可变 creation provenance、Zhixu lifecycle 和 optimistic version。Ainuoke source identity 通过 `sales_order_source_links` 唯一且不可换绑；当前合同头与分色事实存入独立 typed mirror tables，refresh 只替换 source-owned slice，不覆盖 aggregate identity/provenance/version。
- 事务/审计：`createAinuokeSalesOrder` 在 source-scoped advisory lock 和单 PostgreSQL transaction 中完成 aggregate/link/current mirrors/server OperationLog。重复 source identity 幂等返回既有 ID/version；任一步失败整体 rollback。OperationLog actor 只能由 TrustedIdentity 注入，不能从业务 input 或 request body 接受。
- API/边界：本阶段只开放带 Trusted Session + `order.view` 的 list/detail GET，返回 composed DTO。Browser Order Center 仍使用 Browser Repository；没有 live Ainuoke read/write、真实 505 bootstrap、Browser migration/dual-write/cutover，也没有 Quote、Style Progress、Scheduling 或 Closing migration。
- 下一步：Phase 2B2 只构建 Discovery/detail-read → bootstrap candidate → reconciliation → preview report，不执行真实正式 bootstrap。真实写入、cutover 与 Browser retirement 均需后续独立 Gate。
- 证据：`database/migrations/0002_sales_order_foundation.sql`、`server/sales-orders/`、`server/app.ts`、`server/integration/postgres.integration.test.ts` 与 `docs/features/SALES_ORDER_PERSISTENCE.md`。

### D-076 正式持久化采用 Node/TypeScript API、可信 RBAC 与逐领域切换

- 日期：2026-09-10
- 状态：Active；替代 D-002 作为未来正式生产目标，但 legacy static + `api_dispatch` 路径在独立退役 Gate 前继续兼容运行。
- 决定：正式架构为 Browser → same-origin `/api/v1/*` → Node/TypeScript application/repository → PostgreSQL 16。新业务规则留在 TypeScript，不扩展通用 SQL/表名/op dispatch 或复杂 PL/pgSQL controller。
- Migration：`database/migrations/NNNN_*.sql` 只前进；`schema_migrations` 保存 filename/checksum/applied_at/duration，advisory lock 串行化 runner，每文件 transaction，checksum drift/missing file/failure fail closed。没有自动 down，回退使用 forward fix 或经授权的已验证 restore。
- Identity/RBAC：`app_users` 是唯一 identity source，以不可变 UUID `public_id` 对外；V1 session 只持久化 token digest。授权关系为 users/roles/permissions/user_roles/role_permissions，权限目录复用现有纯 TypeScript `PermissionKey`，只按 key 授权且没有角色名/admin bypass。
- Audit：server `operation_logs` 与 legacy `audit_logs` 分离；actor 使用内部 FK + stable public ID/name snapshots，由 trusted session context 注入，数据库拒绝 update/delete。现有 browser OperationLog 在领域 cutover 前继续独立运行，不做长期未对账双写。
- Cutover：每个业务领域必须独立完成 schema/repository/service transaction/authorization/OperationLog/backfill/reconciliation/read-write cutover 后才能退休 browser store。Phase 1 不创建 SalesOrder/Quote/Scheduling/Closing/Style Progress/Ainuoke/附件业务表，也不迁移浏览器数据。
- 证据：`server/`、`database/migrations/`、`Dockerfile.server`、`server/integration/postgres.integration.test.ts` 与 `docs/features/SERVER_PERSISTENCE.md`。

### D-044 业务表格采用 Fit-first 个人布局，工作台身份信息去重

- 日期：2026-09-04
- 决定：正式 `DataTable` 的列宽与稳定列顺序按 `User + Table` 保存；旧 width-only 偏好向前迁移，删除列忽略、新列按默认顺序追加。Preferred Width 参与可用宽度比例 fit，不得把主业务列表的横向滚动当作默认交互。
- 决定：Desktop Sidebar 支持按用户保存的展开/折叠；基础设置与系统设置菜单只因用户动作打开，pathname 只负责高亮并在切换时关闭临时菜单。
- 决定：订单 Header 负责身份，Summary 只保留有效数量、合同交期、生产状态与下一步；正式 Ainuoke Order 不提供普通数量/合同交期覆盖入口。生产排单移除重复摘要与大异常 Banner，组选择器压缩后固定在 AppShell 唯一主滚动的顶栏下方。
- 边界：报价成本录入矩阵、关账分组汇总、Ainuoke 对照表和附件表等具有固定业务语义的自定义表不允许任意重排；它们仍须 fit-first 或使用窄屏 Record/Card，不能用隐藏 scrollbar 伪装溢出。
- 证据：`components/foundation/data-table.tsx`、`table-preference.ts`、`sidebar-preference.ts`、Quote/Order/Production/Closing UI、Second Acceptance tests 与截图目录。

### D-042 关账归属保存月度事实快照，锁定后只允许有原因地重开

- 日期：2026-08-28
- 决定：正式关系为 `SalesOrder → ClosingAllocation[]`，`ClosingAllocation.scheduleAssignmentId` 可空；关账数量独立于订单数量、排单数量和完成数量。内部、外发与待分配可在同一订单、同一月份并存，关账事实不得写回 SalesOrder 或 ScheduleAssignment。
- 决定：`ClosingAllocation` 在保存时冻结订单类型、销售单价、加工单价/币种、汇率、税率和执行方；加工产值原币为 `quantity × closingProcessingUnitPrice`，USD 按关账汇率快照折算 RMB，经销销售产值为 `quantity × salePriceSnapshot ÷ (1 + taxRateSnapshot / 100) ÷ 10000`，加工订单销售产值不适用。计算集中在 Closing Service。
- 决定：`ClosingPeriod` 生命周期为 `open → confirmed → locked`。锁定拒绝普通 mutation；重新打开需要 `closing.reopen` 与原因。排单变化不静默改写既有关账，Service 以 ScheduleBasisSnapshot 识别 stale，用户显式同步或保留快照。
- 决定：浏览器 schema 升至 v8，只新增稳定 `closing-center` record；v7 其他 payload 原样重封装。关账动作复用唯一 OperationLog，权限、SearchProvider、订单投影与 Backup/Restore 同步接入。
- 边界：不实现应收应付、发票、付款、总账、利润核算或 PostgreSQL 关账表；根路径旧 ERP 数据库不修改。D-041 中“关账尚未实现”的阶段性边界自本决定起被替代，排单领域决定本身继续有效。
- 证据：`features/closing-center/`、`app/closing-center/`、订单详情关账投影、ClosingSearchProvider、数据生命周期接入和 `tests/closing-center.test.mjs`。

### D-041 排单事实独立于单款 SalesOrder，并由 Service 统一投影（Superseded by D-043）

- 日期：2026-08-28
- 决定：正式关系为 `SalesOrder → ProductionPlan[] → ScheduleAssignment[]`。Assignment 通过 `productionPlanId` 归属计划，不重复保存 `salesOrderId`；内部执行只引用 ProductionGroup，外发只引用 OutsourceFactory，一单允许多计划、多执行方和内部/外发混合。
- 决定：SalesOrder 不保存执行方式、执行方、排单数量、完成数量或生产状态。订单有效量、计划量、排单量、内部/外发量、完成量、执行模式、生产状态与 DeliveryPlan 累计交期风险全部通过 `production-scheduling-service.ts` 计算。订单数量变化不自动修改排单，超额只提示不截断。
- 决定：schema 升至 v7，仅新增稳定 `production-scheduling` record；v6 其他业务 payload 原样重封装。排单动作复用 OperationLog 和现有 schedule 权限，SearchProvider/Backup/Restore 同步接入。停用基础资料不能用于新排单，但历史引用保持可读。
- 边界：不创建 ClosingPeriod、ClosingAllocation、关账中心、产值计算、锁账或重开；不修改旧 PostgreSQL `orders/schedules/audit_logs`。
- 证据：`features/production-scheduling/`、`app/production-scheduling/`、订单详情摘要、ScheduleSearchProvider、数据生命周期接入与 `tests/production-scheduling.test.mjs`。

### D-040 一张 SalesOrder 只允许一个款式

- 日期：2026-08-27
- 状态：Superseded by D-043。数量口径、混合执行、Service Projection、权限与旧 PostgreSQL 隔离继续有效；ProductionPlan 中间层和 Assignment.productionPlanId 已被替代。
- 决定：SalesOrder 同时承担订单身份与单款执行单位，不再拥有 `OrderItem[]`。Quote 来源、款式、初始数量、执行资料、附件、DeliveryPlan、OrderQuantityChange、OrderPriceVersion 与 `currentPriceVersionId` 均直接属于 SalesOrder；当前价格只能通过该指针读取，损坏时禁止 fallback。
- 决定：Quote 直接生成 SalesOrder；翻单关系为 `SalesOrder → SalesOrder`，只保留 `sourceOrderId`，`sourceOrderItemId` 正式废弃。相同 `customerPoNo` 可以对应多张不同单款订单，不能因此合并。
- 决定：v5→v6 的单款 payload 迁移保持有效，稳定 `sales-orders` key 不变；当前整体 schema 已由 D-041 升至 v7。v5 单 Item 保留原订单 ID/订单号，多 Item 逐款拆单；确定性旧 Item→新 SalesOrder mapping 保护翻单链路、诊断和旧日志展示。旧 OperationLog 不改写，新日志不再写 `orderItemId`。
- 后续：`SalesOrder → ProductionPlan → ScheduleAssignment` 已由 D-041 实现；`ClosingAllocation.salesOrderId` 与可空 `scheduleAssignmentId` 仍只是未来边界。本决策不创建 ClosingPeriod、ClosingAllocation 或关账中心，也不修改旧 PostgreSQL orders/schedules。
- 证据：`features/order-center/model/order.ts`、`migration/order-v5-to-v6.ts`、Order Service/Repository/UI、OrderSearchProvider、订单日志/备份适配与 `tests/order-center.test.mjs`。

### D-038 订单、排单与关账先共享稳定基础设施，业务实体延后实现

- 日期：2026-08-26
- 决定：先建立独立 `operations-settings` 领域保存生产组、外发厂、默认销售产值税率和月度生产目标；生产组/外发厂以稳定 ID 引用、允许同名并通过停用保留未来历史引用。浏览器 schema 升至 v4，v3 → v4 只增加独立记录并保留既有 payload 与未知字段。订单、排单和关账权限键先进入统一 RBAC，但报价员和查看员的既有权限不自动扩大。
- 决定：审计继续扩展唯一的追加式 `OperationLog`，设置写入使用一次业务操作一个 `operationId` 并保存字段级 `changes[]`；新上下文 ID 只作未来关联预留，不新建第二套 `AuditEvent`。未来订单、排单、关账业务对象仍需独立设计和实现。
- 决定：`OrderType` 复用 `processing | distribution`，执行方式为 `internal | outsource`，关账期间状态为 `open | confirmed | locked`。外发厂引用未来应落在排单分配；订单数量、排单数量、完成数量保持独立。默认税率只作为创建关账快照时的来源，已确认/锁定月份不得实时读取全局设置。
- 原因：先稳定跨模块身份、权限、审计和数据保护边界，避免未来订单/排单/关账各自复制一套主数据或在没有正式模型时污染现有报价和 PostgreSQL 旧表。
- 证据：`features/operations-settings/`、`features/shared-domain/model/operations.ts`、权限与 OperationLog 扩展、local data v4 migration、`tests/operations-infrastructure.test.mjs` 和 `docs/features/OPERATIONS_FOUNDATION.md`。

### D-037 面料单耗统一为四位正式业务值，审计日志扩展到设置与批量导出

- 日期：2026-08-26
- 决定：kg/meter 面料公式先计算原始值，再在 `quote-calculations.ts` 统一按第五位四舍五入到四位；面料成本、UI、正式 Excel 和占位符 Excel 都消费该值。当前架构的单耗是明确的计算派生值，因此不在 FabricCostLine 冗余保存第二份 raw/stored 字段，也不原地改写历史 Revision；历史导出按同一读取规则规范化。Excel 写 number，格式为 `0.0000`。
- 决定：审计继续使用唯一 `OperationLog`，扩展品牌、客户业务员、系统报价设置、制作预设和 PriceVersion 预设切换事件。批量导出只保存完整的最小业务快照清单，不保存 Quote/Blob 大对象。
- 原因：单耗必须在成本、显示和导出间可解释一致；关键主数据和系统设置写操作也必须能按稳定 ID 与字段差异追溯。
- 证据：`quote-calculations.ts`、两个 Excel exporter、`settings-operation-logs.ts`、批量导出日志接线及相关自动化测试。

### D-036 USD 工价人民币折合使用固定 1.13 系数

- 日期：2026-08-26
- 决定：当 PriceVersion 加工币种为 USD 时，统一由 `convertedLaborRmb` 计算 `原始 USD 工价 × PriceVersion 汇率 × 1.13`；固定 `1.13` 与 PriceVersion 的 `markupRate` 是两个独立业务概念。CNY 工价直接使用用户录入人民币值。详情摘要、Sticky、Excel 和其他消费者读取 calculator 结果，不自行重复公式。
- 原因：USD 加工单价需要遵循明确的固定折算口径，同时保留各制作预设独立的报价成本加成率，避免两种“13%”语义混淆。
- 证据：`quote-calculations.ts`、`quote-presentation.ts`、报价摘要/加工费组件、Excel export mapper 和 `tests/quote-calculations.test.mjs`。

### D-035 制作预设与全部报价计算参数属于 PriceVersion 快照

- 日期：2026-08-26
- 决定：制作预设只在系统设置维护，但 `manufacturingPresetId`、预设名称、制作国家、加工币种、USD/CNY 汇率、`markupRate` 和运费策略均以 `PriceVersion.pricingParameters` 完整快照保存。应用预设只更新当前 PriceVersion 及其预设运费行；复制 PriceVersion 深复制该快照并清除客户确认。计算、展示和 Excel 导出只读取目标 PriceVersion 快照。旧 Revision 级参数仅在 schema v2 → v3 读取迁移时使用，迁移后不再保存。
- 原因：同一 QuoteRevision 必须同时支持不同制作国家、币种、加成和运费口径，且系统预设后续变化不能污染任一已有或历史 PriceVersion。
- 证据：`quote-view-model.ts`、`quote-settings.ts`、`quote-calculations.ts`、`mock-quote-repository.ts`、报价设置/导出组件和 `tests/price-version-manufacturing-preset.test.mjs`。

### D-033 面向客户的最终成衣报价统一截断到一位小数

- 日期：2026-08-26
- 决定：内部成本与成衣销售单价计算保持原始精度；所有面向用户的最终成衣报价显示及客户 Excel 输出统一调用共享 formatter，保留一位小数并使用截断而非四舍五入，例如 `41.25 -> 41.2`。空值继续显示/导出为空，明确 0 显示 `0.0`。
- 原因：这是客户报价口径，不能由 React、列表和不同 Excel exporter 各自格式化并产生舍入差异。
- 证据：`features/quote-center/model/final-quote-format.ts`、报价展示组件、`features/quote-center/export/` 和相关测试。

### D-032 Quote Center 浏览器数据采用稳定命名空间与非破坏性迁移

- 日期：2026-08-25
- 决定：Quote Center 与新订单中心所有可序列化长期数据写入稳定 `zhixu.erp.local.*` localStorage namespace，当前 `schemaVersion = 6`；旧报价 sessionStorage、旧 envelope 和旧带版本 localStorage key 只作为迁移来源。启动时优先读取已有稳定数据，其次迁移旧数据，只有空 namespace 才执行一次 Seed。附件与用户模板继续使用原 IndexedDB database/store，并纳入显式 JSON 备份/恢复。自动流程不删除旧 key，数据清空只允许在数据管理页二次确认执行。v4 增加 `operations-settings`，v5 增加 `sales-orders`，v6 仅迁移多款订单 payload，其他记录不重写。
- 原因：DEV 3001 已承载长期人工验收数据；sessionStorage、版本化 key 和解析失败后静默回退 Seed 会让数据在关闭标签页、版本升级或数据异常时丢失或看似消失。
- 证据：`features/data-management/`、各 browser repository、`tests/data-lifecycle.test.mjs`、`docs/features/DATA_LIFECYCLE.md`。

### D-031 Quote Detail 宽表按内容宽度铺满，半屏操作固定四列

- 日期：2026-08-24
- 决定：成本 Card 实际内容宽度 `>=1040px` 时使用单行 Wide renderer，面料/辅料/其他费用采用 `table-layout: fixed` 与业务权重百分比，不设置会超过 Card 的固定最小宽度；`700–1099px` viewport 保持完整两行 Compact 编辑，True Mobile 规则不变。全部 Compact/Tablet 的普通与 Sticky 操作区使用四列等宽 Grid，只有 `>=1440px` Large Desktop 自然横排。顶部常驻操作移除“操作记录/删除报价”文字按钮，两项能力连同权限和 handler 收进复用的“更多”入口。Sticky 触发状态源与时机不变。AppShell 客户端模式在浏览器绘制前解析，避免服务端 Desktop fallback 在列表/详情切换时闪现展开侧栏。
- 原因：在 1920×1200、系统/浏览器缩放后的约 1230px CSS viewport 中，实际 Card 只有约 1091px；旧 1230/1160px 固定表宽必然产生无意义横向滚动。半屏操作使用 flex 时也不能稳定控制行密度。
- 证据：`cost-table.tsx`、`quote-editor.tsx`、`quote-center.css`、`responsive.css`、相关响应式测试及 DEV 浏览器 1920/1230/785 实测。

### D-029 新建报价主数据采用嵌套就地创建与显式保存边界

- 日期：2026-08-24
- 决定：品牌和当前品牌下的客户业务员通过 SearchableSelect 的条件创建项打开 Quick Create Modal；品牌默认辅料选择器可在 Modal 内继续打开 body Portal Drawer，并把新记录写入正式 Trim Library。只有主数据 repository 在用户明确保存时写入；报价草稿仍遵守 Lazy Create。新建资料立即选中，默认辅料只保存 Library ID 与长期 override，应用报价时再生成新成本行快照。已有用户成本数据时继续使用保留、应用、取消三向保护。
- 原因：用户需要在新建报价上下文中补齐缺失主数据，同时不能丢失草稿、复制伪 Library 数据、污染历史 Revision 或因快建而产生空白报价。
- 证据：`components/foundation/searchable-select.tsx`、`components/foundation/drawer.tsx`、`features/basic-settings/components/quick-master-data-create.tsx`、`features/basic-settings/components/master-data-forms.tsx`、`quote-editor.tsx` 和 `tests/quick-master-data.test.mjs`。

### D-028 ERP 全局搜索使用权限感知的 Provider 注册表

- 日期：2026-08-23
- 决定：全局搜索 UI 只负责 Command Palette、键盘选择和导航；各业务模块通过 `SearchProvider` 提供查询与结果投影，由 `SearchRegistry` 在查询前执行 Provider 权限判断。第一阶段 Quote Provider 复用 QuoteRepository，只返回列表级非成本字段；最近访问按 mock userId 隔离并再次经过 Provider 权限过滤。
- 原因：把报价查询硬编码在 Palette 会阻塞订单、排单、采购等模块扩展；在查询后才隐藏结果会产生权限信息泄露和不必要数据读取。
- 证据：`features/global-search/`、`components/foundation/app-shell.tsx`、`tests/global-search.test.mjs` 和 `docs/features/GLOBAL_SEARCH.md`。

### D-027 Quote Center 日志在保存事务后独立追加

- 日期：2026-08-23
- 决定：Quote Center 第一阶段 OperationLog 使用独立模型和 localStorage repository，不写入 Quote、QuoteRevision 或 PriceVersion。日志以 repository 保存成功为边界，对上次已保存快照与本次快照生成字段差异；repository 只暴露追加和按报价读取，时间线没有编辑/删除入口。
- 原因：输入过程不是已落地业务事实；把日志塞入 Revision 会污染报价快照并让日志与被审计对象互相嵌套。保存后差异既能记录成本前后值，也避免逐字符日志噪音。
- 证据：`features/operation-logs/`、`quote-editor.tsx`、`tests/operation-logs.test.mjs` 和 `docs/features/OPERATION_LOGS.md`。

### D-026 Quote Center 第一阶段权限使用可扩展前端 RBAC

- 日期：2026-08-23
- 决定：Quote Center 第一阶段建立独立的 `User -> Role -> PermissionKey[]` mock 权限模型。Foundation Button 统一接收权限键并保持无权限操作可见 disabled；复杂编辑区同时使用权限上下文进入只读状态。权限状态只存 localStorage，不写入报价快照，也不与根路径 ERP 的 PostgreSQL 账号体系静默合并。
- 原因：订单、排单、采购等未来模块需要稳定权限目录；把角色名称判断散落到页面会堵死扩展，也无法统一无权限反馈。
- 证据：`features/permissions/`、`components/foundation/button.tsx`、用户权限路由、Quote Center/基础设置接入和 `tests/permissions.test.mjs`。

### D-001 双报价路径暂时隔离

- 日期：2026-08-21 前已形成
- 决定：根路径 ERP 报价继续使用 PostgreSQL API；Quote Center 使用自己的领域模型和 mock repository，不连接旧 `/api/quotes`。
- 原因：两者的数据结构、Revision/PriceVersion 语义和计算口径不同。
- 证据：`app/page.tsx`、`database/001_schema.sql`、`features/quote-center/repository/`。

### D-002 本地生产运行使用静态应用 + PostgreSQL

- 日期：当前仓库基线
- 决定：本地 Docker 由 PostgreSQL 容器保存业务数据，Shell 静态服务器将 `/api/*` 交给 `api_dispatch`。
- 证据：`Dockerfile`、`docker-compose.yml`、根目录 `docker-entrypoint-app.sh`、`docker-serve.sh`。

### D-003 Quote Revision 是完整快照

- 日期：2026-08-21 前已形成
- 决定：Revision 保存某次完整报价状态；PriceVersion 是 Revision 内的并列价格口径。新 Revision 深复制并清除客户确认，历史 Revision 只读。
- 证据：`features/quote-center/model/quote-view-model.ts`、Revision 管理和测试。

### D-004 默认 Revision 使用稳定 ID 指针

- 日期：2026-08-21 前已形成
- 决定：`defaultRevisionId` 是当前默认 Revision 的权威指针；读取旧数据时才兼容 `currentRevisionId`。
- 证据：Quote view model 和 revision helper。

### D-005 Quote Center 统一使用 markupRate

- 日期：2026-08-21 前已形成
- 决定：Quote Center 报价加成使用 `cost × (1 + markupRate / 100)`；不复用旧 ERP 的毛利率除法公式。
- 证据：Quote Center calculation 和测试。

### D-006 默认辅料引用库，报价使用快照

- 日期：2026-08-21 前已形成
- 决定：品牌/客户业务员默认辅料保存库 ID 和长期 override；应用到报价时生成带新 row ID 的独立成本行，用量保持空。
- 证据：`features/basic-settings/` 默认资料服务和测试。

### D-007 基础资料与 Quote Revision 解耦

- 日期：2026-08-21 前已形成
- 决定：品牌、客户业务员、面料库和辅料库不放入 Revision；Revision 只保留使用时的报价快照。
- 证据：基础设置模型、Quote view model 和快照测试。

### D-008 列表偏好按用户隔离

- 日期：2026-08-21 前已形成
- 决定：Quote Center 可见列配置带 `userId`，当前 mock 用户也不得写成系统唯一全局列配置。
- 证据：Quote list preferences repository 和测试。

### D-009 全局费用允许多条并保护覆盖

- 日期：2026-08-21 前已形成
- 决定：全局费用为 0..N 条，通过稳定设置 ID 同步到当前默认 Revision；用户覆盖过的行不被静默覆盖。
- 证据：global cost model/service 和测试。

### D-010 表单提交优先使用 HTML form 语义

- 日期：2026-08-21 前已形成
- 决定：局部 Modal/Form 由 Foundation FormShell 统一 Enter 提交和防重复规则；整页报价不因普通 Enter 保存。
- 证据：`components/foundation/form-shell.tsx`、`form-enter.ts` 及测试。

### D-011 详情页使用 query id 兼容静态导出

- 日期：2026-08-21 前已形成
- 决定：报价详情路由为 `/quote-center/detail?id=...`，与当前静态导出方式兼容。
- 证据：`app/quote-center/detail/page.tsx` 和 Quote Center 导航代码。

### D-012 附件二进制与 Revision 引用分离

- 日期：2026-08-21
- 决定：QuoteRevision 保存图片/文件附件 ID 快照和款式图 ID；纯前端阶段由 AttachmentRepository 的 IndexedDB 实现保存 metadata 与 Blob，不将大文件写入 localStorage/sessionStorage。
- 原因：Revision 需要复制引用而不是复制文件，历史版本必须保持可下载，同时为未来 Object Storage/API repository 留出替换边界。
- 证据：`model/quote-attachments.ts`、`repository/attachment-repository.ts`、`repository/indexeddb-attachment-repository.ts` 和附件测试。

### D-013 正式报价以模板驱动的按需 Excel 导出

- 日期：2026-08-22
- 决定：Quote Center 的正式 Excel 导出以 `templates/quote-export-template-v1.xlsx` 为唯一版式基准；用稳定标签解析模板并动态扩展五个成本区域。一个 Revision 生成一个 Workbook，一个 PriceVersion 生成一个 Sheet。ExcelJS 只在用户打开导出流程后动态加载，导出数值来自现有 Quote Center 计算函数和快照，不新增 Excel 公式口径。
- 原因：保持正式模板外观、历史快照和应用内计算一致，同时避免 Excel 库进入报价页首屏依赖。
- 证据：`features/quote-center/export/`、`quote-export-modal.tsx`、`tests/quote-excel-export.test.mjs` 和导出验收工作簿。

### D-014 批量图片先确认再写入附件仓库

- 日期：2026-08-22
- 决定：剪贴板或拖放加入的多张图片先保存在 Modal 的临时待添加列表中；用户确认后才通过 AttachmentRepository 批量写入。批次中途失败时补偿删除本批已写入项，已有款式图绝不被自动覆盖。
- 原因：避免粘贴/拖放瞬间产生不可见持久化和半批次状态，同时保留 Revision 附件引用与底层 Blob 分离的既有边界。
- 证据：`attachment-panel.tsx`、`quote-attachment-upload.ts`、`quote-attachments.ts` 和 `tests/quote-attachments.test.mjs`。

### D-015 Excel 工价双列复用系统人民币计算结果

- 日期：2026-08-22
- 决定：CNY 工价只写 RMB/件；USD 工价同时写系统计算得到的 RMB/件与原始 USD/件。导出映射层读取现有计算结果，导出器不自行执行汇率换算。
- 原因：确保 Excel 与 Quote Center 页面只有一套工价换算口径，并保持空值与显式 0 的区别。
- 证据：`quote-export-mappers.ts`、`quote-excel-exporter.ts` 和 `tests/quote-excel-export.test.mjs`。

### D-016 导出模板使用版本化 Definition + IndexedDB Blob

- 日期：2026-08-22
- 决定：模板 metadata 使用通用 `TemplateDefinition`，用户 xlsx Blob 由 `TemplateRepository` 存入 IndexedDB；现有正式报价模板继续作为内置默认和读取失败 fallback。
- 证据：`features/template-settings/`、模板设置路由与测试。

### D-017 客户报价模板硬隔离内部 EstimateCost

- 日期：2026-08-22
- 决定：客户模板验证拒绝 `estimate.*`；Customer Quote Export 输入模型不包含 EstimateCost，现有“实际成本”列也保持空白。
- 证据：template validation、quote placeholder exporter、模板/估算测试。

### D-018 EstimateCost 是 Quote 级独立快照

- 日期：2026-08-22
- 决定：Quote 同时最多一个 active EstimateCost，并可保留多个历史；它由用户从指定 QuoteRevision 主动生成，不属于 Revision 或 PriceVersion。重新生成归档，恢复通过 Clone。
- 证据：`model/estimate-cost.ts`、`estimate-cost-panel.tsx` 和测试。

### D-019 批量汇总复用 QuoteList 单一列定义

- 日期：2026-08-22
- 决定：Quote Center UI 与内部汇总 Excel 共用 `quote-list-column-definitions.ts`；每款模式使用 aggregate/range，每 PriceVersion 模式读取版本自身。
- 证据：quote list、batch exporter 和批量导出测试。

### D-020 报价详情只保留一个 Sticky 状态源

- 日期：2026-08-22
- 决定：报价摘要、操作按钮、快速导航由一个 sentinel、一个 IntersectionObserver 状态和一个 sticky container 同步控制；普通快速导航不再独立 sticky。
- 证据：quote editor、quick navigation、Quote Center CSS 和导航测试。

### D-021 DEV 与 PROD Docker 使用明确的版本边界

- 日期：2026-08-22
- 决定：DEV 固定为 `127.0.0.1:3001`，直接运行当前源码并支持 HMR；PROD Docker 固定为 `127.0.0.1:3000`，只有显式 rebuild 才更新。Docker 必须在 builder 阶段从当前 build context 构建源码，不能复制宿主旧 `dist`。两套环境都自动生成并暴露 Build Info；HTML/Build Info 不长期缓存，hash 资源可 immutable 缓存。
- 原因：消除“源码已更新但浏览器仍显示旧 production 容器”的判断歧义，并让运行实例版本可以直接核验。
- 证据：`vite.config.ts`、`Dockerfile`、`docker-compose.yml`、`docker-serve.sh`、`scripts/dev.ps1`、两个 rebuild 脚本与 `tests/local-runtime-observability.test.mjs`。

### D-023 全局设备模式由 viewport 与交互能力共同决定

- 日期：2026-08-23
- 决定：全局 Navigation Mode 不再使用纯 width 判定。True Mobile 必须同时满足 viewport `<768px`、`pointer: coarse`、`hover: none`；细指针且可 hover 的窗口在 `<1440px` 时进入 Compact Desktop，包括 650–900px 的笔记本半屏。触摸设备 768–1023px 使用 Tablet。AppShell 将共享 helper 结果写入 `data-responsive-mode`，Bottom Navigation 只在 React 判定为 Mobile 时渲染。Quote Center 的搜索、类型、状态在全部模式保持单行 6:2:2，不再提供筛选 Sheet。
- 原因：ERP 的窗口宽度不能代表设备类型；Windows/Mac 半屏仍需完整导航、表格和报价操作。
- 证据：`components/foundation/responsive.ts`、`components/foundation/app-shell.tsx`、`app/globals.css`、`app/quote-center/responsive.css`、`features/quote-center/components/quote-list.tsx`、`tests/responsive-mobile-batch1.test.mjs`。

### D-026 quoteCode 保留但退出常规业务展示

- 日期：2026-08-24
- 决定：`Quote.quoteCode` 继续作为内部识别、搜索、日志、调试和导出 fallback 字段；详情标题、Sticky 摘要、搜索/最近访问和移动报价卡不主动展示。报价编号列表列保留为个人可配置字段，新用户默认隐藏。
- 证据：Quote Editor、Quote List、Quote Search Provider、quote settings 和 `tests/batch4-1.test.mjs`。

### D-027 基础设置与系统设置按资料性质分组

- 日期：2026-08-24
- 决定：基础设置只承载品牌、客户业务员、面料库和辅料库；系统设置承载报价设置、模板设置、用户权限和操作日志。模板/权限旧路由保留 bookmark 兼容，但导航归属为系统设置。
- 证据：`components/foundation/app-shell.tsx` 与系统设置路由。

### D-028 Sidebar 只有中间导航滚动且隐藏 scrollbar

- 日期：2026-08-24
- 决定：Desktop/Compact Sidebar 的 Brand/Organization 与 User Footer 固定，Navigation 独立滚动；Firefox `scrollbar-width:none` 与 WebKit scrollbar 隐藏仅影响视觉，不取消滚轮、触控板和 touch scroll。展开子菜单不得改变 Sidebar/Main 宽度。
- 证据：AppShell、`app/globals.css` 和 Batch 4.1 测试。

### D-029 全局 Audit Log 复用统一 OperationLog 数据源

- 日期：2026-08-24
- 决定：报价 Timeline 和系统全局 Dense Table 使用同一个 append-only OperationLog repository；全局读取只增加 `list()`，不提供 edit/delete。非报价系统动作允许 `quoteId=null`，由 module/entity 标识。
- 证据：`features/operation-logs/`、系统操作日志路由和权限 `audit_log.view`。

### D-030 全局搜索打开统一并由 query 驱动详情重载

- 日期：2026-08-24
- 决定：搜索结果、最近访问、鼠标点击和 Enter 统一经过 `openSearchResult`；打开前重新检查 Provider 权限。Quote Detail Loader 订阅 query `id` 并以 `Quote.id` 作为 Editor key，确保同路由导航和 Browser Back 都重载正确报价。
- 证据：Global Search Palette、Quote Detail Loader 和 Batch 4.1 测试。

### D-044 订单详情以款号为主、系统订单号只读

- 日期：2026-08-29
- 决定：单款 SalesOrder 详情以 `styleNo` 作为主标题，订单号由系统生成并只读弱化；客户 PO 归入单款执行资料。平均日产仅作为排单参考，不在普通订单详情中作为日常编辑字段展示。
- 原因：订单执行人员首先按款识别工作对象，同时避免系统身份字段被误改。

### D-045 订单详情离开必须保护未保存内容

- 日期：2026-08-29
- 决定：有未保存修改时，返回列表提供继续编辑、放弃并返回、保存并返回三种选择；保存并返回必须等待持久化成功后再导航。
- 原因：避免因路由切换丢失订单编辑内容，也避免保存失败后仍离开页面。

### D-046 排单中心采用生产组总览到单组队列的信息架构

- 日期：2026-08-29
- 决定：主入口先展示每个生产组一张聚合卡，再进入单组高密度队列；未排订单和异常保持独立视图。总览数量随生产组数量增长，不随款式数量成倍膨胀。
- 原因：生产管理首先按执行组查看负荷和队列，同时仍保留订单与异常入口。

### D-047 排单编辑不暴露内部工期口径

- 日期：2026-08-29
- 决定：UI 不显示“排期依据”或 `durationMode`。平均日产与所需工作日直接双向联动，以用户最后编辑的字段形成当前输入口径；正式计算仍由排单 Service 完成。
- 原因：减少内部模型术语对用户的干扰，同时保留两种常用录入方式。

### D-048 报价与订单列表复用统一 Table Preference

- 日期：2026-08-29
- 决定：列宽偏好通过 Foundation Repository 按 `userId + moduleKey + tableKey` 隔离保存；报价列表和订单列表复用 contract、各自拥有默认值和恢复默认能力。偏好不是业务数据，不写 OperationLog。
- 原因：统一个人视图能力，同时避免不同模块的列设置互相污染。

### D-049 结束排单将直接记录与队列建议明确分流

- 日期：2026-08-29
- 决定：首层结束弹窗同时提供“仅记录结束”和“结束并应用建议”；应用建议必须先展示后续排期变更预览，确认后才持久化。两条路径继续共享正式 ScheduleAssignment Service 与统一 OperationLog。
- 原因：常规结束操作不应被迫经过队列调整，同时任何后续排期移动都必须显式可见。

### D-050 面辅料跟进是低权威 Source

- 日期：2026-09-01
- 决定：《面辅料申购统计》只提供 Material Follow-up Source；销售合同与成衣分色分码继续分别作为订单字段和颜色数量的高权威来源。Style Progress 不反向覆盖正式订单。
- 原因：采购跟进表允许修正和缺行，不能替代合同与订单事实。

### D-051 当前预计到料日采用 Source / Effective / Actual 分层

- 日期：2026-09-01
- 状态：Superseded by D-065 / D-066。
- 原决定：`sourceMaterialDueDate` 保留来源，`expectedMaterialReadyDate` 是当前业务 Effective，累计入库达到需求推导 Actual 齐套日。首次导入与未人工修改的重导入跟随 Source；人工 Effective 不被重导入覆盖；恢复后使用当前 Source。Excel `厂供` 仅映射 `actualConsumption`。
- 原因：来源变化、人工判断和实际到料是不同时间事实，必须同时可追溯。

### D-052 款式进度只按销售合同号投影正式订单

- 日期：2026-09-01
- 决定：Style Progress 只用 `salesContractNo` 读取 SalesOrder；禁止款号、工厂款号、品牌或数量模糊匹配，禁止自动创建订单。无订单合同引导至艾诺科同步。
- 原因：复用正式订单去重与匹配边界，避免建立第二套 Matcher。

### D-053 逐物料物流复用现有排单和路线事实

- 日期：2026-09-01
- 状态：Superseded by D-065 / D-068。
- 原决定：逐物料建议扩展既有 `material-logistics-service.ts`，使用 Actual 齐套日，否则使用 Effective；使用最早相关正式 ScheduleAssignment，并在可行方式中选择最慢方式。缺排单或路线明确显示待配置，不猜运输方式。schemaVersion 11 将 Material ImportBatch、Raw、Demand、Events 与 Override 纳入既有 Backup / Restore。
- 原因：物流建议必须随排单与预计到料变化重算，同时保持唯一运输模型和恢复边界。

### D-054 未持久化的集货仓不得由 UI 或基础资料推断

- 日期：2026-09-01
- 状态：Active
- 决定：逐物料物流只把 `OrderExecutionTracking.supplyHubId` 视为订单的正式 SupplyHub。下拉首项、首个启用仓、唯一仓或唯一路线都不得自动成为业务事实；缺 Hub、Site、Route、TransportMode 时返回各自精确原因，只有 Hub 与 Site 均存在后才按稳定 ID 查路线。Style Progress 在具体 Batch 推荐或 Detail 中展示物流依据，主页面不重复整条依据卡；生产弹窗缺 Hub 时回显“未设置”。
- 原因：基础资料存在不等于订单已经选择；自动展示“宁波仓”会让用户误认为 D1935 已保存集货仓，并把前提缺失误报为路线缺失。

### D-055 Quote 搜索采用可组合的 AND 语法

- 日期：2026-09-04
- 状态：Active
- 决定：普通空格 token、`/字段 值` 结构化条件以及二者的组合均按 AND 计算；`/制作国家` 扫描 Quote 下全部 PriceVersion 的制作国家快照。
- 原因：报价人员需要在同一列表中把模糊身份信息与明确业务字段叠加筛选，不能因切换语法而丢失其他条件。

### D-056 颜色级取消是来源数量之上的追加调整

- 日期：2026-09-04
- 状态：Active
- 决定：部分取消不改写来源颜色行，以 append-only adjustment 计算有效数量；艾诺科重同步只更新来源数量，并保留全部人工取消记录。
- 原因：同步事实与人工业务决定必须分别追溯，重同步不得恢复已取消数量。

### D-057 默认加工币种只初始化新事实

- 日期：2026-09-04
- 状态：Active
- 决定：系统 `defaultProcessingCurrency` 当前默认 USD，只用于新建手工订单、新价格调整和新关账记录；既有订单价格、Quote 与 Closing 快照不重算。
- 原因：系统默认值是录入辅助，不是覆盖历史业务事实的全局口径。

### D-058 生产物料状态只消费 Style Progress Projection

- 日期：2026-09-04
- 状态：Active
- 决定：生产排单不再维护重复的手工物料日期；物料状态、异常与物流入口读取 Style Progress Projection。生产执行 UI 的承诺日期统一称为“拟定交期”。
- 原因：消除同一物料日期的双写与漂移，并让术语与当前业务语义一致。

### D-059 actualConsumption 读取 Excel 的精确数值列

- 日期：2026-09-04
- 状态：Active
- 决定：`actualConsumption` 读取表头“厂供”的实际用量数值，不再把“提供方式 = 厂供”转换为计划用量。旧错误快照仅在当前 ImportBatch Raw Snapshot 能确定对应数值时迁移，否则为 `null`。
- 原因：这是对已确认 Excel 列语义的实现纠正，不是新增的 AI 假设；供货方式与实际用量属于不同事实。

### D-060 关账采用月份总览到月份详情的工作流

- 日期：2026-09-04
- 状态：Active
- 决定：`/closing-center` 提供月份倒序、按年分组和状态筛选；`/closing-center/detail?month=YYYY-MM` 由路由月份决定归属、KPI、订单行和动作。`confirmed` 与 `locked` 保持独立，锁定后普通编辑被拒绝，高权限重开必须填写原因。
- 原因：月份状态需要先总览再进入单月工作面，同时确认与锁定承担不同控制强度，不能合并。

### D-061 厂供退出 Operational Material Control

- 日期：2026-09-05
- 状态：Active
- 决定：`提供方式=厂供` 保留 Raw Snapshot 与 Source Trace，但不进入采购跟进、未采购/待入库、齐套率、风险、物流推荐或 Expected Arrival Batch。普通 UI 只在存在厂供时显示“厂供信息”，不得把缺 PurchaseEvent 的厂供显示成未采购。
- 原因：厂供是来源信息，不是织序采购执行对象；把它纳入运营指标会制造虚假缺口。

### D-062 materialCode 降级为 Source Identity

- 日期：2026-09-05
- 状态：Active
- 决定：艾诺科 `materialCode` 只用于来源追溯，普通款式进度按 `salesContractNo` 内的 Canonical Material Group 展示真实物料。来源编码、规格和颜色继续保留在下层 Demand/Trace，不跨合同聚合。
- 原因：一个真实物料可能对应多个来源编码，Excel 行或编码不能直接充当用户物料身份。

### D-063 面料以名称、门幅、克重和唯一采购价归一

- 日期：2026-09-05
- 状态：Superseded by D-069。
- 决定：同一销售合同内，面料以标准化名称 + 门幅 + 克重 + 正常化后的唯一采购单价判定 Canonical identity。价格缺失或存在冲突时保持独立并显式标记，不取 first / last，也不计算平均采购价。
- 替代原因：当前业务明确要求同名面料在顶层合并，门幅、克重和采购价降级为组内 Variant 事实。

### D-064 辅料按标准化名称归一

- 日期：2026-09-05
- 状态：Superseded by D-069。
- 决定：同一销售合同内，辅料按标准化名称直接聚合；来源编码、规格和颜色不参与顶层身份，但必须保留在下层需求明细。
- 替代原因：D-069 以一条统一规则同时覆盖面料和辅料，并明确合同与物料类型隔离。

### D-065 Effective 是 Expected Arrival at SupplyHub

- 日期：2026-09-05
- 状态：Active
- 决定：Source 是艾诺科来源交期；Effective 正式定义为货物预计到达已持久化 SupplyHub 的日期，并由 Expected Arrival Batch 表达；Actual 只能由 InboundEvent 等实际事件产生。缺 SupplyHub 必须显示“集货仓未设置”，不得推断默认仓。
- 原因：跟进、运输推荐与预计到厂必须共享一个明确地点语义，同时保持来源、人工计划和实际事件分离。

### D-066 一个真实物料支持多批 Expected Arrival Allocation

- 日期：2026-09-05
- 状态：Active
- 决定：一个 Canonical Material 可保存多个 Expected Arrival Batch；Allocation 稳定引用 `materialDemandId`，允许一项 Demand 拆入多批和部分未安排，但全部批次累计不得超过需求数量，系统不得自动补齐。manual Batch 在重导入时保留，只有“恢复使用来源计划”才重新跟随 Source。
- 原因：真实到料经常分批且同一颜色跨批次，单日期模型无法表达执行事实。

### D-067 人工到料批次不绑定来源事件

- 日期：2026-09-05
- 状态：Active
- 决定：人工计划 Expected Arrival Batch 不强制绑定 PurchaseEvent、InboundEvent、ShipmentEvent 或 OutboundEvent，也不得按日期、数量、颜色或顺序自动猜测关联。计划与四类事件可以并排比较，但保持独立事实身份。
- 原因：缺少稳定外键时自动配对会制造无法审计的虚假关系。

### D-068 每批复用唯一物流服务并独立计算 buffer

- 日期：2026-09-05
- 状态：Active
- 决定：每个 Expected Arrival Batch 独立调用 `material-logistics-service.ts`，在可按时到厂的方式中选择最慢者；“距上线”是计划开工减预计到集货仓的自然日差，运输 buffer 是最晚到厂减预计到厂。`bufferDays > 7` 为 green，`0..7` 为 yellow，`< 0` 为 red / 晚 X 天。
- 原因：同一物料不同批次可能需要不同运输方式；距上线不是物流安全判断，不能混为一个数值或状态。

### D-069 Canonical Material 统一按合同、类型和标准化名称归一

- 日期：2026-09-08
- 状态：Active；替代 D-063 / D-064。
- 决定：Canonical identity 固定为 `salesContractNo + materialType + normalizedMaterialName`。同一合同、同一类型、同名的面料或辅料必须汇总为一个 Material Group；`materialCode`、颜色、规格、门幅、克重、采购价、供应商和采购单号只作为组内 Variant / Demand / Event 事实保留。不同合同或不同物料类型绝不交叉合并。
- 迁移：Style Progress IndexedDB v3→v4 确定性重映射旧 `canonicalMaterialKey`；保留所有 Expected Arrival Batch、Allocation、manual/source 语义和审计元数据，碰到无法证明安全归属的跨名称批次则拒绝猜测迁移。迁移幂等且不改变稳定 namespace。
- 汇总：需求、采购、入库、出运和出库只从组内 child Demand / 对应 Event 各累加一次；Group Ready 要求全部有效 child Demand 齐套。来源没有可靠单位字段时不猜测单位，也不跨虚构口径相加。
- 原因：普通工作台需要按业务人员识别的物料名称形成唯一顶层对象，同时完整保留执行层差异和来源追溯。

### D-070 艾诺科使用个人账号与 OS Credential Store

- 日期：2026-09-08
- 状态：Active
- 决定：正式关系为 `Zhixu User → 0..1 Personal Ainuoke Account`，不建立公司共享账号。Password 只存 Windows OS Secure Credential Store；Ainuoke token/session 只在 Local Bridge 内存中按 mock `User.id` 隔离。Bridge 只绑定 loopback，并使用精确 Origin allowlist、HttpOnly bridge session 与 CSRF nonce保护请求上下文。
- 限制：当前 Zhixu User 是 browser-local mock identity，前端 userId 不能视为生产可信身份；本实现只能称为本地 Windows 原型。艾诺科登录仍为 HTTP，bridge 到上游链路没有 TLS。
- 原因：保留艾诺科本人的权限和待办身份，同时阻止 credential/token 进入浏览器长期数据、业务模型、备份、日志或 Git。

### D-071 Direct API 只作为固定 Catalog 的 Source Adapter

- 日期：2026-09-08
- 状态：Active
- 决定：Direct API 只允许 `6086103`、`6086997`、`6087050`，Browser 传 catalog key 而不是 reportId。Bridge 负责 login/auth/paging/timeout/retry/sanitize/read DTO；来源快照保留 report、fetch timestamp、paging、total、source row identity、query context、schema 与 deterministic hash。
- 边界：6086103/6086997 后续进入既有 `AinuokeContractMirror` 和 matcher/service；6087050 后续进入既有 Material Normalize/Dedup/Validate/Preview/commitImport。本阶段不 commit，不提供 write endpoint，不创建第二套 Matcher、Dedup、Canonical resolver、Logistics 或 OperationLog。
- 原因：API 与 Excel 只是不同 Source Adapter；领域规则和持久化边界必须保持唯一。

### D-072 废弃旧历史排单与生产预警的未解决 Review backlog

- 日期：2026-09-09
- 状态：Active
- 决定：旧历史排单计划产生的 unresolved `schedule_match` 与旧生产预警/关账迁移产生的 unresolved `closing_match` 不再作为必须人工处理的迁移债务，允许用户通过 `/ainuoke-sync` 显式确认后精确清理。清理不是 load migration 或 validator 行为，且执行前必须完成 DEV Backup。
- 保留：`order_match`、`data_anomaly`、已经 resolved 的 `schedule_match` / `closing_match`，以及合同镜像、ImportRun、SalesOrder、排单、关账、生产基础资料和 Style Progress 全部保持不变。清理复用 `ainuoke.resolve_conflict` 与唯一 OperationLog，只记录删除数量元数据。
- 后续：真实排单与生产相关业务数据会以新的正式方式进入织序；该方式当前仍为 TBD，本决定不定义或猜测未来录入路径。
- 代码证据：`features/ainuoke-sync/service/ainuoke-historical-review-cleanup.ts` 与 `tests/ainuoke-historical-review-cleanup.test.mjs`。

### D-073 当前物料同步以 Direct API Snapshot 为准并共用唯一 Domain pipeline

- 日期：2026-09-09
- 状态：Active；Source 与 pipeline 决策保留，阶段性“只 Preview”写入边界由 D-074 接续。
- 决定：6087050 当前同步以 Ainuoke Direct API 当次返回为 authoritative Source Snapshot；历史 Excel 是导出时间点的 historical source。两者不要求 row-count、snapshot-hash、source-row-identity 或跨时间点数据 parity，不得为匹配旧 Excel 人为过滤当前 API 数据，也不得把某次 261/262 行固化为业务常量。
- 一致性边界：Excel/API 相同业务字段必须保持同一语义，并在各自 transport adapter 后进入唯一 Material Normalize / Dedup / Validate / Preview。API 字段只有在真实 metadata/rows 能证明语义时才映射，否则保持 `null`/empty。Canonical Material、厂供排除、Source/Effective/Actual、事件构建与物流规则不得在 API adapter 中复制或改变。
- 写入边界：Gate 3 只运行内存 Preview；不提供或调用 `commitImport`，不写 Style Progress Repository、ExpectedArrivalBatch、SalesOrder、Scheduling 或 Closing。真实 Material commit 必须由后续独立 Gate 再次明确授权。
- 代码证据：`features/style-progress/source/ainuoke-material-api-adapter.ts`、`features/style-progress/parser/material-normalization-pipeline.ts`、`features/style-progress/service/ainuoke-material-api-preview.ts` 与 `tests/ainuoke-material-api-preview.test.mjs`。

### D-074 6087050 只通过既有 commitImport 提交当前完整 Snapshot

- 日期：2026-09-09
- 状态：Active；2026-09-10 真实 DEV D1935 acceptance 已完成。
- 决定：6087050 API Material commit 的唯一路径为 Preview → 薄 `commitAinuokeMaterialApiPreview` orchestration → existing `styleProgressRepository.commitImport`。orchestration 只负责 `style_progress.import`、完整性/stale-preview 校验和既有语义 OperationLog，不复制 Normalize、Dedup、Validate、Canonical resolver、Event construction 或 Expected Arrival 规则。
- Identity / resync：ImportBatch identity 使用 reportId、normalized InsideOrderNo 与 canonical source row content，不使用 fetchedAt。同 Snapshot 重复提交新增为 0且不追加重复业务日志；新完整 Snapshot 按 affected contract scope 替换全部 prior-source current Demand/Event facts，而不只替换旧 API facts，历史 Excel/API Raw/ImportBatch Trace 保留。
- 业务保留：manual Effective 与人工 ExpectedArrivalBatch 不被重同步覆盖。Excel/API Demand ID 不稳定时只按确定性业务身份做唯一 remap，零或多候选 fail closed；source-following 批次刷新；Actual 只来自实际 Event；厂供保留 Raw/Trace 但退出采购、齐套、风险、物流与 Expected Arrival 运营指标。提交不修改 SalesOrder、Scheduling 或 Closing。
- 验收边界：UI 必须 Preview-first 并二次确认，提交绑定用户所见的 immutable Preview。2026-09-10 用户完成 DEV Backup 后本人确认 D1935 commit；AFTER 为 262 Source rows、255 Demands、12 Canonical（面料 2、辅料 10）与 183/153/150/150 四类 Events。旧 Excel operational facts 已退出，历史 Trace、manual Effective 和刷新持久化均通过验收。
- 代码证据：`features/style-progress/service/ainuoke-material-api-commit.ts`、`features/style-progress/repository/style-progress-repository.ts`、`features/ainuoke-sync/components/ainuoke-sync-page.tsx` 与 `tests/ainuoke-material-api-commit.test.mjs`。

### D-075 艾诺科统一同步只编排既有 Contract 与 Material 领域提交

- 日期：2026-09-10
- 状态：Active。
- 决定：API 日常入口以 `InsideOrderNo → 一次刷新 → 统一 Preview → 必要时一次确认` 聚合固定 6086103、6086997、6087050；统一层只接收受限 `insideOrderNo`，继续使用 Bridge Catalog，不接受 raw reportId、sqlCdtn 或 conditionList。
- 领域边界：读取分别复用 `buildAinuokeContractApiPreview` 与 `buildAinuokeMaterialApiPreview`；确认分别调用 `commitAinuokeContractApiPreview` 与 `commitAinuokeMaterialApiPreview`。Matcher、Order mutation、Material Normalize/Dedup/Canonical、`commitImport`、Expected Arrival 与 OperationLog 均保持既有唯一实现。
- No-change / 权限：合同与物料都无变化时不要求确认，也不产生 ImportRun、Repository write 或 OperationLog。合同写仍要求 `ainuoke.sync`，物料写仍要求 `style_progress.import`；统一 Preview 只要求 `ainuoke.view`，不新增超级权限。
- Failure safety：当前 browser-local Repository 无法提供跨领域 ACID。确认前必须完成两侧 validation、immutable Preview 与本地 baseline stale guard；提交顺序为 Contract → Material。合同成功而物料失败时明确返回 partial failure，不伪造 rollback；用户重新刷新后依靠两侧既有幂等只提交仍有变化的领域。
- 真实验收：2026-09-10 alternate/isolated Browser Profile 首次 D1935 统一 Preview 显示 contract auto-create 1 与 material changed；用户本人确认后两侧均 success，随后同一 D1935 只读刷新两侧均 no-change。该 Profile 的 `0/0/168 → 1/1/169` 不能标作 Gate 3C 原真实 DEV dataset。回到 Gate 3C 同一 Chrome Profile 后，D1935 原有 12 Canonical（2 fabric + 10 trim），SalesOrders/Mirror/ImportRuns 为 464/487/4；一次只读统一刷新显示 Contract changed、Material no-change，确认按钮出现但未点击，未执行 commit。
- 代码证据：`features/ainuoke-sync/service/ainuoke-unified-sync.ts`、`features/ainuoke-sync/components/ainuoke-sync-page.tsx` 与 `tests/ainuoke-unified-sync.test.mjs`。

### D-076 正式 SalesOrder 采用 Ainuoke clean bootstrap，Browser Order/Scheduling 测试数据不迁移

- 日期：2026-09-10
- 状态：Active；只确认长期数据边界与 bootstrap 方向，不授权 Phase 2B、真实 bootstrap 或任何删除。
- 决定：未来正式 SalesOrder 从 empty PostgreSQL 经固定 Ainuoke discovery 和 6086103/6086997/6087050 detail reads 建立新的正式 PostgreSQL identity；当前 Browser Order Center / Scheduling 是功能测试数据，不是 migration/bootstrap authority，也不要求继承其 SalesOrder ID。新正式 identity 一旦建立必须保持稳定，以承载未来 Zhixu-owned state、Quote/reorder provenance、Scheduling、Closing 与 OperationLog references。
- 保护边界：Quote Center 的 Quote/Revision/PriceVersion/provenance/附件是真实业务数据并必须保护；Style Progress/Material 不属于 Order/Scheduling retirement 范围；Closing retirement status 仍为 Needs Decision。
- Discovery scope：当前只证明 6086103 空条件列表可完整遍历 `current_account_visible`，不能声称 company-wide。完整 Snapshot 内所有 visible contracts 都参与 future clean bootstrap；`生效`、`草拟` 或其他 raw Status 不作为 inclusion/exclusion filter，仅作为 source fact 保留供显示、审计、排查和未来可能的业务规则。当前观察到 505（生效 143、草拟 362）只属于本次 Snapshot，未来以当次完整 Snapshot 为准。账号 visibility scope 仍需确认；source disappearance 不得单独触发 hard delete。
- Retirement：旧 Browser Order/Scheduling 可以在未来退役，但只能通过独立 Test Business Data Retirement Gate；必须先完整 backup、dependency audit、精确 delete/protect scope，并取得用户 explicit destructive confirmation。此决定本身不授权清理。
- 证据：`docs/features/AINUOKE_ORDER_DISCOVERY.md`、`docs/features/SALES_ORDER_PERSISTENCE.md`、`features/ainuoke-api/source/ainuoke-order-discovery-adapter.ts` 与 Discovery/Bridge tests。

## Needs User Decision

### D-079 6087105 是否取代 6086997 作为正式颜色/分码来源

- 日期：2026-09-11
- 状态：Needs User Decision；不是 Active source replacement。
- 候选证据：6087105 固定只读路径、exact post-filter、typed adapter 与全量 current-account validation 已通过。authoritative run 的 511/511 queries 成功；497 个 usable-color orders 的 `sum(SizeNum)` 全部等于 6086103 contract quantity；旧 34 blockers 中 31 resolved、3 invalid、0 missing、0 quantity-warning-only。
- 保留边界：6086997 catalog、adapter、tests 与 Phase 2B2 历史证据全部保留；现有默认 Bootstrap Color Source 未切换。只有用户明确批准后，下一独立阶段才能切换 Preview source 并重新运行 fresh full Bootstrap Preview。
- 证据：`features/ainuoke-sync/source/ainuoke-garment-color-size-adapter.ts`、`features/ainuoke-sync/service/ainuoke-garment-color-size-validation.ts` 与 `docs/features/AINUOKE_GARMENT_COLOR_SIZE_SOURCE.md`。

## Superseded

### D-039 新订单中心使用 SalesOrder + OrderItem 多款聚合

- 日期：2026-08-27
- 状态：Superseded by D-040。
- 旧决定：SalesOrder 承载订单头，OrderItem 承载款式执行事实与 Quote 来源；一张订单允许多款，翻单保存 `sourceOrderItemId`，未来 ProductionPlan/ClosingAllocation 以 OrderItem 为 owner。
- 替代原因：最新业务规则明确一张 SalesOrder 只允许一个款式。v6 已将 OrderItem 限定为 migration-only `LegacyOrderItem`，所有新 Runtime 关系直接归属 SalesOrder。
- 历史证据：第三批 v5 模型与 `tests/order-center.test.mjs` 的旧版本；当前迁移器仍能读取该结构。

### D-034 制作国家预设形成 Revision 报价参数与费用快照

- 日期：2026-08-26
- 状态：Superseded by D-035。
- 原决定：制作国家、预设 ID、加工币种和加成率保存在 QuoteRevision，并把预设运费同步到全部 PriceVersion。
- 替代原因：同一 Revision 的并列 PriceVersion 需要独立制作国家、币种、加成率和运费，Revision 级口径会互相覆盖。

### D-S05 报价明细以 1200/700 纯 viewport 选择 Full/Compact

- 原状态：D-025 使用 `>=1200px` Full、`700–1199px` Desktop Compact，并以 Container Query 作为回退。
- 替代：D-031 让 Card 实际内容宽度决定 Wide，并只用 `700–1099px` 保护半屏完整编辑。
- 处理：保留 D-025 的 Compact `3 + 6`、`3 + 4`、`2 + 4` 分组、共享 ViewModel/row ID/回调/公式及 True Mobile 边界；替换会在缩放后桌面制造横向滚动的固定 viewport/表宽规则。

### D-S04 成本 renderer 只由 Card 容器宽度决定

- 原状态：D-024 使用 `>=1150px` 宽表、`700–1149px` 紧凑卡、`<700px` 窄卡的纯 Container Query。
- 替代：D-025 为报价明细增加 1200/700 视口边界，Container Query 降为嵌入式回退。
- 处理：保留 renderer 共享状态、焦点交接和无横向滚动约束，替换会让半屏过早进入窄布局的选择规则。

### D-S03 仅用四级 width 断点决定 Mobile

- 原状态：D-022 使用 `<768px => Mobile`，并让 Quote Center Mobile 筛选进入 Bottom Sheet。
- 替代：D-023 使用 viewport + hover/pointer 共同决定全局模式，筛选始终直接显示为 6:2:2。
- 处理：保留四级布局名称和手机轻编辑能力，但纯 width 的全局设备判断与筛选 Sheet 已废止。

### D-S01 “项目尚无 Foundation”审计结论

- 原状态：`docs/ui-audit.md` 在 2026-08-17 记录了当时缺少 Foundation 的现状。
- 替代：当前已存在 `components/foundation/` 并被 Quote Center/基础设置使用。
- 处理：保留原文作为历史审计，不再用于判断当前实现。

### D-S02 Quote Center 迁移计划作为现状依据

- 原状态：`docs/quote-ui-migration-plan.md` 描述计划中的结构和步骤。
- 替代：当前代码、测试以及 `docs/features/QUOTE_CENTER.md` 是现状依据。
- 处理：迁移计划继续作为设计背景，未实现条目不能视为当前承诺。

## Deprecated

### D-D01 `currentRevisionId` 作为当前版本指针

- 状态：只为旧存储数据兼容保留。
- 新代码：写入和读取应优先使用 `defaultRevisionId`。

### D-D02 历史浏览器存储版本

- 状态：基础设置 repository 可读取旧版本 key 并迁移，但新数据写入当前 key。
- 约束：不要以旧 key 的结构扩展新功能；保留兼容读取直到有明确数据迁移/清理决定。
