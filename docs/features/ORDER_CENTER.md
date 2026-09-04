# 新订单中心

## Purpose

在 Quote Center 浏览器路径中提供可独立演进的单款订单领域：支持手工订单、报价转订单、翻单、确认、数量/交期/价格历史、附件引用、权限、搜索、日志、备份恢复及旧数据非破坏迁移。它不复用根路径 PostgreSQL 的旧订单模型；生产排单由独立 feature 引用 SalesOrder，不把排单事实嵌入订单。

## Current behavior

- `/order-center` 一行展示一张单款 SalesOrder，支持订单号、客户 PO、款号、款名和客户搜索，以及状态/类型筛选。
- 列表列宽通过共享 Table Preference 按 `userId + moduleKey + tableKey` 保存；订单列表与报价列表互不覆盖，操作列在表格内部 sticky 到右侧。
- `/order-center/new` 只创建一个款式；`?reorder=<orderId>` 由一张旧 SalesOrder 生成一张新 SalesOrder。
- `/order-center/detail?id=<orderId>` 直接展示订单及其唯一款式、当前价格、客户交期、数量历史、价格历史、执行资料、附件和只读操作记录，不再存在款式列表中间层。
- 详情 Header 以款号为主视觉，客户/款名为辅助信息；系统生成订单号只读且弱化。客户 PO 位于单款执行资料，平均日产与工艺说明不在普通订单详情表单中暴露。未保存离开使用三向保护，并且“保存并返回”必须等待保存成功后导航。
- Quote Detail 的“生成订单”允许选择明确的 Quote Revision 与 PriceVersion，并直接生成 SalesOrder；未客户确认只提示，不阻断生成。
- 草稿通过完整性校验后可确认；交期不足/超额保持提示，不自动调整数量或交期。
- 页面读取正式排单与关账 Service，展示排单数、已排/完成数量、生产状态、交期风险、累计关账数量与加工产值，并可进入对应中心。“物料与运输”使用统一物流 Projection 展示动态 SupplyHub 到仓、齐套日、实际生产地点、开工日、封样提前期、最晚到厂、推荐方式、预计到厂和风险。
- 订单中心日常二级导航包含订单列表、款式进度和风险预警；艾诺科同步不再作为日常导航项。订单详情按 `salesContractNo` 查询 StyleProgress Projection，只显示面/辅料齐套、未采购、待入库、运输风险和最晚齐料摘要；Drawer 保持紧凑，完整明细与日期编辑通过 deep link 进入款式进度。
- Order Detail 不保存第二份 MaterialDemand 或 Event，也不允许款式进度按款号/品牌/数量猜测订单、创建订单或覆盖订单权威字段。
- 列表可按有效客户交期月份筛选。详情中的销售合同号、工厂款号和来源只读，客户 PO、客户与制作国家不在普通编辑区重复维护。
- 颜色级部分取消通过 append-only adjustment 保存；来源颜色行不变，Ainuoke 重同步更新来源数量时保留人工取消。
- 新手工订单的加工币种由系统 `defaultProcessingCurrency` 初始化，当前默认 USD；既有价格版本不随系统默认值变化。

## Business rules

- 一张 SalesOrder 只允许一个款式。相同客户 PO 可对应多张订单；`customerPoNo` 不是订单身份。
- 订单号去除首尾空格并大小写归一后唯一，继续使用既有 `suggestOrderNo` 规则。
- 来源类型为 `manual | quote | reorder`。Quote 来源 `sourceQuoteId/sourceRevisionId/sourcePriceVersionId` 直接属于 SalesOrder；翻单只使用 `sourceOrderId`。
- Quote 转单将选中 PriceVersion 的工价、币种、汇率和不含成本的面辅料执行资料深复制到 SalesOrder；Quote 后续变化不得污染订单。
- `initialQuantity` 是不可覆盖的原始数量。有效数量通过 `initialQuantity + SUM(quantityChanges[].delta)` 计算；部分/全部取消必须保留原因。
- 客户交期为 SalesOrder 下独立 `DeliveryPlan[]`；数量变化不自动重分配交期。作废通过 `voidedAt` 保留历史。
- 订单价格为 append-only `OrderPriceVersion[]`。P1 是初始价，后续 P2/P3 追加；`currentPriceVersionId` 是权威指针且损坏时禁止 fallback。
- 加工订单必须有工价与币种；经销订单可另存成衣销售价。价格变更原因必填。
- 翻单生成新的 SalesOrder 与价格 ID，只继承当前有效数量、当前价格、执行资料和附件引用；数量变化、交期和历史价格不复制。
- 附件只保存 ID 引用并复用统一 IndexedDB Blob，不复制二进制；订单移除引用不直接删除 Blob。
- 正式生产关系为 `SalesOrder → ScheduleAssignment[]`，实体存放在独立 `features/production-scheduling/`；SalesOrder 不保存 executionType、执行方、scheduledQuantity、completedQuantity 或可编辑生产状态。`ClosingAllocation.salesOrderId` 直接关联订单，`scheduleAssignmentId` 可空，实体与投影位于 `features/closing-center/`。

## Data model

权威模型位于 `features/order-center/model/order.ts`：

- `SalesOrder`：订单身份、订单号/客户 PO、客户与人员快照、单一款式及可空 `averageDailyOutput` 参考、Quote/翻单来源、初始数量、执行资料、数量/交期/价格历史、当前价格指针、附件引用、状态和审计字段。
- `OrderPriceVersion`：通过 `salesOrderId` 归属订单，保存 P 序号、销售价、工价、币种、汇率依据、生效日期、原因和创建人。
- `OrderQuantityChange`：通过 `salesOrderId` 归属订单，保存 before/after、delta、类型、原因与创建信息。
- `DeliveryPlan`：通过 `salesOrderId` 归属订单，保存客户交期、数量、备注、创建/更新时间与作废时间。
- `FabricExecutionSnapshot` / `TrimExecutionSnapshot`：执行所需名称、规格、供应商等快照；不保存报价成本字段。

正式 Runtime Domain 不再导出 `OrderItem`。`features/order-center/migration/order-v5-to-v6.ts` 中的 `LegacyOrderItem` 仅用于读取第三批 v5 数据；旧 Item 到新 SalesOrder 的确定性映射只存在于 Migration 过程与结果中，不进入正式 SalesOrder 字段。

## Service and repository

- 领域服务：`features/order-center/service/order-service.ts`。
- Repository：`features/order-center/repository/order-repository.ts`。
- 稳定记录名：`sales-orders`，完整 key 为 `zhixu.erp.local.sales-orders`，升级不更换 key。
- Repository 提供 list/get/save、订单号唯一检查和附件引用检查；保存前验证所有 child owner 与当前价格指针。
- 浏览器 schema 当前为 v12；v5→v6 只迁移 `sales-orders` payload，后续版本新增独立排单/关账记录、在 v8→v9 提升 Assignment owner，并在 v12 加入颜色调整与默认加工币种兼容，不读取或修改根路径 PostgreSQL `orders/schedules`。

## v5 → v6 non-destructive migration

- 旧订单只有一个 OrderItem 时，保留原 SalesOrder ID 与 orderNo，将款式及全部历史提升到 SalesOrder。
- 旧多款订单按 OrderItem 拆为多张 SalesOrder；第一款保留原订单 ID/订单号，其余订单使用既有订单号生成规则，客户 PO 和合理订单头快照允许相同。
- 建立确定性的 `legacyOrderItemId → SalesOrder.id` mapping；旧 `sourceOrderItemId` 优先映射到正确的单款来源订单，再写入新 `sourceOrderId`。
- Quote 来源、价格/数量/交期历史和附件引用逐款迁移，不能串单；child owner 从 `orderItemId` 改为 `salesOrderId`，历史时间和值不重算。
- `currentPriceVersionId` 必须命中同一 SalesOrder 的价格版本。空 items、重复 ID、归属损坏或坏指针会明确报错并保留原始 localStorage record，不 Seed、不清空、不猜测 fallback。
- schemaVersion 与稳定 mapping 保证重复初始化不会再次拆单。

## Quote conversion, reorder and frontend

- Quote 转单由 `quote-to-order-modal.tsx` 发起，直接调用 `createOrderFromQuote` 生成一个 SalesOrder。
- 翻单调用 `createReorder`，形成 `SalesOrder → SalesOrder`，`sourceOrderItemId` 不再进入新模型。
- 页面位于 `features/order-center/components/order-pages.tsx`，附件面板位于 `order-attachment-panel.tsx`，路由位于 `app/order-center/`。
- Responsive 继续使用桌面表格、紧凑表单与 `<768px` 卡片/单列规则；没有为移动端创建另一套业务模型。
- 排单摘要只消费 `projectOrderSchedule(order, schedulingState)`；订单数量变化不会自动重写任何 ScheduleAssignment。

## Permissions, search and audit

- 继续使用 `order.view`、`order.create`、`order.edit`、`order.cancel`，没有重建 RBAC。
- OrderSearchProvider 直接搜索 SalesOrder 的订单号、客户 PO、款号、款名与客户；一张 SalesOrder 产生一条结果。
- 新订单日志只使用 `orderId`/SalesOrder 上下文，并显示“订单号 · 款号”。OperationLog 的 `orderItemId` 与 `entityType: OrderItem` 仅为第三批旧日志兼容保留，历史 payload 不改写。

## Backup and restore

- 新备份保存 v9 单款 SalesOrder、直接归属订单的 ScheduleAssignment、关账及生产与运输设置，不再输出正式 OrderItem 或 ProductionPlan Runtime 结构。
- 旧第三批备份中的 v5 `sales-orders` record 在完整恢复前通过同一迁移器提升/拆单；OperationLog、Quote、operations-settings、附件和模板记录保持原文。
- 恢复前校验 owner 与当前价格指针；损坏备份拒绝写入，并使用原有整体回滚保护。

## Tests and constraints

`tests/order-center.test.mjs` 覆盖单款提升、多款拆单、翻单映射、幂等/失败保护、手工单款、Quote 转单、翻单、数量/取消、多交期、P1/P2 指针、新旧日志、旧备份 record、附件、搜索、权限和 UI 契约。排单投影与风险由 `tests/production-scheduling.test.mjs` 覆盖。

- 不修改 QuoteRevision/PriceVersion 模型或报价计算公式。
- 不把旧 PostgreSQL 订单路径和新浏览器订单领域混用。
- 不物理覆盖数量/价格历史，不在指针损坏时猜测当前价格。
- ScheduleAssignment、ClosingPeriod、ClosingAllocation、排单中心与关账中心均由独立模块实现；订单只消费摘要投影，不复制这些事实。
- 当前仍是单浏览器、单 Origin mock 持久化，没有服务端并发控制、跨设备同步或不可篡改审计。
- 本轮只是产品化 UI 与交互调整，没有改变 SalesOrder、价格/数量历史、排单和关账领域边界。
