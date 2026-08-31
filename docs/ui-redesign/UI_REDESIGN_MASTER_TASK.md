# 织序 ERP 全系统 UI/UX 重构 — 总实施任务

你现在开始执行织序 ERP 的一次正式、系统性的前端 UI/UX 重构。

这是第一次正式 UI 重构任务。

此前的：

`docs/legacy-bs-ui-audit/`

已经完成旧 BS 系统的 UI/UX 审计以及桌面、半屏、缩放和移动端补充审计。

本轮不要重新做需求设计。

必须先以现有审计资料、当前真实代码、PROJECT 状态和已确认业务规则为依据，再实施 UI。

---

# 一、任务目标

本轮目标不是：

- 单纯“美化”
- 换颜色
- 增加动画
- 做成通用 SaaS 后台
- 降低信息密度
- 把所有页面 Card 化
- 把桌面页面简单缩放到手机

真正目标：

> 在完全保留当前业务领域模型、数据规则和历史数据的前提下，重新建立一套适合服装 ERP 高频工作的页面架构、信息层级、响应式策略和组件体系。

最终体验应该做到：

**高信息密度 + 高扫描效率 + 低滚动成本 + 低页面跳转成本 + 清晰业务上下文。**

用户应该更快完成：

搜索 → 判断 → 编辑 → 保存 → 切换对象 → 查看历史 → 进入上下游业务。

---

# 二、开始前必须完整读取事实来源

开始修改任何 UI 代码之前，先完整阅读：

## 项目事实

当前仓库中最新：

- PROJECT_MASTER
- CURRENT_STATE
- DECISIONS / DECISION_LOG
- 项目索引或对应现行事实文件

如果名称不同，以仓库现行文件为准。

## UI 审计资料

完整读取：

`docs/legacy-bs-ui-audit/README.md`

`docs/legacy-bs-ui-audit/page-index.md`

`docs/legacy-bs-ui-audit/working-environment-audit.md`

`docs/legacy-bs-ui-audit/viewport-matrix.md`

`docs/legacy-bs-ui-audit/mobile-audit.md`

以及：

`docs/legacy-bs-ui-audit/pages/*.md`

并查看关键截图：

`docs/legacy-bs-ui-audit/screenshots-working-env/`

`docs/legacy-bs-ui-audit/screenshots-mobile/`

不要依赖早期已经废弃的 767×900 第一轮截图。

当前有效 UI 设计证据以：

工作环境截图

和：

移动端截图

为准。

---

# 三、事实冲突优先级

如果文档、旧讨论和真实代码有差异：

优先级：

当前用户明确要求

>

最新 CURRENT_STATE

>

有效 DECISIONS / PROJECT_MASTER

>

当前真实代码实现

>

较旧 UI 审计结论

>

旧讨论

>

AI 推测

不要为了“看起来更合理”修改已经确认的业务规则。

---

# 四、本轮允许修改

允许：

- 页面布局
- 信息架构
- PageHeader
- Toolbar
- 表格展示
- 列宽
- 固定列
- Sticky
- Drawer
- Dialog
- Sheet
- Mobile Layout
- Workspace
- Sidebar
- 页面导航
- 状态视觉
- 空状态
- Loading
- Error
- Responsive Behavior
- UI Foundation
- 共用组件
- 表单分区
- 页面间返回上下文
- 现有数据的前端派生展示

允许适度重构 React Component 结构，以降低重复和提高响应式可维护性。

---

# 五、本轮禁止修改

禁止借 UI 重构：

- 修改 Quote / QuoteRevision / PriceVersion 领域含义
- 合并 QuoteRevision 与 PriceVersion
- 修改 defaultRevisionId 规则
- 修改报价计算公式
- 修改面料成本公式
- 修改面料单耗正式精度规则
- 修改 USD 工价转换规则
- 修改最终报价截断规则
- 修改客户确认规则
- 修改 EstimateCost 归属
- 修改 Order 数量历史规则
- 修改 OrderPriceVersion 历史
- 合并订单状态 / 生产状态 / 关账状态
- 修改 DeliveryPlan / ScheduleAssignment 边界
- 修改外发事实归属
- 修改 OperationLog 体系
- 新建第二套日志
- 新建第二套权限
- 修改 AttachmentRepository
- 修改 Backup / Restore 逻辑
- reset DEV 数据
- 覆盖 DEV 用户数据
- 通过换 storage key 逃避 Migration
- 修改旧 PostgreSQL Legacy 表

UI 不允许复制第二套 Calculator。

所有业务计算继续来自现有：

Service

Calculator

Selector

Repository

Aggregator。

---

# 六、不要随 UI 偷偷增加新业务模型

如果审计建议中出现某些当前并不存在的字段，例如：

面料编码

新分类

供应商等级

外发厂质量等级

联系人新实体

新的生产能力字段

新的关系模型

如果真实领域中不存在：

不要为了 UI 页面完整擅自新增。

处理原则：

已有数据 → 直接使用

可安全派生 → 前端派生

不存在 → 不伪造

需要正式新模型 → 最终报告列入“后续业务建议”

---

# 七、视觉体系

保持织序 ERP 当前视觉 DNA。

继续使用：

- 深森林绿
- 深色侧栏
- 暖灰 / 米灰页面背景
- 白色主要业务区域
- 灰绿色次级文字
- 少量金棕辅助强调
- 低对比边框
- 克制阴影
- 克制圆角

不要改成：

蓝色 SaaS

Material

Ant Design 默认蓝风格

高饱和科技风

渐变后台

Glassmorphism

大面积阴影。

不要为了新版 UI 引入新的大型 UI Library。

继续使用当前组件体系。

---

# 八、字体和密度

ERP Desktop 必须保持较高信息密度。

建议基线：

一级页面标题：

24–28px

业务区标题：

16–18px

正文：

12–14px

表头：

11–13px

辅助信息：

11–12px

输入框：

约 40–44px

按钮：

约 36–40px

标准业务表格：

约 40–46px

一级品牌标题可以保留少量 Serif。

大量业务区标题改为 Sans。

不要所有页面都使用巨大 Georgia / 宋体标题。

---

# 九、减少无效留白

旧页面存在：

大 Page Title

大说明

大 Card

大筛选区域

导致首屏业务内容不足。

新版页面：

顶部尽量紧凑。

优先让用户尽早看到：

数据

状态

表格

工作内容。

PageHeader 不要占据 150–250px 垂直空间。

---

# 十、减少 Card 套 Card

不要继续：

页面

→ Card

→ 小 Card

→ 输入 Card

→ 状态 Card

优先使用：

Section

Divider

Subtle Background

Border

Typography

Spacing

建立层级。

Card 只用于真正独立业务区域。

---

# 十一、建立统一 UI Foundation

优先建立并复用：

## PageHeader

## Toolbar

## DataGrid / BusinessTable

## StatusBadge

## WorkspaceHeader

## SectionNavigation

## ContextSummary

## SaveBar

## Drawer

## Dialog

## BottomSheet / MobileSheet

## EmptyState

## LoadingState

## ErrorState

## DetailRow / DescriptionList

不要过度抽象成一个复杂 Design System。

目标是解决真实页面重复。

---

# 十二、PageHeader 统一

标准业务列表：

左：

标题

结果数量 / 简短说明

右：

一个 Primary Action

Secondary Actions

More

例如：

报价中心 [+ 新建报价]

共 36 条报价 [批量导出] [···]

下面直接：

Toolbar

不要在多个位置出现重复的：

新增

保存

导出

按钮。

一个主要区域默认只存在一个视觉 Primary Button。

---

# 十三、按钮等级

统一：

## Primary

保存

新增报价

新增订单

确认

## Secondary

导出

复制

页面设置

进入排单

## Tertiary

查看历史

下载

详情

## Danger

删除

取消订单

结束生产

重置数据

危险操作优先放：

`···`

或 Danger Zone。

不要与普通编辑并列。

---

# 十四、Toolbar

搜索和筛选不要再放巨大 Card。

统一为紧凑 Toolbar：

搜索

主要筛选

更多筛选

右侧：

视图

列设置

密度

页面设置。

例如：

[ 搜索订单/PO/款号/客户 ] [状态▼] [类型▼] [更多筛选] [列设置]

---

# 十五、响应式不能只分 Desktop / Tablet / Mobile

根据当前实际工作环境，至少建立以下行为模式。

不要根据设备型号写死 CSS。

断点最终根据内容真正失效的位置调整。

推荐初始思路：

## Wide Desktop

约 ≥1440 CSS px

适合：

完整 Sidebar

完整 DataGrid

Master–Detail

可选右侧 ContextPanel

---

## Primary Desktop

约 1100–1439 CSS px

这是非常重要的正式工作环境。

尤其考虑：

1920×1080

Windows 125%

Browser 125%

等实际使用场景。

必须保证：

完整 ERP 工作能力。

不要把这一档当“平板”。

---

## Compact Desktop / Half-screen

约 720–1099 CSS px

鼠标/键盘环境仍然要能够完成完整业务。

特点：

单列 Workspace

压缩列

部分字段只读

Toolbar 收纳

Drawer 替代固定右栏

---

## Tablet

根据 Touch + 实际宽度识别。

不是只根据 px。

---

## Mobile

约 <600 CSS px。

重点验收：

iPhone 17 Pro

iPhone 17 Pro Max。

Mobile 是任务式 UI。

---

# 十六、Sidebar

Desktop：

保留深森林绿。

Wide / Primary Desktop：

可以展开。

Compact：

可以收起。

收起后子菜单必须仍可达：

Tooltip

Flyout

Drawer。

Mobile：

Desktop Sidebar 完全消失。

使用：

顶部 Mobile App Header

-

菜单 Drawer。

不要保留占 70–80px 的 Desktop Rail。

---

# 十七、DataGrid 总原则

普通业务列表，例如：

报价中心

订单中心

基础资料

允许：

Sticky Header

固定首列

固定操作列

横向滚动

列设置

用户列宽设置

因为这些页面主要用于：

扫描很多对象。

但是：

**报价成本表属于特殊情况，后文有独立规则。**

不得把普通 DataGrid 规则机械套到报价成本区。

---

# 十八、报价中心

重新设计：

`/quote-center`

目标：

高扫描效率。

顶部：

报价中心

结果数量

新增报价

导出 / 复制 / 页面设置。

Toolbar：

搜索：

报价号

款号

款式

客户

品牌

已有搜索能力。

筛选：

报价类型

状态

其他已有条件。

---

# 十九、报价中心表格

优先字段：

报价识别

款号 / 款式

客户 / 品牌

类型

当前 QuoteRevision

PriceVersion 摘要

客户确认状态

状态

更新时间

操作。

固定：

左侧最主要业务识别列

右侧操作。

半屏：

次级字段允许隐藏到：

详情摘要

或：

Secondary Line。

不要让所有列一直硬撑。

---

# 二十、报价详情是 P0

报价详情需要改成真正 Workspace。

不要继续无限纵向堆：

基础资料

PriceVersion

面料

辅料

工价

其他费用

确认

附件

历史。

现有 Sticky / 快速导航已经有效：

继续保留并优化。

不要推倒重做。

---

# 二十一、报价详情顶部

顶部固定 Workspace Header。

内容：

返回报价中心

款号

款式名称

品牌

客户

报价类型

当前状态

右侧：

保存

导出

更多。

不要让报价号成为最大视觉元素。

款号是最重要识别信息之一。

---

# 二十二、报价详情导航

整理为：

概览

基础资料

成本

价格版本

客户确认

附件

历史

可以继续采用 Sticky Anchor。

不要强制改成完全独立页面 Tab。

目标：

用户知道自己位于哪个业务区。

---

# 二十三、PriceVersion 必须成为一级业务上下文

PriceVersion 不要只是弱化 Select。

例如：

价格版本

[ 中国 · 1000件 ]

FOB RMB 45.1

[ 柬埔寨 · 1000件 ]

FOB RMB 42.3

[ + ]

当前版本明显高亮。

切换后：

成本

工价

报价参数

客户确认

全部在相同上下文中变化。

---

# 二十四、QuoteRevision 和 PriceVersion UI 必须严格区分

QuoteRevision：

历史报价版本。

PriceVersion：

当前 Revision 内不同价格方案。

不能都叫“版本”。

不能视觉混杂。

QuoteRevision 更适合历史区。

PriceVersion 更适合报价工作区。

---

# 二十五、报价价格摘要响应式

## Wide Desktop

如果实际空间足够：

可以采用：

主成本工作区

-

右侧 ContextPanel。

右侧显示：

当前 PriceVersion

面料

辅料

工价

其他

成本

最终报价。

---

## Primary Desktop / 约 1280

不要强制固定 300px 右栏。

优先：

顶部或成本区 Sticky Summary。

例如：

柬埔寨 · 1000件

面料 ¥13.57

辅料 ¥9.18

工价 ¥12.00

FOB RMB 42.3

保证成本区有足够宽度。

---

## Compact Desktop

改成：

Compact Summary Bar。

例如：

柬埔寨 · 1000件

FOB RMB 42.3

[查看价格摘要]

点击 Drawer。

---

# 二十六、报价成本区 — 最高优先级特殊规则

报价成本区的设计目标与普通 DataGrid 不同。

普通列表重点：

扫描多个对象。

报价成本区重点：

- 看完整成本结构
- 查看面料规格
- 修改报价参数
- 判断成本
- 观察最终报价变化

因此成本区必须遵守：

> 完整展示 > 压缩视觉 > 降低编辑复杂度 > 字段组合 > 最后才使用横向滚动。

横向滚动不能是成本区默认方案。

---

# 二十七、屏幕变窄时不要简单隐藏成本字段

必须严格区分：

**需要看到**

和：

**需要编辑**

屏幕变窄：

优先减少：

同时可编辑控件。

不要首先减少：

业务信息。

例如：

门幅

克重

供应商

采购单位

这些即使不能方便编辑，也仍然对报价判断有价值。

因此在 Compact 场景：

可以转为 Read-only。

而不是 Hidden。

---

# 二十八、面料成本字段分层

根据当前真实字段划分。

## A. 识别信息

例如：

面料名称

成分

供应商

尽可能长期可见。

---

## B. 面料规格 / 资料

例如：

段长

净门幅

克重

采购单位

供应商等。

Wide / Primary：

尽量显示。

如果业务当前允许编辑：

可以编辑。

Compact：

优先保持可见但只读。

---

## C. 高频报价 / 计算信息

例如：

损耗率

单价

单耗

面料成本。

这些在报价判断中优先级最高。

Compact Desktop 仍然优先可见。

是否可编辑完全遵守当前真实业务逻辑。

---

# 二十九、Wide Desktop 成本表

目标：

尽可能全部字段同屏。

例如：

面料名称

成分

供应商

段长

门幅

克重

损耗率

单价

采购单位

单耗

面料成本。

要求：

尽量不横向滚。

数字右对齐。

单位紧凑。

名称列更宽。

成分允许合理换行。

供应商不无限扩宽。

不要因为屏幕宽就把每列设计得很宽。

---

# 三十、1280 左右成本区必须仍然尽量完整

这是正式高频工作环境。

不能过早：

隐藏门幅

隐藏克重

隐藏供应商

隐藏采购单位

或把大量字段塞入 Drawer。

首先通过：

减少 padding

缩小列宽

数字紧凑

单位移到表头

合理两行表头

Secondary Line

来解决。

---

# 三十一、减少重复单位

例如表头：

门幅(cm)

单元格：

185

不必：

185 cm。

克重：

180

单价：

¥13.50

损耗：

3%

单耗：

0.7264。

减少单位重复可以显著节省宽度。

---

# 三十二、Compact Cost Mode

在半屏 / 更窄 Desktop：

成本表进入 Compact Cost Mode。

目标：

尽量仍然看到：

面料

成分

门幅

克重

单价

损耗

单耗

成本。

但是：

门幅、克重等低频字段可以只读。

可编辑字段继续 Input。

例如：

面料 | 成分 | 门幅 | 克重 | 单价 | 损耗 | 单耗 | 成本

针织布 | 95棉5氨 | 185 | 180 | ¥13.50 | 3% | 0.7264 | ¥9.81

---

# 三十三、只读字段不要显示 Disabled Input

错误：

灰色 disabled input。

正确：

普通数据文本。

例如：

185

180

可编辑：

真正 Input。

这样用户能够一眼判断：

哪里能改。

同时减少视觉噪声。

---

# 三十四、低频可编辑字段进入完整编辑 Drawer

如果当前业务允许报价中修改：

门幅

克重

段长

供应商

采购单位

等。

Compact Desktop 主表可以：

只读。

提供：

`···`

或：

编辑完整面料资料。

进入 Drawer。

这里编辑的仍然必须是：

当前报价快照。

绝不能因此修改面料库主数据。

---

# 三十五、面料库与报价快照必须认知清晰

如果报价中的面料来自：

面料库深复制。

UI 可以通过：

Tooltip

说明

Drawer

表达：

当前是报价快照。

后续面料库变化不会自动修改当前历史报价。

不要让用户误以为：

修改报价门幅 = 修改面料库。

---

# 三十六、Compact 下允许组合部分低频字段

如果仍然太宽：

允许组合：

门幅 / 克重

供应商作为名称第二行

成分作为名称第二行

等。

例如：

40S 精梳棉

95%棉 5%氨纶。

但：

1280 左右优先保持独立列。

不要过早合并。

---

# 三十七、成本横向滚动是最后兜底

必须完成：

压缩 padding

单位优化

只读字段去 Input

合理列宽

文本 Secondary Line

低频字段组合

Drawer 编辑

以后仍然不够：

才允许小范围横向滚动。

如果需要滚：

固定：

面料名称

以及重要结果列。

用户滚动后不能只剩一排数字。

---

# 三十八、辅料成本

同样遵守：

完整展示优先

高频编辑优先

低频信息只读化。

但是不要机械复制面料列。

根据真实辅料字段设计。

---

# 三十九、工价

字段通常比面料少。

Desktop / Compact：

尽量全部展示。

币种

原始工价

折合结果

必须保持正式语义。

UI 不能重算汇率。

继续使用系统 Calculator / Service。

---

# 四十、其他费用

字段少。

尽量完整展示。

不要为了统一 DataGrid 而人为制造横向大表。

---

# 四十一、报价 Mobile

Mobile 不复制 Desktop 成本表。

报价详情第一屏：

款号

客户 / 品牌

报价类型

当前 PriceVersion

最终报价。

例如：

B55-TEST

ZARA · 经销

柬埔寨 · 1000件

FOB RMB

42.3

---

# 四十二、Mobile 成本

使用成本摘要：

面料

辅料

工价

其他

最终报价。

点击面料：

显示面料卡片。

例如：

40S 精梳棉

95%棉 · 5%氨纶

门幅 185cm · 克重 180gsm

供应商 XX

单价 ¥13.50

损耗 3%

单耗 0.7264

面料成本 ¥9.81。

---

# 四十三、Mobile 成本编辑

点击：

编辑报价参数。

打开：

Bottom Sheet

或：

Full-screen Form。

只优先编辑当前高频字段。

完整低频资料进入：

查看完整面料资料。

不要在 402px 宽度放十几个横向 Input。

---

# 四十四、订单中心是 P0

最终审计已经明确：

订单中心默认表格过宽。

不能只靠一直横向滚。

重新确定默认核心字段：

款号

订单号

客户 / PO

有效数量

交期

订单状态

生产状态

关账状态

操作。

次级字段通过：

列设置

展开详情

Secondary Line

显示。

---

# 四十五、订单三种状态必须严格分开

列表明确显示：

订单状态

生产状态

关账状态。

不能再合并万能 status。

这是正式领域边界。

---

# 四十六、订单详情改成驾驶舱

打开订单第一屏必须快速回答：

什么款

什么订单

哪个客户

哪个 PO

多少件

什么时候交

现在什么状态

有没有异常。

例如：

B55-TEST

SO-20260828-007

DEV客户 · PO-A102

12,000件

最终交期 09-28

订单 已确认

生产 生产中

关账 未关账

⚠ 交期临近。

---

# 四十七、订单详情结构

组织为：

概览

商务资料

数量与交期

生产执行

物料 / 物流

价格 / 关账

附件 / 操作记录。

不要把所有字段继续纵向无限铺开。

---

# 四十八、订单历史

数量历史

价格历史

必须保持不可变事实。

默认紧凑摘要。

例如：

08-22

10000 → 12000

+2000

张三。

详细原因、operationId 等：

点击后 Drawer。

---

# 四十九、新建订单 / 新建报价

不要用巨大空白长表单。

使用分段 FormShell。

不是强制不能跳过的 Wizard。

允许自由切换 Section。

例如：

基本身份

客户 / 商务

数量 / 价格

成本 / 执行资料

确认。

顶部显示缺失项。

点击缺失项直接跳对应 Section。

---

# 五十、Unsaved Changes

只有真实修改：

`isDirty = true`。

刚打开空白页面不能自动算 dirty。

离开：

有未保存修改

继续编辑

不保存并返回

保存并返回。

---

# 五十一、生产排单是 P0

生产排单定位为真正调度工作台。

Wide Desktop：

优先 Master–Detail。

左：

生产组 / 异常。

右：

当前生产组队列。

---

# 五十二、生产组总览

卡片不要只显示名字。

根据当前已有真实数据展示：

当前执行款

待生产数量 / 款数

预计排至日期

风险数量

其他已有可安全聚合指标。

不要编造不存在的“产能利用率”。

---

# 五十三、排单响应式

Wide：

Master–Detail。

Primary Desktop：

左栏可缩窄 / 收起。

Compact：

顶部：

生产组选择器

下面：

当前

待生产

异常

队列。

不要在半屏强撑两栏。

---

# 五十四、排单双视图

提供：

紧凑表格

时间轴。

表格：

精确数据。

时间轴：

日期关系。

不要强迫用户只能用甘特。

Mobile：

纵向队列 / Timeline。

不默认大型横向甘特。

---

# 五十五、排单异常

异常必须比普通状态明显。

例如现有：

交期风险

物料风险

排单冲突

数据缺失。

只能使用当前已有的正式判断逻辑。

不要新造告警规则。

---

# 五十六、生产结束

结束生产属于高影响操作。

不要和编辑并列同样按钮。

放：

More / Danger。

确认弹窗显示：

款号

数量

完成情况

影响。

---

# 五十七、用户权限

Wide：

Master–Detail。

左：

用户 / 角色。

右：

权限。

支持：

搜索权限

全部

仅已授权

仅未授权

仅差异。

PermissionKey：

降级为技术辅助信息。

---

# 五十八、权限分组

继续按照现有 Permission Group。

组头：

报价 7/9

订单 5/8

排单 3/5。

支持：

本组全选。

权限数量动态计算。

不要 hardcode：

43。

---

# 五十九、权限响应式

Compact：

用户列表

→

进入权限详情。

不要强制两栏。

Mobile：

优先查看。

大规模权限配置提示桌面完成。

---

# 六十、OperationLog

保持正式名称：

OperationLog。

不恢复：

AuditEvent。

不要新建：

OrderLog

ScheduleLog。

---

# 六十一、OperationLog UI

Desktop：

紧凑日志列表。

核心：

时间

用户

动作

对象

模块

摘要。

点击：

Detail Drawer。

Drawer 优先显示：

业务语言。

技术：

operationId

entityType

context

raw metadata

放折叠区。

不要默认展开 JSON。

---

# 六十二、OperationLog Mobile

使用 Timeline。

例如：

13:21

张三

调整订单数量

10000 → 12000。

点击：

Full-screen Detail。

---

# 六十三、基础资料统一

统一：

品牌

客户业务员

面料

辅料

生产组

外发厂。

使用：

PageHeader

Search Toolbar

Master Data Table

Drawer / Modal。

不要每个页面重新发明交互。

---

# 六十四、Modal / Drawer 规则

## Modal

适合：

约 1–6 个简单字段。

例如：

生产组

月度目标。

## Drawer

适合：

7–20 个字段

有多个分区。

例如：

面料

辅料

业务员

OperationLog Detail。

## Workspace

报价

订单。

不要大型长表单全部 Modal 化。

---

# 六十五、品牌 / 业务员

品牌：

默认值来源清楚显示：

系统

品牌。

业务员：

基本信息

覆盖设置。

覆盖设置可折叠。

显示来源：

个人

品牌

系统。

---

# 六十六、面料库

面料库本身属于完整编辑主场景。

所以：

门幅

克重

供应商

采购单位

价格

等字段在面料库中可以完整编辑。

这与报价成本区 Compact 模式不同。

报价 Compact 只是降低编辑复杂度。

不要减少面料库能力。

---

# 六十七、辅料库

与面料库统一 Master Data 架构。

不要新增不存在的分类模型。

单位如果当前是自由文本：

可以优化 UI 建议。

不能偷偷改变数据含义。

---

# 六十八、生产组 / 外发厂

历史引用对象优先：

启用

停用。

不要把：

删除

做主操作。

继续使用稳定 ID。

不要把名称当身份。

---

# 六十九、报价设置

改为 SettingsPage。

分区：

系统默认

ManufacturingPreset

工序说明

其他当前设置。

固定 SaveBar。

显示：

已修改

已保存。

---

# 七十、ManufacturingPreset

不要长表单全部展开。

使用：

Preset List

-

Detail。

例如：

中国制作

CNY

13%

无运费。

柬埔寨制作

USD

5%

带运费。

强调：

预设是默认值。

不是强制锁定。

---

# 七十一、模板设置

使用标准 DataGrid。

列：

模板名

文件名

类型

版本

默认

更新时间

操作。

创建模板流程：

上传

验证

发布。

已有模板验证规则继续复用。

---

# 七十二、用户可用 placeholder

不要巨大静态弹窗。

改为 Drawer。

支持：

搜索

分组

复制。

例如：

客户名称

`{{customerName}}`

[复制]。

---

# 七十三、生产与运输

不要继续五组 Card 同时纵向展开。

顶部提供：

关系总览

生产日历

生产地点

供应枢纽

运输路线

运输方式。

---

# 七十四、生产运输关系总览

使用现有数据绘制简单关系。

例如：

深圳供应枢纽

→ 陆运 2天

→ 东莞生产地点

→ 中国生产日历。

不需要第三方复杂图编辑器。

CSS / SVG / HTML 即可。

---

# 七十五、生产日历

如果旧 UI 使用裸 JSON / 数字：

改成人类可操作 UI。

工作日：

周一～周日 Checkbox。

特殊日期：

日期

工作 / 休息

备注。

保存时可转换成现有底层数据格式。

不要因此重构正式领域。

---

# 七十六、关账设置

统一 SettingsPage。

默认税率

月度生产目标。

目标金额千分位。

如果真实 Closing Actual 尚不存在：

不要伪造“实际完成率”。

---

# 七十七、数据管理

分成：

备份恢复

Danger Zone。

不要让：

导入

导出

Reset

挤在一起。

Reset：

高风险。

显示环境

影响范围

二次确认。

不得因为 UI 测试执行 Reset。

---

# 七十八、Mobile 总原则

Mobile 不是 Desktop 缩小版。

Mobile 定位：

查看

快速确认

轻编辑

现场操作。

适合：

查报价

查订单

查交期

查状态

客户确认

附件

拍照

备注

简单参数

查看排单

查看异常。

---

# 七十九、iPhone 验收设备

重点：

iPhone 17 Pro

约 402 CSS px。

iPhone 17 Pro Max

约 440 CSS px。

设备只是验收目标。

不要写设备型号专用 breakpoint。

---

# 八十、Mobile Safe Area

使用：

`env(safe-area-inset-*)`

适当使用：

100dvh

100svh

100lvh。

不要只使用固定：

100vh。

Bottom Action

Drawer

Sheet

Toast

不得被 Safari / Home Indicator 遮挡。

---

# 八十一、Mobile 搜索

列表页顶部：

Sticky Search。

筛选进入：

Bottom Sheet。

不要永久展开多个筛选器。

Bottom Sheet：

重置

查看 X 条结果。

---

# 八十二、Mobile 订单卡

订单列表不显示桌面表格。

例如：

B55-TEST

SO-20260828-007

DEV客户 · PO-A102

12,000件

09-28

订单 已确认

生产 生产中

关账 未关账

⚠ 风险。

---

# 八十三、Mobile 报价卡

报价列表：

款号

客户 / 品牌

PriceVersion 摘要

最终报价

报价状态

确认状态。

不要只剩款号和“打开”。

---

# 八十四、Mobile 订单详情

订单驾驶舱必须保留。

第一屏：

款号

订单号

客户

PO

数量

交期

三种状态

风险。

后续 Section：

商务

数量交期

生产

物流

价格关账

附件日志。

---

# 八十五、Mobile 附件

附件属于一级能力。

继续复用：

AttachmentRepository。

支持：

文件

相册

拍照

Preview

删除

设置款式图。

不能建立 Mobile Attachment 第二通道。

---

# 八十六、Mobile Touch

主要点击区域：

至少约 44 × 44 CSS px。

尤其：

返回

关闭

More

删除

附件

Checkbox。

不要把 Desktop 小图标按钮直接搬过去。

---

# 八十七、Mobile Keyboard

真实验收：

搜索

备注

客户确认

简单编辑。

键盘打开：

输入不能被遮挡。

Sticky Bottom Save 不与键盘冲突。

---

# 八十八、Mobile Drawer

Desktop Right Drawer：

Mobile 默认变：

Full-screen Sheet

或：

Large Bottom Sheet。

不要保留 320px 右侧窄 Drawer。

---

# 八十九、状态和异常

统一 StatusBadge。

但是：

异常 ≠ 状态。

例如：

订单：

已确认

是状态。

交期临近：

是异常。

异常必须拥有更高视觉注意力。

---

# 九十、Loading / Error / Empty

统一设计。

Loading：

避免布局跳动。

Error：

明确失败原因。

提供重试。

权限：

显示无权限。

Empty：

只提供一个明确 CTA。

如果顶部已经有新增：

空态不要再放第二个巨大新增按钮。

---

# 九十一、返回上下文

从：

订单 → 排单

报价 → 订单

订单 → 关账

返回时尽量保留：

来源对象

筛选

搜索词

当前 View。

Workspace 顶部明确：

← 返回订单中心

← 返回报价中心。

---

# 九十二、性能

重点页面：

报价详情

订单详情

排单

权限

OperationLog。

避免一个超大 Client Component。

合理：

拆分 Section

selector

memo

局部 state

lazy detail。

但不要破坏现有 React → Service → Repository 边界。

---

# 九十三、可访问性

Icon Button：

aria-label / tooltip。

Dialog：

Focus trap。

Drawer：

ESC。

表单：

正确 label。

危险操作：

不能只通过颜色表达。

Keyboard：

Tab 顺序合理。

---

# 九十三-A、滚动容器硬规则

**页面默认只能存在一个主要纵向滚动容器，Drawer/Sheet 作为独立 Overlay 例外。**

允许：

- 页面主纵向滚动
- DataGrid 自身必要的横向滚动
- 独立 Overlay Drawer / Sheet 自身纵向滚动

避免形成：

页面滚动

→ Card 内滚动

→ Table 内纵向滚动

→ Inner Panel 再滚动

等多层纵向滚动结构。

---

# 九十三-B、Phase Gate 硬规则

**每个 Phase 必须单独提交、单独浏览器验收并输出差异；上一 Phase 未通过不得机械进入下一 Phase。**

每个 Phase 完成后必须先：

- 完成当前 Phase 代码实现
- 运行当前仓库正式质量检查
- 完成对应页面真实浏览器验收
- 输出本 Phase 实际修改内容
- 输出发现的问题及修复情况
- 明确当前 Phase 是否通过

只有当前 Phase 已经通过：

才能继续下一 Phase。

不得因为后续任务很多而跳过本 Phase 的验收。

---

# 九十四、实施顺序

不要一次把所有页面同时大改。

按 Phase 执行。

---

## Phase 1 — Foundation

先建立：

PageHeader

Toolbar

Button hierarchy

StatusBadge

Drawer

Dialog

SaveBar

Workspace

DataGrid

Mobile Sheet

Typography / Spacing。

完成后运行检查。

---

## Phase 2 — P0

按顺序：

1. 订单中心
2. 报价详情
3. 订单详情
4. 生产排单
5. 报价中心
6. 新建报价
7. 新建订单

这一阶段必须先建立核心体验。

---

## Phase 3 — P1

8. 用户权限
9. OperationLog
10. 生产与运输
11. 报价设置
12. 模板设置。

---

## Phase 4 — 基础资料

13. 品牌
14. 客户业务员
15. 面料库
16. 辅料库
17. 生产组
18. 外发厂
19. 关账设置
20. 数据管理。

---

# 九十四-A、实际交付 Phase 拆分

上面的 Phase 1–4 继续作为功能优先级分类，不修改。

为了避免一次改动范围过大，实际 Codex 实施时按下面 **Phase 0–7** 分批交付。

每个交付 Phase 都必须遵守前述 Phase Gate。

---

## Delivery Phase 0 — 事实恢复与真实代码审查

这一阶段禁止修改 UI 代码。

必须完成：

### 项目事实恢复

完整读取：

- 最新 PROJECT_MASTER
- 最新 CURRENT_STATE
- 最新 DECISIONS / DECISION_LOG
- 项目索引或当前等价事实文件

### UI 审计恢复

完整读取：

- `docs/legacy-bs-ui-audit/README.md`
- `docs/legacy-bs-ui-audit/page-index.md`
- `docs/legacy-bs-ui-audit/working-environment-audit.md`
- `docs/legacy-bs-ui-audit/viewport-matrix.md`
- `docs/legacy-bs-ui-audit/mobile-audit.md`
- `docs/legacy-bs-ui-audit/pages/*.md`

查看：

- `screenshots-working-env`
- `screenshots-mobile`

### 真实代码审查

检查：

- 当前 AppShell / Sidebar
- Layout
- PageHeader
- Table / DataGrid
- Drawer / Dialog
- Quote 页面
- Order 页面
- Schedule 页面
- Permission 页面
- OperationLog 页面
- 基础设置页面
- Responsive CSS / hooks
- 当前 Foundation Component
- 当前业务组件

确认：

哪些组件可以复用。

哪些组件应该重构。

哪些页面存在重复实现。

哪些审计问题已经在后续代码中被解决。

哪些仍然存在。

### 输出

Delivery Phase 0 结束时只输出：

- 当前事实源
- 当前真实 UI 架构
- 拟重构 Foundation 边界
- 不修改的业务边界
- Phase 1 实施范围

不得修改代码。

Phase 0 未完成不得进入 Phase 1。

---

## Delivery Phase 1 — UI Foundation

对应原：

Phase 1 — Foundation。

实现：

- PageHeader
- Toolbar
- Button hierarchy
- StatusBadge
- Drawer
- Dialog
- SaveBar
- Workspace
- DataGrid
- Mobile Sheet
- Typography / Spacing
- AppShell Responsive Behavior
- Mobile App Header
- Compact Sidebar / Drawer
- EmptyState
- LoadingState
- ErrorState
- DetailRow / DescriptionList

重点建立：

Wide Desktop

Primary Desktop

Compact Desktop

Tablet

Mobile

五档行为能力。

本 Phase 不要求把所有业务页面全部迁移。

优先通过少量代表页面验证 Foundation。

完成后：

单独提交。

运行质量检查。

浏览器验收 Foundation 代表页。

输出差异。

Phase 1 未通过不得进入 Phase 2。

---

## Delivery Phase 2 — P0-A：订单中心 + 报价详情

实现：

### 订单中心

- PageHeader
- Toolbar
- 默认核心列
- Sticky Header
- 固定主要识别列
- 固定操作列
- Secondary Line
- Compact Desktop
- Mobile Order Card
- 状态 / 异常分离
- 三种状态严格独立
- 搜索 / 筛选响应式

### 报价详情

- Workspace Header
- 款号主识别
- QuoteRevision / PriceVersion UI 严格分离
- PriceVersion 一级上下文
- Sticky Section Navigation
- Context Summary
- 成本区 Wide
- 约 1280
- Compact Cost Mode
- Mobile Cost Card
- Mobile Cost Editing
- Drawer 编辑低频资料
- 客户确认
- 附件
- 历史
- Unsaved Change 行为检查

报价成本区必须进行专项验收。

尤其约 1280：

不能因为实现困难直接使用大范围横向滚动。

完成后：

单独提交。

单独浏览器验收。

输出截图与差异。

Phase 2 未通过不得进入 Phase 3。

---

## Delivery Phase 3 — P0-B：订单详情 + 生产排单

实现：

### 订单详情

- Workspace Header
- 第一屏驾驶舱
- 客户 / PO / 数量 / 交期
- 订单状态
- 生产状态
- 关账状态
- 异常
- Section Navigation
- 商务资料
- 数量与交期
- 生产执行
- 物料 / 物流
- 价格 / 关账
- 附件 / 操作记录
- 数量历史
- 价格历史
- History Detail Drawer
- Mobile Order Detail

保持：

数量历史不可变。

价格历史不可变。

三种状态不可合并。

### 生产排单

- Wide Master–Detail
- Primary Desktop
- Compact Selector Layout
- 生产组总览
- 当前
- 待生产
- 异常
- 紧凑表格
- 时间轴视图
- Mobile Timeline
- 异常视觉
- 结束生产 Danger Action

不得新增不存在的产能或风险规则。

完成后：

单独提交。

单独浏览器验收。

输出差异。

Phase 3 未通过不得进入 Phase 4。

---

## Delivery Phase 4 — P0-C：报价中心 + 新建报价 + 新建订单

实现：

### 报价中心

- PageHeader
- Toolbar
- 核心字段
- QuoteRevision 摘要
- PriceVersion 摘要
- 客户确认状态
- Sticky
- 列设置
- Compact Layout
- Mobile Quote Card

### 新建报价

使用：

FormShell

分段 Section

非强制 Wizard。

支持：

缺失项提示

点击定位 Section

真实 isDirty

Unsaved Changes。

### 新建订单

使用：

FormShell

分段 Section

非强制 Wizard。

同样处理：

真实 isDirty

缺失项

保存与返回。

不得改变：

Quote / Order 现有创建业务逻辑。

完成后：

单独提交。

单独浏览器验收。

输出差异。

Phase 4 未通过不得进入 Phase 5。

---

## Delivery Phase 5 — P1 管理与系统工作台

对应原 Phase 3。

实现：

### 用户权限

- Master–Detail
- 用户 / 角色
- 权限搜索
- 全部
- 已授权
- 未授权
- 差异
- Permission Group
- 动态权限数量
- PermissionKey 降级
- Compact 单页切换
- Mobile 查看优先

继续使用现有 RBAC。

### OperationLog

- Desktop 紧凑列表
- Detail Drawer
- 业务语言优先
- 技术 Metadata 折叠
- Mobile Timeline
- Full-screen Detail

继续正式使用 OperationLog。

### 生产与运输

- 关系总览
- 生产日历
- 生产地点
- 供应枢纽
- 运输路线
- 运输方式

### 报价设置

- SettingsPage
- 系统默认
- ManufacturingPreset
- 工序说明
- SaveBar

### 模板设置

- DataGrid
- 上传
- 验证
- 发布
- Placeholder Drawer
- 搜索
- 分组
- 复制

完成后：

单独提交。

单独浏览器验收。

输出差异。

Phase 5 未通过不得进入 Phase 6。

---

## Delivery Phase 6 — 基础资料与低频设置

对应原 Phase 4。

统一重构：

### 品牌

### 客户业务员

### 面料库

### 辅料库

### 生产组

### 外发厂

统一使用：

- PageHeader
- Search Toolbar
- Master Data Table
- Modal / Drawer
- EmptyState
- LoadingState
- ErrorState
- Responsive Layout

保持：

ProductionGroup / OutsourceFactory 稳定 ID。

历史引用优先启用 / 停用。

名称不是身份。

### 关账设置

- SettingsPage
- 默认税率
- 月度生产目标
- 千分位金额

不得伪造 Closing Actual。

### 数据管理

分离：

- Backup / Restore
- Danger Zone

Reset：

高风险。

不得为了测试执行 Reset。

完成后：

单独提交。

单独浏览器验收。

输出差异。

Phase 6 未通过不得进入 Phase 7。

---

## Delivery Phase 7 — 全系统回归、截图、文档与项目状态

本 Phase 原则上不再进行大规模重新设计。

目标：

完成全系统最终回归和收口。

### 全系统质量检查

运行：

- TypeScript
- ESLint
- Tests
- Build
- git diff --check
- 当前仓库其他正式质量命令

### 浏览器验收

真实打开：

- 报价中心
- 报价详情
- 新建报价
- 订单中心
- 订单详情
- 新建订单
- 生产排单
- 用户权限
- OperationLog
- 生产与运输
- 面料库
- 代表性设置页

### Desktop 验收

至少：

- Wide Desktop
- Primary Desktop
- Compact / Half-screen

重点：

约 1280 工作区。

### Mobile 验收

至少：

- 报价列表
- 报价详情
- 成本卡
- 订单列表
- 订单详情
- 生产排单
- 附件
- 客户确认
- OperationLog
- Navigation Drawer
- Bottom Sheet
- 输入键盘状态

### 新版截图

创建：

`docs/ui-redesign/screenshots/`

不得修改：

`docs/legacy-bs-ui-audit/`

### 文档

创建：

`docs/ui-redesign/README.md`

### 项目状态

只有全部实际实施并验收通过后：

更新 CURRENT_STATE。

如果实际实施形成新的长期 UI 架构规则：

再更新 DECISIONS。

未经实际实施和确认的 AI 建议不得写入正式决策。

完成后：

单独提交最终收口。

输出完整最终报告。

---

# 九十五、每个 Phase 后必须真实检查

不要只看代码。

运行：

TypeScript

ESLint

Tests

Build

git diff --check

以及当前仓库其他正式质量命令。

不要关闭 lint / test 来通过。

---

# 九十六、DEV 数据保护

当前 DEV：

`127.0.0.1:3001`

属于长期验收环境。

本轮 UI 重构不得：

reset

seed 覆盖

删除已有 Quote

删除已有 Order

清理 localStorage

清 IndexedDB

改 storage namespace。

测试使用独立 test namespace。

---

# 九十七、浏览器验收

必须真实打开：

报价中心

报价详情

新建报价

订单中心

订单详情

新建订单

生产排单

用户权限

OperationLog

生产与运输

面料库

代表性设置页。

---

# 九十八、Desktop 验收

至少验证实际可实现的：

Wide Desktop

Primary Desktop

Compact / Half-screen。

特别重点：

1280 左右工作区。

这里不能只作为“勉强兼容”。

必须是正式高频工作体验。

---

# 九十九、成本区专项验收

报价详情必须分别验证：

Wide

约 1280

Half-screen

iPhone 17 Pro

iPhone 17 Pro Max。

每个宽度回答：

能否看到：

面料名称？

成分？

门幅？

克重？

单价？

损耗？

单耗？

成本？

哪些可编辑？

哪些只读？

是否存在过多 Input？

是否需要频繁横向滚动？

如果约 1280 仍然大量横向滚：

继续优化。

不能直接判定完成。

---

# 一百、Mobile 验收

至少验证：

报价列表

报价详情

成本卡

订单列表

订单详情

生产排单

附件

客户确认

OperationLog

导航 Drawer

Bottom Sheet

输入键盘状态。

---

# 一百零一、真实设备限制

当前审计中的：

Windows 缩放

Chrome Zoom

iPhone Safari

部分属于模拟 viewport。

因此新版完成后：

必须在最终报告明确区分：

模拟验收

和：

真实设备待验。

不得把模拟 Safari 写成真机通过。

---

# 一百零二、新版截图

不要修改：

`docs/legacy-bs-ui-audit/`

里面的审计证据。

新增：

`docs/ui-redesign/`

以及：

`docs/ui-redesign/screenshots/`

保存新版代表截图。

---

# 一百零三、UI Redesign 文档

创建：

`docs/ui-redesign/README.md`

记录：

页面模板

响应式策略

核心组件

Desktop / Compact / Mobile 区别

报价成本特殊规则

已完成页面

未实施项。

---

# 一百零四、不要修改 Legacy Audit

`docs/legacy-bs-ui-audit/`

作为：

旧系统 UI 事实证据。

本轮不要重写其历史内容。

不要求为了旧文件统计去恢复废弃截图。

---

# 一百零五、项目状态

全部 UI 重构通过真实 DEV 验收后：

更新 CURRENT_STATE。

如果形成新的长期 UI 架构规则：

可以更新 DECISIONS。

不要把 AI 建议直接写成正式决策。

只有本轮实际实施并确认的规则才写。

---

# 一百零六、最终报告必须包含

完成后输出：

## A. 实际修改页面

逐页列出。

## B. 新增 / 重构共用组件

说明用途。

## C. Responsive Behavior

Wide

Primary Desktop

Compact

Tablet

Mobile。

## D. 报价成本区

说明：

哪些宽度完整编辑

哪些字段只读

是否存在横向滚动

Mobile 如何处理。

## E. 业务规则保护

说明没有修改：

报价计算

订单数量

价格历史

三种状态

RBAC

OperationLog

附件体系

Backup。

## F. 数据保护

明确：

没有 reset DEV

没有 seed 覆盖

没有删除业务数据。

## G. 质量检查

TypeScript

ESLint

Tests

Build

git diff --check。

## H. 浏览器验收

列出：

页面

Viewport

结果

发现的问题

已修复。

## I. 真机待验

Windows Display Scaling

Chrome Zoom

iPhone Safari

Camera

Keyboard

Safe Area。

---

# 最终产品原则

整个 UI 重构必须始终遵循：

> 织序 ERP 是高频生产工具，不是展示型后台。

新版目标不是：

更空。

而是：

更清楚。

不是：

隐藏更多。

而是：

减少不必要编辑。

不是：

每页内容更少。

而是：

当前任务更容易找到。

不是：

所有设备使用同一布局。

而是：

不同工作环境保持相同业务事实，但采用适合该环境的操作形式。

尤其报价成本区：

> 屏幕变窄，不代表用户需要知道的信息变少。

因此优先减少：

同时编辑的控件。

而不是：

业务信息本身。

Wide Desktop：

完整展示、完整编辑。

Primary Desktop / 约1280：

尽量完整展示，保持核心编辑能力。

Compact Desktop：

完整重要信息尽量可见，低频字段只读，核心报价字段继续编辑。

Mobile：

完整信息可以查看，高频字段轻编辑，复杂字段进入详情。

横向滚动：

**最后兜底，而不是报价成本区域的默认设计。**

---

开始工作前：

先完整阅读项目事实源和 UI 审计。

然后审查现有组件和页面实现。

再按 Delivery Phase 0 → Delivery Phase 7 逐阶段实施。

同时继续遵守原 Phase 1 → Phase 4 的功能优先级分类。

不要跳过事实核对。

不要擅自改变业务模型。

不要清理用户数据。

不要为了“现代感”牺牲 ERP 的真实工作效率。

**页面默认只能存在一个主要纵向滚动容器，Drawer/Sheet 作为独立 Overlay 例外。**

**每个 Phase 必须单独提交、单独浏览器验收并输出差异；上一 Phase 未通过不得机械进入下一 Phase。**