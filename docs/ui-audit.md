# 织序 ERP 前端 UI / UX 审计

> 审计范围：当前仓库的前端实现，不包含对数据库模型、API 语义或历史数据的改造。  
> 审计日期：2026-08-17。

## 1. 结论摘要

当前 ERP 已经形成了清晰且有辨识度的视觉语言：深森林绿侧栏、暖灰页面背景、白色卡片、低对比边框、克制阴影、绿色主操作以及偏编辑感的衬线标题。页面密度适合桌面工厂管理场景，登录页、工作台、列表、排单卡片和弹窗在视觉上属于同一产品。

但“设计系统”目前主要存在于 `app/globals.css` 的样式规则中，而不是组件与 Token API 中。前端核心内容集中在 `app/page.tsx`：类型、状态、权限、请求、格式化、Sidebar、Topbar、多个业务页面、表格、弹窗和表单均在同一个客户端组件内。现状是“视觉系统已经存在，工程化 UI Foundation 尚未建立”。

新报价中心应继承现有视觉语言，但不应复用当前报价数据类型、报价弹窗、报价计算公式或 `/api/quotes` 调用。最安全的演进方式是新增路由、新增业务无关组件和新报价特性目录，让旧页面继续运行，待新基础稳定后再渐进替换。

## 2. 当前 UI 技术栈

| 层级 | 当前实现 | 审计结论 |
| --- | --- | --- |
| 框架 | Next.js 16 App Router、React 19、TypeScript | 可继续使用 |
| 构建 | Vinext + Vite 8，`output: "export"` 静态导出 | 新 UI 必须保持静态可构建；当前阶段不引入服务端依赖 |
| 样式 | 单一全局 CSS：`app/globals.css` | 有成熟视觉规则，但缺少分层和作用域 |
| 组件库 | 无第三方 UI 组件库 | 不建议为报价中心突然引入另一套视觉语言 |
| 图标 | 文本符号，如 `⌂`、`¥`、`▦`、`◎` | 可暂时保留布局，但长期应统一为可访问的图标组件 |
| 状态管理 | React `useState` / `useMemo`，全部位于 `Home` | 适合演示，不适合继续承载复杂报价编辑器 |
| 路由 | 单路由，依靠 `active` 状态切换模块 | 新报价中心应使用真实路由，支持刷新、返回和深链接 |
| 数据访问 | 页面内 `request()` 直接调用 `/api/*` | 应从新报价 UI 中隔离，防止继承旧业务契约 |
| 表单 | 原生 `input`、`select`、`textarea`、`FormData` | 样式可继承，需新增统一 FormField、错误和帮助文本规则 |
| 日期 | 原生 `input type="date"` | 无法满足日期面板底部“设置为空”的产品要求 |
| 测试 | 现有测试仍针对旧 starter skeleton | 已失效，不能保护当前 UI；后续需补 Foundation 与报价 UI 测试 |

## 3. 当前前端组织方式

```text
app/layout.tsx
└── app/page.tsx ("use client")
    ├── 类型与状态字典
    ├── request / money / dateText / downloadCsv
    ├── StatusBadge / Empty（仅文件内函数）
    └── Home
        ├── Loading Screen
        ├── Login Page
        └── ERP Shell
            ├── Sidebar
            ├── Topbar
            ├── Dashboard
            ├── Quotes
            ├── Orders
            ├── Schedules
            ├── Users
            ├── Audit
            └── 全局 Modal（报价 / 排单 / 用户 / 密码）
```

当前没有 `components/`、`features/` 或独立页面目录。`StatusBadge` 和 `Empty` 虽然已写成 React 函数，但仍属于 `page.tsx` 私有实现，不是可跨模块复用的公共组件。

## 4. Layout 审计

### 4.1 桌面布局

| 区域 | 当前规则 | 建议 |
| --- | --- | --- |
| App Shell | 两列 Grid | 完全保留这一总体结构 |
| Sidebar | 232px，深绿，100vh，sticky | 保留宽度、色彩、层级与选中态 |
| Topbar | 68px，sticky，半透明白 + blur | 保留；抽成 `Topbar` |
| Page Container | 最大宽度 1480px，水平居中 | 保留，作为 `PageContainer` Token |
| 页面 padding | 桌面 34px 34px 72px | 保留节奏，改为 Foundation spacing 引用 |
| Page Header | 左侧标题说明、右侧动作按钮 | 保留，抽成 `PageHeader` |
| 内容卡片 | 白底、1px 边框、11px 圆角、弱阴影 | 完全保留 |
| 数据表 | 最小宽度 1000px，容器横向滚动 | 列表页可直接继承其视觉规则 |

### 4.2 Sidebar

- 品牌区高度约 74px。
- 组织切换区使用低透明白色背景和 9px 圆角。
- 导航项高度 42px，选中态为暖白底、深绿文字、轻阴影。
- 用户区固定在底部，高度约 71px。
- 权限过滤目前与业务角色直接耦合在 `navItems` 和 `Home` 中。

视觉和交互模式可保留；导航数据、权限判断和路由跳转需要解耦。

### 4.3 Header / Topbar / Breadcrumb

Topbar 左侧的 `织序 / 业务中心` 是视觉上的 Breadcrumb，但它只是静态文字，不是结构化 Breadcrumb。右侧包含全局搜索、设置和用户入口。

建议拆成：

- `Breadcrumbs`
- `GlobalSearch`
- `UserMenu`
- `Topbar`

报价详情需要真实 Breadcrumb：`业务中心 / 报价中心 / QT-xxxx / V2`。

### 4.4 响应式规则

当前断点：

- `≤1180px`：Sidebar 从 232px 收窄为 78px；指标卡 4 列变 2 列；排单卡 3 列变 2 列。
- `≤820px`：Dashboard 变单列；排单卡变单列；搜索框缩窄；登录页上下排列。
- `≤620px`：Sidebar 变底部 62px 导航；Topbar 降至 58px；页面 padding 降为 13px；表单单列；Modal 变底部 Sheet。
- `prefers-reduced-motion`：显著压缩动画与过渡时间。

这个响应式策略值得完整保留。新增报价中心需要特别处理宽成本表、价格版本 Card 横向滚动、附件画廊和顶部关键数据，不应通过缩小字体解决空间问题。

## 5. Design Token 审计

### 5.1 已显式定义的 Token

| 用途 | 当前变量 | 值 |
| --- | --- | --- |
| 主文字 | `--ink` | `#15211e` |
| 次级文字 | `--muted` | `#74807b` |
| 主色 | `--forest` | `#175c4b` |
| 主色 Hover | `--forest-dark` | `#104438` |
| 主色浅底 | `--mint` | `#e8f2ee` |
| 页面背景 | `--cream` | `#f3f2ed` |
| 卡片背景 | `--paper` | `#ffffff` |
| 边框 | `--line` | `#e3e7e3` |
| Warning 基色 | `--amber` | `#b87338` |
| Danger 基色 | `--red` | `#a84e43` |
| Sidebar | `--sidebar` | `#15251f` |
| 卡片阴影 | `--shadow` | `0 16px 42px rgba(22, 44, 36, .07)` |

### 5.2 实际存在但尚未 Token 化的语义色

| 语义 | 文字 | 背景 |
| --- | --- | --- |
| Success | `#2c735d` | `#e6f2ed` |
| Active / Info | `#486f88` | `#e7f0f5` |
| Danger | `#9b5147` | `#f6e8e5` |
| Neutral | `#766a58` | `#f1eee8` |
| Focus | `#70a08f` | `rgba(23,92,75,.09)` |
| Warm brand accent | `#ddb27e` 附近 | 深绿背景上使用 |

这些颜色应进入 Foundation，不能让新报价页面再次声明近似色。

### 5.3 圆角、阴影和尺寸

当前圆角并非单一数值，但有稳定层级：

- 小控件：6–8px。
- Card：9–11px。
- Modal：13px。
- 圆形头像 / Status Tag：完全圆角。

建议归一为语义 Token，而不是强制所有元素同一个圆角：

```text
radius-control = 7px
radius-card = 11px
radius-modal = 13px
radius-pill = 999px
shadow-card = 当前 --shadow
shadow-overlay = 当前 Modal 阴影
```

### 5.4 Spacing

当前高频间距集中在 7–18px，页面级间距为 21–34px。建议建立以下基础刻度，并让新组件只使用这些值：

```text
4 / 8 / 12 / 16 / 20 / 24 / 32 / 40
```

保留当前视觉节奏，而不是继续累积 9、11、13、14、15、17、18 等局部魔法值。

### 5.5 字体

- 正文：`Inter, Noto Sans SC, Microsoft YaHei, sans-serif`。
- 标题和关键金额：`Georgia, Songti SC, serif`。
- 页面标题：桌面 28px，移动 22px。
- Modal 标题：21px。
- 指标：18–26px。
- 大量辅助信息：7–10px。

衬线标题与无衬线业务正文的组合是当前产品辨识度的重要部分，建议完全保留。风险是 7–9px 文本在常见 Windows 显示器上偏小；新 Foundation 应保留层级关系，但将业务正文、表头和说明文字的最低可读字号提高到 11–12px，再通过密度而非极小字体控制信息量。

### 5.6 控件高度与表格密度

| 组件 | 当前尺寸 |
| --- | --- |
| 主 / 次按钮 | 38px |
| Modal 输入 / Select | 39px |
| Topbar 图标按钮 | 36px |
| 登录输入 | 46px |
| 登录按钮 | 48px |
| 表头 | 43px |
| 表格数据行 | 视觉高度约 62px |
| Sidebar 导航项 | 42px |

新报价中心默认使用 38–40px 业务控件；登录页可继续保留 46–48px 的舒展尺寸。

## 6. 公共组件盘点

### A. 已存在、可直接复用其实现思路

| 项目 | 现状 | 建议 |
| --- | --- | --- |
| `StatusBadge` | 页面内函数，含 success / active / danger / neutral | 提升为公共 `StatusTag`，状态文案由业务层传入 |
| `Empty` | 页面内函数 | 提升为公共 `EmptyState`，允许自定义标题、说明和动作 |
| `money()` | 支持 CNY / USD | 提升为 formatter；新报价最终成衣金额固定显示 RMB |
| `dateText()` | 统一中文日期格式 | 提升为 formatter；需支持空值 |
| `request()` | 统一 JSON / 错误处理 | 旧 API 可继续使用，但新报价 V1 不直接依赖它 |
| `downloadCsv()` | 列表导出 | 可移到通用工具目录 |

严格来说，当前没有任何跨文件公共 React 组件。

### B. 重复出现、但尚未抽象

- `AppShell`、`Sidebar`、`Topbar`、`PageContainer`。
- `Breadcrumbs`、`PageHeader`、`PageActions`。
- `Button`：primary、secondary、icon、text、danger。
- `Input`、`Select`、`Textarea`、`FormItem`、表单栅格。
- `Card`、`Panel`、`PanelHeader`、`MetricCard`。
- `DataTable`、`TableContainer`、`RowActions`。
- `Modal` / 移动端 Bottom Sheet。
- `SearchInput`。
- `Toast`、`InlineAlert`、`ProgressBar`。
- `Avatar`、`UserPill`。

这些是新 UI Foundation 的首批候选。

### C. 带旧业务逻辑，不应直接复用

- 当前 `Quote` Type：包含必填 `customer_name`、单层成本、单一数量、`valid_until`，与新产品模型冲突。
- 当前“新建报价” Modal：字段、数量来源、日期、币种范围都与新需求不一致。
- 当前报价公式：`成本 / (1 - margin%)`，属于销售毛利率口径；新需求明确为 `成本 × (1 + 利润率%)`。
- 当前报价表行和状态操作：直接调用旧 `/api/quotes`，不能作为新报价中心组件。
- 当前“转订单”按钮：旧模型只变状态并创建订单，不包含新报价历史、价格版本和确认值语义。
- `quote-preview`：可保留视觉样式，但不能复用其当前三项指标与计算逻辑。
- 排单 Card 的“推进 25%”逻辑、订单状态 Select、角色权限判断：属于具体业务组件。
- Dashboard 指标内容：版式可复用，指标定义不能继承。

### D. 仅保留视觉样式、重新制作业务组件

- 报价数据表。
- 报价关键数据条 `quote-preview`。
- 排单 Card 的卡片层级、Header 和 Progress 视觉。
- 组织切换、用户入口和模块页头。
- Modal 的容器、Header、Footer 和移动端 Bottom Sheet 行为。
- 状态 Tag 的颜色层级。

## 7. 当前缺失、报价中心必须新增的组件

- `DatePicker / NullableDateField`：日期面板底部提供“设置为空”。
- `Tabs`：用于成本类别或详情子区域，不承担价格版本切换。
- `Drawer`：适合历史版本详情和附件信息；需有焦点管理。
- `PriceVersionCard`：整卡切换、编辑在状态左侧、状态居中。
- `RevisionSwitcher`：严格表示 V1 / V2 / V3 历史版本。
- `CostTable`：面料、辅料、工价、其他费用的统一表格基础。
- `UploadDropzone`。
- `ImageGallery` / `ImagePreview`。
- `VideoPreview`。
- `DocumentList`：文件名、类型、下载、删除。
- `Pagination`。
- `FilterBar` / `FilterItem`。
- `MoneyMetric` / `MoneyWithMarkup`。
- `ConfirmDialog` 和业务型 `CustomerConfirmationModal`。

## 8. 推荐的新 UI Foundation 结构

建议新增，不移动或删除现有文件：

```text
components/
  foundation/
    layout/
      AppShell.tsx
      Sidebar.tsx
      Topbar.tsx
      PageContainer.tsx
      PageHeader.tsx
      Breadcrumbs.tsx
    actions/
      Button.tsx
      IconButton.tsx
    forms/
      FormItem.tsx
      Input.tsx
      Select.tsx
      Textarea.tsx
      NullableDateField.tsx
    data-display/
      Card.tsx
      DataTable.tsx
      StatusTag.tsx
      EmptyState.tsx
      Metric.tsx
    overlays/
      Modal.tsx
      Drawer.tsx
    feedback/
      Toast.tsx
      InlineAlert.tsx
    media/
      UploadDropzone.tsx
      ImageGallery.tsx
      VideoPreview.tsx
      DocumentList.tsx

styles/
  foundation/
    tokens.css
    reset.css
    layout.css
    utilities.css

lib/
  formatters/
    money.ts
    date.ts

features/
  quote-center/
    ...仅放报价业务组件与前端 View Model
```

Foundation 组件不得导入报价、订单或排单类型；业务文案、状态枚举和权限规则由 feature 层传入。

## 9. 主要风险

| 风险 | 影响 | 建议控制方式 |
| --- | --- | --- |
| `page.tsx` 单体过大 | 修改任何模块都可能影响其他模块 | 新报价使用独立路由和 feature 目录，不先拆旧页 |
| 全局 CSS 选择器过宽 | `table`、`th`、`td` 等会污染新页面 | Foundation 使用组件 class，不立即改旧规则 |
| 旧报价模型与新模型冲突 | 容易把客户、单数量、旧公式带入新 UI | 新建 View Model，禁止导入旧 `Quote` Type |
| 导航由本地状态控制 | 无深链接、刷新丢模块 | 新报价中心使用真实 URL 路由 |
| Modal 可访问性不足 | 无焦点锁定、Esc 关闭和明确 Dialog 语义 | 新建公共 Modal，不复制旧 JSX |
| 字号偏小 | Windows 屏幕可读性风险 | 保留层级，提升业务文本最低字号 |
| 原生日期控件能力不足 | 无法在面板内“设置为空” | 新建 NullableDateField |
| 无上传与预览基础 | 附件区无法复用 | 新增独立 media 组件，不接后端 |
| 测试已过期 | 重构缺少回归保障 | UI V1 前先替换 starter 测试 |
| 当前工作区已有未提交修改 | 容易混入重构变更 | 新报价工作必须小批次、独立目录、明确 diff |

## 10. 审计建议

1. 完全保留品牌、主色、页面背景、Sidebar、Topbar、卡片、按钮层级、表格密度和响应式策略。
2. 先把设计规则复制为新 Foundation，不立即重写旧页面。
3. 只保留旧报价 UI 的视觉，不复用旧报价类型、表单、公式和 API。
4. 新报价中心先使用前端 View Model 与 mock repository，产品确认后再定义后端契约。
5. Foundation 在新报价中心验证稳定后，再渐进迁移订单、理单、生产、出运、关账和财务。

