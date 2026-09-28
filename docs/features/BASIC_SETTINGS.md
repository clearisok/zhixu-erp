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
- Q3B2A 复用既有全量 `LocalDataBackup` 作为唯一 backup/export contract；不增加第二套 Browser exporter。只读 parser 按 artifact 的 `namespace` 精确取 `<namespace>.basic-settings` 与 `<namespace>.quote-global-settings`，支持 current、受支持的 legacy envelope 和 legacy unwrapped record；保留原 backup 中的 raw envelope/source schema/key/capture metadata，以 per-envelope SHA-256 证明来源。业务 `sourceHash` 只包含 namespace、精确 storage key、schema 与 source data，排除 capture/envelope timestamps，因而同一业务内容重复 preview 稳定。
- `npm run preview:quote-master-settings -- --backup <backup.json>` 是离线只读 runner：只读用户显式指定的标准 backup，输出结构化 JSON，不访问 Browser storage、HTTP API 或 PostgreSQL，也不写 report/file。它忽略其他 local records、附件、模板、Style Progress 与个人/UI preferences，并对选中的 master/settings payload 出现 credential/session/token 字段 fail closed。
- Q3B2A report 的 source/projected counts 包括五类实体及 Brand/Salesperson default trims；另给出最终 Server row totals、normalized Brand/Salesperson duplicates、所有 scoped stable-ID collisions、missing Brand/Trim references、dangling/inactive preset defaults、D-089 collapse、D-090 clear、legacy DefaultTrim quantity/usage discard、null/zero 与 exact decimal-string projection。Fabric/Trim 同名只产生保留信息，不合并也不阻断；Supplier 始终是 free string，projected Supplier master rows 固定为 0。warnings 与 blockingErrors 分离。
- Q3B2B 已对 capture `2026-09-22T03:16:14.008Z` 的标准 Browser backup 完成授权的只读 Preview：`development` / `http://127.0.0.1:3001` / `zhixu.erp.local`，backupVersion `1`，schemaVersion `13`，sourceHash `102b13d60b8bece83104bc5c516eb22c6c9b32bd4b540931fa9c49152339175c`；blockingErrors `0`，目标 Server rows `49`，Browser writes `0`，PostgreSQL reads/writes `0`，无 migrations/import。仓库不保存原 backup 或其本机路径。
- Q3B2C controlled import 直接消费上述 Preview projection。`rehearse:quote-master-settings` 要求精确 source hash，自行启动 tmpfs disposable PostgreSQL 16、应用正式 migrations 至 `0007`、检查七类 target tables 为空、在单 transaction 导入并从 PostgreSQL 读回逐字段内容。成功 rehearsal 为 Brand `4`、CustomerSalesperson `5`、Fabric `9`、Trim `18`、ManufacturingPreset `2`、Brand/Salesperson DefaultTrim 各 `5`、Global Settings `1`，共 `49` 行；投影与 read-back content hash 相同，稳定 ID/FK/decimal/null/zero 通过，故障回滚后七类表均空，重复 import 拒绝。runner 不接受外部数据库 URL，也不调用正常 HTTP/runtime create service。
- 目标 `DefaultTrimConfig` 只存 ID、owner、position、Trim reference 与 nullable overrides；Q3B2B 检出的 10 个 legacy quantity 和 0 个 usage 没有进入目标 schema 或其他字段。同名 Fabric/Trim 仍各自按稳定 ID 保留，Supplier 仅为自由字符串，不新建 Supplier master。D-089 的每作用域单个 nullable DefaultOtherCost 与 D-090 的 active/null preset 关系均通过；这份真实 backup 的 Global default preset 为 `null`，没有自动选择或推断预设。
- Q3B2B 的 `103` 个非空 canonical decimal 包括 Basic record 旧 `systemDefaults.usdCnyRate/markupRate` 两项；正式 Q3A Server system defaults 以独立 Global Quote Settings 为 authority，所以 49 行目标含 `101` 个非空 decimal、`8` 个 null、`20` 个显式 zero。真实 backup 中旧 Basic 两值与 Global 对应值不同；rehearsal 把差异单独记录，未来激活规划不得用旧副本覆盖 Global。migration audit policy 尚未确认，rehearsal 不伪造 runtime CRUD OperationLogs。
- Q3B2D 的真实 activation/import **规划**见 `QUOTE_MASTER_SETTINGS_ACTIVATION.md`。它确认 `db:migrate` 对所有 pending migrations 逐文件提交（若真实目标仍仅有 0001–0003，则涉及 0004–0007），真实 ledger 尚未现场核验；旧 backup 不自动成为最终 source。生产 Basic/Global Settings 与 Quote Editor 继续使用 Browser authority，因此真实导入前必须有 fresh source、全体 write freeze、DB backup/restore、生产 Server 集成与 authority switch，不能先导入再继续编辑 Browser。Q3B2D 没有真实 DB 连接、migration、import 或 production route cutover。

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

## Q3B2A source audit boundary

- Production Browser authority 仍由 `basic-settings-repository.ts` 的 stable `basic-settings` record 与 `quote-settings.ts` 的 stable `quote-global-settings` record 构成；默认 namespace 下实际 keys 为 `zhixu.erp.local.basic-settings` 与 `zhixu.erp.local.quote-global-settings`。两者均使用 local-data `{ schemaVersion, initializedAt, updatedAt, data }` envelope，当前 schemaVersion 为 13。
- Basic Settings 仍接受 `zhixu.basic-settings.v1.5` / `v1.3`，Global Quote Settings 仍接受 `zhixu.quote-center.global-settings.v1`；repository load 会 normalization、过滤或补默认，因此 migration preview 必须检查 backup 的原始 envelope data，不能先调用 runtime normalizer 而掩盖 duplicate/dangling/legacy evidence。
- Browser numeric business values是 JSON number 或 `null`；目标 Q3A NUMERIC boundary 是 canonical decimal string 或 `null`。preview 仅以 `String(number)` + canonical exponent expansion 做无舍入 projection，非法、负数或非 finite 值列入 blocker，显式 `0` 与 `null` 分别计数并保留。
- `0007_quote_master_settings.sql` 的 TEXT PK 明确允许未来受控 import 保留 Browser stable IDs；日常 candidate 新建仍由 Server 生成 UUID。DefaultTrim ID 的 collision 按 owner scope 判断；不同实体表之间相同文本 ID 不被误判为冲突。

## Known gaps

- Q3B1 已完成隔离 candidate UI/Quick Trim 接线，Q3B2B 的真实 backup 只读 Preview 与 Q3B2C 的 disposable PostgreSQL import rehearsal 已完成；Q3B2D 已记录未执行的 activation/import runbook。真实 0007 activation、真实 master/settings import、production cutover 与 Quote Editor master integration 仍未执行；下一次真实 DB read-only preflight 必须另获授权。
- Q4 attachment authority、Q5 data preview/import 与 Q6 production activation 仍是单独 gates。

- 浏览器 localStorage 不支持真实多用户并发和服务端唯一约束；当前权限系统也仅是前端 mock RBAC，不是服务端安全边界。
- 当前没有 Supplier 主数据。
- 与根路径 ERP 的客户/用户/供应商资料未整合。
- 真实后端落地时需要明确迁移旧 localStorage 数据还是仅以其为原型。
