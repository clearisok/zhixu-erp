# 当前状态

> 状态快照：2026-10-04。下方较早 Gate 的“未开始/未授权”陈述是当时的历史快照，不代表当前状态。

## 当前阶段

- **D-093 Local Single-User Mode：代码/可丢弃数据库测试已完成，待 PR 审阅；真实 3001 尚未替换。** 用户取消当前开发阶段账号密码/session/RBAC 登录验收与 Q3B2I-C2 B3/B3-R Gate；Server 在显式无认证模式下提供单一可信本地身份和完整 PermissionKey，同时保留 service 权限、事务、Origin 防护及 OperationLog FK。旧 auth schema/code dormant，不清理。新模式不是公网生产认证；未来多用户认证另立 Gate。当前真实 3001 仍是此前 B2 的 Server Authority 镜像，3002/frozen 停止，Q3 master/settings 57 行/hash 保持既有基线；本代码 Gate 不部署、不 import、不重开编辑。下一步为独立部署及只读 acceptance 授权。
- **Q3B2I-C2 Stage B2 已完成，B3/B3-R 登录验收已由 D-093 supersede。** 旧 B1 “handoff 尚未执行”和 Stage A “Stage B 未执行”均为历史快照，不得用作当前操作指令。

## 历史 Gate 快照（以下旧状态不得作为当前操作指令）

- **Q3B2I-C2 Stage B1 VerifyOnly engineering fix（未在真实环境重试）。** 唯一真实候选镜像已构建并通过 image label / compiled build-info 校验：`zhixu-q3-c2-server:20260930t030902z`，image ID `sha256:37375e0434754e2d8bf61226732d9d4e0d3c8f653e797f3e0e3a4cc530bfe104`，build ID `q3b2i-c2-20260930T030902Z-server`，product source 仍为 `cbe4d7f52d461f93eb4fce22c1550dbc5ed2330a`。B1 真实只读预检的 ledger、57 行/hash、关联/default、admin/RBAC 与 durable evidence 均通过，但 handoff `-VerifyOnly` 因 StrictMode 直接读取合法缺省的 `failure` 属性而 BLOCKED。此分支仅修复 operational script 的 optional-property 兼容并加入 disposable 回归测试；须审阅/合并后才可用新的 operational commit 重试真实 B1。真实 3001 仍为原 frozen static，3002 停止，PostgreSQL healthy；候选未运行，未执行 Execute、真实 login 或真实 Q3 business/master 写入。
- **Q3B2I-C2 Stage A = COMMITTED_PASS；Stage B 尚未执行。** 真实 Q3 master/settings 导入已单事务提交并读回：brands/customerSalespeople/fabrics/trims/manufacturingPresets/brandDefaultTrims/salespersonDefaultTrims/globalSettings = `4/6/10/21/2/5/8/1`，合计 `57`。execution ID `q3-import-4cfff45a-40f6-4da0-86fc-eb51cf230980`；import evidence SHA-256 `183e14d1c0d2a0b8596a9e847cc297e8dedd63e51d05baddfdec30ccac199ba9`；projection/readback content hash `b8cb63088ff343154f138f196930b2105c81d90ddc73485487867c3a2b2d0914`；reviewed product source `cbe4d7f52d461f93eb4fce22c1550dbc5ed2330a`。真实 3001 仍是 frozen static，3002 writer 仍 STOPPED，PostgreSQL running/healthy；Browser Q3 editing 未重新开放，`authority=server` 未部署。C1 已 COMPLETE/PASS，不能把 Stage A 导入回写为“未执行”。
- **Q3B2I-C2 Stage B0 = engineering/disposable only。** 独立的 frozen-static→同 origin Server handoff 工具将操作脚本 revision 与上述产品源码 revision 分开绑定；它要求精确 frozen/server image、容器、构建、target、已提交导入证据，且从当前数据库只读重算 canonical Q3 content hash。隔离 PG16/tmpfs + 随机端口证明正常交接、frozen 前端失败回退与真实 Chromium 在 HTTP loopback 上接受生产 Secure cookie、trusted session/RBAC；不表示真实 Stage B 已经授权或执行。失败后可能已有 auth/permission 基础表写入，恢复 frozen 前端**不是数据库回滚**。正式 Stage B 仍需独立审阅与明确授权，不能以 B0 验证代替真实验收。
- **Q3B2I-C0 FINAL RE-PREFLIGHT = PASS（2026-09-29，只读）。** Reviewed `main` 为 `fb150d85ad32e7f640b3488551673424fb26d63c`；真实 `zhixu-database` 指纹未变，0001–0007 ledger/checksum 全部匹配，七张 Q3 master/settings 表仍各为 0。SalesOrder/link/contract/color/log 为 `511/511/511/1348/511`，关键关联孤儿及规范化编号重复均为 0；唯一观察到的真实 DB client 是 3002 `preparesystem-server-1`。3001 当前离线，未来须由操作者管理旧前端生命周期后用 reviewed frozen static 占据同一 origin；离线本身不是 blocker。C0.3 Guarded VerifyOnly、split continuity、frozen export、post-freeze rollback 与 D-091 独立证据副本门禁均已通过代码/既有 disposable 测试审计，`D:\OneDrive` anchor 存在；C1 **READY FOR SEPARATE USER AUTHORIZATION，不等于 AUTHORIZED**。C1 未开始，import Execute 未授权；本次真实 PostgreSQL 只有只读查询，business writes 0，Browser mutation 0，无 fresh export、freeze、final backup、OneDrive copy、import 或 authority switch。当前 authority 仍 BROWSER。
- **Q3B2I-C0.3 pre-Execute proof closure = CODE/DISPOSABLE ONLY。** Guarded `-VerifyOnly` 与 `-Execute` 共用 exact-target DB-writer 冻结检查，且都要求 rollback manifest 创建时间与 dump 文件修改时间不早于 Browser freeze、manifest 不在未来；Execute 前 fresh guard 仍保留。D-091 pre-execute 证据包使用严格 JSON 白名单、机读 SHA-256 manifest、明确确认后的独立目录复制和 destination readback hash；原始 Browser backup 与 PostgreSQL dump 本体绝不进入该 Evidence 目录。该 Gate 仅在随机 disposable 目录/数据库验证；真实 OneDrive、3001/3002、Browser、PostgreSQL 均未操作。随后 C0 FINAL RE-PREFLIGHT 已单独完成。
- **Q3B2I-C0.2 split-topology engineering = CODE/DISPOSABLE ONLY，未部署。** 用户已确认 authoritative origin `http://127.0.0.1:3001`、Chrome profile 操作标签 `Chrome-authoritative`；当时 3001 为 Windows host `vinext dev`，API 代理到 3002，后者是 Compose DB-capable writer。既有 D-092 colocated handoff 不适用于该拆分拓扑。本分支新增独立 frozen static 3001 启动/独立 3002 writer freeze 的显式工具和容器 ID 连续性检查；frozen 标准备份导出不再执行隐式 Browser 初始化。未来 3001 frozen static、3002 stopped、最终 3001 server-authority Node 都只是受控窗口计划；该 Gate 未操作真实 3001/3002，Browser authority 仍为 BROWSER，fresh export/real import 均未执行。C0 final re-preflight 随后已通过，只剩独立 C1 授权。
- **Q3B2I-C0.1 = ENGINEERING READY / NOT EXECUTED。** `Dockerfile.server` 已把三态 Q3 authority 编进前端与 build-info/image label，invalid build fail closed；production runtime identity mismatch fail closed。新增同镜像 maintenance-static，仅提供静态页面和静态健康状态，拒绝 `/api/*`，不加载 DB/config/migration/RBAC/admin。显式 same-origin handoff 的 VerifyOnly/Execute 在随机 disposable 容器完成 frozen full Node → stop writer → 同 image ID static 的验证；static 无 DB env、生产卷或数据库 Compose network，现有 writer guard 未放宽。新代码已纳入 reviewed-source guard；隔离 importer/rehearsal 与 source-guard 测试通过。**真实环境未部署或交接**：该 Gate 当时尚待用户确认 authoritative Browser origin/profile 与 D-091 独立第二副本目的地；两项随后已确认，C0 FINAL RE-PREFLIGHT 亦已完成，但 C1 仍未授权。见 D-092 与 `docs/features/Q3B2I_CUTOVER_RUNBOOK.md`。该 Gate 真实 PostgreSQL writes 0、fresh export NO、Browser/DB freeze NO、real import NO、authority 仍 BROWSER。
- **Q3B2I-C0 read-only preflight = BLOCKED（2026-09-29）。** 真实目标指纹、0001–0007 ledger/checksum、七张 Q3 空表及现有业务 aggregate/孤儿只读复核 PASS；运行中的 Windows/local Compose Server 仍是旧 revision `f0c252b52b6a626037e8ba70cf51d0e976e45447`，`/build-info.json` 没有 Q3 authority 字段。当时 `Dockerfile.server` 未把 `NEXT_PUBLIC_ZHIXU_MASTER_SETTINGS_AUTHORITY` 传入 Vite build；同一 Node 容器既提供 frozen `/build-info.json` 又是 writer guard 要求停掉的 DB client，现有部署拓扑无法同时满足 guard。真实 authoritative Browser origin/profile 尚未证明，D-091 第二份独立耐久副本位置/验证未完成。后续工程修复与待执行清单见 `docs/features/Q3B2I_CUTOVER_RUNBOOK.md`。本次无 fresh export、冻结、备份、导入、部署、真实 PostgreSQL write 或 authority 切换；该时点的 C1 不能按原部署形态启动。
- **Q3B2I-B operational freeze / guarded import readiness = IMPLEMENTED / DISPOSABLE-VALIDATED，未在真实资源执行。** Q3B2I-B 的 Vite 构建逻辑可生成含 Q3 authority 的 `build-info.json`（当前运行旧镜像尚未包含该字段），独立只读 verifier 对照 origin、Git commit、build ID/time 与 `frozen`；旧标签页关闭仍须操作者明确签核，不能由工具自动证明。Fresh source 同时绑定标准 Browser backup 文件 SHA-256、canonical Preview `sourceHash` 与投影内容 hash；隔离 PostgreSQL 16、无 host port/生产 volume 的演练在 cleanup 后发布机读 proof，并验证事务前失败全回滚、提交后读回故障绝不伪称回滚、二次导入拒绝。Guarded VerifyOnly/Execute 在隔离库通过，错误目标/ledger/evidence 与 reviewed code drift/untracked critical source 均 fail closed。真实 importer 仍要求 Q3B2G 精确目标指纹、0001–0007 current ledger、空目标、Browser/DB 双冻结、新的同目标 rollback dump+manifest、独立确认和单事务导入；VerifyOnly 不写 DB。D-091 import 证据区分失败、COMMIT 结果未知、已提交但读回未验证、已提交并验证，异常均保持冻结。**本 Gate 没有抓取 fresh real Browser source、没有连接/写入真实 PostgreSQL、没有真实 import、没有部署、没有切换 authority；Browser 仍为正式 master/settings authority。**Q3B2I-C 必须单独授权且与导入处于同一受控停写窗口。
- **Q3B2I-A production master/settings authority wiring = IMPLEMENTED / NOT ACTIVATED。** 正式四个 Basic Settings 路由、Global Quote Settings 与 Browser Quote Editor 的 Q3 master/default 依赖已接到单一 `browser | frozen | server` 配置边界；默认仍为 `browser`。`frozen` 仅读既有 Browser Q3 envelope，不触发 seed/migration，所有 Q3 Browser save 均 fail closed；`server` 复用 Q3B1 typed adapter、trusted session/RBAC/transactional OperationLog 与 Server resolved-defaults，不读写 Browser Q3 作为 fallback。Quick Create、嵌套 Trim 与报价“保存到库”已纳入边界；Quote aggregate 的 `mockQuoteRepository`、历史快照和附件权限均未切换。此代码只建立部署接线能力，**未**开启冻结或 Server authority；旧页面/旧标签页停写证明、fresh export、guarded real import、D-091 import evidence 与受控 B+C cutover 仍是后续 Gate。真实数据库、Browser 业务数据、migration、部署均未在本 Gate 修改；Q3 target empty 仅沿用 Q3B2H 已验证基线，未在本 Gate 重新连接数据库。
- **Q3B2H = CLOSED / PASS。** 用户独立授权的真实 `zhixu` schema activation 已完成：0001–0007 ledger filename/checksum 全部正确，0004 terms、0005 Quote foundation、0006 编号/不可变约束及 0007 七张 master/settings 表均已创建。停写后的最终备份 `zhixu-20260928T090305Z-23506a4a.dump` 为 `649357` bytes、SHA-256 `68b7d953157a62ae9e023868f3e6035477708035adc98f6e23627b8f8df7adc6`；隔离 PostgreSQL 16 restore/read-back、guarded migration 和只读验收 PASS。D-091 本机 Git-ignored typed 证据已验证，但防篡改远端保管尚未实现。
- 用户随后自行将 `preparesystem-server-1` 更新为包含全部 migration 的 Node 镜像，revision `f0c252b52b6a626037e8ba70cf51d0e976e45447`；验收时容器 running/healthy、restart count 0，`/api/v1/health` 返回 `ok/ready`，镜像自身 migration status 为 0001–0007 applied、pending `[]`、integrity `valid`、current `true`。七张 Q3 master/settings 表在该次读回仍全空；SalesOrder/source/contract/color/log 为 `511/511/511/1348/511`、零关联孤儿。Browser authority 未变，master/settings import、Quote import、真实 restore、Browser cutover 均未执行。**这是 Windows/local Compose development 环境的 post-migration recovery，不代表 Linux production deployment ready。**下述 Q3B2D–G “pending/未授权”均为各历史 Gate 当时状态，见 `docs/features/QUOTE_MASTER_SETTINGS_ACTIVATION.md`。
- Q3B2G 已实现共享 exact-target guard：Backup/Restore 必须提供容器、Compose project、PGDATA 卷、DB 与预期 fingerprint，并对实际 metadata 和只读 DB identity 新鲜核验；不再根据脚本所在 checkout 的 `.env`/Compose 上下文选库。v1 canonical SHA-256 与 Q3B2E/Q3B2F 指纹兼容。Backup 的 `-VerifyTargetOnly` 在真实目标仅作只读身份核验；本 Gate 未做真实备份。Restore 还需 backup SHA-256、`-ConfirmDataLoss`、第二次精确 fingerprint 确认和 writer-freeze 检查；成功后再次检查，默认不自动恢复 writer。实际备份/恢复仅在无网络、无生产卷的 disposable PostgreSQL 验证；未执行真实 restore/migration/import 或真实 PostgreSQL business/schema write。
- D-091 已确认为 Active：历史 migration/import 每次受控 attempt 使用 migration-level evidence，不伪造逐行业务 CRUD、actor/session 或导入 Browser OperationLogs。纯 typed evidence contract 已建立，COMMITTED 必须有实际 committed/readback counts/hash；Q3B2H schema attempt 已通过 guarded runner 和本机 typed evidence，正式 durable storage 仍未实现。它不授权后续 import/cutover。
- Q3B2F 经单独授权从身份已验证的真实 `zhixu-database` 创建一次 custom-format 逻辑备份：`zhixu-q3b2f-20260928T050409Z-13e3aa43.dump`，`649,070` bytes，SHA-256 `58206370ec008dab51689acef8ee75e4f01a7acad33465b3b0c69fe866177f10`，仅保留于本机 Git-ignored `backups/`。备份前真实库在 `BEGIN READ ONLY` 下重核 fingerprint、ledger/checksum、待应用对象与 `511/511/511/1348/511` 业务计数；备份文件在生产容器、host、隔离容器的 hash 相同，archive 149 项且可解析。无网络、无 host port、无生产卷的 PostgreSQL 16 tmpfs 容器成功 `pg_restore --exit-on-error` 并读回相同 ledger/关键对象/计数、零 FK 孤儿；disposable 容器已删除，真实数据库与 legacy 应用持续运行、未重启。本 Gate 真实 PostgreSQL business/schema writes、migration、真实 restore、Browser writes 均为 0。完整证据见 `docs/features/QUOTE_MASTER_SETTINGS_ACTIVATION.md`。
- Q3B2F 仅验证恢复能力并准备 maintenance/write-freeze，不实际停写；该备份**不是**未来 migration 窗口停写后的最终 rollback backup。当时的脚本存在多 checkout 目标歧义和 restore 后自动重启风险，已由 Q3B2G 修改。未来 schema-only A Gate 需冻结所有 DB writer；B+C import/cutover 还需在 fresh source 导出前冻结 Browser master/settings/Quick Create。真实 0004–0007 activation/import/cutover 均未授权。
- Q3B2E 经单独授权连接已由 Docker metadata 核对的运行中 `zhixu-database`，每组 SQL 均在 `BEGIN READ ONLY` 下确认 `transaction_read_only=on`，仅作真实 PostgreSQL preflight。目标 fingerprint、ledger/object truth table、固定前置检查与安全 aggregate 见 `docs/features/QUOTE_MASTER_SETTINGS_ACTIVATION.md`。真实库 PostgreSQL `16.14`、`schema_migrations` checksum/filename 完整：0001–0003 applied 且关键对象齐全，0004–0007 pending 且对象全部缺席；无 partial/unknown Q3 target。SalesOrder/link/contract mirror/color mirror/OperationLog 为 `511/511/511/1348/511`，与既有业务基线一致。本 Gate 未执行 migration、备份、import、sequence mutation、Server startup 或 Browser write；真实 PostgreSQL business writes 为 0。
- Q3B2E 只读分类为 **EXPECTED PRE-ACTIVATION STATE**，不等于授权真实 migration；Q3B2F 已补足一次备份与隔离恢复演练，但未补足执行窗口最终备份/停写。Fresh Browser source/Preview/rehearsal、guarded importer、production Server authority integration 和 D-091 evidence durable storage 仍是 import/cutover blocker。2026-09-22 Browser backup 仍只是旧 rehearsal evidence。
- Q3B2D 只完成真实 Quote master/settings activation/import 的**规划与代码安全审计**，见 `docs/features/QUOTE_MASTER_SETTINGS_ACTIVATION.md`；该阶段没有连接真实 PostgreSQL、执行 migration/import、读取新 backup 或修改 Browser。正常 Server startup 只读核验 ledger，显式 `db:migrate` 会逐文件提交所有 pending migrations；Q3B2E 现已只读确认当前真实目标为 0001–0003 applied、0004–0007 pending，四者不是总事务。该现场事实不能从 Q3B2C disposable 结果推断，也不能代替未来执行前 fresh check。
- Q3B2D 结论：2026-09-22 backup 只作旧 Preview/Rehearsal 证据；真实导入需要 fresh backup/sourceHash/Preview/disposable rehearsal、目标身份与 ledger fresh check、全体 writer freeze、验证过的 PostgreSQL backup/restore、guarded execute runner 和 D-091 evidence 落地。生产 Basic/Global Settings、Quote Editor masters/defaults/Quick Create 仍是 Browser authority，Server candidate 不能替代 production integration；导入后继续允许 Browser 编辑会产生无自动同步的 drift。Q3B2E 只读 preflight 已单独完成，真实 schema activation/import/cutover 仍 NOT READY / NOT AUTHORIZED。
- Q3B2B 已获单独授权只读检查一份标准 Browser backup：capture `2026-09-22T03:16:14.008Z`，environment `development`，origin `http://127.0.0.1:3001`，namespace `zhixu.erp.local`，backupVersion `1`，schemaVersion `13`，sourceHash `102b13d60b8bece83104bc5c516eb22c6c9b32bd4b540931fa9c49152339175c`。blockingErrors `0`，预期 Server rows `49`；Q3B2B Browser writes `0`、PostgreSQL reads/writes `0`，未执行 migration 或 real import。仓库不保存 backup 或本机绝对路径。
- Q3B2C 在同一 sourceHash 的单一 Q3B2A projection 上完成 PostgreSQL 16 disposable rehearsal：真实 migrations 至 `0007`，空 target guard，49 行单 transaction import、逐字段读回和一致的 projection/PostgreSQL content hash，故障全回滚与第二次 import fail closed。保留 Browser stable IDs、10 个 scoped DefaultTrim、Fabric/Trim 合法同名、Supplier free string、D-089 nullable DefaultOtherCost 与 D-090 active/null default。DefaultTrim 目标 schema 没有 quantity/usage；旧数量 10 条、usage 0 条按既定规则舍弃。没有 runtime CRUD/Browser OperationLog 伪造；此后 D-091 已单独确认 migration audit policy。
- Q3B2A Preview 的 103 个非空 canonical decimal 包含 legacy `basic-settings.systemDefaults` 的 2 个值；Q3A 的 Server 系统默认值以独立 `quote-global-settings` 为目标 authority，故 49 行目标含 101 个对应非空 decimal。两者各自的 nullable/zero 证据保持：target null `8`、explicit zero `20`。真实 backup 中旧 Basic system exchange/markup 与 Global Quote Settings 对应值不同；未来真实激活规划应显式说明此来源差异，不可静默将旧副本覆盖 Global Settings。
- Q3B2A 的标准 backup parser/Preview 仍是唯一 Browser→Server transformation；`npm run preview:quote-master-settings -- --backup <backup.json>` 只读，Q3B2C `npm run rehearse:quote-master-settings -- --backup <backup.json> --expected-source-hash <sha256>` 自行启动并清理 tmpfs disposable PG16，不接受数据库 URL 或读取真实数据库 credential。真实 0004–0007 activation、master/settings import、Quote migration、Browser writer cutover 与 dual write 均未执行；Q3B2D 只记录未来 Gate 的规划，不构成执行授权。
- Q3B2C 验证：targeted rehearsal `5/5`，PostgreSQL integration `100/100`，Server auth/frontend `24/24`，full tests `659/659`，typecheck、零警告 lint、server build、frontend production build（41 routes）与 diff-check PASS。PostgreSQL 只使用 disposable PG16，真实 PostgreSQL reads/writes `0`。
- Q3B1 已在隔离 routes 完成 existing Basic Settings / Quote Settings UI 的 Server candidate integration：`/basic-settings/server/{brands,customer-salespeople,fabrics,trims}` 与 `/system-settings/server/quote-settings` 复用正式页面组件，使用 trusted Server session、scoped Server permission authority、typed Q3A client/adapter、exact decimal fail-closed projection 与 optimistic version。401 invalidate session，403/network fail closed，409 保留草稿且只允许用户确认后 reload；Server candidate 没有 Browser persistence/audit fallback，也没有 hard delete。
- Global Quote Settings 的一个 Save 现在通过 domain-specific `/api/v1/quote-settings/bundle` 在单 transaction 内验证并保存 global settings、existing/new manufacturing presets 与 trusted OperationLogs；新 preset identity 由 Server UUID 生成，stale/invalid/audit failure 不产生 partial state。Q3A GET authorization 已按 endpoint 支持相应 settings edit permission 与 `quote.view` 的 any-of 读取，未新增权限键。
- D-090 已落实为 Server domain invariant：Global Settings default 只能引用 active preset；standalone 停用当前 default 会在同一 transaction 清空 default、递增各自 optimistic version 并写两条 trusted audit，audit failure 全部 rollback。Bundle 对同一停用动作自动清空，但拒绝显式选择既有/new inactive preset；重新启用不恢复 default，`resolveDefaults`、Browser normalization 与新 Quote 初始化均 fail safe，既有 Quote/PriceVersion 快照不变。
- Q3B1 新增 pure/read-only Browser master/settings migration preview helper，报告 source/projected counts、normalized-name/ID duplicates、缺失 Brand/Trim references、legacy quantity 丢弃、D-089 multi-cost collapse、invalid numerics、warnings 与 blockers；Q3B2B 已执行真实 backup 只读 Preview，Q3B2C 只在 disposable PostgreSQL 验证 import。
- Q3B1 follow-up final validation：targeted Q3A integration `14/14`、candidate model/adapter `7/7`、source-contract `6/6`、disposable PostgreSQL `95/95`、Server auth/frontend `20/20`、full tests `658/658`、typecheck、零警告 lint、server build、frontend production build（41 routes）与 `git diff --check` PASS。
- Q3A Quote master/settings Server foundation 已实现：`0007_quote_master_settings.sql`、typed repositories/services 和 `/api/v1/quote-masters/*`、`/api/v1/quote-settings/*` trusted APIs 覆盖 Brand、CustomerSalesperson、Fabric/Trim libraries、owner defaults、DefaultTrimConfig、global settings、manufacturing presets、default resolution 与 supplier suggestions。所有 mutation 使用既有细粒度 permission、optimistic version 与同 transaction trusted OperationLog；日志以 allowlist 保存完整 bounded business before/after，DefaultTrimConfig 以稳定 Trim ID + position + nullable overrides 审计，HTTP/audit decimal 均保持 string，`null` 与 `"0"` 分离。
- Q3A authoritative `DefaultTrimConfig` 没有 quantity/usage；Browser compatibility property 保持未改，未来 Q5 只投影 ID/reference/override。D-089 已把 System / Brand / CustomerSalesperson 默认其他费用收敛为各自最多一个 nullable `name + amount`，优先级 Salesperson > Brand > System；Quote 自身与历史 `OtherCostLine` 仍为 0..N 且不会被默认变化回写。
- Q3A/Q3B1 只在 disposable PostgreSQL 与隔离 candidate routes 验证；Q3B2B/Q3B2C 依次完成真实 backup 只读 Preview 和 disposable import rehearsal。真实 0007、真实 master/settings import、production `/basic-settings`、production `/system-settings/quote-settings` 与 `/quote-center` cutover 均未执行；现有 production Browser routes 继续使用 localStorage/mock repositories，不存在 dual write。
- Q3A final validation：disposable PostgreSQL `93/93`、Server auth/frontend `13/13`、full tests `652/652`、typecheck、零警告 lint、server build、frontend production build（36 routes）与 `git diff --check` PASS。
- Q2A 已实现 Q1 Quote aggregate 的 trusted Server HTTP boundary：`GET /api/v1/quotes`、`GET /api/v1/quotes/:quoteId`、`POST /api/v1/quotes` 与 `PUT /api/v1/quotes/:quoteId`。Q2B2B 已把 runtime POST 收紧为只接受 `{}`：trusted `quote.create` 触发 Server UUID、Server `quoteCode`、neutral draft 与 trusted OperationLog 的原子创建；caller-supplied ID/code/actor/aggregate 均拒绝。读取使用 `quote.view`，替换至少使用 `quote.edit` 并保留细粒度权限；PUT 使用 `expectedVersion`，stale、历史不可变与 quoteCode 修改均返回安全 409。
- Quote create/save 与既有 PostgreSQL `operation_logs` 在同一 transaction 提交；actor 只来自 trusted Server session，日志只保存有界 aggregate/version 摘要和 request context，不保存完整 Quote/附件。审计失败回滚 aggregate；无变化 save 不递增版本也不写日志。
- Q2B1 新增隔离只读 shadow routes：`/quote-center/server-preview` 只调用 typed repository `list`，`/quote-center/server-detail?id=<quoteId>` 只调用 `getById` 并展示完整 Server aggregate。两条 route 使用 trusted Server Session + `quote.view`，Server shell 只显示 Server identity，隐藏 Browser 测试账号、Browser 权限设置/全局搜索等不可信控制；401 invalidate session，403/404/network 显式 fail closed，且无 Browser Quote fallback。
- Q2B1 detail 保留 decimal string 原值、`null` 与 `"0"` 区分、历史 Revision 只读语义、Estimate/confirmation snapshot 与 attachment reference 边界；不读取 Browser IndexedDB attachment，不调用 Quote POST/PUT/DELETE。`LocalDataBootstrap` 精确跳过两条 shadow route。
- Q2B2A 新增隔离 `/quote-center/server-edit?id=<quoteId>`，只编辑已存在 Server Quote 的 default/current Revision，并只通过 typed Server adapter `getById` / `PUT` 保存。该工作区使用 trusted Server identity 和 scoped Server permission authority；Browser PermissionProvider、`mockQuoteRepository`、Browser OperationLog、IndexedDB attachment、Browser Basic Settings 与 OrderRepository 均不参与授权或写入。
- Server decimal string 只有在逐字段转为 Browser number 后能经既有 `quoteSnapshotFromBrowser` 精确 canonical round-trip 才进入编辑态；不使用 epsilon 或隐式舍入。unsafe precision 整体 fail closed。保存携带 `expectedVersion`，成功后完全采用 Server response version；409 不覆盖、不重试，只有用户确认后才丢弃 dirty state 并重新读取。
- Q2B2A 关闭附件、master 切换/快建、删除、导出、Quote-to-Order、Revision/Estimate/PriceVersion destructive action 和 confirmation mutation。现有 attachment IDs 与 C4.2 current terms 原样保留；`LocalDataBootstrap` 精确跳过 server-edit。
- Q2B2B implements D-088 and isolated `/quote-center/server-new`: opening performs zero POST, requires trusted Server identity + `quote.create`, and only the explicit action creates one Server neutral draft before redirecting to `/quote-center/server-edit?id=<Server UUID>`. Pending/ambiguous outcomes cannot auto-retry or fall back to Browser. The page reads no Browser Quote repository, masters/settings, Browser OperationLog, IndexedDB attachment or OrderRepository; `/quote-center/server-preview` only shows its navigation entry when `quote.create` is present.
- `0006_quote_number_sequence.sql` adds `quote_center_quote_number_seq`, initial max-valid-suffix calibration, exact `quote_code` unique constraint and DB immutability trigger. The independent name deliberately avoids legacy root ERP `quote_number_seq`. Runtime format is `QT-YYYY-MMDD-NNN`, date uses Server `Asia/Shanghai`, suffix is one global non-resetting sequence with minimum width 3; gaps/no-reuse and occupied-candidate skip are intentional. Real 0006 activation is NOT EXECUTED.
- Q2B2B final validation：disposable PostgreSQL `81/81`、Server auth/frontend `13/13`、full tests `652/652`、typecheck、零警告 lint、server build、frontend production build（36 routes）与 `git diff --check` PASS。全部 PostgreSQL apply/rollback/concurrency 证据来自 disposable databases；真实 Quote business write 为 0。
- Q2B2A 最终门禁：writer contract `8/8`、Server auth/frontend `13/13`、disposable PostgreSQL `73/73`、full tests `646/646`、typecheck、零警告 lint、server build、frontend production build（35 routes）与 `git diff --check` 全部 PASS。
- Q2B1 最终门禁：shadow contract `7/7`、Server auth/read frontend `10/10`、disposable PostgreSQL `73/73`、full tests `638/638`、typecheck、lint、server build、frontend production build（34 routes）与 `git diff --check` 全部 PASS。
- Q2A 最终门禁：targeted `13/13`、disposable PostgreSQL `73/73`、Server auth frontend `7/7`、full tests `631/631`、typecheck、lint、server build、frontend production build（32 routes）与 `git diff --check` 全部 PASS。
- C4.2 `ConfirmedCommercialTerms` implementation 已完成，并已对照 merged M0 migration safety 与 Q1 Quote PostgreSQL foundation 完成 integration validation。该工程完成状态不等于真实 schema activation 或生产 Browser write acceptance。
- Q1 已实现 Quote/Revision/PriceVersion/Estimate 与成本快照的 Server/PostgreSQL foundation，migration 为 `0005_quote_foundation.sql`。`0004_confirmed_commercial_terms.sql` 是独立共享 current domain；Q1 Quote confirmation columns 仅为 aggregate snapshot，不是第二个 current writer，terms mutation 不回写 Quote snapshot。
- M0 已集成：正常 server startup 只读验证 migration 状态；pending 0004、pending 0005 或两者同时 pending 均 fail closed，不执行 schema migration，也不会进入 permission sync、admin bootstrap 或 listen。显式 `npm run db:migrate` 仍是唯一 activation path。
- Quote production 尚未激活；真实 0004/0005/0006/0007 均未执行。Production `/quote-center`、`/quote-center/detail`、`/quote-center/new` 与 `/basic-settings/*` 仍使用 Browser repositories/localStorage；Q3A 只新增隔离 Server foundation/API，没有真实 master/Quote import、Browser writer cutover、全局 single-login production cutover、Q3B UI adapter 或 Q4 attachments。
- Q2B2C readiness audit 已确认现有 production Quote list/new/detail UI 是必须保留的 cutover baseline；`/quote-center/server-*` 只属于临时 engineering/acceptance workspace。现有 UI/纯领域逻辑可复用且不需要 layout redesign，但当前 Server metadata list 不足以支撑 production list，Browser master/settings、attachments、identity/permissions、action-level audit、migration/rollback 与 new-Quote recovery 仍是 blocker。完整 dependency/UI-preservation/blocker/acceptance/phase map 位于 `docs/features/QUOTE_CUTOVER_READINESS.md`；Q3/Q4/Q5/Q6 gates 完成前不得 production Quote cutover。
- PR #6 已 merged；Navigation / Quote Cockpit / name-only Canonical Material / Production Infrastructure 与 ExpectedArrivalBatch migration hardening 已正式进入 `main`。
- PR #4 已 merged；Material Control Tower V2 Gate 1–5 已正式进入 `main`。
- PR #3 对应的 Full UI Workflow Correction 与 Second Acceptance 提交也已进入 `main`。
- 前一任务 `feat/ainuoke-unified-sync` 已通过 PR #12 合并；Gate 4 继续作为稳定既有能力，不是本轮 server migration 的迁移对象。
- `面辅料申购统计 (1).xlsx` 的既有审计仍是有效的历史 Source Trace 与字段语义证据，但不是当前同步的 authoritative snapshot。当前同步以 6087050 Direct API 当次返回为准；不同时间的 Excel/API 不要求 row-count、hash 或 row identity parity，也不得为匹配历史行数过滤实时数据。

## 当前可运行边界

- 根路径 ERP 已具备本地 Docker + PostgreSQL 的可运行形态。
- Node server 可独立运行：DEV API 默认 `127.0.0.1:3100` 并由 3001 Vite 同源代理；Compose `server-foundation` profile 在 3002 提供 Node static + `/api/v1/*`。真实 `zhixu` 数据库现已启用 versioned migration ledger、511 单 SalesOrder bootstrap 与 Server RBAC；现有 admin 的 trusted session 已通过真实 API、Browser shadow UI、production `/order-center` list 与 C4.1 production detail 验收。Production base list/detail 均使用 trusted Server session + `order.view` 下的 PostgreSQL read model；`/order-center/server-preview` 继续保留为诊断入口，legacy 3000 runtime 暂时保留。

### Phase C4.2 — ConfirmedCommercialTerms Server Domain implementation

- Forward-only `0004_confirmed_commercial_terms.sql` 新增 `confirmed_commercial_terms` 与 `confirmed_commercial_terms_sales_orders`。terms 使用独立 UUID/optimistic version/`NUMERIC` amounts/timestamps；客户确认价格语义固定为 CNY/件，确认工价保留 `CNY|USD`。migration 无 backfill，旧 migration 未修改。
- 当前模型允许多个 SalesOrder 带相同精确 `sourceQuoteId/sourceRevisionId/sourcePriceVersionId`，因此 schema 不假设 1:1：Quote provenance 在 terms context 上唯一，多张 formal SalesOrder 可关联同一 context；无 provenance 的 SalesOrder 使用独立 order-owned context。trigger 拒绝 provenance 不匹配、linked/unlinked 混用及 association 改绑。
- Order endpoints 为 `GET|PATCH /api/v1/sales-orders/:id/confirmed-commercial-terms`，分别要求 `order.view` / `order.edit`。Quote endpoints 为 `GET|PATCH /api/v1/quotes/:quoteId/revisions/:revisionId/price-versions/:priceVersionId/confirmed-commercial-terms`，分别要求 `quote.view` / `quote.confirm`。PATCH 还要求可信 HttpOnly session、allowlisted exact Origin、`X-Zhixu-Request: 1`、typed decimal-string input 与 `expectedVersion`；stale 返回 409。
- 每个实际 mutation 将 terms 与一条 append-only OperationLog 放在同一 transaction，actor 仅来自 trusted session，记录 old/new、surface、Quote provenance 与关联 SalesOrder UUIDs。terms 使用独立 version，不改变 SalesOrder aggregate version、source mirrors、quantity 或 order-number sequence。
- Formal Order Detail 新增“确认商业条款”Server card；`order.view` 只读，`order.edit` 可编辑两个 current 数值。Quote-linked context 的工价币种由 Quote PriceVersion 建立，Order 只读显示并由 Server 409 拒绝改币种或在未建立时发明币种；unlinked order-owned context 才允许 Order 明确选择 `CNY|USD`。UI 不读取 Browser `OrderPriceVersion.salePrice/processingUnitPrice`，也不开放 source/lifecycle/DeliveryPlan 编辑。
- Quote linkage integration 使用默认关闭的 build-time `NEXT_PUBLIC_ZHIXU_CONFIRMED_TERMS_QUOTE_LINKAGE=true` activation prerequisite。关闭时保留既有 Browser-local confirmation，且 rollout 必须禁止形成正式 Quote-linked SalesOrder；因此 merge implementation 不会中断 Quote-first 生产。显式开启后才按 exact provenance resolve：proven-unlinked 保留 local，known-linked 只读写 Server，anonymous/unavailable/lookup 未完成均作为 unknown fail closed，无 local fallback。
- Linked active confirmation status 复用既有 Quote type 规则：加工报价有确认工价即 confirmed；经销报价必须同时有确认工价与客户确认成衣价，任一单独存在均不确认。该 projection 不向 `PriceVersion.confirmation` 回写第二份数值；历史 revision snapshot 不变。
- Disposable PostgreSQL 与前端 contract 已证明 0001→0004/rerun/checksum、1→N shared context、cross-surface parity、linked Order currency ownership、unlinked Order explicit currency、Quote establishment、type-aware status、null≠0、negative rejection、rollback、trusted actor、401/403/404、mutation boundary、exact/no-fuzzy linkage 与 conflict。真实 `zhixu` 未运行 0004，真实业务写入为 0；validation 未连接真实数据库启动 Server。
- C4.2 post-Q1/post-M0 integration 最终门禁：ConfirmedCommercialTerms targeted `16/16`、migration-safety + Q1 targeted `20/20`、Order detail/shadow `13/13`、Server auth frontend `7/7`、disposable PostgreSQL `60/60`、full tests `631/631`、typecheck、lint、server build、frontend production build（`32` static routes）与 `git diff --check` 全部 PASS。
- **C4.2 implementation = COMPLETE**。**C4.2 real migration/data migration/Browser write acceptance = NOT AUTHORIZED / NOT EXECUTED**。C4 overall 仍为 INCOMPLETE；DeliveryPlan/C4.3、Customer PO mapping 与 C5 均未开始。

### Phase C4.1 — PostgreSQL Base Detail Read Cutover implementation

- Production list 的“查看”现导航到静态可导出的独立 Server route `/order-center/server-detail?id=<PG UUID>`。该 route 只加载 `ServerSalesOrderDetailPage`，不会进入仍由 Browser `OrderDetailLoader` 驱动的 `/order-center/detail`，也不调用 Browser OrderRepository 或任何 SalesOrder mutation。
- 详情延续 trusted Server session + `order.view`：anonymous 显示登录要求，detail 401 invalidate session，403 保留明确 permission-denied，404 明确订单不存在，Server/network failure 明确报错且没有 Browser fallback。`LocalDataBootstrap` 精确跳过 `/order-center`、`/order-center/server-preview` 与 `/order-center/server-detail`；legacy new/detail 及其他 Browser-owned route 仍按原逻辑初始化。
- UI 将 Zhixu-owned aggregate facts 与 Ainuoke-authoritative source facts 分区。展示字段严格限定为 id/orderNo/version/creationSource/lifecycleState/createdAt/updatedAt、BillNo/InsideOrderNo/style/company/customer/brand/source quantity/contract dates/source lifecycle、colorCount 及 color name/quantity；InsideOrderNo 明确为 mutable source attribute，source quantity 与 contract/process delivery 均不可编辑。
- 6087105 color-row `deliveryDate` 继续留在 typed/internal DTO，但初始 C4.1 UI 不展示。零颜色是合法 detail empty state。C4.1 当时未展示的共享确认价/工价现由 C4.2 专用 Server domain/card 提供；Customer PO、production country、DeliveryPlans、人员/master IDs、orderDate、quantity/color adjustments、其余 PriceVersion、附件、execution/settlement 与其他 blocked fields 仍缺席。
- PR #35 merged main `c38e80a44eed384c0d09f9a0317bd14122763865` 已在 production-shaped `http://127.0.0.1:3002` 完成真实 C4.1 Browser 验收。Anonymous protection、本人输入 admin 密码、511-row list、list → Server detail PG UUID parity、normal source parity、hard refresh、return/reopen、zero-color、real 404、1280/wide visual、logout 与 post-logout protection 全部 PASS；未进入 Browser `/order-center/detail`。
- 代表 normal order 为 `SO-00000001` / UUID `cae075db-e0b7-4d2c-8648-db092c7501a3` / BillNo `PI2505-075`；UI 的 InsideOrderNo、style/company/customer/brand source snapshots、5,000 source quantity、contract/process-sheet dates、Ainuoke/Zhixu lifecycle 与颜色 `酱紫色:5000` 全部匹配 PostgreSQL。`SO-00000015` 的 zero-color valid empty state PASS；不存在的合法 UUID 显示明确 404。
- 验收前后 SalesOrder aggregate/link/contract/color/log 保持 `511/511/511/1348/511`，fingerprint 保持 `580696ff5c562493dea67f883df501cc`，sequence 保持 `511/true`。`app_users=2`、permissions=54、user/RBAC fingerprints 与 admin `order.view` 全部未变。Safe auth counts successful/failed/sessions/active/revoked 仅从 `6/0/0/0/0` 变为 `8/0/2/1/1`；测试 session 已 logout revoke，另一 active session 按协议保留。SalesOrder、Browser、Quote、DeliveryPlan、Scheduling、Closing、Style Progress、Ainuoke business writes 均为 0。
- **C4.1 = COMPLETE**。C4.2 implementation 已在后续独立分支完成并等待 review；真实 activation 未授权。Customer PO mapping 仍未证明/未实现，DeliveryPlan/C4.3 未实现，C5 未开始，因此 C4 overall 仍为 INCOMPLETE。
- 最终自动验证通过：C3/C4.1/shadow-read targeted `21/21`、ServerSession frontend `7/7`、disposable PostgreSQL `31/31`、full tests `622/622`，typecheck、lint、server build、frontend production build（`32` static routes）与 `git diff --check` 全部 PASS。

### Phase C3.1 — PostgreSQL Base Order List Cutover implementation

- Production `/order-center` 不再渲染 Browser `OrderCenterPage`，而是独立 `ServerOrderCenterPage`。它只通过 `serverSalesOrderReadRepository` 读取 typed Server view model；无 Server 时显式报错，anonymous 显示 trusted login-required，403 保持 permission-denied，list/detail 401 使 Server session invalid 并返回登录态，任何状态都不 fallback 到 Browser OrderRepository。
- 列表使用每页 50 条的 Server pagination、NFKC + trim 后提交的 Server fuzzy search、精确 `lifecycleState` / `creationSource` filter，以及仅限 `orderNo|updatedAt|contractDeliveryDate|salesContractNo` 的 Server sorting。页面只显示 PostgreSQL 或无损投影事实：正式订单号/BillNo、款号/InsideOrderNo、客户/品牌、合同数量、SalesOrder lifecycle/Ainuoke source status、合同交期/颜色数和创建来源。
- C3.1 当时 PostgreSQL UUID 只进入 same-page Server read-only inspector；C4.1 已将该历史 inspector 替换为独立 Server detail route，依然不会导航到 Browser `/order-center/detail`。
- Browser `OrderCenterPage`、OrderRepository、`/order-center/new`、`/order-center/detail`、Quote-to-order 与 Browser reorder/write code 全部保留，未迁移、删除或改写。当前 `LocalDataBootstrap` 在精确 `/order-center`、`/order-center/server-preview` 和 `/order-center/server-detail` 跳过 Browser local-data initialization；进入旧 detail/new、Quote、Scheduling、Closing、Style Progress 或其他 Browser-owned route 时仍按原逻辑初始化。
- C3.1 只使用 source/DOM contract、mock 与 disposable PostgreSQL 16 验证。没有真实 login、session metadata、PostgreSQL business 或 SalesOrder write；没有 schema/RBAC/app_users/Ainuoke/Quote/Scheduling/Closing/Style Progress mutation。真实 1280/宽屏视觉检查因 Browser 工具无法打开新的本地 3001 mock 标签而未执行，未借用真实 3002 session 绕过边界。
- 最终验证通过：C3 + shadow-read targeted `14/14`、ServerSession frontend `7/7`、server-auth disposable integration `1/1`、PostgreSQL integration `31/31`、full tests `615/615`，并通过 typecheck、lint、server build、frontend production build（31 routes）与 `git diff --check`。
- **C3.1 implementation = complete。** PR #32 已合并为 `1c5b8e1680ac5f49cda3df532cb7ae9509d73a0b`；真实 C3.2 验收见下节。
- Quote Center、新订单中心、生产排单、款式进度、关账中心和相关设置仍使用浏览器 Repository；尚不是服务端多用户生产实现。
- DEV 固定使用 `127.0.0.1:3001`，PROD Docker 固定使用 `127.0.0.1:3000`，两者依靠 Origin 隔离数据。
- 当前浏览器 local data `schemaVersion = 13`，Style Progress IndexedDB version = 4；旧记录只做非破坏迁移，不自动清空或用 Seed 覆盖。

## 本轮完成状态

### M0 — Migration Activation Safety Gate

- 正常 Node startup 不再调用 migration apply runner。它先用 read-only transaction 验证 `schema_migrations`、文件名、checksum、missing applied file 与 pending 集合；missing ledger 或 pending/incompatible state 都在 permission sync、admin bootstrap 和 HTTP listen 前 fail closed。
- `npm run db:migrate` 继续是唯一 schema apply 入口，并保留 advisory lock、逐文件 transaction、ledger、checksum、rollback 与 rerun skip。新增 `npm run db:migrate:status` 作为无 schema write 的 operator status 命令。
- Disposable PG16 覆盖 missing ledger、pending 0004/0005、正常 fully-migrated startup、显式 apply、checksum mismatch、missing file、业务表/OperationLog/sequence 不变与 startup ordering。历史 bootstrap/RBAC runner 的成功 rehearsal 固定使用其已审阅的 0001–0004 contract，并继续对新增 0005 fail closed；这不扩大任何真实执行授权。
- M0 未连接或修改真实 `zhixu` PostgreSQL；0004/0005 real activation、Quote import、Browser writer cutover、Q2 与部署均未执行。

### Phase C4.0 — confirmed business ownership decisions (docs only)

- D-082 确认 Ainuoke-backed SalesOrder 的已证明 source facts 持续是只读权威事实，并必须与 Zhixu-owned values 区分。Customer PO 属于 Ainuoke、不可编辑且不唯一，但当前 Direct API 字段映射未证明，所以保持 null/只读。Source order quantity 不可人工改写，Scheduling quantity 是独立事实。
- 同一决策确认订单业务员是品牌/客户侧人员，不是 `app_users`；理单员若语义不同则仍待决。Production country 仅保留在 Quote/Quote PriceVersion，正式 SalesOrder 不增加该字段；Scheduling `ProductionSite` 是不同的执行地事实。
- D-083 确认 Ainuoke contract/process delivery date 是不可覆写 source fact，Zhixu `DeliveryPlan` 是可编辑多行集合。首次创建时可从有效 source date 派生一条默认计划；仅 untouched collection 可继续同步，任何用户介入后的计划都不得被 source refresh 覆写，差异只显式呈现为 drift。
- D-084 确认已关联 Quote/SalesOrder 共享当前客户确认价格与确认工价；Quote 和 Order 都可编辑，每次变更必须记录 trusted actor/time/old/new。这不是全量 PriceVersion live-link，历史 Quote 快照和其他价格事实仍独立，未关联 Order 不伪造 Quote 关系。
- 本轮只修改项目文档；没有应用代码、schema、migration、API、PostgreSQL/Browser 业务写入或 C4 实现。当前 Browser legacy 模型与上述目标规则的差异只作为后续 Gate 的显式待实现边界。

### Phase C3.2 — Real Production Order Center PostgreSQL List Acceptance

- 使用 PR #32 merged main `1c5b8e1680ac5f49cda3df532cb7ae9509d73a0b` 构建 production-shaped Node static + API，并在正式 `http://127.0.0.1:3002/order-center` 完成真实 Browser 验收；未使用 `/order-center/server-preview`。Anonymous/login-required 不显示订单且无 Browser fallback；用户本人输入既有 admin 密码后，trusted username `admin`、public Server user id 与 `order.view` 均存在。
- Production list 显示 source=PostgreSQL、total=511、page size=50、默认首单 `SO-00000001`。硬刷新恢复 Server session；orderNo `SO-00000001`、BillNo `PI2505-075`、style `2359/332` fuzzy search，`draft` 与 `ainuoke` 各 511 条筛选，orderNo ASC/DESC 首单 `SO-00000001`/`SO-00000511`，以及 1–50 → 51–100 → 1–50 分页均 PASS。
- `SO-00000001` 在同页只读 inspector 显示 BillNo `PI2505-075`、style `2359/332`、1 个颜色、PostgreSQL UUID、version 1 与 draft lifecycle；`SO-00000015` 显示有效 SalesOrder master、0 个颜色和明确的 empty enrichment 说明。URL 始终为 `/order-center`，PG UUID 未进入 Browser `/order-center/detail`，create/edit/save/cancel/delete/reorder/attachment controls 均为 0。
- 真实 1280×800 与 1600×900 visual acceptance PASS：页面无 document-level 横向溢出，header/source bar/search/filter/sort/table/action column 布局可用，pagination 可操作，drawer 与关闭按钮可达，zero-color empty state 可读。
- Logout 与 post-logout refresh 均返回 anonymous/login-required，订单行和 trusted identity 不再显示。Safe auth count successful/failed/v1 sessions/active/revoked 从 `5/0/4/2/2` 变为 `6/0/5/2/3`；只增加一次人工成功登录及对应 session，并由 logout 撤销。未清理或撤销其他 session。
- 验收前后 SalesOrder aggregate/link/contract/color/log 保持 `511/511/511/1348/511`，deterministic fingerprint `321bf4319b30ce672302a49b9cf1a33c` 未变，sequence 保持 `511/true`。`app_users=2`、admin core fingerprint、54 项 RBAC catalog fingerprint 与 admin `order.view` 均未变；Browser/Ainuoke/Quote/Scheduling/Closing/Style Progress business writes 均为 0。
- Browser OrderRepository 保留、未迁移、未删除、未改写；manual create、Quote-to-order、reorder、full editable detail、Scheduling、Closing 与 Style Progress 均未迁移。本次临时 3002 server 已停止，`zhixu-database` 与 legacy 3000 runtime 保持 healthy。
- `PRODUCTION_ORDER_LIST_POSTGRESQL_READY=YES`、`REAL_PRODUCTION_ORDER_LIST_ACCEPTANCE=PASS`、**C3=COMPLETE**。C4.1 已在后续独立 Gate 完成；见上方当前状态。

### Phase C2.2 — Real Browser Authenticated Shadow Acceptance

- 使用 PR #30 merged main `5fee5ebb04f04219a9da064cd683aaba8536663a` 构建并在 `http://127.0.0.1:3002/order-center/server-preview` 完成真实 same-origin Browser 验收。匿名态显示 login-required 且不泄露 SalesOrder；用户本人在 Browser 输入现有 Server admin 密码，trusted identity `系统管理员 (admin)` 与 `order.view` 生效。
- PostgreSQL shadow list 显示 total=511、source=PostgreSQL、首单 `SO-00000001`，页面无 save/edit/delete。硬刷新后 session 通过 `/auth/me` + permissions 恢复；orderNo `SO-00000001`、BillNo `PI2505-075` 和 style `2359/332` 搜索，`draft`/`ainuoke` 各 511 条筛选，以及 1–50 → 51–100 → 1–50 分页往返均 PASS。
- `SO-00000001` detail 显示 BillNo `PI2505-075`、style `2359/332` 和 1 条颜色；`SO-00000015` master 正常存在并显示 0 条颜色及明确的 empty-mirror 说明。logout 后页面回到 anonymous，刷新后仍无 trusted identity 或 SalesOrder list。
- 验收前后 SalesOrder aggregate/link/contract/color/log 保持 `511/511/511/1348/511`，master id/order/version/updated fingerprint 未变，sequence 保持 `511/true`，`app_users=2`、permissions=54、admin `order.view` 仍有效。只发生授权范围内的 auth/session metadata：因浏览器表面定位期间两次人工成功登录，safe count 从 successful/failed/sessions/active/revoked=`3/0/2/1/1` 变为 `5/0/4/2/2`；测试页 logout 撤销其中一个新 session，未清理另一 active session 或历史记录。
- Ainuoke、Browser business、Quote、Style Progress、Scheduling、Closing writes 均为 0；`ZHIXU_ADMIN_PASSWORD` 为空，startup 未改变 admin 或 RBAC。临时 3002 server 已停止，`zhixu-database` 与 legacy 3000 runtime 保持 healthy。
- `BROWSER_TRUSTED_SESSION_READY=YES`、`REAL_BROWSER_SHADOW_ACCEPTANCE=PASS`，**C2 = COMPLETE**。Browser Order Center cutover 仍为 NO；下一 Gate 是单独授权的 **C3 — PostgreSQL Base Order List Cutover**，本阶段未开始 C3。

### Phase C2.1 — Browser Trusted Server Session UX

- 新增独立 `features/server-auth` 边界：same-origin auth client 只调用现有 login/logout/me/permissions API，全部请求使用 `credentials: include` 与 `cache: no-store`；mutation 保留 `X-Zhixu-Request` 边界。Session token 只存在于 Server 设置的 HttpOnly cookie，前端不读取 Cookie，也不把 token、identity 或 password 写入 localStorage、sessionStorage 或 IndexedDB。
- `ServerSessionProvider` 与既有 Browser `PermissionProvider` 并存且互不替代。前者从 Node/PostgreSQL 恢复 trusted UUID identity 与 permission set；后者继续维护 Browser-local user/role/repository。C2.1 不做 `user-admin` 与 PostgreSQL public UUID 的自动映射。
- `/order-center/server-preview` 保持 `DEV SHADOW READ` / PostgreSQL 只读标签，现支持 checking、anonymous login-required、authenticated `order.view` list/detail、显式 403、list/detail 401 session invalidation 与 logout。匿名或无权限状态不会调用 SalesOrder list；页面仍无 save/edit/delete，也不引用 Browser `orderRepository`。
- 为使 Node 静态服务器能够同源提供此验收入口，production static export 现在保留该未导航的 preview route；“DEV SHADOW READ”是功能边界标签，不表示生产 Order Center 已切换。真实 C2 Browser authenticated acceptance 已由上方 C2.2 完成。
- Mock/frontend contract tests 与 disposable PostgreSQL 16 E2E 覆盖无 session、restore/login/permissions、safe 401/429、order.view list/detail、无权限 403、logout 后 401、HttpOnly cookie opacity 和 Browser PermissionProvider separation。Disposable 测试只写临时 tmpfs database；真实 PostgreSQL、真实 auth/session、SalesOrder 及 Browser/Quote/Style Progress/Scheduling/Closing/Ainuoke writes 均为 0。
- 最终门禁：auth frontend 7/7、shadow read 6/6、server auth disposable integration 1/1、PostgreSQL integration 31/31、Full Tests 607/607、typecheck、零警告 lint、server build、frontend Production Build 31 routes（包含 `/order-center/server-preview`）与 `git diff --check` 全部 PASS。
- **C2.1 Browser trusted session UX = IMPLEMENTED**；PR #30 已合并，随后 C2.2 真实 Browser acceptance PASS。Browser Order Center cutover 仍为 NO，C3 需要独立授权和实施计划。

### Phase C1.2 — Real Server Auth/RBAC Activation + Authenticated Shadow Acceptance

- 使用 PR #28 merged main `bb60f84f9aa148877b75a81b42f4b2f36eccabb4` 的 guarded runner，在固定 `zhixu-database / zhixu` PostgreSQL 16.14 上激活当前 54 项 permission catalog、`role-server-admin`、全部 54 项 role-permission binding 与现有 admin binding；`order.view` 已生效，重复项均为 0，第二次 guarded execute 幂等 PASS。
- `app_users` 仍为 2；唯一 normalized admin 的 id/public_id/username/password hash/display name/role/active/created_at/updated_at safe fingerprint 与 C1 前一致。没有创建用户或修改密码。Server 启动前和容器内均确认 `ZHIXU_ADMIN_PASSWORD` 为空，因此 `bootstrapAdmin()` 没有用户 mutation。
- 现有 admin 通过本地 non-echo prompt 完成 trusted login、`/api/v1/auth/me`、`/api/v1/auth/permissions` 与 `order.view` 验收。Authenticated SalesOrder API 以 limit=100 遍历 6 页、total/unique UUID/unique orderNo=`511/511/511`，orderNo/BillNo/style fuzzy search、draft lifecycle、ainuoke source filters、orderNo/updatedAt sorting、5 个代表性 detail、invalid-color 空 slice、非法 query 400 与 missing detail 404 均 PASS；最终 session logout PASS。
- 验收后 SalesOrder aggregate/link/contract/color/log 仍为 `511/511/511/1348/511`，orderNo/UUID duplicates=`0/0`，sequence 仍为 `511/true`；SalesOrder 与 legacy deterministic fingerprints 均未变化。真实业务 Ainuoke/Browser/Quote/Style Progress/Scheduling/Closing writes 均为 0。
- Post-C1 backup：`D:\workspace\preparesystem\backups\zhixu-20260913-085419.dump`，649,290 bytes，SHA-256 `A9346C786828F919A6A372565CE2652E20B444C498CC01EBEADAF82D42A6E333`，`pg_restore --list` PASS。临时验收脚本/result 已删除，临时 3002 server 已停止；数据库与 legacy 3000 runtime 保持运行。
- `SERVER_AUTH_READY_FOR_SHADOW_READ=YES`，`AUTHENTICATED_SHADOW_ACCEPTANCE=PASS`，**C1 Server Auth/RBAC Activation = COMPLETE**。这只证明 server-side auth/read readiness；Browser production login/session UX 与 Browser Order Center cutover 仍为 NO。下一 Gate 是 **C2 — Browser Trusted Session UX + Authenticated Shadow UI Acceptance**。

### Phase C1.1 — Guarded Real Server Auth/RBAC Activation Runner

- 新增 `server/auth/rbac-activation.ts` 与独立 compiled CLI `dist/server/server/auth/rbac-activation-cli.js`。CLI 只接受显式 `--plan` / `--execute` 和 `--username=admin`；execute 同时要求 `--confirm-real-rbac=zhixu` 与 `ZHIXU_REAL_RBAC_CONFIRM=YES`。
- activation 在一个 transaction/advisory xact lock 内核对固定 `zhixu` target、仓库当前 0001/0002/0003 checksum ledger、现有 normalized admin 唯一/active/public_id、SalesOrder safety counts 与 sequence，然后复用 canonical `PERMISSION_DEFINITIONS/PERMISSION_KEYS` 同步目录，幂等 upsert `role-server-admin`、全部当前 permission bindings 与 existing-admin binding。它不调用 `bootstrapAdmin()`、不 INSERT/UPDATE `app_users`、不删除既有 role/permission/assignment。
- Disposable PostgreSQL 16 rehearsal 覆盖双确认、wrong target、ledger mismatch、missing/inactive/ambiguous admin、read-only PLAN、admin core/password hash/public_id/row-count preservation、54 项动态 catalog + `order.view`、idempotent rerun、late-failure full rollback，以及 SalesOrder counts/sequence unchanged。
- 真实 `zhixu` 只读 PLAN：PostgreSQL 16.14；admin match=1、active/public_id present；permissions/roles/role-permission/user-role=`0/0/0/0`，`order.view` catalog/admin grant=false/false；expected permissions=54。SalesOrder aggregate/link/contract/color/log=`511/511/511/1348/511`，sequence=`511/true`，`READY_TO_EXECUTE_REAL_RBAC=YES`。PLAN 前后包含 login attempts/session 的安全快照完全一致。
- 用户已明确授权 runner 合并后的 C1.2：真实目录同步、existing admin role/binding 及本地 authenticated acceptance 所需 login/session/last_seen 写入；不授权密码修改、用户创建、SalesOrder/Browser/Quote/Style Progress/Scheduling/Closing/Ainuoke 写入。C1.1 本身真实 RBAC/auth/session/business writes 全部为 0，`SERVER_AUTH_READY_FOR_SHADOW_READ` 仍为 NO。
- C1.2 启动 Node server 前必须验证 `ZHIXU_ADMIN_PASSWORD` ABSENT/UNSET；`loadServerConfig` 将 blank/missing 映射为 undefined，此时 `bootstrapAdmin()` 返回 false。现有 admin 密码只能由用户通过本地 UI 或 non-echo secure prompt 直接输入，不得进入 Codex/chat/commit/command history。
- 最终门禁：RBAC targeted 8/8、PostgreSQL integration 30/30、Full Tests 604/604、typecheck、零警告 lint、server build（compiled CLI 存在）、frontend Production Build 31 routes 与 `git diff --check` 全部 PASS。

### PostgreSQL Phase 2B3C0 — Shadow Read + Browser Cutover Readiness

- 采用独立 `ServerSalesOrderReadDto → OrderCenterServerViewModel → ServerSalesOrderReadRepository`，不把不完整 PG master 强制转换为完整 writable Browser `SalesOrder`，也不填充虚假 PO、价格、交期计划或执行数据。现有 `orderRepository`、Order Center routes 与全部 Browser writes 未改变。
- `GET /api/v1/sales-orders` 新增 read-only bounded query：默认/最大 limit=100/200、offset、参数化 search、lifecycle/creation source filters、allowlisted sorting 和 page metadata。List 只返回 `colorCount`，detail 才返回 typed color rows；401/403/404 与 `order.view` 边界不变。
- C0 新增无导航入口 `/order-center/server-preview`，明确标注“PostgreSQL 只读预览”，只调用独立 list/detail repository；没有 edit/save/delete 或 Browser OrderRepository 引用。C2.1 为 Node same-origin static acceptance 保留 production export，但仍明确标注 `DEV SHADOW READ`，不构成 production Order Center cutover。
- 真实库只读 RBAC audit：2 个 active users 均有 password hash，但 `app_roles/app_permissions/app_user_roles/app_role_permissions` 全为空，`order.view` catalog/assignment 均为 0。因 server startup 会触发 permission sync/bootstrap admin，本 Gate 未启动真实 server。`SERVER_AUTH_READY_FOR_SHADOW_READ=NO`。
- 直接只读 SQL 验证真实 count=511，并核对 first/middle/last、一个 invalid-color 和一个 InsideOrderNo-drift sample 的 UUID/orderNo/BillNo/version/color count。Authenticated real GET 因 RBAC blocker 未运行；无真实 PostgreSQL、Browser、Ainuoke 或其他业务写入。
- 字段矩阵、list/detail/write blocker 与 C1–C6 staged plan 见 `docs/features/SALES_ORDER_BROWSER_CUTOVER.md`。当前 READY FOR ORDER LIST/DETAIL/WRITE CUTOVER 均为 NO；**Browser Order Center cutover = NO**。

### PostgreSQL Phase 2B3B.2 FINAL — Real SalesOrder Bootstrap

- **REAL SALESORDER BOOTSTRAP = COMPLETE.** Runner main SHA 为 `5271f87cdd350db0ef8f4cc464fc81badc4ed893`；首次创建日志发生于 2026-09-12 23:35:02–23:35:05（Asia/Shanghai）。Ainuoke Browser-local identity 明确为 `user-admin`，公开账号 preflight 为 configured/verified。
- Merged-main final PLAN 与 EXECUTE 各自独立读取 fresh 6086103 BEFORE → 全部 6087105 BillNo detail → 6086103 AFTER。两次均为 total=511、before/after hash `dbc00320725a981e248dfda1fdfd08b105385ad02c9de4b90c20d768d7b1be78`、preview hash `6966d8d360118f4aa5fb8565061b0234a482d114de90f9b0fc5dc7c17337ea71`、usable/missing/invalid=505/0/6、InsideOrderNo drift=8、BillNo blank/duplicate=0/0、detail failures=0。PLAN transportRetries=0；EXECUTE transportRetries=20，均为 bounded ETIMEDOUT pre-Response retry 并全部恢复。
- 正式 runner 通过既有 `createAinuokeSalesOrder()` 按 normalized BillNo 顺序创建 planned/created=511/511；同一 in-memory candidate array 幂等 replay=511，所有 replay 均返回原 UUID/orderNo/version 且未增加业务行或 OperationLog。
- 最终真实 PostgreSQL counts：sales_orders/source links/contract mirrors/color mirrors/SalesOrder OperationLogs=`511/511/511/1348/511`。编号为 `SO-00000001`…`SO-00000511`，UUID/orderNo duplicates=0/0，source conflicts/color mismatches=0/0；sequence=`last_value=511/is_called=true`。
- 511 条 OperationLog 均为 module=`艾诺科同步`、action=`艾诺科新增订单`、entity_type=`SalesOrder`，且 actor 全部匹配唯一 active PostgreSQL admin（display name `系统管理员`）。customers/quotes/legacy orders/schedules/audit_logs/app_users 的 pre/post count 与 deterministic digest 全部一致，legacy preservation PASS。
- Pre-bootstrap restore point `D:\workspace\preparesystem\backups\zhixu-20260912-130020.dump` 为 82,458 bytes、SHA-256 `3EC0E6F721981F39DACAE6FB99CC8F65C738212706A438B7A037D2C692A49E6D`，`pg_restore --list` 与 disposable restore/fingerprint comparison PASS。Post-bootstrap backup `D:\workspace\preparesystem\backups\zhixu-20260912-233603.dump` 为 646,448 bytes、SHA-256 `521A7EEFC7C3B70A08C00497E37FF2D3F409AE0B97B3E843EF18542DD3DB691D`，`pg_restore --list` PASS。备份未进入 Git。
- Ainuoke/Browser/Quote/Style Progress/Scheduling/Closing writes 均为 0；RBAC sync/bootstrap admin 未执行。**Browser Order Center cutover = NO**，Browser test orders 未迁移，PostgreSQL 数据已落地不构成 UI 切换授权。

### PostgreSQL Phase 2B3B.2b — Bootstrap Ainuoke User Identity Preflight

- Account Settings 以 Browser permissions repository 的 `currentUser.id` 调用 Bridge；当前 UI“系统管理员”的精确 id 是 `user-admin`。Bridge credential store 同样严格以传入的 `user_id` 为 key。此前成功 PLAN 使用 `user-admin`，而失败的 `account_not_configured` PLAN 错用了 PostgreSQL admin `public_id`；根因是 `BOOTSTRAP_USER_ID_MISMATCH`，不是密码或全局账号缺失。
- bootstrap source 现在在任何 6086103 read 前调用 `GET /v1/ainuoke/account`。显式 operator user id 若返回 `configured=false`，CLI 以 `bootstrap_ainuoke_account_precondition_failed` fail closed，只输出 configured/status/bridgeCode；不会自动选择其他 id、扫描 Credential Manager 或输出 credential/session secret。
- `user-admin` 的公开账户视图为 configured/verified，存量 credential 的无密码 connection test 成功。唯一一次 fresh real-target `--plan` 完成 511-row stable Preview：before/after hash 均为 `dbc00320725a981e248dfda1fdfd08b105385ad02c9de4b90c20d768d7b1be78`，preview hash `6966d8d360118f4aa5fb8565061b0234a482d114de90f9b0fc5dc7c17337ea71`，usable/missing/invalid=505/0/6，InsideOrderNo drift=8，BillNo blank/duplicate=0/0，detail failures=0。12 次 ETIMEDOUT pre-Response retry 全部恢复。
- PLAN 前后真实 SalesOrder aggregate/source-link/contract-mirror/color-mirror/OperationLog counts 均为 0，sequence 保持 `last_value=1/is_called=false`；未运行 `--execute`，Ainuoke writes=0，Browser cutover=NO。现有 Phase 2B3B.2 授权可在本 preflight change 合并后继续，但执行仍须显式使用 intended Browser-local user id。
- 最终门禁：bootstrap source 9/9、PostgreSQL integration 22/22、Bridge 36/36、Full Tests 601/601、typecheck、零警告 lint、server build、frontend Production Build 30 routes 与 `git diff --check` 全部 PASS。

### PostgreSQL Phase 2B3B.2a — Bootstrap Bridge Transport Hardening

- Phase 2B3B.2 的两次完整 `--plan` 均成功且得到同一 511-row stable Preview；随后三次已授权 `--execute` 都在 PostgreSQL 写入 orchestration 开始前被 Bridge source read 中断（两次 fetch `TypeError`，一次完成 Discovery BEFORE 和 511 次 6087105 调用后以 detail-query aggregate fail closed）。独立 11-page Discovery diagnostic 也成功。没有 HTTP auth rejection 证据，因此根因分类为 Bridge/fetch 的 transient pre-Response transport instability，而不是 credential/session 失效或业务校验失败。
- `bootstrap-source.ts` 现在只为 production bootstrap source reads 提供 bounded retry：总 attempts=4，退避 `250/750/1500ms`。仅 fetch 在收到 `Response` 前抛出的 `TypeError` 或 allowlisted safe transport code（`ECONNRESET`、`ETIMEDOUT`、`ECONNREFUSED`、`EPIPE`、`UND_ERR_SOCKET`、`UND_ERR_CONNECT_TIMEOUT`）可重试。
- 任何 HTTP Response（包括 4xx/5xx）、Bridge contract error、paging/data validation、BillNo mismatch、stale snapshot、adapter/business error 都不重试。Cookie 在失败尝试间保持不变，只在收到含 `Set-Cookie` 的 Response 后更新。6086103/6087105 catalog、BillNo identity、stale guard、candidate mapping、detail concurrency=4、service/sequence/migration 均未改变。
- CLI 输出安全结构化事件 `bootstrap_bridge_transport_retry`，只含 attempt/maxAttempts/errorClass/allowlisted transportCode/endpoint pathname；不输出 message、query、body、cookie、credential 或 token。成功 report page reads 与 `transportRetries` 分开计数。
- 本 PR 不运行 `--execute`。真实 SalesOrder 四表/OperationLogs 仍为 0，sequence 仍为 `last_value=1/is_called=false`；前三次失败未产生真实 PostgreSQL business write 或 sequence consumption。用户对 runner merge 后 Phase 2B3B.2 的授权仍有效，下一步只能在本 hardening PR merge 后重新执行该 Gate。
- bootstrap CLI 对 `AinuokeBridgeError` 只输出 allowlisted `bridgeCode`，未知 code 归一为 `unknown_bridge_error`，不输出 message/credential/cookie/CSRF/query/BillNo/DB URL/password。本轮安全 diagnostic real-target `--plan` 在 Discovery 完成前返回 `account_not_configured`，最后完整 source phase=无、transport retries=0；这次失败分类为账号配置，不是 Node→Bridge transport 或 Bridge→Ainuoke transient network。按 fail-closed 规则没有增加 response-level/upstream retry，也没有再次运行 live PLAN。
- 最终门禁：bootstrap source/runner 16/16、PostgreSQL integration 22/22、Bridge 36/36、Full Tests 601/601、typecheck、零警告 lint、server build、frontend Production Build 30 routes 与 `git diff --check` 全部 PASS。未运行 `--execute`，诊断后复核业务 counts 仍全 0、sequence 仍为 `1/false`。在重试已授权 Phase 2B3B.2 前必须先恢复/选择已配置的个人 Ainuoke account/session。

### PostgreSQL Phase 2B3B.1 — Production Real SalesOrder Bootstrap Runner

- 新增独立编译型 CLI `server/sales-orders/bootstrap-cli.ts`，支持且只支持显式 `--plan` / `--execute`。execute 同时要求 `--confirm-real-bootstrap=zhixu` 与 `ZHIXU_REAL_BOOTSTRAP_CONFIRM=YES`，没有默认确认值。
- runner 从 `AINUOKE_BRIDGE_URL` 的 fixed Bridge routes 重新读取 fresh 6086103 BEFORE → 全部 6087105 BillNo details → 6086103 AFTER，并复用既有 adapters 与 `buildFinalSalesOrderBootstrapPreview`。BillNo blank/duplicate、detail query failure 或 stale snapshot 均在 PostgreSQL 写入前 fail closed；写入开始后只使用同一份 in-memory candidate array。
- FIRST_BOOTSTRAP preflight 要求目标 `current_database() = zhixu`、migration ledger 精确为当前 0001/0002/0003 及 checksum、四张 SalesOrder 表和 SalesOrder OperationLogs 全空、sequence `last_value=1/is_called=false`。actor 必须由显式 `ZHIXU_BOOTSTRAP_ACTOR_USERNAME` 指向一个现有 active `app_users`，真实 id/public_id/display_name 与数据库权限共同构造 TrustedIdentity；不创建 fake actor、不同步 RBAC。
- 正式写路径不含直接业务 DML；每个按 normalized BillNo 排序的 candidate 串行调用既有 `createAinuokeSalesOrder`。首个失败即停止后续创建且不自动删除/restore/reset；全成功后只用相同 candidate array 原进程幂等 replay，并只读核对 UUID/order number/source binding/contract/color/log/actor/sequence。
- disposable PostgreSQL 16 rehearsal 覆盖 target、ledger、empty-state、sequence、actor、双确认、stale Preview、全量创建、deterministic `SO-` 编号、invalid colors 空 slice、幂等 replay、OperationLog 去重和 failure-stop。真实 `zhixu` PostgreSQL business writes 与 sequence consumption 均为 0。
- 用户已明确授权在 runner 合并后的 Phase 2B3B.2 从最新 main 执行真实 bootstrap；该授权持续有效，除非范围变化。它不授权本 PR 提前执行，也不授权 Browser Order Center cutover 或 Quote/Style Progress/Scheduling/Closing/Ainuoke 写入。
- 最终门禁：runner targeted 8/8、PostgreSQL integration 22/22、Bridge 36/36、Full Tests 601/601、TypeScript、零警告 ESLint、server build（compiled CLI 存在）、frontend Production Build 30 routes 与 `git diff --check` 全部 PASS；按要求未运行 Style Progress benchmark。

### PostgreSQL Phase 2B3A.1 — Real Schema Activation

- 目标再次确认为固定 `zhixu-database / zhixu`、PostgreSQL 16.14、`DB_HOST=database`、持久化 named volume `preparesystem_zhixu_data`；不是 disposable/tmpfs integration database。
- mutation 前重新验证 `D:\workspace\preparesystem\backups\zhixu-20260912-000250.dump`：47,667 bytes，SHA-256 `4A6A11844E70943318760F1F8729E736656A1B5A8C97E9F04024FB87A335EF1C`，`pg_restore --list` PASS。
- 只构建当前 main 的 server image 并运行 `node dist/server/server/db/migrate.js`；没有启动完整 server。第一次 runner 依次应用 `0001_trusted_auth_rbac_operation_logs.sql`、`0002_sales_order_foundation.sql`、`0003_sales_order_number_sequence.sql`，ledger 三条 checksum 与仓库文件一致；第二次 runner 返回 `applied=[]` 并跳过三项。
- `schema_migrations`、四张 RBAC 表、`operation_logs`、四张 SalesOrder domain 表及 `sales_order_number_seq` 均已存在。正式唯一索引与 identity/version、source binding、append-only log、assign-number/order-number immutable triggers 的只读 introspection 全部通过。
- `sales_orders`、source links、contract/color mirrors 和 SalesOrder OperationLogs 仍全部为 0。sequence 保持 `last_value=1, is_called=false`，预期首个正式编号为 `SO-00000001`；没有调用测试 `nextval`、手工 `setval` 或 restart。
- Legacy migration 前后完全一致：app users 2、sessions 0、login attempts 1、customers 2、quotes 2、orders 2、schedules 1、audit logs 18；core/business deterministic digests 全部相同。2/2 existing users 的 `public_id` 已填充且重复数为 0。RBAC catalog sync 明确未执行，空 catalog 不属于 migration failure。
- 本 Gate Ainuoke reads/writes 均为 0；真实 SalesOrder bootstrap、Browser Repository write/cutover、Quote/Style Progress/Scheduling/Closing migration 或 write 均未执行。后续用户已明确授权 B3B.2 real bootstrap，但 B3B.1 runner PR 仍不得执行。

### PostgreSQL Phase 2B2.3 — Formal SalesOrder Number + Final Fresh Bootstrap Preview

- `0003_sales_order_number_sequence.sql` 使用 PostgreSQL global sequence + insert trigger 生成 `SO-00000001` 格式编号。官方 repository/service create input 不再接受 `orderNo`；显式 insert override 与创建后 mutation 均由数据库拒绝。UUID 仍是技术 identity，rollback 消耗的 sequence number 不回收。
- 独立 v2 final Preview 使用完整 6086103 Discovery + normalized unique BillNo index + 6087105 exact BillNo source。每个 Discovery 合同均形成 candidate；usable 写完整 color mirror，missing/invalid 写 `colors=[]` 并保存 sanitized reconciliation metadata。SizeRule/Size1..26/SizeNum 仅保存为 typed evidence，不新增 size business table。
- Fresh authoritative run：Discovery before/after 均为 511/11 pages，草拟 368 / 生效 143，hash 均为 `dbc00320725a981e248dfda1fdfd08b105385ad02c9de4b90c20d768d7b1be78`；BillNo blank/duplicate 与 added/removed/changed identity 均为 0。
- 6087105 511/511 queries success，511 exact orders，usable/missing/invalid=505/0/6，InsideOrderNo drift=8；usable quantity equal/lower/higher=505/0/0。Candidate planned=511，preview hash `6966d8d360118f4aa5fb8565061b0234a482d114de90f9b0fc5dc7c17337ea71`。
- 全新 disposable PostgreSQL 16 应用 0001/0002/0003，通过正式 `createAinuokeSalesOrder` 创建 511/511；rejected/source-link conflicts/schema rejection=0/0/0，idempotent exact returns=511，trusted OperationLogs=511，rollback probe=1。编号 `SO-00000001`…`SO-00000511`，order number/UUID duplicates=0/0，client override/mutation rejected，rollback number reuse=NO。容器与数据库已销毁。
- Ainuoke reads=533（6086103 22，6087105 511；6086997/6087050 0）。Ainuoke、真实 PostgreSQL、Browser、Quote、Style Progress、Scheduling、Closing writes 全部为 0。Browser Order Center 仍在 Browser Repository；real bootstrap/read-write cutover 仍需单独明确授权。
- 最终门禁一次完成：Bridge 36/36、targeted 23/23、PostgreSQL integration 14/14、Full Tests 601/601、TypeScript、零警告 ESLint、server build、frontend Production Build 30 routes 与 `git diff --check` 全部 PASS。

### PostgreSQL Phase 2B2.2 — Ainuoke Stable SalesContract Identity Migration

- Active identity: normalized `SalesContractNo` / `BillNo` is the stable Ainuoke SalesOrder cross-report business association; PostgreSQL UUID remains technical identity. `InsideOrderNo` is mutable source data and transport-only where a report has only proven InsideOrderNo search.
- Complete 6086103 empty-query Discovery now fails closed on blank or duplicate normalized BillNo. Formal bootstrap need not issue per-order 6086103 detail reads.
- 6087105 fixed catalog/client changed to typed `{ salesContractNo }` → upstream `BillNo contains`; adapter exact-filters normalized `row.BillNo`. Same BillNo with changed InsideOrderNo stays usable and records `inside_order_no_drift`; it is not missing/invalid or an identity conflict.
- User-approved D-079 is Active: 6087105 formally replaces 6086997 as current SalesOrder color/size source. 6086997 remains catalog/adapter/test and Phase 2B2 historical evidence. Missing/invalid 6087105 enrichment never blocks SalesOrder creation.
- Authoritative read-only run: Discovery before/after 511 rows over 11 pages, status 草拟 368 / 生效 143, identical hash `dbc00320725a981e248dfda1fdfd08b105385ad02c9de4b90c20d768d7b1be78`, added/removed/changed 0/0/0. 6087105 queries 511/511 successful, 511 exact orders, 0 no-detail, 1,390 exact rows, 0 false positives; usable/missing/invalid 505/0/6; quantity equal/lower/higher 505/0/0.
- All former eight missing contracts were recovered and are the eight drift orders. PI2512-121 maps 6086103 `5384/086-1(46021-N)` to 6087105 `5466/086(46021-N)`, one usable color totaling 9,000 = contract quantity: PASS.
- Query audit: 6086103 Discovery = empty; 6087105 = proven BillNo contains; 6086997 = proven InsideOrderNo is; 6087050 = proven insideorderno is. No unproven BillNo field/compare type was guessed and 6087050 was not business-read.
- Authoritative reads: 533 pages (6086103 22, 6087105 511); Ainuoke/PG/Browser/Quote/Style Progress/Scheduling/Closing writes 0. No PostgreSQL schema change; PostgreSQL integration and Style benchmark are intentionally not rerun.
- Final gates after the one type-boundary correction: Bridge 36/36, targeted 21/21, Full Tests 598/598, TypeScript, zero-warning ESLint, server build, frontend Production Build 30 routes and `git diff --check` PASS.
- This Phase's next step was the fresh BillNo/6087105 Preview; it is now completed by Phase 2B2.3 above. Real bootstrap and Browser Order Center cutover remain separately unauthorized.

### Previous PostgreSQL Phase 2B2.1 — Ainuoke 6087105 Garment Color/Size Source Validation

- Historical Phase 2B2.1 state（已由 Phase 2B2.2 supersede）：6087105 当时使用 `insideorderno contains` 且尚未获批；当前正式规则见上一节的 BillNo query 与 Active source decision。
- 新 typed client 复用现有 credential/session、auth-expiry replay、timeout、sanitization 与完整分页；report/query/page/total drift、incomplete pagination 和 page limit 全部 fail closed。
- 独立 adapter 在 contains 返回后执行 NFKC/case/whitespace exact filter，排除并统计其它 InsideOrderNo；上游 `id` 不作为 line identity，trace 继续使用 whole sanitized-row canonical SHA-256。颜色名不被假设为唯一。
- `SizeRule` 原顺序映射 Size1…Size26，不排序、不删中间零值、不猜尺码。`SizeNum=0` 且无 SizeN 是合法颜色；关键颜色行异常使整个 enrichment slice invalid，但 missing/invalid enrichment 都不阻止 6086103 SalesOrder Candidate 存在。
- 2026-09-11 authoritative live run：Discovery before/after 都是 511 行/11 页，`草拟=368`、`生效=143`，hash 均为 `dbc00320725a981e248dfda1fdfd08b105385ad02c9de4b90c20d768d7b1be78`，added/removed/changed identity=0/0/0。6087105 queries 511/511 success，共 511 页。
- exact orders/no detail=503/8；exact rows=1,378；contains false-positive rows 174 全部排除；usable-color orders=497。497/497 的 `sum(SizeNum)` 与 6086103 contract quantity 相等，lower/higher 都为 0。
- 六张 invalid：15 个 invalid SizeNum、6 个 blank color、3 个 duplicate canonical placeholder identity groups；duplicate usable identity、cross-order contamination、BillNo/InsideOrderNo/GoodsNo mismatch 都为 0。另有 8 张 no exact detail，作为 missing enrichment。
- SizeRule present/missing=1,372/6，41 patterns，token 1…25；positive SizeNum matrix valid/mismatch/missing=1,361/0/0；2 个 zero-quantity rows 无 SizeN 且合法；populated beyond SizeRule=0；同订单 multiple rules=3。
- 旧 34 blockers 保留 Phase 2B2 历史。6087105 对照为 resolved/still missing/invalid/warning-only=31/0/3/0；D1935 5 rows/4,640、T1826-4 3/3,730、1917U 2/9,393 anchor 全部 PASS。
- 用户确认的正式规则已记录为 D-078：server 全局递增不可编辑 `SO-00000001` order number、fresh `current_account_visible` scope、source disappearance 不 delete/cancel/rebind 并可恢复 seen、normalized mirror/hash/time/reconciliation retention 且默认不存完整 raw payload。该阶段未扩展 schema；sequence 随后已由 Phase 2B2.3 `0003` 实现，tombstone 仍未实现。
- Historical Phase 2B2.1 state（已 supersede）：当时只推荐替换且 D-079 待决定；当前 D-079 已 Active。该阶段的 read/write 统计仍作为历史审计保留。
- 完整字段、token distribution、old-34 table 与限制见 `docs/features/AINUOKE_GARMENT_COLOR_SIZE_SOURCE.md`。最终门禁一次完成：Bridge 36/36、相关 Ainuoke 40/40、Full Tests 595/595、TypeScript、零警告 ESLint、server build、Production Build 30 routes 与 `git diff --check` 全部 PASS；按范围未重跑 PostgreSQL integration 或 Style Progress benchmark。

### PostgreSQL Phase 2B2 — SalesOrder Bootstrap Preview / Dry Run

- 新增纯内存 `SalesOrderBootstrapCandidate`、deterministic ordering/hash、Discovery/detail identity reconciliation、duplicate/cross-mapping detection、detail failure/quantity warning 分组与二次完整 Discovery stale guard；Candidate 不创建 UUID，不依赖业务 Repository。
- detail client 对固定 report/query、constant total、完整分页和安全页数 fail closed。颜色仍只使用既有 6086997 adapter/normalization，没有第二套解析；未读取 6087050。
- 2026-09-11 最终 live run：Discovery 507/11 页，`草拟=364`、`生效=143`，D1935 存在；前后 hash 均为 `95b36d6375ab8061731ef976debffa41b46995da6e8c8146b32960e9ff616261`，added/removed/changed identity 为 0/0/0，Snapshot stable PASS。
- D1935 + 9 个跨日期/Status 样本的 6086103 mapped-field parity 10/10，使用 `DISCOVERY ROW REUSE`。最终 run 为 10 次额外 6086103 page read；6086997 对 507/507 InsideOrderNo 完整读取，共 551 页。
- 507 个 visible rows 全部保留在 bootstrap scope；473 个形成 strict Candidate。34 个 blocking 均来自颜色结构：29 缺 required `stylecolor`，5 存在重复 canonical 6086997 source-row identity；26 个 color/contract quantity difference 只报告、不修正。Discovery duplicate sourceId/sourceRowIdentity/InsideOrderNo/SalesContractNo 和 identity mismatch 均为 0。
- Phase 2B2 当时记录 `ORDER_NO_POLICY = NEEDS_USER_DECISION`；随后用户已在 Phase 2B2.1 确认正式规则为 server/PostgreSQL 全局递增、不可编辑的 `SO-00000001` 格式。该次一次性 PG16 仍只对 473 个 projectable Candidate 使用 disposable-only `PREVIEW-######`，结果 planned/created/idempotent=473/473/473、rejected/schema/source-link conflicts=0/0/0、rollback probe=1、trusted OperationLogs=473；tmpfs container/database 已销毁。
- 最终 authoritative run 为 583 个成功 report-page reads。本阶段因本地统计归类修正前另做过一次相同完整 stable read，累计成功 page reads 为 1,166；Ainuoke writes、真实 PostgreSQL business writes、Browser/Quote/Style Progress/Scheduling/Closing/真实 OperationLog writes 均为 0。
- Phase 2B2 当时的 `READY FOR REAL BOOTSTRAP = NO` 是该历史 Gate 当时的结论。随后 Phase 2B2.1/2B2.2 已确认 policies 与 6087105 source replacement，Phase 2B2.3 已完成 fresh stable Preview；Phase 2B3A.1 又完成真实 schema activation。真实 bootstrap 仍需下一 Gate 单独明确授权。详细证据见 `docs/features/SALES_ORDER_BOOTSTRAP_PREVIEW.md`。
- Phase 2B2 最终门禁：PostgreSQL integration 13/13、Full Tests 584/584、TypeScript、零警告 ESLint、server build、Production Build 30 routes 与 `git diff --check` 全部 PASS；未重跑 Style Progress benchmark。

### PostgreSQL Phase 2B1 — SalesOrder Server Foundation

- Forward-only migration `0002_sales_order_foundation.sql` 新增 `sales_orders`、`sales_order_source_links`、`ainuoke_sales_order_contract_mirrors`、`ainuoke_sales_order_color_mirrors`。没有修改 legacy `orders`/`api_dispatch` 或任何 Browser schema/key。
- `sales_orders` 使用 PostgreSQL UUID 正式 identity、规范化唯一 `order_no`、不可变 creation provenance、独立 Zhixu lifecycle 与 optimistic `version`。source refresh 不改变 identity/provenance/version。
- source link 的 `(source_system, source_entity_type, external_id)` 由数据库唯一约束保护，binding identity 与 `sales_order_id` 不可更新；Ainuoke contract/color 作为独立 current source mirror 保存 typed facts，颜色 refresh 替换 source-owned slice。
- PostgreSQL repository 使用参数化 SQL，提供 create/get/list/source lookup/mirror refresh/optimistic update。列表使用 order number + UUID 稳定排序，读取为 composed typed projection而不是 DB row/raw payload。
- `createAinuokeSalesOrder` 使用单 transaction + source-scoped advisory lock。重复 source identity 幂等返回既有 SalesOrder ID/version，不创建第二单或第二条日志；首次创建把 aggregate/link/contract mirror/color slice/trusted OperationLog 一次提交，任一步失败全部 rollback。
- actor 来自独立 `TrustedIdentity`，不在 service input/request body 中；server OperationLog 保存可信 actor FK/public ID/name snapshot。
- 新增只读 `GET /api/v1/sales-orders` 与 `GET /api/v1/sales-orders/:id`，复用现有 `order.view` 和 Trusted Session，分别覆盖 401/403/404/permitted read；两个不同 trusted sessions 从同一 PostgreSQL 读取相同 SalesOrder UUID/version。
- Browser Order Center 仍使用既有 Browser Repository。Phase 2B1 没有 live Ainuoke read/write、真实 505 bootstrap、Browser test-order migration/cutover/dual-write，也没有 Quote、Style Progress、Scheduling、Closing migration 或 mutation。
- Phase 2B2 Preview 已在本轮完成；Phase 2B1 本身仍只代表 server foundation，不代表正式订单上线。
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
- 原 Discovery Gate 曾观察到 505 行；Phase 2B2 当前两次完整只读遍历均返回 507 行、11 页，normalized SHA-256 均为 `95b36d6375ab8061731ef976debffa41b46995da6e8c8146b32960e9ff616261`。这再次证明 505/507 都只是当次 Snapshot，不是业务常量。
- 当前完整 Snapshot 的 raw status 为 `生效=143`、`草拟=364`。全部 Discovery-visible 合同都是 clean-bootstrap scope candidate，Status 不参与 inclusion/exclusion；Status 仅作为 source fact 保留。
- D1935 与另外 5 个脱敏样本均通过 6086103/6086997 identity/detail cross-check。Source scope 只能称为 `current_account_visible`、不能称为全公司订单；用户已确认它就是正式 bootstrap organizational scope，并要求每次以 fresh complete Discovery 为准。
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
- Discovery blocker 已解决到 `current_account_visible` 范围，且 all-visible-contracts/no-status-filter 规则已确认。用户随后确认了 server order number、scope、source disappearance 和 normalized retention policies；对应 schema/sequence/tombstone 实现仍是后续独立 Gate。当前未授权真实 bootstrap。

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
- 固定只读 Catalog 包含 6086103 / 6086997 / 6087050 / 6087105；typed query kind 为 `empty | sales_contract | inside_order`，不能提交 raw reportId/formId/fieldName/compareType/sqlCdtn/conditionList。6087105 使用 `{ salesContractNo }`，其余现有 detail capability 继续使用各自已证明的 InsideOrderNo transport。现有 Browser unified sync 仍是未 cutover 的 legacy 6086103/6086997/6087050 路径；它不改变 6087105 已成为正式当前 SalesOrder color/size source 的决定。source snapshot v2 保留 report、fetch time、paging、total、query context、canonical-row source identity、schema 与 deterministic hash。
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

- Production `/order-center` base list 与 authoritative base-detail read cutover 均已完成；通用 write cutover 与 Browser store retirement 尚未落地。C4.2 `ConfirmedCommercialTerms` Server Domain 已在当前独立分支实现并仅通过 disposable PostgreSQL 验证，仍待 review，真实 0004 activation 与真实 Browser acceptance 均未授权；DeliveryPlan/C4.3 未实现，C5 未开始，因此 C4 overall 仍不完整。
- Quote 的 Q1 schema/repository、Q2A trusted API/concurrency/audit 与 Q2B2A isolated existing-Quote writer 已落地并仅在 disposable PostgreSQL/自动化前端契约验证；production Browser writer、Server new Quote 和真实数据仍未 cutover。Scheduling、Style Progress、Closing 的真实后端、数据库 schema/API、多用户并发与服务端权限尚未落地。
- 浏览器附件的对象存储、跨设备同步与服务端安全扫描。
- SalesOrder 已有 bounded search/filter/sort/pagination；其他服务端业务列表与通用全文搜索仍未落地。migration 没有自动 down，其他业务领域的事务内日志仍需随各领域 cutover 接入。
- True Mobile 的真实 coarse-pointer 设备级复验；当前自动回归验证的是指定 CSS viewport。

## 当前数据保护原则

- 不执行隐式 Reset，不删除本地 dependencies，不用测试清理触碰 DEV/PROD 浏览器真实命名空间。
- Quote Center 与附件是真实业务数据，必须长期保护。当前 Browser SalesOrder/ScheduleAssignment 虽被确认为测试数据、未来不迁移，现阶段仍不得修改或删除；只能在独立 Retirement Gate 完成 backup/dependency audit/scope 清单并取得用户明确破坏性确认后定向清理。Closing 分类待决定，Style Progress/Material 不在该 retirement 范围并继续保护。
- 备份恢复在覆盖前校验 owner、指针和跨记录引用；损坏数据拒绝写入并保留原始内容。
