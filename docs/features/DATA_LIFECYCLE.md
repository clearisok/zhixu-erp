# 开发数据保护与非破坏性迁移

## 当前新系统方向：空业务数据（D-096）

新系统使用独立 DB/volume/origin，从空业务数据开始；不读取旧备份执行导入，不自动同步艾诺科，不发现/接管已有 COS 对象。旧 Browser namespace/IndexedDB、旧库、备份及对象全部保留，无 clear/reset/换 key。本文后续历史导入资产分类与 Q5 freeze 是保留的历史兼容路径，不是当前上线前置条件；已发生 Q3 import 与验收不被否定。详见 `FRESH_START_FOUNDATION.md`。

## Server 生产资料原请求（2026-10-24，D147 G6A）

`zhixu.server.production-resource.pending.v1.<public-user-id>.<kind>` 仅sessionStorage临时保存
该用户主动填写的资料原命令（schemaVersion/userId/kind/savedAt/command），含名称、启停、备注、
联系人/电话、日期及关系ID/版本；不含密码、令牌、金额、Browser账本、来源凭据或返回快照。
最多1MiB，完整写入并读回成功后才POST，不以内存假装可恢复。刷新只恢复核对，不自动POST；
回执身份/类型/既有规范化SHA-256匹配后才删除本键，已知超界拒绝同样核对；未知/损坏/未来版本/
摘要冲突不清理、不生成新ID。原ID重试须用户明确操作。会话切换不消费另一owner缓存。
这是单标签页临时请求地址，关闭页可能丢失；服务端业务、审计及回执仍保留，不是跨设备同步、
Browser备份或资料权威库。无localStorage/IndexedDB/Seed读写、换key、迁移或清库。

## Server 排单原请求（2026-10-24，D147 G6B）

`zhixu.server.production-plan.pending.v1.<public-user-id>` 只在sessionStorage保存本actor/tab的一条
原requestId、精确intent、previewHash及schemaVersion/userId/savedAt。数量、日期、执行方ID、
原因属于用户待核命令，不含报价价格、资源返回快照、密码或token。完整写入并读回成功后才POST。
刷新/重新登录先GET核对，不自动POST；仅同会话同命令明确unknown后可手动原ID重试。
已验证身份/hash的applied/rejected才释放；未知/损坏/未来版本/错摘要或ABA旧响应不清理。
关闭标签页可能丢缓存，但Server计划/不可变历史/审计/回执仍持久存在；不是离线业务权威或跨设备恢复。
无Browser账本namespace、IndexedDB、Seed、备份格式、迁移或clear变化。

## Server 准备请求恢复（D-130，2026-10-15）

正式Server准备流程新增独立临时sessionStorage key：`zhixu.server.order-preparation.pending.v1.<publicUserUUID>.<orderUUID>.<create|adopt>`。它只保存未核实命令（请求ID、原参考或准备ID、数量/日期/变化、可选精确报价三ID或采用CAS/原因），不保存账号密码、token、CCT或价格。与Browser业务账本、schema v13、IndexedDB、Seed及备份格式无读写/迁移关系；不是离线Server订单或Browser回退。

先完整保存并读回原命令，再POST。刷新只恢复草稿并提示人工核对，不自动POST；原请求GET回执核实后仅删除自己的精确key，明确未提交的校验拒绝也只释放此请求。未知401/403/网络/服务失败、内容不匹配保留；损坏或未来schema原字节不改，禁止覆盖或自动清空。账号/订单/操作分别隔离，返回当前血统须另读服务端，旧回执不冒充当前状态。

这是同一Origin、同一标签页内的恢复保护；手动清理站点、关闭标签页或浏览器设备丢失不在持久保障范围。共享浏览器用户可访问本机站点存储，不能将该缓存作为保密凭据仓库。若整标签页丢失，应先按原参考/准备及服务端记录核对，不能假设未提交而重建业务。缓存不可用时新命令不发送，不以仅内存草稿冒称可恢复。后续跨设备待办服务另立交付，不隐式扩大本阶段。

## Purpose

保护 Quote Center 在浏览器中的长期验收数据，使页面刷新、HMR、DEV 重启、Production Build、Docker rebuild、Seed 变化和前端 schema 演进均不会自动清空或覆盖用户数据。

## Q5-C independent Quote freeze

`NEXT_PUBLIC_ZHIXU_QUOTE_WRITER_MODE=frozen` 只读既有 canonical `zhixu.erp.local.quotes` schema v13；缺失/损坏/旧 schema/非法 aggregate 显示“报价冻结源不可安全读取”，不调用 initialize、seed、migration、legacy merge/remove。正常 writable 默认行为不变，namespace/schema 不变。

Frozen bootstrap 只验证 Quote，其他允许初始化的 Browser domain 保持原行为；Q3 Server authority 不变。标准 full backup v1 的 localRecords/attachments/templates/styleProgress 格式不变，导出前后比对 Quote raw string；Quote 附件与旧 URL 原样保留。restore/reset 有独立 service guard，不依赖 Q3 偶然限制；UI preferences 仍可写。真实 freeze 与 fresh export 尚未执行。

## Current behavior

- DEV `127.0.0.1:3001` 与 PROD Docker `127.0.0.1:3000` 继续依靠浏览器 Origin 隔离，不做跨 Origin 共享。
- 所有可序列化的 Quote Center 数据写入稳定命名空间 `zhixu.erp.local.*`；版本存在 envelope/manifest 的 `schemaVersion` 中，不再通过改 key 升级。
- 当前正式 `schemaVersion = 13`。v3 将旧 QuoteRevision 级制作参数映射为 PriceVersion 快照；v4 新增 `operations-settings`；v5 新增 `sales-orders`；v6 将多款订单非破坏拆分为单款 SalesOrder；v7 新增 `production-scheduling`；v8 新增 `closing-center`；v9 将旧 ProductionPlan owner 提升为 `ScheduleAssignment.salesOrderId`；v10 增加艾诺科同步正式记录；v11 接入款式进度 IndexedDB 与完整备份编排；v12 加入颜色数量 adjustment、默认加工币种与 Style Progress `actualConsumption` 的非破坏兼容；v13 加入 Expected Arrival Batch / Allocation，并先将 Style Progress IndexedDB 2→3；PR #6 再将其从 v3→v4，以 name-only Canonical identity 确定性重映射既有 `canonicalMaterialKey`。旧 payload 与稳定 ID 不因升级重建。
- 启动时 `LocalDataBootstrap` 触发一次非破坏性初始化。稳定记录存在时只读取/迁移；稳定记录不存在时优先迁移旧记录；只有两者都不存在时才写一次 Seed。
- 旧 key 在迁移成功后保留，不由自动流程删除。只有用户在“系统设置 > 数据管理”显式执行全部重置时才清理稳定与旧命名空间。
- 稳定记录或 manifest 损坏时抛出 `LocalDataCorruptionError`，原始字符串保持不变，不静默回退 Seed。

## Current migration and retirement authority

- Quote Center 的 Quote、QuoteRevision、PriceVersion、EstimateCost、provenance 与其他经审计确认的实际 Quote 业务事实是真实 production migration assets，必须保护；不是 Order/Scheduling test-data retirement 的一部分。
- **USER CONFIRMED migration exclusion：**当前 Browser IndexedDB Quote attachment blobs 不作为未来 Quote Production Server migration source；现有 `imageAttachmentIds[]`、`fileAttachmentIds[]`、`styleImageAttachmentId` 也不迁移为 Server attachment relationships。未来 migration projection 可将目标 QuoteRevision 的这些引用显式转换为 `[]` / `[]` / `null`，且 preview 必须报告被清空的引用数量和受影响 Quote/Revision 数量。
- **D-094 legacy URL compatibility：**`garmentMedia` 与 `quoteDocuments` 也仅在 Q5 目标投影中清空为 `[]`，并分别统计源引用；不把旧 URL 当作正式 Server 附件关系或迁移文件。Q5-A 仅以合成标准备份验证，未捕获或修改真实 Browser 源。
- **Q5-B 尚无真实 Quote freeze：**Q3 的 master/settings frozen build 不会冻结 Browser Quote Repository。真实 Quote writer freeze、关闭旧可写标签页、重开同源只读界面和冻结后 fresh backup 尚未实施；Q5-B 只有其证据/时间顺序契约及 disposable tests，不读取或更改真实 Browser Quote 数据。
- 这项 exclusion 不表示旧附件损坏、属于测试数据或可以立即删除。当前 Quote attachment references 与 IndexedDB blobs 在 migration development、production acceptance 和 rollback window 内必须保持不变；任何后续删除都需要独立 destructive-data decision、backup/recovery evidence 与用户明确授权。
- 当前 Browser Order Center 与 Scheduling 是功能测试数据，不作为正式 PostgreSQL migration source、bootstrap authority 或正式 SalesOrder ID continuity source。未来正式订单走 Ainuoke clean discovery/detail bootstrap，之后产生新的正式 Scheduling。
- 这项分类不是删除授权。本阶段和任何普通 migration/load/test 流程都不得读取后清空或修改这些 Browser 数据。真正 retirement 必须是独立 Gate：先完整导出 backup、完成 dependency audit、列出精确删除与保护范围，再取得用户 explicit destructive confirmation。
- Style Progress/Material 不在 Order/Scheduling retirement 范围，必须保持不变。Closing 数据是否为测试数据尚未决定，不得迁移、删除或自动归类。
- 当前历史 464 SalesOrder 计数不是迁移清单，也不应触发 Browser A/B/C classifier。完整 backup 仍是未来 retirement 的安全前置，不是 clean PostgreSQL bootstrap 的来源。

## Storage map

| 数据 | Repository / service | 当前稳定位置 | 旧迁移来源 |
| --- | --- | --- | --- |
| Quote、Revision、PriceVersion、EstimateCost、附件引用 | `mock-quote-repository.ts` | localStorage `zhixu.erp.local.quotes` | sessionStorage `zhixu.quote-center.slice-1.2` |
| 单款 SalesOrder、交期、数量/价格历史与附件引用 | `order-repository.ts` | localStorage `zhixu.erp.local.sales-orders` | v5 `SalesOrder + OrderItem[]` |
| ScheduleAssignment、OrderExecutionTracking | `production-scheduling-repository.ts` | localStorage `zhixu.erp.local.production-scheduling` | v8 ProductionPlan 只用于 v9 owner 提升，原 Assignment ID 保留 |
| ClosingPeriod、ClosingAllocation | `closing-repository.ts` | localStorage `zhixu.erp.local.closing-center` | v7 无此独立记录时初始化空集合 |
| Ainuoke Mirror、同步批次与 Import Review | `ainuoke-sync-repository.ts` | localStorage `zhixu.erp.local.ainuoke-sync`；API trace/run 使用向前兼容可选 metadata | v9 无记录时初始化空集合；legacy Excel trace/run 继续可读 |
| Ainuoke personal credential | Python keyring / Windows Credential Manager | OS Secure Credential Store，以 Zhixu User.id 分项 | 不进入浏览器 migration / Backup / Restore |
| Ainuoke JWT/token/session | Local Bridge process memory | 不持久化 | Bridge restart 后重新登录 |
| 款式进度 ImportBatch、Raw、需求、四类事件与 Expected Arrival Batch | `style-progress-repository.ts` | IndexedDB `zhixu-style-progress` version 4 多 Store | v2→v3 迁移旧单日期；v3→v4 重映射 name-only Canonical key；旧备份缺新集合时为空 |
| 品牌、客户业务员、面辅料库 | `basic-settings-repository.ts` | localStorage `zhixu.erp.local.basic-settings` | `zhixu.basic-settings.v1.5`、`v1.3` |
| 全局报价设置 | `quote-settings.ts` | localStorage `zhixu.erp.local.quote-global-settings` | `zhixu.quote-center.global-settings.v1` 与旧基础设置 |
| 个人列表偏好 | `quote-settings.ts` | localStorage `zhixu.erp.local.quote-preferences.<userId>` | `zhixu.quote-center.preferences.v1.*`、旧单用户设置 |
| 用户/角色/权限 | `permission-repository.ts` | localStorage `zhixu.erp.local.permission-state` | `zhixu.permission-state.v1` |
| 操作日志 | `operation-log-repository.ts` | localStorage `zhixu.erp.local.operation-logs` | `zhixu.operation-logs.v1` |
| 最近搜索 | `recent-search-repository.ts` | localStorage `zhixu.erp.local.recent-search` | `zhixu.global-search.recent.v1` |
| 模板默认指针 | `indexeddb-template-repository.ts` | localStorage `zhixu.erp.local.template-default` | `zhixu.template-settings.default.quote_customer` |
| 附件 metadata + Blob | `indexeddb-attachment-repository.ts` | IndexedDB `zhixu-quote-attachments / attachments` | 名称不变，无清库迁移 |
| 用户模板 metadata + Blob | `indexeddb-template-repository.ts` | IndexedDB `zhixu-export-templates / templates` | 名称不变，无清库迁移 |

每个 localStorage 业务记录使用：

```ts
{
  schemaVersion: 13,
  initializedAt: string,
  updatedAt: string,
  data: unknown
}
```

manifest 记录 product、schemaVersion、environment、initializedAt 和 updatedAt。

## Migration rules

1. 读取稳定 key；若存在则校验 envelope 和版本。
2. 稳定 key 不存在时依次检查该模块已登记的旧 key。
3. 旧记录解析和模块 normalize 成功后，先写稳定 envelope；不删除旧记录。
4. 两类记录都不存在时才写入 Seed，并形成 initializedAt。
5. 后续版本必须以 `v1 -> v2 -> ...` 的迁移函数前进，保留 ID、未知字段及 Quote 内部关系；禁止换 key 规避迁移。
6. 迁移必须幂等；版本高于当前应用或 JSON 损坏时停止写入。
7. 报价旧数据来自按标签页隔离的 `sessionStorage`。每个标签页首次访问报价 Repository 时都要检查自己的 legacy 记录：稳定空间只有 Seed 时由真实旧报价替换；稳定空间已有用户数据时以稳定数据为主并补入缺少的 Quote/Revision。成功合并后仅删除该标签页已迁移的 legacy key，不能因其他标签页已先初始化而漏掉旧数据。
8. v2 报价若只有 `QuoteRevision.pricingParameters`，加载时必须原值复制到该 Revision 的每个 PriceVersion，并从规范化后的新保存结构移除 Revision 级字段；迁移不得读取当前全局制作预设覆盖历史口径。
9. v3 → v4 不重写已有报价或基础资料 payload；只升级 manifest/envelope 版本并允许新模块在记录不存在时读取安全空默认值。已有未知字段必须原样保留。
10. v4 → v5 只增加 `sales-orders` 稳定记录能力；已有 records 及未知字段原样保留，重复初始化必须幂等。订单恢复前必须校验每个 OrderItem 的 `currentPriceVersionId` 能命中价格历史，损坏指针不得写入。
11. v5 → v6 保持 `sales-orders` key：单 Item 保留原 SalesOrder ID/订单号，多 Item 逐款拆单，第一款保留原身份，其余订单复用正式订单号生成规则。Quote 来源、数量/交期/价格历史及附件引用按旧 Item 隔离迁移，child owner 改为 `salesOrderId`。
12. v5 → v6 建立确定性的旧 Item→新 SalesOrder mapping，用于迁移翻单 `sourceOrderItemId`；新 Runtime Domain 不保留 OrderItem。坏指针、重复 ID、空 items 或 owner 损坏会停止迁移并保留原始 record，禁止 fallback、Seed 或全局清空。
13. v6 → v7 只增加 `production-scheduling` 稳定记录；v7 → v8 只增加 `closing-center` 稳定记录。已有 records、未知字段与时间戳原样保留，旧备份没有新记录时初始化安全空集合。
14. v9 → v10 增加艾诺科同步稳定记录；v10 → v11 只提升现有 localStorage envelope/manifest，原业务 payload 保持不变。款式进度大数据使用独立 IndexedDB Store，不把万行事件塞进单个 localStorage JSON。
15. v11 → v12 保持所有稳定 key 与实体 ID；颜色取消 adjustment、系统默认加工币种和 `actualConsumption` 修复均采用可重复、非破坏迁移。Ainuoke 重同步更新来源颜色数量时保留 adjustment；无法由当前 Raw Snapshot 证明的旧实际用量保持 `null`。
16. v12 → v13 保持 namespace、数据库名、既有 ImportBatch、Raw、Demand 与 Event ID；Style Progress IndexedDB 2 → 3 新增 Expected Arrival Batch Store，并把旧 `expectedMaterialReadyDate` 按 Canonical Material + 日期 + `source|manual` 确定性迁移为 Allocation。manual 计划不被重导入覆盖，厂供 Allocation 在迁移/加载时非破坏移除；旧备份缺新集合时按空集合恢复。
17. Style Progress IndexedDB v3 → v4 保持数据库名、Store、Demand/Event、Expected Arrival Batch、Allocation 与审计字段；按 `salesContractNo + materialType + normalizedMaterialName` 重映射 `canonicalMaterialKey`。一个旧批次若指向多个新物料身份则拒绝迁移；v4 数据中的 key 必须与全部 Allocation 的当前物料身份一致，空 Allocation 批次视为损坏数据并拒绝加载或恢复。

## Test isolation

- 浏览器 DEV/PROD 依靠 Origin 隔离。
- Repository 单元测试注入内存 Storage，并使用 `zhixu.erp.test` 或测试专用 namespace。
- 测试清理只允许 `clearNamespace()` 清测试 namespace；不得执行 `localStorage.clear()`、`indexedDB.deleteDatabase()` 或读取真实 DEV 浏览器存储。

## Backup and restore

“系统设置 > 数据管理”提供 JSON 备份：

- 元数据：`backupVersion`、`schemaVersion`、`createdAt`、`environment`、`origin`、`namespace`。
- localRecords：稳定命名空间内的完整 envelope 字符串。
- `operations-settings` 与其他稳定记录一样自动进入 `localRecords`，恢复旧备份中没有该记录时使用安全空默认值，不覆盖其他业务记录。
- `sales-orders` 与其内部交期、数量变化、价格版本和当前价格指针作为一个稳定记录自动进入 `localRecords`；新备份保存 v6 单款结构。旧 v5 备份在替换当前数据前执行同一提升/拆单迁移并整体校验；附件 Blob 仍由 attachments 区域独立备份，不复制进订单 JSON。
- `production-scheduling` 与 `closing-center` 都作为独立稳定记录进入 `localRecords`。恢复关账前校验 ClosingPeriod 唯一性、SalesOrder owner、可选 ScheduleAssignment 引用与当前 schema；任何关系损坏都会在覆盖当前数据前拒绝恢复。
- `ainuoke-sync` 作为稳定记录进入 `localRecords`；款式进度以结构化 `styleProgress` 区块进入同一备份 JSON。恢复会先完整校验需求/事件引用，再与 localStorage、附件和模板一起执行失败回滚；旧备份没有该区块时只初始化空款式进度，不触碰订单、排单、关账或艾诺科数据。
- API 合同同步不更换 `ainuoke-sync` key，也不提升全局 schemaVersion。新 API trace 真实保存 reportId/sourceRowIdentity/snapshotHash/fetchedAt/sourceHash；API ImportRun 保存 sourceKind/reportIds/query/snapshotHashes/fetchedAt/mode。字段均为向前兼容扩展，旧 Excel trace/run 不补造 API metadata，JSON Backup/Restore 原样保留两种来源。
- API dry-run 只在内存建立 mirror/sync result，不调用任何 Repository save。2026-09-09 D1935 真实预检后刷新页面，Ainuoke mirror/import run 仍为 0、SalesOrder 总数仍为 168；只有明确确认且通过 `ainuoke.sync` 检查后才保存既有 Service 结果。
- 旧迁移 Review cleanup 不是 schema migration、validator 或 load-time repair；只在用户显式确认后过滤 `ainuoke-sync` 记录内 unresolved schedule/closing reviews，不更换 key/namespace/schema。执行前必须由用户导出 DEV Backup；contracts、ImportRuns 和其他稳定记录不得改写。
- Personal Ainuoke credential 与 Local Bridge JWT/session 不属于浏览器业务数据，显式排除在 `localRecords`、IndexedDB、JSON Backup / Restore 与 Reset 编排之外。备份恢复不会导入、导出、覆盖或删除 Windows Credential Manager 中的个人账号。
- attachments：附件 metadata 与 Blob（Base64 仅存在于用户主动下载的备份 JSON，不写回 localStorage）。
- templates：用户模板 definition 与 Blob；内置模板不重复备份。

恢复前校验产品、备份版本、schemaVersion、记录 key、JSON 和文件大小。恢复会先保留当前内存快照，任一写入失败时回滚 localStorage、附件和模板。成功后刷新页面以清除 Repository 内存缓存。

## Reset

“重置全部本地业务数据”是唯一清空入口，需要：

1. 管理系统设置权限；
2. 打开危险操作 Modal；
3. 完整输入 `重置全部本地业务数据`；
4. 再次点击确认。

启动、HMR、Build、`scripts/rebuild-local.ps1`、`scripts/rebuild-local-clean.ps1` 和 Docker rebuild 都不会调用 Reset。`clean` 只指构建缓存。

## Important constraints

- 不改变 Quote、QuoteRevision、PriceVersion、EstimateCost 或成本公式。
- 不把附件 Base64 写入业务 localStorage。
- 不绕过 Repository 让业务组件直接访问 IndexedDB。
- 不自动让 3000/3001 共用数据；需要复制时使用导出/导入。
- 迁移失败不得以 Reset 处理，也不得用 Seed 覆盖。

## Known gaps

- 这是单浏览器、单 Origin 的开发期持久化，不是服务端事务数据库或跨设备同步。
- localStorage 与两个 IndexedDB database 之间无法形成真正的跨存储原子事务；当前恢复以预校验、内存快照和失败回滚降低风险。
- Browser Backup 无法备份个人 Ainuoke credential；Windows Credential Manager 与 Local Bridge 生命周期独立，迁移设备时必须由本人重新绑定。
- 大量附件会使 JSON 备份体积较大；未来对象存储阶段应升级为流式归档格式。

2026-10-17 D-145 Server会话恢复：新增sessionStorage zhixu.server.order-price.pending.v1.<public-user-id>仅请求UUID、zhixu.server.processing-push.pending.v1.<public-user-id>仅请求UUID/Quote IDs；不存金额/原因/令牌，不读写Browser业务namespace/IndexedDB或Seed。原载荷仅当前组件内存保存。只显式重试原命令/核对服务端回执；已确认完成或明确受理前拒绝时删除本组件恢复标记。不同用户不能复用标记，切换授权范围重新加载投影。没有服务端记录且原内存稿已丢失时保持核对状态，不冒称未执行或自动重新下单。

2026-10-24 G6C：原production-plan.pending.v1的key/schemaVersion/四字段包装保持，只前向扩展record_execution解析；旧计划原字节兼容，计划/执行共用未决槽。未知新命令在旧客户端明确阻断，不删除/覆盖；新客户端同lease/精确回执才清槽。仅sessionStorage技术请求，不触碰Browser业务namespace/Seed/IndexedDB，见SERVER_PRODUCTION_EXECUTION。

2026-10-24 D147/G6D候选0037只增加空Server物流资料，复用0034回执并保留0034–0036及原四类payload/hash。共享hub/运输表单不改Browser Repository/key/schema/Seed或null政策；Server不读取或写入Browser账本。升级仅一次性PG演练，真实目标未升级，见[当前契约](SERVER_LOGISTICS_RESOURCES.md)。

2026-10-24 D054/D147当前0038候选只新增空订单物流上下文head/history并扩原命令action。新UUID明确归原物理SO，不读/迁移/Seed或修改Browser长期记录，不回填默认仓或搬历史；旧0037之前字节保持。只授权一次性合成PG，实际目标未升级，见[Server契约](SERVER_ORDER_LOGISTICS_CONTEXT.md)。
