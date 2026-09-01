# 款式进度、面辅料跟进与逐物料物流

## Purpose

款式进度是订单中心内的 Material Control Tower。它把艾诺科《面辅料申购统计》作为跟进来源，通过 `salesContractNo` 投影到现有单款 SalesOrder，并复用正式 ScheduleAssignment、ProductionSite、SupplyHub、SupplyRoute 与 TransportMode 计算逐物料物流建议。它不创建订单、不做第二套订单匹配，也不复制订单权威字段。

## Source authority

- 销售合同：订单号、品牌、业务/工厂款号、正式数量与合同交期的高权威来源。
- 成衣分色分码：成衣颜色、颜色数量及颜色交期/出运明细的高权威来源。
- 面辅料申购统计：Material Follow-up Source，提供需求、采购、入库、出运、出库、来源交期、实际用量和跟进文本；允许标准化与人工纠正，不反向覆盖正式订单。
- 普通 UI 的订单字段始终读取 Order Projection。Excel 中相同款号、品牌或数量不能用于猜测绑定；合同不存在时显示“销售合同尚未形成织序订单”并引导至艾诺科同步。

## Real Excel audit (2026-09-01)

文件 `面辅料申购统计.xlsx`，SHA-256 `9DBEBF05FDC2EE201E4A1A7F24B3B5E9585AA4B5BE4C3C49C6CB64EF0B88675E`，Sheet `面辅料申购统计`，解析范围 `A1:BD17020`：

- 原始数据行 17,016；有效 17,015；无效 Trace 1。
- 474 个销售合同；12,853 个规范化 MaterialDemand；因 Cartesian expansion 去除 4,162 个需求展开行。
- 采购事件 11,269；入库 14,601；出运 13,140；出库 14,620；重复事件展开 5,542。
- D1935 / `PI2607-235`：45 个需求（面料 20、辅料 25），其中 5 项由 `厂供` 语义映射 `actualConsumption`。
- T2403 / `PI2608-266`：11 个需求（面料 5、辅料 6）。
- T1933 不在该基表中，详情必须显示“当前导入数据未找到该款”，禁止造数。

HTML 工作台只用于视觉与字段语义参考；其内嵌数据声明来自另一份文件，不作为本批数据权威。

## Data model

- `MaterialImportBatch`：文件名、SHA-256、Sheet/范围、行数、需求/事件/重复/无效统计、提交状态与操作者。
- `MaterialRawSnapshot`：批次、文件、Sheet、源行、全部原始字段、规范化需求 ID 与 validation issues。
- `MaterialDemand`：合同内的面/辅料需求；保存 Source Snapshot，但不保存第二份订单权威字段。
- `MaterialPurchaseEvent`、`MaterialInboundEvent`、`MaterialShipmentEvent`、`MaterialOutboundEvent`：从需求分离并分别去重，避免采购 × 入库等笛卡尔展开造成数量倍增。
- `sourceMaterialDueDate` 是只读 Source；`expectedMaterialReadyDate` 是当前 Effective；累计入库达到需求数量时推导的日期与数量属于 Actual。
- `expectedDateSource = source | manual`。首次导入和跟随来源的重导入使用最新 Source；人工 Effective 在重导入时保留，恢复艾诺科后重新跟随 Source。
- Excel `提供方式 = 厂供` 按已确认业务语义把该行单耗映射为 `actualConsumption`，不保留为采购/供货方式，不影响采购、入库、齐套或运输。

## Import and idempotency

流程固定为 Upload → Parse → Normalize → Dedup → Validate → Preview → Confirm → Commit。预检展示 SHA、行数、需求/事件、重复、无效、来源交期变化、人工覆盖保留数、合同匹配和无订单合同。

- 无效行保留 Raw Trace，不生成业务记录；不阻断同批有效行提交。
- 相同文件使用文件 SHA 形成确定性批次 ID；第二次提交返回全部新增为 0。
- 需求与事件使用稳定业务 hash。新完整来源文件更新当前需求与事件；同一需求已消失的旧事件从当前事实集合移除，历史 Raw Snapshot 与 ImportBatch 仍保留。
- 重导入不得覆盖 `expectedDateSource=manual` 的 Effective 值。

## Readiness, risk and sorting

- 单物料齐套：累计 `inboundQuantity >= requiredQuantity`；状态由事实自动计算，用户不能手工指定。
- 款式齐套按物料项计数，禁止把 KG、米、条、个相加或按数量加权。
- Sales Due、Material、Transport 是三个并存风险维度。
- 面料优先按 `actualConsumption DESC`，否则 `plannedConsumption DESC`，最后 `sourceSortNo ASC`；辅料严格 `sourceSortNo ASC`。
- 颜色筛选读取 OrderColorLine；多颜色需求参与所有相关颜色。

## Logistics

逐物料建议扩展现有 `material-logistics-service.ts`，没有 V2 Service 或平行路线表。实际齐套日优先于当前预计到料日；后者优先于过时 Source。

- 使用最早的相关有效 ScheduleAssignment；没有可靠 material/color relation 时不做平均、最后一条或随机选择。
- 没有排单显示“待排单后计算”。缺 ProductionSite、SupplyHub、SupplyRoute 或 TransportMode 显示“物流路线未配置”。
- 在能按时到厂的方式中选择最慢可行方式；必要时升级为更快方式、仅最快可行，全部失败时显示最快方式及晚到天数。
- 修改排单地点/计划开工或物料 Effective 日期后，Projection 在下一次读取时立即重算；不反向修改排期或预计到料日。

## UI integration

- 订单中心二级导航：订单列表、款式进度、风险预警、艾诺科同步。
- `/order-center/style-progress`：高密度款式总览与真实 Excel 预检/导入。
- `/order-center/style-progress/detail?contract=...`：对象摘要、三类风险、关键异常、颜色筛选、面料/辅料分区、inline Effective 日期编辑与来源历史。
- 物料明细并列显示 Source 交期、当前 Effective、Actual 齐套日、计划开工、最晚到厂与逐物料运输结论；Actual 不回写或覆盖 Expected。
- `/order-center/risks`：交期、未采购、待入库与运输异常筛选。
- Order Detail 只读取 StyleProgress Projection，显示紧凑摘要和 Drawer；完整编辑通过 deep link 进入款式进度。
- 全局搜索支持合同号、工厂款号和业务款号；存在订单时搜索结果同时显示订单摘要。

## Storage, backup, permissions and audit

- 万行级事实存入 IndexedDB `zhixu-style-progress`，分为批次、Raw、需求与四类事件 Store；React 只经 Service/Repository 访问。
- schemaVersion 11 将该 IndexedDB 纳入现有 JSON Backup / Restore / Reset 的原子式回滚编排；旧备份缺失此区块时恢复为空集合，不影响其他数据。
- 权限：`style_progress.read/edit/import/view_history`；新增权限只自动补给管理员。
- 正式导入、人工修改和恢复 Effective 日期复用唯一追加式 OperationLog；ImportBatch / Raw Snapshot 继续保留技术 Trace，不替代业务操作日志。

## Verification status

真实 DEV 已完成第一轮正式提交与同文件零新增验证：Repository 为 1 个 ImportBatch、17,016 个 Raw Snapshot、12,853 个 Demand、11,269 个 Purchase、14,601 个 Inbound、13,140 个 Shipment、14,620 个 Outbound；474 个合同中 396 个投影到正式订单、78 个尚无订单。D1935、T2403、T1933 缺失态、人工交期修改/恢复、OperationLog、83,500 条记录备份导出、全局搜索、风险中心、Order Detail 与 1600/1280/1229/960/768/402 响应式均已在 3001 真实页面验收。
