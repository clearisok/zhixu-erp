# 生产队列、排单与物料运输

## 当前Server候选与下文历史

2026-10-24，D147/G6B当前代码已接独立Server计划、版本/资源快照、可信查询与既有页面，见[Server排单](SERVER_PRODUCTION_PLANNING.md)及[本轮任务](../tasks/active/server-production-planning-current-2026-10-24.md)。尚待本轮冻结工程验收，不代表真实开工/完成、物流或关账闭环，也未部署或迁移Browser。下文当前行为/缺口按原Browser历史理解；公式、长期存储及旧日期说明保留。

## Purpose

在 v6 单款 SalesOrder 基线上直接维护生产分配、内部队列、实际完成、物料到仓、运输建议与交期风险。模块不修改订单商务事实，不复用根路径 PostgreSQL 旧 `schedules`，关账只引用稳定 `ScheduleAssignment.id`。

## Current behavior

- 正式关系为 `SalesOrder → ScheduleAssignment[]`。ProductionPlan 已退出 Runtime，仅存在于 v8→v9 legacy migration、迁移测试、旧 OperationLog 兼容与已替代文档。
- `/production-scheduling` 的主信息架构为“生产组总览 → 单个生产组队列 → 未排订单 / 异常”；订单详情显示排单摘要与物料运输 Card。总览每个生产组只生成一张聚合卡，不随款式数量膨胀。
- Assignment 可为内部生产组或外发厂；同一订单可内部、外发或混合生产。
- 内部生产组有串行 `queueSequence`；`auto_queue` 参与重排，`manual_fixed`、已开工和已完成 Assignment 不被自动移动。
- 排单编辑器不向用户展示 `durationMode` 或“排期依据”；平均日产与所需工作日直接双向联动，以最后编辑的输入为当前口径。新建排单无需填写变更原因，并可一键带入全部未排数量。
- 结束 Assignment 时在首层 Modal 同时提供“仅记录结束”和“结束并应用建议”。后者先预览每条受影响排单的前后日期，用户确认后才持久化；只调整同组未开工自动队列，全部日志共享 operationId。
- 外发排单弹窗允许就地创建外发厂，保存稳定 ID、自动选中，并通过统一 OperationLog 记录基础资料变更；它不创建第二套排单日志。
- 生产组左侧总览在宽屏保持 sticky；队列行不再下垂，订单与物流均通过真实导航进入对应页面。
- 重复排单入口已收敛；行内“更多”只保留真实动作，包括进入排单、款式进度和价格调整。
- 生产物料状态直接消费 Style Progress Projection，不再维护面辅料手工到料日期；空提交校验与 Modal 位于同一可见层级。
- 生产执行日期文案统一使用“拟定交期”。

## Data model

- `ScheduleAssignment`：稳定 ID、`salesOrderId`、执行类型与互斥执行方、队列序号、计划数量、工期口径、日产量快照、工作日、计划/实际日期、非工作日数、完成数量、日期模式、状态和审计字段。
- `SalesOrder.averageDailyOutput`：可空订单默认日产量，只作为新 Assignment 输入默认值；Assignment 保存自己的快照。
- `OrderExecutionTracking`：原执行跟进字段，以及 `supplyHubId`、面料/辅料到供应枢纽日期。两者都存在时才形成 `materialReadyDate = max(...)`。
- `ProductionSite`、`ProductionCalendar`、`SupplyHub`、`SupplyRoute`、`TransportMode` 位于 operations-settings；ProductionGroup 通过稳定 `productionSiteId` 属于生产地点。

## Scheduling rules

- `average_daily_output`：`requiredWorkdays = ceil(plannedQuantity / averageDailyOutputSnapshot)`；日产量必须大于 0。
- 编辑平均日产量或排单数量时重新推导 `requiredWorkdays`，不保留与新口径冲突的旧工期。
- `workdays`：工作日是权威输入，参考日产量按 `ceil(plannedQuantity / requiredWorkdays)` 形成快照。
- 日历特殊日期覆盖每周模板。默认柬埔寨周一至周六工作、周日休息；默认中国七天工作，但均为可编辑资料，不按国家硬编码计算。
- 同日交接时下一条 `plannedStartDate` 等于上一条结束日，但交接日不作为完整工作日；从下一个有效生产工作日开始计数。
- 订单量、排单量、完成量、关账量严格分离。订单减量不改排单；超额排单/完成仅生成 warning。
- `actualCompletedDate` 与 `plannedEndDate` 分离。完成数量减少需要原因；超计划完成不截断。

## Material and transport

- 系统内置启用的供应枢纽资料包含“宁波仓”，可在“系统设置 → 生产与运输”维护枢纽、地点、路线、日历和运输方式；这不构成所有订单的默认业务值。`OrderExecutionTracking.supplyHubId` 未保存时就是“未设置”。
- 运输时长按自然日。最晚到生产地点日期 = `plannedStartDate - preProductionSampleLeadDays`。
- 推荐满足到达要求的最慢启用方式；排单编辑器与订单详情复用同一 Projection，显示齐套日、实际生产地点、计划开工、封样提前期、最晚到厂、推荐方式、预计到厂和风险。若全部失败，显示最快预计到达日与晚到天数，不反向修改生产排期。
- 没有跨境路线时显示“无需跨境运输建议”。ManufacturingPreset 是报价口径，不等于实际 ProductionSite。
- 款式进度对每个 Expected Arrival Batch 独立调用现有 `recommendMaterialTransport`，继续读取同一 ScheduleAssignment / ProductionSite / SupplyHub / SupplyRoute / TransportMode，不创建平行物流算法或日期事实。Batch 的 Effective 是预计到达 SupplyHub 的日期；Service 返回推荐方式、预计到厂、最晚到厂、`bufferDays` 与 escalation。缺排单、集货仓、生产地点、指定路线、路线运输方式时分别给出精确原因。
- “距上线”是计划开工日减 Expected Arrival at SupplyHub 的自然日差，只用于直观提示；运输风险只看 `latestRequiredArrivalDate - expectedFactoryArrivalDate`，大于 7 天为绿色、0–7 天为黄色、小于 0 为红色。两者不得合并为同一状态。
- “物料与运输”弹窗只回显已持久化 SupplyHub；没有正式值时选中“未设置”，不得自动选中第一个启用仓或据此形成运输推荐。
- 多 Assignment 暂无可靠 material/color relation 时使用最早的有效 `plannedStartDate` 保守计算，禁止平均、最后一条或随机选择。物料日期或排单地点/开工变化只触发 Projection 重算，不互相覆盖业务事实。

## Closing compatibility

- v8→v9 迁移通过旧 ProductionPlan 解析 owner 并提升为 `ScheduleAssignment.salesOrderId`，Assignment ID 原样保留，因此 ClosingAllocation 引用和已锁定产值不变。
- 关账 stale 指纹仍只比较执行类型、执行方与计划数量，以及取消/缺失。队列、日期、工作日、日历和物料运输变化不会触发执行归属 stale。

## Repository, permissions, audit and search

- 稳定记录仍为 `zhixu.erp.local.production-scheduling`，schemaVersion 13，namespace 不变；迁移不清数据、不重建 ID、不覆盖 Seed。
- 复用 `schedule.view/create/edit/complete`；生产与运输设置使用 `settings.production_infrastructure.edit`。
- 复用唯一 OperationLog。新日志使用 `orderId/scheduleAssignmentId`；`productionPlanId` 仅保留旧日志读取兼容。
- ScheduleSearchProvider 搜索订单、款式、执行方、生产地点与供应枢纽，并先检查 `schedule.view`。

## Known gaps

- 当前仍是单浏览器 localStorage mock，没有服务端事务、并发排程、拖拽甘特、工序级产能或跨设备同步。
- 外发厂第一版仍以手工固定开始/结束日期为主；ProductionSite/Calendar 自动队列目前只作用于内部生产组。
- 真实触屏 Mobile 仍需目标设备补验；自动化已覆盖迁移、日期、队列、关账 stale 和运输建议。
- 排单页服务端首屏使用安全默认 operations settings，客户端挂载后再读取本地资料，避免 localStorage 差异造成 hydration mismatch。

## 2026-09-04 Second Acceptance

- 单组队列顶部不再重复展示大异常 Banner 与“组内执行摘要”；正式异常继续留在行级“异常 / 物流”，组选择项保留小型异常 Badge。
- 组选择项只保留组号、当前款身份、待产数量、异常 Badge 与队尾日期；15 个组使用紧凑布局。
- Sticky 作用在 MasterDetail 的左侧 `aside`，位于 68px 顶栏下方的 80px 边界；组面板自身 `overflow: visible`，生产队列与未排池跟随 AppShell 唯一主纵向滚动。
- Production Queue 与 Unscheduled Pool 保持固定作业顺序语义，并采用 fit-first 列宽；不建立局部横向或纵向滚动。
