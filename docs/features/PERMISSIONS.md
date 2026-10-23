# 当前 Server 管理规则（D-146，2026-10-19）

角色配置以数据库为权威；旧D-104固定预设漂移拒绝规则已替代。GET/POST /api/v1/team-roles仅服务器管理员可用；创建、复制、编辑、归档不覆盖旧身份。角色修改有版本检查、请求回执、事务审计、会话撤销；使用中的角色禁止删除。权限目录仍动态计算，金额权限不附赠。

/system-settings/roles沿用左右分栏；正式Server进度页不再切换隔离导航。密码统一至少6字符/最多72 UTF-8字节，无组合要求、不trim。0031为新增迁移，仅一次性数据库验证。

用户管理已独立到 /system-settings/users（旧路径兼容），支持分页筛选、单角色分配、归档/恢复及会话撤销。0032仅前向增加归档、登录时间和恢复后重置标记；历史多角色在无明确改角色时保留。恢复先停用、选有效角色并重置密码；账号永不复用，审计身份不删除。管理回执只保存非秘密命令指纹，密码不参与指纹和审计；未知提交可按请求编号核对，不能自动重发。登录时间不参与用户资料版本，避免登录导致编辑冲突。日志业务化已在 #123 实现，2026-10-20 Gate2 固定组合已接入并通过定向浏览器验收；均未合并或正式部署。以下各日期章节保留历史背景，冲突处以D-146和当前代码为准。完整范围见[任务](../tasks/active/system-settings-administration-2026-10-19.md)。

2026-10-15 D134本地工程候选完成：0024团队进度设置、管理员/物控写及七角色共享读、CAS/actor幂等/审计，已合成PG和25项实际浏览器验证；未真实迁移或改账号。权限目录现66项，默认Server snapshot设置页关闭，生产/关账不扩大；[完整证据](../tasks/active/evidence/material-source-integration/material-display-results-2026-10-15.md)。

# 权限系统

## 首批团队 Server 账号管理（D-104，2026-10-12）

可信session的GET/POST /api/v1/team-access与既有用户权限页现已实现；下方旧章节“尚未实施”只描述当时工程状态，由本节更新。精确角色、API并发/秘密保护及合成验收见[任务证据](../tasks/active/ningbo-first-team-access.md)。
六预设：系统管理员全部现有权限；管理者/财务金额只读及导出审计；报价经理报价/主资料写入；物控基础只读无织序金额；生产基础只读+工价查看。所有角色预授已授权Ainuoke来源读取；**Source及Order/Material生产路由仍未激活**，普通经理无sync/import/排产/关账写入。
管理接口有可信权限重检、CSRF、CAS、自锁/最后管理员保护、会话撤销和无秘密审计；预设仅显式管理写入安装，已有权限漂移拒绝覆盖。持久化复用既有表，无SQL/migration，不修改真实角色。
Server UI保留MasterDetail/Modal/CSS，仅接建号/预设/停用/重置；默认Browser保持原实现，无Browser回退。密码仅在弹窗内存，未知写结果不自动重试。预设可取并集，组合可展示，UI选择一个预设替换全部角色；不开放逐key修改。
首次管理员仍由既有受控bootstrap建立，本任务只在临时合成DB调用。未部署、未人工验收。

## Server 商业金额（D-103，2026-10-11）

用户最终确认并实施：详情/卡片“测算销售单价”、摘要/构成“成衣销售价格/最终报价”均须可信 Session 的 commercial.sale.view；cost.view 单独只授内部成本。仅 sale.view 不授内部成本；列表 garmentPrice 保留 cost.view + sale.view。无权不向子组件/隐藏 DOM 传实际展示金额，显示“无权查看”。保留授权成本输入和公式，不声称阻止用户自行推算。此前待确认口径已由本次决定收口，历史证据不删除。加工报价旧 confirmation.save 仍为完整快照（含 quotedGarmentPrice），要求两套商业 view+edit；linked CCT PATCH 的工价单字段修改只需对应工价权限，实际 HTTP 已验证。见[定向验收](../tasks/active/commercial-amount-read-security.md)。

用户已批准并实施四键 commercial.sale.view/edit、commercial.labor.view/edit。Server `role-server-admin` 目录同步幂等升级，新 bootstrap 管理员具备四项；非管理员角色无隐式新增。只检查可信权限集合，不依赖前端名称。正式角色管理 UI/API 仍未实现；本轮不开放生产授权路由，不用 Browser mock 替代，真实角色未操作。

两个 CCT GET/PATCH 保留 quote.view / order.view；修改另需 quote.confirm / order.edit。实际提交销售价需 sale.view+edit，提交工价/币种需 labor.view+edit，未提交从事务锁定的数据库值保留。显式 null/零分别保留其语义，旧全量客户端提交隐藏字段（含 null）403，不静默清空。响应使用 `commercial-terms-read.v1`，每项 allowed/value 或 restricted；metadata 与共享 identity/version 保持。

Quote 有内部成本查看权但无商业权限时，仍返回内部成本及独立 Estimate；历史 confirmation 的销售价/确认工价分别省略，带 commercialVisibility。普通保存恢复这些缺失字段，注入拒绝，CAS/历史不可变不弱化。现有 cost-restricted metadata-only 保存继续保护全部成本。

列表与内部汇总的 garmentPrice/confirmedGarment 另需 sale.view、confirmedLabor 另需 labor.view（原成本权限仍保留）。estimateDifference 是销售价减估算成本，要求 cost.view + estimate.view + sale.view；普通 estimateTotal 仍不额外要求商业权限。Server 在读来源/构建/审计前拒绝越权请求。客户 Excel/ZIP 同时需要两项商业查看权限，否则生成前拒绝。日志响应过滤保护金额及已知派生销售字段，DB 原始审计保留。CCT 客户端拒绝旧完整响应协议，隐藏金额不进入客户端适配对象；Order 仅调整金额协议和权限状态，不重排已验收页面。

## Quote aggregate 成本读取安全边界（2026-10-11）

实际 Server aggregate 的所有响应在序列化前检查既有 `quote.cost.view`。无权身份仍可 quote.view 读取基础资料及数量，响应明确 `costVisibility: restricted`，不返回任何 Revision/PV 成本、参数、历史确认金额或派生字段；Estimate 完整数值同时要求 quote.cost.view 与 estimate.view。不能用 null/0/空数组冒充隐藏数据。

metadata-only PUT 先校验版本再恢复当前数据库保护切片，不清空成本/Estimate/历史；成本注入、伪造 visibility/身份和移除行失败，成本写入/参数/确认/版本原权限保持。受限客户端只消费基础资料，不挂成本计算器/完整 Editor；有权用户原 Editor 保留。no-store 及身份/权限 cache scope 防止旧完整响应串用户。

Quote/Estimate 操作日志响应按同一成本权限裁剪，保护事件在计数/分页前排除；DB 审计仍完整。采购执行来源价格团队共享不受此规则影响。此前 CCT SECURITY PENDING 是授权前历史，现按上方 D-103 实施；实际验证与交付状态见[安全证据](../tasks/active/commercial-amount-read-security.md)。

## Desktop two-step Quote creation（2026-10-10）

- `creation-options`、`creation-preview`、`creation-workflows`、本人`creation-receipts`均要求可信IdentityAuthority + `quote.create`；Session最终事务再次检查用户active及数据库权限/撤权。本机显式local-single-user沿用Authority有效授权，不要求技术actor具有角色关联，仍锁定校验active/public ID；模式仅来自Server Authority配置，客户端username/role/header/body不能切换模式。options只返回active品牌/同品牌业务员/预设的最小ID/name/country，候选有界且支持搜索，不返回受保护数值。
- preview参数数值仅向`quote.cost.view`或`quote.settings.edit`提供；其余只见本次创建的配置来源/待完善状态。override需要`quote.settings.edit`，不扩大默认角色。预设新增/编辑仍由独立设置页的`settings.global.edit`控制。
- 创建/回执只返回最小Quote/Revision/PV ID和version，不返回完整Estimate等内容；完整详情另需`quote.view`及原字段权限。未拥有`quote.view`的create-only身份可创建但不能借回执读取整单。receipt actor-bound，不泄露另一用户的创建结果。
- 旧POST{}、普通保存、版本、Estimate、客户确认、附件权限边界不变；本轮没有Intake权限键或已有类型切换接口。来源、事务/测试见 [两步创建证据](../tasks/active/quote-two-step-creation.md)。

## Server list / internal summary field boundary (2026-10-09)

D-099 protected list `/thumbnail` uses the existing session/quote.view and exact available Quote/Revision/Attachment relation on every request, even after an earlier successful image read. It returns only reduced JPEG bytes, not storage identity or a public URL. No cache bypass, new permission or role change; original attachment writes/downloads remain unchanged.

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
