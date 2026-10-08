# Fresh Start Foundation — empty business data, not production activation

## Decision and boundary

2026-10-08，D-096 用户确认：“新系统所有业务数据，包括基础资料和订单，都从空开始。”Base 是 PR #73 merge `2363831ff32147d6775ef4f4cee2e3e806e0c58d`。

不导入旧 master/settings、Quote/history、SalesOrder、Scheduling、Closing、Style Progress、附件关系、业务账号或 Browser OperationLog；不自动同步艾诺科。不删除旧环境，不改业务模型/计算/历史 Revision 不可变规则。Q5 historical import **NOT REQUIRED**；其 source capture、迁移 freeze、rehearsal、VerifyOnly/Execute 工具与历史 PASS 保留为 dormant compatibility，非当前上线 blockers。已发生的 Q3 57 行 import/cutover 与旧环境 SERVER masters / BROWSER Quote 事实不被撤销。

Foundation 原 Gate 验证新 disposable DB；后续 D-097 已接通正式 Server Quote 基本闭环并实际 Chromium 隔离验收，仍**不是真实部署或完整报价 production-ready**。未执行真实 deployment/schema activation/import/restore/COS 操作，未读取真实 secrets/backup，未操作 Ubuntu 或旧 checkout。

## Current formal Quote Server basic loop — D-097

- 显式 `NEXT_PUBLIC_ZHIXU_QUOTE_AUTHORITY=server`；必须同时 masters=server、writer=writable。默认 browser，独立于 QuoteWriterMode，不由 masters 推断。Vite/build-info/Dockerfile.server ARG/runtime 比对一致；非法组合拒绝，未修改现有 Compose/部署。
- 正式 list/new/detail 原地切 typed Server path，不 redirect candidate。List 基于默认 Revision saved snapshot 的最小 summary，limit≤100、offset、literal ILIKE search、type/status filter、准确 total、同一只读一致性 transaction；不读 Browser、不 N+1 aggregate GET。
- New 页面提供加工/经销选择，无 effect POST，只显式点击 `{}` create、即时 pending 防双击；默认经销不变，加工使用返回的 aggregate/version 正常 PUT 初始化，成功才进入详情。PUT 失败保留已创建 ID，明确类型尚未确认，提供草稿核对链接并停止 POST/自动重试；不新增详情/历史类型编辑入口。Detail 复用 QuoteEditor 的原基础/材料/工价/其他成本/价格设置与金额展示，版本由每个 persistence 实例持有；成功响应才更新版本/baseline。
- 共用 trusted Session/Identity/RBAC，Server 事务负责可信日志；无 Browser CRUD 第二份权威日志。Root boundary 隔离 legacy bootstrap/mock permissions/global search，直接 URL 的 Order/Scheduling/Closing/StyleProgress 等只显示未接线；不挂旧业务组件。新模式侧栏/表格 UI preference 暂为内存，避免旧 preference repository 顺带初始化业务 manifest；Browser preferences 不变。
- Q3 空 masters/settings 明示未配置，Quick Create/刷新走 Server；已保存快照 reopen 不套最新 defaults。NullableNumberInput 仅在 Server Editor 启用无损 precision gate，保留 raw unsafe draft、null/zero，409/network 不自动覆盖、不写 Browser。
- 唯一 QuoteAttachmentPanel 注入既有 Server controller，所有预览/缩略图/下载走 Server blob；专用命令更新 mirror/version，不覆盖脏基础字段。aggregate/附件共用排他锁；generic PUT 仍不能改关系；共享历史附件禁改名；storage 未配置 API 503、无 IndexedDB fallback；不触 COS/对象删除/GC。

| Action | Server formal status / actual gap |
| --- | --- |
| list/search/filter/page/detail/create | Supported；bounded saved summary + lazy POST |
| basic info/current PV costs/pricing/save/reload | Supported；原 Editor + exact adapter/expectedVersion |
| Q3 selectors/defaults/Quick Create | Supported；原 Server master dependencies，无 Browser writer |
| current Revision upload/rename/unlink/style/preview/download | Supported；既有专用 controller，历史共享 rename 限制保持 |
| Revision creation/management/history navigation | Supported；当前/所选历史创建新默认快照、原 Vn/分支规则、历史只读/返回当前；可信 command + 原 repository 单事务 |
| PV create/delete/name workflow | Supported；复制所选已保存 PV、编辑名称/数量/说明、删除非最后 PV/切换；新 owner IDs，独立成本/参数快照，清除复制确认 |
| Estimate current/history | Supported；显式生成/来源选择、固定结构编辑保存、重新生成/归档、历史搜索/只读/克隆恢复、stale/ignore；专用可信命令，共用版本锁 |
| customer confirmation | Deferred；历史 snapshot / current C4.2 ownership 命令需明确接线，不能走 Browser confirmation |
| export/batch metrics/copy/delete | Deferred；完整 saved-source export 与 workflow/audit 命令尚未接，不新增危险删除 |
| Quote-to-Order / log viewer | Deferred；跨领域命令/可信日志读取 UI 尚未接，不读旧 Browser order/log |

`npm run test:quote-server-ui` **requires a Server frontend build first** (Quote/master server, writable). Actual exported formal routes served by createApp + new PG/tmpfs + memory storage, fresh temporary Chromium profile,随机 loopback port（非3000/3001/3002）。**HISTORICAL PR #75 类型补齐12/12：**加工/经销 UI 创建、编辑保存、刷新/readback/list filter；打开页不创建、双击一次、类型初始化409/network保留ID且不重复POST、后续保存失败不重建；保留原 empty/auth/old sentinel、基础/三类成本/工价/未配置pricing/save/reload/list、附件后保存、实际页面 Blob 下载字节与 SHA-256、precision/409、404/403/network、Quick Create、27 条跨页搜索/准确total/无逐行GET。cleanup PASS。该阶段 Server auth/frontend38/38（persistence5/5）、disposable Quote API/编号21/21；API仍只接受POST `{}`。此前 API/附件20/20、fresh-start7/7 与 Server build PASS，不冒充当前 Estimate 测试数；其余 controller/source checks不是实际页面证据。

最终显式 Server frontend 与独立子进程默认 Browser frontend 均构建41 routes；默认 build-info Quote/master authority=browser、writer=writable，未修改 .env 或生产默认值，未留下临时 authority 环境。最终质量结果见 AI_HANDOFF；无完整 PG/COS suite 重跑或真实部署。

### Current Server Estimate workflows closure (2026-10-08)

Quote 级 Estimate 从 Server 已保存来源主动克隆；生成与已存在 active 的重新生成明确分开，旧 active 完整归档，恢复生成新 Estimate/行 ID 与可信创建信息，原 history/provenance 不变，来源 PV 删除后仍独立可读/可恢复。编辑仅原固定结构面板字段，Decimal string/null/zero 保持；不反写来源 Revision/PV、确认、状态/default 或附件。Quote 当前估算并不随所查看历史 Revision 变成历史只读。

草稿保存/Estimate/附件/版本共用实例版本锁；估算-only 单命令，混合草稿分步事务，先保存成功后的失败如实提示并保留草稿/选择、核对后才可继续。关联成本须先完成显式同步选择。Quote / Estimate 权限耦合已在本 PR 内修复，而非新增角色政策。`quote.view` 可读报价及已授权历史，不因他人生成 Estimate 而整体403。可信身份无 `estimate.view` 时，GET、创建、普通保存与 Revision/PV 响应集中投影为 `estimateVisibility: restricted`，完全省略 active/history 字段，不返回存在性、历史条数或汇总；有权限则保留完整 Estimate。Editor 使用独立视图类型保留“未授权返回”状态，不伪造成 null/[]，不加载估算面板/计算/缓存；成本入口显示无查看权限。

普通 PUT 只提交 Quote 内容；Server 在 expectedVersion 校验后合并当前已保存 Estimate，仍对完整领域实体执行原 normalize/validate、细粒度权限、历史不可变与 repository CAS/事务检查。缺失字段不是清空命令；无 Estimate 读权限者注入任何 Estimate 字段（包括 null/[]）返回409 `estimate_command_required`。有读权限者的旧完整请求仅兼容原样切片，任何变化仍拒绝；Estimate 修改只走专用命令，需要 `quote.edit` + `estimate.view` + `estimate.edit`。读权限不授予写权限，默认角色/权限目录不变。 详见 `ESTIMATE_COST.md`、`PERMISSIONS.md`。

HISTORICAL 初始工程验证及各 suite 数字统一见 `AI_HANDOFF.md`，对应 checkpoint `3da2234b82cca7baebb59febca42c3fdad00352b`。actual Chromium30/30 保留原20项回归，增加两类型估算、历史来源/历史 Revision 下当前估算编辑、dirty取消/同步决策及各409/network失败入口；下载 bytes/SHA-256、无rejection、cleanup PASS。Server/default Browser frontend 均PASS，默认 build-info=browser。当前权限 follow-up 修改 DTO/服务/视图与测试，重新验证结果见 AI_HANDOFF；无 schema 增量。尚未真实部署，默认 Browser/旧环境不变，历史导入 NOT REQUIRED；完整报价功能并非 production-ready。

### HISTORICAL Server version workflows verification (2026-10-08, PR #76)

上方 12/12、38/38、21/21 是 PR #75 基本闭环历史证据，不作本轮数字。PR #76 原 Gate service/API9/9、Quote API/附件/foundation33/33、auth/frontend39/39、Chromium14/14是修复前证据。最新 follow-up 实跑状态纯测试4/4、版本 command service/API disposable10/10、auth/frontend48/48（含状态4/4与persistence11/11）、实际 Chromium20/20、npm test673/673；typecheck/lint/Server build/显式 Server frontend/默认 Browser frontend/diff-check PASS，两个 frontend 均41 routes，默认 build-info Quote/master=browser、writer=writable。未重跑 full PostgreSQL/COS suite。

Follow-up 先证实 draft PV 创建错误变 quoting、两个同步入口 409/network 缺少核对提示，再修复并运行实际页面。PV 创建/编辑/删除共用 Browser 状态纯函数：零确认 draft/quoting 保持，confirmed/partially_confirmed 按摘要推导；Revision.create 仍 quoting。真实同步弹窗两按钮 × success/409/network 六用例证明所选范围成功保存，失败显示错误/核对、保留已应用 dirty 草稿与选择、无自动追加请求/后续版本命令/Browser 写入/unhandled rejection。Persistence 单测验证 blocked/version/baseline、独立标记与成功 Server 响应收口；未改成本同步语义、schema 或确认政策。

版本命令复用原快照与命名逻辑，不以 number 复制历史 decimal；null/zero 保留。dirty 先保存或取消、成本差异走显式同步选择；命令使用最新 expectedVersion，与保存/附件共用实例锁。前一步保存成功而后一步失败据实提示，不自动再次创建；409 与未知网络结果均阻止后续 mutation。实际 Chromium 同时覆盖加工/经销当前更新与历史分支、PV 独立编辑/删除/切换、历史只读、附件继承/新版本解绑后保存及旧关系不变；保留原下载 bytes/SHA、精度、Quick Create、Browser 隔离。Service API 测试强制关系插入/关联审计失败，完整 aggregate/版本/关系/日志均回滚；附件 binary 不复制或删除。

该历史阶段旧 runtime/数据库/Browser/COS 完全不变，新 Server build 未部署。没有 SQL/schema/业务政策变化，D-096 historical import NOT REQUIRED。当时 Estimate/确认/导出/整单复制与删除/Revision 删除/转订单/日志查看仍未接；Estimate 的当前工程状态已由上节更新，其他动作仍未接，不是完整 Quote production-ready。

## Actual initialization audit

- `database/migrations/0001_*` 至 `0008_quote_attachments.sql` 定义 Server schema，没有 business INSERT seed；正式 `runMigrations` 管 ledger/checksum，未改发布 SQL。
- `docker-compose.yml` 的 DB 仅挂 PGDATA，没有自动挂 `database/001_schema.sql` / `002_admin.sql` 至 Docker entrypoint。这两份是独立 legacy ERP SQL，不是新 Server schema；不应用/复制旧 dump。`Dockerfile.server` 使用 versioned migrations，不执行 legacy init。
- `server/index.ts` / `startup.ts`：verify current ledger → session 模式同步权限 → 显式配置管理员 → listen。正常 startup **verify-only**，空库未 activation 时 fail closed，不自动 migration/import/restore/Ainuoke bootstrap。
- `bootstrapAdmin` 无 password 时不创建账号；有显式新管理员配置时创建技术 actor/RBAC。旧账号不复制。Local Single-User 分支只核验已存在技术 actor，不会自动创造新库管理员；不能把它当远程新系统初始化方式。
- `quote_global_settings` 支持 **无记录**；API 返回 `settings:null`，resolved defaults 的汇率、加成、币种、工价说明、other cost、preset 均 `null`，trims `[]`。不需要重写 migration 或新增默认业务值。
- Server UI adapter 无配置时金额保持 null、preset 列表空、说明空；CNY 是既有非 nullable UI draft enum（不是已保存的公司币种政策），仅用户显式保存才产生 settings singleton。不得把该 UI draft 当作配置已完成。
- `server/quotes/draft.ts` 仅显式 POST 创建结构草稿：空品牌/业务员/款号，quantity/rate/markup/freight amount null，preset null，独立 UUID/编号，空材料/附件。打开 lazy-create 页面不创建 Quote。没有自动恢复 Browser 或发现 COS 对象。

## Executable verification and technical whitelist

运行：`npm run test:fresh-start`（`server/integration/fresh-start.integration.test.ts`）。

新随机容器 `zhixu-pg-it-*`，PostgreSQL 16，PGDATA tmpfs，没有 persistent/production volume、自定义生产 network 或真实凭据；随机数据库与 loopback ephemeral ports，HTTP port 明确排除 3000/3001/3002。使用现有 disposable helper，finally 关闭 HTTP/pool 并移除自己的容器。

空 schema migration 完成后仅 ledger 8 行，其余表 0。首次和再次执行真实 startup steps + 临时 HTTP API 后，在登录/显式 CRUD **之前**白名单如下：

| Technical table | Rows | Reason |
| --- | ---: | --- |
| schema_migrations | 8 | 正式 0001–0008/checksum ledger |
| app_permissions | 54 | 当前权限目录，不是业务资料 |
| app_roles | 1 | 必要 Server admin role |
| app_users | 1 | 测试显式新建管理员，非旧账号导入 |
| app_user_roles | 1 | 新管理员角色绑定 |
| app_role_permissions | 54 | admin 目录授权 |

`app_sessions=0`、`login_attempts=0`、`operation_logs=0`；随后合成管理员 login 产生 session/login metadata，显式新 Quote/品牌产生可信 CRUD logs，不是 initialization seed。`pgcrypto`、indexes/FKs/triggers/sequences 是 schema 结构；两条业务编号 sequence 初始化 `last_value=1,is_called=false`，启动不消费编号。

### Business tables: all 23 zero after first/repeated startup

| Domain | Tables | Initial counts |
| --- | --- | --- |
| Q3 masters/settings | quote_master_brands, quote_master_customer_salespeople, quote_master_fabrics, quote_master_trims, quote_master_default_trim_configs, quote_manufacturing_presets, quote_global_settings | 0 / 0 / 0 / 0 / 0 / 0 / 0 |
| Quote aggregate | quote_center_quotes, quote_center_revisions, quote_center_price_versions, quote_center_estimates, quote_center_cost_snapshots, quote_center_fabric_lines, quote_center_trim_lines, quote_center_other_cost_lines | 0 / 0 / 0 / 0 / 0 / 0 / 0 / 0 |
| SalesOrder/source | sales_orders, sales_order_source_links, ainuoke_sales_order_contract_mirrors, ainuoke_sales_order_color_mirrors | 0 / 0 / 0 / 0 |
| Commercial terms | confirmed_commercial_terms, confirmed_commercial_terms_sales_orders | 0 / 0 |
| Attachments | quote_attachments, quote_revision_attachments | 0 / 0 |

动态枚举所有 public tables，任何白名单外非零行即失败。Legacy customers/quotes/orders/schedules/audit_logs 不存在；当前没有正式 Server Scheduling/Closing/Style Progress schema，不能用“表不存在”声称这些模块已生产就绪。

7/7 tests：schema 无 seed、重复 startup/ledger skip、匿名 401 与空列表/defaults/detail404、synthetic old Browser storage 不读取/不写入/故障不 fallback、显式 new Quote create/save/get v1→v2、显式品牌 create/list。测试 globals 在 finally 恢复，没有使用真实 Browser profile。无 runtime/schema 初始化缺陷需修正；本 Gate 新增可执行验证，不是 docs-only。它验证 startup components/HTTP/client adapters，**不是完整生产 image 或真实浏览器空库 acceptance**。

本 Gate 回归：migration activation disposable 7/7（缺 ledger/pending 在 bootstrap 前拒绝）、Server auth/frontend 33/33、npm test 671/671；typecheck、lint、Server build、frontend production build（41 routes）、diff-check PASS。Frontend 有既有 large chunk warning，无 build failure；full `test:postgres` 未机械重跑（未改 schema/importer/runtime，已跑本任务 fresh DB 与 migration safety tests）。两个自建 PG 容器均 cleanup，无 `zhixu-pg-it-*` 残留。测试生成数据只存在 tmpfs，不是正式系统 seed。

## HISTORICAL — Foundation production wiring audit before D-097

| Entry | Actual authority / evidence | Gap before new system enablement |
| --- | --- | --- |
| /quote-center | `app/quote-center/page.tsx` → `components/quote-list.tsx` → mockQuoteRepository.list | 正式列表仍 Browser；复用 Server repository，保留所需查询/展示，空列表不补旧数据 |
| /quote-center/new, /detail | `components/quote-editor.tsx` createDraft/get/save/delete 与 Revision workflow → mockQuoteRepository；即使 masters=server 也只把资料依赖接 Server | 正式新建/编辑/history 动作接 trusted aggregate writer，不只替换默认资料；不能把旧 Editor 当 Server-ready |
| Server Quote candidates | server-preview/new/detail/edit → `quote-server-client.ts` / `quote-server-repository.ts` | 空列表 EmptyState、error 明示无 Browser fallback，lazy create 已存在；仍工程 workspace，未接正式路由、完整生产 UX/workflow/附件动作需验收 |
| Q3 formal masters/settings | `production-master-settings-page.tsx` 在 authority=server 时选 Server adapters，否则 Browser/frozen | 编译/运行身份必须一致且显式 server；Server adapter 空资料/null settings 已验证，无 silent outage fallback |
| Global/default selectors | `server-global-quote-settings-adapter.ts` / `quote-master-dependencies.ts` | UI 未配置状态不可冒充公司默认政策；正式新 Quote 仍 mock writer |
| Global local bootstrap | `local-data-bootstrap.tsx` 只跳过明确 candidate URLs；`initializeLocalDataLifecycle` 仍会初始化 Browser Quote/Order/permissions/operations 等，即使 Q3 server | 新 Server-only route/layout 必须隔离这个 legacy bootstrap，不能在新 origin 用正式旧页面自动 seed；旧路线原样保留，不全局 clear/换 key |
| Order | `/order-center` → ServerOrderCenterPage；Server detail 独立；`order-pages.tsx` 的 OrderDetailLoader/new/mutations 仍 orderRepository | 仅已有 Server read 基础，不具备全订单 Server writer；新系统不做 Ainuoke bootstrap，不因新库为空自动填旧单 |
| Scheduling/Closing/Style Progress | Browser repositories（production-scheduling-repository.ts / closing-repository.ts / style-progress）；无对应正式 Server schema | 不开启为正式多用户模块，不扩大本次任务 |
| Attachment | Server metadata/relation/API + S3 adapter；正式 Browser Quote 附件仍 IndexedDB | 新合法 DB relationship 才可访问对象；不扫描/接管旧 COS objects，不暗退 Browser storage；runtime 配置/权限与正式 UI 需后续验证 |
| Identity | session/RBAC boundary 已存在；D-093 current local mode | 多人/远程必须真实 authentication/authorization 验收，不把无认证本机模式上线公网 |

EmptyState/missing-master UI 文案通过实际组件审计确认；本轮只执行 API/adapters 空行为测试，不冒充真实用户 UI 验收。生产列表参数、完整 Editor workflow、附件及远程身份需聚焦接线验证。

## Future deployment isolation — NOT ENABLED

以下仅配置设计，未 compose up/down、未部署、未建真实 DB/volume：

- 独立 Compose project（例如 `zhixu-fresh`）、DB（例如 `zhixu_fresh`）、新非 external project-scoped PGDATA volume 与 network；不要直接复用当前含固定 `zhixu-database` 名称的 Compose，不引用 preparesystem/zhixu-prod 的旧卷，不 mount 旧 dump/init SQL。
- 独立配置目录，例如新 `/opt/zhixu/fresh-start`；**不覆盖 `/opt/zhixu/staging`**。配置使用未来单独授权的新环境 credentials；本 Gate 未创建/读取真实 secret。
- 测试/预上线入口使用不同 origin/profile、独立 loopback 端口（例如 13001），不占用真实 3000/3001/3002；DB 不发布 host port。入口显著标识“新空系统”与“旧环境只供查看”，不默认跳转旧 namespace。
- 使用 reviewed Node image；build-time masters=server 与 runtime identity 一致。正常 startup verify-only；新独立库 schema activation 必须未来单独授权，用正式 runner，不能借自动启动执行或引用旧库已 applied 状态。
- 同一 COS Bucket 可以复用，绝不清 Bucket。继续 `attachments/<uuid>/original`，只有新库合法关系引用的对象属于新系统业务。PR #73 COS real preflight PASS 的证据/来源限制继承，runtimeConfigReviewed、密钥 mount/private/access policy 等并未由此自动完成。
- 远程系统需 session/trusted RBAC、TLS/secure cookie/origin 和独立运维备份；Local Single-User 限本机开发。Quote-first 逐模块启用，缺 Server writer 的旧模块不标生产就绪。

## Next smallest engineering task

Server Revision / PriceVersion 与 Estimate 日常工作流工程验证已完成；后续只聚焦用户另行选择的未接线动作，保留历史不可变、可信权限/审计与版本冲突，Quote/Estimate 权限隔离已在本 PR 修复。不得通过 mock 或 generic 不受限 mutation 补功能；不自动开始确认/导出等工作、不做历史导入、不清旧环境、不扩大到 Order/Scheduling/Closing。真实新环境部署另行授权。
