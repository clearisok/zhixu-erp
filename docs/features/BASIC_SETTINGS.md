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

生产组与外发厂虽然从 AppShell 的“基础设置”进入，但属于订单及未来排单/关账共用的独立 `operations-settings` 领域，不写入 `BasicSettingsState`；关账设置位于系统设置。详细边界见 `OPERATIONS_FOUNDATION.md`。

## Business rules

- Brand 名称经 NFKC、trim、大小写归一化后唯一。
- CustomerSalesperson 姓名按相同规则全系统唯一。
- Brand 1:N CustomerSalesperson，客户业务员通过 `brandId` 归属品牌。
- 报价中客户业务员选项按已选品牌和启用状态过滤。
- 面料/辅料名称允许重复；同名不同供应商是有效记录，稳定 ID 才是身份。
- 供应商仍是自由字符串，建议从两个物料库的历史值去重生成。
- 默认汇率、默认其他费用优先级为 CustomerSalesperson > Brand > System。
- System、Brand、CustomerSalesperson 每个作用域最多保存一个 nullable `DefaultOtherCost`；非空对象只包含 `name` 和 nullable `amount`。
- 默认其他费用应用到新 Quote 时复制为独立 `OtherCostLine` 快照；后续默认变化不得回写既有 Quote，单张 Quote 的其他费用明细仍允许 0..N 条。
- 旧版 0..N 全局费用仅作为迁移来源，兼容读取只投影首条 enabled 且 name 或 amount 有效的记录；历史 Quote 多条 `OtherCostLine` 不参与该收敛。
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
- `DefaultOtherCost`：每个 System / Brand / CustomerSalesperson 作用域最多一个 nullable 默认；非空对象只有业务 `name` 和可空 `amount`。
- `BasicSettingsState`：系统默认值和四类主数据集合。

面料库不保存段长、单耗、面料成本；辅料默认配置不保存本次报价用量。

## API and persistence

- 当前 repository：`features/basic-settings/repository/basic-settings-repository.ts`。
- 当前存储：稳定 localStorage `zhixu.erp.local.basic-settings`，`schemaVersion` 位于 envelope；`zhixu.basic-settings.v1.5` / `v1.3` 仅作为非破坏迁移来源。
- 兼容读取并归一化旧 key `zhixu.basic-settings.v1.3`。
- Q3A 已建立隔离的 Server authority foundation：migration `0007_quote_master_settings.sql`、`server/quote-masters/` typed model/repository/service/routes，以及 domain-specific `/api/v1/quote-masters/*`、`/api/v1/quote-settings/*` endpoints。它包含 normalized name constraints、NUMERIC/decimal-string、optimistic version、trusted RBAC/OperationLog 和 transaction rollback。
- Q3B1 在隔离 `/basic-settings/server/{brands,customer-salespeople,fabrics,trims}` 与 `/system-settings/server/quote-settings` 上复用同一套正式 UI 组件，通过 trusted Server session、scoped Server permissions、typed adapters、exact decimal projection、Server UUID 与 optimistic version 操作 Q3A authority。409 保留草稿并要求确认 reload；401 invalidate；403/network fail closed；Server candidate 不写 Browser repository/OperationLog、不访问附件，也没有 hard delete。
- Production `/basic-settings/*` 与 `/system-settings/quote-settings` 仍使用 Browser repository/localStorage。真实 0007 与 real master/settings import 均未执行，也没有 dual read/write。Global Settings candidate 的单 Save 使用 `/api/v1/quote-settings/bundle` 原子保存 settings + presets + trusted audit，新 preset ID 由 Server 生成。
- D-090 要求 Global Settings default 只能引用 active Manufacturing Preset。Standalone 停用当前 default 与 bundle 停用均由 Server 在同一 transaction 清空 default 并审计；显式选择 inactive preset 拒绝，重新启用不自动恢复 default。Candidate 默认下拉仅列 active presets，但 inactive preset 仍在管理列表中可编辑/重新启用。
- Q3B1 pure migration preview 只投影/校验 Browser Brand、CustomerSalesperson、Fabric、Trim、DefaultTrim、Global Settings、Manufacturing Preset 与 D-089 DefaultOtherCost；它报告重复/缺失引用/legacy quantity/invalid numeric/blocker，不读真实 backup 且数据库写入为 0。存在但 inactive 的 default preset reference 安全投影为 `null` 并单独 warning，missing reference 仍是 blocker。

## Frontend behavior

- 页面容器：`features/basic-settings/components/basic-settings-pages.tsx`。
- 路由页面只负责挂载相应设置页。
- Modal 表单使用 Foundation FormShell，支持安全的 Enter 提交规则。
- 供应商输入使用 Creatable Combobox，既提示历史值又允许自由输入。
- 报价选择 Library 项后复制字段，并用来源状态标记库快照、报价修改或手工输入。
- 默认资料应用和品牌/业务员切换保护在基础设置模型服务与 Quote Editor 协同实现。
- 全局工序说明使用普通 Textarea；同步当前默认 Revision 时保护已单独编辑的内容，历史 Revision 不变。
- 品牌、客户业务员、面料库、辅料库、模板和全局默认值的 mutation 按权限键控制；无权限操作保持可见 disabled。
- 品牌和客户业务员表单复用共享 Draft/Fields；默认配置默认折叠。固定辅料选择器引用正式 Trim Library，并允许在当前 Modal 内打开 Drawer 新建辅料后立即选用，上层未保存字段不会丢失。
- 新建报价中的 Quick Create 复用同一模型校验和 repository：品牌只要求名称，客户业务员固定归属当前品牌；保存失败时弹层保持打开并显示错误。

## Important constraints

- 唯一性校验集中在模型/validation 函数，不散落到各组件。
- 不得给 Fabric/Trim 名称增加唯一约束。
- 不得把数量/用量存入 DefaultTrimConfig。
- 不得把默认其他费用扩展成 0..N Server 设置，也不得用默认设置更新历史或既有 Quote 的 `OtherCostLine`。
- 不得让 inactive Manufacturing Preset 成为新 Quote default；停用/启用 preset 不得回写既有 QuoteRevision / PriceVersion 快照，重新启用也不得暗中恢复旧 default。
- 不得把品牌差异复制成重复 Library 物料；使用 override。
- 不得让 Library 后续修改影响已保存 Quote Revision。
- 暂不创建 Supplier 表或独立供应商主数据。

## Tests

主要测试：

- `server/integration/quote-master-settings.integration.test.ts`（Q3A disposable PostgreSQL schema/API/RBAC/audit/default-resolution foundation）
- `tests/basic-settings-v15.test.mjs`
- `tests/material-libraries.test.mjs`
- `tests/quick-master-data.test.mjs`
- Quote Center 中默认资料和成本快照相关测试

覆盖名称唯一性、重复物料名、品牌归属、默认优先级、override、快照隔离和个人列表偏好等规则。

## Known gaps

- Q3B1 已完成隔离 candidate UI/Quick Trim 接线；production cutover、真实 backup preview、master migration/reconciliation 与 Quote Editor master integration 仍未执行。下一 gate 是 Q3B2 real-backup preview/rehearsal。
- Q4 attachment authority、Q5 data preview/import 与 Q6 production activation 仍是单独 gates。

- 浏览器 localStorage 不支持真实多用户并发和服务端唯一约束；当前权限系统也仅是前端 mock RBAC，不是服务端安全边界。
- 当前没有 Supplier 主数据。
- 与根路径 ERP 的客户/用户/供应商资料未整合。
- 真实后端落地时需要明确迁移旧 localStorage 数据还是仅以其为原型。
