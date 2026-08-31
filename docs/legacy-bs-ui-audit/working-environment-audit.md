# Legacy BS 真实工作环境补充审计

## 范围与方法

本报告补充审计 10 个高优先级状态：报价中心、报价详情、新建报价、订单中心、订单详情、新建订单、生产排单、用户权限、操作日志、生产与运输。页面来自真实 DEV 运行时，未保存、删除、确认、完成、导入或重置任何业务数据。

旧目录 `screenshots/` 中的 40 张 `767×900` 图片只作为 **Compact Reference**，不再代表主桌面。新的工作环境证据位于 `screenshots-working-env/`；视口与能力限制见 [viewport-matrix.md](viewport-matrix.md)。

## 页面结论

| 页面 / 状态 | 最大化、100%/125% 结论 | 半屏结论 | Browser 150% 结论 | 重新设计重点 |
| --- | --- | --- | --- | --- |
| 报价中心 | 1920/100 下表格可显示完整主要列；1536 下仍保持桌面表格。1280 开始出现约 76px 内滚动 | 960/768 下仍强制宽表，内滚动约 396/588px；首列和操作仍可见，但中间状态列脱离视线 | 1024 内滚动约 332px；640 达约 731px | 固定“款号/款式”和“操作”；状态、当前版本、确认状态做可选核心列；半屏允许紧凑卡片或列优先级视图 |
| 报价详情 | 1536 形成完整工作区，四项价格摘要、基础资料与价格版本层级清晰；纵向长度仍很大 | 768 保留完整编辑能力，但表单、款式图和成本卡片被压缩，局部出现横向滚动；标题与指标开始省略 | 640/1024 下 Header、指标、版本和长表单同时争夺首屏 | 保留 Workspace + Sticky 摘要；≥1440 可增加右侧 ContextPanel，半屏改为单列任务分区，成本宽表进入专门工作面板 |
| 新建报价 | 宽屏多列表单可用，但首屏同时出现对象 Header、指标、基础信息，认知负担高 | 768 仍按桌面表单压缩，款式图占据过多横向空间 | 640 时字段宽度过窄 | 新建流程按“身份资料 → 价格版本 → 成本 → 确认”分阶段；半屏单列；只保留一个页面级保存入口 |
| 订单中心 | 即使 1920/100，订单宽表仍约多 346px；1536 多约 611px，说明默认列集超过常用桌面承载能力 | 960/768 多约 1047/1239px，横向比较成本最高；640 才切到卡片 | 1024 多约 983px；640 卡片更容易扫描，但字段明显减少 | 默认固定订单号/款号、客户/PO、数量、交期、三态与操作；图片、国家、价格、理单员作为次级列；更早切换半屏专用行布局 |
| 订单详情 | “款号、客户、数量、工价/售价、最近/最终交期”驾驶舱在 1536 首屏有效 | 960/768 首屏仍能看到驾驶舱和订单身份，随后表单纵向很长；顶部操作仍占较多空间 | 640 下可读，但 Desktop rail 持续占宽 | 保留订单驾驶舱；宽屏正文双列，半屏单列 + Sticky 风险/交期摘要；历史、排单、关账改为任务区而非连续长页 |
| 新建订单 | 宽屏字段组清楚，来源报价与执行资料仍显复杂 | 半屏垂直滚动较长，关联字段和日期组易失去上下文 | 640 下桌面表单被压缩 | 使用步骤式 FormShell；报价来源、客户/PO、数量/交期、执行资料分组；保存前提供摘要 |
| 生产排单 | 1536 只有一个生产组卡片，右侧大片空白；单组队列展开后宽表信息更有价值 | 768 总览页签文字被压窄，日期截断；单组队列需要横向滚动 | 640 页签与卡片仍可用，但不是高效排单工作站 | 宽屏采用生产组 Master–Detail，右侧直接展示队列/风险；半屏为顶部组选择器 + 单队列；手机只看当前、待生产、异常 |
| 用户权限 | 用户表在上、权限编辑在下，宽屏没有利用横向空间；43 个 PermissionKey 需要长滚动 | 768 用户表轻微内滚动，详情继续在下方，切换用户后容易失去上下文 | 640 内滚动约 189px，权限维护不适合完整执行 | ≥1100 两列 Master–Detail；半屏/手机用户列表 → 独立详情；权限搜索、按业务组折叠、变更摘要与高风险标记 |
| 操作日志 | 搜索和五项筛选明确，业务化前后值值得保留；事件卡片纵向很长 | 768 筛选可重排为三列/两列，日志仍可读；技术详情适合覆盖式 Drawer | 640 下首屏被筛选占据，单条日志仍很长 | 宽屏列表 + 右侧详情；半屏 Drawer 覆盖内容而不挤压主列；手机 Timeline，技术字段默认折叠 |
| 生产与运输 | 多类实体集中在同一页，宽屏存在大量卡片间空白，实体依赖难看清 | 半屏卡片可读但操作按钮拥挤；系统二级菜单容易覆盖内容 | 640 下分类边界弱，连续滚动定位成本高 | 宽屏左侧实体树/关系图 + 右侧详情；半屏拆成日历、地点、枢纽、路线、运输方式标签页或子页面 |

## 关键页面证据

- 报价中心：[1920/100 全屏](screenshots-working-env/1920-win100-browser100/fullscreen/quote-center.png)、[Win125/Browser125 半屏](screenshots-working-env/1920-win125-browser125/halfscreen/quote-center.png)
- 报价详情：[Win125/Browser100 全屏](screenshots-working-env/1920-win125-browser100/fullscreen/quote-detail.png)、[半屏成本状态](screenshots-working-env/1920-win125-browser100/halfscreen/quote-detail-costs.png)
- 订单中心：[1920/100 全屏](screenshots-working-env/1920-win100-browser100/fullscreen/order-center.png)、[Browser150 半屏](screenshots-working-env/1920-win125-browser150/halfscreen/order-center.png)
- 订单详情：[1920/100 半屏](screenshots-working-env/1920-win100-browser100/halfscreen/order-detail.png)
- 生产排单：[Win125 全屏](screenshots-working-env/1920-win125-browser100/fullscreen/production-scheduling.png)、[半屏单组队列](screenshots-working-env/1920-win125-browser100/halfscreen/production-scheduling-group.png)
- 用户权限：[全屏详情](screenshots-working-env/1920-win125-browser100/fullscreen/user-permissions-detail.png)、[半屏详情](screenshots-working-env/1920-win125-browser100/halfscreen/user-permissions-detail.png)
- 操作日志：[全屏详情](screenshots-working-env/1920-win125-browser100/fullscreen/operation-log-detail.png)、[半屏详情](screenshots-working-env/1920-win125-browser100/halfscreen/operation-log-detail.png)
- 生产与运输：[全屏](screenshots-working-env/1920-win125-browser100/fullscreen/production-transport.png)、[Browser150 半屏](screenshots-working-env/1920-win125-browser150/halfscreen/production-transport.png)

## 旧建议重新验证

| 设计建议 | 结论 | 校准后的适用方式 |
| --- | --- | --- |
| Compact PageHeader | 保留并加强 | Desktop 保留标题/说明/操作；半屏移除冗长说明；Mobile 业务对象优先 |
| Toolbar | 保留 | 允许换行与溢出菜单；同层只保留一个 Primary；筛选与动作不要混成一排 |
| DataGrid | 保留桌面高密度能力 | 强制列优先级、首业务列与操作列固定、可保存视图；订单默认列必须减少 |
| Workspace | 报价、订单继续采用 | 用分区导航和 Sticky 摘要降低长页成本；不要让所有历史默认展开 |
| ContextPanel | 有条件采用 | ≥1440 显示关键价格、风险或对象上下文；1100 以下折叠为 Drawer/Sheet |
| Master–Detail | 强烈建议 | 排单、权限、日志、生产与运输在宽屏使用；半屏切换为 drill-down |
| Drawer | 保留 | 宽屏 420–520px；半屏覆盖式；Mobile 近全屏 Sheet，不挤压主内容 |
| 权限两列 | 验证通过 | 左用户/角色，右权限组与搜索；半屏进入独立详情 |
| 排单两列 | 验证通过 | 左生产组/异常，右队列；半屏顶部选择器 + 单列队列 |
| 订单驾驶舱 | 验证通过 | 首屏保留 6–8 个核心字段与风险；正文按任务分区 |
| 报价右侧摘要 | 仅宽屏适用 | ≥1440 可用；半屏改顶部 Sticky 摘要，不能继续占正文宽度 |

## 建议的真实响应式范围

| 行为 | 建议条件 | 主要模式 |
| --- | --- | --- |
| Wide Desktop | `>= 1440 CSS px` | 完整 Sidebar、DataGrid、Master–Detail、可选 ContextPanel |
| Desktop | `1100–1439 CSS px` | 完整业务能力，减少非核心列，Drawer 取代固定右栏 |
| Compact Desktop / Half-screen | `720–1099 CSS px` 且 fine pointer | 图标 rail、紧凑 Header、列优先级、单列详情；仍可完成完整业务 |
| Tablet | `600–1099 CSS px` 且 coarse pointer | Drawer 导航、触摸目标、卡片/分区表单；复杂编辑可保留但分步 |
| Mobile | `< 600 CSS px` | 任务式查看、快速确认、附件与轻编辑；不复制桌面宽表 |

断点应由内容和输入能力共同决定。当前 768px 仍保留极宽订单表，是最需要提前重排的区间；440px 不应因传统 `430px` 断点进入 Tablet。

## 重构优先级

1. 订单中心默认列与半屏行布局：1920/100 仍需横向滚动，是最明确的桌面问题。
2. 报价详情工作区：统一 Header、Sticky 摘要、价格版本与成本编辑的层级。
3. 生产排单：把宽屏空白转化为 Master–Detail 队列与风险工作区。
4. 用户权限：改为用户/角色与权限组两列，提供搜索与高风险差异摘要。
5. 生产与运输：按实体关系重组，宽屏展示关系，半屏拆分任务。
