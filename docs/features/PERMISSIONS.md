# 权限系统

## Server list / internal summary field boundary (2026-10-09)

No new role/catalog or role-name branch. Old legal list calls stay compatible with `quote.view`; explicit `columns` reject unsupported/duplicate/repeated/oversized input before reading. Identity-driven column authorization applies before the bounded source read, not after sending full data to UI.

| Fields / action | Existing required permissions |
| --- | --- |
| Quote code, style text/placeholder, brand, salesperson, type, PV count, quantity, qualitative current confirmation status/source, Revision, aggregate status, date | quote.view |
| Fabric/trim cost, labor, garment selling price, confirmed labor/garment amounts | quote.view + quote.cost.view |
| Internal summary action | quote.view + quote.export, plus selected field dependencies |
| estimateRevision | quote.view + quote.export + estimate.view |
| estimateTotal / estimateDifference | quote.view + quote.export + estimate.view + quote.cost.view |

Estimate amount/difference require both protected estimate and underlying cost access; qualitative confirmation status reveals no amount. Unrequested Estimate is not queried or placed in builder/cache/log. No estimate.view still permits ordinary authorized list/summary. Forged protected requests return403; unsupported filters/sorts cannot infer protected values through totals. UI settings re-filter current permissions after account change/revocation and are never an authorization token. Successful generation events contain only selection/file evidence, no estimate existence or history, and existing sensitive-event/DTO protections remain.

## CURRENT new Server Quote build — D-097 (not deployment)

Server Revision/PV 命令沿用权限目录：`quote.edit` + Revision 创建 `quote.revision.update`、PV 创建 `quote.price_version.create`、删除 `quote.price_version.delete`；元数据更新仍 `quote.edit`，成本/参数变更继续通过原 aggregate diff 的细粒度检查。历史查看使用 `quote.revision.view`，不提供历史 writer。API IdentityAuthority 身份决定 actor/time，body 不接受 actor/createdAt/revisionLabel；事务失败时日志/关系/aggregate 一并回滚，无 Browser audit 副本或新增超级权限。Estimate 日常命令已接已有权限；整单删除/转订单仍未接线；linked权限见下文。

2026-10-09：未关联当前 PV 确认使用 quote.view + quote.confirm，不要求 estimate.view/quote.edit；专用命令生成可信来源/时间/审计，generic PUT 不可改变确认。当前/历史客户 Excel 与列表 ZIP 使用 quote.view + quote.export + quote.cost.view，历史另需 quote.revision.view；没有 estimate.view 的合法导出者不会读取 Estimate。读取 Server 日志必须 audit_log.view，Quote详情另需 quote.view/存在性；无 estimate.view 时敏感事件在总数/过滤/分页之前排除，普通计数摘要裁剪。UI禁用不是API授权替代，角色/目录不变。Linked mutation uses quote.view + quote.confirm without estimate.view/quote.edit; dirty save keeps original edit permissions. Order uses order.view + order.edit, not quote.confirm or current-Quote eligibility. Default role/catalog unchanged.

显式 Quote authority=server 的 root 使用现有 ServerSessionProvider / IdentityAuthority / PermissionAuthorityProvider；可信 permission bridge 只映射 session 身份与权限，不 load Browser permissionRepository，不提供 Browser 用户/角色 mutation。session 模式复用唯一 ServerLoginCard，API 仍检查 quote.view/create/edit 与动作/基础设置细粒度权限；请求不能提供 actor。unsupported routes 不挂旧 Browser 模块；没有新 super permission。默认 browser 分支的 PermissionProvider/旧 Local Single-User runtime 保持，D-093 loopback-only 不放宽。

> 当前开发模式（D-093）：显式 Local Single-User Mode 与 PR #64 UI 修复已部署至真实本机 3001，用户真实浏览器验收通过；同一可信技术身份拥有完整 54 项 `PermissionKey` catalog，不要求织序账号/密码/Cookie。Q3B2I-C2 CLOSED / PASS，Q3 master/settings 为 Server authority、编辑已重开。旧 Server Session/RBAC 与 Browser mock 用户界面说明是 session-mode/历史行为；旧 schema 和服务权限检查仍保留。此模式只限本机开发，未来 LAN/WAN/香港服务器/多人使用须另建真实 authentication/authorization Gate。

本地单用户 UI 不呈现登录表单、logout、Browser 测试用户切换或用户权限管理入口；直接打开旧管理路由只显示模式说明。Browser Quote aggregate 仍为 mock Repository，不能因此声称已完成 Quote writer cutover。Server service 的细粒度权限校验和可信 OperationLog actor 不被删除。未来正式多用户认证需要独立设计/验收，不将本模式扩展为生产安全模型。

Q4A Server attachment foundation 复用现有 `quote.view`（metadata/read/download）与 `quote.edit`（upload/rename/link/unlink/style-image），不新增超权限或默认角色政策。两种身份模式均经 `IdentityAuthority` 解析后交给服务层再次检查；请求 body/header 不能提供 actor。该 API 目前无 production storage adapter、未部署/未激活，不改变正式 Browser 附件权限。

## Server Quote / Estimate DTO 权限边界

Quote / Estimate 权限耦合已在本 PR 内修复，而非新增角色政策。`quote.view` 可读报价及已授权历史，不因他人生成 Estimate 而整体403。可信身份无 `estimate.view` 时，GET、创建、普通保存与 Revision/PV 响应集中投影为 `estimateVisibility: restricted`，完全省略 active/history 字段，不返回存在性、历史条数或汇总；有权限则保留完整 Estimate。Editor 使用独立视图类型保留“未授权返回”状态，不伪造成 null/[]，不加载估算面板/计算/缓存；成本入口显示无查看权限。

普通 PUT 只提交 Quote 内容；Server 在 expectedVersion 校验后合并当前已保存 Estimate，仍对完整领域实体执行原 normalize/validate、细粒度权限、历史不可变与 repository CAS/事务检查。缺失字段不是清空命令；无 Estimate 读权限者注入任何 Estimate 字段（包括 null/[]）返回409 `estimate_command_required`。有读权限者的旧完整请求仅兼容原样切片，任何变化仍拒绝；Estimate 修改只走专用命令，需要 `quote.edit` + `estimate.view` + `estimate.edit`。读权限不授予写权限，默认角色/权限目录不变。

管理员另窗更新估算会推进 Quote aggregate version；旧 expectedVersion 保存返回409，不能用旧保护切片覆盖新值。历史 Estimate 仍只读，恢复建立新 active；内部 repository 完整持久化能力保留。客户端可见性标记不是权限来源，body 不能提供它授权或写入。

此前“含 Estimate 整单403”的实现是本 PR 修复的兼容问题，不是正式查看员政策。测试按可信 permission keys 区分查看员、无估算权限的报价编辑者、估算只读者和合法估算编辑者，不按角色名称分支，不给查看员补 estimate.view。无真实部署/角色修改，默认 Browser 与 D-093 本机限制保持。

## Q3A/Q3B1 Quote master/settings Server authority

Q3A/Q3B1 reuse the existing catalog without a new super-permission. Reads use endpoint-specific any-of authorization: Brands allow `quote.view|settings.brand.edit|settings.salesperson.edit`; CustomerSalespeople allow `quote.view|settings.salesperson.edit`; Fabrics allow `quote.view|settings.fabric.edit`; Trims allow `quote.view|settings.trim.edit|settings.brand.edit|settings.salesperson.edit`; supplier suggestions allow `quote.view|settings.fabric.edit|settings.trim.edit`; global settings/presets allow `quote.view|settings.global.edit`; resolved defaults remain `quote.view`. Mutations still require the exact owning settings-edit permission.

Historically, isolated Q3B1 candidate pages bound foundation permission controls to `ServerSession.hasPermission()` via `PermissionAuthorityProvider`; Browser roles could not authorize a Server mutation. In session mode, 401 invalidates the Server session; 403/network failures have no Browser fallback. After Q3B2I-C2, formal Basic/Global Settings routes use Server authority with no Browser Q3 fallback. D-093 local identity replaces the current login/Cookie requirement without removing Server permission checks or trusted actor boundaries.

## Q2B2B Server Quote create authority

`/quote-center/server-new` and runtime `POST /api/v1/quotes` require a trusted Server Session with `quote.create`; Browser PermissionProvider roles cannot grant this action. The POST body is `{}` only, so actor, `createdBy`, Quote ID and `quoteCode` cannot be supplied by the caller. The Server derives actor/createdBy from the trusted identity and commits the Quote plus one OperationLog atomically.

Opening the isolated page does not call POST. The explicit action is pending-disabled, 401 invalidates Server session, 403 remains explicit, and ambiguous network outcomes do not auto-retry or fall back to Browser. No new permission or role-name/superuser bypass was added. Production Browser Quote routes continue their existing mock permission behavior until a later separately authorized cutover.

## Q2B2A Server Quote writer authority

`/quote-center/server-edit` uses `ServerSession.hasPermission()` as the scoped authority for its own controls and foundation `Button permission=` / `PermissionGuard` decisions. The Browser PermissionProvider remains the default only outside that bounded scope and cannot grant Server Quote edit. Load requires trusted `quote.view`; save requires trusted `quote.edit`, while the Server Q2A diff enforcement still requires `quote.cost.edit`, `quote.settings.edit` and the existing workflow-specific permissions when those slices change. A 401 invalidates only the Server session without clearing in-memory dirty state; 403 remains fail closed. No Browser role mapping or super-permission was introduced.

This is not global single-login cutover. Production Browser Quote routes retain their current mock permission behavior, while the isolated writer shell exposes only the trusted Server identity and hides the Browser test-account selector.

## Q2B1 Server Quote read identity

`/quote-center/server-preview` and `/quote-center/server-detail` authorize only with the trusted Server Session and `quote.view`. They do not call Browser `usePermissions().can("quote.view")`, do not map Browser test users to Server users, and show only the Server session identity. Anonymous users receive the common Server login, a read-time 401 invalidates that session, and 403 remains an explicit permission-denied state with no Browser fallback.

The AppShell server identity mode hides Browser test-account switching plus Browser-permission-backed settings and global-search controls on these routes. This is a scoped UI convergence, not a global single-login production cutover: existing Browser Quote routes still use the mock PermissionProvider; Q2B2A extends Server authority only to its isolated writer workspace.

## Q2A Quote aggregate API enforcement

Q2A uses the existing catalog and trusted Server session. List/detail require `quote.view`; create requires `quote.create`; full aggregate replacement requires `quote.edit`. Because one replacement can contain independently protected operations, the Server compares before/after and additionally requires the existing `quote.cost.edit`, `quote.settings.edit`, `quote.revision.update`, `quote.price_version.create/delete`, `quote.confirm`, or `estimate.edit` permission when the corresponding slice changes. It does not infer authority from Browser roles, `createdBy/generatedBy`, request headers or body actor fields. DELETE is not exposed.

## C4.2 ConfirmedCommercialTerms enforcement

C4.2 reuses the existing catalog without adding a super-permission: Order terms GET/PATCH require `order.view`/`order.edit`; exact Quote-provenance terms GET/PATCH require `quote.view`/`quote.confirm`. Authorization uses the trusted Server session permission set, never a role-name bypass or Browser mock identity. PATCH also retains exact Origin and `X-Zhixu-Request: 1` mutation protection.

## Purpose

为 Quote Center 与基础设置提供可扩展的前端 RBAC 框架。第一阶段验证账号、角色、权限目录和 UI 权限反馈；它不替代未来服务端认证与授权。

历史 Phase 1 建立了可信 Server Session/RBAC foundation；这些关系和 API 在 session 兼容模式继续存在。当前本地开发模式以 D-093 的 `IdentityAuthority` 为身份来源，完整 PermissionKey 仍在 Server service 侧逐操作检查；下面的 mock 用户说明是早期 UI 模式，不是当前登录前置条件。

## Historical Browser mock/session behavior (not local single-user UX)

- 权限关系为 `User.roleId -> Role.permissions[]`，业务组件只判断权限键，不判断角色名称。
- 默认测试账号为管理员 `admin`、报价员 `quote.operator`、查看员 `viewer`。
- AppShell 顶部可切换启用的测试账号，侧栏和顶部显示当前姓名与角色。
- `/basic-settings/user-permissions` 显示用户列表、账号、角色、状态和角色权限详情。
- 管理员可以分配角色、调整用户状态和维护非管理员角色的权限；管理员角色固定拥有完整权限目录。
- 权限不足的业务按钮保持可见并置灰，悬停提示“暂无权限，请联系管理员”。
- Quote Editor 会同时保护基础信息、成本编辑、附件修改、报价设置、客户确认、版本更新和估算成本，不只禁用顶部按钮。
- 新订单中心消费 `order.view/create/edit/cancel`：列表/详情读取、手工/报价/翻单创建、订单编辑与确认、部分/全部取消分别受权限键保护；无权按钮继续可见并 disabled。
- 排单中心消费 `schedule.view/create/edit/complete`，关账中心分别消费 `closing.view/edit/confirm/lock/reopen`；订单编辑权限不会隐含这两类权限。确认、锁定与重开是不同动作，`closing.reopen` 只允许有原因地重开已锁定月份。
- 款式进度消费 `style_progress.read/edit/import/view_history`；查看、日期维护、真实 Excel 导入和来源/操作历史分别授权，不隐含订单创建或艾诺科冲突处理权限。
- 个人设置消费 self-scoped `ainuoke.account.bind_self`，只允许当前用户绑定、测试、更新或解除自己的艾诺科 credential。它与业务合同 `ainuoke.bind` 明确分离，不隐含同步或冲突处理。
- 艾诺科统一 Preview 只要求 `ainuoke.view`。统一确认不引入超级权限：合同有变化时要求 `ainuoke.sync`，物料有变化时要求 `style_progress.import`；只有一侧变化时不要求另一侧的写权限。缺少对应权限时 Preview 仍可查看，但确认 disabled 并显示缺失领域权限。
- `ainuoke.resolve_conflict` 同时保护用户显式清理已废弃的旧历史 schedule/closing 匹配 Review；该动作属于人工冲突 backlog 维护，不新增一次性权限。`ainuoke.view` 只能查看，不能执行删除。

## Data model

权威模型在 `features/permissions/model/permissions.ts`：

- `PermissionKey`：稳定权限键联合类型。
- `PermissionDefinition`：权限键、模块、名称和说明。
- `Role`：稳定 ID、名称、说明和 `PermissionKey[]`。
- `User`：稳定 ID、姓名、账号、`roleId` 和启停状态。
- `PermissionState`：schema 版本、当前测试用户、用户与角色集合。

权限模型没有写入 `Quote`、`QuoteRevision` 或 `PriceVersion`。

## Permission catalog

- 报价：`quote.view/create/edit/delete/export/confirm`
- 报价版本：`quote.revision.view/update/delete`
- 价格版本：`quote.price_version.create/delete`
- 报价成本：`quote.cost.view/edit`、`quote.settings.edit`
- 估算成本：`estimate.view/edit`
- 订单：`order.view/create/edit/cancel`
- 排单：`schedule.view/create/edit/complete`
- 关账：`closing.view/edit/confirm/lock/reopen`、`closing.target.manage`
- 基础设置：`settings.global/brand/salesperson/fabric/trim/template.edit`
- 生产基础资料：`settings.production_group.edit`、`settings.outsource_factory.edit`、`settings.production_infrastructure.edit`、`settings.closing.edit`
- 权限管理：`user_permissions.view/manage`
- 系统审计：`audit_log.view`
- 艾诺科同步：`ainuoke.view/sync/bind/resolve_conflict`
- 我的设置：`ainuoke.account.bind_self`
- 款式进度：`style_progress.read/edit/import/view_history`

`quote.revision.delete` 当前为未来能力预留；现有 Quote Center 尚无报价 Revision 删除 UI。

## Default roles

- 管理员：当前权限目录全部权限，包括订单、排单、关账、生产基础资料和全局操作日志；旧 localStorage 权限状态加载时会自动补齐管理员新增权限键。
- 报价员：查看/创建/编辑/导出/确认报价，查看和更新报价版本，创建价格版本，查看与编辑报价成本，修改单张报价设置，查看估算成本；不能删除报价、删除价格版本、编辑基础设置或管理用户权限。
- 查看员：查看报价、历史报价版本、报价成本并导出；不允许创建、编辑、删除、确认或修改估算成本。

订单、排单、关账、生产基础资料与个人艾诺科账号绑定权限只默认授予管理员；没有扩大报价员或查看员的既有权限。管理员可把 self-scoped capability 分配给需要绑定个人账号的角色，但这不会附带 `ainuoke.sync/bind/resolve_conflict`。

## Persistence and API

- mock repository：`features/permissions/repository/permission-repository.ts`
- 当前 localStorage：`zhixu.erp.local.permission-state`；旧 `zhixu.permission-state.v1` 仅作为非破坏迁移来源。
- Phase 1 server 新增 `app_roles`、`app_permissions`、`app_user_roles`、`app_role_permissions`，以及 `/api/v1/auth/me`、`/api/v1/auth/permissions`。`app_users` 是唯一 identity source，server 只按 permission key 授权。
- `PERMISSION_KEYS` / `PERMISSION_DEFINITIONS` 仍是 browser/server 共用的唯一纯 TypeScript 目录；server 幂等同步到 PostgreSQL，不维护复制列表。
- Ainuoke Local Bridge 的 HttpOnly session/CSRF 只保护本地请求上下文，不把前端 mock `currentUserId` 提升为真实认证；生产化时必须由可信 Zhixu session 确定用户身份。
- 根路径 ERP 的 PostgreSQL 用户/角色模型保持独立，未在本阶段迁移或修改。

## Frontend integration

- Provider 挂载在 `app/layout.tsx`。
- `Button` 支持可选 `permission` 属性并统一输出 disabled + tooltip。
- 复杂组件使用 `usePermissions().can(permission)` 控制只读状态和 mutation guard。
- 用户权限页面位于 `features/permissions/components/user-permission-page.tsx`。

## Important constraints

- 前端 disabled 不是安全边界；真实生产后端必须对每个 mutation/export API 重新鉴权。
- 不得通过角色名称硬编码授权。
- 新模块应先扩展权限目录和默认角色，再通过权限键接入。
- 不得把权限或当前用户信息写入报价快照。
- 不得与根路径 ERP 现有 PostgreSQL 账号模型静默合并。

## Tests

`tests/permissions.test.mjs` 覆盖默认账号、管理员全集、报价员限制、查看员只读、角色继承、角色集中更新和停用用户无权限；`tests/operations-infrastructure.test.mjs` 覆盖新增权限不扩张；`tests/order-center.test.mjs` 覆盖订单权限过滤、页面权限接线与取消权限守卫源码契约。

## Known gaps

- 当前是单浏览器 mock 登录/切换，不是真实身份认证。
- localStorage 可被客户端修改，不能用于生产安全控制。
- 已有 Phase 1 服务端 session、permission enforcement 和 OperationLog 基础；Q2A Quote aggregate mutation 已接入该 trusted boundary，Q2B1/Q2B2A 分别把隔离的 Quote shadow-read 与 existing-Quote writer UI 接入 trusted identity。Production Browser writer/global single-login 尚未 cutover。仍无 SSO、组织隔离、数据范围权限，Order 通用写入、Scheduling 等其他业务 mutation 也尚未接入。
- 现有报价 Revision 没有删除功能，因此该权限仅预留。
