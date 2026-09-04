# Quote Center

## Purpose

Quote Center 是面向成衣报价工作的新版前端模块，提供完整报价快照、并列价格版本、细分成本、客户确认和报价列表管理。它目前与根路径 ERP 的旧报价模型隔离。

## Current behavior

- `/quote-center` 显示报价列表，支持搜索、筛选、个人可见列设置和临时批量导出选择模式。
- `/quote-center/new` 在内存创建草稿；用户未保存直接离开时不产生记录。
- 新建报价可在品牌/客户业务员搜索无匹配时就地创建主数据并立即选用；客户业务员只能在已选品牌下创建。快建主数据不会触发报价保存，默认资料自动应用与已有数据三向切换保护继续有效。
- `/quote-center/detail?id=...` 编辑当前默认 Revision，查看历史 Revision。
- 报价内可以创建/复制 PriceVersion、编辑面辅料/工价/其他费用、管理附件、客户确认、创建新 Revision、维护独立估算成本、删除和保存草稿。
- 可以把当前或历史 Revision 导出为正式 Excel；一个 PriceVersion 对应一个 Sheet，当前编辑存在未保存修改时会明确选择导出已保存版本或保存并导出。
- 报价明细业务 Card 的固定顺序为：面料成本、辅料成本、工价、其他费用、附件；附件始终是最后一个业务 Card，历史 Revision 同位置只读展示。
- 当前默认 Revision 可编辑，历史 Revision 只读。
- 页面有离开前 dirty guard；整页普通 Enter 不触发保存。
- 顶部常驻操作顺序为：返回列表、报价版本、创建价格版本、客户确认、导出报价、保存草稿。操作记录和删除报价保留既有权限与行为，但位于“更多”次级入口；报价设置位于 Revision 区域而非顶部主操作组。
- 面料成本、辅料成本、工价和成衣销售单价四项摘要已并入常规标题区，并在滚动后进入同一 Sticky Header；USD 工价显示原币金额与统一计算的 RMB 折合值，CNY 工价直接显示人民币金额，不再在基础信息后重复占用独立大卡片区。
- 顶部操作区下方提供页内快速导航。滚动后报价摘要、操作按钮和快速导航由同一 sentinel/state 进入同一个 sticky container，不存在导航先吸顶的中间状态。
- 当前默认 Revision 的可编辑能力由权限键控制；查看员仍可打开报价和导出，但基础信息、成本、附件与保存操作保持只读/disabled。
- 报价详情提供只读“操作记录”时间线；日志在保存成功后由前后快照差异追加生成，详细边界见 `OPERATION_LOGS.md`。
- 已保存报价可由 AppShell 全局搜索按报价号、款号、款式名称、品牌和客户业务员检索；结果只投影非成本信息，详细架构见 `GLOBAL_SEARCH.md`。
- 列表普通搜索按空格 token 做 AND；`/字段 值` 结构化搜索也做 AND，并可与普通 token 组合。`/制作国家` 扫描全部 PriceVersion 快照。
- 列表在 1229 CSS viewport 保持无 document-level 横向溢出，并直接显示款式缩略图；“更多”使用 Portal，不受表格或父容器裁切。
- 其他费用进入顶部成本摘要；点击最终报价打开 Cost Breakdown Drawer，计算继续读取当前 PriceVersion 的正式 calculator 结果。
- Attachment 区域获得焦点后可直接 Ctrl/Cmd+V 粘贴图片，不再要求先打开上传弹窗。
- 品牌与客户业务员使用嵌套选择器；系统 fallback 必须显示实际继承值，不能只显示“回退品牌值”占位。

当前“创建价格版本”以活动 PriceVersion 为来源复制成本数据，并为成本行生成新 ID；UI 使用“创建价格版本”文案。

## Business rules

- 面料 kg 与 meter 单耗在 `quote-calculations.ts` 的计算边界统一按第五位四舍五入为四位正式业务值；面料成本直接乘该四位值，UI 与 Excel 不维护另一套精度。

- Revision 是完整报价快照；PriceVersion 是同一 Revision 中的并列价格口径。
- `defaultRevisionId` 指向默认 Revision；`currentRevisionId` 仅兼容旧数据。
- 新 Revision 深复制来源、清除客户确认、记录父版本/分支关系，并使历史版本只读。
- 单个 PriceVersion 持有数量、成本和确认；总数量为各 PriceVersion 数量之和。
- 最后一条 PriceVersion 不允许删除。
- 新复制的 PriceVersion 及其成本行必须使用新 ID，确认信息清空。
- 客户确认属于 PriceVersion，汇总状态为报价中、部分确认或已确认。
- 空值不等于 0。未录入成本显示空态，只有明确输入 0 才显示零金额。
- Quote Center 使用 `markupRate` 乘法加成，不使用根路径 ERP 的毛利率除法公式。
- 面向用户的最终成衣销售单价保留一位小数并直接截断，不使用四舍五入；内部计算继续保留原始精度。
- 制作预设应用到当前选中的 PriceVersion 快照，带出制作国家、加工币种、汇率、加成率和预设运费行；同一 Revision 的 PriceVersion 可使用不同预设，系统预设后续变化不回写已有快照。
- 报价详情的报价设置只选择当前 PriceVersion 制作预设并显示只读摘要；预设内容只在系统设置维护。
- USD 工价人民币折合由 `convertedLaborRmb` 统一计算为 `原始 USD 工价 × 当前汇率 × 1.13`；`markupRate` 继续独立参与报价成本/售价加成，CNY 工价不走 USD 折算。
- 详细公式见 `docs/BUSINESS_RULES.md` 和 `model/quote-calculations.ts`。

## Data model

权威前端模型在 `features/quote-center/model/quote-view-model.ts`：

- `Quote`：稳定 ID、报价编码、删除预留、默认 Revision ID、聚合状态、Revision 数组、当前估算成本和估算历史。
- `QuoteRevision`：身份/分支元数据、基础信息、PriceVersion 数组、图片/文件附件 ID、款式图 ID 和确认摘要。
- `PriceVersion`：名称、数量、说明、独立 `pricingParameters` 制作预设快照、面料、辅料、工价、其他费用和客户确认。
- `FabricCostLine` / `TrimCostLine` / `LaborCost` / `OtherCostLine`：报价当时使用的成本快照。
- `PriceVersionConfirmation`：报价值和客户确认值的快照。

`PriceVersion.pricingParameters` 同时保存制作预设引用 ID 与应用时的完整快照；正式计算、页面汇总、报价中心列表、客户确认报价值和 Excel 导出均只读取目标 PriceVersion，不实时读取系统预设。报价中心工价列按各 PriceVersion 原始币种分别格式化，混合币种不合并为错误统一区间。

附件 metadata 与 Blob 使用独立 AttachmentRepository/IndexedDB，具体见 `features/ATTACHMENTS.md`。

## API and persistence

- Repository interface：`features/quote-center/repository/quote-repository.ts`。
- 当前实现：`mock-quote-repository.ts`，以内存缓存 + 稳定 localStorage `zhixu.erp.local.quotes` 保存；旧 sessionStorage `zhixu.quote-center.slice-1.2` 只作为一次性兼容迁移来源。
- 附件二进制：IndexedDB `zhixu-quote-attachments`，Quote repository 只保存 ID 引用。
- 全局费用和列表偏好使用 `zhixu.erp.local.*` 稳定 localStorage envelope，定义在 `model/quote-settings.ts`。
- 当前没有 Quote Center 后端 API、数据库表或 migration。
- 不调用根路径 ERP 的旧 `/api/quotes`。
- Repository delete interface 预留 `hard` / `soft` 模式；当前 mock UI 实际执行硬删除。
- 操作日志使用独立 localStorage repository `zhixu.erp.local.operation-logs`，旧 key 只作为迁移来源，不改变 Quote repository 和 Revision 数据结构。

## Frontend behavior

主要入口：

- `app/quote-center/page.tsx`
- `app/quote-center/new/page.tsx`
- `app/quote-center/detail/page.tsx`
- `features/quote-center/components/quote-list.tsx`
- `features/quote-center/components/quote-editor.tsx`
- 权限接入：`features/permissions/` 与 Foundation `Button.permission`
- 操作日志：`features/operation-logs/`；详细规则见 `OPERATION_LOGS.md`

主要 UI 子模块：

- 基础信息：`quote-base-info.tsx`
- 面辅料宽表：`cost-table.tsx`
- 价格版本：`price-version-selector.tsx`
- 页内快速导航：`quote-quick-navigation.tsx`，由 `quote-editor.tsx` 组装可见项和 section anchor
- Revision 管理：`revision-history.tsx`、`revision-manager-modal.tsx`
- 报价/全局设置：`quote-pricing-settings.tsx`、`quote-settings-modals.tsx`
- 制作国家预设：`global-quote-settings-page.tsx`、`quote-pricing-settings.tsx`、`model/quote-settings.ts`
- 校验/汇总：`validation-summary.tsx`、`quote-metrics.tsx`
- 附件：`attachment-panel.tsx`、`model/quote-attachments.ts` 和附件 repository
- Excel 导出：`quote-export-modal.tsx`、`features/quote-center/export/`；详细规则见 `QUOTE_EXCEL_EXPORT.md`
- 批量导出：`batch-export-modal.tsx`、`export/quote-batch-exporter.ts`；详细规则见 `QUOTE_BATCH_EXPORT.md`
- 估算成本：`estimate-cost-panel.tsx`、`model/estimate-cost.ts`；详细规则见 `ESTIMATE_COST.md`

面料/辅料从基础库选择时，只把当时数据复制到报价行；后续编辑报价不回写基础库。

品牌或客户业务员快建后，Quote Editor 直接刷新内存主数据并选中新 ID，不依赖页面刷新。默认辅料进入报价时重新生成 row ID、用量保持 `null`；历史 Revision 和 Trim Library 均不被报价行后续编辑污染。

响应式当前行为：

- `>=1440px` 保持完整桌面侧栏和列表 Table；小于 1440px 的细指针/可 hover 桌面窗口使用 compact sidebar，即使 viewport 缩到 650px 也保留完整业务能力。报价列表仍保持 Table，成本区则按各自 Card 容器宽度选择 renderer。
- 报价明细成本区以 Card 实际内容宽度选择 renderer：`>=1040px` 使用单行 Wide，低于该值使用 Compact/Narrow；同时 `700–1099px` viewport 保证半屏使用完整两行 Compact，不因 Sidebar/padding 误入单列。Wide 面料、辅料和其他费用使用固定表格布局与业务权重百分比，吃满 Card 且正常桌面不产生横向滚动；Compact 分组、ViewModel、回调、计算、row ID、dirty 和焦点规则不变。
- 全部 Compact/Tablet 的普通操作 Header 和已验收 Sticky Header 均为四列等宽 Grid；只有 `>=1440px` Large Desktop 自然横排。响应式只改变尺寸和排列，Sticky sentinel/observer/出现时机不变。
- Compact Desktop 的报价详情保留完整业务能力；标题区第二行承载四列操作 Grid，快速导航以 Header dropdown 展示，成本指标压缩为单行 Summary Bar。操作记录和删除报价通过“更多”访问。
- `768–1023px` 的触摸设备使用 Tablet；连接细指针并可 hover 时优先按 Compact Desktop 处理。
- 只有 `<768px`、`pointer: coarse`、`hover: none` 的 True Mobile 把报价列表改为 Card List；报价详情是“查看全部 + 轻编辑”，基础信息、备注、工价、客户确认、附件继续复用桌面状态与保存流程。
- Quote Center 的搜索、报价类型、报价状态在所有设备直接显示为同一行 `6fr / 2fr / 2fr`，不使用筛选按钮、Drawer 或 Bottom Sheet；结果数量轻量显示在列表上方右侧。
- Mobile 详情隐藏 Sticky Header，款式图显示 contain 缩略图；Bottom Navigation 只允许 True Mobile 出现。
- 手机面料/辅料为现有成本行的摘要投影，数值继续调用既有计算函数，不建立第二套数据或公式；结构增删留在桌面端。
- Mobile PriceVersion 使用横向紧凑卡；返回、保存和客户确认保留在顶部，报价版本、创建价格版本、导出和删除进入“更多”。

## Important constraints

- 不得把 Library 或 Basic Settings 整体塞入 Revision。
- 不得把 mock repository 描述为生产数据源。
- 不得静默连接或适配旧 `/api/quotes`；后端迁移必须单独设计映射和数据迁移。
- 不得将根 ERP 的 `margin` 公式用于 `markupRate`。
- 不得重新引入输入一个字符丢焦点、Dropdown 被 overflow 裁剪或普通 Enter 保存整页等已解决问题。
- 历史 Revision 的数据必须保持快照语义。
- 旧 Revision 级制作参数只允许在 repository v2 → v3 迁移中读取并复制到各 PriceVersion；新保存数据不得继续依赖该层级。
- 正式 Excel 导出必须使用仓库模板、现有计算口径和精确选中的 Revision 快照。

## Tests

相关测试分布在 `tests/quote-*.test.mjs`、`tests/quick-master-data.test.mjs`、`tests/fabric-calculations.test.mjs`、`tests/cost-table-ui-part2.test.mjs`、`tests/cost-responsive-batch1-2.test.mjs`、`tests/global-costs-v2.test.mjs` 和 `tests/quote-revision-management.test.mjs`。页内导航由 `tests/quote-quick-navigation.test.mjs` 覆盖，正式 Excel 导出由 `tests/quote-excel-export.test.mjs` 覆盖。

测试包含大量源码契约检查；修改结构时也应做浏览器实际交互验证，不能仅依赖字符串断言。

## Known gaps

- 无真实后端、数据库和多用户并发；当前只有 localStorage mock RBAC，没有服务端权限 enforcement。
- 已提供从明确 Quote Revision + PriceVersion 生成新订单中心 SalesOrder 的浏览器流程；尚无真实后端订单 API 或与根路径旧订单的数据整合。
- 附件当前仅为单设备 IndexedDB 原型，没有真实上传 API、对象存储和跨设备共享。
- 列表无分页/服务端筛选。
- 当前测试账号可在 AppShell 切换，但不是已认证的真实会话；个人偏好尚未按该账号全面迁移。
- 2026-09-01 Full UI / Workflow Correction 的 Quote 与 Foundation 修改已由 Gate A commit `367983925f8e9236a701a71781054f6baaf65e78` 独立固化。

## 2026-09-04 Second Acceptance

- 报价列表把旧 `style` 拆为稳定 `styleImage` 与 `styleIdentity`，旧偏好自动映射为两列；用户可分别调整顺序与宽度。
- 最大字段场景使用业务组合列与 secondary line 展示报价编号、款式、品牌/业务员、类型/状态、数量、成本、成衣价/确认、报价历史/价格方案、日期和操作，Primary Desktop 不再强制隐藏用户选择的 revision 列。
- “更多”保持单行紧凑按钮；详情 Sticky 在滚入成本区后继续显示款式身份、Revision、PriceVersion、制作国家、报价类型、数量、成衣价、工价、确认与 dirty/save 状态。
