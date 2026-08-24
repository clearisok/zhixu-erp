# 基础设置

## Purpose

基础设置维护 Quote Center 使用的品牌、客户业务员、面料库、辅料库以及默认报价资料。它建立主数据与 Quote Revision 快照之间的边界。

## Current behavior

基础设置路由：

- `/basic-settings/brands`
- `/basic-settings/customer-salespeople`
- `/basic-settings/fabrics`
- `/basic-settings/trims`
- `/basic-settings/templates`
- `/basic-settings/user-permissions`

四类主数据均有列表查询和维护 UI；品牌、客户业务员支持新增、编辑、删除，客户业务员还支持复制。物料库用于 Quote Center 搜索选择，也允许报价中自由输入。模板设置维护客户报价 Excel 的版本、默认模板和占位符字段。用户权限页面维护第一阶段 mock User / Role / Permission，详细规则见 `PERMISSIONS.md`。

## Business rules

- Brand 名称经 NFKC、trim、大小写归一化后唯一。
- CustomerSalesperson 姓名按相同规则全系统唯一。
- Brand 1:N CustomerSalesperson，客户业务员通过 `brandId` 归属品牌。
- 报价中客户业务员选项按已选品牌和启用状态过滤。
- 面料/辅料名称允许重复；同名不同供应商是有效记录，稳定 ID 才是身份。
- 供应商仍是自由字符串，建议从两个物料库的历史值去重生成。
- 默认汇率、默认其他费用优先级为 CustomerSalesperson > Brand > System。
- 默认辅料优先使用非空的客户业务员整套配置，否则使用品牌配置；不自动合并。
- DefaultTrimConfig 不含数量/用量。
- 默认辅料进入报价时形成新行快照，用量为 `null`；报价和 Library 此后互不污染。
- 删除辅料库项时清除引用它的默认辅料配置。
- 全局报价设置包含 `defaultLaborDescription` 字符串，默认“裁剪、车缝、整烫、质检包装”；新报价继承该值。

## Data model

权威模型位于 `features/basic-settings/model/basic-settings.ts`：

- `BrandRecord`：`id`、`name`、`status` 和默认报价配置。
- `CustomerSalespersonRecord`：`id`、`name`、`brandId`、`status` 和默认报价配置。
- `FabricLibraryItem`：名称、成分、净门幅、克重、默认损耗、供应商、单价、采购单位、时间戳。
- `TrimLibraryItem`：名称、规格、供应商、单位、默认损耗、单价、时间戳。
- `DefaultTrimConfig`：稳定配置 ID、`trimLibraryItemId`、可选覆盖损耗率和单价。
- `DefaultOtherCost`：有业务含义的 `name` 和可空 `amount`。
- `BasicSettingsState`：系统默认值和四类主数据集合。

面料库不保存段长、单耗、面料成本；辅料默认配置不保存本次报价用量。

## API and persistence

- 当前 repository：`features/basic-settings/repository/basic-settings-repository.ts`。
- 当前存储：`localStorage` key `zhixu.basic-settings.v1.5`。
- 兼容读取并归一化旧 key `zhixu.basic-settings.v1.3`。
- 没有真实 API、数据库表或服务端唯一约束。

## Frontend behavior

- 页面容器：`features/basic-settings/components/basic-settings-pages.tsx`。
- 路由页面只负责挂载相应设置页。
- Modal 表单使用 Foundation FormShell，支持安全的 Enter 提交规则。
- 供应商输入使用 Creatable Combobox，既提示历史值又允许自由输入。
- 报价选择 Library 项后复制字段，并用来源状态标记库快照、报价修改或手工输入。
- 默认资料应用和品牌/业务员切换保护在基础设置模型服务与 Quote Editor 协同实现。
- 全局工序说明使用普通 Textarea；同步当前默认 Revision 时保护已单独编辑的内容，历史 Revision 不变。
- 品牌、客户业务员、面料库、辅料库、模板和全局默认值的 mutation 按权限键控制；无权限操作保持可见 disabled。

## Important constraints

- 唯一性校验集中在模型/validation 函数，不散落到各组件。
- 不得给 Fabric/Trim 名称增加唯一约束。
- 不得把数量/用量存入 DefaultTrimConfig。
- 不得把品牌差异复制成重复 Library 物料；使用 override。
- 不得让 Library 后续修改影响已保存 Quote Revision。
- 暂不创建 Supplier 表或独立供应商主数据。

## Tests

主要测试：

- `tests/basic-settings-v15.test.mjs`
- `tests/material-libraries.test.mjs`
- Quote Center 中默认资料和成本快照相关测试

覆盖名称唯一性、重复物料名、品牌归属、默认优先级、override、快照隔离和个人列表偏好等规则。

## Known gaps

- 浏览器 localStorage 不支持真实多用户并发和服务端唯一约束；当前权限系统也仅是前端 mock RBAC，不是服务端安全边界。
- 当前没有 Supplier 主数据。
- 与根路径 ERP 的客户/用户/供应商资料未整合。
- 真实后端落地时需要明确迁移旧 localStorage 数据还是仅以其为原型。
