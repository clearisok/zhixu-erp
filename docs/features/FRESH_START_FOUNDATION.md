# Fresh Start Foundation — empty business data, not production activation

## Decision and boundary

2026-10-08，D-096 用户确认：“新系统所有业务数据，包括基础资料和订单，都从空开始。”Base 是 PR #73 merge `2363831ff32147d6775ef4f4cee2e3e806e0c58d`。

不导入旧 master/settings、Quote/history、SalesOrder、Scheduling、Closing、Style Progress、附件关系、业务账号或 Browser OperationLog；不自动同步艾诺科。不删除旧环境，不改业务模型/计算/历史 Revision 不可变规则。Q5 historical import **NOT REQUIRED**；其 source capture、迁移 freeze、rehearsal、VerifyOnly/Execute 工具与历史 PASS 保留为 dormant compatibility，非当前上线 blockers。已发生的 Q3 57 行 import/cutover 与旧环境 SERVER masters / BROWSER Quote 事实不被撤销。

本 Gate 只验证新 disposable DB、现有 Server/candidate boundary，**不是正式 UI cutover 或 production-ready**。未执行真实 deployment/schema activation/import/restore/COS 操作，未读取真实 secrets/backup，未操作 Ubuntu 或旧 checkout。

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

## Production wiring gaps — actual files, not inferred rollout readiness

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

正式 Quote list/new/detail 的 **Server-only route/repository 接线**：复用既有 candidate 与 aggregate writer，明确支持/未支持动作，隔离 legacy LocalDataBootstrap、展示空资料和未配置设置、验证错误不回退。不做历史导入，不清旧环境，不将 Order/Scheduling/Closing 全部接线夹入该任务。真实新环境部署另行授权。
