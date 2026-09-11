# PostgreSQL Server Persistence Foundation

## Purpose

Phase 1 建立未来正式业务持久化所需的可信服务器边界：Node/TypeScript API、PostgreSQL 连接池、版本化 migration、可信 Auth/RBAC，以及服务器追加式 OperationLog。Phase 2B1 在该边界内加入 PostgreSQL SalesOrder schema/repository/transactional service/read API foundation。Browser Order Center 仍使用既有 Browser Repository；没有迁移、双写或切换现有浏览器数据。

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
- Node server 启动时按顺序执行 migration、同步共享权限目录、可选 bootstrap 管理员，然后监听请求。
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
- `GET /api/v1/sales-orders`（需要 `order.view`）
- `GET /api/v1/sales-orders/:id`（需要 `order.view`）

错误统一返回 `{ error: { code, message, requestId } }`。Health 只有在 PostgreSQL `SELECT 1` 成功时返回 200/ready，数据库不可用时返回 503，不伪报健康。SalesOrder read API 对未登录、无 `order.view` 和不存在的 ID 分别返回 401、403、404；返回 typed composed DTO，不直接暴露数据库行、source hash、source metadata 或 raw payload。API 不接受 SQL、表名、数据库操作名、actor userId、role 或授权结果；未知 `/api/*` 路径返回结构化 404。

## Phase 2B1 SalesOrder foundation

- Forward-only migration `0002_sales_order_foundation.sql` 建立 `sales_orders`、`sales_order_source_links`、`ainuoke_sales_order_contract_mirrors`、`ainuoke_sales_order_color_mirrors`。
- `sales_orders.id` 使用 PostgreSQL UUID，创建后是正式稳定 identity；`order_no` 按既有 NFKC/trim/uppercase 规则规范化并由数据库唯一约束保护。创建来源/creation provenance 不可变，`version` 从 1 开始且每次 owned aggregate update 必须精确递增 1。
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

## RBAC

- PostgreSQL 关系为 `app_users -> app_user_roles -> app_roles -> app_role_permissions -> app_permissions`。
- 权限目录唯一来源仍是 `features/permissions/model/permissions.ts` 的 `PERMISSION_KEYS` / `PERMISSION_DEFINITIONS`；server startup 只把该共享目录幂等同步到数据库，不复制另一份权限列表。
- 服务端授权只比较稳定 `PermissionKey`。角色名称没有授权语义，也不存在 admin hardcoded bypass；bootstrap 管理员通过普通 role 获得当前目录权限。
- Phase 1 不迁移 browser mock users/roles/permissions。自动化账号只创建在一次性 PostgreSQL 容器内，不进入 DEV 数据库。

## Server OperationLog

- `operation_logs` 是新的正式 server table，与 legacy `audit_logs` 完全分离。
- 每条日志保存稳定 string `id`、`operationId`/sequence、module/action/entity、可选 quote/context、before/after/changes/metadata 和时间。
- actor 同时保存 `actor_user_id` 对 `app_users.id` 的 RESTRICT FK，以及 `actor_public_id` / `actor_name` 操作时快照。FK 保证来源账号真实存在；快照保证账号显示名后续变化不污染历史展示。
- append repository 的输入类型没有 actor 字段；actor 只能由 trusted session/application context 单独注入。metadata 即使含伪造同名字段也不能改变正式 actor columns。
- PostgreSQL trigger 拒绝 UPDATE/DELETE；API 只提供带 `audit_log.view` 的只读列表，不提供 append/update/delete/clear endpoint。未来业务写必须在同一数据库 transaction 成功边界调用 repository append。

## Migration contract

- 文件目录：`database/migrations/`，命名 `NNNN_description.sql`，只前进。
- `schema_migrations` ledger 保存 `version`、`filename`、SHA-256 `checksum`、`applied_at`、`duration_ms`。
- runner 使用 session-level PostgreSQL advisory lock 串行化并发进程；每个 migration 在独立 transaction 内执行，DDL 或 ledger 写失败会整体 rollback。
- rerun 已应用文件为 no-op；checksum/filename 改动、已应用文件缺失或重复 version 均 fail closed。已应用 migration 不允许编辑，修复使用新 forward migration。
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

该 profile 等待现有 `database` PG16 health，保留 `zhixu_data` named volume，并由 `/api/v1/health` 检查新 server。`Backup-Zhixu.ps1` / `Restore-Zhixu.ps1` 仍面向 `database` service；Phase 1 未修改或执行备份恢复，也未删除 volume。

## Verification

`npm run test:postgres` 每次创建随机命名 `postgres:16-alpine` 容器，数据库目录使用 tmpfs，动态映射端口，并在结束时只删除该测试容器。测试绝不连接 `zhixu`、真实 DEV 或用户数据库。

覆盖：empty/legacy-schema migration、rerun/order/checksum mismatch/failed rollback/advisory-lock concurrency、稳定用户 ID、valid/invalid/inactive login、expiry/logout/revocation、brute-force、raw token 不持久化/不进日志、RBAC granted/denied/spoof、OperationLog actor/append-only/stable ID/operationId，以及 health ready/unavailable。Phase 2B1 另覆盖 fresh SalesOrder migration、UUID/order-number/source/FK/version constraints、source mirror refresh、color replacement、transactional create/idempotency/rollback/trusted actor、read API 401/403/404/permitted read，以及两个 trusted sessions 读取相同 SalesOrder ID/version。

Phase 2B1 final validation：PostgreSQL integration 12/12、Full Tests 577/577、TypeScript、零警告 ESLint、server build、frontend Production Build 30 routes 与 `git diff --check` PASS。frontend build 的 chunk-size advisory 不影响成功退出。

## Phase boundary and next step

- Phase 2B1 Server Foundation complete；这不等于正式订单已经上线。Browser Order Center 仍使用 Browser Repository，当前 PostgreSQL SalesOrder 只通过 server foundation/integration tests 验证。
- 本阶段没有 live Ainuoke read/write、真实 505 bootstrap、Browser test-order migration、Repository cutover 或 dual write，也没有 Quote、Style Progress、Scheduling、Closing、附件/Blob migration。
- legacy root ERP 是待退役兼容路径，不是新业务表设计、字段语义或 migration source。
- 后续每个业务领域仍必须独立完成 backfill/dry-run/reconciliation/read cutover/write cutover/browser-store retirement；不得长期保留未对账双写。
- Phase 2B2 Bootstrap Preview / Dry Run 已完成；随后 Phase 2B2.1 只读验证了固定 6087105 candidate garment color/size source。两阶段都没有执行真实正式 bootstrap、Browser cutover 或 PostgreSQL business write。6087105 是否取代当前历史 Preview 的 6086997 仍等待用户明确决定。
