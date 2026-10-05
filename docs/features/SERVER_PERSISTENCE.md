# PostgreSQL Server Persistence Foundation

> 当前开发阶段（D-093，2026-10-05）：Q3B2I-C2 CLOSED / PASS。PR #64 本地单用户根路径/统一侧栏修复已部署至真实本机 3001，API、数据库与用户真实浏览器验收通过；Q3 master/settings authority 为 Server、编辑已重开。以下早期 Trusted Session 描述是历史/session-mode 兼容，不是当前 B3/B3-R 登录验收门禁。

Q4A foundation 新增待激活的 `0008_quote_attachments.sql` 与 Server Attachment API。正常启动仍只读核验 migration，真实库只有 0001–0007 时，含 0008 的代码若部署会在 pending 处 fail closed；本任务**不部署、不在真实库应用 0008**。未注入 production object-storage adapter 时附件 API 返回 503，不会落到本地文件或 Browser IndexedDB。详见 `ATTACHMENTS.md`。

Q4B 在 isolated `/quote-center/server-edit` 增加 typed Attachment client/controller 和共享 UI candidate；它只对实际存在的 Server Quote/Revision 发 Q4A 命令，并把返回版本/权威关系列表并入未保存 writer draft 的附件镜像。正式 Browser Quote 附件仍为 IndexedDB；Q4B 未部署、未应用真实 0008、未选择 Object Storage provider，不表示 Quote production cutover。

Q4C-A 已加入 `server/attachments/s3-storage.ts` 与显式 runtime `ZHIXU_ATTACHMENT_STORAGE=s3` 配置。必须配置 endpoint、region、bucket、access key ID、secret access key；`forcePathStyle` 可选，生产 endpoint 必须 HTTPS，disposable MinIO 可用 HTTP。配置缺失/非法时启动 fail closed；未启用时附件 API 仍为 503。密钥只用于 Server SDK，不写入 build-info/响应/OperationLog；对象键继续是 `attachments/<uuid>/original`，PUT/HEAD 使用 SHA-256 metadata 与 size，GET 流式，remove 没有 runtime 调用。仅 disposable MinIO/PostgreSQL 验证；真实 0008、生产 provider/bucket、部署和 Browser 附件 authority 均未改变。

## Local Single-User Mode (development only)

`ZHIXU_IDENTITY_MODE=local-single-user` 加 `ZHIXU_LOCAL_SINGLE_USER_ACK=I_UNDERSTAND_NO_AUTH` 才启用无登录模式；缺省仍为 `session`，非 loopback Browser origin 拒绝。`Dockerfile.server` 将模式同时编入前端 `build-info.json`、镜像 label 和 Node runtime；production startup 校验 compiled/runtime 一致。真实当前容器仅绑定 `127.0.0.1:3001`；任何后续替换仍须重新核对精确 host-port，不能把此模式当作公网生产认证。

当前正常本机开发服务是 `zhixu-q3-local-single-user-ui-20261004t160656z`（3001，RUNNING/healthy），连接 `zhixu-database`（RUNNING/healthy）；`preparesystem-server-1` / 3002 正常保持 STOPPED，不应使用旧 3002 Compose 启动命令恢复日常服务。真实 PostgreSQL migration 0001–0007 current、pending `0`、integrity valid，Q3 Server read 8/8 与 57 行/hash 验收通过。Local Single-User 仅限本机开发；LAN/WAN、香港服务器或多人使用前须另行设计、实施、验收真实 authentication/authorization。

`server/auth/identity-authority.ts` 是单一请求身份来源。本地模式从现有 active `app_users.username=admin` 行只读取得内部 FK/public UUID；该行只是兼容 actor，不提供登录、不读取密码、不创建 session，也不作为未来正式用户模型。公开身份为 `local-single-user` / “本地开发用户”，权限来自完整代码 `PERMISSION_KEYS`。缺少兼容行时启动 fail closed；不会 bootstrap 或修改 `app_users`。Runtime POST login/logout 返回 404，GET me/permissions 无 Cookie 即可使用。服务/仓库仍按 `TrustedIdentity`、`requirePermission`、Origin 与 `X-Zhixu-Request` 处理写入，OperationLog actor 继续使用非空 FK 与快照；禁止 caller actor。旧 auth/schema/session 代码保留但在此模式 dormant。旧根路径 ERP 登录组件仍留给非本地模式；本地单用户访问 `/` 自动进入 `/quote-center`。

## Purpose

Phase 1 建立 Node/TypeScript API、PostgreSQL pool、版本化 migration、Session/RBAC 基础设施与 Server OperationLog；Phase 2B1 加入 SalesOrder schema/repository/service/read API。此处是历史 foundation 说明；后续正式 `/order-center` 列表/基础详情已切到 PostgreSQL 只读，但通用写入和 Browser Quote aggregate 尚未 cutover。D-093 当前本地模式替代用户可见 Session 登录，不删除旧 schema/代码。

## Runtime architecture

```text
Browser
  -> same-origin /api/v1/*
  -> Node.js >= 22.13 TypeScript server
     -> trusted session / PermissionKey authorization
     -> application service / repository (future domain slices)
     -> PostgreSQL 16 pool
```

- API 入口位于 `server/`，使用 Node 内置 HTTP server 和 `pg` pool；没有任意 SQL/table/op dispatch endpoint。
- Node server 正常启动只读验证 migration ledger、文件名与 checksum；只有数据库已完整应用当前 migration 集合时，才继续同步共享权限目录、可选 bootstrap 管理员并监听请求。缺失 ledger、pending migration 或完整性异常均 fail closed，启动路径不会创建 ledger 或执行 DDL。Schema activation 只能通过另行授权的 `npm run db:migrate` 显式执行。
- 生产目标由同一 Node 进程提供 `dist/client` 静态文件和 `/api/v1/*`。Phase 1 在 Compose 中以 `server-foundation` profile 提供该路径；legacy `zhixu` service 暂时保留。
- Pool 有明确最大连接数、连接/idle timeout 和 SIGINT/SIGTERM graceful shutdown。数据库 URL/密码只从 server process environment 读取，不进入前端 bundle。
- `NODE_ENV=production` 时必须配置 `ZHIXU_ALLOWED_ORIGINS`，且 Secure cookie 不允许关闭；本机 HTTP 开发必须使用 development 模式。

## API contract

当前 endpoint：

- `GET /api/v1/health`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/logout`
- `GET /api/v1/auth/me`
- `GET /api/v1/auth/permissions`
- `GET /api/v1/operation-logs`（需要 `audit_log.view`）
- `GET /api/v1/sales-orders`（需要 `order.view`；支持 bounded limit/offset、search、lifecycle/source filters、allowlisted sorting 与 page metadata）
- `GET /api/v1/sales-orders/:id`（需要 `order.view`）
- `GET|PATCH /api/v1/sales-orders/:id/confirmed-commercial-terms`（分别需要 `order.view` / `order.edit`）
- `GET|PATCH /api/v1/quotes/:quoteId/revisions/:revisionId/price-versions/:priceVersionId/confirmed-commercial-terms`（分别需要 `quote.view` / `quote.confirm`；只按 exact provenance resolve）
- `GET /api/v1/quotes`、`GET /api/v1/quotes/:quoteId`（需要 `quote.view`）
- `POST /api/v1/quotes`（需要 `quote.create`；runtime body 只能是 `{}`，ID/code/timestamps/actor 由 Server 决定）
- `PUT /api/v1/quotes/:quoteId`（全 aggregate replacement，要求 `quote.edit`、`expectedVersion`，并按实际变化追加现有细粒度权限）
- Q4A：`GET|POST /api/v1/quotes/:quoteId/revisions/:revisionId/attachments`、`GET|PATCH|DELETE /.../attachments/:attachmentId`、`GET /.../:attachmentId/download`、`POST /.../:attachmentId/link`、`PUT /.../attachments/style-image`；只在显式注入 object-storage adapter 的 Server 上可用，未生产激活。
- `GET|POST /api/v1/quote-masters/brands` 与 `GET|PATCH /api/v1/quote-masters/brands/:id`
- `GET|POST /api/v1/quote-masters/customer-salespeople` 与 `GET|PATCH /api/v1/quote-masters/customer-salespeople/:id`
- `GET|POST /api/v1/quote-masters/fabrics|trims` 与对应 `GET|PATCH /:id`，以及只读 supplier suggestions
- `GET|PATCH /api/v1/quote-settings`、manufacturing preset list/create/read/update 与 resolved-defaults read
- D-090 invariant：Global Quote Settings default 只能引用 active Manufacturing Preset；停用当前 default 时 preset/default/version/trusted audits 同 transaction，inactive assignment fail closed，`resolveDefaults` 不返回 inactive preset，且不触碰历史 Quote snapshot。

错误统一返回 `{ error: { code, message, requestId } }`。Health 只有在 PostgreSQL `SELECT 1` 成功时返回 200/ready，数据库不可用时返回 503，不伪报健康。SalesOrder read API 对非法 list query、未登录、无 `order.view` 和不存在的 ID 分别返回 400、401、403、404；返回 typed composed DTO，不直接暴露数据库行、source hash、source metadata 或 raw payload。List 仅暴露 `colorCount`，完整颜色行只在 detail 返回。API 不接受 SQL、表名、数据库操作名、actor userId、role 或授权结果；未知 `/api/*` 路径返回结构化 404。

ConfirmedCommercialTerms mutation 使用 decimal string + `expectedVersion` typed body，要求 normal trusted cookie、exact allowlisted Origin 与 `X-Zhixu-Request: 1`。未知字段（包括 actor/user/role spoof）拒绝为 400；stale version 为 409。Quote provenance 未关联时 read 返回显式 `unlinked`，write fail closed 为 409，绝不 fuzzy match 或创建 SalesOrder。

Q2A/Q2B2B Quote create/save 复用 Q1 repository，POST/PUT 还要求 exact Origin 与 `X-Zhixu-Request: 1`。Runtime POST 只接受 `{}`，由 Server transaction 分配 UUID、`quoteCode`、neutral draft 和 trusted OperationLog；Q1 exact aggregate create remains internal for future migration. PUT 是完整 aggregate replacement，不是任意字段 SQL PATCH；stale、历史 Revision/Estimate mutation 或 `quoteCode` mutation 返回 409。Q4A 后，已有 Revision 附件 ID 变化必须走专用附件命令，通用 PUT 不能绕开关系表。DTO 保留 decimal string、stable IDs、null/zero。成功 mutation 与 bounded Quote OperationLog 同 transaction 提交；审计失败回滚 Quote，但 sequence 的已消费值不回收。仍无 Quote DELETE、Browser cutover；Q4A binary API 是独立待激活 foundation。

Q3A master/settings reads require trusted `quote.view`; mutations map exactly to existing `settings.global/brand/salesperson/fabric/trim.edit` permissions and never authorize by role name. POST does not accept caller identity; PATCH uses `expectedVersion`. Business decimals are PostgreSQL NUMERIC and HTTP strings. Every actual master/settings write and bounded audit event share one transaction; the audit uses an explicit business-field allowlist, preserves decimal strings and null/zero, and records stable-ID DefaultTrimConfig add/remove/order/override detail. Audit failure rolls back the business row. The APIs do not read Browser repositories and do not mutate Quote aggregates or SalesOrders.

Migration `0007_quote_master_settings.sql` is schema-only: it creates no settings seed/import by itself. It enforces normalized Brand/Salesperson uniqueness, permits duplicate material names, stores one nullable default other cost per supported owner and excludes quantity/usage from authoritative DefaultTrimConfig. Q3A's original evidence was disposable-only; later Q3B2I-C2 separately activated real 0007, imported master/settings and switched formal authority to Server. That later activation does not imply Quote aggregate cutover or authorize Q4A 0008.

## Q2B2B Quote numbering and runtime create

- Forward-only `0006_quote_number_sequence.sql` creates `quote_center_quote_number_seq AS BIGINT MINVALUE 1 INCREMENT 1 NO CYCLE`, calibrates its next value to max valid existing `QT-YYYY-MMDD-<suffix>` + 1 (or 1), and adds exact `quote_code` uniqueness plus an immutable-update trigger. It never rewrites unusual historical codes; pre-existing duplicates make the migration transaction fail and leave ledger/data unchanged.
- The Quote Center sequence is deliberately separate from legacy root ERP `quote_number_seq`. New runtime numbers use one global non-resetting suffix and Server creation date interpreted in `Asia/Shanghai`; minimum width is three, values above 999 expand, and occupied exact candidates are skipped by consuming the next sequence value.
- Runtime create atomically allocates the number, constructs one neutral Server draft, persists its full child graph and appends trusted OperationLog. Initial Quote/Revision/PriceVersion IDs use Server UUIDs; `createdBy` comes from `TrustedIdentity`. Browser masters/settings/clock are absent. Audit failure rolls back all Quote rows, while PostgreSQL `nextval` deliberately leaves a permanent gap.
- Normal startup with pending 0006 fails before permission sync, admin bootstrap or listen and does not create the sequence/constraint/trigger. Only separately authorized `npm run db:migrate` can activate it. Q2B2B validation applies 0006 only to disposable PostgreSQL; real 0004/0005/0006 and real Quote writes remain unexecuted.

## Phase C4.2 ConfirmedCommercialTerms implementation

- `0004_confirmed_commercial_terms.sql` 建立 `confirmed_commercial_terms` current context 与 `confirmed_commercial_terms_sales_orders` association。migration 是 forward-only、无 backfill，并继续由既有 ledger/checksum/transaction runner 管理。
- `ConfirmedCommercialTerms` 有独立 PostgreSQL UUID 与 optimistic version。客户确认价格按 CNY/件解释；确认工价的 `NUMERIC` amount 必须有 `CNY|USD` qualifier。`NULL` 表示未确认，和明确的 `0` 不同；API 不使用 JS float 作为 persisted representation，也不引入新舍入规则。
- Quote-linked context 的 labor currency 只由 Quote surface 按 exact PriceVersion 建立/变更。Order mutation 必须原样保留已建立 qualifier；CNY↔USD 变更或未建立时提交工价均返回安全 409，transaction 不写 terms/OperationLog。unlinked order-owned context 才允许 Order 明确选择币种。
- 当前 schema/repository 没有证明 Quote provenance 1:1；多个 SalesOrder 可持有相同 exact `source_quote_id/source_revision_id/source_price_version_id`。因此 linked context 的 exact provenance 唯一而 association 为 1→N；所有相同 provenance 的订单和 Quote endpoint 解析到同一 terms UUID。DB trigger 拒绝 provenance mismatch 与 association 改绑。
- 无完整 Quote provenance 的 SalesOrder 仅能拥有自己的 order-scoped context；服务不会填充或改变 `source_quote_id/source_revision_id/source_price_version_id`。partial provenance 被视为不安全状态并返回 409。
- 每次真实 terms mutation 与一条 existing append-only `operation_logs` action 在同一 transaction 中提交。OperationLog actor 只来自 `TrustedIdentity`，记录 old/new amount/currency/version、mutation surface、exact Quote provenance（如有）和关联 SalesOrder IDs；审计失败会回滚 terms/association。
- terms version 与 SalesOrder aggregate version 分离。C4.2 不修改 SalesOrder source mirrors、source quantity、order number/sequence、lifecycle、DeliveryPlan 或任何其他 PriceVersion field。
- Browser Quote linkage 使用默认关闭的 `NEXT_PUBLIC_ZHIXU_CONFIRMED_TERMS_QUOTE_LINKAGE=true` build-time activation gate。关闭时现有 Quote-local production flow 保持原样，并要求不得形成/使用 formal Quote-linked SalesOrder；开启后 authenticated exact lookup 才能证明 linked/unlinked，anonymous/unavailable/loading 均为 unknown 并禁止 local fallback。linked confirmation projection 按 Quote type 判断：processing 需要 labor，distribution 需要 labor + customer price。
- 本实现只在 disposable PostgreSQL 验证。真实 `zhixu` 未应用 0004/0005、真实业务写入为 0。Node startup 只读验证 migration 状态，任一 pending migration 都在 permission sync/admin bootstrap/listen 前 fail closed 且不写 schema；只有另行明确授权的 `npm run db:migrate` 可执行 activation。
- Post-Q1/post-M0 integration 证明 0004/0005 同时 pending 与仅 0004 pending 都保持 startup 零 schema write；显式 disposable apply 的 0004→0005 与 0005→0004 均 PASS。C4.2 current mutation 不改变 Q1 Quote aggregate version、当前/历史 confirmation snapshots 或 exact Quote/Revision/PriceVersion IDs。

## Phase 2B1 SalesOrder foundation

- Forward-only migration `0002_sales_order_foundation.sql` 建立 `sales_orders`、`sales_order_source_links`、`ainuoke_sales_order_contract_mirrors`、`ainuoke_sales_order_color_mirrors`。
- Forward-only migration `0003_sales_order_number_sequence.sql` 增加 PostgreSQL-owned global sequence/insert allocator。新单由数据库生成 `SO-00000001` 格式编号；repository/service input 不接受 `orderNo`，显式 override 与创建后 mutation 均拒绝，rollback gap 不回收。
- `sales_orders.id` 使用 PostgreSQL UUID，创建后是正式稳定 identity；`order_no` 是不可编辑业务编号并继续由数据库唯一约束保护。创建来源/creation provenance 不可变，`version` 从 1 开始且每次 owned aggregate update 必须精确递增 1。
- `sales_order_source_links` 以 `(source_system, source_entity_type, external_id)` 唯一绑定 SalesOrder。数据库 trigger 拒绝改变 source identity 或 `sales_order_id`，refresh 不能静默换绑。
- Ainuoke contract/color mirror 只保存当前已验证 typed source facts。合同 mirror 一单一行；color mirror 使用稳定 `source_line_identity` child 行。refresh 只 upsert/replace 这两个 source-owned slice，不更新 SalesOrder identity、creation provenance 或 version。
- Repository 只使用参数化 SQL，提供 create/get-by-id/get-by-source/get-by-salesContractNo/list、source-link create/update、contract mirror upsert、color mirror replacement 与 optimistic lifecycle update。list 以 order number + UUID 形成稳定顺序。
- `createAinuokeSalesOrder(pool, trustedIdentity, input)` 使用单 PostgreSQL transaction 和 source-scoped advisory lock：检查 binding；存在时幂等返回原 SalesOrder；不存在时依次创建 aggregate、source link、contract mirror、color slice 和 OperationLog，任何失败全部 rollback。
- OperationLog actor 只能由独立 `TrustedIdentity` 参数注入；service input 没有 actor，附加同名字段不能覆盖正式 actor FK/public-ID/name snapshots。重复 source create 不重复写 OperationLog。
- 该 internal service 当前只供集成测试和下一阶段 bootstrap orchestration 使用，不开放 POST/bootstrap/upsert/delete API。

## Identity and trusted session

- `app_users` 继续是唯一正式用户身份源；没有 `app_users_v2`。
- migration 为每个用户增加唯一、不可变的 `public_id UUID`。既有用户首次 migration 时获得一次 ID，后续 rerun 保持不变；API 只暴露该稳定公开 ID，不暴露内部 BIGINT PK。
- 密码继续使用 PostgreSQL `pgcrypto` bcrypt (`crypt` + `gen_salt('bf', 12)`)；bootstrap 密码只从 `ZHIXU_ADMIN_PASSWORD` 读取，至少 12 字符，仓库无默认密码。已存在账号不会被 bootstrap 静默改密或启用。
- V1 session 使用 256-bit 随机 bearer token；PostgreSQL 只保存 `v1:<sha256>` digest。Cookie 为 HttpOnly、SameSite=Strict，生产必须 Secure，本机 development 允许 HTTP。
- `app_sessions.session_kind` 区分 legacy/v1；legacy session 保持可读，V1 不把 raw token 交给旧 `api_dispatch`。过期、撤销或停用用户的 session 均被拒绝；logout 写 `revoked_at` 并清 cookie。
- 登录失败按规范化 username 在 PostgreSQL transaction/advisory lock 下计数：15 分钟内 10 次后返回 429，旧记录保留 7 天。
- mutation 必须同时提供 `X-Zhixu-Request: 1` 和精确 Origin；身份始终由 session 派生，body/header 中伪造的 userId/role/permissions 不参与认证或授权。

### C2.1 Browser trusted session boundary

- `features/server-auth/server-auth-client.ts` 是 same-origin Browser client，复用既有 login/logout/me/permissions API；默认 `baseUrl=""`，测试才允许注入 base URL/fetch。所有请求均为 credentialed/no-store，login/logout 保留 mutation-boundary header，Browser JavaScript 不读取或构造 Cookie。
- `ServerSessionProvider` 独立维护 `checking | anonymous | authenticated | error`，从 Node session truth 恢复稳定 public UUID user 与 server permission set，并提供 login/logout/refresh/invalidate。任何 trusted identity/session token/password 都不持久化到 localStorage、sessionStorage 或 IndexedDB。
- 它不替换既有 Browser `PermissionProvider`。Browser-local `currentUser`、role editing 与 `permissionRepository` 继续原行为；C2.1 不暗示两套 identity 已统一，也不自动映射 Browser `user-admin` 与 PostgreSQL public UUID。
- `/order-center/server-preview` 只在 authenticated + `order.view` 时读取 SalesOrder list/detail。anonymous 显示登录，403 保留 permission-denied 语义且不请求 list，list/detail 401 会 invalidate session 回到登录态；logout 只退出 Server session，不改变 Browser-local user。
- Node production runtime 已能从 `dist/client` 同源提供静态 preview route 与 `/api/v1/*`，无需 Next production server 或永久 cross-origin auth。该 route 仍标记 `DEV SHADOW READ`、没有导航入口和 mutation；保留 production static artifact 只为下一 Gate 的真实 shadow acceptance，不是 Browser Order Center cutover。
- C2.1 只用 mock 和 disposable PostgreSQL 16 验证 Browser client→Node→PostgreSQL contract。没有真实 login/session 或 PostgreSQL write；真实 C2.2 Browser acceptance 由下节记录。

### C2.2 real Browser shadow acceptance

- 使用 PR #30 merged main `5fee5ebb04f04219a9da064cd683aaba8536663a` 构建 Node static + API，并只在 `http://127.0.0.1:3002/order-center/server-preview` 验收 same-origin HttpOnly session。用户本人输入既有 admin 密码；Browser/Codex 未读取或持久化密码、cookie 或 token。
- anonymous login-required、trusted `系统管理员 (admin)` identity、`order.view`、511-row PostgreSQL list、硬刷新 restore、orderNo/BillNo/style fuzzy search、`lifecycleState=draft` 与 `creationSource=ainuoke` 各 511 条筛选、分页、普通 detail、zero-color detail、logout 和 post-logout anonymous refresh 全部 PASS。
- 验收期间只写正常 auth/session metadata。两次人工成功登录使 successful/failed/sessions/active/revoked 从 `3/0/2/1/1` 变为 `5/0/4/2/2`；测试 Browser logout 撤销其中一个新 session，未清理另一 active session 或历史记录。`app_users`、RBAC、SalesOrder tables/logs/version 与 sequence 均未修改。
- 验收后 SalesOrder aggregate/link/contract/color/log 仍为 `511/511/511/1348/511`，sequence 仍为 `511/true`；Ainuoke、Browser business、Quote、Style Progress、Scheduling 与 Closing writes 为 0。临时 3002 server 已停止，数据库与 legacy 3000 runtime 未停止。
- `BROWSER_TRUSTED_SESSION_READY=YES`、`REAL_BROWSER_SHADOW_ACCEPTANCE=PASS`、C2 complete。该证据仍只属于 `DEV SHADOW READ`；Browser Order Center production cutover 为 NO。

### C3.1 production Order list read cutover

- Production `/order-center` now renders a dedicated `ServerOrderCenterPage` backed only by `serverSalesOrderReadRepository`; the legacy Browser `OrderCenterPage` remains in the repository but is no longer the production base-list source. Exact Server-read routes skip the global Browser local-data bootstrap, so opening `/order-center` or `/order-center/server-preview` does not initialize/read the Browser OrderRepository; all other Browser-owned routes retain the existing initialization path.
- The route follows the trusted Server session state machine: checking, anonymous login-required, authenticated without `order.view` as explicit 403, authenticated permitted list, and list/detail 401 invalidation back to anonymous. Server/session errors remain explicit and never trigger a Browser-local fallback. Browser `PermissionProvider` is unchanged and remains a separate identity boundary.
- The list requests 50-row Server pages with normalized submitted search, exact lifecycle/creation-source filters and allowlisted Server sorting. It exposes only PostgreSQL/current-mirror facts or lossless aliases. `lifecycleState` and `sourceLifecycleStatus` remain separate, and zero-color masters remain visible.
- A list row opens a same-page read-only inspector through Server `getById`; the PostgreSQL UUID is never routed into the Browser `/order-center/detail` loader. There are no create/edit/save/cancel/delete/reorder/attachment actions for PostgreSQL rows and no SalesOrder mutation API was added.
- Browser OrderRepository, Browser new/detail/editor, manual/Quote/reorder write paths and existing Browser data remain retained, unmigrated, undeleted and unmodified. Scheduling, Closing, Style Progress, Ainuoke and Quote persistence are unchanged. C3.1 performed zero real DB/auth/session/SalesOrder writes and no real login.
- C3.1 disposable implementation validation is complete. Real production-list Browser acceptance and interactive 1280/wide visual acceptance are deferred to C3.2 because the isolated local mock tab was unavailable; the real 3002 shadow session was not used. Therefore C3 is not complete and full production detail remains uncut.

### C3.2 real production Order Center list acceptance

- PR #32 merged as `1c5b8e1680ac5f49cda3df532cb7ae9509d73a0b`. The real production route `http://127.0.0.1:3002/order-center` passed anonymous/login-required, user-entered trusted admin login, public Server identity, `order.view`, source=PostgreSQL, total=511, page size=50 and hard-refresh session restore acceptance. No Browser fallback appeared.
- Server fuzzy search passed for `SO-00000001`, `PI2505-075` and `2359/332`; exact `draft` and `ainuoke` filters each returned 511; orderNo ASC/DESC started at `SO-00000001`/`SO-00000511`; pagination moved 1–50 → 51–100 → 1–50 with `SO-00000051` as the second-page first row.
- `SO-00000001` and zero-color `SO-00000015` both opened only the same-page read-only inspector. UUID/version/base facts and the legitimate empty color-enrichment state were visible; the URL stayed `/order-center`, and no Browser editor or mutation control was entered.
- Real 1280×800 and 1600×900 visual acceptance passed without document-level horizontal overflow or destructive clipping. Search/filter/sort, sticky action access, pagination, drawer close control and zero-color empty state remained usable/readable.
- Logout and post-logout refresh returned to anonymous state with zero visible SalesOrder rows. Only authorized auth/session metadata changed: successful/failed/v1 sessions/active/revoked=`5/0/4/2/2` → `6/0/5/2/3`. SalesOrder counts remained `511/511/511/1348/511`, fingerprint and sequence `511/true` were unchanged, and app_users/admin/RBAC fingerprints stayed unchanged.
- Browser OrderRepository was retained, unmigrated and unmodified. Manual/Quote/reorder/full-detail writes, Scheduling, Closing, Style Progress and Ainuoke remained untouched. `PRODUCTION_ORDER_LIST_POSTGRESQL_READY=YES`, `REAL_PRODUCTION_ORDER_LIST_ACCEPTANCE=PASS`, and C3 is complete; C4 Base Detail + Server Extensions is the next Gate but is not authorized.

### C4.1 production Order Center base-detail read cutover

- The production list now navigates by stable PG UUID to `/order-center/server-detail?id=<uuid>`, a dedicated static-export-compatible Server route. It does not use the Browser `/order-center/detail` loader, Browser OrderRepository or any create/edit/save/delete path. Exact Server-read routes skip Browser local-data initialization; legacy Browser routes are retained and unchanged.
- The page calls only the typed `ServerSalesOrderReadRepository.getById` path and preserves trusted session + `order.view`. Anonymous/login-required, detail 401 session invalidation, explicit 403, explicit 404 and Server-unavailable states never fall back to Browser data.
- Detail UI separates Zhixu aggregate facts from read-only Ainuoke source facts. It exposes only persisted authoritative identity/provenance/lifecycle/timestamps, BillNo/InsideOrderNo/style/company/customer/brand/source quantity/contract dates/source lifecycle, colorCount and source color name/quantity. Customer/brand source snapshots are not canonicalized through Browser masters. InsideOrderNo is labeled as a mutable source attribute; source quantity and process/contract delivery have no edit control.
- Color-row delivery remains typed/internal and is not rendered. Zero-color masters remain valid. Customer PO and every unpersisted/blocked master, DeliveryPlan, commercial-term, production-country, price, attachment, execution and mutation field remain absent.
- C4.1 changes no schema, API endpoint, permission catalog or server business-write behavior. Implementation validation uses mocks/source contracts and disposable PostgreSQL only.
- PR #35 merged main `c38e80a44eed384c0d09f9a0317bd14122763865` subsequently passed real production-detail Browser acceptance at the production-shaped 3002 runtime: anonymous protection, user-entered admin login, list → detail UUID parity, normal authoritative source parity, hard refresh, return/reopen, zero-color, explicit 404, 1280/wide visual checks, logout and post-logout protection all passed without Browser fallback. Real 403 was not manufactured; automated 403 remains PASS.
- SalesOrder counts/fingerprint/sequence stayed `511/511/511/1348/511`, `580696ff5c562493dea67f883df501cc` and `511/true`. app_users and RBAC fingerprints stayed unchanged. Only authorized auth/session metadata changed from `6/0/0/0/0` to `8/0/2/1/1`; business writes were 0. **C4.1 = COMPLETE**. C4.2 `ConfirmedCommercialTerms` is also complete and validated against M0 + Q1 using disposable PostgreSQL; real 0004/0005 activation and real Browser acceptance remain unauthorized and unexecuted. DeliveryPlan remains not implemented and C5 has not started, so C4 overall remains incomplete.

## RBAC

- PostgreSQL 关系为 `app_users -> app_user_roles -> app_roles -> app_role_permissions -> app_permissions`。
- 权限目录唯一来源仍是 `features/permissions/model/permissions.ts` 的 `PERMISSION_KEYS` / `PERMISSION_DEFINITIONS`；server startup 只把该共享目录幂等同步到数据库，不复制另一份权限列表。
- 服务端授权只比较稳定 `PermissionKey`。角色名称没有授权语义，也不存在 admin hardcoded bypass；bootstrap 管理员通过普通 role 获得当前目录权限。
- Phase 1 不迁移 browser mock users/roles/permissions。自动化账号只创建在一次性 PostgreSQL 容器内，不进入 DEV 数据库。

### C1 guarded real activation

- `activateExistingServerAdminRole()` 是独立于 `bootstrapAdmin()` 的 narrow activation path。它只接受 normalized `admin`，要求唯一 existing active row + public_id，并且从不 INSERT/UPDATE `app_users` 或接收密码。
- PLAN/execute 都验证 fixed `zhixu`、repository current 0001/0002/0003 filename/checksum ledger 和精确 SalesOrder safety state。Execute 另要求 CLI `--confirm-real-rbac=zhixu` + env `ZHIXU_REAL_RBAC_CONFIRM=YES`；没有 mode/username/任一确认均 fail closed。
- Execute 在单 transaction + advisory xact lock 内调用 `synchronizePermissionCatalogInTransaction()`，幂等 upsert `role-server-admin`（服务器管理员）、全部当前 `PERMISSION_KEYS` role bindings 和 existing admin user-role binding。不删除或覆盖其他 role/permission/assignment；未知额外 server-admin permission 无法安全删除时 PLAN 拒绝执行。
- C1.1 只完成 runner/disposable rehearsal 与 real read-only PLAN。真实权限目录、role/bindings、login attempts/session 均未写入；用户对 runner merged 后 C1.2 的 narrow activation + authenticated acceptance 授权已存在。
- C1.2 使用 merged main `bb60f84f9aa148877b75a81b42f4b2f36eccabb4` 完成真实 activation：当前 54 项 catalog、`role-server-admin`、54 项 role permission 和 existing admin binding 均存在，`order.view` 可解析，重复项为 0，第二次 guarded execute 幂等。`app_users` row count 和包含 password hash 的 admin core fingerprint 未变；没有用户创建或密码修改。
- 本地 trusted admin acceptance 完成 login、`/auth/me`、`/auth/permissions`、6 页/511 条唯一 SalesOrder、fuzzy search、`lifecycleState=draft`、`creationSource=ainuoke`、allowlisted sorting、代表性 detail、400/404 与 logout。验证后 SalesOrder counts/sequence 和 legacy/business fingerprints 未变化；`SERVER_AUTH_READY_FOR_SHADOW_READ=YES`。
- Operational note：Windows PowerShell 5.1 临时验收脚本应使用 ASCII-only source，避免 UTF-8-no-BOM 中文源码解释差异；结构化 HTTP error body 从兼容的 `ErrorDetails.Message` 读取。Ainuoke `sourceLifecycleStatus` 与 SalesOrder `lifecycleState` 是不同语义；本次 bootstrap SalesOrder 均为 `draft`。通用 search 是 `ILIKE` fuzzy search，style 等查询可返回多行，验收应检查包含已知结果而非强制唯一。

## Server OperationLog

- `operation_logs` 是新的正式 server table，与 legacy `audit_logs` 完全分离。
- 每条日志保存稳定 string `id`、`operationId`/sequence、module/action/entity、可选 quote/context、before/after/changes/metadata 和时间。
- actor 同时保存 `actor_user_id` 对 `app_users.id` 的 RESTRICT FK，以及 `actor_public_id` / `actor_name` 操作时快照。FK 保证来源账号真实存在；快照保证账号显示名后续变化不污染历史展示。
- append repository 的输入类型没有 actor 字段；actor 只能由 trusted session/application context 单独注入。metadata 即使含伪造同名字段也不能改变正式 actor columns。
- PostgreSQL trigger 拒绝 UPDATE/DELETE；API 只提供带 `audit_log.view` 的只读列表，不提供 append/update/delete/clear endpoint。未来业务写必须在同一数据库 transaction 成功边界调用 repository append。

## Migration contract

Q1 adds independent `0005_quote_foundation.sql` and internal `server/quotes/` aggregate persistence. The eight `quote_center_*` tables preserve original IDs, owner-scoped child identity, ordered Revision/PriceVersion/Estimate snapshots and NUMERIC decimal strings. Legacy `quotes`, SalesOrder and master-data tables are untouched. Historical Revision/Estimate content is protected by the repository/service boundary; aggregate save uses row lock + optimistic version + one transaction, reads use repeatable-read snapshots. This is disposable-validated engineering foundation only: no Quote HTTP API, trusted production writer/audit integration, Browser cutover, real migration, attachment pipeline or master authority transfer. Details and exact tables are in `QUOTE_PRODUCTION.md`.

Version 4 owns the ConfirmedCommercialTerms domain and version 5 owns the Quote aggregate foundation. The existing runner supports non-contiguous versions and explicit apply includes a lower pending version; actual 4→5 and 5→4 orders pass disposable validation. All applied files must still be present with matching checksums when deploying. Neither 0004 nor 0005 has been activated on real `zhixu`; after M0, `server/index.ts` verifies pending migrations read-only and refuses to start instead of applying them.

- 文件目录：`database/migrations/`，命名 `NNNN_description.sql`，只前进。
- `schema_migrations` ledger 保存 `version`、`filename`、SHA-256 `checksum`、`applied_at`、`duration_ms`。
- runner 使用 session-level PostgreSQL advisory lock 串行化并发进程；每个 migration 在独立 transaction 内执行，DDL 或 ledger 写失败会整体 rollback。
- rerun 已应用文件为 no-op；checksum/filename 改动、已应用文件缺失或重复 version 均 fail closed。已应用 migration 不允许编辑，修复使用新 forward migration。
- `server/index.ts` 不再调用 migration apply runner。启动 preflight 在 PostgreSQL `READ ONLY` transaction 中读取 ledger 并复用同一 filename/checksum/missing-file guard；pending 时输出不含 connection string/credential 的安全错误，并在 permission catalog sync、admin bootstrap 与 HTTP listen 前退出。
- `npm run db:migrate:status` 是只读 operator status；返回 applied、pending、ledger existence 与 integrity，不创建 ledger。`npm run db:migrate` 是唯一正式 apply 入口，仍保留 advisory lock、逐 migration transaction、ledger、rerun skip 和 rollback 语义。部署顺序固定为 backup/preflight → 显式 migration activation → status verification → application startup。
- 没有自动 down。回退方式是经过验证的新 forward-fix migration，或在明确授权和已验证备份下恢复数据库。
- legacy `database/001_schema.sql` / `002_admin.sql` 仍只服务旧 runtime，不会由 Node migration runner 执行。Phase 1 migration 只演进共享 identity/session 并新增 RBAC/OperationLog，不修改 `customers/quotes/orders/schedules/audit_logs/api_dispatch`。

## Development and Docker

本机开发：

```powershell
# Terminal 1: API at 127.0.0.1:3100
npm run server:dev

# Terminal 2: Browser at 127.0.0.1:3001; Vite proxies /api/v1
npm run dev:local
```

配置从未提交的 `.env` / process environment 提供，模板见 `.env.example`。容器路径：

```powershell
docker compose --profile server-foundation up --build server
```

该 profile 等待现有 `database` PG16 health，保留 `zhixu_data` named volume，并由 `/api/v1/health` 检查新 server。Phase 1 未修改或执行备份恢复，也未删除 volume。Q3B2G 后 `Backup-Zhixu.ps1` / `Restore-Zhixu.ps1` 不再依赖当前 checkout 的 Compose 解析目标，而是共用显式 exact-target guard；真实库仅执行了只读 `-VerifyTargetOnly`，本 Gate 未真实备份或恢复。目标/冻结/双重确认规则见 `docs/features/QUOTE_MASTER_SETTINGS_ACTIVATION.md`。

## Verification

`npm run test:postgres` 每次创建随机命名 `postgres:16-alpine` 容器，数据库目录使用 tmpfs，动态映射端口，并在结束时只删除该测试容器。测试绝不连接 `zhixu`、真实 DEV 或用户数据库。

覆盖：empty/legacy-schema migration、rerun/order/checksum mismatch/failed rollback/advisory-lock concurrency、稳定用户 ID、valid/invalid/inactive login、expiry/logout/revocation、brute-force、raw token 不持久化/不进日志、RBAC granted/denied/spoof、OperationLog actor/append-only/stable ID/operationId，以及 health ready/unavailable。SalesOrder 另覆盖 0001/0002/0003、首号/次号、并发唯一、client override/mutation 拒绝、rollback 不复用、UUID/source/FK/version constraints、source mirror refresh、transactional create/idempotency/rollback/trusted actor、read API 401/403/404/permitted read，以及两个 trusted sessions 读取相同 SalesOrder ID/version。

Phase 2B1 final validation：PostgreSQL integration 12/12、Full Tests 577/577、TypeScript、零警告 ESLint、server build、frontend Production Build 30 routes 与 `git diff --check` PASS。frontend build 的 chunk-size advisory 不影响成功退出。

## Real PostgreSQL schema activation

Phase 2B3A.1 on 2026-09-12 applied migrations 0001/0002/0003 to the fixed real `zhixu-database / zhixu` PostgreSQL 16.14 target through the compiled migration-only entry. The full server was not started, so permission catalog synchronization, bootstrap admin and other startup writes did not run.

- The pre-existing backup `D:\workspace\preparesystem\backups\zhixu-20260912-000250.dump` was revalidated as a non-empty custom archive (47,667 bytes, SHA-256 `4A6A11844E70943318760F1F8729E736656A1B5A8C97E9F04024FB87A335EF1C`) with `pg_restore --list`.
- `schema_migrations` contains exactly 0001/0002/0003, with filenames and checksums matching the repository. A second runner execution applied nothing and skipped all three.
- RBAC tables and `operation_logs` exist, but catalog sync was deliberately not executed; empty roles/permissions are therefore an expected migration-only state.
- SalesOrder aggregate/source-link/contract-mirror/color-mirror rows and SalesOrder OperationLogs remain 0. `sales_order_number_seq` remains unconsumed at `last_value=1, is_called=false`.
- Pre/post deterministic reconciliation preserved all legacy user/session core data and all `customers`, `quotes`, `orders`, `schedules` and `audit_logs` rows. Migration 0001 populated unique non-null `public_id` for both existing users without changing their legacy core fields.
- No Ainuoke read/write, SalesOrder bootstrap, Browser write/cutover, or Quote/Style Progress/Scheduling/Closing migration/write occurred.

## Phase boundary and next step

- Phase 2B1 Server Foundation、Phase 2B2 Preview/validation、Phase 2B3A.1 schema activation 与 Phase 2B3B.2 real bootstrap 均已完成。真实 `zhixu` PostgreSQL 当前有 511 个 SalesOrder master、511 个 source link、511 个 contract mirror、1,348 个 color mirror 和 511 条 trusted SalesOrder OperationLog，正式编号为 `SO-00000001`…`SO-00000511`。
- 完成 real bootstrap 不等于 Browser 正式订单已经上线。Browser Order Center 仍使用既有 Browser Repository；没有 Browser test-order migration、Repository cutover 或 dual write，也没有 Quote、Style Progress、Scheduling、Closing、附件/Blob migration。
- legacy root ERP 是待退役兼容路径，不是新业务表设计、字段语义或 migration source。
- 后续每个业务领域仍必须独立完成 reconciliation/read cutover/write cutover/browser-store retirement；不得长期保留未对账双写。
- Phase C1 已完成真实 Server RBAC activation 与 authenticated shadow acceptance。真实 permission catalog/`role-server-admin`/existing-admin binding/`order.view` 已激活；admin core、SalesOrder business state、sequence 与 legacy business state 均保持不变。Post-C1 backup 为 `D:\workspace\preparesystem\backups\zhixu-20260913-085419.dump`（649,290 bytes，SHA-256 `A9346C786828F919A6A372565CE2652E20B444C498CC01EBEADAF82D42A6E333`，`pg_restore --list` PASS）。
- `SERVER_AUTH_READY_FOR_SHADOW_READ=YES`；C2、C3 与 C4.1 authoritative base-detail read 均已完成。Production `/order-center` base list/detail 已从 PostgreSQL 读取；通用 write cutover 与 Browser retirement 均未执行。C4.2 `ConfirmedCommercialTerms` 已在独立分支实现并仅完成 disposable PostgreSQL 验证；真实 0004 activation 与真实 Browser acceptance 尚未授权。DeliveryPlan/C4.3 未实现、C5 未开始，因此 C4 overall 仍不完整。
