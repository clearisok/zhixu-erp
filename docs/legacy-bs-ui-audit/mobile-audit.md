# iPhone 17 Pro / Pro Max 移动端补充审计

## 验收边界

本轮在真实 BS 页面上使用两个窄 CSS viewport：

- iPhone 17 Pro 参考：`402×874 CSS px`
- iPhone 17 Pro Max 参考：`440×956 CSS px`

这是桌面 Chromium 的模拟窄视口，实测 `devicePixelRatio = 1`、`visualViewport.scale = 1`、fine pointer。它不能模拟 iPhone Safari、粗指针、Dynamic Island、Home Indicator、`env(safe-area-inset-*)`、Safari 浏览器栏或系统软件键盘。

为审计可见高度变化，另外使用 `402×780`、`440×860`；为审计聚焦输入与键盘占位，使用 `402×500`、`440×560`。这些截图只证明缩短 `visualViewport` 后的布局表现，**不是实际键盘/Safari 验收**。代表性横屏使用 `956×440`。

## 总结结论

当前系统不是合格的 True Mobile 页面。最根本的问题是 Desktop Sidebar 在 402/440px 仍保留约 78px 左侧 rail，使业务内容只剩约 324/362px；点击设置打开的是覆盖正文的 Desktop Flyout，不是 Mobile Header + Drawer。

同时，当前实现并非完全不可用：订单详情驾驶舱、报价附件、客户确认全屏弹层、操作日志卡片和订单列表卡片已经出现适合移动任务的基础。重构应保留这些业务组织，再替换导航、列表、表单与成本编辑方式。

## 页面审计

| 页面 / 状态 | 设备与 CSS viewport | 文档横向溢出 | 首屏核心信息与主要操作 | 当前问题 | 移动端重组建议 |
| --- | --- | --- | --- | --- | --- |
| 报价中心 | 402×874、440×956 | 无 document overflow；列表内部仍可横滚 | 标题、批量导出、复制、页面设置、新建、搜索、类型/状态、3 条报价 | Desktop rail 常驻；四个动作占两行；列表只剩“款号/款式 + 操作”，仍出现内滚动，不是业务卡片 | Mobile Header；只保留搜索和“新建/更多”；筛选 Bottom Sheet；紧凑卡片显示款号、客户、版本、最终报价、确认/状态 |
| 报价详情 | 402×874、440×956 | 无 document overflow；基础表单和局部编辑存在内滚动 | 款号/款名、返回、更多、四项价格摘要、当前价格版本、基础信息 | 标题和四项指标严重截断；保存入口与桌面结构混合；两列表单使输入框窄到难操作；页面极长 | 顶部对象 Header + 当前 PriceVersion/最终报价；概览、成本摘要、价格版本、客户确认、附件、历史分 Section；成本明细进入专门页面 |
| 订单中心 | 402×874、440×956 | 无 document overflow | 卡片呈现订单号、款号、客户/PO、数量/交期摘要、状态 | 卡片方向正确，但 Desktop rail 和大页面 Header 浪费宽高；筛选仍是桌面控件堆叠 | Sticky 搜索 + 筛选 Sheet；紧凑订单卡保留款号、客户/PO、数量、最终交期、订单/生产/关账与风险 |
| 订单详情 | 402×874、440×956 | 无 document overflow | `B55-TEST`、客户、订单号、12,000 件、订单状态、工价/售价、最近/最终交期；返回/翻单/保存 | 第一屏“驾驶舱”已较成功；Desktop rail 仍占宽；下面连续长表单，保存层级偏多 | 保留驾驶舱；按概览、商务资料、数量交期、生产执行、物料物流、价格关账、附件、日志组织；底部只保留一个 Sticky 主操作 |
| 生产排单 | 402×874、440×956 | 无 document overflow | 生产组、当前款、待生产 1 款、预计排至、状态、未排/异常标签 | Desktop rail；日期与款号被省略；页签和指标被压在同一小卡片；没有移动异常卡 | 首页展示当前/待生产/异常；生产组进入纵向队列；风险卡明确客户交期、预计完成与晚几天；横向甘特只在横屏作为辅助 |
| 附件 | 402×874、440×956 | 无 document overflow；底部仍可见局部横滚条 | 从相册选择、拍照上传、粘贴图片、图片/文件 Tab、预览区 | 已有移动语义入口，值得保留；真实相机、相册、上传进度、失败重试、Safe Area 未验证 | 继续复用 AttachmentRepository；拍照后立即 Preview，可确认/重拍/取消；附件删除和设款式图触摸目标至少 44px |
| 客户确认 | 402×874、440×956 | 无 document overflow | 系统工价/销售价、客户确认工价/价格、备注、取消/保存确认 | 近全屏 Bottom Sheet 结构良好，系统值与确认值区分明确；底部安全区和真实键盘未验证 | 保留该结构；Footer 使用 `padding-bottom: env(safe-area-inset-bottom)`；键盘出现时输入框与保存按钮必须保持可见 |
| 操作日志 | 402×874、440×956 | 无 document overflow | 搜索、用户/模块/操作/日期筛选、业务日志卡片、技术详情 | 日志卡已接近 Timeline；筛选首屏占高；技术明细字段仍较密 | 搜索 Sticky；筛选 Sheet；Timeline 默认显示谁/何时/做了什么/关键差异，技术信息折叠为全屏详情 |
| 用户权限 | 402×874、440×956 | document 无溢出，用户表内部横滚 | 用户列表、角色、状态、权限详情与切换测试账号 | 完整权限配置仍跟在用户表下方，长且高风险；Desktop rail；列表内滚动 | 手机只展示用户、角色、授权摘要；按权限组查看；批量或高风险修改提示桌面完成 |
| 导航浮层 | 402×874、440×956 | 无 document overflow | 左 rail + 基础/系统设置 Flyout | 不符合 Mobile Navigation；浮层覆盖主要内容且没有完整屏幕语义；触摸关闭路径不清晰 | Sidebar 完全收起；顶部菜单按钮打开全高 Drawer；当前页面、返回与单个关键操作进入 App Header |
| 聚焦输入/缩短可见高度 | 402×500、440×560 | 无 document overflow；新建报价内部出现横滚 | 新建报价款号或订单搜索获得焦点 | 未出现真实软件键盘；新建报价的窄输入和横向滚动说明 fixed/两列结构不适合键盘状态 | 表单一行一个主字段；使用 `100dvh` 和滚动容器；Sticky Footer 在键盘出现时进入可见区或自然跟随内容 |
| 横屏代表页 | 956×440 | 无 document overflow | 订单驾驶舱与顶部操作 | 低高度下 Header/驾驶舱占用多数首屏；横屏被当作 Compact Desktop | 横屏只增加信息并列，不恢复完整 Desktop Sidebar；生产可提供简化时间轴 |

## 代表截图

### iPhone 17 Pro（402 CSS px）

- [报价中心](screenshots-mobile/iphone-17-pro/quote-center.png)
- [报价详情](screenshots-mobile/iphone-17-pro/quote-detail.png)
- [订单中心](screenshots-mobile/iphone-17-pro/order-center.png)
- [订单详情](screenshots-mobile/iphone-17-pro/order-detail.png)
- [生产排单](screenshots-mobile/iphone-17-pro/production-scheduling.png)
- [附件](screenshots-mobile/iphone-17-pro/attachments.png)
- [客户确认](screenshots-mobile/iphone-17-pro/customer-confirmation.png)
- [操作日志](screenshots-mobile/iphone-17-pro/operation-log.png)
- [用户权限](screenshots-mobile/iphone-17-pro/user-permissions.png)
- [设置导航浮层](screenshots-mobile/iphone-17-pro/navigation-overlay.png)
- [聚焦输入 / 缩短可见高度](screenshots-mobile/iphone-17-pro/keyboard-open-simulated.png)
- [Safari 栏展开高度模拟](screenshots-mobile/iphone-17-pro/safari-bars-expanded-simulated.png)

### iPhone 17 Pro Max（440 CSS px）

- [报价中心](screenshots-mobile/iphone-17-pro-max/quote-center.png)
- [报价详情](screenshots-mobile/iphone-17-pro-max/quote-detail.png)
- [订单中心](screenshots-mobile/iphone-17-pro-max/order-center.png)
- [订单详情](screenshots-mobile/iphone-17-pro-max/order-detail.png)
- [生产排单](screenshots-mobile/iphone-17-pro-max/production-scheduling.png)
- [附件](screenshots-mobile/iphone-17-pro-max/attachments.png)
- [客户确认](screenshots-mobile/iphone-17-pro-max/customer-confirmation.png)
- [操作日志](screenshots-mobile/iphone-17-pro-max/operation-log.png)
- [用户权限](screenshots-mobile/iphone-17-pro-max/user-permissions.png)
- [设置导航浮层](screenshots-mobile/iphone-17-pro-max/navigation-overlay.png)
- [聚焦输入 / 缩短可见高度](screenshots-mobile/iphone-17-pro-max/keyboard-open-simulated.png)
- [Safari 栏展开高度模拟](screenshots-mobile/iphone-17-pro-max/safari-bars-expanded-simulated.png)
- [代表性横屏订单详情](screenshots-mobile/iphone-17-pro-max/landscape-order-detail.png)

## 值得继承

1. 订单详情首屏驾驶舱已经覆盖“谁的订单、什么款、多少件、什么状态、交期是否安排”的大部分关键判断。
2. 客户确认弹层明确区分系统测算值与客户确认值，且使用近全屏 Sheet，符合移动业务。
3. 附件已有“从相册选择 / 拍照上传 / 粘贴图片”入口，并保留图片/文件分栏。
4. 订单列表在更窄区间切为业务卡片，而不是继续展示完整 14 列表格。
5. 操作日志使用业务化动作和前后值，可直接演化为 Mobile Timeline。

## 必须重新设计

1. 完全移除移动端 Desktop rail，改用 Mobile Header + Drawer；这是所有 402/440 页面共同的最高优先级问题。
2. 报价列表改为专用紧凑业务卡，不能只剩两列并保留横向滚动。
3. 报价详情默认显示成本摘要，不在 402px 中编辑整张面料/辅料宽表或十几个同行输入。
4. 新建报价、订单轻编辑、备注与附件备注改为单列、分 Section、键盘可见的表单。
5. 权限矩阵、数据恢复/重置、复杂模板和生产甘特精细操作在手机只提供摘要或提示桌面完成。

## 移动验收任务

| 任务 | 当前审计判断 |
| --- | --- |
| 30 秒内找到报价并看最终报价 | 部分满足：可搜索和打开，但列表卡信息不足，最终报价需进入详情 |
| 切换 PriceVersion 与看成本摘要 | 部分满足：版本卡可切换；四项摘要过度压缩，入口和最终报价语义不够集中 |
| 找到客户确认 | 满足入口可发现性一般：位于“更多”，弹层本身清晰 |
| 订单首屏识别客户、款号、数量、交期、状态、风险 | 基本满足；未安排交期能看见，但风险提醒尚未形成独立警示 |
| 生产查看当前、待生产、异常、预计完成 | 部分满足；有生产组摘要，异常与日期在窄卡片中易被截断 |
| 拍照、相册、预览、上传 | 入口已存在；真实相机/相册/上传链路未在 iOS 实体设备验证 |
| 单手操作与 Safe Area | 未验证；Desktop rail、部分小图标和底部条不符合正式验收条件 |

## 推荐的跨端组件边界

| 组件 | Wide/Desktop | Compact/Tablet | Mobile |
| --- | --- | --- | --- |
| 导航 | 完整 Sidebar | 图标 rail 或 Drawer | Mobile Header + 全高 Drawer |
| 列表 | 高密度 DataGrid | 列优先级/紧凑行 | 专用 QuoteCard / OrderCard |
| 详情 Header | PageHeader + 操作组 | 紧凑 Header + Sticky 摘要 | 对象 Header + More + 单一关键动作 |
| 成本 | 宽表/批量编辑 | 分区紧凑编辑 | 摘要 + 单项 Full-screen Form/Sheet |
| Drawer/Dialog | 右侧 Drawer / Center Modal | 覆盖式 Drawer | Full-screen Sheet / 简单确认 Dialog |
| 操作日志 | 列表 + 右详情 | 覆盖式详情 | Timeline + Full-screen Detail |
| 权限 | Master–Detail 权限组 | Drill-down | 查看摘要；复杂修改提示桌面 |

## 实体 iPhone 待验清单

1. 402 与 440 CSS px 均保持 Mobile，不在 430px 切成 Tablet。
2. `env(safe-area-inset-top/bottom/left/right)` 的实际计算值与 Header/Footer 遮挡。
3. Safari 地址栏展开/收起时 `100dvh/100svh/100lvh` 行为，无跳动和底部按钮丢失。
4. 报价搜索、新建报价、订单搜索/轻编辑、客户确认、备注和附件备注的真实软件键盘。
5. `inputmode=decimal/numeric/tel`、日期选择器、焦点自动滚入可见区。
6. 相机拍照、相册选择、Preview、确认上传、重拍、取消和失败恢复。
7. 44×44 CSS px 触摸目标、单手操作、Toast/Sheet/Sticky Footer 与 Home Indicator 的关系。
