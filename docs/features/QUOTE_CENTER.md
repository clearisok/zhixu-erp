# Quote Center

## Purpose

Quote Center 是面向成衣报价工作的新版前端模块，提供完整报价快照、并列价格版本、细分成本、客户确认和报价列表管理。它目前与根路径 ERP 的旧报价模型隔离。

## Current behavior

- `/quote-center` 显示报价列表，支持搜索、筛选、个人可见列设置和临时批量导出选择模式。
- `/quote-center/new` 在内存创建草稿；用户未保存直接离开时不产生记录。
- `/quote-center/detail?id=...` 编辑当前默认 Revision，查看历史 Revision。
- 报价内可以创建/复制 PriceVersion、编辑面辅料/工价/其他费用、管理附件、客户确认、创建新 Revision、维护独立估算成本、删除和保存草稿。
- 可以把当前或历史 Revision 导出为正式 Excel；一个 PriceVersion 对应一个 Sheet，当前编辑存在未保存修改时会明确选择导出已保存版本或保存并导出。
- 报价明细业务 Card 的固定顺序为：面料成本、辅料成本、工价、其他费用、附件；附件始终是最后一个业务 Card，历史 Revision 同位置只读展示。
- 当前默认 Revision 可编辑，历史 Revision 只读。
- 页面有离开前 dirty guard；整页普通 Enter 不触发保存。
- 顶部操作顺序为：返回列表、报价版本、创建价格版本、客户确认、删除报价、保存草稿。报价设置位于 Revision 区域而非顶部主操作组。
- 顶部操作区下方提供页内快速导航。滚动后报价摘要、操作按钮和快速导航由同一 sentinel/state 进入同一个 sticky container，不存在导航先吸顶的中间状态。
- 当前默认 Revision 的可编辑能力由权限键控制；查看员仍可打开报价和导出，但基础信息、成本、附件与保存操作保持只读/disabled。
- 报价详情提供只读“操作记录”时间线；日志在保存成功后由前后快照差异追加生成，详细边界见 `OPERATION_LOGS.md`。
- 已保存报价可由 AppShell 全局搜索按报价号、款号、款式名称、品牌和客户业务员检索；结果只投影非成本信息，详细架构见 `GLOBAL_SEARCH.md`。

当前“创建价格版本”以活动 PriceVersion 为来源复制成本数据，并为成本行生成新 ID；UI 使用“创建价格版本”文案。

## Business rules

- Revision 是完整报价快照；PriceVersion 是同一 Revision 中的并列价格口径。
- `defaultRevisionId` 指向默认 Revision；`currentRevisionId` 仅兼容旧数据。
- 新 Revision 深复制来源、清除客户确认、记录父版本/分支关系，并使历史版本只读。
- 单个 PriceVersion 持有数量、成本和确认；总数量为各 PriceVersion 数量之和。
- 最后一条 PriceVersion 不允许删除。
- 新复制的 PriceVersion 及其成本行必须使用新 ID，确认信息清空。
- 客户确认属于 PriceVersion，汇总状态为报价中、部分确认或已确认。
- 空值不等于 0。未录入成本显示空态，只有明确输入 0 才显示零金额。
- Quote Center 使用 `markupRate` 乘法加成，不使用根路径 ERP 的毛利率除法公式。
- 详细公式见 `docs/BUSINESS_RULES.md` 和 `model/quote-calculations.ts`。

## Data model

权威前端模型在 `features/quote-center/model/quote-view-model.ts`：

- `Quote`：稳定 ID、报价编码、删除预留、默认 Revision ID、聚合状态、Revision 数组、当前估算成本和估算历史。
- `QuoteRevision`：身份/分支元数据、基础信息、报价参数、PriceVersion 数组、图片/文件附件 ID、款式图 ID 和确认摘要。
- `PriceVersion`：名称、数量、说明、面料、辅料、工价、其他费用和客户确认。
- `FabricCostLine` / `TrimCostLine` / `LaborCost` / `OtherCostLine`：报价当时使用的成本快照。
- `PriceVersionConfirmation`：报价值和客户确认值的快照。

附件 metadata 与 Blob 使用独立 AttachmentRepository/IndexedDB，具体见 `features/ATTACHMENTS.md`。

## API and persistence

- Repository interface：`features/quote-center/repository/quote-repository.ts`。
- 当前实现：`mock-quote-repository.ts`，以内存 + `sessionStorage` key `zhixu.quote-center.slice-1.2` 保存。
- 附件二进制：IndexedDB `zhixu-quote-attachments`，Quote repository 只保存 ID 引用。
- 全局费用和列表偏好使用 `localStorage`，定义在 `model/quote-settings.ts`。
- 当前没有 Quote Center 后端 API、数据库表或 migration。
- 不调用根路径 ERP 的旧 `/api/quotes`。
- Repository delete interface 预留 `hard` / `soft` 模式；当前 mock UI 实际执行硬删除。
- 操作日志使用独立 localStorage repository `zhixu.operation-logs.v1`，不改变 Quote repository 和 Revision 数据结构。

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
- 校验/汇总：`validation-summary.tsx`、`quote-metrics.tsx`
- 附件：`attachment-panel.tsx`、`model/quote-attachments.ts` 和附件 repository
- Excel 导出：`quote-export-modal.tsx`、`features/quote-center/export/`；详细规则见 `QUOTE_EXCEL_EXPORT.md`
- 批量导出：`batch-export-modal.tsx`、`export/quote-batch-exporter.ts`；详细规则见 `QUOTE_BATCH_EXPORT.md`
- 估算成本：`estimate-cost-panel.tsx`、`model/estimate-cost.ts`；详细规则见 `ESTIMATE_COST.md`

面料/辅料从基础库选择时，只把当时数据复制到报价行；后续编辑报价不回写基础库。

响应式当前行为：

- `>=1440px` 保持完整桌面侧栏和列表 Table；小于 1440px 的细指针/可 hover 桌面窗口使用 compact sidebar，即使 viewport 缩到 650px 也保留完整业务能力。报价列表仍保持 Table，成本区则按各自 Card 容器宽度选择 renderer。
- 报价明细成本区使用 `>=1200px` Full、`700–1199px` Desktop Compact、`<700px` Narrow 的视口边界，Card Container Query 作为嵌入式回退。Compact 面料为 `名称/成分/供应商 + 六个数值字段` 两行，辅料为 `名称/规格/供应商 + 四个数值字段` 两行，其他费用为 `项目/规格 + 四个数值字段` 两行；Narrow 为单列。面料、辅料、工价、其他费用仍复用同一 ViewModel、回调和计算函数；切换 renderer 时保持 row ID、dirty、焦点和数字输入中间态。
- Compact Desktop 的报价详情保留返回、报价版本、创建价格版本、客户确认、导出、删除和保存全部操作；标题区第二行承载完整操作，快速导航以 Header dropdown 展示，成本指标压缩为单行 Summary Bar。
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
- 正式 Excel 导出必须使用仓库模板、现有计算口径和精确选中的 Revision 快照。

## Tests

相关测试分布在 `tests/quote-*.test.mjs`、`tests/fabric-calculations.test.mjs`、`tests/cost-table-ui-part2.test.mjs`、`tests/cost-responsive-batch1-2.test.mjs`、`tests/global-costs-v2.test.mjs` 和 `tests/quote-revision-management.test.mjs`。页内导航由 `tests/quote-quick-navigation.test.mjs` 覆盖，正式 Excel 导出由 `tests/quote-excel-export.test.mjs` 覆盖。

测试包含大量源码契约检查；修改结构时也应做浏览器实际交互验证，不能仅依赖字符串断言。

## Known gaps

- 无真实后端、数据库和多用户并发；当前只有 localStorage mock RBAC，没有服务端权限 enforcement。
- 无报价转正式订单。
- 附件当前仅为单设备 IndexedDB 原型，没有真实上传 API、对象存储和跨设备共享。
- 列表无分页/服务端筛选。
- 当前测试账号可在 AppShell 切换，但不是已认证的真实会话；个人偏好尚未按该账号全面迁移。
- 当前工作树中的功能扩展尚未全部由 Git commit 固化。
