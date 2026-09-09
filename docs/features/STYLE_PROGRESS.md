# 款式进度、面辅料跟进与逐物料物流

## Purpose

款式进度是订单中心内的 Material Control Tower。它把艾诺科《面辅料申购统计》作为跟进来源，通过 `salesContractNo` 投影到现有单款 SalesOrder，并复用正式 ScheduleAssignment、ProductionSite、SupplyHub、SupplyRoute 与 TransportMode 计算逐物料物流建议。它不创建订单、不做第二套订单匹配，也不复制订单权威字段。

## Source authority

- 销售合同：订单号、品牌、业务/工厂款号、正式数量与合同交期的高权威来源。
- 成衣分色分码：成衣颜色、颜色数量及颜色交期/出运明细的高权威来源。
- 面辅料申购统计：Material Follow-up Source，提供需求、采购、入库、出运、出库、来源交期、实际用量和跟进文本；允许标准化与人工纠正，不反向覆盖正式订单。
- 当前同步以 6087050 Direct API 当次 Snapshot 为 authoritative source；Excel 是导出时间点的 historical source。API/Excel 不要求 row-count、snapshot-hash 或 source-row-identity parity，但相同字段必须保持同一语义并进入唯一 Material pipeline。无法由真实 API metadata/rows 证明的字段保持 `null`/empty，禁止猜测。
- 普通 UI 的订单字段始终读取 Order Projection。Excel 中相同款号、品牌或数量不能用于猜测绑定；合同不存在时显示“销售合同尚未形成织序订单”并引导至艾诺科同步。

## Real Excel audit (2026-09-08)

最新只读来源文件 `面辅料申购统计 (1).xlsx`，SHA-256 `393D4EFA69ED402AEC3BE6FF91B88F8EA036A35363D79D79D7A6FC7ECBED3C15`，Sheet `面辅料申购统计`，解析范围 `A1:BE17388`。原文件只用于本地审计，不进入 Git：

- 原始数据行 17,384；有效 17,383；尾部无效 Trace 1。
- 13,189 个规范化 MaterialDemand；采购事件 11,502、入库 14,665、出运 13,269、出库 14,751；重复事件展开 5,572。
- 新增“对应成衣颜色”列后，Header → Semantic Field Mapping 正确解析，不依赖固定列号。
- D1935 / `PI2607-235`：261 条 Source Row、254 个规范化 Demand（面料 20、辅料 234）。其中厂供编码 `202608130002` 为 5 条 Source Row / 5 个 Demand，需求合计 3,809；普通 Operational Projection 使用其余 249 个 Demand。
- D1935 在旧 v3 Canonical 规则下为 18 个 Group（面料 8、辅料 10）；v4 name-only 规则下为 13 个 Group（面料 3、辅料 10）。罗马布、棉毛布、汗布各自的不同来源编码、门幅、克重和采购价合并到同名顶层组，全部差异仍保留在 Demand / Event 明细中，不计算平均采购价，也不猜测统一规格。
- D1935 对应 181 条采购事件、16 条入库事件、13 条 ShipmentEvent、13 条 OutboundEvent；出运与出库虽然该样本合计均为 21,656，UI 仍分别从各自 Event 累计，不互相替代。

HTML 工作台只用于视觉与字段语义参考；其内嵌数据声明来自另一份文件，不作为本批数据权威。

## Data model

- `MaterialImportBatch`：文件名、SHA-256、Sheet/范围、行数、需求/事件/重复/无效统计、提交状态与操作者。
- `MaterialRawSnapshot`：批次、文件、Sheet、源行、全部原始字段、规范化需求 ID 与 validation issues。
- `MaterialDemand`：合同内的面/辅料需求；保存 Source Snapshot，但不保存第二份订单权威字段。
- `MaterialPurchaseEvent`、`MaterialInboundEvent`、`MaterialShipmentEvent`、`MaterialOutboundEvent`：从需求分离并分别去重，避免采购 × 入库等笛卡尔展开造成数量倍增。
- `MaterialExpectedArrivalBatch` / Allocation：按销售合同与 Canonical Material 保存一个物料的多个预计到集货仓批次；Allocation 稳定引用 `materialDemandId`，允许部分安排和一项需求跨批次分配，但累计不得超过需求数量。
- `sourceMaterialDueDate` 是只读 Source；`MaterialExpectedArrivalBatch.expectedArrivalAtHubDate` 是参与跟进和物流计算的 Effective。旧 `expectedMaterialReadyDate` 仅作为迁移与旧 UI 兼容摘要；累计入库达到需求数量时推导的日期与数量属于 Actual。
- `expectedDateSource = source | manual`。首次导入和跟随来源的重导入使用最新 Source；人工 Effective 在重导入时保留，恢复艾诺科后重新跟随 Source。
- Excel 表头“厂供”是实际用量数值列并映射为 `actualConsumption`；“提供方式”是独立字段，不得把文字 `厂供` 转换为计划用量。旧错误快照仅在当前 ImportBatch Raw Snapshot 能证明对应值时确定性修复，否则保持 `null`。

## Import and idempotency

流程固定为 Upload → Parse → Normalize → Dedup → Validate → Preview → Confirm → Commit。预检展示 SHA、行数、需求/事件、重复、无效、来源交期变化、人工覆盖保留数、合同匹配和无订单合同。

- Parser 通过 Excel Header → Semantic Field Mapping 定位字段，兼容已知别名、插入无关列和非关键列换序；缺失或重复关键表头时明确拒绝，Raw Snapshot 仍保留全部原始列。新增“对应成衣颜色”列不会改变其他字段解析。
- 无效行保留 Raw Trace，不生成业务记录；不阻断同批有效行提交。
- 相同文件使用文件 SHA 形成确定性批次 ID；第二次提交返回全部新增为 0。
- 需求与事件使用稳定业务 hash。新完整来源文件更新当前需求与事件；同一需求已消失的旧事件从当前事实集合移除，历史 Raw Snapshot 与 ImportBatch 仍保留。
- 重导入不得覆盖 `expectedDateSource=manual` 的 Effective 值。
- 重导入只刷新仍跟随 Source 的 Expected Arrival Batch；人工 Batch 保持不变，只有“恢复使用来源计划”动作才重新生成 Source Batch。
- `提供方式=厂供` 保留 Raw Snapshot 与来源 Trace，但不进入采购跟进、齐套率、物料风险、物流推荐或 Expected Arrival Batch；可从既有 Raw Snapshot 确定恢复时执行非破坏 backfill，证据不足时不猜测。

## Readiness, risk and sorting

- 单物料齐套：累计 `inboundQuantity >= requiredQuantity`；状态由事实自动计算，用户不能手工指定。
- 款式齐套按物料项计数，禁止把 KG、米、条、个相加或按数量加权。
- Sales Due、Material、Transport 是三个并存风险维度。
- 面料优先按 `actualConsumption DESC`，否则 `plannedConsumption DESC`，最后 `sourceSortNo ASC`；辅料严格 `sourceSortNo ASC`。
- 颜色筛选读取 OrderColorLine；多颜色需求参与所有相关颜色。

## Logistics

逐批建议唯一复用现有 `material-logistics-service.ts`，没有 V2 Service 或平行路线表。每个 Expected Arrival Batch 以 `expectedArrivalAtHubDate` 独立计算推荐运输、预计到厂、最晚到厂、buffer 与 escalation；人工计划不自动绑定来源事件。

- 使用最早的相关有效 ScheduleAssignment；没有可靠 material/color relation 时不做平均、最后一条或随机选择。
- 运输 Projection 只读取正式持久化的 `OrderExecutionTracking.supplyHubId`；UI 下拉首项、唯一启用仓或唯一可用路线都不是业务事实，不得用于自动推断。
- 没有排单显示“待排单后计算”；缺 SupplyHub 显示“集货仓未设置”；缺 ProductionSite 显示“生产地点未设置”。只有 Hub 与 Site 均存在后才按稳定 ID 查找路线；缺路线显示“{Hub} → {Site}路线未配置”，路线没有启用方式显示“当前路线未配置运输方式”。
- 在能按时到厂的方式中选择最慢可行方式；必要时升级为更快方式、仅最快可行，全部失败时显示最快方式及晚到天数。
- “距上线”只表示计划开工日与预计到集货仓日的自然日差；运输风险只使用 `latestRequiredArrivalDate - expectedFactoryArrivalDate`。buffer 大于 7 天为绿色，0–7 天为黄色，小于 0 为红色并显示晚到天数。
- 修改排单地点/计划开工或物料 Effective 日期后，Projection 在下一次读取时立即重算；不反向修改排期或预计到料日。

## UI integration

- 订单中心日常二级导航：订单列表、款式进度、风险预警；艾诺科同步不再占用日常导航。
- `/order-center/style-progress`：高密度款式总览与真实 Excel 预检/导入。
- `/order-center/style-progress/detail?contract=...`：正式 Material Control Tower。Header 显示款号、合同、品牌、负责人和订单数量，不显示来源客户 fallback；厂供存在时才显示“厂供信息”。五项 KPI、紧凑待处理动作、Sticky Filter 与 Canonical Material 卡片构成主页面。
- Material 卡默认汇总需求、采购、入库、状态与风险；展开区按 Demand 展示采购、入库、ShipmentEvent 出运、当前批次摘要、推荐运输、预计到厂、距上线和 Actual，并把宽表横向滚动限制在卡内。
- Detail Drawer 保留物料、单耗/需求、采购、入库、出运、出库、日期与分批到料多个事实页签。Batch Planner 支持一需求多批、一个批次多需求及部分安排；超分配阻止保存，不自动补齐。
- `/order-center/risks`：交期、未采购、待入库与运输异常筛选。
- Order Detail 只读取 StyleProgress Projection，显示紧凑摘要和 Drawer；完整编辑通过 deep link 进入款式进度。
- 全局搜索支持合同号、工厂款号和业务款号；存在订单时搜索结果同时显示订单摘要。

## Storage, backup, permissions and audit

- 万行级事实存入 IndexedDB `zhixu-style-progress` version 4，分为导入批次、Raw、需求、四类事件与 Expected Arrival Batch Store；React 只经 Service/Repository 访问。v3→v4 只重映射 Canonical key，保留批次、Allocation、manual/source 语义和审计元数据；迁移幂等且不更换 namespace。跨名称旧批次拒绝猜测迁移；v4 数据统一校验每个批次至少有一个 Allocation，且 `canonicalMaterialKey` 与全部 Allocation 的当前物料身份一致。
- 全局 schemaVersion 13 将 Expected Arrival Batch 纳入现有 JSON Backup / Restore / Reset 的原子式回滚编排；旧备份缺失该集合时按空集合向前恢复，不影响其他数据。
- 权限：`style_progress.read/edit/import/view_history`；新增权限只自动补给管理员。
- 正式导入、人工修改和恢复 Effective 日期复用唯一追加式 OperationLog；ImportBatch / Raw Snapshot 继续保留技术 Trace，不替代业务操作日志。
- Ainuoke Direct API 的 6087050 已通过薄 source adapter 进入 Excel 共用的 Normalize → Dedup → Validate → Preview。API trace 不伪造 Excel 坐标；`MSingleName` 无法证明等价于 Excel“申购实际名称”，不映射 `sourceActualName`，当前也无充分证据映射 API `actualConsumption`，两者保持空值。Preview 只在内存运行，没有 `commitImport` 按钮，不调用本 IndexedDB Repository，也不修改既有 Expected Arrival Batch / Allocation。

## Verification status

本次 Correction 使用最新 Excel 调用正式 Parser 与 v4 Canonical identity 完成只读审计，并在既有隔离 Browser Profile 复验 D1935 / PI2607-235；没有覆盖用户 Chrome 或 PROD Profile，原始 Excel 没有进入 Git。真实页面从旧 18 个 Canonical Material 收敛为 13 个（面料 3、辅料 10），厂供 5 条 / 3,809 需求量仍只在只读 Trace Drawer 中出现；罗马布的 5 条颜色/规格 Demand 及不同采购价完整保留，展开行与多事件 Drawer 的出运量均来自 ShipmentEvent。

真实 D1935 的 1600/1280/1229/960/768/402 CSS viewport 均为 `document-level horizontal overflow = 0`，Supplier 搜索、Sticky Filter、条件式厂供入口、Batch Planner、多个 Event Tab 和 Console 均通过。该隔离 Browser Profile 没有 PI2607-235 对应织序订单，因此页面正确显示“销售合同尚未形成织序订单”，逐批物流显示“待排单后计算”；没有猜测订单、SupplyHub、ProductionSite 或 ScheduleAssignment。Gate 3 自动化与 Gate 4 QA Dataset 已验证有正式排单时的逐批 recommendation、缺 Hub 精确原因、最慢可行方式和 buffer 颜色，但不能把这些证据冒充为本次 D1935 有排单的真实 Profile 验收。
