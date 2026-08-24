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
- 基础设置：`settings.global/brand/salesperson/fabric/trim/template.edit`
- 权限管理：`user_permissions.view/manage`
- 系统审计：`audit_log.view`

`quote.revision.delete` 当前为未来能力预留；现有 Quote Center 尚无报价 Revision 删除 UI。

## Default roles

- 管理员：当前权限目录全部权限，包括全局操作日志；旧 localStorage 权限状态加载时会自动补齐管理员新增权限键。
- 报价员：查看/创建/编辑/导出/确认报价，查看和更新报价版本，创建价格版本，查看与编辑报价成本，修改单张报价设置，查看估算成本；不能删除报价、删除价格版本、编辑基础设置或管理用户权限。
- 查看员：查看报价、历史报价版本、报价成本并导出；不允许创建、编辑、删除、确认或修改估算成本。

## Persistence and API

- mock repository：`features/permissions/repository/permission-repository.ts`
- localStorage key：`zhixu.permission-state.v1`
- 当前没有权限 API、服务端 session、密码验证或数据库表。
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

`tests/permissions.test.mjs` 覆盖默认账号、管理员全集、报价员限制、查看员只读、角色继承、角色集中更新和停用用户无权限。

## Known gaps

- 当前是单浏览器 mock 登录/切换，不是真实身份认证。
- localStorage 可被客户端修改，不能用于生产安全控制。
- 尚无服务端权限 enforcement、审计日志、密码/SSO、组织隔离和数据范围权限。
- 现有报价 Revision 没有删除功能，因此该权限仅预留。
