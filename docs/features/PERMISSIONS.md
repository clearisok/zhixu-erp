# 权限系统

## Purpose

为 Quote Center 与基础设置提供可扩展的前端 RBAC 框架。第一阶段验证账号、角色、权限目录和 UI 权限反馈；它不替代未来服务端认证与授权。

## Current behavior

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
- 当前没有权限 API、服务端 session、密码验证或数据库表。
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
- 尚无服务端权限 enforcement、审计日志、密码/SSO、组织隔离和数据范围权限。
- 现有报价 Revision 没有删除功能，因此该权限仅预留。
