# 决策日志

状态说明：

- **Active**：当前实现仍遵守的决定。
- **Superseded**：已被新的实现或决定替代，仅保留背景。
- **Deprecated**：为兼容仍可能存在，但新代码不应继续依赖。

## Active

### D-028 ERP 全局搜索使用权限感知的 Provider 注册表

- 日期：2026-08-23
- 决定：全局搜索 UI 只负责 Command Palette、键盘选择和导航；各业务模块通过 `SearchProvider` 提供查询与结果投影，由 `SearchRegistry` 在查询前执行 Provider 权限判断。第一阶段 Quote Provider 复用 QuoteRepository，只返回列表级非成本字段；最近访问按 mock userId 隔离并再次经过 Provider 权限过滤。
- 原因：把报价查询硬编码在 Palette 会阻塞订单、排单、采购等模块扩展；在查询后才隐藏结果会产生权限信息泄露和不必要数据读取。
- 证据：`features/global-search/`、`components/foundation/app-shell.tsx`、`tests/global-search.test.mjs` 和 `docs/features/GLOBAL_SEARCH.md`。

### D-027 Quote Center 日志在保存事务后独立追加

- 日期：2026-08-23
- 决定：Quote Center 第一阶段 OperationLog 使用独立模型和 localStorage repository，不写入 Quote、QuoteRevision 或 PriceVersion。日志以 repository 保存成功为边界，对上次已保存快照与本次快照生成字段差异；repository 只暴露追加和按报价读取，时间线没有编辑/删除入口。
- 原因：输入过程不是已落地业务事实；把日志塞入 Revision 会污染报价快照并让日志与被审计对象互相嵌套。保存后差异既能记录成本前后值，也避免逐字符日志噪音。
- 证据：`features/operation-logs/`、`quote-editor.tsx`、`tests/operation-logs.test.mjs` 和 `docs/features/OPERATION_LOGS.md`。

### D-026 Quote Center 第一阶段权限使用可扩展前端 RBAC

- 日期：2026-08-23
- 决定：Quote Center 第一阶段建立独立的 `User -> Role -> PermissionKey[]` mock 权限模型。Foundation Button 统一接收权限键并保持无权限操作可见 disabled；复杂编辑区同时使用权限上下文进入只读状态。权限状态只存 localStorage，不写入报价快照，也不与根路径 ERP 的 PostgreSQL 账号体系静默合并。
- 原因：订单、排单、采购等未来模块需要稳定权限目录；把角色名称判断散落到页面会堵死扩展，也无法统一无权限反馈。
- 证据：`features/permissions/`、`components/foundation/button.tsx`、用户权限路由、Quote Center/基础设置接入和 `tests/permissions.test.mjs`。

### D-001 双报价路径暂时隔离

- 日期：2026-08-21 前已形成
- 决定：根路径 ERP 报价继续使用 PostgreSQL API；Quote Center 使用自己的领域模型和 mock repository，不连接旧 `/api/quotes`。
- 原因：两者的数据结构、Revision/PriceVersion 语义和计算口径不同。
- 证据：`app/page.tsx`、`database/001_schema.sql`、`features/quote-center/repository/`。

### D-002 本地生产运行使用静态应用 + PostgreSQL

- 日期：当前仓库基线
- 决定：本地 Docker 由 PostgreSQL 容器保存业务数据，Shell 静态服务器将 `/api/*` 交给 `api_dispatch`。
- 证据：`Dockerfile`、`docker-compose.yml`、根目录 `docker-entrypoint-app.sh`、`docker-serve.sh`。

### D-003 Quote Revision 是完整快照

- 日期：2026-08-21 前已形成
- 决定：Revision 保存某次完整报价状态；PriceVersion 是 Revision 内的并列价格口径。新 Revision 深复制并清除客户确认，历史 Revision 只读。
- 证据：`features/quote-center/model/quote-view-model.ts`、Revision 管理和测试。

### D-004 默认 Revision 使用稳定 ID 指针

- 日期：2026-08-21 前已形成
- 决定：`defaultRevisionId` 是当前默认 Revision 的权威指针；读取旧数据时才兼容 `currentRevisionId`。
- 证据：Quote view model 和 revision helper。

### D-005 Quote Center 统一使用 markupRate

- 日期：2026-08-21 前已形成
- 决定：Quote Center 报价加成使用 `cost × (1 + markupRate / 100)`；不复用旧 ERP 的毛利率除法公式。
- 证据：Quote Center calculation 和测试。

### D-006 默认辅料引用库，报价使用快照

- 日期：2026-08-21 前已形成
- 决定：品牌/客户业务员默认辅料保存库 ID 和长期 override；应用到报价时生成带新 row ID 的独立成本行，用量保持空。
- 证据：`features/basic-settings/` 默认资料服务和测试。

### D-007 基础资料与 Quote Revision 解耦

- 日期：2026-08-21 前已形成
- 决定：品牌、客户业务员、面料库和辅料库不放入 Revision；Revision 只保留使用时的报价快照。
- 证据：基础设置模型、Quote view model 和快照测试。

### D-008 列表偏好按用户隔离

- 日期：2026-08-21 前已形成
- 决定：Quote Center 可见列配置带 `userId`，当前 mock 用户也不得写成系统唯一全局列配置。
- 证据：Quote list preferences repository 和测试。

### D-009 全局费用允许多条并保护覆盖

- 日期：2026-08-21 前已形成
- 决定：全局费用为 0..N 条，通过稳定设置 ID 同步到当前默认 Revision；用户覆盖过的行不被静默覆盖。
- 证据：global cost model/service 和测试。

### D-010 表单提交优先使用 HTML form 语义

- 日期：2026-08-21 前已形成
- 决定：局部 Modal/Form 由 Foundation FormShell 统一 Enter 提交和防重复规则；整页报价不因普通 Enter 保存。
- 证据：`components/foundation/form-shell.tsx`、`form-enter.ts` 及测试。

### D-011 详情页使用 query id 兼容静态导出

- 日期：2026-08-21 前已形成
- 决定：报价详情路由为 `/quote-center/detail?id=...`，与当前静态导出方式兼容。
- 证据：`app/quote-center/detail/page.tsx` 和 Quote Center 导航代码。

### D-012 附件二进制与 Revision 引用分离

- 日期：2026-08-21
- 决定：QuoteRevision 保存图片/文件附件 ID 快照和款式图 ID；纯前端阶段由 AttachmentRepository 的 IndexedDB 实现保存 metadata 与 Blob，不将大文件写入 localStorage/sessionStorage。
- 原因：Revision 需要复制引用而不是复制文件，历史版本必须保持可下载，同时为未来 Object Storage/API repository 留出替换边界。
- 证据：`model/quote-attachments.ts`、`repository/attachment-repository.ts`、`repository/indexeddb-attachment-repository.ts` 和附件测试。

### D-013 正式报价以模板驱动的按需 Excel 导出

- 日期：2026-08-22
- 决定：Quote Center 的正式 Excel 导出以 `templates/quote-export-template-v1.xlsx` 为唯一版式基准；用稳定标签解析模板并动态扩展五个成本区域。一个 Revision 生成一个 Workbook，一个 PriceVersion 生成一个 Sheet。ExcelJS 只在用户打开导出流程后动态加载，导出数值来自现有 Quote Center 计算函数和快照，不新增 Excel 公式口径。
- 原因：保持正式模板外观、历史快照和应用内计算一致，同时避免 Excel 库进入报价页首屏依赖。
- 证据：`features/quote-center/export/`、`quote-export-modal.tsx`、`tests/quote-excel-export.test.mjs` 和导出验收工作簿。

### D-014 批量图片先确认再写入附件仓库

- 日期：2026-08-22
- 决定：剪贴板或拖放加入的多张图片先保存在 Modal 的临时待添加列表中；用户确认后才通过 AttachmentRepository 批量写入。批次中途失败时补偿删除本批已写入项，已有款式图绝不被自动覆盖。
- 原因：避免粘贴/拖放瞬间产生不可见持久化和半批次状态，同时保留 Revision 附件引用与底层 Blob 分离的既有边界。
- 证据：`attachment-panel.tsx`、`quote-attachment-upload.ts`、`quote-attachments.ts` 和 `tests/quote-attachments.test.mjs`。

### D-015 Excel 工价双列复用系统人民币计算结果

- 日期：2026-08-22
- 决定：CNY 工价只写 RMB/件；USD 工价同时写系统计算得到的 RMB/件与原始 USD/件。导出映射层读取现有计算结果，导出器不自行执行汇率换算。
- 原因：确保 Excel 与 Quote Center 页面只有一套工价换算口径，并保持空值与显式 0 的区别。
- 证据：`quote-export-mappers.ts`、`quote-excel-exporter.ts` 和 `tests/quote-excel-export.test.mjs`。

### D-016 导出模板使用版本化 Definition + IndexedDB Blob

- 日期：2026-08-22
- 决定：模板 metadata 使用通用 `TemplateDefinition`，用户 xlsx Blob 由 `TemplateRepository` 存入 IndexedDB；现有正式报价模板继续作为内置默认和读取失败 fallback。
- 证据：`features/template-settings/`、模板设置路由与测试。

### D-017 客户报价模板硬隔离内部 EstimateCost

- 日期：2026-08-22
- 决定：客户模板验证拒绝 `estimate.*`；Customer Quote Export 输入模型不包含 EstimateCost，现有“实际成本”列也保持空白。
- 证据：template validation、quote placeholder exporter、模板/估算测试。

### D-018 EstimateCost 是 Quote 级独立快照

- 日期：2026-08-22
- 决定：Quote 同时最多一个 active EstimateCost，并可保留多个历史；它由用户从指定 QuoteRevision 主动生成，不属于 Revision 或 PriceVersion。重新生成归档，恢复通过 Clone。
- 证据：`model/estimate-cost.ts`、`estimate-cost-panel.tsx` 和测试。

### D-019 批量汇总复用 QuoteList 单一列定义

- 日期：2026-08-22
- 决定：Quote Center UI 与内部汇总 Excel 共用 `quote-list-column-definitions.ts`；每款模式使用 aggregate/range，每 PriceVersion 模式读取版本自身。
- 证据：quote list、batch exporter 和批量导出测试。

### D-020 报价详情只保留一个 Sticky 状态源

- 日期：2026-08-22
- 决定：报价摘要、操作按钮、快速导航由一个 sentinel、一个 IntersectionObserver 状态和一个 sticky container 同步控制；普通快速导航不再独立 sticky。
- 证据：quote editor、quick navigation、Quote Center CSS 和导航测试。

### D-021 DEV 与 PROD Docker 使用明确的版本边界

- 日期：2026-08-22
- 决定：DEV 固定为 `127.0.0.1:3001`，直接运行当前源码并支持 HMR；PROD Docker 固定为 `127.0.0.1:3000`，只有显式 rebuild 才更新。Docker 必须在 builder 阶段从当前 build context 构建源码，不能复制宿主旧 `dist`。两套环境都自动生成并暴露 Build Info；HTML/Build Info 不长期缓存，hash 资源可 immutable 缓存。
- 原因：消除“源码已更新但浏览器仍显示旧 production 容器”的判断歧义，并让运行实例版本可以直接核验。
- 证据：`vite.config.ts`、`Dockerfile`、`docker-compose.yml`、`docker-serve.sh`、`scripts/dev.ps1`、两个 rebuild 脚本与 `tests/local-runtime-observability.test.mjs`。

### D-023 全局设备模式由 viewport 与交互能力共同决定

- 日期：2026-08-23
- 决定：全局 Navigation Mode 不再使用纯 width 判定。True Mobile 必须同时满足 viewport `<768px`、`pointer: coarse`、`hover: none`；细指针且可 hover 的窗口在 `<1440px` 时进入 Compact Desktop，包括 650–900px 的笔记本半屏。触摸设备 768–1023px 使用 Tablet。AppShell 将共享 helper 结果写入 `data-responsive-mode`，Bottom Navigation 只在 React 判定为 Mobile 时渲染。Quote Center 的搜索、类型、状态在全部模式保持单行 6:2:2，不再提供筛选 Sheet。
- 原因：ERP 的窗口宽度不能代表设备类型；Windows/Mac 半屏仍需完整导航、表格和报价操作。
- 证据：`components/foundation/responsive.ts`、`components/foundation/app-shell.tsx`、`app/globals.css`、`app/quote-center/responsive.css`、`features/quote-center/components/quote-list.tsx`、`tests/responsive-mobile-batch1.test.mjs`。

### D-025 报价明细成本区增加 Desktop Compact 两行栅格

- 日期：2026-08-23
- 决定：报价明细成本 renderer 使用 `>=1200px` Full、`700–1199px` Desktop Compact、`<700px` Narrow 的视口边界，Card Container Query 继续作为嵌入式回退。Desktop Compact 复用现有完整编辑卡：面料按 `3 + 6`、辅料按 `3 + 4`、其他费用按 `2 + 4` 分成两行并填满可用宽度；Narrow 回落单列。True Mobile 仍由 D-023 决定并保留面辅料轻量摘要。所有 renderer 继续共享 ViewModel、稳定 row ID、回调和计算函数。
- 原因：半屏窗口的成本 Card 会因 Sidebar 和页面 padding 低于原容器阈值；仅依赖 Card 宽度会让约 700px 的细指针桌面窗口过早进入窄布局。显式视口边界可以保证半屏仍保留高密度完整编辑，同时不改变全局设备识别。
- 证据：`features/quote-center/components/cost-table.tsx`、`features/quote-center/components/quote-editor.tsx`、`app/quote-center/quote-center.css`、`app/quote-center/responsive.css`、`tests/cost-responsive-batch1-2.test.mjs`。

### D-026 quoteCode 保留但退出常规业务展示

- 日期：2026-08-24
- 决定：`Quote.quoteCode` 继续作为内部识别、搜索、日志、调试和导出 fallback 字段；详情标题、Sticky 摘要、搜索/最近访问和移动报价卡不主动展示。报价编号列表列保留为个人可配置字段，新用户默认隐藏。
- 证据：Quote Editor、Quote List、Quote Search Provider、quote settings 和 `tests/batch4-1.test.mjs`。

### D-027 基础设置与系统设置按资料性质分组

- 日期：2026-08-24
- 决定：基础设置只承载品牌、客户业务员、面料库和辅料库；系统设置承载报价设置、模板设置、用户权限和操作日志。模板/权限旧路由保留 bookmark 兼容，但导航归属为系统设置。
- 证据：`components/foundation/app-shell.tsx` 与系统设置路由。

### D-028 Sidebar 只有中间导航滚动且隐藏 scrollbar

- 日期：2026-08-24
- 决定：Desktop/Compact Sidebar 的 Brand/Organization 与 User Footer 固定，Navigation 独立滚动；Firefox `scrollbar-width:none` 与 WebKit scrollbar 隐藏仅影响视觉，不取消滚轮、触控板和 touch scroll。展开子菜单不得改变 Sidebar/Main 宽度。
- 证据：AppShell、`app/globals.css` 和 Batch 4.1 测试。

### D-029 全局 Audit Log 复用统一 OperationLog 数据源

- 日期：2026-08-24
- 决定：报价 Timeline 和系统全局 Dense Table 使用同一个 append-only OperationLog repository；全局读取只增加 `list()`，不提供 edit/delete。非报价系统动作允许 `quoteId=null`，由 module/entity 标识。
- 证据：`features/operation-logs/`、系统操作日志路由和权限 `audit_log.view`。

### D-030 全局搜索打开统一并由 query 驱动详情重载

- 日期：2026-08-24
- 决定：搜索结果、最近访问、鼠标点击和 Enter 统一经过 `openSearchResult`；打开前重新检查 Provider 权限。Quote Detail Loader 订阅 query `id` 并以 `Quote.id` 作为 Editor key，确保同路由导航和 Browser Back 都重载正确报价。
- 证据：Global Search Palette、Quote Detail Loader 和 Batch 4.1 测试。

## Superseded

### D-S04 成本 renderer 只由 Card 容器宽度决定

- 原状态：D-024 使用 `>=1150px` 宽表、`700–1149px` 紧凑卡、`<700px` 窄卡的纯 Container Query。
- 替代：D-025 为报价明细增加 1200/700 视口边界，Container Query 降为嵌入式回退。
- 处理：保留 renderer 共享状态、焦点交接和无横向滚动约束，替换会让半屏过早进入窄布局的选择规则。

### D-S03 仅用四级 width 断点决定 Mobile

- 原状态：D-022 使用 `<768px => Mobile`，并让 Quote Center Mobile 筛选进入 Bottom Sheet。
- 替代：D-023 使用 viewport + hover/pointer 共同决定全局模式，筛选始终直接显示为 6:2:2。
- 处理：保留四级布局名称和手机轻编辑能力，但纯 width 的全局设备判断与筛选 Sheet 已废止。

### D-S01 “项目尚无 Foundation”审计结论

- 原状态：`docs/ui-audit.md` 在 2026-08-17 记录了当时缺少 Foundation 的现状。
- 替代：当前已存在 `components/foundation/` 并被 Quote Center/基础设置使用。
- 处理：保留原文作为历史审计，不再用于判断当前实现。

### D-S02 Quote Center 迁移计划作为现状依据

- 原状态：`docs/quote-ui-migration-plan.md` 描述计划中的结构和步骤。
- 替代：当前代码、测试以及 `docs/features/QUOTE_CENTER.md` 是现状依据。
- 处理：迁移计划继续作为设计背景，未实现条目不能视为当前承诺。

## Deprecated

### D-D01 `currentRevisionId` 作为当前版本指针

- 状态：只为旧存储数据兼容保留。
- 新代码：写入和读取应优先使用 `defaultRevisionId`。

### D-D02 历史浏览器存储版本

- 状态：基础设置 repository 可读取旧版本 key 并迁移，但新数据写入当前 key。
- 约束：不要以旧 key 的结构扩展新功能；保留兼容读取直到有明确数据迁移/清理决定。
