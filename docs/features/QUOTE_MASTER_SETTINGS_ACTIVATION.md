# Quote Master / Settings 真实激活规划（Q3B2D）

> 2026-09-28，planning / safety audit only。本文不是连接真实 PostgreSQL、执行 migration、导入、恢复或切换生产路由的授权。所有真实操作都需要后续独立 Gate 和明确授权。Q3B2B/Q3B2C 的成功只证明当时的只读 Preview 与 disposable PostgreSQL rehearsal。

## 已证实的基线与边界

- Q3B2B 对一份捕获于 `2026-09-22T03:16:14.008Z` 的标准 Browser backup 只读 Preview：`sourceHash=102b13d60b8bece83104bc5c516eb22c6c9b32bd4b540931fa9c49152339175c`，`blockingErrors=0`，投影 49 行。该文件和 hash **不是**未来真实导入的默认 source/授权。
- Q3B2C 消费同一个 Q3B2A Preview transformation，在 disposable PostgreSQL 16 上应用至 0007；49/49 行、stable IDs/FK、投影与读回内容 hash、decimal、null/zero、故障回滚及重复导入拒绝均通过。它没有真实数据库读写，也没有生成 runtime CRUD OperationLog。
- 真实 PostgreSQL 已承载正式 SalesOrder 等数据；Q3B2D 时，以往的 511 单证据不能代替对实际目标的现场 read-only preflight。Q3B2E 已单独完成该检查，证据见下文。真实 0004–0007、Quote/master import 和 Browser authority cutover 均未执行。
- 生产 `/basic-settings/*`、`/system-settings/quote-settings`、`/quote-center` 仍使用 Browser/localStorage/mock。隔离的 `/basic-settings/server/*` 和 `/system-settings/server/quote-settings` 只是 Server candidate，不是生产路由。没有 Browser↔Server 自动同步或双写。
- 已确认规则保持：D-089 每个 System/Brand/CustomerSalesperson 作用域最多一个 nullable `DefaultOtherCost`，不改变 Quote `OtherCostLine` 0..N；D-090 默认制作预设必须 active；DefaultTrim 目标没有 quantity/usage；同名 Fabric/Trim 按 ID 保留；Supplier 仍为自由字符串。

## Migration activation 的真实语义

`server/index.ts` 正常启动只调用 `verifyMigrationsCurrent`：在 read-only transaction 中验证 ledger、filename/checksum 与 pending，异常时在权限同步、管理员 bootstrap 和 HTTP listen 前 fail closed，不会隐式建表。只有另外授权的 `npm run db:migrate` 才调用 `runMigrations`。后者按版本排序，使用 advisory lock，**每个待执行文件各自 `BEGIN`/`COMMIT`**；失败只回滚当前文件，之前成功的文件仍已提交，重新运行会跳过 ledger 中已应用的文件。0004–0007 不是一个总事务，也不能以“仅应用 0007”描述现有命令。

Q3B2E 已只读确认 ledger 仍仅有 0001–0003；若后续授权执行 `db:migrate` 且当时状态未变化，一次运行将依次尝试：

| 版本 | 已审计行为 | 对既有数据的边界 | 失败后的状态 |
| --- | --- | --- | --- |
| `0004_confirmed_commercial_terms.sql` | 建立 current terms 与 SalesOrder association/约束/trigger。 | 引用既有 `sales_orders`，无 511 单 backfill，也不改其 aggregate/source/sequence。需独立确认已有对象兼容。 | 0004 自身回滚；0001–0003 保留。 |
| `0005_quote_foundation.sql` | 建立独立 `quote_center_*` aggregate/history/cost/estimate 表，非 legacy `quotes`。 | 不导入 Browser Quote、不迁移 master，也不修改 legacy 根 ERP Quote。 | 0004 若已提交则保留；0005 自身回滚。 |
| `0006_quote_number_sequence.sql` | 建 Quote Center sequence；从已有合法 `quote_code` 最大 suffix 校准；加 exact unique constraint 和不可变 trigger。 | 不重编号历史 Quote。现有 exact duplicate 或不兼容对象会使该文件 fail closed；不是“只建空表”。 | 0004/0005 保留；0006 当前 transaction 回滚，不能假定全部数据库回到启动前。 |
| `0007_quote_master_settings.sql` | 建 7 类 master/settings 目标表及约束，不 seed/import。 | Browser authority 不变，目标表仍空；无 Supplier master、DefaultTrim quantity/usage。 | 0004–0006 若已提交则保留；0007 自身回滚。 |

每次失败先停止，不手工补 ledger、跳过版本或盲目重跑。记录实际已应用版本、checksum、表/sequence/constraint 状态与错误，依据具体失败制定 forward fix；若需恢复旧 schema/data，只能在独立授权、已验证 backup 与全体写入冻结下 restore。现有 migrations forward-only，没有自动 down。若 0004–0007 的实际待执行集合与上表假设不同，以新的 read-only ledger 检查为准。

## Authority drift 与 A/B/C 分离评估

生产 `basic-settings-pages.tsx` 的 `loadBasicSettings/saveBasicSettings`、`global-quote-settings-page.tsx` 的 `loadGlobalQuoteSettings/saveGlobalQuoteSettings`，以及 `quote-editor.tsx` 的 master 选择/快建、`quote-pricing-settings.tsx` 的 presets、`mock-quote-repository.ts` 的新 Quote 默认值，仍读取或写入 Browser 数据。`quick-master-data-create.tsx` 仍写 Browser settings 和 Browser OperationLog。把 49 行先导入 Server 后继续让这些入口编辑，只会使 Browser 与 Server 两边各自演进；没有自动对账或 dual-write，Server 不是那段时间内的生产 master authority。不得以“先 import，日后同步”作为可接受的运行状态。

| 阶段 | 可否与其他阶段分开 | 运行边界与风险 |
| --- | --- | --- |
| A. schema activation only | **有条件可提前**，须单独授权、真实 DB 备份/停写/preflight，且部署与 isolated Server endpoints 对空 master 表安全；0004–0006 的其他领域影响也必须验收。 | 0007 空表不转移 Browser authority。pending 时正常 Server 启动 fail closed；A 完成后才可按已验收 commit 恢复服务。不可把 A 当成 import 许可。 |
| B. fresh master/settings import | **不得与 C 分离为仍允许 Browser 编辑的运行期**。 | 同一冻结边界内导入、对账并保持 Browser master/settings 只读；否则立即出现 authority drift。B 的 49 是旧样本数量，fresh source 可能不同。 |
| C. production authority cutover | 与 B 的 source freeze/reconciliation **必须耦合**；若 prerequisite 未就绪，不执行 B。 | 正式 settings/Quote Editor/default/Quick Create 全部转至 Server trusted identity/audit；任何未接线入口须 fail closed/隐藏，绝不能回退 Browser 写。 |

**AI recommendation（非业务决定）：**A 可作为独立的 schema activation Gate；B+C 放在同一个受控 maintenance/write-freeze 窗口，只有生产集成、rollback switch、审计政策和验收脚本先完成后才进入。若无法立即完成 C，继续冻结 Browser 编辑并停止上线，而非开放两套可写 authority。是否按此顺序执行仍需用户授权。

## Fresh source、内容相等与目标护栏

真实 source 必须**先冻结 Browser master/settings 写入**，再从当前 authoritative Browser origin/namespace 新导出标准 backup；该 Browser 冻结贯穿 Preview/Rehearsal 与后续完整数据库停写窗口。使用仓库唯一 `npm run preview:quote-master-settings -- --backup <backup.json>`，要求 backup identity/namespace/schema 符合预期、`blockingErrors=0`、无 sensitive-field rejection，并重新获得 `sourceHash`、projected row counts/content hash。用**同一份不可变文件的 SHA-256 文件 hash**和同一个 `sourceHash` 执行 `npm run rehearse:quote-master-settings -- --backup <backup.json> --expected-source-hash <fresh-hash>`；在 rehearsal 后到真实导入前再次验证文件 hash/sourceHash 与 Browser write freeze 未变。capture timestamp 不进入业务 `sourceHash`，所以还必须记录文件 identity、hash 和冻结时点，不能只比对旧 hash。任何重新导出或内容变化都回到 Preview/Rehearsal，不静默使用 2026-09-22 样本。

现有 `importQuoteMasterSettingsProjection(pool, report)` 已有 transaction-scoped advisory lock、空目标检查、按 FK 顺序插入、in-transaction count/content-hash reconciliation、失败 rollback 与 commit 后读回；但它接受任意 `Pool`，`intentionalFailureAfterBrands` 仅供 disposable 故障试验，没有生产目标身份/ledger/fresh source/双重确认/授权护栏。**未来真实 execute runner 是独立实现与审查 Gate，Q3B2D 不实现、不调用。** 最低要求：

1. exact DB name/server identity、PostgreSQL version、reviewed deployment commit、0001–0007 filename/checksum/ledger 状态与七类 target 全空；所有检查 fail closed，不从普通 Browser HTTP 暴露。
2. fresh backup 文件 hash + `sourceHash` + Preview blockers 0 + disposable rehearsal ready + projection/content hash 精确匹配；不允许自造第二套 normalization 或绕过唯一 Q3B2A transformation。
3. 明确 CLI `--execute` 型确认、独立环境确认与授权记录；不得从 caller/body 接受 actor、IDs 替换或隐式选择数据库；排除 rehearsal-only 故障选项。
4. 全部 master/settings business rows 在**一个** PostgreSQL transaction；commit 前逐项 counts/IDs/FKs/decimal/null/zero/content hash 对账；commit 后 read-back 不一致时拒绝宣称成功，保持停写并进入人工恢复决策。不能把已经 commit 的异常伪称为可 rollback。
5. 不运行 runtime create/UUID allocator；Browser stable IDs 原样保留，不导入历史 Browser OperationLogs 或 49 个伪 runtime CRUD。source/projection/postgres content hash 与完整执行证据安全留存，不输出 secret/raw backup。

**Global 与 legacy Basic 差异不可抹平：**Q3B2B Preview 的 103 个 non-null canonical decimal 中，2 个属于旧 Basic `systemDefaults`；正式 Server 系统默认以独立 Global Quote Settings 为 authority，目标 49 行仅有 101 个对应 non-null decimal（null 8、显式 zero 20）。旧 Basic exchange/markup 与 Global 值确实不同。真实导入对账须分别报告两个来源，禁止旧 Basic copy 覆盖 Global、静默 merge 或把 103 误报为 target 101 的丢失。

## 真实数据库 read-only preflight（Q3B2E 已完成；执行窗口仍需 fresh check）

Q3B2D 设计的后续 Gate 须先核对连接目标的 DB name/host/port/server identity、PostgreSQL version、预期部署 commit；不得在日志打印 URL/password。使用只读连接或 `BEGIN READ ONLY`，核对 `schema_migrations` 是否存在、全部已应用 filename/checksum、待执行版本与 repo 文件一致、无 missing/checksum drift，再核对 database size、SalesOrder/source/terms/Quote/master 表的安全 aggregate counts、相关 sequence/constraint/trigger/已有同名对象。目标七表须 absent（激活前）或全部 empty（导入前）；任何非预期 Quote/master partial state 立即 STOP。`npm run db:migrate:status` 是代码里的只读 ledger 检查，但不能替代 DB 身份、数据与对象清点。Q3B2D 本身没有连接真实 DB；Q3B2E 的已授权检查结果如下。

### Q3B2E 真实 PostgreSQL 只读 preflight — 2026-09-28

本 Gate 仅在已经核对 Git remote、同仓库历史 Compose checkout、运行中 `zhixu-database` 与其唯一挂载的持久卷之后，使用该**精确运行容器**内的 `psql` 查询；没有从标准 checkout 的 `.env`/开发 fallback 猜测连接。另一个 `zhixu_data` 卷未挂载到任何容器，未读取或触碰。每组 SQL 都先 `BEGIN READ ONLY`，立即确认 `transaction_read_only=on`，再作固定 SELECT/SHOW，最后 COMMIT；无任意 SQL 输入、无 credential/URL 输出。数据库为 `zhixu`，PostgreSQL `16.14` (`server_version_num=160014`)，连接走容器内 local socket。脱敏目标 fingerprint（Compose project/container/挂载卷/DB/local-socket/port 的规范化 SHA-256）为 `28f587685bdf587bc21b4e348ac07da2297cc57029a81280b1c82208518d7ba1`；不以该 hash 替代未来执行 Gate 的 fresh 身份确认。

`schema_migrations` 存在，列为 `version/filename/checksum/applied_at/duration_ms`。仓库 0001–0007 原文件 SHA-256 与 ledger 精确比较：已应用 `0001_trusted_auth_rbac_operation_logs.sql`、`0002_sales_order_foundation.sql`、`0003_sales_order_number_sequence.sql`；待应用 `0004_confirmed_commercial_terms.sql`、`0005_quote_foundation.sql`、`0006_quote_number_sequence.sql`、`0007_quote_master_settings.sql`。无未知 DB 版本、缺失 repo migration、filename mismatch 或 checksum drift。正常启动仍会因 pending migrations fail closed；本 Gate 没有执行 `db:migrate`。

| Migration | Ledger state | Actual key-object check | Classification |
| --- | --- | --- | --- |
| 0001 | applied | 8 张 auth/RBAC/log 表及关键索引、函数、trigger、约束：23/23 存在 | APPLIED + CONSISTENT |
| 0002 | applied | 4 张 SalesOrder/source/mirror 表及关键索引、函数、trigger：12/12 存在 | APPLIED + CONSISTENT |
| 0003 | applied | `sales_order_number_seq`、allocator 函数与 trigger：3/3 存在 | APPLIED + CONSISTENT |
| 0004 | pending | terms 两表、索引、函数、trigger、约束均未出现 | EXPECTED-PENDING |
| 0005 | pending | 8 张 `quote_center_*` 表及相关 index/FK 均未出现 | EXPECTED-PENDING |
| 0006 | pending | Quote number sequence、quote-code unique、函数及 immutability trigger 均未出现 | EXPECTED-PENDING |
| 0007 | pending | 7 张 master/settings 表及其索引/FK/unique/check 对象均未出现 | EXPECTED-PENDING |

对象检查只比对 migration 定义的关键对象与 pending 命名空间中的所有实际 relation/function/trigger/constraint；不是对整个 PostgreSQL catalog 的 byte-for-byte schema 证明。没有 partial migration 对象或意外目标表。0004 的外部 FK 前置已核对：`sales_orders.id` 为 UUID PK，`source_quote_id/source_revision_id/source_price_version_id` 为 nullable TEXT，`gen_random_uuid()` 可用。0005 目标名称无冲突且 `public` 为当前 schema；0006 依赖尚待 0005 创建的空 `quote_center_quotes`，当前没有该表的 `quote_code` 行可产生重复、非法 suffix 或 sequence 校准溢出，legacy `public.quotes` 不参与 0006；0007 名称无冲突，所需 FK 指向其 SQL 自建的表。此结论仅针对检查时点，不保证后续环境/数据不会变化。

| 安全 aggregate | 真实 count |
| --- | ---: |
| `sales_orders` | 511 |
| `sales_order_source_links` | 511 |
| `ainuoke_sales_order_contract_mirrors` | 511 |
| `ainuoke_sales_order_color_mirrors` | 1,348 |
| `operation_logs`（总量，不读 payload） | 511 |
| ConfirmedCommercialTerms / Quote foundation / 7 类 Q3 target | **表未创建**，不是“已创建且零行” |

数据库大小 `13,876,247` bytes（约 `13.23 MiB`）。连接聚合在检查时点为：本次 `psql` 1 个 active read-only session、`zhixu-server` 1 个 idle session、5 个无业务 database/application name 的系统连接；未读取其他 session 的 query text。未来 maintenance 仍须冻结 Server、legacy ERP 和其他可能写同库的 client，单次 `pg_stat_activity` 快照不能证明没有其他写入。

**Q3B2E 分类：EXPECTED PRE-ACTIVATION STATE / READY FOR NEXT SAFETY GATE。** 这只表示真实库 read-only preflight 在该时点 PASS，**不授权 migration、backup、import、Browser cutover 或 real business writes**。下一独立 Gate 应取得明确授权，完成真实 PostgreSQL backup + 隔离 restore drill 与 maintenance/write-freeze 准备；之后重新核对 target/ledger/source 并另行申请 schema activation。Q3B2E 是窗口前早期检查，不能替代下方 runbook Phase 6 在备份和冻结后的 fresh preflight。2026-09-22 Browser backup 仍只作 rehearsal evidence，fresh Browser source 未读取，migration audit policy 仍是 USER DECISION REQUIRED。本 Gate 的 PostgreSQL writes、Browser writes 均为 0。

## Maintenance/write freeze 与 backup/restore

Browser master/settings/Quick Create 写入冻结从 fresh source export **之前**开始；在真实 PostgreSQL backup **之前**将冻结扩至 Server API、后台任务、legacy 根 ERP 等所有会写同一数据库的进程，持续到 migration、import、read-back、authority switch 和 smoke acceptance 明确结束。SalesOrder 当前正式 writer 也不得在完整数据库冻结窗口写入。Node Server 在 pending migration 下本来会 fail closed，但不能把这一点当作对其他 DB client 或 Browser localStorage 的冻结。若窗口内仍有其他业务写入，整库 restore 会回退它们，不能声称只回退 Quote masters。

真实 migration 前先验证备份工具的 Compose `database` service **确实对应预期真实目标**，并确认 `.env` 中的 `ZHIXU_DB_NAME`/`ZHIXU_DB_USER` 明确配置（脚本存在缺失时回退默认值，不可依赖默认值确认真实目标）。未来授权后的既有调用形式为 `./Backup-Zhixu.ps1`，生成 repo `backups/` 内 timestamped custom-format `pg_dump`；检查 exit code、存在性、大小，使用 `Get-FileHash -Algorithm SHA256` 计算文件 hash，并记录保管位置/访问控制、DB identity、版本、ledger 和关键业务 row-count snapshot。未来**仅在独立破坏性授权后**的恢复调用形式为 `./Restore-Zhixu.ps1 -BackupFile '<已验证且位于仓库 backups/ 的 .dump>' -ConfirmDataLoss`；该脚本使用 `pg_restore --clean --if-exists`，会覆盖目标数据、重启服务，不能在本 Gate 使用。先在隔离目标完成 restore drill 与 ledger/row-count/hash 验证；真实 restore 仅在明确操作人/触发条件、所有 writer 停止并评估 RPO 后执行。若失败可由 forward fix 安全解决，先审查 forward fix；不能自动 down migration 或自动 restore。恢复后也需验证 Browser source/Server authority 指向一致，不得产生双写窗口。

## Migration audit policy — USER DECISION REQUIRED

现有 Server `operation_logs` 是 trusted session 下 runtime business mutation 的 append-only 审计，actor FK/快照必须来自可信身份；Q3B2C import 并未产生此类日志。不能把 49 个历史 Browser master rows 伪造成 49 次用户 CRUD。

| 方案 | actor/provenance 与 rollback | 后续审计 UX |
| --- | --- | --- |
| 1. 不写 runtime OperationLog；保留一次 migration execution evidence（操作者/授权、source/file/content hash、ledger、counts、结果、backup 与部署 commit）。 | 不冒充历史用户；技术证据与 import transaction 分开，需明确不可篡改保管及失败记录。整库恢复须连同证据注明。 | Runtime timeline 不显示一次“用户修改”；运维/迁移记录另行可查。 |
| 2. 单条 bounded migration-level OperationLog。 | 需有真实受信迁移 actor、明确 entity/action、provenance、原子提交及失败回滚；现有 CRUD action/actor 模型是否容纳该事件须先实现/审查，不能借用 admin 身份伪造。 | 可在 timeline 看见一次导入，但展示和权限需适配。 |
| 3. 专用受保护 migration-event ledger/审计存储。 | 可保存完整技术来源而不污染业务日志；如新建 DB 表则另需 schema、事务、权限和备份/恢复设计。 | 需新增查询/保留/展示能力。 |

**AI recommendation（非确认政策）：**倾向方案 1，以审计可验证的 migration execution evidence 记录一次受控导入，并保持 runtime OperationLog 只表示真实 trusted mutation。证据载体/保留期限、是否还需单条 bounded event 由用户确认；未经决定不得执行真实 import，也不修改 `DECISION_LOG.md`。

## 生产集成 prerequisites

| 依赖 | 当前分类 | 切换要求 |
| --- | --- | --- |
| Q3A typed Server API、trusted RBAC/audit 与隔离 Q3B1 candidate | READY（foundation/candidate only） | 不能因此认定生产已接线；需验证目标空表/权限。 |
| Production `/basic-settings/*` Server authority | BLOCKER；MUST COUPLE WITH IMPORT/CUTOVER | 正式 routes 停止 Browser save/read fallback，沿用已验收 UI；409/401/403/network fail closed。 |
| Production `/system-settings/quote-settings` Server authority | BLOCKER；MUST COUPLE WITH IMPORT/CUTOVER | 统一 Global Settings/preset bundle，保持 D-090 与 trusted audit。 |
| Quote Editor master selectors、`quote-pricing-settings` preset 读取 | BLOCKER；MUST COUPLE WITH IMPORT/CUTOVER | 当前仍读 Browser master/global settings；不得一边 Server master 写、一边 Browser defaults 读。 |
| Quote 新建/默认解析与 `mockQuoteRepository` 依赖 | BLOCKER；MUST COUPLE WITH IMPORT/CUTOVER | 启用前须使新 Quote 默认只从 Server source 解析；Quote aggregate writer cutover 仍属更晚独立 Gate，不能由本次导入自动启动。 |
| Quick Create、Quote Editor 内 library 回存 | BLOCKER；MUST COUPLE WITH IMPORT/CUTOVER | 当前写 Browser settings；改为 Server trusted mutation 或在生产禁用，不允许 local fallback。 |
| Trusted permission/identity convergence | Server foundation READY；production UI BLOCKER | 清除相关生产入口的 Browser mock role 决策，使用 Server session/细粒度 RBAC。 |
| Browser OperationLog removal from migrated flows | MUST COUPLE WITH IMPORT/CUTOVER | Server 写入只生成 Server trusted log；不要额外追加 Browser log，也不迁移旧 155 条 Quote logs。 |
| Global search/master suggestions、copy Quote 与其他 Browser master consumers | BLOCKER unless hidden/fail-closed；其功能增强可 CAN FOLLOW AFTER IMPORT | 当前 `global-search/registry.ts`、`copy-quote-modal.tsx` 等仍读 Browser data；可延后集成的前提是切换时不可暴露陈旧或可写 Browser master 入口。 |
| Rollback route/feature switch 与验收 | BLOCKER；MUST COUPLE WITH IMPORT/CUTOVER | 明确单一 authority 回退策略、完整停写及人工验收；不能靠 dual write。 |

## 未执行的 activation runbook

以下每一步都是未来独立授权 Gate 的**设计**，不是 Q3B2D 执行记录。证据应保存安全的摘要与 hash，不提交 backup、credential、raw payload 或用户数据到 Git。任一步 abort 后保持冻结，先判定是否已跨不可逆提交边界。

| Phase | Preconditions | Allowed actions（仅未来授权后） | Expected evidence | Abort conditions | Rollback boundary |
| --- | --- | --- | --- | --- | --- |
| 0 — authorization | 用户确认目标、范围、窗口、操作者、audit/rollback 政策及 reviewed commit。 | 记录书面授权和负责人；不触库。 | 精确目标、操作清单、禁止项、签核。 | 任一 policy/目标不明。 | 尚无写入。 |
| 1 — fresh Browser backup | Browser origin/namespace 核对、master/settings/Quick Create 写入**已冻结**；保护旧数据。 | 从当前 authority 导出一份标准完整 backup，计算文件 hash。 | capture、schema/namespace、冻结时点、SHA-256、保管位置。 | 来源错误、导出不完整或期间写入。 | Browser 未修改；重新导出。 |
| 2 — Preview | Phase 1 文件不可变。 | 仅运行既有 `preview:quote-master-settings`。 | fresh sourceHash、counts、warnings、blockingErrors、projection/content hash、Global-vs-legacy 证据。 | blocker/sensitive field/差异未解释。 | 文件不变，回到 1。 |
| 3 — disposable rehearsal | Phase 2 blockers 0、source/file hash 固定。 | 对同一文件运行既有 tmpfs `rehearse:quote-master-settings`；不传真实 DB URL。 | migrations/49 或 fresh row count、FK/ID/decimal/hash/rollback/second-import evidence。 | rehearsal 不 ready、hash 不等、数据变化。 | 仅销毁 disposable；回到 1/2。 |
| 4 — maintenance/write freeze | Phase 1 Browser source 冻结持续有效；生产集成与 rollback switch 已可用；所有 DB writer 清单确认。 | **扩展**冻结至所有真实 PG business writes；下线/只读相关进程。 | 两类冻结时点、会话/任务清单、负责人、无写确认。 | 无法阻止任何 writer。 | 不修改 DB；解除 Browser 冻结后须重新取 fresh source。 |
| 5 — real PostgreSQL backup | Phase 4 生效，Compose `database` 与目标身份已核对。 | 经另行授权执行 `Backup-Zhixu.ps1`、hash/size 检查和隔离 restore 验证。 | timestamped dump、SHA-256、ledger/业务 count snapshot、restore drill PASS。 | 目标不匹配、备份/验证失败。 | 尚无 schema/import 写；修复备份流程。 |
| 6 — read-only preflight | Phase 5 可靠，已获真实 DB read-only 授权。 | 只读核对 DB/version/ledger/checksums/pending/对象/counts/deployment commit。 | 0004–0007 exact status、无 unexpected partial state、SalesOrder baseline。 | 身份/ledger/object/count 任一不符。 | 尚无本轮 DB 写；保持冻结调查。 |
| 7 — schema activation | 0004–0007 的整体影响获独立授权、backup 可恢复。 | 显式一次 `npm run db:migrate`；之后只读检查 ledger/对象。 | 每文件 applied/skipped、checksum、约束与 sequence evidence。 | 某文件失败或意外对象。 | 逐文件已提交；不得假装全回滚，forward fix 或经授权 restore。 |
| 8 — master/settings import | 七类目标表空、fresh file/sourceHash/ledger/双确认完全匹配，production runner 已审查。 | 只通过专用 guarded CLI 执行一次 1-transaction import。 | in-transaction counts/hash；commit 后读回 hash/ID/FK/decimal。 | 任一 guard、写入或对账失败。 | commit 前 rollback；commit 后保持冻结，需人工 forward fix/restore 决策。 |
| 9 — reconciliation | Phase 8 完整成功；冻结保持。 | 只读复核 7 表、content hash、Global defaults、SalesOrder/Quote/terms 等非目标 counts。 | projection=PostgreSQL、未触碰其它领域、migration evidence。 | 数量/hash/外域 baseline 不符。 | 不宣称成功，不开放写；人工决策。 |
| 10 — production authority switch | Phase 9 PASS、全部 production integration 与 audited rollback switch 已验收。 | 在同一冻结边界内切 Server-only routes/identity/defaults；禁用 Browser 写/fallback。 | 唯一 Server authority、部署 commit、route/config evidence。 | 任一入口仍读写 Browser 或双写。 | 立即停止流量/继续冻结；按预审策略切回或恢复。 |
| 11 — smoke acceptance | Phase 10 完成，人工验收计划就绪。 | trusted session 下验证 list/read、细粒度权限、默认解析、可控 write/audit、刷新、错误路径。 | 逐项 PASS、业务/审计前后 counts、无 Browser write。 | 401/403/409/保存/回读异常或 drift。 | 冻结不解除；安全切回/恢复需单独授权。 |
| 12 — rollback-window close | Phase 11 PASS，所有证据留存，用户确认。 | 明确关闭窗口、解冻指定 writer、持续监控。 | final source/DB hashes、backup retention、责任人签核。 | 未解决差异或恢复方案不可用。 | 解冻后整库 restore 的 RPO 变大；不能自动回退。 |

## Go / No-Go（Q3B2D 规划，Q3B2E 只读检查后更新）

下表 `Required` 指**真实 import/cutover 前**；read-only preflight 本身仍需单独用户授权。旧 Preview/Rehearsal 不替代 fresh evidence。

| Condition | Required | Current status | Blocking? |
| --- | --- | --- | --- |
| Q3B2B clean Preview | YES，历史工程证据 | PASS，旧 sourceHash，49 行 | 不阻断 planning；不够真实 import |
| Q3B2C clean disposable rehearsal | YES，历史工程证据 | PASS，旧 sourceHash | 不阻断 planning；不够真实 import |
| Fresh Browser backup + write freeze | YES | 未执行 | **真实 import blocker** |
| Fresh source/file hash + Preview blockers 0 | YES | 未执行 | **真实 import blocker** |
| Fresh disposable rehearsal same file | YES | 未执行 | **真实 import blocker** |
| Real DB identity/ledger/checksum/status preflight | YES | Q3B2E 在精确运行容器以只读事务 PASS；0001–0003 applied，0004–0007 pending，checksum/object consistent | 当前不阻断下一安全 Gate；真实执行前仍须 fresh check |
| Real DB backup + isolated restore evidence | YES | 未执行 | **activation blocker** |
| Maintenance/full writer freeze | YES | 未安排 | **activation/import blocker** |
| Production Basic/Global Server adapters on formal routes | YES | 仅隔离 candidate | **cutover blocker** |
| Quote Editor master/default/Quick Create Server integration | YES | Browser/local | **cutover blocker** |
| Trusted identity/RBAC | YES | Server foundation ready；production convergence incomplete | **cutover blocker** |
| Migration audit policy | YES | USER DECISION REQUIRED | **import blocker** |
| Guarded real import CLI + rollback mechanism | YES | 未实现/未验收 | **import blocker** |
| Manual UI acceptance and rollback switch | YES | 未验收 | **cutover blocker** |

**结果：READY FOR NEXT SAFETY GATE；NOT READY FOR REAL MIGRATION / IMPORT / CUTOVER。** Q3B2E 只读 preflight 已完成；下一步建议另行授权真实 PostgreSQL backup + 隔离 restore drill，并准备 maintenance/write freeze，同时完成生产集成、guarded runner、审计政策与 rollback 设计。所有 blocker 清零后再申请真实 schema/import 授权。Q4 attachments、Q5 Quote data migration 和整个 Quote production cutover 仍属独立阶段。

## 审计依据

- `server/index.ts`、`server/startup.ts`、`server/db/migration-runner.ts`、`server/db/migrate.ts`、`database/migrations/0004`–`0007`。
- `features/basic-settings/server/master-settings-backup-preview.ts`、`master-settings-migration-preview.ts`、`server/integration/quote-master-settings-migration-import.ts`、`quote-master-settings-rehearsal.ts`、两个 CLI scripts。
- `features/basic-settings/components/basic-settings-pages.tsx`、`quick-master-data-create.tsx`、`server-basic-settings-candidate-page.tsx`、`features/quote-center/components/quote-editor.tsx`、`quote-pricing-settings.tsx`、`global-quote-settings-page.tsx`、`features/quote-center/repository/mock-quote-repository.ts`、`features/global-search/registry.ts`。
- `Backup-Zhixu.ps1`、`Restore-Zhixu.ps1`、Active D-086/D-088/D-089/D-090、`docs/features/BASIC_SETTINGS.md`、`QUOTE_CUTOVER_READINESS.md`、`DATA_LIFECYCLE.md`、`PERMISSIONS.md`、`OPERATION_LOGS.md`。
