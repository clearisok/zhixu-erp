# 新报价中心 UI 迁移方案

> 目标：最大程度保留当前 ERP 的页面设计与交互质量，建立全新的报价中心前端模型。  
> 本方案不修改数据库、不修改旧 API、不迁移历史数据，也不包含报价后端实现。

## 1. 迁移策略

采用“并行新增、逐步替换”而不是“原地改造”。

- 保持当前 `/` 页面及其报价、订单、排单功能不变。
- 新增 `/quote-center` 路由族。
- 新增业务无关 UI Foundation，视觉参数来源于当前 ERP。
- 新报价中心只依赖自己的前端 View Model 和 mock repository。
- 不调用当前 `/api/quotes`，避免旧业务字段和旧公式渗透。
- 产品与交互确认后，再单独设计 API 契约和持久化模型。

这样可以在不破坏现有 ERP 的前提下，把报价中心做成未来新业务链路的第一个标准模块。

## 2. 新旧模型冲突清单

| 主题 | 当前实现 | 新报价中心要求 | 处理原则 |
| --- | --- | --- | --- |
| 客户 | `customer_name` 必填 | 不需要客户字段 | 新 UI 完全移除，不兼容旧字段 |
| 款号 | 当前 `style_no` 与旧订单逻辑绑定 | 仅“报价款号” | 新建独立字段语义 |
| 总数量 | 用户手工填写一个 quantity | 所有价格版本数量自动求和 | 只读计算值，不提供手工输入 |
| 成本 | 面料、加工、其他三个扁平数字 | 每个价格版本独立保存面料、辅料、工价、其他费用 | 新 View Model 采用嵌套结构 |
| 加成公式 | `成本 / (1 - margin%)` | `成本 × (1 + markupRate%)` | 新 UI 只使用产品指定公式，字段统一命名 `markupRate` |
| 币种 | 当前报价整体 currency | 仅加工币种 CNY / USD；最终成衣销售金额为 RMB | 工价输入与 RMB 换算明确分层 |
| 日期 | `valid_until` 且默认有值 | 报价日期、面料交期、成衣交期均可为空 | 使用 NullableDateField |
| 报价版本 | 当前无正式历史版本 | V1 / V2 / V3，旧版本只读且可复制 | 独立 Revision 概念 |
| 价格版本 | 当前无 | 素色、彩条等，同一报价内并列 | 独立 Price Version 概念 |
| 客户确认 | 当前仅状态变化 | 每个 PriceVersion 独立保存确认值 | 确认值不覆盖测算值，复制价格版本时不复制确认结果 |
| 附件 | 无 | 成衣图片/视频 + 报价资料 | 新建两类附件组件 |
| 转订单 | 直接调用旧 API | 基于确认后的新报价生成正式订单 | UI V1 只展示流程和确认，不接旧转单接口 |

## 3. 路由与目录建议

### 3.1 路由

```text
/quote-center                         报价列表
/quote-center/new                     新建报价
/quote-center/detail?id={quoteId}               报价详情 / 当前历史版本
/quote-center/detail?id={quoteId}&revision=V2   查看指定历史版本（后续 Slice）
```

价格版本属于详情页内部视图状态，可使用 `price=solid` 一类 query 参数保留可分享状态，但视觉上通过整张 Card 切换。

已用 Vinext + Next + 静态导出进行路由探针验证：动态段只会输出 `generateStaticParams` 预先枚举的 HTML，新建报价 ID 无法得到可刷新路径。因此 Slice 1 正式采用 query 详情路由；列表、详情和新建均可直接访问及刷新。

### 3.2 目录

```text
app/
  quote-center/
    page.tsx
    new/
      page.tsx
    detail/
      page.tsx

features/
  quote-center/
    components/
      QuoteList.tsx
      QuoteHeader.tsx
      QuoteBaseInfo.tsx
      RevisionSwitcher.tsx
      PriceVersionGrid.tsx
      PriceVersionCard.tsx
      PriceVersionDialog.tsx
      QuoteMetrics.tsx
      FabricCostSection.tsx
      TrimCostSection.tsx
      LaborCostSection.tsx
      OtherCostSection.tsx
      GarmentMediaPanel.tsx
      QuoteDocumentsPanel.tsx
      CustomerConfirmationDialog.tsx
      RevisionHistoryDrawer.tsx
    model/
      quote-view-model.ts
      quote-calculations.ts
      quote-validation.ts
    repository/
      quote-repository.ts
      mock-quote-repository.ts
    fixtures/
      quote-fixtures.ts
```

公共视觉组件放在 `components/foundation/`，报价特有组件放在 `features/quote-center/`。禁止把 `PriceVersionCard`、报价计算或确认规则放进 Foundation。

## 4. 前端产品模型（非数据库设计）

UI V1 建议使用以下 View Model 概念：

```text
QuoteViewModel
├── id / quoteCode / aggregateStatus
├── currentRevisionId
└── revisions[]
    └── QuoteRevisionViewModel
        ├── revisionLabel: V1 / V2 / V3
        ├── createdAt / createdBy / note
        ├── readOnly
        ├── baseInfo
        │   ├── brand / salesperson
        │   ├── quoteType / quoteStyleNo / styleName
        │   ├── quoteDate? / fabricLeadDate? / garmentLeadDate?
        │   └── note
        ├── pricingParameters
        │   ├── laborCurrency: CNY | USD
        │   ├── usdCnyRate
        │   └── markupRate
        ├── priceVersions[]
        │   └── PriceVersionViewModel
        │       ├── name
        │       ├── quantity
        │       ├── description
        │       ├── fabricCosts[]
        │       ├── trimCosts[]
        │       ├── labor
        │       ├── otherCosts[]
        │       └── confirmation?
        ├── attachments
        └── confirmationSummary
```

这只是 UI 数据边界，用于防止页面继续依赖旧 `Quote` Type；它不是数据库表设计，也不决定后端如何存储。

必须在命名上明确：

- `Revision` = 报价历史 V1 / V2 / V3。
- `PriceVersion` = 素色 / 彩条 / 印花等并列价格口径。

任何组件、变量和文案都不得把两者统称为 `version`。

## 5. 报价列表设计

保留当前模块页头、白色数据面板、低对比表头、状态 Tag、右侧操作的设计。

建议列：

1. 报价编号。
2. 品牌。
3. 报价款号 / 款式名称。
4. 报价类型。
5. 业务员。
6. 价格版本数量。
7. 总数量（自动求和）。
8. 当前历史版本，如 V3。
9. 报价状态。
10. 报价日期，可为空。
11. 操作。

列表不出现客户字段和工厂款号字段。

顶部 FilterBar 建议支持品牌、业务员、报价类型、状态和报价日期；Search 搜索报价编号、报价款号和款式名称。数据量增大后使用 Pagination，不继续一次性加载全部记录。

## 6. 新建报价页面

使用独立页面而不是当前 720px Modal。原因是新报价包含多个价格版本、成本表、附件和确认流程，已经超出轻量弹窗容量。

页面结构：

```text
Breadcrumb + PageHeader + Save Actions
├── 报价基础信息 Card
├── 价格版本 Card 区
├── 当前价格版本关键数据
├── 成本编辑区
│   ├── 面料成本
│   ├── 辅料成本
│   ├── 工价
│   └── 其他费用
├── 成衣信息附件
└── 报价资料附件
```

基础信息字段严格为：

- 品牌。
- 业务员。
- 报价类型：经销 / 加工。
- 报价款号。
- 款式名称。
- 总数量：只读，由价格版本自动汇总。
- 加工币种：CNY / USD。
- 利润率 %。
- USD 汇率。
- 报价日期，可为空。
- 面料交期，可为空。
- 成衣交期，可为空。
- 备注。

不出现客户和工厂款号。

## 7. 可空日期组件

原生 `input type="date"` 无法满足要求，应新增 `NullableDateField`：

- 点击输入框打开日期面板。
- 面板主体选择日期。
- 面板底部固定操作“设置为空”。
- “设置为空”后关闭面板并显示空态 Placeholder。
- 不在输入框旁新增清除按钮。
- 支持键盘打开、选择、Esc 关闭和焦点返回。
- 空值在 View Model 中使用 `null`，不使用虚构默认日期。

## 8. 价格版本 Card

价格版本区域采用当前 ERP Card 语言：白底、细边框、11px 圆角、弱阴影。

每张 Card 显示：

- 名称，例如“素色”。
- 数量，例如“12,000 件”。
- 说明。
- 右上角操作区：`编辑` 在左，状态在右。
- 当前 Card 状态：绿色“当前查看”。
- 非当前 Card 状态：低强调灰色“可切换”。

交互规则：

- 点击 Card 任意非操作区域即可切换。
- Card 使用 Button-like 语义，可键盘聚焦并通过 Enter / Space 切换。
- 当前态同时使用边框、浅绿背景和状态文案，不能只依赖颜色。
- 状态文字在自己的固定高度区域内水平、垂直居中。
- Card 底部不重复出现“当前价格版本 / 切换 / 编辑”。

## 9. 复制价格版本

使用 Foundation Modal，字段只有：

- 价格版本名称。
- 数量。
- 说明。

禁止出现销售单价和“附加成本”。

复制当前价格版本：

- 默认复制当前价格版本的面料、辅料、工价、其他费用。
- 名称、数量和说明在弹窗中填写。
- 创建后自动切换到新价格版本。
- 不修改原价格版本。
- 不复制客户确认结果。

不提供“新增价格版本”入口；第一个价格版本随新报价草稿自动创建，后续版本只能从当前价格版本复制。

顶部总数量实时等于所有价格版本数量之和。

## 10. 成本与利润显示

### 10.1 计算规则

严格使用当前产品公式：

```text
加成后金额 = 成本 × (1 + markupRate / 100)
销售单价 = 利润前总成本 × (1 + markupRate / 100)
```

不得使用旧实现中的：

```text
成本 / (1 - 利润率 / 100)
```

计算放入纯函数 `quote-calculations.ts`，并为 CNY、USD、空成本、0% 加成率和小数结果编写单元测试。

### 10.2 加工币种

- CNY：工价输入单位明确显示 `CNY / 件`，直接计入 RMB 成本。
- USD：工价输入单位显示 `USD / 件`；旁边显示 USD/CNY 汇率和换算后的 `RMB / 件`。
- 最终面料、辅料、工价、其他费用和成衣销售单价统一使用 RMB 展示。
- 切换加工币种不得默默改写用户输入值；需要明确当前输入口径和换算结果。

### 10.3 顶部关键数据

使用当前 `quote-preview` 的深绿信息带视觉，但重新制作 `QuoteMetrics`：

| 指标 | 上方主值 | 下方辅助值 |
| --- | --- | --- |
| 面料成本 | 原始面料成本 RMB | 成本 × (1 + 利润率) |
| 辅料成本 | 原始辅料成本 RMB | 成本 × (1 + 利润率) |
| 工价 | 原始工价；单位明确 | 换算 RMB 后 × (1 + 利润率) |
| 成衣销售单价 | 最终 RMB / 件 | 利润前总成本 × (1 + 利润率) |

当前价格版本变化、成本变化、加成率变化或汇率变化时，所有指标即时更新。

## 11. 报价历史版本

`RevisionSwitcher` 放在详情页 Header 附近，与价格版本 Card 保持视觉与空间上的分离。

- 当前编辑版本清晰显示为 V3。
- 历史版本 V1 / V2 默认只读。
- 历史版本中仍可查看当时所有价格版本、成本、销售单价和附件。
- “基于此版本创建新版本”复制整个历史快照，产生新的 Vn。
- 创建新版本不删除、不覆盖旧版本。
- 只读态禁用编辑控件，但保持信息布局不变，避免查看历史时页面跳变。

历史版本详情可使用 Drawer 展示元信息，也可在主页面切换；Drawer 只承担历史说明和版本操作，不把完整成本编辑器塞进窄侧栏。

## 12. 附件区域

### 12.1 成衣信息

使用 `GarmentMediaPanel`：

- 图片缩略图网格。
- 点击图片打开 Image Preview，可前后切换。
- 视频显示可识别封面和播放入口，打开 Video Preview 播放。
- 支持新增和删除。
- 删除必须二次确认。

### 12.2 报价资料

使用 `QuoteDocumentsPanel`：

- 文件名。
- 文件类型与大小。
- 上传状态。
- 下载。
- 删除。

Excel、PDF、Word、样板资料不要求在线预览。UI V1 只实现交互和 mock 数据，不增加存储服务。

## 13. 客户确认

客户确认属于 `PriceVersion`，必须使用独立业务 Modal，不复用普通状态 Select。本节在 Slice 1 只定义模型边界，不实现界面。

经销报价：

- 必填：确认成衣价格。
- 可选：确认工价。
- 确认备注。

加工报价：

- 重点字段：确认工价。
- 确认备注。

确认区域同时展示：

- 报价测算值，只读。
- 客户确认值，可编辑。

提交确认后，不覆盖原测算值。详情页使用并列信息表达“报价值”和“确认值”。“转正式订单”只有在确认信息完整后才进入可用状态；UI V1 不调用旧转单 API。

## 14. 组件复用清单

### 14.1 完全保留

- App Shell 的两列布局和移动端底部导航策略。
- Sidebar、Topbar、Page Container 的视觉尺寸。
- 主色、背景色、卡片、边框、阴影、标题字体。
- 主 / 次按钮层级。
- 表格视觉密度与横向滚动策略。
- Status Tag 的语义色层级。
- Modal 的桌面居中和移动端 Bottom Sheet 形态。
- Empty State、Toast、Inline Alert 的视觉语言。

### 14.2 只保留视觉样式

- 当前报价列表。
- 当前报价 Modal。
- 当前 `quote-preview`。
- 当前报价状态操作。
- 当前转订单入口。

### 14.3 必须新增

- Foundation：Button、FormItem、NullableDateField、DataTable、Modal、Drawer、Tabs、Upload、ImagePreview、VideoPreview、Pagination、FilterBar。
- 报价业务：RevisionSwitcher、PriceVersionCard、PriceVersionDialog、QuoteMetrics、四类成本区、两类附件区、CustomerConfirmationDialog。

## 15. 实施阶段

### Phase 0：视觉基线与隔离

- 记录当前桌面、平板、移动端关键布局规则。
- 建立 Token 文件和 Foundation 目录。
- 不修改旧页面 import，不改变现有 `/`。

### Phase 1：Foundation 最小集

- AppShell、Sidebar、Topbar、PageContainer、PageHeader。
- Button、FormItem、Input、Select、Textarea、NullableDateField。
- Card、DataTable、StatusTag、EmptyState。
- Modal、Drawer、Toast。

只实现报价中心实际需要的能力，不一次性建设庞大组件库。

### Phase 2：报价列表 UI V1

- 新路由 `/quote-center`。
- mock repository。
- 搜索、筛选、分页、状态展示。
- 验证与旧 ERP 的视觉一致性。

### Phase 3：新建 / 详情 UI V1

- 基础信息。
- 可空日期。
- 价格版本 Card 和“复制当前价格版本”。
- 总数量自动求和。
- 成本区和产品指定公式。
- CNY / USD 工价换算。

### Phase 4：历史、附件和客户确认

- RevisionSwitcher 与只读历史版本。
- 图片 / 视频 / 文档交互原型。
- 客户确认 Modal 和报价 / 确认值并列展示。
- 转正式订单的前置校验 UI。

### Phase 5：确认后再做数据契约

- 根据已确认 UI 反推 API 请求 / 响应契约。
- 单独评审数据模型、附件存储、历史快照和转单事务。
- 设计可逆迁移；不修改旧表、不覆盖历史数据。

## 16. 验收标准

- 新报价页面视觉上与现有 ERP 属于同一系统。
- 页面中没有客户字段和工厂款号字段。
- 总数量只能由价格版本数量计算。
- 历史版本与价格版本在命名、布局和交互上不会混淆。
- 每个价格版本切换后显示自己的独立成本。
- 复制价格版本弹窗只有名称、数量、说明。
- 复制后成本被复制，原版本不变。
- 所有销售单价使用 `成本 × (1 + markupRate%)`。
- USD 工价明确显示输入币种、汇率和 RMB 换算。
- 三个日期均可通过日期面板底部“设置为空”。
- 图片可切换预览、视频可播放、资料文件可下载和删除。
- 历史版本只读、可查看、可基于旧版本复制。
- 客户确认值不会覆盖报价值。
- 旧 `/` 页面、旧 API 和生产数据没有任何变化。

## 17. 风险与控制

| 风险 | 控制方式 |
| --- | --- |
| 抽取全局样式导致旧页面变化 | 新 Foundation 使用新增 class 和文件；先不改旧 CSS 选择器 |
| 不小心调用旧报价 API | UI V1 使用独立 repository interface 和 mock 实现 |
| 历史版本与价格版本混淆 | 类型、组件、URL 参数和文案全部使用不同命名 |
| 旧公式被继续使用 | 新计算函数独立文件并写公式测试 |
| 响应式成本表不可用 | 小屏使用横向滚动或分组 Card，不缩小到不可读字号 |
| 附件交互提前绑定存储方案 | UI V1 只定义前端对象 URL 和状态，不设计后端 |
| 当前测试无法回归 | Foundation 与报价 UI V1 同步新增组件和计算测试 |
| 现有工作区含未提交改动 | 每阶段限定新增目录，合并前人工检查 diff |

## 18. 已确认的产品决定

1. 品牌和业务员使用支持关键词搜索的 Select，Slice 1 数据来自 mock fixtures。
2. 报价日期默认当天但允许为空；面料交期和成衣交期默认 `null`；日期面板底部提供“设置为空”。
3. 每个 Revision 是完整报价快照，历史 Revision 只读；历史切换属于后续 Slice。
4. 客户确认归属于每个 PriceVersion；复制 PriceVersion 时复制成本但不复制客户确认。
5. 总数量只读，严格等于所有 `PriceVersion.quantity` 之和，不再设置目标总量。
6. 工价币种只控制输入口径，切换 CNY / USD 不改写用户输入数字；USD 通过 `usdCnyRate` 换算成人民币。
7. 计算字段只称 `markupRate`，公式为 `cost × (1 + markupRate / 100)`，不使用旧毛利率公式。
8. 不提供“新增价格版本”，只提供“复制当前价格版本”。

## 19. UI V1.1 录入体验规则

- 人工数字字段使用 `number | null` 业务值与字符串编辑草稿两层状态；空字符串不回写为 `0`，计算预览才把 `null` 临时视为 `0`。
- 新建报价的汇率、成本加成率、价格版本数量和工价默认为空；新增成本行的用量、损耗率和单价也默认为空。
- 成本名称、规格和单位使用空值加 Placeholder，不把提示文字写入 View Model。
- 成本行以永久 `row.id` 作为 React key；编辑字段不改变 ID，复制 PriceVersion 时重新生成目标行 ID。
- 面料和辅料成本卡片底部显示实时小计。
- 报价编辑器使用 Dirty State；返回列表、侧栏导航和返回旧 ERP 入口统一经过离开保护，刷新或关闭由 `beforeunload` 保护。
- 详情 Topbar 固定显示“款式报价明细”，Page Header 继续显示报价编号和款式名称。
- 桌面列表搜索框最大 520px，宽屏约占 FilterBar 45%～50%；平板适当放宽，手机独占第一行。
