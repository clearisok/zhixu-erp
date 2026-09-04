# ERP UI Redesign Delivery

本文只记录已经真实实施、检查和验收的交付事实。Delivery Phase 1 与 Delivery Phase 2 已完成；订单详情、生产排单、权限、OperationLog、生产与运输等后续业务页面仍未正式重构，不应把本页理解为后续阶段已完成。

## Delivery Phase 1 — UI Foundation

结论：**PASS**。

Phase 1 建立业务无关 UI Foundation，并用“基础设置 / 品牌设置”作为低风险代表页验证。实现过程中没有修改业务领域模型、Repository、Storage Schema、Migration、成本公式或正式业务数据。

### A. Phase 1 实际文件

新增：

- `app/foundation.css`
- `components/foundation/description-list.tsx`
- `components/foundation/form-section.tsx`
- `components/foundation/mobile-sheet.tsx`
- `components/foundation/overlay.ts`
- `components/foundation/save-bar.tsx`
- `components/foundation/states.tsx`
- `components/foundation/toolbar.tsx`
- `components/foundation/workspace.tsx`
- `tests/ui-foundation-phase1.test.mjs`
- `docs/ui-redesign/README.md`
- `docs/ui-redesign/screenshots/phase1-*.png`

修改：

- `app/layout.tsx`
- `components/foundation/app-shell.tsx`
- `components/foundation/button.tsx`
- `components/foundation/data-table.tsx`
- `components/foundation/drawer.tsx`（Phase 1 开始前为未跟踪文件，本阶段在其上完成共享 Overlay 重构）
- `components/foundation/form-item.tsx`
- `components/foundation/index.ts`
- `components/foundation/modal.tsx`
- `components/foundation/page.tsx`
- `components/foundation/responsive.ts`
- `components/foundation/status-tag.tsx`
- `features/basic-settings/components/basic-settings-pages.tsx`
- `tests/batch4-1.test.mjs`
- `tests/quick-master-data.test.mjs`（Phase 1 开始前为未跟踪文件，本阶段只更新合法契约）
- `tests/quote-v12.test.mjs`
- `tests/responsive-mobile-batch1.test.mjs`
- `tests/sidebar-floating-menu.test.mjs`

以上不代表当前工作树的全部 dirty files。工作树在 Phase 1 开始前已经包含大量业务功能、文档、测试、截图和 `artifacts/` 变更；本阶段未重置、清理或认领它们。

### B. Foundation Components

新增：

- `Toolbar`、`SearchField`：查询、筛选、结果摘要、视图动作与移动筛选 Sheet。
- `MobileSheet`：Portal、独立内部滚动、底部操作区与 Safe Area。
- `DescriptionList`：对象详情的标签 / 值结构。
- `FormSection`、`ReadOnlyField`：表单分区与只读信息。
- `SaveBar`：页面级保存状态与动作。
- `EmptyState`、`LoadingState`、`ErrorState`、`Alert`：统一状态反馈。
- `Workspace`、`SectionNavigation`、`ContextSummary`、`MasterDetail`：列表、对象和主从工作区骨架。
- `overlay.ts`：Modal、Drawer、Sheet 共用的 Overlay 栈、ESC、Tab 焦点环、初始焦点、焦点恢复和 Body Scroll Lock。

重构 / 扩展：

- `AppShell`：五档 Responsive Mode、Compact Rail / Flyout、Touch Navigation Drawer。
- `PageHeader`：数量、返回、状态、主次动作、更多动作、Sticky 与列表 / 对象语义。
- `DataTable`：列宽、最小宽度、左右 Sticky、数值对齐、响应式优先级、移动记录投影、键盘激活和三类状态。
- `Modal`、`Drawer`：统一 Portal 和 Overlay 生命周期。
- `Button`、`FormItem`、`StatusTag`：层级、尺寸、错误态与可访问性。

保留复用：

- `Card`、`FormShell`、`Select`、`SearchableSelect` / Combobox、`Toast`、Nullable 输入、Radio 与表格宽度偏好继续作为已有 Foundation 能力使用。

### C. Responsive Behavior

| Mode | 内容失效边界 / 判定 | AppShell 行为 |
| --- | --- | --- |
| Wide Desktop | `>=1440px` | 186px 完整 Sidebar，完整 ERP 工作区 |
| Primary Desktop | `1100–1439px` | 186px 完整 Sidebar；1280px 保持 Desktop，不降为 Tablet |
| Compact Desktop | `600–1099px` 且 fine pointer / hover | 78px Rail，Portal Flyout，保留桌面业务能力 |
| Tablet | `600–1099px` 且 coarse pointer / no-hover | 隐藏 Sidebar / Rail，移动式 Header 与完整 Navigation Drawer |
| Mobile | `<600px`，不受 pointer / hover 影响 | Sidebar = 0、Rail = 0、Mobile Header、完整 Navigation Drawer |

保留 `TABLET_WIDTH` / `COMPACT_WIDTH` deprecated aliases，只为避免既有 API 突然中断；新的正式语义以 `MOBILE_WIDTH=600`、`PRIMARY_WIDTH=1100`、`WIDE_WIDTH=1440` 为准。

402px 与 440px 均在浏览器默认 fine pointer 环境中实测进入 `mobile`，没有重新出现 78px Rail。当前未能用浏览器能力真实模拟 coarse pointer / Touch Tablet，因此 Tablet 仅完成代码与自动化契约检查；真实 Touch 设备验收仍待后续执行，不能升级为真机通过。

### D. Scroll Architecture

- `AppShell`：固定 `100dvh`，自身 `overflow: hidden`。
- `ops-workspace`：普通页面唯一主要纵向滚动容器。
- `PageContainer` / `Workspace`：负责布局，不再建立第二个主纵向滚动层。
- `DataTable`：`.qc-table-wrap` 只承担局部横向滚动，`overflow-y: hidden`；表格高度由内容决定。
- `Drawer` / `Modal` / `MobileSheet`：作为独立 Overlay，Body 锁定后仅 Overlay Body 纵向滚动。
- `MobileSheet`：内容区滚动，底部操作区 `flex: 0 0 auto`，Safe Area padding 保持可达。

结论：**满足普通页面默认只有一个主要纵向滚动容器**。浏览器实测 402px 页面只有 `ops-workspace` 发生主纵向滚动；960 / 1280 / 1600 的 DataGrid 只存在必要的局部横向滚动。

### E. DataGrid Foundation

已实现并验证：

- Sticky Header。
- 左右固定列与偏移计算。
- `width` / `minWidth` 和既有 table width preference 兼容。
- 数值右对齐与 `tabular-nums`。
- `null` / `undefined` 显示 `—`，明确的 `0` 保留。
- Hover、Selected、键盘激活和 `aria-selected`。
- Loading、Empty、Error / Retry。
- 响应式优先级与移动 Record List 投影。

品牌设置实测表头为 Sticky，品牌列 `left: 0`、操作列 `right: 0`，数值列右对齐；空辅料显示 `—`，`0 人` 保持为零值。Loading / Error 等不通过伪造 DEV 错误状态验收，由 377 项自动化测试与组件契约覆盖。

### F. Overlay

Modal / Dialog、Drawer、Mobile Sheet 已统一支持：

- `document.body` Portal。
- `role="dialog"`、`aria-modal` 与标题 / 描述关联。
- 初始焦点、Tab / Shift+Tab 焦点环。
- ESC、Backdrop 关闭。
- 关闭后焦点恢复到触发按钮。
- Overlay 栈与嵌套 Body Scroll Lock 引用计数。
- Overlay Body 独立滚动。
- Mobile Sheet / 移动 Overlay 的 `100dvh`、`svh` 与 Safe Area padding。

浏览器实测：Dialog Shift+Tab 从关闭按钮环回“保存品牌”；Drawer 环回末项“数据管理”；ESC 和 Backdrop 均关闭且恢复触发按钮焦点；打开时 Body 为 `overflow: hidden`。

### G. 代表页面与业务回归边界

正式 Foundation 代表页：

- 基础设置 / 品牌设置：扩展 PageHeader、Toolbar、状态筛选、DataTable、移动 Record List、品牌 Dialog。
- 同一共享基础资料 Toolbar 也覆盖客户业务员、面料库与辅料库的查询摘要；未把这些页面声明为正式重构完成。

只读 Foundation Regression Check：

- 报价中心列表、报价详情。
- 订单中心列表、订单详情。
- 生产排单。
- OperationLog。

上述业务页面只验证 AppShell / Foundation 未造成崩坏、整页横向溢出或控制台错误；没有做 Phase 2 页面重构。

### H. 业务规则保护

本阶段继续遵守：**一个订单对应一个款式**。

未修改 QuoteRevision、PriceVersion、`defaultRevisionId`、Calculator、成本公式、精度、USD 工价换算、最终报价、客户确认、EstimateCost、Order 数量 / 价格历史、三类状态、Schedule 规则、RBAC、OperationLog 业务语义、AttachmentRepository、Backup / Restore 或 Legacy PostgreSQL。未修改 Order Repository、Storage Schema、Migration 与订单持久化结构。

### I. DEV 数据保护

- 无 Reset。
- 无 Seed 覆盖。
- 无 Quote / Order / 其他业务数据删除。
- 无 `localStorage` / IndexedDB 清理。
- 无 storage namespace 或 IndexedDB DB name 修改。
- 无用户列宽偏好清理。
- Dialog、Drawer、Sheet 只执行打开、关闭、键盘和视口验证；没有提交表单。
- 本轮临时 DEV 服务已经关闭，临时日志写在系统 Temp 并已移除，项目内未新增 Phase 1 DEV 日志。

### J. 质量门禁

| Check | Result | 证据 |
| --- | --- | --- |
| TypeScript | PASS | `npm.cmd run typecheck`，0 error |
| ESLint | PASS | `npm.cmd run lint`，0 error |
| Full Tests | PASS | `npm.cmd test`，377 pass / 0 fail / 0 skipped |
| Production Build | PASS | `npm.cmd run build`，23 routes prerendered；仅有既存 `>500 kB` chunk warning |
| `git diff --check`（Phase 1 / source） | PASS | Phase 1 tracked diff、Phase 1 新文件尾空格检查、排除既有 vendored `node_modules` 后的 source diff 均通过 |
| 其他正式命令 | PASS / N/A | `package.json` 无其他只读质量脚本；`db:generate` 会生成迁移且与 UI Foundation 无关，未运行 |

完整 dirty worktree 的原始 `git diff --check` 仍返回 2，唯一实际错误来自 Phase 1 前已存在的：

- `artifacts/artifact-tool-qa/node_modules/@oai/artifact-tool/dist/artifact_tool.mjs:186`
- 同文件 `:204`、`:530`、`:584`

均为 trailing whitespace。该 vendored artifact 不影响 Phase 1 构建、测试或浏览器验收，本阶段按“保留并区分既有 dirty worktree”要求没有擅自修改。

### K. 浏览器验收

DEV：`http://127.0.0.1:3001`。所有操作均为读取、导航、调整 viewport、打开 / 关闭 Overlay。

| 页面 / 场景 | Viewport | Pointer Mode | Result | 发现问题 | 修复 |
| --- | ---: | --- | --- | --- | --- |
| 品牌设置 / Wide | 1600×1000 | 浏览器默认 fine | PASS | 无页面级横向溢出 | — |
| 品牌设置 / Primary | 1280×900 | 浏览器默认 fine | PASS | 表格 `overflow-y` 计算值曾为 `auto` | 收紧为 `hidden` 并复验 |
| 品牌设置 / Compact | 960×900 | 浏览器默认 fine | PASS | 无 | Rail + Portal Flyout 可达 |
| 品牌设置 / Mobile | 402×874 | 浏览器默认 fine / hover | PASS | 无 | Sidebar / Rail = 0；记录卡正常 |
| 品牌设置 / Mobile | 440×956 | 浏览器默认 fine / hover | PASS | 无 | Sidebar / Rail = 0；无整页横向溢出 |
| Navigation Drawer | 402×874 | 浏览器默认 fine | PASS | 无 | 独立滚动、ESC / Backdrop / Focus Restore 正常 |
| 品牌 Dialog | 1280×900 | 浏览器默认 fine | PASS | 无 | Footer、焦点环、ESC / Backdrop、Scroll Lock 正常 |
| 状态筛选 Mobile Sheet | 402×874 | 浏览器默认 fine | PASS | 无 | Safe Area、内部滚动、底部操作区、Scroll Lock 正常 |
| 报价中心 / 详情 | 1280×900 | 浏览器默认 fine | PASS | 既有页面仍需后续正式重构 | 仅回归，无 Phase 2 改动 |
| 订单中心 / 详情 | 1280×900 | 浏览器默认 fine | PASS | 既有宽表压力仍存在 | 仅回归，无 Phase 2 改动 |
| 生产排单 | 1280×900 | 浏览器默认 fine | PASS | 既有布局问题留待后续 | 仅回归 |
| OperationLog | 1280×900 | 浏览器默认 fine | PASS | 长列表仍依赖主 Workspace 滚动 | 仅回归 |
| Touch Tablet | 600–1099 | coarse / touch 未能真实模拟 | LIMITED | 浏览器只提供 CSS viewport，不能伪造真 Touch | 代码 / 测试通过；待真实设备验收 |

浏览器回归页控制台均无 error。

### L. Phase 1 前后差异

中断前的旧 Foundation 以固定桌面侧栏、分散 Overlay、页面自建表格 / Toolbar 和多处滚动责任为主，`<600px` 还可能受 pointer 条件影响而保留桌面 Rail。

Phase 1 完成后：

- 响应式由设备名硬编码转为 Wide / Primary / Compact / Tablet / Mobile 内容失效模式。
- `<600px` 无条件为 Mobile AppShell。
- Modal、Drawer、MobileSheet 共享 Overlay 生命周期。
- 普通页面统一由 `ops-workspace` 承担主纵向滚动。
- 业务表格获得可复用列、状态、可访问性与移动投影能力。
- 品牌设置提供真实低风险代表实现，但核心业务页保持未迁移状态。

### M. 遗留问题

- 订单中心、报价详情 / 成本、订单详情、生产排单、权限、OperationLog、生产与运输仍需各自后续 Delivery Phase 正式重构。
- `AppShell` 仍同时持有应用路由配置、权限、全局搜索和通用壳层组合，后续可在不改行为的前提下进一步分离通用 Shell 与业务导航配置。
- Production Build 存在 `>500 kB` chunk warning，后续可按页面边界做代码分割；不影响 Phase 1 PASS。
- 真实 Windows Display Scaling / Chrome Zoom、Touch Tablet、iPhone Safari Safe Area / Dynamic Island / 键盘等仍需实机验收。
- Phase 1 前 dirty worktree 的 vendored artifact 尾空格仍存在，未擅自清理。

## Phase 1 截图

| 场景 | 截图 |
| --- | --- |
| Wide 1600 | [phase1-brands-wide-1600.png](screenshots/phase1-brands-wide-1600.png) |
| Primary 1280 | [phase1-brands-primary-1280.png](screenshots/phase1-brands-primary-1280.png) |
| Compact 960 | [phase1-brands-compact-960.png](screenshots/phase1-brands-compact-960.png) |
| Compact Navigation Flyout | [phase1-compact-navigation-flyout-960.png](screenshots/phase1-compact-navigation-flyout-960.png) |
| Mobile 402 | [phase1-brands-mobile-402.png](screenshots/phase1-brands-mobile-402.png) |
| Mobile 440 | [phase1-brands-mobile-440.png](screenshots/phase1-brands-mobile-440.png) |
| Navigation Drawer | [phase1-navigation-drawer-402.png](screenshots/phase1-navigation-drawer-402.png) |
| Brand Dialog | [phase1-brand-dialog-1280.png](screenshots/phase1-brand-dialog-1280.png) |
| Filter Mobile Sheet | [phase1-filter-mobile-sheet-402.png](screenshots/phase1-filter-mobile-sheet-402.png) |

## Phase Gate

**Delivery Phase 1：PASS**

Phase 1 实现、质量门禁、Wide / 1280 / Compact / 402 / 440、Overlay、单一主纵向滚动、业务回归、文档与截图均已完成。此处保留 Phase 1 当时的 Gate 事实；后续 Phase 2 交付记录如下。

## Delivery Phase 2 — P0-A：订单中心 + 报价详情

结论：**PASS**。

本阶段只正式重构订单中心列表与报价详情 Workspace。继续遵守“一张订单对应一个款式”，没有迁移领域模型、Repository、Storage Schema、Migration 或正式业务数据；Phase 1 Foundation 继续作为唯一共享组件体系。

### A. 订单中心

- Header 复用 `PageHeader`，只保留一个主“新增订单”入口；Toolbar 继续使用现有订单号、款号、客户、PO 搜索及真实状态 / 类型筛选。
- 默认扫描列收敛为款号 / 款式、订单号、客户 / PO、有效数量、最近 / 最终交期、执行状态、操作。
- 订单状态、生产状态、关账状态在同一紧凑区域内三行独立表达；异常继续来自既有 Projection / Service，并在状态区外单独突出。
- Wide 使用完整 DataTable；1280 对核心列做 Primary Desktop 约束后，全部核心判断同屏且 DataTable 无横向滚动。
- 960 / 768 使用 Compact Business Row；402 / 440 使用真实 Mobile Order Card，Desktop Table 隐藏。
- 继续使用原 `order-center` module、`order-center.order-list` table key 与 storage namespace；未重置或清理用户列宽偏好。Wide 继续尊重偏好，Primary 只在内容失效宽度内约束核心列比例。

### B. 报价详情 Workspace

- Header 以款号 / 款式为主识别，品牌、客户业务员、报价类型、状态和 Quote ID 作为 Metadata；保存、导出、More 继续来自既有真实 Action。
- 保留并整合原 Sticky Header、价格指标、Section Navigation 与自适应 ActionBar。
- `QuoteRevision` 明确标为“报价版本 · 历史快照”；`PriceVersion` 明确标为“当前价格方案”，并以可切换方案卡、数量、制作口径、最终报价和确认状态构成一级工作上下文。
- 实测切换素色 / 彩条时，数量、制作口径、面辅料快照、工价、其他费用、最终报价与客户确认归属同步切换，没有上下文错位。
- 客户确认、附件、图片 / 文件入口、报价历史、Revision Manager 与现有 AttachmentRepository 路径保持不变。

### C. 报价成本响应式策略

| Viewport | 信息展示 | 可编辑字段 | 只读字段 | Drawer | 横向滚动 |
| --- | --- | --- | --- | --- | --- |
| Wide 1600 | 面料完整宽表；名称、成分、段长、门幅、克重、损耗、供应商、单价、采购单位、单耗、成本同屏 | 当前业务允许的原有字段 | 单耗、成本 | 非主路径 | 无 |
| Primary 1280 | 与 Wide 相同的完整字段同屏；紧凑 padding / 单位表头 | 当前业务允许的原有字段 | 单耗、成本 | 非主路径 | 仅 4px scrollbar gutter，无实际频繁横滚 |
| Compact 960 / 768 | Compact Cost Card；完整判断信息保留 | 面料名称、损耗率、单价 | 成分、供应商、段长、门幅、克重、采购单位、单耗、成本 | “完整资料”编辑当前报价快照 | 无 |
| Mobile 402 / 440 | 纵向 Cost Card；完整显示规格、价格、单耗和成本 | 主卡无横向 Input | 全部摘要字段 | 全屏 Drawer 查看 / 编辑现有允许字段 | Cost Renderer 无横向滚动 |

完整面料 Drawer 明确说明“当前报价价格方案快照”，继续复用原 `onChange`、面料选择与采购单位回调；不会修改面料库主数据，也没有建立第二套数据通道。

### D. Scroll、Overlay 与 Mobile

- 订单中心和报价详情继续只有 `ops-workspace` 一个主要纵向滚动容器。
- DataTable 只承担必要局部横向行为；Drawer / Modal 作为独立 Overlay。
- 402 / 440 报价首屏可见款号、品牌 / 客户业务员、报价类型、当前 PriceVersion 与最终报价。
- Mobile Header 的“更多”曾因 flex 压缩覆盖“保存草稿”，已收紧按钮 / `details` 宽度并在 402、440 复验通过。
- 当前均为浏览器模拟 CSS viewport；iPhone Safari Safe Area、Dynamic Island、软件键盘和真 Touch 仍待真机验收。

### E. 浏览器验收

| 页面 | Viewport | Result | Horizontal Behavior | 主要结果 |
| --- | ---: | --- | --- | --- |
| 订单中心 | 1600×1000 | PASS | DataTable 无横滚 | 完整扫描表 |
| 订单中心 | 1280×900 | PASS | DataTable 无横滚 | 核心列与三种状态同屏 |
| 订单中心 | 960×900 / 768×900 | PASS | 页面无横滚 | Compact Business Row |
| 订单中心 | 402×874 / 440×956 | PASS | 页面无横滚 | Mobile Order Card |
| 报价详情 | 1600×1000 | PASS | 成本表无横滚 | Wide Workspace |
| 报价详情 | 1280×900 | PASS | 成本表仅 4px gutter | 完整面料字段同屏 |
| 报价详情 | 960×900 / 768×900 | PASS | Compact Renderer 无横滚 | 只读规格 + 高频编辑 |
| 报价详情 | 402×874 / 440×956 | PASS | Mobile Cost Renderer 无横滚 | Cost Card + 全屏 Drawer |

订单验收使用长期 DEV `http://127.0.0.1:3001`。该 Origin 当前报价中心为 0 条，为避免 Seed、创建或污染长期数据，报价详情只读矩阵使用临时隔离 Origin `http://localhost:3002` 的仓库 fixture；未点击保存、确认、删除、上传或其他提交动作。

### F. 业务与数据保护

未修改 QuoteRevision、PriceVersion、`defaultRevisionId`、Calculator、成本公式、单耗精度、USD 工价折 RMB、最终报价截断、客户确认、EstimateCost、订单数量 / 价格历史、订单 / 生产 / 关账状态、RBAC、OperationLog、AttachmentRepository、Backup / Restore 或 Legacy PostgreSQL。

本阶段无 Reset、无 Seed 覆盖、无 Quote / Order 删除、无 `localStorage` / IndexedDB 清理、无 namespace / schemaVersion 修改、无用户偏好清理。浏览器只执行导航、视口、方案切换与 Overlay 打开 / 关闭。

### G. 质量门禁

| Check | Result | 证据 |
| --- | --- | --- |
| TypeScript | PASS | `npm.cmd run typecheck`，0 error |
| ESLint | PASS | `npm.cmd run lint`，0 error |
| Full Tests | PASS | `npm.cmd test`，377 pass / 0 fail / 0 skipped |
| Production Build | PASS | `npm.cmd run build`，23 routes prerendered；仅既有 `>500 kB` chunk warning |
| Browser Console | PASS | 订单、报价及回归页无 error / warn |
| `git diff --check`（Phase 2 / source） | PASS | Phase 2 source / README 无 whitespace error；完整工作树仍只有既有 vendored artifact 尾空格 |

### H. Regression 与未实施范围

订单详情、报价中心、新建报价、生产排单、OperationLog、品牌设置均已快速打开，未发现 Phase 2 引入的崩坏、document 横向溢出或控制台错误。以上页面未在本阶段正式重构。

后续仍未实施：订单详情、生产排单、用户权限、OperationLog、生产与运输及基础资料其他页面；这些属于 Delivery Phase 3 或更后阶段，本阶段没有自动进入。

### I. Phase 2 截图

| 场景 | 截图 |
| --- | --- |
| Order Wide 1600 | [phase2-order-wide.png](screenshots/phase2-order-wide.png) |
| Order Primary 1280 | [phase2-order-1280.png](screenshots/phase2-order-1280.png) |
| Order Compact 960 | [phase2-order-compact.png](screenshots/phase2-order-compact.png) |
| Order Compact 768 | [phase2-order-compact-768.png](screenshots/phase2-order-compact-768.png) |
| Order Mobile 402 | [phase2-order-mobile-402.png](screenshots/phase2-order-mobile-402.png) |
| Order Mobile 440 | [phase2-order-mobile-440.png](screenshots/phase2-order-mobile-440.png) |
| Quote Wide 1600 | [phase2-quote-detail-wide.png](screenshots/phase2-quote-detail-wide.png) |
| Quote Primary 1280 | [phase2-quote-detail-1280.png](screenshots/phase2-quote-detail-1280.png) |
| Quote Compact 960 | [phase2-quote-detail-compact.png](screenshots/phase2-quote-detail-compact.png) |
| Quote Compact 768 | [phase2-quote-detail-compact-768.png](screenshots/phase2-quote-detail-compact-768.png) |
| Quote Mobile 402 | [phase2-quote-detail-mobile-402.png](screenshots/phase2-quote-detail-mobile-402.png) |
| Quote Mobile 440 | [phase2-quote-detail-mobile-440.png](screenshots/phase2-quote-detail-mobile-440.png) |
| Quote Cost 1280 | [phase2-quote-cost-1280.png](screenshots/phase2-quote-cost-1280.png) |
| Quote Cost Compact | [phase2-quote-cost-compact.png](screenshots/phase2-quote-cost-compact.png) |
| Quote Cost Mobile | [phase2-quote-cost-mobile-402.png](screenshots/phase2-quote-cost-mobile-402.png) |
| PriceVersion Context | [phase2-quote-price-version-context.png](screenshots/phase2-quote-price-version-context.png) |
| Mobile Fabric Snapshot Drawer | [phase2-quote-fabric-drawer-mobile-402.png](screenshots/phase2-quote-fabric-drawer-mobile-402.png) |

## Phase 2 Gate

**Delivery Phase 2：PASS**

订单中心、报价详情、1280 成本专项、Compact / Mobile 任务布局、PriceVersion 上下文、业务回归、质量门禁、浏览器矩阵、截图与文档均已完成。任务在此停止，未进入 Delivery Phase 3。

## Delivery Phase 2.5 — DEV / QA 仿真业务数据集

长期 DEV 已安装 `ui-redesign-qa-v1`，固定 seed 为 `zhixu-ui-redesign-2026`。数据集包含 72 个 Quote、168 个 Order、15 个柬埔寨生产组、150 个 ScheduleAssignment、3 个 QA 关账月和 90 条关账关系；生产组为 1–13、15、16，每组 8–12 个排单订单，未创建 QA 14 组。

该数据集只服务 UI Redesign 的高密度 DEV / QA 验收，不是 Production 数据。生成器采用显式、确定性、幂等的 append / ensure 策略，通过现有 Service / Repository 写入，不挂入应用启动或构建流程，不覆盖已有数据。原有非 QA `2026-08` 关账月保持不变；上线前必须依据 manifest 另行制定引用安全的清理方案。

- 详细说明：[qa-dataset.md](qa-dataset.md)
- 实际 ID manifest：`artifacts/ui-redesign-qa/manifest.json`
- 命令：`npm.cmd run qa:data:prepare` / `npm.cmd run qa:data:cleanup`

Phase 2.5 仅准备与验证数据，没有实施 Delivery Phase 3 的订单详情或生产排单 UI 重构。

**Delivery Phase 2.5：PASS**

## Delivery Phase 3 — 订单详情 + 生产排单

结论：**PASS**。

本阶段只正式重构订单详情与生产排单。继续遵守“一个订单对应一个款式”，复用 Phase 1 Foundation 与 Phase 2 / 2.5 已有业务事实和 QA 数据；没有实施用户权限、OperationLog、生产与运输、基础资料其他页面等 Phase 4 以后范围。

### A. 订单详情 Cockpit

- 使用共享 `Workspace`、对象型 `PageHeader`、`SectionNavigation`、`ContextSummary`、`DescriptionList`、`Drawer` 与 `SaveBar`，款号继续作为第一识别信息，订单号保持只读元数据。
- 首屏 Cockpit 同屏表达款式 / 订单、客户 / PO、有效数量、客户交期、订单 / 生产 / 关账三种独立状态和下一步；正式异常 / 提醒位于状态之外。
- 页面按概览、商务资料、数量与交期、生产执行、物料 / 物流、价格 / 关账、附件、操作记录形成连续业务区，Sticky Section Navigation 与单一 `ops-workspace` 主纵向滚动保持有效。
- 数量历史和价格历史改为只读 Drawer；记录包含前后值、原因、时间、操作人和次级技术引用，当前价格版本明确标记。多条 `DeliveryPlan` 仍直接属于同一单款订单。
- 返回订单中心保留查询上下文；订单进入排单中心继续携带 `orderId` 并定位对应生产组。Dirty Guard 提供继续编辑、不保存并返回、保存并返回三种决策。
- 1280 下核心客户交期使用紧凑数字字号确保完整显示；402 / 440 下对象 Header 使用两行网格，返回、身份与操作不重叠。

### B. 生产排单 Master–Detail

- Wide / Primary 使用生产组 Master–Detail，总览按数字组号稳定排序，显示当前款、总计、当前、待产、完成、队尾和组级异常；QA 组为 1–13、15、16，明确没有 QA 14 组，既有非 QA“一组”继续兼容。
- 单组队列从旧宽表收敛为 7 个业务列：顺序、款号 / 订单、数量、生产窗口、队列状态、异常 / 物流、操作。12 款队列可清楚识别已完成、当前、下一款和待生产。
- Compact 隐藏左侧组总览并使用原生生产组选择器；960 / 768 保留紧凑 7 列队列且无页面横向溢出。402 / 440 将每个队列行投影为纵向业务记录，首屏保持组摘要、顺序、款号 / 订单、数量、生产窗口和状态。
- 正式排期异常与物流晚到严格分开：5 组 / 9 组均显示 2 条组级正式异常；5 组代表验收中只有 2 行标记正式异常，7 行单独标记物流警示。
- 未排订单池实际显示 20 张待处理订单，并继续区分完全未排与部分排单；没有为了 UI 修改 Projection 或计算规则。
- “结束生产”弹窗先显示当前款号 / 订单、生产组、当前状态、计划量 / 已完成量，再提供仅记录与应用建议动作；危险动作使用 danger 层级。浏览器验收只打开并取消，未提交。

### C. 响应式与滚动验收

| 页面 | Viewport | Result | Horizontal Behavior | 主要结果 |
| --- | ---: | --- | --- | --- |
| 订单详情 | 1600×1000 | PASS | 页面无横向溢出 | 完整 Cockpit 与连续 Workspace |
| 订单详情 | 1280×900 | PASS | 页面无横向溢出 | 核心交期完整可读，三种状态独立 |
| 订单详情 | 960×900 / 768×900 | PASS | 页面无横向溢出 | Cockpit 重排，业务区单列 / 双列自适应 |
| 订单详情 | 402×874 / 440×956 | PASS | 仅 Section Navigation 必要的局部横向导航 | Header 不重叠，核心事实首屏可见 |
| 生产排单 | 1600×1000 | PASS | 队列无横向滚动 | 完整 Master–Detail |
| 生产排单 | 1280×900 | PASS | 7 列队列无横向滚动 | 组总览与 12 款队列可直接扫描 |
| 生产排单 | 960×900 / 768×900 | PASS | 页面及队列无横向溢出 | 生产组选择器 + 紧凑队列 |
| 生产排单 | 402×874 / 440×956 | PASS | 页面无横向溢出 | 队列行为纵向业务记录 |

两个页面均只有 `ops-workspace` 一个主纵向滚动容器；Overlay 自己滚动，排单队列不建立第二个纵向主滚动。以上为浏览器 CSS viewport 验收，不升级为真实 Windows 缩放或真机 Safari / Touch 通过。

### D. 业务与 DEV 数据保护

未修改 SalesOrder、DeliveryPlan、OrderQuantityHistory、OrderPriceVersion、ScheduleAssignment、生产日历、物流推荐、关账投影、Repository、Storage Schema、Migration、RBAC、OperationLog、AttachmentRepository、Backup / Restore 或 Legacy PostgreSQL 规则。

无 Reset、无 Seed 覆盖、无 Quote / Order 删除、无 `localStorage` / IndexedDB 清理、无 namespace / schemaVersion 修改、无用户偏好清理。Dirty Guard 验收只输入临时本地值，随后通过“不保存并返回”放弃并复核原值；“结束生产”只打开 / 取消。

### E. 质量门禁与回归

| Check | Result | 证据 |
| --- | --- | --- |
| TypeScript | PASS | `npm.cmd run typecheck`，0 error |
| ESLint | PASS | `npm.cmd run lint`，0 error |
| Phase 3 Tests | PASS | `tests/ui-redesign-phase3.test.mjs`，5 pass |
| Full Tests | PASS | `npm.cmd test`，387 pass / 0 fail / 0 skipped |
| Production Build | PASS | `npm.cmd run build`，23 routes prerendered；仅保留既有 `>500 kB` chunk warning |
| Browser Console | PASS | 矩阵与回归页面 0 error / 0 warn |
| `git diff --check`（Phase 3 source） | PASS | Phase 3 source、测试、README 与截图引用无 whitespace error |

订单详情、报价中心、新建报价、生产排单、OperationLog、品牌设置与关账中心均完成快速回归，页面可打开、无 document 横向溢出、控制台无 error / warn。旧 `batch56-ux` 的 `ps-group-overview` / `ps-group-nav` 契约通过兼容 class 保留，新布局仍以 `ps-group-master` 为主。

完整工作树原始 `git diff --check` 仍仅命中 Phase 3 开始前已有的 vendored artifact 尾空格：`artifacts/artifact-tool-qa/node_modules/@oai/artifact-tool/dist/artifact_tool.mjs` 的 186、204、530、584 行；本阶段未修改该文件。

### F. Phase 3 截图

| 场景 | 截图 |
| --- | --- |
| Order Detail Wide 1600 | [phase3-order-detail-wide-1600.png](screenshots/phase3-order-detail-wide-1600.png) |
| Order Detail Primary 1280 | [phase3-order-detail-primary-1280.png](screenshots/phase3-order-detail-primary-1280.png) |
| Order Detail Compact 960 | [phase3-order-detail-compact-960.png](screenshots/phase3-order-detail-compact-960.png) |
| Order Detail Mobile 402 | [phase3-order-detail-mobile-402.png](screenshots/phase3-order-detail-mobile-402.png) |
| Order Detail Mobile 440 | [phase3-order-detail-mobile-440.png](screenshots/phase3-order-detail-mobile-440.png) |
| Quantity History Drawer | [phase3-order-detail-history-drawer-1280.png](screenshots/phase3-order-detail-history-drawer-1280.png) |
| Price History Drawer | [phase3-order-detail-price-history-1280.png](screenshots/phase3-order-detail-price-history-1280.png) |
| Multi DeliveryPlan | [phase3-order-detail-multi-delivery-plan-1280.png](screenshots/phase3-order-detail-multi-delivery-plan-1280.png) |
| Scheduling Wide 1600 | [phase3-scheduling-wide-1600.png](screenshots/phase3-scheduling-wide-1600.png) |
| Scheduling Primary 1280 | [phase3-scheduling-primary-1280.png](screenshots/phase3-scheduling-primary-1280.png) |
| Scheduling Compact 960 | [phase3-scheduling-compact-960.png](screenshots/phase3-scheduling-compact-960.png) |
| Scheduling Compact 768 | [phase3-scheduling-compact-768.png](screenshots/phase3-scheduling-compact-768.png) |
| Scheduling Mobile 402 | [phase3-scheduling-mobile-402.png](screenshots/phase3-scheduling-mobile-402.png) |
| Scheduling Mobile 440 | [phase3-scheduling-mobile-440.png](screenshots/phase3-scheduling-mobile-440.png) |
| 15 QA Group Master + Legacy Group | [phase3-scheduling-15-group-master-1600.png](screenshots/phase3-scheduling-15-group-master-1600.png) |
| 12-item Queue | [phase3-scheduling-queue-12-items-1280.png](screenshots/phase3-scheduling-queue-12-items-1280.png) |
| Exception Group 5 | [phase3-scheduling-exception-group5-1280.png](screenshots/phase3-scheduling-exception-group5-1280.png) |
| Unscheduled Pool | [phase3-scheduling-unscheduled-pool-1280.png](screenshots/phase3-scheduling-unscheduled-pool-1280.png) |
| End Production Dialog | [phase3-scheduling-end-production-dialog-1280.png](screenshots/phase3-scheduling-end-production-dialog-1280.png) |

### G. 后续范围

用户权限、OperationLog 正式重构、生产与运输关系工作区、基础资料其余页面、真实 Windows Display Scaling / Chrome Zoom、Touch Tablet 与 iPhone Safari 真机验收继续留在 Delivery Phase 4 或更后阶段。本阶段不自动进入 Phase 4。

## Phase 3 Gate

**Delivery Phase 3：PASS**

## Delivery Phase 4 — 报价中心 + 新建报价 + 新建订单

结论：**PASS**。

本阶段只正式完成报价中心、新建报价和新建订单。报价详情、订单详情与生产排单仅做回归；用户权限、OperationLog、生产与运输、报价设置、模板设置仍属于后续阶段。本阶段继续使用长期 DEV `ui-redesign-qa-v1` 数据集，没有 Reset、Re-seed、清理浏览器存储或创建正式 Quote / Order。

### A. 报价中心

- 列表复用 `PageHeader`、`Toolbar`、`DataTable` 与既有列宽偏好；搜索继续覆盖款号、款式、品牌和客户业务员，筛选继续使用现有报价类型与报价状态。
- 默认列以款号 / 款式为主识别，并分别表达 `QuoteRevision` 报价历史、`PriceVersion` 价格方案、最终报价、客户确认和 Quote Status；没有把两类版本或两种状态合并。
- 管理员历史偏好仍原样保留；当旧偏好同时显示品牌和客户业务员独立列时，品牌列不再重复业务员。新用户默认列包含最终报价，未更换 storage key、未重置偏好。
- 1280 下 Primary DataTable 使用紧凑固定布局，实测表格内部与页面均无横向滚动；操作、状态、日期和价格无需横滚即可判断。
- 960 / 768 使用 Compact Record，402 / 440 使用 Mobile Quote Card，Desktop Table 不显示；卡片保留款式、品牌 / 客户、报价类型、QuoteRevision、PriceVersion、数量、最终报价、客户确认、报价状态与日期。

### B. 新建报价

- 新建页是独立 Create Workspace，不复用整张报价详情；只包含报价基础资料、初始 PriceVersion 与创建后继续说明，不出现 QuoteRevision 历史、客户确认历史、附件历史或 EstimateCost 历史。
- 系统默认 PriceVersion、制作口径、币种、报价类型、数量、汇率和加成初始化不会制造 dirty；初始打开直接返回无 Guard。
- 用户真实修改后进入 dirty；Guard 的继续编辑、放弃并返回均已在浏览器验证，临时输入不会写入 Repository。
- 缺少必填资料时正式 `validateQuoteCreation` 阻止创建，5 项 Validation Summary 自动展开并可定位字段；输入不丢失，没有复制第二套 required 规则或 Calculator。
- 1600 / 1280 / 960 / 768 无页面横向溢出；402 / 440 使用单列任务表单，Mobile PageHeader 的返回、身份和创建操作分行排列，不重叠。

### C. 新建订单

- 新建页是独立单款 SalesOrder Create Workspace；始终只有一个款式上下文，没有添加款式、OrderItem Grid 或多款式创建器。
- 系统订单号由现有 `suggestOrderNo` 生成并只读展示，用户不能自由定义；创建前显示建议号，创建后进入正式订单详情。
- 客户交期使用 `DeliveryPlan`，页面明确不从 `ScheduleAssignment` 反推，也没有把生产开始 / 结束日当作客户交期。
- 初始 defaults 保持 clean；修改客户 PO 后触发 Guard，继续编辑与不保存返回均通过。空表单创建由正式 `validateOrderIntegrity` 阻止，客户、款号和加工工价字段错误清楚可见。
- 1600 / 1280 使用高效分区表单，960 / 768 双列降级，402 / 440 单列任务布局；全部宽度无页面横向溢出。

### D. Dirty / Create 矩阵

| Scenario | New Quote | New Order |
| --- | --- | --- |
| initial open | clean | clean |
| defaults initialized | clean | clean |
| user changes | dirty | dirty |
| back clean | no guard | no guard |
| back dirty | guard | guard |
| continue editing | PASS，输入保留 | PASS，输入保留 |
| discard | PASS，无正式写入 | PASS，无正式写入 |
| invalid create | 正式校验阻止并展开 5 项错误 | 正式校验阻止并显示字段错误 |
| valid create test | 独立 test namespace → Quote Detail | 独立 test namespace → Order Detail |

### E. 浏览器 QA

| 页面 | 1600 | 1280 | 960 | 768 | 402 | 440 |
| --- | --- | --- | --- | --- | --- | --- |
| 报价中心 | Wide Table PASS | Primary Table PASS；无横滚 | Compact Record PASS | Compact Record PASS | Mobile Card PASS | Mobile Card PASS |
| 新建报价 | Create Workspace PASS | 分区表单 PASS | Compact PASS | Compact PASS | 单列表单 PASS | 单列表单 PASS |
| 新建订单 | Create Workspace PASS | 分区表单 PASS | 双列 Compact PASS | 双列 Compact PASS | 单列表单 PASS | 单列表单 PASS |

以上均为模拟 CSS viewport 验收，不升级为真实 Windows Display Scaling、Chrome Zoom 或 iPhone Safari 真机通过。

### F. 业务与 QA 数据保护

没有修改 Quote、QuoteRevision、PriceVersion、`defaultRevisionId`、Calculator、成本公式、单耗精度、USD 折算、最终报价截断、客户确认、EstimateCost、SalesOrder、OrderQuantityHistory、OrderPriceVersion、DeliveryPlan、ScheduleAssignment、关账语义、RBAC、OperationLog、AttachmentRepository、Backup / Restore、Template Parser / Exporter 或 Legacy PostgreSQL 语义。

继续遵守“一个订单对应一个款式”。无 Reset、无 Seed 覆盖、无 Quote / Order 删除、无 `localStorage` / IndexedDB 清理、无 namespace / schemaVersion 修改、无用户偏好清理。Guard 验收只使用临时内存输入并放弃；成功创建只在独立 test namespace 验证。

### G. 质量门禁

| Check | Result | 证据 |
| --- | --- | --- |
| TypeScript | PASS | `npm.cmd run typecheck`，0 error |
| ESLint | PASS | `npm.cmd run lint`，0 error |
| Phase 4 Tests | PASS | `tests/ui-redesign-phase4.test.mjs`，5 / 5 |
| Full Tests | PASS | `npm.cmd test`，392 / 392，0 skipped |
| Production Build | PASS | 23 routes prerendered；仅保留既有 `>500 kB` chunk warning |
| Browser Console | PASS | 矩阵与回归页面 0 error / 0 warning |
| `git diff --check`（Phase 4 files） | PASS | Phase 4 source、tests、README 无 whitespace error |

完整工作树 `git diff --check` 仍只命中 Phase 4 开始前已有的 vendored artifact 尾空格：`artifacts/artifact-tool-qa/node_modules/@oai/artifact-tool/dist/artifact_tool.mjs` 的 186、204、530、584 行；本阶段没有修改该文件。

### H. Regression

报价详情、订单中心、订单详情、生产排单、OperationLog、关账中心和品牌设置均可真实打开，无页面级横向溢出或 Browser Console 错误。订单详情的“封样提前”“计划开始”、数量历史和价格历史仍存在；Phase 1–3 已通过行为没有被 Phase 4 删除。

### I. Phase 4 截图

| 场景 | 截图 |
| --- | --- |
| Quote Center Wide 1600 | [phase4-quote-center-wide-1600.png](screenshots/phase4-quote-center-wide-1600.png) |
| Quote Center Primary 1280 | [phase4-quote-center-1280.png](screenshots/phase4-quote-center-1280.png) |
| Quote Center Compact 960 | [phase4-quote-center-compact-960.png](screenshots/phase4-quote-center-compact-960.png) |
| Quote Center Mobile 402 | [phase4-quote-center-mobile-402.png](screenshots/phase4-quote-center-mobile-402.png) |
| New Quote Wide 1600 | [phase4-new-quote-wide-1600.png](screenshots/phase4-new-quote-wide-1600.png) |
| New Quote Primary 1280 | [phase4-new-quote-1280.png](screenshots/phase4-new-quote-1280.png) |
| New Quote Compact 960 | [phase4-new-quote-compact-960.png](screenshots/phase4-new-quote-compact-960.png) |
| New Quote Mobile 402 | [phase4-new-quote-mobile-402.png](screenshots/phase4-new-quote-mobile-402.png) |
| New Quote Validation | [phase4-new-quote-validation.png](screenshots/phase4-new-quote-validation.png) |
| New Quote Dirty Guard | [phase4-new-quote-dirty-guard.png](screenshots/phase4-new-quote-dirty-guard.png) |
| New Order Wide 1600 | [phase4-new-order-wide-1600.png](screenshots/phase4-new-order-wide-1600.png) |
| New Order Primary 1280 | [phase4-new-order-1280.png](screenshots/phase4-new-order-1280.png) |
| New Order Compact 960 | [phase4-new-order-compact-960.png](screenshots/phase4-new-order-compact-960.png) |
| New Order Mobile 402 | [phase4-new-order-mobile-402.png](screenshots/phase4-new-order-mobile-402.png) |
| New Order Validation | [phase4-new-order-validation.png](screenshots/phase4-new-order-validation.png) |
| New Order Dirty Guard | [phase4-new-order-dirty-guard.png](screenshots/phase4-new-order-dirty-guard.png) |

### J. 后续范围

用户权限、OperationLog 正式重构、生产与运输关系工作区、报价设置与模板设置未在 Phase 4 实施；它们属于 Delivery Phase 5。

## Phase 4 Gate

**Delivery Phase 4：PASS**

## Delivery Phase 5 — Management / System

结论：**PASS**。

本阶段只正式完成用户权限、OperationLog、生产与运输、报价设置和模板设置。继续复用 Phase 1 Foundation，没有建立平行的 Permission / Log / Settings / Template UI 体系；Delivery Phase 6 范围未实施。

### A. 用户权限

- 页面升级为 `User → Role → PermissionKey` Master–Detail。左侧用户与角色列表显示启用状态以及动态授权数 / 当前目录总数，右侧按正式 Permission Catalog 分组展示权限。
- 用户与权限分别支持搜索，权限组可折叠；全部总数、分组总数和已授权数均由 `PERMISSION_DEFINITIONS` 与角色数据动态计算，没有硬编码 43 / 42。
- 保留既有即时持久化语义，并增加“正在保存 / 已保存 / 错误”反馈；管理员固定全权限、普通角色授权边界和 PermissionKey 均未修改。
- 960 / 768 降级为单面板流程，402 / 440 使用用户列表 → 权限详情，触控操作保持至少 44px；不把双栏硬挤进手机。

### B. OperationLog

- 正式名称与类型继续使用 `OperationLog`。页面改为紧凑业务事件 `DataTable`，优先显示时间 / 操作人、业务事件标题、实体 / Context、关键字段变化和详情入口。
- 详情使用 Foundation `Drawer`，优先呈现既有 `changes[]` 与业务分组；operationId、entityId 和原始 Before / After 收纳在折叠技术详情，不再默认铺满列表。
- 402 / 440 使用业务事件记录 / Timeline 形态，不显示 Desktop 宽表；筛选继续覆盖操作人、模块、操作、日期和全文搜索。
- Repository 保持 append-only，没有增加 `OrderLog`、`ScheduleLog` 或其他平行日志模型。

### C. 生产与运输

- 页面改为关系概览：正式 `SupplyHub → SupplyRoute → ProductionSite → TransportMode` 在同一关系记录中表达，并显示生产日历和封样提前期上下文。
- 生产事实与运输事实使用独立管理区；路线状态与运输方式没有被误当作生产状态，页面不计算异常或风险。
- 运输可行性与推荐继续由现有排单 `material-logistics-service` 使用正式事实投影；本页没有创建物流阈值、风险算法或第二套 Scheduling Domain。
- 1600 使用完整关系流，1280 保持三段同屏，960 / 768 纵向重排，402 / 440 使用任务式关系卡；全部宽度无页面横向溢出。

### D. 报价设置

- 制作预设升级为 Preset List–Detail。左侧选择任意可扩展预设，右侧使用正式字段编辑名称、制作国家、币种、加成和运费默认值。
- “默认”只表达新报价默认带入，默认预设仍可编辑；UI 明确说明修改只影响未来默认值，不会回写已有 QuoteRevision / PriceVersion 快照。
- 系统默认汇率、加成、币种、其他费用和工序说明仍使用原有保存机制。长期 DEV 自定义设置改为挂载后只读加载，消除了 SSR hydration mismatch，不改变 namespace 或存储结构。
- 960 / 768 将预设 Master 横向收敛，402 / 440 使用单列设置表单；没有为每个字段创建独立大 Card。

### E. 模板设置

- 模板列表升级为 Foundation `DataTable` / Mobile Record，默认显示模板、类型、版本、状态、Validation、更新时间和管理入口。
- 管理 Drawer 使用既有 `validateQuoteCustomerTemplate` 对保存的 Blob 做真实按需校验，并保留下载、试导出、复制、设为默认和启停的现有生命周期动作。
- 上传仍由正式 Validator 检查格式、`{{placeholder}}` 和 Dynamic Rows；试导出继续使用 `buildQuoteRevisionExcelWithTemplate`，没有复制 Parser 或 Exporter。
- 旧内置 V1 模板在当前正式校验器下会报告缺失占位符，列表因此显示中性“按需校验”，Drawer 如实列出错误，不再误标为已通过。该事实不影响现有 fallback / 历史 Export Artifact。

### F. 浏览器 QA

| 模块 | 1600 | 1280 | 960 | 768 | 402 | 440 |
| --- | --- | --- | --- | --- | --- | --- |
| 用户权限 | Master–Detail PASS | Master–Detail PASS | 单面板 PASS | 单面板 PASS | List → Detail PASS | List → Detail PASS |
| OperationLog | DataTable PASS | DataTable PASS | 紧凑列表 PASS | 紧凑列表 PASS | Event Record PASS | Event Record PASS |
| 生产与运输 | 完整关系流 PASS | 三段关系 PASS | 纵向关系 PASS | 纵向关系 PASS | 任务卡 PASS | 任务卡 PASS |
| 报价设置 | List–Detail PASS | List–Detail PASS | Compact PASS | Compact PASS | 单列表单 PASS | 单列表单 PASS |
| 模板设置 | DataTable PASS | DataTable PASS | DataTable PASS | DataTable PASS | Template Record PASS | Template Record PASS |

30 个正式 viewport 组合均无 document-level 横向溢出。Drawer 实测初始焦点落在关闭按钮，ESC 可关闭并把焦点归还触发按钮。以上仍是模拟 CSS viewport 验收，不升级为真实 Windows Display Scaling / Chrome Zoom 或真机 Safari 通过。

### G. 业务与 QA 数据保护

未修改 Quote、QuoteRevision、PriceVersion、`defaultRevisionId`、Calculator、成本公式、SalesOrder、Quantity / Price History、DeliveryPlan、ScheduleAssignment、Closing、ProductionGroup / OutsourceFactory identity、RBAC / PermissionKey、OperationLog append-only、AttachmentRepository、Backup / Restore、Template Parser / Exporter 或 Legacy PostgreSQL 语义。

无 Reset、无 Re-seed、无 Quote / Order / Schedule / Closing 删除、无 `localStorage` / IndexedDB 清理、无 namespace / schemaVersion 修改。权限和设置保存能力只通过自动化与现有正式边界检查；浏览器没有提交长期 DEV 配置变更。

### H. 质量门禁与回归

| Check | Result | 证据 |
| --- | --- | --- |
| TypeScript | PASS | `npm.cmd run typecheck`，0 error |
| ESLint | PASS | `npm.cmd run lint`，0 error |
| Phase 5 Tests | PASS | `tests/ui-redesign-phase5.test.mjs`，5 / 5 |
| Full Tests | PASS | `npm.cmd test`，397 / 397，0 skipped |
| Production Build | PASS | 23 routes prerendered；仅保留 `>500 kB` chunk warning |
| Browser Console | PASS | 最终矩阵和回归无 Runtime Error / Hydration Overlay |
| `git diff --check`（Phase 5 files） | PASS | Phase 5 source、tests、README 无 whitespace error |

报价中心、报价详情、新建报价、订单中心、新建订单、订单详情、生产排单、关账中心和品牌设置均已真实打开回归，无页面横向溢出或 Runtime Error；订单详情“封样提前”“计划开始”仍存在。

### I. Phase 5 截图

| 场景 | 截图 |
| --- | --- |
| Permissions 1280 Master–Detail | [phase5-permissions-1280.png](screenshots/phase5-permissions-1280.png) |
| Permissions Mobile List | [phase5-permissions-mobile-list-402.png](screenshots/phase5-permissions-mobile-list-402.png) |
| Permissions Mobile Detail | [phase5-permissions-mobile-detail-402.png](screenshots/phase5-permissions-mobile-detail-402.png) |
| OperationLog 1280 List | [phase5-operation-log-1280.png](screenshots/phase5-operation-log-1280.png) |
| OperationLog Detail Drawer | [phase5-operation-log-detail-drawer.png](screenshots/phase5-operation-log-detail-drawer.png) |
| OperationLog Mobile | [phase5-operation-log-mobile-402.png](screenshots/phase5-operation-log-mobile-402.png) |
| Production & Transport Wide | [phase5-production-transport-wide-1600.png](screenshots/phase5-production-transport-wide-1600.png) |
| Production & Transport 1280 | [phase5-production-transport-1280.png](screenshots/phase5-production-transport-1280.png) |
| Production & Transport Compact | [phase5-production-transport-compact-960.png](screenshots/phase5-production-transport-compact-960.png) |
| Production & Transport Mobile | [phase5-production-transport-mobile-402.png](screenshots/phase5-production-transport-mobile-402.png) |
| Quote Settings 1280 / Preset Detail | [phase5-quote-settings-1280.png](screenshots/phase5-quote-settings-1280.png) |
| Quote Settings Mobile | [phase5-quote-settings-mobile-402.png](screenshots/phase5-quote-settings-mobile-402.png) |
| Template Settings 1280 | [phase5-template-settings-1280.png](screenshots/phase5-template-settings-1280.png) |
| Template Validation Detail | [phase5-template-validation-detail.png](screenshots/phase5-template-validation-detail.png) |
| Template Settings Mobile | [phase5-template-settings-mobile-402.png](screenshots/phase5-template-settings-mobile-402.png) |

### J. 后续范围

Phase 6 的 Master Data 与低频设置、旧内置模板资产升级、真实 Windows 缩放 / Chrome Zoom、Touch Tablet 和 iPhone Safari 真机验收继续保留；本阶段没有自动实施。

### K. 版本控制收口

- Phase 4 没有可识别的独立 commit；当前 `HEAD` 仍为 `3f1749dd6eb288a073115f403268ade33d6f1927`，且 Phase 4 修改与更早继承 dirty worktree 混合，无法安全隔离提交。
- Phase 5 Start Baseline 同样已经包含用户权限、OperationLog、生产与运输、README、共享 CSS 和既有测试的 dirty / untracked hunks。完整 Phase 5 增量无法在不冒险混入旧修改的前提下独立 stage，因此没有创建 Phase 5 commit。
- 历史 hunk 不做猜测拆分；本次通过 `chore: establish validated ui redesign phase 0-5 baseline` consolidated commit 固化 Phase 0–5 已验收工作树，它不冒充任何单独 Delivery Phase commit。
- 从 Delivery Phase 6 开始，必须在阶段开始前记录 baseline，完成后只 stage 本 Phase 增量、创建独立 commit 并报告 commit hash。

## Phase 5 Gate

**Delivery Phase 5：PASS**

## Delivery Phase 6 — Master Data & Low-frequency Settings

结论：**PASS**。

本阶段只正式收口现有路由能够证明的八个页面：品牌、客户业务员、面料库、辅料库、生产组、外发厂、关账设置和数据管理。仓库没有独立 Customer Master / Supplier Master，供应商继续是面辅料历史中的自由文本；生产与运输仍属于 Phase 5 回归范围，没有在本阶段重新实现。

### A. Master Data

- 品牌、客户业务员、面料和辅料统一复用 Foundation `PageHeader`、`Toolbar`、`DataTable`、Responsive Record、`Drawer` 和状态展示；默认操作只突出“编辑”，复制、启停或删除进入 More，危险动作不再与主操作并排。
- ProductionGroup 与 OutsourceFactory 使用同一主数据管理模式，保留既有稳定 ID、启停语义和正式 Repository。生产组排序按正式 `sortOrder` 后做自然名称排序，非数字名称仍然合法，没有建立“必须 1–14”规则。
- 面料与辅料同名仍由稳定 ID 区分；供应商没有被提升为新实体。编辑库资料不会回写已有 QuoteRevision / PriceVersion 快照。
- Drawer 初始加载保持 clean；只有真实字段变化才触发未保存保护。ESC、继续编辑、取消和正常焦点恢复均通过浏览器验收，浏览器未保存任何长期 DEV 主数据修改。

### B. Low-frequency Settings

- 关账设置改为紧凑 SettingsPage：默认销售产值税率使用 FormSection，只有真实变化才允许保存；月度生产目标使用 DataTable / Mobile Record 和 Drawer。
- 月度目标继续严格区分 `null` 与 `0`，金额右对齐并使用 tabular numbers；目标只影响关账投影，不修改订单、排单或关账事实。
- 数据管理分成“备份与恢复”和“危险操作”两个 FormSection，继续调用既有 Backup / Restore / Reset 边界。Reset 保持独立 danger 区并要求原有二次确认；本阶段没有执行导入、恢复或重置。

### C. Responsive Browser QA

| 页面 | 1600 | 1280 | 960 | 768 | 402 | 440 |
| --- | --- | --- | --- | --- | --- | --- |
| 品牌 | Table PASS | Table PASS | Record PASS | Record PASS | Mobile Record PASS | Mobile Record PASS |
| 客户业务员 | Table PASS | Table PASS | Record PASS | Record PASS | Mobile Record PASS | Mobile Record PASS |
| 面料库 | Table PASS | Table PASS；容器内受控横滚 | Record PASS | Record PASS | Mobile Record PASS | Mobile Record PASS |
| 辅料库 | Table PASS | Table PASS | Record PASS | Record PASS | Mobile Record PASS | Mobile Record PASS |
| 生产组 | Empty / Table PASS | Empty / Table PASS | Empty / Record PASS | Empty / Record PASS | Empty / Mobile PASS | Empty / Mobile PASS |
| 外发厂 | Empty / Table PASS | Empty / Table PASS | Empty / Record PASS | Empty / Record PASS | Empty / Mobile PASS | Empty / Mobile PASS |
| 关账设置 | Settings PASS | Settings PASS | Compact PASS | Compact PASS | Mobile PASS | Mobile PASS |
| 数据管理 | Settings PASS | Settings PASS | Compact PASS | Compact PASS | Mobile PASS | Mobile PASS |

48 个正式 viewport 组合均无 document-level 横向溢出。面料库 1280 的受控横滚仅发生在 DataTable 容器，识别、规格、供应商、价格和操作仍可高效判断；960 以下不强撑桌面表格。以上属于模拟 CSS viewport 验收，不升级为真实 Windows Display Scaling / Chrome Zoom 或真机 Safari 通过。

### D. Business / Data Protection

未修改 Quote、QuoteRevision、PriceVersion、Calculator、成本公式、SalesOrder、DeliveryPlan、ScheduleAssignment、Closing 语义、ProductionGroup / OutsourceFactory identity、RBAC、OperationLog、AttachmentRepository、Backup / Restore、Template Parser / Exporter、namespace、schemaVersion 或 Legacy PostgreSQL。

无 Reset、无 Re-seed、无 Quote / Order / Schedule / Closing 删除、无 `localStorage` / IndexedDB 清理、无用户表格偏好清理。长期 DEV 浏览器验收只打开、搜索、切换布局和放弃未保存草稿。

### E. Quality Gate

| Check | Result | 证据 |
| --- | --- | --- |
| TypeScript | PASS | `npm.cmd run typecheck`，0 error |
| ESLint | PASS | `npm.cmd run lint`，0 error |
| Phase 6 Tests | PASS | `tests/ui-redesign-phase6.test.mjs`，5 / 5 |
| Full Tests | PASS | `npm.cmd test`，402 / 402，0 skipped |
| Production Build | PASS | 23 routes prerendered；仅保留 `>500 kB` chunk warning |
| Browser Console | PASS | 八页矩阵与核心回归 0 error / 0 warning |
| `git diff --check` | PASS | Phase 6 增量无 whitespace error；既存 vendored artifact 单独排除 |

报价中心、报价详情、新建报价、订单中心、订单详情、新建订单、生产排单、关账中心、用户权限、OperationLog、生产与运输、报价设置、模板设置和品牌设置均已轻量打开回归，无 Phase 6 引入的页面横向溢出或 Runtime Error。

### F. Phase 6 Screenshots

| 场景 | 截图 |
| --- | --- |
| Brands 1280 | [phase6-brands-1280.png](screenshots/phase6-brands-1280.png) |
| Brands Compact 960 | [phase6-brands-compact-960.png](screenshots/phase6-brands-compact-960.png) |
| Brands Mobile 402 | [phase6-brands-mobile-402.png](screenshots/phase6-brands-mobile-402.png) |
| Customer Salespeople 1280 | [phase6-customer-salespeople-1280.png](screenshots/phase6-customer-salespeople-1280.png) |
| Fabrics Wide 1600 | [phase6-fabrics-wide-1600.png](screenshots/phase6-fabrics-wide-1600.png) |
| Fabrics 1280 | [phase6-fabrics-1280.png](screenshots/phase6-fabrics-1280.png) |
| Fabrics Compact 960 | [phase6-fabrics-compact-960.png](screenshots/phase6-fabrics-compact-960.png) |
| Fabrics Mobile 402 | [phase6-fabrics-mobile-402.png](screenshots/phase6-fabrics-mobile-402.png) |
| Fabrics Edit Drawer | [phase6-fabrics-edit-drawer-1280.png](screenshots/phase6-fabrics-edit-drawer-1280.png) |
| Trims 1280 | [phase6-trims-1280.png](screenshots/phase6-trims-1280.png) |
| Production Groups Mobile Empty | [phase6-production-groups-mobile-402.png](screenshots/phase6-production-groups-mobile-402.png) |
| Closing Settings 1280 | [phase6-closing-settings-1280.png](screenshots/phase6-closing-settings-1280.png) |
| Closing Settings Mobile | [phase6-closing-settings-mobile-402.png](screenshots/phase6-closing-settings-mobile-402.png) |
| Data Management 1280 | [phase6-data-management-1280.png](screenshots/phase6-data-management-1280.png) |
| Data Management Mobile | [phase6-data-management-mobile-402.png](screenshots/phase6-data-management-mobile-402.png) |

截图使用真实视口捕获；未使用会受固定侧栏影响的拼接式 full-page 截图。Legacy Audit 及其已知缺失的 Compact Reference 没有被修改或补造。

### G. Remaining

独立客户主数据、供应商实体、真实服务端 CRUD / 并发、数据库 migration、真实 Windows 缩放 / Chrome Zoom 和真机 Safari 验收不在本阶段范围。Delivery Phase 7 未开始。

## Phase 6 Gate

**Delivery Phase 6：PASS**

## Post-Phase6 UI Correction

本 Correction 不是 Delivery Phase 7。详细审计、测量、字段矩阵、质量门禁与截图索引见 [post-phase6-ui-correction.md](post-phase6-ui-correction.md)。

- QA Dataset 使用浏览器本地 Repository，按 Origin + Browser Profile 双重隔离；`127.0.0.1`、`localhost`、Codex Browser 与用户 Chrome Profile 不自动共享数据。DEV-only Loader 现在显示 Origin、Dataset、seed、namespace 与数量，并提供目标 Chrome Profile 的显式幂等装载流程。
- Quote Detail 完成 Second Pass：Object Header 按款号、款名、metadata 与 actions 的语义层级重排；Compact 根据自身容器宽度换布局，不再将业务字符串压成逐字竖排；Header 与价格摘要形成连续 Workspace。
- Quote Fabric Snapshot 的名称、成分、供应商、段长、门幅、克重、损耗率、单价和采购单位在 Compact Desktop 均可直接编辑；段长不再只读。单耗与面料成本继续由正式 Calculator 派生并保持只读。
- Fabric Compact 使用按内容类型分配的多列 Grid，中等宽度通常以 2–4 个业务行完成主要字段；Mobile 保留任务卡与完整资料 Drawer，不复制桌面宽表。
- Order Detail 在无 Context Panel 时使用全部可用 Workspace 宽度。用户 full-page 长截图中的 Sidebar 重复已确认是 fixed/sticky screenshot stitching artifact，实时 DOM 与正常滚动没有重复导航。
- 标准 1600 / 1280 / 960 / 768 / 402 / 440 CSS viewport 及三个用户环境等效 CSS viewport 均完成验收；不把模拟 viewport 升级为真实 Windows Display Scaling / Chrome Zoom 通过。
- TypeScript、ESLint、Correction Tests 6/6、Full Tests 408/408、Production Build、Browser Console 与 Correction diff check 均通过；独立 Correction commit 完成后 Gate 关闭。

## 2026-09-04 Second Acceptance Correction

本轮不重做既有 Gate A/B/C。表格 Preference、Sidebar、Quote 密度、Order 去重与 Production Sticky 的验收映射、覆盖矩阵、局部 overflow 测量和截图索引见 [Second Acceptance 任务记录](../tasks/completed/2026-09-04-second-acceptance-correction.md)。PR #3 在用户真实 1229×691 视觉复验前保持未合并。
