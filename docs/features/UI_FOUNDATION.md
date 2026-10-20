# UI Foundation

> 2026-10-12事实校正：页面批准范围、真实CSS入口和最小检查见[Release baseline guard](RELEASE_BASELINE_GUARD.md)与[清单](../release/baseline.json)。当前responsive.ts/tests实际为600/1100/1440，<600不按pointer区分；下文D-023/768描述与此存在历史冲突，待明确supersession，不授权按旧文字回退代码。AppShell已包含可信Server身份和order-center路由分支；Fresh Server仍由Quote-first边界限制生产可见模块。下文mock/根ERP的Known gaps须按历史Browser范围阅读。本次仅校正事实指引，不重设计UI或修改Active决定。

## Purpose

UI Foundation 为 Quote Center 和基础设置提供统一的 ERP 页面、表单、Modal、选择器、宽表和反馈行为，避免 feature 各自重复实现交互规则。

## Current behavior

2026-10-21 来源维护导航同步：来源按钮的父级保护镜像与自身guard均在layout提交，
避免fieldset已启用而父页面仍按旧busy状态拦截唯一一次创建报价导航。
只同步原onGuardChange及cleanup；不移除dirty/pending保护、不增加导航豁免或重放操作。
真实响应屏障、1440/390首次启用单击及原导航负控见
[独立修复](../tasks/active/server-source-navigation-guard-2026-10-21.md)。无布局、文案或断点变化。

2026-10-20 D-148 / Server convergence Gate3: the trusted Server boundary owns one
persistent AppShell frame. Page-level AppShell calls register route/identity-scoped
title, explicit back target and existing feature navigation callbacks; only the
frame/sidebar state survives navigation. Identity loading/failure is local to the
content, with protected content removed when identity is unavailable. Existing
layout, menu, responsive rules and CSS order are unchanged; Browser keeps its
page-owned frame. `.rsc` responses use component MIME and no-store.

Server dirty/in-flight/unknown-receipt owners register UI-only exit protection.
Menu, links, public router, Back/Forward and logout respect it; save/reconcile
commands remain feature-owned. Early public History indexing lets known traversal
restore before confirmation, without losing Forward on cancel. Foreign entries
are never guessed or rewritten: retain the draft and explain the next approved
navigation opens a fresh document. Native beforeunload protection is retained.
Registration and async navigation permits are bound to the mounted owner and
trusted identity, preventing an old receipt from navigating a later login.
No Browser business storage or framework-private history state is repurposed.
See [Gate3 evidence and limits](../tasks/active/server-convergence-gate3-2026-10-20.md).

D-099 Quote UI convergence: PR #64 is the visual/IA baseline, current Server the security/data/business baseline. Reuse this Foundation, not a new UI library/theme. Original Server list grouping is a feature-level opt-in over independent authorized fields and stable UI preferences; other `DataTable` consumers retain fit-first behavior. More/Portal/keyboard actions, trusted Shell, local scrolling and PR83 sticky/compact-cost fixes remain. Server type-first creation uses shared PageHeader/Card/FormItem without changing write timing. [Audit and synthetic evidence](../tasks/active/quote-original-ui-convergence.md); ENGINEERING PASS, human UI approval PENDING, no runtime deployment.

`components/foundation/` 当前包含：

- `AppShell`
- `Page`、`Card`、`Button`、`StatusTag`
- `DataTable`
- `TablePreferenceRepository`（按用户、模块和表隔离列宽）
- `Checkbox`
- `Modal`
- `FormShell`、`FormItem`、Enter 规则 helper
- `SearchableSelect`、`CreatableCombobox`
- `Drawer`
- `NullableNumberInput`、`NullableDateField`
- `Toast`

视觉样式主要来自 `app/globals.css` 与 Quote Center 的 `app/quote-center/quote-center.css`，设计语言为暖灰背景、白色卡片、深绿色强调和轻边框。

## Business / interaction rules

- 局部用户填写型表单使用真正的 `<form onSubmit>` 和 `button type="submit"`。
- 单行 input 的 Enter 提交当前主操作。
- Textarea 普通 Enter 换行；Ctrl/Cmd+Enter 可触发提交。
- SearchableSelect/CreatableCombobox 展开时，Enter 选择高亮项而不提交外层表单。
- SearchableSelect 可按 feature 提供条件创建项；只有规范化查询非空、无精确匹配且筛选结果为空时出现，权限不足保持可见 disabled。方向键/Enter 与 IME 规则和普通选项一致。
- 日期选择、IME composing、disabled/loading 状态必须阻止误提交或重复提交。
- Quote Editor 整页使用 `submitOnEnter={false}`，普通 Enter 不保存整张报价。
- Portal Dropdown 用于避免被表格 overflow 裁剪，并应按触发输入框重新定位。
- Quote Center Selection Mode 使用 Foundation Checkbox；正常列表不创建永久选择列。
- 报价详情的摘要、功能按钮和快速导航必须共用同一 sticky 状态源，不能分别触发。
- 统一响应式约定由 `components/foundation/responsive.ts` 管理。Large Desktop 为 `>=1440`；小于该宽度的细指针/可 hover 环境进入 Compact Desktop，即使 viewport 只有 650px；True Mobile 必须同时满足 `<768`、`pointer: coarse`、`hover: none`；触摸设备的 `768–1023` 使用 Tablet。
- document/main 不承载宽表横向滚动；成本表保留局部 scroll container 作为安全边界，但 Wide renderer 必须按内容区比例铺满，正常桌面不能依赖滚动完成主要字段录入。
- Compact AppShell 使用 78px 图标侧栏；侧栏溢出入口通过点击/触摸打开，不依赖 hover。`SidebarFloatingMenu` 使用 React Portal 挂到 `body`，以触发按钮为锚点做 fixed 定位和视口碰撞处理，滚动/resize 时重新定位，并支持 Escape、点击外部及选择后关闭。Compact/Tablet 的基础设置和系统设置子菜单均不得留在侧栏 overflow 容器内撑开或裁切页面。
- Desktop Sidebar 的 Logo/组织信息和用户 Footer 固定，中间 Navigation 独立 `overflow-y:auto`；Chromium WebKit scrollbar 与 Firefox scrollbar 均视觉隐藏，但鼠标滚轮、触控板和 touch scroll 保持可用。基础设置与系统设置在 Desktop 使用相同内联展开模式。
- Desktop/Compact Sidebar 固定于 viewport，Workspace 是独立纵向滚动容器；Compact 不得降级成 Mobile 导航或隐藏完整业务操作。
- AppShell 把共享 helper 的结果写入 `data-responsive-mode`，导航 CSS 和 React 条件使用同一模式；客户端必须在浏览器绘制前同步解析真实模式，不能让服务端安全 fallback 在路由切换时以展开侧栏闪现。只有 True Mobile 隐藏桌面侧栏并渲染底部主导航与 Drawer，不能仅凭 width 切换全局导航。
- AppShell 顶部提供紧凑全局搜索触发器，并统一监听 Ctrl/Cmd+K；Command Palette、Provider 注册和权限边界位于 `features/global-search/`，不能把模块查询写进 AppShell。
- 存在明确父页面的 Detail Page 通过 `AppShell` 顶栏左侧返回入口提供显式 parent target；返回仍经过 feature 的 `onRequestNavigation`，不得用不确定的 `history.back()` 绕过 Quote / Order unsaved guard。内容区不再重复大型返回按钮，Root/List Page 不强行增加返回。
- 全局“更多”使用轻量单行 `··· 更多` 触发器；默认保持低视觉权重，hover/open 才强调，chevron 不换行，菜单继续使用正式 Portal / Overlay 与键盘导航。
- 报价明细成本区可在不改变全局设备模式的前提下使用局部内容宽度：Card `>=1040px` 为 Wide，低于该值为 Compact/Narrow；`700–1099px` viewport 只用于保证半屏不会因 Shell 占宽误入单列。这不能改变 AppShell 的 True Mobile 判定。
- Mobile Modal 为底部 Sheet：header/footer 固定保留，body 独立滚动，并考虑 safe area。
- 报价与订单列表复用同一 Table Preference contract；列宽保存键包含 `userId + moduleKey + tableKey`，各表有独立默认值并支持恢复默认。偏好只控制视图，不写入业务实体或 OperationLog。

## Data model and API

Foundation 不拥有业务数据模型，也不直接调用业务 API。它通过 props、form submit 和回调与 feature 交互。

## Frontend behavior

- `FormShell` 统一 form 语义和提交锁，feature 不应普遍添加 document 级 keydown。
- `Modal` 保持现有布局/按钮风格，具体业务 validation 仍由 feature 提供。
- Searchable/Creatable 组件支持键盘导航、自由输入或选项选择；打开状态用 ARIA 属性标记，以便 FormShell 判断 Enter 优先级。
- SearchableSelect 与 CreatableCombobox 的浮层均使用 body Portal，并在 resize/scroll 时依据触发控件重新定位。
- Drawer 使用 body Portal 和 FormShell，可安全嵌套在 Modal 上方；Escape、backdrop 和事件隔离不得意外关闭或提交上层表单。
- `PageBackButton` 只负责向 AppShell 注册明确的父页面目标；可保存详情必须把注册入口接回既有 navigation guard。
- Nullable 输入保留 `null` 与 `0` 的区别。
- 成本宽表由 Quote Center 组件承载业务列和计算展示，Foundation 只提供通用控件和视觉基础。

## Important constraints

- 不要为单个页面复制一套 Enter 提交逻辑；优先扩展 Foundation。
- 不要通过全局 `document keydown` 模拟主按钮点击。
- 不得破坏中文 IME、Textarea 换行、Dropdown 键盘选择和重复提交保护。
- Nullable 输入不得把空字符串自动持久化成 0。
- UI 改动不能在 Foundation 中偷偷改变 Quote Center 计算、repository 或保存行为。
- 保持现有织序色板和组件体系，不引入另一套视觉组件库。

## Tests

- `tests/foundation-enter-submit.test.mjs`
- `tests/sidebar-floating-menu.test.mjs`
- `tests/quick-master-data.test.mjs`
- Quote Center 和基础设置相关 UI contract tests

结构性测试之外，涉及 Portal、sticky、焦点和响应式布局时必须进行浏览器实际验证。

## Known gaps

Server Quote trial exception: `DataTable` 默认 `layout="fit"` 仍按比例布局，原 `readable` 行为保留；D-099 列表验收修复显式选择新增 `layout="fixed"`，table width/min/max 为列 px 总和，拖动一列不再重新分配其他列或容器余宽。Resize handle 位于本表头内，交互目标/resize 不触发 reorder；键盘调整、内部横向滚动和右侧 sticky 保留。不会静默改写保存的窄列偏好，实际显示遵守可读下限。SSR 验证三种布局；隔离 Chromium 两种列表视图/四档桌面实测选中列+40px、其他列0px。其他模块无需接受该 opt-in。[证据](../tasks/active/d099-list-acceptance.md)。Server 退出控件不占 AppShell 外文档流，workspace 为主滚动拥有者。详情资料加载后才挂载标题时，sticky observer 必须随 ready 状态绑定，不可仅 mount 一次。

- AppShell 当前显示固定 mock 用户，尚未绑定根路径真实会话。
- AppShell 的订单/生产导航仍回到根路径 ERP，没有统一路由领域。
- 当前测试中含源码文本契约，无法替代完整的可访问性、焦点陷阱和浏览器端到端测试。
- 可调 viewport 的桌面浏览器不能代表 coarse-pointer True Mobile；设备模式仍以 D-023 的 viewport + pointer/hover 组合为准。

## 2026-09-04 Second Acceptance

- `TablePreference` 现同时保存 `columnWidths` 与稳定 `columnOrder`；旧 width-only 数据、旧列别名、新增列与删除列均通过幂等 normalization 处理。
- 所有共享 `DataTable` 表头支持 pointer 边缘调宽、方向键微调与拖放排序；宽度是 Preferred Width，最终按容器比例 fit，操作列 sticky 保持可用，resize handle 不触发行打开。
- Desktop Sidebar 可由用户主动在 186px/78px 间切换并按用户保存；折叠态的基础/系统设置继续使用 Portal 浮层，Tablet/Mobile 导航模型不变。
- 基础设置与系统设置菜单默认关闭；Active Route 只高亮，路由变化关闭临时菜单，避免页面切换闪动。
- 自定义 spreadsheet/matrix 表保留固定业务列语义，但仍必须 fit-first 或在窄屏提供 Record/Card；例外与 tableKey 记录在 Second Acceptance 任务规格中。
