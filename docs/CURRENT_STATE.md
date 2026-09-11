# 当前状态

> 状态快照：2026-09-11。这里只保留当前真实状态，不记录开发流水账。

## 当前阶段

- 当前 Active Task 为 `feat/postgres-salesorder-foundation`，起点为 `2349aedd6538e4d80382db14f8cfa4590fbe9c86`。Phase 2B1 Server Foundation 已完成实现，正在进行最终文档/门禁/PR 收口；它不是正式订单上线或 Browser cutover。
- 当前稳定基线：`main` / `origin/main` 为 `2349aedd6538e4d80382db14f8cfa4590fbe9c86`（PR #13、#15、#16 已 merged）。
- PR #6 已 merged；Navigation / Quote Cockpit / name-only Canonical Material / Production Infrastructure 与 ExpectedArrivalBatch migration hardening 已正式进入 `main`。
- PR #4 已 merged；Material Control Tower V2 Gate 1–5 已正式进入 `main`。
- PR #3 对应的 Full UI Workflow Correction 与 Second Acceptance 提交也已进入 `main`。
- 前一任务 `feat/ainuoke-unified-sync` 已通过 PR #12 合并；Gate 4 继续作为稳定既有能力，不是本轮 server migration 的迁移对象。
- `面辅料申购统计 (1).xlsx` 的既有审计仍是有效的历史 Source Trace 与字段语义证据，但不是当前同步的 authoritative snapshot。当前同步以 6087050 Direct API 当次返回为准；不同时间的 Excel/API 不要求 row-count、hash 或 row identity parity，也不得为匹配历史行数过滤实时数据。

## 当前可运行边界

- 根路径 ERP 已具备本地 Docker + PostgreSQL 的可运行形态。
- Node server 可独立运行：DEV API 默认 `127.0.0.1:3100` 并由 3001 Vite 同源代理；Compose `server-foundation` profile 在 3002 提供 Node static + `/api/v1/*`。Phase 2B1 已加入 PostgreSQL SalesOrder read foundation；legacy 3000 runtime 暂时保留。
- Quote Center、新订单中心、生产排单、款式进度、关账中心和相关设置仍使用浏览器 Repository；尚不是服务端多用户生产实现。
- DEV 固定使用 `127.0.0.1:3001`，PROD Docker 固定使用 `127.0.0.1:3000`，两者依靠 Origin 隔离数据。
- 当前浏览器 local data `schemaVersion = 13`，Style Progress IndexedDB version = 4；旧记录只做非破坏迁移，不自动清空或用 Seed 覆盖。

## 本轮完成状态

### PostgreSQL Phase 2B1 — SalesOrder Server Foundation

- Forward-only migration `0002_sales_order_foundation.sql` 新增 `sales_orders`、`sales_order_source_links`、`ainuoke_sales_order_contract_mirrors`、`ainuoke_sales_order_color_mirrors`。没有修改 legacy `orders`/`api_dispatch` 或任何 Browser schema/key。
- `sales_orders` 使用 PostgreSQL UUID 正式 identity、规范化唯一 `order_no`、不可变 creation provenance、独立 Zhixu lifecycle 与 optimistic `version`。source refresh 不改变 identity/provenance/version。
- source link 的 `(source_system, source_entity_type, external_id)` 由数据库唯一约束保护，binding identity 与 `sales_order_id` 不可更新；Ainuoke contract/color 作为独立 current source mirror 保存 typed facts，颜色 refresh 替换 source-owned slice。
- PostgreSQL repository 使用参数化 SQL，提供 create/get/list/source lookup/mirror refresh/optimistic update。列表使用 order number + UUID 稳定排序，读取为 composed typed projection而不是 DB row/raw payload。
- `createAinuokeSalesOrder` 使用单 transaction + source-scoped advisory lock。重复 source identity 幂等返回既有 SalesOrder ID/version，不创建第二单或第二条日志；首次创建把 aggregate/link/contract mirror/color slice/trusted OperationLog 一次提交，任一步失败全部 rollback。
- actor 来自独立 `TrustedIdentity`，不在 service input/request body 中；server OperationLog 保存可信 actor FK/public ID/name snapshot。
- 新增只读 `GET /api/v1/sales-orders` 与 `GET /api/v1/sales-orders/:id`，复用现有 `order.view` 和 Trusted Session，分别覆盖 401/403/404/permitted read；两个不同 trusted sessions 从同一 PostgreSQL 读取相同 SalesOrder UUID/version。
- Browser Order Center 仍使用既有 Browser Repository。Phase 2B1 没有 live Ainuoke read/write、真实 505 bootstrap、Browser test-order migration/cutover/dual-write，也没有 Quote、Style Progress、Scheduling、Closing migration 或 mutation。
- 下一阶段是 Phase 2B2 Bootstrap Preview / Dry Run：Discovery → detail reads → PostgreSQL bootstrap candidate projection → reconciliation → preview report。它仍不得执行真实正式 bootstrap。
- Phase 2B1 最终门禁：PostgreSQL integration 12/12、Full Tests 577/577、TypeScript、零警告 ESLint、server build、Production Build 30 routes 与 `git diff --check` 全部 PASS。frontend build 仍报告既有 chunk-size advisory，不影响成功退出。

### Style Progress Performance Pass

- 确定性 1k/5k/10k/20k Demand profiling 已覆盖真实 `styleProgressRepository.loadAll()`、`buildStyleProgressProjections()`、完整 `loadStyleProgress()` 和 DataTable SSR。使用 Node 进程内隔离 fake IndexedDB，不读取或写入 DEV/PROD Browser 数据。
- 根因一：Expected Arrival Batch 在每 Demand 和每 Canonical Material 层重复全表扫描；现已建立 Demand 索引并保持原始 Batch 顺序、Allocation 过滤与唯一物流 Service。10k Projection 由 3,866.5ms 降至 175.2ms（22.07× / 95.5%），20k 由 14,203.2ms 降至 358.0ms（39.68× / 97.5%）。
- 根因二：每合同重复扫描全部 ScheduleAssignment；现已一次建立 active assignments by SalesOrder Map，并继续按原规则选最早 plannedStartDate。tracking Map 保持不变。
- 根因三：列表加载读取并多次 clone/validate 不参与 Projection 的 Raw Snapshot 与 ImportBatch Trace，Allocation 校验还逐 Demand 线性回查；现有轻量 Projection read model 跳过 Trace store，详情/Import/Backup/Migration 继续使用 `loadAll()`，validator 改用 Demand Map。20k 完整首次 loader 由 13,511.8ms 降至 1,097.3ms（12.31× / 91.9%）。
- 优化前后 20-Demand 完整 Projection JSON 稳定 hash 一致，轻量/full read model 的业务 Projection deep-equal；manual Expected Arrival、Canonical sorting、空数据和两类索引均有专项回归。IndexedDB version/store/index 未改变，未引入 pagination、virtualization 或 Worker。
- 完整 benchmark 表和长期边界见 `docs/features/STYLE_PROGRESS.md`。最终门禁：专项 50/50、Full Tests 577/577、TypeScript、零警告 ESLint、Production Build 30 routes 与 `git diff --check` PASS。

### Ainuoke Order Discovery Gate

- Stage A PASS：从真实“成衣销售合同”页面确认固定报表 6086103 的空条件列表协议。它不要求预知 InsideOrderNo/SalesContractNo，使用 `POST /kaijin/report/report/getReportObjAndData`，并以实时 total 分页到确定终点。
- 当前绑定账号两次完整只读遍历均返回 505 行、11 页；505 个 source ID、InsideOrderNo、SalesContractNo 及 pair 均唯一，无重复页。normalized SHA-256 两次均为 `37d8e7860e3157cb3022657a4b4ce2223a53876383aec701c685431a5945b744`。
- 当前完整 Snapshot 观察到 505 条：raw status `生效=143`、`草拟=362`。用户已确认全部 Discovery-visible 合同都是未来 clean-bootstrap candidate，Status 不参与 inclusion/exclusion；Status 仍作为 source fact 保留。505 只是本次 Snapshot 数量，未来以当次完整 Snapshot 为准。
- D1935 与另外 5 个脱敏样本均通过 6086103/6086997 identity/detail cross-check。Source scope 只能确认 `current_account_visible`，不能称为全公司订单；账号权限/组织范围仍需在正式 bootstrap 前确认。
- Stage B 新增固定 `order_discovery` allowlist、精确空 query builder、typed full-pagination client、最小 Discovery Row/Snapshot 与 whole-list deterministic hash。DiscoveryRow 不是 SalesOrder；没有业务 Repository、PostgreSQL 或 commit 依赖。
- Source 消失不能区分删除、权限变化、筛选变化或上游失败；未来不得仅凭缺失 hard-delete，需 last-seen/missing/tombstone reconciliation。
- 当前 Browser Order Center / Scheduling 是测试数据，不作为正式 PostgreSQL migration source 或 bootstrap authority；历史 464 不是迁移清单。Quote Center 是真实业务数据并必须保护，Style Progress/Material 不在 retirement 范围，Closing retirement 状态待决定。
- 旧 Browser Order/Scheduling 删除未获授权。未来必须另立 Test Business Data Retirement Gate，先完整 backup、dependency audit、精确 delete/protect scope，再取得 explicit destructive confirmation。
- 本 Gate 自动门禁：Discovery 专项 6/6、Full Tests 571/571、Python Bridge 34/34、TypeScript、零警告 ESLint、Production Build 30 routes、secret scan 与 `git diff --check` 全部 PASS。
- 详细协议与证据见 `docs/features/AINUOKE_ORDER_DISCOVERY.md`。该 Discovery Gate 本身没有执行 bootstrap；后续 Phase 2B1 只完成了隔离 server foundation，仍未执行任何真实 bootstrap。

### PostgreSQL Server Persistence Migration — Phase 1

- PR #13 已 merged；Phase 1 在 `main` 完成，以下 server/migration/Auth/RBAC/OperationLog 能力是稳定基线，不是本轮待实现内容。
- 新增 `server/` Node/TypeScript runtime、`pg` pool、graceful shutdown、静态文件服务和结构化错误；数据库凭据只读取 server environment。`/api/v1/health` 对数据库不可用返回 503。
- 新增 `database/migrations/` 和 `schema_migrations` ledger。runner 按版本排序，使用 advisory lock、逐文件 transaction 和 SHA-256 checksum；rerun no-op，漂移/缺失/失败 fail closed，没有自动 down。
- `app_users` 仍是唯一身份源；新增唯一、不可变 UUID `public_id`。V1 session 只保存随机 token 的 SHA-256 digest，支持 expiry、logout/revocation、inactive rejection 和 15 分钟 10 次失败限制；cookie 为 HttpOnly/SameSite Strict，production 强制 Secure。
- PostgreSQL RBAC 使用 `app_roles/app_permissions/app_user_roles/app_role_permissions`，权限目录从现有纯 TypeScript `PERMISSION_KEYS` 唯一同步。授权只比较 permission key，不判断角色名称或提供 admin bypass。
- 新 `operation_logs` 与 legacy `audit_logs` 分离，保存 internal actor FK + stable public ID/name snapshots、operationId、上下文和 before/after/changes/metadata；DB trigger 拒绝 UPDATE/DELETE，API 只提供 `audit_log.view` 只读列表。
- 新 API 为 `/api/v1/auth/login|logout|me|permissions` 与只读 `/api/v1/operation-logs`。server 不信任 body/header 中的 userId/role/permissions，不提供通用 SQL 或 client append log endpoint。
- PostgreSQL integration 使用随机一次性 PG16 tmpfs 容器，覆盖 migration、legacy schema compatibility、auth/session、RBAC spoof/403、OperationLog append-only 和 health；不会连接真实 DEV/`zhixu` 数据库。
- Phase 1 最终门禁：Full Tests 565/565、PostgreSQL integration 9/9、TypeScript、ESLint、server build、Production Build 30 routes、Compose config、production container health/static/cookie/session digest/trusted identity、secret scan 与 `git diff --check` 全部 PASS；一次性容器均已清理。
- 未创建 SalesOrder 或其他业务表，未导入/修改 browser repository 数据，未迁移 Ainuoke/Quote/Style Progress/Scheduling/Closing/附件，也未修改 legacy `customers/quotes/orders/schedules/audit_logs/api_dispatch`。

### PostgreSQL Persistence — Phase 2A SalesOrder Ownership Audit

- PR #14 已 merged。字段级证据见 `docs/features/SALES_ORDER_PERSISTENCE.md`；Ainuoke source facts + Zhixu-owned aggregate 的组合边界仍有效。
- 原 A/B/C Browser classifier/hybrid import 建议保留为历史分析，但已被当前 Browser Order/Scheduling migration strategy supersede：这些是测试数据，不作为正式 bootstrap authority，也不要求继承当前 Browser SalesOrder ID。
- 未来正式 PostgreSQL SalesOrder 从 discovery/detail facts 新建稳定身份；身份一旦建立仍必须长期稳定，以承载未来 Quote/reorder provenance、owned state、Scheduling、Closing 与 OperationLog references。
- Discovery blocker 已在本 Gate 解决到 `current_account_visible` 范围，且 all-visible-contracts/no-status-filter 规则已确认。Phase 2B clean-bootstrap schema/API design 技术前置已具备，但 visibility scope/retention 仍需用户决定，且本任务没有 Phase 2B 或真实 bootstrap 授权。

### Ainuoke Unified Order + Material Sync Gate 4

- `runAinuokeUnifiedPreview` 只接收 `insideOrderNo`，通过现有 Bridge client/catalog 并行读取固定 6086103、6086997、6087050，再分别调用既有 `buildAinuokeContractApiPreview` 与 `buildAinuokeMaterialApiPreview`。Browser 仍不能提交 raw reportId、sqlCdtn 或 conditionList。
- Unified Preview 汇总合同身份/数量/分色/交期/matcher disposition 与物料 Source/Canonical/Demand/Event/厂供/阻断信息，并把用户可理解的状态归纳为 `no_change | changed | blocked`；技术 hash 只用于 immutable Preview 与本地 baseline stale guard。
- Unified commit 固定先调用既有 Contract commit，再调用既有 Material commit；任何一侧 Preview blocking 时不允许提交。两侧权限继续分别为 `ainuoke.sync` 与 `style_progress.import`，只要求实际发生变化的领域权限，不新增超级权限。
- 当前 browser-local Repository 无跨领域 ACID transaction。合同成功、物料失败时明确返回 partial failure，不伪造 rollback；用户重新“刷新艾诺科”后，已成功合同侧会成为 no-change，只重试仍有差异的一侧，复用两侧既有幂等和 OperationLog 规则。
- `/ainuoke-sync` 的 API mode 现只保留一个主动作“刷新艾诺科”。统一结果同时展示合同数量/分色/交期/matcher 变化和物料 Source/Canonical/Demand/Event 变化；两侧均 no-change 时明确显示“已是最新，无需同步”且不出现确认按钮。有变化时只有一个确认 Modal，并明确 Contract → Material 顺序与 partial-failure 边界。
- 2026-09-10 alternate/isolated Browser Profile 的 D1935 live commit acceptance 使用当前用户个人 Ainuoke credential 完成三报表读取。该 Profile 在刷新前为 mirror/import run/order `0/0/168`，因此首次统一 Preview 如实显示合同 auto-create 1 和物料 Snapshot changed；合同为 PI2607-235、4,640/4,640、数量差异 0、颜色 5、交期 2026-10-13，物料为 262 Source rows、12 Canonical（面料 2、辅料 10）、255 Demands 与 183/153/150/150 Events，无阻断。该数据集不能再称为 Gate 3C 原真实 DEV Profile。
- 用户本人在该 alternate/isolated Profile 的统一确认 Modal 点击确认后，页面返回 contract `success`、material `success`；mirror/import run/order 为 `1/1/169`。款式进度列表中的 D1935 为面料 2、辅料 10。随后再次执行同一只读刷新，两侧均为“已是最新”，create/update/bind/review 全为 0且不再显示确认按钮，因此没有第二次业务提交或重复日志。浏览器 console 共 4 条、error 0、secret-pattern 命中 0。
- Merge 前重新使用 Gate 3C 同一 Chrome Profile 只读验收：进入刷新前已确认 D1935 `12 Canonical / 2 fabric / 10 trim`，SalesOrders 464、Mirror contracts 487、ImportRuns 4。一次“刷新艾诺科”后 Material 为 `no_change`，仍为 262 Source rows、12 Canonical、255 Demands 与 183/153/150/150 Events；Contract 为 `changed`，显示 quantity change 1、delivery change 0、color change 1、would update 1，create/bind/review 均为 0。确认按钮按设计出现，但未打开 Modal、未点击确认、未执行任何 unified commit；因此本次不是双侧 no-change acceptance，现有 464/487/4 业务计数保持不变。
- 本次统一提交没有调用 Ainuoke write API，也不接入 Scheduling 或 Closing Repository。真实验收没有为这两个无关领域另造 mutation；其不变边界由编排依赖和隔离回归覆盖。当前 browser-local Repository 仍无跨领域 ACID，partial failure 的明确结果与安全重试规则继续有效。
- Gate 4 最终门禁：统一/Contract/Material 定向回归 44/44、Full Tests 565/565、TypeScript、ESLint、Production Build 30 routes 与 `git diff --check` 全部 PASS。Bridge 未修改，因此未重复运行 Python Bridge tests。

### Ainuoke 6087050 Material API Gate 3A/B + Gate 3C Live Acceptance

- 6087050 Direct API 已通过薄 transport adapter 进入唯一 Material source-neutral Normalize / Dedup / Validate pipeline；Excel 继续通过原 semantic-header adapter 进入同一 pipeline。API trace 保存 reportId、sourceRowIdentity、snapshotHash、fetchedAt、InsideOrderNo 与 schema，不伪造 fileName、sheetName 或 rowNumber。
- 当前同步的 source of truth 是 6087050 Direct API 当次 Snapshot；历史 Excel 只作历史来源、字段语义参考与回归输入。两种 Source 的共同约束是字段语义与 Domain pipeline 一致，不是不同时间点的行数一致。
- API adapter 只映射真实字段证据。Canonical identity 仍为 `salesContractNo + materialType + normalizedMaterialName`；materialCode、颜色、规格、门幅、克重与价格只保留为 child facts。`MSingleName` 不等价于 Excel“申购实际名称”，因此不映射 `sourceActualName`；当前也没有充分证据证明 6087050 某字段等价于 Excel 数值列“厂供”，因此 API `actualConsumption` 保持 `null` 并给出 warning。`提供方式=厂供` 仍保留 Raw/Trace 但退出 operational projection。
- Gate 3C 增加的薄 orchestration 只负责 `style_progress.import` 权限、完整性与 stale-preview 校验，把 API Preview 转为既有 `MaterialImportBatch` / `MaterialRawSnapshot` trace 后调用唯一 `styleProgressRepository.commitImport`。Adapter、Normalize/Dedup/Validate、Canonical resolver、Event construction、Expected Arrival 和 OperationLog 均未复制。
- Gate 3C 建立的物料 Preview-first、immutable Snapshot 与二次确认边界继续有效；Gate 4 已把它纳入统一 Preview/确认 Modal，不再提供并列的独立“运行物料 API 预检”主动作。内容 hash 不一致、分页不足、total 不一致、identity collision、blocking validation 或权限不足仍全部 fail closed。
- API ImportBatch identity 使用 reportId + normalized query + canonical source row content 的稳定 hash，不使用 fetchedAt；同一完整 Snapshot 重复 commit 返回全部新增为 0，且不追加重复业务 OperationLog。完整 6087050 Snapshot 会按 affected contract scope 替换全部 prior-source current Demand/Event facts，而不只替换旧 API facts；历史 Excel/API Raw Snapshot 与 ImportBatch Trace 均保留。
- `expectedDateSource=manual` 的 Effective 与人工 ExpectedArrivalBatch 在重同步时保留。Excel/API Demand ID 不稳定时只按确定性业务身份做唯一映射，零或多候选 fail closed；仍跟随 Source 的批次按新 source due date 更新。Actual 继续只来自实际 Event，厂供仍保留 Raw/Trace 并退出 operational projection。
- Canonical Material 的统一业务排序在 Style Progress Projection 形成处执行：全部面料先于辅料；面料优先按 actualConsumption DESC，缺少真实 actual 时按 plannedConsumption DESC，再按 sourceSortNo 与稳定 Canonical key；辅料按 sourceSortNo 与稳定 key。详情、筛选、风险和下游消费者共享同一顺序。
- 2026-09-09 D1935 真实只读验收：6087050 HTTP 200，共 6 页、实时 total/source rows 262，unique source identities 262，repeated upstream `id` groups 1；pipeline accepted/rejected 为 262/0，Canonical groups 12（面料 2、辅料 10），厂供 Source rows 6，operational groups 12，Demand 255，Purchase/Inbound/Shipment/Outbound events 为 183/153/150/150，Demand/Event duplicates prevented 为 7/6，source identity collision 0。
- Gate 3A/B 验收浏览器网络只出现 bridge session/account 与 `material_purchase_statistics/query`；6 次报表查询均 HTTP 200。预检前后页面 mirror/import run/order 计数保持 0/0/168；没有 persisted Style Progress、ExpectedArrivalBatch、SalesOrder、Scheduling 或 Closing 写入。
- 第一次真实 commit 暴露出 15 个 current Canonical（面料 5、辅料 10）与 Preview 12 个不一致：额外的汗布、罗马布、棉毛布共 20 个 Demand 来自旧 Excel 批次，根因是 replacement scope 只清理 `sourceKind=api`。修复后完整 API Snapshot 会移除这些 prior-source operational facts，同时保留历史 Excel ImportBatch/Raw Trace。
- 2026-09-10 用户已在正式 destructive action 前完成 DEV Backup，并本人通过二次确认 Modal 执行修复后的 D1935 commit。持久化结果为 262 Source rows、255 Demands、12 Canonical（面料 2、辅料 10）与 Purchase/Inbound/Shipment/Outbound 183/153/150/150；6 条厂供 Source rows 仍为 trace-only。旧 Excel operational Demand 已全部退出 current projection，两个 Excel ImportBatch/Raw Trace 与 API 262-row Trace 均可从来源历史查看。
- 真实页面 All/Fabric/Trim 筛选顺序一致：面料全部在辅料之前；API 面料 `actualConsumption=null` 时按 plannedConsumption DESC，辅料按 sourceSortNo。刷新页面后仍为 12 / 2 / 10 且顺序不变。
- 人工 Expected Arrival 批次 `material-arrival-1vs1nr7` 与 manual Effective `2026-09-01` 已保留并唯一重映射到当前 API Demand；source-following 计划按新 Source 刷新，厂供没有 Expected Arrival allocation。新增的“导入面辅料跟进” OperationLog 只含 report/query 与 262/255/183/153/150/150 数量 metadata，不含 secret。
- 轻量业务边界复核 PASS：页面可见 SalesOrders 仍为 464；最新业务日志只有 Material import，commit 实现与自动化防护均不引用或写入 SalesOrder、Scheduling、Closing。未对这些无关 Store 做第二次全量审计，也未执行第二次 Material commit。
- Gate 3C 最终门禁：定向 Material/Contract/Style Progress 回归 78/78、Full Tests 555/555、TypeScript、ESLint、Production Build 30 routes 与 `git diff --check` 全部通过；secret leakage fixture/state/log scan PASS。Bridge 未修改，因此未重复运行 Python Bridge tests。

### Ainuoke Personal Account + Direct API Contract Sync Gate 2

- 正式关系为 `Zhixu User → 0..1 Personal Ainuoke Account`；Password 只进入 Python keyring / Windows Credential Manager，Ainuoke JWT 与 bridge browser session/CSRF 只在进程/页面内存。账号、token/session 不进入 localStorage、sessionStorage、IndexedDB、Backup / Restore 或业务实体。
- Bridge 只允许 `127.0.0.1` / `::1` bind，CORS 只允许 `http://127.0.0.1:3000` 与 `http://127.0.0.1:3001`；账号/报表请求通过 HttpOnly bridge session + CSRF nonce 取得 mock user context。当前 userId 仍由 browser-local mock identity 启动会话，不是生产可信认证。
- Personal Account API 已提供 GET/PUT/test/DELETE；GET 不返回 secret，PUT 先真实验证再替换，失败保留旧 credential，DELETE 同时清 credential、token 与该用户 bridge session。
- 已确认 base `http://61.164.81.194:9043`、login `/kaijin/system/user/loginsys2`、Generic Report `/kaijin/report/report/getReportObjAndData` 与 `rungingSysId=6080183` Cookie context。报表按真实 `Authorization/Token/kaijin_my_token`、JSON `sqlCdtn`、report-specific InsideOrderNo condition 与 JSON-string `dataList` parser 工作，不使用 `Bearer` 或通用 `{reportId,page,pageSize,query}` 假设。
- 固定只读 Catalog 只有 6086103 / 6086997 / 6087050；Browser query DTO 只有 `insideOrderNo`，不能提交 raw reportId/formId/sqlCdtn/conditionList。source snapshot v2 保留 report、fetch time、paging、total、query context、canonical-row source identity、schema 与 deterministic hash。6087050 repeated id 不碰撞，unknown report、malformed dataList 与 write-like endpoint fail closed。
- `/my-settings/ainuoke-account` 提供本人用户名、密码输入、状态/验证时间、测试、保存/更新密码与解除绑定；密码不回填。self-scoped `ainuoke.account.bind_self` 与业务合同 `ainuoke.bind` 分离，且不会授予 sync/conflict 权限。
- 2026-09-09 真实只读验收已执行：用户本人通过 UI 保存个人 credential，Windows backend 为 `WinVaultKeyring`；login 成功。D1935 的 6086103 为 HTTP 200、1/1 行，6086997 为 50/187 行，6087050 为 50/262 行；字段结构与真实 Scanner 清单一致。6087050 当页有 1 个 repeated-`id` group，而 50 个 source identity 全部唯一。Console 16 条记录 secret-pattern 命中 0，未调用任何 Ainuoke mutation 或 Zhixu business commit。
- 6086103/6086997 Direct API snapshot 已经通过 transport-neutral Contract Source 进入唯一 `AinuokeContractMirror → synchronizeAinuokeContracts`。API 与历史 Excel 只在 transport mapping 不同；normalize、数量校验、matcher、幂等与人工 adjustment 保留规则均复用既有实现。Preview 只在内存运行；正式保存仍要求用户明确确认与 `ainuoke.sync`，且只保存既有 Service 产出的 orders/state/operationLogs 与 API ImportRun。
- Gate 2 的 D1935 真实 dry run 已执行：6086103/6086997 全部分页形成 1 份合同，合同数量 4,640、分色数量 4,640、数量差异 0、5 个颜色、合同交期 2026-10-13，validation 为 `valid`；既有 matcher 无候选，结果为 would auto-create 1，would update/bind/review 均为 0。没有点击“确认同步合同”；刷新后镜像合同/导入批次仍为 0、订单总数仍为 168，未写 SalesOrder、Ainuoke Sync state、Scheduling、Closing 或 Style Progress。
- 6087050 已由 Gate 3A/B 接入既有 Material Preview，Gate 3C 已完成显式确认、唯一 Material `commitImport` 路径与真实 DEV acceptance；没有建立第二套 Matcher、Dedup、Canonical resolver、Logistics 或 OperationLog。当前仍是 browser-local mock identity 下的本地 Windows 原型，不是生产级身份安全。
- Gate 2 自动门禁：定向 26/26、Python Bridge 32/32、TypeScript、ESLint、Full Tests 513/513、Production Build 30 routes 与 `git diff --check` 全部通过。D1935 复核页 console 4 条记录，secret-pattern 命中 0、error 0。
- 用户已明确废弃旧历史排单/生产预警遗留的 unresolved `schedule_match` / `closing_match` 人工 backlog。当前分支提供显式、幂等、immutable cleanup：只过滤这两类未解决 Review，保留其他 Review、contracts、ImportRuns 与全部正式业务事实；入口仅在 backlog 非零时显示，使用 `ainuoke.resolve_conflict`，确认后追加 count-only OperationLog。
- 2026-09-09 用户先通过数据管理导出真实 DEV Backup，再由本人在 `/ainuoke-sync` UI 确认执行 cleanup。unresolved `schedule_match` 112 → 0、unresolved `closing_match` 373 → 0，unresolved `order_match` 保持 30，总 pending reviews 515 → 30，旧迁移入口按设计消失。
- 真实 cleanup 前后业务 baseline 保持一致：contracts 487、ImportRuns 4、SalesOrders 464、ScheduleAssignments 26、OrderExecutionTrackings 2、ScheduleBatches 0、ClosingPeriods 11、ClosingAllocations 47、ProductionGroups 16、OutsourceFactories 13、ProductionSites 2、ProductionCalendars 2、SupplyHubs 1、SupplyRoutes 1、TransportModes 3。仅新增 1 条“清理艾诺科旧迁移待确认” OperationLog，metadata 只有 112/373/485 三个删除数量。纯函数/service 复验第二次 `totalRemoved = 0` 且不追加日志。后续排单/生产数据的新正式录入方式仍为 TBD。
- Cleanup 自动门禁：相关回归 69/69、Full Tests 520/520、TypeScript、ESLint、Production Build 30 routes 与 `git diff --check` 通过。

### Material Control Tower V2

- Style Progress IndexedDB version 4 与全局 schemaVersion 13 支持非破坏 Expected Arrival Batch / Allocation；v3→v4 确定性重映射 Canonical key，旧单日期、manual/source 语义、重导入、Backup / Restore 与唯一 OperationLog 均保持可追溯。跨名称旧批次拒绝猜测迁移；v4 加载/恢复拒绝错误 Canonical key 与空 Allocation 批次。
- 普通 Projection 以 `salesContractNo + materialType + normalizedMaterialName` 形成 Canonical Material Group；面料与辅料的编码、颜色、规格、门幅、克重、采购价等差异保留在组内明细，厂供退出运营统计但保留 Source Trace。
- 每批 Expected Arrival 独立复用正式物流 Service；Shipment quantity 只来自 ShipmentEvent，“距上线”与运输 buffer 分开，buffer 使用 `>7 / 0..7 / <0` 的 green/yellow/red 规则。
- V4 Material Control Tower 已提供 Canonical Material 卡、五项 KPI、Sticky Filter、多事件 Drawer 与 Batch Planner；1600/1280/1229/960/768/402 CSS viewport 无 document 横向溢出。这里记录的是 CSS viewport 验收，不冒充真实 Windows Display Scaling。
- 历史 Excel-only D1935 验收曾从旧规则的 18 个 Canonical Material（面料 8、辅料 10）收敛为 13 个（面料 3、辅料 10）；该结果只描述当时 Excel Source。当前 6087050 authoritative API Snapshot 的正式 current projection 为 12 个（面料 2、辅料 10），不要求与历史 Excel 行数或分组 parity。
- 历史 Excel-only 1229 CSS viewport 浏览器复验覆盖 Quote Detail、AppShell、当时的 D1935 13 个 Material Group 与生产/运输流程，无 document 横向溢出且 Console 0 unexpected error；当前 API live acceptance 的 12 个分组及刷新持久化结果见上文。
- 本任务最终门禁：TypeScript PASS、ESLint PASS、Full Tests 490/490、Production Build 29 routes PASS、`git diff --check` PASS。

### Gate A — Foundation / Quote

- Overlay、Dropdown、Modal、Toast 统一层级与 Portal 行为完成。
- 报价列表普通 token AND 搜索、`/字段 值` structured AND 搜索及制作国家 PriceVersion 搜索完成。
- 款式缩略图、其他费用指标、最终报价 Cost Breakdown Drawer 完成。
- Attachment 区域直接 Ctrl+V、品牌/客户业务员嵌套选择、系统继承实际值展示完成。
- 1229/960/768/402 Header、Back Control 与 Quote 响应式复验通过。

### Gate B — Order / Production / Style Progress

- 订单按交期月份筛选、详情字段权威边界、紧凑状态与颜色级部分取消完成。
- 颜色取消采用 append-only adjustment；Ainuoke 重同步更新来源数量但保留人工取消。
- 生产排单按生产组高密度展示，订单/物流入口为真实导航；物料状态直接消费 Style Progress Projection，不再维护重复的手工物料日期。
- 款式进度颜色筛选、面辅料折叠、高密度布局与 `actualConsumption` 正确来源完成。
- 新手工订单默认加工币种由系统设置初始化，正式默认值为 USD；既有订单、报价和关账快照不被回写。

### Gate C — Closing Center

- `/closing-center` 为按年分组、月份倒序的总览，并提供全部/开放中/已确认/已锁定筛选。
- `/closing-center/detail?month=YYYY-MM` 为月份详情；月份路由决定订单行、KPI、筛选和动作。
- 已排、已生产、关账数量保持独立；新增归属只显示当前月份数据。
- `confirmed` 与 `locked` 保持不同状态；锁定后普通编辑被拒绝，高权限重开必须填写原因。
- Modal 内校验错误通过独立高层 Error Layer 展示，不被遮挡。

### Second Acceptance — Gate D/E/F

- `DataTable` 的列宽与稳定列顺序按用户/表保存；旧 width-only 与旧 Quote `style` 偏好非破坏迁移，新增列追加、删除列忽略。
- 主业务列表改为 fit-first；Quote 最大字段、Order、Style Progress、Production Queue、Basic Settings 与 Closing Detail 的代表容器均不依赖局部横向滚动。
- Desktop Sidebar 支持 186px/78px 主动切换并按用户持久化；Basic/System 菜单默认关闭，路由切换不自动展开。
- Quote 款式图/款式身份独立可排序，列表组合信息密度、单行“更多”和详情高价值 Sticky 已完成。
- Order Detail 完成身份/客户 PO 去重；正式 Ainuoke Order 不再暴露常驻数量/合同交期人工覆盖模块，但历史 Domain、日志和备份保持不变。
- Production 移除重复 Banner/摘要，组选择项只保留待产指标与必要身份；选择面板在 AppShell 主滚动中固定于顶栏下方且没有独立滚动。

## 验证状态

- Second Acceptance relevant tests 17/17、full tests 455/455、typecheck、lint 与 build 均通过；`git diff --check` 在提交前执行。
- 应用内 Browser 实际 viewport 为 1280×720（与 1229 同属 Primary Desktop 模式）：Quote/Order/Style Progress/Production/Basic Settings/Closing 代表页面 document 无横向溢出，逐容器复验无局部横向滚动，unexpected console error 为 0。
- 用户已在 PR #3 merge 前完成真实 1920×1080、Windows 125%、Chrome 125%（约 1229×691 CSS px）视觉复验；自动门禁不替代该真实环境证据。
- Second Acceptance 9 张截图保存在 `docs/ui-redesign/screenshots/second-acceptance-2026-09-04/`，没有覆盖上一轮截图。
- Browser QA 使用隔离的 QA profile 追加/调整测试数据；没有清除用户或正式业务数据。

## 已确认的既有稳定状态

- Style Progress / Material Follow-up 与 Logistics Correction 已完成；Logistics Correction commit 为 `ab1608a7019ff620b29c3d132765104df639cf48`。
- missing SupplyHub 不自动猜宁波仓；缺 Hub、Site、Route、TransportMode 分别返回精确原因。
- GitHub Delivery Protocol 已启用，commit `daa0b47`。
- Repository Hygiene 已完成：PR #1，cleanup commit `51a427d9de11fa34228286eb03f32c2abd23c6ae`，merged main `65a0cac20991f0c6c2550ddbc7bcd9924377f065`。
- `artifacts/artifact-tool-qa/node_modules` 已停止 Git 跟踪；`.tmp-*`、`tsconfig.tsbuildinfo` 与 nested `node_modules` 已进入 ignore；本地 dependencies 未删除。

## 尚未落地

- Browser Order Center 到 PostgreSQL SalesOrder 的 bootstrap、reconciliation、read/write cutover 与 Browser store retirement 尚未落地；Phase 2B1 只完成 server foundation。
- Quote、Scheduling、Style Progress、Closing 的真实后端、数据库 schema/API、多用户并发与服务端权限尚未落地。
- 浏览器附件的对象存储、跨设备同步与服务端安全扫描。
- 服务端全文搜索与业务列表分页尚未落地；migration 没有自动 down，其他业务领域的事务内日志仍需随各领域 cutover 接入。
- True Mobile 的真实 coarse-pointer 设备级复验；当前自动回归验证的是指定 CSS viewport。

## 当前数据保护原则

- 不执行隐式 Reset，不删除本地 dependencies，不用测试清理触碰 DEV/PROD 浏览器真实命名空间。
- Quote Center 与附件是真实业务数据，必须长期保护。当前 Browser SalesOrder/ScheduleAssignment 虽被确认为测试数据、未来不迁移，现阶段仍不得修改或删除；只能在独立 Retirement Gate 完成 backup/dependency audit/scope 清单并取得用户明确破坏性确认后定向清理。Closing 分类待决定，Style Progress/Material 不在该 retirement 范围并继续保护。
- 备份恢复在覆盖前校验 owner、指针和跨记录引用；损坏数据拒绝写入并保留原始内容。
