# 艾诺科个人账号与只读 Direct API

## Purpose

为本地 Windows 原型建立 `Zhixu User → 0..1 Personal Ainuoke Account` 与只读 Direct API Source Adapter。每个织序测试用户使用自己的艾诺科账号，保留艾诺科本人的权限与待办身份；不使用公司共享账号或管理员高权限账号。

当前 Zhixu User 仍是 browser-local mock identity。本模块只能称为“本地 Windows 原型的个人账号绑定”，不是生产级多人认证、安全隔离或服务端授权。

## Security contract

- Password 只能进入 Windows OS Secure Credential Store；实现优先使用 Python `keyring` 与 Windows Credential Manager。禁止进入 localStorage、sessionStorage、IndexedDB、浏览器备份、Quote、SalesOrder、Style Progress、OperationLog payload、console、文件日志、telemetry、Git 或已提交 `.env`。
- Ainuoke JWT/token/session 只存在 Local Bridge 进程内存，并按 bridge session 所绑定的 `Zhixu User.id` 隔离。Bridge 重启后 token 消失并要求重新登录。
- Bridge 只允许绑定字面量 `127.0.0.1` 或 `::1`，拒绝 `0.0.0.0`、局域网地址和可解析主机名。CORS 使用精确 Origin allowlist，禁止 `*`。
- 每个浏览器交互会话使用 HttpOnly session cookie + 独立 CSRF nonce；会话在 bridge 内存中绑定一个 mock user。账号与报表接口从该会话取得 user context，不接受每个请求随意提交 userId。
- Origin allowlist、HttpOnly cookie 与 CSRF nonce 是本地攻击面的附加保护，不会把 browser-local mock user 变成可信认证。能控制浏览器本地状态或启动会话的本机用户仍可能冒充其他 mock user；生产化前必须改为真实 Zhixu authentication，并由服务端确定 actor。
- 艾诺科当前登录目标是 HTTP。凭据在 bridge 到艾诺科链路上没有 TLS 保护，这是已知安全限制；不得把本原型描述为适合跨主机或不可信网络。
- 日志禁止输出完整 login URL、raw login response、password、JWT/token、session/cookie 或不必要的 PII。credential invalid 不自动循环 retry；network error 仅有限 retry/backoff；auth expired 最多重新登录一次并 replay 原 read 一次。

## Personal account contract

Local Bridge 提供：

- `GET /v1/ainuoke/account`
- `PUT /v1/ainuoke/account`
- `POST /v1/ainuoke/account/test`
- `DELETE /v1/ainuoke/account`

GET 只返回 username/脱敏标识、configured、status、lastVerifiedAt、lastSuccessfulLoginAt、lastErrorCode，绝不返回 password、token 或 session。PUT 接收 username + password，先真实登录验证，成功后才原子替换旧 credential；失败时旧 credential 不变。DELETE 删除该用户 credential 并清理该用户全部内存 token/session cache。

个人账号绑定使用 self-scoped `ainuoke.account.bind_self`。既有 `ainuoke.bind` 仍只表示“把艾诺科销售合同绑定到织序订单”；个人绑定不会授予 `ainuoke.sync`、业务合同 bind 或冲突处理权限。

## Read-only report/source contract

固定 Report Catalog 只有：

| Catalog key | Report ID | 名称 | 消费边界 |
| --- | --- | --- | --- |
| `sales_contracts` | `6086103` | 销售合同 | common source model → existing `AinuokeContractMirror` → existing matcher/service |
| `sales_contract_color_sizes` | `6086997` | 销售合同颜色尺码明细 | common source model → existing `AinuokeContractMirror` → existing matcher/service |
| `material_purchase_statistics` | `6087050` | 面辅料申购统计 | thin API adapter → common Material source rows → existing Normalize → Dedup → Validate → Preview → explicit confirm → existing `commitImport` |

Browser 只能提交 catalog key，不能提交任意 reportId。Bridge 负责 login、auth、paging、timeout、有限 network retry、字段脱敏和 read DTO；不负责 Matcher、订单创建、Material commit、Canonical identity、Risk、Logistics 或 Domain mutation。Gate 3C 的浏览器 Domain orchestration 只能把已经完成的 6087050 Preview 交给既有 `commitImport`，Bridge 仍没有写 API 或业务持久化能力。

当前同步时，6087050 Direct API 的当次返回是 authoritative Source Snapshot。历史 Excel 是另一个时间点的 historical source，可用于字段语义证据、Parser 回归与历史 Trace，但不要求与 API 具有相同 row count、snapshot hash 或 source row identity。两个 Source Adapter 必须保持同一业务字段语义并进入同一 Material domain pipeline；不得为了匹配历史 Excel 行数而过滤当前 API 数据，也不得把某次 261/262 行硬编码为业务常量。

已确认真实协议（2026-09-08 requests + Scanner）：base 为 `http://61.164.81.194:9043`，登录为 `GET /kaijin/system/user/loginsys2`，Generic Report 为 `POST /kaijin/report/report/getReportObjAndData`，System Id 为 `6080183`。上游是 HTTP，不是安全链路；base/report path 仍允许进程级覆盖，但上述事实是当前默认值。

- 登录 query 固定包含 `userName/password/verifyCode/cltType=1/rememberMe=true/jsCode/isCoverLogin`，并使用已捕获的 Accept、`X-Requested-With: XMLHttpRequest` 与 login Referer。只有 `data.isOk === true` 且同时存在非空 `data.jwtToken`、`data.sessionId` 才判成功；raw URL/response/userObj/PII/secret 不记录。
- 报表鉴权按捕获请求发送原值 `Authorization: <token>`、`Token: <token>` 与 Cookie `kaijin_my_token=<token>; rungingSysId=6080183`；不使用未经验证的 `Bearer` 假设。token/cookie 永不返回 Browser。
- Browser query DTO 目前严格只有非空 `insideOrderNo`。6086103 映射为 `InsideOrderNo + contains + [内层]`，6086997 映射为 `InsideOrderNo + is`，6087050 映射为 `insideorderno + is + [内层]`。Bridge 构造 `reportId + sqlCdtn(pageIndex/pageSize/conditionList/sqlParamList/orderFieldList) + isFirstTime + isIniPage`；这三种已捕获的过滤请求均不猜测或发送 `formId`。
- 响应必须含 JSON string `dataList`，解析后必须是含 mapping rows 的对象；total 读取真实 `dataCount`。该 endpoint 成功返回时顶层 `pageIndex/pageSize` 可为已验证的 `0/0` 哨兵，此时保留请求中已验证的分页值；缺失、负数、非数字、分页冲突或 malformed `dataList` 全部 fail closed。

每个 `ReportSnapshot` 必须保存：`schemaVersion`、`reportId`、`fetchedAt`、`page`、`pageSize`、`total`、`queryContext`、每行 `sourceRowIdentity`、sanitized source error（失败时）及 deterministic `snapshotHash`。当前 schema 为 `ainuoke-direct-read.v2`。hash 对同一 report/page/query/rows 稳定，不把 fetch timestamp 算入 identity；所有 source DTO 再次移除 secret-named fields。6087050 是 joined view 且 `id` 已确认重复，因此不能使用 `6087050:<id>`；三张报表都没有足够证据证明 `id` 唯一，统一采用 report-specific canonical full-row SHA-256，identity 不依赖 API page position 或排序。

## Current implementation boundary

- Python Bridge：`tools/ainuoke-bridge/ainuoke_bridge/`；`KeyringCredentialStore` 启动时拒绝非 Windows Credential Manager backend，browser session、CSRF nonce 与 Ainuoke JWT 均为 process-memory state。
- Browser client/UI：`features/ainuoke-api/` 与 `/my-settings/ainuoke-account`。密码输入从不回填，GET view 不含 secret；切换 mock user 会新建对应 bridge session。
- 上游默认 base/login/report path 已按真实请求固定；`/my-settings/ainuoke-account` 另提供 D1935 固定 Catalog 的只读验收面板，只显示行数、total、paging 与字段名，不输出 raw response 或 secret。
- 6086103/6086997 已进入 Gate 2 Preview-first 合同链路：Direct API snapshot → common Contract Source → 唯一 `buildAinuokeMirror` → existing `synchronizeAinuokeContracts`。读取与预检只在内存运行；只有用户明确点击“确认同步”且拥有 `ainuoke.sync` 才由 commit orchestration 保存既有 Service 产出的 orders/state/operationLogs 与 API ImportRun。
- 6087050 已通过薄 API adapter 形成 source-neutral rows，并进入既有 Material Normalize / Dedup / Validate / Preview。Gate 3C 在 Preview 后提供二次确认入口，薄 orchestration 只做权限/完整性/stale 校验并调用唯一 `styleProgressRepository.commitImport`；合同 API mode 与物料 commit 都不读取或修改 Production Scheduling、Closing 或四文件历史导入数据，也不触碰 SalesOrder。
- 既有 Excel Ainuoke Matcher、Order Sync、Material Normalize/Dedup/Canonical resolver、Material Logistics Service 与 OperationLog 保持唯一，不建立第二套。

## Gate 3 material source adapter

- `AinuokeMaterialApiAdapter` 只接收固定 6087050 `ReportSnapshot[]`，校验 schema、query、完整分页、source identity 与 secret-named fields，再把经证据确认的 API 字段映射为共用 Material source row。Adapter 不做 Canonical grouping、厂供过滤、数量汇总、Event construction、物流或持久化。
- API Source Trace 保存 `sourceKind=api`、reportId、sourceRowIdentity、snapshotHash、fetchedAt、InsideOrderNo 与 source schema version；不伪造 Excel fileName、sheetName 或 rowNumber。重复分页中的完全相同 source row 会去重，真正 identity collision 则 fail closed。
- Excel semantic-header adapter 与 API adapter 共同进入 `normalizeMaterialSourceRows`。现有 demand/event stable IDs、Normalize/Dedup/Validate、name-only Canonical resolver 和 factory-supply exclusion 仍是唯一实现；现有 Excel Import/Backup compatibility 保持不变。
- 真实 6087050 字段已证明可映射销售合同号、内部订单号、物料类型、名称、编码、颜色、规格、门幅、克重、采购价、供应商、需求、采购/入库/出运/出库、来源交期和提供方式。`MSingleName` 在 D1935 全量 Snapshot 中只有一个重复值，且与 `CnName` 不同，不能证明等价于 Excel“申购实际名称”，所以不映射 `sourceActualName`。其他无法证明的字段也保持 `null`/empty；尤其没有充分证据证明某 API 字段等价于 Excel 数值列“厂供”，因此 API `actualConsumption=null` 并在 Preview 显示 warning。

## Gate 3C material commit capability

- 正式路径固定为 API snapshots → `AinuokeMaterialApiAdapter` → shared Material Normalize/Dedup/Validate → Preview → `commitAinuokeMaterialApiPreview` → existing `commitImport` → Style Progress IndexedDB。API adapter 和 Preview service 仍没有 Repository 依赖。
- commit 复用 `style_progress.import`；`ainuoke.view` 只能读取和预检，不能授权业务写入。UI 必须先 Preview，再打开二次确认 Modal；Modal 展示当前 Preview 的 InsideOrderNo、fetchedAt、Source/Canonical/Demand/Event/厂供计数和不会修改 SalesOrder/Scheduling/Closing 的边界。
- stale boundary 采用绑定当前 immutable Preview 的方案，不在提交时静默换成另一 Snapshot。commit 前重新计算 canonical source content hash，并验证全部分页 `readCount >= total`、total 一致、report/schema/query、零 identity collision、零 blocking validation 和全部 batch reference。
- API ImportBatch identity 不包含 fetchedAt，而由 reportId、normalized query 与 canonical source row content 生成。同一完整 Snapshot 重复提交走 `commitImport` 既有 batch idempotency，新增业务事实为 0且不重复追加“导入面辅料跟进” OperationLog。
- API ImportBatch / RawSnapshot 使用现有 Material entity，仅增加 `sourceKind=api` trace 字段：reportId、sourceRowIdentity、snapshotHash、fetchedAt、query、source schema 与 sourceArtifactHash；不伪造 Excel filename、sheet 或 row number。
- 新完整 Snapshot 按 affected contract scope 替换全部 prior-source current Demand/Event facts，而不只移除旧 API facts；历史 Excel/API Raw/ImportBatch Trace 保留。Excel/API Demand ID 不稳定时，manual ExpectedArrivalBatch 只按确定性业务身份进行唯一 remap，零或多候选 fail closed；source-following 计划按新来源交期刷新，Actual 仍只来自实际事件。
- Canonical Material 的唯一业务排序在 Style Progress Projection 中形成：fabric 全部在 trim 之前；fabric 按 actualConsumption DESC，缺 actual 时按 plannedConsumption DESC，再按 sourceSortNo 与稳定 Canonical key；trim 按 sourceSortNo 与稳定 key。详情、筛选、风险与下游消费者使用一致顺序。
- Canonical identity 仍固定为 `salesContractNo + materialType + normalizedMaterialName`。materialCode、颜色、规格、门幅、克重与采购价只保留为 Demand/Event/Trace child facts；`提供方式=厂供` 保留 Raw/Trace，但退出未采购、待入库、齐套、风险、物流与 Expected Arrival operational projection。
- Browser 使用固定 catalog key `material_purchase_statistics` 与受限 `insideOrderNo` DTO，按实时 `snapshot.total` 自动读取全部页或在合法空页停止，并保留 100 页安全上限。UI 复用 `/ainuoke-sync`，明确显示实时 Snapshot、fetchedAt 与“本次仅预检，尚未写入款式进度”。

## Gate 2 contract source adapter

- 6086103/6086997 已新增 transport-neutral Contract Source：Excel workbook 与 Direct API snapshot 分别完成 transport mapping 后，共同进入唯一 `buildAinuokeMirror`。API Adapter 不复制品牌/款号 normalize、数量校验、matcher 或订单 mutation 规则。
- 真实报表 metadata 确认 6086103 的 `BillNo=销售合同号`、`GoodsDesc=款号`、`InsideOrderNo=工厂款号`；`QuotationNo` 不是客户 PO，因此 API mapping 的 `poNo` 保持空。6086997 确认 `billno=销售合同号`、`stylecolor=成衣颜色`、`stylesizerule=成衣尺寸`、`stylenum=订单数量`。
- 6086997 是 material join，同一成衣颜色/尺码随物料行重复，并含合同级逗号拼接颜色汇总。API Adapter 以稳定 source identity 折叠 join，使用颜色组已验证订单数量；当前无法证明 `stylesizerule` 等价于 Excel `Size1/Size2/...` 列，因此 `sizes=[]`，不伪造尺码分配。
- `AinuokeSourceTrace` 以向前兼容 union 表达 Excel/API。旧 persisted Excel trace 缺少 `sourceKind` 时仍按 legacy Excel 读取；新 Excel trace 保存 file/sheet/row，新 API trace 保存 reportId/sourceRowIdentity/snapshotHash/fetchedAt/sourceHash，API identity 不依赖 page position 或排序。
- Ainuoke Sync 继续使用既有页面，以“艾诺科 API / Excel · 历史文件”选择 Source Mode；API mode 只要求 InsideOrderNo、`ainuoke.view` 与当前用户已配置个人账号，不要求 scheduleFile/closingFile。Preview 展示合同/分色数量、数量差异、颜色数、交期、validation、match disposition 与 candidate，并明确标注尚未写入正式数据。
- API `AinuokeImportRun` 保存 `sourceKind=api`、6086103/6086997、InsideOrderNo query、snapshot hashes、fetchedAt 与 dry_run/commit mode；不保存 password/token/session/header/cookie。现有 Excel run 字段继续可读，local data schema/namespace 不变。

## Verification

Python tests：`tools/ainuoke-bridge/tests/`；browser/source contract：`tests/ainuoke-personal-api.test.mjs`。覆盖脱敏真实 login/report fixture、三报表 condition adapter、header/cookie、`dataList` parser、0/0 paging sentinel、6087050 repeated id、固定 allowlist、unknown/write-like endpoint 拒绝、loopback-only、Origin allowlist、CSRF/session、credential/token 隔离、retry 上限、auth expiry 单次 replay、替换失败回滚、unbind 清缓存、process restart、deterministic source hash 与 Secret Leakage。

2026-09-09 真实只读验收：个人账号由用户本人通过 UI 输入并保存到 Windows Credential Manager；登录成功。D1935 的 6086103 为 HTTP 200、1/1 行；6086997 为 HTTP 200、第一页 50/187 行；6087050 为 HTTP 200、第一页 50/262 行，字段结构与脱敏 Scanner 清单一致。6087050 该页实际出现 1 个 repeated-`id` group，50 行生成 50 个唯一 `6087050:sha256:*` identity。浏览器 console 检查 16 条记录、secret-pattern 命中 0；没有调用 Ainuoke write API、`synchronizeAinuokeContracts`、`commitImport`、SalesOrder write 或 Style Progress write。上述行数是当次上游事实，不是稳定业务常量。

同日 Gate 2 真实合同 dry run：Ainuoke Sync API mode 读取 D1935 的 6086103/6086997 全部分页，经 common Contract Source 与既有 `synchronizeAinuokeContracts` 得到 1 份有效合同；合同/分色数量为 4,640/4,640、差异 0、颜色数 5、交期 2026-10-13。既有 matcher 无候选，因此 preview 为 auto-create 1，update/bind/review 均为 0。没有点击“确认同步合同”；刷新后 persisted mirror/import run 仍为 0、orders 仍为 168。复核 console 4 条记录，secret-pattern 0、error 0。该结果只证明 read DTO → mirror → existing matcher/service 的 dry-run 链路，不代表执行过 SalesOrder commit。

Gate 2 自动验证：定向 26/26、Python Bridge 32/32、TypeScript、ESLint、Full Tests 513/513、Production Build 30 routes 与 `git diff --check` 通过。

同日 Gate 3 真实物料 dry run：用户在 `/ainuoke-sync` 对 D1935 点击“运行物料 API 预检”，6087050 共读取 6 页，全部 6 次 query 均 HTTP 200；实时 total/source rows 为 262/262，unique source identities 262，repeated upstream `id` groups 1。共用 pipeline accepted/rejected 为 262/0，Canonical groups 12（面料 2、辅料 10），厂供 Source rows 6，operational groups 12，Demand 255，Purchase/Inbound/Shipment/Outbound events 为 183/153/150/150，Demand/Event duplicates prevented 为 7/6，identity collisions 0。该 262 是当次上游事实，不与历史 Excel 261 行作 parity gate，也不是稳定常量。

Gate 3A/B 真实验收网络只包含 bridge session/account 与固定 `material_purchase_statistics/query`；没有 Ainuoke write endpoint。预检前后当前页面 persisted mirror/import run/order 计数保持 0/0/168，API Adapter/Preview 不引用 Style Progress Repository。

Gate 3 自动验证：定向 Adapter/Pipeline/UI 回归 75/75，字段语义修正专项 34/34，Full Tests 541/541、TypeScript、ESLint、Production Build 30 routes 与 `git diff --check` 全部通过。Local Bridge 代码没有变化，因此本 Gate 未重复运行 Python Bridge tests；Gate 2 的 Bridge 32/32 仍是既有基线证据。

Gate 3C fixture/isolated validation 覆盖 first commit、same-snapshot idempotency、跨 Source current-facts replacement、manual Effective 唯一 remap、source-following refresh、厂供运营排除、稳定排序、SalesOrder/Scheduling/Closing 不变与 secret leakage。Bridge 未修改，因此未重复运行 Python tests。

2026-09-10 真实 Gate 3C 验收：用户先完成 DEV Backup，再本人通过二次确认 Modal 提交修复后的 D1935 Snapshot。AFTER persisted state 为 262 Source rows、255 Demands、12 Canonical（fabric 2、trim 10）与 Purchase/Inbound/Shipment/Outbound 183/153/150/150；6 条厂供 Source rows 保持 trace-only。第一次 commit 混入的旧 Excel 汗布、罗马布、棉毛布共 20 个 Demand 已从 current operational projection 移除，两个 Excel ImportBatch/Raw Trace 和 API 262-row Trace 仍保留。All/Fabric/Trim 排序符合 fabric-first 规则，刷新后 12 / 2 / 10 与顺序继续保持。

同次验收中，人工 Expected Arrival batch/allocation 与 `2026-09-01` manual Effective 被唯一 remap 并保留；新增“导入面辅料跟进” OperationLog 仅含 report/query 和 262/255/183/153/150/150 数量 metadata，无 password/token/session/credential。轻量边界复核显示 SalesOrders 仍为 464；实现和自动化没有 SalesOrder、Scheduling 或 Closing 写入。本次未触发 Ainuoke write API，也未再次执行 Material commit。

Gate 3C 最终自动验证：commit/UI/Adapter/Preview/Style Progress/Contract API 定向 78/78，Full Tests 555/555，TypeScript、ESLint、Production Build 30 routes 与 `git diff --check` PASS；secret leakage fixture/state/log scan PASS。Local Bridge 未修改，因此未重复运行 Python Bridge tests。

## Obsolete historical review cleanup

- PR #8 已 merged，Gate 2 已进入 main。旧历史排单/生产预警导入能力和 Excel mode 继续保留；本 cleanup 不删除 parser、Review kind 或未来能力。
- 用户已明确废弃旧历史排单产生的 unresolved `schedule_match` 与旧生产预警/关账迁移产生的 unresolved `closing_match` backlog。`cleanupObsoleteHistoricalReviews` 只删除这两组记录；`order_match`、`data_anomaly`、resolved schedule/closing reviews、contracts 与 ImportRuns 均保持原顺序和原值。函数 immutable、deterministic，第二次执行删除 0 条。
- `/ainuoke-sync` 只在 backlog 大于 0 时显示“旧迁移待确认”，并在确认 Modal 列出排单、生产/关账和合计数量，以及明确不会删除的业务对象。操作复用 `ainuoke.resolve_conflict`；普通 `ainuoke.view` 不能清理。
- 正式 commit 边界只有 `AinuokeSyncState load → pure cleanup → AinuokeSyncState save → OperationLog append`。唯一日志动作“清理艾诺科旧迁移待确认”只保存 actor、timestamp 和 schedule/closing/total 三个 count，不保存 Review payload 或任何 secret。
- 清理不触碰 SalesOrder、ScheduleAssignment、Closing state、Production Settings、Style Progress、ImportRun 或 Ainuoke contract binding。2026-09-09 用户已先导出真实 DEV Backup，再由本人通过 UI 确认执行：unresolved schedule 112 → 0、unresolved closing 373 → 0、unresolved order 保持 30、data anomaly 保持 0、resolved schedule/closing 保持 0/0，pending 515 → 30，入口随 backlog 归零消失。
- 真实 before/after 业务 baseline 相同：Mirror contracts 487、ImportRuns 4、SalesOrders 464、ScheduleAssignments 26、OrderExecutionTrackings 2、ScheduleBatches 0、ClosingPeriods 11、ClosingAllocations 47、ProductionGroups 16、OutsourceFactories 13、ProductionSites 2、ProductionCalendars 2、SupplyHubs 1、SupplyRoutes 1、TransportModes 3。OperationLog 只新增 1 条“清理艾诺科旧迁移待确认”，metadata 仅 `removedScheduleReviewCount=112`、`removedClosingReviewCount=373`、`totalRemoved=485`；不含 Review payload 或 secret。专项 service 测试确认当前已清理 state 再执行时 `totalRemoved=0` 且不追加 OperationLog。
- 后续真实排单与生产相关业务数据会使用新的正式方式录入；具体方式仍为 TBD，本任务不作设计或推断。
- Cleanup 自动验证覆盖精确过滤、resolved/其他 kind 保留、immutable/idempotent、Repository 隔离、count-only log、权限、UI 条件显示与 Backup/Restore；相关回归 69/69、Full Tests 520/520、TypeScript、ESLint、30-route build 与 `git diff --check` 通过。
