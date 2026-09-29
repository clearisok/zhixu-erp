# Quote Master / Settings 激活规划与 Q3B2H schema 执行记录

> 2026-09-28：**Q3B2H CLOSED / PASS**。真实 PostgreSQL schema migration 0004–0007 和用户自行完成的 Windows/local Compose Node post-migration recovery 均已验收。本文件后续 Q3B2D–G 的“pending/未授权”描述保留为各阶段历史证据，不代表当前 ledger。此验收不是 Linux production deployment readiness，也不授权 master/settings import、Quote import、Browser authority cutover 或真实 restore。

## Q3B2I-B operational readiness tooling — implemented, not executed on real resources

Disposable validation on 2026-09-29 passed with an isolated PostgreSQL 16 tmpfs container: rehearsal proof was published only after cleanup; guarded VerifyOnly and Execute reconciled the same synthetic projection; failed pre-commit writes rolled back; injected post-commit readback failure was classified as committed-but-unverified; a second import was rejected. Reject checks include missing freeze evidence, invalid/pending ledger, wrong DB/source/projection/proof hashes, reviewed-code drift and untracked critical source. The existing Q3B2G database-ops safety suite also rejects wrong target fingerprint, corrupt backup and active writers. Targeted source-guard tests `2/2`, isolated rehearsal/guarded import `1/1`, database-ops `2/2` plus D-091 evidence `6/6`, Server auth/frontend `24/24`, full Browser tests `662/662`, typecheck, lint, Server build, frontend production build (`41` routes) and diff-check passed. This is engineering readiness only, not evidence of an actual Browser freeze, fresh export, final rollback dump, real import or authority deployment.

- `features/runtime/build-info.ts` 与 Vite 构建生成的公开 `/build-info.json` 增加 `masterSettingsAuthority`，只接受 `browser | frozen | server`；未知值沿 Q3B2I-A authority boundary fail closed。`scripts/verify-q3-frozen-build.ts` 只读检查准确 origin、commit、build ID/time 与运行中的 `frozen`，写入 Git-ignored freeze evidence；`allOldTabsClosedBeforeFrozenReopen` **只是操作者明确证明**，工具不能自动发现旧标签页、旧 bundle 或外部 localStorage 修改。未来必须先部署 frozen bundle、由操作者关闭 authoritative Browser profile 中所有旧窗口/标签页并重新打开，再核对 running build，不能把代码存在当作冻结现场证据。
- `inspectQ3SourceFile` 复用唯一 Q3B2A Preview/parser；分别保留绝对文件路径、字节数、文件 SHA-256、capture/environment/origin/namespace/schema、canonical `sourceHash`、投影 content hash/counts 与 blockers/warnings。capture timestamp 不参与 `sourceHash`，文件变化 fail closed。`scripts/Invoke-Q3IsolatedRehearsal.ps1` 仅在随机命名、PGDATA tmpfs、`--network none`、无 host port/生产 volume 的 PostgreSQL 16 执行 0001–0007、故障回滚、完整导入/读回及二次导入拒绝；仅在容器被确认删除后发布 Git-ignored 机读 proof。Proof 绑定文件/source/projection hashes、counts、reviewed commit、ledger、版本、时间、回滚与读回结果。
- `scripts/Invoke-Q3GuardedMasterImport.ps1` 是未来唯一人工操作入口，严格区分 `-VerifyOnly` 与 `-Execute`；后者还要求独立 `-ConfirmImport I_UNDERSTAND_Q3_IMPORT_IS_IRREVERSIBLE`、operator/authorization reference。它核查 reviewed commit 是 HEAD ancestor、关键源路径从 reviewed commit 到 HEAD 以及 working tree/index/untracked/ignored 均未变化、镜像 revision 与 HEAD 一致；复用 Q3B2G exact-target fingerprint 和 writer guard，不用 `.env`/默认 Compose 上下文猜测目标。内部 Node runner 对照同一 Preview 与 rehearsal/freeze hashes、0001–0007 filename/checksum/current ledger 和全部 Q3 target 空表；`-VerifyOnly` 强制 default read-only transaction，并且绝不导入。`-Execute` 只调用既有 `importQuoteMasterSettingsProjection`，不执行 migration、不补录 runtime OperationLog。
- 未来 final rollback dump 必须在 Browser freeze 和 DB writer freeze 后由 exact-target `Backup-Zhixu.ps1` **重新**创建。该脚本现输出 Git-ignored、带目标 fingerprint/容器/project/volume/database/时间/size/hash/TOC 验证的 `.dump.manifest.json`；import wrapper 要求 dump 与 manifest 的各自 SHA-256、确切文件名/大小、目标身份、冻结后时间、非 reparse 路径与独立 `pg_restore --list` 全部匹配。Q3B2H 旧 dump 无此新窗口证明，不能代替。
- D-091 import evidence 为单次 execute 的独立 local Git-ignored JSON，不是 Server `operation_logs`：绑定 execution ID、authorization/operator、reviewed/actual code、目标/ledger、source/projection/rehearsal/freeze/rollback dump+manifest hashes、planned/committed/readback counts/hash 以及安全 failure code/phase。先落 PREPARED；事务失败记 FAILED；COMMIT 响应不确定记 COMMIT_OUTCOME_UNKNOWN；已经提交但读回/关键 FK 或 source recheck 失败记 COMMITTED_UNVERIFIED；仅全部 readback PASS 才记 COMMITTED。异常时一律 **KEEP FROZEN**，不得自动重试、开放 Browser writable authority、执行 restore 或伪称 rollback。Evidence 文件需在未来窗口另行复制到已批准的耐久保管位置；当前本地文件**不是**防篡改远端留存。
- 未来 Q3B2I-C 顺序固定：Browser 当前 → 部署并验证 frozen bundle/人工旧客户端关闭 → 冻结全部 DB writers → fresh export → canonical Preview（blockers=0）→ 同文件 isolated rehearsal/proof → 停写后 exact-target final dump+manifest → VerifyOnly → 独立授权 Execute → committed readback PASS → 以同一 reviewed source 切 `server` → trusted session/RBAC 下只读 smoke（Brand、Salesperson、Fabric、Trim、Global Settings、Preset、resolved defaults、supplier suggestions）→ 仅在额外授权的 disposable smoke 已证明 Quick Create/写审计、且真实 Server UI smoke PASS 后恢复 Q3 编辑。任一步失败保持 frozen；恢复 Browser writable 或整库 restore 都是**另外**的人工作业/授权，不是脚本回退开关。
- 本 Gate **未**抓取 fresh real Browser backup、未连接/写入真实 PostgreSQL、未执行 import/migration/部署/cutover；现行 Browser authority 仍是 `browser`。Q3B2I-C 必须单独授权，且真实 evidence 耐久保管位置、当前目标/新备份/现场 freeze 与 UI smoke 均须在窗口前再验证。

## Q3B2I-A production authority wiring — implemented, not activated

- `NEXT_PUBLIC_ZHIXU_MASTER_SETTINGS_AUTHORITY` 的唯一有效值为 `browser`（未配置时默认）、`frozen`、`server`；未知值抛错，不落回 Browser。它是当前前端构建的部署配置，**本 Gate 没有设置为 frozen/server，也没有部署**。受控切换必须核对实际构建值与所有旧标签页/客户端已停写；仅有新 bundle 的 guard 不足以证明旧代码停止写入。
- 正式四个 Basic Settings 页面及 Global Quote Settings 复用 Q3B1 Server candidate/controller；`frozen` 页面保持现有 Browser Q3 只读，禁止编辑；`server` 使用 trusted Server session、细粒度 RBAC、optimistic version、原有 transaction + trusted OperationLog，失败不写 Browser Q3 或 Browser Q3 OperationLog。Browser 模式保持原路径和数据结构。
- Browser Quote Editor 仍以 `mockQuoteRepository` 保存 Quote aggregate，但 Q3 master selectors、供应商提示、制作预设、默认资料解析、新报价系统默认、Quick Create（含嵌套 Trim）与“保存到面/辅料库”均依 authority 选择来源/写入。Server default 通过既有 `/api/v1/quote-settings/resolved-defaults`；Server decimal 不可精确投影、401/403/409、网络及无效响应均 fail closed，不补读 Browser Q3。D-089/D-090 与 Quote 历史快照语义不变；复制报价的品牌/业务员读取也不在 Server 模式回退 Browser。
- Frozen Q3 读取已存在的 Browser envelope 时绕过会隐式 seed/migrate 的 `initialize()`；缺失或损坏的 Q3 来源直接报错。`saveBasicSettings`、`saveGlobalQuoteSettings`、Quick Create dispatcher，以及可整库替换/清空 Q3 记录的 Browser 备份恢复与本地数据重置入口，均在 frozen/server 模式拒绝写入。此保证适用于新构建中的这些路径，不是对旧 bundle、外部手动 localStorage 写入或尚未执行的维护窗口的现场证明。
- Q3B2I-A 不读取 fresh backup、不运行 Preview/Rehearsal/import、不连接真实 PostgreSQL、不执行 migration 或部署。Q3B2H 确认的七表 empty 是最新已有基线，不是本 Gate 的新 SQL 读回。B fresh import 与 C Server authority cutover 仍必须在同一个受控 Browser 停写窗口；guarded real import runner、D-091 import-level evidence 与 rollback/smoke Gate 尚未完成。

## Q3B2H 真实 schema activation — 当前状态

- 执行 commit `e209b855ecbb456d69c7a4298aeafffe460f19f2`；已审查 migration source commit `f0c252b52b6a626037e8ba70cf51d0e976e45447`。唯一目标 `zhixu-database` / `preparesystem` / `preparesystem_zhixu_data` / `zhixu`，fresh canonical fingerprint `28f587685bdf587bc21b4e348ac07da2297cc57029a81280b1c82208518d7ba1`。preflight 逐一确认 0001–0003 filename/checksum applied、0004–0007 pending、无 partial Q3 对象及 SalesOrder `511/511/511/1348/511`、零关联孤儿。
- 停止 `preparesystem-server-1` 与 `zhixu-factory-system`，保留数据库运行；共用 writer guard 证实其余同项目应用容器与真实 DB client backend 均为 0。停写后最终 rollback backup `zhixu-20260928T090305Z-23506a4a.dump`，`649357` bytes、SHA-256 `68b7d953157a62ae9e023868f3e6035477708035adc98f6e23627b8f8df7adc6`；archive list、跨副本 hash、无网络/host port/生产卷的 PostgreSQL 16 disposable restore、ledger/关键 schema/业务计数读回均 PASS。备份及 D-091 执行证据只保留于 Git-ignored 本机 `backups/`，没有执行真实 restore。
- 已提交的 `scripts/Invoke-ZhixuGuardedMigration.ps1 -VerifyOnly` 返回 applied=3/pending=4；同一 wrapper `-Execute` 经目标/来源/备份 hash/writer guard 后调用仓库 `runMigrations`，依序应用 0004、0005、0006、0007，跳过既有 0001–0003。每文件 ledger filename/checksum 的真实 `BEGIN READ ONLY` 读回全部 PASS。0004 terms 两表、0005 Quote foundation 八表、0006 sequence/unique/immutability trigger、0007 七张 master/settings 表与关键约束均存在，没有 partial state。
- 新 terms/Quote/master-settings 表全部 **EMPTY**，Quote sequence `last_value=1/is_called=false`；SalesOrder/source link/contract mirror/color mirror/SalesOrder OperationLog 仍为 `511/511/511/1348/511`，零关联孤儿。没有生成 fake per-row runtime OperationLog，也没有 master/settings import、Quote import、Browser write/authority cutover 或 real restore。D-091 独立 typed COMMITTED evidence 与安全 manifest 的 execution ID 为 `e6fff29579a7455287e688e9a5eac599`，typed validation PASS；当前仅是本机 Git-ignored 留存，**不宣称具备防篡改远端证据库**。
- 旧 Node 镜像只包含 0001–0003，迁移后 **DO NOT RESTART**；用户已自行将 `preparesystem-server-1` 更新为 revision `f0c252b52b6a626037e8ba70cf51d0e976e45447` 的 current-main 镜像。当前容器 running/healthy、restart count 0；`/api/v1/health` 返回 `ok/ready`，镜像的只读 migration status 返回 0001–0007 applied、pending `[]`、integrity `valid`、current `true`。七张 Q3 master/settings 表仍各为 0 行。**Q3B2H CLOSED / PASS；Q3B2I FRESH MASTER/SETTINGS SOURCE GATE NEXT。**当前 Windows/local Compose Server 仍运行于 development environment，不可写成 Linux production deployment ready；Codex 本 Gate 未修改部署 workflow。Browser 3000→3002 切换不是 migration 的副作用，Browser authority 保持原状。

## 已证实的基线与边界

- Q3B2B 对一份捕获于 `2026-09-22T03:16:14.008Z` 的标准 Browser backup 只读 Preview：`sourceHash=102b13d60b8bece83104bc5c516eb22c6c9b32bd4b540931fa9c49152339175c`，`blockingErrors=0`，投影 49 行。该文件和 hash **不是**未来真实导入的默认 source/授权。
- Q3B2C 消费同一个 Q3B2A Preview transformation，在 disposable PostgreSQL 16 上应用至 0007；49/49 行、stable IDs/FK、投影与读回内容 hash、decimal、null/zero、故障回滚及重复导入拒绝均通过。它没有真实数据库读写，也没有生成 runtime CRUD OperationLog。
- 真实 PostgreSQL 已承载正式 SalesOrder 等数据；Q3B2D 时，以往的 511 单证据不能代替对实际目标的现场 read-only preflight。Q3B2E 已单独完成历史检查，Q3B2H 已做执行窗口 fresh check 并应用 0004–0007；Quote/master import 和 Browser authority cutover 均未执行。
- 生产 `/basic-settings/*`、`/system-settings/quote-settings`、`/quote-center` 仍使用 Browser/localStorage/mock。隔离的 `/basic-settings/server/*` 和 `/system-settings/server/quote-settings` 只是 Server candidate，不是生产路由。没有 Browser↔Server 自动同步或双写。
- 已确认规则保持：D-089 每个 System/Brand/CustomerSalesperson 作用域最多一个 nullable `DefaultOtherCost`，不改变 Quote `OtherCostLine` 0..N；D-090 默认制作预设必须 active；DefaultTrim 目标没有 quantity/usage；同名 Fabric/Trim 按 ID 保留；Supplier 仍为自由字符串。

## Migration activation 的真实语义

`server/index.ts` 正常启动只调用 `verifyMigrationsCurrent`：在 read-only transaction 中验证 ledger、filename/checksum 与 pending，异常时在权限同步、管理员 bootstrap 和 HTTP listen 前 fail closed，不会隐式建表。只有另外授权的 `npm run db:migrate` 才调用 `runMigrations`。后者按版本排序，使用 advisory lock，**每个待执行文件各自 `BEGIN`/`COMMIT`**；失败只回滚当前文件，之前成功的文件仍已提交，重新运行会跳过 ledger 中已应用的文件。0004–0007 不是一个总事务，也不能以“仅应用 0007”描述现有命令。

以下是 Q3B2H **执行前**依据 Q3B2E 只读 ledger（当时仅有 0001–0003）制定的顺序与失败语义；Q3B2H 已依此成功应用全部四个文件。不要把下表的“若执行”视为当前 pending 状态：

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

**Q3B2E 分类：EXPECTED PRE-ACTIVATION STATE / READY FOR NEXT SAFETY GATE。** 这只表示真实库 read-only preflight 在该时点 PASS，**不授权 migration、backup、import、Browser cutover 或 real business writes**。下一独立 Gate 应取得明确授权，完成真实 PostgreSQL backup + 隔离 restore drill 与 maintenance/write-freeze 准备；之后重新核对 target/ledger/source 并另行申请 schema activation。Q3B2E 是窗口前早期检查，不能替代下方 runbook Phase 6 在备份和冻结后的 fresh preflight。2026-09-22 Browser backup 仍只作 rehearsal evidence，fresh Browser source 未读取；当时 migration audit policy 未决定，后由 D-091 确认。本 Gate 的 PostgreSQL writes、Browser writes 均为 0。

### Q3B2F 真实备份与隔离恢复演练 — 2026-09-28

本 Gate 在标准 checkout 的 `origin/main=2acbad01f6a0a4bb1612df11d2dcb07057459461` 上执行。历史 `main` 被另一 worktree 占用，故在标准 checkout 直接从相同 `origin/main` 建立独立 audit branch，未修改历史 checkout。备份前重新核对运行中 `zhixu-database` 的 Compose project `preparesystem`、挂载卷 `preparesystem_zhixu_data`、数据库 `zhixu`、PostgreSQL `16.14` 与 Q3B2E target fingerprint `28f587685bdf587bc21b4e348ac07da2297cc57029a81280b1c82208518d7ba1`。每组真实 SQL 都先 `BEGIN READ ONLY` 并确认 `transaction_read_only=on`。ledger 0001–0003 filename/checksum 与仓库原文件一致；0004–0007 pending，匹配其命名空间的 relation/function/trigger/constraint 为 0，七类 Q3 target absent。关键已应用对象、SalesOrder `511`、source link `511`、contract mirror `511`、color mirror `1348`、OperationLog 总量 `511` 均与 Q3B2E 一致；没有把旧检查当作永久保证。

从上述精确容器执行 `pg_dump --format=custom --no-owner`，只在其 `/tmp` 暂存，复制并保留于本 checkout 被 Git ignore 的 `backups/`。备份 UTC timestamp `2026-09-28T05:04:09Z`，sanitized filename `zhixu-q3b2f-20260928T050409Z-13e3aa43.dump`，大小 `649,070` bytes，SHA-256 `58206370ec008dab51689acef8ee75e4f01a7acad33465b3b0c69fe866177f10`。生产容器内、host 与 disposable restore 容器内的 hash 完全一致；生产容器 `/tmp` 副本已定向删除。`pg_restore --list` exit 0，有 149 个目录项，包括 18 个 table 与 18 个 table-data 项，非空且可解析。备份本身不提交 Git，也不等同于停写后的最终 rollback backup。

恢复演练只使用本地 `postgres:16-alpine`、唯一容器 `zhixu-q3b2f-restore-13e3aa43`、`restore_drill` 空数据库、`--network none`、无 host port binding、无 Docker volume mount，并把 PGDATA 与 `/tmp` 放在 disposable tmpfs。没有复用生产 credential、`.env`、网络或卷。备份复制到容器 `/tmp` 后执行 `pg_restore --exit-on-error --no-owner --no-privileges`，exit 0。恢复后 PostgreSQL `16.14`：ledger 0001–0003 的 filename/checksum 完整，0004–0007 对象仍 absent；12 张关键已应用表、SalesOrder sequence、5 个关键函数、5 个 trigger、7 个关键 index、3 个 FK 与 5 个 CHECK 存在。读回 `511/511/511/1348/511`，三个 source/contract/color FK 孤儿计数均为 0，SalesOrder sequence `last_value=511/is_called=true`。这证明了完整 archive→isolated PostgreSQL→read-back 路径，不只是 TOC 可解析。随后只删除精确 disposable container；无生产卷挂载，tmpfs 随容器清理，主机 verified backup 保留。生产数据库和 legacy 应用仍 running、各自 restart count 0；真实业务计数在演练后只读复核不变。本 Gate 对真实 PostgreSQL 的 business/schema writes、migration、restore 与 Browser writes 均为 0。

当前运行的 `zhixu-factory-system` 是未来 DB writer freeze 对象；`pg_stat_activity` 同时观察到一个 idle `zhixu-server` client，另有本次 active read-only `psql` 与五个 PostgreSQL 后台进程。单次 session 快照不能排除未来的后台/sync job、手工管理员连接或断开后重连的 writer。未来 schema-only A Gate 至少冻结 legacy 应用、Server API、任务和手工 DB writer；未来 master/settings import/cutover 的 B+C Gate 还须在 fresh Browser source 导出前冻结 Browser Basic/Global Settings、Quote Editor default 与 Quick Create 写入，并维持至唯一 authority 验收。Q3B2F **只准备，不停写**。

| 未来 maintenance phase | 前置条件 | 允许动作（须另行授权） | 必留证据 | 中止条件 |
| --- | --- | --- | --- | --- |
| 0 — authorization | 目标、执行人、范围、部署 commit、审计/恢复政策明确 | 记录书面批准与禁止项 | 授权、责任人、窗口 | 任一政策或目标未定 |
| 1 — user notification | Phase 0 完成 | 通知停写范围、预计时段与回退影响 | 通知及确认 | 受影响用户未获通知 |
| 2 — Browser/source freeze（仅 B+C） | 进入 import/cutover，Browser authority 已定位 | 冻结 Browser master/settings/Quick Create 写入；随后 fresh export、Preview、同文件 disposable rehearsal | 冻结时点、文件 hash、sourceHash、blockers=0、rehearsal | Browser 写入继续、来源/哈希漂移 |
| 3 — DB writer freeze | 所有 legacy、Server、job、手工 DB writer 已列清 | 逐一暂停或切只读；schema-only A 也必须执行 | 进程/连接清单及负责人、停写时点 | 任一 writer 无法控制 |
| 4 — verify zero business writers | Phase 3 完成 | 只读查 session/任务与应用写入开关，观察重连 | 安全 aggregate、无写确认 | 新连接/写入或身份不明 |
| 5 — fresh real DB preflight | writer freeze 持续 | 只读核对容器/卷/DB/version/fingerprint、ledger/checksum、对象/业务计数 | 与执行 commit 对应的现场 snapshot | drift、partial schema、unexpected target data |
| 6 — final rollback backup | Phase 5 PASS、仍停写 | 从精确目标生成**新的** custom dump；不复用 Q3B2F 文件 | timestamp、大小、hash、ledger/count | 目标不符、dump 失败 |
| 7 — backup hash/validation | Phase 6 文件不可变 | 验证跨复制 hash、archive 与隔离 restore/read-back 能力 | hash/TOC/restore evidence、保管位置 | 任一验证失败或副本不可信 |
| 8 — migration（本 Gate 禁止） | 独立 schema 授权、Phase 7 PASS、冻结持续 | 只通过审查的显式 migration runner 执行全部 pending 文件 | 每文件 ledger/result、deploy commit | 文件失败、对象/约束异常 |
| 9 — verification | Phase 8 已停于确定状态 | 只读核对 ledger、对象、业务计数、sequence 与审计证据 | before/after 安全对账 | 不一致、未知业务变更 |
| 10 — resume writers | Phase 9 PASS，是否进入 B+C 已明确 | 仅恢复验收所需的受控 canary writer/流量；广泛解除冻结须等 Phase 11 PASS，B+C 的 Browser freeze 仍维持 | 恢复清单、单一 authority、持续停写范围 | drift、双写、未验收入口 |
| 11 — smoke acceptance | 受控路径已恢复且人工计划就绪 | 验证健康、可信权限、只读与获准 canary 写路径；B+C 还须验收唯一 Server authority；PASS 后另行确认广泛解冻 | 逐项 PASS、错误路径、审计/计数、解冻签核 | 业务或权限失败，重新冻结调查 |

现有 migrations 为 forward-only，没有 down。某个 migration 文件失败时，之前成功的文件可能已提交：立即 STOP、保持冻结、记录 ledger/object 实际状态，优先审查可验证的 forward fix，不假装总回滚。schema verification mismatch、smoke failure 或意外业务数据 mutation 均先停流量、保持冻结并评估具体影响；只有 forward fix 不安全、rollback backup 与隔离恢复证据可信、RPO（含窗口内所有数据库写入）可接受，且另获**破坏性恢复授权**时才考虑真实 restore。若 backup/hash/restore 证据不可信，禁止 migration 和 restore，先重建可信备份；绝不自动恢复。Q3B2F 备份是在未冻结 writer 时捕获的工程证据，不是未来执行窗口的最终恢复点。

### Q3B2H Node Server image recovery readiness — disposable only

Q3B2H 的真实 schema activation 在 writer freeze、final backup、0004–0007 执行前已安全暂停。运行中的 `preparesystem-server-1` 旧镜像只包含 0001–0003；一旦真实 ledger 出现 0004–0007，该旧镜像的 `verifyMigrationsCurrent` 会因已应用文件缺失而拒绝启动，**NOT SAFE TO RESTART AFTER MIGRATION**。本 prerequisite 没有停止、重启或替换该容器。

从未修改的 main Server/Dockerfile/migration 源 commit `f0c252b52b6a626037e8ba70cf51d0e976e45447` 构建的本地 prepared 镜像 `zhixu-server:q3b2h-ready-f0c252b52b6a`（build-id `q3b2h-readiness-f0c252b52b6a`）实际包含 0001–0007，七份 SQL 的镜像内 SHA-256 与仓库源文件相同。它只在两个随机命名、`--network none`、无 host port/生产 volume、PGDATA tmpfs 的 PostgreSQL 16 disposable 容器中测试：完整库使用正式 migration runner 应用 0001–0007，ledger filename/checksum 全部匹配；该镜像通过 verify-only startup，随后完成 permission catalog sync、测试管理员 bootstrap、HTTP listen 与 `/api/v1/health`。另一库仅有 0001–0003，镜像以 `pending_migrations` 退出，permission sync、admin bootstrap 和 listen 均未发生。测试后精确 disposable Server/DB 容器已删除；prepared image 留在本机，不是生产部署或未来环境的镜像身份保证。

未来窗口在另行授权后必须按以下顺序执行；每步失败保持停写并停止推进：

1. Fresh exact-target preflight：核对运行目标、部署 commit、migration source/ledger/checksum 与业务基线。
2. 冻结当前所有 DB writers（legacy、Server、job、人工连接等）。
3. 证明 business writers = 0，且持续监控重连；不能仅依赖 Node pending fail-closed。
4. 在停写状态创建新的 final rollback backup，核对大小与 SHA-256；不复用 Q3B2F 旧备份。
5. 在独立 disposable PostgreSQL 完成这份 final backup 的 restore/read-back 验证。
6. 仅以另行授权的 guarded runner 显式应用 0004→0007；逐文件确认结果，不用 Server startup 隐式迁移。
7. 对真实目标做 read-only post-migration ledger、对象和业务计数核验。
8. **用户自行**以经核对的 current-main Node Server image 替换/启动 Server；Codex 在本 Gate 不部署、不触碰运行容器。
9. 验证 `/api/v1/health`。
10. 验证新 Server 认识真实 ledger 的全部 0001–0007 文件与 checksum，确认没有旧镜像 missing-file 故障。
11. 仅在以上全部 PASS、责任人签核及单一 authority 边界明确后恢复正常使用。

本段只记录当时的 **disposable prerequisite**：在该时点 Q3B2H 尚未执行，prepared image 也不是生产部署。此后用户已分别授权真实 schema activation 并自行完成本地 Node replacement；当前结果见文件开头的 Q3B2H CLOSED / PASS 记录。Quote/master import 仍未执行。

Q3B2F 当时的 `Backup-Zhixu.ps1` 依据脚本 checkout 的 `.env` 与当前 Compose project 解析 `database`，缺少 exact container/fingerprint guard；`Restore-Zhixu.ps1` 还会 `--clean --if-exists` 覆盖数据并重启应用。因此当时结论为 **HARDENING REQUIRED**。Q3B2G 的后续实现见下；Q3B2F 本身未运行两份生产脚本，也未操作另一个未挂载的 `zhixu-ainuoke-api_zhixu_data` 卷。

### Q3B2G exact-target ops guard 与审计证据契约 — 2026-09-28

`scripts/database-target-guard.ps1` 是 Backup/Restore 共同使用的唯一目标检查：调用者必须显式给出 container、Compose project、PGDATA volume、database 与 expected fingerprint；新鲜 Docker metadata 必须证明精确容器正在运行、service=`database`、project 一致且 PGDATA 只有一个指定持久卷，其 volume Compose label 也一致。disposable 测试专用 `ExpectedVolumeName=tmpfs` 分支要求 PGDATA tmpfs 且无 Docker volume mounts。然后在**该精确容器内部**以 `BEGIN READ ONLY`/`transaction_read_only=on` 查询 DB identity，引用容器内 `POSTGRES_USER/POSTGRES_DB`，不打印或提取密码/Env。任一歧义、缺失、服务/卷/DB/指纹不匹配均 fail closed；不会因当前 checkout 名称或第一个 `zhixu*` 容器自动选择目标。

唯一 operational fingerprint v1 的 canonical UTF-8 字节是 `composeProject|containerName|pgdataMountName|databaseName|serverAddressOrLocal_socket|port`，对其计算 lowercase SHA-256。字段顺序、竖线分隔、`inet_server_addr()` 为 null 时使用字面量 `local_socket` 与 Q3B2E/Q3B2F 完全相同；`com.docker.compose.service=database` 是**强制独立校验**，虽未进入历史 hash，也不得绕过。v1 对当前真实目标复现 `28f587685bdf587bc21b4e348ac07da2297cc57029a81280b1c82208518d7ba1`；该值只属于旧 checkpoint，未来操作者必须先获取新的预期值并在执行前重新校验，不得永久硬编码 `preparesystem` 或此 hash。共享 helper 的 disposable 测试通过后，真实环境仅执行了 Backup 的 `-VerifyTargetOnly`：返回相同 fingerprint 和 PostgreSQL `160014`，没有创建本 Gate 的真实 dump。

`Backup-Zhixu.ps1` 现在先验证目标，再允许 custom-format `pg_dump --no-owner` 到该容器 `/tmp`，核对容器与 host SHA-256、非空大小和 `pg_restore --list`，并只在 Git-ignored `backups/` 留 host copy；`-VerifyTargetOnly` 不创建 dump。`Restore-Zhixu.ps1` 默认拒绝执行，须同时提供 allowed backups 目录内 `.dump`、expected backup hash、同一套 expected target、`-ConfirmDataLoss` 和与 expected hash 精确相同的第二个 `-ConfirmTargetFingerprint`。归档/list、复制 hash 与执行前第二次 writer 检查不通过则不调用 destructive `pg_restore --clean --if-exists`。Writer guard 拒绝同 Compose project 下除数据库外仍 running 的容器，以及数据库中除自身外的 client backend；不 stop/kill writer，也不能取代正式 maintenance 人工停写证明。restore 成功后只重新验证目标 identity，**默认不自动重启/恢复任何 writer**，操作者须另行做 ledger/业务对账再决定恢复。Q3B2G 只在随机命名、`--network none`、无 host port/生产卷的 disposable PostgreSQL 上测试实际备份与恢复；未对真实库执行 backup/restore/migration/schema/business write。

`server/db/migration-evidence.ts` 定义纯 typed、storage-neutral 的 `MigrationExecutionEvidence` v1 与 strict validation/serialization：execution ID/type/outcome、起止时间、operator ID、授权引用、repo commit、target fingerprint、DB/version、ledger 文件名/checksum、rollback backup hash、planned/committed/readback counts 与 readback hash；import 还强制 source file SHA、sourceHash、projection content hash；失败需 bounded code/phase，PREPARED 不得声称 commit。未知字段、敏感键/值、raw rows 和非安全计数被拒绝。它不写 DB、不生成 runtime OperationLog，也不是 real execute runner。未来 guarded runner 须为**每次 attempt**持久保存一份可验证证据，包含失败 attempt；具体 durable storage/retention 仍需独立实现审查，但 D-091 政策已经确认。

## Maintenance/write freeze 与 backup/restore

Browser master/settings/Quick Create 写入冻结从 fresh source export **之前**开始；在真实 PostgreSQL backup **之前**将冻结扩至 Server API、后台任务、legacy 根 ERP 等所有会写同一数据库的进程，持续到 migration、import、read-back、authority switch 和 smoke acceptance 明确结束。SalesOrder 当前正式 writer 也不得在完整数据库冻结窗口写入。Node Server 在 pending migration 下本来会 fail closed，但不能把这一点当作对其他 DB client 或 Browser localStorage 的冻结。若窗口内仍有其他业务写入，整库 restore 会回退它们，不能声称只回退 Quote masters。

真实 migration 前仍须单独授权并完成停写后的 final backup；即使 Q3B2G 已加入 exact-target guard，也不能仅凭本轮 disposable tests 或 `-VerifyTargetOnly` 代替生产维护窗口的 full writer freeze、final dump/restore evidence 和独立批准。真实 restore 还需破坏性授权及脚本的双重确认；`--clean --if-exists` 仍会覆盖数据，但脚本已不再自动重启应用。若失败可由 forward fix 安全解决，先审查 forward fix；不能自动 down migration 或自动 restore。恢复后也须验证 Browser source/Server authority 指向一致，不得产生双写窗口。

## Migration audit policy — CONFIRMED D-091

用户已确认 D-091：Server `operation_logs` 只记录真实 trusted runtime business mutation。历史 migration/import 不导入 Browser OperationLogs、不伪造 Server session/actor、不创建 49 条逐 row CRUD；每次受控 execute attempt 留**一份独立 migration-level execution evidence**，成功与失败均记录真实 outcome/commit 边界。至少要能核验 operator/授权、时间、code、target/ledger、rollback backup、适用时的 source/projection、planned/committed/readback counts/hash 与脱敏 failure code/phase，不含 password、URL、raw backup 或敏感业务 payload。Typed validation contract 已实现；正式不可篡改保管载体和失败证据写入时机仍需未来 guarded execute-runner Gate 实现审查。此决定不授权真实 import 或 schema activation。

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
| 5 — real PostgreSQL backup | Phase 4 生效，精确容器/卷/DB 身份已核对，备份脚本已 harden 或改用审查过的 exact-target 路径。 | 经另行授权创建新的 dump、核对 hash/size 并隔离 restore 验证；不直接运行当前未 harden 的脚本。 | timestamped dump、SHA-256、ledger/业务 count snapshot、restore drill PASS。 | 目标不匹配、备份/验证失败。 | 尚无 schema/import 写；修复备份流程。 |
| 6 — read-only preflight | Phase 5 可靠，已获真实 DB read-only 授权。 | 只读核对 DB/version/ledger/checksums/pending/对象/counts/deployment commit。 | 0004–0007 exact status、无 unexpected partial state、SalesOrder baseline。 | 身份/ledger/object/count 任一不符。 | 尚无本轮 DB 写；保持冻结调查。 |
| 7 — schema activation | 0004–0007 的整体影响获独立授权、backup 可恢复。 | 显式一次 `npm run db:migrate`；之后只读检查 ledger/对象。 | 每文件 applied/skipped、checksum、约束与 sequence evidence。 | 某文件失败或意外对象。 | 逐文件已提交；不得假装全回滚，forward fix 或经授权 restore。 |
| 8 — master/settings import | 七类目标表空、fresh file/sourceHash/ledger/双确认完全匹配，production runner 已审查。 | 只通过专用 guarded CLI 执行一次 1-transaction import。 | in-transaction counts/hash；commit 后读回 hash/ID/FK/decimal。 | 任一 guard、写入或对账失败。 | commit 前 rollback；commit 后保持冻结，需人工 forward fix/restore 决策。 |
| 9 — reconciliation | Phase 8 完整成功；冻结保持。 | 只读复核 7 表、content hash、Global defaults、SalesOrder/Quote/terms 等非目标 counts。 | projection=PostgreSQL、未触碰其它领域、migration evidence。 | 数量/hash/外域 baseline 不符。 | 不宣称成功，不开放写；人工决策。 |
| 10 — production authority switch | Phase 9 PASS、全部 production integration 与 audited rollback switch 已验收。 | 在同一冻结边界内切 Server-only routes/identity/defaults；禁用 Browser 写/fallback。 | 唯一 Server authority、部署 commit、route/config evidence。 | 任一入口仍读写 Browser 或双写。 | 立即停止流量/继续冻结；按预审策略切回或恢复。 |
| 11 — smoke acceptance | Phase 10 完成，人工验收计划就绪。 | trusted session 下验证 list/read、细粒度权限、默认解析、可控 write/audit、刷新、错误路径。 | 逐项 PASS、业务/审计前后 counts、无 Browser write。 | 401/403/409/保存/回读异常或 drift。 | 冻结不解除；安全切回/恢复需单独授权。 |
| 12 — rollback-window close | Phase 11 PASS，所有证据留存，用户确认。 | 明确关闭窗口、解冻指定 writer、持续监控。 | final source/DB hashes、backup retention、责任人签核。 | 未解决差异或恢复方案不可用。 | 解冻后整库 restore 的 RPO 变大；不能自动回退。 |

## Go / No-Go（Q3B2D 规划，Q3B2G 安全实现后更新）

下表 `Required` 指**真实 import/cutover 前**；read-only preflight 本身仍需单独用户授权。旧 Preview/Rehearsal 不替代 fresh evidence。

| Condition | Required | Current status | Blocking? |
| --- | --- | --- | --- |
| Q3B2B clean Preview | YES，历史工程证据 | PASS，旧 sourceHash，49 行 | 不阻断 planning；不够真实 import |
| Q3B2C clean disposable rehearsal | YES，历史工程证据 | PASS，旧 sourceHash | 不阻断 planning；不够真实 import |
| Fresh Browser backup + write freeze | YES | 未执行 | **真实 import blocker** |
| Fresh source/file hash + Preview blockers 0 | YES | 未执行 | **真实 import blocker** |
| Fresh disposable rehearsal same file | YES | 未执行 | **真实 import blocker** |
| Real DB identity/ledger/checksum/status preflight | YES | Q3B2H fresh exact-target preflight 和 post-activation read-only verification PASS；现在 0001–0007 applied/checksum consistent | schema activation 已完成；未来 import 仍需 fresh check |
| Real DB backup + isolated restore evidence | YES | Q3B2H 停写后 final archive + hash + isolated PostgreSQL 16 restore/read-back PASS；Git-ignored 本机保存 | schema activation 已满足；未来 import 另需自己的 rollback 窗口检查 |
| Backup/restore script target hardening | YES | Q3B2G shared guard；Q3B2H 正式 backup 与 guarded migration 均通过 exact target 验证 | schema activation PASS；真实 restore 仍未授权 |
| Maintenance/full writer freeze | YES | Q3B2H 冻结 Node/legacy 并验证 0 client；用户随后自行部署新 Node，当前 running/healthy | schema activation 与本地 Node recovery PASS；后续 import 另需 fresh freeze |
| Production Basic/Global Server adapters on formal routes | YES | 仅隔离 candidate | **cutover blocker** |
| Quote Editor master/default/Quick Create Server integration | YES | Browser/local | **cutover blocker** |
| Trusted identity/RBAC | YES | Server foundation ready；production convergence incomplete | **cutover blocker** |
| Migration audit policy | YES | CONFIRMED — D-091；Q3B2H 本地 Git-ignored typed schema execution evidence 已生成并验证；正式防篡改远端 storage 尚未接入 runner | schema attempt 有独立证据；未来 import 的 durable storage 仍待审查 |
| Guarded real import CLI + rollback mechanism | YES | 未实现/未验收 | **import blocker** |
| Manual UI acceptance and rollback switch | YES | 未验收 | **cutover blocker** |

**当前结果：Q3B2H CLOSED / PASS；Q3B2I FRESH MASTER/SETTINGS SOURCE GATE NEXT；NOT READY FOR MASTER/QUOTE IMPORT OR BROWSER CUTOVER。** 0004–0007 已正式应用，七张 Q3 表仍空，用户自行完成的 Windows/local Compose Node recovery 已通过 health 与 migration-ledger recognition。旧 Node 镜像不可重启；当前 development 环境验收不等于 Linux production deployment ready。未来导入仍需要 fresh Browser source/Preview/rehearsal、受控 importer、可保管的 D-091 evidence、生产集成和独立授权。Q4 attachments、Q5 Quote data migration 与 Quote production cutover 均属后续独立阶段。

## 审计依据

- `server/index.ts`、`server/startup.ts`、`server/db/migration-runner.ts`、`server/db/migrate.ts`、`database/migrations/0004`–`0007`。
- `features/basic-settings/server/master-settings-backup-preview.ts`、`master-settings-migration-preview.ts`、`server/integration/quote-master-settings-migration-import.ts`、`quote-master-settings-rehearsal.ts`、两个 CLI scripts。
- `features/basic-settings/components/basic-settings-pages.tsx`、`quick-master-data-create.tsx`、`server-basic-settings-candidate-page.tsx`、`features/quote-center/components/quote-editor.tsx`、`quote-pricing-settings.tsx`、`global-quote-settings-page.tsx`、`features/quote-center/repository/mock-quote-repository.ts`、`features/global-search/registry.ts`。
- `Backup-Zhixu.ps1`、`Restore-Zhixu.ps1`、Active D-086/D-088/D-089/D-090、`docs/features/BASIC_SETTINGS.md`、`QUOTE_CUTOVER_READINESS.md`、`DATA_LIFECYCLE.md`、`PERMISSIONS.md`、`OPERATION_LOGS.md`。
