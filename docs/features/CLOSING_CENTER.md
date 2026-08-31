# 关账中心

## Purpose

在单款 SalesOrder 与直接归属订单的 ScheduleAssignment 基线上，按月保存数量、价格、汇率、税率和生产执行方快照，形成可确认、锁定和重新打开的月度产值事实。关账不回写订单、排单或完成数量，也不实现应收应付、发票、付款或总账。

## Current behavior

- `/closing-center` 提供“月度关账”和“产值平衡”；一月一个 ClosingPeriod，一张订单可跨月、多次关账。
- 月度关账按 SalesOrder 汇总，展开后显示 ClosingAllocation。归属可引用 ScheduleAssignment，也可以不关联排单并计入“待分配”。
- 内部、外发与待分配可在同一订单、同一月份并存。订单详情读取同一 Projection 展示累计关账数量和加工产值。
- 开放月份可编辑；已确认月份可取消确认或锁定；锁定月份拒绝普通编辑。重新打开需要 `closing.reopen` 和原因。
- 默认销售税率只在创建期间时形成快照；现有 MonthlyProductionTarget 直接用于产值平衡。

## Business rules

- `ClosingAllocation.salesOrderId` 直接归属单款 SalesOrder；`scheduleAssignmentId` 可空。Runtime 不使用 `orderItemId`。
- 订单有效数量、排单数量、完成数量和关账数量是四个独立口径，互不覆盖。
- 加工产值原币 = `quantity × closingProcessingUnitPrice`。CNY 直接作为 RMB；USD 使用 `fxRateSnapshot`，不使用 Quote 的 1.13 系数。
- 经销销售产值（万元）= `quantity × salePriceSnapshot ÷ (1 + taxRateSnapshot / 100) ÷ 10000`。加工订单为不适用。
- internal 只保存生产组快照；outsource 只保存外发厂快照；null 为待分配。
- 超订单、超排单、超完成、待分配、排单 stale 和价格差异是 warning，不截断真实数量。负数、坏 owner、USD 无有效汇率和经销无销售价是 hard error。
- 排单执行类型、执行方、计划数量或取消/缺失会 stale；仅 completedQuantity 变化不会 stale。用户可明确同步或填写原因保留快照。
- 状态流为 `open → confirmed → locked`；confirmed 可取消确认；locked 只能以高权限和原因重开。

## Data model and code

- `ClosingPeriod`：月份、状态、税率快照、确认/锁定/重开操作者与时间、原因、备注和审计字段。
- `ClosingAllocation`：期间、订单、可选排单、数量、订单类型/销售价/工价/币种/汇率/税率快照、执行方快照、ScheduleBasisSnapshot、stale 确认、作废和审计字段。
- Model：`features/closing-center/model/closing.ts`
- Repository：`features/closing-center/repository/closing-repository.ts`
- Service：`features/closing-center/service/closing-service.ts`
- UI：`features/closing-center/components/closing-center-page.tsx`
- 稳定记录：`zhixu.erp.local.closing-center`

## Permissions, audit, search and migration

- 使用既有 `closing.view/edit/confirm/lock/reopen/target.manage`，默认只有管理员拥有。
- 所有动作写入唯一 OperationLog，使用 `orderId/closingPeriodId/closingAllocationId` 和可选 `scheduleAssignmentId`。
- ClosingSearchProvider 搜索月份、订单、款式、客户及执行方，并检查 `closing.view`。
- schemaVersion 为 8。v7→v8 只新增 closing-center record；v7 其他 payload 原样重封装。Backup/Restore 校验期间、订单与排单引用；旧 v7 备份安全初始化空关账集合。

## Known gaps

- 当前仍是单浏览器 localStorage mock，没有服务器事务、并发锁、跨设备同步或不可篡改审计。
- 没有应收/应付、发票、付款、工资、外发结算、成本会计、总账和完整财务期间。
- True Mobile 仍需目标触屏设备补验；自动浏览器 390px fine-pointer 不能模拟 coarse pointer。
