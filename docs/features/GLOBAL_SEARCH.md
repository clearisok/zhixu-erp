# ERP 全局搜索

## Purpose

提供跨模块的统一 Command Palette 搜索入口。当前已注册 Quote、Order、Schedule、Closing 与 Style Progress Provider；架构允许未来继续接入采购、客户、供应商和基础资料，不要求重写搜索 UI。

## Current behavior

- AppShell 顶部显示紧凑“搜索”按钮，桌面同时显示 `Ctrl K` 提示。
- `Ctrl+K` / `Cmd+K` 在 AppShell 任意页面打开居中 Command Palette。
- 输入报价号、款号、款式名称、品牌或客户业务员可搜索已保存报价。
- 输入订单号、客户 PO、款号或客户可搜索已保存订单。
- 输入销售合同号、工厂款号或业务款号可搜索已导入款式进度；结果进入合同维度款式详情，并显示是否已有正式订单。
- 输入订单号、款号、客户、生产组或外发厂可搜索排单；输入月份、订单、款式、客户或执行方可搜索关账。
- 结果显示类型、款号、款式名称、品牌、业务员和当前 Revision；不展示报价号，也不包含任何成本字段。
- 支持方向键循环选择、Enter 打开、Esc 或点击遮罩关闭，并保护中文 IME composing 状态。
- 搜索结果、最近访问、整行点击和 Enter 统一调用 `openSearchResult`，重新校验结果权限、记录最近访问、清理焦点并通过 AppShell 导航回调打开，因此报价详情存在未保存修改时仍执行原 dirty guard。
- Quote Detail Loader 订阅 query `id`，同一路由切换不同报价或浏览器 Back 时会重新读取真实 `Quote.id`，不会只改变 URL 而保留旧页面。
- 通过搜索打开的结果按 mock 用户记录为“最近访问”，最多六条、用户间隔离；权限变化后不可访问 Provider 的最近结果会被过滤。

## Search architecture

权威类型位于 `features/global-search/model/global-search.ts`：

- `SearchProvider`：稳定 `id`、模块标签、访问判断、可选结果级访问判断和异步 `search`。
- `SearchRegistry`：校验 Provider ID、按权限选择 Provider、并发搜索、分组和最近结果权限过滤。
- `SearchResult`：只读导航投影，包括类型、标题、副标题、非敏感 meta 和 href。
- `SearchContext`：当前用户 ID 和稳定 PermissionKey 判断函数。

注册入口为 `features/global-search/registry.ts`。未来模块以新增 Provider + 注册的方式接入。

## Quote provider

`QuoteSearchProvider` 位于 `features/global-search/providers/quote-search-provider.ts`：

- 数据源为现有 `QuoteRepository.list()`，不直读 sessionStorage。
- 只读取 `defaultRevisionId` 指向的当前 Revision 展示字段。
- 搜索字段：报价号、款号、款式名称、品牌、客户业务员。
- 报价号只参与匹配，不进入结果卡片或最近访问卡片的展示投影。
- 需要 `quote.view`；无权限时 Registry 不执行 repository 查询。
- 结果投影禁止包含面料、辅料、工价、其他费用、估算成本或确认价格。

## Order provider

`OrderSearchProvider` 位于 `features/global-search/providers/order-search-provider.ts`：

- 数据源为 `OrderRepository.list()`，不读取旧 PostgreSQL 订单 API。
- 搜索字段：订单号、客户 PO、款号、客户。
- 结果展示订单号、客户、款式摘要、有效数量与最近客户交期，不展示内部报价成本。
- 需要 `order.view`；无权限时 Registry 不执行订单 repository 查询。

## Schedule and closing providers

- `ScheduleSearchProvider` 读取 ProductionSchedulingRepository，按订单身份、客户与执行方匹配，并要求 `schedule.view`。
- `ClosingSearchProvider` 读取 ClosingRepository 和 OrderRepository，按月份、订单、款式、客户和执行方匹配，并要求 `closing.view`。
- 两者都只返回导航摘要，不暴露报价成本；关账结果显示期间状态、归属数和关账数量。

## Style Progress provider

- `StyleProgressSearchProvider` 读取 StyleProgressRepository 与 OrderRepository，仅按 `salesContractNo` 关联订单。
- 搜索字段为销售合同号、工厂款号与业务款号；需要 `style_progress.read`。结果不包含整份物料事件或订单成本。

## Persistence and API

- 最近访问：localStorage `zhixu.global-search.recent.v1`，按 mock `userId` 隔离。
- 搜索分别使用 Quote/Order/ProductionScheduling/Closing browser repository；没有新增 API、数据库表或服务端 migration。
- 最近访问只保存结果导航投影，不复制 Quote 或 Revision。

## Frontend behavior

- Palette：`features/global-search/components/global-search-palette.tsx`
- 顶层接入：`components/foundation/app-shell.tsx`
- 样式：`app/globals.css` 中 `qc-global-search-*`
- 浮层通过 React Portal 渲染到 body，不进入页面布局流。

## Important constraints

- Provider 必须先做模块权限判断，再读取数据；结果级数据权限未来通过 `canAccessResult` 扩展。
- 搜索结果只能包含用户有权看到的列表级信息，不得用搜索绕过成本、附件或历史权限。
- 新模块不得把查询逻辑硬编码到 Palette 组件。
- 搜索导航必须继续走 AppShell 的 `onRequestNavigation`，不得绕过报价 dirty guard。
- 当前搜索只覆盖已保存业务记录；未保存草稿不能成为搜索结果。

## Tests

`tests/global-search.test.mjs` 覆盖报价字段、成本信息隔离、无权限不查询、Provider 注册、最近访问用户隔离、键盘索引和 UI 快捷键/Portal 契约；订单、排单与关账搜索分别由对应领域测试覆盖权限和结果投影。

## Known gaps

- 采购、客户、供应商和基础资料尚未接入。
- 没有服务端全文索引、拼音/模糊纠错、分页、高亮或跨设备最近访问。
- 当前权限和最近访问均为浏览器 mock，真实生产环境必须由后端搜索 API 按当前会话重新鉴权。
